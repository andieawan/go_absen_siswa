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
    // PATCH SSO (revisi ke-2): setiap aplikasi ternyata pakai SUBDOMAIN
    // sendiri-sendiri (mis. absensi-siswa.smkibupakusari.sch.id vs
    // nilai-siswa.smkibupakusari.sch.id) di bawah 1 domain induk yang
    // sama, BUKAN 1 origin yang sama persis -- jadi localStorage (yang
    // di-scope per origin) tidak bisa dipakai untuk SSO di sini. Sesi
    // sekarang disimpan lewat COOKIE dengan atribut Domain yang di-set
    // ke domain induk (lihat js/ssoCookie.js) -- cookie memang satu-
    // satunya storage browser yang didesain bisa dibagi antar subdomain.
    SESSION_KEY: 'sso_session',

    // PENTING: isi dengan domain INDUK sekolah Anda (diawali titik),
    // supaya cookie sesi berlaku untuk SEMUA subdomain aplikasi, bukan
    // cuma subdomain aplikasi ini. Contoh: kalau aplikasi ini di
    // "absensi-siswa.smkibupakusari.sch.id" dan aplikasi nilai nanti di
    // "nilai-siswa.smkibupakusari.sch.id", isi dengan
    // ".smkibupakusari.sch.id" (titik di depan = berlaku untuk semua
    // subdomain). HARUS SAMA PERSIS di semua aplikasi dalam ekosistem SSO.
    SSO_COOKIE_DOMAIN: '.smkibupakusari.sch.id',

    // Umur cookie sesi (detik). Disamakan dengan SESSION_DURATION_MS di
    // kodegs/Config.gs (12 jam) supaya tidak ada perbedaan durasi yang
    // membingungkan antara cookie di browser vs token di backend.
    SSO_COOKIE_MAX_AGE_SECONDS: 12 * 60 * 60,

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
