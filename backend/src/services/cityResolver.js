const Anthropic = require('@anthropic-ai/sdk');
const { getCityNames, resolveCity, normalizeCityKey } = require('../db/cities');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INSTRUCTIONS = `You map a property-search location that isn't in our listings database to one that is.

The user searched for a location we have no listings under. Below is the complete list of cities we do have. Decide which one, if any, the user meant.

Return a JSON object:
{
  "city": string,   // a city copied EXACTLY from the list below — omit if none applies
  "reason": string  // why, see below
}

Reasons:
- "typo" — a misspelling of a city on the list ("Sacremento" -> "Sacramento").
- "neighborhood" — a neighborhood, district, or landmark inside a city on the list ("Silver Lake" -> "Los Angeles").
- "alias" — a nickname or abbreviation for a city on the list ("SoMa" -> "San Francisco").
- "ambiguous" — could reasonably mean two or more different cities. Omit "city".
- "outside_coverage" — a real place, but not one on the list and not part of one ("Portland", "Phoenix"). Omit "city".
- "unknown" — you cannot tell what was meant. Omit "city".

Rules:
- "city" must be copied character for character from the list. Never return a city that isn't on it.
- A neighborhood maps to its containing city only if that city is on the list.
- When two cities are plausible, return "ambiguous" — never pick one arbitrarily. A wrong city is worse than no city, because the user is shown listings for a place they didn't ask about.

Cities in our listings:
`;

const RESOLUTION_SCHEMA = {
    type: 'object',
    properties: {
        city: { type: 'string' },
        reason: {
            type: 'string',
            enum: ['typo', 'neighborhood', 'alias', 'ambiguous', 'outside_coverage', 'unknown']
        }
    },
    required: ['reason'],
    additionalProperties: false
};

const UNRESOLVED = { city: null, reason: 'unknown' };

// Keyed by normalized name, so "Silver Lake" costs one API call ever rather than one
// per search. Also caps the damage if the endpoint is hammered with junk locations.
const resolutions = new Map();

// With thinking enabled the response leads with a thinking block, so the JSON is not
// necessarily the first content block. Pick the text block out rather than indexing.
function textFrom(message) {
    const block = (message.content || []).find((entry) => entry.type === 'text');

    if (!block) {
        throw new Error('No text block in city resolution response');
    }

    return block.text;
}

// Asks Claude which real city an unrecognized location meant, choosing from the cities
// actually present in the data. Fuzzy string matching can't do this job: "Silver Lake"
// is nowhere near "Los Angeles" by edit distance, and the cases it does match are
// exactly the ones where a wrong guess is most convincing.
//
// Never throws — the caller is already on a failed-search path, so an unavailable
// resolver degrades to "we don't have listings there" rather than erroring the request.
async function resolveUnknownCity(name) {
    const key = normalizeCityKey(name);
    if (!key) return UNRESOLVED;

    if (resolutions.has(key)) return resolutions.get(key);

    let resolution;

    try {
        const cityNames = await getCityNames();

        const message = await client.messages.create({
            model: 'claude-sonnet-5',
            // Thinking draws from this budget, and the cap only bounds what can be
            // generated — it isn't a spend. Leave room so reasoning can't crowd out
            // the JSON and truncate the response.
            max_tokens: 16000,
            // Unlike the extraction call, this one only runs on a search that already
            // failed, so there's no hot path to protect and no reason to economize.
            // The hard part isn't recalling that Silver Lake is in Los Angeles — it's
            // judging when a name is too ambiguous to answer at all, and that's the
            // one mistake verify() can't catch: a wrong-but-real city passes the index
            // check and reaches the user as confident, wrong listings.
            thinking: { type: 'adaptive' },
            output_config: {
                // effort defaults to high; don't downgrade it here.
                format: { type: 'json_schema', schema: RESOLUTION_SCHEMA }
            },
            system: [
                {
                    type: 'text',
                    // The city list is long and changes only when listings are imported,
                    // so cache it rather than paying for it on every unresolved search.
                    text: INSTRUCTIONS + cityNames.join('\n'),
                    cache_control: { type: 'ephemeral' }
                }
            ],
            messages: [{ role: 'user', content: name }]
        });

        resolution = await verify(JSON.parse(textFrom(message)));
    } catch (error) {
        // Not cached: a transient API or database failure shouldn't permanently mark
        // a real city as unresolvable.
        console.error('City resolution failed:', error);
        return UNRESOLVED;
    }

    resolutions.set(key, resolution);
    return resolution;
}

// Giving the model the list makes an invented city unlikely, not impossible, and this
// value goes into a query. Same rule as validateExtractedFilters: check, don't trust.
async function verify(raw) {
    if (!raw || typeof raw.city !== 'string' || !raw.city.trim()) {
        return { city: null, reason: raw?.reason || 'unknown' };
    }

    const variants = await resolveCity(raw.city);
    if (variants === null) {
        console.warn(`City resolver returned a city not in the dataset: ${JSON.stringify(raw.city)}`);
        return UNRESOLVED;
    }

    return { city: raw.city.trim(), reason: raw.reason || 'alias' };
}

// Drops memoized resolutions. Used by tests, and available if listings are imported
// while the server is running.
function resetResolutionCache() {
    resolutions.clear();
}

module.exports = {
    resolveUnknownCity,
    resetResolutionCache,
    RESOLUTION_SCHEMA,
    INSTRUCTIONS
};
