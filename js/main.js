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
 *
 * 3. FIX (BARU): RACE CONDITION DI TOMBOL LOGOUT.
 *    Sebelumnya window.handleLogout() memanggil logout() yang LANGSUNG
 *    menavigasi halaman (window.location.href = 'index.html') sebelum
 *    baris-baris berikutnya (renderLogin(), showAlert('Berhasil logout'))
 *    sempat dieksekusi -- alert "Berhasil logout" sering tidak sempat
 *    tampil sama sekali, tergantung timing browser.
 *    Perbaikan: js/api.js sekarang memisahkan logout() (hanya membersihkan
 *    sessionStorage/localStorage, TIDAK menavigasi) dari
 *    redirectToLoginPage() (navigasi eksplisit). Di sini, alert
 *    ditampilkan dan di-await SAMPAI SELESAI dulu, baru navigasi terjadi
 *    di akhir -- sehingga urutan eksekusi terjamin, bukan lagi bergantung
 *    pada timing reload browser.
 * =========================================================
 */

import { isLoggedIn, getCurrentUser, logout, redirectToLoginPage } from './api.js?v=20260726';
import { deleteSsoCookie } from './ssocookie.js?v=20260726';
import { initLoginForm } from './login.js?v=20260726';
import { initDashboard } from './dashboard.js?v=20260726';
// PATCH (FIX BUG KRITIS): js/absensi.js sebelumnya tidak pernah di-import sama
// sekali (sempat terhapus dari repo, lihat catatan di js/absensi.js), sehingga
// panel Input Absensi, Riwayat, Rekap, dan Wali tidak pernah terhubung ke apa
// pun -- termasuk navigasi tab-nya sendiri. Modul ini sekarang dipulihkan dan
// diinisialisasi di sini, sejajar dengan initDashboard().
import { initAbsensi } from './absensi.js?v=20260726';
import { showNotification } from './utils.js?v=20260726';
import { showAlert, showConfirm } from './modal.js?v=20260726';
import { initModalHandlers } from './modal.js?v=20260726';
// PATCH: nama file diselaraskan ke huruf kecil semua (ketuakelas.js, bukan
// ketuaKelas.js) -- GitHub Pages adalah server berbasis Linux yang
// case-sensitive, sedangkan proses upload sebelumnya menyimpan file ini
// dengan huruf kecil semua. Import di sini disamakan supaya cocok persis
// dengan nama file yang sesungguhnya ada di repo, mencegah error 404.
import { initKetuaKelasPage } from './ketuakelas.js?v=20260726';

// Container utama
const appContainer = document.getElementById('app');

// State aplikasi
let currentUser = null;

/**
 * Muat template HTML dari folder templates/
 * PATCH CACHE-BUSTING: sebelumnya fetch() ini TIDAK punya parameter versi
 * ATAU instruksi cache sama sekali -- beda dengan main.css/main.js yang
 * sudah pakai "?v=YYYYMMDD" di index.html. Karena templates/*.html diambil
 * lewat fetch() saat runtime (bukan <link>/<script> biasa), browser bebas
 * menyimpannya di cache HTTP tanpa ada cara untuk tahu isinya sudah
 * berubah -- ini kemungkinan besar PENYEBAB LANGSUNG kenapa perubahan di
 * templates/dashboard.html (mis. bagian "Distribusi Status Kehadiran")
 * kadang tidak muncul di browser walau kodenya sudah benar di GitHub.
 * Diperbaiki dengan 2 lapis: parameter versi di URL (VERSI_TEMPLATE di
 * bawah -- WAJIB dinaikkan tiap kali salah satu file templates/*.html
 * diubah) DAN `cache: 'no-cache'` supaya browser selalu tanya ulang ke
 * server (pakai ETag/Last-Modified kalau ada) alih-alih diam-diam pakai
 * versi lama tanpa konfirmasi sama sekali.
 */
const VERSI_TEMPLATE = '20260726';

async function loadTemplate(templateName) {
    try {
        const response = await fetch(`templates/${templateName}.html?v=${VERSI_TEMPLATE}`, { cache: 'no-cache' });
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
 * PATCH: Render halaman khusus Ketua Kelas (fitur sementara: delegasi
 * input absen harian). Halaman ini SENGAJA tidak melalui alur login/
 * dashboard biasa sama sekali -- diakses lewat link berisi token
 * (?ketua=TOKEN) yang dibagikan wali kelas, dan hanya berisi 1 form
 * sederhana tanpa navigasi ke bagian lain aplikasi.
 */
async function renderKetuaKelasPage(token) {
    // PATCH: nama template disamakan ke huruf kecil (ketuakelas.html,
    // bukan ketuaKelas.html) supaya cocok dengan file yang sesungguhnya
    // ada di repo GitHub Pages (case-sensitive).
    const template = await loadTemplate('ketuakelas');
    if (template) {
        appContainer.innerHTML = template;
        initKetuaKelasPage(token);
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
        // PATCH: inisialisasi panel Input/Riwayat/Rekap/Wali (lihat js/absensi.js)
        initAbsensi();
    }
}

// PATCH: helper untuk membersihkan sesi & kembali ke login,
// dipakai baik oleh guard sesi-lama maupun oleh logout normal.
// PATCH SSO (revisi): sesi sekarang disimpan lewat cookie ber-Domain
// induk (js/ssoCookie.js), bukan lagi localStorage -- lihat catatan di
// deleteSsoCookie() soal kenapa atribut Domain/Path harus sama persis.
function clearSessionAndGoToLogin() {
    deleteSsoCookie();
    currentUser = null;
}

/**
 * PATCH: Cek apakah data user yang tersimpan masih format LAMA
 * (sebelum patch mapelList/kelasList di Auth.gs). Data lama tidak
 * punya field mapelList/kelasList sama sekali (bukan cuma array
 * kosong), jadi ini aman dibedakan dari akun yang memang belum
 * ditugaskan mapel/kelas apa pun oleh admin (misal akun wali kelas
 * murni yang tidak mengajar mata pelajaran apa pun -- itu kondisi
 * VALID, bukan sesi basi, dan sudah ditangani terpisah di
 * js/dashboard.js, bukan di sini).
 */
function isStaleSessionData(user) {
    if (!user) return false;
    return !('mapelList' in user) || !('kelasList' in user);
}

/**
 * Routing berdasarkan status autentikasi
 */
async function route() {
    // PATCH: link ketua kelas (?ketua=TOKEN) dicek PALING AWAL, sebelum
    // logika login/dashboard biasa apa pun -- ini entry point publik yang
    // sepenuhnya terpisah dari status login guru, jadi tidak boleh
    // tersentuh oleh guard sesi lama atau redirect ke halaman login/dashboard.
    const urlParams = new URLSearchParams(window.location.search);
    const ketuaToken = urlParams.get('ketua');
    if (ketuaToken) {
        await renderKetuaKelasPage(ketuaToken);
        return;
    }

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

// PATCH: handleLogout sekarang menjamin urutan eksekusi yang benar --
// alert ditampilkan dan ditunggu SAMPAI SELESAI sebelum navigasi terjadi,
// karena logout() (api.js) TIDAK LAGI menavigasi halaman sendiri.
// PATCH UX: sebelumnya setelah konfirmasi logout, masih ada 1 langkah
// lagi yang WAJIB diklik user (showAlert "Berhasil logout" adalah modal
// yang menunggu user menutupnya) sebelum benar-benar dialihkan ke
// halaman login -- jadi total 2 klik (konfirmasi + tutup alert) untuk
// 1 aksi logout, cukup mengganggu. Diganti showNotification() (toast
// yang hilang otomatis dalam 5 detik, TIDAK butuh diklik) supaya user
// cukup 1 kali konfirmasi, lalu langsung dialihkan.
window.handleLogout = async () => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin keluar?', 'Konfirmasi Logout');
    if (!confirmed) return;

    // 1. Bersihkan sesi (tidak menavigasi apa pun)
    await logout();
    currentUser = null;

    // 2. Tampilkan notifikasi ringan (toast, otomatis hilang) -- TIDAK
    // menunggu user menutupnya, beda dengan showAlert() sebelumnya.
    showNotification('Berhasil logout', 'success');

    // 3. Langsung navigasi, tanpa menunggu interaksi tambahan dari user.
    redirectToLoginPage();
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
    // Action lain seperti "downloadRekapKelasSaya" dan "downloadRekapAbsenWali"
    // ditangani oleh listener spesifik di js/absensi.js (dipasang saat
    // initAbsensi() dipanggil dari renderDashboard()).
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
