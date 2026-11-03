"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";

type NavLink = { href: string; label: string };

const ownerLinks: NavLink[] = [
  { href: "/pemilik", label: "▨ Panel Pemilik" },
  { href: "/pemilik/ringkasan", label: "◈ Ringkasan" },
  { href: "/pemilik/keuangan", label: "▤ Keuangan" },
  { href: "/pemilik/kelola-admin", label: "＋ Kelola Admin" },
  { href: "/pemilik/pengaturan", label: "▣ Pengaturan" },
  { href: "/dashboard", label: "◉ Kembali ke Dashboard" },
];

function isSelected(pathname: string, href: string) {
  if (href === "/pemilik") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Navigasi panel pemilik (/pemilik/*) — shell SENDIRI, terpisah dari
 * navigasi dashboard user dan panel admin. Hanya tautan pemilik;
 * TIDAK ada tautan ke rute /admin. Pola mobile sama: bar ramping +
 * menu lipat hamburger, menutup otomatis setelah navigasi atau saat
 * tombol Escape ditekan.
 */
export default function OwnerNav({
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
        <Link className="brand" href="/pemilik" onClick={close} aria-label="RekberStore — Panel Pemilik">
          <Image
            className="brand-logo-horizontal"
            src="/brand/rekberstore-logo-horizontal.png"
            alt="RekberStore"
            width="2048"
            height="682"
          />
        </Link>
        <button
          type="button"
          className="side-toggle"
          aria-expanded={open}
          aria-controls="owner-menu"
          aria-label={open ? "Tutup menu navigasi" : "Buka menu navigasi"}
          onClick={() => setOpen(!open)}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>
      <div
        id="owner-menu"
        className="side-menu"
        data-open={open}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <Fragment>
          <small>PANEL PEMILIK</small>
          {ownerLinks.map((link) => (
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
        {logoutForm}
      </div>
    </>
  );
}
