// ================= CONFIGURATION =================
// ⚠️ TEMPELKAN URL HASIL NEW DEPLOYMENT APPS SCRIPT ANDA DI SINI
const API_URL = "https://script.google.com/macros/s/AKfycbyMGAl2rTMzOEVkosA-QKNrVvo69x3WZPrYgRBRcVF9JL-K1guOv-zJAWnisfCZ1t8n/exec";

// ================= DOM ELEMENTS =================
const halamanLogin = document.getElementById("halaman-login");
const halamanUtama = document.getElementById("halaman-utama");

const formLogin = document.getElementById("form-login");
const btnLoginSubmit = document.getElementById("btn-login-submit");
const textLoginBtn = document.getElementById("text-login-btn");
const spinnerLogin = document.getElementById("spinner-login");
const alertLogin = document.getElementById("alert-login");

const namaGuruDisplay = document.getElementById("nama-guru-display");
const btnLogout = document.getElementById("btn-logout");
const selectMapel = document.getElementById("select-mapel");
const selectKelas = document.getElementById("select-kelas");

// Global session state untuk menyimpan data guru aktif
let sessionGuru = null;

// Service Worker disabled temporary for active production/development caching escape
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
      console.log("Service Worker berhasil dibersihkan untuk menghindari konflik cache.");
    }
  });
}

// ================= HELPER FUNCTIONS =================
function tampilkanAlert(message, tipe) {
  if (tipe === "clear") {
    alertLogin.classList.add("hidden");
    alertLogin.textContent = "";
    return;
  }
  
  alertLogin.classList.remove("hidden");
  alertLogin.textContent = message;
  
  if (tipe === "error") {
    alertLogin.className = "p-3 rounded-lg text-sm mb-4 bg-red-100 text-red-700 border border-red-400";
  } else if (tipe === "success") {
    alertLogin.className = "p-3 rounded-lg text-sm mb-4 bg-green-100 text-green-700 border border-green-400";
  }
}

function initPilihanFormAbsen() {
  if (!sessionGuru) return;
  
  // Set nama guru di dashboard header
  namaGuruDisplay.textContent = sessionGuru.nama;
  
  // Kosongkan dan isi opsi Dropdown Mata Pelajaran
  selectMapel.innerHTML = '<option value="">-- Pilih Mata Pelajaran --</option>';
  sessionGuru.mapel.forEach(mapel => {
    const opt = document.createElement("option");
    opt.value = mapel;
    opt.textContent = mapel;
    selectMapel.appendChild(opt);
  });
  
  // Kosongkan dan isi opsi Dropdown Kelas
  selectKelas.innerHTML = '<option value="">-- Pilih Kelas --</option>';
  sessionGuru.kelas.forEach(kelas => {
    const opt = document.createElement("option");
    opt.value = kelas;
    opt.textContent = kelas;
    selectKelas.appendChild(opt);
  });
  
  console.log("Dropdown Mapel dan Kelas berhasil diisi secara dinamis.");
}

// ================= EVENT LISTENERS =================

// Event submit form login
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Aktifkan State Loading UI
    btnLoginSubmit.disabled = true;
    textLoginBtn.textContent = "Memverifikasi...";
    spinnerLogin.classList.remove("hidden");
    tampilkanAlert("", "clear");
    
    const payload = {
      action: "login",
      username: document.getElementById("input-username").value.trim(),
      password: document.getElementById("input-password").value.trim()
    };
    
    console.log("1. Mengirim data otentikasi ke server...", payload);
    
    try {
      const res = await fetch(API_URL, { 
        method: "POST", 
        body: JSON.stringify(payload) 
      });
      
      console.log("2. Status Respon HTTP Jaringan:", res.status);
      
      if (res.status !== 200) {
        throw new Error("Server Apps Script memberikan respon internal error " + res.status);
      }
      
      const json = await res.json();
      console.log("3. Payload JSON dari server:", json);
      
      if (json && json.success) {
        console.log("-> Login Terverifikasi! Mengalihkan ke Dashboard.");
        tampilkanAlert(json.message, "success");
        
        // Simpan data respons server ke session global
        sessionGuru = json.user;
        
        // Pindah Tampilan Halaman
        halamanLogin.classList.add("hidden");
        halamanUtama.classList.remove("hidden");
        
        // Render data dropdown dashboard
        initPilihanFormAbsen();
        
        // Reset form login setelah sukses
        formLogin.reset();
      } else {
        console.warn("-> Akses Ditolak Backend:", json ? json.message : "Tanpa keterangan");
        tampilkanAlert(json ? json.message : "Username atau password salah!", "error");
      }
    } catch (err) {
      console.error("4. Fatal Error Exception saat Fetch Data:", err);
      tampilkanAlert("Koneksi gagal atau URL Web App Anda salah. Periksa kembali deployment Anda.", "error");
    } finally { 
      // Kembalikan tombol ke keadaan normal
      btnLoginSubmit.disabled = false;
      textLoginBtn.textContent = "Masuk Aplikasi";
      spinnerLogin.classList.add("hidden");
    }
  });
}

// Event klik tombol logout
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    sessionGuru = null;
    halamanUtama.classList.add("hidden");
    halamanLogin.classList.remove("hidden");
    tampilkanAlert("Anda telah keluar dari aplikasi.", "success");
    console.log("User melakukan logout, session dibersihkan.");
  });
}
