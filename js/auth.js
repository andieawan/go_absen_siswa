import { isLoggedIn, getCurrentUser, logout } from './api.js';
import { showNotification } from './utils.js';

/**
 * Authentication Module
 * Mengelola login, logout, dan proteksi halaman
 */

// Inisialisasi auth saat halaman dimuat
export function initAuth() {
    checkAuthStatus();
    setupLogoutButton();
}

// Cek status autentikasi
function checkAuthStatus() {
    const isLoginPage = window.location.pathname.includes('login.html') || 
                        window.location.pathname.endsWith('index.html');
    
    if (isLoggedIn()) {
        // User sudah login
        if (isLoginPage) {
            // Redirect ke dashboard jika mencoba akses login page
            window.location.href = 'dashboard.html';
        } else {
            // Update UI dengan data user
            updateUserUI();
        }
    } else {
        // User belum login
        if (!isLoginPage) {
            // Redirect ke login page
            window.location.href = 'index.html';
        }
    }
}

// Update UI dengan data user yang login
function updateUserUI() {
    const user = getCurrentUser();
    if (!user) return;
    
    // Update elemen dengan class 'user-name' atau 'user-info'
    const userNameElements = document.querySelectorAll('.user-name, .user-info');
    userNameElements.forEach(el => {
        el.textContent = `${user.nama} (${user.role})`;
    });
    
    // Show/hide elemen berdasarkan role
    document.querySelectorAll('[data-role]').forEach(el => {
        const requiredRole = el.dataset.role;
        if (user.role !== requiredRole && user.role !== 'admin') {
            el.style.display = 'none';
        }
    });
}

// Setup tombol logout
function setupLogoutButton() {
    const logoutButtons = document.querySelectorAll('[data-action="logout"]');
    logoutButtons.forEach(button => {
        button.addEventListener('click', handleLogout);
    });
}

// Handle logout
async function handleLogout(e) {
    e.preventDefault();
    
    if (confirm('Apakah Anda yakin ingin logout?')) {
        try {
            logout();
            showNotification('Berhasil logout', 'success');
        } catch (error) {
            showNotification('Gagal logout: ' + error.message, 'error');
        }
    }
}

// Proteksi halaman tertentu berdasarkan role
export function requireRole(requiredRoles) {
    const user = getCurrentUser();
    
    if (!user) {
        window.location.href = 'index.html';
        return false;
    }
    
    if (!Array.isArray(requiredRoles)) {
        requiredRoles = [requiredRoles];
    }
    
    if (!requiredRoles.includes(user.role) && user.role !== 'admin') {
        showNotification('Anda tidak memiliki akses ke halaman ini', 'error');
        window.location.href = 'dashboard.html';
        return false;
    }
    
    return true;
}

export default {
    initAuth,
    requireRole
};
