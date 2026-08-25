export function formatPrice(price) {
    if (price === null || price === undefined || isNaN(price)) return 'N/A';
    return `$${price.toLocaleString()}`;
}

export function formatCity(city) {
    if (!city) return '';
    return city.replace(/\b\w/g, c => c.toUpperCase());
}
