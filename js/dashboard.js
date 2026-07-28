/**
 * Dashboard Module
 * Menangani rendering dan logika untuk panel Dashboard (Analitik)
 * Termasuk dashboard per mapel dan dashboard untuk wali kelas
 *
 * =========================================================
 * PATCH NOTES
 * =========================================================
 * Backend (kodegs/Dashboard.gs) mengirim struktur data dengan nama
 * field tertentu, tapi kode render di file ini sebelumnya memakai
 * nama field yang BERBEDA (typo/asumsi lama), sehingga:
 *  - Panel "Persentase Kehadiran (Per Mapel)" selalu tampil
 *    "Belum ada data absensi" walau data ada di backend.
 *  - Kolom Kelas & jumlah Alpa di "Perlu Perhatian" selalu undefined.
 *  - Trend chart selalu flat (fallback minimum) karena field persen
 *    tidak pernah ketemu.
 *  - SELURUH Dashboard Wali Kelas (rata-rata, distribusi, trend)
 *    tidak pernah terisi karena backend mengirim `rataRata` &
 *    `statistikHarian`, bukan `rataHadir`/`rataAlpa`/`distribusi`/`trend`.
 *
 * Perbaikan: samakan semua akses field dengan struktur asli yang
 * dikembalikan getDashboardData() & getDashboardDataWali() di
 * kodegs/Dashboard.gs. Tidak ada perubahan pada backend yang diperlukan.
 *
 * Tambahan: loadDashboardMapel() tidak lagi men-throw error untuk akun
 * yang murni wali kelas (tidak mengajar mapel apa pun) -- itu kondisi
 * valid, bukan sesi rusak.
 * =========================================================
 */

import { getDashboardData, getDetailSiswaPerhatian, getDetailSiswaPerhatianWali, getDashboardDataWali, getCurrentUser } from './api.js?v=20260726';
// PATCH PERFORMA: escapeHtml dipakai dari utils.js (regex string-replace),
// bukan implementasi lokal yang sebelumnya ada di file ini. Implementasi
// lama membuat elemen <div> DOM baru pada SETIAP pemanggilan (lihat riwayat
// versi file ini) -- jauh lebih lambat daripada regex sederhana, dan
// terpanggil berulang kali di dalam .map()/.forEach() saat merender daftar
// topAlpa & rekap kelas/mapel. Juga menghapus duplikasi kode yang sama
// persis fungsinya dengan utils.js.
import { showNotification, escapeHtml, showGlobalLoading, hideGlobalLoading } from './utils.js?v=20260726';
import { showRichModal } from './modal.js?v=20260727';
import { navigasiKeEditAbsensi } from './absensi.js?v=20260727';

// Cache untuk data dashboard
let dashboardCache = {
    mapel: null,
    wali: null
};

/**
 * Render chart kehadiran per mapel/kelas
 * PATCH: backend mengirim array item berbentuk
 *   { label: "Kelas - Mapel", kelas, mapel, hadir, izin, sakit, alpa, pertemuan, persenHadir }
 * (field kelas & mapel terpisah ditambahkan supaya kartu ini bisa
 * diklik -- lihat PATCH FILTER KLIK di bawah).
 *
 * PATCH FILTER KLIK: klik 1 kartu akan memfilter grafik "Tren Kehadiran"
 * & daftar "Perlu Perhatian (Sering Alpa)" di bawahnya supaya hanya
 * menampilkan data kombinasi kelas+mapel itu saja (bukan gabungan semua).
 * Klik kartu yang sedang aktif lagi untuk kembali ke tampilan gabungan.
 * Data per-kombinasi (`perKombinasi`) sudah dikirim sekaligus oleh
 * backend (lihat getDashboardData() di Dashboard.gs), jadi filter ini
 * murni di sisi frontend -- tidak fetch ulang ke server.
 */
function renderRekapKelasMapelList(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<p class="empty-state">Tidak ada data</p>';
        return;
    }

    let html = '<div class="stats-grid">';
    data.forEach((item, idx) => {
        const persenHadir = item.persenHadir || 0;
        const className = persenHadir >= 80 ? 'stat-hadir' : persenHadir >= 60 ? 'stat-izin' : 'stat-alpa';
        // data-kombinasi dipakai untuk mencocokkan ke key perKombinasi
        // ("kelas|mapel") saat kartu ini diklik.
        const kombinasiKey = `${item.kelas || ''}|${item.mapel || ''}`;
        html += `
            <div class="stat-card ${className} stat-card-clickable" data-kombinasi="${escapeHtml(kombinasiKey)}" data-label="${escapeHtml(item.label || '-')}" tabindex="0" role="button">
                <div class="stat-icon">📊</div>
                <div class="stat-info">
                    <div class="stat-value">${persenHadir.toFixed(1)}%</div>
                    <div class="stat-label">${escapeHtml(item.label || '-')}</div>
                </div>
            </div>
        `;
    });
    html += '</div><p class="dashboard-filter-hint">Klik salah satu kartu di atas untuk melihat tren & siswa perlu perhatian khusus kelas+mapel itu saja.</p>';
    container.innerHTML = html;

    container.querySelectorAll('.stat-card-clickable').forEach(card => {
        const aktifkan = () => toggleFilterKombinasi(card, container);
        card.addEventListener('click', aktifkan);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aktifkan(); } });
    });
}

/**
 * Klik kartu kelas+mapel -> tampilkan tren & top-alpa KHUSUS kombinasi
 * itu. Klik kartu yang sedang aktif lagi -> kembali ke data gabungan
 * (semua kelas+mapel guru itu).
 */
function toggleFilterKombinasi(card, listContainer) {
    const data = dashboardCache.mapel;
    if (!data) return;

    const sedangAktif = card.classList.contains('stat-card-active');
    listContainer.querySelectorAll('.stat-card-clickable').forEach(c => c.classList.remove('stat-card-active'));

    // Ganti kombinasi yang ditampilkan -> reset fokus kategori Perlu
    // Perhatian ke "semua", supaya tidak ada fokus lama yang nyangkut
    // dan membingungkan di konteks kombinasi yang baru.
    fokusKategoriAktif = null;

    if (sedangAktif) {
        // Klik ulang kartu yang sama -> reset ke tampilan gabungan.
        const jumlahKombinasi = (data.rekapKelasMapel || []).length;
        const userData = getCurrentUser() || {};
        const mapelListStrGabungan = (userData.mapelList || []).join(',');
        renderPerhatianEmpat(data.perhatian, mapelListStrGabungan);
        renderTrendChart(data.trend, 'trendChart');
        if (data.rataRata) {
            renderDistribusiStatus(data.rataRata, 'distribusiMapelList');
            pasangKlikDistribusiPerMapel('distribusiMapelList');
        }
        tampilkanLabelFilterTren(`Menampilkan: Semua Mapel (gabungan ${jumlahKombinasi} kombinasi kelas+mapel)`);
        return;
    }

    card.classList.add('stat-card-active');
    const kombinasiKey = card.dataset.kombinasi;
    const labelTerpilih = card.dataset.label;
    const perKombinasi = (data.perKombinasi && data.perKombinasi[kombinasiKey]) || null;

    if (!perKombinasi) {
        showNotification('Data rinci untuk "' + labelTerpilih + '" belum tersedia.', 'error');
        return;
    }

    // kombinasiKey formatnya "kelas|mapel" -- ambil bagian mapel saja
    // supaya detail siswa nanti cuma menyisir 1 sheet ini (lebih cepat),
    // bukan semua mapel guru.
    const mapelKombinasiIni = (kombinasiKey.split('|')[1] || '').trim();
    renderPerhatianEmpat(perKombinasi.perhatian, mapelKombinasiIni);
    renderTrendChart(perKombinasi.trend, 'trendChart');
    if (perKombinasi.rataRata) {
        renderDistribusiStatus(perKombinasi.rataRata, 'distribusiMapelList');
        pasangKlikDistribusiPerMapel('distribusiMapelList');
    }
    tampilkanLabelFilterTren(`Menampilkan: ${labelTerpilih} (klik kartu ini lagi untuk kembali ke tampilan semua mapel)`);
}

/**
 * Tampilkan/perbarui label kecil di atas grafik Tren Kehadiran yang
 * menjelaskan data apa yang sedang ditampilkan (gabungan semua kombinasi
 * ATAU 1 kombinasi kelas+mapel tertentu). SELALU ada (dari pertama kali
 * dashboard dimuat), bukan cuma muncul setelah 1 kartu diklik -- supaya
 * tidak ada tampilan "misterius" yang tidak jelas datanya dari mana.
 */
function tampilkanLabelFilterTren(teks) {
    const trendCanvas = document.getElementById('trendChart');
    const trendContainer = trendCanvas ? trendCanvas.closest('.card, .dashboard-section') || trendCanvas.parentElement.parentElement : null;
    if (!trendContainer) return;

    let label = document.getElementById('dashboardFilterAktifLabel');
    if (!label) {
        label = document.createElement('p');
        label.id = 'dashboardFilterAktifLabel';
        label.className = 'dashboard-filter-active-label';
        const heading = trendContainer.querySelector('h4, h3, h2');
        if (heading) heading.insertAdjacentElement('afterend', label);
        else trendContainer.insertBefore(label, trendContainer.firstChild);
    }
    label.textContent = teks;
}

/**
 * Render list siswa dengan jumlah kejadian terbanyak untuk 1 kategori.
 * PATCH: backend mengirim { nama: "Nama (Kelas)", jumlahAlpa } untuk dashboard
 * per mapel, dan { nama: "Nama", jumlahAlpa } untuk dashboard wali.
 * Field `kelas` terpisah dan `alpha` (dengan h) TIDAK PERNAH dikirim backend.
 * PATCH: field backend TETAP dinamai `jumlahAlpa` untuk SEMUA kategori
 * (alpa/izin/sakit/jarangMasuk) -- lihat komentar di kodegs/Dashboard.gs --
 * jadi datanya sendiri sudah benar per kategori. Bug sebelumnya ada di
 * SINI: header tabel di-hardcode teks "Jumlah Alpa" untuk keempat kategori
 * itu, sehingga daftar "Sering Izin"/"Sering Sakit"/"Jarang Masuk" ikut
 * menampilkan header "Jumlah Alpa" walau angkanya sebenarnya jumlah Izin/
 * Sakit/gabungan. Ditambahkan parameter `labelKolom` supaya tiap pemanggil
 * (lihat updateDashboardMapel()/updateDashboardWali() di bawah) memberi
 * label yang sesuai kategorinya masing-masing.
 */
/**
 * PATCH KLIK-DETAIL: `konteks` (opsional) -- kalau diisi, nama siswa jadi
 * bisa diklik untuk membuka popup detail (riwayat tanggal Alpa/Izin/Sakit
 * siswa itu -- lihat bukaModalDetailSiswa() di bawah). Bentuknya:
 *   { mode: 'mapel', mapel: 'DKV,KIK' }  -- dashboard Per Mapel
 *   { mode: 'wali' }                     -- dashboard Wali Kelas
 * Kalau tidak diisi (null/undefined), nama tetap teks biasa (tidak bisa
 * diklik) -- dipakai kalau data item tidak punya nis/kelas mentah.
 */
function renderTopAlpaList(data, containerId, labelKolom = 'Jumlah Alpa', konteks = null) {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) {
        if (container) container.innerHTML = '<p class="empty-state">Tidak ada siswa perlu perhatian</p>';
        return;
    }

    let html = `<div class="table-wrapper"><table class="simple-table"><thead><tr><th>Nama</th><th>${escapeHtml(labelKolom)}</th></tr></thead><tbody>`;
    data.slice(0, 10).forEach(siswa => {
        const bisaDiklik = konteks && siswa.nis && siswa.kelas;
        const namaCell = bisaDiklik
            ? `<button type="button" class="nama-siswa-klik" data-nis="${escapeHtml(siswa.nis)}" data-kelas="${escapeHtml(siswa.kelas)}" title="Klik untuk lihat detail">${escapeHtml(siswa.nama)}</button>`
            : escapeHtml(siswa.nama);
        html += `<tr>
            <td>${namaCell}</td>
            <td><span class="badge badge-danger">${siswa.jumlahAlpa || 0}</span></td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;

    if (konteks) {
        container.querySelectorAll('.nama-siswa-klik').forEach(btn => {
            btn.addEventListener('click', () => {
                bukaModalDetailSiswa(btn.dataset.nis, btn.dataset.kelas, konteks);
            });
        });
    }
}

/**
 * Buka popup detail 1 siswa (klik nama di kotak "Perlu Perhatian") --
 * ambil data BELAKANGAN (baru saat diklik, bukan sejak awal dashboard
 * dimuat), tampilkan ringkasan + daftar tanggal Alpa/Izin/Sakit
 * terkelompok & berwarna. Tiap tanggal bisa diklik lagi untuk langsung
 * dialihkan ke form Input pada tanggal itu (pakai navigasiKeEditAbsensi
 * yang sama seperti fitur klik-kartu-riwayat).
 */
async function bukaModalDetailSiswa(nis, kelas, konteks) {
    showGlobalLoading('Memuat detail siswa...');
    try {
        const res = konteks.mode === 'wali'
            ? await getDetailSiswaPerhatianWali(nis, kelas)
            : await getDetailSiswaPerhatian(nis, kelas, konteks.mapel);
        hideGlobalLoading();

        if (!res.success) {
            showNotification(res.message || 'Gagal memuat detail siswa.', 'error');
            return;
        }

        const d = res.data;
        const labelStatus = { I: 'Izin', S: 'Sakit', A: 'Alpa' };
        const kelasBadge = { I: 'badge-warning', S: 'badge-info', A: 'badge-danger' };
        const ikonStatus = { I: '🟡', S: '🔵', A: '🔴' };

        // Kelompokkan kejadian per status, supaya tampil terpisah rapi
        // (bukan 1 daftar campur aduk) -- sesuai rancangan yang disepakati.
        const kelompok = { A: [], I: [], S: [] };
        (d.kejadian || []).forEach(k => { if (kelompok[k.status]) kelompok[k.status].push(k); });

        // Tampilkan nama mapel per tanggal HANYA kalau konteksnya lebih
        // dari 1 mapel sekaligus (mode gabungan) -- kalau sudah difilter
        // ke 1 kombinasi kelas+mapel, nama mapelnya sudah jelas dari
        // konteks, jadi tidak perlu diulang di tiap baris.
        const tampilkanNamaMapel = konteks.mode === 'mapel' && konteks.mapel && konteks.mapel.split(',').length > 1;

        function bangunDaftarTanggal(kode) {
            const daftar = kelompok[kode];
            if (!daftar || daftar.length === 0) return '';
            const items = daftar.map(k => {
                const tglTampil = formatTanggalIndonesia(k.tanggal);
                const mapelTeks = tampilkanNamaMapel ? ` <span class="detail-siswa-mapel">(${escapeHtml(k.mapel)})</span>` : '';
                const badgeStatus = `<span class="badge ${kelasBadge[kode]} detail-siswa-badge-kecil">${labelStatus[kode]}</span>`;
                return `<li>
                    <button type="button" class="detail-siswa-tanggal-klik"
                        data-tanggal="${escapeHtml(k.tanggal)}" data-mapel="${escapeHtml(k.mapel)}" data-kelas="${escapeHtml(kelas)}"
                        title="Klik untuk edit absensi tanggal ini">
                        ${badgeStatus} ${escapeHtml(tglTampil)}${mapelTeks}
                    </button>
                </li>`;
            }).join('');
            return `<div class="detail-siswa-kategori">
                <h5>${ikonStatus[kode]} ${labelStatus[kode]} (${daftar.length})</h5>
                <ul class="detail-siswa-tanggal-list">${items}</ul>
            </div>`;
        }

        const adaKejadian = (d.kejadian || []).length > 0;
        const isiModal = `
            <div class="detail-siswa">
                <p class="detail-siswa-header"><strong>${escapeHtml(d.nama)}</strong> — ${escapeHtml(d.kelas)}</p>
                <div class="stats-grid" style="margin: 8px 0 16px 0;">
                    <span class="badge badge-success">Hadir: ${d.persenHadir}%</span>
                    <span class="badge badge-warning">Izin: ${d.totalIzin}</span>
                    <span class="badge badge-info">Sakit: ${d.totalSakit}</span>
                    <span class="badge badge-danger">Alpa: ${d.totalAlpa}</span>
                </div>
                ${adaKejadian
                    ? bangunDaftarTanggal('A') + bangunDaftarTanggal('I') + bangunDaftarTanggal('S')
                    : '<p class="empty-state">Tidak ada catatan Alpa/Izin/Sakit pada periode ini.</p>'}
            </div>`;

        await showRichModal(`Detail Siswa`, isiModal);

        // Pasang klik-untuk-edit SETELAH modal tampil (elemennya baru ada
        // di DOM setelah showRichModal menyuntikkan innerHTML).
        document.querySelectorAll('.detail-siswa-tanggal-klik').forEach(btn => {
            btn.addEventListener('click', () => {
                window.closeCustomAlert && window.closeCustomAlert();
                const konteksEdit = konteks.mode === 'wali'
                    ? { mode: 'wali', kelas: btn.dataset.kelas }
                    : { mode: 'mapel', mapel: btn.dataset.mapel, kelas: btn.dataset.kelas };
                navigasiKeEditAbsensi(konteksEdit, btn.dataset.tanggal);
            });
        });
    } catch (error) {
        hideGlobalLoading();
        showNotification('Gagal memuat detail siswa: ' + error.message, 'error');
    }
}

// Format "yyyy-MM-dd" -> "Senin, 13 Juli 2026" (Bahasa Indonesia).
function formatTanggalIndonesia(tanggalStr) {
    const d = new Date(tanggalStr + 'T00:00:00');
    if (isNaN(d.getTime())) return tanggalStr;
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// =========================================================
// GRAFIK TREN KEHADIRAN -- LINE CHART (SVG, tanpa library eksternal)
// ---------------------------------------------------------
// PATCH: sebelumnya grafik tren pakai bar chart CSS. Diganti ke line chart
// karena lebih pas untuk data berbasis waktu ("tren" = arah naik/turun,
// lebih jelas sebagai satu alur garis daripada perbandingan tinggi antar
// bar berdampingan) dan lebih ringan ditampilkan kalau titik datanya banyak.
//
// Ditambahkan juga toggle periode Minggu/Bulan/Semester:
//  - Minggu  : 7 data mentah terakhir (paling detail, harian/per pertemuan)
//  - Bulan   : dikelompokkan per minggu (rata-rata persenHadir), 8 minggu terakhir
//  - Semester: dikelompokkan per bulan (rata-rata persenHadir), seluruh data yang ada
// Data mentah (dari getDashboardData()/getDashboardDataWali(), TIDAK
// dibatasi jumlahnya oleh backend) disimpan di trendDataStore per
// canvasId, supaya ganti periode tidak perlu fetch ulang ke server --
// cukup diagregasi ulang di sisi frontend dari data yang sudah ada.
// =========================================================
const trendDataStore = {};
const trendPeriodStore = {};

function renderTrendChart(rawData, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !rawData || rawData.length === 0) {
        return;
    }
    const container = canvas.parentElement;
    if (!container) return;

    trendDataStore[canvasId] = rawData;
    if (!trendPeriodStore[canvasId]) trendPeriodStore[canvasId] = 'minggu';

    ensureTrendPeriodToggle(container, canvasId);
    drawTrendChart(canvasId);
}

function ensureTrendPeriodToggle(container, canvasId) {
    if (container.querySelector('.trend-period-toggle')) return; // sudah ada, jangan duplikasi

    const toggle = document.createElement('div');
    toggle.className = 'trend-period-toggle';
    toggle.innerHTML = `
        <button type="button" class="trend-period-btn active" data-period="minggu">Minggu</button>
        <button type="button" class="trend-period-btn" data-period="bulan">Bulan</button>
        <button type="button" class="trend-period-btn" data-period="semester">Semester</button>
    `;
    container.insertBefore(toggle, container.firstChild);

    toggle.querySelectorAll('.trend-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggle.querySelectorAll('.trend-period-btn').forEach(b => b.classList.toggle('active', b === btn));
            trendPeriodStore[canvasId] = btn.dataset.period;
            drawTrendChart(canvasId);
        });
    });
}

function drawTrendChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    const container = canvas.parentElement;
    const rawData = trendDataStore[canvasId] || [];
    const period = trendPeriodStore[canvasId] || 'minggu';

    let points;
    if (period === 'minggu') {
        points = rawData.slice(-7).map(item => ({
            label: formatTanggalSingkat(item.tanggal),
            value: item.persenHadir || 0
        }));
    } else if (period === 'bulan') {
        points = aggregateTrendByWeek(rawData).slice(-8);
    } else {
        points = aggregateTrendByMonth(rawData);
    }

    renderSvgLineChart(points, canvas, container);
}

/** Kelompokkan data harian jadi rata-rata per minggu (Senin sebagai awal minggu). */
function aggregateTrendByWeek(rawData) {
    const buckets = {};
    rawData.forEach(item => {
        const d = new Date(item.tanggal + 'T00:00:00');
        const day = d.getDay(); // 0=Minggu..6=Sabtu
        const diffKeSenin = (day === 0 ? -6 : 1) - day;
        const senin = new Date(d);
        senin.setDate(d.getDate() + diffKeSenin);
        const key = toDateKey(senin);
        if (!buckets[key]) buckets[key] = { sum: 0, count: 0 };
        buckets[key].sum += (item.persenHadir || 0);
        buckets[key].count += 1;
    });
    return Object.keys(buckets).sort().map(key => ({
        label: formatTanggalSingkat(key),
        value: Math.round((buckets[key].sum / buckets[key].count) * 10) / 10
    }));
}

/** Kelompokkan data harian jadi rata-rata per bulan (untuk tampilan 1 semester). */
function aggregateTrendByMonth(rawData) {
    const namaBulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    const buckets = {};
    rawData.forEach(item => {
        const d = new Date(item.tanggal + 'T00:00:00');
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!buckets[key]) buckets[key] = { sum: 0, count: 0, bulanIdx: d.getMonth(), tahun: d.getFullYear() };
        buckets[key].sum += (item.persenHadir || 0);
        buckets[key].count += 1;
    });
    return Object.keys(buckets).sort().map(key => {
        const b = buckets[key];
        return {
            label: namaBulan[b.bulanIdx] + " '" + String(b.tahun).slice(2),
            value: Math.round((b.sum / b.count) * 10) / 10
        };
    });
}

function toDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Gambar line chart SVG dari titik-titik { label, value(0-100) }.
 * viewBox tetap (600x200), diregangkan mengisi lebar kontainer lewat CSS
 * (width:100%) -- jadi otomatis responsif tanpa perlu hitung ulang lebar.
 */
function renderSvgLineChart(points, canvas, container) {
    canvas.style.display = 'none';
    const existing = container.querySelector('.trend-line-svg, .trend-empty');
    if (existing) existing.remove();

    if (!points || points.length === 0) {
        container.insertAdjacentHTML('beforeend', '<p class="trend-empty empty-state">Belum ada data untuk periode ini</p>');
        return;
    }

    const W = 600, H = 200;
    const padTop = 24, padBottom = 28, padX = 28;
    const plotW = W - padX * 2;
    const plotH = H - padTop - padBottom;
    const n = points.length;
    const stepX = n > 1 ? plotW / (n - 1) : 0;

    const coords = points.map((p, i) => {
        const x = padX + (n > 1 ? i * stepX : plotW / 2);
        const v = Math.max(0, Math.min(100, p.value));
        const y = padTop + plotH - (v / 100) * plotH;
        return { x, y, label: p.label, value: p.value };
    });

    const linePath = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
    const areaPath = n > 1
        ? linePath + ` L${coords[n - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
        : '';

    const gridLines = [0, 50, 100].map(pct => {
        const y = padTop + plotH - (pct / 100) * plotH;
        return `<line x1="${padX}" y1="${y.toFixed(1)}" x2="${W - padX}" y2="${y.toFixed(1)}" class="trend-gridline" />` +
               `<text x="2" y="${(y + 4).toFixed(1)}" class="trend-gridlabel">${pct}%</text>`;
    }).join('');

    const dots = coords.map(c =>
        `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" class="trend-dot"><title>${escapeHtml(c.label)}: ${c.value.toFixed(1)}%</title></circle>`
    ).join('');

    const valueLabels = coords.map(c =>
        `<text x="${c.x.toFixed(1)}" y="${(c.y - 8).toFixed(1)}" text-anchor="middle" class="trend-value-label">${c.value.toFixed(0)}%</text>`
    ).join('');

    const xLabels = coords.map(c =>
        `<text x="${c.x.toFixed(1)}" y="${H - 8}" text-anchor="middle" class="trend-x-label">${escapeHtml(c.label)}</text>`
    ).join('');

    const svg = `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="trend-line-svg">
            ${gridLines}
            ${areaPath ? `<path d="${areaPath}" class="trend-area"></path>` : ''}
            <path d="${linePath}" class="trend-line" fill="none"></path>
            ${dots}
            ${valueLabels}
            ${xLabels}
        </svg>
    `;
    container.insertAdjacentHTML('beforeend', svg);
}

/**
 * Format tanggal ISO ("yyyy-MM-dd") jadi format singkat "dd/MM" untuk
 * label sumbu-x -- ringkas tapi tetap menunjukkan tanggal sesungguhnya.
 */
function formatTanggalSingkat(tanggalIso) {
    if (!tanggalIso) return '-';
    const bagian = tanggalIso.split('-'); // [yyyy, MM, dd]
    if (bagian.length !== 3) return tanggalIso;
    return `${bagian[2]}/${bagian[1]}`;
}

/**
 * Render distribusi status kehadiran (H/I/S/A)
 * PATCH: menerima objek `rataRata` dari backend, berupa PERSENTASE
 * yang sudah dihitung ({ hadir, izin, sakit, alpa } dalam %), bukan
 * jumlah absolut. Sebelumnya fungsi ini mengasumsikan data.hadir dkk
 * adalah jumlah mentah dan menghitung ulang persentase dari total,
 * serta membaca data.alpha (dengan h) yang tidak pernah ada.
 */
function renderDistribusiStatus(rataRata, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !rataRata) {
        if (container) container.innerHTML = '<p class="empty-state">Tidak ada data</p>';
        return;
    }

    const pctH = (rataRata.hadir || 0).toFixed(1);
    const pctI = (rataRata.izin || 0).toFixed(1);
    const pctS = (rataRata.sakit || 0).toFixed(1);
    const pctA = (rataRata.alpa || 0).toFixed(1);

    const totalPersen = (rataRata.hadir || 0) + (rataRata.izin || 0) + (rataRata.sakit || 0) + (rataRata.alpa || 0);
    if (totalPersen === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada data kehadiran</p>';
        return;
    }

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card stat-hadir" data-status="hadir">
                <div class="stat-info">
                    <div class="stat-value">${pctH}%</div>
                    <div class="stat-label">Hadir</div>
                </div>
            </div>
            <div class="stat-card stat-izin" data-status="izin">
                <div class="stat-info">
                    <div class="stat-value">${pctI}%</div>
                    <div class="stat-label">Izin</div>
                </div>
            </div>
            <div class="stat-card stat-sakit" data-status="sakit">
                <div class="stat-info">
                    <div class="stat-value">${pctS}%</div>
                    <div class="stat-label">Sakit</div>
                </div>
            </div>
            <div class="stat-card stat-alpa" data-status="alpa">
                <div class="stat-info">
                    <div class="stat-value">${pctA}%</div>
                    <div class="stat-label">Alpha</div>
                </div>
            </div>
        </div>
    `;
}

// =========================================================
// PATCH: "PERLU PERHATIAN" DIPECAH JADI 4 KATEGORI (Per Mapel)
// ---------------------------------------------------------
// Dulu cuma 1 daftar "Sering Alpa". Sekarang backend mengirim `perhatian`
// -- objek berisi 4 daftar terpisah: alpa, izin, sakit, jarangMasuk
// (gabungan ketiganya). Semua 4 ditampilkan sekaligus secara default;
// klik salah satu kotak Izin/Sakit/Alpa di "Distribusi Status Kehadiran"
// akan MEMFOKUSKAN tampilan ke 1 kategori itu saja (sembunyikan yang
// lain) -- klik kotak yang sama lagi (atau kotak Hadir) mengembalikan ke
// tampilan semua 4 kategori.
// =========================================================
const PETA_STATUS_KE_KATEGORI = { alpa: 'alpa', izin: 'izin', sakit: 'sakit' };

function renderPerhatianEmpat(perhatian, mapelListStr) {
    if (!perhatian) return;
    const konteks = mapelListStr ? { mode: 'mapel', mapel: mapelListStr } : null;
    renderTopAlpaList(perhatian.alpa, 'topAlpaList', 'Jumlah Alpa', konteks);
    renderTopAlpaList(perhatian.izin, 'topIzinList', 'Jumlah Izin', konteks);
    renderTopAlpaList(perhatian.sakit, 'topSakitList', 'Jumlah Sakit', konteks);
    renderTopAlpaList(perhatian.jarangMasuk, 'topJarangMasukList', 'Jumlah Tidak Hadir', konteks);
}

// Tampilkan HANYA 1 kategori (sembunyikan 3 lainnya), atau tampilkan
// SEMUA (fokusKategori = null).
function fokuskanKategoriPerhatian(fokusKategori) {
    const semuaKategori = ['alpa', 'izin', 'sakit', 'jarangMasuk'];
    semuaKategori.forEach(kat => {
        const el = document.getElementById('perhatianKategori-' + kat);
        if (!el) return;
        el.classList.toggle('hidden', !!fokusKategori && kat !== fokusKategori);
    });
    const subtitle = document.getElementById('perhatianSubtitle');
    if (subtitle) {
        subtitle.textContent = fokusKategori
            ? 'Menampilkan fokus 1 kategori saja -- klik kotak yang sama di Distribusi (atau kotak Hadir) untuk kembali melihat semua kategori.'
            : 'Siswa dengan Alpa/Izin/Sakit terbanyak, dan siswa yang jarang masuk secara keseluruhan (gabungan ketiganya)';
    }
}

// Tambahkan interaksi klik ke kartu Distribusi KHUSUS untuk Per Mapel
// (dipanggil setelah renderDistribusiStatus() supaya kartunya sudah ada
// di DOM). TIDAK dipakai untuk Dashboard Wali Kelas -- di sana Distribusi
// tetap statis seperti semula.
let fokusKategoriAktif = null;
function pasangKlikDistribusiPerMapel(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.stat-card[data-status]').forEach(card => {
        card.classList.add('stat-card-clickable');
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');

        const klik = () => {
            const status = card.dataset.status;
            const kategori = PETA_STATUS_KE_KATEGORI[status] || null; // "hadir" -> null (tampilkan semua)
            const sedangAktif = fokusKategoriAktif === kategori;

            container.querySelectorAll('.stat-card[data-status]').forEach(c => c.classList.remove('stat-card-active'));

            if (!kategori || sedangAktif) {
                fokusKategoriAktif = null;
                fokuskanKategoriPerhatian(null);
            } else {
                fokusKategoriAktif = kategori;
                card.classList.add('stat-card-active');
                fokuskanKategoriPerhatian(kategori);
            }
        };
        card.addEventListener('click', klik);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); klik(); } });
    });
}

/**
 * Load dan render dashboard per mapel
 * PATCH: dashboardCache.mapel di-cache dari `response.data` yang formatnya
 * { rekapKelasMapel, topAlpa, trend } -- akses key disamakan.
 * PATCH: jika mapelList/kelasList kosong (akun murni wali kelas tanpa
 * tugas mengajar), ini kondisi VALID, bukan error. Panel cukup
 * menampilkan pesan "tidak mengajar mapel apa pun", bukan showNotification
 * error yang mengganggu setiap kali tab dibuka.
 */
async function loadDashboardMapel() {
    const loadingEl = document.getElementById('dashboardLoading');
    const contentEl = document.getElementById('dashboardMapelContent');
    const rekapContainer = document.getElementById('rekapKelasMapelList');
    const topAlpaContainer = document.getElementById('topAlpaList');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    showGlobalLoading('Memuat dashboard...');

    try {
        const userData = getCurrentUser() || {};
        const mapelList = userData.mapelList || [];
        const kelasList = userData.kelasList || [];

        // PATCH: bukan error -- akun wali kelas murni memang bisa tidak
        // punya mapel/kelas yang diajar sama sekali.
        if (mapelList.length === 0 || kelasList.length === 0) {
            if (rekapContainer) rekapContainer.innerHTML = '<p class="empty-state">Anda tidak mengajar mata pelajaran apa pun</p>';
            if (topAlpaContainer) topAlpaContainer.innerHTML = '<p class="empty-state">-</p>';
            if (contentEl) contentEl.classList.remove('hidden');
            return;
        }

        // PATCH: kirim SEMUA mapel & kelas yang diajar guru (bukan cuma
        // yang pertama) -- backend getDashboardData() di Dashboard.gs
        // sudah mendukung banyak mapel/kelas sekaligus lewat string
        // dipisah koma, dan akan me-loop semua kombinasi kelas x mapel
        // (kombinasi yang memang tidak diajar guru itu otomatis
        // dilewati karena sheet-nya tidak ada, jadi aman dikirim semua).
        const mapel = mapelList.join(',');
        const kelas = kelasList.join(',');

        const response = await getDashboardData(mapel, kelas);

        if (!response.success) {
            throw new Error(response.message || 'Gagal memuat data dashboard');
        }

        const data = response.data || {};

        // PATCH: nama key sesuai backend -> rekapKelasMapel (bukan rekapPerKelas)
        if (data.rekapKelasMapel && data.rekapKelasMapel.length > 0) {
            renderRekapKelasMapelList(data.rekapKelasMapel, 'rekapKelasMapelList');
        } else if (rekapContainer) {
            rekapContainer.innerHTML = '<p class="empty-state">Belum ada data absensi</p>';
        }

        if (data.perhatian) {
            renderPerhatianEmpat(data.perhatian, mapel);
        } else if (topAlpaContainer) {
            topAlpaContainer.innerHTML = '<p class="empty-state">Tidak ada siswa perlu perhatian</p>';
        }

        if (data.rataRata) {
            renderDistribusiStatus(data.rataRata, 'distribusiMapelList');
            pasangKlikDistribusiPerMapel('distribusiMapelList');
        }

        if (data.trend && data.trend.length > 0) {
            renderTrendChart(data.trend, 'trendChart');
            // PATCH: label default supaya jelas SEJAK AWAL bahwa grafik ini
            // gabungan semua kombinasi kelas+mapel, bukan cuma 1 -- sebelumnya
            // label ini cuma muncul SETELAH 1 kartu diklik, jadi tampilan awal
            // terkesan "misterius" datanya dari mana.
            const jumlahKombinasi = (data.rekapKelasMapel || []).length;
            tampilkanLabelFilterTren(`Menampilkan: Semua Mapel (gabungan ${jumlahKombinasi} kombinasi kelas+mapel)`);
        }

        dashboardCache.mapel = data;

        if (contentEl) contentEl.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Gagal memuat dashboard: ' + error.message, 'error');
        if (rekapContainer) rekapContainer.innerHTML = '<p class="empty-state">Gagal memuat data</p>';
        if (topAlpaContainer) topAlpaContainer.innerHTML = '<p class="empty-state">Gagal memuat data</p>';
        if (contentEl) contentEl.classList.remove('hidden');
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
        hideGlobalLoading();
    }
}

/**
 * Load dan render dashboard wali kelas
 * PATCH: seluruh akses field disamakan dengan struktur asli dari
 * getDashboardDataWali() di kodegs/Dashboard.gs:
 *   { kelas, totalPertemuan, totalSiswa, statistikHarian, topAlpa, rataRata }
 * Field data.rataHadir / data.rataAlpa / data.distribusi / data.trend
 * SEBELUMNYA TIDAK PERNAH ADA di response backend -- itulah sebabnya
 * dashboard wali selalu tampil 0% / kosong.
 */
// =========================================================
// PATCH: versi WALI KELAS dari fitur yang sama (4 kategori Perlu
// Perhatian + kartu Distribusi bisa diklik) -- state dipisah sendiri
// (fokusKategoriAktifWali, bukan fokusKategoriAktif) supaya dashboard
// Wali Kelas dan Per Mapel tidak saling mengganggu status fokusnya.
// =========================================================
function renderPerhatianEmpatWali(perhatian) {
    if (!perhatian) return;
    const konteks = { mode: 'wali' };
    renderTopAlpaList(perhatian.alpa, 'waliTopAlpaList', 'Jumlah Alpa', konteks);
    renderTopAlpaList(perhatian.izin, 'waliTopIzinList', 'Jumlah Izin', konteks);
    renderTopAlpaList(perhatian.sakit, 'waliTopSakitList', 'Jumlah Sakit', konteks);
    renderTopAlpaList(perhatian.jarangMasuk, 'waliTopJarangMasukList', 'Jumlah Tidak Hadir', konteks);
}

function fokuskanKategoriPerhatianWali(fokusKategori) {
    const semuaKategori = ['alpa', 'izin', 'sakit', 'jarangMasuk'];
    semuaKategori.forEach(kat => {
        const el = document.getElementById('waliPerhatianKategori-' + kat);
        if (!el) return;
        el.classList.toggle('hidden', !!fokusKategori && kat !== fokusKategori);
    });
    const subtitle = document.getElementById('waliPerhatianSubtitle');
    if (subtitle) {
        subtitle.textContent = fokusKategori
            ? 'Menampilkan fokus 1 kategori saja -- klik kotak yang sama di Distribusi (atau kotak Hadir) untuk kembali melihat semua kategori.'
            : 'Siswa dengan Alpa/Izin/Sakit terbanyak, dan siswa yang jarang masuk secara keseluruhan (gabungan ketiganya)';
    }
}

let fokusKategoriAktifWali = null;
function pasangKlikDistribusiWali(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.stat-card[data-status]').forEach(card => {
        card.classList.add('stat-card-clickable');
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');

        const klik = () => {
            const status = card.dataset.status;
            const kategori = PETA_STATUS_KE_KATEGORI[status] || null;
            const sedangAktif = fokusKategoriAktifWali === kategori;

            container.querySelectorAll('.stat-card[data-status]').forEach(c => c.classList.remove('stat-card-active'));

            if (!kategori || sedangAktif) {
                fokusKategoriAktifWali = null;
                fokuskanKategoriPerhatianWali(null);
            } else {
                fokusKategoriAktifWali = kategori;
                card.classList.add('stat-card-active');
                fokuskanKategoriPerhatianWali(kategori);
            }
        };
        card.addEventListener('click', klik);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); klik(); } });
    });
}

async function loadDashboardWali() {
    const userData = getCurrentUser() || {};
    const kelasWali = userData.kelasWali;

    const waliContent = document.getElementById('dashboardWaliContent');
    const waliEmpty = document.getElementById('dashboardWaliEmpty');

    if (!kelasWali) {
        if (waliContent) waliContent.classList.add('hidden');
        if (waliEmpty) waliEmpty.classList.remove('hidden');
        return;
    }

    if (waliEmpty) waliEmpty.classList.add('hidden');

    // PATCH: isi label "Kelas binaan: X" supaya pengguna tahu dashboard ini
    // menampilkan data untuk kelas wali yang mana.
    const kelasLabel = document.getElementById('dashboardWaliKelasLabel');
    if (kelasLabel) kelasLabel.textContent = kelasWali;

    showGlobalLoading('Memuat dashboard wali kelas...');
    try {
        const response = await getDashboardDataWali(kelasWali);

        if (!response.success) {
            throw new Error(response.message || 'Gagal memuat data dashboard wali');
        }

        const data = response.data || {};

        // Stats cards
        const elPertemuan = document.getElementById('waliStatPertemuan');
        const elSiswa = document.getElementById('waliStatSiswa');
        const elRataHadir = document.getElementById('waliStatRataHadir');
        const elRataAlpa = document.getElementById('waliStatRataAlpa');

        if (elPertemuan) elPertemuan.textContent = data.totalPertemuan || 0;
        if (elSiswa) elSiswa.textContent = data.totalSiswa || 0;
        // PATCH: rataRata.hadir / rataRata.alpa (bukan data.rataHadir / data.rataAlpa)
        if (elRataHadir) elRataHadir.textContent = (data.rataRata?.hadir || 0).toFixed(1) + '%';
        if (elRataAlpa) elRataAlpa.textContent = (data.rataRata?.alpa || 0).toFixed(1) + '%';

        // PATCH: distribusi = data.rataRata (bukan data.distribusi yang tidak ada)
        if (data.rataRata) {
            renderDistribusiStatus(data.rataRata, 'waliDistribusiList');
            pasangKlikDistribusiWali('waliDistribusiList');
        }

        // PATCH: trend = data.statistikHarian, dan tiap item field-nya
        // { tanggal, hadir, izin, sakit, alpa, total, persenHadir } --
        // renderTrendChart sudah dibetulkan untuk memakai persenHadir.
        if (data.statistikHarian && data.statistikHarian.length > 0) {
            renderTrendChart(data.statistikHarian, 'trendChartWali');
        }

        if (data.perhatian) {
            renderPerhatianEmpatWali(data.perhatian);
        } else {
            const container = document.getElementById('waliTopAlpaList');
            if (container) container.innerHTML = '<p class="empty-state">Tidak ada siswa perlu perhatian</p>';
        }

        dashboardCache.wali = data;
        if (waliContent) waliContent.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading dashboard wali:', error);
        showNotification('Gagal memuat dashboard wali: ' + error.message, 'error');
        if (waliContent) waliContent.classList.remove('hidden');
    } finally {
        hideGlobalLoading();
    }
}

/**
 * PATCH (BARU): atur sub-tab default & visibilitas tombol "Wali Kelas".
 * Default tampilan Dashboard adalah Wali Kelas -- tapi hanya kalau akun
 * ini memang wali kelas. Kalau bukan wali kelas (guru mapel murni),
 * tombol sub-tab Wali disembunyikan dan default otomatis jatuh ke
 * sub-tab Per Mapel, supaya tidak ada tab kosong yang jadi default.
 */
function setupDashboardSubTabs() {
    const userData = getCurrentUser() || {};
    const btnWali = document.getElementById('subtabBtnDashboardWali');
    const btnMapel = document.getElementById('subtabBtnDashboardMapel');
    const panelWali = document.getElementById('subtabDashboardWali');
    const panelMapel = document.getElementById('subtabDashboardMapel');

    const adalahWaliKelas = !!userData.kelasWali;

    if (btnWali) btnWali.classList.toggle('hidden', !adalahWaliKelas);

    // Tentukan tab aktif default: Wali Kelas kalau berlaku, kalau tidak Per Mapel.
    const aktifkanWali = adalahWaliKelas;
    if (btnWali) btnWali.classList.toggle('active', aktifkanWali);
    if (btnMapel) btnMapel.classList.toggle('active', !aktifkanWali);
    if (panelWali) panelWali.classList.toggle('hidden', !aktifkanWali);
    if (panelMapel) panelMapel.classList.toggle('hidden', aktifkanWali);
}

/**
 * Inisialisasi dashboard
 * Dipanggil saat panel Dashboard ditampilkan
 */
export async function initDashboard() {
    console.log('Initializing dashboard...');

    setupDashboardSubTabs();
    // PATCH PERFORMA: kedua fungsi ini independen (beda seksi DOM, beda
    // endpoint API) -- sebelumnya di-await berurutan sehingga dashboard wali
    // baru mulai dimuat SETELAH dashboard mapel selesai total. Dijalankan
    // paralel dengan Promise.all supaya total waktu tunggu awal = waktu
    // yang paling lambat di antara keduanya, bukan jumlah keduanya.
    await Promise.all([loadDashboardMapel(), loadDashboardWali()]);

    const dashboardTabBtn = document.querySelector('[data-tab="panelDashboard"]');
    if (dashboardTabBtn) {
        dashboardTabBtn.addEventListener('click', () => {
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
