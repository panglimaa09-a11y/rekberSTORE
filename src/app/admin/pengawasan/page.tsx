import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import {
  displayNameFor,
  loadDisplayNames,
  money,
  statusLabels,
} from "@/lib/admin-view";
import { isMissingRpcError } from "@/lib/rekber-stages";

/**
 * Pengawasan transaksi (dipindah dari halaman panel admin lama).
 * RPC staf list_rekber_transactions_admin + filter status via
 * ?status=.
 */
export default async function AdminOversight({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

  let oversight: {
    id: string;
    title: string;
    amount: number;
    status: string;
    rekber_stage: number;
    buyer_id: string;
    seller_id: string;
    admin_id: string | null;
    created_at: string;
  }[] = [];
  let oversightUnavailable = false;
  try {
    const { data, error } = await db.rpc("list_rekber_transactions_admin");
    if (error) throw error;
    oversight = data ?? [];
  } catch (error) {
    oversightUnavailable = isMissingRpcError(
      error as { code?: string; message?: string }
    );
  }
  const statusFilter = params.status ?? "all";
  const filteredOversight =
    statusFilter === "all"
      ? oversight
      : oversight.filter((t) => t.status === statusFilter);

  const nameMap = await loadDisplayNames(db, [
    ...oversight.map((t) => t.buyer_id),
    ...oversight.map((t) => t.seller_id),
    ...oversight.map((t) => t.admin_id),
  ]);
  const displayName = (uid: string | null | undefined) =>
    displayNameFor(nameMap, user.id, uid);

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN</small>
          <h1>Pengawasan transaksi</h1>
          <p>Seluruh transaksi yang tercatat di platform.</p>
        </div>
      </header>

      {oversightUnavailable && (
        <p className="token-muted">
          Pengawasan belum aktif — migrasi database belum dijalankan.
        </p>
      )}
      <nav className="filter-row" aria-label="Filter status transaksi">
        {["all", ...Object.keys(statusLabels)].map((value) => (
          <Link
            key={value}
            href={
              value === "all"
                ? "/admin/pengawasan"
                : `/admin/pengawasan?status=${value}`
            }
            className={statusFilter === value ? "filter-active" : undefined}
          >
            {value === "all" ? "Semua" : statusLabels[value]}
          </Link>
        ))}
      </nav>
      {filteredOversight.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Transaksi</th>
                <th>Nilai</th>
                <th>Status</th>
                <th>Tahap</th>
                <th>Admin penangan</th>
                <th>Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {filteredOversight.map((tx) => (
                <tr key={tx.id}>
                  <td>
                    <b>
                      <Link href={`/dashboard/transactions/${tx.id}`}>
                        {tx.title}
                      </Link>
                    </b>
                    <small>
                      {`Buyer: ${displayName(tx.buyer_id)} · Seller: ${displayName(tx.seller_id)}`}
                    </small>
                  </td>
                  <td>{money(tx.amount)}</td>
                  <td>
                    <span className="rekber-status">
                      {statusLabels[tx.status] ?? tx.status}
                    </span>
                  </td>
                  <td>
                    {tx.rekber_stage === 0
                      ? "Pengajuan"
                      : `Tahap ${tx.rekber_stage} dari 8`}
                  </td>
                  <td>{displayName(tx.admin_id)}</td>
                  <td>{new Date(tx.created_at).toLocaleDateString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!oversightUnavailable && filteredOversight.length === 0 && (
        <div className="empty">
          <h3>Tidak ada transaksi pada filter ini</h3>
        </div>
      )}
    </section>
  );
}
