/**
 * Helper Cookie untuk SSO Lintas Subdomain
 * =========================================================
 * PATCH SSO (revisi): sebelumnya sesi disimpan di localStorage, yang
 * cocok untuk SSO kalau semua aplikasi berbagi SATU origin yang SAMA
 * PERSIS (domain + protokol + port). Ternyata tiap aplikasi (absensi,
 * nilai, dst) akan pakai SUBDOMAIN SENDIRI-SENDIRI di bawah 1 domain
 * induk yang sama (mis. absensi-siswa.smkibupakusari.sch.id vs
 * nilai-siswa.smkibupakusari.sch.id) -- subdomain berbeda dianggap
 * ORIGIN BERBEDA oleh browser, jadi localStorage TIDAK bisa dibagi
 * antar keduanya sama sekali.
 *
 * Cookie adalah satu-satunya mekanisme storage browser yang memang
 * didesain untuk bisa dibagi ke SEMUA subdomain dari 1 domain induk,
 * lewat atribut `Domain` (mis. `Domain=.smkibupakusari.sch.id` berlaku
 * untuk absensi-siswa.*, nilai-siswa.*, dan subdomain apa pun lainnya
 * di bawah smkibupakusari.sch.id).
 *
 * CATATAN PENTING:
 * - `CONFIG.SSO_COOKIE_DOMAIN` di js/config.js WAJIB diisi sesuai domain
 *   induk sekolah Anda (lihat komentar di config.js).
 * - Cookie diberi atribut `Secure` -- HANYA bisa di-set/dibaca lewat
 *   HTTPS. Ini penting untuk keamanan (token sesi tidak boleh bocor
 *   lewat koneksi HTTP biasa), tapi berarti kalau Anda testing lokal
 *   lewat http:// biasa (bukan https://), cookie ini TIDAK akan
 *   ter-set sama sekali (gagal diam-diam, sesuai perilaku browser).
 *   Selalu tes fitur SSO ini di domain produksi (https://) atau lewat
 *   `http://localhost` (browser modern mengecualikan localhost dari
 *   aturan Secure).
 */

import { CONFIG } from './config.js';

function bangunAtributDomain() {
    return CONFIG.SSO_COOKIE_DOMAIN ? `; Domain=${CONFIG.SSO_COOKIE_DOMAIN}` : '';
}

/**
 * Simpan data sesi (token + profil) ke cookie SSO.
 * @param {object} value - Data yang mau disimpan (akan di-JSON.stringify)
 * @param {number} maxAgeSeconds - Umur cookie dalam detik (samakan dengan
 *   SESSION_DURATION_MS di backend supaya tidak ada perbedaan durasi
 *   yang membingungkan)
 */
export function setSsoCookie(value, maxAgeSeconds = CONFIG.SSO_COOKIE_MAX_AGE_SECONDS) {
    const encoded = encodeURIComponent(JSON.stringify(value));
    document.cookie = `${CONFIG.SESSION_KEY}=${encoded}; Max-Age=${maxAgeSeconds}; Path=/${bangunAtributDomain()}; SameSite=Lax; Secure`;
}

/**
 * Baca data sesi dari cookie SSO. Return null kalau tidak ada/rusak.
 */
export function getSsoCookie() {
    const nameEq = CONFIG.SESSION_KEY + '=';
    const parts = document.cookie.split(';');
    for (let part of parts) {
        part = part.trim();
        if (part.startsWith(nameEq)) {
            try {
                return JSON.parse(decodeURIComponent(part.substring(nameEq.length)));
            } catch (e) {
                return null;
            }
        }
    }
    return null;
}

/**
 * Hapus cookie SSO (dipakai saat logout / sesi kedaluwarsa).
 * PENTING: atribut Domain & Path harus SAMA PERSIS seperti saat cookie
 * di-set, kalau tidak browser akan menganggapnya cookie yang berbeda
 * dan tidak menghapus apa pun.
 */
export function deleteSsoCookie() {
    document.cookie = `${CONFIG.SESSION_KEY}=; Max-Age=0; Path=/${bangunAtributDomain()}; SameSite=Lax; Secure`;
}
