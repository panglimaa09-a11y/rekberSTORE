"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import ModeSwitcher from "@/components/ModeSwitcher";
import { parseMode, type DashboardMode } from "@/lib/dashboard-mode";

type NavLink = {
  href: string;
  label: string;
  /** Mode yang menampilkan tautan ini; tanpa nilai berarti semua mode. */
  modes?: Exclude<DashboardMode, "all">[];
};

const groups: {
  heading: string;
  links: NavLink[];
}[] = [
  {
    heading: "WORKSPACE",
    links: [
      { href: "/dashboard", label: "▦ Dashboard" },
      { href: "/dashboard/transactions", label: "⇄ Transaksi Saya" },
      { href: "/dashboard/topup", label: "◈ Top Up Token" },
    ],
  },
  {
    heading: "LAYANAN",
    links: [
      { href: "/dashboard/browse", label: "⌕ Marketplace", modes: ["buyer"] },
      { href: "/dashboard/pesan", label: "Pesan" },
      { href: "/dashboard/sell", label: "＋ Pasang Penawaran", modes: ["seller"] },
      { href: "/dashboard/my-listings", label: "▤ Penawaran Saya", modes: ["seller"] },
      { href: "/leaderboard", label: "★ Papan Peringkat Rekber" },
    ],
  },
  {
    heading: "AKUN",
    links: [
      { href: "/dashboard/profile", label: "◉ Profil Saya" },
      { href: "/dashboard/kyc", label: "◍ KYC Saya" },
      { href: "/dashboard/security", label: "▣ Keamanan 2FA" },
      { href: "/", label: "Pusat Informasi" },
    ],
  },
];

function isSelected(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Isi sidebar dashboard: bar atas (brand + tombol hamburger) dan
 * menu lipat berisi pemilih mode, seluruh tautan, + form keluar.
 *
 * Desktop: menu selalu terlihat dan tombol hamburger tersembunyi
 * (diatur CSS) — tampilannya sama seperti sidebar penuh semula.
 * Mobile (<=600px): hanya bar ramping yang terlihat; menu
 * tersembunyi sampai hamburger ditekan, lalu tertutup otomatis
 * setelah navigasi atau saat tombol Escape ditekan.
 *
 * Mode menyaring tautan LAYANAN saja; WORKSPACE dan AKUN dipakai
 * kedua peran. Route yang tidak ditampilkan tetap dapat dibuka
 * langsung lewat URL.
 */
export default function DashboardNav({
  logoutForm,
  isStaff,
  notificationCount,
}: {
  logoutForm: ReactNode;
  isStaff: boolean;
  notificationCount: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = parseMode(searchParams.get("mode"));
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const withMode = (href: string) => {
    if (mode === "all" || !href.startsWith("/dashboard")) return href;
    return `${href}?mode=${mode}`;
  };

  const visibleGroups = isStaff
    ? [
        ...groups,
        {
          heading: "ADMIN",
          links: [
            { href: "/admin", label: "▨ Panel Admin" },
            { href: "/admin/profil-bisnis", label: "▣ Profil Bisnis" },
          ],
        },
      ]
    : groups;

  return (
    <>
      <div className="side-bar">
        <Link className="brand" href="/" onClick={close}>
          ◈ Rekber<span>STORE</span>
        </Link>
        <button
          type="button"
          className="side-toggle"
          aria-expanded={open}
          aria-controls="dash-menu"
          aria-label={open ? "Tutup menu navigasi" : "Buka menu navigasi"}
          onClick={() => setOpen(!open)}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>
      <div
        id="dash-menu"
        className="side-menu"
        data-open={open}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <div onClick={close}>
          <ModeSwitcher />
        </div>
        <Link
          href="/dashboard/notifications"
          onClick={close}
          className={
            "notif-bell" + (pathname.startsWith("/dashboard/notifications") ? " selected" : "")
          }
        >
          Notifikasi
          {notificationCount > 0 && (
            <b className="notif-count">{notificationCount}</b>
          )}
        </Link>
        {visibleGroups.map((group) => {
          const links = group.links.filter(
            (link) =>
              !link.modes ||
              mode === "all" ||
              link.modes.includes(mode)
          );
          if (links.length === 0) return null;
          return (
            <Fragment key={group.heading}>
              <small>{group.heading}</small>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={withMode(link.href)}
                  onClick={close}
                  className={
                    isSelected(pathname, link.href) ? "selected" : undefined
                  }
                >
                  {link.label}
                </Link>
              ))}
            </Fragment>
          );
        })}
        {logoutForm}
      </div>
    </>
  );
}
