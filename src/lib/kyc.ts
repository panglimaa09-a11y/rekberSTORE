import type { SupabaseClient } from "@supabase/supabase-js";

export type KycStatus =
  | "approved"
  | "pending_review"
  | "rejected"
  | "suspended"
  | "not_submitted"
  | "unavailable";

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  approved: "Terverifikasi",
  pending_review: "Menunggu tinjauan admin",
  rejected: "Ditolak — kirim ulang",
  suspended: "Ditangguhkan",
  not_submitted: "Belum dikirim",
  unavailable: "Belum dapat diperiksa",
};

/**
 * Status KYC terbaru pengguna dari user_kyc_submissions. Gagal baca
 * (tabel belum ada karena migrasi belum dijalankan) = "unavailable":
 * pemanggil memutuskan sendiri — gerbang transaksi menutup akses
 * dengan pesan jujur, bukan membiarkan transaksi tanpa verifikasi.
 */
export async function getUserKycStatus(
  db: SupabaseClient,
  userId: string
): Promise<KycStatus> {
  try {
    const { data, error } = await db
      .from("user_kyc_submissions")
      .select("status")
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return error ? "unavailable" : "not_submitted";
    const status = data.status as string;
    if (
      status === "approved" ||
      status === "pending_review" ||
      status === "rejected" ||
      status === "suspended"
    ) {
      return status;
    }
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Kunci error untuk redirect gerbang KYC (dipetakan ke copy di halaman). */
export function kycGateErrorKey(status: KycStatus): string {
  switch (status) {
    case "pending_review":
      return "kyc_pending";
    case "rejected":
      return "kyc_rejected";
    case "suspended":
      return "kyc_suspended";
    case "unavailable":
      return "kyc_unavailable";
    default:
      return "kyc_required";
  }
}

export const KYC_ERROR_COPY: Record<string, string> = {
  kyc_required:
    "KYC wajib sebelum bertransaksi. Kirim KYC Anda ke admin terlebih dahulu.",
  kyc_pending:
    "KYC Anda masih ditinjau admin. Tunggu persetujuan sebelum bertransaksi.",
  kyc_rejected:
    "KYC Anda ditolak. Kirim ulang KYC dengan dokumen yang sesuai.",
  kyc_suspended:
    "KYC Anda ditangguhkan. Hubungi admin untuk penjelasan lebih lanjut.",
  kyc_unavailable:
    "Status KYC belum dapat diperiksa — migrasi database belum dijalankan.",
};
