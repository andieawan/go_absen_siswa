/**
 * Main Entry Point
 * Menginisialisasi aplikasi dengan routing sederhana
 * Memuat template HTML secara dinamis berdasarkan state login
 */

import { checkAuth, logout } from './auth.js';
import { initLoginForm } from './login.js';
import { initDashboard } from './dashboard.js';
import { showNotification, showAlert, showConfirm } from './utils.js';
import { initModalHandlers } from './modal.js';

// Container utama
const appContainer = document.getElementById('app');

// State aplikasi
let currentUser = null;

/**
 * Muat template HTML dari folder templates/
 */
async function loadTemplate(templateName) {
    try {
        const response = await fetch(`templates/${templateName}.html`);
        if (!response.ok) throw new Error(`Gagal memuat template: ${templateName}`);
        return await response.text();
    } catch (error) {
        console.error('Error loading template:', error);
        showNotification('Gagal memuat halaman', 'error');
        return null;
    }
}

/**
 * Tampilkan notifikasi
 */
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * Render halaman Login
 */
async function renderLogin() {
    const template = await loadTemplate('login');
    if (template) {
        appContainer.innerHTML = template;
        initLoginForm();
    }
}

/**
 * Render halaman Dashboard
 */
async function renderDashboard() {
    const template = await loadTemplate('dashboard');
    if (template) {
        appContainer.innerHTML = template;
        
        // Set data user
        if (currentUser) {
            const greetingEl = document.getElementById('greeting');
            if (greetingEl) greetingEl.textContent = `Selamat Datang, ${currentUser.nama}!`;
            
            const headerDateEl = document.getElementById('headerDate');
            if (headerDateEl) {
                const now = new Date();
                const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                headerDateEl.textContent = now.toLocaleDateString('id-ID', options);
            }
        }
        
        initDashboard();
    }
}

/**
 * Routing berdasarkan status autentikasi
 */
async function route() {
    const authData = checkAuth();
    
    if (!authData || !authData.isLoggedIn) {
        currentUser = null;
        await renderLogin();
    } else {
        currentUser = authData.user;
        await renderDashboard();
    }
}

// Inisialisasi aplikasi
document.addEventListener('DOMContentLoaded', () => {
    console.log('Aplikasi Absensi Sekolah dimuat');
    
    // Inisialisasi modal handlers
    initModalHandlers();
    
    // Routing awal
    route();
});

// Handle navigasi logout
window.handleLogout = async () => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin keluar?', 'Konfirmasi Logout');
    if (confirmed) {
        await logout();
        currentUser = null;
        await renderLogin();
        await showAlert('Berhasil logout', 'Logout Berhasil', 'success');
    }
};

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.message, event.filename, event.lineno);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

// Export fungsi untuk digunakan modul lain
export { showNotification, handleLogout };
