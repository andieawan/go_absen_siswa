import { login } from './api.js';
import { showLoading, hideLoading, showNotification } from './utils.js';

/**
 * Login Module
 * Mengelola form login dan autentikasi awal
 */

// Inisialisasi form login
export function initLoginForm() {
    const form = document.getElementById('form-login');
    if (!form) return;
    
    setupFormListeners(form);
}

// Setup event listeners untuk form login
function setupFormListeners(form) {
    form.addEventListener('submit', handleLoginSubmit);
    
    // Auto-focus ke username field
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        usernameInput.focus();
    }
}

// Handle login submit
async function handleLoginSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value;
    
    // Validasi input
    if (!username || !password) {
        showNotification('Username dan password harus diisi', 'error');
        return;
    }
    
    showLoading(submitBtn.id || 'login-btn');
    
    try {
        const response = await login(username, password);
        
        if (response.success) {
            showNotification('Login berhasil! Mengalihkan...', 'success');
            
            // Delay sebentar agar user melihat notifikasi
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            showNotification(response.message || 'Login gagal. Periksa username dan password Anda.', 'error');
            // Reset password field
            const passwordInput = document.getElementById('password');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    } finally {
        hideLoading(submitBtn.id || 'login-btn');
    }
}

export default {
    initLoginForm
};
