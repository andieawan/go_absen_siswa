// =========================================================
// KONFIGURASI
// =========================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyMGAl2rTMzOEVkosA-QKNrVvo69x3WZPrYgRBRcVF9JL-K1guOv-zJAWnisfCZ1t8n/exec';

// =========================================================
// STATE & REFERENSI ELEMEN GLOBAL
// =========================================================
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
let sessionData = JSON.parse(sessionStorage.getItem('guruSession'));
if (sessionData) showDashboard();

// =========================================================
// FUNGSI CUSTOM ALERT
// =========================================================
function showAlert(message, isSuccess = true) {
    const modal = document.getElementById('customAlert');
    const icon = document.getElementById('alertIcon');
    const title = document.getElementById('alertTitle');
    const msg = document.getElementById('alertMessage');
    const btn = document.querySelector('#customAlert .modal-btn');
    if (isSuccess) {
        icon.innerHTML = '✓';
        icon.className = 'modal-icon icon-success';
        title.innerText = 'Berhasil!';
        btn.style.backgroundColor = '#10B981';
    } else {
        icon.innerHTML = '✕';
        icon.className = 'modal-icon icon-error';
        title.innerText = 'Oops, Gagal!';
        btn.style.backgroundColor = '#EF4444';
    }
    msg.innerText = message;
    if (modal) modal.classList.add('active');
}
function closeCustomAlert() {
    const modal = document.getElementById('customAlert');
    if (modal) modal.classList.remove('active');
}

// =========================================================
// FUNGSI CUSTOM CONFIRM
// =========================================================
function showConfirmModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const msgEl = document.getElementById('confirmMessage');
        if (msgEl) msgEl.innerText = message;
        if (modal) modal.classList.add('active');
        const btnYes = document.getElementById('confirmBtnYes');
        const btnNo = document.getElementById('confirmBtnNo');
        function selesai(hasil) {
            if (modal) modal.classList.remove('active');
            if (btnYes) btnYes.removeEventListener('click', onYes);
            if (btnNo) btnNo.removeEventListener('click', onNo);
            resolve(hasil);
        }
        function onYes() { selesai(true); }
        function onNo() { selesai(false); }
        if (btnYes) btnYes.addEventListener('click', onYes);
        if (btnNo) btnNo.addEventListener('click', onNo);
    });
}

// =========================================================
// HANDLE LOGIN
// =========================================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const btn = e.target.querySelector('button');
    const msg = document.getElementById('loginMsg');
    btn.innerText = 'Mengecek...';
    if (msg) msg.innerText = '';
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'login', username: user, password: pass })
        });
        const resData = await response.json();
        if (resData.success) {
            sessionStorage.setItem('guruSession', JSON.stringify(resData.data));
            sessionData = resData.data;
            showDashboard();
        } else {
            if (msg) msg.innerText = resData.message;
        }
    } catch (error) {
        if (msg) msg.innerText = "Gagal terhubung ke server.";
    }
    btn.innerText = 'Login';
});

// =========================================================
// TAMPILKAN DASHBOARD
// =========================================================
function showDashboard() {
    if (loginSection) loginSection.classList.add('hidden');
    if (dashboardSection) dashboardSection.classList.remove('hidden');
    
    const greeting = document.getElementById('greeting');
    if (greeting) greeting.innerText = `Selamat Mengajar, ${sessionData.nama}`;
    
    const tanggalAbsen = document.getElementById('tanggalAbsen');
    if (tanggalAbsen) tanggalAbsen.valueAsDate = new Date();

    const mapelArr = sessionData.mapel.split(',').map(s => s.trim());
    const selectMapel = document.getElementById('selectMapel');
    if (selectMapel) {
        selectMapel.innerHTML = '';
        mapelArr.forEach(m => selectMapel.innerHTML += `<option value="${m}">${m}</option>`);
    }

    const kelasArr = sessionData.kelas.split(',').map(s => s.trim());
    const selectKelas = document.getElementById('selectKelas');
    if (selectKelas) {
        selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>';
        kelasArr.forEach(k => selectKelas.innerHTML += `<option value="${k}">${k}</option>`);
    }

    if (selectKelas) selectKelas.addEventListener('change', (e) => fetchStudents(e.target.value));
    if (tanggalAbsen) tanggalAbsen.addEventListener('change', checkExistingAttendance);
    if (selectMapel) selectMapel.addEventListener('change', checkExistingAttendance);

    const tabBtnAbsenWali = document.getElementById('tabBtnAbsenWali');
    if (sessionData.kelasWali) {
        if (tabBtnAbsenWali) tabBtnAbsenWali.classList.remove('hidden');
        const waliKelasLabel = document.getElementById('waliKelasLabel');
        if (waliKelasLabel) waliKelasLabel.innerText = sessionData.kelasWali;
        
        const waliTanggal = document.getElementById('waliTanggal');
        if (waliTanggal) {
            waliTanggal.valueAsDate = new Date();
            waliTanggal.addEventListener('change', checkExistingAbsenWali);
        }
        
        fetchStudentsWali(sessionData.kelasWali);
        fetchRiwayatAbsenWali();
    } else {
        if (tabBtnAbsenWali) tabBtnAbsenWali.classList.add('hidden');
    }
}

// =========================================================
// GANTI TAB
// =========================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    const targetPanel = document.getElementById(tabId);
    if (targetPanel) targetPanel.classList.remove('hidden');
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    
    if (tabId === 'panelRiwayat') setupRiwayatSelectors();
    if (tabId === 'panelDashboard') loadDashboard();
}

// =========================================================
// FETCH DATA SISWA (DENGAN NULL CHECK AMAN)
// =========================================================
async function fetchStudents(kelas) {
    const tbody = document.getElementById('studentsBody');
    const loading = document.getElementById('loading');
    const btnSubmit = document.getElementById('btnSubmit');
    
    if (tbody) tbody.innerHTML = '';
    if (btnSubmit) btnSubmit.style.display = 'none';
    if (loading) loading.classList.remove('hidden');

    try {
        const response = await fetch(`${GAS_URL}?action=getStudents&kelas=${encodeURIComponent(kelas)}`);
        const resData = await response.json();
        if (loading) loading.classList.add('hidden');
        
        if (resData.success && resData.data.length > 0) {
            resData.data.forEach((siswa, index) => {
                const tr = document.createElement('tr');
                tr.className = 'student-row';
                tr.dataset.nis = siswa.nis;
                tr.innerHTML = `
                    <td>${siswa.nis || '-'}</td>
                    <td class="nama-siswa">${siswa.nama}</td>
                    <td>
                        <div class="radio-group">
                            <label><input type="radio" name="status_${index}" value="H" checked required> H</label>
                            <label><input type="radio" name="status_${index}" value="I"> I</label>
                            <label><input type="radio" name="status_${index}" value="S"> S</label>
                            <label><input type="radio" name="status_${index}" value="A"> A</label>
                        </div>
                    </td>
                `;
                if (tbody) tbody.appendChild(tr);
            });
            if (btnSubmit) btnSubmit.style.display = 'block';
            await checkExistingAttendance();
        } else {
            if (tbody) tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
        }
    } catch (error) {
        if (loading) loading.classList.add('hidden');
        if (tbody) tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
    }
}

// =========================================================
// CEK ABSENSI YANG SUDAH ADA (MAPLEL)
// =========================================================
async function checkExistingAttendance() {
    const mapel = document.getElementById('selectMapel').value;
    const kelas = document.getElementById('selectKelas').value;
    const tanggalInput = document.getElementById('tanggalAbsen');
    const tanggal = tanggalInput.value;
    const guru = sessionData.nama;
    const btnSubmit = document.getElementById('btnSubmit');
    if (!mapel || !kelas || !tanggal || !btnSubmit) return;

    btnSubmit.innerText = "Mengecek status...";
    btnSubmit.disabled = true;

    try {
        const response = await fetch(`${GAS_URL}?action=getExistingAttendance&guru=${encodeURIComponent(guru)}&mapel=${encodeURIComponent(mapel)}&kelas=${encodeURIComponent(kelas)}&tanggal=${encodeURIComponent(tanggal)}`);
        const resData = await response.json();
        const rows = document.querySelectorAll('#studentsBody tr.student-row');

        if (resData.success && resData.data) {
            const savedIzin = resData.data.izin.split(',').map(s => s.trim()).filter(s => s !== "");
            const savedSakit = resData.data.sakit.split(',').map(s => s.trim()).filter(s => s !== "");
            const savedAlpa = resData.data.alpa.split(',').map(s => s.trim()).filter(s => s !== "");

            rows.forEach((row, index) => {
                const nis = row.dataset.nis;
                let status = 'H';
                if (savedIzin.includes(nis)) status = 'I';
                else if (savedSakit.includes(nis)) status = 'S';
                else if (savedAlpa.includes(nis)) status = 'A';
                const targetRadio = document.querySelector(`input[name="status_${index}"][value="${status}"]`);
                if (targetRadio) targetRadio.checked = true;
            });

            btnSubmit.innerText = "💾 Update Data";
            btnSubmit.dataset.exists = "true";
        } else {
            rows.forEach((row, index) => {
                const targetRadio = document.querySelector(`input[name="status_${index}"][value="H"]`);
                if (targetRadio) targetRadio.checked = true;
            });
            btnSubmit.innerText = "💾 Simpan Absensi";
            btnSubmit.dataset.exists = "false";
        }
    } catch (error) {
        btnSubmit.innerText = "💾 Simpan Absensi";
        btnSubmit.dataset.exists = "false";
    }
    btnSubmit.disabled = false;
}

// =========================================================
// SUBMIT ABSENSI (MAPLEL)
// =========================================================
document.getElementById('absenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');
    if (!btn) return;

    if (btn.dataset.exists === "true") {
        const lanjutEdit = await showConfirmModal(`Data absensi untuk tanggal ini sudah ada. Timpa data yang lama dengan data baru?`);
        if (!lanjutEdit) return;
    }

    const rows = document.querySelectorAll('#studentsBody tr.student-row');
    let attendanceData = [];
    rows.forEach((row, index) => {
        const nis = row.dataset.nis;
        const status = document.querySelector(`input[name="status_${index}"]:checked`).value;
        attendanceData.push({ nis, status });
    });

    const payload = {
        guru: sessionData.nama,
        mapel: document.getElementById('selectMapel').value,
        kelas: document.getElementById('selectKelas').value,
        tanggal: document.getElementById('tanggalAbsen').value,
        attendance: attendanceData
    };

    btn.innerText = "Menyimpan...";
    btn.disabled = true;

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'submit',
                username: sessionData.username,
                token: sessionData.token,
                payload: payload
            })
        });
        const resData = await response.json();

        if (resData.success) {
            showAlert(resData.message, true);
            btn.innerText = "💾 Update Data";
            btn.dataset.exists = "true";
        } else if (resData.sessionExpired) {
            showAlert(resData.message, false);
            setTimeout(logout, 1500);
        } else {
            showAlert(resData.message, false);
            btn.innerText = btn.dataset.exists === "true" ? "💾 Update Data" : "💾 Simpan Absensi";
        }
    } catch (error) {
        showAlert("Terjadi kesalahan jaringan saat menyimpan data.", false);
        btn.innerText = btn.dataset.exists === "true" ? "💾 Update Data" : "💾 Simpan Absensi";
    }
    btn.disabled = false;
});

// =========================================================
// REKAP & LOGOUT
// =========================================================
async function downloadRekapKelasSaya() {
    const btn = document.getElementById('btnRecap');
    const originalText = btn.innerHTML;
    btn.innerText = "Menyiapkan file...";
    btn.disabled = true;
    try {
        const response = await fetch(`${GAS_URL}?action=getRekapKelasSaya&mapel=${encodeURIComponent(sessionData.mapel)}&kelas=${encodeURIComponent(sessionData.kelas)}`);
        const resData = await response.json();
        if (resData.success) {
            const wb = XLSX.utils.book_new();
            resData.data.forEach(sheetInfo => {
                const ws = XLSX.utils.aoa_to_sheet([sheetInfo.headerRow, ...sheetInfo.rows]);
                XLSX.utils.book_append_sheet(wb, ws, sheetInfo.tabName);
            });
            const namaFile = `Rekap_${sessionData.nama}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

function logout() {
    sessionStorage.removeItem('guruSession');
    window.location.reload();
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

// =========================================================
// RIWAYAT
// =========================================================
function setupRiwayatSelectors() {
    const selMapel = document.getElementById('riwayatMapel');
    const selKelas = document.getElementById('riwayatKelas');
    if (!selMapel || selMapel.dataset.filled) return;
    
    const mapelArr = sessionData.mapel.split(',').map(s => s.trim());
    mapelArr.forEach(m => selMapel.innerHTML += `<option value="${m}">${m}</option>`);
    const kelasArr = sessionData.kelas.split(',').map(s => s.trim());
    kelasArr.forEach(k => selKelas.innerHTML += `<option value="${k}">${k}</option>`);
    selMapel.dataset.filled = "1";
    
    selMapel.addEventListener('change', fetchRiwayat);
    selKelas.addEventListener('change', fetchRiwayat);
}

async function fetchRiwayat() {
    const mapel = document.getElementById('riwayatMapel').value;
    const kelas = document.getElementById('riwayatKelas').value;
    const listEl = document.getElementById('riwayatList');
    const loading = document.getElementById('riwayatLoading');
    if (!mapel || !kelas) return;
    
    if (listEl) listEl.innerHTML = '';
    if (loading) loading.classList.remove('hidden');
    
    try {
        const response = await fetch(`${GAS_URL}?action=getRiwayatAbsensi&mapel=${encodeURIComponent(mapel)}&kelas=${encodeURIComponent(kelas)}`);
        const resData = await response.json();
        if (loading) loading.classList.add('hidden');
        
        if (resData.success && resData.data.length > 0) {
            listEl.innerHTML = resData.data.map(rec => {
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
            if (listEl) listEl.innerHTML = `<div class="empty-state-illustration large"><svg viewBox="0 0 200 150"><circle cx="100" cy="75" r="50" fill="#E0E7FF"/><text x="100" y="85" text-anchor="middle" font-size="40">📚</text></svg><p>Belum ada riwayat absensi</p></div>`;
        }
    } catch (error) {
        if (loading) loading.classList.add('hidden');
        if (listEl) listEl.innerHTML = `<div class="empty-state-illustration"><p>Gagal mengambil riwayat</p></div>`;
    }
}

// =========================================================
// DASHBOARD
// =========================================================
let trendChartInstance = null;
let trendChartWaliInstance = null;

async function loadDashboard() {
    const loading = document.getElementById('dashboardLoading');
    const content = document.getElementById('dashboardContent');
    if (loading) loading.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    
    try {
        const response = await fetch(`${GAS_URL}?action=getDashboardData&mapel=${encodeURIComponent(sessionData.mapel)}&kelas=${encodeURIComponent(sessionData.kelas)}`);
        const resData = await response.json();
        if (loading) loading.classList.add('hidden');
        if (content) content.classList.remove('hidden');
        
        if (resData.success) {
            renderRekapKelasMapel(resData.data.rekapKelasMapel);
            renderTrendChart(resData.data.trend);
            renderTopAlpa(resData.data.topAlpa);
        } else {
            if (content) content.innerHTML = `<div class="empty-state-illustration large"><p>${resData.message || 'Belum ada data'}</p></div>`;
        }
        
        if (sessionData.kelasWali) loadDashboardWali();
    } catch (error) {
        if (loading) loading.classList.add('hidden');
        if (content) {
            content.classList.remove('hidden');
            content.innerHTML = `<div class="empty-state-illustration"><p>Gagal memuat dashboard</p></div>`;
        }
    }
}

function renderRekapKelasMapel(list) {
    const el = document.getElementById('rekapKelasMapelList');
    if (!list || list.length === 0) {
        if (el) el.innerHTML = `<div class="empty-state-illustration"><p>Belum ada data</p></div>`;
        return;
    }
    if (el) {
        el.innerHTML = list.map(item => `
            <div class="rekap-bar-item">
                <div class="rekap-bar-label"><span>${item.label}</span><span>${item.persenHadir}%</span></div>
                <div class="rekap-bar-track"><div class="rekap-bar-fill" style="width: ${item.persenHadir}%;"></div></div>
            </div>
        `).join('');
    }
}

function renderTopAlpa(list) {
    const el = document.getElementById('topAlpaList');
    if (!list || list.length === 0) {
        if (el) el.innerHTML = `<div class="empty-state-illustration"><p>🎉 Tidak ada siswa dengan catatan Alpa</p></div>`;
        return;
    }
    if (el) {
        el.innerHTML = list.map((s, i) => `
            <div class="alpa-item">
                <span class="alpa-rank">${i + 1}</span>
                <span class="alpa-nama">${s.nama}</span>
                <span class="alpa-jumlah">${s.jumlahAlpa}x</span>
            </div>
        `).join('');
    }
}

function renderTrendChart(trend) {
    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }
    if (!trend || trend.length === 0) return;

    const canvas = document.getElementById('trendChart');
    if (!canvas) return;

    trendChartInstance = new Chart(canvas, {
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
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } },
            plugins: { legend: { display: false } }
        }
    });
}

async function loadDashboardWali() {
    const kelas = sessionData.kelasWali;
    if (!kelas) return;
    
    try {
        const response = await fetch(`${GAS_URL}?action=getDashboardDataWali&kelas=${encodeURIComponent(kelas)}`);
        const resData = await response.json();
        
        if (!resData.success) {
            const el1 = document.getElementById('waliStatPertemuan'); if (el1) el1.innerText = '0';
            const el2 = document.getElementById('waliStatSiswa'); if (el2) el2.innerText = '0';
            const el3 = document.getElementById('waliStatRataHadir'); if (el3) el3.innerText = '0%';
            const el4 = document.getElementById('waliStatRataAlpa'); if (el4) el4.innerText = '0%';
            const el5 = document.getElementById('waliDistribusiList'); if (el5) el5.innerHTML = `<div class="empty-state-illustration"><p>${resData.message}</p></div>`;
            const el6 = document.getElementById('waliTopAlpaList'); if (el6) el6.innerHTML = '';
            if (trendChartWaliInstance) { trendChartWaliInstance.destroy(); trendChartWaliInstance = null; }
            return;
        }
        
        const data = resData.data;
        const el1 = document.getElementById('waliStatPertemuan'); if (el1) el1.innerText = data.totalPertemuan;
        const el2 = document.getElementById('waliStatSiswa'); if (el2) el2.innerText = data.totalSiswa;
        const el3 = document.getElementById('waliStatRataHadir'); if (el3) el3.innerText = data.rataRata.hadir + '%';
        const el4 = document.getElementById('waliStatRataAlpa'); if (el4) el4.innerText = data.rataRata.alpa + '%';
        
        const items = [
            { label: 'Hadir', icon: '✓', value: data.rataRata.hadir, class: 'hadir' },
            { label: 'Izin', icon: '📝', value: data.rataRata.izin, class: 'izin' },
            { label: 'Sakit', icon: '🤒', value: data.rataRata.sakit, class: 'sakit' },
            { label: 'Alpa', icon: '❌', value: data.rataRata.alpa, class: 'alpa' }
        ];
        
        const el5 = document.getElementById('waliDistribusiList');
        if (el5) {
            el5.innerHTML = items.map(item => `
                <div class="distribusi-item">
                    <div class="distribusi-label">
                        <span class="distribusi-label-status"><span>${item.icon}</span><span>${item.label}</span></span>
                        <span>${item.value}%</span>
                    </div>
                    <div class="distribusi-track"><div class="distribusi-fill ${item.class}" style="width: ${item.value}%;"></div></div>
                </div>
            `).join('');
        }
        
        if (trendChartWaliInstance) { trendChartWaliInstance.destroy(); trendChartWaliInstance = null; }
        if (data.statistikHarian && data.statistikHarian.length > 0) {
            const canvasWali = document.getElementById('trendChartWali');
            if (canvasWali) {
                trendChartWaliInstance = new Chart(canvasWali, {
                    type: 'line',
                    data: {
                        labels: data.statistikHarian.map(s => formatTanggalIndo(s.tanggal)),
                        datasets: [{
                            label: '% Kehadiran Harian',
                            data: data.statistikHarian.map(s => s.persenHadir),
                            borderColor: '#10B981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.4,
                            fill: true,
                            pointRadius: 4,
                            pointBackgroundColor: '#10B981',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        }
        
        const el6 = document.getElementById('waliTopAlpaList');
        if (el6) {
            if (!data.topAlpa || data.topAlpa.length === 0) {
                el6.innerHTML = `<div class="empty-state-illustration"><p>🎉 Tidak ada siswa dengan catatan Alpa di kelas wali</p></div>`;
            } else {
                el6.innerHTML = data.topAlpa.map((s, i) => `
                    <div class="alpa-item">
                        <span class="alpa-rank">${i + 1}</span>
                        <span class="alpa-nama">${s.nama}</span>
                        <span class="alpa-jumlah">${s.jumlahAlpa}x</span>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Gagal memuat dashboard wali:', error);
        const el5 = document.getElementById('waliDistribusiList');
        if (el5) el5.innerHTML = `<div class="empty-state-illustration"><p>Gagal memuat data dashboard wali</p></div>`;
    }
}

// =========================================================
// ABSEN WALI (DENGAN NULL CHECK AMAN)
// =========================================================
async function fetchStudentsWali(kelas) {
    const tbody = document.getElementById('waliStudentsBody');
    const loading = document.getElementById('waliLoading');
    const btnSubmit = document.getElementById('waliBtnSubmit');
    
    if (tbody) tbody.innerHTML = '';
    if (btnSubmit) btnSubmit.style.display = 'none';
    if (loading) loading.classList.remove('hidden');

    try {
        const response = await fetch(`${GAS_URL}?action=getStudents&kelas=${encodeURIComponent(kelas)}`);
        const resData = await response.json();
        if (loading) loading.classList.add('hidden');
        
        if (resData.success && resData.data.length > 0) {
            resData.data.forEach((siswa) => {
                const tr = document.createElement('tr');
                tr.className = 'student-row';
                tr.dataset.nis = siswa.nis;
                tr.innerHTML = `
                    <td>${siswa.nis || '-'}</td>
                    <td class="nama-siswa">${siswa.nama}</td>
                    <td>
                        <div class="radio-group">
                            <label><input type="radio" name="wali_status_${siswa.nis}" value="H" checked required> H</label>
                            <label><input type="radio" name="wali_status_${siswa.nis}" value="I"> I</label>
                            <label><input type="radio" name="wali_status_${siswa.nis}" value="S"> S</label>
                            <label><input type="radio" name="wali_status_${siswa.nis}" value="A"> A</label>
                        </div>
                    </td>
                `;
                if (tbody) tbody.appendChild(tr);
            });
            if (btnSubmit) btnSubmit.style.display = 'block';
            await checkExistingAbsenWali();
        } else {
            if (tbody) tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
        }
    } catch (error) {
        if (loading) loading.classList.add('hidden');
        if (tbody) tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
    }
}

async function checkExistingAbsenWali() {
    const kelas = sessionData.kelasWali;
    const tanggalInput = document.getElementById('waliTanggal');
    const tanggal = tanggalInput.value;
    const btnSubmit = document.getElementById('waliBtnSubmit');
    const rows = document.querySelectorAll('#waliStudentsBody tr.student-row');
    if (!kelas || !tanggal || rows.length === 0 || !btnSubmit) return;

    btnSubmit.innerText = "Mengecek status...";
    btnSubmit.disabled = true;

    try {
        const response = await fetch(`${GAS_URL}?action=getAbsenWaliExisting&kelas=${encodeURIComponent(kelas)}&tanggal=${encodeURIComponent(tanggal)}`);
        const resData = await response.json();

        if (resData.success && resData.data) {
            rows.forEach(row => {
                const nis = row.dataset.nis;
                let status = resData.data[nis];
                if (!status || status === '-') status = 'H';
                const targetRadio = document.querySelector(`input[name="wali_status_${nis}"][value="${status}"]`);
                if (targetRadio) targetRadio.checked = true;
            });
            btnSubmit.innerText = "💾 Update Data";
            btnSubmit.dataset.exists = "true";
        } else {
            rows.forEach(row => {
                const nis = row.dataset.nis;
                const targetRadio = document.querySelector(`input[name="wali_status_${nis}"][value="H"]`);
                if (targetRadio) targetRadio.checked = true;
            });
            btnSubmit.innerText = "💾 Simpan Absensi";
            btnSubmit.dataset.exists = "false";
        }
    } catch (error) {
        btnSubmit.innerText = "💾 Simpan Absensi";
        btnSubmit.dataset.exists = "false";
    }
    btnSubmit.disabled = false;
}

document.getElementById('waliAbsenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('waliBtnSubmit');
    if (!btn) return;

    if (btn.dataset.exists === "true") {
        const lanjutEdit = await showConfirmModal(`Data absensi harian untuk tanggal ini sudah ada. Timpa data yang lama dengan data baru?`);
        if (!lanjutEdit) return;
    }

    const rows = document.querySelectorAll('#waliStudentsBody tr.student-row');
    let dataKehadiran = [];
    rows.forEach(row => {
        const nis = row.dataset.nis;
        const status = document.querySelector(`input[name="wali_status_${nis}"]:checked`).value;
        dataKehadiran.push({ nis, status });
    });

    const kelas = sessionData.kelasWali;
    const tanggal = document.getElementById('waliTanggal').value;

    btn.innerText = "Menyimpan...";
    btn.disabled = true;

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'submitAbsenWali',
                username: sessionData.username,
                token: sessionData.token,
                kelas,
                tanggal,
                dataKehadiran
            })
        });
        const resData = await response.json();

        if (resData.success) {
            showAlert(resData.message, true);
            btn.innerText = "💾 Update Data";
            btn.dataset.exists = "true";
            fetchRiwayatAbsenWali();
        } else if (resData.sessionExpired) {
            showAlert(resData.message, false);
            setTimeout(logout, 1500);
        } else {
            showAlert(resData.message, false);
            btn.innerText = btn.dataset.exists === "true" ? "💾 Update Data" : "💾 Simpan Absensi";
        }
    } catch (error) {
        showAlert("Terjadi kesalahan jaringan saat menyimpan data.", false);
        btn.innerText = btn.dataset.exists === "true" ? "💾 Update Data" : "💾 Simpan Absensi";
    }
    btn.disabled = false;
});

async function fetchRiwayatAbsenWali() {
    if (!sessionData.kelasWali) return;
    const listEl = document.getElementById('waliRiwayatList');
    const loading = document.getElementById('waliRiwayatLoading');
    
    if (listEl) listEl.innerHTML = '';
    if (loading) loading.classList.remove('hidden');
    
    try {
        const response = await fetch(`${GAS_URL}?action=getRiwayatAbsenWali&kelas=${encodeURIComponent(sessionData.kelasWali)}`);
        const resData = await response.json();
        if (loading) loading.classList.add('hidden');
        
        if (resData.success && resData.data.length > 0) {
            listEl.innerHTML = resData.data.map(rec => {
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
            if (listEl) listEl.innerHTML = `<div class="empty-state-illustration"><p>Belum ada riwayat absensi wali</p></div>`;
        }
    } catch (error) {
        if (loading) loading.classList.add('hidden');
        if (listEl) listEl.innerHTML = `<div class="empty-state-illustration"><p>Gagal mengambil riwayat</p></div>`;
    }
}

async function downloadRekapAbsenWali() {
    if (!sessionData.kelasWali) return;
    const btn = document.getElementById('btnRekapWali');
    const originalText = btn.innerHTML;
    btn.innerText = "Menyiapkan file...";
    btn.disabled = true;
    try {
        const response = await fetch(`${GAS_URL}?action=getRekapAbsenWali&kelas=${encodeURIComponent(sessionData.kelasWali)}`);
        const resData = await response.json();
        if (resData.success) {
            const wb = XLSX.utils.book_new();
            resData.data.forEach(sheetInfo => {
                const ws = XLSX.utils.aoa_to_sheet([sheetInfo.headerRow, ...sheetInfo.rows]);
                XLSX.utils.book_append_sheet(wb, ws, sheetInfo.tabName);
            });
            const namaFile = `Rekap_Wali_${sessionData.kelasWali}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
