/**
 * Paket top up token — SATU-SATUNYA sumber nilai paket.
 *
 * Harga di sini adalah nilai apa adanya dari implementasi yang sudah
 * ada (halaman top up + pembuatan pesanan). Harga BELUM dikonfirmasi
 * Tuan — jangan ubah angka di sini tanpa persetujuan Tuan, dan jangan
 * menduplikasi daftar ini di halaman lain (halaman pengaturan pemilik
 * membaca dari modul ini agar tidak ada dua daftar yang bisa
 * berbeda).
 */

export const TOKEN_PACKAGES = [
  { tokens: 1, price: 5000, name: "Starter", detail: "Paket awal" },
  { tokens: 2, price: 10000, name: "Reguler", detail: "Satu biaya layanan website" },
  { tokens: 4, price: 15000, name: "Hemat", detail: "Dua biaya layanan website" },
] as const;

export type TokenPackage = (typeof TOKEN_PACKAGES)[number];

/** Cari paket berdasarkan nilai token dari form ("1" | "2" | "4"). */
export function tokenPackageByTokens(value: string): TokenPackage | undefined {
  return TOKEN_PACKAGES.find((item) => String(item.tokens) === value);
}
