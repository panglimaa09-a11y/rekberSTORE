import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import ModeSwitcher from "@/components/ModeSwitcher";
import { parseMode, type DashboardMode } from "@/lib/dashboard-mode";

type HubLink = {
  href: string;
  icon: string;
  label: string;
  desc: string;
  /** Mode yang menampilkan kartu ini; tanpa nilai berarti semua mode. */
  modes?: Exclude<DashboardMode, "all">[];
  /** Sembunyikan untuk staf (admin/super_admin) — mis. KYC pengguna. */
  hideForStaff?: boolean;
};

const groups: { heading: string; links: HubLink[] }[] = [
  {
    heading: "WORKSPACE",
    links: [
      {
        href: "/dashboard/transactions",
        icon: "⇄",
        label: "Transaksi Saya",
        desc: "Pantau status dan kesepakatan",
      },
      {
        href: "/dashboard/topup",
        icon: "◈",
        label: "Top Up Token",
        desc: "Isi token biaya layanan website",
      },
    ],
  },
  {
    heading: "LAYANAN",
    links: [
      {
        href: "/dashboard/browse",
        icon: "⌕",
        label: "Marketplace",
        desc: "Jelajahi penawaran digital yang sah",
        modes: ["buyer"],
      },
      {
        href: "/dashboard/pesan",
        icon: "◎",
        label: "Pesan",
        desc: "Chat transaksi dengan buyer, seller, dan penangan",
      },
      {
        href: "/dashboard/cari-admin",
        icon: "⌖",
        label: "Cari Admin Terdekat",
        desc: "Admin berdasarkan provinsi dan kel/kecamatan",
      },
      {
        href: "/dashboard/sell",
        icon: "＋",
        label: "Pasang Penawaran",
        desc: "Publikasikan aset yang boleh dialihkan",
        modes: ["seller"],
      },
      {
        href: "/dashboard/my-listings",
        icon: "▤",
        label: "Penawaran Saya",
        desc: "Daftar penawaran yang Anda pasang",
        modes: ["seller"],
      },
      {
        href: "/leaderboard",
        icon: "★",
        label: "Papan Peringkat Rekber",
        desc: "Rating bintang dari buyer dan seller",
      },
    ],
  },
  {
    heading: "AKUN",
    links: [
      {
        href: "/dashboard/notifications",
        icon: "◎",
        label: "Notifikasi",
        desc: "Aktivitas terbaru untuk Anda",
      },
      {
        href: "/dashboard/profile",
        icon: "◉",
        label: "Profil Saya",
        desc: "Nama dan data akun Anda",
      },
      {
        href: "/dashboard/kyc",
        icon: "◍",
        label: "KYC Saya",
        desc: "Verifikasi identitas ke admin",
        hideForStaff: true,
      },
      {
        href: "/dashboard/security",
        icon: "▣",
        label: "Keamanan 2FA",
        desc: "Kunci akun lapis kedua",
      },
      {
        href: "/",
        icon: "◈",
        label: "Pusat Informasi",
        desc: "Aturan dan cara kerja RekberSTORE",
      },
    ],
  },
];

const adminLinks: HubLink[] = [
  {
    href: "/admin",
    icon: "▨",
    label: "Panel Admin",
    desc: "Sengketa, pengawasan, penunjukan admin",
  },
  {
    href: "/admin/profil-bisnis",
    icon: "▣",
    label: "Profil Bisnis",
    desc: "QR bisnis dan URL sosmed admin",
  },
];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const mode = parseMode(params.mode);
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  const visibleGroups = roles.isStaff
    ? [...groups, { heading: "ADMIN", links: adminLinks }]
    : groups;

  const withMode = (href: string) => {
    if (mode === "all" || !href.startsWith("/dashboard")) return href;
    return `${href}?mode=${mode}`;
  };

  const modeNote =
    mode === "buyer"
      ? "Mode Buyer — hanya fitur pembeli."
      : mode === "seller"
        ? "Mode Seller — hanya fitur penjual."
        : "Mode Semua — seluruh fitur.";

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">SECURE TRANSACTION WORKSPACE</small>
          <h1>Dashboard Rekber</h1>
          <p>Masuk sebagai {user.email ?? "Anda"}.</p>
        </div>
      </header>

      <ModeSwitcher />
      <p className="mode-note">{modeNote}</p>

      {visibleGroups.map((group) => {
        const links = group.links.filter(
          (link) =>
            !(roles.isStaff && link.hideForStaff) &&
            (!link.modes || mode === "all" || link.modes.includes(mode))
        );
        if (links.length === 0) return null;
        return (
          <section key={group.heading} className="hub-group">
            <small>{group.heading}</small>
            <div className="rekber-quick-links">
              {links.map((link) => (
                <Link key={link.href} href={withMode(link.href)}>
                  <b>{link.icon}</b>
                  <span>
                    {link.label}
                    <small>{link.desc}</small>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}
