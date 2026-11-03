import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import { money } from "@/lib/admin-view";
import { isMissingRpcError } from "@/lib/rekber-stages";

/**
 * Pesanan top up (dipindah dari halaman panel admin lama). Read-only
 * untuk staf.
 */
export default async function AdminTopupOrders() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

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

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN</small>
          <h1>Pesanan top up (read-only)</h1>
          <p>Pesanan isi token biaya layanan website.</p>
        </div>
      </header>

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
                    <span className="rekber-status">{order.status}</span>
                  </td>
                  <td>{order.provider ?? "—"}</td>
                  <td>{new Date(order.created_at).toLocaleDateString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
