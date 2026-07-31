import { login, getLogoSekolah } from './api.js?v=20260731l';
import { showGlobalLoading, hideGlobalLoading, escapeHtml } from './utils.js?v=20260731l';

/**
 * Login Module
 * Mengelola form login dan autentikasi awal
 *
 * PATCH: Semua akses DOM (querySelector dkk) yang sebelumnya berada SEBELUM
 * blok try/catch dipindah ke DALAM try. Sebelumnya kalau submitBtn atau
 * elemen lain null (misal struktur HTML template berubah), error akan
 * throw di luar try/catch -> uncaught exception, tombol bisa nyangkut
 * disabled tanpa pesan error yang jelas ke user.
 */

// Inisialisasi form login
export function initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    setupFormListeners(form);
    // PATCH: logo sekolah (fitur Panel Admin) -- gagal diam-diam kalau
    // ada error, ikon emoji bawaan (🏫) tetap tampil sebagai fallback.
    muatLogoSekolah();
}

/**
 * Tampilkan logo sekolah (kalau admin sudah upload lewat Panel Admin,
 * lihat js/admin.js), menggantikan ikon emoji bawaan (🏫) di kartu
 * login. Kalau belum pernah diupload sama sekali, atau permintaannya
 * gagal karena apa pun, dibiarkan diam-diam -- emoji bawaan tetap
 * tampil, jangan sampai halaman login rusak gara-gara fitur dekoratif
 * ini.
 */
async function muatLogoSekolah() {
    const logoEl = document.querySelector('.login-logo');
    if (!logoEl) return;
    try {
        const res = await getLogoSekolah();
        if (res.success && res.data && res.data.logoUrl) {
            logoEl.innerHTML = `<img src="${escapeHtml(res.data.logoUrl)}" alt="Logo Sekolah" class="login-logo-img">`;
        }
    } catch (error) {
        console.error('Gagal memuat logo sekolah (memakai ikon bawaan):', error);
    }
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

    // PATCH: seluruh proses submit sekarang dibungkus try/catch,
    // termasuk manipulasi tombol loading, supaya elemen yang hilang
    // tidak menyebabkan uncaught error dan tombol nyangkut.
    let btnText = null;
    let btnLoader = null;

    // PATCH UX: dulu tombol submit SELALU dikembalikan ke tampilan normal
    // (loader disembunyikan, tombol diaktifkan lagi) lewat blok `finally`
    // di paling bawah -- termasuk saat login BERHASIL. Karena redirect
    // baru terjadi 1 detik kemudian (lihat setTimeout di bawah), tombol
    // sempat "balik ke semula" tepat saat pesan "Login berhasil!
    // Mengalihkan..." muncul -- kelihatan seperti proses batal/reset,
    // padahal sebenarnya berhasil dan sedang menunggu redirect. Sekarang
    // dilacak lewat `loginBerhasil`, supaya tampilan loading tetap
    // dipertahankan sampai reload benar-benar terjadi.
    let loginBerhasil = false;

    try {
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
        if (submitBtn) {
            btnText = submitBtn.querySelector('.btn-text');
            btnLoader = submitBtn.querySelector('.btn-loader');
            if (btnText) btnText.classList.add('hidden');
            if (btnLoader) btnLoader.classList.remove('hidden');
            submitBtn.disabled = true;
        }

        showGlobalLoading('Memeriksa akun...');
        let response;
        try {
            response = await login(username, password);
        } finally {
            hideGlobalLoading();
        }

        if (response.success) {
            loginBerhasil = true;
            // PATCH: sebelumnya sempat menampilkan pesan "Login berhasil!
            // Mengalihkan..." dan menunggu 1 detik sebelum reload -- atas
            // permintaan, langkah ini dihilangkan supaya begitu akun
            // tervalidasi, langsung masuk ke dashboard tanpa jeda/pesan
            // apa pun di antaranya.
            window.location.reload();
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
        } else {
            // Fallback kalau elemen pesan pun tidak ada, jangan biarkan error hilang diam-diam
            console.error('Login error (tanpa elemen pesan di DOM):', error);
            alert('Login gagal: ' + error.message);
        }
    } finally {
        // PATCH: JANGAN kembalikan tombol ke tampilan normal kalau login
        // BERHASIL -- biarkan tetap terlihat "memproses" sampai halaman
        // benar-benar reload sesaat lagi, supaya transisinya terasa mulus
        // (bukan berhasil -> balik ke awal -> baru pindah halaman).
        if (!loginBerhasil && submitBtn) {
            if (btnText) btnText.classList.remove('hidden');
            if (btnLoader) btnLoader.classList.add('hidden');
            submitBtn.disabled = false;
        }
    }
}

export default {
    initLoginForm
};
