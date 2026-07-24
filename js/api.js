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
 * =========================================================
 */

import { CONFIG } from './config.js';

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

// PATCH: helper POST terpusat, selalu pakai text/plain agar tidak memicu preflight OPTIONS
async function postJson(body) {
    return fetchWithTimeout(CONFIG.BACKEND_URL, {
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
    try {
        const response = await postJson({
            action: 'login',
            username: username,
            password: password
        });

        if (response.success) {
            sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify({
                token: response.data.token,
                username: response.data.username
            }));
            localStorage.setItem('user_data', JSON.stringify(response.data));
        }

        return response;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

// Logout user
export function logout() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    localStorage.removeItem('user_data');
    window.location.href = 'index.html';
}

// Cek apakah user sudah login
export function isLoggedIn() {
    return !!sessionStorage.getItem(CONFIG.SESSION_KEY);
}

// Dapatkan data user yang login
export function getCurrentUser() {
    const userData = localStorage.getItem('user_data');
    return userData ? JSON.parse(userData) : null;
}

// Dapatkan token dan username dari session
function getSessionAuth() {
    const sessionData = sessionStorage.getItem(CONFIG.SESSION_KEY);
    if (!sessionData) return { token: null, username: null };
    try {
        return JSON.parse(sessionData);
    } catch (e) {
        return { token: null, username: null };
    }
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
// PATCH: dipindah dari GET query-string -> POST body (token tidak lagi di URL)
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
// PATCH: dipindah dari GET query-string -> POST body
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
// PATCH: dipindah dari GET query-string -> POST body
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

// Ambil data dashboard (per mapel)
// PATCH: dipindah dari GET query-string -> POST body
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

// Ambil data dashboard wali kelas
// PATCH: dipindah dari GET query-string -> POST body
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
// PATCH: dipindah dari GET query-string -> POST body
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
// PATCH: dipindah dari GET query-string -> POST body
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
// PATCH: dipindah dari GET query-string -> POST body
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

// Download rekap Excel
export async function downloadRekapExcel(jenis, mapel, kelas) {
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

        return generateExcelFromData(response.data, jenis);
    } catch (error) {
        console.error('Download rekap error:', error);
        throw error;
    }
}

// PATCH: generate file .xlsx ASLI (multi-sheet) menggunakan SheetJS (window.XLSX)
// yang sudah di-load lewat <script> di index.html. Sebelumnya fungsi ini cuma
// membuat CSV tapi diberi nama file .xlsx (menyesatkan user).
async function generateExcelFromData(sheetsData, jenis) {
    if (!sheetsData || sheetsData.length === 0) {
        throw new Error('Data rekap kosong');
    }

    if (typeof XLSX === 'undefined') {
        // Fallback aman kalau library SheetJS gagal dimuat (mis. CDN diblokir)
        console.warn('Library XLSX tidak ditemukan, fallback ke CSV.');
        return generateCsvFallback(sheetsData, jenis);
    }

    const workbook = XLSX.utils.book_new();

    sheetsData.forEach(sheet => {
        const aoa = [sheet.headerRow, ...sheet.rows];
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);

        // Lebar kolom otomatis sederhana biar enak dibaca
        const colWidths = sheet.headerRow.map((_, colIdx) => {
            let maxLen = String(sheet.headerRow[colIdx] || '').length;
            sheet.rows.forEach(row => {
                const len = String(row[colIdx] ?? '').length;
                if (len > maxLen) maxLen = len;
            });
            return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
        });
        worksheet['!cols'] = colWidths;

        // Nama tab Excel maksimal 31 karakter & tidak boleh karakter aneh
        const safeTabName = (sheet.tabName || 'Sheet')
            .replace(/[\\/?*[\]:]/g, '_')
            .substring(0, 31);

        XLSX.utils.book_append_sheet(workbook, worksheet, safeTabName);
    });

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `Rekap_${jenis}_${timestamp}.xlsx`;

    XLSX.writeFile(workbook, filename);

    return { success: true, message: 'File rekap (.xlsx) berhasil diunduh' };
}

// Fallback CSV lama, hanya dipakai kalau library XLSX benar-benar tidak tersedia
function generateCsvFallback(sheetsData, jenis) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `Rekap_${jenis}_${timestamp}.csv`;

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

export default {
    login,
    logout,
    isLoggedIn,
    getCurrentUser,
    submitAbsensi,
    submitAbsenWali,
    getSiswaByKelas,
    getExistingAttendance,
    getRiwayatAbsensi,
    getDashboardData,
    getDashboardDataWali,
    getRekapKelasSaya,
    getAbsenWaliExisting,
    getRiwayatAbsenWali,
    downloadRekapExcel
};
