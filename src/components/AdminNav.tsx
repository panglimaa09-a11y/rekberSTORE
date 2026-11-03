"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import {
  adminHubEntry,
  adminStaffEntries,
  adminSuperEntries,
  type AdminNavEntry,
} from "@/lib/admin-nav";

function isSelected(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Navigasi area admin (/admin/*) — shell SENDIRI, terpisah dari
 * navigasi dashboard user. Pola mobile sama: bar ramping + menu
 * lipat hamburger, menutup otomatis setelah navigasi atau saat
 * tombol Escape ditekan. Daftar tautan berasal dari satu sumber
 * kebenaran di src/lib/admin-nav.ts (dipakai bersama hub /admin).
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

  const groups: { heading: string; links: AdminNavEntry[] }[] = [
    {
      heading: "MENU",
      links: [adminHubEntry, ...adminStaffEntries],
    },
    ...(isSuperAdmin
      ? [{ heading: "SUPER ADMIN", links: adminSuperEntries }]
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
                {`${link.icon} ${link.label}`}
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
