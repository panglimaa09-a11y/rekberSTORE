"use client";

import { useActionState } from "react";
import {
  startMfaEnroll,
  verifyMfaEnroll,
  type MfaEnrollState,
} from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";

const initialState: MfaEnrollState = { status: "idle" };

/**
 * Panel pendaftaran 2FA. Langkah enroll mengembalikan secret + kode QR
 * dari SDK Supabase (dibuat lokal di server Supabase, tanpa API pihak
 * ketiga) dan menampilkannya sekali saja. Verifikasi memakai form action
 * biasa agar mengikuti pola redirect halaman lain.
 */
export default function MfaEnrollPanel() {
  const [state, formAction] = useActionState(startMfaEnroll, initialState);

  if (state.status === "ready") {
    return (
      <div>
        <p>
          Pindai kode QR di bawah ini dengan aplikasi authenticator (mis.
          Google Authenticator, Authy, atau 1Password), lalu masukkan kode
          6 digit yang muncul.
        </p>
        {/* Kode QR adalah data URI runtime dari SDK Supabase, bukan aset
            statis — next/image tidak dapat mengoptimasinya. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="mfa-qr"
          src={state.qrCode}
          alt="Kode QR 2FA untuk aplikasi authenticator"
        />
        <p>
          Tidak bisa memindai? Masukkan kode rahasia ini secara manual di
          aplikasi authenticator:
        </p>
        <code className="mfa-secret">{state.secret}</code>
        <form action={verifyMfaEnroll} className="market-form">
          <input type="hidden" name="factor_id" value={state.factorId} />
          <label>
            Kode 6 digit dari aplikasi authenticator
            <input
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
            />
          </label>
          <SubmitButton className="market-primary" pendingLabel="Memverifikasi…">
            Verifikasi dan aktifkan 2FA
          </SubmitButton>
        </form>
        <p>
          Jangan tutup atau refresh halaman ini sebelum verifikasi selesai —
          kode rahasia hanya ditampilkan sekali. Bila tertutup, hapus
          pendaftaran yang belum selesai di bawah dan mulai lagi.
        </p>
      </div>
    );
  }

  return (
    <div>
      {state.status === "error" && (
        <div className="alert rekber-message">{state.error}</div>
      )}
      <p>
        Setelah aktif, setiap kali masuk Anda akan diminta kode 6 digit dari
        aplikasi authenticator, selain email dan password.
      </p>
      <form action={formAction}>
        <SubmitButton className="market-primary" pendingLabel="Menyiapkan…">
          Aktifkan 2FA
        </SubmitButton>
      </form>
    </div>
  );
}
