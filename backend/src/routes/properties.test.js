const request = require('supertest');
const express = require('express');
const propertiesRouter = require('./properties');

jest.mock('../db/mysql', () => ({
    query: jest.fn()
}));

jest.mock('../db/cities', () => ({
    buildCityCondition: jest.fn()
}));

const pool = require('../db/mysql');
const { buildCityCondition } = require('../db/cities');

const app = express();
app.use(express.json());
app.use('/api/properties', propertiesRouter);

describe('Properties API', () => {
    beforeEach(() => {
        pool.query.mockClear();

        buildCityCondition.mockReset();
        buildCityCondition.mockImplementation(async (name) => ({
            sql: 'L_City IN (?)',
            values: [name]
        }));
    });

    describe('GET /api/properties', () => {
        test('returns properties with pagination', async () => {
            pool.query
                .mockResolvedValueOnce([[{ total: 100 }]]) 
                .mockResolvedValueOnce([[{ L_ListingID: '123', L_City: 'Portland' }]]); 

            const response = await request(app)
                .get('/api/properties?limit=20&offset=0')
                .expect(200);

            expect(response.body.total).toBe(100);
            expect(response.body.results).toHaveLength(1);
            expect(response.body.results[0].L_City).toBe('Portland');
        });

        test('returns 400 for invalid limit', async () => {
            const response = await request(app)
                .get('/api/properties?limit=abc')
                .expect(400);

            expect(response.body.error).toContain('limit');
        });

        test('filters by city', async () => {
            pool.query
                .mockResolvedValueOnce([[{ total: 50 }]])
                .mockResolvedValueOnce([[{ ListingId: '123', City: 'Portland' }]]);

            const response = await request(app)
                .get('/api/properties?city=Portland')
                .expect(200);

            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('WHERE'),
                expect.arrayContaining(['Portland'])
            );
        });

        test('returns an empty page for a city with no listings', async () => {
            buildCityCondition.mockResolvedValueOnce(null);

            const response = await request(app)
                .get('/api/properties?city=Nowhere')
                .expect(200);

            expect(response.body).toEqual({ total: 0, limit: 20, offset: 0, results: [] });
            expect(pool.query).not.toHaveBeenCalled();
        });

        test('still validates other params when the city is unknown', async () => {
            buildCityCondition.mockResolvedValueOnce(null);

            const response = await request(app)
                .get('/api/properties?city=Nowhere&limit=500')
                .expect(400);

            expect(response.body.error).toContain('limit');
        });

        test('filters by price range', async () => {
            pool.query
                .mockResolvedValueOnce([[{ total: 25 }]])
                .mockResolvedValueOnce([[{ L_ListingID: '123', L_SystemPrice: 400000 }]]);

            const response = await request(app)
                .get('/api/properties?minPrice=300000&maxPrice=500000')
                .expect(200);

            expect(response.body.results[0].L_SystemPrice).toBe(400000);
        });
    });

    describe('GET /api/properties/:id', () => {
        test('returns property by id', async () => {
            pool.query.mockResolvedValueOnce([[
                { L_ListingID: '123', L_City: 'Portland', L_SystemPrice: 500000 }
            ]]);

            const response = await request(app)
                .get('/api/properties/123')
                .expect(200);

            expect(response.body.L_ListingID).toBe('123');
        });

        test('returns 404 for non-existent property', async () => {
            pool.query.mockResolvedValueOnce([[]]);

            const response = await request(app)
                .get('/api/properties/999')
                .expect(404);

            expect(response.body.error).toContain('not found');
        });
    });

    describe('GET /api/properties/:id/openhouses', () => {
        test('returns open houses for property', async () => {
            pool.query
                .mockResolvedValueOnce([[{ L_ListingID: '123' }]]) // property check
                .mockResolvedValueOnce([[
                    { OpenHouseDate: '2024-03-15', OH_StartTime: '1:00 PM' }
                ]]);

            const response = await request(app)
                .get('/api/properties/123/openhouses')
                .expect(200);

            expect(response.body.count).toBe(1);
            expect(response.body.openhouses).toHaveLength(1);
        });

        test('returns empty array for property with no open houses', async () => {
            pool.query
                .mockResolvedValueOnce([[{ ListingId: '123' }]])
                .mockResolvedValueOnce([[]]);

            const response = await request(app)
                .get('/api/properties/123/openhouses')
                .expect(200);
                
            expect(response.body.count).toBe(0);
            expect(response.body.openhouses).toHaveLength(0);
        });
    });
});