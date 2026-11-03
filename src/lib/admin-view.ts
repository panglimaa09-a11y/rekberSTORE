import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRpcError } from "@/lib/rekber-stages";

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

/** Angka antrean hub panel admin dari RPC get_rekber_admin_queue_counts. */
export type AdminQueueCounts = {
  disputes_waiting: number;
  cases_open: number;
  user_kyc_pending: number;
  topup_pending: number;
  pending_qr: number;
  pending_kyc: number;
};

/**
 * Baca angka antrean untuk badge hub /admin. Gagal baca apa pun
 * (termasuk migrasi 20261102080007 belum dijalankan) = null; pemanggil
 * menampilkan "—", bukan angka karangan. Kegagalan selain RPC belum
 * ada dicatat ke log server agar dapat ditelusuri.
 */
export async function loadAdminQueueCounts(
  db: SupabaseClient,
  isSuperAdmin: boolean
): Promise<AdminQueueCounts | null> {
  try {
    const { data, error } = await db.rpc(
      "get_rekber_admin_queue_counts"
    );
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const counts: AdminQueueCounts = {
      disputes_waiting: Number(row.disputes_waiting ?? 0),
      cases_open: Number(row.cases_open ?? 0),
      user_kyc_pending: Number(row.user_kyc_pending ?? 0),
      topup_pending: Number(row.topup_pending ?? 0),
      pending_qr: isSuperAdmin ? Number(row.pending_qr ?? 0) : 0,
      pending_kyc: isSuperAdmin ? Number(row.pending_kyc ?? 0) : 0,
    };
    return counts;
  } catch (error) {
    if (
      !isMissingRpcError(error as { code?: string; message?: string })
    ) {
      console.error(
        "[loadAdminQueueCounts] gagal baca antrean:",
        error
      );
    }
    return null;
  }
}
