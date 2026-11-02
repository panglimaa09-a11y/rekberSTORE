"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

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
      { href: "/", label: "Pusat Informasi" },
    ],
  },
];

function isSelected(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Navigasi sidebar. Mengembalikan fragment agar <small> dan <a>
 * tetap menjadi anak langsung <aside className="side"> (CSS yang
 * ada memakai selektor anak langsung .side>small dan .side>a).
 */
export default function DashboardNav() {
  const pathname = usePathname();
  return (
    <>
      {groups.map((group) => (
        <Fragment key={group.heading}>
          <small>{group.heading}</small>
          {group.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isSelected(pathname, link.href) ? "selected" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </Fragment>
      ))}
    </>
  );
}
