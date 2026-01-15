// Client-side helpers (no Firestore). Keep for potential future utilities.
export function showLoading(element) {
    if (!element) return;
    element.textContent = 'Loading...';
    element.style.opacity = '0.8';
}

export function hideLoading(element) {
    if (!element) return;
    element.style.opacity = '1';
}