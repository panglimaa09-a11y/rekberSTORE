import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
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
