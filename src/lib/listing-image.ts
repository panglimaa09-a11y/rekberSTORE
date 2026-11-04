/**
 * Gambar listing marketplace. Modul murni (tanpa "use client"):
 * boleh diimpor Server Component maupun server action.
 * Path objek: <seller_uid>/<uuid>.<ext> di bucket publik
 * "marketplace-listings". Tidak ada gambar stok/karangan: path kosong
 * berarti listing tampil dengan blok netral.
 *
 * Satu listing boleh punya beberapa foto: `image_paths` (array, migrasi
 * 80010) menyimpan semuanya urut pilihan, foto pertama adalah cover.
 * `image_path` dipertahankan sebagai cover agar kartu browse/toko yang
 * hanya membaca satu path tetap jalan, termasuk sebelum migrasi 80010
 * dijalankan.
 *
 * Tidak ada batas ukuran per foto di kode aplikasi (perintah Tuan
 * 4 Nov 2026: hapus batas 5 MB). Yang tersisa hanya cek tipe berkas.
 * Batas praktis pengiriman formulir diatur framework di next.config.ts
 * (serverActions.bodySizeLimit) dan platform hosting/penyimpanan —
 * itu bukan aturan MB di formulir ini.
 */

export const LISTING_IMAGE_BUCKET = "marketplace-listings";

export const LISTING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function listingImagePath(userId: string, ext: string): string {
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${userId}/${id}.${safeExt}`;
}

/** Ekstensi dari tipe MIME berkas gambar yang diterima. */
export function listingImageExt(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

/** Kode error validasi gambar, atau null bila file valid / tidak ada file.
 *  Hanya tipe yang diperiksa — ukuran tidak dibatasi di sini. */
export function validateListingImage(
  file: File | null
): "image" | null {
  if (!file || file.size === 0) return null;
  if (!LISTING_IMAGE_TYPES.includes(file.type)) return "image";
  return null;
}

/** Validasi semua berkas: satu berkas tidak valid = seluruhnya ditolak. */
export function validateListingImages(
  files: File[]
): "image" | null {
  for (const file of files) {
    if (validateListingImage(file) !== null) return "image";
  }
  return null;
}

function isValidImagePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const p = path.trim();
  if (
    !p ||
    p.startsWith("/") ||
    p.includes("..") ||
    p.includes(" ") ||
    p.split("/").length !== 2
  ) {
    return false;
  }
  return true;
}

/**
 * Daftar path gambar dari satu baris marketplace_listings, urut cover
 * dulu. Bila `image_paths` ada dan tidak kosong, pakai itu; bila belum
 * (listing lama / migrasi 80010 belum jalan), jatuh ke `image_path`.
 */
export function listingImagePaths(
  record: { image_path?: string | null; image_paths?: unknown } | null | undefined
): string[] {
  if (!record) return [];
  const paths = record.image_paths;
  if (Array.isArray(paths)) {
    const valid = paths.filter(isValidImagePath);
    if (valid.length > 0) return valid;
  }
  if (isValidImagePath(record.image_path)) return [record.image_path];
  return [];
}

/** URL publik hero gambar, atau null bila path kosong/tidak valid. */
export function listingImagePublicUrl(
  supabaseUrl: string | undefined,
  imagePath: string | null | undefined
): string | null {
  if (!supabaseUrl || !imagePath) return null;
  const path = imagePath.trim();
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes(" ")
  ) {
    return null;
  }
  const base = supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${LISTING_IMAGE_BUCKET}/${path}`;
}

/** URL publik untuk semua path, dengan path tidak valid dibuang. */
export function listingImagePublicUrls(
  supabaseUrl: string | undefined,
  imagePaths: string[]
): string[] {
  const urls: string[] = [];
  for (const path of imagePaths) {
    const url = listingImagePublicUrl(supabaseUrl, path);
    if (url) urls.push(url);
  }
  return urls;
}
