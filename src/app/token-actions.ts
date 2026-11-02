"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

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

  revalidatePath("/dashboard/topup");

  redirect(
    "/dashboard/topup?created=" + encodeURIComponent(data.id)
  );
}