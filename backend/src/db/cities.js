const pool = require('./mysql');

// The city list only changes when new listings are imported, so a long TTL is fine.
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache = null;
let inFlight = null;

// Collapses the spelling differences that shouldn't decide whether a search matches:
// case, surrounding and internal whitespace, punctuation, and the abbreviations MLS
// data mixes freely ("St. Helena" / "Saint Helena", "Mt. Shasta" / "Mount Shasta").
function normalizeCityKey(value) {
    if (typeof value !== 'string') return '';

    return value
        .toLowerCase()
        .replace(/\bst\.?\b/g, 'saint')
        .replace(/\bmt\.?\b/g, 'mount')
        .replace(/\bft\.?\b/g, 'fort')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// Keyed by normalized name, valued by every spelling actually stored in the column.
// One key can hold several: MLS exports routinely contain "LOS ANGELES", "Los Angeles"
// and "Los Angeles " as distinct values, and a search for that city has to match all
// of them or it silently drops listings.
async function loadCityIndex() {
    const [rows] = await pool.query(
        'SELECT DISTINCT L_City FROM rets_property WHERE L_City IS NOT NULL'
    );

    const byKey = new Map();

    for (const row of rows) {
        const stored = row.L_City;
        const key = normalizeCityKey(stored);
        if (!key) continue;

        const variants = byKey.get(key);
        if (variants) {
            variants.push(stored);
        } else {
            byKey.set(key, [stored]);
        }
    }

    return { loadedAt: Date.now(), byKey };
}

// Concurrent callers during a cold start share one query rather than each firing
// their own scan of rets_property.
function getCityIndex() {
    if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
        return Promise.resolve(cache);
    }

    if (!inFlight) {
        inFlight = loadCityIndex()
            .then((loaded) => {
                cache = loaded;
                return loaded;
            })
            .finally(() => {
                inFlight = null;
            });
    }

    return inFlight;
}

// One display name per distinct city, sorted. Sorted matters: this list goes into a
// cached prompt prefix, and MySQL makes no ordering promise for DISTINCT, so an
// unsorted list would silently reshuffle on reload and invalidate the cache.
async function getCityNames() {
    const { byKey } = await getCityIndex();
    return [...byKey.values()].map(([first]) => first).sort();
}

// Resolves a user-supplied city name to the spellings stored in the column, or null
// if no listing has ever used that name. Throws if the city list can't be loaded.
async function resolveCity(name) {
    const key = normalizeCityKey(name);
    if (!key) return null;

    const { byKey } = await getCityIndex();
    return byKey.get(key) || null;
}

// Builds the SQL for a city filter. Returns null when the city isn't in the dataset,
// which callers should treat as "no results" rather than running the query.
//
// Comparing against the stored spellings keeps the column bare so the index on
// L_City applies. If the city list can't be loaded we fall back to the old
// function-wrapped comparison: slower, but a degraded index beats a failed search.
async function buildCityCondition(name) {
    let variants;

    try {
        variants = await resolveCity(name);
    } catch (error) {
        console.error('City index unavailable, falling back to unindexed match:', error);
        return {
            sql: 'LOWER(TRIM(L_City)) = LOWER(TRIM(?))',
            values: [name]
        };
    }

    if (variants === null) return null;

    return {
        sql: `L_City IN (${variants.map(() => '?').join(', ')})`,
        values: variants
    };
}

// Drops the cached list so the next lookup reloads it. Used by tests, and available
// if listings are imported while the server is running.
function resetCityCache() {
    cache = null;
    inFlight = null;
}

module.exports = {
    normalizeCityKey,
    getCityNames,
    resolveCity,
    buildCityCondition,
    resetCityCache
};
