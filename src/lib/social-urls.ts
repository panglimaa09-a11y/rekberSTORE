/**
 * URL sosmed asli admin — pengganti KYC dokumen untuk staf kurasi.
 * Admin (rekber terpilih) tidak memakai KYC dokumen; identitasnya
 * dibuktikan URL sosmed asli di Profil Bisnis. Modul murni: boleh
 * diimpor Server Component maupun server action tanpa membawa
 * klien Supabase.
 *
 * Aturan validasi di sini CENDERUNG SAMA dengan pola SQL di migrasi
 * 20261102080008 (update_rekber_social_urls + penjaga penugasan
 * otomatis): harus https, host persis domain platform (boleh prefix
 * www.), dan harus ada path profil (bukan sekadar beranda). Bila
 * aturan berubah, ubah kedua tempat dan laporkan.
 */

export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "youtube";

export type SocialUrls = {
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
};

export const SOCIAL_PLATFORMS: {
  key: SocialPlatform;
  column: keyof SocialUrls;
  label: string;
  placeholder: string;
  /** Pola yang sama persis dengan pola SQL di migrasi 80008. */
  pattern: string;
}[] = [
  {
    key: "instagram",
    column: "instagram_url",
    label: "Instagram",
    placeholder: "https://instagram.com/namaakun",
    pattern: "^https://(www\\.)?instagram\\.com/.+",
  },
  {
    key: "facebook",
    column: "facebook_url",
    label: "Facebook",
    placeholder: "https://facebook.com/namaakun",
    pattern: "^https://(www\\.)?(facebook\\.com|fb\\.com)/.+",
  },
  {
    key: "tiktok",
    column: "tiktok_url",
    label: "TikTok",
    placeholder: "https://tiktok.com/@namaakun",
    pattern: "^https://(www\\.)?tiktok\\.com/.+",
  },
  {
    key: "youtube",
    column: "youtube_url",
    label: "YouTube",
    placeholder: "https://youtube.com/@namaakun",
    pattern: "^https://(www\\.)?(youtube\\.com|youtu\\.be)/.+",
  },
];

/** URL valid untuk platformnya (kosong = tidak valid, bukan error). */
export function isValidSocialUrl(
  platform: SocialPlatform,
  raw: string | null | undefined
): boolean {
  const value = (raw ?? "").trim();
  if (!value) return false;
  const def = SOCIAL_PLATFORMS.find((p) => p.key === platform);
  if (!def) return false;
  return new RegExp(def.pattern, "i").test(value);
}

/** Kosongkan input kosong menjadi null (URL boleh dikosongkan). */
export function normalizeSocialUrl(
  raw: unknown
): string | null {
  const value = String(raw ?? "").trim();
  return value === "" ? null : value;
}

/**
 * "Lengkap" = minimal SATU dari 4 URL terisi dan valid. Definisi
 * yang sama dipakai penjaga penugasan otomatis di database.
 */
export function isSocialProfileComplete(
  urls: SocialUrls | null | undefined
): boolean {
  if (!urls) return false;
  return SOCIAL_PLATFORMS.some((p) => isValidSocialUrl(p.key, urls[p.column]));
}
