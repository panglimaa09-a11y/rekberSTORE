"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { isMissingRpcError, rpcErrorToken } from "@/lib/rekber-stages";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const CASE_CATEGORIES = [
  "kriminal",
  "hack_akun",
  "barang_tidak_sesuai",
  "lainnya",
] as const;

/**
 * Buka kasus eskalasi dari transaksi (pihak transaksi atau staf).
 * Pesan dan bukti tidak dapat dihapus/diubah — tidak ada aksi hapus
 * untuk pesan, kasus, atau KYC di aplikasi ini.
 */
export async function openRekberCase(form: FormData) {
  const id = String(form.get("transaction_id") ?? "").trim();
  const category = String(form.get("category") ?? "");
  const reason = String(form.get("reason") ?? "").trim();

  if (
    !UUID_RE.test(id) ||
    !(CASE_CATEGORIES as readonly string[]).includes(category) ||
    reason.length < 10 ||
    reason.length > 2000
  ) {
    redirect(`/dashboard/transactions/${id}?notice=case_invalid`);
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const result = await db.rpc("open_rekber_case", {
    p_transaction_id: id,
    p_category: category,
    p_reason: reason,
  });
  if (result.error) {
    if (isMissingRpcError(result.error)) {
      redirect(`/dashboard/transactions/${id}?notice=case_unavailable`);
    }
    const token = rpcErrorToken(result.error);
    if (token === "CASE_ALREADY_OPEN") {
      redirect(`/dashboard/transactions/${id}?notice=case_open`);
    }
    redirect(`/dashboard/transactions/${id}?notice=case_error`);
  }

  revalidatePath(`/dashboard/transactions/${id}`);
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/transactions/${id}?notice=case_opened`);
}

/**
 * Ubah status kasus: hanya super_admin atau admin penangan transaksi
 * (ditegakkan RPC). Transisi: open -> under_review/rejected;
 * under_review -> escalated/resolved/rejected; escalated ->
 * resolved/rejected. Status terminal tidak dapat diubah lagi.
 */
export async function updateRekberCaseStatus(form: FormData) {
  const caseId = String(form.get("case_id") ?? "").trim();
  const status = String(form.get("status") ?? "");
  const resolution = String(form.get("resolution") ?? "").trim();

  if (!UUID_RE.test(caseId)) {
    redirect("/dashboard/admin?error=invalid");
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) {
    redirect("/dashboard/admin?error=forbidden");
  }

  const result = await db.rpc("update_rekber_case_status", {
    p_case_id: caseId,
    p_status: status,
    p_resolution: resolution || null,
  });
  if (result.error) {
    if (isMissingRpcError(result.error)) {
      redirect(
        `/dashboard/admin/kasus/${caseId}?notice=case_unavailable`
      );
    }
    const token = rpcErrorToken(result.error);
    if (token === "NOT_CASE_HANDLER") {
      redirect(`/dashboard/admin/kasus/${caseId}?notice=case_forbidden`);
    }
    if (token === "CASE_CLOSED") {
      redirect(`/dashboard/admin/kasus/${caseId}?notice=case_closed`);
    }
    if (
      token === "INVALID_TRANSITION" ||
      token === "INVALID_STATUS" ||
      token === "INVALID_RESOLUTION"
    ) {
      redirect(`/dashboard/admin/kasus/${caseId}?notice=case_invalid`);
    }
    redirect(`/dashboard/admin/kasus/${caseId}?notice=case_error`);
  }

  revalidatePath(`/dashboard/admin/kasus/${caseId}`);
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/admin/kasus/${caseId}?notice=case_updated`);
}
