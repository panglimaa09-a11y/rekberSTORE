import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Batas pengiriman formulir Server Action dinaikkan dari bawaan
    // 1 MB ke 100 MB agar beberapa foto bisa terkirim dalam satu
    // formulir listing. Ini batas teknis framework, BUKAN batas
    // ukuran per foto: kode aplikasi tidak lagi menolak foto
    // berdasarkan MB (perintah Tuan 4 Nov 2026). Batas praktis
    // akhir tetap mengikuti platform hosting/penyimpanan.
    serverActions: { bodySizeLimit: "100mb" },
  },
  async redirects() {
    return [
      // Panel admin pindah dari /dashboard/admin ke area /admin
      // terpisah (refactor 2 Nov 2026). Rute lama dipertahankan
      // sebagai redirect agar bookmark/tautan lama tidak putus.
      // Query string (mis. ?path= & ?ctx= penampil dokumen)
      // diteruskan apa adanya oleh Next.js.
      {
        source: "/dashboard/admin",
        destination: "/admin",
        permanent: false,
      },
      {
        source: "/dashboard/admin/profil-bisnis",
        destination: "/admin/profil-bisnis",
        permanent: false,
      },
      {
        source: "/dashboard/admin/dokumen",
        destination: "/admin/dokumen",
        permanent: false,
      },
      {
        source: "/dashboard/admin/kasus/:id",
        destination: "/admin/kasus/:id",
        permanent: false,
      },
      // Pemisahan ADMIN vs SUPER ADMIN (3 Nov 2026): fungsi khusus
      // super_admin hanya ada di /pemilik. Rute lama dipertahankan
      // sebagai redirect agar bookmark/tautan lama tidak putus.
      // Query string diteruskan apa adanya oleh Next.js.
      {
        source: "/admin/daftar-admin",
        destination: "/pemilik/kelola-admin",
        permanent: false,
      },
      {
        source: "/admin/tinjauan-qr",
        destination: "/pemilik/kelola-admin",
        permanent: false,
      },
      // Pesanan Top Up hanya super admin (keputusan Tuan 3 Nov 2026):
      // halaman /admin/topup dihapus, fungsinya hanya di
      // /pemilik/keuangan.
      {
        source: "/admin/topup",
        destination: "/pemilik/keuangan",
        permanent: false,
      },
    ];
  },
};

export default config;
