import { CONFIG } from './config.js';
import { showNotification } from './utils.js';

/**
 * API Service
 * Menangani semua komunikasi dengan Google Apps Script Backend
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
            // Simpan token di sessionStorage
            sessionStorage.setItem(CONFIG.SESSION_KEY, response.token);
            localStorage.setItem('user_data', JSON.stringify(response.userData));
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

// Submit absensi per mapel
export async function submitAbsensi(data) {
    try {
        const token = sessionStorage.getItem(CONFIG.SESSION_KEY);
        
        const response = await fetchWithTimeout(CONFIG.BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                action: 'submit_absensi',
                ...data
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
        const token = sessionStorage.getItem(CONFIG.SESSION_KEY);
        
        const response = await fetchWithTimeout(CONFIG.BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                action: 'submit_absen_wali',
                ...data
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
        const token = sessionStorage.getItem(CONFIG.SESSION_KEY);
        
        const response = await fetchWithTimeout(CONFIG.BACKEND_URL + `?action=get_siswa&kelas=${encodeURIComponent(kelas)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        return response;
    } catch (error) {
        console.error('Get siswa error:', error);
        throw error;
    }
}

// Ambil data dashboard
export async function getDashboardData() {
    try {
        const token = sessionStorage.getItem(CONFIG.SESSION_KEY);
        
        const response = await fetchWithTimeout(CONFIG.BACKEND_URL + '?action=get_dashboard', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        return response;
    } catch (error) {
        console.error('Get dashboard error:', error);
        throw error;
    }
}

// Ambil rekap absensi
export async function getRekapAbsensi(filters) {
    try {
        const token = sessionStorage.getItem(CONFIG.SESSION_KEY);
        
        const queryString = new URLSearchParams(filters).toString();
        
        const response = await fetchWithTimeout(CONFIG.BACKEND_URL + `?action=get_rekap&${queryString}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        return response;
    } catch (error) {
        console.error('Get rekap error:', error);
        throw error;
    }
}

// Download rekap Excel
export async function downloadRekapExcel(filters) {
    try {
        const token = sessionStorage.getItem(CONFIG.SESSION_KEY);
        
        const queryString = new URLSearchParams(filters).toString();
        
        // Buka URL download di tab baru
        const downloadUrl = `${CONFIG.BACKEND_URL}?action=download_rekap_excel&${queryString}&token=${token}`;
        window.open(downloadUrl, '_blank');
        
        return { success: true };
    } catch (error) {
        console.error('Download rekap error:', error);
        throw error;
    }
}

export default {
    login,
    logout,
    isLoggedIn,
    getCurrentUser,
    submitAbsensi,
    submitAbsenWali,
    getSiswaByKelas,
    getDashboardData,
    getRekapAbsensi,
    downloadRekapExcel
};
