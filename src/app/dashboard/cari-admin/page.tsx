import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadDisplayNames, displayNameFor } from "@/lib/admin-view";
import VerifiedBadge from "@/components/VerifiedBadge";
import {
  PROVINCES,
  normalizeAreaKey,
} from "@/lib/admin-location";

/**
 * Pencari admin berdasarkan wilayah.
 *
 * "Terdekat" berarti wilayah administratif yang sama, TANPA GPS,
 * TANPA kilometer, TANPA pin peta. Lokasi pengguna BELUM PERNAH
 * dikumpulkan, jadi patokan "area saya" adalah FILTER yang dipilih
 * pengguna sendiri (dropdown provinsi + isian kel/kecamatan):
 * tingkat 1 = kel/kecamatan sama, tingkat 2 = provinsi sama,
 * tingkat 3 = admin lainnya. Tanpa filter, urutan alfabetis
 * provinsi lalu nama. Pencocokan kel/kecamatan memakai kunci
 * trim + lowercase agar perbedaan huruf besar/kecil dan spasi
 * tidak menggagalkan kecocokan.
 *
 * Lokasi admin tampil publik di sini (itu fungsi pencari); yang
 * tampil hanya provinsi + kel/kecamatan dari baris profil bisnis
 * terkini tiap staf. Admin tanpa lokasi tetap tampil di kelompok
 * "lainnya", bukan disembunyikan.
 */

type LocationRow = {
  admin_user_id: string;
  provinsi: string | null;
  kel_kecamatan: string | null;
};

function tierOf(
  row: LocationRow,
  filterProvinsi: string,
  filterKel: string
): 1 | 2 | 3 {
  if (
    filterKel !== "" &&
    row.kel_kecamatan !== null &&
    normalizeAreaKey(row.kel_kecamatan) === filterKel
  ) {
    return 1;
  }
  if (filterProvinsi !== "" && row.provinsi === filterProvinsi) {
    return 2;
  }
  return 3;
}

const TIER_HEADINGS: Record<1 | 2 | 3, string> = {
  1: "Kel/kecamatan yang sama",
  2: "Provinsi yang sama",
  3: "Admin lainnya",
};

export default async function CariAdmin({
  searchParams,
}: {
  searchParams: Promise<{ provinsi?: string; kel?: string }>;
}) {
  const p = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const filterProvinsi = PROVINCES.includes(p.provinsi ?? "")
    ? (p.provinsi as string)
    : "";
  const filterKel = normalizeAreaKey(p.kel ?? "");
  const hasFilter = filterProvinsi !== "" || filterKel !== "";

  // Penjual staf (lencana). RPC belum ada bila migrasi 80003 belum
  // dijalankan: lencana absen, daftar tetap tampil.
  let staffIds = new Set<string>();
  try {
    const { data: staff } = await db.rpc("list_rekber_staff_ids");
    if (Array.isArray(staff)) staffIds = new Set(staff.map(String));
  } catch {
    staffIds = new Set<string>();
  }

  // Lokasi publik tiap staf. RPC belum ada bila migrasi 80009 belum
  // dijalankan: daftar staf tetap tampil tanpa baris lokasi, dengan
  // pemberitahuan jujur bahwa fitur lokasi belum aktif.
  let locations: LocationRow[] | null = null;
  try {
    const { data, error } = await db.rpc("list_rekber_admin_locations");
    if (!error && Array.isArray(data)) {
      locations = data as LocationRow[];
    }
  } catch {
    locations = null;
  }
  const locationsAvailable = locations !== null;

  const rows: LocationRow[] = locationsAvailable
    ? (locations as LocationRow[])
    : [...staffIds].map((id) => ({
        admin_user_id: id,
        provinsi: null,
        kel_kecamatan: null,
      }));

  const nameMap = await loadDisplayNames(
    db,
    rows.map((row) => row.admin_user_id)
  );

  const ranked = rows
    .map((row) => ({
      row,
      tier: tierOf(row, filterProvinsi, filterKel),
      name: displayNameFor(nameMap, user.id, row.admin_user_id),
    }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const aProv = a.row.provinsi ?? "";
      const bProv = b.row.provinsi ?? "";
      if (aProv === "" && bProv !== "") return 1;
      if (bProv === "" && aProv !== "") return -1;
      const byProv = aProv.localeCompare(bProv, "id");
      if (byProv !== 0) return byProv;
      const byName = a.name.localeCompare(b.name, "id");
      if (byName !== 0) return byName;
      return a.row.admin_user_id.localeCompare(b.row.admin_user_id);
    });

  const tiers: (1 | 2 | 3)[] = [1, 2, 3];

  return (
    <section className="dashmain">
      <small className="eyebrow">CARI ADMIN TERDEKAT</small>
      <h1>Cari admin terdekat</h1>
      <p>
        Admin diurutkan berdasarkan wilayah yang sama: kel/kecamatan
        yang sama dulu, lalu provinsi yang sama, lalu admin lainnya.
        Tanpa GPS dan tanpa jarak — hanya provinsi dan kel/kecamatan
        yang diisi admin sendiri. Pilih area Anda untuk mengurutkan
        admin di wilayah tersebut ke depan.
      </p>

      <form className="market-search" action="/dashboard/cari-admin">
        <select name="provinsi" defaultValue={filterProvinsi} aria-label="Provinsi area Anda">
          <option value="">Semua provinsi</option>
          {PROVINCES.map((provinsi) => (
            <option key={provinsi} value={provinsi}>
              {provinsi}
            </option>
          ))}
        </select>
        <input
          name="kel"
          defaultValue={p.kel ?? ""}
          placeholder="Kel/kecamatan area Anda…"
          aria-label="Kel/kecamatan area Anda"
          maxLength={120}
        />
        <button className="market-primary" type="submit">
          Cari
        </button>
      </form>

      {!locationsAvailable && (
        <div className="alert rekber-message">
          Fitur lokasi belum aktif — migrasi database belum dijalankan.
          Daftar admin di bawah tampil tanpa lokasi.
        </div>
      )}

      {ranked.length === 0 ? (
        <p className="market-empty">
          Belum ada admin dengan profil bisnis.
        </p>
      ) : (
        tiers.map((tier) => {
          const items = ranked.filter((item) => item.tier === tier);
          if (items.length === 0) return null;
          return (
            <section key={tier}>
              {hasFilter && (
                <h2 className="finder-tier">{TIER_HEADINGS[tier]}</h2>
              )}
              <div className="finder-grid">
                {items.map(({ row, name }) => {
                  const isStaff = staffIds.has(row.admin_user_id);
                  return (
                    <article className="finder-card" key={row.admin_user_id}>
                      <div className="finder-card-top">
                        <h3>{name}</h3>
                        <VerifiedBadge isStaff={isStaff} size="small" />
                      </div>
                      {isStaff && (
                        <p className="finder-chosen">Rekber Terpilih</p>
                      )}
                      {locationsAvailable && (
                        <div className="finder-loc">
                          <div>
                            <small>PROVINSI</small>
                            <b>{row.provinsi ?? "Belum mengisi lokasi"}</b>
                          </div>
                          <div>
                            <small>KEL / KECAMATAN</small>
                            <b>{row.kel_kecamatan ?? "—"}</b>
                          </div>
                        </div>
                      )}
                      <Link
                        className="btn"
                        href={"/dashboard/toko/" + row.admin_user_id}
                      >
                        Lihat toko
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </section>
  );
}
