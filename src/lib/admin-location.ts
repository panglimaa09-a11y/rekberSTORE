/**
 * Lokasi admin — provinsi + kel/kecamatan saja (keputusan Tuan).
 *
 * Admin wajib menyertakan lokasi sesuai provinsi dan kel/kecamatan
 * untuk modul CARI ADMIN TERDEKAT. Tanpa kabupaten/kota, tanpa GPS,
 * tanpa kilometer, tanpa pin peta: "terdekat" berarti wilayah
 * administratif yang sama. Alamat persis tidak pernah diminta atau
 * disimpan.
 *
 * Modul murni: boleh diimpor Server Component maupun server action
 * tanpa membawa klien Supabase. Daftar provinsi di sini CENDERUNG
 * SAMA dengan daftar IN di migrasi 20261102080009
 * (update_rekber_admin_location): bila daftar berubah, ubah kedua
 * tempat dan laporkan.
 */

export type AdminLocation = {
  provinsi: string | null;
  kel_kecamatan: string | null;
};

/**
 * 38 provinsi Indonesia (nama yang umum dipakai; "DKI Jakarta" dan
 * "DI Yogyakarta" memakai sebutan yang dikenal pengguna). Urutan
 * alfabetis untuk dropdown.
 */
export const PROVINCES: string[] = [
  "Aceh",
  "Bali",
  "Banten",
  "Bengkulu",
  "DI Yogyakarta",
  "DKI Jakarta",
  "Gorontalo",
  "Jambi",
  "Jawa Barat",
  "Jawa Tengah",
  "Jawa Timur",
  "Kalimantan Barat",
  "Kalimantan Selatan",
  "Kalimantan Tengah",
  "Kalimantan Timur",
  "Kalimantan Utara",
  "Kepulauan Bangka Belitung",
  "Kepulauan Riau",
  "Lampung",
  "Maluku",
  "Maluku Utara",
  "Nusa Tenggara Barat",
  "Nusa Tenggara Timur",
  "Papua",
  "Papua Barat",
  "Papua Barat Daya",
  "Papua Pegunungan",
  "Papua Selatan",
  "Papua Tengah",
  "Riau",
  "Sulawesi Barat",
  "Sulawesi Selatan",
  "Sulawesi Tengah",
  "Sulawesi Tenggara",
  "Sulawesi Utara",
  "Sumatera Barat",
  "Sumatera Selatan",
  "Sumatera Utara",
];

/** Panjang maksimum isian kel/kecamatan (sama dengan batas di form + RPC). */
export const KEL_KECAMATAN_MAX_LENGTH = 120;

/** Rapikan input provinsi: trim saja; validasi keanggotaan terpisah. */
export function normalizeProvince(raw: unknown): string {
  return String(raw ?? "").trim();
}

/** Provinsi harus salah satu dari daftar tetap. */
export function isValidProvince(value: string | null | undefined): boolean {
  if (!value) return false;
  return PROVINCES.includes(value);
}

/** Kosongkan isian kel/kecamatan yang kosong menjadi null. */
export function normalizeKelKecamatan(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value === "" ? null : value;
}

/**
 * "Lengkap" = provinsi valid dari daftar tetap DAN kel/kecamatan
 * terisi (non-kosong). Definisi ini dipakai pengingat di hub admin;
 * TIDAK ada pemblokiran penugasan transaksi untuk lokasi (keputusan
 * pemblokiran tidak pernah ada — berbeda dengan URL sosmed).
 */
export function isLocationComplete(
  location: AdminLocation | null | undefined
): boolean {
  if (!location) return false;
  const kel = (location.kel_kecamatan ?? "").trim();
  return (
    isValidProvince(location.provinsi) &&
    kel !== "" &&
    kel.length <= KEL_KECAMATAN_MAX_LENGTH
  );
}

/**
 * Kunci pencocokan wilayah: trim + lowercase, agar "Sukodono",
 * " sukodono " dan "SUKODONO" dianggap sama. Dipakai pencari untuk
 * membandingkan isian kel/kecamatan admin dengan filter pengguna.
 */
export function normalizeAreaKey(
  value: string | null | undefined
): string {
  return (value ?? "").trim().toLowerCase();
}
