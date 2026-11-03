/**
 * Satu sumber kebenaran label + ikon kartu hub panel admin.
 * Dipakai hub /admin (server) agar daftar tidak diduplikasi.
 * Modul murni tanpa import server/client: boleh diimpor komponen
 * mana pun.
 *
 * Glyph dipilih BERBEDA untuk tiap item dan umum dirender font
 * (tanpa emoji — scanner melarang ikon emoji). Lockup brand di
 * header ramping memakai gambar logo horizontal RekberSTORE,
 * bukan glyph.
 */

export type AdminQueueKey =
  | "disputes"
  | "cases"
  | "userKyc"
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
];
