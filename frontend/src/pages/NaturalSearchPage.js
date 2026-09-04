import { useState } from 'react';
import { Link } from 'react-router-dom';
import PropertyCard from '../components/PropertyCard';
import { formatCity } from '../utils/formatting';
import '../pages/ListingsPage.css';
import './NaturalSearchPage.css';

function NaturalSearchPage() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [interpretedFilters, setInterpretedFilters] = useState(null);
    const [message, setMessage] = useState('');
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');

    const handleSearch = async () => {
        if (!query.trim()) return;

        setLoading(true);
        setError('');
        setMessage('');
        setNotice('');

        try {
            const response = await fetch('/api/search/natural', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            if (!response.ok) {
                const errData = await response.json();
                setError(errData.error || 'Something went wrong with your search.');
                setResults([]);
                setInterpretedFilters(null);
                setNotice('');
                return;
            }

            const data = await response.json();
            setResults(data.results || []);
            setInterpretedFilters(data.interpretedFilters || {});
            setMessage(data.message || '');
            setNotice(data.notice || '');
        } catch (err) {
            setError('Failed to reach the search service. Please try again.');
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSearch();
    };

    const formatFilters = (filters) => {
        if (!filters || Object.keys(filters).length === 0) return null;

        const parts = [];

        if (filters.beds !== undefined) parts.push(`${filters.beds}+ bed`);
        if (filters.baths !== undefined) parts.push(`${filters.baths}+ bath`);

        let sentence = parts.length > 0 ? parts.join(', ') + ' homes' : 'Homes';

        if (filters.city) {
            sentence += ` in ${formatCity(filters.city)}`;
        }
        if (filters.zipcode) {
            sentence += ` (${filters.zipcode})`;
        }

        if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
            sentence += `, $${filters.minPrice.toLocaleString()}-$${filters.maxPrice.toLocaleString()}`;
        } else if (filters.maxPrice !== undefined) {
            sentence += ` under $${filters.maxPrice.toLocaleString()}`;
        } else if (filters.minPrice !== undefined) {
            sentence += ` over $${filters.minPrice.toLocaleString()}`;
        }

        if (filters.minYearBuilt !== undefined && filters.maxYearBuilt !== undefined) {
            sentence += `, built ${filters.minYearBuilt}-${filters.maxYearBuilt}`;
        } else if (filters.minYearBuilt !== undefined) {
            sentence += `, built after ${filters.minYearBuilt}`;
        } else if (filters.maxYearBuilt !== undefined) {
            sentence += `, built before ${filters.maxYearBuilt}`;
        }

        return sentence;
    };

    return (
        <div className="natural-search-page">
            <Link to="/" className="btn-back">Back to Listings</Link>

            <h1>Search by Description</h1>
            <p>Try something like "3 bed 2 bath house in Sacramento under $500k built after 2000"</p>

            <div className="natural-search-bar">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe the property you're looking for..."
                />
                <button onClick={handleSearch} disabled={loading}>
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </div>

            {error && <p className="search-error">{error}</p>}

            {notice && <p className="search-notice">{notice}</p>}

            {interpretedFilters && formatFilters(interpretedFilters) && (
                <p className="interpreted-filters">
                    Searching: {formatFilters(interpretedFilters)}
                </p>
            )}

            {message && <p className="search-message">{message}</p>}

            {!loading && results.length > 0 && (
                <div className="property-grid">
                    {results.map((property) => (
                        <PropertyCard key={property.L_ListingID} property={property} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default NaturalSearchPage;