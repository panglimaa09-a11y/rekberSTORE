/**
 * Satu sumber kebenaran label + ikon navigasi panel admin.
 * Dipakai AdminNav (client) dan hub /admin (server) agar daftar
 * tidak diduplikasi di dua tempat. Modul murni tanpa import
 * server/client: boleh diimpor komponen mana pun.
 *
 * Glyph dipilih BERBEDA untuk tiap item dan umum dirender font
 * (tanpa emoji — scanner melarang ikon emoji). Lockup brand di bar
 * navigasi memakai gambar logo horizontal RekberSTORE, bukan glyph.
 */

export type AdminQueueKey =
  | "disputes"
  | "cases"
  | "userKyc"
  | "topup"
  | "qr";

export type AdminNavEntry = {
  href: string;
  icon: string;
  label: string;
  desc: string;
  queueKey?: AdminQueueKey;
};

export type AdminNavGroup = {
  heading: string;
  entries: AdminNavEntry[];
};

export const adminHubGroups: AdminNavGroup[] = [
  {
    heading: "PENANGANAN",
    entries: [
      {
        href: "/admin/sengketa",
        icon: "◎",
        label: "Sengketa",
        desc: "Putusan sengketa menunggu",
        queueKey: "disputes",
      },
      {
        href: "/admin/pengawasan",
        icon: "⌕",
        label: "Pengawasan",
        desc: "Seluruh transaksi tercatat",
      },
      {
        href: "/admin/kasus",
        icon: "▨",
        label: "Kasus Eskalasi",
        desc: "Laporan ke tim penindakan",
        queueKey: "cases",
      },
    ],
  },
  {
    heading: "OPERASIONAL",
    entries: [
      {
        href: "/admin/moderasi",
        icon: "▤",
        label: "Moderasi Listing",
        desc: "Jeda atau aktifkan listing",
      },
      {
        href: "/admin/topup",
        icon: "◆",
        label: "Pesanan Top Up",
        desc: "Daftar pesanan, read-only",
        queueKey: "topup",
      },
      {
        href: "/admin/audit",
        icon: "▣",
        label: "Log Audit",
        desc: "Akses berkas dan bundel bukti",
      },
    ],
  },
  {
    heading: "VERIFIKASI",
    entries: [
      {
        href: "/admin/kyc-pengguna",
        icon: "◍",
        label: "KYC Pengguna",
        desc: "Tinjau KYC buyer dan seller",
        queueKey: "userKyc",
      },
      {
        href: "/admin/profil-bisnis",
        icon: "◉",
        label: "Profil Bisnis",
        desc: "QR bisnis dan URL sosmed Anda",
      },
    ],
  },
  {
    heading: "SUPER ADMIN",
    entries: [
      {
        href: "/admin/daftar-admin",
        icon: "＋",
        label: "Daftarkan Admin",
        desc: "Rekber terpilih oleh Tuan",
      },
      {
        href: "/admin/tinjauan-qr",
        icon: "▦",
        label: "Tinjauan QR",
        desc: "Setujui QR bisnis admin",
        queueKey: "qr",
      },
    ],
  },
];

/** Entri staf (semua grup kecuali SUPER ADMIN), urutan hub. */
export const adminStaffEntries: AdminNavEntry[] = adminHubGroups
  .slice(0, 3)
  .flatMap((group) => group.entries);

/** Entri khusus super-admin. */
export const adminSuperEntries: AdminNavEntry[] =
  adminHubGroups[3].entries;

/** Entri tautan hub /admin (kartu utama, tanpa tautan ke dirinya). */
export const adminHubEntry: AdminNavEntry = {
  href: "/admin",
  icon: "⌂",
  label: "Panel Admin",
  desc: "Halaman utama panel admin",
};
