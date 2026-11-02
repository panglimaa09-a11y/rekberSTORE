"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { parseMode, type DashboardMode } from "@/lib/dashboard-mode";

const modes: { value: DashboardMode; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
];

/**
 * Pemilih mode "Semua | Buyer | Seller". Satu akun tetap memegang
 * kedua peran; mode hanya menyaring tampilan (nav, metrik, daftar).
 * Semua route tetap dapat dibuka langsung lewat URL.
 */
export default function ModeSwitcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = parseMode(searchParams.get("mode"));

  return (
    <nav className="mode-switch" aria-label="Mode peran dashboard">
      <span className="mode-switch-label">Mode</span>
      {modes.map((mode) => {
        const params = new URLSearchParams(searchParams.toString());
        if (mode.value === "all") {
          params.delete("mode");
        } else {
          params.set("mode", mode.value);
        }
        const query = params.toString();
        const href = query ? `${pathname}?${query}` : pathname;
        const active = current === mode.value;
        return (
          <Link
            key={mode.value}
            href={href}
            aria-current={active ? "page" : undefined}
            className={active ? "mode-active" : undefined}
          >
            {mode.label}
          </Link>
        );
      })}
    </nav>
  );
}
