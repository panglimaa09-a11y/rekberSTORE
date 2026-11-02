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
    ];
  },
};

export default config;
