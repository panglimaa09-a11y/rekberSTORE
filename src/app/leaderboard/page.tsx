import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import LeaderboardRefresh from "@/components/LeaderboardRefresh";

type LeaderboardRow = {
  admin_id: string;
  display_name: string;
  avg_stars: number;
  rating_count: number;
  completed_count: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function Leaderboard() {
  let rows: LeaderboardRow[] = [];
  let unavailable = false;
  try {
    const db = await supabaseServer();
    const { data, error } = await db.rpc("get_rekber_leaderboard");
    if (error) {
      unavailable = true;
    } else {
      rows = (data ?? []) as LeaderboardRow[];
    }
  } catch {
    unavailable = true;
  }

  return (
    <main className="lp">
      <section className="lb-wrap">
        <header>
          <small className="eyebrow">LEADERBOARD REKBER</small>
          <h1>Rekber terpilih, dinilai pembeli dan penjual</h1>
          <p>
            Peringkat dari penilaian bintang nyata atas transaksi yang
            sudah selesai. Rekber terpilih adalah pengguna layanan
            website ini yang didaftarkan oleh pemilik platform —
            bukan karyawan platform. Tanpa nama karangan dan tanpa
            bintang placeholder: sebelum ada penilaian sungguhan,
            halaman ini kosong.
          </p>
        </header>

        <LeaderboardRefresh />

        {unavailable && (
          <div className="notice">
            <div>
              <b>Leaderboard belum aktif</b>
              <p>
                Fitur penilaian belum aktif — migrasi leaderboard belum
                dijalankan. Halaman ini tidak menampilkan data apa pun
                sampai migrasi dijalankan.
              </p>
            </div>
          </div>
        )}

        {!unavailable && rows.length === 0 && (
          <div className="empty">
            <h3>Belum ada penilaian</h3>
            <p>
              Belum ada rekber yang dinilai. Penilaian muncul setelah
              transaksi selesai dan pihak transaksi memberikan bintang
              untuk admin penangannya.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <ol className="lb-list">
            {rows.map((row, index) => {
              const name = row.display_name.trim() || "Rekber terpilih";
              return (
                <li key={row.admin_id}>
                  <b className="lb-rank">#{index + 1}</b>
                  <span className="lb-avatar" aria-hidden="true">
                    {initials(row.display_name)}
                  </span>
                  <span className="lb-name">
                    <b>{name}</b>
                    <small>
                      {row.completed_count} transaksi selesai ditangani
                    </small>
                  </span>
                  <span className="lb-score">
                    <b>★ {Number(row.avg_stars).toFixed(2)}</b>
                    <small>
                      {row.rating_count} penilaian
                    </small>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <p className="lb-foot">
          Peringkat: rata-rata bintang tertinggi dulu, jumlah penilaian
          sebagai penyeimbang. Satu penilaian per transaksi per penilai.
          <br />
          <Link href="/dashboard">Masuk dashboard</Link>
          {" · "}
          <Link href="/">Kembali ke beranda</Link>
        </p>
      </section>
    </main>
  );
}
