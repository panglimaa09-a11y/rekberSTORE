/**
 * Gambar cover listing marketplace. Modul murni (tanpa "use client"):
 * boleh diimpor Server Component maupun server action.
 * Path objek: <seller_uid>/<uuid>.<ext> di bucket publik
 * "marketplace-listings". Tidak ada gambar stok/karangan: path kosong
 * berarti listing tampil dengan blok netral.
 */

export const LISTING_IMAGE_BUCKET = "marketplace-listings";

export const LISTING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const LISTING_IMAGE_MAX_BYTES = 5_000_000;

export function listingImagePath(userId: string, ext: string): string {
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${userId}/${id}.${safeExt}`;
}

/** Kode error validasi gambar, atau null bila file valid / tidak ada file. */
export function validateListingImage(
  file: File | null
): "image" | null {
  if (!file || file.size === 0) return null;
  if (!LISTING_IMAGE_TYPES.includes(file.type)) return "image";
  if (file.size > LISTING_IMAGE_MAX_BYTES) return "image";
  return null;
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
