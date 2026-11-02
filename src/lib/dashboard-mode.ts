/**
 * Mode peran dashboard — modul murni tanpa "use client" agar dapat
 * dipakai dari Server Component (page.tsx) maupun Client Component
 * (ModeSwitcher, nav). Sebelumnya parseMode tinggal di file client
 * ModeSwitcher sehingga Server Component yang memanggilnya membuat
 * render /dashboard dan /dashboard/transactions gagal total.
 */
export type DashboardMode = "all" | "buyer" | "seller";

/**
 * Mode peran dibaca dari search param ?mode= agar dapat dibagikan
 * lewat URL dan dirender di server — tanpa state client yang rapuh.
 * Nilai di luar buyer/seller dianggap "all".
 */
export function parseMode(
  value: string | string[] | undefined | null
): DashboardMode {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === "buyer" || first === "seller") return first;
  return "all";
}
