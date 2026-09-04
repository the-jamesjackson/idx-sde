const request = require('supertest');
const express = require('express');

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () =>
    jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate }
    }))
);

jest.mock('../db/mysql', () => ({
    query: jest.fn()
}));

jest.mock('../db/cities', () => ({
    buildCityCondition: jest.fn()
}));

jest.mock('../services/cityResolver', () => ({
    resolveUnknownCity: jest.fn()
}));

const pool = require('../db/mysql');
const { buildCityCondition } = require('../db/cities');
const { resolveUnknownCity } = require('../services/cityResolver');
const naturalSearchRouter = require('./naturalSearch');

const app = express();
app.use(express.json());
app.use('/api/search/natural', naturalSearchRouter);

// Claude replies through structured outputs, so the route always sees schema-valid JSON text.
function mockExtraction(filters) {
    mockCreate.mockResolvedValueOnce({
        content: [{ text: JSON.stringify(filters) }]
    });
}

function mockDbResults(total, rows = []) {
    pool.query
        .mockResolvedValueOnce([[{ total }]])
        .mockResolvedValueOnce([rows]);
}

// The WHERE clause and its bound values are built in parallel, so a filter is only
// correctly applied if its condition and its value line up.
function whereCall() {
    const [sql, values] = pool.query.mock.calls[0];
    return { sql, values };
}

function search(query) {
    return request(app).post('/api/search/natural').send({ query });
}

describe('Natural language search', () => {
    beforeEach(() => {
        mockCreate.mockReset();
        pool.query.mockReset();

        // Default: the city exists and resolves to a single stored spelling. Tests that
        // care about unknown or multi-spelling cities override this.
        buildCityCondition.mockReset();
        buildCityCondition.mockImplementation(async (name) => ({
            sql: 'L_City IN (?)',
            values: [name]
        }));

        // Default: nothing to resolve. Tests exercising the miss path override this.
        resolveUnknownCity.mockReset();
        resolveUnknownCity.mockResolvedValue({ city: null, reason: 'unknown' });
    });

    describe('city normalization prompt', () => {
        // These assert the instructions Claude receives. They cannot prove the model
        // obeys them — that is what the live prompt eval at the bottom of this file is
        // for — but they stop the guidance from being silently dropped or reworded away.
        function systemPrompt() {
            return mockCreate.mock.calls[0][0].system;
        }

        test('tells Claude to expand well-known city abbreviations', async () => {
            mockExtraction({ city: 'Los Angeles' });
            mockDbResults(1, [{ L_ListingID: '1' }]);

            await search('homes in LA').expect(200);

            const prompt = systemPrompt();
            expect(prompt).toMatch(/abbreviation/i);
            expect(prompt).toContain('"LA" -> "Los Angeles"');
            expect(prompt).toContain('"SF" -> "San Francisco"');
        });

        test('tells Claude to pass through what it cannot normalize', async () => {
            mockExtraction({});

            await search('condos in SB').expect(200);

            // Dropping the location here would strand it before the resolver and
            // silently widen the search to the whole state.
            const prompt = systemPrompt();
            expect(prompt).toMatch(/exactly as the user typed it/i);
            expect(prompt).toMatch(/Always include the location the user named/i);
        });

        test('names the cases it must not try to normalize', async () => {
            mockExtraction({});

            await search('homes in the bay area').expect(200);

            const prompt = systemPrompt();
            expect(prompt).toMatch(/ambiguous abbreviation/i);
            expect(prompt).toMatch(/neighborhood/i);
            expect(prompt).toMatch(/region/i);
        });

        test('still forbids substituting a different city', async () => {
            mockExtraction({});

            await search('homes somewhere nice').expect(200);

            expect(systemPrompt()).toMatch(/Never substitute a different city/i);
        });
    });

    describe('expanded cities reach the query', () => {
        test('searches on the expanded city name, not the abbreviation', async () => {
            mockExtraction({ city: 'Los Angeles', beds: 3, maxPrice: 800000 });
            mockDbResults(2, [{ L_ListingID: '1' }, { L_ListingID: '2' }]);

            const response = await search('3 bed in LA under 800k').expect(200);

            const { sql, values } = whereCall();
            expect(buildCityCondition).toHaveBeenCalledWith('Los Angeles');
            expect(sql).toContain('L_City IN (?)');
            expect(values).toEqual(['Los Angeles', 800000, 3]);
            expect(response.body.interpretedFilters.city).toBe('Los Angeles');
            expect(response.body.total).toBe(2);
        });

        test('binds every stored spelling the city index returns', async () => {
            buildCityCondition.mockResolvedValueOnce({
                sql: 'L_City IN (?, ?)',
                values: ['SAN FRANCISCO', 'San Francisco']
            });
            mockExtraction({ city: 'San Francisco', beds: 2 });
            mockDbResults(1, [{ L_ListingID: '1' }]);

            await search('2 bed in SF').expect(200);

            // Conditions and values are built in parallel, so a multi-placeholder
            // condition has to contribute all of its values in the same position.
            const { sql, values } = whereCall();
            expect(sql).toContain('L_City IN (?, ?)');
            expect(values).toEqual(['SAN FRANCISCO', 'San Francisco', 2]);
        });

        test('a search with no location still uses the remaining filters', async () => {
            mockExtraction({ baths: 2 });
            mockDbResults(5, [{ L_ListingID: '1' }]);

            const response = await search('2 bath condos in SB').expect(200);

            const { sql, values } = whereCall();
            expect(sql).not.toContain('L_City');
            expect(sql).toContain('LM_Dec_3 >= ?');
            expect(values).toEqual([2]);
            expect(response.body.interpretedFilters).toEqual({ baths: 2 });
        });

        test('no location means no city condition', async () => {
            mockExtraction({ maxPrice: 1000000 });
            mockDbResults(3, [{ L_ListingID: '1' }]);

            await search('homes under 1m').expect(200);

            const { sql, values } = whereCall();
            expect(sql).not.toContain('L_City');
            expect(values).toEqual([1000000]);
        });
    });

    describe('filter validation', () => {
        test('drops a malformed zipcode instead of querying on it', async () => {
            mockExtraction({ zipcode: '9021', beds: 2 });
            mockDbResults(1, [{ L_ListingID: '1' }]);

            const response = await search('2 bed in 9021').expect(200);

            expect(whereCall().sql).not.toContain('L_Zip');
            expect(response.body.interpretedFilters).toEqual({ beds: 2 });
        });

        test('drops an inverted price range but keeps other filters', async () => {
            mockExtraction({ minPrice: 900000, maxPrice: 100000, beds: 4 });
            mockDbResults(1, [{ L_ListingID: '1' }]);

            const response = await search('4 bed between 900k and 100k').expect(200);

            expect(response.body.interpretedFilters).toEqual({ beds: 4 });
        });

        test('drops an empty city string', async () => {
            mockExtraction({ city: '   ', beds: 2 });
            mockDbResults(1, [{ L_ListingID: '1' }]);

            const response = await search('2 bed').expect(200);

            expect(response.body.interpretedFilters).toEqual({ beds: 2 });
        });

        test('trims surrounding whitespace from a city', async () => {
            mockExtraction({ city: '  San Diego  ' });
            mockDbResults(1, [{ L_ListingID: '1' }]);

            const response = await search('homes in SD').expect(200);

            expect(response.body.interpretedFilters.city).toBe('San Diego');
            expect(whereCall().values).toEqual(['San Diego']);
        });
    });

    describe('no extractable filters', () => {
        test('returns guidance without touching the database', async () => {
            mockExtraction({});

            const response = await search('somewhere nice').expect(200);

            expect(pool.query).not.toHaveBeenCalled();
            expect(response.body.total).toBe(0);
            expect(response.body.results).toEqual([]);
            expect(response.body.interpretedFilters).toEqual({});
            expect(response.body.message).toMatch(/Couldn't find specific criteria/);
        });
    });

    describe('unrecognized cities are resolved before giving up', () => {
        test('searches the containing city when the name is a neighborhood', async () => {
            buildCityCondition
                .mockResolvedValueOnce(null) // "Silver Lake" is in no listing
                .mockResolvedValueOnce({ sql: 'L_City IN (?)', values: ['LOS ANGELES'] });
            resolveUnknownCity.mockResolvedValueOnce({
                city: 'Los Angeles',
                reason: 'neighborhood'
            });
            mockExtraction({ city: 'Silver Lake', beds: 2 });
            mockDbResults(4, [{ L_ListingID: '1' }]);

            const response = await search('2 bed in Silver Lake').expect(200);

            expect(resolveUnknownCity).toHaveBeenCalledWith('Silver Lake');
            expect(whereCall().values).toEqual(['LOS ANGELES', 2]);
            expect(response.body.total).toBe(4);
        });

        test('states the substitution rather than making it silently', async () => {
            buildCityCondition
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ sql: 'L_City IN (?)', values: ['LOS ANGELES'] });
            resolveUnknownCity.mockResolvedValueOnce({
                city: 'Los Angeles',
                reason: 'neighborhood'
            });
            mockExtraction({ city: 'Silver Lake' });
            mockDbResults(4, [{ L_ListingID: '1' }]);

            const response = await search('homes in Silver Lake').expect(200);

            expect(response.body.notice).toBe(
                'Silver Lake is part of Los Angeles — showing Los Angeles listings.'
            );
            // The chip has to show the city actually searched, not the one typed.
            expect(response.body.interpretedFilters.city).toBe('Los Angeles');
        });

        test('reports a correction for a misspelling', async () => {
            buildCityCondition
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ sql: 'L_City IN (?)', values: ['SACRAMENTO'] });
            resolveUnknownCity.mockResolvedValueOnce({ city: 'Sacramento', reason: 'typo' });
            mockExtraction({ city: 'Sacremento' });
            mockDbResults(2, [{ L_ListingID: '1' }]);

            const response = await search('homes in Sacremento').expect(200);

            expect(response.body.notice).toBe('Showing results for Sacramento instead of Sacremento.');
        });

        test('explains an ambiguous name instead of picking one', async () => {
            buildCityCondition.mockResolvedValueOnce(null);
            resolveUnknownCity.mockResolvedValueOnce({ city: null, reason: 'ambiguous' });
            mockExtraction({ city: 'SB' });

            const response = await search('condos in SB').expect(200);

            expect(response.body.total).toBe(0);
            expect(response.body.message).toBe('"SB" could mean more than one city. Try the full name.');
            expect(pool.query).not.toHaveBeenCalled();
        });

        test('explains a location outside the dataset', async () => {
            buildCityCondition.mockResolvedValueOnce(null);
            resolveUnknownCity.mockResolvedValueOnce({ city: null, reason: 'outside_coverage' });
            mockExtraction({ city: 'Portland' });

            const response = await search('homes in Portland').expect(200);

            expect(response.body.message).toBe(
                "We only cover California listings, and Portland isn't one of them."
            );
        });

        test('does not consult the resolver for a city that exists', async () => {
            mockExtraction({ city: 'Los Angeles' });
            mockDbResults(1, [{ L_ListingID: '1' }]);

            await search('homes in LA').expect(200);

            expect(resolveUnknownCity).not.toHaveBeenCalled();
        });

        test('sends no notice when nothing was substituted', async () => {
            mockExtraction({ city: 'Los Angeles' });
            mockDbResults(1, [{ L_ListingID: '1' }]);

            const response = await search('homes in LA').expect(200);

            expect(response.body.notice).toBeUndefined();
        });
    });

    describe('empty results explain themselves', () => {
        test('reports an unknown city without running a search', async () => {
            buildCityCondition.mockResolvedValueOnce(null);
            mockExtraction({ city: 'Lost Angeles', beds: 3 });

            const response = await search('3 bed in Lost Angeles').expect(200);

            expect(response.body.total).toBe(0);
            expect(response.body.results).toEqual([]);
            expect(response.body.message).toBe(
                "We don't have any listings in Lost Angeles. Check the spelling, or try a nearby city."
            );
            // The query could only ever return nothing, so it is never sent.
            expect(pool.query).not.toHaveBeenCalled();
        });

        test('still reports what it understood for an unknown city', async () => {
            buildCityCondition.mockResolvedValueOnce(null);
            mockExtraction({ city: 'Lost Angeles', beds: 3 });

            const response = await search('3 bed in Lost Angeles').expect(200);

            expect(response.body.interpretedFilters).toEqual({ city: 'Lost Angeles', beds: 3 });
        });

        test('blames the other filters when the city is real but nothing matched', async () => {
            mockExtraction({ city: 'Los Angeles', maxPrice: 1000 });
            mockDbResults(0);

            const response = await search('homes in LA under $1000').expect(200);

            expect(response.body.message).toBe(
                'No listings in Los Angeles match the rest of your criteria. Try widening your price range or bedroom count.'
            );
        });

        test('falls back to the generic message when no city was extracted', async () => {
            mockExtraction({ beds: 9 });
            mockDbResults(0);

            const response = await search('9 bedroom homes').expect(200);

            expect(response.body.message).toBe(
                'No properties matched those criteria. Try adjusting your search.'
            );
        });

        test('sends no message when there are results', async () => {
            mockExtraction({ city: 'Los Angeles' });
            mockDbResults(1, [{ L_ListingID: '1' }]);

            const response = await search('homes in LA').expect(200);

            expect(response.body.message).toBeUndefined();
            expect(pool.query).toHaveBeenCalledTimes(2);
        });
    });

    describe('errors', () => {
        test('rejects a missing query', async () => {
            const response = await request(app)
                .post('/api/search/natural')
                .send({})
                .expect(400);

            expect(response.body.error).toBe('query is required');
            expect(mockCreate).not.toHaveBeenCalled();
        });

        test('rejects a whitespace-only query', async () => {
            await search('   ').expect(400);

            expect(mockCreate).not.toHaveBeenCalled();
        });

        test('returns 503 when Claude is unavailable', async () => {
            mockCreate.mockRejectedValueOnce(new Error('overloaded'));

            const response = await search('3 bed in LA').expect(503);

            expect(response.body.error).toMatch(/temporarily unavailable/);
            expect(pool.query).not.toHaveBeenCalled();
        });

        test('returns 500 when the database fails', async () => {
            mockExtraction({ city: 'Los Angeles' });
            pool.query.mockRejectedValueOnce(new Error('connection lost'));

            const response = await search('homes in LA').expect(500);

            expect(response.body.error).toBe('Failed to fetch properties');
        });
    });
});

// Live prompt eval — the only test that actually exercises the abbreviation rules
// against the model. Skipped unless ANTHROPIC_API_KEY is set, since it makes real
// (billable) API calls. Run with: ANTHROPIC_API_KEY=... npx jest naturalSearch
const liveEval = process.env.ANTHROPIC_API_KEY ? describe : describe.skip;

liveEval('city normalization (live model)', () => {
    let extractFilters;

    beforeAll(() => {
        jest.resetModules();
        jest.unmock('@anthropic-ai/sdk');

        const Anthropic = jest.requireActual('@anthropic-ai/sdk');
        const { SYSTEM_PROMPT, FILTER_SCHEMA } = jest.requireActual('./naturalSearch');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        extractFilters = async (query) => {
            const message = await client.messages.create({
                model: 'claude-sonnet-5',
                max_tokens: 1024,
                thinking: { type: 'disabled' },
                output_config: {
                    effort: 'low',
                    format: { type: 'json_schema', schema: FILTER_SCHEMA }
                },
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: query }]
            });
            return JSON.parse(message.content[0].text);
        };
    });

    test('expands unambiguous abbreviations', async () => {
        const filters = await extractFilters('3 bed in LA under 800k');

        expect(filters.city).toBe('Los Angeles');
        expect(filters.beds).toBe(3);
        expect(filters.maxPrice).toBe(800000);
    }, 30000);

    test('corrects an obvious misspelling', async () => {
        const filters = await extractFilters('homes in san fransisco');

        expect(filters.city).toBe('San Francisco');
    }, 30000);

    test('passes an ambiguous abbreviation through for the resolver', async () => {
        const filters = await extractFilters('2 bath condos in SB');

        expect(filters.city).toBe('SB');
        expect(filters.baths).toBe(2);
    }, 30000);

    test('passes a region through rather than dropping it', async () => {
        const filters = await extractFilters('homes in the bay area under 1m');

        expect(filters.city).toBeDefined();
        expect(filters.maxPrice).toBe(1000000);
    }, 30000);

    test('passes a neighborhood through instead of searching statewide', async () => {
        const filters = await extractFilters('3 bed silverlake');

        expect(filters.city).toBeDefined();
        expect(filters.beds).toBe(3);
    }, 30000);
});
