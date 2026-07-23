import { CONFIG } from './config.js';
import { showNotification } from './utils.js';

/**
 * API Service
 * Menangani semua komunikasi dengan Google Apps Script Backend
 */

// Helper untuk fetch dengan timeout dan error handling
async function fetchWithTimeout(url, options = {}, timeout = CONFIG.DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout. Silakan coba lagi.');
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
