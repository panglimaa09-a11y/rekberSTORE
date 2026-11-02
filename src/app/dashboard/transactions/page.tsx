import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  respondToTransaction,
  cancelPendingTransaction
} from "@/app/marketplace-actions";
import SubmitButton from "@/components/SubmitButton";

const labels: Record<string, string> = {
  awaiting_acceptance: "Menunggu persetujuan seller",
  awaiting_payment_provider: "Disetujui — menunggu proses berikutnya",
  provider_payment_confirmed: "Pembayaran terkonfirmasi",
  item_delivery: "Proses penyerahan",
  buyer_inspection: "Pemeriksaan buyer",
  completed: "Selesai",
  disputed: "Dalam sengketa",
  refund_pending: "Menunggu penyelesaian refund",
  cancelled: "Dibatalkan"
};

const notices: Record<string, string> = {
  created: "Pengajuan dibuat. Dua token buyer sedang ditahan.",
  accepted: "Seller menyetujui transaksi. Dua token telah dikonfirmasi sebagai biaya jasa Rekber.",
  rejected: "Seller menolak transaksi. Dua token telah dikembalikan.",
  cancelled: "Transaksi dibatalkan. Dua token telah dikembalikan.",
  expired: "Waktu persetujuan berakhir. Dua token telah dikembalikan.",
  action_error: "Tindakan gagal. Periksa status transaksi dan coba lagi.",
  invalid: "Permintaan tidak valid."
};

export default async function Transactions({
  searchParams
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const params = await searchParams;
  const db = await supabaseServer();

  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  // Kedaluwarsa diproses saat halaman dibuka oleh salah satu pihak.
  await db.rpc("expire_my_rekber_holds");

  const { data, error } = await db
    .from("transactions")
    .select("id,title,amount,status,created_at,buyer_id,seller_id")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const money = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(value || 0);

  return (
    <section className="dashmain">
        <header>
          <div>
            <small className="eyebrow">TRANSACTION MANAGEMENT</small>
            <h1>Transaksi Saya</h1>
            <p>Kelola kesepakatan sebagai buyer maupun seller.</p>
          </div>
          <Link className="btn secondary" href="/dashboard">Kembali ke dashboard</Link>
        </header>

        {params.notice && notices[params.notice] && (
          <div className="success rekber-message">{notices[params.notice]}</div>
        )}

        <section className="panel">
          <h2>Riwayat transaksi</h2>

          {error && (
            <div className="notice">
              <div>
                <b>Gagal membaca transaksi</b>
                <p>Periksa koneksi Supabase dan kebijakan Row Level Security.</p>
              </div>
            </div>
          )}

          {!error && (!data || data.length === 0) && (
            <div className="empty">
              <h3>Belum ada transaksi</h3>
              <p>Transaksi yang melibatkan akun Anda akan muncul di sini.</p>
              <Link className="btn" href="/dashboard/browse">Lihat penawaran</Link>
            </div>
          )}

          {data && data.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Transaksi</th>
                    <th>Peran</th>
                    <th>Nilai</th>
                    <th>Status</th>
                    <th>Tanggal</th>
                    <th>Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(item => (
                    <tr key={item.id}>
                      <td>
                        <b>
                          <Link href={"/dashboard/transactions/" + item.id}>
                            {item.title}
                          </Link>
                        </b>
                        <small>ID: {item.id}</small>
                      </td>
                      <td>{item.buyer_id === user.id ? "Buyer" : "Seller"}</td>
                      <td>{money(item.amount)}</td>
                      <td>
                        <span className="rekber-status">
                          {labels[item.status] ?? item.status}
                        </span>
                      </td>
                      <td>{new Date(item.created_at).toLocaleDateString("id-ID")}</td>
                      <td>
                        {item.status === "awaiting_acceptance" &&
                         item.seller_id === user.id && (
                          <div className="rekber-actions">
                            <form action={respondToTransaction}>
                              <input type="hidden" name="transaction_id" value={item.id}/>
                              <SubmitButton className="btn" name="decision" value="accept" pendingLabel="Menyetujui…">
                                Setujui
                              </SubmitButton>
                            </form>
                            <form action={respondToTransaction}>
                              <input type="hidden" name="transaction_id" value={item.id}/>
                              <SubmitButton className="rekber-reject" name="decision" value="reject" pendingLabel="Menolak…">
                                Tolak
                              </SubmitButton>
                            </form>
                          </div>
                        )}

                        {item.status === "awaiting_acceptance" &&
                         item.buyer_id === user.id && (
                          <form action={cancelPendingTransaction}>
                            <input type="hidden" name="transaction_id" value={item.id}/>
                            <SubmitButton className="rekber-reject" pendingLabel="Membatalkan…">
                              Batalkan
                            </SubmitButton>
                          </form>
                        )}

                        {item.status !== "awaiting_acceptance" && (
                          <span className="role">Tidak ada tindakan</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="notice">
          <div>
            <b>Aturan penahanan token</b>
            <p>Buyer menyediakan 2 token. Token ditahan sampai seller menyetujui. Penolakan, pembatalan, atau kedaluwarsa mengembalikan token ke saldo buyer.</p>
          </div>
        </div>
      </section>
  );
}