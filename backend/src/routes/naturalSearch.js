const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db/mysql');
const { buildCityCondition } = require('../db/cities');
const { resolveUnknownCity } = require('../services/cityResolver');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You extract structured property-search filters from a natural language query.

Return ONLY a JSON object using these fields. Omit any field you cannot confidently extract — never include a field you had to guess at.
{
  "city": string,          // city name, exactly as the user typed it
  "zipcode": string,       // 5-digit US ZIP code
  "minPrice": number,      // lower price bound, in whole dollars
  "maxPrice": number,      // upper price bound, in whole dollars
  "beds": integer,         // minimum number of bedrooms
  "baths": number,         // minimum number of bathrooms (half-baths allowed, e.g. 2.5)
  "minYearBuilt": integer, // earliest year built (4-digit)
  "maxYearBuilt": integer  // latest year built (4-digit)
}

Output format:
- If the query contains no extractable filters, return an empty object {}.
- Never invent values the query doesn't support.

Number normalization — always convert prices to whole dollars:
- "500k" -> 500000, "1.2m" -> 1200000, "$300,000" -> 300000.

Price phrasing:
- "under" / "below" / "less than" / "up to" X -> maxPrice = X.
- "over" / "above" / "more than" / "starting at" X -> minPrice = X.
- "between X and Y", "X to Y", "X-Y" -> minPrice = X, maxPrice = Y.
- "cheap" / "affordable" / "budget" with NO number given -> do NOT guess a price; omit it.

Beds / baths:
- "3 bed", "3br", "3 bedrooms" -> beds = 3. Treat the count as a minimum, not an exact match. Same for baths.
- Bathrooms may be fractional: "2.5 baths" -> baths = 2.5. Bedrooms are always whole numbers.

Year built:
- "built after 2000" / "newer than 2000" / "2000 or later" -> minYearBuilt = 2000.
- "built before 1990" / "older than 1990" -> maxYearBuilt = 1990.
- "new construction" with no specific year -> omit (there is no year to anchor to).

City names — the database stores full, correctly spelled city names, and matching is exact:
- Expand well-known abbreviations and fix obvious misspellings: "LA" -> "Los Angeles", "SF" -> "San Francisco", "SD" -> "San Diego", "sacremento" -> "Sacramento".
- Only normalize when you are confident. If the location is an ambiguous abbreviation ("SB"), a neighborhood ("Silver Lake"), a region ("the Bay Area"), or a place you don't recognize, put it in "city" exactly as the user typed it and leave it alone.
- Always include the location the user named. A later step resolves anything you couldn't normalize against the real list of cities; dropping it here would silently search the entire state instead.
- Never substitute a different city for the one the user named — no nearby cities, no containing metro area.

Examples:
Query: "3 bed homes in Austin under 600k"
{"city":"Austin","beds":3,"maxPrice":600000}

Query: "affordable condos near downtown"
{}

Query: "houses between $250k and $400k built after 2015 in 90210"
{"minPrice":250000,"maxPrice":400000,"minYearBuilt":2015,"zipcode":"90210"}

Query: "3 bed in LA under 800k"
{"city":"Los Angeles","beds":3,"maxPrice":800000}

Query: "2 bath condos in SB"
{"city":"SB","baths":2}

Query: "homes in the bay area under 1m"
{"city":"the bay area","maxPrice":1000000}

Query: "3 bed silverlake"
{"city":"silverlake","beds":3}`;

// JSON schema passed to structured outputs so Claude's response is always schema-valid JSON.
// Fields are optional (empty `required`), so the model omits anything it can't extract.
// Range/format checks (5-digit zip, non-negative prices, etc.) stay in validateExtractedFilters.
const FILTER_SCHEMA = {
    type: 'object',
    properties: {
        city: { type: 'string' },
        zipcode: { type: 'string' },
        minPrice: { type: 'number' },
        maxPrice: { type: 'number' },
        beds: { type: 'integer' },
        baths: { type: 'number' },
        minYearBuilt: { type: 'integer' },
        maxYearBuilt: { type: 'integer' }
    },
    required: [],
    additionalProperties: false
};

// This function validates and cleans Claude's extracted output before it ever touches SQL
// Anything null, undefined, wrong-typed, or nonsensical gets dropped rather than passed through

function validateExtractedFilters(raw) {
    const filters = {};

    if (!raw || typeof raw !== 'object') return filters;

    if (typeof raw.city === 'string' && raw.city.trim().length > 0) {
        filters.city = raw.city.trim();
    }

    if (typeof raw.zipcode === 'string' && /^\d{5}$/.test(raw.zipcode.trim())) {
        filters.zipcode = raw.zipcode.trim();
    }

    if (typeof raw.minPrice === 'number' && !isNaN(raw.minPrice) && raw.minPrice >= 0) {
        filters.minPrice = raw.minPrice;
    }

    if (typeof raw.maxPrice === 'number' && !isNaN(raw.maxPrice) && raw.maxPrice >= 0) {
        filters.maxPrice = raw.maxPrice;
    }

    if (Number.isInteger(raw.beds) && raw.beds > 0) {
        filters.beds = raw.beds;
    }

    if (typeof raw.baths === 'number' && !isNaN(raw.baths) && raw.baths > 0) {
        filters.baths = raw.baths;
    }

    const currentYear = new Date().getFullYear();
    if (Number.isInteger(raw.minYearBuilt) && raw.minYearBuilt > 1800 && raw.minYearBuilt <= currentYear) {
        filters.minYearBuilt = raw.minYearBuilt;
    }

    if (Number.isInteger(raw.maxYearBuilt) && raw.maxYearBuilt > 1800 && raw.maxYearBuilt <= currentYear) {
        filters.maxYearBuilt = raw.maxYearBuilt;
    }

    if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
        delete filters.minPrice;
        delete filters.maxPrice;
    }

    return filters;
}

// Substituting a city silently would show people listings for a place they didn't ask
// about, so every substitution is stated in the response.
function describeSubstitution(requested, resolution) {
    if (resolution.reason === 'neighborhood') {
        return `${requested} is part of ${resolution.city} — showing ${resolution.city} listings.`;
    }

    return `Showing results for ${resolution.city} instead of ${requested}.`;
}

function describeUnresolvedCity(requested, reason) {
    if (reason === 'ambiguous') {
        return `"${requested}" could mean more than one city. Try the full name.`;
    }

    if (reason === 'outside_coverage') {
        return `We only cover California listings, and ${requested} isn't one of them.`;
    }

    return `We don't have any listings in ${requested}. Check the spelling, or try a nearby city.`;
}

// An empty search with a city filter means the city is real (unknown cities are caught
// before the query runs) but the other filters excluded everything — so point the user
// at the filters rather than at the city name.
function describeEmptyResult(filters) {
    if (!filters.city) return 'No properties matched those criteria. Try adjusting your search.';

    return `No listings in ${filters.city} match the rest of your criteria. Try widening your price range or bedroom count.`;
}

router.post('/', async (req, res) => {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'query is required' });
    }

    let extracted;

    try {
        const message = await client.messages.create({
            model: 'claude-sonnet-5',
            max_tokens: 1024,
            // Extraction is latency-sensitive and doesn't benefit from reasoning.
            // Disable thinking (on by default for Sonnet 5) and run at low effort.
            thinking: { type: 'disabled' },
            output_config: {
                effort: 'low',
                format: { type: 'json_schema', schema: FILTER_SCHEMA }
            },
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: query }]
        });
        extracted = JSON.parse(message.content[0].text);
    } catch (error) {
        console.error('Claude API error:', error);
        return res.status(503).json({ error: 'Search is temporarily unavailable. Please try again.' });
    }

    const filters = validateExtractedFilters(extracted);

    if (Object.keys(filters).length === 0) {
        return res.json({
            total: 0,
            results: [],
            interpretedFilters: {},
            message: "Couldn't find specific criteria in that search. Try including a city, price, or bedroom count."
        });
    }

    const conditions = [];
    const values = [];

    let notice;

    if (filters.city) {
        let cityCondition = await buildCityCondition(filters.city);

        // No listing uses this name — a neighborhood, a nickname, a typo, or somewhere
        // we don't cover. Ask Claude which real city was meant before giving up.
        if (cityCondition === null) {
            const requested = filters.city;
            const resolution = await resolveUnknownCity(requested);

            if (resolution.city) {
                cityCondition = await buildCityCondition(resolution.city);
                filters.city = resolution.city;
                notice = describeSubstitution(requested, resolution);
            }

            if (cityCondition === null) {
                return res.json({
                    total: 0,
                    results: [],
                    interpretedFilters: filters,
                    message: describeUnresolvedCity(requested, resolution.reason)
                });
            }
        }

        conditions.push(cityCondition.sql);
        values.push(...cityCondition.values);
    }

    if (filters.zipcode) {
        conditions.push('L_Zip = ?');
        values.push(filters.zipcode);
    }

    if (filters.minPrice !== undefined) {
        conditions.push('L_SystemPrice >= ?');
        values.push(filters.minPrice);
    }

    if (filters.maxPrice !== undefined) {
        conditions.push('L_SystemPrice <= ?');
        values.push(filters.maxPrice);
    }

    if (filters.beds !== undefined) {
        conditions.push('L_Keyword2 >= ?');
        values.push(filters.beds);
    }

    if (filters.baths !== undefined) {
        conditions.push('LM_Dec_3 >= ?');
        values.push(filters.baths);
    }

    if (filters.minYearBuilt !== undefined) {
        conditions.push('YearBuilt >= ?');
        values.push(filters.minYearBuilt);
    }

    if (filters.maxYearBuilt !== undefined) {
        conditions.push('YearBuilt <= ?');
        values.push(filters.maxYearBuilt);
    }

    try {
        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM rets_property ${whereClause}`,
            values
        );
        const total = countResult[0].total;

        const [results] = await pool.query(
            `SELECT * FROM rets_property ${whereClause} LIMIT 20`,
            values
        );

        res.json({
            total,
            results,
            interpretedFilters: filters,
            notice,
            message: total === 0 ? describeEmptyResult(filters) : undefined
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch properties' });
    }
});

module.exports = router;

module.exports.SYSTEM_PROMPT = SYSTEM_PROMPT;
module.exports.FILTER_SCHEMA = FILTER_SCHEMA;