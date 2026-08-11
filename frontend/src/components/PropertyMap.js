import './PropertyMap.css';

function PropertyMap({ lat, lng, address, apiKey }) {
    if (!apiKey) {
        return (
            <div className="map-no-key">
                <p>Google Maps API key not configured.</p>
                <p>Add REACT_APP_GOOGLE_MAPS_API_KEY to your .env file.</p>
            </div>
        );
    }

    const src = `https://www.google.com/maps/embed/v1/place`
        + `?key=${apiKey}`
        + `&q=${lat},${lng}`
        + `&zoom=15`
        + `&maptype=roadmap`;

    return (
        <div className="property-map-wrapper">
            <iframe
                title={`Map of ${address}`}
                src={src}
                className="property-map-iframe"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
            />
            <a
                className="map-directions-link"
                href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                target="_blank"
                rel="noopener noreferrer"
            >
                Get Directions
            </a>
        </div>
    );
}
export default PropertyMap;