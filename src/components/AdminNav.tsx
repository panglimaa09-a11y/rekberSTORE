"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";

type NavLink = { href: string; label: string };

const staffLinks: NavLink[] = [
  { href: "/admin", label: "▨ Panel Admin" },
  { href: "/admin/sengketa", label: "◎ Sengketa" },
  { href: "/admin/pengawasan", label: "⌕ Pengawasan" },
  { href: "/admin/moderasi", label: "▤ Moderasi Listing" },
  { href: "/admin/topup", label: "◈ Pesanan Top Up" },
  { href: "/admin/kyc-pengguna", label: "◍ KYC Pengguna" },
  { href: "/admin/kasus", label: "▨ Kasus Eskalasi" },
  { href: "/admin/audit", label: "▣ Log Audit" },
  { href: "/admin/profil-bisnis", label: "◉ Profil Bisnis" },
];

const superAdminLinks: NavLink[] = [
  { href: "/admin/daftar-admin", label: "＋ Daftarkan Admin" },
  { href: "/admin/tinjauan-qr", label: "▦ Tinjauan QR" },
  { href: "/admin/tinjauan-kyc", label: "◐ Tinjauan KYC" },
];

function isSelected(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Navigasi area admin (/admin/*) — shell SENDIRI, terpisah dari
 * navigasi dashboard user. Pola mobile sama: bar ramping + menu
 * lipat hamburger, menutup otomatis setelah navigasi atau saat
 * tombol Escape ditekan.
 */
export default function AdminNav({
  logoutForm,
  isSuperAdmin,
}: {
  logoutForm: ReactNode;
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const groups: { heading: string; links: NavLink[] }[] = [
    { heading: "PANEL ADMIN", links: staffLinks },
    ...(isSuperAdmin
      ? [{ heading: "SUPER ADMIN", links: superAdminLinks }]
      : []),
  ];

  return (
    <>
      <div className="side-bar">
        <Link className="brand" href="/admin" onClick={close}>
          ◈ Rekber<span>STORE</span>
        </Link>
        <button
          type="button"
          className="side-toggle"
          aria-expanded={open}
          aria-controls="admin-menu"
          aria-label={open ? "Tutup menu navigasi" : "Buka menu navigasi"}
          onClick={() => setOpen(!open)}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>
      <div
        id="admin-menu"
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
        <Link href="/dashboard" onClick={close}>
          Kembali ke dashboard
        </Link>
        {logoutForm}
      </div>
    </>
  );
}
