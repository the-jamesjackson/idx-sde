import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import PropertyImageCarousel from './PropertyImageCarousel';
import { formatPrice, formatCity } from '../utils/formatting';
import './PropertyCard.css';

function PropertyCard({ property }) {
    const navigate = useNavigate();

    const handleClick = () => {
        navigate(`/property/${property.L_ListingID}`);
    };

    return (
        <div className="property-card" onClick={handleClick} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}>
            <div className="property-image">
                <PropertyImageCarousel photos={property.L_Photos} address={property.L_Address} />
            </div>

            <div className="property-info">
                <div className="price">{formatPrice(property.L_SystemPrice)}</div>
                <div className="address">{property.L_Address}</div>
                <div className="city">{formatCity(property.L_City)}, {property.L_State}</div>

                <div className="property-details">
                    <span>{property.L_Keyword2} beds</span>
                    <span>{property.LM_Dec_3} baths</span>
                    {property.LM_Int2_3 && (
                        <span>{property.LM_Int2_3.toLocaleString()} sqft</span>
                    )}
                </div>
            </div>
        </div>
    );
}

PropertyCard.propTypes = {
    property: PropTypes.shape({
        L_ListingID: PropTypes.string.isRequired,
        L_Address: PropTypes.string,
        L_City: PropTypes.string,
        L_State: PropTypes.string,
        L_SystemPrice: PropTypes.number,
        L_Keyword2: PropTypes.number,
        LM_Dec_3: PropTypes.string,
        LM_Int2_3: PropTypes.number,
        L_Photos: PropTypes.string,
    }).isRequired,
};

export default PropertyCard;