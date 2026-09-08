const request = require('supertest');
const express = require('express');
const { createNaturalSearchLimiter, MAX_SEARCHES } = require('./rateLimit');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.post('/api/search/natural', createNaturalSearchLimiter(), (req, res) => res.json({ ok: true }));
    return app;
}

function search(app) {
    return request(app).post('/api/search/natural').send({ query: 'homes in LA' });
}

describe('natural search rate limit', () => {
    test('allows searches up to the cap', async () => {
        const app = makeApp();

        for (let i = 0; i < MAX_SEARCHES; i++) {
            await search(app).expect(200);
        }
    });

    test('rejects the request past the cap with a usable message', async () => {
        const app = makeApp();

        for (let i = 0; i < MAX_SEARCHES; i++) {
            await search(app).expect(200);
        }

        const response = await search(app).expect(429);

        expect(response.body.error).toMatch(/lot of searches/i);
    });

    test('reports the remaining budget', async () => {
        const app = makeApp();

        const response = await search(app).expect(200);

        expect(response.headers['ratelimit']).toContain(`remaining=${MAX_SEARCHES - 1}`);
        expect(response.headers['ratelimit-policy']).toBe(`${MAX_SEARCHES};w=300`);
    });
});
