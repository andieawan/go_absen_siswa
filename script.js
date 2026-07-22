// =========================================================
// KONFIGURASI
// Ganti URL Web App Google Apps Script di sini kalau berubah
// =========================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyMGAl2rTMzOEVkosA-QKNrVvo69x3WZPrYgRBRcVF9JL-K1guOv-zJAWnisfCZ1t8n/exec';
// ===== SELESAI: KONFIGURASI =====


// =========================================================
// STATE & REFERENSI ELEMEN GLOBAL
// =========================================================
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
let sessionData = JSON.parse(sessionStorage.getItem('guruSession'));
if (sessionData) showDashboard();
// ===== SELESAI: STATE & REFERENSI ELEMEN GLOBAL =====


// =========================================================
// FUNGSI CUSTOM ALERT (popup notifikasi)
// Panggil showAlert("pesan", true/false) dari bagian manapun
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
    modal.classList.add('active');
}
function closeCustomAlert() {
    document.getElementById('customAlert').classList.remove('active');
}
// ===== SELESAI: FUNGSI CUSTOM ALERT =====


// =========================================================
// FUNGSI CUSTOM CONFIRM (popup Ya/Tidak)
// Dipakai untuk konfirmasi sebelum MENIMPA data yang sudah
// ada saat user menekan tombol submit.
// =========================================================
function showConfirmModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmMessage').innerText = message;
        modal.classList.add('active');
        const btnYes = document.getElementById('confirmBtnYes');
        const btnNo = document.getElementById('confirmBtnNo');
        function selesai(hasil) {
            modal.classList.remove('active');
            btnYes.removeEventListener('click', onYes);
            btnNo.removeEventListener('click', onNo);
            resolve(hasil);
        }
        function onYes() { selesai(true); }
        function onNo() { selesai(false); }
        btnYes.addEventListener('click', onYes);
        btnNo.addEventListener('click', onNo);
    });
}
// ===== SELESAI: FUNGSI CUSTOM CONFIRM =====


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
    msg.innerText = '';
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
            msg.innerText = resData.message;
        }
    } catch (error) {
        msg.innerText = "Gagal terhubung ke server.";
    }
    btn.innerText = 'Login';
});
// ===== SELESAI: HANDLE LOGIN =====


// =========================================================
// TAMPILKAN DASHBOARD (setelah login / saat sesi ditemukan)
// =========================================================
function showDashboard() {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    document.getElementById('greeting').innerText = `Selamat Mengajar, ${sessionData.nama}`;
    document.getElementById('tanggalAbsen').valueAsDate = new Date();

    const mapelArr = sessionData.mapel.split(',').map(s => s.trim());
    const selectMapel = document.getElementById('selectMapel');
    selectMapel.innerHTML = '';
    mapelArr.forEach(m => selectMapel.innerHTML += `<option value="${m}">${m}</option>`);

    const kelasArr = sessionData.kelas.split(',').map(s => s.trim());
    const selectKelas = document.getElementById('selectKelas');
    selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>';
    kelasArr.forEach(k => selectKelas.innerHTML += `<option value="${k}">${k}</option>`);

    selectKelas.addEventListener('change', (e) => fetchStudents(e.target.value));
    document.getElementById('tanggalAbsen').addEventListener('change', checkExistingAttendance);
    document.getElementById('selectMapel').addEventListener('change', checkExistingAttendance);

    // Tab "Absen Wali" hanya muncul jika guru ini punya Kelas Binaan
    const tabBtnAbsenWali = document.getElementById('tabBtnAbsenWali');
    if (sessionData.kelasWali) {
        tabBtnAbsenWali.classList.remove('hidden');
        document.getElementById('waliKelasLabel').innerText = sessionData.kelasWali;
        document.getElementById('waliTanggal').valueAsDate = new Date();

        // =====================================================
        // PERUBAHAN: tambahkan event listener change pada waliTanggal
        // ---------------------------------------------------------
        // Sama seperti panel mapel, saat tanggal berubah, aplikasi
        // akan otomatis cek apakah data sudah ada, lalu menyesuaikan
        // label tombol dan status radio TANPA popup konfirmasi.
        // =====================================================
        document.getElementById('waliTanggal').addEventListener('change', checkExistingAbsenWali);

        fetchStudentsWali(sessionData.kelasWali);
        fetchRiwayatAbsenWali();
    } else {
        tabBtnAbsenWali.classList.add('hidden');
    }
}
// ===== SELESAI: TAMPILKAN DASHBOARD =====


// =========================================================
// GANTI TAB (Input Absensi / Riwayat / Dashboard)
// =========================================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    if (tabId === 'panelRiwayat') setupRiwayatSelectors();
    if (tabId === 'panelDashboard') loadDashboard();
}
// ===== SELESAI: GANTI TAB =====


// =========================================================
// FETCH DATA SISWA (panel Input Absensi per Mapel)
// =========================================================
async function fetchStudents(kelas) {
    const tbody = document.getElementById('studentsBody');
    const loading = document.getElementById('loading');
    const btnSubmit = document.getElementById('btnSubmit');
    tbody.innerHTML = '';
    btnSubmit.style.display = 'none';
    loading.classList.remove('hidden');
    try {
        const response = await fetch(`${GAS_URL}?action=getStudents&kelas=${encodeURIComponent(kelas)}`);
        const resData = await response.json();
        loading.classList.add('hidden');
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
                tbody.appendChild(tr);
            });
            btnSubmit.style.display = 'block';
            await checkExistingAttendance();
        } else {
            tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
        }
    } catch (error) {
        loading.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
    }
}
// ===== SELESAI: FETCH DATA SISWA =====


// =========================================================
// CEK ABSENSI YANG SUDAH ADA (panel Input Absensi per Mapel)
// ---------------------------------------------------------
// PERUBAHAN UTAMA:
// ---------------------------------------------------------
// Flow baru (tanpa popup konfirmasi):
//   1. Dipanggil otomatis saat user ganti mapel/kelas/tanggal
//   2. Cek ke server apakah data untuk kombinasi tsb sudah ada
//   3. Kalau BELUM ADA:
//        - Tombol: "💾 Simpan Absensi"
//        - Radio: semua di-reset ke Hadir (H)
//        - btnSubmit.dataset.exists = "false"
//   4. Kalau SUDAH ADA:
//        - Tombol: "💾 Update Data"
//        - Radio: otomatis mengikuti data yang sudah tersimpan
//        - btnSubmit.dataset.exists = "true"
//
// KEUNTUNGAN:
//   - User tidak terganggu popup saat memilih tanggal
//   - User langsung tahu status dari label tombol
//   - Radio otomatis ter-set, user tinggal review & submit
//
// Konfirmasi baru muncul saat user menekan tombol submit
// (lihat handler submit di bawah).
// =========================================================
async function checkExistingAttendance() {
    const mapel = document.getElementById('selectMapel').value;
    const kelas = document.getElementById('selectKelas').value;
    const tanggalInput = document.getElementById('tanggalAbsen');
    const tanggal = tanggalInput.value;
    const guru = sessionData.nama;
    const btnSubmit = document.getElementById('btnSubmit');
    if (!mapel || !kelas || !tanggal) return;

    btnSubmit.innerText = "Mengecek status...";
    btnSubmit.disabled = true;

    try {
        const response = await fetch(`${GAS_URL}?action=getExistingAttendance&guru=${encodeURIComponent(guru)}&mapel=${encodeURIComponent(mapel)}&kelas=${encodeURIComponent(kelas)}&tanggal=${encodeURIComponent(tanggal)}`);
        const resData = await response.json();
        const rows = document.querySelectorAll('#studentsBody tr.student-row');

        if (resData.success && resData.data) {
            // ============================================
            // DATA SUDAH ADA → set radio sesuai data lama
            // ============================================
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

            // Label tombol & flag status
            btnSubmit.innerText = "💾 Update Data";
            btnSubmit.dataset.exists = "true";
        } else {
            // ============================================
            // DATA BELUM ADA → reset radio ke Hadir (H)
            // ============================================
            rows.forEach((row, index) => {
                const targetRadio = document.querySelector(`input[name="status_${index}"][value="H"]`);
                if (targetRadio) targetRadio.checked = true;
            });

            // Label tombol & flag status
            btnSubmit.innerText = "💾 Simpan Absensi";
            btnSubmit.dataset.exists = "false";
        }
    } catch (error) {
        btnSubmit.innerText = "💾 Simpan Absensi";
        btnSubmit.dataset.exists = "false";
    }

    btnSubmit.disabled = false;
}
// ===== SELESAI: CEK ABSENSI YANG SUDAH ADA (panel mapel) =====


// =========================================================
// SUBMIT ABSENSI (panel Input Absensi per Mapel)
// ---------------------------------------------------------
// PERUBAHAN UTAMA:
// ---------------------------------------------------------
// Flow baru:
//   1. Cek btnSubmit.dataset.exists
//   2. Kalau "true" (data sudah ada):
//        - Tampilkan konfirmasi "Data sudah ada, timpa?"
//        - Kalau user pilih "Tidak" → batal submit
//        - Kalau user pilih "Ya" → lanjut submit
//   3. Kalau "false" (data belum ada):
//        - Langsung submit tanpa konfirmasi
//   4. Setelah submit sukses:
//        - Update label tombol jadi "💾 Update Data"
//        - Set dataset.exists = "true" (karena data baru saja disimpan)
// =========================================================
document.getElementById('absenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');

    // ============================================
    // LANGKAH 1: Kalau data sudah ada, minta konfirmasi
    // ============================================
    if (btn.dataset.exists === "true") {
        const lanjutEdit = await showConfirmModal(
            `Data absensi untuk tanggal ini sudah ada. Timpa data yang lama dengan data baru?`
        );
        if (!lanjutEdit) {
            // User pilih "Tidak" → batal submit, biarkan form tetap terbuka
            return;
        }
    }

    // ============================================
    // LANGKAH 2: Kumpulkan data & submit ke server
    // ============================================
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
            // ============================================
            // Setelah sukses, update status tombol & flag
            // supaya konsisten dengan state data di server
            // ============================================
            btn.innerText = "💾 Update Data";
            btn.dataset.exists = "true";
        } else if (resData.sessionExpired) {
            showAlert(resData.message, false);
            setTimeout(logout, 1500);
        } else {
            showAlert(resData.message, false);
            // Kembalikan label tombol sesuai status sebelumnya
            btn.innerText = btn.dataset.exists === "true" ? "💾 Update Data" : "💾 Simpan Absensi";
        }
    } catch (error) {
        showAlert("Terjadi kesalahan jaringan saat menyimpan data.", false);
        btn.innerText = btn.dataset.exists === "true" ? "💾 Update Data" : "💾 Simpan Absensi";
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
// ===== SELESAI: REKAP KELAS SAYA =====


// =========================================================
// LOGOUT
// =========================================================
function logout() {
    sessionStorage.removeItem('guruSession');
    window.location.reload();
}
// ===== SELESAI: LOGOUT =====


// =========================================================
// FUNGSI BANTUAN: format tanggal
// =========================================================
// Format "yyyy-MM-dd" -> "dd/MM/yyyy"
function formatTanggalIndo(tanggalIso) {
    const [y, m, d] = tanggalIso.split('-');
    return `${d}/${m}/${y}`;
}

// Format "yyyy-MM-dd" -> "22 Jul 2026"
function formatTanggalIndoPanjang(tanggalStr) {
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const [y, m, d] = tanggalStr.split('-');
    return `${parseInt(d, 10)} ${bulan[parseInt(m, 10) - 1]} ${y}`;
}
// ===== SELESAI: FUNGSI BANTUAN TANGGAL =====


// =========================================================
// PANEL RIWAYAT ABSENSI
// =========================================================
function setupRiwayatSelectors() {
    const selMapel = document.getElementById('riwayatMapel');
    const selKelas = document.getElementById('riwayatKelas');
    if (selMapel.dataset.filled) return;
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
    listEl.innerHTML = '';
    loading.classList.remove('hidden');
    try {
        const response = await fetch(`${GAS_URL}?action=getRiwayatAbsensi&mapel=${encodeURIComponent(mapel)}&kelas=${encodeURIComponent(kelas)}`);
        const resData = await response.json();
        loading.classList.add('hidden');
        if (resData.success && resData.data.length > 0) {
            listEl.innerHTML = resData.data.map(rec => {
                const rincian = [
                    rec.namaIzin.length ? `Izin: ${rec.namaIzin.join(', ')}` : '',
                    rec.namaSakit.length ? `Sakit: ${rec.namaSakit.join(', ')}` : '',
                    rec.namaAlpa.length ? `Alpa: ${rec.namaAlpa.join(', ')}` : ''
                ].filter(Boolean).join(' &middot; ');
                return `
                    <div class="riwayat-card">
                        <div class="riwayat-header">
                            <span class="riwayat-tanggal">${formatTanggalIndoPanjang(rec.tanggal)}</span>
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
            listEl.innerHTML = `<p class="empty-state">Belum ada riwayat absensi untuk kelas &amp; mapel ini.</p>`;
        }
    } catch (error) {
        loading.classList.add('hidden');
        listEl.innerHTML = `<p class="empty-state">Gagal mengambil riwayat absensi.</p>`;
    }
}
// ===== SELESAI: PANEL RIWAYAT ABSENSI =====


// =========================================================
// PANEL DASHBOARD ANALITIK
// =========================================================
let trendChartInstance = null;

async function loadDashboard() {
    const loading = document.getElementById('dashboardLoading');
    const content = document.getElementById('dashboardContent');
    loading.classList.remove('hidden');
    content.classList.add('hidden');
    try {
        const response = await fetch(`${GAS_URL}?action=getDashboardData&mapel=${encodeURIComponent(sessionData.mapel)}&kelas=${encodeURIComponent(sessionData.kelas)}`);
        const resData = await response.json();
        loading.classList.add('hidden');
        content.classList.remove('hidden');
        if (resData.success) {
            renderRekapKelasMapel(resData.data.rekapKelasMapel);
            renderTrendChart(resData.data.trend);
            renderTopAlpa(resData.data.topAlpa);
        } else {
            content.innerHTML = `<p class="empty-state">${resData.message || 'Belum ada data absensi untuk ditampilkan.'}</p>`;
        }
    } catch (error) {
        loading.classList.add('hidden');
        content.classList.remove('hidden');
        content.innerHTML = `<p class="empty-state">Gagal memuat data dashboard.</p>`;
    }
}

function renderRekapKelasMapel(list) {
    const el = document.getElementById('rekapKelasMapelList');
    if (!list || list.length === 0) {
        el.innerHTML = `<p class="empty-state">Belum ada data.</p>`;
        return;
    }
    el.innerHTML = list.map(item => `<div class="rekap-bar-item"> <div class="rekap-bar-label"> <span>${item.label}</span> <span>${item.persenHadir}%</span> </div> <div class="rekap-bar-track"> <div class="rekap-bar-fill" style="width: ${item.persenHadir}%;"></div> </div> </div>`).join('');
}

function renderTopAlpa(list) {
    const el = document.getElementById('topAlpaList');
    if (!list || list.length === 0) {
        el.innerHTML = `<p class="empty-state">Tidak ada siswa dengan catatan Alpa. Bagus!</p>`;
        return;
    }
    el.innerHTML = list.map((s, i) => `<div class="alpa-item"> <span class="alpa-rank">${i + 1}</span> <span class="alpa-nama">${s.nama}</span> <span class="alpa-jumlah">${s.jumlahAlpa}x Alpa</span> </div>`).join('');
}

function renderTrendChart(trend) {
    const canvas = document.getElementById('trendChart');
    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }
    if (!trend || trend.length === 0) return;
    trendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: trend.map(t => formatTanggalIndoPanjang(t.tanggal)),
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
}
// ===== SELESAI: PANEL DASHBOARD ANALITIK =====


// =========================================================
// PANEL ABSEN WALI KELAS
// =========================================================
async function fetchStudentsWali(kelas) {
    const tbody = document.getElementById('waliStudentsBody');
    const loading = document.getElementById('waliLoading');
    const btnSubmit = document.getElementById('waliBtnSubmit');
    tbody.innerHTML = '';
    btnSubmit.style.display = 'none';
    loading.classList.remove('hidden');
    try {
        const response = await fetch(`${GAS_URL}?action=getStudents&kelas=${encodeURIComponent(kelas)}`);
        const resData = await response.json();
        loading.classList.add('hidden');
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
                tbody.appendChild(tr);
            });
            btnSubmit.style.display = 'block';

            // =====================================================
            // PERUBAHAN: panggil checkExistingAbsenWali() di sini
            // ---------------------------------------------------------
            // Sama seperti panel mapel, setelah data siswa dimuat,
            // langsung cek apakah data absensi untuk tanggal default
            // (hari ini) sudah ada. Hasilnya akan menentukan label
            // tombol dan status radio.
            // =====================================================
            await checkExistingAbsenWali();
        } else {
            tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
        }
    } catch (error) {
        loading.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
    }
}
// ===== SELESAI: FETCH DATA SISWA WALI =====


// =========================================================
// CEK ABSENSI WALI YANG SUDAH ADA
// ---------------------------------------------------------
// PERUBAHAN UTAMA (SAMA PERSIS DENGAN checkExistingAttendance):
// ---------------------------------------------------------
// Flow baru (tanpa popup konfirmasi):
//   1. Dipanggil otomatis saat user ganti tanggal
//      (event listener dipasang di showDashboard)
//   2. Cek ke server apakah data untuk kelas wali + tanggal
//      tersebut sudah ada
//   3. Kalau BELUM ADA:
//        - Tombol: "💾 Simpan Absensi"
//        - Radio: semua di-reset ke Hadir (H)
//        - btnSubmit.dataset.exists = "false"
//   4. Kalau SUDAH ADA:
//        - Tombol: "💾 Update Data"
//        - Radio: otomatis mengikuti data yang sudah tersimpan
//        - btnSubmit.dataset.exists = "true"
//
// Konsisten dengan panel mapel.
// =========================================================
async function checkExistingAbsenWali() {
    const kelas = sessionData.kelasWali;
    const tanggalInput = document.getElementById('waliTanggal');
    const tanggal = tanggalInput.value;
    const btnSubmit = document.getElementById('waliBtnSubmit');
    const rows = document.querySelectorAll('#waliStudentsBody tr.student-row');
    if (!kelas || !tanggal || rows.length === 0) return;

    btnSubmit.innerText = "Mengecek status...";
    btnSubmit.disabled = true;

    try {
        const response = await fetch(`${GAS_URL}?action=getAbsenWaliExisting&kelas=${encodeURIComponent(kelas)}&tanggal=${encodeURIComponent(tanggal)}`);
        const resData = await response.json();

        if (resData.success && resData.data) {
            // ============================================
            // DATA SUDAH ADA → set radio sesuai data lama
            // ============================================
            // resData.data berbentuk { "<NIS>": "H"/"I"/"S"/"A"/"-", ... }
            rows.forEach(row => {
                const nis = row.dataset.nis;
                let status = resData.data[nis];
                if (!status || status === '-') status = 'H';
                const targetRadio = document.querySelector(`input[name="wali_status_${nis}"][value="${status}"]`);
                if (targetRadio) targetRadio.checked = true;
            });

            // Label tombol & flag status
            btnSubmit.innerText = "💾 Update Data";
            btnSubmit.dataset.exists = "true";
        } else {
            // ============================================
            // DATA BELUM ADA → reset radio ke Hadir (H)
            // ============================================
            rows.forEach(row => {
                const nis = row.dataset.nis;
                const targetRadio = document.querySelector(`input[name="wali_status_${nis}"][value="H"]`);
                if (targetRadio) targetRadio.checked = true;
            });

            // Label tombol & flag status
            btnSubmit.innerText = "💾 Simpan Absensi";
            btnSubmit.dataset.exists = "false";
        }
    } catch (error) {
        btnSubmit.innerText = "💾 Simpan Absensi";
        btnSubmit.dataset.exists = "false";
    }

    btnSubmit.disabled = false;
}
// ===== SELESAI: CEK ABSENSI WALI YANG SUDAH ADA =====


// =========================================================
// SUBMIT ABSENSI WALI KELAS
// ---------------------------------------------------------
// PERUBAHAN UTAMA (SAMA PERSIS DENGAN submit panel mapel):
// ---------------------------------------------------------
// Flow baru:
//   1. Cek btnSubmit.dataset.exists
//   2. Kalau "true" (data sudah ada):
//        - Tampilkan konfirmasi "Data sudah ada, timpa?"
//        - Kalau user pilih "Tidak" → batal submit
//        - Kalau user pilih "Ya" → lanjut submit
//   3. Kalau "false" (data belum ada):
//        - Langsung submit tanpa konfirmasi
//   4. Setelah submit sukses:
//        - Update label tombol jadi "💾 Update Data"
//        - Set dataset.exists = "true"
// =========================================================
document.getElementById('waliAbsenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('waliBtnSubmit');

    // ============================================
    // LANGKAH 1: Kalau data sudah ada, minta konfirmasi
    // ============================================
    if (btn.dataset.exists === "true") {
        const lanjutEdit = await showConfirmModal(
            `Data absensi harian untuk tanggal ini sudah ada. Timpa data yang lama dengan data baru?`
        );
        if (!lanjutEdit) {
            return;
        }
    }

    // ============================================
    // LANGKAH 2: Kumpulkan data & submit ke server
    // ============================================
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
            // Update status tombol & flag setelah sukses
            btn.innerText = "💾 Update Data";
            btn.dataset.exists = "true";
            fetchRiwayatAbsenWali(); // refresh riwayat
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
// ===== SELESAI: SUBMIT ABSENSI WALI KELAS =====


// =========================================================
// RIWAYAT & REKAP ABSEN WALI KELAS
// =========================================================
async function fetchRiwayatAbsenWali() {
    if (!sessionData.kelasWali) return;
    const listEl = document.getElementById('waliRiwayatList');
    const loading = document.getElementById('waliRiwayatLoading');
    listEl.innerHTML = '';
    loading.classList.remove('hidden');
    try {
        const response = await fetch(`${GAS_URL}?action=getRiwayatAbsenWali&kelas=${encodeURIComponent(sessionData.kelasWali)}`);
        const resData = await response.json();
        loading.classList.add('hidden');
        if (resData.success && resData.data.length > 0) {
            listEl.innerHTML = resData.data.map(rec => {
                const rincian = [
                    rec.namaIzin.length ? `Izin: ${rec.namaIzin.join(', ')}` : '',
                    rec.namaSakit.length ? `Sakit: ${rec.namaSakit.join(', ')}` : '',
                    rec.namaAlpa.length ? `Alpa: ${rec.namaAlpa.join(', ')}` : ''
                ].filter(Boolean).join(' &middot; ');
                return `
                    <div class="riwayat-card">
                        <div class="riwayat-header">
                            <span class="riwayat-tanggal">${formatTanggalIndoPanjang(rec.tanggal)}</span>
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
            listEl.innerHTML = `<p class="empty-state">Belum ada riwayat absensi wali kelas.</p>`;
        }
    } catch (error) {
        loading.classList.add('hidden');
        listEl.innerHTML = `<p class="empty-state">Gagal mengambil riwayat absensi wali kelas.</p>`;
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
// ===== SELESAI: RIWAYAT & REKAP ABSEN WALI KELAS =====
