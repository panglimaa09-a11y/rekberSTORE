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

const ownerGroups: { heading: string; links: HubLink[] }[] = [
  {
    heading: "RINGKASAN",
    links: [
      {
        href: "/pemilik/ringkasan",
        icon: "◈",
        label: "Ringkasan",
        desc: "Angka platform dari data nyata",
      },
    ],
  },
  {
    heading: "KEUANGAN",
    links: [
      {
        href: "/pemilik/keuangan",
        icon: "▤",
        label: "Keuangan",
        desc: "Pesanan top up, read-only",
      },
    ],
  },
  {
    heading: "KELOLA",
    links: [
      {
        href: "/pemilik/kelola-admin",
        icon: "＋",
        label: "Kelola Admin",
        desc: "Daftarkan admin dan tinjau QR",
      },
    ],
  },
  {
    heading: "PENGATURAN",
    links: [
      {
        href: "/pemilik/pengaturan",
        icon: "▣",
        label: "Pengaturan",
        desc: "Status harga, daftar game, background",
      },
    ],
  },
];

/**
 * Hub panel pemilik: kartu langsung ke halaman tiap fungsi. Tanpa
 * metrik, tabel, atau stacked section — tiap fungsi punya
 * halamannya sendiri. Hanya untuk super_admin (guard di layout).
 */
export default async function OwnerHub() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isSuperAdmin) redirect("/dashboard");

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow eyebrow-owner">PANEL PEMILIK</small>
          <h1>Panel Pemilik</h1>
          <p>
            Panel khusus pemilik platform. Masuk sebagai{" "}
            {user.email ?? "Anda"}.
          </p>
        </div>
        <Link className="btn secondary" href="/dashboard">
          Kembali ke dashboard
        </Link>
      </header>

      {ownerGroups.map((group) => (
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
