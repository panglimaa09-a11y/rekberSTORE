import Link from "next/link";
import { logout } from "@/app/actions";
import DashboardNav from "./nav";

/**
 * Shell bersama seluruh halaman /dashboard/*.
 * Sidebar dan tautan navigasi didefinisikan di satu tempat agar
 * konsisten di semua halaman; halaman hanya mengisi konten.
 * Guard sesi tetap di middleware (tidak diubah di sini).
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="dash">
      <aside className="side">
        <Link className="brand" href="/">
          ◈ Rekber<span>STORE</span>
        </Link>
        <DashboardNav />
        <form action={logout}>
          <button className="logout" type="submit">
            Keluar dari akun
          </button>
        </form>
      </aside>
      {children}
    </main>
  );
}
