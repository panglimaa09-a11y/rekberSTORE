import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = {
  awaiting_acceptance: "Menunggu persetujuan",
  awaiting_payment_provider: "Menunggu proses pembayaran",
  provider_payment_confirmed: "Pembayaran terkonfirmasi",
  item_delivery: "Proses penyerahan",
  buyer_inspection: "Pemeriksaan pembeli",
  completed: "Selesai",
  disputed: "Dalam sengketa",
  refund_pending: "Menunggu penyelesaian refund",
  cancelled: "Dibatalkan"
};

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value || 0);

export default async function Dashboard() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  const { data: transactions, error } = await db
    .from("transactions")
    .select("id,title,amount,status,created_at,buyer_id,seller_id")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const rows = transactions ?? [];
  const pending = rows.filter(x =>
    ["awaiting_acceptance", "awaiting_payment_provider"].includes(x.status)
  ).length;
  const running = rows.filter(x =>
    ["provider_payment_confirmed", "item_delivery", "buyer_inspection", "refund_pending"].includes(x.status)
  ).length;
  const completed = rows.filter(x => x.status === "completed").length;
  const disputed = rows.filter(x => x.status === "disputed").length;

  return (
    <section className="dashmain">
        <header>
          <div>
            <small className="eyebrow">SECURE TRANSACTION WORKSPACE</small>
            <h1>Dashboard Rekber</h1>
            <p>Kelola kesepakatan, pantau transaksi, dan jaga komunikasi tetap terstruktur.</p>
          </div>
          <Link className="btn" href="/dashboard/transactions">Lihat transaksi</Link>
        </header>

        <section className="metrics">
          <article className="metric">
            <span>Menunggu proses</span>
            <b>{pending}</b>
            <small>Perlu tindak lanjut</small>
          </article>
          <article className="metric">
            <span>Sedang berjalan</span>
            <b>{running}</b>
            <small>Dalam alur transaksi</small>
          </article>
          <article className="metric">
            <span>Transaksi selesai</span>
            <b>{completed}</b>
            <small>Berhasil diselesaikan</small>
          </article>
          <article className="metric">
            <span>Dalam sengketa</span>
            <b>{disputed}</b>
            <small>Perlu peninjauan</small>
          </article>
        </section>

        <section className="panel">
          <div className="rekber-panel-heading">
            <div>
              <h2>Aktivitas transaksi terbaru</h2>
              <p>Transaksi yang melibatkan akun {user.email ?? "Anda"}.</p>
            </div>
            <Link href="/dashboard/transactions">Lihat semua</Link>
          </div>

          {error && (
            <div className="notice">
              <div>
                <b>Data transaksi belum dapat dibaca</b>
                <p>Periksa koneksi Supabase dan kebijakan Row Level Security pada tabel transactions.</p>
              </div>
            </div>
          )}

          {!error && rows.length === 0 && (
            <div className="empty">
              <h3>Belum ada transaksi</h3>
              <p>Transaksi yang melibatkan Anda akan muncul di ruang kerja ini.</p>
              <Link className="btn" href="/dashboard/transactions">Buka transaksi saya</Link>
            </div>
          )}

          {rows.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Transaksi</th>
                    <th>Nilai</th>
                    <th>Status</th>
                    <th>Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 6).map(item => (
                    <tr key={item.id}>
                      <td>
                        <b>
                          <Link href={"/dashboard/transactions/" + item.id}>
                            {item.title}
                          </Link>
                        </b>
                        <small>{item.buyer_id === user.id ? "Sebagai pembeli" : "Sebagai penjual"}</small>
                      </td>
                      <td>{money(item.amount)}</td>
                      <td><span className="rekber-status">{statusLabels[item.status] ?? item.status}</span></td>
                      <td>{new Date(item.created_at).toLocaleDateString("id-ID")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Akses cepat</h2>
          <div className="rekber-quick-links">
            <Link href="/dashboard/transactions"><b>⇄</b><span>Transaksi Saya<small>Pantau status dan kesepakatan</small></span></Link>
            <Link href="/dashboard/browse"><b>⌕</b><span>Marketplace<small>Jelajahi penawaran digital yang sah</small></span></Link>
            <Link href="/dashboard/sell"><b>＋</b><span>Pasang Penawaran<small>Publikasikan aset yang boleh dialihkan</small></span></Link>
          </div>
        </section>

        <div className="notice">
          <div>
            <b>Informasi keamanan transaksi</b>
            <p>Periksa detail kesepakatan dan identitas pihak terkait. Pemrosesan pembayaran serta penampungan dana belum diaktifkan.</p>
          </div>
        </div>
      </section>
  );
}