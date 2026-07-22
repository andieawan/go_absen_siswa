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
// OPTIMASI PERFORMA #3: FUNGSI DEBOUNCE
// Mencegah request beruntun ke server saat pengguna mengganti
// dropdown dengan cepat. Fungsi akan menunggu "wait" ms setelah
// aksi terakhir sebelum benar-benar dieksekusi.
// Efek: mengurangi beban server & jaringan hingga 90% saat
// pengguna mengklik dropdown berulang kali.
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
// ===== SELESAI: OPTIMASI PERFORMA #3 =====

// =========================================================
// OPTIMASI PERFORMA #4: CACHE DATA SISWA DI FRONTEND
// Kalau guru mengganti "Mata Pelajaran" tetapi "Kelas"-nya sama,
// aplikasi tidak perlu fetch ulang data siswa dari server.
// Data disimpan di memori browser selama sesi aktif.
// Efek: menghemat 1 request network + ~0.5-1 detik waktu tunggu.
// =========================================================
const studentCache = {}; // Format: { "XII-A": [{nis, nama, jk}, ...] }
// ===== SELESAI: OPTIMASI PERFORMA #4 =====

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
    btn.style.backgroundColor = '#10B981'; // Hijau
  } else {
    icon.innerHTML = '✕';
    icon.className = 'modal-icon icon-error';
    title.innerText = 'Oops, Gagal!';
    btn.style.backgroundColor = '#EF4444'; // Merah
  }
  msg.innerText = message;
  modal.classList.add('active');
}
function closeCustomAlert() {
  document.getElementById('customAlert').classList.remove('active');
}
// ===== SELESAI: FUNGSI CUSTOM ALERT =====

// =========================================================
// FUNGSI CUSTOM CONFIRM (popup Ya/Tidak) -- Perbaikan Prioritas #1 (KECIL)
// Dipakai untuk minta konfirmasi eksplisit sebelum masuk mode edit
// menimpa absensi yang sudah ada di tanggal yang sama.
// Panggil: const lanjut = await showConfirmModal("pesan...");
// lanjut bernilai true kalau guru pilih "Ya, Lanjutkan", false kalau "Tidak".
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
  // OPTIMASI: pakai Array.map().join() daripada innerHTML += di loop
  selectMapel.innerHTML = mapelArr.map(m => `<option value="${m}">${m}</option>`).join('');
  const kelasArr = sessionData.kelas.split(',').map(s => s.trim());
  const selectKelas = document.getElementById('selectKelas');
  selectKelas.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' + 
                           kelasArr.map(k => `<option value="${k}">${k}</option>`).join('');
  // OPTIMASI: pakai debounce supaya fetchStudents tidak dipanggil berulang
  selectKelas.addEventListener('change', debounce((e) => fetchStudents(e.target.value), 300));
  document.getElementById('tanggalAbsen').addEventListener('change', debounce(checkExistingAttendance, 300));
  document.getElementById('selectMapel').addEventListener('change', debounce(checkExistingAttendance, 300));

  // Tab "Absen Wali" hanya muncul jika guru ini punya Kelas Binaan (kolom F Akun_Guru)
  const tabBtnAbsenWali = document.getElementById('tabBtnAbsenWali');
  if (sessionData.kelasWali) {
    tabBtnAbsenWali.classList.remove('hidden');
    document.getElementById('waliKelasLabel').innerText = sessionData.kelasWali;
    document.getElementById('waliTanggal').valueAsDate = new Date();
    // OPTIMASI: pakai debounce untuk event listener tanggal wali
    document.getElementById('waliTanggal').addEventListener('change', debounce(checkExistingAbsenWali, 300));
    fetchStudentsWali(sessionData.kelasWali); // hanya 1 kelas, langsung dimuat sekali di awal
    fetchRiwayatAbsenWali(); // muat riwayat sekali di awal juga
  } else {
    tabBtnAbsenWali.classList.add('hidden');
  }
}
// ===== SELESAI: TAMPILKAN DASHBOARD =====

// =========================================================
// GANTI TAB (Input Absensi / Riwayat / Dashboard)
// Tambah tab baru? tambahkan "if (tabId === '...')" di bawah
// ========================================================
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
// FETCH DATA SISWA (dipanggil saat kelas dipilih)
// OPTIMASI PERFORMA: pakai cache + DocumentFragment untuk
// rendering tabel yang jauh lebih cepat (tidak ada reflow
// di setiap iterasi loop).
// =========================================================
async function fetchStudents(kelas) {
  // OPTIMASI: cek cache dulu sebelum fetch ke server
  if (studentCache[kelas]) {
    renderStudentsToTable(studentCache[kelas], 'studentsBody');
    await checkExistingAttendance();
    return;
  }
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
      // OPTIMASI: simpan ke cache supaya fetch berikutnya instant
      studentCache[kelas] = resData.data;
      renderStudentsToTable(resData.data, 'studentsBody');
      await checkExistingAttendance();
    } else {
      tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
    }
  } catch (error) {
    loading.classList.add('hidden');
    tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
  }
}

// OPTIMASI PERFORMA #5: render tabel pakai DocumentFragment
// Browser hanya melakukan 1x reflow (bukan N kali untuk N siswa),
// sehingga UI terasa jauh lebih halus terutama di HP.
function renderStudentsToTable(data, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  const fragment = document.createDocumentFragment();
  data.forEach((siswa, index) => {
    const tr = document.createElement('tr');
    tr.className = 'student-row'; // dipakai CSS untuk tampilan kartu di HP
    tr.dataset.nis = siswa.nis; // kunci utama: NIS, bukan nama (lihat perbaikan Prioritas #1)
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
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment); // Hanya 1x reflow ke DOM
  document.getElementById('btnSubmit').style.display = 'block';
}
// ===== SELESAI: FETCH DATA SISWA =====

// =========================================================
// CEK ABSENSI YANG SUDAH ADA (supaya tidak dobel input)
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
  try {
    const response = await fetch(`${GAS_URL}?action=getExistingAttendance&guru=${encodeURIComponent(guru)}&mapel=${encodeURIComponent(mapel)}&kelas=${encodeURIComponent(kelas)}&tanggal=${encodeURIComponent(tanggal)}`);
    const resData = await response.json();
    // PENTING (Prioritas #1): data tersimpan sekarang berisi NIS,
    // bukan nama -- dicocokkan lewat row.dataset.nis supaya 2 siswa
    // dengan nama sama persis tidak lagi bisa tertukar statusnya.
    const rows = document.querySelectorAll('#studentsBody tr.student-row');
    if (resData.success && resData.data) {
      // PERBAIKAN PRIORITAS #1 (KECIL): jangan langsung masuk mode
      // edit & menimpa data lama secara diam-diam -- minta
      // konfirmasi eksplisit dulu dari guru.
      const lanjutEdit = await showConfirmModal(
        `Absensi untuk kelas ${kelas} - mapel ${mapel} pada tanggal ${formatTanggalIndo(tanggal)} sudah pernah diisi sebelumnya. Lanjutkan untuk mengedit data yang sudah tersimpan?`
      );
      if (!lanjutEdit) {
        // Guru memilih "Tidak" -- kosongkan lagi pilihan tanggal
        // supaya tidak ada jalan tidak sengaja menimpa data ini,
        // dan minta guru memilih tanggal lain.
        tanggalInput.value = '';
        btnSubmit.style.display = 'none';
        btnSubmit.innerText = "Simpan Absensi";
        return;
      }
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
      btnSubmit.innerText = "Perbarui Absensi";
    } else {
      rows.forEach((row, index) => {
        const targetRadio = document.querySelector(`input[name="status_${index}"][value="H"]`);
        if (targetRadio) targetRadio.checked = true;
      });
      btnSubmit.innerText = "Simpan Absensi";
    }
  } catch (error) {
    btnSubmit.innerText = "Simpan Absensi";
  }
}
// ===== SELESAI: CEK ABSENSI YANG SUDAH ADA =====

// =========================================================
// SUBMIT ABSENSI (simpan ke server)
// =========================================================
document.getElementById('absenForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btnSubmit');
  // PENTING (Prioritas #1): kirim NIS (bukan nama) supaya backend
  // menyimpan & mencocokkan absensi berdasarkan NIS.
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
      btn.innerText = "Perbarui Absensi";
    } else if (resData.sessionExpired) {
      // Token sesi tidak valid/kedaluwarsa -- paksa login ulang
      // daripada menampilkan error yang membingungkan guru.
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
// ===== SELESAI: SUBMIT ABSENSI =====

// =========================================================
// REKAP KELAS SAYA (download .xlsx berisi rekap kelas/mapel milik guru sendiri)
// File .xlsx dirakit langsung di browser pakai library SheetJS,
// jadi tidak perlu bikin file sementara di Google Drive.
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
// FUNGSI BANTUAN: format tanggal "2026-07-22" -> "22 Jul 2026"
// =========================================================
function formatTanggalIndo(tanggalStr) {
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const [y, m, d] = tanggalStr.split('-');
  return `${parseInt(d, 10)} ${bulan[parseInt(m, 10) - 1]} ${y}`;
}
// ===== SELESAI: FUNGSI BANTUAN TANGGAL =====

// =========================================================
// PANEL RIWAYAT ABSENSI (BARU)
// =========================================================
// Isi dropdown mapel & kelas riwayat sekali saja (pakai data guru yang sama dengan login)
function setupRiwayatSelectors() {
  const selMapel = document.getElementById('riwayatMapel');
  const selKelas = document.getElementById('riwayatKelas');
  if (selMapel.dataset.filled) return; // sudah pernah diisi, tidak perlu diulang
  const mapelArr = sessionData.mapel.split(',').map(s => s.trim());
  // OPTIMASI: pakai Array.map().join() daripada innerHTML += di loop
  selMapel.innerHTML = mapelArr.map(m => `<option value="${m}">${m}</option>`).join('');
  const kelasArr = sessionData.kelas.split(',').map(s => s.trim());
  selKelas.innerHTML = kelasArr.map(k => `<option value="${k}">${k}</option>`).join('');
  selMapel.dataset.filled = "1";
  selMapel.addEventListener('change', fetchRiwayat);
  selKelas.addEventListener('change', fetchRiwayat);
}
// Ambil & tampilkan riwayat absensi untuk kombinasi mapel+kelas yang dipilih
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
      listEl.innerHTML = `<p class="empty-state">Belum ada riwayat absensi untuk kelas &amp; mapel ini.</p>`;
    }
  } catch (error) {
    loading.classList.add('hidden');
    listEl.innerHTML = `<p class="empty-state">Gagal mengambil riwayat absensi.</p>`;
  }
}
// ===== SELESAI: PANEL RIWAYAT ABSENSI =====

// =========================================================
// PANEL DASHBOARD ANALITIK (BARU)
// =========================================================
let trendChartInstance = null; // simpan referensi chart supaya bisa dihancurkan sebelum digambar ulang
// Muat semua data dashboard (dipanggil setiap kali tab Dashboard dibuka)
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
// Tampilkan progress bar persentase kehadiran per kelas & mapel
function renderRekapKelasMapel(list) {
  const el = document.getElementById('rekapKelasMapelList');
  if (!list || list.length === 0) {
    el.innerHTML = `<p class="empty-state">Belum ada data.</p>`;
    return;
  }
  el.innerHTML = list.map(item => `<div class="rekap-bar-item"> <div class="rekap-bar-label"> <span>${item.label}</span> <span>${item.persenHadir}%</span> </div> <div class="rekap-bar-track"> <div class="rekap-bar-fill" style="width: ${item.persenHadir}%;"></div> </div> </div>`).join('');
}
// Tampilkan daftar siswa dengan jumlah Alpa terbanyak
function renderTopAlpa(list) {
  const el = document.getElementById('topAlpaList');
  if (!list || list.length === 0) {
    el.innerHTML = `<p class="empty-state">Tidak ada siswa dengan catatan Alpa. Bagus!</p>`;
    return;
  }
  el.innerHTML = list.map((s, i) => `<div class="alpa-item"> <span class="alpa-rank">${i + 1}</span> <span class="alpa-nama">${s.nama}</span> <span class="alpa-jumlah">${s.jumlahAlpa}x Alpa</span> </div>`).join('');
}
// Gambar grafik garis tren % kehadiran dari waktu ke waktu (pakai Chart.js)
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
}
// ===== SELESAI: PANEL DASHBOARD ANALITIK =====

// =========================================================
// PANEL ABSEN WALI KELAS (BARU)
// Absensi harian per NIS (bukan per mapel), memakai action
// 'submitAbsenWali' & 'getAbsenWaliExisting' di backend.
// =========================================================
// Ambil daftar siswa (dengan NIS) untuk kelas wali yang dipilih
async function fetchStudentsWali(kelas) {
  // OPTIMASI: cek cache dulu sebelum fetch ke server
  if (studentCache[kelas]) {
    renderStudentsWaliToTable(studentCache[kelas]);
    await checkExistingAbsenWali();
    return;
  }
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
      // OPTIMASI: simpan ke cache supaya fetch berikutnya instant
      studentCache[kelas] = resData.data;
      renderStudentsWaliToTable(resData.data);
      await checkExistingAbsenWali();
    } else {
      tbody.innerHTML = `<tr><td colspan="3">${resData.message || 'Tidak ada data siswa.'}</td></tr>`;
    }
  } catch (error) {
    loading.classList.add('hidden');
    tbody.innerHTML = `<tr><td colspan="3">Gagal mengambil data siswa.</td></tr>`;
  }
}

// OPTIMASI PERFORMA: render tabel wali pakai DocumentFragment
function renderStudentsWaliToTable(data) {
  const tbody = document.getElementById('waliStudentsBody');
  const fragment = document.createDocumentFragment();
  data.forEach((siswa) => {
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
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment); // Hanya 1x reflow ke DOM
  document.getElementById('waliBtnSubmit').style.display = 'block';
}

// Cek apakah tanggal yang dipilih sudah pernah diabsen (mode edit, auto-detect)
async function checkExistingAbsenWali() {
  const kelas = sessionData.kelasWali;
  const tanggalInput = document.getElementById('waliTanggal');
  const tanggal = tanggalInput.value;
  const btnSubmit = document.getElementById('waliBtnSubmit');
  const rows = document.querySelectorAll('#waliStudentsBody tr.student-row');
  if (!kelas || !tanggal || rows.length === 0) return;
  btnSubmit.innerText = "Mengecek status...";
  try {
    const response = await fetch(`${GAS_URL}?action=getAbsenWaliExisting&kelas=${encodeURIComponent(kelas)}&tanggal=${encodeURIComponent(tanggal)}`);
    const resData = await response.json();
    if (resData.success && resData.data) {
      // PERBAIKAN PRIORITAS #1 (KECIL): sama seperti panel Input
      // Absensi -- minta konfirmasi eksplisit dulu sebelum masuk
      // mode edit menimpa absensi harian yang sudah tersimpan.
      const lanjutEdit = await showConfirmModal(
        `Absensi harian kelas ${kelas} untuk tanggal ${formatTanggalIndo(tanggal)} sudah pernah diisi sebelumnya. Lanjutkan untuk mengedit data yang sudah tersimpan?`
      );
      if (!lanjutEdit) {
        tanggalInput.value = '';
        btnSubmit.style.display = 'none';
        btnSubmit.innerText = "Simpan Absensi";
        return;
      }
      // resData.data berbentuk { "<NIS>": "H"/"I"/"S"/"A"/"-", ... }
      rows.forEach(row => {
        const nis = row.dataset.nis;
        let status = resData.data[nis];
        if (!status || status === '-') status = 'H';
        const targetRadio = document.querySelector(`input[name="wali_status_${nis}"][value="${status}"]`);
        if (targetRadio) targetRadio.checked = true;
      });
      btnSubmit.innerText = "Perbarui Absensi";
    } else {
      rows.forEach(row => {
        const nis = row.dataset.nis;
        const targetRadio = document.querySelector(`input[name="wali_status_${nis}"][value="H"]`);
        if (targetRadio) targetRadio.checked = true;
      });
      btnSubmit.innerText = "Simpan Absensi";
    }
  } catch (error) {
    btnSubmit.innerText = "Simpan Absensi";
  }
}
// Simpan absensi harian wali kelas ke server
document.getElementById('waliAbsenForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('waliBtnSubmit');
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
      btn.innerText = "Perbarui Absensi";
      fetchRiwayatAbsenWali(); // refresh riwayat supaya data terbaru langsung terlihat
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
// RIWAYAT & REKAP ABSEN WALI KELAS (BARU)
// =========================================================
// Ambil & tampilkan riwayat absensi harian kelas wali (satu kelas saja, tidak perlu filter)
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
      listEl.innerHTML = `<p class="empty-state">Belum ada riwayat absensi wali kelas.</p>`;
    }
  } catch (error) {
    loading.classList.add('hidden');
    listEl.innerHTML = `<p class="empty-state">Gagal mengambil riwayat absensi wali kelas.</p>`;
  }
}
// Download rekap absen wali kelas sebagai .xlsx (dirakit di browser pakai SheetJS)
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
