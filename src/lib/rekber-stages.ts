/**
 * Metadata 8 tahap transaksi RekberSTORE (tampilan + pemetaan status).
 * Tahap 0 = pengajuan (sebelum persetujuan seller). Tahap 1-8 adalah
 * alur live yang ditampilkan di chat/detail dan diperbarui realtime.
 * Uang pada tahap 1, 2, dan 8 adalah aksi/konfirmasi manual.
 * Tidak ada transfer otomatis dan tidak ada provider untuk dana transaksi.
 */

export type RekberStageAction =
  | "claim_payment"
  | "confirm_payment"
  | "mark_delivered"
  | "begin_inspection"
  | "finish_inspection"
  | "confirm_receipt"
  | "admin_verify"
  | "admin_release";

export const REKBER_STAGES: {
  stage: number;
  title: string;
  note: string;
  actor: "buyer" | "admin" | "seller" | "system";
  action: RekberStageAction | null;
  actionLabel: string;
}[] = [
  {
    stage: 1,
    title: "Buyer kirim dana ke admin",
    note: "Buyer memindai QR bisnis rekber penangan dan menandai sudah kirim. Klaim buyer bukan bukti pembayaran.",
    actor: "buyer",
    action: "claim_payment",
    actionLabel: "Saya sudah kirim dana",
  },
  {
    stage: 2,
    title: "Admin menahan dana",
    note: "Admin memverifikasi penerimaan di aplikasi QRIS/banknya sendiri, lalu mengonfirmasi dana ditahan.",
    actor: "admin",
    action: "confirm_payment",
    actionLabel: "Konfirmasi dana diterima & ditahan",
  },
  {
    stage: 3,
    title: "Seller mengirim data / item",
    note: "Data/item disampaikan lewat pesan chat transaksi ini, sesuai kategori yang dipilih buyer.",
    actor: "seller",
    action: "mark_delivered",
    actionLabel: "Data/item sudah dikirim lewat chat",
  },
  {
    stage: 4,
    title: "Buyer mengecek",
    note: "Buyer memeriksa data/item yang diterima.",
    actor: "buyer",
    action: "begin_inspection",
    actionLabel: "Mulai pemeriksaan",
  },
  {
    stage: 5,
    title: "Pengecekan selesai",
    note: "Buyer menyatakan pengecekan selesai.",
    actor: "buyer",
    action: "finish_inspection",
    actionLabel: "Pengecekan selesai",
  },
  {
    stage: 6,
    title: "Buyer konfirmasi",
    note: "Buyer mengonfirmasi data/item diterima. Menunggu verifikasi admin.",
    actor: "buyer",
    action: "confirm_receipt",
    actionLabel: "Konfirmasi data/item diterima",
  },
  {
    stage: 7,
    title: "Admin mengecek (verifikasi)",
    note: "Admin memverifikasi penyelesaian transaksi.",
    actor: "admin",
    action: "admin_verify",
    actionLabel: "Verifikasi penyelesaian",
  },
  {
    stage: 8,
    title: "Admin kirim dana ke seller",
    note: "Admin mengonfirmasi dana telah dikirim ke seller (transfer manual). Platform tidak memproses transfer otomatis.",
    actor: "admin",
    action: "admin_release",
    actionLabel: "Konfirmasi dana dikirim ke seller",
  },
];

export const REKBER_STATUS_LABELS: Record<string, string> = {
  awaiting_acceptance: "Menunggu persetujuan seller",
  awaiting_payment_provider: "Disetujui — menunggu pembayaran manual",
  provider_payment_confirmed: "Dana ditahan admin",
  item_delivery: "Proses penyerahan",
  buyer_inspection: "Pemeriksaan buyer",
  completed: "Selesai",
  disputed: "Dalam sengketa",
  refund_pending: "Menunggu penyelesaian refund",
  cancelled: "Dibatalkan",
};

/**
 * Tahap dari status kasar — dipakai bila kolom rekber_stage belum ada
 * (migrasi belum dijalankan). Tidak pernah menurunkan tahap 5-7 yang
 * berbagi status buyer_inspection; pemanggil memakai nilai kolom
 * bila tersedia.
 */
export function stageFromStatus(status: string): number {
  switch (status) {
    case "awaiting_payment_provider":
      return 1;
    case "provider_payment_confirmed":
      return 2;
    case "item_delivery":
      return 3;
    case "buyer_inspection":
      return 4;
    case "completed":
      return 8;
    default:
      return 0;
  }
}

/** True bila error PostgREST menandakan fungsi RPC belum ada (migrasi belum dijalankan). */
export function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    (error.message ?? "").includes("Could not find the function") ||
    (error.message ?? "").includes("does not exist")
  );
}

/** Ambil token error yang dilempar RPC (mis. DELIVERY_MESSAGE_REQUIRED) dari pesan PostgREST. */
export function rpcErrorToken(error: { message?: string } | null): string {
  const message = (error?.message ?? "").toUpperCase();
  const tokens = [
    "DELIVERY_MESSAGE_REQUIRED",
    "TRANSACTION_DISPUTED",
    "TRANSACTION_CLOSED",
    "TRANSACTION_NOT_FOUND",
    "INVALID_STAGE",
    "INVALID_ACTION",
    "INVALID_REASON",
    "INVALID_RESOLUTION",
    "INVALID_DECISION",
    "INVALID_STARS",
    "INVALID_COMMENT",
    "NOT_TRANSACTION_BUYER",
    "NOT_TRANSACTION_SELLER",
    "NOT_TRANSACTION_PARTY",
    "NOT_HANDLING_ADMIN",
    "NOT_SUPER_ADMIN",
    "USER_NOT_FOUND",
    "TARGET_NOT_ADMIN",
    "DISPUTE_ALREADY_OPEN",
    "DISPUTE_ALREADY_RESOLVED",
    "TRANSACTION_NOT_COMPLETED",
    "NO_HANDLING_ADMIN",
    "KYC_ALREADY_APPROVED",
    "NOT_PENDING",
    "INVALID_NOTE",
    "NOT_STAFF",
    "CASE_ALREADY_OPEN",
    "CASE_CLOSED",
    "CASE_NOT_FOUND",
    "NOT_CASE_HANDLER",
    "NOT_TRANSACTION_PARTY",
    "INVALID_CATEGORY",
    "INVALID_STATUS",
    "INVALID_TRANSITION",
    "NO_BUSINESS_PROFILE",
    "INVALID_SOCIAL_URL",
    "INVALID_LOCATION",
  ];
  for (const token of tokens) {
    if (message.includes(token)) return token;
  }
  return "";
}
