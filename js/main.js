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

import { isLoggedIn, getCurrentUser, logout, redirectToLoginPage } from './api.js?v=20260731q';
import { CONFIG } from './config.js?v=20260731q';
import { deleteSsoCookie } from './ssocookie.js?v=20260731q';
import { initLoginForm } from './login.js?v=20260731q';
import { initDashboard } from './dashboard.js?v=20260731q';
// PATCH (FIX BUG KRITIS): js/absensi.js sebelumnya tidak pernah di-import sama
// sekali (sempat terhapus dari repo, lihat catatan di js/absensi.js), sehingga
// panel Input Absensi, Riwayat, Rekap, dan Wali tidak pernah terhubung ke apa
// pun -- termasuk navigasi tab-nya sendiri. Modul ini sekarang dipulihkan dan
// diinisialisasi di sini, sejajar dengan initDashboard().
import { initAbsensi } from './absensi.js?v=20260731q';
import { initProfil } from './profil.js?v=20260731q';
import { initAdmin } from './admin.js?v=20260731q';
import { showNotification } from './utils.js?v=20260731q';
import { showAlert, showConfirm } from './modal.js?v=20260731q';
import { initModalHandlers } from './modal.js?v=20260731q';
// PATCH: nama file diselaraskan ke huruf kecil semua (ketuakelas.js, bukan
// ketuaKelas.js) -- GitHub Pages adalah server berbasis Linux yang
// case-sensitive, sedangkan proses upload sebelumnya menyimpan file ini
// dengan huruf kecil semua. Import di sini disamakan supaya cocok persis
// dengan nama file yang sesungguhnya ada di repo, mencegah error 404.
import { initKetuaKelasPage } from './ketuakelas.js?v=20260731q';

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
const VERSI_TEMPLATE = '20260731p';

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
// PATCH v2 (visual dropdown): label peran singkat untuk header dropdown
// akun -- prioritas: Wali Kelas (paling spesifik/personal) -> Super
// Admin/Admin -> Kepala Sekolah -> fallback "Guru Mapel". Akun multi-role
// bisa dapat lebih dari 1 label sekaligus (dipisah "·"), mis. wakasek
// yang juga wali kelas: "Wali Kelas XI DKV 1 · Admin".
function buatLabelPeran(user) {
    const bagian = [];
    const roleList = (user && user.roleList) || [];
    if (user && user.kelasWali) bagian.push('Wali Kelas ' + user.kelasWali);
    if (roleList.indexOf('superadmin') !== -1) bagian.push('Super Admin');
    else if (roleList.indexOf('admin') !== -1) bagian.push('Admin');
    if (roleList.indexOf('kepsek') !== -1) bagian.push('Kepala Sekolah');
    if (bagian.length === 0) bagian.push('Guru Mapel');
    return bagian.join(' · ');
}

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

            // PATCH v2 (visual dropdown): isi header identitas di dalam
            // dropdown akun (nama + label peran) -- lihat buatLabelPeran()
            // di bawah dan #avatarDropdownNama/#avatarDropdownPeran di
            // templates/dashboard.html.
            const dropdownNamaEl = document.getElementById('avatarDropdownNama');
            if (dropdownNamaEl) dropdownNamaEl.textContent = currentUser.nama;
            const dropdownPeranEl = document.getElementById('avatarDropdownPeran');
            if (dropdownPeranEl) dropdownPeranEl.textContent = buatLabelPeran(currentUser);
        }

        // PATCH TAHAP 2 (sistem peran): akun yang TIDAK punya role "guru"
        // sama sekali (murni kepsek/admin, tidak mengajar apa pun) tidak
        // perlu lihat tab Input/Riwayat/Rekap -- itu semua soal mengisi &
        // melihat riwayat absen sebagai guru, tidak relevan untuk peran
        // read-only seperti Kepsek. Tab Dashboard & Profil tetap ada untuk
        // semua orang.
        const roleListUser = (currentUser && currentUser.roleList) || ['guru'];
        const punyaRoleGuru = roleListUser.indexOf('guru') !== -1;
        if (!punyaRoleGuru) {
            ['panelAbsensi', 'panelRiwayat', 'panelRekap'].forEach(tabId => {
                document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.classList.add('hidden');
            });
        }

        initDashboard();
        // PATCH: inisialisasi panel Input/Riwayat/Rekap/Wali (lihat js/absensi.js)
        initAbsensi();
        // PATCH: inisialisasi panel Profil (nama, password, foto profil)
        initProfil(currentUser);
        // PATCH TAHAP 3: inisialisasi Panel Admin (kelola akun guru) --
        // fungsi ini sendiri yang menentukan apakah tab-nya perlu
        // ditampilkan atau tidak berdasarkan roleList akun ini.
        initAdmin(currentUser);
        // PATCH TATA ULANG NAVIGASI: buka/tutup menu dropdown avatar
        // (Profil/Admin/Keluar) -- lihat setupAvatarDropdown() di bawah.
        setupAvatarDropdown();
    }
}

/**
 * PATCH TATA ULANG NAVIGASI: buka/tutup menu dropdown avatar. Item di
 * dalamnya (Profil/Admin/Keluar) SUDAH otomatis berfungsi lewat
 * mekanisme klik-tab & event delegation logout yang ada -- fungsi ini
 * CUMA menangani buka/tutup kotak dropdown-nya, bukan aksi di
 * dalamnya.
 */
function setupAvatarDropdown() {
    // PATCH v2: id trigger klik sekarang "headerTriggerBtn" (bungkus
    // seluruh kartu "Selamat Datang"), BUKAN lagi "headerAvatar" -- id itu
    // sekarang cuma lingkaran foto kecil di dalamnya (dipakai js/profil.js
    // untuk mengganti foto profil, tidak boleh dipakai sebagai trigger
    // klik lagi karena innerHTML-nya bisa ditimpa foto).
    const avatarBtn = document.getElementById('headerTriggerBtn');
    // PATCH v3: pemicu KEDUA khusus desktop (ikon pojok kanan atas) --
    // di breakpoint desktop, avatarBtn di atas otomatis tidak bisa diklik
    // lagi (pointer-events:none lewat CSS), jadi tombol inilah yang
    // benar-benar aktif di sana. Keduanya sengaja dibuat SELALU terwire
    // di JS (tidak perlu deteksi lebar layar di sini) -- CSS yang
    // menentukan mana yang kelihatan & bisa diklik per breakpoint.
    const desktopBtn = document.getElementById('headerMenuBtnDesktop');
    const dropdown = document.getElementById('avatarDropdownMenu');
    // PATCH: overlay di belakang dropdown -- lihat penjelasan lengkap di
    // templates/dashboard.html #avatarDropdownOverlay. Ditoggle bersamaan
    // dengan dropdown-nya di bukaDropdown()/tutupDropdown() di bawah
    // (otomatis tidak kelihatan di desktop lewat CSS, meski class hidden
    // ini tetap ditoggle sama seperti biasa).
    const overlay = document.getElementById('avatarDropdownOverlay');
    if (!dropdown || (!avatarBtn && !desktopBtn)) return;

    // PATCH: posisikan dropdown TEPAT di bawah ikon pemicu desktop --
    // sebelumnya pakai posisi tetap (top/right fixed relatif ke tepi
    // layar lewat CSS), yang ternyata bisa jauh dari ikon aslinya kalau
    // kartu header tidak selebar layar penuh (ada .container dengan
    // max-width). Sekarang dihitung dari posisi NYATA ikon-nya
    // (getBoundingClientRect()) setiap kali dropdown dibuka, supaya
    // selalu menempel pas di bawahnya -- di mana pun ikon itu berada.
    function posisikanDropdownDesktop() {
        if (!desktopBtn || window.innerWidth < 640) {
            // Mobile (bottom sheet): biarkan CSS yang atur posisinya.
            // Bersihkan sisa inline style dari sesi desktop sebelumnya
            // (mis. kalau jendela di-resize tanpa reload halaman).
            dropdown.style.top = '';
            dropdown.style.right = '';
            dropdown.style.left = '';
            return;
        }
        const rect = desktopBtn.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 8) + 'px';
        dropdown.style.left = 'auto';
        dropdown.style.right = (window.innerWidth - rect.right) + 'px';
    }

    function tutupDropdown() {
        dropdown.classList.add('hidden');
        overlay?.classList.add('hidden');
        avatarBtn?.setAttribute('aria-expanded', 'false');
        desktopBtn?.setAttribute('aria-expanded', 'false');
    }
    function bukaDropdown() {
        posisikanDropdownDesktop();
        dropdown.classList.remove('hidden');
        overlay?.classList.remove('hidden');
        avatarBtn?.setAttribute('aria-expanded', 'true');
        desktopBtn?.setAttribute('aria-expanded', 'true');
    }
    function toggleDropdown(e) {
        e.stopPropagation(); // jangan sampai langsung ketangkap listener "klik di luar" di bawah
        const sedangTerbuka = !dropdown.classList.contains('hidden');
        if (sedangTerbuka) tutupDropdown(); else bukaDropdown();
    }

    avatarBtn?.addEventListener('click', toggleDropdown);
    desktopBtn?.addEventListener('click', toggleDropdown);

    // Klik item di dalam dropdown (Profil/Admin/Keluar) -- tutup dropdown
    // setelah dipilih, biar tidak menggantung terbuka begitu pindah panel.
    dropdown.querySelectorAll('.avatar-dropdown-item').forEach(item => {
        item.addEventListener('click', () => tutupDropdown());
    });

    // Klik di mana saja pada overlay -- tutup dropdown (cara paling
    // eksplisit, karena sekarang overlay menutupi seluruh layar). Cuma
    // relevan di mobile (bottom sheet) -- di desktop overlay-nya memang
    // tidak dirender (display:none lewat CSS), jadi listener ini otomatis
    // tidak pernah terpicu di sana.
    overlay?.addEventListener('click', () => tutupDropdown());

    // Klik di luar area dropdown & kedua tombol pemicu -- tutup juga
    // (jaring pengaman tambahan, mis. kalau ada yang berhasil klik tembus
    // overlay lewat cara lain, atau di desktop yang memang tidak ada
    // overlay-nya sama sekali).
    document.addEventListener('click', (e) => {
        if (dropdown.classList.contains('hidden')) return;
        if (!dropdown.contains(e.target) && e.target !== avatarBtn && e.target !== desktopBtn) tutupDropdown();
    });

    // Kalau jendela di-resize SAAT dropdown sedang terbuka (mis. ubah
    // ukuran browser desktop), posisi ikon bisa berubah -- sesuaikan
    // ulang supaya dropdown tidak "ketinggalan" di posisi lama.
    window.addEventListener('resize', () => {
        if (!dropdown.classList.contains('hidden')) posisikanDropdownDesktop();
    });
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
    // PATCH TAHAP 1 (sistem peran): `roleList` ditambahkan ke bentuk data
    // akun (lihat Roles.gs/Auth.gs). Sesi lama yang tersimpan di browser
    // SEBELUM patch ini tidak akan punya field ini -- ikut ditandai basi
    // di sini supaya otomatis dipaksa login ulang begitu fitur berbasis
    // role mulai dipakai di frontend (Tahap 2/3), bukan diam-diam jalan
    // dengan roleList undefined.
    // PATCH (pasangan mapel-kelas): sama alasannya -- `pasanganMapelKelas`
    // BOLEH bernilai `null` (memang berarti "tidak ada pengecualian"),
    // jadi yang dicek di sini adalah KEBERADAAN key-nya (pakai `in`),
    // bukan nilainya -- sesi lama sebelum patch ini sama sekali tidak
    // punya key tersebut di objek user.
    return !('mapelList' in user) || !('kelasList' in user) || !('roleList' in user) || !('pasanganMapelKelas' in user);
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

// PATCH PWA (uji coba, toggle CONFIG.PWA_AKTIF di js/config.js): kalau
// aktif, suntikkan <link rel="manifest"> (TIDAK ditulis statis di
// index.html, supaya benar-benar tidak ada jejak PWA sama sekali kalau
// togglenya mati) dan daftarkan Service Worker (sw.js). Dipanggil sekali
// di awal, TIDAK tergantung status login -- kemampuan "instal aplikasi"
// harus tersedia bahkan di halaman login sekalipun.
function setupPwaJikaAktif() {
    if (!CONFIG.PWA_AKTIF) return;

    if (!document.querySelector('link[rel="manifest"]')) {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = 'manifest.json';
        document.head.appendChild(link);
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch((err) => {
            console.error('Gagal mendaftarkan Service Worker:', err);
        });
    }
}

// Inisialisasi aplikasi
document.addEventListener('DOMContentLoaded', () => {
    console.log('Aplikasi Absensi Sekolah dimuat');

    // Inisialisasi modal handlers
    initModalHandlers();

    setupPwaJikaAktif();

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
