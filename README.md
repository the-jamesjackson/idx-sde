# IDX Property Search Application

A full-stack property search application built with React, Node.js/Express, and MySQL. It serves California real-estate listings (RETS/RESO data) with structured filtering, pagination, detail pages, and an AI-powered natural language search.

## Features

- Property search with filters (city, ZIP, price, beds, baths)
- Paginated results
- Property detail pages with image gallery, lightbox, and Google Maps location
- Image carousel on listing cards
- Open house schedules
- **AI-powered natural language search** — describe what you're looking for in plain English (e.g. "3 bed homes in Portland under $500k") and Claude translates it into structured filters

## Prerequisites

- Node.js 18+ and npm
- Docker Desktop
- Git
- An [Anthropic API key](https://console.anthropic.com/) (required for natural language search)
- A Google Maps API key (optional — the property map degrades gracefully without one)

## Setup Instructions

### 1. Clone Repository

```bash
git clone <repository-url>
cd idx-internship
```

### 2. Start Database

```bash
docker run --name idx-mysql-local -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=rets \
  -d mysql:8.0

# Import data (run from the repo root, where the .sql files live)
docker exec -i idx-mysql-local mysql -uroot -prootpass rets < rets_property.sql
docker exec -i idx-mysql-local mysql -uroot -prootpass rets < rets_openhouse.sql
```

### 3. Backend Setup

```bash
cd backend
npm install
```

Create a `backend/.env` file with the following values:

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=rootpass
DB_NAME=rets
PORT=5001
ANTHROPIC_API_KEY=your-anthropic-api-key
```

Then start the server:

```bash
npm run dev
```

Backend runs on http://localhost:5001

### 4. Frontend Setup

```bash
cd frontend
npm install
npm start
```

Frontend runs on http://localhost:3000

To enable the map on property detail pages, create a `frontend/.env` file:

```bash
REACT_APP_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

> Note: Create React App only reads `.env` at startup — restart `npm start` after changing it.

## Running Tests

Backend tests (Jest + Supertest):

```bash
cd backend
npm test
```

Frontend tests (React Testing Library):

```bash
cd frontend
npm test
```

## Linting

```bash
cd frontend
npm run lint
```

## Project Structure

```
idx-internship/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   └── mysql.js
│   │   ├── routes/
│   │   │   ├── properties.js
│   │   │   ├── properties.test.js
│   │   │   └── naturalSearch.js
│   │   └── index.js
│   ├── .env
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/          # API client
│   │   ├── components/   # PropertyCard, filters, carousel, gallery, map, pagination
│   │   ├── pages/        # ListingsPage, PropertyDetailPage, NaturalSearchPage
│   │   ├── hooks/        # custom React hooks (reserved)
│   │   └── utils/        # shared formatting helpers
│   └── package.json
├── rets_property.sql
├── rets_openhouse.sql
└── README.md
```

## API Endpoints

### GET /api/properties

Returns a paginated list of properties with optional filters.

Query parameters:
- `limit`: Number of results (default: 20, max: 100)
- `offset`: Pagination offset (default: 0)
- `city`: Filter by city
- `zipcode`: Filter by ZIP code
- `minPrice`: Minimum price
- `maxPrice`: Maximum price
- `beds`: Minimum bedrooms
- `baths`: Minimum bathrooms

Example:

```bash
GET /api/properties?city=Portland&minPrice=300000&beds=3
```

### GET /api/properties/:id

Returns details for a single property.

### GET /api/properties/:id/openhouses

Returns the open house schedule for a property.

### POST /api/search/natural

Accepts a plain-English query and uses Claude to interpret it into structured filters, then returns matching properties.

Request body:

```json
{ "query": "3 bedroom homes in Portland under $500k" }
```

### GET /api/health

Health check that verifies database connectivity.

## Architecture Decisions

### Why Docker for MySQL?
- Consistent environment across developers
- Easy to start/stop without affecting the local machine
- Simple to reset and reimport data

### Why Pagination?
- The dataset is large (50,000+ properties) and would be slow to load all at once
- Better user experience with smaller chunks
- Reduces backend load

### Why React Router?
- Clean URLs for property detail pages
- Browser back button works as expected
- Easy to add more pages in the future

### Why an LLM for natural language search?
- Maps free-form user intent onto the same structured filters the standard search already supports, rather than building a brittle keyword parser
- Runs server-side so the API key is never exposed to the browser

## Known Issues / Future Improvements

- Some listing photo URLs point to expired media (sold listings) and 404; broken images fall back to an "Image unavailable" placeholder
- Implement user authentication
- Add saved searches and favorites (a `hooks/` folder is reserved for this)
- Further mobile responsive design improvements

## Troubleshooting

**Backend won't start:**
- Check MySQL is running: `docker ps`
- Verify `backend/.env` exists with correct credentials
- Confirm nothing else is using port 5001

**Natural language search returns an error:**
- Ensure `ANTHROPIC_API_KEY` is set in `backend/.env` and the backend was restarted

**Map shows "not authorized" or is blank:**
- Set `REACT_APP_GOOGLE_MAPS_API_KEY` in `frontend/.env`
- In the Google Cloud Console, allow `http://localhost:3000/*` as an HTTP referrer and enable the Maps Embed API

**Frontend shows CORS or proxy errors:**
- Ensure `"proxy": "http://localhost:5001"` is set in `frontend/package.json`
- Restart the React dev server

**Tests failing:**
- Clear node_modules: `rm -rf node_modules && npm install`
- Check Node version: `node --version` (should be 18+)

## Contributors

James Jackson — Initial development

## License

This project was created for educational purposes as part of the IDX Exchange internship program.
