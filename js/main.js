/**
 * Main Entry Point
 * Menginisialisasi aplikasi berdasarkan halaman yang aktif
 */

import { initAuth } from './auth.js';
import { initLoginForm } from './login.js';
import { initDashboard } from './dashboard.js';
import { initAbsensiForm } from './absensi.js';

// Deteksi halaman yang sedang aktif
const currentPage = window.location.pathname.split('/').pop() || 'index.html';

// Inisialisasi auth untuk semua halaman
initAuth();

// Inisialisasi modul berdasarkan halaman
document.addEventListener('DOMContentLoaded', () => {
    console.log('Aplikasi dimuat:', currentPage);
    
    switch (true) {
        // Halaman Login
        case currentPage.includes('index.html') || currentPage === '':
            initLoginForm();
            break;
        
        // Halaman Dashboard
        case currentPage.includes('dashboard.html'):
            initDashboard();
            break;
        
        // Halaman Absensi
        case currentPage.includes('absensi.html'):
            initAbsensiForm();
            break;
        
        // Halaman lain dapat ditambahkan di sini
        
        default:
            console.log('Tidak ada modul khusus untuk halaman ini');
    }
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.message, event.filename, event.lineno);
    // Bisa ditambahkan logging ke backend atau service monitoring
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});
