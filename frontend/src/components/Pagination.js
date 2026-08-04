import React from 'react';
import './Pagination.css';
function Pagination({ currentPage, totalPages, onPageChange }) {
    const canGoPrev = currentPage > 1;
    const canGoNext = currentPage < totalPages;

    const handlePrevious = () => {
        if (canGoPrev) {
            onPageChange(currentPage - 1);
        }
    };

    const handleNext = () => {
        if (canGoNext) {
            onPageChange(currentPage + 1);
        }
    };
    
    const getPageNumbers = () => {
        const pages = [];
        const maxPagesToShow = 7;

        if (totalPages <= maxPagesToShow) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            if (currentPage <= 4) {
                for (let i = 1; i <= 5; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 3) {
                pages.push(1);
                pages.push('...');
                for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                pages.push('...');
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            }
        }
        return pages;
    };

    if (totalPages <= 1) {
        return null; 
    }

    return (
        <div className="pagination">
            <button
                className="pagination-btn"
                onClick={handlePrevious}
                disabled={!canGoPrev}
            >
                Previous
            </button>

            <div className="pagination-numbers">
                {getPageNumbers().map((page, index) => (
                    page === '...' ? (
                        <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
                    ) : (
                        <button
                            key={page}
                            className={`pagination-number ${page === currentPage ? 'active' : ''}`}
                            onClick={() => onPageChange(page)}
                        >
                            {page}
                        </button>
                    )
                ))}
            </div>
            
            <button
                className="pagination-btn"
                onClick={handleNext}
                disabled={!canGoNext}
            >
                Next
            </button>
        </div>
    );
}

export default Pagination;