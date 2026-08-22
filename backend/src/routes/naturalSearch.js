const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db/mysql');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You extract property search filters from natural language queries.

Return ONLY a JSON object with these fields (omit any field you cannot confidently extract):
{
  "city": string,
  "zipcode": string,
  "minPrice": number,
  "maxPrice": number,
  "beds": integer,
  "baths": integer,
  "minYearBuilt": integer,
  "maxYearBuilt": integer
}

Rules:
- Return ONLY valid JSON. No markdown fences, no prose, no explanation.
- If a query gives no extractable filters, return {}.
- "cheap" or "affordable" alone (no number given) should NOT produce a maxPrice guess — omit it.
- Never invent values the query doesn't support.
- beds/baths in queries like "3 bed" or "2 bath" map to minimum, not exact.
- City names should be returned exactly as the user typed them, without modification.`;

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

    if (Number.isInteger(raw.baths) && raw.baths > 0) {
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

    if (filters.city) {
        conditions.push('LOWER(TRIM(L_City)) = LOWER(TRIM(?))');
        values.push(filters.city);
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
            message: total === 0
                ? "No properties matched those criteria. Try adjusting your search."
                : undefined
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch properties' });
    }
});

module.exports = router;