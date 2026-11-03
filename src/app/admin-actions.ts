"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { isMissingRpcError, rpcErrorToken } from "@/lib/rekber-stages";
import {
  SOCIAL_PLATFORMS,
  isValidSocialUrl,
  normalizeSocialUrl,
  type SocialUrls,
} from "@/lib/social-urls";
import {
  KEL_KECAMATAN_MAX_LENGTH,
  isValidProvince,
  normalizeKelKecamatan,
  normalizeProvince,
} from "@/lib/admin-location";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Tujuan kembali setelah aksi. Formulir dari shell pemilik mengirim
 * return_to=/pemilik/kelola-admin. Hanya nilai persis dalam allowlist
 * yang diterima — nilai lain diabaikan demi keamanan redirect.
 */
const OWNER_MANAGE_URL = "/pemilik/kelola-admin";

function returnBase(
  form: FormData,
  allowed: string[],
  fallback: string
): string {
  const value = String(form.get("return_to") || "");
  return allowed.includes(value) ? value : fallback;
}

function withNotice(base: string, notice: string) {
  return `${base}?notice=${notice}`;
}

function moderasiUrl(notice: string) {
  return `/admin/moderasi?notice=${notice}`;
}

function detailUrl(id: string, notice: string) {
  return `/dashboard/transactions/${id}?notice=${notice}`;
}

async function requireUser() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  return db;
}

/**
 * Daftarkan admin kurasi oleh super_admin (Tuan) berdasarkan email
 * akun yang sudah terdaftar. Tidak ada jalur publik maupun promosi
 * diri — satu-satunya jalan menjadi admin adalah penunjukan ini.
 */
export async function appointRekberAdmin(form: FormData) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const base = returnBase(form, [OWNER_MANAGE_URL], OWNER_MANAGE_URL);

  if (!email.includes("@") || !email.includes(".") || email.length > 254) {
    redirect(withNotice(base, "appoint_invalid"));
  }

  const db = await requireUser();
  const { error } = await db.rpc("appoint_rekber_admin", { p_email: email });

  if (error) {
    if (isMissingRpcError(error)) redirect(withNotice(base, "stage_unavailable"));
    const token = rpcErrorToken(error);
    if (token === "USER_NOT_FOUND") redirect(withNotice(base, "appoint_not_found"));
    redirect(withNotice(base, "appoint_error"));
  }

  revalidatePath(OWNER_MANAGE_URL);
  redirect(withNotice(base, "appointed"));
}

export async function revokeRekberAdmin(form: FormData) {
  const userId = String(form.get("user_id") || "").trim();
  const base = returnBase(form, [OWNER_MANAGE_URL], OWNER_MANAGE_URL);

  if (!UUID_RE.test(userId)) {
    redirect(withNotice(base, "invalid"));
  }

  const db = await requireUser();
  const { error } = await db.rpc("revoke_rekber_admin", { p_user_id: userId });

  if (error) {
    if (isMissingRpcError(error)) redirect(withNotice(base, "stage_unavailable"));
    redirect(withNotice(base, "revoke_error"));
  }

  revalidatePath(OWNER_MANAGE_URL);
  redirect(withNotice(base, "revoked"));
}

/**
 * Tunjuk admin penangan transaksi. Hanya super_admin. Tidak ada
 * penunjukan diri sendiri oleh admin.
 */
export async function assignRekberAdmin(form: FormData) {
  const transactionId = String(form.get("transaction_id") || "").trim();
  const adminId = String(form.get("admin_id") || "").trim();

  if (!UUID_RE.test(transactionId) || !UUID_RE.test(adminId)) {
    redirect(detailUrl(transactionId, "invalid"));
  }

  const db = await requireUser();
  const { data, error } = await db.rpc("assign_rekber_admin", {
    p_transaction_id: transactionId,
    p_admin_id: adminId,
  });

  if (error) {
    if (isMissingRpcError(error)) redirect(detailUrl(transactionId, "stage_unavailable"));
    redirect(detailUrl(transactionId, "assign_error"));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  revalidatePath(`/dashboard/transactions/${transactionId}`);

  redirect(
    detailUrl(
      transactionId,
      data === "already_assigned" ? "admin_already" : "admin_assigned"
    )
  );
}

/** Tinjau profil QR bisnis oleh super_admin. */
export async function reviewQrProfile(form: FormData) {
  const profileId = String(form.get("profile_id") || "").trim();
  const decision = String(form.get("decision") || "");
  const note = String(form.get("note") || "").trim();
  const base = returnBase(form, [OWNER_MANAGE_URL], OWNER_MANAGE_URL);

  if (
    !UUID_RE.test(profileId) ||
    !["approved", "rejected"].includes(decision) ||
    note.length > 500
  ) {
    redirect(withNotice(base, "review_invalid"));
  }

  const db = await requireUser();
  const { error } = await db.rpc("review_rekber_qr_profile", {
    p_profile_id: profileId,
    p_decision: decision,
    p_note: note || null,
  });

  if (error) {
    if (isMissingRpcError(error)) redirect(withNotice(base, "stage_unavailable"));
    redirect(withNotice(base, "review_error"));
  }

  revalidatePath(OWNER_MANAGE_URL);
  redirect(withNotice(base, "qr_reviewed"));
}

/**
 * Simpan/ajukan profil QR bisnis oleh admin itu sendiri. Path berkas
 * berasal dari unggahan Storage privat (komponen DocumentUpload),
 * bukan dari input bebas.
 */
export async function upsertQrProfile(form: FormData) {
  const merchantName = String(form.get("merchant_display_name") || "").trim();
  const provider = String(form.get("merchant_provider") || "").trim();
  const qrPath = String(form.get("qr_image_object_path") || "").trim();
  const evidencePath = String(form.get("ownership_evidence_object_path") || "").trim();

  if (
    merchantName.length < 2 ||
    merchantName.length > 120 ||
    !provider ||
    provider.length > 60 ||
    !qrPath ||
    qrPath.includes("..")
  ) {
    redirect("/admin/profil-bisnis?error=invalid");
  }

  const db = await requireUser();
  const { error } = await db.rpc("upsert_rekber_qr_profile", {
    p_merchant_display_name: merchantName,
    p_merchant_provider: provider,
    p_qr_image_object_path: qrPath,
    p_ownership_evidence_object_path: evidencePath || null,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      redirect("/admin/profil-bisnis?error=unavailable");
    }
    redirect("/admin/profil-bisnis?error=save");
  }

  revalidatePath("/admin/profil-bisnis");
  redirect("/admin/profil-bisnis?notice=qr_submitted");
}

/**
 * Simpan URL sosmed asli oleh admin itu sendiri (pengganti KYC
 * dokumen). Minimal satu URL valid wajib ada sebelum admin dapat
 * menangani transaksi; penegakan akhir ada di database (penjaga
 * penugasan otomatis). Mengosongkan keempat kolom diizinkan — profil
 * menjadi belum lengkap sampai satu URL valid terisi lagi.
 */
export async function updateSocialUrls(form: FormData) {
  const values: SocialUrls = {
    instagram_url: normalizeSocialUrl(form.get("instagram_url")),
    facebook_url: normalizeSocialUrl(form.get("facebook_url")),
    tiktok_url: normalizeSocialUrl(form.get("tiktok_url")),
    youtube_url: normalizeSocialUrl(form.get("youtube_url")),
  };

  for (const platform of SOCIAL_PLATFORMS) {
    const value = values[platform.column];
    if (value !== null && !isValidSocialUrl(platform.key, value)) {
      redirect("/admin/profil-bisnis?error=invalid");
    }
  }

  const db = await requireUser();
  const { error } = await db.rpc("update_rekber_social_urls", {
    p_instagram_url: values.instagram_url,
    p_facebook_url: values.facebook_url,
    p_tiktok_url: values.tiktok_url,
    p_youtube_url: values.youtube_url,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      redirect("/admin/profil-bisnis?error=unavailable");
    }
    const token = rpcErrorToken(error);
    if (token === "NO_BUSINESS_PROFILE") {
      redirect("/admin/profil-bisnis?error=noprofile");
    }
    redirect("/admin/profil-bisnis?error=save");
  }

  revalidatePath("/admin/profil-bisnis");
  redirect("/admin/profil-bisnis?notice=social_saved");
}

/**
 * Simpan lokasi admin (provinsi + kel/kecamatan) oleh admin itu
 * sendiri, untuk modul CARI ADMIN TERDEKAT. Lokasi wajib diisi di
 * form, tetapi TIDAK ada penegakan pemblokiran penugasan transaksi
 * untuk lokasi (keputusan pemblokiran tidak pernah ada — berbeda
 * dengan URL sosmed): pengingat saja di hub admin, tanpa mengubah
 * logika reserve/penugasan di database. Lokasi tampil publik di
 * pencari; alamat persis tidak pernah diminta.
 */
export async function updateAdminLocation(form: FormData) {
  const provinsi = normalizeProvince(form.get("provinsi"));
  const kelKecamatan = normalizeKelKecamatan(form.get("kel_kecamatan"));

  if (
    !isValidProvince(provinsi) ||
    kelKecamatan === null ||
    kelKecamatan.length > KEL_KECAMATAN_MAX_LENGTH
  ) {
    redirect("/admin/profil-bisnis?error=invalid");
  }

  const db = await requireUser();
  const { error } = await db.rpc("update_rekber_admin_location", {
    p_provinsi: provinsi,
    p_kel_kecamatan: kelKecamatan,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      redirect("/admin/profil-bisnis?error=unavailable");
    }
    const token = rpcErrorToken(error);
    if (token === "NO_BUSINESS_PROFILE") {
      redirect("/admin/profil-bisnis?error=noprofile");
    }
    redirect("/admin/profil-bisnis?error=save");
  }

  revalidatePath("/admin/profil-bisnis");
  redirect("/admin/profil-bisnis?notice=location_saved");
}

/** Jeda/aktifkan listing oleh staf. Tanpa hapus (tidak ada policy DELETE). */
export async function setListingStatusAdmin(form: FormData) {
  const listingId = String(form.get("listing_id") || "").trim();
  const status = String(form.get("status") || "");

  if (!UUID_RE.test(listingId) || !["active", "paused"].includes(status)) {
    redirect(moderasiUrl("invalid"));
  }

  const db = await requireUser();
  const { error } = await db.rpc("set_rekber_listing_status_admin", {
    p_listing_id: listingId,
    p_status: status,
  });

  if (error) {
    if (isMissingRpcError(error)) redirect(moderasiUrl("stage_unavailable"));
    redirect(moderasiUrl("listing_error"));
  }

  revalidatePath("/admin/moderasi");
  revalidatePath("/dashboard/browse");
  revalidatePath("/dashboard/my-listings");
  redirect(moderasiUrl("listing_updated"));
}
