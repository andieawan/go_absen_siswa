/**
 * Main Entry Point
 * Menginisialisasi aplikasi dengan routing sederhana
 * Memuat template HTML secara dinamis berdasarkan state login
 *
 * =========================================================
 * PATCH NOTES
 * =========================================================
 * 1. FIX: Sesi lama (localStorage user_data dari SEBELUM patch
 *    mapelList/kelasList) sekarang terdeteksi otomatis di route().
 *    Sebelumnya, kalau user sudah "login" (ada sessionStorage token)
 *    dengan data format lama, aplikasi langsung renderDashboard()
 *    tanpa pernah mengecek ulang -> dashboard.js terus-menerus error
 *    "Tidak ada mata pelajaran atau kelas yang diajar" setiap kali
 *    halaman dimuat / tab diklik, dan user tidak bisa keluar dari
 *    kondisi ini lewat UI biasa.
 *    Sekarang: kalau field mapelList/kelasList tidak ada di data user
 *    yang tersimpan, dianggap sesi basi -> otomatis di-clear & diarahkan
 *    ke halaman login, dengan notifikasi yang jelas ke user.
 *
 * 2. FIX: Tombol Logout (elemen dengan data-action="logout" di header
 *    dashboard) sebelumnya TIDAK TERSAMBUNG ke fungsi apa pun --
 *    window.handleLogout() sudah didefinisikan tapi tidak pernah
 *    dipanggil oleh listener manapun. Ditambahkan event delegation
 *    global untuk [data-action="logout"].
 * =========================================================
 */

import { isLoggedIn, getCurrentUser, logout } from './api.js';
import { initLoginForm } from './login.js';
import { initDashboard } from './dashboard.js';
import { showNotification } from './utils.js';
import { showAlert, showConfirm } from './modal.js';
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

// PATCH: helper untuk membersihkan sesi & kembali ke login,
// dipakai baik oleh guard sesi-lama maupun oleh logout normal.
function clearSessionAndGoToLogin() {
    sessionStorage.clear();
    localStorage.clear();
    currentUser = null;
}

/**
 * PATCH: Cek apakah data user yang tersimpan masih format LAMA
 * (sebelum patch mapelList/kelasList di Auth.gs). Data lama tidak
 * punya field mapelList/kelasList sama sekali (bukan cuma array
 * kosong), jadi ini aman dibedakan dari akun yang memang belum
 * ditugaskan mapel/kelas apa pun oleh admin.
 */
function isStaleSessionData(user) {
    if (!user) return false;
    return !('mapelList' in user) || !('kelasList' in user);
}

/**
 * Routing berdasarkan status autentikasi
 */
async function route() {
    const isUserLoggedIn = isLoggedIn();
    const user = getCurrentUser();

    // PATCH: guard sesi lama -- cek SEBELUM merender dashboard sama sekali,
    // supaya tidak ada percobaan load dashboard yang pasti gagal berulang-ulang.
    if (isUserLoggedIn && user && isStaleSessionData(user)) {
        console.warn('Sesi lama terdeteksi (format data sebelum pembaruan sistem). Memaksa logout otomatis.');
        clearSessionAndGoToLogin();
        await renderLogin();
        showNotification('Sistem baru saja diperbarui. Silakan login ulang.', 'warning');
        return;
    }
    
    if (!isUserLoggedIn || !user) {
        currentUser = null;
        await renderLogin();
    } else {
        currentUser = user;
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

// =========================================================
// PATCH: Event delegation global untuk tombol data-action.
// Sebelumnya tombol <button data-action="logout"> di header dashboard
// TIDAK TERSAMBUNG ke window.handleLogout() -- diklik pun tidak terjadi
// apa-apa. Didaftarkan sekali di sini (bukan di dalam renderDashboard,
// supaya tidak terpasang berulang setiap kali dashboard di-render ulang).
// =========================================================
document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;

    if (action === 'logout') {
        window.handleLogout();
    }
    // Catatan: action lain seperti "quickBukaRekap" kemungkinan sudah
    // ditangani di js/absensi.js. Kalau tombol "Rekap" di header juga
    // belum berfungsi, beri tahu saya isi absensi.js supaya bisa
    // dipastikan tidak ada listener dobel.
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.message, event.filename, event.lineno);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});
