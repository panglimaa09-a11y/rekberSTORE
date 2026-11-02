"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import {
  createPakasirTransaction,
  getPakasirConfig,
  getPakasirTransactionStatus,
} from "@/lib/pakasir";
import { isMissingRpcError as isMissingMigration } from "@/lib/rekber-stages";

const packages: Record<string, { tokens: number; price: number }> = {
  "1": { tokens: 1, price: 5000 },
  "2": { tokens: 2, price: 10000 },
  "4": { tokens: 4, price: 15000 }
};

export async function createTokenTopupOrder(form: FormData) {
  const selected = packages[String(form.get("package_tokens") || "")];

  if (!selected) {
    redirect("/dashboard/topup?error=invalid_package");
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await db
    .from("token_topup_orders")
    .insert({
      user_id: user.id,
      package_tokens: selected.tokens,
      amount_idr: selected.price,
      status: "pending",
      provider: null,
      provider_reference: null
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Token top-up order error:", error?.message);
    redirect("/dashboard/topup?error=order_failed");
  }

  // Gateway Pakasir (top up saja): buat transaksi payment_link dan
  // simpan referensinya. Tanpa kunci, pesanan tetap tercatat pending
  // seperti sebelumnya; gagal membuat link tidak menghapus pesanan.
  const config = getPakasirConfig();
  if (!config) {
    revalidatePath("/dashboard/topup");
    redirect("/dashboard/topup?created=" + encodeURIComponent(data.id));
  }
  try {
    const { txnId, paymentLink } = await createPakasirTransaction(
      config,
      data.id,
      selected.price
    );
    const ref = await db.rpc("set_rekber_topup_reference", {
      p_order_id: data.id,
      p_reference: txnId,
      p_payment_link: paymentLink,
    });
    if (ref.error) {
      if (isMissingMigration(ref.error)) {
        redirect(
          "/dashboard/topup?created=" +
            encodeURIComponent(data.id) +
            "&error=topup_unavailable"
        );
      }
      console.error("Set top-up reference error:", ref.error.message);
      redirect(
        "/dashboard/topup?created=" +
          encodeURIComponent(data.id) +
          "&error=payment_link_failed"
      );
    }
  } catch (err) {
    console.error(
      "Pakasir create-transaction error:",
      err instanceof Error ? err.message : err
    );
    redirect(
      "/dashboard/topup?created=" +
        encodeURIComponent(data.id) +
        "&error=payment_link_failed"
    );
  }

  revalidatePath("/dashboard/topup");
  redirect("/dashboard/topup?created=" + encodeURIComponent(data.id));
}

/** Buat link bayar Pakasir untuk pesanan pending yang belum punya referensi. */
export async function createTopupPaymentLink(form: FormData) {
  const orderId = String(form.get("order_id") ?? "");
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const config = getPakasirConfig();
  if (!config) {
    redirect("/dashboard/topup?error=gateway_unconfigured");
  }

  const { data: order, error } = await db
    .from("token_topup_orders")
    .select("id,amount_idr,status,provider_reference")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !order || order.status !== "pending") {
    redirect("/dashboard/topup?error=order_not_found");
  }
  if (order.provider_reference) {
    redirect("/dashboard/topup?notice=link_exists");
  }

  try {
    const { txnId, paymentLink } = await createPakasirTransaction(
      config,
      order.id,
      order.amount_idr
    );
    const ref = await db.rpc("set_rekber_topup_reference", {
      p_order_id: order.id,
      p_reference: txnId,
      p_payment_link: paymentLink,
    });
    if (ref.error) {
      if (isMissingMigration(ref.error)) {
        redirect("/dashboard/topup?error=topup_unavailable");
      }
      redirect("/dashboard/topup?error=payment_link_failed");
    }
  } catch (err) {
    console.error(
      "Pakasir create-transaction error:",
      err instanceof Error ? err.message : err
    );
    redirect("/dashboard/topup?error=payment_link_failed");
  }

  revalidatePath("/dashboard/topup");
  redirect("/dashboard/topup?notice=link_created");
}

/**
 * Periksa status pembayaran ke Pakasir dan kreditkan token secara
 * idempotent bila lunas (credit_rekber_topup: pending -> paid tepat
 * sekali). Pola polling — Pakasir v2 tidak menyediakan webhook.
 */
export async function checkTopupStatus(form: FormData) {
  const orderId = String(form.get("order_id") ?? "");
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: order, error } = await db
    .from("token_topup_orders")
    .select("id,status,provider_reference")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !order) {
    redirect("/dashboard/topup?error=order_not_found");
  }
  if (order.status === "paid") {
    redirect("/dashboard/topup?notice=already_paid");
  }
  if (!order.provider_reference) {
    redirect("/dashboard/topup?notice=no_link");
  }

  const config = getPakasirConfig();
  if (!config) {
    redirect("/dashboard/topup?error=gateway_unconfigured");
  }

  let result;
  try {
    result = await getPakasirTransactionStatus(
      config,
      order.provider_reference
    );
  } catch (err) {
    console.error(
      "Pakasir status error:",
      err instanceof Error ? err.message : err
    );
    redirect("/dashboard/topup?error=status_check_failed");
  }

  if (result.paid) {
    const credit = await db.rpc("credit_rekber_topup", {
      p_order_id: order.id,
    });
    if (credit.error) {
      if (isMissingMigration(credit.error)) {
        redirect("/dashboard/topup?error=topup_unavailable");
      }
      console.error("Credit top-up error:", credit.error.message);
      redirect("/dashboard/topup?error=credit_failed");
    }
    revalidatePath("/dashboard/topup");
    redirect(
      "/dashboard/topup?notice=" +
        (credit.data === "already_credited" ? "already_paid" : "topup_paid")
    );
  }

  if (result.failed) {
    const fail = await db.rpc("fail_rekber_topup_order", {
      p_order_id: order.id,
    });
    if (fail.error && !isMissingMigration(fail.error)) {
      console.error("Fail top-up order error:", fail.error.message);
    }
    revalidatePath("/dashboard/topup");
    redirect("/dashboard/topup?notice=topup_failed");
  }

  revalidatePath("/dashboard/topup");
  redirect(
    "/dashboard/topup?notice=" +
      (result.isSandbox ? "topup_pending_sandbox" : "topup_pending")
  );
}
