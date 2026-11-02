import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import AdminDenied from "@/components/AdminDenied";
import {
  displayNameFor,
  loadDisplayNames,
} from "@/lib/admin-view";

/**
 * Log audit akses (dipindah dari halaman panel admin lama). 30 akses
 * terakhir ke berkas, bundel bukti, dan antrean tinjauan.
 */
export default async function AdminAuditLog() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

  let auditRows: {
    id: number;
    actor_id: string | null;
    transaction_id: string | null;
    action: string;
    details: unknown;
    created_at: string;
  }[] = [];
  try {
    const { data, error } = await db
      .from("audit_logs")
      .select("id,actor_id,transaction_id,action,details,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error) auditRows = (data ?? []) as typeof auditRows;
  } catch {
    auditRows = [];
  }

  const nameMap = await loadDisplayNames(
    db,
    auditRows.map((a) => a.actor_id)
  );
  const displayName = (uid: string | null | undefined) =>
    displayNameFor(nameMap, user.id, uid);

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN</small>
          <h1>Log audit akses</h1>
          <p>
            30 akses terakhir ke berkas, bundel bukti, dan antrean
            tinjauan. Tangkapan layar tidak dapat dicegah sepenuhnya —
            perlindungan adalah kontrol akses + watermark + audit ini +
            jalur hukum.
          </p>
        </div>
        <Link className="btn secondary" href="/admin">
          Kembali ke panel admin
        </Link>
      </header>

      {auditRows.length === 0 && (
        <div className="empty">
          <h3>Belum ada entri audit</h3>
        </div>
      )}
      {auditRows.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Aksi</th>
                <th>Oleh</th>
                <th>Transaksi</th>
                <th>Detail</th>
                <th>Waktu</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.action}</td>
                  <td>{displayName(row.actor_id)}</td>
                  <td>
                    <small>
                      {row.transaction_id
                        ? row.transaction_id.slice(0, 8) + "…"
                        : "—"}
                    </small>
                  </td>
                  <td>
                    <small>
                      {JSON.stringify(row.details ?? {}).slice(0, 120)}
                    </small>
                  </td>
                  <td>
                    {new Date(row.created_at).toLocaleString("id-ID")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
