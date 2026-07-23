/**
 * Modal Manager
 * Menangani tampilan dan interaksi modal alert & confirm
 */

/**
 * Inisialisasi event listeners untuk modal
 */
export function initModalHandlers() {
    setupCustomAlert();
    setupConfirmModal();
}

/**
 * Setup Custom Alert Modal
 */
function setupCustomAlert() {
    const modal = document.getElementById('customAlert');
    if (!modal) return;

    const okBtn = modal.querySelector('.modal-btn');
    
    // Handler untuk tombol OK
    window.closeCustomAlert = () => {
        modal.classList.remove('active');
    };

    // Klik di luar modal (overlay) juga menutup modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            window.closeCustomAlert();
        }
    });

    // Support keyboard (Enter untuk close)
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.closeCustomAlert();
        }
    });
}

/**
 * Setup Confirm Modal
 */
function setupConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (!modal) return;

    const yesBtn = document.getElementById('confirmBtnYes');
    const noBtn = document.getElementById('confirmBtnNo');
    
    let resolvePromise = null;

    const closeModal = () => {
        modal.classList.remove('active');
    };

    const handleConfirm = (value) => {
        if (resolvePromise) {
            resolvePromise(value);
            resolvePromise = null;
        }
        closeModal();
    };

    // Handler tombol Ya
    if (yesBtn) {
        yesBtn.addEventListener('click', () => handleConfirm(true));
    }

    // Handler tombol Tidak
    if (noBtn) {
        noBtn.addEventListener('click', () => handleConfirm(false));
    }

    // Klik di luar modal = batal (false)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            handleConfirm(false);
        }
    });

    // Keyboard support
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm(true); // Enter = Ya
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleConfirm(false); // Escape = Tidak
        }
    });

    // Expose fungsi global untuk kompatibilitas
    window.showConfirmDialog = (message) => {
        return new Promise((resolve) => {
            resolvePromise = resolve;
            const messageEl = document.getElementById('confirmMessage');
            if (messageEl) messageEl.textContent = message;
            modal.classList.add('active');
            
            // Focus ke tombol Tidak untuk keamanan
            if (noBtn) noBtn.focus();
        });
    };
}

/**
 * Tampilkan alert custom
 * @param {string} message - Pesan alert
 * @param {string} title - Judul (default: "Pemberitahuan")
 * @param {string} type - Tipe: success, error, warning, info
 */
export function showAlert(message, title = 'Pemberitahuan', type = 'success') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customAlert');
        if (!modal) {
            console.error('Modal customAlert tidak ditemukan');
            resolve();
            return;
        }

        const iconEl = document.getElementById('alertIcon');
        const titleEl = document.getElementById('alertTitle');
        const messageEl = document.getElementById('alertMessage');

        // Mapping icon dan class berdasarkan tipe
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        const iconClasses = {
            success: 'icon-success',
            error: 'icon-error',
            warning: 'icon-warning',
            info: 'icon-info'
        };

        if (iconEl) {
            iconEl.textContent = icons[type] || icons.info;
            iconEl.className = `modal-icon ${iconClasses[type] || iconClasses.info}`;
        }

        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;

        // Tampilkan modal
        modal.classList.add('active');

        // Fokus ke tombol OK untuk aksesibilitas
        const okBtn = modal.querySelector('.modal-btn');
        if (okBtn) okBtn.focus();

        // Simpan resolve function
        const originalClose = window.closeCustomAlert;
        window.closeCustomAlert = () => {
            modal.classList.remove('active');
            window.closeCustomAlert = originalClose;
            resolve();
        };
    });
}

/**
 * Tampilkan dialog konfirmasi
 * @param {string} message - Pesan konfirmasi
 * @param {string} title - Judul (default: "Konfirmasi")
 * @returns {Promise<boolean>} - true jika Ya, false jika Tidak
 */
export function showConfirm(message, title = 'Konfirmasi') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        if (!modal) {
            console.error('Modal confirmModal tidak ditemukan');
            resolve(false);
            return;
        }

        const messageEl = document.getElementById('confirmMessage');
        if (messageEl) messageEl.textContent = message;

        // Tampilkan modal
        modal.classList.add('active');

        // Setup one-time handler
        const noBtn = document.getElementById('confirmBtnNo');
        const yesBtn = document.getElementById('confirmBtnYes');
        
        let resolved = false;

        const cleanup = () => {
            modal.classList.remove('active');
            if (yesBtn) yesBtn.onclick = null;
            if (noBtn) noBtn.onclick = null;
        };

        const handleResolve = (value) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(value);
        };

        // Override onclick handlers
        if (yesBtn) {
            yesBtn.onclick = () => handleResolve(true);
        }
        if (noBtn) {
            noBtn.onclick = () => handleResolve(false);
        }

        // Fokus ke tombol Tidak untuk keamanan
        if (noBtn) noBtn.focus();
    });
}

export default {
    initModalHandlers,
    showAlert,
    showConfirm
};
