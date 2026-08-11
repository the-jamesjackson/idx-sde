import { useState } from 'react';
import './PropertyImageGallery.css';

function PropertyImageGallery({ photos, address }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  let photoList = [];
  try {
    photoList = photos ? JSON.parse(photos) : [];
  } catch {
    photoList = photos ? [photos] : [];
  }

  if (photoList.length === 0) {
    return <div className="gallery-no-image">No photos available</div>;
  }

  const openLightbox = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => setLightboxOpen(false);

  const lightboxPrev = (e) => {
    e.stopPropagation();
    setLightboxIndex((i) => (i === 0 ? photoList.length - 1 : i - 1));
  };

  const lightboxNext = (e) => {
    e.stopPropagation();
    setLightboxIndex((i) => (i === photoList.length - 1 ? 0 : i + 1));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i === 0 ? photoList.length - 1 : i - 1));
    if (e.key === 'ArrowRight') setLightboxIndex((i) => (i === photoList.length - 1 ? 0 : i + 1));
  };

  return (
    <>
      {/* Main large image */}
      <div className="gallery-main" onClick={() => openLightbox(activeIndex)}>
        <img
          src={photoList[activeIndex]}
          alt={`${address} - main`}
          className="gallery-main-img"
        />
        <div className="gallery-photo-count">
          {photoList.length} photos — click to view
        </div>
      </div>

      {/* Thumbnail strip */}
      {photoList.length > 1 && (
        <div className="gallery-thumbs">
          {photoList.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`${address} thumbnail ${i + 1}`}
              className={`gallery-thumb${i === activeIndex ? ' active' : ''}`}
              onClick={() => setActiveIndex(i)}
            />
          ))}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxOpen && (
        <div
          className="lightbox-overlay"
          onClick={closeLightbox}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="dialog"
          aria-label="Photo lightbox"
        >
          <button className="lightbox-close" onClick={closeLightbox}>&#x2715;</button>
          <button className="lightbox-btn lightbox-prev" onClick={lightboxPrev}>&#8249;</button>
          <img
            src={photoList[lightboxIndex]}
            alt={`${address} photo ${lightboxIndex + 1}`}
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <button className="lightbox-btn lightbox-next" onClick={lightboxNext}>&#8250;</button>
          <div className="lightbox-counter">
            {lightboxIndex + 1} / {photoList.length}
          </div>
        </div>
      )}
    </>
  );
}

export default PropertyImageGallery;