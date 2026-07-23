import { getDashboardData } from './api.js';
import { showNotification, formatDateIndo } from './utils.js';

/**
 * Dashboard Module
 * Menampilkan statistik dan ringkasan absensi
 */

// Inisialisasi dashboard
export async function initDashboard() {
    await loadDashboardData();
}

// Load data dashboard dari backend
async function loadDashboardData() {
    const loadingEl = document.getElementById('dashboard-loading');
    const contentEl = document.getElementById('dashboard-content');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';
    
    try {
        const response = await getDashboardData();
        
        if (!response.success || !response.data) {
            throw new Error(response.message || 'Gagal memuat data dashboard');
        }
        
        renderDashboard(response.data);
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
        if (contentEl) {
            contentEl.innerHTML = `
                <div class="alert alert-danger">
                    Gagal memuat data dashboard: ${error.message}
                </div>
            `;
            contentEl.style.display = 'block';
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
    }
}

// Render data dashboard ke UI
function renderDashboard(data) {
    // Update kartu statistik
    updateStatCard('total-siswa', data.totalSiswa || 0);
    updateStatCard('hadir-hari-ini', data.hadirHariIni || 0);
    updateStatCard('izin-hari-ini', data.izinHariIni || 0);
    updateStatCard('sakit-hari-ini', data.sakitHariIni || 0);
    updateStatCard('alpha-hari-ini', data.alphaHariIni || 0);
    
    // Update persentase
    if (data.persentaseHadir !== undefined) {
        updateStatCard('persentase-hadir', `${data.persentaseHadir}%`, true);
    }
    
    // Render tabel jika ada
    if (data.rekapPerKelas) {
        renderRekapKelasTable(data.rekapPerKelas);
    }
    
    if (data.absensiTerbaru) {
        renderAbsensiTerbaruTable(data.absensiTerbaru);
    }
}

// Update kartu statistik
function updateStatCard(elementId, value, isPercentage = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    if (isPercentage) {
        el.textContent = value;
        // Tambahkan visual indicator untuk persentase
        const percentage = parseFloat(value);
        el.className = `stat-value ${percentage >= 90 ? 'text-success' : percentage >= 75 ? 'text-warning' : 'text-danger'}`;
    } else {
        el.textContent = typeof value === 'number' ? value.toLocaleString('id-ID') : value;
    }
}

// Render tabel rekap per kelas
function renderRekapKelasTable(rekapData) {
    const container = document.getElementById('rekap-kelas-table');
    if (!container || !Array.isArray(rekapData)) return;
    
    const html = `
        <table class="table table-hover">
            <thead>
                <tr>
                    <th>Kelas</th>
                    <th>Total Siswa</th>
                    <th>Hadir</th>
                    <th>Izin</th>
                    <th>Sakit</th>
                    <th>Alpha</th>
                    <th>Persentase</th>
                </tr>
            </thead>
            <tbody>
                ${rekapData.map(row => `
                    <tr>
                        <td><strong>${row.kelas}</strong></td>
                        <td>${row.totalSiswa}</td>
                        <td class="text-success">${row.hadir}</td>
                        <td class="text-warning">${row.izin}</td>
                        <td class="text-info">${row.sakit}</td>
                        <td class="text-danger">${row.alpha}</td>
                        <td>
                            <span class="badge ${row.persentase >= 90 ? 'badge-success' : row.persentase >= 75 ? 'badge-warning' : 'badge-danger'}">
                                ${row.persentase}%
                            </span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// Render tabel absensi terbaru
function renderAbsensiTerbaruTable(absensiData) {
    const container = document.getElementById('absensi-terbaru-table');
    if (!container || !Array.isArray(absensiData)) return;
    
    const html = `
        <table class="table table-hover">
            <thead>
                <tr>
                    <th>Tanggal</th>
                    <th>Guru</th>
                    <th>Mapel</th>
                    <th>Kelas</th>
                    <th>Hadir</th>
                    <th>Izin</th>
                    <th>Sakit</th>
                    <th>Alpha</th>
                </tr>
            </thead>
            <tbody>
                ${absensiData.map(row => `
                    <tr>
                        <td>${formatDateIndo(row.tanggal)}</td>
                        <td>${row.guru}</td>
                        <td>${row.mapel}</td>
                        <td><span class="badge badge-primary">${row.kelas}</span></td>
                        <td class="text-success">${row.hadir}</td>
                        <td class="text-warning">${row.izin}</td>
                        <td class="text-info">${row.sakit}</td>
                        <td class="text-danger">${row.alpha}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

export default {
    initDashboard
};
