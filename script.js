// ==========================================
// 1. KONFIGURASI & PASANG URL BACKEND
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbyMGAl2rTMzOEVkosA-QKNrVvo69x3WZPrYgRBRcVF9JL-K1guOv-zJAWnisfCZ1t8n/exec";

// ==========================================
// 2. DEFINISI ELEMEN DOM
// ==========================================
const loginSection = document.getElementById("login-section");
const mainApp = document.getElementById("main-app");
const formLogin = document.getElementById("form-login");
const displayGuru = document.getElementById("display-guru");
const selectMapel = document.getElementById("select-mapel");
const selectKelas = document.getElementById("select-kelas");
const inputTanggal = document.getElementById("input-tanggal");
const containerSiswa = document.getElementById("container-siswa");
const absensiSection = document.getElementById("absensi-section");
const totalSiswaBadge = document.getElementById("total-siswa");
const statusModeBadge = document.getElementById("status-mode");
const formAbsensi = document.getElementById("form-absensi");
const loader = document.getElementById("loader");
const alertMsg = document.getElementById("alert-msg");
const btnSimpan = document.getElementById("btn-simpan");
const btnLogout = document.getElementById("btn-logout");

// ==========================================
// 3. STATE APLIKASI GLOBAL
// ==========================================
let sessionGuru = null;

// Set default tanggal hari ini (Format: YYYY-MM-DD)
inputTanggal.value = new Date().toISOString().split('T')[0];

// Inisialisasi PWA saat DOM selesai dimuat
document.addEventListener("DOMContentLoaded", () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .catch(err => console.error("Gagal mendaftarkan Service Worker PWA:", err));
  }
});

// Pemicu Auto-Detect ketika parameter absensi diubah
[selectKelas, selectMapel, inputTanggal].forEach(elem => {
  elem.addEventListener("change", muatDaftarSiswa);
});

// ==========================================
// 4. LOGIKA AUTHENTICATION: LOGIN GURU
// ==========================================
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  tampilkanLoading(true);
  tampilkanAlert("", "clear");
  
  const payload = {
    action: "login",
    username: document.getElementById("input-username").value,
    password: document.getElementById("input-password").value
  };
  
  try {
    const res = await fetch(API_URL, { 
      method: "POST", 
      body: JSON.stringify(payload) 
    });
    const json = await res.json();
    
    if (json.success) {
      sessionGuru = json.user;
      
      // Manajemen UI: Buka kunci halaman utama
      loginSection.classList.add("hidden");
      mainApp.classList.remove("hidden");
      btnLogout.classList.remove("hidden");
      
      // Tampilkan identitas pengajar
      displayGuru.value = sessionGuru.nama;
      
      // Inject pilihan Mapel dan Kelas sesuai hak akses akun
      selectMapel.innerHTML = '<option value="">-- Pilih Mapel --</option>';
      sessionGuru.mapel.forEach(m => selectMapel.appendChild(new Option(m, m)));
      
      selectKelas.innerHTML = '<option value="">-- Pilih Kelas --</option>';
      sessionGuru.kelas.forEach(k => selectKelas.appendChild(new Option(k, k)));
      
      selectMapel.disabled = false;
      selectKelas.disabled = false;
      statusModeBadge.textContent = "Berhasil Masuk";
      statusModeBadge.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
    } else {
      tampilkanAlert(json.message, "error");
    }
  } catch (err) {
    tampilkanAlert("Gagal memproses verifikasi login.", "error");
  } finally { 
    tampilkanLoading(false); 
  }
});

// ==========================================
// 5. DETEKSI OTOMATIS DATA LAMA / EDIT MODE
// ==========================================
async function muatDaftarSiswa() {
  const kelas = selectKelas.value;
  const tanggal = inputTanggal.value;
  const mapel = selectMapel.value;
  
  // Wajib memilih semua parameter filter sebelum merender siswa
  if (!kelas || !tanggal || !mapel) { 
    absensiSection.classList.add("hidden"); 
    return; 
  }
  
  tampilkanLoading(true);
  tampilkanAlert("", "clear");
  containerSiswa.innerHTML = "";
  
  try {
    const res = await fetch(`${API_URL}?action=getSiswa&kelas=${encodeURIComponent(kelas)}&tanggal=${tanggal}&mapel=${encodeURIComponent(mapel)}`);
    const json = await res.json();
    
    if (json.success) {
      const { siswa, riwayat } = json.data;
      totalSiswaBadge.textContent = `${siswa.length} Siswa`;
      
      // Evaluasi apakah riwayat tanggal & mapel ini sudah terisi di server
      if (Object.keys(riwayat).length > 0) {
        statusModeBadge.textContent = "Mode Edit (Menimpa)";
        statusModeBadge.style.backgroundColor = "var(--sakit)";
      } else {
        statusModeBadge.textContent = "Mode Input Baru";
        statusModeBadge.style.backgroundColor = "var(--hadir)";
      }
      
      // Buat form radio button siswa secara dinamis
      siswa.forEach((nama, index) => {
        const statusLama = riwayat[nama] || "";
        const card = document.createElement("div");
        card.className = "siswa-card";
        card.innerHTML = `
          <div class="siswa-nama">${nama}</div>
          <div class="radio-group">
            <label><input type="radio" name="absen_${index}" value="Hadir" data-nama="${nama}" ${statusLama === 'Hadir' ? 'checked' : ''} required><div class="radio-label">Hadir</div></label>
            <label><input type="radio" name="absen_${index}" value="Sakit" data-nama="${nama}" ${statusLama === 'Sakit' ? 'checked' : ''}><div class="radio-label">Sakit</div></label>
            <label><input type="radio" name="absen_${index}" value="Izin" data-nama="${nama}" ${statusLama === 'Izin' ? 'checked' : ''}><div class="radio-label">Izin</div></label>
            <label><input type="radio" name="absen_${index}" value="Alfa" data-nama="${nama}" ${statusLama === 'Alfa' ? 'checked' : ''}><div class="radio-label">Alfa</div></label>
          </div>`;
        containerSiswa.appendChild(card);
      });
      absensiSection.classList.remove("hidden");
    }
  } catch (err) { 
    tampilkanAlert("Gagal memuat list siswa dari database.", "error"); 
  } finally { 
    tampilkanLoading(false); 
  }
}

// ==========================================
// 6. SUBMIT DATA KEHADIRAN (SAVE ABSEN)
// ==========================================
formAbsensi.addEventListener("submit", async (e) => {
  e.preventDefault();
  btnSimpan.disabled = true;
  tampilkanLoading(true);
  
  const dataKehadiran = [];
  containerSiswa.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
    dataKehadiran.push({ 
      nama: radio.getAttribute("data-nama"), 
      status: radio.value 
    });
  });
  
  const payload = {
    action: "simpanAbsen",
    kelas: selectKelas.value,
    tanggal: inputTanggal.value,
    guru: sessionGuru.nama,
    mapel: selectMapel.value,
    dataKehadiran: dataKehadiran
  };
  
  try {
    // Menggunakan no-cors untuk bypass 302 Redirect pada Google Apps Script
    await fetch(API_URL, { 
      method: "POST", 
      mode: "no-cors", 
      body: JSON.stringify(payload) 
    });
    
    tampilkanAlert(`Absensi ${selectMapel.value} berhasil disimpan!`, "success");
    // Refresh otomatis data guna memicu perpindahan status ke "Mode Edit"
    setTimeout(muatDaftarSiswa, 1500);
  } catch (err) { 
    tampilkanAlert("Koneksi gagal saat menyimpan data.", "error"); 
  } finally { 
    btnSimpan.disabled = false; 
    tampilkanLoading(false); 
  }
});

// ==========================================
// 7. LOGIKA AUTHENTICATION: LOGOUT GURU
// ==========================================
btnLogout.addEventListener("click", () => {
  // Hapus kredensial sesi lokal
  sessionGuru = null;
  
  // Bersihkan form input login
  formLogin.reset();
  
  // Sembunyikan Workspace utama & Tampilkan panel login kembali
  mainApp.classList.add("hidden");
  absensiSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
  
  // Sembunyikan tombol logout & kembalikan badge status
  btnLogout.classList.add("hidden");
  statusModeBadge.textContent = "Silakan Login";
  statusModeBadge.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
  
  // Sterilisasi data dropdown agar tidak bocor ke user berikutnya
  selectMapel.innerHTML = '<option value="">-- Pilih Mapel --</option>';
  selectKelas.innerHTML = '<option value="">-- Pilih Kelas --</option>';
  selectMapel.disabled = true;
  selectKelas.disabled = true;
});

// ==========================================
// 8. HELPERS MANAJEMEN UI STATE
// ==========================================
function tampilkanLoading(isLoading) { 
  loader.className = isLoading ? "loader" : "loader hidden"; 
}

function tampilkanAlert(msg, type) {
  alertMsg.className = "alert";
  if (type === "clear") { 
    alertMsg.classList.add("hidden"); 
    return; 
  }
  alertMsg.textContent = msg;
  alertMsg.classList.remove("hidden");
  alertMsg.classList.add(type === "success" ? "alert-success" : "alert-error");
}
