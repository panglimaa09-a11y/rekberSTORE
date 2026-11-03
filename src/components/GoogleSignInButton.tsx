"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loginWithGoogleIdToken,
  prepareGoogleSignIn,
} from "@/app/google-actions";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdConfig = {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  nonce?: string;
  ux_mode?: "popup" | "redirect";
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
};

type GoogleButtonConfig = {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  width?: number;
};

type GoogleAccounts = {
  id: {
    initialize: (config: GoogleIdConfig) => void;
    renderButton: (element: HTMLElement, config: GoogleButtonConfig) => void;
    cancel: () => void;
  };
};

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

type Status = "loading" | "ready" | "unavailable" | "failed";

/**
 * Tombol "Lanjutkan dengan Google" via Google Identity Services.
 * Layar izin Google menampilkan origin aplikasi (rekberstore.my.id),
 * bukan alamat Supabase. Tanpa One Tap: hanya tombol eksplisit.
 * Bila Client ID belum dikonfigurasi atau skrip gagal dimuat, tampil
 * pesan jujur dan login email/password tetap jalan.
 */
export default function GoogleSignInButton({
  errorBase,
}: {
  errorBase: "/login" | "/register";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const submittedRef = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [prep, setPrep] = useState<{ clientId: string; nonce: string } | null>(
    null,
  );

  const renderButton = useCallback(() => {
    if (!containerRef.current || renderedRef.current) return;
    if (typeof window === "undefined" || !window.google || !prep) return;
    const width = Math.min(
      400,
      Math.max(200, containerRef.current.clientWidth || 320),
    );
    window.google.accounts.id.initialize({
      client_id: prep.clientId,
      callback: async (response) => {
        if (submittedRef.current) return;
        submittedRef.current = true;
        setBusy(true);
        const credential = response.credential;
        if (!credential) {
          window.location.assign(`${errorBase}?error=oauth_failed`);
          return;
        }
        const result = await loginWithGoogleIdToken(credential);
        if (result.ok) {
          window.location.assign("/dashboard");
        } else {
          window.location.assign(`${errorBase}?error=oauth_failed`);
        }
      },
      nonce: prep.nonce,
      ux_mode: "popup",
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    window.google.accounts.id.renderButton(containerRef.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width,
    });
    renderedRef.current = true;
    setStatus("ready");
  }, [prep, errorBase]);

  useEffect(() => {
    let cancelled = false;
    prepareGoogleSignIn()
      .then((p) => {
        if (cancelled) return;
        if (!p.configured) {
          setStatus("unavailable");
          return;
        }
        setPrep({ clientId: p.clientId, nonce: p.nonce });
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    renderButton();
  }, [renderButton]);

  useEffect(
    () => () => {
      try {
        window.google?.accounts.id.cancel();
      } catch {
        // GIS belum/tidak terinisialisasi; abaikan.
      }
      renderedRef.current = false;
    },
    [],
  );

  return (
    <div style={{ margin: "22px 0" }}>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={renderButton}
        onError={() =>
          setStatus((s) => (s === "unavailable" ? s : "failed"))
        }
      />
      <div ref={containerRef} aria-busy={busy} />
      {status === "unavailable" && (
        <div className="alert">
          Login Google belum dikonfigurasi. Masuk dengan email dan password,
          atau hubungi admin.
        </div>
      )}
      {status === "failed" && (
        <div className="alert">
          Login Google gagal dimuat. Coba lagi sebentar lagi.
        </div>
      )}
      {busy && <p>Memproses…</p>}
    </div>
  );
}
