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

import { getDashboardData, getDetailSiswaPerhatian, getDetailSiswaPerhatianWali, getDashboardDataWali, getDashboardSekolah, getSiswaByKelas, getCurrentUser, getRingkasanNilaiUntukDashboard } from './api.js?v=20260731p';
// PATCH PERFORMA: escapeHtml dipakai dari utils.js (regex string-replace),
// bukan implementasi lokal yang sebelumnya ada di file ini. Implementasi
// lama membuat elemen <div> DOM baru pada SETIAP pemanggilan (lihat riwayat
// versi file ini) -- jauh lebih lambat daripada regex sederhana, dan
// terpanggil berulang kali di dalam .map()/.forEach() saat merender daftar
// topAlpa & rekap kelas/mapel. Juga menghapus duplikasi kode yang sama
// persis fungsinya dengan utils.js.
import { showNotification, escapeHtml, showGlobalLoading, hideGlobalLoading } from './utils.js?v=20260731p';
import { showRichModal } from './modal.js?v=20260731p';
import { navigasiKeEditAbsensi } from './absensi.js?v=20260731p';

// Cache untuk data dashboard
let dashboardCache = {
    mapel: null,
    wali: null,
    sekolah: null
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
async function toggleFilterKombinasi(card, listContainer) {
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
        const kelasListStrGabungan = (userData.kelasList || []).join(',');
        renderPerhatianEmpat(data.perhatian, mapelListStrGabungan);
        renderTrendChart(data.trend, 'trendChart');
        if (data.rataRata) {
            renderDistribusiStatus(data.rataRata, 'distribusiMapelList');
            pasangKlikDistribusiPerMapel('distribusiMapelList');
        }
        tampilkanLabelFilterTren(`Menampilkan: Semua Mapel (gabungan ${jumlahKombinasi} kombinasi kelas+mapel)`);

        // PATCH: Ringkasan & Saran sebelumnya SELALU menampilkan data
        // gabungan semua mapel, tidak ikut berubah sama sekali walau
        // kartu per-kelas diklik/direset -- sekarang ikut kembali ke
        // ringkasan GABUNGAN di sini (ambil ulang ringkasan nilai
        // gabungan juga, supaya konsisten dengan absensinya).
        try {
            const ringkasanNilaiRes = await getRingkasanNilaiUntukDashboard(mapelListStrGabungan, kelasListStrGabungan).catch(() => null);
            const ringkasanNilai = (ringkasanNilaiRes && ringkasanNilaiRes.success) ? ringkasanNilaiRes.data : null;
            renderRingkasanNarasiMapel(data, ringkasanNilai);
        } catch (e) { /* biarkan Ringkasan lama tetap tampil kalau gagal -- jangan sampai bagian lain ikut rusak */ }
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

    // kombinasiKey formatnya "kelas|mapel" -- dipisah untuk dipakai baik
    // detail siswa (cuma perlu bagian mapel) maupun ringkasan nilai
    // per-kombinasi di bawah (perlu keduanya).
    const [kelasKombinasiIni, mapelKombinasiIni] = kombinasiKey.split('|').map(s => (s || '').trim());
    renderPerhatianEmpat(perKombinasi.perhatian, mapelKombinasiIni);
    renderTrendChart(perKombinasi.trend, 'trendChart');
    if (perKombinasi.rataRata) {
        renderDistribusiStatus(perKombinasi.rataRata, 'distribusiMapelList');
        pasangKlikDistribusiPerMapel('distribusiMapelList');
    }
    tampilkanLabelFilterTren(`Menampilkan: ${labelTerpilih} (klik kartu ini lagi untuk kembali ke tampilan semua mapel)`);

    // PATCH: Ringkasan & Saran sekarang ikut difilter KHUSUS kombinasi
    // ini saja -- termasuk ringkasan Nilai-nya, diambil ulang khusus
    // untuk 1 kelas+mapel ini (bukan sisa cache gabungan), supaya titik
    // temu absen+nilai juga presisi ke kombinasi yang sedang dilihat.
    try {
        const ringkasanNilaiRes = await getRingkasanNilaiUntukDashboard(mapelKombinasiIni, kelasKombinasiIni).catch(() => null);
        const ringkasanNilai = (ringkasanNilaiRes && ringkasanNilaiRes.success) ? ringkasanNilaiRes.data : null;
        renderRingkasanNarasiMapel(perKombinasi, ringkasanNilai);
    } catch (e) { /* biarkan Ringkasan lama tetap tampil kalau gagal */ }
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

    let html = `<div class="table-wrapper"><table class="simple-table"><thead><tr><th class="th-nomor">No</th><th>Nama</th><th>${escapeHtml(labelKolom)}</th></tr></thead><tbody>`;
    data.slice(0, 10).forEach((siswa, i) => {
        const bisaDiklik = konteks && siswa.nis && siswa.kelas;
        const namaCell = bisaDiklik
            ? `<button type="button" class="nama-siswa-klik" data-nis="${escapeHtml(siswa.nis)}" data-kelas="${escapeHtml(siswa.kelas)}" title="Klik untuk lihat detail">${escapeHtml(siswa.nama)}</button>`
            : escapeHtml(siswa.nama);
        html += `<tr>
            <td class="td-nomor">${i + 1}</td>
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
// Sama seperti arah tren di Dashboard Sekolah (lihat analisisTrenSekolah()
// di bawah -- ambang batas ±3 poin persen SAMA PERSIS), cuma diterapkan
// ke 1 siswa saja, bukan seluruh sekolah. Dipanggil dari
// bukaModalDetailSiswa() supaya wali kelas/guru bisa tahu siswa ini
// sedang membaik/menurun/stabil, TANPA aplikasi menebak-nebak penyebabnya
// -- murni perbandingan angka periode awal vs akhir.
function buatKalimatTrenSiswa(trend) {
    if (!trend || trend.length < 4) return null; // data terlalu sedikit untuk disimpulkan, sama seperti Dashboard Sekolah
    const tengah = Math.floor(trend.length / 2);
    const rataAwal = rataRataArray(trend.slice(0, tengah).map(t => t.persenHadir));
    const rataAkhir = rataRataArray(trend.slice(tengah).map(t => t.persenHadir));
    const selisih = Math.round((rataAkhir - rataAwal) * 10) / 10;

    if (selisih >= 3) {
        return `📈 Dalam periode ini, kehadiran siswa menunjukkan <strong>peningkatan</strong> -- dari rata-rata ${rataAwal.toFixed(1)}% menjadi ${rataAkhir.toFixed(1)}% belakangan ini.`;
    } else if (selisih <= -3) {
        return `📉 Dalam periode ini, kehadiran siswa menunjukkan <strong>penurunan</strong> -- dari rata-rata ${rataAwal.toFixed(1)}% menjadi ${rataAkhir.toFixed(1)}% belakangan ini. Perlu ditelusuri lebih lanjut oleh wali kelas -- misalnya lewat komunikasi langsung dengan siswa atau orang tua.`;
    }
    return `Kehadiran siswa ini <strong>relatif stabil</strong> pada periode ini, berkisar ${rataAwal.toFixed(1)}%-${rataAkhir.toFixed(1)}%.`;
}

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
        const kalimatTren = buatKalimatTrenSiswa(d.trend);
        const isiModal = `
            <div class="detail-siswa">
                <p class="detail-siswa-header"><strong>${escapeHtml(d.nama)}</strong> — ${escapeHtml(d.kelas)}</p>
                <div class="stats-grid" style="margin: 8px 0 16px 0;">
                    <span class="badge badge-success">Hadir: ${d.persenHadir}%</span>
                    <span class="badge badge-warning">Izin: ${d.totalIzin}</span>
                    <span class="badge badge-info">Sakit: ${d.totalSakit}</span>
                    <span class="badge badge-danger">Alpa: ${d.totalAlpa}</span>
                </div>
                ${kalimatTren ? `<p class="detail-siswa-tren">${kalimatTren}</p>` : ''}
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

        // PATCH FITUR NILAI (Tahap 4): ambil ringkasan nilai BERBARENGAN
        // (paralel) dengan data absensi -- gagal diam-diam ke `null` kalau
        // errornya (mis. belum ada data nilai sama sekali, atau folder
        // Drive Nilai belum dikonfigurasi admin) supaya dashboard absensi
        // TETAP tampil normal, tidak ikut gagal gara-gara Nilai.
        const [response, ringkasanNilaiRes] = await Promise.all([
            getDashboardData(mapel, kelas),
            getRingkasanNilaiUntukDashboard(mapel, kelas).catch(() => null)
        ]);
        const ringkasanNilai = (ringkasanNilaiRes && ringkasanNilaiRes.success) ? ringkasanNilaiRes.data : null;

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

        // PATCH FITUR NILAI (Tahap 4): Ringkasan & Saran -- sebelumnya
        // dashboard Per Mapel BELUM PUNYA narasi ini sama sekali (cuma
        // Wali & Sekolah). Digabung dengan sinyal Nilai kalau ada.
        renderRingkasanNarasiMapel(data, ringkasanNilai);

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

// Label & ikon per kategori -- dipakai bersama oleh ringkasan umum
// (label kategori generik) dan ringkasan fokus-1-kategori di bawah.
const LABEL_KATEGORI_PERHATIAN = { alpa: 'Alpa', izin: 'Izin', sakit: 'Sakit', jarangMasuk: 'Jarang Masuk (gabungan Alpa+Izin+Sakit)' };
const IKON_KATEGORI_PERHATIAN = { alpa: '🔴', izin: '🟡', sakit: '🔵', jarangMasuk: '📉' };

/**
 * PATCH: Ringkasan & Saran versi FOKUS 1 KATEGORI -- dipanggil dari
 * fokuskanKategoriPerhatianWali() saat 1 kotak Distribusi (Izin/Sakit/
 * Alpa) diklik, supaya Ringkasan & Saran ikut menyesuaikan ke kategori
 * yang sama seperti daftar "Perlu Perhatian" di bawahnya -- bukan cuma
 * daftar namanya saja yang berubah, tapi penjelasan & sarannya juga.
 */
function buatRingkasanKategoriWali(daftarSiswa, kategori) {
    const label = LABEL_KATEGORI_PERHATIAN[kategori];
    const ikon = IKON_KATEGORI_PERHATIAN[kategori];
    const daftar = daftarSiswa || [];

    if (daftar.length === 0) {
        return [`${ikon} Tidak ada siswa dengan catatan <strong>${label}</strong> di kelas ini pada periode ini.`];
    }

    const kalimat = [];
    kalimat.push(`${ikon} Tercatat <strong>${daftar.length} siswa</strong> di kelas ini dengan catatan <strong>${label}</strong> pada periode ini.`);

    const teratas = daftar[0];
    kalimat.push(`Yang paling menonjol adalah <strong>${escapeHtml(teratas.nama)}</strong>, dengan ${teratas.jumlahAlpa} kali kejadian.`);

    if (daftar.length > 1) {
        const daftarNama = daftar.slice(0, 5).map(s => `${escapeHtml(s.nama)} (${s.jumlahAlpa}x)`).join(', ');
        kalimat.push(`Siswa lain yang perlu diperhatikan: ${daftarNama}${daftar.length > 5 ? ', dan lainnya' : ''}.`);
    }

    return kalimat;
}

function buatSaranKategoriWali(daftarSiswa, kategori) {
    const daftar = daftarSiswa || [];
    if (daftar.length === 0) return [];

    const saran = [];
    const label = LABEL_KATEGORI_PERHATIAN[kategori];

    if (kategori === 'alpa') {
        saran.push('Disarankan segera menindaklanjuti siswa dengan catatan Alpa terbanyak -- komunikasi langsung dengan siswa & orang tua, karena Alpa (tanpa keterangan) berbeda dari Izin/Sakit yang sudah ada alasannya.');
    } else if (kategori === 'izin' || kategori === 'sakit') {
        saran.push(`Kalau frekuensi ${label} untuk siswa tertentu terasa tidak wajar (terlalu sering), disarankan cek langsung ke siswa/orang tua -- bisa jadi ada kondisi kesehatan atau keluarga yang perlu diperhatikan, bukan sekadar dianggap "sudah ada izin/sakit jadi aman".`);
    } else {
        saran.push('Disarankan menindaklanjuti siswa dengan catatan Jarang Masuk secara menyeluruh -- gabungan Alpa/Izin/Sakit yang tinggi tetap berdampak ke ketertinggalan pelajaran, apa pun alasannya.');
    }

    saran.push('Gunakan fitur "Cek Riwayat Siswa" di bawah untuk melihat detail lengkap tiap siswa yang disebutkan di atas.');
    return saran;
}

// Cache data terbaru dari loadDashboardWali() -- dipakai
// fokuskanKategoriPerhatianWali() untuk tahu daftar siswa per kategori
// (saat difokuskan) dan untuk MENGEMBALIKAN ringkasan umum saat kembali
// ke tampilan "semua kategori" (klik ulang / klik Hadir), tanpa perlu
// fetch ulang ke server.
let dataWaliTerakhir = null;

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

    // PATCH: Ringkasan & Saran ikut menyesuaikan ke fokus kategori yang
    // sama -- tanpa fetch ulang, pakai data yang sudah di-cache.
    if (!dataWaliTerakhir) return;

    if (!fokusKategori) {
        renderRingkasanNarasiWali(dataWaliTerakhir); // kembali ke ringkasan umum
        return;
    }

    const daftarKategori = (dataWaliTerakhir.perhatian || {})[fokusKategori] || [];
    const containerRingkasan = document.getElementById('waliRingkasanNarasi');
    const containerSaran = document.getElementById('waliSaranTindakLanjut');

    if (containerRingkasan) {
        const kalimat = buatRingkasanKategoriWali(daftarKategori, fokusKategori);
        containerRingkasan.innerHTML = kalimat.map(k => `<p>${k}</p>`).join('');
    }
    if (containerSaran) {
        const saran = buatSaranKategoriWali(daftarKategori, fokusKategori);
        containerSaran.innerHTML = saran.length === 0
            ? '<p class="empty-state">Tidak ada saran -- tidak ada siswa dalam kategori ini.</p>'
            : '<ul class="saran-tindak-lanjut-list">' + saran.map(s => `<li>${s}</li>`).join('') + '</ul>' +
              '<p class="saran-tindak-lanjut-disclaimer">⚠️ Saran ini dihasilkan otomatis oleh sistem berdasarkan data kehadiran, bukan pengganti penilaian profesional. Keputusan akhir tetap berada di tangan wali kelas.</p>';
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

/**
 * Versi WALI KELAS dari analisisTrenSekolah()/buatRingkasanTrenSekolah()/
 * buatSaranTindakLanjut() -- ambang batas & logikanya SAMA PERSIS (±3
 * poin persen utk arah tren, ±5 poin persen utk pola hari), cuma sumber
 * datanya beda bentuk (data.statistikHarian, bukan data.trend; tidak ada
 * data.jumlahKombinasi, diganti data.totalSiswa/totalPertemuan). Dibuat
 * TERPISAH (bukan dipaksa reuse 1 fungsi yang sama) supaya tidak berisiko
 * mengubah perilaku Dashboard Sekolah yang sudah berjalan.
 */
function analisisTrenWali(data) {
    const trend = data.statistikHarian || [];
    const persenSekarang = (data.rataRata && data.rataRata.hadir) || 0;

    let labelKondisi;
    if (persenSekarang >= 90) labelKondisi = 'sangat baik';
    else if (persenSekarang >= 80) labelKondisi = 'cukup baik';
    else if (persenSekarang >= 70) labelKondisi = 'perlu diperhatikan';
    else labelKondisi = 'cukup mengkhawatirkan';

    let arahTren = null, rataAwal = null, rataAkhir = null;
    if (trend.length >= 4) {
        const tengah = Math.floor(trend.length / 2);
        rataAwal = rataRataArray(trend.slice(0, tengah).map(t => t.persenHadir));
        rataAkhir = rataRataArray(trend.slice(tengah).map(t => t.persenHadir));
        const selisih = Math.round((rataAkhir - rataAwal) * 10) / 10;
        if (selisih >= 3) arahTren = 'membaik';
        else if (selisih <= -3) arahTren = 'menurun';
        else arahTren = 'stabil';
    }

    let hariTerendah = null, nilaiTerendahHari = null, rataKeseluruhanTren = null;
    if (trend.length >= 7) {
        const rataPerHari = {};
        trend.forEach(t => {
            const d = new Date(t.tanggal + 'T00:00:00');
            if (isNaN(d.getTime())) return;
            const namaHari = d.toLocaleDateString('id-ID', { weekday: 'long' });
            if (!rataPerHari[namaHari]) rataPerHari[namaHari] = [];
            rataPerHari[namaHari].push(t.persenHadir);
        });
        rataKeseluruhanTren = rataRataArray(trend.map(t => t.persenHadir));
        let terendahSementara = 101;
        Object.keys(rataPerHari).forEach(hari => {
            if (rataPerHari[hari].length < 2) return;
            const rataHari = rataRataArray(rataPerHari[hari]);
            if (rataHari < terendahSementara) { terendahSementara = rataHari; hariTerendah = hari; }
        });
        if (hariTerendah && (rataKeseluruhanTren - terendahSementara) >= 5) {
            nilaiTerendahHari = terendahSementara;
        } else {
            hariTerendah = null;
        }
    }

    const p = data.perhatian || {};
    const daftarAlpa = p.alpa || [];
    const daftarJarangMasuk = p.jarangMasuk || [];
    const daftarSakit = p.sakit || [];
    const totalAlpaSiswa = daftarAlpa.length;
    const totalJarangMasuk = daftarJarangMasuk.length;
    const siswaMenonjol = totalJarangMasuk > 0 ? daftarJarangMasuk[0] : null;
    // PATCH: data Alpa & Sakit menonjol SECARA TERPISAH (bukan cuma
    // gabungan jarangMasuk) -- dipakai buatSaranTindakLanjutWali() untuk
    // saran spesifik per kategori, dengan Alpa diprioritaskan (lihat
    // penjelasan lengkap di fungsi itu).
    const siswaAlpaMenonjol = totalAlpaSiswa > 0 ? daftarAlpa[0] : null;
    const totalSiswaSakit = daftarSakit.length;
    const siswaSakitMenonjol = totalSiswaSakit > 0 ? daftarSakit[0] : null;

    return {
        persenSekarang, labelKondisi,
        totalSiswa: data.totalSiswa || 0, totalPertemuan: data.totalPertemuan || 0,
        arahTren, rataAwal, rataAkhir,
        hariTerendah, nilaiTerendahHari, rataKeseluruhanTren,
        totalAlpaSiswa, totalJarangMasuk, siswaMenonjol, daftarJarangMasuk,
        siswaAlpaMenonjol, totalSiswaSakit, siswaSakitMenonjol, daftarAlpa, daftarSakit
    };
}

function buatRingkasanTrenWali(a) {
    const kalimat = [];

    kalimat.push(`Secara keseluruhan, tingkat kehadiran kelas ini pada periode ini adalah <strong>${a.persenSekarang.toFixed(1)}%</strong>, tergolong <strong>${a.labelKondisi}</strong>, dari ${a.totalSiswa} siswa dan ${a.totalPertemuan} hari pertemuan yang tercatat.`);

    if (a.arahTren === 'membaik') {
        kalimat.push(`Tren kehadiran kelas ini menunjukkan <strong>peningkatan</strong> -- dari rata-rata ${a.rataAwal.toFixed(1)}% di awal periode menjadi ${a.rataAkhir.toFixed(1)}% belakangan ini.`);
    } else if (a.arahTren === 'menurun') {
        kalimat.push(`Tren kehadiran kelas ini menunjukkan <strong>penurunan</strong> -- dari rata-rata ${a.rataAwal.toFixed(1)}% di awal periode menjadi ${a.rataAkhir.toFixed(1)}% belakangan ini. Ini perlu ditindaklanjuti.`);
    } else if (a.arahTren === 'stabil') {
        kalimat.push(`Tren kehadiran kelas ini <strong>relatif stabil</strong>, berkisar di angka ${a.rataAwal.toFixed(1)}%-${a.rataAkhir.toFixed(1)}%, tanpa perubahan besar.`);
    }

    if (a.hariTerendah) {
        kalimat.push(`Terlihat pola menarik: kehadiran kelas ini cenderung lebih rendah pada hari <strong>${a.hariTerendah}</strong> (rata-rata ${a.nilaiTerendahHari.toFixed(1)}%) dibanding hari-hari lain (rata-rata keseluruhan ${a.rataKeseluruhanTren.toFixed(1)}%).`);
    }

    const sebutanJarangMasuk = sebutkanSiswaTeratas(a.daftarJarangMasuk, AMBANG_URGEN_PERHATIAN.jarangMasuk);
    if (sebutanJarangMasuk) {
        kalimat.push(`Tercatat siswa dengan riwayat jarang masuk (gabungan Alpa/Izin/Sakit) yang cukup mengkhawatirkan (≥${AMBANG_URGEN_PERHATIAN.jarangMasuk} kali dalam periode ini): ${sebutanJarangMasuk}.`);
    } else if (a.totalAlpaSiswa === 0 && a.totalJarangMasuk === 0) {
        kalimat.push('Tidak ada siswa dengan catatan Alpa di kelas ini pada periode ini -- kondisi kedisiplinan kehadiran tergolong baik.');
    } else {
        kalimat.push('Ada beberapa siswa dengan catatan tidak hadir sesekali, namun belum ada yang mencapai ambang batas urgensi pada periode ini.');
    }

    return kalimat;
}

function buatSaranTindakLanjutWali(a) {
    const saran = [];

    if (a.persenSekarang >= 90) {
        saran.push('Kondisi kehadiran kelas ini sudah sangat baik. Pertahankan pendekatan yang sedang berjalan -- tidak ada tindakan mendesak yang diperlukan saat ini.');
    } else if (a.persenSekarang >= 80) {
        saran.push('Kondisi kehadiran cukup baik. Cukup pantau secara berkala, dengan fokus pada siswa yang disebutkan di bagian "Perlu Perhatian" di bawah.');
    } else if (a.persenSekarang >= 70) {
        saran.push('Disarankan menindaklanjuti langsung siswa dengan catatan tidak hadir -- komunikasi dengan siswa/orang tua, dan cek apakah ada faktor eksternal yang memengaruhi periode ini.');
    } else {
        saran.push('Kondisi kehadiran kelas ini perlu perhatian serius. Disarankan berkoordinasi dengan BK dan/atau orang tua siswa secara lebih intensif.');
    }

    if (a.arahTren === 'menurun') {
        saran.push('Karena tren sedang menurun, disarankan segera ditelusuri -- gunakan fitur "Cek Riwayat Siswa" di bawah untuk melihat pola tiap siswa satu per satu, siapa tahu ada beberapa siswa yang mulai menurun bersamaan.');
    } else if (a.arahTren === 'membaik') {
        saran.push('Karena tren sedang membaik, disarankan mengidentifikasi & mempertahankan faktor yang sedang berjalan baik saat ini.');
    }

    if (a.hariTerendah) {
        saran.push(`Disarankan menelusuri penyebab spesifik rendahnya kehadiran pada hari ${a.hariTerendah} -- misalnya jadwal pelajaran tertentu, kegiatan pada hari sebelumnya, atau kendala transportasi yang berulang.`);
    }

    // PATCH: saran spesifik Alpa DIDAHULUKAN (ditampilkan lebih dulu dari
    // Sakit) -- karena Alpa (tidak hadir tanpa keterangan) butuh eskalasi
    // yang lebih tegas dibanding Izin/Sakit yang sudah ada alasannya.
    // Wording-nya SENGAJA langsung mengarahkan wali kelas ke BK, sesuai
    // alur kerja yang diminta: wali kelas menindaklanjuti dulu, kalau
    // belum ada perbaikan diteruskan ke BK untuk pendampingan.
    // Cuma tampil kalau MEMANG ADA siswa yang mencapai ambang urgensi --
    // bukan sekadar "ada 1 kejadian Alpa", supaya tidak terlalu sensitif.
    const sebutanAlpa = sebutkanSiswaTeratas(a.daftarAlpa, AMBANG_URGEN_PERHATIAN.alpa);
    if (sebutanAlpa) {
        saran.push(`🔴 Tercatat siswa dengan catatan Alpa yang cukup mengkhawatirkan (≥${AMBANG_URGEN_PERHATIAN.alpa} kali): ${sebutanAlpa}. Disarankan wali kelas segera menindaklanjuti secara langsung -- dan kalau belum menunjukkan perbaikan, diteruskan ke <strong>BK untuk pendampingan lebih lanjut</strong>.`);
    }

    const sebutanSakit = sebutkanSiswaTeratas(a.daftarSakit, AMBANG_URGEN_PERHATIAN.sakit);
    if (sebutanSakit) {
        saran.push(`🔵 Tercatat siswa dengan catatan Sakit yang cukup sering (≥${AMBANG_URGEN_PERHATIAN.sakit} kali): ${sebutanSakit}. Disarankan dikonfirmasi ke orang tua/wali untuk memastikan kondisi kesehatan siswa, terutama kalau frekuensinya terasa di luar kewajaran.`);
    }

    return saran;
}

function renderRingkasanNarasiWali(data) {
    const containerRingkasan = document.getElementById('waliRingkasanNarasi');
    const containerSaran = document.getElementById('waliSaranTindakLanjut');
    if (!containerRingkasan && !containerSaran) return;

    const a = analisisTrenWali(data);

    if (containerRingkasan) {
        const kalimat = buatRingkasanTrenWali(a);
        containerRingkasan.innerHTML = kalimat.length > 0
            ? kalimat.map(k => `<p>${k}</p>`).join('')
            : '<p class="empty-state">Belum cukup data untuk membuat ringkasan.</p>';
    }

    if (containerSaran) {
        const saran = buatSaranTindakLanjutWali(a);
        if (saran.length === 0) {
            containerSaran.innerHTML = '<p class="empty-state">Belum ada saran -- data masih terlalu sedikit.</p>';
        } else {
            const daftarHtml = '<ul class="saran-tindak-lanjut-list">' + saran.map(s => `<li>${s}</li>`).join('') + '</ul>';
            const disclaimer = '<p class="saran-tindak-lanjut-disclaimer">⚠️ Saran ini dihasilkan otomatis oleh sistem berdasarkan data kehadiran, bukan pengganti penilaian profesional. Keputusan akhir tetap berada di tangan wali kelas.</p>';
            containerSaran.innerHTML = daftarHtml + disclaimer;
        }
    }
}

// =========================================================
// PATCH: Ringkasan & Saran -- Dashboard PER MAPEL (sebelumnya BELUM
// ADA sama sekali, cuma Wali & Sekolah -- Tahap 4 melengkapi ini,
// SEKALIGUS digabung dengan sinyal Nilai, lihat
// buatSaranGabunganAbsenNilai() di bawah).
// Pola & ambang batas SAMA PERSIS dengan versi Wali di atas, cuma
// sumber datanya beda field (data.trend, bukan data.statistikHarian --
// lihat catatan di getDashboardData(), Dashboard.gs).
// =========================================================
function analisisTrenMapel(data) {
    const trend = data.trend || [];
    const persenSekarang = (data.rataRata && data.rataRata.hadir) || 0;

    let labelKondisi;
    if (persenSekarang >= 90) labelKondisi = 'sangat baik';
    else if (persenSekarang >= 80) labelKondisi = 'cukup baik';
    else if (persenSekarang >= 70) labelKondisi = 'perlu diperhatikan';
    else labelKondisi = 'cukup mengkhawatirkan';

    let arahTren = null, rataAwal = null, rataAkhir = null;
    if (trend.length >= 4) {
        const tengah = Math.floor(trend.length / 2);
        rataAwal = rataRataArray(trend.slice(0, tengah).map(t => t.persenHadir));
        rataAkhir = rataRataArray(trend.slice(tengah).map(t => t.persenHadir));
        const selisih = Math.round((rataAkhir - rataAwal) * 10) / 10;
        if (selisih >= 3) arahTren = 'membaik';
        else if (selisih <= -3) arahTren = 'menurun';
        else arahTren = 'stabil';
    }

    // PATCH: tidak ada "totalSiswa" siap pakai di level gabungan (beda
    // dari Wali yang cuma 1 kelas) -- Per Mapel mencakup BANYAK
    // kombinasi kelas sekaligus, "jumlah siswa" kurang punya makna
    // tunggal yang jelas di sini. Dipakai "jumlah kombinasi kelas" &
    // "total pertemuan" sebagai gantinya, keduanya tersedia & bermakna.
    //
    // PATCH (klik-filter per kartu): `data.rekapKelasMapel` HANYA ada di
    // data GABUNGAN (semua kombinasi) -- saat difilter ke 1 kombinasi
    // spesifik (lewat toggleFilterKombinasi()), object yang dikirim ke
    // sini adalah `perKombinasi` yang TIDAK punya field itu sama sekali.
    // Fallback: pakai jumlah tanggal di trend sebagai perkiraan jumlah
    // pertemuan, dan anggap 1 kombinasi -- supaya kalimat ringkasan
    // tetap masuk akal di kedua kondisi, bukan menampilkan "0 pertemuan"
    // yang keliru.
    const totalPertemuan = data.rekapKelasMapel
        ? data.rekapKelasMapel.reduce((sum, item) => sum + (item.pertemuan || 0), 0)
        : trend.length;
    const jumlahKombinasi = data.rekapKelasMapel ? data.rekapKelasMapel.length : 1;

    const p = data.perhatian || {};
    const daftarAlpa = p.alpa || [];
    const daftarJarangMasuk = p.jarangMasuk || [];
    const daftarSakit = p.sakit || [];
    const totalAlpaSiswa = daftarAlpa.length;
    const totalJarangMasuk = daftarJarangMasuk.length;
    const siswaAlpaMenonjol = totalAlpaSiswa > 0 ? daftarAlpa[0] : null;
    const totalSiswaSakit = daftarSakit.length;
    const siswaSakitMenonjol = totalSiswaSakit > 0 ? daftarSakit[0] : null;

    return {
        persenSekarang, labelKondisi,
        totalPertemuan, jumlahKombinasi,
        arahTren, rataAwal, rataAkhir,
        totalAlpaSiswa, totalJarangMasuk, daftarJarangMasuk,
        siswaAlpaMenonjol, totalSiswaSakit, siswaSakitMenonjol, daftarAlpa, daftarSakit
    };
}

function buatRingkasanTrenMapel(a) {
    const kalimat = [];

    kalimat.push(`Secara keseluruhan, tingkat kehadiran untuk mata pelajaran ini pada periode ini adalah <strong>${a.persenSekarang.toFixed(1)}%</strong>, tergolong <strong>${a.labelKondisi}</strong>, dari ${a.jumlahKombinasi} kombinasi kelas yang diajar dan ${a.totalPertemuan} total pertemuan yang tercatat.`);

    if (a.arahTren === 'membaik') {
        kalimat.push(`Tren kehadiran mata pelajaran ini menunjukkan <strong>peningkatan</strong> -- dari rata-rata ${a.rataAwal.toFixed(1)}% di awal periode menjadi ${a.rataAkhir.toFixed(1)}% belakangan ini.`);
    } else if (a.arahTren === 'menurun') {
        kalimat.push(`Tren kehadiran mata pelajaran ini menunjukkan <strong>penurunan</strong> -- dari rata-rata ${a.rataAwal.toFixed(1)}% di awal periode menjadi ${a.rataAkhir.toFixed(1)}% belakangan ini. Ini perlu ditindaklanjuti.`);
    } else if (a.arahTren === 'stabil') {
        kalimat.push(`Tren kehadiran mata pelajaran ini <strong>relatif stabil</strong>, berkisar di angka ${a.rataAwal.toFixed(1)}%-${a.rataAkhir.toFixed(1)}%, tanpa perubahan besar.`);
    }

    const sebutanJarangMasuk = sebutkanSiswaTeratas(a.daftarJarangMasuk, AMBANG_URGEN_PERHATIAN.jarangMasuk);
    if (sebutanJarangMasuk) {
        kalimat.push(`Tercatat siswa dengan riwayat jarang masuk (gabungan Alpa/Izin/Sakit) yang cukup mengkhawatirkan (≥${AMBANG_URGEN_PERHATIAN.jarangMasuk} kali dalam periode ini): ${sebutanJarangMasuk}.`);
    } else if (a.totalAlpaSiswa === 0 && a.totalJarangMasuk === 0) {
        kalimat.push('Tidak ada siswa dengan catatan Alpa untuk mata pelajaran ini pada periode ini -- kondisi kedisiplinan kehadiran tergolong baik.');
    } else {
        kalimat.push('Ada beberapa siswa dengan catatan tidak hadir sesekali, namun belum ada yang mencapai ambang batas urgensi pada periode ini.');
    }

    return kalimat;
}

function buatSaranTindakLanjutMapel(a) {
    const saran = [];

    if (a.labelKondisi === 'cukup mengkhawatirkan' || a.labelKondisi === 'perlu diperhatikan') {
        saran.push(`Tingkat kehadiran mata pelajaran ini tergolong <strong>${a.labelKondisi}</strong> -- pertimbangkan menelusuri lebih lanjut penyebabnya, mis. lewat "Cek Riwayat Siswa" di bawah.`);
    }

    if (a.arahTren === 'menurun') {
        saran.push('Tren kehadiran sedang menurun -- ada baiknya ditelusuri apakah ada pola tertentu (mis. jadwal, materi, atau faktor lain) yang bisa menjelaskan penurunan ini.');
    }

    const sebutanAlpa = sebutkanSiswaTeratas(a.daftarAlpa, AMBANG_URGEN_PERHATIAN.alpa);
    if (sebutanAlpa) {
        saran.push(`🔴 Tercatat siswa dengan catatan Alpa yang cukup mengkhawatirkan (≥${AMBANG_URGEN_PERHATIAN.alpa} kali): ${sebutanAlpa}. Disarankan dikoordinasikan dengan wali kelas masing-masing siswa.`);
    }

    const sebutanSakit = sebutkanSiswaTeratas(a.daftarSakit, AMBANG_URGEN_PERHATIAN.sakit);
    if (sebutanSakit) {
        saran.push(`🔵 Tercatat siswa dengan catatan Sakit yang cukup sering (≥${AMBANG_URGEN_PERHATIAN.sakit} kali): ${sebutanSakit}. Disarankan dikoordinasikan dengan wali kelas untuk konfirmasi ke orang tua/wali.`);
    }

    return saran;
}

/**
 * PATCH FITUR NILAI (Tahap 4): titik temu absensi + nilai -- CARI
 * siswa yang muncul di KEDUA daftar (jarang masuk DAN nilai turun di
 * periode yang sama), tandai KHUSUS & PALING ATAS di daftar saran.
 *
 * PRINSIP DESAIN (disepakati sebelumnya): absensi & nilai TETAP
 * dianalisis & ditampilkan TERPISAH (bukan dipaksa jadi 1 angka
 * campuran) -- cuma TITIK TEMUNYA yang ditandai khusus, karena pola
 * gabungan (menurun di KEDUA sisi) adalah sinyal yang jauh lebih kuat
 * dibanding satu sisi saja. Tetap sekadar POLA/GEJALA, BUKAN kesimpulan
 * sebab-akibat -- sama seperti prinsip yang dipegang di semua saran
 * otomatis lain di aplikasi ini.
 */
function buatSaranGabunganAbsenNilai(analisisAbsen, ringkasanNilai) {
    if (!ringkasanNilai || !ringkasanNilai.turunNilai || ringkasanNilai.turunNilai.length === 0) return [];

    const nisJarangMasuk = new Set((analisisAbsen.daftarJarangMasuk || []).map(s => s.nis + '|' + s.kelas));
    const keduanyaMenurun = ringkasanNilai.turunNilai.filter(s => nisJarangMasuk.has(s.nis + '|' + s.kelas));
    if (keduanyaMenurun.length === 0) return [];

    const MAKS_DISEBUT = 5;
    const dipakai = keduanyaMenurun.slice(0, MAKS_DISEBUT).map(s => {
        const siswaAbsen = (analisisAbsen.daftarJarangMasuk || []).find(x => x.nis === s.nis && x.kelas === s.kelas);
        const nama = siswaAbsen ? siswaAbsen.nama : ('NIS ' + escapeHtml(s.nis) + ' (' + escapeHtml(s.kelas) + ')');
        return `${nama} (nilai ${s.nilaiAwal.toFixed(0)}→${s.nilaiAkhir.toFixed(0)})`;
    });
    const sisa = keduanyaMenurun.length - dipakai.length;
    let sebutan = dipakai.length === 1 ? dipakai[0]
        : dipakai.length === 2 ? dipakai.join(' dan ')
        : dipakai.slice(0, -1).join(', ') + ', dan ' + dipakai[dipakai.length - 1];
    if (sisa > 0) sebutan += `, serta ${sisa} siswa lainnya`;

    return [`⚠️ <strong>Perhatian khusus:</strong> ${keduanyaMenurun.length} siswa menunjukkan penurunan di KEDUA sisi sekaligus pada periode yang sama -- kehadiran dan nilai: ${sebutan}. Pola gabungan seperti ini biasanya sinyal yang lebih kuat dibanding satu sisi saja, layak diprioritaskan untuk ditindaklanjuti lebih dulu.`];
}

/**
 * `ringkasanNilai` (opsional -- boleh null kalau belum sempat diambil
 * atau memang belum ada data nilai sama sekali): hasil
 * getRingkasanNilaiUntukDashboard() (lihat loadDashboardMapel()).
 */
function renderRingkasanNarasiMapel(data, ringkasanNilai) {
    const containerRingkasan = document.getElementById('mapelRingkasanNarasi');
    const containerSaran = document.getElementById('mapelSaranTindakLanjut');
    if (!containerRingkasan && !containerSaran) return;

    const a = analisisTrenMapel(data);

    if (containerRingkasan) {
        const kalimat = buatRingkasanTrenMapel(a);
        // Kalimat ringkasan NILAI ditambahkan TERPISAH (bukan dicampur ke
        // perhitungan absensi) -- sesuai prinsip desain di atas.
        if (ringkasanNilai && ringkasanNilai.rataRataKeseluruhan !== null && ringkasanNilai.rataRataKeseluruhan !== undefined) {
            kalimat.push(`Untuk nilai (kegiatan bertipe angka), rata-rata keseluruhan mata pelajaran ini adalah <strong>${ringkasanNilai.rataRataKeseluruhan.toFixed(1)}</strong> dari ${ringkasanNilai.jumlahKegiatanAngka} kegiatan yang tercatat.`);
        }
        containerRingkasan.innerHTML = kalimat.length > 0
            ? kalimat.map(k => `<p>${k}</p>`).join('')
            : '<p class="empty-state">Belum cukup data untuk membuat ringkasan.</p>';
    }

    if (containerSaran) {
        // PATCH FITUR NILAI (Tahap 4): saran titik-temu absen+nilai
        // ditaruh PALING ATAS (paling penting), sebelum saran absensi-saja.
        const saran = buatSaranGabunganAbsenNilai(a, ringkasanNilai).concat(buatSaranTindakLanjutMapel(a));

        if (saran.length === 0) {
            containerSaran.innerHTML = '<p class="empty-state">Belum ada saran -- data masih terlalu sedikit.</p>';
        } else {
            const daftarHtml = '<ul class="saran-tindak-lanjut-list">' + saran.map(s => `<li>${s}</li>`).join('') + '</ul>';
            const disclaimer = '<p class="saran-tindak-lanjut-disclaimer">⚠️ Saran ini dihasilkan otomatis oleh sistem berdasarkan data kehadiran & nilai, bukan pengganti penilaian profesional. Keputusan akhir tetap berada di tangan guru mata pelajaran.</p>';
            containerSaran.innerHTML = daftarHtml + disclaimer;
        }
    }
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
        dataWaliTerakhir = data; // PATCH: cache untuk fokuskanKategoriPerhatianWali()

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

        // Ringkasan & saran berbentuk kalimat -- lihat renderRingkasanNarasiWali()
        // di bawah (versi Wali Kelas dari fitur yang sama dipakai Dashboard
        // Sekolah, ambang batas & threshold-nya sama persis).
        renderRingkasanNarasiWali(data);

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
 * PATCH (BARU): atur sub-tab default & visibilitas tombol "Wali Kelas"
 * dan (Tahap 2) "Sekolah".
 * Default tampilan Dashboard adalah Wali Kelas -- tapi hanya kalau akun
 * ini memang wali kelas. Kalau bukan wali kelas (guru mapel murni),
 * tombol sub-tab Wali disembunyikan dan default otomatis jatuh ke
 * sub-tab Per Mapel, supaya tidak ada tab kosong yang jadi default.
 * Tombol "Sekolah" cuma muncul untuk role kepsek/admin/superadmin, dan
 * jadi default HANYA untuk akun yang murni kepsek (tidak mengajar mapel
 * apa pun) -- kalau akun itu JUGA guru (multi-role), default tetap
 * mengikuti aturan lama (Wali/Per Mapel), "Sekolah" tetap ada sebagai
 * pilihan tambahan, bukan menggantikan tab guru.
 */
function setupDashboardSubTabs() {
    const userData = getCurrentUser() || {};
    const btnWali = document.getElementById('subtabBtnDashboardWali');
    const btnMapel = document.getElementById('subtabBtnDashboardMapel');
    const btnSekolah = document.getElementById('subtabBtnDashboardSekolah');
    const panelWali = document.getElementById('subtabDashboardWali');
    const panelMapel = document.getElementById('subtabDashboardMapel');
    const panelSekolah = document.getElementById('subtabDashboardSekolah');

    const adalahWaliKelas = !!userData.kelasWali;
    const roleList = userData.roleList || [];
    const bolehLihatSekolah = ['kepsek', 'admin', 'superadmin'].some(r => roleList.indexOf(r) !== -1);
    const adalahGuruMapel = (userData.mapelList || []).length > 0;

    if (btnWali) btnWali.classList.toggle('hidden', !adalahWaliKelas);
    if (btnSekolah) btnSekolah.classList.toggle('hidden', !bolehLihatSekolah);

    // Tentukan tab aktif default: Wali Kelas kalau berlaku (prioritas
    // lama, tidak berubah) -> Sekolah kalau akun ini murni kepsek/admin
    // TANPA mapel yang diampu -> selain itu Per Mapel (perilaku lama).
    let tabAktif = 'mapel';
    if (adalahWaliKelas) tabAktif = 'wali';
    else if (bolehLihatSekolah && !adalahGuruMapel) tabAktif = 'sekolah';

    if (btnWali) btnWali.classList.toggle('active', tabAktif === 'wali');
    if (btnMapel) btnMapel.classList.toggle('active', tabAktif === 'mapel');
    if (btnSekolah) btnSekolah.classList.toggle('active', tabAktif === 'sekolah');
    if (panelWali) panelWali.classList.toggle('hidden', tabAktif !== 'wali');
    if (panelMapel) panelMapel.classList.toggle('hidden', tabAktif !== 'mapel');
    if (panelSekolah) panelSekolah.classList.toggle('hidden', tabAktif !== 'sekolah');
}

/**
 * TAHAP 2: muat & render Dashboard Sekolah (khusus role
 * kepsek/admin/superadmin). Kalau akun ini tidak punya role itu, fungsi
 * ini keluar diam-diam tanpa memanggil API sama sekali -- backend juga
 * menolak (defense in depth), tapi tidak perlu buang 1 request percuma
 * untuk akun guru biasa yang jelas tidak akan diizinkan.
 */
/**
 * TAHAP 2+: hitung SEMUA sinyal analisis dari data dashboard sekolah --
 * dipakai BERSAMA oleh buatRingkasanTrenSekolah() (kalimat "apa yang
 * terjadi") dan buatSaranTindakLanjut() (kalimat "apa yang sebaiknya
 * dilakukan"), supaya keduanya selalu konsisten memakai angka & ambang
 * batas yang SAMA PERSIS -- tidak dihitung 2x terpisah dengan risiko
 * beda hasil kalau salah satu diubah belakangan tapi yang lain lupa.
 */
function analisisTrenSekolah(data) {
    const trend = data.trend || [];
    const persenSekarang = data.persenHadirKeseluruhan || 0;

    let labelKondisi;
    if (persenSekarang >= 90) labelKondisi = 'sangat baik';
    else if (persenSekarang >= 80) labelKondisi = 'cukup baik';
    else if (persenSekarang >= 70) labelKondisi = 'perlu diperhatikan';
    else labelKondisi = 'cukup mengkhawatirkan';

    let arahTren = null; // 'membaik' | 'menurun' | 'stabil' | null (data belum cukup)
    let rataAwal = null, rataAkhir = null;
    if (trend.length >= 4) {
        const tengah = Math.floor(trend.length / 2);
        rataAwal = rataRataArray(trend.slice(0, tengah).map(t => t.persenHadir));
        rataAkhir = rataRataArray(trend.slice(tengah).map(t => t.persenHadir));
        const selisih = Math.round((rataAkhir - rataAwal) * 10) / 10;
        if (selisih >= 3) arahTren = 'membaik';
        else if (selisih <= -3) arahTren = 'menurun';
        else arahTren = 'stabil';
    }

    let hariTerendah = null, nilaiTerendahHari = null, rataKeseluruhanTren = null;
    if (trend.length >= 7) {
        const rataPerHari = {};
        trend.forEach(t => {
            const d = new Date(t.tanggal + 'T00:00:00');
            if (isNaN(d.getTime())) return;
            const namaHari = d.toLocaleDateString('id-ID', { weekday: 'long' });
            if (!rataPerHari[namaHari]) rataPerHari[namaHari] = [];
            rataPerHari[namaHari].push(t.persenHadir);
        });

        rataKeseluruhanTren = rataRataArray(trend.map(t => t.persenHadir));
        let terendahSementara = 101;
        Object.keys(rataPerHari).forEach(hari => {
            if (rataPerHari[hari].length < 2) return; // 1x kejadian belum cukup disebut pola
            const rataHari = rataRataArray(rataPerHari[hari]);
            if (rataHari < terendahSementara) { terendahSementara = rataHari; hariTerendah = hari; }
        });
        if (hariTerendah && (rataKeseluruhanTren - terendahSementara) >= 5) {
            nilaiTerendahHari = terendahSementara;
        } else {
            hariTerendah = null; // selisihnya tidak cukup besar untuk disebut "pola"
        }
    }

    const p = data.perhatian || {};
    const daftarJarangMasuk = p.jarangMasuk || [];
    const totalAlpaSiswa = (p.alpa || []).length;
    const totalJarangMasuk = daftarJarangMasuk.length;
    const siswaMenonjol = totalJarangMasuk > 0 ? daftarJarangMasuk[0] : null;

    return {
        persenSekarang, labelKondisi, jumlahKombinasi: data.jumlahKombinasi || 1,
        arahTren, rataAwal, rataAkhir,
        hariTerendah, nilaiTerendahHari, rataKeseluruhanTren,
        totalAlpaSiswa, totalJarangMasuk, siswaMenonjol, daftarJarangMasuk
    };
}

/**
 * Bangun ringkasan berbentuk KALIMAT (bukan cuma angka/grafik) dari
 * hasil analisisTrenSekolah() -- supaya Kepala Sekolah bisa langsung
 * paham kondisinya tanpa perlu membaca grafik sendiri.
 */
function buatRingkasanTrenSekolah(a) {
    const kalimat = [];

    kalimat.push(`Secara keseluruhan, tingkat kehadiran siswa se-sekolah pada periode ini adalah <strong>${a.persenSekarang}%</strong>, tergolong <strong>${a.labelKondisi}</strong>, dari data absen harian ${a.jumlahKombinasi} kelas yang tercatat.`);

    if (a.arahTren === 'membaik') {
        kalimat.push(`Tren dalam periode ini menunjukkan <strong>peningkatan</strong> -- dari rata-rata ${a.rataAwal.toFixed(1)}% di awal periode menjadi ${a.rataAkhir.toFixed(1)}% belakangan ini.`);
    } else if (a.arahTren === 'menurun') {
        kalimat.push(`Tren dalam periode ini menunjukkan <strong>penurunan</strong> -- dari rata-rata ${a.rataAwal.toFixed(1)}% di awal periode menjadi ${a.rataAkhir.toFixed(1)}% belakangan ini. Ini perlu ditindaklanjuti.`);
    } else if (a.arahTren === 'stabil') {
        kalimat.push(`Tren dalam periode ini <strong>relatif stabil</strong>, berkisar di angka ${a.rataAwal.toFixed(1)}%-${a.rataAkhir.toFixed(1)}%, tanpa perubahan besar.`);
    }

    if (a.hariTerendah) {
        kalimat.push(`Terlihat pola menarik: kehadiran cenderung lebih rendah pada hari <strong>${a.hariTerendah}</strong> (rata-rata ${a.nilaiTerendahHari.toFixed(1)}%) dibanding hari-hari lain (rata-rata keseluruhan ${a.rataKeseluruhanTren.toFixed(1)}%). Ini bisa jadi indikasi pola yang perlu ditelusuri lebih lanjut, misalnya siswa yang sering izin/alpa menjelang atau sesudah akhir pekan.`);
    }

    const sebutanJarangMasukSekolah = sebutkanSiswaTeratas(a.daftarJarangMasuk, AMBANG_URGEN_PERHATIAN.jarangMasuk);
    if (sebutanJarangMasukSekolah) {
        kalimat.push(`Tercatat siswa dengan riwayat jarang masuk (gabungan Alpa/Izin/Sakit) yang cukup mengkhawatirkan (≥${AMBANG_URGEN_PERHATIAN.jarangMasuk} kali dalam periode ini): ${sebutanJarangMasukSekolah}.`);
    } else if (a.totalAlpaSiswa === 0 && a.totalJarangMasuk === 0) {
        kalimat.push('Tidak ada siswa dengan catatan Alpa pada periode ini -- kondisi kedisiplinan kehadiran tergolong baik.');
    } else {
        kalimat.push('Ada beberapa siswa dengan catatan tidak hadir sesekali, namun belum ada yang mencapai ambang batas urgensi pada periode ini.');
    }

    return kalimat;
}

/**
 * Bangun daftar LANGKAH YANG DISARANKAN dari hasil analisisTrenSekolah()
 * yang SAMA -- saran umum tapi jelas arahnya, BUKAN instruksi teknis
 * rinci (keputusan akhir tetap di Kepala Sekolah, aplikasi cuma
 * membantu mengarahkan perhatian ke mana). Disepakati: kartu terpisah
 * dari ringkasan, dengan disclaimer bahwa ini saran otomatis sistem --
 * lihat renderSaranTindakLanjutSekolah() untuk teks disclaimer-nya.
 */
function buatSaranTindakLanjut(a) {
    const saran = [];

    if (a.persenSekarang >= 90) {
        saran.push('Kondisi kehadiran sudah sangat baik. Pertahankan kebijakan yang sedang berjalan -- tidak ada tindakan mendesak yang diperlukan saat ini.');
    } else if (a.persenSekarang >= 80) {
        saran.push('Kondisi kehadiran cukup baik. Cukup pantau secara berkala, dengan fokus utama pada kelas/siswa yang disebutkan pada bagian "Perlu Perhatian" di bawah.');
    } else if (a.persenSekarang >= 70) {
        saran.push('Disarankan menginstruksikan wali kelas untuk menindaklanjuti siswa dengan catatan tidak hadir, dan mengecek apakah ada faktor eksternal (jadwal kegiatan sekolah, cuaca, dll.) yang memengaruhi periode ini.');
    } else {
        saran.push('Kondisi kehadiran perlu perhatian serius. Disarankan mengadakan rapat koordinasi dengan wali kelas dan/atau BK, serta mempertimbangkan pemberitahuan resmi kepada orang tua/wali siswa.');
    }

    if (a.arahTren === 'menurun') {
        saran.push('Karena tren sedang menurun, disarankan segera ditelusuri sebelum berlanjut lebih jauh -- cek lewat Dashboard Per Mapel apakah penurunan ini terkonsentrasi di kelas/jurusan tertentu, atau menyebar merata di semua kelas.');
    } else if (a.arahTren === 'membaik') {
        saran.push('Karena tren sedang membaik, disarankan mengidentifikasi & mempertahankan faktor yang sedang berjalan baik saat ini, supaya perbaikannya berkelanjutan.');
    }

    if (a.hariTerendah) {
        saran.push(`Disarankan menelusuri penyebab spesifik rendahnya kehadiran pada hari ${a.hariTerendah} bersama wali kelas terkait -- misalnya jadwal pelajaran tertentu, kegiatan pada hari sebelumnya, atau kendala transportasi yang berulang.`);
    }

    const sebutanUntukSaran = sebutkanSiswaTeratas(a.daftarJarangMasuk, AMBANG_URGEN_PERHATIAN.jarangMasuk);
    if (sebutanUntukSaran) {
        saran.push(`Disarankan koordinasi dengan wali kelas terkait siswa berikut untuk tindak lanjut individual (≥${AMBANG_URGEN_PERHATIAN.jarangMasuk} kali jarang masuk): ${sebutanUntukSaran} -- termasuk kemungkinan memanggil orang tua/wali sesuai prosedur BK sekolah, kalau memang belum dilakukan.`);
    }

    return saran;
}

function rataRataArray(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Ambang batas "layak disebut namanya" per kategori -- di bawah angka
// ini dianggap wajar/tidak perlu disebutkan secara individual. Jarang
// Masuk (gabungan Alpa+Izin+Sakit) ambangnya lebih tinggi karena memang
// menjumlahkan 3 kategori sekaligus.
const AMBANG_URGEN_PERHATIAN = { alpa: 3, izin: 3, sakit: 3, jarangMasuk: 5 };

/**
 * PATCH: sebutkan siswa berdasarkan AMBANG BATAS urgensi (bukan jumlah
 * tetap) -- jumlah nama yang disebut MENGIKUTI KONDISI DATA, bukan
 * dipaksa. Kalau tidak ada satu pun yang mencapai ambang, kembalikan
 * `null` supaya pemanggil bisa tampilkan kalimat netral sebagai
 * gantinya (lihat pemakaiannya di buatRingkasanTrenWali() dkk).
 * Dibatasi maksimal `maksTampil` nama supaya kalimat tidak kepanjangan
 * kalau ternyata banyak yang urgent sekaligus -- sisanya diringkas jadi
 * "dan N siswa lainnya".
 */
function sebutkanSiswaTeratas(daftar, ambangBatas, maksTampil = 5) {
    if (!daftar || daftar.length === 0) return null;
    const lolosAmbang = daftar.filter(s => s.jumlahAlpa >= ambangBatas);
    if (lolosAmbang.length === 0) return null;

    const dipakai = lolosAmbang.slice(0, maksTampil);
    const bagian = dipakai.map(s => `${escapeHtml(s.nama)} (${s.jumlahAlpa}x)`);
    let teks;
    if (bagian.length === 1) teks = bagian[0];
    else if (bagian.length === 2) teks = bagian.join(' dan ');
    else teks = bagian.slice(0, -1).join(', ') + ', dan ' + bagian[bagian.length - 1];

    const sisa = lolosAmbang.length - dipakai.length;
    if (sisa > 0) teks += `, serta ${sisa} siswa lainnya`;
    return teks;
}

/**
 * PATCH: tabel daftar kelas untuk Dashboard Sekolah -- klik 1 baris
 * untuk memfilter Ringkasan & Saran (dan tren/distribusi/perhatian) di
 * bawahnya khusus kelas itu saja, mirip pola klik-kartu yang sudah ada
 * di Dashboard Per Mapel guru (toggleFilterKombinasi()), cuma di sini
 * kuncinya cuma "kelas" saja (Dashboard Sekolah memang cuma 1 jenis
 * data -- Absen Harian Wali Kelas, tidak ada dimensi "mapel").
 */
function renderRekapKelasSekolahList(rekapKelas, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '<div class="table-wrapper"><table class="simple-table"><thead><tr>' +
        '<th class="th-nomor">No</th><th>Kelas</th><th>Rata-rata Hadir</th><th>Pertemuan</th>' +
        '</tr></thead><tbody>';

    rekapKelas.forEach((item, i) => {
        html += `<tr class="baris-kelas-klik" data-kelas="${escapeHtml(item.kelas)}" tabindex="0" role="button">
            <td class="td-nomor">${i + 1}</td>
            <td>${escapeHtml(item.kelas)}</td>
            <td>${item.persenHadir.toFixed(1)}%</td>
            <td>${item.pertemuan}</td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('.baris-kelas-klik').forEach(row => {
        const aktifkan = () => toggleFilterKelasSekolah(row, container);
        row.addEventListener('click', aktifkan);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aktifkan(); } });
    });
}

function toggleFilterKelasSekolah(row, listContainer) {
    const data = dashboardCache.sekolah;
    if (!data) return;

    const sedangAktif = row.classList.contains('baris-kelas-aktif');
    listContainer.querySelectorAll('.baris-kelas-klik').forEach(r => r.classList.remove('baris-kelas-aktif'));

    if (sedangAktif) {
        // Klik ulang baris yang sama -> reset ke tampilan gabungan seluruh sekolah.
        if (data.trend && data.trend.length > 0) renderTrendChart(data.trend, 'trendChartSekolah');
        if (data.rataRata) renderDistribusiStatus(data.rataRata, 'sekolahDistribusiList');
        if (data.perhatian) {
            renderTopAlpaList(data.perhatian.alpa, 'sekolahTopAlpaList', 'Jumlah Alpa');
            renderTopAlpaList(data.perhatian.izin, 'sekolahTopIzinList', 'Jumlah Izin');
            renderTopAlpaList(data.perhatian.sakit, 'sekolahTopSakitList', 'Jumlah Sakit');
            renderTopAlpaList(data.perhatian.jarangMasuk, 'sekolahTopJarangMasukList', 'Jumlah Tidak Hadir');
        }
        renderRingkasanNarasiSekolah(data);
        return;
    }

    row.classList.add('baris-kelas-aktif');
    const kelas = row.dataset.kelas;
    const perKelasData = (data.perKelas && data.perKelas[kelas]) || null;

    if (!perKelasData) {
        showNotification('Data rinci untuk kelas "' + kelas + '" belum tersedia.', 'error');
        return;
    }

    if (perKelasData.trend && perKelasData.trend.length > 0) renderTrendChart(perKelasData.trend, 'trendChartSekolah');
    if (perKelasData.rataRata) renderDistribusiStatus(perKelasData.rataRata, 'sekolahDistribusiList');
    if (perKelasData.perhatian) {
        renderTopAlpaList(perKelasData.perhatian.alpa, 'sekolahTopAlpaList', 'Jumlah Alpa');
        renderTopAlpaList(perKelasData.perhatian.izin, 'sekolahTopIzinList', 'Jumlah Izin');
        renderTopAlpaList(perKelasData.perhatian.sakit, 'sekolahTopSakitList', 'Jumlah Sakit');
        renderTopAlpaList(perKelasData.perhatian.jarangMasuk, 'sekolahTopJarangMasukList', 'Jumlah Tidak Hadir');
    }
    // PATCH: Ringkasan & Saran ikut difilter khusus kelas ini saja --
    // sebelumnya SELALU menampilkan gabungan seluruh sekolah, tidak ada
    // cara memfilternya ke 1 kelas sama sekali.
    renderRingkasanNarasiSekolah(perKelasData);
}

function renderRingkasanNarasiSekolah(data) {
    const container = document.getElementById('sekolahRingkasanNarasi');
    if (!container) return;

    const a = analisisTrenSekolah(data);
    const kalimat = buatRingkasanTrenSekolah(a);
    container.innerHTML = kalimat.length > 0
        ? kalimat.map(k => `<p>${k}</p>`).join('')
        : '<p class="empty-state">Belum cukup data untuk membuat ringkasan.</p>';

    renderSaranTindakLanjutSekolah(a);
}

function renderSaranTindakLanjutSekolah(a) {
    const container = document.getElementById('sekolahSaranTindakLanjut');
    if (!container) return;

    const saran = buatSaranTindakLanjut(a);
    if (saran.length === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada saran -- data masih terlalu sedikit.</p>';
        return;
    }

    const daftarHtml = '<ul class="saran-tindak-lanjut-list">' + saran.map(s => `<li>${s}</li>`).join('') + '</ul>';
    const disclaimer = '<p class="saran-tindak-lanjut-disclaimer">⚠️ Saran ini dihasilkan otomatis oleh sistem berdasarkan data kehadiran, bukan pengganti penilaian profesional. Keputusan akhir tetap berada di tangan Kepala Sekolah.</p>';
    container.innerHTML = daftarHtml + disclaimer;
}

async function loadDashboardSekolah() {
    const userData = getCurrentUser() || {};
    const roleList = userData.roleList || [];
    const bolehLihatSekolah = ['kepsek', 'admin', 'superadmin'].some(r => roleList.indexOf(r) !== -1);
    if (!bolehLihatSekolah) return;

    const contentEl = document.getElementById('dashboardSekolahContent');
    const emptyEl = document.getElementById('dashboardSekolahEmpty');

    try {
        const res = await getDashboardSekolah();

        if (!res.success) {
            if (contentEl) contentEl.classList.add('hidden');
            if (emptyEl) {
                emptyEl.textContent = res.message || 'Belum ada data absensi untuk ditampilkan.';
                emptyEl.classList.remove('hidden');
            }
            return;
        }

        const data = res.data;
        dashboardCache.sekolah = data;
        if (contentEl) contentEl.classList.remove('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');

        const elKombinasi = document.getElementById('sekolahStatKombinasi');
        if (elKombinasi) elKombinasi.textContent = data.jumlahKombinasi;
        const elRataHadir = document.getElementById('sekolahStatRataHadir');
        if (elRataHadir) elRataHadir.textContent = data.persenHadirKeseluruhan + '%';

        // PATCH: tabel daftar kelas -- klik 1 baris untuk memfilter
        // Ringkasan & Saran (dan tren/distribusi) di bawah, khusus kelas
        // itu saja. Sebelumnya data per-kelas ini dihitung tapi TIDAK
        // dikirim ke frontend sama sekali.
        if (data.rekapKelas && data.rekapKelas.length > 0) {
            renderRekapKelasSekolahList(data.rekapKelas, 'sekolahRekapKelasList');
        }

        if (data.trend && data.trend.length > 0) {
            renderTrendChart(data.trend, 'trendChartSekolah');
        }
        if (data.rataRata) {
            renderDistribusiStatus(data.rataRata, 'sekolahDistribusiList');
        }
        // Ringkasan berbentuk kalimat -- lihat buatRingkasanTrenSekolah() di
        // bawah. Diletakkan setelah trend & rataRata siap supaya bisa
        // memakai keduanya untuk menyusun narasinya.
        renderRingkasanNarasiSekolah(data);
        // PATCH: nama siswa DI SINI SENGAJA tidak diklik (tidak dikirim
        // parameter konteks ke-4) -- fitur "klik nama -> detail" butuh
        // scope 1 daftar mapel yang jelas (lihat getDetailSiswaPerhatian()),
        // sedangkan cakupan sekolah bisa lintas puluhan mapel sekaligus per
        // siswa. Di luar cakupan Tahap 2 yang disepakati (murni dashboard
        // & tren) -- bisa ditambahkan di tahap berikutnya kalau dibutuhkan.
        if (data.perhatian) {
            renderTopAlpaList(data.perhatian.alpa, 'sekolahTopAlpaList', 'Jumlah Alpa');
            renderTopAlpaList(data.perhatian.izin, 'sekolahTopIzinList', 'Jumlah Izin');
            renderTopAlpaList(data.perhatian.sakit, 'sekolahTopSakitList', 'Jumlah Sakit');
            renderTopAlpaList(data.perhatian.jarangMasuk, 'sekolahTopJarangMasukList', 'Jumlah Tidak Hadir');
        }
    } catch (error) {
        showNotification('Gagal memuat dashboard sekolah: ' + error.message, 'error');
    }
}

/**
 * Inisialisasi dashboard
 * Dipanggil saat panel Dashboard ditampilkan
 */
/**
 * PATCH (deteksi dini): isi dropdown pencarian siswa di Dashboard Wali
 * Kelas dengan SEMUA siswa di kelas wali itu -- bukan cuma yang sudah
 * masuk daftar "Perlu Perhatian". Tujuannya supaya wali kelas bisa cek
 * tren siswa mana pun, termasuk yang kelihatannya baik-baik saja,
 * sebelum sempat memburuk cukup jauh untuk masuk daftar itu.
 */
async function setupPencarianSiswaWali(user) {
    if (!user || !user.kelasWali) return; // bukan wali kelas, tidak relevan

    const selectSiswa = document.getElementById('waliPilihSiswa');
    const btnLihat = document.getElementById('waliBtnLihatDetailSiswa');
    if (!selectSiswa || !btnLihat) return;

    try {
        const res = await getSiswaByKelas(user.kelasWali);
        if (!res.success || !res.data) return;

        selectSiswa.innerHTML = '<option value="">-- Pilih siswa --</option>' +
            res.data.map(s => `<option value="${escapeHtml(s.nis)}">${escapeHtml(s.nama)}</option>`).join('');
    } catch (error) {
        console.error('Gagal memuat daftar siswa untuk pencarian (wali):', error);
    }

    btnLihat.addEventListener('click', () => {
        const nis = selectSiswa.value;
        if (!nis) {
            showNotification('Pilih siswa terlebih dahulu.', 'error');
            return;
        }
        bukaModalDetailSiswa(nis, user.kelasWali, { mode: 'wali' });
    });
}

/**
 * Sama seperti setupPencarianSiswaWali(), versi Dashboard Per Mapel --
 * bedanya guru mapel bisa mengajar BEBERAPA kelas, jadi perlu pilih
 * kelas dulu baru daftar siswanya dimuat.
 */
function setupPencarianSiswaMapel(user) {
    const selectKelas = document.getElementById('mapelPilihKelasSiswa');
    const selectSiswa = document.getElementById('mapelPilihSiswa');
    const btnLihat = document.getElementById('mapelBtnLihatDetailSiswa');
    if (!selectKelas || !selectSiswa || !btnLihat) return;

    const kelasList = (user && user.kelasList) || [];
    if (kelasList.length === 0) return;

    selectKelas.innerHTML = '<option value="">-- Pilih kelas --</option>' +
        kelasList.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');

    selectKelas.addEventListener('change', async () => {
        const kelas = selectKelas.value;
        selectSiswa.innerHTML = '<option value="">Memuat...</option>';
        selectSiswa.disabled = true;
        if (!kelas) {
            selectSiswa.innerHTML = '<option value="">-- Pilih kelas dulu --</option>';
            return;
        }

        try {
            const res = await getSiswaByKelas(kelas);
            if (!res.success || !res.data) {
                selectSiswa.innerHTML = '<option value="">Gagal memuat siswa</option>';
                return;
            }
            selectSiswa.innerHTML = '<option value="">-- Pilih siswa --</option>' +
                res.data.map(s => `<option value="${escapeHtml(s.nis)}">${escapeHtml(s.nama)}</option>`).join('');
            selectSiswa.disabled = false;
        } catch (error) {
            selectSiswa.innerHTML = '<option value="">Gagal memuat siswa</option>';
        }
    });

    btnLihat.addEventListener('click', () => {
        const kelas = selectKelas.value;
        const nis = selectSiswa.value;
        if (!kelas || !nis) {
            showNotification('Pilih kelas dan siswa terlebih dahulu.', 'error');
            return;
        }
        // Pakai SELURUH mapel yang diampu guru ini (bukan 1 mapel saja) --
        // konsisten dengan cakupan "tampilan gabungan" yang sudah ada di
        // Dashboard Per Mapel, supaya riwayat yang ditampilkan lengkap
        // lintas semua mapel guru ini di kelas tsb, bukan cuma sebagian.
        const mapelListStr = (user.mapelList || []).join(',');
        bukaModalDetailSiswa(nis, kelas, { mode: 'mapel', mapel: mapelListStr });
    });
}

export async function initDashboard() {
    console.log('Initializing dashboard...');

    setupDashboardSubTabs();
    const userData = getCurrentUser();
    setupPencarianSiswaWali(userData);
    setupPencarianSiswaMapel(userData);
    // PATCH PERFORMA: ketiga fungsi ini independen (beda seksi DOM, beda
    // endpoint API) -- dijalankan paralel dengan Promise.all supaya total
    // waktu tunggu awal = waktu yang paling lambat di antara ketiganya,
    // bukan jumlah semuanya. loadDashboardSekolah() keluar cepat tanpa
    // fetch apa pun kalau akun ini bukan kepsek/admin/superadmin.
    await Promise.all([loadDashboardMapel(), loadDashboardWali(), loadDashboardSekolah()]);

    const dashboardTabBtn = document.querySelector('[data-tab="panelDashboard"]');
    if (dashboardTabBtn) {
        dashboardTabBtn.addEventListener('click', () => {
            setTimeout(() => {
                loadDashboardMapel();
                loadDashboardWali();
                loadDashboardSekolah();
            }, 100);
        });
    }
}

export default {
    initDashboard
};
