/**
 * API Service
 * Menangani semua komunikasi dengan Google Apps Script Backend
 *
 * CATATAN PENTING: Semua request harus menyertakan username dan token
 * yang didapat dari login, sesuai dengan autentikasi di backend.
 *
 * =========================================================
 * PATCH NOTES (lihat PATCH_NOTES.md untuk detail lengkap)
 * =========================================================
 * 1. FIX BUG UTAMA "stuck di Memproses...":
 *    Content-Type diganti dari 'application/json' -> 'text/plain;charset=utf-8'
 *    untuk semua request POST. 'application/json' bukan simple content-type,
 *    sehingga browser wajib kirim preflight OPTIONS. Apps Script Web App
 *    tidak punya handler doOptions(), sehingga preflight gagal/hang dan
 *    fetch() menggantung sampai timeout. doPost() di backend sudah pakai
 *    JSON.parse(e.postData.contents) sehingga tidak masalah menerima
 *    text/plain berisi string JSON.
 *
 * 2. KEAMANAN: Semua endpoint yang butuh token (getStudents,
 *    getExistingAttendance, getRiwayatAbsensi, getDashboardData,
 *    getDashboardDataWali, getAbsenWaliExisting, getRiwayatAbsenWali)
 *    dipindah dari GET dengan query string -> POST dengan body JSON.
 *    Ini mencegah token bocor lewat browser history / server access log.
 *    (Perubahan ini WAJIB dibarengi patch kodegs/Router.gs yang saya
 *    sertakan juga.)
 *
 * 3. FIX: downloadRekapExcel sekarang benar-benar generate file .xlsx asli
 *    (multi-sheet, sesuai jumlah kelas/mapel) menggunakan SheetJS yang
 *    sudah di-load di index.html, bukan CSV berlabel .xlsx palsu.
 *
 * 4. FIX (BARU): SESSION EXPIRED SEKARANG MEMICU LOGOUT OTOMATIS.
 *    Backend (Router.gs/Auth.gs) selalu mengembalikan
 *    { success:false, sessionExpired:true, message:"..." } saat token
 *    invalid/kadaluarsa, TAPI sebelumnya tidak ada satupun kode frontend
 *    yang mengecek flag ini. Akibatnya kalau token 12 jam habis, user
 *    cuma melihat notifikasi error generik berulang-ulang setiap kali
 *    mencoba aksi apa pun, tanpa pernah diarahkan otomatis ke halaman
 *    login.
 *    Perbaikan: pengecekan dipusatkan di postJson() (satu titik untuk
 *    SEMUA request POST), bukan diulang manual di tiap fungsi endpoint.
 *    Kalau backend mengirim sessionExpired:true, sesi langsung dibersihkan
 *    dan halaman di-reload paksa ke login, disertai notifikasi yang jelas.
 *    Login (action:'login') tidak pernah mengembalikan sessionExpired,
 *    jadi aman untuk dicek di semua request tanpa pengecualian.
 * =========================================================
 */

import { CONFIG } from './config.js?v=20260731p';
import { showNotification } from './utils.js?v=20260731p';
import { setSsoCookie, getSsoCookie, deleteSsoCookie } from './ssocookie.js?v=20260731p';

// Helper untuk fetch dengan timeout dan error handling khusus Google Apps Script
async function fetchWithTimeout(url, options = {}, timeout = CONFIG.DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            redirect: 'follow' // Penting untuk redirect GAS
        });
        clearTimeout(id);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout. Periksa koneksi internet Anda.');
        }
        // Deteksi error CORS umum dari GAS
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.error('CORS Error: Pastikan Web App Deploy setting: "Execute as: Me" & "Who has access: Anyone"');
            throw new Error('Gagal terhubung ke server. Periksa pengaturan Deploy Web App di Google Apps Script:\n1. Execute as: Me\n2. Who has access: Anyone\n3. Pastikan URL Web App benar di config.js');
        }
        throw error;
    }
}

// PATCH: paksa bersihkan sesi & reload ke halaman login.
// Dipanggil otomatis oleh postJson() begitu backend menandai sessionExpired.
let sedangHandleSessionExpired = false; // guard supaya tidak reload berkali-kali kalau ada beberapa request paralel
function handleSessionExpired(message) {
    if (sedangHandleSessionExpired) return;
    sedangHandleSessionExpired = true;

    // PATCH SSO (revisi): cookie lintas subdomain (lihat js/ssoCookie.js)
    deleteSsoCookie();

    showNotification(message || 'Sesi Anda sudah habis. Silakan login ulang.', 'warning');

    // Beri jeda singkat supaya notifikasi sempat terlihat sebelum reload
    setTimeout(() => {
        window.location.reload();
    }, 1200);
}

// PATCH: helper POST terpusat, selalu pakai text/plain agar tidak memicu preflight OPTIONS
// SEKARANG JUGA menjadi satu-satunya titik pengecekan sessionExpired untuk SEMUA
// endpoint ber-token, supaya tidak perlu diulang manual di tiap fungsi di bawah.
async function postJson(body) {
    let response = await postJsonSekaliCoba_(body);

    // PATCH: beberapa ISP (terkonfirmasi terjadi di IndiHome, TIDAK terjadi
    // di Telkomsel) memakai proxy transparan yang bisa mengubah request
    // POST jadi GET saat mengikuti redirect internal Google Apps Script
    // (perilaku standar fetch(): redirect kode 301/302/303 untuk POST
    // otomatis diubah jadi GET oleh browser -- backend lalu menjawab lewat
    // doGet(), bukan doPost(), karena itu pesannya "hanya menerima POST").
    // Ini MURNI gangguan jaringan di luar kendali kode kita, tapi sering
    // cuma terjadi SEKALI (percobaan ulang lewat koneksi baru biasanya
    // berhasil) -- jadi dicoba ulang OTOMATIS 1x di sini sebelum
    // benar-benar dianggap gagal, supaya pengguna tidak perlu refresh
    // manual untuk gangguan sesaat semacam ini.
    if (response && response.success === false && typeof response.message === 'string' && response.message.indexOf('hanya menerima POST') !== -1) {
        console.warn('Terdeteksi POST berubah jadi GET (kemungkinan proxy ISP) -- mencoba ulang sekali...');
        response = await postJsonSekaliCoba_(body);
    }

    // PATCH: deteksi sessionExpired dari SEMUA response POST.
    // action:'login' tidak pernah mengirim flag ini, jadi aman untuk dicek
    // secara universal di sini tanpa terkecuali.
    if (response && response.sessionExpired === true) {
        handleSessionExpired(response.message);
    }

    return response;
}

// Logika POST sebenarnya (1 kali percobaan) -- dipisah dari postJson()
// supaya bisa dipanggil ulang untuk percobaan ke-2 di atas, tanpa
// duplikasi kode.
async function postJsonSekaliCoba_(body) {
    return await fetchWithTimeout(CONFIG.BACKEND_URL, {
        method: 'POST',
        headers: {
            // PENTING: JANGAN ganti ke 'application/json'.
            // 'text/plain' = simple content-type = tidak ada preflight OPTIONS.
            // Backend tetap bisa JSON.parse() isinya seperti biasa.
            'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(body)
    });
}

// Login user
export async function login(username, password) {
    const payload = { action: 'login', username: username, password: password };

    try {
        return await selesaikanLogin_(payload);
    } catch (error) {
        // PATCH: Google Apps Script kadang butuh "cold start" (backend
        // sempat idle beberapa saat, butuh waktu ekstra menghidupkan diri
        // di percobaan pertama) -- gejalanya persis timeout yang muncul
        // SEKALI-SEKALI (bukan konsisten setiap kali), lalu normal lagi di
        // percobaan berikutnya. Login AMAN dicoba ulang otomatis (murni
        // baca data, tidak menulis apa pun) -- BEDA dengan aksi
        // simpan/tulis data yang SENGAJA TIDAK diberi retry otomatis
        // serupa, karena berisiko tersimpan dobel kalau percobaan pertama
        // sebenarnya sudah berhasil di server, cuma responsnya yang
        // terlambat sampai ke browser.
        if (error.message && error.message.indexOf('Request timeout') !== -1) {
            console.warn('Login timeout (kemungkinan cold-start Apps Script) -- mencoba ulang sekali...');
            try {
                return await selesaikanLogin_(payload);
            } catch (errorKedua) {
                console.error('Login error (percobaan ke-2):', errorKedua);
                throw errorKedua;
            }
        }
        console.error('Login error:', error);
        throw error;
    }
}

async function selesaikanLogin_(payload) {
    const response = await postJson(payload);

    if (response.success) {
        // PATCH SSO (revisi): disimpan lewat cookie ber-Domain induk
        // (lihat js/ssoCookie.js) supaya bisa dibaca aplikasi lain di
        // SUBDOMAIN BERBEDA, bukan lagi localStorage (yang tidak bisa
        // dibagi antar subdomain). response.data sudah berisi
        // token+username+profil lengkap.
        setSsoCookie(response.data);
    }

    return response;
}

// Logout user
// PATCH: dibuat async & mengembalikan Promise yang resolve SEBELUM navigasi,
// supaya pemanggil (main.js handleLogout) bisa menunggu proses ini selesai
// terlebih dahulu sebelum menampilkan alert / redirect -- lihat perbaikan
// race condition di js/main.js.
export function logout() {
    // PATCH SSO (revisi): hapus cookie ber-Domain induk (lihat
    // js/ssoCookie.js). CATATAN: ini hanya logout dari aplikasi INI --
    // tapi karena cookie-nya di-set dengan Domain induk yang sama,
    // menghapusnya di sini JUGA membuat pengguna ter-logout dari semua
    // aplikasi lain dalam ekosistem SSO ini (browser tidak lagi mengirim
    // cookie tersebut ke subdomain mana pun setelah dihapus) -- ini
    // perilaku yang diinginkan untuk SSO (logout sekali, logout semua).
    deleteSsoCookie();
    return Promise.resolve();
}

// PATCH: navigasi dipisah dari proses pembersihan sesi, supaya pemanggil
// bisa mengatur sendiri kapan navigasi terjadi (misal setelah alert selesai).
export function redirectToLoginPage() {
    window.location.href = 'index.html';
}

// Cek apakah user sudah login
export function isLoggedIn() {
    return !!getSsoCookie();
}

// Dapatkan data user yang login
export function getCurrentUser() {
    return getSsoCookie();
}

// Dapatkan token dan username dari session
function getSessionAuth() {
    const sessionData = getSsoCookie();
    if (!sessionData) return { token: null, username: null };
    return sessionData;
}

function requireAuth() {
    const { token, username } = getSessionAuth();
    if (!token || !username) {
        throw new Error('Sesi tidak valid. Silakan login ulang.');
    }
    return { token, username };
}

// Submit absensi per mapel
export async function submitAbsensi(data) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'submit',
            username: username,
            token: token,
            payload: data
        });
    } catch (error) {
        console.error('Submit absensi error:', error);
        throw error;
    }
}

// Submit absensi wali kelas
export async function submitAbsenWali(data) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'submitAbsenWali',
            username: username,
            token: token,
            kelas: data.kelas,
            tanggal: data.tanggal,
            dataKehadiran: data.dataKehadiran
        });
    } catch (error) {
        console.error('Submit absen wali error:', error);
        throw error;
    }
}

// Ambil data siswa per kelas
export async function getSiswaByKelas(kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getStudents',
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get siswa error:', error);
        throw error;
    }
}

// Ambil data existing attendance
export async function getExistingAttendance(guru, mapel, kelas, tanggal) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getExistingAttendance',
            guru: guru || '',
            mapel: mapel,
            kelas: kelas,
            tanggal: tanggal,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get existing attendance error:', error);
        throw error;
    }
}

// Ambil riwayat absensi
export async function getRiwayatAbsensi(mapel, kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getRiwayatAbsensi',
            mapel: mapel,
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get riwayat error:', error);
        throw error;
    }
}

// Hapus 1 baris absen (salah tanggal, dsb) -- backend membatasi hanya
// tanggal dalam 7 hari terakhir yang boleh dihapus (lihat hapusAbsensi()
// di Absensi.gs).
export async function hapusAbsen(mapel, kelas, tanggal) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'hapusAbsen',
            mapel: mapel,
            kelas: kelas,
            tanggal: tanggal,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Hapus absen error:', error);
        throw error;
    }
}

// Ambil data dashboard (per mapel)
export async function getDashboardData(mapel, kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getDashboardData',
            mapel: mapel,
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get dashboard error:', error);
        throw error;
    }
}

// Ambil data dashboard SELURUH SEKOLAH (Tahap 2 -- khusus role
// kepsek/admin/superadmin, ditolak backend kalau bukan salah satunya).
export async function getDashboardSekolah() {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getDashboardSekolah',
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get dashboard sekolah error:', error);
        throw error;
    }
}

// ===== TAHAP 3: PANEL ADMIN -- kelola akun guru =====
// Semua fungsi di bawah ini ditolak backend kalau akun yang login bukan
// admin/superadmin (updateRoleAkun malah wajib superadmin) -- lihat
// Router.gs. Frontend tidak perlu cek ulang di sini, backend yang
// menjaga; js/admin.js cukup sembunyikan tombol/tab-nya saja untuk UX.

export async function getDaftarAkunUntukAdmin() {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'getDaftarAkunUntukAdmin', username, token });
    } catch (error) {
        console.error('Get daftar akun error:', error);
        throw error;
    }
}

export async function tambahAkunGuru(dataBaru) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'tambahAkunGuru', dataBaru, username, token });
    } catch (error) {
        console.error('Tambah akun guru error:', error);
        throw error;
    }
}

export async function updateAkunGuru(targetUsername, dataBaru) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'updateAkunGuru', targetUsername, dataBaru, username, token });
    } catch (error) {
        console.error('Update akun guru error:', error);
        throw error;
    }
}

export async function resetPasswordAkunOlehAdmin(targetUsername, passwordBaru) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'resetPasswordAkunOlehAdmin', targetUsername, passwordBaru, username, token });
    } catch (error) {
        console.error('Reset password akun error:', error);
        throw error;
    }
}

export async function nonaktifkanAkunGuru(targetUsername) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'nonaktifkanAkunGuru', targetUsername, username, token });
    } catch (error) {
        console.error('Nonaktifkan akun error:', error);
        throw error;
    }
}

export async function aktifkanKembaliAkunGuru(targetUsername) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'aktifkanKembaliAkunGuru', targetUsername, username, token });
    } catch (error) {
        console.error('Aktifkan akun error:', error);
        throw error;
    }
}

export async function updateRoleAkun(targetUsername, roleCsvBaru) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'updateRoleAkun', targetUsername, roleCsvBaru, username, token });
    } catch (error) {
        console.error('Update role akun error:', error);
        throw error;
    }
}

// ===== LOGO SEKOLAH (tampil di halaman login) =====

// PATCH: PUBLIK -- SENGAJA TIDAK pakai requireAuth() sama sekali, karena
// dipanggil dari halaman LOGIN (sebelum ada yang login). Backend
// (Router.gs) juga menempatkan action ini di bagian publik yang sama,
// tanpa validasi token.
export async function getLogoSekolah() {
    try {
        return await postJson({ action: 'getLogoSekolah' });
    } catch (error) {
        console.error('Get logo sekolah error:', error);
        throw error;
    }
}

// Upload/ganti logo sekolah -- BUTUH login admin/superadmin, beda dari
// getLogoSekolah() di atas yang publik.
export async function uploadLogoSekolah(base64Data, mimeType) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'uploadLogoSekolah', base64Data, mimeType, username, token });
    } catch (error) {
        console.error('Upload logo sekolah error:', error);
        throw error;
    }
}

// ===== UPLOAD ABSENSI HARDCOPY -> SOFTCOPY (link Google Sheets) =====

// `opsi`: { jenis: 'mapel', kelas, mapel } atau { jenis: 'wali', kelas, bulan, tahun }
export async function buatLinkUploadAbsensi(opsi) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'buatLinkUploadAbsensi', opsi, username, token });
    } catch (error) {
        console.error('Buat link upload absensi error:', error);
        throw error;
    }
}

export async function getDaftarLinkUploadAbsensi() {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'getDaftarLinkUploadAbsensi', username, token });
    } catch (error) {
        console.error('Get daftar link upload absensi error:', error);
        throw error;
    }
}

export async function previewImportAbsenDariLink(linkToken) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'previewImportAbsenDariLink', linkToken, username, token });
    } catch (error) {
        console.error('Preview import absen error:', error);
        throw error;
    }
}

export async function jalankanImportAbsenDariLink(linkToken) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'jalankanImportAbsenDariLink', linkToken, username, token });
    } catch (error) {
        console.error('Jalankan import absen error:', error);
        throw error;
    }
}

export async function nonaktifkanLinkUploadAbsensi(linkToken) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'nonaktifkanLinkUploadAbsensi', linkToken, username, token });
    } catch (error) {
        console.error('Nonaktifkan link upload absensi error:', error);
        throw error;
    }
}

// ===== KELOLA DATA SISWA (Panel Admin) =====

export async function getDaftarKelasMaster() {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'getDaftarKelasMaster', username, token });
    } catch (error) {
        console.error('Get daftar kelas master error:', error);
        throw error;
    }
}

export async function getDaftarSiswaUntukAdmin(kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'getDaftarSiswaUntukAdmin', kelas, username, token });
    } catch (error) {
        console.error('Get daftar siswa untuk admin error:', error);
        throw error;
    }
}

export async function tambahSiswaBaru(kelas, nis, nama, jk) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'tambahSiswaBaru', kelas, nis, nama, jk, username, token });
    } catch (error) {
        console.error('Tambah siswa baru error:', error);
        throw error;
    }
}

// `dataBaru`: { nama, jk } -- NIS SENGAJA tidak bisa diubah (lihat
// penjelasan lengkap di updateSiswa(), kodegs/Siswa.gs).
export async function updateSiswa(kelas, nis, dataBaru) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'updateSiswa', kelas, nis, dataBaru, username, token });
    } catch (error) {
        console.error('Update siswa error:', error);
        throw error;
    }
}

export async function nonaktifkanSiswa(kelas, nis) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'nonaktifkanSiswa', kelas, nis, username, token });
    } catch (error) {
        console.error('Nonaktifkan siswa error:', error);
        throw error;
    }
}

export async function aktifkanKembaliSiswa(kelas, nis) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'aktifkanKembaliSiswa', kelas, nis, username, token });
    } catch (error) {
        console.error('Aktifkan kembali siswa error:', error);
        throw error;
    }
}

// `daftarSiswa`: [{ nis, nama, jk }, ...] -- parsing file Excel/CSV-nya
// dilakukan di browser (lihat js/admin.js), fungsi ini cuma kirim array
// yang sudah bersih ke backend.
export async function uploadSiswaBatch(kelas, daftarSiswa) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'uploadSiswaBatch', kelas, daftarSiswa, username, token });
    } catch (error) {
        console.error('Upload siswa batch error:', error);
        throw error;
    }
}

// PATCH FITUR NILAI (Tahap 4): ringkasan nilai untuk digabung dengan
// tren absensi di Dashboard Per Mapel -- lihat gabunganAbsenNilai() di
// js/dashboard.js.
export async function getRingkasanNilaiUntukDashboard(mapel, kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'getRingkasanNilaiUntukDashboard', mapel, kelas, username, token });
    } catch (error) {
        console.error('Get ringkasan nilai untuk dashboard error:', error);
        throw error;
    }
}

// ===== FITUR NILAI (Tahap 2) =====

// `payload`: { mapel, kelas, kegiatanId (opsional -- kosong = kegiatan
// baru), namaKegiatan, tanggalKegiatan, tipeSkala ('angka'/'huruf'),
// nilaiPerSiswa: { nis: nilai, ... } }
export async function simpanKegiatanNilai(payload) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'simpanKegiatanNilai', payload, username, token });
    } catch (error) {
        console.error('Simpan kegiatan nilai error:', error);
        throw error;
    }
}

export async function getKegiatanNilai(mapel, kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'getKegiatanNilai', mapel, kelas, username, token });
    } catch (error) {
        console.error('Get kegiatan nilai error:', error);
        throw error;
    }
}

export async function getNilaiUntukKegiatan(mapel, kelas, kegiatanId) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'getNilaiUntukKegiatan', mapel, kelas, kegiatanId, username, token });
    } catch (error) {
        console.error('Get nilai untuk kegiatan error:', error);
        throw error;
    }
}

export async function hapusKegiatanNilai(mapel, kelas, kegiatanId) {
    try {
        const { token, username } = requireAuth();
        return await postJson({ action: 'hapusKegiatanNilai', mapel, kelas, kegiatanId, username, token });
    } catch (error) {
        console.error('Hapus kegiatan nilai error:', error);
        throw error;
    }
}

// Ambil detail 1 siswa (klik nama di kotak "Perlu Perhatian", konteks
// dashboard Per Mapel) -- `mapel` boleh 1 mapel (lagi difilter ke 1
// kombinasi) atau daftar dipisah koma (tampilan gabungan semua mapel).
export async function getDetailSiswaPerhatian(nis, kelas, mapel) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getDetailSiswaPerhatian',
            nis: nis,
            kelas: kelas,
            mapel: mapel,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get detail siswa error:', error);
        throw error;
    }
}

// Sama seperti di atas, versi dashboard Wali Kelas (mapel selalu
// "Absen Harian" -- ditentukan backend sendiri, tidak perlu dikirim).
export async function getDetailSiswaPerhatianWali(nis, kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getDetailSiswaPerhatianWali',
            nis: nis,
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get detail siswa wali error:', error);
        throw error;
    }
}

// Ambil data dashboard wali kelas
export async function getDashboardDataWali(kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getDashboardDataWali',
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get dashboard wali error:', error);
        throw error;
    }
}

// Ambil rekap absensi untuk download
export async function getRekapKelasSaya(mapel, kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getRekapKelasSaya',
            mapel: mapel,
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get rekap error:', error);
        throw error;
    }
}

// Ambil data absen wali existing
export async function getAbsenWaliExisting(kelas, tanggal) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getAbsenWaliExisting',
            kelas: kelas,
            tanggal: tanggal,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get absen wali existing error:', error);
        throw error;
    }
}

// Ambil riwayat absen wali
export async function getRiwayatAbsenWali(kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getRiwayatAbsenWali',
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get riwayat wali error:', error);
        throw error;
    }
}

// Hapus 1 baris absen wali kelas (salah tanggal, dsb) -- backend
// membatasi hanya tanggal dalam 7 hari terakhir yang boleh dihapus.
export async function hapusAbsenWali(kelas, tanggal) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'hapusAbsenWali',
            kelas: kelas,
            tanggal: tanggal,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Hapus absen wali error:', error);
        throw error;
    }
}

// Download rekap Excel
export async function downloadRekapExcel(jenis, mapel, kelas, identitas) {
    try {
        const { token, username } = requireAuth();

        const response = await postJson({
            action: jenis === 'wali' ? 'getRekapAbsenWali' : 'getRekapKelasSaya',
            username: username,
            token: token,
            mapel: mapel,
            kelas: kelas
        });

        if (!response.success || !response.data) {
            throw new Error(response.message || 'Gagal mengunduh rekap');
        }

        return generateExcelFromData(response.data, jenis, identitas);
    } catch (error) {
        console.error('Download rekap error:', error);
        throw error;
    }
}

// PATCH FITUR NILAI (Tahap 3): pola SAMA PERSIS dengan downloadRekapExcel()
// di atas -- generateExcelFromData() dipakai ULANG APA ADANYA, karena
// getRekapNilaiKelasSaya() (Nilai.gs) sengaja dibuat mengembalikan bentuk
// data yang identik ({ tabName, headerRow, rows }).
export async function downloadRekapNilaiExcel(mapel, kelas, identitas) {
    try {
        const { token, username } = requireAuth();

        const response = await postJson({
            action: 'getRekapNilaiKelasSaya',
            username: username,
            token: token,
            mapel: mapel,
            kelas: kelas
        });

        if (!response.success || !response.data) {
            throw new Error(response.message || 'Gagal mengunduh rekap nilai');
        }

        return generateExcelFromData(response.data, 'nilai', identitas);
    } catch (error) {
        console.error('Download rekap nilai error:', error);
        throw error;
    }
}

// =========================================================
// FITUR: Delegasi Input Absen ke Ketua Kelas (sementara)
// ---------------------------------------------------------
// 3 fungsi pertama BUTUH login wali kelas (sama seperti fungsi wali kelas
// lain di atas). 2 fungsi terakhir SENGAJA TIDAK memanggil requireAuth()
// sama sekali dan TIDAK pernah mengirim username/token session -- itu
// yang dipakai dari halaman publik link ketua kelas (lihat js/ketuaKelas.js),
// keamanannya divalidasi backend lewat ketuaToken saja.
// =========================================================

// Buat/perbarui & aktifkan link ketua kelas untuk kelas wali sendiri
export async function generateKetuaKelasLink(kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'generateKetuaKelasLink',
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Generate ketua kelas link error:', error);
        throw error;
    }
}

// Cek status link ketua kelas (aktif/tidak) untuk kelas wali sendiri
export async function getStatusKetuaKelasLink(kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getStatusKetuaKelasLink',
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get status ketua kelas link error:', error);
        throw error;
    }
}

// Nonaktifkan link ketua kelas untuk kelas wali sendiri
export async function nonaktifkanKetuaKelasLink(kelas) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'nonaktifkanKetuaKelasLink',
            kelas: kelas,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Nonaktifkan ketua kelas link error:', error);
        throw error;
    }
}

// PUBLIK -- dipanggil dari halaman link ketua kelas, tanpa login sama sekali
// PATCH: parameter `tanggal` opsional -- hanya berpengaruh kalau mode per
// tanggal aktif untuk kelas tsb (dikontrol manual lewat Apps Script,
// lihat kodegs/ketuakelas.gs). Kalau tidak diisi, backend tetap default
// ke tanggal server hari ini seperti semula.
export async function getInfoKetuaKelas(ketuaToken, tanggal) {
    try {
        return await postJson({
            action: 'getInfoKetuaKelas',
            ketuaToken: ketuaToken,
            tanggal: tanggal
        });
    } catch (error) {
        console.error('Get info ketua kelas error:', error);
        throw error;
    }
}

// PUBLIK -- submit absensi lewat link ketua kelas, tanpa login sama sekali
export async function submitAbsenKetuaKelas(ketuaToken, dataKehadiran, tanggal) {
    try {
        return await postJson({
            action: 'submitAbsenKetuaKelas',
            ketuaToken: ketuaToken,
            dataKehadiran: dataKehadiran,
            tanggal: tanggal
        });
    } catch (error) {
        console.error('Submit absen ketua kelas error:', error);
        throw error;
    }
}

// PATCH: generate file .xlsx ASLI (multi-sheet) menggunakan SheetJS (window.XLSX)
// yang sudah di-load lewat <script> di index.html.
async function generateExcelFromData(sheetsData, jenis, identitas) {
    if (!sheetsData || sheetsData.length === 0) {
        throw new Error('Data rekap kosong');
    }

    if (typeof XLSX === 'undefined') {
        console.warn('Library XLSX tidak ditemukan, fallback ke CSV.');
        return generateCsvFallback(sheetsData, jenis, identitas);
    }

    const workbook = XLSX.utils.book_new();

    sheetsData.forEach(sheet => {
        const aoa = [sheet.headerRow, ...sheet.rows];
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);

        const colWidths = sheet.headerRow.map((_, colIdx) => {
            let maxLen = String(sheet.headerRow[colIdx] || '').length;
            sheet.rows.forEach(row => {
                const len = String(row[colIdx] ?? '').length;
                if (len > maxLen) maxLen = len;
            });
            return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
        });
        worksheet['!cols'] = colWidths;

        const safeTabName = (sheet.tabName || 'Sheet')
            .replace(/[\\/?*[\]:]/g, '_')
            .substring(0, 31);

        XLSX.utils.book_append_sheet(workbook, worksheet, safeTabName);
    });

    const filename = `${buatNamaFileRekap(jenis, identitas)}.xlsx`;

    XLSX.writeFile(workbook, filename);

    return { success: true, message: 'File rekap (.xlsx) berhasil diunduh' };
}

// PATCH: nama file rekap sebelumnya "Rekap_<jenis>_<timestamp-lengkap>"
// (mis. "Rekap_wali_2026-07-26T06-02-47.xlsx") -- diganti supaya lebih
// informatif dan mudah dibedakan kalau diunduh berkali-kali:
//   - wali : "Rekap_wali_<kelas>_<semester>_<tanggal>.xlsx" (mis. "Rekap_wali_XI-DKV-1_S1_2026-07-26.xlsx")
//   - mapel: "Rekap_mapel_<nama-guru>_<semester>_<tanggal>.xlsx"
// `identitas` diisi kelas (untuk wali) atau nama guru (untuk mapel) oleh
// pemanggil (lihat js/absensi.js). Tanggal dipakai TANGGAL SAJA (bukan
// jam:menit:detik) karena timestamp lengkap sudah tidak diperlukan lagi.
//
// Semester (S1/S2) DITAMBAHKAN sekarang, dihitung dari BULAN HARI INI --
// aturan yang SAMA dengan getSemesterFromTanggal() di Config.gs (backend),
// supaya nama file rekap selalu cocok dengan grup semester data absen
// yang sedang aktif: Juli-Desember = S1, Januari-Juni = S2.
//
// CATATAN: untuk sekarang pergantian semester masih mengikuti tanggal
// SISTEM (otomatis, bukan bisa dipilih manual). Nanti kalau sudah ada
// dashboard admin aplikasi (untuk mengatur semester aktif secara
// eksplisit, termasuk kasus semester belum/telat diganti tepat tanggal
// 1 Juli/Januari), fungsi tentukanSemesterSaatIni() ini tinggal diganti
// sumber datanya dari situ, tanpa perlu ubah bagian lain yang memanggilnya.
function tentukanSemesterSaatIni() {
    const bulan = new Date().getMonth() + 1; // getMonth() 0-indexed, waktu LOKAL browser
    return (bulan >= 7 && bulan <= 12) ? 'S1' : 'S2';
}

// Tanggal lokal (yyyy-MM-dd) memakai waktu LOKAL browser, BUKAN
// toISOString() (yang selalu UTC) -- supaya tidak salah tanggal (dan ikut
// salah semester) kalau diakses dini hari WIB (UTC+7), mis. jam 00:30 WIB
// tanggal 1 Agustus, toISOString() masih menunjukkan 31 Juli (UTC).
function tanggalLokalHariIni() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function buatNamaFileRekap(jenis, identitas) {
    const tanggal = tanggalLokalHariIni();
    const semester = tentukanSemesterSaatIni();
    const identitasAman = (identitas || '')
        .trim()
        .replace(/[\\/?*[\]:]/g, '_')
        .replace(/\s+/g, '-');
    return identitasAman
        ? `Rekap_${jenis}_${identitasAman}_${semester}_${tanggal}`
        : `Rekap_${jenis}_${semester}_${tanggal}`; // fallback kalau identitas tidak diisi
}

// Fallback CSV lama, hanya dipakai kalau library XLSX benar-benar tidak tersedia
function generateCsvFallback(sheetsData, jenis, identitas) {
    const filename = `${buatNamaFileRekap(jenis, identitas)}.csv`;

    const sheet = sheetsData[0];
    let csvContent = [];
    csvContent.push(sheet.headerRow.join(','));
    sheet.rows.forEach(row => {
        csvContent.push(row.map(cell => {
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(','));
    });

    const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);

    return { success: true, message: 'File rekap (.csv fallback) berhasil diunduh' };
}

// ===== PANEL PROFIL =====

// Ambil data profil (nama + URL foto) untuk ditampilkan saat panel dibuka
export async function getProfilSaya() {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'getProfilSaya',
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Get profil error:', error);
        throw error;
    }
}

// Update nama & (opsional) password. `dataBaru` bentuknya:
//   { nama }, { passwordLama, passwordBaru }, atau keduanya sekaligus.
export async function updateProfil(dataBaru) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'updateProfil',
            dataBaru: dataBaru,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Update profil error:', error);
        throw error;
    }
}

// Upload foto profil. `base64Data` HARUS sudah dikompres/diresize di sisi
// klien dulu (lihat js/profil.js, kompresGambarSebelumUpload()) supaya
// payload yang dikirim ke server tetap kecil.
export async function uploadFotoProfil(base64Data, mimeType) {
    try {
        const { token, username } = requireAuth();
        return await postJson({
            action: 'uploadFotoProfil',
            base64Data: base64Data,
            mimeType: mimeType,
            username: username,
            token: token
        });
    } catch (error) {
        console.error('Upload foto profil error:', error);
        throw error;
    }
}

export default {
    login,
    logout,
    redirectToLoginPage,
    isLoggedIn,
    getCurrentUser,
    submitAbsensi,
    submitAbsenWali,
    getSiswaByKelas,
    getExistingAttendance,
    getRiwayatAbsensi,
    hapusAbsen,
    getDashboardData,
    getDashboardSekolah,
    getDaftarAkunUntukAdmin,
    tambahAkunGuru,
    updateAkunGuru,
    resetPasswordAkunOlehAdmin,
    nonaktifkanAkunGuru,
    aktifkanKembaliAkunGuru,
    updateRoleAkun,
    getLogoSekolah,
    uploadLogoSekolah,
    buatLinkUploadAbsensi,
    getDaftarLinkUploadAbsensi,
    previewImportAbsenDariLink,
    jalankanImportAbsenDariLink,
    nonaktifkanLinkUploadAbsensi,
    getDaftarKelasMaster,
    getDaftarSiswaUntukAdmin,
    tambahSiswaBaru,
    updateSiswa,
    nonaktifkanSiswa,
    aktifkanKembaliSiswa,
    uploadSiswaBatch,
    getRingkasanNilaiUntukDashboard,
    simpanKegiatanNilai,
    getKegiatanNilai,
    getNilaiUntukKegiatan,
    hapusKegiatanNilai,
    getDetailSiswaPerhatian,
    getDetailSiswaPerhatianWali,
    getDashboardDataWali,
    getRekapKelasSaya,
    getAbsenWaliExisting,
    getRiwayatAbsenWali,
    hapusAbsenWali,
    downloadRekapExcel,
    downloadRekapNilaiExcel,
    getProfilSaya,
    updateProfil,
    uploadFotoProfil
};
