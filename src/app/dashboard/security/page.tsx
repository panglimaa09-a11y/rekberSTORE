import { redirect } from "next/navigation";
import { unenrollMfa } from "@/app/actions";
import { supabaseServer } from "@/lib/supabase/server";
import SubmitButton from "@/components/SubmitButton";
import MfaEnrollPanel from "@/components/MfaEnrollPanel";

const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString("id-ID") : "—";

const errorCopy: Record<string, string> = {
  mfa_invalid:
    "Kode 6 digit salah atau sudah kedaluwarsa. Periksa aplikasi authenticator dan coba lagi.",
  mfa_failed: "Verifikasi 2FA gagal dari sisi server. Coba lagi sebentar lagi.",
  mfa_remove: "2FA gagal dinonaktifkan. Coba lagi.",
};

const noticeCopy: Record<string, string> = {
  mfa_enabled:
    "2FA berhasil diaktifkan. Setiap masuk berikutnya akan meminta kode dari aplikasi authenticator.",
  mfa_removed: "2FA berhasil dinonaktifkan.",
};

export default async function Security({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const p = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: factors, error: factorsError } =
    await db.auth.mfa.listFactors();
  const all = factors?.all ?? [];
  const verified = all.filter(
    (f) => f.factor_type === "totp" && f.status === "verified"
  );
  const unverified = all.filter(
    (f) => f.factor_type === "totp" && f.status === "unverified"
  );

  return (
    <section className="dashmain">
      <small className="eyebrow">KEAMANAN AKUN</small>
      <h1>Keamanan dan 2FA</h1>
      <p>
        Verifikasi dua langkah (2FA) bersifat pilihan. Bila aktif, masuk
        membutuhkan kode dari aplikasi authenticator di HP Anda.
      </p>

      {p.notice && noticeCopy[p.notice] && (
        <div className="success rekber-message">{noticeCopy[p.notice]}</div>
      )}
      {p.error && errorCopy[p.error] && (
        <div className="alert rekber-message">{errorCopy[p.error]}</div>
      )}
      {factorsError && (
        <div className="notice">
          <div>
            <b>Status 2FA tidak dapat dibaca</b>
            <p>
              Periksa koneksi Supabase dan coba muat ulang halaman ini.
            </p>
          </div>
        </div>
      )}

      <section className="panel">
        <h2>Status 2FA</h2>
        <div className="tx-meta">
          <div>
            <small>STATUS</small>
            <b>{verified.length > 0 ? "Aktif" : "Tidak aktif"}</b>
          </div>
          <div>
            <small>FAKTOR TERVERIFIKASI</small>
            <b>{verified.length}</b>
          </div>
        </div>
        <p>
          Tidak ada kode pemulihan di sistem ini. Bila aplikasi authenticator
          hilang atau HP berganti, hubungi admin untuk menonaktifkan 2FA
          dari sisi server. Jangan pernah membagikan kode rahasia 2FA
          kepada siapa pun.
        </p>
      </section>

      {verified.length > 0 && (
        <section className="panel">
          <h2>Faktor 2FA aktif</h2>
          {verified.map((factor) => (
            <div className="tx-meta" key={factor.id}>
              <div>
                <small>NAMA FAKTOR</small>
                <b>{factor.friendly_name || "Authenticator"}</b>
              </div>
              <div>
                <small>DIBUAT</small>
                <b>{dateLabel(factor.created_at)}</b>
              </div>
            </div>
          ))}
          {verified.map((factor) => (
            <form action={unenrollMfa} key={factor.id}>
              <input type="hidden" name="factor_id" value={factor.id} />
              <SubmitButton
                className="btn secondary"
                pendingLabel="Menonaktifkan…"
              >
                Nonaktifkan 2FA
              </SubmitButton>
            </form>
          ))}
        </section>
      )}

      {verified.length === 0 && unverified.length > 0 && (
        <section className="panel">
          <h2>Pendaftaran belum selesai</h2>
          <p>
            Ada pendaftaran 2FA yang belum diverifikasi. Kode rahasianya
            tidak dapat ditampilkan lagi — hapus pendaftaran ini, lalu
            mulai lagi dari awal.
          </p>
          {unverified.map((factor) => (
            <form action={unenrollMfa} key={factor.id}>
              <input type="hidden" name="factor_id" value={factor.id} />
              <SubmitButton
                className="btn secondary"
                pendingLabel="Menghapus…"
              >
                Hapus pendaftaran yang belum selesai
              </SubmitButton>
            </form>
          ))}
        </section>
      )}

      {verified.length === 0 && unverified.length === 0 && (
        <section className="panel">
          <h2>Aktifkan 2FA</h2>
          <MfaEnrollPanel />
        </section>
      )}
    </section>
  );
}
