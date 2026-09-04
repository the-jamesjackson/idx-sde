jest.mock('./mysql', () => ({
    query: jest.fn()
}));

const pool = require('./mysql');
const {
    normalizeCityKey,
    resolveCity,
    buildCityCondition,
    resetCityCache
} = require('./cities');

function mockStoredCities(...names) {
    pool.query.mockResolvedValueOnce([names.map((L_City) => ({ L_City }))]);
}

describe('normalizeCityKey', () => {
    test('collapses case and surrounding whitespace', () => {
        expect(normalizeCityKey('  LOS ANGELES  ')).toBe('los angeles');
    });

    test('collapses internal whitespace and punctuation', () => {
        expect(normalizeCityKey('Los  Angeles')).toBe('los angeles');
        expect(normalizeCityKey('Truth-or-Consequences')).toBe('truth or consequences');
    });

    test('expands the abbreviations MLS data mixes', () => {
        expect(normalizeCityKey('St. Helena')).toBe(normalizeCityKey('Saint Helena'));
        expect(normalizeCityKey('Mt. Shasta')).toBe(normalizeCityKey('Mount Shasta'));
        expect(normalizeCityKey('Ft. Bragg')).toBe(normalizeCityKey('Fort Bragg'));
    });

    test('does not expand abbreviations inside words', () => {
        expect(normalizeCityKey('Stockton')).toBe('stockton');
    });

    test('returns an empty key for junk input', () => {
        expect(normalizeCityKey('')).toBe('');
        expect(normalizeCityKey('   ')).toBe('');
        expect(normalizeCityKey('!!!')).toBe('');
        expect(normalizeCityKey(null)).toBe('');
        expect(normalizeCityKey(42)).toBe('');
    });
});

describe('resolveCity', () => {
    beforeEach(() => {
        pool.query.mockReset();
        resetCityCache();
    });

    test('resolves a name to the spelling stored in the column', async () => {
        mockStoredCities('LOS ANGELES', 'SAN DIEGO');

        expect(await resolveCity('Los Angeles')).toEqual(['LOS ANGELES']);
    });

    test('returns every stored spelling of the same city', async () => {
        mockStoredCities('LOS ANGELES', 'Los Angeles', 'Los Angeles ');

        // Dropping any of these would silently lose listings from the results.
        expect(await resolveCity('los angeles')).toEqual([
            'LOS ANGELES',
            'Los Angeles',
            'Los Angeles '
        ]);
    });

    test('matches across punctuation differences', async () => {
        mockStoredCities('SAINT HELENA');

        expect(await resolveCity('St. Helena')).toEqual(['SAINT HELENA']);
    });

    test('returns null for a city with no listings', async () => {
        mockStoredCities('LOS ANGELES');

        expect(await resolveCity('Austin')).toBeNull();
    });

    test('returns null for an unusable name without loading the list', async () => {
        expect(await resolveCity('  ')).toBeNull();
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('skips null and blank values in the column', async () => {
        pool.query.mockResolvedValueOnce([
            [{ L_City: 'LOS ANGELES' }, { L_City: '   ' }, { L_City: null }]
        ]);

        expect(await resolveCity('Los Angeles')).toEqual(['LOS ANGELES']);
    });

    test('caches the list across lookups', async () => {
        mockStoredCities('LOS ANGELES', 'SAN DIEGO');

        await resolveCity('Los Angeles');
        await resolveCity('San Diego');
        await resolveCity('Austin');

        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test('concurrent cold lookups share a single query', async () => {
        mockStoredCities('LOS ANGELES');

        const [first, second] = await Promise.all([
            resolveCity('Los Angeles'),
            resolveCity('Los Angeles')
        ]);

        expect(pool.query).toHaveBeenCalledTimes(1);
        expect(first).toEqual(['LOS ANGELES']);
        expect(second).toEqual(['LOS ANGELES']);
    });

    test('a failed load is retried rather than cached', async () => {
        pool.query.mockRejectedValueOnce(new Error('connection lost'));
        await expect(resolveCity('Los Angeles')).rejects.toThrow('connection lost');

        mockStoredCities('LOS ANGELES');
        expect(await resolveCity('Los Angeles')).toEqual(['LOS ANGELES']);
    });
});

describe('buildCityCondition', () => {
    beforeEach(() => {
        pool.query.mockReset();
        resetCityCache();
    });

    test('compares the bare column so the index applies', async () => {
        mockStoredCities('LOS ANGELES');

        const condition = await buildCityCondition('Los Angeles');

        expect(condition.sql).toBe('L_City IN (?)');
        expect(condition.sql).not.toMatch(/LOWER|TRIM/);
        expect(condition.values).toEqual(['LOS ANGELES']);
    });

    test('binds one placeholder per stored spelling', async () => {
        mockStoredCities('LOS ANGELES', 'Los Angeles');

        const condition = await buildCityCondition('Los Angeles');

        expect(condition.sql).toBe('L_City IN (?, ?)');
        expect(condition.values).toEqual(['LOS ANGELES', 'Los Angeles']);
    });

    test('returns null for a city with no listings', async () => {
        mockStoredCities('LOS ANGELES');

        expect(await buildCityCondition('Austin')).toBeNull();
    });

    test('falls back to the unindexed match if the list cannot be loaded', async () => {
        pool.query.mockRejectedValueOnce(new Error('connection lost'));

        const condition = await buildCityCondition('Los Angeles');

        // A slower search beats a failed one, so this must not throw or return null —
        // returning null would report a real city as having no listings.
        expect(condition.sql).toBe('LOWER(TRIM(L_City)) = LOWER(TRIM(?))');
        expect(condition.values).toEqual(['Los Angeles']);
    });
});
