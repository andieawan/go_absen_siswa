/**
 * API Service
 * Menangani semua komunikasi dengan Google Apps Script Backend
 * 
 * CATATAN PENTING: Semua request harus menyertakan username dan token
 * yang didapat dari login, sesuai dengan autentikasi di backend.
 */

// Helper untuk fetch dengan timeout dan error handling khusus Google Apps Script
async function fetchWithTimeout(url, options = {}, timeout = CONFIG.DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        // Google Apps Script Web App kadang memerlukan header Content-Type text/plain untuk menghindari preflight OPTIONS yang gagal CORS
        // Namun untuk JSON body, kita tetap gunakan application/json tapi dengan penanganan error yang lebih baik
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

// Login user
export async function login(username, password) {
    try {
        const response = await fetchWithTimeout(CONFIG.BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'login',
                username: username,
                password: password
            })
        });
        
        if (response.success) {
            // PERBAIKAN: Simpan data sesuai struktur response backend
            // Backend mengembalikan response.data.token dan response.data berisi user info
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

// Submit absensi per mapel
export async function submitAbsensi(data) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        const response = await fetchWithTimeout(CONFIG.BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'submit',  // PERBAIKAN: action name sesuai Router.gs
                username: username,
                token: token,
                payload: data
            })
        });
        
        return response;
    } catch (error) {
        console.error('Submit absensi error:', error);
        throw error;
    }
}

// Submit absensi wali kelas
export async function submitAbsenWali(data) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        const response = await fetchWithTimeout(CONFIG.BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'submitAbsenWali',  // PERBAIKAN: action name sesuai Router.gs
                username: username,
                token: token,
                kelas: data.kelas,
                tanggal: data.tanggal,
                dataKehadiran: data.dataKehadiran
            })
        });
        
        return response;
    } catch (error) {
        console.error('Submit absen wali error:', error);
        throw error;
    }
}

// Ambil data siswa per kelas
export async function getSiswaByKelas(kelas) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        // PERBAIKAN: Gunakan query string dengan username dan token
        const url = new URL(CONFIG.BACKEND_URL);
        url.searchParams.append('action', 'getStudents');
        url.searchParams.append('kelas', kelas);
        url.searchParams.append('username', username);
        url.searchParams.append('token', token);
        
        const response = await fetchWithTimeout(url.toString(), {
            method: 'GET'
        });
        
        return response;
    } catch (error) {
        console.error('Get siswa error:', error);
        throw error;
    }
}

// Ambil data existing attendance
export async function getExistingAttendance(guru, mapel, kelas, tanggal) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        const url = new URL(CONFIG.BACKEND_URL);
        url.searchParams.append('action', 'getExistingAttendance');
        url.searchParams.append('guru', guru || '');
        url.searchParams.append('mapel', mapel);
        url.searchParams.append('kelas', kelas);
        url.searchParams.append('tanggal', tanggal);
        url.searchParams.append('username', username);
        url.searchParams.append('token', token);
        
        const response = await fetchWithTimeout(url.toString(), {
            method: 'GET'
        });
        
        return response;
    } catch (error) {
        console.error('Get existing attendance error:', error);
        throw error;
    }
}

// Ambil riwayat absensi
export async function getRiwayatAbsensi(mapel, kelas) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        const url = new URL(CONFIG.BACKEND_URL);
        url.searchParams.append('action', 'getRiwayatAbsensi');
        url.searchParams.append('mapel', mapel);
        url.searchParams.append('kelas', kelas);
        url.searchParams.append('username', username);
        url.searchParams.append('token', token);
        
        const response = await fetchWithTimeout(url.toString(), {
            method: 'GET'
        });
        
        return response;
    } catch (error) {
        console.error('Get riwayat error:', error);
        throw error;
    }
}

// Ambil data dashboard (per mapel)
export async function getDashboardData(mapel, kelas) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        const url = new URL(CONFIG.BACKEND_URL);
        url.searchParams.append('action', 'getDashboardData');
        url.searchParams.append('mapel', mapel);
        url.searchParams.append('kelas', kelas);
        url.searchParams.append('username', username);
        url.searchParams.append('token', token);
        
        const response = await fetchWithTimeout(url.toString(), {
            method: 'GET'
        });
        
        return response;
    } catch (error) {
        console.error('Get dashboard error:', error);
        throw error;
    }
}

// Ambil data dashboard wali kelas
export async function getDashboardDataWali(kelas) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        const url = new URL(CONFIG.BACKEND_URL);
        url.searchParams.append('action', 'getDashboardDataWali');
        url.searchParams.append('kelas', kelas);
        url.searchParams.append('username', username);
        url.searchParams.append('token', token);
        
        const response = await fetchWithTimeout(url.toString(), {
            method: 'GET'
        });
        
        return response;
    } catch (error) {
        console.error('Get dashboard wali error:', error);
        throw error;
    }
}

// Ambil rekap absensi untuk download
export async function getRekapKelasSaya(mapel, kelas) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        const url = new URL(CONFIG.BACKEND_URL);
        url.searchParams.append('action', 'getRekapKelasSaya');
        url.searchParams.append('mapel', mapel);
        url.searchParams.append('kelas', kelas);
        url.searchParams.append('username', username);
        url.searchParams.append('token', token);
        
        const response = await fetchWithTimeout(url.toString(), {
            method: 'GET'
        });
        
        return response;
    } catch (error) {
        console.error('Get rekap error:', error);
        throw error;
    }
}

// Ambil data absen wali existing
export async function getAbsenWaliExisting(kelas, tanggal) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        const url = new URL(CONFIG.BACKEND_URL);
        url.searchParams.append('action', 'getAbsenWaliExisting');
        url.searchParams.append('kelas', kelas);
        url.searchParams.append('tanggal', tanggal);
        url.searchParams.append('username', username);
        url.searchParams.append('token', token);
        
        const response = await fetchWithTimeout(url.toString(), {
            method: 'GET'
        });
        
        return response;
    } catch (error) {
        console.error('Get absen wali existing error:', error);
        throw error;
    }
}

// Ambil riwayat absen wali
export async function getRiwayatAbsenWali(kelas) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        const url = new URL(CONFIG.BACKEND_URL);
        url.searchParams.append('action', 'getRiwayatAbsenWali');
        url.searchParams.append('kelas', kelas);
        url.searchParams.append('username', username);
        url.searchParams.append('token', token);
        
        const response = await fetchWithTimeout(url.toString(), {
            method: 'GET'
        });
        
        return response;
    } catch (error) {
        console.error('Get riwayat wali error:', error);
        throw error;
    }
}

// Download rekap Excel - PERBAIKAN: tidak lagi kirim token via query string
export async function downloadRekapExcel(jenis, mapel, kelas) {
    try {
        const { token, username } = getSessionAuth();
        if (!token || !username) {
            throw new Error('Sesi tidak valid. Silakan login ulang.');
        }
        
        // PERBAIKAN: Kirim POST dengan username+token di body, bukan query string
        const response = await fetchWithTimeout(CONFIG.BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: jenis === 'wali' ? 'getRekapAbsenWali' : 'getRekapKelasSaya',
                username: username,
                token: token,
                mapel: mapel,
                kelas: kelas
            })
        });
        
        if (!response.success || !response.data) {
            throw new Error(response.message || 'Gagal mengunduh rekap');
        }
        
        // Backend mengembalikan data sheets dalam format array
        // Generate Excel file dari data yang diterima
        return generateExcelFromData(response.data, jenis);
    } catch (error) {
        console.error('Download rekap error:', error);
        throw error;
    }
}

// Helper untuk generate dan download Excel file dari data
async function generateExcelFromData(sheetsData, jenis) {
    // Karena browser tidak bisa langsung generate .xlsx tanpa library eksternal,
    // kita akan generate CSV sebagai alternatif yang lebih sederhana
    // Untuk .xlsx asli, perlu menambahkan library seperti SheetJS/xlsx
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `Rekap_${jenis}_${timestamp}.csv`;
    
    // Gabungkan semua sheets menjadi satu CSV (sheet pertama saja untuk simplisitas)
    if (!sheetsData || sheetsData.length === 0) {
        throw new Error('Data rekap kosong');
    }
    
    const sheet = sheetsData[0];
    let csvContent = [];
    
    // Header
    csvContent.push(sheet.headerRow.join(','));
    
    // Rows
    sheet.rows.forEach(row => {
        csvContent.push(row.map(cell => {
            // Escape comma dan quote dalam cell
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(','));
    });
    
    // Download file
    const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    
    return { success: true, message: 'File rekap berhasil diunduh' };
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
