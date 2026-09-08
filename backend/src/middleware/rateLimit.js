const { rateLimit, MINUTE } = require('express-rate-limit');

const WINDOW_MS = 5 * MINUTE;
const MAX_SEARCHES = 20;

// A factory rather than a shared instance, so each limiter owns its counter store.
function createNaturalSearchLimiter(overrides = {}) {
    return rateLimit({
        windowMs: WINDOW_MS,
        limit: MAX_SEARCHES,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                error: "That's a lot of searches at once. Give it a minute and try again."
            });
        },
        ...overrides
    });
}

module.exports = { createNaturalSearchLimiter, WINDOW_MS, MAX_SEARCHES };
