function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Icon based on type
    let icon = '';
    switch(type) {
        case 'success': icon = '✓'; break;
        case 'error': icon = '✕'; break;
        case 'warning': icon = '⚠'; break;
        default: icon = 'ℹ';
    }
    
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';

    const iconEl = document.createElement('span');
    iconEl.style.fontWeight = 'bold';
    iconEl.style.fontSize = '16px';
    iconEl.textContent = icon;

    const msgEl = document.createElement('span');
    msgEl.textContent = message;

    row.append(iconEl, msgEl);
    toast.appendChild(row);

    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Make it global
window.showToast = showToast;
