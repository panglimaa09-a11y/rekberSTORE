// Tanpa dependensi server/edge — aman diimpor middleware maupun server.
export function getSupabaseEnv() {
  // Supabase kini menamai kuncinya "publishable key"; kode lama memakai
  // NEXT_PUBLIC_SUPABASE_ANON_KEY. Terima keduanya agar salah satu nama
  // yang diisi tetap jalan, bukan 500.
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  return { url, key };
}
