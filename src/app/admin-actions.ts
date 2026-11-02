"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { isMissingRpcError, rpcErrorToken } from "@/lib/rekber-stages";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function adminUrl(notice: string) {
  return `/dashboard/admin?notice=${notice}`;
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

  if (!email.includes("@") || !email.includes(".") || email.length > 254) {
    redirect(adminUrl("appoint_invalid"));
  }

  const db = await requireUser();
  const { error } = await db.rpc("appoint_rekber_admin", { p_email: email });

  if (error) {
    if (isMissingRpcError(error)) redirect(adminUrl("stage_unavailable"));
    const token = rpcErrorToken(error);
    if (token === "USER_NOT_FOUND") redirect(adminUrl("appoint_not_found"));
    redirect(adminUrl("appoint_error"));
  }

  revalidatePath("/dashboard/admin");
  redirect(adminUrl("appointed"));
}

export async function revokeRekberAdmin(form: FormData) {
  const userId = String(form.get("user_id") || "").trim();

  if (!UUID_RE.test(userId)) {
    redirect(adminUrl("invalid"));
  }

  const db = await requireUser();
  const { error } = await db.rpc("revoke_rekber_admin", { p_user_id: userId });

  if (error) {
    if (isMissingRpcError(error)) redirect(adminUrl("stage_unavailable"));
    redirect(adminUrl("revoke_error"));
  }

  revalidatePath("/dashboard/admin");
  redirect(adminUrl("revoked"));
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

  if (
    !UUID_RE.test(profileId) ||
    !["approved", "rejected"].includes(decision) ||
    note.length > 500
  ) {
    redirect(adminUrl("review_invalid"));
  }

  const db = await requireUser();
  const { error } = await db.rpc("review_rekber_qr_profile", {
    p_profile_id: profileId,
    p_decision: decision,
    p_note: note || null,
  });

  if (error) {
    if (isMissingRpcError(error)) redirect(adminUrl("stage_unavailable"));
    redirect(adminUrl("review_error"));
  }

  revalidatePath("/dashboard/admin");
  redirect(adminUrl("qr_reviewed"));
}

/** Tinjau pengajuan KYC oleh super_admin. */
export async function reviewKycSubmission(form: FormData) {
  const submissionId = String(form.get("submission_id") || "").trim();
  const decision = String(form.get("decision") || "");
  const note = String(form.get("note") || "").trim();

  if (
    !UUID_RE.test(submissionId) ||
    !["approved", "rejected", "suspended"].includes(decision) ||
    note.length > 500
  ) {
    redirect(adminUrl("review_invalid"));
  }

  const db = await requireUser();
  const { error } = await db.rpc("review_rekber_kyc_submission", {
    p_submission_id: submissionId,
    p_decision: decision,
    p_note: note || null,
  });

  if (error) {
    if (isMissingRpcError(error)) redirect(adminUrl("stage_unavailable"));
    redirect(adminUrl("review_error"));
  }

  revalidatePath("/dashboard/admin");
  redirect(adminUrl("kyc_reviewed"));
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
    redirect("/dashboard/admin/profil-bisnis?error=invalid");
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
      redirect("/dashboard/admin/profil-bisnis?error=unavailable");
    }
    redirect("/dashboard/admin/profil-bisnis?error=save");
  }

  revalidatePath("/dashboard/admin/profil-bisnis");
  redirect("/dashboard/admin/profil-bisnis?notice=qr_submitted");
}

/** Simpan/ajukan dokumen KYC oleh admin itu sendiri. */
export async function upsertKycSubmission(form: FormData) {
  const legalName = String(form.get("legal_name") || "").trim();
  const phone = String(form.get("phone_e164") || "").trim();
  const docType = String(form.get("identity_document_type") || "").trim();
  const docPath = String(form.get("identity_document_object_path") || "").trim();
  const selfiePath = String(form.get("selfie_object_path") || "").trim();

  if (
    legalName.length < 2 ||
    legalName.length > 120 ||
    !phone ||
    phone.length > 20 ||
    !docType ||
    docType.length > 40 ||
    !docPath ||
    docPath.includes("..") ||
    !selfiePath ||
    selfiePath.includes("..")
  ) {
    redirect("/dashboard/admin/profil-bisnis?error=invalid");
  }

  const db = await requireUser();
  const { error } = await db.rpc("upsert_rekber_kyc_submission", {
    p_legal_name: legalName,
    p_phone_e164: phone,
    p_identity_document_type: docType,
    p_identity_document_object_path: docPath,
    p_selfie_object_path: selfiePath,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      redirect("/dashboard/admin/profil-bisnis?error=unavailable");
    }
    redirect("/dashboard/admin/profil-bisnis?error=save");
  }

  revalidatePath("/dashboard/admin/profil-bisnis");
  redirect("/dashboard/admin/profil-bisnis?notice=kyc_submitted");
}

/** Jeda/aktifkan listing oleh staf. Tanpa hapus (tidak ada policy DELETE). */
export async function setListingStatusAdmin(form: FormData) {
  const listingId = String(form.get("listing_id") || "").trim();
  const status = String(form.get("status") || "");

  if (!UUID_RE.test(listingId) || !["active", "paused"].includes(status)) {
    redirect(adminUrl("invalid"));
  }

  const db = await requireUser();
  const { error } = await db.rpc("set_rekber_listing_status_admin", {
    p_listing_id: listingId,
    p_status: status,
  });

  if (error) {
    if (isMissingRpcError(error)) redirect(adminUrl("stage_unavailable"));
    redirect(adminUrl("listing_error"));
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/browse");
  revalidatePath("/dashboard/my-listings");
  redirect(adminUrl("listing_updated"));
}
