import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { adminHubGroups, type AdminQueueKey } from "@/lib/admin-nav";
import {
  loadAdminQueueCounts,
  type AdminQueueCounts,
} from "@/lib/admin-view";
import { loadAdminSocialUrls, loadAdminLocations } from "@/lib/admin-review";
import { isSocialProfileComplete } from "@/lib/social-urls";
import { isLocationComplete } from "@/lib/admin-location";

const queueField: Record<AdminQueueKey, keyof AdminQueueCounts> = {
  disputes: "disputes_waiting",
  cases: "cases_open",
  userKyc: "user_kyc_pending",
  qr: "pending_qr",
};

/**
 * Hub panel admin: kartu langsung ke halaman tiap fungsi. Kartu
 * antrean membawa badge angka NYATA dari RPC
 * get_rekber_admin_queue_counts (migrasi 20261102080007); bila
 * migrasi belum dijalankan, badge menampilkan "—", bukan angka
 * karangan. Tanpa tabel metrik — tiap fungsi punya halamannya
 * sendiri. Kartu super-admin hanya tampil untuk super-admin.
 * Jalan kembali ke dashboard: tombol header di bawah dan tautan
 * "Kembali ke menu" di header ramping.
 */
export default async function AdminHub() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  const groups = adminHubGroups;

  const counts = await loadAdminQueueCounts(db, roles.isSuperAdmin);

  // Pengingat URL sosmed untuk staf yang belum lengkap: penugasan
  // otomatis transaksi ditahan sampai minimal satu URL valid terisi.
  // Gagal baca = tidak ada pengingat (penegakan akhir di database).
  const socialMap = roles.isStaff
    ? await loadAdminSocialUrls(db, [user.id])
    : null;
  const socialComplete =
    socialMap !== null &&
    isSocialProfileComplete(socialMap.get(user.id));

  // Pengingat lokasi untuk staf yang belum lengkap: lokasi wajib
  // diisi di Profil Bisnis agar tampil di pencari admin. Tanpa
  // pemblokiran penugasan (tidak pernah diputuskan untuk lokasi).
  // Gagal baca = tidak ada pengingat lokasi.
  const locationMap = roles.isStaff
    ? await loadAdminLocations(db, [user.id])
    : null;
  const locationComplete =
    locationMap !== null && isLocationComplete(locationMap.get(user.id));

  const showReminder =
    roles.isStaff &&
    ((socialMap !== null && !socialComplete) ||
      (locationMap !== null && !locationComplete));

  return (
    <section className="dashmain admin-hub">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN</small>
          <h1>Panel Admin</h1>
          <p>
            Admin di sini adalah rekber terpilih yang memakai layanan
            website — bukan staf platform. Masuk sebagai{" "}
            {user.email ?? "Anda"}.
          </p>
        </div>
        <Link className="btn secondary" href="/dashboard">
          Kembali ke dashboard
        </Link>
      </header>

      {showReminder && (
        <div className="notice rekber-message">
          <p>
            {socialMap !== null && !socialComplete && (
              <>
                Lengkapi URL sosmed asli Anda di{" "}
                <Link href="/admin/profil-bisnis">Profil Bisnis</Link>{" "}
                — penugasan otomatis transaksi ditahan sampai minimal
                satu URL valid terisi.{" "}
              </>
            )}
            {locationMap !== null && !locationComplete && (
              <>
                Lengkapi juga lokasi (provinsi dan kel/kecamatan) Anda
                di <Link href="/admin/profil-bisnis">Profil Bisnis</Link>{" "}
                agar tampil di pencari admin.
              </>
            )}
          </p>
        </div>
      )}
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
