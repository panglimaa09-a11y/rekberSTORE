"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export async function login(form: FormData) {
  const p = z
    .object({ email: z.string().email(), password: z.string().min(8) })
    .safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
  if (!p.success) redirect("/login?error=invalid");
  const s = await supabaseServer();
  const { error } = await s.auth.signInWithPassword(p.data);
  if (error) {
    // Bedakan penyebab agar tidak menebak: Supabase mengembalikan
    // kode/pesan berbeda untuk email belum terkonfirmasi vs kredensial salah.
    const msg = `${(error as { code?: string }).code ?? ""} ${error.message}`.toLowerCase();
    if (msg.includes("not confirmed") || msg.includes("email_not_confirmed"))
      redirect("/login?error=unconfirmed");
    if (msg.includes("invalid")) redirect("/login?error=invalid");
    redirect("/login?error=failed");
  }
  redirect("/dashboard");
}

export async function register(form: FormData) {
  const p = z
    .object({
      name: z.string().min(2).max(100),
      email: z.string().email(),
      password: z.string().min(8),
    })
    .safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    });
  if (!p.success) redirect("/register?error=invalid");
  const s = await supabaseServer();
  // Arahkan link verifikasi email ke /auth/callback agar kode PKCE
  // ditukar sesi di sana. Tanpa ini, link memakai Site URL saja dan
  // user mendarat di beranda tanpa sesi (harus login manual).
  const origin =
    (await headers()).get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const { error } = await s.auth.signUp({
    email: p.data.email,
    password: p.data.password,
    options: {
      data: { display_name: p.data.name },
      emailRedirectTo: `${origin.replace(/\/+$/, "")}/auth/callback`,
    },
  });
  if (error) redirect("/register?error=failed");
  redirect("/register?success=check_email");
}

export async function logout() {
  const s = await supabaseServer();
  await s.auth.signOut();
  redirect("/");
}

export async function loginWithGoogle(form: FormData) {
  // redirectTo WAJIB /auth/callback agar kode OAuth ditukar sesi di sana
  // (pola yang sama dengan link verifikasi email). Mengarah ke root akan
  // membuat user mendarat tanpa sesi.
  const source = String(form.get("source") || "login");
  const back = source === "register" ? "/register" : "/login";
  const s = await supabaseServer();
  const origin =
    (await headers()).get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const { data, error } = await s.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin.replace(/\/+$/, "")}/auth/callback`,
    },
  });
  if (error || !data?.url) {
    // Degradasi anggun: provider belum diaktifkan di dashboard Supabase
    // bukan crash — user diberi tahu jelas dan tetap bisa masuk pakai
    // email/password. Jangan menebak penyebab di luar pesan Supabase.
    const msg = `${error?.message ?? ""}`.toLowerCase();
    if (
      msg.includes("provider") ||
      msg.includes("enabled") ||
      msg.includes("unsupported") ||
      msg.includes("disabled") ||
      msg.includes("not configured")
    ) {
      redirect(`${back}?error=oauth_unavailable`);
    }
    redirect(`${back}?error=oauth_failed`);
  }
  redirect(data.url);
}

export async function requestPasswordReset(form: FormData) {
  const p = z
    .object({ email: z.string().email() })
    .safeParse({ email: form.get("email") });
  if (!p.success) redirect("/forgot-password?error=invalid");
  const s = await supabaseServer();
  // Link reset diarahkan ke /auth/callback agar kode ditukar sesi di
  // sana, lalu diteruskan ke /reset-password (memanfaatkan ?next=).
  const origin =
    (await headers()).get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const { error } = await s.auth.resetPasswordForEmail(p.data.email, {
    redirectTo: `${origin.replace(/\/+$/, "")}/auth/callback?next=/reset-password`,
  });
  if (error) redirect("/forgot-password?error=failed");
  redirect("/forgot-password?sent=1");
}

export async function updatePassword(form: FormData) {
  const p = z
    .object({ password: z.string().min(8), confirm: z.string().min(8) })
    .safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
  if (!p.success) redirect("/reset-password?error=invalid");
  if (p.data.password !== p.data.confirm)
    redirect("/reset-password?error=mismatch");
  const s = await supabaseServer();
  const { data: { user } } = await s.auth.getUser();
  if (!user) redirect("/reset-password?error=session");
  const { error } = await s.auth.updateUser({ password: p.data.password });
  if (error) redirect("/reset-password?error=update");
  redirect("/login?notice=reset");
}

export async function updateDisplayName(form: FormData) {
  const p = z
    .object({ name: z.string().min(2).max(100) })
    .safeParse({ name: form.get("name") });
  if (!p.success) redirect("/dashboard/profile?error=invalid");
  const s = await supabaseServer();
  const { data: { user } } = await s.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await s.auth.updateUser({
    data: { display_name: p.data.name },
  });
  if (error) redirect("/dashboard/profile?error=update");
  redirect("/dashboard/profile?notice=updated");
}
