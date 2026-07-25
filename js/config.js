/**
 * Konfigurasi Global Aplikasi
 * Ganti URL_BACKEND dengan URL Web App Anda dari Google Apps Script
 */
export const CONFIG = {
    // URL Web App Google Apps Script (Ganti setelah deploy)
    // PERBAIKAN: Spasi di akhir URL telah dihapus
    BACKEND_URL: 'https://script.google.com/macros/s/AKfycbyMGAl2rTMzOEVkosA-QKNrVvo69x3WZPrYgRBRcVF9JL-K1guOv-zJAWnisfCZ1t8n/exec', 
    
    // Konfigurasi lainnya
    APP_NAME: 'Sistem Absensi Sekolah',
    // PATCH SSO: sebelumnya sesi login (token) disimpan terpisah dari
    // profil user ('auth_token' di sessionStorage + 'user_data' di
    // localStorage), dan sessionStorage TIDAK terbagi antar tab/kunjungan
    // baru meski origin-nya sama -- jadi tidak bisa dipakai untuk SSO
    // lintas aplikasi. Sekarang digabung jadi SATU key di localStorage
    // (localStorage terbagi ke semua tab/halaman dalam origin yang sama,
    // mis. semua aplikasi di andieawan.github.io/*).
    // PENTING UNTUK SSO: kalau Anda punya aplikasi lain (nilai, dst) di
    // origin GitHub Pages yang sama, SEMUA aplikasi itu HARUS pakai nama
    // key localStorage yang SAMA PERSIS ('sso_session') supaya begitu
    // pengguna login di salah satu aplikasi, aplikasi lain langsung
    // menganggapnya sudah login juga (tanpa login ulang).
    SESSION_KEY: 'sso_session',
    DEFAULT_TIMEOUT: 30000, // 30 detik
    
    // Status Absensi
    STATUS_ABSEN: {
        HADIR: 'H',
        IZIN: 'I',
        SAKIT: 'S',
        ALPHA: 'A'
    }
};

export default CONFIG;
