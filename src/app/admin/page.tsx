import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";

type HubLink = {
  href: string;
  icon: string;
  label: string;
  desc: string;
};

const staffGroups: { heading: string; links: HubLink[] }[] = [
  {
    heading: "PENANGANAN",
    links: [
      {
        href: "/admin/sengketa",
        icon: "◎",
        label: "Sengketa",
        desc: "Putusan sengketa menunggu",
      },
      {
        href: "/admin/pengawasan",
        icon: "⌕",
        label: "Pengawasan",
        desc: "Seluruh transaksi tercatat",
      },
      {
        href: "/admin/kasus",
        icon: "▨",
        label: "Kasus Eskalasi",
        desc: "Laporan ke tim penindakan",
      },
    ],
  },
  {
    heading: "OPERASIONAL",
    links: [
      {
        href: "/admin/moderasi",
        icon: "▤",
        label: "Moderasi Listing",
        desc: "Jeda atau aktifkan listing",
      },
      {
        href: "/admin/topup",
        icon: "◈",
        label: "Pesanan Top Up",
        desc: "Daftar pesanan, read-only",
      },
      {
        href: "/admin/audit",
        icon: "▣",
        label: "Log Audit",
        desc: "Akses berkas dan bundel bukti",
      },
    ],
  },
  {
    heading: "VERIFIKASI",
    links: [
      {
        href: "/admin/kyc-pengguna",
        icon: "◍",
        label: "KYC Pengguna",
        desc: "Tinjau KYC buyer dan seller",
      },
      {
        href: "/admin/profil-bisnis",
        icon: "◉",
        label: "Profil Bisnis",
        desc: "QR bisnis dan dokumen Anda",
      },
    ],
  },
];

const superAdminGroups: { heading: string; links: HubLink[] }[] = [
  {
    heading: "SUPER ADMIN",
    links: [
      {
        href: "/admin/daftar-admin",
        icon: "＋",
        label: "Daftarkan Admin",
        desc: "Rekber terpilih oleh Tuan",
      },
      {
        href: "/admin/tinjauan-qr",
        icon: "▦",
        label: "Tinjauan QR",
        desc: "Setujui QR bisnis admin",
      },
      {
        href: "/admin/tinjauan-kyc",
        icon: "◐",
        label: "Tinjauan KYC",
        desc: "Setujui KYC admin",
      },
    ],
  },
];

/**
 * Hub panel admin: kartu langsung ke halaman tiap fungsi. Tanpa
 * metrik, tabel, atau empty-state — tiap fungsi punya halamannya
 * sendiri. Kartu super-admin hanya tampil untuk super-admin.
 */
export default async function AdminHub() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  const groups = roles.isSuperAdmin
    ? [...staffGroups, ...superAdminGroups]
    : staffGroups;

  return (
    <section className="dashmain">
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

      {groups.map((group) => (
        <section key={group.heading} className="hub-group">
          <small>{group.heading}</small>
          <div className="rekber-quick-links">
            {group.links.map((link) => (
              <Link key={link.href} href={link.href}>
                <b>{link.icon}</b>
                <span>
                  {link.label}
                  <small>{link.desc}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
