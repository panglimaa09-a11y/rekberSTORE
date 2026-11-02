"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";

const groups: {
  heading: string;
  links: { href: string; label: string }[];
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
      { href: "/dashboard/browse", label: "⌕ Marketplace" },
      { href: "/dashboard/sell", label: "＋ Pasang Penawaran" },
      { href: "/dashboard/my-listings", label: "▤ Penawaran Saya" },
    ],
  },
  {
    heading: "AKUN",
    links: [
      { href: "/dashboard/profile", label: "◉ Profil Saya" },
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
 * menu lipat berisi seluruh tautan + form keluar.
 *
 * Desktop: menu selalu terlihat dan tombol hamburger tersembunyi
 * (diatur CSS) — tampilannya sama seperti sidebar penuh semula.
 * Mobile (<=600px): hanya bar ramping yang terlihat; menu
 * tersembunyi sampai hamburger ditekan, lalu tertutup otomatis
 * setelah navigasi atau saat tombol Escape ditekan.
 */
export default function DashboardNav({
  logoutForm,
}: {
  logoutForm: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

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
        {groups.map((group) => (
          <Fragment key={group.heading}>
            <small>{group.heading}</small>
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className={
                  isSelected(pathname, link.href) ? "selected" : undefined
                }
              >
                {link.label}
              </Link>
            ))}
          </Fragment>
        ))}
        {logoutForm}
      </div>
    </>
  );
}
