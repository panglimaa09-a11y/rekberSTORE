"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Leaderboard realtime: langganan INSERT pada admin_ratings +
 * penyegaran berkala 30 detik sebagai jaring pengaman, karena
 * pengiriman Realtime dibatasi RLS (hanya baris yang terlihat
 * pengguna yang diterima). Cleanup penuh saat unmount.
 */
export default function LeaderboardRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    const channel = supabase
      .channel("rekber-leaderboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_ratings" },
        () => router.refresh()
      )
      .subscribe();
    const timer = setInterval(() => router.refresh(), 30000);
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
