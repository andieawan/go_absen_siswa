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
