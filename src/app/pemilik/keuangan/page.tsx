import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import { money } from "@/lib/admin-view";
import { isMissingRpcError } from "@/lib/rekber-stages";
import { isPakasirConfigured } from "@/lib/pakasir";

const orderLabels: Record<string, string> = {
  pending: "Menunggu pembayaran",
  paid: "Lunas",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
};

/**
 * Keuangan pemilik (SUPER-ADMIN SAJA, READ-ONLY). Daftar pesanan
 * top up memakai RPC list_rekber_topup_orders_admin yang sudah ada
 * (maks. 100 terbaru); total dihitung HANYA dari pesanan yang
 * tampil dan diberi keterangan itu — tidak ada logika uang baru
 * dan tidak ada gateway di halaman ini.
 */
export default async function OwnerFinance() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isSuperAdmin) return <AdminDenied />;

  const pakasirConfigured = isPakasirConfigured();

  let topupOrders: {
    id: string;
    user_id: string;
    user_email: string | null;
    package_tokens: number;
    amount_idr: number;
    status: string;
    provider: string | null;
    provider_reference: string | null;
    created_at: string;
    paid_at: string | null;
  }[] = [];
  let topupUnavailable = false;
  try {
    const { data, error } = await db.rpc("list_rekber_topup_orders_admin");
    if (error) throw error;
    topupOrders = data ?? [];
  } catch (error) {
    topupUnavailable = isMissingRpcError(
      error as { code?: string; message?: string }
    );
  }

  const paidOrders = topupOrders.filter((order) => order.status === "paid");
  const paidTotal = paidOrders.reduce(
    (sum, order) => sum + (order.amount_idr || 0),
    0
  );

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL PEMILIK · READ-ONLY</small>
          <h1>Keuangan</h1>
          <p>
            Pesanan top up token. Halaman ini hanya menampilkan; tidak
            mengubah pesanan apa pun.
          </p>
        </div>
        <Link className="btn secondary" href="/pemilik">
          Kembali ke panel pemilik
        </Link>
      </header>

      <div className="notice">
        <div>
          <b>
            Gateway Pakasir:{" "}
            {pakasirConfigured ? "terkonfigurasi" : "belum dikonfigurasi"}
          </b>
          <p>
            Top up token hanya lewat Pakasir. Dana transaksi tidak
            lewat provider — dibayar manual lewat QR bisnis rekber
            penangan dan tidak tampil di halaman ini.
          </p>
        </div>
      </div>

      {topupUnavailable && (
        <p className="token-muted">
          Daftar pesanan belum aktif — migrasi database belum dijalankan.
        </p>
      )}

      {!topupUnavailable && topupOrders.length === 0 && (
        <div className="empty">
          <h3>Belum ada pesanan top up</h3>
        </div>
      )}

      {topupOrders.length > 0 && (
        <>
          <div className="metrics">
            <div className="metric">
              <span>Pesanan lunas (yang tampil)</span>
              <b>{paidOrders.length}</b>
              <small>Dari maks. 100 pesanan terbaru</small>
            </div>
            <div className="metric">
              <span>Total lunas (yang tampil)</span>
              <b>{money(paidTotal)}</b>
              <small>Hanya dari pesanan yang tampil</small>
            </div>
            <div className="metric">
              <span>Pesanan menunggu</span>
              <b>
                {
                  topupOrders.filter((order) => order.status === "pending")
                    .length
                }
              </b>
              <small>Dari maks. 100 pesanan terbaru</small>
            </div>
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Pengguna</th>
                  <th>Paket</th>
                  <th>Harga</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {topupOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.user_email ?? "—"}</b>
                      <small>{order.id}</small>
                    </td>
                    <td>{order.package_tokens} Token</td>
                    <td>{money(order.amount_idr)}</td>
                    <td>
                      <span className="rekber-status">
                        {orderLabels[order.status] ?? order.status}
                      </span>
                    </td>
                    <td>{order.provider ?? "—"}</td>
                    <td>
                      {new Date(order.created_at).toLocaleDateString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
