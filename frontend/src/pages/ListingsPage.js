import React, { useState, useEffect, useCallback } from 'react';
import { fetchProperties } from '../api/client';
import './ListingsPage.css';
import PropertyFilters from '../components/PropertyFilters';
import PropertyCard from '../components/PropertyCard';
import Pagination from '../components/Pagination';
import { Link } from 'react-router-dom';

function ListingsPage() {
    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [total, setTotal] = useState(0);
    const [filters, setFilters] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);

    const loadProperties = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const offset = (currentPage - 1) * itemsPerPage;
            const params = { ...filters, limit: itemsPerPage, offset };
            const data = await fetchProperties(params);

            setProperties(data.results);
            setTotal(data.total);
        } catch (err) {
            setError('Failed to load properties. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [filters, currentPage, itemsPerPage]);

    useEffect(() => {
        loadProperties();
    }, [loadProperties]);

    const handleSearch = (newFilters) => {
        setFilters(newFilters);
        setCurrentPage(1);
    };

    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
        window.scrollTo(0, 0);
    };

    const totalPages = Math.ceil(total / itemsPerPage);

    return (
        <div className="listings-page">
            <h1>Property Listings</h1>

            <PropertyFilters onSearch={handleSearch} />

            <Link to="/search/natural" className="natural-search-link">
                <span className="natural-search-title">Try natural language search</span>
                <span className="natural-search-subtitle">
                    Describe what you're looking for in plain English
                </span>
            </Link>

            <p className="results-summary">
                Showing {((currentPage - 1) * itemsPerPage) + 1}-
                {Math.min(currentPage * itemsPerPage, total)} of {total.toLocaleString()} properties
            </p>

            {loading && <div className="loading">Loading properties...</div>}

            {error && <div className="error">{error}</div>}

            {!loading && !error && (
                <>
                    {properties.length === 0 ? (
                        <div className="no-results">
                            No properties found matching your criteria. Try adjusting your filters.
                        </div>
                    ) : (
                        <div className="property-grid">
                            {properties.map(property => (
                                <PropertyCard key={property.L_ListingID} property={property} />
                            ))}
                        </div>
                    )}
                </>
            )}

            {!loading && !error && properties.length > 0 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                />
            )}
        </div>
    );
}

export default ListingsPage;