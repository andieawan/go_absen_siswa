/**
 * Dashboard Module
 * Menangani rendering dan logika untuk panel Dashboard (Analitik)
 * Termasuk dashboard per mapel dan dashboard untuk wali kelas
 */

import { getDashboardData, getDashboardDataWali } from './api.js';
import { showNotification } from './utils.js';

// Cache untuk data dashboard
let dashboardCache = {
    mapel: null,
    wali: null
};

/**
 * Escape HTML untuk mencegah XSS
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Render chart kehadiran per mapel/kelas
 */
function renderRekapKelasMapelList(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<p class="empty-state">Tidak ada data</p>';
        return;
    }

    let html = '<div class="stats-grid">';
    data.forEach(item => {
        const persenHadir = item.persenHadir || 0;
        const className = persenHadir >= 80 ? 'stat-hadir' : persenHadir >= 60 ? 'stat-izin' : 'stat-alpa';
        html += `
            <div class="stat-card ${className}">
                <div class="stat-icon">📊</div>
                <div class="stat-info">
                    <div class="stat-value">${escapeHtml(item.kelas || '-')}: ${persenHadir.toFixed(1)}%</div>
                    <div class="stat-label">${escapeHtml(item.mapel || '')}</div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

/**
 * Render list siswa dengan alpa terbanyak
 */
function renderTopAlpaList(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<p class="empty-state">Tidak ada siswa perlu perhatian</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table class="simple-table"><thead><tr><th>Nama</th><th>Kelas</th><th>Alpa</th></tr></thead><tbody>';
    data.slice(0, 10).forEach(siswa => {
        html += `<tr>
            <td>${escapeHtml(siswa.nama)}</td>
            <td>${escapeHtml(siswa.kelas)}</td>
            <td><span class="badge badge-danger">${siswa.alpha}</span></td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

/**
 * Render trend chart (simplified - tanpa library chart eksternal)
 */
function renderTrendChart(data, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) {
        return;
    }

    // Simplified visual representation menggunakan bar CSS
    const container = canvas.parentElement;
    if (!container) return;

    let html = '<div class="trend-bars">';
    data.forEach((item, idx) => {
        const height = Math.max(10, (item.persen || 0) * 1.5);
        html += `
            <div class="trend-bar-item">
                <div class="trend-bar" style="height: ${height}px;" title="${item.tanggal}: ${item.persen.toFixed(1)}%"></div>
                <div class="trend-bar-label">${idx + 1}</div>
            </div>
        `;
    });
    html += '</div>';
    
    // Replace canvas dengan visual bars
    canvas.style.display = 'none';
    const existingBars = container.querySelector('.trend-bars');
    if (existingBars) existingBars.remove();
    container.insertAdjacentHTML('beforeend', html);
}

/**
 * Render distribusi status kehadiran (H/I/S/A)
 */
function renderDistribusiStatus(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !data) {
        if (container) container.innerHTML = '<p class="empty-state">Tidak ada data</p>';
        return;
    }

    const total = (data.hadir || 0) + (data.izin || 0) + (data.sakit || 0) + (data.alpha || 0);
    if (total === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada data kehadiran</p>';
        return;
    }

    const pctH = ((data.hadir || 0) / total * 100).toFixed(1);
    const pctI = ((data.izin || 0) / total * 100).toFixed(1);
    const pctS = ((data.sakit || 0) / total * 100).toFixed(1);
    const pctA = ((data.alpha || 0) / total * 100).toFixed(1);

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card stat-hadir">
                <div class="stat-info">
                    <div class="stat-value">${pctH}%</div>
                    <div class="stat-label">Hadir (${data.hadir || 0})</div>
                </div>
            </div>
            <div class="stat-card stat-izin">
                <div class="stat-info">
                    <div class="stat-value">${pctI}%</div>
                    <div class="stat-label">Izin (${data.izin || 0})</div>
                </div>
            </div>
            <div class="stat-card stat-sakit">
                <div class="stat-info">
                    <div class="stat-value">${pctS}%</div>
                    <div class="stat-label">Sakit (${data.sakit || 0})</div>
                </div>
            </div>
            <div class="stat-card stat-alpa">
                <div class="stat-info">
                    <div class="stat-value">${pctA}%</div>
                    <div class="stat-label">Alpha (${data.alpha || 0})</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Load dan render dashboard per mapel
 */
async function loadDashboardMapel() {
    const loadingEl = document.getElementById('dashboardLoading');
    const contentEl = document.getElementById('dashboardContent');
    const rekapContainer = document.getElementById('rekapKelasMapelList');
    const topAlpaContainer = document.getElementById('topAlpaList');
    const trendCanvas = document.getElementById('trendChart');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');

    try {
        // Ambil data user untuk mendapatkan mapel dan kelas
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
        const mapelList = userData.mapelList || [];
        const kelasList = userData.kelasList || [];

        if (mapelList.length === 0 || kelasList.length === 0) {
            throw new Error('Tidak ada mata pelajaran atau kelas yang diajar');
        }

        // Load data untuk mapel dan kelas pertama sebagai contoh
        const mapel = mapelList[0];
        const kelas = kelasList[0];

        const response = await getDashboardData(mapel, kelas);
        
        if (!response.success) {
            throw new Error(response.message || 'Gagal memuat data dashboard');
        }

        const data = response.data || {};

        // Render rekap per kelas-mapel
        if (data.rekapPerKelas && data.rekapPerKelas.length > 0) {
            renderRekapKelasMapelList(data.rekapPerKelas, 'rekapKelasMapelList');
        } else {
            const rekapContainer = document.getElementById('rekapKelasMapelList');
            if (rekapContainer) rekapContainer.innerHTML = '<p class="empty-state">Belum ada data absensi</p>';
        }

        // Render top alpa
        if (data.topAlpa && data.topAlpa.length > 0) {
            renderTopAlpaList(data.topAlpa, 'topAlpaList');
        } else {
            const topAlpaContainer = document.getElementById('topAlpaList');
            if (topAlpaContainer) topAlpaContainer.innerHTML = '<p class="empty-state">Tidak ada siswa perlu perhatian</p>';
        }

        // Render trend chart
        if (data.trend && data.trend.length > 0) {
            renderTrendChart(data.trend, 'trendChart');
        }

        // Cache data
        dashboardCache.mapel = data;

        if (contentEl) contentEl.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Gagal memuat dashboard: ' + error.message, 'error');
        if (rekapContainer) rekapContainer.innerHTML = '<p class="empty-state">Gagal memuat data</p>';
        if (topAlpaContainer) topAlpaContainer.innerHTML = '<p class="empty-state">Gagal memuat data</p>';
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

/**
 * Load dan render dashboard wali kelas
 */
async function loadDashboardWali() {
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const kelasWali = userData.kelasWali;

    if (!kelasWali) {
        // Bukan wali kelas, sembunyikan section wali
        const waliSection = document.getElementById('dashboardWaliSection');
        if (waliSection) waliSection.classList.add('hidden');
        return;
    }

    // Tampilkan section wali
    const waliSection = document.getElementById('dashboardWaliSection');
    if (waliSection) waliSection.classList.remove('hidden');

    try {
        const response = await getDashboardDataWali(kelasWali);

        if (!response.success) {
            throw new Error(response.message || 'Gagal memuat data dashboard wali');
        }

        const data = response.data || {};

        // Update stats cards
        document.getElementById('waliStatPertemuan').textContent = data.totalPertemuan || 0;
        document.getElementById('waliStatSiswa').textContent = data.totalSiswa || 0;
        document.getElementById('waliStatRataHadir').textContent = (data.rataHadir || 0).toFixed(1) + '%';
        document.getElementById('waliStatRataAlpa').textContent = (data.rataAlpa || 0).toFixed(1) + '%';

        // Render distribusi
        if (data.distribusi) {
            renderDistribusiStatus(data.distribusi, 'waliDistribusiList');
        }

        // Render trend
        if (data.trend && data.trend.length > 0) {
            renderTrendChart(data.trend, 'trendChartWali');
        }

        // Render top alpa
        if (data.topAlpa && data.topAlpa.length > 0) {
            renderTopAlpaList(data.topAlpa, 'waliTopAlpaList');
        } else {
            const container = document.getElementById('waliTopAlpaList');
            if (container) container.innerHTML = '<p class="empty-state">Tidak ada siswa perlu perhatian</p>';
        }

        // Cache data
        dashboardCache.wali = data;
    } catch (error) {
        console.error('Error loading dashboard wali:', error);
        showNotification('Gagal memuat dashboard wali: ' + error.message, 'error');
    }
}

/**
 * Inisialisasi dashboard
 * Dipanggil saat panel Dashboard ditampilkan
 */
export async function initDashboard() {
    console.log('Initializing dashboard...');

    // Load dashboard mapel
    await loadDashboardMapel();

    // Load dashboard wali (jika user adalah wali kelas)
    await loadDashboardWali();

    // Setup tab switching untuk refresh data saat tab Dashboard diklik ulang
    const dashboardTabBtn = document.querySelector('[data-tab="panelDashboard"]');
    if (dashboardTabBtn) {
        dashboardTabBtn.addEventListener('click', () => {
            // Refresh data saat tab diklik
            setTimeout(() => {
                loadDashboardMapel();
                loadDashboardWali();
            }, 100);
        });
    }
}

export default {
    initDashboard
};
