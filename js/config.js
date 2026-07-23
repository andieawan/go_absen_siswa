/**
 * Konfigurasi Global Aplikasi
 * Ganti URL_BACKEND dengan URL Web App Anda dari Google Apps Script
 */
export const CONFIG = {
    // URL Web App Google Apps Script (Ganti setelah deploy)
    BACKEND_URL: 'https://script.google.com/macros/s/AKfycbx.../exec', 
    
    // Konfigurasi lainnya
    APP_NAME: 'Sistem Absensi Sekolah',
    SESSION_KEY: 'auth_token',
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
