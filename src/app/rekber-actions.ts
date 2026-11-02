"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import {
  isMissingRpcError,
  rpcErrorToken,
  type RekberStageAction,
} from "@/lib/rekber-stages";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const STAGE_ACTIONS: RekberStageAction[] = [
  "claim_payment",
  "confirm_payment",
  "mark_delivered",
  "begin_inspection",
  "finish_inspection",
  "confirm_receipt",
  "admin_verify",
  "admin_release",
];

const STAGE_NOTICES: Record<RekberStageAction, string> = {
  claim_payment: "stage_claimed",
  confirm_payment: "stage_confirmed",
  mark_delivered: "stage_delivered",
  begin_inspection: "stage_inspecting",
  finish_inspection: "stage_inspected",
  confirm_receipt: "stage_receipt",
  admin_verify: "stage_verified",
  admin_release: "stage_released",
};

function detailUrl(id: string, notice: string) {
  return `/dashboard/transactions/${id}?notice=${notice}`;
}

/**
 * Pindah tahap 8 langkah via RPC advance_rekber_stage. Peran, urutan
 * tahap, dan idempotensi ditegakkan di database; action ini hanya
 * memvalidasi bentuk input dan memetakan error ke notice yang jujur.
 */
export async function advanceRekberStage(form: FormData) {
  const id = String(form.get("transaction_id") || "").trim();
  const action = String(form.get("stage_action") || "") as RekberStageAction;

  if (!UUID_RE.test(id) || !STAGE_ACTIONS.includes(action)) {
    redirect("/dashboard/transactions?notice=invalid");
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await db.rpc("advance_rekber_stage", {
    p_transaction_id: id,
    p_action: action,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      redirect(detailUrl(id, "stage_unavailable"));
    }
    const token = rpcErrorToken(error);
    if (token === "DELIVERY_MESSAGE_REQUIRED") {
      redirect(detailUrl(id, "delivery_message_required"));
    }
    if (token === "TRANSACTION_DISPUTED") {
      redirect(detailUrl(id, "disputed"));
    }
    redirect(detailUrl(id, "action_error"));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  revalidatePath(`/dashboard/transactions/${id}`);

  redirect(detailUrl(id, data === "already" || data === "already_claimed" ? "stage_done" : STAGE_NOTICES[action]));
}

/** Buka sengketa via RPC (satu sengketa terbuka per transaksi; baris lama yang sudah diputus dibuka kembali). */
export async function openRekberDispute(form: FormData) {
  const id = String(form.get("transaction_id") || "").trim();
  const reason = String(form.get("reason") || "").trim();

  if (!UUID_RE.test(id) || reason.length < 10 || reason.length > 2000) {
    redirect(detailUrl(id, "dispute_invalid"));
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await db.rpc("open_rekber_dispute", {
    p_transaction_id: id,
    p_reason: reason,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      redirect(detailUrl(id, "stage_unavailable"));
    }
    const token = rpcErrorToken(error);
    if (token === "DISPUTE_ALREADY_OPEN") {
      redirect(detailUrl(id, "dispute_open"));
    }
    redirect(detailUrl(id, "dispute_error"));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  revalidatePath(`/dashboard/transactions/${id}`);

  redirect(detailUrl(id, "dispute_opened"));
}

/** Putusan sengketa oleh admin penangan / super_admin via RPC. */
export async function resolveRekberDispute(form: FormData) {
  const disputeId = String(form.get("dispute_id") || "").trim();
  const transactionId = String(form.get("transaction_id") || "").trim();
  const decision = String(form.get("decision") || "");
  const resolution = String(form.get("resolution") || "").trim();

  if (
    !UUID_RE.test(disputeId) ||
    !UUID_RE.test(transactionId) ||
    !["resume", "refund", "reject"].includes(decision) ||
    resolution.length < 5 ||
    resolution.length > 2000
  ) {
    redirect(detailUrl(transactionId, "dispute_invalid"));
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await db.rpc("resolve_rekber_dispute", {
    p_dispute_id: disputeId,
    p_decision: decision,
    p_resolution: resolution,
  });

  if (error) {
    if (isMissingRpcError(error)) {
      redirect(detailUrl(transactionId, "stage_unavailable"));
    }
    redirect(detailUrl(transactionId, "dispute_error"));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  revalidatePath(`/dashboard/transactions/${transactionId}`);

  redirect(
    detailUrl(
      transactionId,
      data === "refunded"
        ? "dispute_refunded"
        : data === "reject"
          ? "dispute_rejected"
          : "dispute_resumed"
    )
  );
}

export type SendMessageState = { ok: boolean; error?: string } | null;

/**
 * Kirim pesan chat transaksi. Tanpa redirect agar kolom tidak
 * kehilangan teks saat gagal dan agar Realtime dapat memperbarui
 * daftar. RLS (peserta transaksi) ditegakkan database.
 */
export async function sendTransactionMessage(
  _prevState: SendMessageState,
  form: FormData
): Promise<SendMessageState> {
  const id = String(form.get("transaction_id") || "").trim();
  const body = String(form.get("body") || "").trim();

  if (!UUID_RE.test(id) || body.length < 1 || body.length > 5000) {
    return { ok: false, error: "send_failed" };
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await db.from("transaction_messages").insert({
    transaction_id: id,
    sender_id: user.id,
    body,
  });

  if (error) {
    const message = (error.message ?? "").toLowerCase();
    const code = (error as { code?: string }).code ?? "";
    if (
      code === "42P01" ||
      message.includes("does not exist") ||
      message.includes("relation")
    ) {
      return { ok: false, error: "chat_unavailable" };
    }
    if (code === "42501" || message.includes("row-level security")) {
      return { ok: false, error: "not_allowed" };
    }
    return { ok: false, error: "send_failed" };
  }

  revalidatePath(`/dashboard/transactions/${id}`);
  return { ok: true };
}

/**
 * Kirim lokasi satu titik ke chat transaksi (tanpa pelacakan live).
 * Koordinat disimpan pada baris pesan bertipe location; RLS pesan yang
 * sudah ada berlaku (pihak transaksi + admin penangan + super_admin).
 */
export async function sendTransactionLocation(
  _prevState: SendMessageState,
  form: FormData
): Promise<SendMessageState> {
  const id = String(form.get("transaction_id") || "").trim();
  const lat = Number(form.get("latitude"));
  const lng = Number(form.get("longitude"));
  const accuracyRaw = form.get("accuracy");
  const accuracy =
    accuracyRaw === null || accuracyRaw === ""
      ? null
      : Number(accuracyRaw);

  if (
    !UUID_RE.test(id) ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180 ||
    (accuracy !== null &&
      (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000))
  ) {
    return { ok: false, error: "send_failed" };
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await db.from("transaction_messages").insert({
    transaction_id: id,
    sender_id: user.id,
    body: "Lokasi dibagikan",
    message_type: "location",
    location_lat: lat,
    location_lng: lng,
    location_accuracy_m: accuracy,
    location_shared_at: new Date().toISOString(),
  });

  if (error) {
    const message = (error.message ?? "").toLowerCase();
    const code = (error as { code?: string }).code ?? "";
    if (
      code === "42P01" ||
      code === "42703" ||
      code === "PGRST204" ||
      message.includes("does not exist") ||
      message.includes("location_lat") ||
      message.includes("message_type")
    ) {
      return { ok: false, error: "location_unavailable" };
    }
    if (code === "42501" || message.includes("row-level security")) {
      return { ok: false, error: "not_allowed" };
    }
    return { ok: false, error: "send_failed" };
  }

  revalidatePath(`/dashboard/transactions/${id}`);
  return { ok: true };
}

/** Nilai admin penangan transaksi selesai (1–5 bintang + komentar opsional). */
export async function submitRekberRating(form: FormData) {
  const id = String(form.get("id") ?? "");
  const stars = Number(form.get("stars") ?? 0);
  const comment = String(form.get("comment") ?? "");

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const result = await db.rpc("submit_rekber_rating", {
    p_transaction_id: id,
    p_stars: stars,
    p_comment: comment.trim() || null,
  });
  if (result.error) {
    if (isMissingRpcError(result.error)) {
      redirect(`/dashboard/transactions/${id}?notice=rating_unavailable`);
    }
    const token = rpcErrorToken(result.error);
    if (token === "TRANSACTION_NOT_COMPLETED") {
      redirect(`/dashboard/transactions/${id}?notice=rating_error`);
    }
    if (token === "NO_HANDLING_ADMIN") {
      redirect(`/dashboard/transactions/${id}?notice=rating_no_admin`);
    }
    redirect(`/dashboard/transactions/${id}?notice=rating_error`);
  }
  if (result.data === "already_rated") {
    redirect(`/dashboard/transactions/${id}?notice=rating_done`);
  }
  redirect(`/dashboard/transactions/${id}?notice=rating_submitted`);
}
