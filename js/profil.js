// =========================================================
// PANEL PROFIL AKUN (nama, ganti password, foto profil)
// =========================================================

import { getProfilSaya, updateProfil, uploadFotoProfil } from './api.js?v=20260731e';
import { showNotification, escapeHtml } from './utils.js?v=20260731e';

const UKURAN_MAKS_FOTO_PX = 400; // foto diresize maks 400x400px sebelum diunggah
const KUALITAS_JPEG = 0.8;       // 0-1, semakin kecil semakin kecil ukuran filenya

export function initProfil(user) {
    const fotoPreview = document.getElementById('profilFotoPreview');
    const fotoKosong = document.getElementById('profilFotoKosong');
    const inputFoto = document.getElementById('inputFotoProfil');
    const btnPilihFoto = document.getElementById('btnPilihFoto');
    const fotoMsg = document.getElementById('profilFotoMsg');

    const formNama = document.getElementById('formProfilNama');
    const inputNama = document.getElementById('profilNama');
    const namaMsg = document.getElementById('profilNamaMsg');

    const formPassword = document.getElementById('formProfilPassword');
    const inputPasswordLama = document.getElementById('profilPasswordLama');
    const inputPasswordBaru = document.getElementById('profilPasswordBaru');
    const inputPasswordKonfirmasi = document.getElementById('profilPasswordKonfirmasi');
    const passwordMsg = document.getElementById('profilPasswordMsg');

    function tampilkanFoto(url) {
        if (!fotoPreview || !fotoKosong) return;
        if (url) {
            fotoPreview.src = url;
            fotoPreview.classList.remove('hidden');
            fotoKosong.classList.add('hidden');
        } else {
            fotoPreview.classList.add('hidden');
            fotoKosong.classList.remove('hidden');
        }
        // Ikut perbarui avatar kecil di kartu "Selamat Datang" atas, supaya
        // foto yang sama muncul di 2 tempat tanpa perlu reload halaman.
        const headerAvatar = document.getElementById('headerAvatar');
        if (headerAvatar) {
            if (url) {
                headerAvatar.innerHTML = `<img src="${escapeHtml(url)}" alt="Foto profil" class="header-avatar-img">`;
            } else {
                headerAvatar.innerHTML = '👨‍🏫';
            }
        }
    }

    // Muat data profil saat ini (nama + foto) untuk mengisi form.
    async function muatProfil() {
        try {
            const res = await getProfilSaya();
            if (!res.success) {
                showNotification(res.message || 'Gagal memuat profil.', 'error');
                return;
            }
            if (inputNama) inputNama.value = res.data.nama || '';
            tampilkanFoto(res.data.fotoUrl);
        } catch (err) {
            showNotification('Gagal memuat profil: ' + err.message, 'error');
        }
    }

    // --- Ganti foto profil ---
    if (btnPilihFoto && inputFoto) {
        btnPilihFoto.addEventListener('click', () => inputFoto.click());

        inputFoto.addEventListener('change', async () => {
            const file = inputFoto.files && inputFoto.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showNotification('File yang dipilih bukan gambar.', 'error');
                return;
            }

            if (fotoMsg) { fotoMsg.textContent = 'Mengompres & mengunggah foto...'; fotoMsg.className = 'login-msg'; }
            if (btnPilihFoto) btnPilihFoto.disabled = true;

            try {
                const { base64Data, mimeType, dataUrl } = await kompresGambarSebelumUpload(file);
                tampilkanFoto(dataUrl); // preview instan sebelum menunggu respons server

                const res = await uploadFotoProfil(base64Data, mimeType);
                if (!res.success) {
                    showNotification(res.message || 'Gagal mengunggah foto.', 'error');
                    if (fotoMsg) { fotoMsg.textContent = res.message || 'Gagal mengunggah foto.'; fotoMsg.className = 'login-msg error'; }
                    return;
                }
                tampilkanFoto(res.data.fotoUrl); // ganti ke URL asli dari Drive
                showNotification('Foto profil berhasil diperbarui.', 'success');
                if (fotoMsg) { fotoMsg.textContent = ''; fotoMsg.className = 'login-msg'; }
            } catch (err) {
                showNotification('Gagal mengunggah foto: ' + err.message, 'error');
                if (fotoMsg) { fotoMsg.textContent = 'Gagal: ' + err.message; fotoMsg.className = 'login-msg error'; }
            } finally {
                if (btnPilihFoto) btnPilihFoto.disabled = false;
                inputFoto.value = ''; // supaya bisa pilih file yang sama lagi kalau mau coba ulang
            }
        });
    }

    // --- Ganti nama ---
    if (formNama) {
        formNama.addEventListener('submit', async (e) => {
            e.preventDefault();
            const namaBaru = inputNama?.value.trim();
            if (!namaBaru) return;

            const btn = formNama.querySelector('button[type="submit"]');
            setTombolLoading(btn, true);
            if (namaMsg) namaMsg.textContent = '';

            try {
                const res = await updateProfil({ nama: namaBaru });
                if (namaMsg) {
                    namaMsg.textContent = res.message || (res.success ? 'Berhasil disimpan.' : 'Gagal menyimpan.');
                    namaMsg.className = 'login-msg ' + (res.success ? 'success' : 'error');
                }
                if (res.success) {
                    showNotification('Nama berhasil diperbarui.', 'success');
                    const greetingEl = document.getElementById('greeting');
                    if (greetingEl) greetingEl.textContent = `Selamat Datang, ${namaBaru}!`;
                }
            } catch (err) {
                if (namaMsg) { namaMsg.textContent = 'Gagal: ' + err.message; namaMsg.className = 'login-msg error'; }
            } finally {
                setTombolLoading(btn, false);
            }
        });
    }

    // --- Ganti password ---
    if (formPassword) {
        formPassword.addEventListener('submit', async (e) => {
            e.preventDefault();
            const passwordLama = inputPasswordLama?.value || '';
            const passwordBaru = inputPasswordBaru?.value || '';
            const passwordKonfirmasi = inputPasswordKonfirmasi?.value || '';

            if (!passwordLama || !passwordBaru || !passwordKonfirmasi) {
                if (passwordMsg) { passwordMsg.textContent = 'Isi semua kolom untuk mengganti password.'; passwordMsg.className = 'login-msg error'; }
                return;
            }
            if (passwordBaru.length < 6) {
                if (passwordMsg) { passwordMsg.textContent = 'Password baru minimal 6 karakter.'; passwordMsg.className = 'login-msg error'; }
                return;
            }
            if (passwordBaru !== passwordKonfirmasi) {
                if (passwordMsg) { passwordMsg.textContent = 'Konfirmasi password baru tidak cocok.'; passwordMsg.className = 'login-msg error'; }
                return;
            }

            const btn = formPassword.querySelector('button[type="submit"]');
            setTombolLoading(btn, true);
            if (passwordMsg) passwordMsg.textContent = '';

            try {
                const res = await updateProfil({ passwordLama, passwordBaru });
                if (passwordMsg) {
                    passwordMsg.textContent = res.message || (res.success ? 'Berhasil disimpan.' : 'Gagal menyimpan.');
                    passwordMsg.className = 'login-msg ' + (res.success ? 'success' : 'error');
                }
                if (res.success) {
                    showNotification('Password berhasil diganti.', 'success');
                    formPassword.reset();
                }
            } catch (err) {
                if (passwordMsg) { passwordMsg.textContent = 'Gagal: ' + err.message; passwordMsg.className = 'login-msg error'; }
            } finally {
                setTombolLoading(btn, false);
            }
        });
    }

    muatProfil();
}

function setTombolLoading(btn, loading) {
    if (!btn) return;
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    btn.disabled = loading;
    if (btnText) btnText.classList.toggle('hidden', loading);
    if (btnLoader) btnLoader.classList.toggle('hidden', !loading);
}

/**
 * Resize (maks 400x400px) & kompres (JPEG kualitas 0.8) foto lewat
 * <canvas> di browser SEBELUM dikirim ke server -- supaya payload upload
 * tetap kecil (beberapa puluh-ratus KB, bukan foto asli kamera yang bisa
 * beberapa MB), lebih cepat diunggah dan lebih ringan untuk kuota Drive.
 */
/**
 * PATCH: parameter `format` (opsional, default 'jpeg') -- logo sekolah
 * dipanggil dengan 'png' supaya latar TRANSPARAN aslinya tetap
 * dipertahankan (logo jadi terlihat "menempel" ke gradasi warna halaman
 * login, bukan kotak solid). Foto profil tetap 'jpeg' seperti sebelumnya
 * (ukuran file lebih kecil, memang tidak butuh transparansi untuk foto
 * wajah biasa).
 */
export function kompresGambarSebelumUpload(file, format = 'jpeg') {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
            img.onload = () => {
                let { width, height } = img;
                if (width > height && width > UKURAN_MAKS_FOTO_PX) {
                    height = Math.round(height * (UKURAN_MAKS_FOTO_PX / width));
                    width = UKURAN_MAKS_FOTO_PX;
                } else if (height > UKURAN_MAKS_FOTO_PX) {
                    width = Math.round(width * (UKURAN_MAKS_FOTO_PX / height));
                    height = UKURAN_MAKS_FOTO_PX;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                if (format !== 'png') {
                    // PATCH: kanvas HTML defaultnya TRANSPARAN, dan area
                    // transparan itu jadi HITAM begitu diekspor ke JPEG
                    // (JPEG tidak punya kanal transparansi) -- diisi latar
                    // PUTIH dulu supaya area transparan jadi putih, bukan
                    // hitam. TIDAK dilakukan untuk format PNG (di bawah),
                    // karena PNG justru kita MAU pertahankan transparansi
                    // aslinya, bukan menimpanya dengan putih.
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }
                ctx.drawImage(img, 0, 0, width, height);

                const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
                const dataUrl = format === 'png'
                    ? canvas.toDataURL('image/png')
                    : canvas.toDataURL('image/jpeg', KUALITAS_JPEG);
                const base64Data = dataUrl.split(',')[1]; // buang prefix "data:xxx;base64,"
                resolve({ base64Data, mimeType, dataUrl });
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}
