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
// KEUNTUNGAN:
//   1. Mudah di-debug: cukup console.log(AppState) untuk lihat
//      seluruh kondisi aplikasi saat ini
//   2. Mudah di-reset: satu method reset() saat logout
//   3. Auto-persist session ke sessionStorage
//   4. Tidak ada variabel global yang tersebar
//   5. Siap untuk fitur undo/autosave di masa depan
//
// STRUKTUR STATE:
//   AppState.session     -> data guru yang login (auto-persist)
//   AppState.studentCache -> cache data siswa per kelas
//   AppState.ui          -> state UI (tab aktif, chart instances)
//
// CARA PAKAI:
//   AppState.setSession(data)     // simpan sesi login
//   AppState.clearSession()       // hapus sesi (logout)
//   AppState.cacheStudents(k, d)  // simpan data siswa ke cache
//   AppState.getStudents(k)       // ambil data siswa dari cache
//   AppState.setChart(name, inst) // simpan referensi chart
//   AppState.destroyChart(name)   // hancurkan chart
//   AppState.reset()              // reset semua state (logout)
// =========================================================
const AppState = {
    // ===== DATA STATE =====
    // Data guru yang sedang login. Null kalau belum login.
    // Auto-disimpan ke sessionStorage setiap kali diubah.
    session: null,

    // Cache data siswa per kelas. Format: { "X-A": [{nis,nama,jk}, ...] }
    // Hanya hidup selama tab browser aktif (by design, supaya data
    // siswa selalu fresh saat sesi baru dimulai).
    studentCache: {},

    // ===== UI STATE =====
    ui: {
        // Tab yang sedang aktif (untuk keperluan tracking / analytics nanti)
        currentTab: 'panelAbsensi',

        // Referensi instance chart yang sedang aktif.
        // Format: { "trend": ChartInstance, ... }
        // Dipakai supaya chart bisa dihancurkan sebelum digambar ulang,
        // mencegah memory leak & chart dobel.
        charts: {}
    },

    // ===== METHODS: SESSION =====
    // Muat sesi dari sessionStorage saat aplikasi pertama kali dibuka.
    // Dipanggil sekali di awal script.
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

    // Simpan data sesi setelah login berhasil.
    // Otomatis di-persist ke sessionStorage.
    setSession(data) {
        this.session = data;
        try {
            sessionStorage.setItem('guruSession', JSON.stringify(data));
        } catch (e) {
            console.warn('Gagal menyimpan sesi ke sessionStorage:', e);
        }
    },

    // Hapus sesi (dipanggil saat logout).
    clearSession() {
        this.session = null;
        try {
            sessionStorage.removeItem('guruSession');
        } catch (e) {
            console.warn('Gagal menghapus sesi dari sessionStorage:', e);
        }
    },

    // ===== METHODS: STUDENT CACHE =====
    // Simpan data siswa ke cache (dipanggil setelah fetch dari server).
    cacheStudents(kelas, students) {
        this.studentCache[kelas] = students;
    },

    // Ambil data siswa dari cache. Return undefined kalau belum ada.
    getStudents(kelas) {
        return this.studentCache[kelas];
    },

    // Hapus cache untuk kelas tertentu (misal kalau data siswa berubah).
    clearStudentCache(kelas) {
        if (kelas) {
            delete this.studentCache[kelas];
        } else {
            this.studentCache = {};
        }
    },

    // ===== METHODS: CHART MANAGEMENT =====
    // Simpan referensi chart. Kalau chart dengan nama sama sudah ada,
    // yang lama otomatis dihancurkan dulu (mencegah memory leak).
    setChart(name, chartInstance) {
        this.destroyChart(name);
        this.ui.charts[name] = chartInstance;
    },

    // Ambil referensi chart.
    getChart(name) {
        return this.ui.charts[name];
    },

    // Hancurkan chart tertentu (panggil .destroy() untuk lepas event
    // listener & canvas, mencegah memory leak).
    destroyChart(name) {
        const chart = this.ui.charts[name];
        if (chart) {
            chart.destroy();
            delete this.ui.charts[name];
        }
    },

    // Hancurkan semua chart (dipanggil saat reset / logout).
    destroyAllCharts() {
        Object.keys(this.ui.charts).forEach(name => this.destroyChart(name));
    },

    // ===== METHODS: LIFECYCLE =====
    // Reset SEMUA state aplikasi. Dipanggil saat logout supaya
    // tidak ada state lama yang "bocor" ke sesi berikutnya.
    reset() {
        this.destroyAllCharts();
        this.studentCache = {};
        this.ui.currentTab = 'panelAbsensi';
        this.clearSession();
    },

    // Debug helper: tampilkan seluruh state di console.
    // Panggil AppState.debug() dari console browser untuk inspeksi.
    debug() {
        console.group('🔍 AppState Debug');
        console.log('Session:', this.session);
        console.log('Student Cache:', this.studentCache);
        console.log('UI State:', this.ui);
        console.log('Active Charts:', Object.keys(this.ui.charts));
        console.groupEnd();
    }
};

// Muat sesi dari sessionStorage saat script pertama kali dijalankan.
// Kalau ada sesi tersimpan, langsung tampilkan dashboard.
AppState.loadSession();
// ===== SELESAI: STATE MANAGEMENT TERPUSAT =====


// =========================================================
// REFERENSI ELEMEN DOM
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
    // Modal
    customAlert: document.getElementById('customAlert'),
    alertIcon: document.getElementById('alertIcon'),
    alertTitle: document.getElementById('alertTitle'),
    alertMessage: document.getElementById('alertMessage'),
    confirmModal: document.getElementById('confirmModal'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmBtnYes: document.getElementById('confirmBtnYes'),
    confirmBtnNo: document.getElementById('confirmBtnNo'),
    // Riwayat
    riwayatMapel: document.getElementById('riwayatMapel'),
    riwayatKelas: document.getElementById('riwayatKelas'),
    riwayatList: document.getElementById('riwayatList'),
    riwayatLoading: document.getElementById('riwayatLoading'),
    waliRiwayatList: document.getElementById('waliRiwayatList'),
    waliRiwayatLoading: document.getElementById('waliRiwayatLoading'),
    // Dashboard
    dashboardLoading: document.getElementById('dashboardLoading'),
    dashboardContent: document.getElementById('dashboardContent'),
    rekapKelasMapelList: document.getElementById('rekapKelasMapelList'),
    topAlpaList: document.getElementById('topAlpaList'),
    trendChart: document.getElementById('trendChart')
};

// Kalau sesi sudah ada sejak awal, langsung tampilkan dashboard
if (AppState.session) showDashboard();
// ===== SELESAI: REFERENSI ELEMEN DOM =====


// =========================================================
// OPTIMASI PERFORMA #1: FUNGSI DEBOUNCE
// ---------------------------------------------------------
// Mencegah request beruntun ke server saat pengguna mengganti
// dropdown / input dengan cepat. Fungsi akan menunggu "wait" ms
// SETELAH aksi terakhir sebelum benar-benar dieksekusi.
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
// KENAPA PERLU?
// 1. mode: 'cors'       -> paksa mode CORS eksplisit
// 2. redirect: 'follow' -> GAS Web App melakukan redirect,
//                          tanpa ini Safari iOS kadang menolak response
//
// CARA PAKAI:
//   const resData = await fetchGas('getStudents', { kelas: 'X-A' });  // GET
//   const resData = await fetchGas(null, { action: 'login', ... });   // POST
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
//
// CARA PAKAI:
//   StudentTable.render('studentsBody', dataSiswa);
//   StudentTable.setStatus('studentsBody', '12345', 'I');
//   const data = StudentTable.getAttendanceData('studentsBody');
//   StudentTable.resetAll('studentsBody');
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
// ---------------------------------------------------------
// Pakai AppState.setSession() untuk simpan sesi (auto-persist).
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
            // DELEGASI ke AppState (auto-persist ke sessionStorage)
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
// ---------------------------------------------------------
// Pakai AppState.session untuk akses data guru yang login.
// =========================================================
function showDashboard() {
    const session = AppState.session;
    if (!session) return; // safety check

    DOM.loginSection.classList.add('hidden');
    DOM.dashboardSection.classList.remove('hidden');
    DOM.greeting.innerText = `Selamat Mengajar, ${session.nama}`;
    DOM.tanggalAbsen.valueAsDate = new Date();

    // Isi dropdown mapel
    const mapelArr = session.mapel.split(',').map(s => s.trim());
    DOM.selectMapel.innerHTML = mapelArr.map(m => `<option value="${m}">${m}</option>`).join('');

    // Isi dropdown kelas
    const kelasArr = session.kelas.split(',').map(s => s.trim());
    DOM.selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' +
                                kelasArr.map(k => `<option value="${k}">${k}</option>`).join('');

    // Event listener dengan debounce
    DOM.selectKelas.addEventListener('change', debounce((e) => fetchStudents(e.target.value), 300));
    DOM.tanggalAbsen.addEventListener('change', debounce(checkExistingAttendance, 300));
    DOM.selectMapel.addEventListener('change', debounce(checkExistingAttendance, 300));

    // Tab "Absen Wali" hanya muncul jika guru ini punya Kelas Binaan
    if (session.kelasWali) {
        DOM.tabBtnAbsenWali.classList.remove('hidden');
        DOM.waliKelasLabel.innerText = session.kelasWali;
        DOM.waliTanggal.valueAsDate = new Date();
        DOM.waliTanggal.addEventListener('change', debounce(checkExistingAbsenWali, 300));
        fetchStudentsWali(session.kelasWali);
        fetchRiwayatAbsenWali();
    } else {
        DOM.tabBtnAbsenWali.classList.add('hidden');
    }
}
// ===== SELESAI: TAMPILKAN DASHBOARD =====


// =========================================================
// GANTI TAB
// ---------------------------------------------------------
// Update AppState.ui.currentTab untuk tracking tab aktif.
// =========================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');

    // Update state UI
    AppState.ui.currentTab = tabId;

    // Muat data saat tab dibuka (lazy loading)
    if (tabId === 'panelRiwayat') setupRiwayatSelectors();
    if (tabId === 'panelDashboard') loadDashboard();
}
// ===== SELESAI: GANTI TAB =====


// =========================================================
// FETCH DATA SISWA (panel Input Absensi per Mapel)
// ---------------------------------------------------------
// Pakai AppState.getStudents() / cacheStudents() untuk cache.
// =========================================================
async function fetchStudents(kelas) {
    const tbody = DOM.studentsBody;
    const loading = DOM.loading;
    const btnSubmit = DOM.btnSubmit;
    tbody.innerHTML = '';
    btnSubmit.style.display = 'none';
    loading.classList.remove('hidden');

    try {
        // CEK CACHE dari AppState
        let students = AppState.getStudents(kelas);
        if (!students) {
            const resData = await fetchGas('getStudents', { kelas });
            loading.classList.add('hidden');
            if (!resData.success || resData.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
                return;
            }
            students = resData.data;
            // SIMPAN KE CACHE di AppState
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
// =========================================================
document.getElementById('absenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = DOM.btnSubmit;
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
// ---------------------------------------------------------
// Pakai AppState.reset() untuk reset SEMUA state sekaligus
// (session, cache, chart, tab). Lebih bersih & aman.
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
    DOM.riwayatMapel.addEventListener('change', fetchRiwayat);
    DOM.riwayatKelas.addEventListener('change', fetchRiwayat);
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
// ---------------------------------------------------------
// Pakai AppState.setChart() / destroyChart() untuk manajemen
// chart yang aman (mencegah memory leak).
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
    // Hancurkan chart lama kalau ada (via AppState)
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
    // Simpan referensi chart di AppState (mencegah memory leak)
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

document.getElementById('waliAbsenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = DOM.waliBtnSubmit;
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
// ===== SELESAI: PANEL ABSEN WALI KELAS =====


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
