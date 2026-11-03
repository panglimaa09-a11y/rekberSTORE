import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { adminHubGroups, type AdminQueueKey } from "@/lib/admin-nav";
import {
  loadAdminQueueCounts,
  type AdminQueueCounts,
} from "@/lib/admin-view";

const queueField: Record<AdminQueueKey, keyof AdminQueueCounts> = {
  disputes: "disputes_waiting",
  cases: "cases_open",
  userKyc: "user_kyc_pending",
  topup: "topup_pending",
  qr: "pending_qr",
  kyc: "pending_kyc",
};

/**
 * Hub panel admin: kartu langsung ke halaman tiap fungsi. Kartu
 * antrean membawa badge angka NYATA dari RPC
 * get_rekber_admin_queue_counts (migrasi 20261102080007); bila
 * migrasi belum dijalankan, badge menampilkan "—", bukan angka
 * karangan. Tanpa tabel metrik — tiap fungsi punya halamannya
 * sendiri. Kartu super-admin hanya tampil untuk super-admin.
 * Satu-satunya jalan kembali ke dashboard adalah tautan di sidebar
 * (tombol header ganda dihapus).
 */
export default async function AdminHub() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  const groups = roles.isSuperAdmin
    ? adminHubGroups
    : adminHubGroups.slice(0, 3);

  const counts = await loadAdminQueueCounts(db, roles.isSuperAdmin);

  return (
    <section className="dashmain admin-hub">
      <header>
        <div>
          <h1>Panel Admin</h1>
          <p>
            Admin di sini adalah rekber terpilih yang memakai layanan
            website — bukan staf platform. Masuk sebagai{" "}
            {user.email ?? "Anda"}.
          </p>
        </div>
      </header>

      {groups.map((group) => (
        <section key={group.heading} className="hub-group">
          <small>{group.heading}</small>
          <div className="rekber-quick-links">
            {group.entries.map((entry) => (
              <Link key={entry.href} href={entry.href}>
                <b>{entry.icon}</b>
                <span className="hub-label">
                  {entry.label}
                  <small>{entry.desc}</small>
                </span>
                {entry.queueKey && (
                  <span className="hub-count">
                    {counts
                      ? String(counts[queueField[entry.queueKey]])
                      : "—"}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
