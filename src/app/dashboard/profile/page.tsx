import { redirect } from "next/navigation";
import { updateDisplayName } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";

const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString("id-ID") : "—";

export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const p = await searchParams;
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    typeof metadata.display_name === "string" ? metadata.display_name : "";

  return (
    <section className="dashmain">
      <small className="eyebrow">AKUN SAYA</small>
      <h1>Profil</h1>
      <p>Informasi akun dari sesi masuk Anda.</p>

      {p.notice === "updated" && (
        <div className="success rekber-message">
          Nama tampilan berhasil diubah.
        </div>
      )}
      {p.error === "invalid" && (
        <div className="alert rekber-message">
          Nama minimal 2 karakter dan maksimal 100 karakter.
        </div>
      )}
      {p.error === "update" && (
        <div className="alert rekber-message">
          Nama gagal disimpan. Coba lagi.
        </div>
      )}

      <section className="panel">
        <h2>Informasi akun</h2>
        <div className="tx-meta">
          <div>
            <small>NAMA TAMPILAN</small>
            <b>{displayName || "Belum diatur"}</b>
          </div>
          <div>
            <small>EMAIL</small>
            <b>{user.email ?? "—"}</b>
          </div>
          <div>
            <small>ID PENGGUNA</small>
            <b>{user.id}</b>
          </div>
          <div>
            <small>EMAIL TERKONFIRMASI</small>
            <b>
              {user.email_confirmed_at
                ? `Ya, ${dateLabel(user.email_confirmed_at)}`
                : "Belum"}
            </b>
          </div>
          <div>
            <small>AKUN DIBUAT</small>
            <b>{dateLabel(user.created_at)}</b>
          </div>
          <div>
            <small>TERAKHIR MASUK</small>
            <b>{dateLabel(user.last_sign_in_at)}</b>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Ubah nama tampilan</h2>
        <p>
          Nama ini disimpan di data akun dan ditampilkan saat Anda mendaftar
          maupun masuk.
        </p>
        <form action={updateDisplayName} className="market-form">
          <label>
            Nama tampilan
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={displayName}
            />
          </label>
          <SubmitButton className="market-primary" pendingLabel="Menyimpan…">
            Simpan nama
          </SubmitButton>
        </form>
      </section>
    </section>
  );
}
