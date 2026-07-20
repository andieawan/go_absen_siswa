// GANTI DENGAN URL WEB APP GOOGLE APPS SCRIPT ANDA
const API_URL = "https://script.google.com/macros/s/AKfycbxpab_CCoYsktz_X_zpjESk2rdT9eWRTa84Zv6aDPBxigsXyKaPDdjKqwB2KAQ-CnH5ZA/exec";

// DOM Elements
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

// State Aplikasi
let isEditMode = false;

// Set Tanggal Hari Ini secara Default (Format local YYYY-MM-DD)
const hariIni = new Date().toISOString().split('T')[0];
inputTanggal.value = hariIni;

// Inisialisasi Aplikasi saat Load Pertama Kali
document.addEventListener("DOMContentLoaded", () => {
  muatDaftarKelas();
  
  // Daftarkan Service Worker untuk PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log("Service Worker terdaftar."))
      .catch(err => console.error("Gagal mendaftarkan Service Worker:", err));
  }
});

// Event Listeners untuk pemicu Auto-Detect Mode
selectKelas.addEventListener("change", muatDaftarSiswa);
inputTanggal.addEventListener("change", muatDaftarSiswa);

// 1. Ambil Daftar Kelas dari GAS
async function muatDaftarKelas() {
  tampilkanLoading(true);
  statusModeBadge.textContent = "Sinkronisasi...";
  try {
    const res = await fetch(`${API_URL}?action=getKelas`);
    const json = await res.json();
    
    if (json.success) {
      json.data.forEach(kelas => {
        const opt = document.createElement("option");
        opt.value = kelas;
        opt.textContent = kelas;
        selectKelas.appendChild(opt);
      });
      selectKelas.disabled = false;
      statusModeBadge.textContent = "Siap";
      statusModeBadge.className = "badge badge-info";
    } else {
      tampilkanAlert(json.message, "error");
    }
  } catch (err) {
    tampilkanAlert("Gagal terhubung ke server backend.", "error");
  } finally {
    tampilkanLoading(false);
  }
}

// 2. Ambil Siswa & Deteksi Status Absen (Auto Detect / Edit Mode)
async function muatDaftarSiswa() {
  const kelas = selectKelas.value;
  const tanggal = inputTanggal.value;
  
  if (!kelas || !tanggal) {
    absensiSection.classList.add("hidden");
    return;
  }
  
  tampilkanLoading(true);
  tampilkanAlert("", "clear");
  containerSiswa.innerHTML = "";
  
  try {
    const res = await fetch(`${API_URL}?action=getSiswa&kelas=${encodeURIComponent(kelas)}&tanggal=${tanggal}`);
    const json = await res.json();
    
    if (json.success) {
      const { siswa, riwayat } = json.data;
      totalSiswaBadge.textContent = `${siswa.length} Siswa`;
      
      // Deteksi apakah ini Mode Edit atau Input Baru
      const jumlahRiwayat = Object.keys(riwayat).length;
      if (jumlahRiwayat > 0) {
        isEditMode = true;
        statusModeBadge.textContent = "Mode Edit (Menimpa)";
        statusModeBadge.style.backgroundColor = "var(--sakit)";
      } else {
        isEditMode = false;
        statusModeBadge.textContent = "Mode Input Baru";
        statusModeBadge.style.backgroundColor = "var(--hadir)";
      }
      
      // Render Baris Konten Siswa ke DOM
      siswa.forEach((nama, index) => {
        // Ambil status lama dari riwayat jika ada, default kosong
        const statusLama = riwayat[nama] || "";
        
        const card = document.createElement("div");
        card.className = "siswa-card";
        card.innerHTML = `
          <div class="siswa-nama">${nama}</div>
          <div class="radio-group">
            <label>
              <input type="radio" name="absen_${index}" value="Hadir" data-nama="${nama}" ${statusLama === 'Hadir' ? 'checked' : ''} required>
              <div class="radio-label">Hadir</div>
            </label>
            <label>
              <input type="radio" name="absen_${index}" value="Sakit" data-nama="${nama}" ${statusLama === 'Sakit' ? 'checked' : ''}>
              <div class="radio-label">Sakit</div>
            </label>
            <label>
              <input type="radio" name="absen_${index}" value="Izin" data-nama="${nama}" ${statusLama === 'Izin' ? 'checked' : ''}>
              <div class="radio-label">Izin</div>
            </label>
            <label>
              <input type="radio" name="absen_${index}" value="Alfa" data-nama="${nama}" ${statusLama === 'Alfa' ? 'checked' : ''}>
              <div class="radio-label">Alfa</div>
            </label>
          </div>
        `;
        containerSiswa.appendChild(card);
      });
      
      absensiSection.classList.remove("hidden");
    } else {
      tampilkanAlert(json.message, "error");
    }
  } catch (err) {
    tampilkanAlert("Gagal mengambil data siswa.", "error");
  } finally {
    tampilkanLoading(false);
  }
}

// 3. Simpan / Post Absensi ke GAS
formAbsensi.addEventListener("submit", async (e) => {
  e.preventDefault();
  btnSimpan.disabled = true;
  tampilkanLoading(true);
  
  const kelas = selectKelas.value;
  const tanggal = inputTanggal.value;
  const dataKehadiran = [];
  
  // Mengumpulkan data dari radio button terpilih
  const radioTerpilih = containerSiswa.querySelectorAll('input[type="radio"]:checked');
  radioTerpilih.forEach(radio => {
    dataKehadiran.push({
      nama: radio.getAttribute("data-nama"),
      status: radio.value
    });
  });
  
  const payload = {
    kelas: kelas,
    tanggal: tanggal,
    dataKehadiran: dataKehadiran
  };
  
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      mode: "no-cors", // Digunakan karena redirect CORS bawaan Google Apps Script doPost
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json"
      }
    });
    
    // Karena mode 'no-cors', kita asumsikan sukses 200 jika baris kode di atas tidak melempar error catch
    tampilkanAlert(`Berhasil menyimpan data absensi kelas ${kelas}!`, "success");
    
    // Refresh UI untuk mengambil data terbaru dan memperbarui status mode
    setTimeout(muatDaftarSiswa, 1500);
    
  } catch (err) {
    tampilkanAlert("Terjadi kegagalan koneksi saat menyimpan.", "error");
  } finally {
    btnSimpan.disabled = false;
    tampilkanLoading(false);
  }
});

// Helper: Manajemen UI State
function tampilkanLoading(isLoading) {
  if (isLoading) loader.classList.remove("hidden");
  else loader.classList.add("hidden");
}

function tampilkanAlert(msg, type) {
  alertMsg.className = "alert";
  if (type === "clear") {
    alertMsg.classList.add("hidden");
    return;
  }
  
  alertMsg.textContent = msg;
  alertMsg.classList.remove("hidden");
  if (type === "success") alertMsg.classList.add("alert-success");
  if (type === "error") alertMsg.classList.add("alert-error");
}
