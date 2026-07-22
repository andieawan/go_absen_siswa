// =========================================================
// KONFIGURASI
// =========================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyMGAl2rTMzOEVkosA-QKNrVvo69x3WZPrYgRBRcVF9JL-K1guOv-zJAWnisfCZ1t8n/exec';

// =========================================================
// STATE MANAGEMENT TERPUSAT
// =========================================================
const AppState = {
    session: null,
    studentCache: {},
    ui: {
        currentTab: 'panelAbsensi',
        currentSubTab: 'subtabMapel',
        charts: {},
        fabOpen: false
    },

    loadSession() {
        try {
            const saved = sessionStorage.getItem('guruSession');
            this.session = saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.warn('Gagal memuat sesi:', e);
            this.session = null;
        }
        return this.session;
    },

    setSession(data) {
        this.session = data;
        try {
            sessionStorage.setItem('guruSession', JSON.stringify(data));
        } catch (e) {
            console.warn('Gagal menyimpan sesi:', e);
        }
    },

    clearSession() {
        this.session = null;
        try {
            sessionStorage.removeItem('guruSession');
        } catch (e) {
            console.warn('Gagal menghapus sesi:', e);
        }
    },

    cacheStudents(kelas, students) {
        this.studentCache[kelas] = students;
    },

    getStudents(kelas) {
        return this.studentCache[kelas];
    },

    setChart(name, chartInstance) {
        this.destroyChart(name);
        this.ui.charts[name] = chartInstance;
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
        this.ui.currentSubTab = 'subtabMapel';
        this.ui.fabOpen = false;
        this.clearSession();
    },

    debug() {
        console.group('🔍 AppState');
        console.log('Session:', this.session);
        console.log('Student Cache:', this.studentCache);
        console.log('UI State:', this.ui);
        console.groupEnd();
    }
};

AppState.loadSession();

// =========================================================
// REFERENSI DOM
// =========================================================
const DOM = {
    loginSection: document.getElementById('loginSection'),
    dashboardSection: document.getElementById('dashboardSection'),
    greeting: document.getElementById('greeting'),
    headerDate: document.getElementById('headerDate'),
    tanggalAbsen: document.getElementById('tanggalAbsen'),
    selectMapel: document.getElementById('selectMapel'),
    selectKelas: document.getElementById('selectKelas'),
    skeletonLoader: document.getElementById('skeletonLoader'),
    studentsBody: document.getElementById('studentsBody'),
    btnSubmit: document.getElementById('btnSubmit'),
    loginMsg: document.getElementById('loginMsg'),
    tabBtnAbsenWali: document.getElementById('tabBtnAbsenWali'),
    waliKelasLabel: document.getElementById('waliKelasLabel'),
    waliTanggal: document.getElementById('waliTanggal'),
    waliSkeletonLoader: document.getElementById('waliSkeletonLoader'),
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
    // BARU: sub-tab wali di panel Riwayat
    subtabBtnWali: document.getElementById('subtabBtnWali'),
    riwayatWaliKelasLabel: document.getElementById('riwayatWaliKelasLabel'),
    riwayatWaliList: document.getElementById('riwayatWaliList'),
    riwayatWaliLoading: document.getElementById('riwayatWaliLoading'),
    // BARU: dashboard wali
    dashboardWaliSection: document.getElementById('dashboardWaliSection'),
    waliStatPertemuan: document.getElementById('waliStatPertemuan'),
    waliStatSiswa: document.getElementById('waliStatSiswa'),
    waliStatRataHadir: document.getElementById('waliStatRataHadir'),
    waliStatRataAlpa: document.getElementById('waliStatRataAlpa'),
    waliDistribusiList: document.getElementById('waliDistribusiList'),
    waliTopAlpaList: document.getElementById('waliTopAlpaList'),
    trendChartWali: document.getElementById('trendChartWali'),
    // BARU: panel rekap
    rekapMapelJumlahMapel: document.getElementById('rekapMapelJumlahMapel'),
    rekapMapelJumlahKelas: document.getElementById('rekapMapelJumlahKelas'),
    rekapWaliCard: document.getElementById('rekapWaliCard'),
    rekapWaliKelasLabel: document.getElementById('rekapWaliKelasLabel'),
    // Lainnya
    waliRiwayatList: document.getElementById('waliRiwayatList'),
    waliRiwayatLoading: document.getElementById('waliRiwayatLoading'),
    dashboardLoading: document.getElementById('dashboardLoading'),
    dashboardContent: document.getElementById('dashboardContent'),
    rekapKelasMapelList: document.getElementById('rekapKelasMapelList'),
    topAlpaList: document.getElementById('topAlpaList'),
    trendChart: document.getElementById('trendChart'),
    toastContainer: document.getElementById('toastContainer'),
    fabContainer: document.getElementById('fabContainer'),
    fabMain: document.getElementById('fabMain'),
    fabMenu: document.getElementById('fabMenu')
};

if (AppState.session) showDashboard();

// =========================================================
// TOAST NOTIFICATION
// =========================================================
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const titles = { success: 'Berhasil', error: 'Gagal', warning: 'Peringatan', info: 'Informasi' };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    DOM.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// =========================================================
// SKELETON & PROGRESS
// =========================================================
function showSkeleton(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function hideSkeleton(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function showButtonProgress(btn) {
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    const progress = btn.querySelector('.btn-progress');
    if (text) text.classList.add('hidden');
    if (loader) loader.classList.remove('hidden');
    if (progress) progress.classList.remove('hidden');
}

function hideButtonProgress(btn) {
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    const progress = btn.querySelector('.btn-progress');
    if (text) text.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');
    if (progress) progress.classList.add('hidden');
}

// =========================================================
// FAB
// =========================================================
function toggleFab() {
    AppState.ui.fabOpen = !AppState.ui.fabOpen;
    DOM.fabMain.classList.toggle('active', AppState.ui.fabOpen);
    DOM.fabMenu.classList.toggle('active', AppState.ui.fabOpen);
}

function closeFab() {
    AppState.ui.fabOpen = false;
    DOM.fabMain.classList.remove('active');
    DOM.fabMenu.classList.remove('active');
}

function quickAbsenHariIni() {
    closeFab();
    switchTab('panelAbsensi');
    DOM.tanggalAbsen.valueAsDate = new Date();
    setTimeout(() => DOM.selectKelas.focus(), 300);
    showToast('Siap untuk absen hari ini!', 'info');
}

function quickLihatRiwayat() {
    closeFab();
    switchTab('panelRiwayat');
}

// BARU: quick action untuk buka tab Rekap
function quickBukaRekap() {
    closeFab();
    switchTab('panelRekap');
}

// =========================================================
// FUNGSI BANTUAN
// =========================================================
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

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
        options = { method: 'GET', mode: 'cors', redirect: 'follow' };
    }
    const response = await fetch(url, options);
    return await response.json();
}

function formatTanggalIndo(tanggalStr) {
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const [y, m, d] = tanggalStr.split('-');
    return `${parseInt(d, 10)} ${bulan[parseInt(m, 10) - 1]} ${y}`;
}

function formatTanggalPanjang(date) {
    const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${hari[date.getDay()]}, ${date.getDate()} ${bulan[date.getMonth()]} ${date.getFullYear()}`;
}

function splitNisList(str) {
    return (str || "").toString().split(',').map(s => s.trim()).filter(s => s !== "");
}

// =========================================================
// STUDENT TABLE COMPONENT
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
                        <label><input type="radio" name="${radioName}" value="H" checked required> ✓ Hadir</label>
                        <label><input type="radio" name="${radioName}" value="I"> 📝 Izin</label>
                        <label><input type="radio" name="${radioName}" value="S"> 🤒 Sakit</label>
                        <label><input type="radio" name="${radioName}" value="A"> ❌ Alpa</label>
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

    setAllTo(tbodyId, status) {
        const rows = document.querySelectorAll(`#${tbodyId} tr.student-row`);
        rows.forEach(row => {
            const targetRadio = row.querySelector(`input[type="radio"][value="${status}"]`);
            if (targetRadio) targetRadio.checked = true;
        });
    },

    getAttendanceData(tbodyId) {
        const rows = document.querySelectorAll(`#${tbodyId} tr.student-row`);
        const data = [];
        rows.forEach(row => {
            const nis = row.dataset.nis;
            const checked = row.querySelector('input[type="radio"]:checked');
            if (nis && checked) data.push({ nis, status: checked.value });
        });
        return data;
    },

    hasData(tbodyId) {
        return document.querySelectorAll(`#${tbodyId} tr.student-row`).length > 0;
    }
};

// =========================================================
// FORM VALIDATOR
// =========================================================
const FormValidator = {
    WARNING_DAYS_THRESHOLD: 60,

    init() {
        document.addEventListener('change', (e) => {
            if (e.target.id === 'tanggalAbsen' || e.target.id === 'waliTanggal') {
                this.validateDateRealtime(e.target.id);
            }
        });

        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('field-error')) {
                this.clearFieldError(e.target.id);
            }
        });
    },

    validateAbsenForm() {
        const errors = [];
        const warnings = [];

        if (!DOM.selectMapel.value) errors.push({ field: 'selectMapel', message: 'Mata pelajaran harus dipilih' });
        if (!DOM.selectKelas.value) errors.push({ field: 'selectKelas', message: 'Kelas harus dipilih' });

        const tanggal = DOM.tanggalAbsen.value;
        if (!tanggal) {
            errors.push({ field: 'tanggalAbsen', message: 'Tanggal harus diisi' });
        } else {
            if (this.isDateInFuture(tanggal)) {
                errors.push({ field: 'tanggalAbsen', message: 'Tanggal tidak boleh di masa depan' });
            } else if (this.isDateTooOld(tanggal, this.WARNING_DAYS_THRESHOLD)) {
                warnings.push({ field: 'tanggalAbsen', message: `Tanggal lebih dari ${this.WARNING_DAYS_THRESHOLD} hari yang lalu` });
            }
        }

        return { errors, warnings };
    },

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
                warnings.push({ field: 'waliTanggal', message: `Tanggal lebih dari ${this.WARNING_DAYS_THRESHOLD} hari yang lalu` });
            }
        }

        return { errors, warnings };
    },

    isDateInFuture(dateStr) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const selectedDate = new Date(dateStr + 'T00:00:00');
        return selectedDate > today;
    },

    isDateTooOld(dateStr, days) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selectedDate = new Date(dateStr + 'T00:00:00');
        const diffDays = (today - selectedDate) / (1000 * 60 * 60 * 24);
        return diffDays > days;
    },

    validateDateRealtime(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        const tanggal = field.value;

        this.clearFieldError(fieldId);
        this.clearFieldWarning(fieldId);

        if (!tanggal) return;

        if (this.isDateInFuture(tanggal)) {
            this.showFieldError(fieldId, 'Tanggal tidak boleh di masa depan');
        } else if (this.isDateTooOld(tanggal, this.WARNING_DAYS_THRESHOLD)) {
            this.showFieldWarning(fieldId, `Tanggal lebih dari ${this.WARNING_DAYS_THRESHOLD} hari yang lalu`);
        }
    },

    showFieldError(fieldId, message) {
        this.clearFieldError(fieldId);
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.classList.add('field-error');
        const errorEl = document.createElement('div');
        errorEl.className = 'field-error-message';
        errorEl.setAttribute('role', 'alert');
        errorEl.innerText = '⚠ ' + message;
        field.parentElement.appendChild(errorEl);
    },

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

    clearFieldError(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.classList.remove('field-error');
        const existing = field.parentElement.querySelector('.field-error-message');
        if (existing) existing.remove();
    },

    clearFieldWarning(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.classList.remove('field-warning');
        const existing = field.parentElement.querySelector('.field-warning-message');
        if (existing) existing.remove();
    },

    clearAll() {
        document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
        document.querySelectorAll('.field-error-message').forEach(el => el.remove());
        document.querySelectorAll('.field-warning').forEach(el => el.classList.remove('field-warning'));
        document.querySelectorAll('.field-warning-message').forEach(el => el.remove());
    },

    applyValidation(result) {
        this.clearAll();
        result.errors.forEach(err => this.showFieldError(err.field, err.message));
        result.warnings.forEach(warn => this.showFieldWarning(warn.field, warn.message));

        if (result.errors.length > 0) {
            const firstErrorField = document.getElementById(result.errors[0].field);
            if (firstErrorField) {
                firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => firstErrorField.focus(), 400);
            }
            return false;
        }
        return true;
    }
};

FormValidator.init();

// =========================================================
// EVENT DELEGATION
// =========================================================
const EventDelegation = {
    init() {
        // Tombol aksi global
        document.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                e.preventDefault();
                this.handleAction(actionBtn.dataset.action);
            }
        });

        // Tab navigation
        document.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn && tabBtn.dataset.tab) {
                e.preventDefault();
                switchTab(tabBtn.dataset.tab);
            }
        });

        // BARU: Sub-tab navigation (untuk panel Riwayat)
        document.addEventListener('click', (e) => {
            const subTabBtn = e.target.closest('.sub-tab-btn');
            if (subTabBtn && subTabBtn.dataset.subtab) {
                e.preventDefault();
                switchSubTab(subTabBtn.dataset.subtab);
            }
        });

        // FAB
        document.addEventListener('click', (e) => {
            if (e.target.closest('#fabMain')) toggleFab();
        });

        // Quick status buttons
        document.addEventListener('click', (e) => {
            const quickBtn = e.target.closest('[data-quick-status]');
            if (quickBtn) {
                const status = quickBtn.dataset.quickStatus;
                const target = quickBtn.dataset.target || 'mapel';
                const tbodyId = target === 'wali' ? 'waliStudentsBody' : 'studentsBody';
                
                if (status === 'reset') {
                    StudentTable.resetAll(tbodyId);
                    showToast('Status direset ke Hadir', 'info');
                } else {
                    StudentTable.setAllTo(tbodyId, status);
                    showToast(`Semua siswa di-set ${status === 'H' ? 'Hadir' : status}`, 'success');
                }
            }
        });

        // Radio button highlight
        document.addEventListener('change', (e) => {
            if (e.target.matches('.student-row input[type="radio"]')) {
                const row = e.target.closest('.student-row');
                if (row) {
                    const tbody = row.closest('tbody');
                    tbody.querySelectorAll('.student-row').forEach(r => r.classList.remove('selected'));
                    row.classList.add('selected');
                }
            }
        });

        // Dropdown & tanggal change
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

        // Tutup FAB saat klik di luar
        document.addEventListener('click', (e) => {
            if (AppState.ui.fabOpen && !e.target.closest('.fab-container')) {
                closeFab();
            }
        });

        console.log('✅ Event delegation initialized');
    },

    handleAction(action) {
        switch (action) {
            case 'downloadRekapKelasSaya':
                downloadRekapKelasSaya();
                break;
            case 'downloadRekapAbsenWali':
                downloadRekapAbsenWali();
                break;
            case 'logout':
                logout();
                break;
            case 'quickAbsenHariIni':
                quickAbsenHariIni();
                break;
            case 'quickLihatRiwayat':
                quickLihatRiwayat();
                break;
            case 'quickBukaRekap':
                quickBukaRekap();
                break;
            default:
                console.warn(`Action tidak dikenal: ${action}`);
        }
    }
};

EventDelegation.init();

// =========================================================
// MODAL
// =========================================================
function showAlert(message, isSuccess = true) {
    if (isSuccess) {
        DOM.alertIcon.innerHTML = '✓';
        DOM.alertIcon.className = 'modal-icon icon-success';
        DOM.alertTitle.innerText = 'Berhasil!';
    } else {
        DOM.alertIcon.innerHTML = '✕';
        DOM.alertIcon.className = 'modal-icon icon-error';
        DOM.alertTitle.innerText = 'Oops!';
    }
    DOM.alertMessage.innerText = message;
    DOM.customAlert.classList.add('active');
}

function closeCustomAlert() {
    DOM.customAlert.classList.remove('active');
}

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

// =========================================================
// LOGIN
// =========================================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const btn = e.target.querySelector('button');
    
    btn.querySelector('.btn-text').classList.add('hidden');
    btn.querySelector('.btn-loader').classList.remove('hidden');
    btn.disabled = true;
    DOM.loginMsg.innerText = '';
    
    try {
        const resData = await fetchGas({ action: 'login', username: user, password: pass }, null, true);
        if (resData.success) {
            AppState.setSession(resData.data);
            showToast(`Selamat datang, ${resData.data.nama}!`, 'success');
            showDashboard();
        } else {
            DOM.loginMsg.innerText = resData.message;
        }
    } catch (error) {
        DOM.loginMsg.innerText = "Gagal terhubung ke server.";
    }
    
    btn.querySelector('.btn-text').classList.remove('hidden');
    btn.querySelector('.btn-loader').classList.add('hidden');
    btn.disabled = false;
});

// =========================================================
// DASHBOARD
// =========================================================
function showDashboard() {
    const session = AppState.session;
    if (!session) return;

    DOM.loginSection.classList.add('hidden');
    DOM.dashboardSection.classList.remove('hidden');
    DOM.greeting.innerText = `Halo, ${session.nama}`;
    DOM.headerDate.innerText = formatTanggalPanjang(new Date());
    DOM.tanggalAbsen.valueAsDate = new Date();

    const mapelArr = session.mapel.split(',').map(s => s.trim());
    DOM.selectMapel.innerHTML = mapelArr.map(m => `<option value="${m}">${m}</option>`).join('');

    const kelasArr = session.kelas.split(',').map(s => s.trim());
    DOM.selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' +
                                kelasArr.map(k => `<option value="${k}">${k}</option>`).join('');

    // Tampilkan FAB
    DOM.fabContainer.classList.remove('hidden');

    // BARU: Update info di panel Rekap
    DOM.rekapMapelJumlahMapel.innerText = `📚 ${mapelArr.length} Mata Pelajaran`;
    DOM.rekapMapelJumlahKelas.innerText = `🏫 ${kelasArr.length} Kelas`;

    if (session.kelasWali) {
        DOM.tabBtnAbsenWali.classList.remove('hidden');
        DOM.waliKelasLabel.innerText = session.kelasWali;
        DOM.waliTanggal.valueAsDate = new Date();
        
        // BARU: tampilkan sub-tab wali di panel Riwayat
        DOM.subtabBtnWali.classList.remove('hidden');
        DOM.riwayatWaliKelasLabel.innerText = session.kelasWali;
        
        // BARU: tampilkan card rekap wali
        DOM.rekapWaliCard.classList.remove('hidden');
        DOM.rekapWaliKelasLabel.innerText = `👪 Kelas: ${session.kelasWali}`;
        
        // BARU: tampilkan section dashboard wali
        DOM.dashboardWaliSection.classList.remove('hidden');
        
        fetchStudentsWali(session.kelasWali);
        fetchRiwayatAbsenWali();
    } else {
        DOM.tabBtnAbsenWali.classList.add('hidden');
        DOM.subtabBtnWali.classList.add('hidden');
        DOM.rekapWaliCard.classList.add('hidden');
        DOM.dashboardWaliSection.classList.add('hidden');
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');

    AppState.ui.currentTab = tabId;
    FormValidator.clearAll();

    if (tabId === 'panelRiwayat') {
        setupRiwayatSelectors();
        // Kalau sub-tab aktif adalah wali, load data wali
        if (AppState.ui.currentSubTab === 'subtabWali' && AppState.session.kelasWali) {
            fetchRiwayatWaliDiPanelRiwayat();
        }
    }
    if (tabId === 'panelDashboard') loadDashboard();
}

// BARU: switch sub-tab di panel Riwayat
function switchSubTab(subtabId) {
    document.querySelectorAll('.sub-tab-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(subtabId).classList.remove('hidden');
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.sub-tab-btn[data-subtab="${subtabId}"]`).classList.add('active');
    
    AppState.ui.currentSubTab = subtabId;
    
    // Load data saat sub-tab dibuka
    if (subtabId === 'subtabWali' && AppState.session.kelasWali) {
        fetchRiwayatWaliDiPanelRiwayat();
    }
}

// =========================================================
// FETCH DATA SISWA
// =========================================================
async function fetchStudents(kelas) {
    const tbody = DOM.studentsBody;
    const btnSubmit = DOM.btnSubmit;
    tbody.innerHTML = '';
    btnSubmit.classList.add('hidden');
    
    showSkeleton('skeletonLoader');

    try {
        let students = AppState.getStudents(kelas);
        if (!students) {
            const resData = await fetchGas('getStudents', { kelas });
            hideSkeleton('skeletonLoader');
            if (!resData.success || resData.data.length === 0) {
                tbody.innerHTML = `<tr class="empty-row"><td colspan="3"><div class="empty-state-illustration"><p>${resData.message || 'Tidak ada data siswa.'}</p></div></td></tr>`;
                return;
            }
            students = resData.data;
            AppState.cacheStudents(kelas, students);
        } else {
            hideSkeleton('skeletonLoader');
        }
        StudentTable.render('studentsBody', students);
        btnSubmit.classList.remove('hidden');
        await checkExistingAttendance();
    } catch (error) {
        hideSkeleton('skeletonLoader');
        tbody.innerHTML = `<tr class="empty-row"><td colspan="3"><div class="empty-state-illustration"><p>Gagal mengambil data siswa.</p></div></td></tr>`;
    }
}

async function checkExistingAttendance() {
    const mapel = DOM.selectMapel.value;
    const kelas = DOM.selectKelas.value;
    const tanggalInput = DOM.tanggalAbsen;
    const tanggal = tanggalInput.value;
    const guru = AppState.session.nama;
    const btnSubmit = DOM.btnSubmit;
    if (!mapel || !kelas || !tanggal) return;
    if (!StudentTable.hasData('studentsBody')) return;

    try {
        const resData = await fetchGas('getExistingAttendance', { guru, mapel, kelas, tanggal });
        if (resData.success && resData.data) {
            const lanjutEdit = await showConfirmModal(
                `Absensi untuk ${kelas} - ${mapel} pada ${formatTanggalIndo(tanggal)} sudah ada. Edit data?`
            );
            if (!lanjutEdit) {
                tanggalInput.value = '';
                btnSubmit.classList.add('hidden');
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
            btnSubmit.querySelector('.btn-text').innerText = '💾 Perbarui Absensi';
        } else {
            StudentTable.resetAll('studentsBody');
            btnSubmit.querySelector('.btn-text').innerText = '💾 Simpan Absensi';
        }
    } catch (error) {
        btnSubmit.querySelector('.btn-text').innerText = '💾 Simpan Absensi';
    }
}

// =========================================================
// SUBMIT ABSENSI
// =========================================================
document.getElementById('absenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = DOM.btnSubmit;

    const validationResult = FormValidator.validateAbsenForm();
    if (!FormValidator.applyValidation(validationResult)) {
        showToast('Mohon perbaiki field yang ditandai', 'error');
        return;
    }

    const attendanceData = StudentTable.getAttendanceData('studentsBody');
    const payload = {
        guru: AppState.session.nama,
        mapel: DOM.selectMapel.value,
        kelas: DOM.selectKelas.value,
        tanggal: DOM.tanggalAbsen.value,
        attendance: attendanceData
    };
    
    btn.disabled = true;
    showButtonProgress(btn);
    
    try {
        const resData = await fetchGas({
            action: 'submit',
            username: AppState.session.username,
            token: AppState.session.token,
            payload: payload
        }, null, true);
        
        if (resData.success) {
            showToast(resData.message, 'success');
            btn.querySelector('.btn-text').innerText = '💾 Perbarui Absensi';
            FormValidator.clearAll();
        } else if (resData.sessionExpired) {
            showAlert(resData.message, false);
            setTimeout(logout, 1500);
        } else {
            showToast(resData.message, 'error');
        }
    } catch (error) {
        showToast("Terjadi kesalahan jaringan", 'error');
    }
    
    btn.disabled = false;
    hideButtonProgress(btn);
});

// =========================================================
// REKAP
// =========================================================
async function downloadRekapKelasSaya() {
    showToast('Menyiapkan file rekap...', 'info');
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
            showToast("Rekap berhasil diunduh!", 'success');
        } else {
            showToast(resData.message, 'error');
        }
    } catch (error) {
        showToast("Gagal menyiapkan file rekap", 'error');
    }
}

async function downloadRekapAbsenWali() {
    if (!AppState.session.kelasWali) return;
    showToast('Menyiapkan file rekap wali...', 'info');
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
            showToast("Rekap wali berhasil diunduh!", 'success');
        } else {
            showToast(resData.message, 'error');
        }
    } catch (error) {
        showToast("Gagal menyiapkan file rekap wali", 'error');
    }
}

function logout() {
    AppState.reset();
    window.location.reload();
}

// =========================================================
// RIWAYAT (Per Mapel)
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
    showSkeleton('riwayatLoading');
    
    try {
        const resData = await fetchGas('getRiwayatAbsensi', { mapel, kelas });
        hideSkeleton('riwayatLoading');
        if (resData.success && resData.data.length > 0) {
            DOM.riwayatList.innerHTML = resData.data.map(rec => {
                const rincian = [
                    rec.namaIzin.length ? `📝 Izin: ${rec.namaIzin.join(', ')}` : '',
                    rec.namaSakit.length ? `🤒 Sakit: ${rec.namaSakit.join(', ')}` : '',
                    rec.namaAlpa.length ? `❌ Alpa: ${rec.namaAlpa.join(', ')}` : ''
                ].filter(Boolean).join(' · ');
                return `
                    <div class="riwayat-card">
                        <div class="riwayat-header">
                            <span class="riwayat-tanggal">📅 ${formatTanggalIndo(rec.tanggal)}</span>
                            <span class="riwayat-badge">✓ ${rec.jumlahHadir} Hadir</span>
                        </div>
                        <div class="riwayat-stats">
                            <span>📝 ${rec.jumlahIzin}</span>
                            <span>🤒 ${rec.jumlahSakit}</span>
                            <span>❌ ${rec.jumlahAlpa}</span>
                        </div>
                        ${rincian ? `<div class="riwayat-detail">${rincian}</div>` : ''}
                    </div>
                `;
            }).join('');
        } else {
            DOM.riwayatList.innerHTML = `<div class="empty-state-illustration large"><svg viewBox="0 0 200 150"><circle cx="100" cy="75" r="50" fill="#E0E7FF"/><text x="100" y="85" text-anchor="middle" font-size="40">📚</text></svg><p>Belum ada riwayat absensi</p></div>`;
        }
    } catch (error) {
        hideSkeleton('riwayatLoading');
        DOM.riwayatList.innerHTML = `<div class="empty-state-illustration"><p>Gagal mengambil riwayat</p></div>`;
    }
}

// BARU: Riwayat Wali di Panel Riwayat (sub-tab "Per Kelas (Wali)")
async function fetchRiwayatWaliDiPanelRiwayat() {
    if (!AppState.session.kelasWali) return;
    
    DOM.riwayatWaliList.innerHTML = '';
    showSkeleton('riwayatWaliLoading');
    
    try {
        const resData = await fetchGas('getRiwayatAbsenWali', { kelas: AppState.session.kelasWali });
        hideSkeleton('riwayatWaliLoading');
        if (resData.success && resData.data.length > 0) {
            DOM.riwayatWaliList.innerHTML = resData.data.map(rec => {
                const rincian = [
                    rec.namaIzin.length ? `📝 Izin: ${rec.namaIzin.join(', ')}` : '',
                    rec.namaSakit.length ? `🤒 Sakit: ${rec.namaSakit.join(', ')}` : '',
                    rec.namaAlpa.length ? `❌ Alpa: ${rec.namaAlpa.join(', ')}` : ''
                ].filter(Boolean).join(' · ');
                return `
                    <div class="riwayat-card">
                        <div class="riwayat-header">
                            <span class="riwayat-tanggal">📅 ${formatTanggalIndo(rec.tanggal)}</span>
                            <span class="riwayat-badge">✓ ${rec.jumlahHadir} Hadir</span>
                        </div>
                        <div class="riwayat-stats">
                            <span>📝 ${rec.jumlahIzin}</span>
                            <span>🤒 ${rec.jumlahSakit}</span>
                            <span>❌ ${rec.jumlahAlpa}</span>
                        </div>
                        ${rincian ? `<div class="riwayat-detail">${rincian}</div>` : ''}
                    </div>
                `;
            }).join('');
        } else {
            DOM.riwayatWaliList.innerHTML = `<div class="empty-state-illustration large"><svg viewBox="0 0 200 150"><circle cx="100" cy="75" r="50" fill="#E0E7FF"/><text x="100" y="85" text-anchor="middle" font-size="40">👨‍👩‍👧</text></svg><p>Belum ada riwayat absensi wali kelas</p></div>`;
        }
    } catch (error) {
        hideSkeleton('riwayatWaliLoading');
        DOM.riwayatWaliList.innerHTML = `<div class="empty-state-illustration"><p>Gagal mengambil riwayat</p></div>`;
    }
}

// =========================================================
// DASHBOARD ANALITIK (UMUM + WALI)
// =========================================================
async function loadDashboard() {
    showSkeleton('dashboardLoading');
    DOM.dashboardContent.classList.add('hidden');
    
    try {
        const resData = await fetchGas('getDashboardData', {
            mapel: AppState.session.mapel,
            kelas: AppState.session.kelas
        });
        hideSkeleton('dashboardLoading');
        DOM.dashboardContent.classList.remove('hidden');
        if (resData.success) {
            renderRekapKelasMapel(resData.data.rekapKelasMapel);
            renderTrendChart(resData.data.trend);
            renderTopAlpa(resData.data.topAlpa);
        } else {
            DOM.dashboardContent.innerHTML = `<div class="empty-state-illustration large"><p>${resData.message || 'Belum ada data'}</p></div>`;
        }
        
        // BARU: load dashboard wali kalau guru adalah wali kelas
        if (AppState.session.kelasWali) {
            loadDashboardWali();
        }
    } catch (error) {
        hideSkeleton('dashboardLoading');
        DOM.dashboardContent.classList.remove('hidden');
        DOM.dashboardContent.innerHTML = `<div class="empty-state-illustration"><p>Gagal memuat dashboard</p></div>`;
    }
}

function renderRekapKelasMapel(list) {
    if (!list || list.length === 0) {
        DOM.rekapKelasMapelList.innerHTML = `<div class="empty-state-illustration"><p>Belum ada data</p></div>`;
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
        DOM.topAlpaList.innerHTML = `<div class="empty-state-illustration"><p>🎉 Tidak ada siswa dengan catatan Alpa</p></div>`;
        return;
    }
    DOM.topAlpaList.innerHTML = list.map((s, i) => `
        <div class="alpa-item">
            <span class="alpa-rank">${i + 1}</span>
            <span class="alpa-nama">${s.nama}</span>
            <span class="alpa-jumlah">${s.jumlahAlpa}x</span>
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
                borderColor: '#6366F1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#6366F1',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }
            },
            plugins: { legend: { display: false } }
        }
    });
    AppState.setChart('trend', chartInstance);
}

// =========================================================
// BARU: DASHBOARD WALI KELAS
// ---------------------------------------------------------
// Memuat data dari endpoint getDashboardDataWali dan render:
// - Stats cards (pertemuan, siswa, rata-rata hadir, rata-rata alpa)
// - Distribusi status (bar chart H/I/S/A)
// - Tren kehadiran harian (line chart)
// - Top alpa di kelas wali
// =========================================================
async function loadDashboardWali() {
    const kelas = AppState.session.kelasWali;
    if (!kelas) return;
    
    try {
        const resData = await fetchGas('getDashboardDataWali', { kelas });
        if (!resData.success) {
            // Kalau belum ada data, tampilkan pesan di section wali
            DOM.waliStatPertemuan.innerText = '0';
            DOM.waliStatSiswa.innerText = '0';
            DOM.waliStatRataHadir.innerText = '0%';
            DOM.waliStatRataAlpa.innerText = '0%';
            DOM.waliDistribusiList.innerHTML = `<div class="empty-state-illustration"><p>${resData.message}</p></div>`;
            DOM.waliTopAlpaList.innerHTML = '';
            AppState.destroyChart('trendWali');
            return;
        }
        
        const data = resData.data;
        
        // Stats cards
        DOM.waliStatPertemuan.innerText = data.totalPertemuan;
        DOM.waliStatSiswa.innerText = data.totalSiswa;
        DOM.waliStatRataHadir.innerText = data.rataRata.hadir + '%';
        DOM.waliStatRataAlpa.innerText = data.rataRata.alpa + '%';
        
        // Distribusi status
        renderDistribusiStatus(data.rataRata);
        
        // Tren kehadiran harian
        renderTrendChartWali(data.statistikHarian);
        
        // Top alpa
        renderTopAlpaWali(data.topAlpa);
        
    } catch (error) {
        console.error('Gagal memuat dashboard wali:', error);
        DOM.waliDistribusiList.innerHTML = `<div class="empty-state-illustration"><p>Gagal memuat data dashboard wali</p></div>`;
    }
}

// Render distribusi status (H/I/S/A) sebagai bar chart horizontal
function renderDistribusiStatus(rataRata) {
    const items = [
        { label: 'Hadir', icon: '✓', value: rataRata.hadir, class: 'hadir' },
        { label: 'Izin', icon: '📝', value: rataRata.izin, class: 'izin' },
        { label: 'Sakit', icon: '🤒', value: rataRata.sakit, class: 'sakit' },
        { label: 'Alpa', icon: '❌', value: rataRata.alpa, class: 'alpa' }
    ];
    
    DOM.waliDistribusiList.innerHTML = items.map(item => `
        <div class="distribusi-item">
            <div class="distribusi-label">
                <span class="distribusi-label-status">
                    <span>${item.icon}</span>
                    <span>${item.label}</span>
                </span>
                <span>${item.value}%</span>
            </div>
            <div class="distribusi-track">
                <div class="distribusi-fill ${item.class}" style="width: ${item.value}%;"></div>
            </div>
        </div>
    `).join('');
}

// Render tren kehadiran harian kelas wali (line chart)
function renderTrendChartWali(statistikHarian) {
    AppState.destroyChart('trendWali');
    if (!statistikHarian || statistikHarian.length === 0) return;
    
    const chartInstance = new Chart(DOM.trendChartWali, {
        type: 'line',
        data: {
            labels: statistikHarian.map(s => formatTanggalIndo(s.tanggal)),
            datasets: [{
                label: '% Kehadiran Harian',
                data: statistikHarian.map(s => s.persenHadir),
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: '#10B981',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Kehadiran: ${ctx.parsed.y}%`
                    }
                }
            }
        }
    });
    AppState.setChart('trendWali', chartInstance);
}

// Render top alpa di kelas wali
function renderTopAlpaWali(list) {
    if (!list || list.length === 0) {
        DOM.waliTopAlpaList.innerHTML = `<div class="empty-state-illustration"><p>🎉 Tidak ada siswa dengan catatan Alpa di kelas wali</p></div>`;
        return;
    }
    DOM.waliTopAlpaList.innerHTML = list.map((s, i) => `
        <div class="alpa-item">
            <span class="alpa-rank">${i + 1}</span>
            <span class="alpa-nama">${s.nama}</span>
            <span class="alpa-jumlah">${s.jumlahAlpa}x</span>
        </div>
    `).join('');
}
// ===== SELESAI: DASHBOARD WALI KELAS =====

// =========================================================
// ABSEN WALI
// =========================================================
async function fetchStudentsWali(kelas) {
    const tbody = DOM.waliStudentsBody;
    const btnSubmit = DOM.waliBtnSubmit;
    tbody.innerHTML = '';
    btnSubmit.classList.add('hidden');
    
    showSkeleton('waliSkeletonLoader');

    try {
        let students = AppState.getStudents(kelas);
        if (!students) {
            const resData = await fetchGas('getStudents', { kelas });
            hideSkeleton('waliSkeletonLoader');
            if (!resData.success || resData.data.length === 0) {
                tbody.innerHTML = `<tr class="empty-row"><td colspan="3"><div class="empty-state-illustration"><p>${resData.message || 'Tidak ada data siswa.'}</p></div></td></tr>`;
                return;
            }
            students = resData.data;
            AppState.cacheStudents(kelas, students);
        } else {
            hideSkeleton('waliSkeletonLoader');
        }
        StudentTable.render('waliStudentsBody', students);
        btnSubmit.classList.remove('hidden');
        await checkExistingAbsenWali();
    } catch (error) {
        hideSkeleton('waliSkeletonLoader');
        tbody.innerHTML = `<tr class="empty-row"><td colspan="3"><div class="empty-state-illustration"><p>Gagal mengambil data siswa.</p></div></td></tr>`;
    }
}

async function checkExistingAbsenWali() {
    const kelas = AppState.session.kelasWali;
    const tanggalInput = DOM.waliTanggal;
    const tanggal = tanggalInput.value;
    const btnSubmit = DOM.waliBtnSubmit;
    if (!kelas || !tanggal) return;
    if (!StudentTable.hasData('waliStudentsBody')) return;

    try {
        const resData = await fetchGas('getAbsenWaliExisting', { kelas, tanggal });
        if (resData.success && resData.data) {
            const lanjutEdit = await showConfirmModal(
                `Absensi harian ${kelas} untuk ${formatTanggalIndo(tanggal)} sudah ada. Edit data?`
            );
            if (!lanjutEdit) {
                tanggalInput.value = '';
                btnSubmit.classList.add('hidden');
                return;
            }
            Object.entries(resData.data).forEach(([nis, status]) => {
                StudentTable.setStatus('waliStudentsBody', nis, status || 'H');
            });
            btnSubmit.querySelector('.btn-text').innerText = '💾 Perbarui Absensi';
        } else {
            StudentTable.resetAll('waliStudentsBody');
            btnSubmit.querySelector('.btn-text').innerText = '💾 Simpan Absensi';
        }
    } catch (error) {
        btnSubmit.querySelector('.btn-text').innerText = '💾 Simpan Absensi';
    }
}

document.getElementById('waliAbsenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = DOM.waliBtnSubmit;

    const validationResult = FormValidator.validateWaliForm();
    if (!FormValidator.applyValidation(validationResult)) {
        showToast('Mohon perbaiki field yang ditandai', 'error');
        return;
    }

    const dataKehadiran = StudentTable.getAttendanceData('waliStudentsBody');
    const kelas = AppState.session.kelasWali;
    const tanggal = DOM.waliTanggal.value;
    
    btn.disabled = true;
    showButtonProgress(btn);
    
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
            showToast(resData.message, 'success');
            btn.querySelector('.btn-text').innerText = '💾 Perbarui Absensi';
            fetchRiwayatAbsenWali();
            FormValidator.clearAll();
        } else if (resData.sessionExpired) {
            showAlert(resData.message, false);
            setTimeout(logout, 1500);
        } else {
            showToast(resData.message, 'error');
        }
    } catch (error) {
        showToast("Terjadi kesalahan jaringan", 'error');
    }
    
    btn.disabled = false;
    hideButtonProgress(btn);
});

async function fetchRiwayatAbsenWali() {
    if (!AppState.session.kelasWali) return;
    DOM.waliRiwayatList.innerHTML = '';
    showSkeleton('waliRiwayatLoading');
    
    try {
        const resData = await fetchGas('getRiwayatAbsenWali', { kelas: AppState.session.kelasWali });
        hideSkeleton('waliRiwayatLoading');
        if (resData.success && resData.data.length > 0) {
            DOM.waliRiwayatList.innerHTML = resData.data.map(rec => {
                const rincian = [
                    rec.namaIzin.length ? `📝 Izin: ${rec.namaIzin.join(', ')}` : '',
                    rec.namaSakit.length ? `🤒 Sakit: ${rec.namaSakit.join(', ')}` : '',
                    rec.namaAlpa.length ? `❌ Alpa: ${rec.namaAlpa.join(', ')}` : ''
                ].filter(Boolean).join(' · ');
                return `
                    <div class="riwayat-card">
                        <div class="riwayat-header">
                            <span class="riwayat-tanggal">📅 ${formatTanggalIndo(rec.tanggal)}</span>
                            <span class="riwayat-badge">✓ ${rec.jumlahHadir} Hadir</span>
                        </div>
                        <div class="riwayat-stats">
                            <span>📝 ${rec.jumlahIzin}</span>
                            <span>🤒 ${rec.jumlahSakit}</span>
                            <span>❌ ${rec.jumlahAlpa}</span>
                        </div>
                        ${rincian ? `<div class="riwayat-detail">${rincian}</div>` : ''}
                    </div>
                `;
            }).join('');
        } else {
            DOM.waliRiwayatList.innerHTML = `<div class="empty-state-illustration"><p>Belum ada riwayat absensi wali</p></div>`;
        }
    } catch (error) {
        hideSkeleton('waliRiwayatLoading');
        DOM.waliRiwayatList.innerHTML = `<div class="empty-state-illustration"><p>Gagal mengambil riwayat</p></div>`;
    }
}
