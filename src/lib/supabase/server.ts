import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

export async function supabaseServer() {
  const store = await cookies();

  const { url, key } = getSupabaseEnv();

  if (!url || !key) {
    throw new Error("Supabase environment belum diisi");
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(
        items: {
          name: string;
          value: string;
          options?: Parameters<typeof store.set>[2];
        }[]
      ) {
        try {
          items.forEach(({ name, value, options }) => {
            store.set(name, value, options);
          });
        } catch {
          // Cookie tidak dapat diubah pada Server Component.
        }
      },
    },
  });
}
