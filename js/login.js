import { login } from './api.js';
import { showLoading, hideLoading } from './utils.js';

/**
 * Login Module
 * Mengelola form login dan autentikasi awal
 */

// Inisialisasi form login
export function initLoginForm() {
    const form = document.getElementById('loginForm');
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
    const msgEl = document.getElementById('loginMsg');
    
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value;
    
    // Reset pesan
    if (msgEl) msgEl.textContent = '';
    
    // Validasi input
    if (!username || !password) {
        if (msgEl) {
            msgEl.textContent = 'Username dan password harus diisi';
            msgEl.className = 'login-msg error';
        }
        return;
    }
    
    // Show loading state
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    if (btnText) btnText.classList.add('hidden');
    if (btnLoader) btnLoader.classList.remove('hidden');
    submitBtn.disabled = true;
    
    try {
        const response = await login(username, password);
        
        if (response.success) {
            if (msgEl) {
                msgEl.textContent = 'Login berhasil! Mengalihkan...';
                msgEl.className = 'login-msg success';
            }
            
            // Delay sebentar agar user melihat notifikasi
            setTimeout(() => {
                // Redirect akan dihandle oleh main.js router
                window.location.reload();
            }, 1000);
        } else {
            if (msgEl) {
                msgEl.textContent = response.message || 'Login gagal. Periksa username dan password Anda.';
                msgEl.className = 'login-msg error';
            }
            // Reset password field
            const passwordInput = document.getElementById('password');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }
    } catch (error) {
        if (msgEl) {
            msgEl.textContent = 'Error: ' + error.message;
            msgEl.className = 'login-msg error';
        }
    } finally {
        // Hide loading state
        if (btnText) btnText.classList.remove('hidden');
        if (btnLoader) btnLoader.classList.add('hidden');
        submitBtn.disabled = false;
    }
}

export default {
    initLoginForm
};
