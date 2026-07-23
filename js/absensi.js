import { submitAbsensi, getSiswaByKelas } from './api.js';
import { showLoading, hideLoading, showNotification, formatDate } from './utils.js';

/**
 * Absensi Module
 * Mengelola form absensi per mata pelajaran
 */

// Inisialisasi form absensi
export function initAbsensiForm() {
    const form = document.getElementById('form-absensi');
    if (!form) return;
    
    setupFormListeners(form);
    loadKelasOptions();
}

// Setup event listeners untuk form
function setupFormListeners(form) {
    form.addEventListener('submit', handleFormSubmit);
    
    // Auto-update daftar siswa saat kelas berubah
    const kelasSelect = document.getElementById('kelas');
    if (kelasSelect) {
        kelasSelect.addEventListener('change', () => {
            loadSiswaList(kelasSelect.value);
        });
    }
    
    // Set tanggal hari ini sebagai default
    const tanggalInput = document.getElementById('tanggal');
    if (tanggalInput && !tanggalInput.value) {
        tanggalInput.value = formatDate(new Date());
    }
}

// Load opsi kelas dari backend atau hardcoded
async function loadKelasOptions() {
    const kelasSelect = document.getElementById('kelas');
    if (!kelasSelect) return;
    
    // Contoh: bisa di-load dari backend jika diperlukan
    const kelasList = ['X-A', 'X-B', 'XI-A', 'XI-B', 'XII-A', 'XII-B'];
    
    kelasSelect.innerHTML = '<option value="">-- Pilih Kelas --</option>';
    kelasList.forEach(kelas => {
        const option = document.createElement('option');
        option.value = kelas;
        option.textContent = kelas;
        kelasSelect.appendChild(option);
    });
}

// Load daftar siswa berdasarkan kelas
async function loadSiswaList(kelas) {
    const container = document.getElementById('siswa-list');
    if (!container || !kelas) {
        if (container) container.innerHTML = '';
        return;
    }
    
    showLoading('btn-load-siswa');
    
    try {
        const response = await getSiswaByKelas(kelas);
        
        if (!response.success || !response.data) {
            showNotification('Gagal memuat data siswa', 'error');
            container.innerHTML = '<p class="text-danger">Gagal memuat data siswa</p>';
            return;
        }
        
        renderSiswaList(container, response.data);
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
        container.innerHTML = '<p class="text-danger">Terjadi kesalahan saat memuat data</p>';
    } finally {
        hideLoading('btn-load-siswa');
    }
}

// Render daftar siswa ke dalam form
function renderSiswaList(container, siswaList) {
    if (!Array.isArray(siswaList) || siswaList.length === 0) {
        container.innerHTML = '<p class="text-muted">Tidak ada siswa di kelas ini</p>';
        return;
    }
    
    const html = `
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>No</th>
                    <th>NIS</th>
                    <th>Nama</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${siswaList.map((siswa, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${siswa.nis}</td>
                        <td>${siswa.nama}</td>
                        <td>
                            <select name="status_${siswa.nis}" class="form-select status-select">
                                <option value="H">Hadir</option>
                                <option value="I">Izin</option>
                                <option value="S">Sakit</option>
                                <option value="A">Alpha</option>
                            </select>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// Handle form submit
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Validasi sederhana
    const guru = document.getElementById('guru')?.value;
    const mapel = document.getElementById('mapel')?.value;
    const kelas = document.getElementById('kelas')?.value;
    const tanggal = document.getElementById('tanggal')?.value;
    
    if (!guru || !mapel || !kelas || !tanggal) {
        showNotification('Semua field wajib diisi', 'error');
        return;
    }
    
    // Kumpulkan data absensi
    const attendance = [];
    const statusSelects = form.querySelectorAll('.status-select');
    
    statusSelects.forEach(select => {
        const row = select.closest('tr');
        const nis = row.querySelector('td:nth-child(2)').textContent;
        const nama = row.querySelector('td:nth-child(3)').textContent;
        const status = select.value;
        
        attendance.push({ nis, nama, status });
    });
    
    if (attendance.length === 0) {
        showNotification('Tidak ada data absensi', 'error');
        return;
    }
    
    showLoading(submitBtn.id || 'submit-btn');
    
    try {
        const response = await submitAbsensi({
            guru,
            mapel,
            kelas,
            tanggal,
            attendance
        });
        
        if (response.success) {
            showNotification('Absensi berhasil disimpan', 'success');
            form.reset();
            document.getElementById('siswa-list').innerHTML = '';
        } else {
            showNotification(response.message || 'Gagal menyimpan absensi', 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    } finally {
        hideLoading(submitBtn.id || 'submit-btn');
    }
}

export default {
    initAbsensiForm
};
