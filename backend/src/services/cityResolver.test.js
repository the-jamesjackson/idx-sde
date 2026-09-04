const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () =>
    jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate }
    }))
);

jest.mock('../db/cities', () => ({
    getCityNames: jest.fn(),
    resolveCity: jest.fn(),
    normalizeCityKey: jest.requireActual('../db/cities').normalizeCityKey
}));

const { getCityNames, resolveCity } = require('../db/cities');
const { resolveUnknownCity, resetResolutionCache } = require('./cityResolver');

// Thinking is enabled on this call, so the real response leads with a thinking block
// and the JSON arrives in a later text block. The mock mirrors that shape.
function mockResolution(resolution) {
    mockCreate.mockResolvedValueOnce({
        content: [
            { type: 'thinking', thinking: '', signature: 'sig' },
            { type: 'text', text: JSON.stringify(resolution) }
        ]
    });
}

// The dataset the model is allowed to choose from.
function mockDataset(...cities) {
    getCityNames.mockResolvedValue(cities);
    resolveCity.mockImplementation(async (name) =>
        cities.includes(name) ? [name.toUpperCase()] : null
    );
}

function request() {
    return mockCreate.mock.calls[0][0];
}

describe('resolveUnknownCity', () => {
    beforeEach(() => {
        mockCreate.mockReset();
        getCityNames.mockReset();
        resolveCity.mockReset();
        resetResolutionCache();
        mockDataset('Los Angeles', 'San Diego', 'Sacramento');
    });

    describe('the request it builds', () => {
        test('gives the model the full city list to choose from', async () => {
            mockResolution({ city: 'Los Angeles', reason: 'neighborhood' });

            await resolveUnknownCity('Silver Lake');

            const system = request().system[0].text;
            expect(system).toContain('Los Angeles');
            expect(system).toContain('San Diego');
            expect(system).toContain('Sacramento');
        });

        test('caches the city list, which is the bulk of the prompt', async () => {
            mockResolution({ city: 'Los Angeles', reason: 'neighborhood' });

            await resolveUnknownCity('Silver Lake');

            expect(request().system[0].cache_control).toEqual({ type: 'ephemeral' });
        });

        test('constrains the response with a schema', async () => {
            mockResolution({ city: 'Los Angeles', reason: 'neighborhood' });

            await resolveUnknownCity('Silver Lake');

            expect(request().output_config.format.type).toBe('json_schema');
        });

        test('leaves thinking and effort at full strength', async () => {
            mockResolution({ city: 'Los Angeles', reason: 'neighborhood' });

            await resolveUnknownCity('Silver Lake');

            // The ambiguity judgment is the one mistake verify() cannot catch, so this
            // call deliberately does not economize the way the extraction call does.
            expect(request().thinking).toEqual({ type: 'adaptive' });
            expect(request().output_config.effort).toBeUndefined();
        });

        test('sends the unresolved name as the user message', async () => {
            mockResolution({ reason: 'unknown' });

            await resolveUnknownCity('Silver Lake');

            expect(request().messages).toEqual([{ role: 'user', content: 'Silver Lake' }]);
        });
    });

    describe('resolutions', () => {
        test('maps a neighborhood to its containing city', async () => {
            mockResolution({ city: 'Los Angeles', reason: 'neighborhood' });

            expect(await resolveUnknownCity('Silver Lake')).toEqual({
                city: 'Los Angeles',
                reason: 'neighborhood'
            });
        });

        test('maps a misspelling to the real city', async () => {
            mockResolution({ city: 'Sacramento', reason: 'typo' });

            expect(await resolveUnknownCity('Sacremento')).toEqual({
                city: 'Sacramento',
                reason: 'typo'
            });
        });

        test('passes through an ambiguous verdict without a city', async () => {
            mockResolution({ reason: 'ambiguous' });

            expect(await resolveUnknownCity('SB')).toEqual({ city: null, reason: 'ambiguous' });
        });

        test('passes through an out-of-coverage verdict without a city', async () => {
            mockResolution({ reason: 'outside_coverage' });

            expect(await resolveUnknownCity('Portland')).toEqual({
                city: null,
                reason: 'outside_coverage'
            });
        });
    });

    describe('verification', () => {
        test('rejects a city that is not in the dataset', async () => {
            // Supplying the list makes this unlikely, not impossible, and the value
            // goes into a query — so it is checked rather than trusted.
            mockResolution({ city: 'Atlantis', reason: 'typo' });

            expect(await resolveUnknownCity('Atlantas')).toEqual({ city: null, reason: 'unknown' });
        });

        test('rejects a blank city', async () => {
            mockResolution({ city: '   ', reason: 'typo' });

            expect(await resolveUnknownCity('Silver Lake')).toEqual({
                city: null,
                reason: 'typo'
            });
        });
    });

    describe('caching', () => {
        test('resolves a repeated name without calling the API again', async () => {
            mockResolution({ city: 'Los Angeles', reason: 'neighborhood' });

            const first = await resolveUnknownCity('Silver Lake');
            const second = await resolveUnknownCity('silver lake');

            expect(second).toEqual(first);
            expect(mockCreate).toHaveBeenCalledTimes(1);
        });

        test('caches unresolved verdicts too, so junk cannot be replayed for cost', async () => {
            mockResolution({ reason: 'unknown' });

            await resolveUnknownCity('asdfgh');
            await resolveUnknownCity('asdfgh');

            expect(mockCreate).toHaveBeenCalledTimes(1);
        });
    });

    describe('failures', () => {
        test('reads the JSON past a leading thinking block', async () => {
            // Indexing content[0] returns the thinking block, whose .text is undefined —
            // which silently turned every resolution into "unknown".
            mockCreate.mockResolvedValueOnce({
                content: [
                    { type: 'thinking', thinking: 'considering', signature: 'sig' },
                    { type: 'text', text: JSON.stringify({ city: 'Los Angeles', reason: 'neighborhood' }) }
                ]
            });

            expect(await resolveUnknownCity('silverlake')).toEqual({
                city: 'Los Angeles',
                reason: 'neighborhood'
            });
        });

        test('returns unresolved if the response carries no text block', async () => {
            mockCreate.mockResolvedValueOnce({
                content: [{ type: 'thinking', thinking: 'truncated', signature: 'sig' }]
            });

            expect(await resolveUnknownCity('silverlake')).toEqual({
                city: null,
                reason: 'unknown'
            });
        });

        test('returns unresolved instead of throwing when the API fails', async () => {
            mockCreate.mockRejectedValueOnce(new Error('overloaded'));

            expect(await resolveUnknownCity('Silver Lake')).toEqual({
                city: null,
                reason: 'unknown'
            });
        });

        test('does not cache a failure', async () => {
            mockCreate.mockRejectedValueOnce(new Error('overloaded'));
            await resolveUnknownCity('Silver Lake');

            mockResolution({ city: 'Los Angeles', reason: 'neighborhood' });
            expect(await resolveUnknownCity('Silver Lake')).toEqual({
                city: 'Los Angeles',
                reason: 'neighborhood'
            });
        });

        test('returns unresolved without calling the API for an unusable name', async () => {
            expect(await resolveUnknownCity('  ')).toEqual({ city: null, reason: 'unknown' });
            expect(mockCreate).not.toHaveBeenCalled();
        });
    });
});
