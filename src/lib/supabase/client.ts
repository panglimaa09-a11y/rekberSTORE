import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Klien Supabase browser untuk Realtime + Storage.
 * Mengembalikan null bila env publik belum diisi — pemanggil wajib
 * menampilkan keadaan jujur, bukan crash. Satu instance dipakai ulang
 * agar langganan Realtime tidak berlipat.
 */
export function supabaseBrowser() {
  if (browserClient) return browserClient;
  const { url, key } = getSupabaseEnv();
  if (!url || !key) return null;
  browserClient = createBrowserClient(url, key);
  return browserClient;
}
