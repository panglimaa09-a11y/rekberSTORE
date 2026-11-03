"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

// Login Google langsung (GIS + ID token, tanpa client secret).
// Client ID dibaca di sini, di sisi server saat request — bukan di-inline
// saat build — sehingga env Vercel yang diisi belakangan langsung berlaku
// tanpa rebuild. Nilainya adalah pengidentifikasi publik, bukan secret.
const NONCE_COOKIE = "google_oauth_nonce";

export type GoogleSignInPreparation =
  | { configured: true; clientId: string; nonce: string }
  | { configured: false };

// Menerbitkan nonce acak dan menyimpannya di cookie httpOnly sekali
// pakai (5 menit). Nonce yang sama dikirim ke Google Identity Services;
// Supabase membandingkan klaim nonce di dalam ID token dengan nilai ini.
export async function prepareGoogleSignIn(): Promise<GoogleSignInPreparation> {
  const clientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
  if (!clientId) {
    return { configured: false };
  }
  const nonce = randomUUID();
  const store = await cookies();
  store.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return { configured: true, clientId, nonce };
}

// Menukar ID token Google menjadi sesi Supabase. WAJIB ada nonce cookie
// yang cocok — tanpa itu login ditolak, apa pun isi tokennya. Cookie
// nonce dihapus apa pun hasilnya agar tidak bisa dipakai ulang.
export async function loginWithGoogleIdToken(
  credential: string,
): Promise<{ ok: boolean }> {
  const store = await cookies();
  const nonce = store.get(NONCE_COOKIE)?.value;
  store.delete(NONCE_COOKIE);
  if (
    typeof credential !== "string" ||
    credential.length === 0 ||
    credential.length > 8192 ||
    !nonce
  ) {
    return { ok: false };
  }
  let supabase;
  try {
    supabase = await supabaseServer();
  } catch {
    return { ok: false };
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
    nonce,
  });
  if (error) {
    // Jangan bocorkan detail error mentah ke client; penyebab umum
    // (token kedaluwarsa, nonce tak cocok) cukup diwakili banner umum.
    console.error("Login Google langsung gagal");
    return { ok: false };
  }
  return { ok: true };
}
