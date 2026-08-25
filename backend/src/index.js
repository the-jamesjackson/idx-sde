const express = require('express');
const cors = require('cors');
const pool = require('./db/mysql');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${timestamp}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    });

    next();
});

const propertiesRouter = require('./routes/properties');
app.use('/api/properties', propertiesRouter);

const naturalSearchRouter = require('./routes/naturalSearch');
app.use('/api/search/natural', naturalSearchRouter);

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});