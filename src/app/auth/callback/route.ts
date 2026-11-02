import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // Supabase mengembalikan ?error=... untuk link kedaluwarsa/ditolak.
  // Sebelumnya error ini diabaikan dan user tetap dilempar ke /dashboard.
  if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const code = searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }
  }

  // Hanya izinkan redirect internal, cegah open-redirect via ?next=.
  const next = searchParams.get("next");
  const target =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  return NextResponse.redirect(`${origin}${target}`);
}
