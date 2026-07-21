import React from 'react';

function PropertyImageCarousel({ photos, address }) {
  // Placeholder
  let photoArray = [];
  try {
    const parsed = JSON.parse(photos);
    if (Array.isArray(parsed)) {
      photoArray = parsed;
    }
  } catch (err) {
    photoArray = []; 
  }

  if (photoArray.length === 0) {
    return <div className="no-image">No image available</div>;
  }

  return <img src={photoArray[0]} alt={address || 'Property'} />;
}

export default PropertyImageCarousel;