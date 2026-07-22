// =========================================================
// KONFIGURASI
// ---------------------------------------------------------
// Ganti URL Web App Google Apps Script di sini kalau berubah.
// URL ini didapat dari Deploy > Manage deployments > Web app URL
// di project Apps Script Anda.
// =========================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyMGAl2rTMzOEVkosA-QKNrVvo69x3WZPrYgRBRcVF9JL-K1guOv-zJAWnisfCZ1t8n/exec';
// ===== SELESAI: KONFIGURASI =====


// =========================================================
// STATE MANAGEMENT TERPUSAT (Prioritas #2)
// ---------------------------------------------------------
// Semua state aplikasi dikonsolidasikan di satu object ini.
//
// KEUNTUNGAN:
//   1. Mudah di-debug: cukup console.log(AppState) untuk lihat
//      seluruh kondisi aplikasi saat ini
//   2. Mudah di-reset: satu method reset() saat logout
//   3. Auto-persist session ke sessionStorage
//   4. Tidak ada variabel global yang tersebar
//
// CARA DEBUG:
//   Ketik AppState.debug() di console browser untuk inspeksi
// =========================================================
const AppState = {
    session: null,
    studentCache: {},
    ui: {
        currentTab: 'panelAbsensi',
        charts: {}
    },

    loadSession() {
        try {
            const saved = sessionStorage.getItem('guruSession');
            this.session = saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.warn('Gagal memuat sesi dari sessionStorage:', e);
            this.session = null;
        }
        return this.session;
    },

    setSession(data) {
        this.session = data;
        try {
            sessionStorage.setItem('guruSession', JSON.stringify(data));
        } catch (e) {
            console.warn('Gagal menyimpan sesi ke sessionStorage:', e);
        }
    },

    clearSession() {
        this.session = null;
        try {
            sessionStorage.removeItem('guruSession');
        } catch (e) {
            console.warn('Gagal menghapus sesi dari sessionStorage:', e);
        }
    },

    cacheStudents(kelas, students) {
        this.studentCache[kelas] = students;
    },

    getStudents(kelas) {
        return this.studentCache[kelas];
    },

    clearStudentCache(kelas) {
        if (kelas) delete this.studentCache[kelas];
        else this.studentCache = {};
    },

    setChart(name, chartInstance) {
        this.destroyChart(name);
        this.ui.charts[name] = chartInstance;
    },

    getChart(name) {
        return this.ui.charts[name];
    },

    destroyChart(name) {
        const chart = this.ui.charts[name];
        if (chart) {
            chart.destroy();
            delete this.ui.charts[name];
        }
    },

    destroyAllCharts() {
        Object.keys(this.ui.charts).forEach(name => this.destroyChart(name));
    },

    reset() {
        this.destroyAllCharts();
        this.studentCache = {};
        this.ui.currentTab = 'panelAbsensi';
        this.clearSession();
    },

    debug() {
        console.group('🔍 AppState Debug');
        console.log('Session:', this.session);
        console.log('Student Cache:', this.studentCache);
        console.log('UI State:', this.ui);
        console.log('Active Charts:', Object.keys(this.ui.charts));
        console.groupEnd();
    }
};

AppState.loadSession();
// ===== SELESAI: STATE MANAGEMENT TERPUSAT =====


// =========================================================
// REFERENSI ELEMEN DOM (Prioritas #2)
// ---------------------------------------------------------
// Dikumpulkan di satu tempat supaya mudah dicari & di-maintain.
// Tidak perlu querySelector berulang-ulang di banyak fungsi.
// =========================================================
const DOM = {
    loginSection: document.getElementById('loginSection'),
    dashboardSection: document.getElementById('dashboardSection'),
    greeting: document.getElementById('greeting'),
    tanggalAbsen: document.getElementById('tanggalAbsen'),
    selectMapel: document.getElementById('selectMapel'),
    selectKelas: document.getElementById('selectKelas'),
    loading: document.getElementById('loading'),
    studentsBody: document.getElementById('studentsBody'),
    btnSubmit: document.getElementById('btnSubmit'),
    loginMsg: document.getElementById('loginMsg'),
    tabBtnAbsenWali: document.getElementById('tabBtnAbsenWali'),
    waliKelasLabel: document.getElementById('waliKelasLabel'),
    waliTanggal: document.getElementById('waliTanggal'),
    waliLoading: document.getElementById('waliLoading'),
    waliStudentsBody: document.getElementById('waliStudentsBody'),
    waliBtnSubmit: document.getElementById('waliBtnSubmit'),
    customAlert: document.getElementById('customAlert'),
    alertIcon: document.getElementById('alertIcon'),
    alertTitle: document.getElementById('alertTitle'),
    alertMessage: document.getElementById('alertMessage'),
    confirmModal: document.getElementById('confirmModal'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmBtnYes: document.getElementById('confirmBtnYes'),
    confirmBtnNo: document.getElementById('confirmBtnNo'),
    riwayatMapel: document.getElementById('riwayatMapel'),
    riwayatKelas: document.getElementById('riwayatKelas'),
    riwayatList: document.getElementById('riwayatList'),
    riwayatLoading: document.getElementById('riwayatLoading'),
    waliRiwayatList: document.getElementById('waliRiwayatList'),
    waliRiwayatLoading: document.getElementById('waliRiwayatLoading'),
    dashboardLoading: document.getElementById('dashboardLoading'),
    dashboardContent: document.getElementById('dashboardContent'),
    rekapKelasMapelList: document.getElementById('rekapKelasMapelList'),
    topAlpaList: document.getElementById('topAlpaList'),
    trendChart: document.getElementById('trendChart')
};

if (AppState.session) showDashboard();
// ===== SELESAI: REFERENSI ELEMEN DOM =====


// =========================================================
// OPTIMASI PERFORMA: FUNGSI DEBOUNCE
// ---------------------------------------------------------
// Mencegah request beruntun ke server saat pengguna mengganti
// dropdown / input dengan cepat.
// =========================================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
// ===== SELESAI: FUNGSI DEBOUNCE =====


// =========================================================
// GITHUB PAGES COMPATIBILITY: HELPER FETCH GAS
// ---------------------------------------------------------
// Semua request ke Google Apps Script dibungkus di fungsi ini.
// =========================================================
async function fetchGas(actionOrPayload, paramsOrBody = null, isPost = false) {
    let url, options;

    if (isPost) {
        url = GAS_URL;
        options = {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(actionOrPayload)
        };
    } else {
        const query = new URLSearchParams();
        if (actionOrPayload) query.append('action', actionOrPayload);
        if (paramsOrBody) {
            Object.entries(paramsOrBody).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') query.append(k, v);
            });
        }
        url = `${GAS_URL}?${query.toString()}`;
        options = {
            method: 'GET',
            mode: 'cors',
            redirect: 'follow'
        };
    }

    const response = await fetch(url, options);
    return await response.json();
}
// ===== SELESAI: HELPER FETCH GAS =====


// =========================================================
// KOMPONEN: STUDENT TABLE (Prioritas #1 - Component Thinking)
// ---------------------------------------------------------
// Menggabungkan logika render & pembacaan tabel siswa yang
// sebelumnya duplikat di 2 tempat (panel mapel & panel wali).
// =========================================================
const StudentTable = {
    render(tbodyId, students) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        tbody.innerHTML = '';
        const fragment = document.createDocumentFragment();
        students.forEach(siswa => {
            const tr = document.createElement('tr');
            tr.className = 'student-row';
            tr.dataset.nis = siswa.nis;
            const radioName = `absen_${tbodyId}_${siswa.nis}`;
            tr.innerHTML = `
                <td>${siswa.nis || '-'}</td>
                <td class="nama-siswa">${siswa.nama}</td>
                <td>
                    <div class="radio-group">
                        <label><input type="radio" name="${radioName}" value="H" checked required> H</label>
                        <label><input type="radio" name="${radioName}" value="I"> I</label>
                        <label><input type="radio" name="${radioName}" value="S"> S</label>
                        <label><input type="radio" name="${radioName}" value="A"> A</label>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);
    },

    setStatus(tbodyId, nis, status) {
        const row = document.querySelector(`#${tbodyId} tr.student-row[data-nis="${nis}"]`);
        if (!row) return;
        const targetRadio = row.querySelector(`input[type="radio"][value="${status}"]`);
        if (targetRadio) targetRadio.checked = true;
    },

    resetAll(tbodyId) {
        const rows = document.querySelectorAll(`#${tbodyId} tr.student-row`);
        rows.forEach(row => {
            const targetRadio = row.querySelector('input[type="radio"][value="H"]');
            if (targetRadio) targetRadio.checked = true;
        });
    },

    getAttendanceData(tbodyId) {
        const rows = document.querySelectorAll(`#${tbodyId} tr.student-row`);
        const data = [];
        rows.forEach(row => {
            const nis = row.dataset.nis;
            const checked = row.querySelector('input[type="radio"]:checked');
            if (nis && checked) {
                data.push({ nis, status: checked.value });
            }
        });
        return data;
    },

    hasData(tbodyId) {
        return document.querySelectorAll(`#${tbodyId} tr.student-row`).length > 0;
    }
};
// ===== SELESAI: KOMPONEN STUDENT TABLE =====


// =========================================================
// KOMPONEN: FORM VALIDATOR (Prioritas #5 - Form Validation Visual)
// ---------------------------------------------------------
// Memberikan feedback visual yang jelas saat form tidak valid.
//
// FITUR:
//   1. Validasi tanggal masa depan (error)
//   2. Warning tanggal terlalu lama (> 60 hari)
//   3. Inline error message di bawah field yang bermasalah
//   4. Real-time validation saat tanggal berubah
//   5. Auto-scroll ke field error saat submit gagal
//
// CARA PAKAI:
//   const result = FormValidator.validateAbsenForm();
//   if (!FormValidator.applyValidation(result)) {
//       showAlert('Mohon perbaiki field yang ditandai merah.', false);
//       return;
//   }
//   // ... lanjut submit
//
// CATATAN ZONA WAKTU:
//   Aplikasi ini ditujukan untuk pengguna di Indonesia (GMT+7).
//   Validasi tanggal memakai zona waktu lokal browser. Kalau
//   developer testing dari luar negeri, hasil validasi mungkin
//   berbeda 1 hari. Untuk produksi di Indonesia, ini tidak masalah.
// =========================================================
const FormValidator = {
    // Batas warning: tanggal lebih dari N hari yang lalu
    WARNING_DAYS_THRESHOLD: 60,

    // Inisialisasi listener untuk real-time validation.
    // Dipanggil sekali saat script dimuat.
    init() {
        // Real-time validation saat tanggal berubah
        // (berjalan berdampingan dengan EventDelegation, tidak konflik)
        document.addEventListener('change', (e) => {
            if (e.target.id === 'tanggalAbsen' || e.target.id === 'waliTanggal') {
                this.validateDateRealtime(e.target.id);
            }
        });

        // Hapus error saat user mulai berinteraksi dengan field error
        // (feedback positif: "oh, saya sudah perbaiki, error hilang")
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('field-error')) {
                this.clearFieldError(e.target.id);
            }
        });
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('field-error')) {
                this.clearFieldError(e.target.id);
            }
        });

        console.log('✅ Form validator initialized');
    },

    // ===== METHOD VALIDASI =====

    // Validasi form input absensi (panel mapel).
    // Return: { errors: [...], warnings: [...] }
    validateAbsenForm() {
        const errors = [];
        const warnings = [];

        // Validasi mapel
        if (!DOM.selectMapel.value) {
            errors.push({ field: 'selectMapel', message: 'Mata pelajaran harus dipilih' });
        }

        // Validasi kelas
        if (!DOM.selectKelas.value) {
            errors.push({ field: 'selectKelas', message: 'Kelas harus dipilih' });
        }

        // Validasi tanggal
        const tanggal = DOM.tanggalAbsen.value;
        if (!tanggal) {
            errors.push({ field: 'tanggalAbsen', message: 'Tanggal pertemuan harus diisi' });
        } else {
            if (this.isDateInFuture(tanggal)) {
                errors.push({ field: 'tanggalAbsen', message: 'Tanggal tidak boleh di masa depan' });
            } else if (this.isDateTooOld(tanggal, this.WARNING_DAYS_THRESHOLD)) {
                warnings.push({
                    field: 'tanggalAbsen',
                    message: `Tanggal lebih dari ${this.WARNING_DAYS_THRESHOLD} hari yang lalu`
                });
            }
        }

        return { errors, warnings };
    },

    // Validasi form absen wali kelas.
    // Return: { errors: [...], warnings: [...] }
    validateWaliForm() {
        const errors = [];
        const warnings = [];

        const tanggal = DOM.waliTanggal.value;
        if (!tanggal) {
            errors.push({ field: 'waliTanggal', message: 'Tanggal harus diisi' });
        } else {
            if (this.isDateInFuture(tanggal)) {
                errors.push({ field: 'waliTanggal', message: 'Tanggal tidak boleh di masa depan' });
            } else if (this.isDateTooOld(tanggal, this.WARNING_DAYS_THRESHOLD)) {
                warnings.push({
                    field: 'waliTanggal',
                    message: `Tanggal lebih dari ${this.WARNING_DAYS_THRESHOLD} hari yang lalu`
                });
            }
        }

        return { errors, warnings };
    },

    // ===== METHOD BANTUAN TANGGAL =====

    // Cek apakah tanggal di masa depan.
    // dateStr format: "YYYY-MM-DD"
    isDateInFuture(dateStr) {
        const today = new Date();
        today.setHours(23, 59, 59, 999); // end of today (local time)
        const selectedDate = new Date(dateStr + 'T00:00:00');
        return selectedDate > today;
    },

    // Cek apakah tanggal terlalu lama (lebih dari N hari yang lalu).
    isDateTooOld(dateStr, days) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selectedDate = new Date(dateStr + 'T00:00:00');
        const diffDays = (today - selectedDate) / (1000 * 60 * 60 * 24);
        return diffDays > days;
    },

    // ===== METHOD VISUAL FEEDBACK =====

    // Validasi real-time saat tanggal berubah.
    // Dipanggil otomatis oleh listener di init().
    validateDateRealtime(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        const tanggal = field.value;

        // Bersihkan error & warning lama dulu
        this.clearFieldError(fieldId);
        this.clearFieldWarning(fieldId);

        if (!tanggal) return;

        if (this.isDateInFuture(tanggal)) {
            this.showFieldError(fieldId, 'Tanggal tidak boleh di masa depan');
        } else if (this.isDateTooOld(tanggal, this.WARNING_DAYS_THRESHOLD)) {
            this.showFieldWarning(fieldId, `Tanggal lebih dari ${this.WARNING_DAYS_THRESHOLD} hari yang lalu`);
        }
    },

    // Tampilkan error inline pada field tertentu.
    // Field akan berubah merah, dan pesan error muncul di bawahnya.
    showFieldError(fieldId, message) {
        this.clearFieldError(fieldId);
        const field = document.getElementById(fieldId);
        if (!field) return;

        field.classList.add('field-error');

        const errorEl = document.createElement('div');
        errorEl.className = 'field-error-message';
        errorEl.setAttribute('role', 'alert'); // aksesibilitas: screen reader akan baca ini
        errorEl.innerText = '⚠ ' + message;
        field.parentElement.appendChild(errorEl);
    },

    // Tampilkan warning inline pada field tertentu.
    // Field akan berubah kuning, dan pesan warning muncul di bawahnya.
    showFieldWarning(fieldId, message) {
        this.clearFieldWarning(fieldId);
        const field = document.getElementById(fieldId);
        if (!field) return;

        field.classList.add('field-warning');

        const warningEl = document.createElement('div');
        warningEl.className = 'field-warning-message';
        warningEl.innerText = 'ℹ ' + message;
        field.parentElement.appendChild(warningEl);
    },

    // Hapus error dari field tertentu.
    clearFieldError(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.classList.remove('field-error');
        const existing = field.parentElement.querySelector('.field-error-message');
        if (existing) existing.remove();
    },

    // Hapus warning dari field tertentu.
    clearFieldWarning(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.classList.remove('field-warning');
        const existing = field.parentElement.querySelector('.field-warning-message');
        if (existing) existing.remove();
    },

    // Hapus SEMUA error & warning di seluruh form.
    // Dipanggil di awal submit handler supaya tidak ada error "hantu"
    // dari validasi sebelumnya.
    clearAll() {
        document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
        document.querySelectorAll('.field-error-message').forEach(el => el.remove());
        document.querySelectorAll('.field-warning').forEach(el => el.classList.remove('field-warning'));
        document.querySelectorAll('.field-warning-message').forEach(el => el.remove());
    },

    // Terapkan hasil validasi ke UI:
    // - Tampilkan semua error & warning
    // - Scroll ke field error pertama
    // - Return true kalau valid (tidak ada error), false kalau ada error
    //
    // CATATAN: warning TIDAK menghalangi submit, hanya memberi informasi.
    // Hanya error yang menghalangi submit.
    applyValidation(result) {
        this.clearAll();

        // Tampilkan semua error
        result.errors.forEach(err => this.showFieldError(err.field, err.message));

        // Tampilkan semua warning
        result.warnings.forEach(warn => this.showFieldWarning(warn.field, warn.message));

        // Kalau ada error, scroll ke field error pertama & fokuskan
        if (result.errors.length > 0) {
            const firstErrorField = document.getElementById(result.errors[0].field);
            if (firstErrorField) {
                firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Delay fokus supaya scroll selesai dulu
                setTimeout(() => firstErrorField.focus(), 400);
            }
            return false;
        }

        return true;
    }
};

// Inisialisasi form validator sekali saat script dimuat
FormValidator.init();
// ===== SELESAI: KOMPONEN FORM VALIDATOR =====


// =========================================================
// EVENT DELEGATION TERPUSAT (Prioritas #3)
// ---------------------------------------------------------
// Semua event listener dikonsolidasi di satu modul ini.
// =========================================================
const EventDelegation = {
    init() {
        // 1. Tombol aksi global (pakai data-action attribute di HTML)
        document.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                e.preventDefault();
                this.handleAction(actionBtn.dataset.action);
            }
        });

        // 2. Tab navigation (pakai data-tab attribute di HTML)
        document.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn && tabBtn.dataset.tab) {
                e.preventDefault();
                switchTab(tabBtn.dataset.tab);
            }
        });

        // 3. Radio button kehadiran (visual feedback: highlight baris)
        document.addEventListener('change', (e) => {
            if (e.target.matches('.student-row input[type="radio"]')) {
                this.handleRadioChange(e);
            }
        });

        // 4. Dropdown & tanggal change events (pakai ID elemen)
        // CATATAN: validasi visual tanggal di-handle oleh FormValidator.init()
        // secara terpisah. Di sini hanya handle logic bisnis.
        document.addEventListener('change', (e) => {
            const target = e.target;
            if (target.id === 'selectKelas') {
                debounce(() => fetchStudents(target.value), 300)();
            } else if (target.id === 'tanggalAbsen' || target.id === 'selectMapel') {
                debounce(checkExistingAttendance, 300)();
            } else if (target.id === 'waliTanggal') {
                debounce(checkExistingAbsenWali, 300)();
            } else if (target.id === 'riwayatMapel' || target.id === 'riwayatKelas') {
                fetchRiwayat();
            }
        });

        console.log('✅ Event delegation initialized');
    },

    handleRadioChange(e) {
        const radio = e.target;
        const row = radio.closest('.student-row');
        if (!row) return;
        const tbody = row.closest('tbody');
        tbody.querySelectorAll('.student-row').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
    },

    handleAction(action) {
        switch (action) {
            case 'downloadRekapKelasSaya':
                downloadRekapKelasSaya();
                break;
            case 'logout':
                logout();
                break;
            case 'downloadRekapAbsenWali':
                downloadRekapAbsenWali();
                break;
            default:
                console.warn(`Action tidak dikenal: ${action}`);
        }
    }
};

EventDelegation.init();
// ===== SELESAI: EVENT DELEGATION TERPUSAT =====


// =========================================================
// FUNGSI CUSTOM ALERT (popup notifikasi)
// =========================================================
function showAlert(message, isSuccess = true) {
    if (isSuccess) {
        DOM.alertIcon.innerHTML = '✓';
        DOM.alertIcon.className = 'modal-icon icon-success';
        DOM.alertTitle.innerText = 'Berhasil!';
        DOM.customAlert.querySelector('.modal-btn').style.backgroundColor = '#10B981';
    } else {
        DOM.alertIcon.innerHTML = '✕';
        DOM.alertIcon.className = 'modal-icon icon-error';
        DOM.alertTitle.innerText = 'Oops, Gagal!';
        DOM.customAlert.querySelector('.modal-btn').style.backgroundColor = '#EF4444';
    }
    DOM.alertMessage.innerText = message;
    DOM.customAlert.classList.add('active');
}

function closeCustomAlert() {
    DOM.customAlert.classList.remove('active');
}
// ===== SELESAI: FUNGSI CUSTOM ALERT =====


// =========================================================
// FUNGSI CUSTOM CONFIRM (popup Ya/Tidak)
// =========================================================
function showConfirmModal(message) {
    return new Promise((resolve) => {
        DOM.confirmMessage.innerText = message;
        DOM.confirmModal.classList.add('active');
        function selesai(hasil) {
            DOM.confirmModal.classList.remove('active');
            DOM.confirmBtnYes.removeEventListener('click', onYes);
            DOM.confirmBtnNo.removeEventListener('click', onNo);
            resolve(hasil);
        }
        function onYes() { selesai(true); }
        function onNo() { selesai(false); }
        DOM.confirmBtnYes.addEventListener('click', onYes);
        DOM.confirmBtnNo.addEventListener('click', onNo);
    });
}
// ===== SELESAI: FUNGSI CUSTOM CONFIRM =====


// =========================================================
// FUNGSI BANTUAN: FORMAT TANGGAL & PEMECAH STRING NIS
// =========================================================
function formatTanggalIndoShort(tanggalIso) {
    const [y, m, d] = tanggalIso.split('-');
    return `${d}/${m}/${y}`;
}

function formatTanggalIndo(tanggalStr) {
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const [y, m, d] = tanggalStr.split('-');
    return `${parseInt(d, 10)} ${bulan[parseInt(m, 10) - 1]} ${y}`;
}

function splitNisList(str) {
    return (str || "").toString().split(',').map(s => s.trim()).filter(s => s !== "");
}
// ===== SELESAI: FUNGSI BANTUAN =====


// =========================================================
// HANDLE LOGIN
// =========================================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const btn = e.target.querySelector('button');
    btn.innerText = 'Mengecek...';
    DOM.loginMsg.innerText = '';
    try {
        const resData = await fetchGas({ action: 'login', username: user, password: pass }, null, true);
        if (resData.success) {
            AppState.setSession(resData.data);
            showDashboard();
        } else {
            DOM.loginMsg.innerText = resData.message;
        }
    } catch (error) {
        DOM.loginMsg.innerText = "Gagal terhubung ke server.";
    }
    btn.innerText = 'Login';
});
// ===== SELESAI: HANDLE LOGIN =====


// =========================================================
// TAMPILKAN DASHBOARD (setelah login / saat sesi ditemukan)
// =========================================================
function showDashboard() {
    const session = AppState.session;
    if (!session) return;

    DOM.loginSection.classList.add('hidden');
    DOM.dashboardSection.classList.remove('hidden');
    DOM.greeting.innerText = `Selamat Mengajar, ${session.nama}`;
    DOM.tanggalAbsen.valueAsDate = new Date();

    const mapelArr = session.mapel.split(',').map(s => s.trim());
    DOM.selectMapel.innerHTML = mapelArr.map(m => `<option value="${m}">${m}</option>`).join('');

    const kelasArr = session.kelas.split(',').map(s => s.trim());
    DOM.selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' +
                                kelasArr.map(k => `<option value="${k}">${k}</option>`).join('');

    if (session.kelasWali) {
        DOM.tabBtnAbsenWali.classList.remove('hidden');
        DOM.waliKelasLabel.innerText = session.kelasWali;
        DOM.waliTanggal.valueAsDate = new Date();
        fetchStudentsWali(session.kelasWali);
        fetchRiwayatAbsenWali();
    } else {
        DOM.tabBtnAbsenWali.classList.add('hidden');
    }
}
// ===== SELESAI: TAMPILKAN DASHBOARD =====


// =========================================================
// GANTI TAB
// =========================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');

    AppState.ui.currentTab = tabId;

    // Bersihkan error/warning form saat pindah tab
    // (supaya tidak ada error "hantu" yang tertinggal)
    FormValidator.clearAll();

    if (tabId === 'panelRiwayat') setupRiwayatSelectors();
    if (tabId === 'panelDashboard') loadDashboard();
}
// ===== SELESAI: GANTI TAB =====


// =========================================================
// FETCH DATA SISWA (panel Input Absensi per Mapel)
// =========================================================
async function fetchStudents(kelas) {
    const tbody = DOM.studentsBody;
    const loading = DOM.loading;
    const btnSubmit = DOM.btnSubmit;
    tbody.innerHTML = '';
    btnSubmit.style.display = 'none';
    loading.classList.remove('hidden');

    try {
        let students = AppState.getStudents(kelas);
        if (!students) {
            const resData = await fetchGas('getStudents', { kelas });
            loading.classList.add('hidden');
            if (!resData.success || resData.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
                return;
            }
            students = resData.data;
            AppState.cacheStudents(kelas, students);
        } else {
            loading.classList.add('hidden');
        }
        StudentTable.render('studentsBody', students);
        btnSubmit.style.display = 'block';
        await checkExistingAttendance();
    } catch (error) {
        loading.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
    }
}
// ===== SELESAI: FETCH DATA SISWA (panel mapel) =====


// =========================================================
// CEK ABSENSI YANG SUDAH ADA (panel Input Absensi per Mapel)
// =========================================================
async function checkExistingAttendance() {
    const mapel = DOM.selectMapel.value;
    const kelas = DOM.selectKelas.value;
    const tanggalInput = DOM.tanggalAbsen;
    const tanggal = tanggalInput.value;
    const guru = AppState.session.nama;
    const btnSubmit = DOM.btnSubmit;
    if (!mapel || !kelas || !tanggal) return;
    if (!StudentTable.hasData('studentsBody')) return;

    btnSubmit.innerText = "Mengecek status...";
    try {
        const resData = await fetchGas('getExistingAttendance', { guru, mapel, kelas, tanggal });
        if (resData.success && resData.data) {
            const lanjutEdit = await showConfirmModal(
                `Absensi untuk kelas ${kelas} - mapel ${mapel} pada tanggal ${formatTanggalIndo(tanggal)} sudah pernah diisi sebelumnya. Lanjutkan untuk mengedit data yang sudah tersimpan?`
            );
            if (!lanjutEdit) {
                tanggalInput.value = '';
                btnSubmit.style.display = 'none';
                btnSubmit.innerText = "Simpan Absensi";
                return;
            }
            const savedIzin = splitNisList(resData.data.izin);
            const savedSakit = splitNisList(resData.data.sakit);
            const savedAlpa = splitNisList(resData.data.alpa);
            const rows = document.querySelectorAll('#studentsBody tr.student-row');
            rows.forEach(row => {
                const nis = row.dataset.nis;
                let status = 'H';
                if (savedIzin.includes(nis)) status = 'I';
                else if (savedSakit.includes(nis)) status = 'S';
                else if (savedAlpa.includes(nis)) status = 'A';
                StudentTable.setStatus('studentsBody', nis, status);
            });
            btnSubmit.innerText = "Perbarui Absensi";
        } else {
            StudentTable.resetAll('studentsBody');
            btnSubmit.innerText = "Simpan Absensi";
        }
    } catch (error) {
        btnSubmit.innerText = "Simpan Absensi";
    }
}
// ===== SELESAI: CEK ABSENSI YANG SUDAH ADA (panel mapel) =====


// =========================================================
// SUBMIT ABSENSI (panel Input Absensi per Mapel)
// ---------------------------------------------------------
// PERUBAHAN PRIORITAS #5:
// Sebelum submit, panggil FormValidator.validateAbsenForm()
// untuk cek semua field. Kalau ada error, tampilkan inline
// & batal submit. Warning tidak menghalangi submit.
// =========================================================
document.getElementById('absenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = DOM.btnSubmit;

    // ===== VALIDASI FORM (Prioritas #5) =====
    const validationResult = FormValidator.validateAbsenForm();
    if (!FormValidator.applyValidation(validationResult)) {
        // Ada error -- tampilkan alert & batal submit
        showAlert('Mohon perbaiki field yang ditandai merah.', false);
        return;
    }
    // Kalau ada warning (tapi tidak ada error), lanjut submit
    // Warning hanya informasi, tidak menghalangi.

    const attendanceData = StudentTable.getAttendanceData('studentsBody');
    const payload = {
        guru: AppState.session.nama,
        mapel: DOM.selectMapel.value,
        kelas: DOM.selectKelas.value,
        tanggal: DOM.tanggalAbsen.value,
        attendance: attendanceData
    };
    btn.innerText = "Menyimpan...";
    btn.disabled = true;
    try {
        const resData = await fetchGas({
            action: 'submit',
            username: AppState.session.username,
            token: AppState.session.token,
            payload: payload
        }, null, true);
        if (resData.success) {
            showAlert(resData.message, true);
            btn.innerText = "Perbarui Absensi";
            // Bersihkan error/warning setelah submit berhasil
            FormValidator.clearAll();
        } else if (resData.sessionExpired) {
            showAlert(resData.message, false);
            setTimeout(logout, 1500);
        } else {
            showAlert(resData.message, false);
            btn.innerText = "Simpan Absensi";
        }
    } catch (error) {
        showAlert("Terjadi kesalahan jaringan saat menyimpan data.", false);
        btn.innerText = "Simpan Absensi";
    }
    btn.disabled = false;
});
// ===== SELESAI: SUBMIT ABSENSI (panel mapel) =====


// =========================================================
// REKAP KELAS SAYA (download .xlsx)
// =========================================================
async function downloadRekapKelasSaya() {
    const btn = document.getElementById('btnRecap');
    const originalText = btn.innerHTML;
    btn.innerText = "Menyiapkan file...";
    btn.disabled = true;
    try {
        const resData = await fetchGas('getRekapKelasSaya', {
            mapel: AppState.session.mapel,
            kelas: AppState.session.kelas
        });
        if (resData.success) {
            const wb = XLSX.utils.book_new();
            resData.data.forEach(sheetInfo => {
                const ws = XLSX.utils.aoa_to_sheet([sheetInfo.headerRow, ...sheetInfo.rows]);
                XLSX.utils.book_append_sheet(wb, ws, sheetInfo.tabName);
            });
            const namaFile = `Rekap_${AppState.session.nama}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, namaFile);
            showAlert("Rekap berhasil dibuat dan diunduh!", true);
        } else {
            showAlert(resData.message, false);
        }
    } catch (error) {
        showAlert("Terjadi kesalahan saat menyiapkan file rekap.", false);
    }
    btn.innerHTML = originalText;
    btn.disabled = false;
}
// ===== SELESAI: REKAP KELAS SAYA =====


// =========================================================
// LOGOUT
// =========================================================
function logout() {
    AppState.reset();
    window.location.reload();
}
// ===== SELESAI: LOGOUT =====


// =========================================================
// PANEL RIWAYAT ABSENSI (per mapel)
// =========================================================
function setupRiwayatSelectors() {
    if (DOM.riwayatMapel.dataset.filled) return;

    const mapelArr = AppState.session.mapel.split(',').map(s => s.trim());
    DOM.riwayatMapel.innerHTML = mapelArr.map(m => `<option value="${m}">${m}</option>`).join('');
    const kelasArr = AppState.session.kelas.split(',').map(s => s.trim());
    DOM.riwayatKelas.innerHTML = kelasArr.map(k => `<option value="${k}">${k}</option>`).join('');
    DOM.riwayatMapel.dataset.filled = "1";
}

async function fetchRiwayat() {
    const mapel = DOM.riwayatMapel.value;
    const kelas = DOM.riwayatKelas.value;
    if (!mapel || !kelas) return;

    DOM.riwayatList.innerHTML = '';
    DOM.riwayatLoading.classList.remove('hidden');
    try {
        const resData = await fetchGas('getRiwayatAbsensi', { mapel, kelas });
        DOM.riwayatLoading.classList.add('hidden');
        if (resData.success && resData.data.length > 0) {
            DOM.riwayatList.innerHTML = resData.data.map(rec => {
                const rincian = [
                    rec.namaIzin.length ? `Izin: ${rec.namaIzin.join(', ')}` : '',
                    rec.namaSakit.length ? `Sakit: ${rec.namaSakit.join(', ')}` : '',
                    rec.namaAlpa.length ? `Alpa: ${rec.namaAlpa.join(', ')}` : ''
                ].filter(Boolean).join(' &middot; ');
                return `
                    <div class="riwayat-card">
                        <div class="riwayat-header">
                            <span class="riwayat-tanggal">${formatTanggalIndo(rec.tanggal)}</span>
                            <span class="riwayat-badge">${rec.jumlahHadir} Hadir</span>
                        </div>
                        <div class="riwayat-stats">
                            <span>Izin: ${rec.jumlahIzin}</span>
                            <span>Sakit: ${rec.jumlahSakit}</span>
                            <span>Alpa: ${rec.jumlahAlpa}</span>
                        </div>
                        ${rincian ? `<div class="riwayat-detail">${rincian}</div>` : ''}
                    </div>
                `;
            }).join('');
        } else {
            DOM.riwayatList.innerHTML = `<p class="empty-state">Belum ada riwayat absensi untuk kelas &amp; mapel ini.</p>`;
        }
    } catch (error) {
        DOM.riwayatLoading.classList.add('hidden');
        DOM.riwayatList.innerHTML = `<p class="empty-state">Gagal mengambil riwayat absensi.</p>`;
    }
}
// ===== SELESAI: PANEL RIWAYAT ABSENSI =====


// =========================================================
// PANEL DASHBOARD ANALITIK
// =========================================================
async function loadDashboard() {
    DOM.dashboardLoading.classList.remove('hidden');
    DOM.dashboardContent.classList.add('hidden');
    try {
        const resData = await fetchGas('getDashboardData', {
            mapel: AppState.session.mapel,
            kelas: AppState.session.kelas
        });
        DOM.dashboardLoading.classList.add('hidden');
        DOM.dashboardContent.classList.remove('hidden');
        if (resData.success) {
            renderRekapKelasMapel(resData.data.rekapKelasMapel);
            renderTrendChart(resData.data.trend);
            renderTopAlpa(resData.data.topAlpa);
        } else {
            DOM.dashboardContent.innerHTML = `<p class="empty-state">${resData.message || 'Belum ada data absensi untuk ditampilkan.'}</p>`;
        }
    } catch (error) {
        DOM.dashboardLoading.classList.add('hidden');
        DOM.dashboardContent.classList.remove('hidden');
        DOM.dashboardContent.innerHTML = `<p class="empty-state">Gagal memuat data dashboard.</p>`;
    }
}

function renderRekapKelasMapel(list) {
    if (!list || list.length === 0) {
        DOM.rekapKelasMapelList.innerHTML = `<p class="empty-state">Belum ada data.</p>`;
        return;
    }
    DOM.rekapKelasMapelList.innerHTML = list.map(item => `
        <div class="rekap-bar-item">
            <div class="rekap-bar-label">
                <span>${item.label}</span>
                <span>${item.persenHadir}%</span>
            </div>
            <div class="rekap-bar-track">
                <div class="rekap-bar-fill" style="width: ${item.persenHadir}%;"></div>
            </div>
        </div>
    `).join('');
}

function renderTopAlpa(list) {
    if (!list || list.length === 0) {
        DOM.topAlpaList.innerHTML = `<p class="empty-state">Tidak ada siswa dengan catatan Alpa. Bagus!</p>`;
        return;
    }
    DOM.topAlpaList.innerHTML = list.map((s, i) => `
        <div class="alpa-item">
            <span class="alpa-rank">${i + 1}</span>
            <span class="alpa-nama">${s.nama}</span>
            <span class="alpa-jumlah">${s.jumlahAlpa}x Alpa</span>
        </div>
    `).join('');
}

function renderTrendChart(trend) {
    AppState.destroyChart('trend');
    if (!trend || trend.length === 0) return;

    const chartInstance = new Chart(DOM.trendChart, {
        type: 'line',
        data: {
            labels: trend.map(t => formatTanggalIndo(t.tanggal)),
            datasets: [{
                label: '% Kehadiran',
                data: trend.map(t => t.persenHadir),
                borderColor: '#4F46E5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }
            },
            plugins: { legend: { display: false } }
        }
    });
    AppState.setChart('trend', chartInstance);
}
// ===== SELESAI: PANEL DASHBOARD ANALITIK =====


// =========================================================
// PANEL ABSEN WALI KELAS
// =========================================================
async function fetchStudentsWali(kelas) {
    const tbody = DOM.waliStudentsBody;
    const loading = DOM.waliLoading;
    const btnSubmit = DOM.waliBtnSubmit;
    tbody.innerHTML = '';
    btnSubmit.style.display = 'none';
    loading.classList.remove('hidden');

    try {
        let students = AppState.getStudents(kelas);
        if (!students) {
            const resData = await fetchGas('getStudents', { kelas });
            loading.classList.add('hidden');
            if (!resData.success || resData.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
                return;
            }
            students = resData.data;
            AppState.cacheStudents(kelas, students);
        } else {
            loading.classList.add('hidden');
        }
        StudentTable.render('waliStudentsBody', students);
        btnSubmit.style.display = 'block';
        await checkExistingAbsenWali();
    } catch (error) {
        loading.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
    }
}

async function checkExistingAbsenWali() {
    const kelas = AppState.session.kelasWali;
    const tanggalInput = DOM.waliTanggal;
    const tanggal = tanggalInput.value;
    const btnSubmit = DOM.waliBtnSubmit;
    if (!kelas || !tanggal) return;
    if (!StudentTable.hasData('waliStudentsBody')) return;

    btnSubmit.innerText = "Mengecek status...";
    try {
        const resData = await fetchGas('getAbsenWaliExisting', { kelas, tanggal });
        if (resData.success && resData.data) {
            const lanjutEdit = await showConfirmModal(
                `Absensi harian kelas ${kelas} untuk tanggal ${formatTanggalIndo(tanggal)} sudah pernah diisi sebelumnya. Lanjutkan untuk mengedit data yang sudah tersimpan?`
            );
            if (!lanjutEdit) {
                tanggalInput.value = '';
                btnSubmit.style.display = 'none';
                btnSubmit.innerText = "Simpan Absensi";
                return;
            }
            Object.entries(resData.data).forEach(([nis, status]) => {
                StudentTable.setStatus('waliStudentsBody', nis, status || 'H');
            });
            btnSubmit.innerText = "Perbarui Absensi";
        } else {
            StudentTable.resetAll('waliStudentsBody');
            btnSubmit.innerText = "Simpan Absensi";
        }
    } catch (error) {
        btnSubmit.innerText = "Simpan Absensi";
    }
}

// =========================================================
// SUBMIT ABSENSI WALI KELAS
// ---------------------------------------------------------
// PERUBAHAN PRIORITAS #5:
// Sama seperti panel mapel -- validasi form dulu sebelum submit.
// =========================================================
document.getElementById('waliAbsenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = DOM.waliBtnSubmit;

    // ===== VALIDASI FORM (Prioritas #5) =====
    const validationResult = FormValidator.validateWaliForm();
    if (!FormValidator.applyValidation(validationResult)) {
        showAlert('Mohon perbaiki field yang ditandai merah.', false);
        return;
    }

    const dataKehadiran = StudentTable.getAttendanceData('waliStudentsBody');
    const kelas = AppState.session.kelasWali;
    const tanggal = DOM.waliTanggal.value;
    btn.innerText = "Menyimpan...";
    btn.disabled = true;
    try {
        const resData = await fetchGas({
            action: 'submitAbsenWali',
            username: AppState.session.username,
            token: AppState.session.token,
            kelas,
            tanggal,
            dataKehadiran
        }, null, true);
        if (resData.success) {
            showAlert(resData.message, true);
            btn.innerText = "Perbarui Absensi";
            fetchRiwayatAbsenWali();
            FormValidator.clearAll();
        } else if (resData.sessionExpired) {
            showAlert(resData.message, false);
            setTimeout(logout, 1500);
        } else {
            showAlert(resData.message, false);
            btn.innerText = "Simpan Absensi";
        }
    } catch (error) {
        showAlert("Terjadi kesalahan jaringan saat menyimpan data.", false);
        btn.innerText = "Simpan Absensi";
    }
    btn.disabled = false;
});
// ===== SELESAI: SUBMIT ABSENSI WALI KELAS =====


// =========================================================
// RIWAYAT & REKAP ABSEN WALI KELAS
// =========================================================
async function fetchRiwayatAbsenWali() {
    if (!AppState.session.kelasWali) return;
    DOM.waliRiwayatList.innerHTML = '';
    DOM.waliRiwayatLoading.classList.remove('hidden');
    try {
        const resData = await fetchGas('getRiwayatAbsenWali', { kelas: AppState.session.kelasWali });
        DOM.waliRiwayatLoading.classList.add('hidden');
        if (resData.success && resData.data.length > 0) {
            DOM.waliRiwayatList.innerHTML = resData.data.map(rec => {
                const rincian = [
                    rec.namaIzin.length ? `Izin: ${rec.namaIzin.join(', ')}` : '',
                    rec.namaSakit.length ? `Sakit: ${rec.namaSakit.join(', ')}` : '',
                    rec.namaAlpa.length ? `Alpa: ${rec.namaAlpa.join(', ')}` : ''
                ].filter(Boolean).join(' &middot; ');
                return `
                    <div class="riwayat-card">
                        <div class="riwayat-header">
                            <span class="riwayat-tanggal">${formatTanggalIndo(rec.tanggal)}</span>
                            <span class="riwayat-badge">${rec.jumlahHadir} Hadir</span>
                        </div>
                        <div class="riwayat-stats">
                            <span>Izin: ${rec.jumlahIzin}</span>
                            <span>Sakit: ${rec.jumlahSakit}</span>
                            <span>Alpa: ${rec.jumlahAlpa}</span>
                        </div>
                        ${rincian ? `<div class="riwayat-detail">${rincian}</div>` : ''}
                    </div>
                `;
            }).join('');
        } else {
            DOM.waliRiwayatList.innerHTML = `<p class="empty-state">Belum ada riwayat absensi wali kelas.</p>`;
        }
    } catch (error) {
        DOM.waliRiwayatLoading.classList.add('hidden');
        DOM.waliRiwayatList.innerHTML = `<p class="empty-state">Gagal mengambil riwayat absensi wali kelas.</p>`;
    }
}

async function downloadRekapAbsenWali() {
    if (!AppState.session.kelasWali) return;
    const btn = document.getElementById('btnRekapWali');
    const originalText = btn.innerHTML;
    btn.innerText = "Menyiapkan file...";
    btn.disabled = true;
    try {
        const resData = await fetchGas('getRekapAbsenWali', { kelas: AppState.session.kelasWali });
        if (resData.success) {
            const wb = XLSX.utils.book_new();
            resData.data.forEach(sheetInfo => {
                const ws = XLSX.utils.aoa_to_sheet([sheetInfo.headerRow, ...sheetInfo.rows]);
                XLSX.utils.book_append_sheet(wb, ws, sheetInfo.tabName);
            });
            const namaFile = `Rekap_Wali_${AppState.session.kelasWali}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, namaFile);
            showAlert("Rekap wali kelas berhasil dibuat dan diunduh!", true);
        } else {
            showAlert(resData.message, false);
        }
    } catch (error) {
        showAlert("Terjadi kesalahan saat menyiapkan file rekap wali kelas.", false);
    }
    btn.innerHTML = originalText;
    btn.disabled = false;
}
// ===== SELESAI: RIWAYAT & REKAP ABSEN WALI KELAS =====
