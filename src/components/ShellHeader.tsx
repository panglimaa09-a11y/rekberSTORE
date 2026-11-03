import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Header ramping pengganti sidebar (model "menu saja, tanpa sidebar").
 * Satu-satunya navigasi antar-fitur adalah hub menu; header ini hanya
 * membawa lockup brand, lencana panel (pembeda tegas Panel Admin vs
 * Panel Pemilik), tautan kembali ke hub-nya sendiri, dan form keluar.
 * Komponen server murni — tanpa state, tanpa drawer, tanpa logika
 * hamburger/Escape.
 */
export default function ShellHeader({
  brandHref,
  brandLabel,
  badge,
  menuHref,
  logoutForm,
}: {
  brandHref: string;
  brandLabel: string;
  /** Lencana panel; kosong untuk shell dashboard (bukan panel). */
  badge?: { text: string; tone: "admin" | "owner" };
  menuHref: string;
  logoutForm: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <Link className="brand" href={brandHref} aria-label={brandLabel}>
          <Image
            className="brand-logo-horizontal"
            src="/brand/rekberstore-logo-horizontal.png"
            alt="RekberStore"
            width="2048"
            height="682"
          />
        </Link>
        {badge && (
          <span className={`topbar-badge topbar-badge-${badge.tone}`}>
            {badge.text}
          </span>
        )}
      </div>
      <div className="topbar-actions">
        <Link href={menuHref}>Kembali ke menu</Link>
        {logoutForm}
      </div>
    </header>
  );
}
