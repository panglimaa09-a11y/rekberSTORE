import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import { money } from "@/lib/admin-view";
import { isMissingRpcError } from "@/lib/rekber-stages";

type OwnerStats = {
  total_users: number;
  total_admins: number;
  total_transactions: number;
  completed_transactions: number;
  disputed_open: number;
  total_listings: number;
  active_listings: number;
  pending_qr: number;
  pending_kyc: number;
  topup_paid_count: number;
  topup_paid_total_idr: number;
  topup_pending_count: number;
  tokens_in_circulation: number;
  tokens_reserved: number;
};

const metrics: {
  key: keyof OwnerStats;
  label: string;
  format: (value: number) => string;
}[] = [
  { key: "total_users", label: "Pengguna terdaftar", format: String },
  { key: "total_admins", label: "Admin terdaftar", format: String },
  { key: "total_transactions", label: "Total transaksi", format: String },
  { key: "completed_transactions", label: "Transaksi selesai", format: String },
  { key: "disputed_open", label: "Sengketa terbuka", format: String },
  { key: "total_listings", label: "Total penawaran", format: String },
  { key: "active_listings", label: "Penawaran aktif", format: String },
  { key: "pending_qr", label: "Antrean tinjauan QR", format: String },
  { key: "topup_paid_count", label: "Pesanan top up lunas", format: String },
  {
    key: "topup_paid_total_idr",
    label: "Total top up lunas",
    format: (value) => money(value),
  },
  { key: "topup_pending_count", label: "Pesanan top up menunggu", format: String },
  { key: "tokens_in_circulation", label: "Token beredar", format: String },
  { key: "tokens_reserved", label: "Token ditahan", format: String },
];

/**
 * Ringkasan platform (SUPER-ADMIN SAJA). Semua angka berasal dari
 * RPC get_rekber_owner_stats (migrasi 20261102080006) — agregat
 * saja, tanpa data privat. Bila migrasi belum dijalankan, setiap
 * angka menampilkan status jujur "tidak tersedia"; tidak ada angka
 * karangan atau estimasi di halaman ini.
 */
export default async function OwnerSummary() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isSuperAdmin) return <AdminDenied variant="pemilik" />;

  let stats: OwnerStats | null = null;
  let statsUnavailable = false;
  let statsError = false;
  try {
    const { data, error } = await db.rpc("get_rekber_owner_stats");
    if (error) throw error;
    stats = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  } catch (error) {
    statsUnavailable = isMissingRpcError(
      error as { code?: string; message?: string }
    );
    statsError = !statsUnavailable;
  }

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL PEMILIK</small>
          <h1>Ringkasan platform</h1>
          <p>Angka dari data nyata. Tanpa angka karangan.</p>
        </div>
        <Link className="btn secondary" href="/pemilik">
          Kembali ke panel pemilik
        </Link>
      </header>

      {statsUnavailable && (
        <div className="notice">
          <div>
            <b>Ringkasan belum tersedia</b>
            <p>
              Migrasi database 20261102080006_rekber_owner_stats.sql
              belum dijalankan di SQL Editor. Angka tampil setelah
              migrasi dijalankan; tidak ada angka yang ditampilkan
              sebelum itu.
            </p>
          </div>
        </div>
      )}

      {statsError && (
        <div className="notice">
          <div>
            <b>Ringkasan gagal dibaca</b>
            <p>
              Data ringkasan tidak dapat dibaca saat ini. Coba muat
              ulang halaman; angka tetap tidak ditampilkan sampai
              pembacaan berhasil.
            </p>
          </div>
        </div>
      )}

      <div className="metrics">
        {metrics.map((metric) => (
          <div className="metric" key={metric.key}>
            <span>{metric.label}</span>
            <b>
              {stats ? metric.format(Number(stats[metric.key] ?? 0)) : "—"}
            </b>
            <small>
              {stats ? "Data nyata" : "Tidak tersedia"}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
