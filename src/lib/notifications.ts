import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRoles } from "./supabase/roles";

export type NotificationItem = {
  id: string;
  kind:
    | "approval"
    | "dispute"
    | "payment_claim"
    | "topup"
    | "kyc"
    | "case"
    | "chat";
  title: string;
  body: string;
  href: string;
  createdAt: string;
  urgent: boolean;
};

/**
 * Notifikasi turunan (derived) — tanpa tabel tulis baru dan tanpa
 * email (tidak ada infra email). Setiap sumber dibungkus try/catch
 * sendiri: tabel/kolom yang belum ada (migrasi belum dijalankan)
 * hanya menghilangkan sumber itu, bukan seluruh halaman.
 */
export async function buildNotifications(
  db: SupabaseClient,
  userId: string,
  roles: StaffRoles
): Promise<NotificationItem[]> {
  const items: NotificationItem[] = [];

  // 1. Persetujuan seller yang menunggu.
  try {
    const { data, error } = await db
      .from("transactions")
      .select("id,title,created_at")
      .eq("seller_id", userId)
      .eq("status", "awaiting_acceptance")
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) {
      for (const row of data ?? []) {
        items.push({
          id: `approval-${row.id}`,
          kind: "approval",
          title: "Persetujuan transaksi menunggu Anda",
          body: `Transaksi "${row.title}" menunggu keputusan seller.`,
          href: `/dashboard/transactions/${row.id}`,
          createdAt: row.created_at,
          urgent: true,
        });
      }
    }
  } catch {
    // Sumber dilewati.
  }

  // 2. Sengketa terbuka (pihak terkait + staf).
  try {
    const { data, error } = await db
      .from("disputes")
      .select("id,transaction_id,status,created_at")
      .in("status", ["open", "under_review"])
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) {
      for (const row of data ?? []) {
        items.push({
          id: `dispute-${row.id}`,
          kind: "dispute",
          title: roles.isStaff
            ? "Sengketa menunggu putusan admin"
            : "Sengketa Anda menunggu putusan",
          body: "Tahap transaksi ditunda sampai ada putusan.",
          href: `/dashboard/transactions/${row.transaction_id}`,
          createdAt: row.created_at,
          urgent: roles.isStaff,
        });
      }
    }
  } catch {
    // Sumber dilewati.
  }

  // 3. Klaim pembayaran menunggu verifikasi admin penangan.
  if (roles.isStaff) {
    try {
      const { data, error } = await db
        .from("transactions")
        .select("id,title,created_at")
        .eq("status", "awaiting_payment_provider")
        .not("buyer_payment_claimed_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!error) {
        for (const row of data ?? []) {
          items.push({
            id: `claim-${row.id}`,
            kind: "payment_claim",
            title: "Klaim pembayaran menunggu verifikasi",
            body: `Buyer mengklaim dana sudah dikirim untuk "${row.title}". Verifikasi penerimaan di aplikasi QRIS/bank Anda.`,
            href: `/dashboard/transactions/${row.id}`,
            createdAt: row.created_at,
            urgent: true,
          });
        }
      }
    } catch {
      // Kolom belum ada (migrasi belum dijalankan) — dilewati.
    }
  }

  // 4. Pesanan top up yang sudah punya link bayar tapi belum lunas.
  try {
    const { data, error } = await db
      .from("token_topup_orders")
      .select("id,package_tokens,created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .not("provider_reference", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    if (!error) {
      for (const row of data ?? []) {
        items.push({
          id: `topup-${row.id}`,
          kind: "topup",
          title: "Pesanan top up menunggu pembayaran",
          body: `Paket ${row.package_tokens} token belum lunas. Periksa status pembayaran di halaman Top Up.`,
          href: "/dashboard/topup",
          createdAt: row.created_at,
          urgent: false,
        });
      }
    }
  } catch {
    // Sumber dilewati.
  }

  // 5. Status KYC pengguna (tabel dari migrasi lanjutan; absen = dilewati).
  try {
    const { data, error } = await db
      .from("user_kyc_submissions")
      .select("id,status,reviewer_note,submitted_at")
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      if (data.status === "pending_review") {
        items.push({
          id: `kyc-${data.id}`,
          kind: "kyc",
          title: "KYC Anda menunggu tinjauan admin",
          body: "KYC dikirim ke admin dan sedang ditinjau. Status tampil di profil Anda.",
          href: "/dashboard/kyc",
          createdAt: data.submitted_at,
          urgent: false,
        });
      } else if (data.status === "rejected") {
        items.push({
          id: `kyc-${data.id}`,
          kind: "kyc",
          title: "KYC Anda ditolak — kirim ulang",
          body: data.reviewer_note
            ? `Alasan penolakan: ${data.reviewer_note}`
            : "KYC Anda ditolak. Kirim ulang dengan dokumen yang sesuai.",
          href: "/dashboard/kyc",
          createdAt: data.submitted_at,
          urgent: true,
        });
      }
    }
  } catch {
    // Sumber dilewati.
  }

  // 6. Kasus eskalasi terbuka yang melibatkan Anda.
  try {
    const { data, error } = await db
      .from("escalation_cases")
      .select("id,transaction_id,status,created_at")
      .in("status", ["open", "under_review", "escalated"])
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error) {
      for (const row of data ?? []) {
        items.push({
          id: `case-${row.id}`,
          kind: "case",
          title: "Kasus eskalasi masih ditangani",
          body: "Laporan Anda ditindaklanjuti sesuai hukum yang berlaku. Pesan dan bukti tidak dapat diubah.",
          href: `/dashboard/transactions/${row.transaction_id}`,
          createdAt: row.created_at,
          urgent: false,
        });
      }
    }
  } catch {
    // Sumber dilewati.
  }

  // 7. Aktivitas chat terbaru dari pihak lain (bukan status "belum dibaca").
  try {
    const { data: myTx } = await db
      .from("transactions")
      .select("id")
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .limit(20);
    const txIds = (myTx ?? []).map((t) => t.id);
    if (txIds.length > 0) {
      const { data, error } = await db
        .from("transaction_messages")
        .select("id,transaction_id,body,created_at")
        .in("transaction_id", txIds)
        .neq("sender_id", userId)
        .order("created_at", { ascending: false })
        .limit(3);
      if (!error) {
        for (const row of data ?? []) {
          items.push({
            id: `chat-${row.id}`,
            kind: "chat",
            title: "Aktivitas chat terbaru",
            body:
              row.body.length > 90
                ? row.body.slice(0, 90) + "…"
                : row.body,
            href: `/dashboard/transactions/${row.transaction_id}`,
            createdAt: row.created_at,
            urgent: false,
          });
        }
      }
    }
  } catch {
    // Sumber dilewati.
  }

  return items.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Hitungan lonceng: hanya hal butuh tindakan (query count ringan).
 * Gagal pada satu sumber = sumber itu dihitung 0, bukan error halaman.
 */
export async function getActionNotificationCount(
  db: SupabaseClient,
  userId: string,
  roles: StaffRoles
): Promise<number> {
  let count = 0;
  try {
    const { count: c } = await db
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", userId)
      .eq("status", "awaiting_acceptance");
    count += c ?? 0;
  } catch {
    // Dilewati.
  }
  try {
    const { count: c } = await db
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "under_review"]);
    count += c ?? 0;
  } catch {
    // Dilewati.
  }
  if (roles.isStaff) {
    try {
      const { count: c } = await db
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "awaiting_payment_provider")
        .not("buyer_payment_claimed_at", "is", null);
      count += c ?? 0;
    } catch {
      // Kolom belum ada — dilewati.
    }
  }
  try {
    const { count: c } = await db
      .from("token_topup_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending")
      .not("provider_reference", "is", null);
    count += c ?? 0;
  } catch {
    // Dilewati.
  }
  return count;
}
