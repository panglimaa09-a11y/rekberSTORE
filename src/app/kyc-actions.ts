"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { isMissingRpcError, rpcErrorToken } from "@/lib/rekber-stages";

/** Ambil nilai non-kosong pertama (mendukung fallback path lama + unggahan baru). */
function firstValue(form: FormData, name: string): string {
  for (const value of form.getAll(name)) {
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

/**
 * Kirim KYC pengguna KE ADMIN (bukan ke lawan transaksi). Berkas
 * diunggah privat lewat DocumentUpload; RPC memvalidasi kepemilikan
 * path dan memperbarui pengajuan yang masih menunggu/ditolak.
 */
export async function submitUserKyc(form: FormData) {
  const legalName = String(form.get("legal_name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const documentType = String(form.get("document_type") ?? "");
  const documentPath = firstValue(form, "document_path");
  const selfiePath = firstValue(form, "selfie_path");

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  if (
    legalName.length < 3 ||
    legalName.length > 120 ||
    !/^\+?[0-9]{8,15}$/.test(phone) ||
    !["KTP", "SIM", "PASPOR"].includes(documentType) ||
    !documentPath.startsWith(`${user.id}/kyc/`) ||
    !selfiePath.startsWith(`${user.id}/kyc/`)
  ) {
    redirect("/dashboard/kyc?error=kyc_invalid");
  }

  const result = await db.rpc("submit_user_kyc", {
    p_legal_name: legalName,
    p_phone_e164: phone,
    p_document_type: documentType,
    p_document_path: documentPath,
    p_selfie_path: selfiePath || null,
  });
  if (result.error) {
    if (isMissingRpcError(result.error)) {
      redirect("/dashboard/kyc?error=kyc_unavailable");
    }
    const token = rpcErrorToken(result.error);
    if (token === "KYC_ALREADY_APPROVED") {
      redirect("/dashboard/kyc?notice=kyc_approved");
    }
    redirect("/dashboard/kyc?error=kyc_error");
  }

  revalidatePath("/dashboard/kyc");
  revalidatePath("/dashboard/profile");
  redirect("/dashboard/kyc?notice=submitted");
}

/** Tinjau pengajuan KYC pengguna (staf: admin + super_admin). */
export async function reviewUserKyc(form: FormData) {
  const submissionId = String(form.get("submission_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "");

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) {
    redirect("/dashboard/admin?error=forbidden");
  }

  const result = await db.rpc("review_user_kyc", {
    p_submission_id: submissionId,
    p_decision: decision,
    p_note: note || null,
  });
  if (result.error) {
    if (isMissingRpcError(result.error)) {
      redirect("/dashboard/admin?error=kyc_unavailable");
    }
    const token = rpcErrorToken(result.error);
    if (token === "NOT_PENDING") {
      redirect("/dashboard/admin?notice=kyc_not_pending");
    }
    if (token === "INVALID_NOTE") {
      redirect("/dashboard/admin?error=kyc_invalid_note");
    }
    redirect("/dashboard/admin?error=kyc_review_error");
  }

  revalidatePath("/dashboard/admin");
  redirect("/dashboard/admin?notice=kyc_reviewed");
}
