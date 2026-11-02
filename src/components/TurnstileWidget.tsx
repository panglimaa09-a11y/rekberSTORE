"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Widget Cloudflare Turnstile tanpa dependensi baru, render eksplisit
 * (api.js?render=explicit + turnstile.render). Token ditulis ke hidden
 * field `captcha_token` di dalam form yang sama, lalu diteruskan server
 * action sebagai options.captchaToken Supabase.
 *
 * Hanya dirender bila site key tersedia (halaman yang memakainya yang
 * memutuskan). Bila script gagal dimuat atau token kedaluwarsa, form
 * tetap bisa dikirim tanpa token — Supabase mengabaikan token bila
 * perlindungan bot belum diaktifkan di dashboard.
 */
export default function TurnstileWidget({ siteKey }: { siteKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");

  const renderWidget = useCallback(() => {
    if (!containerRef.current || widgetIdRef.current) return;
    if (typeof window === "undefined" || !window.turnstile) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "dark",
      callback: (nextToken: string) => setToken(nextToken),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    });
  }, [siteKey]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (
        widgetIdRef.current &&
        typeof window !== "undefined" &&
        window.turnstile
      ) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Widget sudah tidak ada; abaikan.
        }
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <div ref={containerRef} className="turnstile-box" />
      <input type="hidden" name="captcha_token" value={token} />
    </>
  );
}
