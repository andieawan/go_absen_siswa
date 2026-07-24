/**
 * Utility Functions
 * Fungsi-fungsi bantu untuk formatting, validasi, dan manipulasi data
 */

// Escape HTML untuk mencegah XSS
export function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, m => map[m]);
}

// Format tanggal ke YYYY-MM-DD
export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Format tanggal ke DD/MM/YYYY
export function formatDateIndo(date) {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

// Format waktu ke HH:MM
export function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Generate ID unik
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Debounce function untuk input search
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Validasi NIS -- format pemberian sekolah sendiri, BUKAN NISN resmi,
// jadi boleh mengandung "/" dan "." (contoh nyata: "10408/771.111"),
// bukan cuma angka murni. Selaras dengan validateInput(nis,'nis') di
// kodegs/Utils.gs.
export function validateNis(nis) {
    return /^[A-Za-z0-9./-]{3,30}$/.test(String(nis).trim());
}

// Capitalize string
export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Status badge mapping
export function getStatusBadge(status) {
    const map = {
        'H': { class: 'badge-success', text: 'Hadir' },
        'I': { class: 'badge-warning', text: 'Izin' },
        'S': { class: 'badge-info', text: 'Sakit' },
        'A': { class: 'badge-danger', text: 'Alpha' }
    };
    return map[status] || { class: 'badge-secondary', text: status };
}

// Show loading state
export function showLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.disabled = true;
        const originalText = el.dataset.originalText || el.innerText;
        if (!el.dataset.originalText) {
            el.dataset.originalText = originalText;
        }
        el.innerHTML = '<span class="spinner"></span> Memproses...';
    }
}

// Hide loading state
export function hideLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.disabled = false;
        if (el.dataset.originalText) {
            el.innerText = el.dataset.originalText;
        }
    }
}

// =========================================================
// PATCH UX: Overlay loading GLOBAL di tengah layar
// ---------------------------------------------------------
// Dipakai di setiap operasi async yang menghubungi server (login, muat
// daftar siswa, submit absensi, muat dashboard/riwayat, unduh rekap, dll)
// supaya pengguna SELALU sadar ada proses berjalan, tidak seperti indikator
// teks kecil di atas tabel yang mudah terlewat kalau halaman sudah di-scroll.
// Pakai counter (bukan boolean) supaya kalau ada beberapa pemanggilan
// bertumpuk (mis. dua fetch paralel lewat Promise.all yang masing-masing
// show/hide loading sendiri), overlay baru benar-benar disembunyikan
// setelah SEMUA proses yang sedang berjalan selesai, bukan begitu salah
// satu di antaranya selesai duluan.
// =========================================================
let globalLoadingCounter = 0;

export function showGlobalLoading(message = 'Memproses...') {
    globalLoadingCounter++;
    const overlay = document.getElementById('globalLoadingOverlay');
    const textEl = document.getElementById('globalLoadingText');
    if (textEl) textEl.textContent = message;
    if (overlay) overlay.classList.remove('hidden');
}

export function hideGlobalLoading() {
    globalLoadingCounter = Math.max(0, globalLoadingCounter - 1);
    if (globalLoadingCounter > 0) return; // masih ada proses lain yang berjalan
    const overlay = document.getElementById('globalLoadingOverlay');
    if (overlay) overlay.classList.add('hidden');
}

// Show notification/toast
export function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container') || createNotificationContainer();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${escapeHtml(message)}</span>
        <button class="close-btn" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
}

export default {
    escapeHtml,
    formatDate,
    formatDateIndo,
    formatTime,
    generateId,
    debounce,
    validateNis,
    capitalize,
    getStatusBadge,
    showLoading,
    hideLoading,
    showGlobalLoading,
    hideGlobalLoading,
    showNotification
};
