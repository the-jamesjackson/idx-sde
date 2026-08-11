// src/pages/PropertyDetailPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchPropertyDetail, fetchOpenHouses } from '../api/client';
import PropertyImageGallery from '../components/PropertyImageGallery';
import PropertyMap from '../components/PropertyMap';
import './PropertyDetailPage.css';

function formatEnumLabel(value) {
    if (!value) return value;
    return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function PropertyDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [property, setProperty] = useState(null);
    const [openHouses, setOpenHouses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadPropertyData();
    }, [id]);

    async function loadPropertyData() {
        try {
            setLoading(true);
            setError(null);
            const [propertyData, openHousesData] = await Promise.all([
                fetchPropertyDetail(id),
                fetchOpenHouses(id)
            ]);
            setProperty(propertyData);
            setOpenHouses(openHousesData.openhouses || []);
        } catch (err) {
            setError(err.message || 'Failed to load property details');
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return <div className="loading">Loading property details...</div>;
    }

    if (error) {
        return (
            <div className="error-container">
                <div className="error">{error}</div>
                <button onClick={() => navigate('/')} className="btn-back">
                    Back to Listings
                </button>
            </div>
        );
    }

    if (!property) {
        return null;
    }

    return (
        <div className="property-detail-page">
            <button onClick={() => navigate('/')} className="btn-back">
                Back to Listings
            </button>

            <div className="property-header">
                <h1>${property.L_SystemPrice?.toLocaleString()}</h1>
                <p className="property-address">{property.L_Address}</p>
                <p className="property-location">
                    {property.L_City}, {property.L_State} {property.L_Zip}
                </p>
            </div>

            <div className="property-image-main">
                <PropertyImageGallery photos={property.L_Photos} address={property.L_Address} />
            </div>

            <div className="property-content">
                <div className="property-main">
                    <div className="property-stats">
                        <div className="stat">
                            <div className="stat-value">{property.L_Keyword2}</div>
                            <div className="stat-label">Bedrooms</div>
                        </div>
                        <div className="stat">
                            <div className="stat-value">{property.LM_Dec_3}</div>
                            <div className="stat-label">Bathrooms</div>
                        </div>
                        {property.LM_Int2_3 && (
                            <div className="stat">
                                <div className="stat-value">{property.LM_Int2_3.toLocaleString()}</div>
                                <div className="stat-label">Sq Ft</div>
                            </div>
                        )}
                        {property.YearBuilt && (
                            <div className="stat">
                                <div className="stat-value">{property.YearBuilt}</div>
                                <div className="stat-label">Year Built</div>
                            </div>
                        )}
                    </div>

                    <div className="property-section">
                        <h2>Property Details</h2>
                        <div className="detail-grid">
                            {property.L_Type_ && (
                                <div className="detail-item">
                                    <span className="detail-label">Property Type:</span>
                                    <span className="detail-value">{formatEnumLabel(property.L_Type_)}</span>
                                </div>
                            )}
                            {property.PropertySubTypeAdditional && (
                                <div className="detail-item">
                                    <span className="detail-label">Property Subtype:</span>
                                    <span className="detail-value">{formatEnumLabel(property.PropertySubTypeAdditional)}</span>
                                </div>
                            )}
                            {property.LotSizeAcres && (
                                <div className="detail-item">
                                    <span className="detail-label">Lot Size:</span>
                                    <span className="detail-value">{property.LotSizeAcres} acres</span>
                                </div>
                            )}
                            {property.OpenParkingSpaces && (
                                <div className="detail-item">
                                    <span className="detail-label">Parking Spaces:</span>
                                    <span className="detail-value">{property.OpenParkingSpaces}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {property.L_Remarks && (
                        <div className="property-section">
                            <h2>Description</h2>
                            <p className="property-description">{property.L_Remarks}</p>
                        </div>
                    )}

                    {property.LMD_MP_Latitude && property.LMD_MP_Longitude && (
                        <div className="property-section">
                            <h2>Location</h2>
                            <PropertyMap
                                lat={property.LMD_MP_Latitude}
                                lng={property.LMD_MP_Longitude}
                                address={property.L_Address}
                                apiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
                            />
                        </div>
                    )}
                </div>

                <div className="property-sidebar">
                    <div className="open-houses-section">
                        <h3>Open Houses</h3>
                        {openHouses.length > 0 ? (
                            <div className="open-houses-list">
                                {openHouses.map((oh, index) => (
                                    <div key={index} className="open-house-item">
                                        <div className="oh-date">
                                            {new Date(oh.OpenHouseDate).toLocaleDateString('en-US', {
                                                weekday: 'long',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </div>
                                        <div className="oh-time">
                                            {oh.OH_StartTime} - {oh.OH_EndTime}
                                        </div>
                                        {(() => {
                                            try {
                                                const d = JSON.parse(oh.all_data);
                                                return d?.OpenHouseRemarks ? (
                                                    <div className="oh-remarks">{d.OpenHouseRemarks}</div>
                                                ) : null;
                                            } catch (e) {
                                                return null;
                                            }
                                        })()}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="no-open-houses">No open houses scheduled</p>
                        )}
                    </div>

                    <div className="listing-info-section">
                        <h3>Listing Information</h3>
                        <div className="listing-info">
                            {property.L_ListingID && (
                                <div className="info-item">
                                    <span className="info-label">MLS #:</span>
                                    <span className="info-value">{property.L_ListingID}</span>
                                </div>
                            )}
                            {property.StandardStatus && (
                                <div className="info-item">
                                    <span className="info-label">Status:</span>
                                    <span className="info-value">{formatEnumLabel(property.StandardStatus)}</span>
                                </div>
                            )}
                            {property.ListingContractDate && (
                                <div className="info-item">
                                    <span className="info-label">Listed:</span>
                                    <span className="info-value">
                                        {new Date(property.ListingContractDate).toLocaleDateString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PropertyDetailPage;