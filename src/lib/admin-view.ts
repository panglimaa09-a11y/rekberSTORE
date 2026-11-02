import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Helper tampilan bersama halaman-halaman panel admin (/admin/*).
 * Modul murni tanpa "use client": boleh diimpor Server Component
 * maupun Client Component. Sebelum refactor, helper-helper ini
 * diduplikasi di tiap halaman (money, dateLabel, displayName).
 */

export const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);

export const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString("id-ID") : null;

/** Label status transaksi untuk tabel pengawasan. */
export const statusLabels: Record<string, string> = {
  awaiting_acceptance: "Menunggu persetujuan",
  awaiting_payment_provider: "Menunggu pembayaran manual",
  provider_payment_confirmed: "Dana ditahan admin",
  item_delivery: "Proses penyerahan",
  buyer_inspection: "Pemeriksaan buyer",
  completed: "Selesai",
  disputed: "Dalam sengketa",
  refund_pending: "Menunggu refund",
  cancelled: "Dibatalkan",
};

/**
 * Nama tampilan untuk sekumpulan id pengguna, satu panggilan batch
 * lewat RPC get_rekber_display_names. Gagal baca = peta kosong;
 * pemanggil memakai fallback ID pendek.
 */
export async function loadDisplayNames(
  db: SupabaseClient,
  userIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  try {
    const ids = Array.from(
      new Set(userIds.filter((v): v is string => !!v))
    );
    if (ids.length === 0) return nameMap;
    const { data, error } = await db.rpc("get_rekber_display_names", {
      p_user_ids: ids,
    });
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        nameMap.set(row.user_id, row.display_name || "");
      }
    }
  } catch {
    // Fallback ID pendek di pemanggil.
  }
  return nameMap;
}

/** Nama tampilan satu pengguna: "Anda" untuk diri sendiri, lalu nama, lalu ID pendek. */
export function displayNameFor(
  nameMap: Map<string, string>,
  selfId: string,
  uid: string | null | undefined
): string {
  if (!uid) return "—";
  if (uid === selfId) return "Anda";
  const name = nameMap.get(uid);
  return name ? name : `ID ${uid.slice(0, 8)}…`;
}
