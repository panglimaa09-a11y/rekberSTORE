import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyRoles } from "@/lib/supabase/roles";
import { setListingStatusAdmin } from "@/app/admin-actions";
import AdminDenied from "@/components/AdminDenied";
import SubmitButton from "@/components/SubmitButton";
import {
  displayNameFor,
  loadDisplayNames,
  money,
} from "@/lib/admin-view";
import { isMissingRpcError } from "@/lib/rekber-stages";

const notices: Record<string, string> = {
  listing_updated: "Status listing diperbarui.",
  listing_error: "Perubahan status listing gagal. Coba lagi.",
  stage_unavailable:
    "Fitur admin belum aktif — migrasi database belum dijalankan.",
  invalid: "Permintaan tidak valid.",
};

/**
 * Moderasi listing (dipindah dari halaman panel admin lama). Jeda
 * atau aktifkan listing. Penghapusan tidak dibangun — tidak ada
 * policy DELETE di database.
 */
export default async function AdminModeration({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const params = await searchParams;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getMyRoles(db, user.id);
  if (!roles.isStaff) return <AdminDenied />;

  let listings: {
    id: string;
    seller_id: string;
    category: string;
    title: string;
    price: number;
    status: string;
    created_at: string;
  }[] = [];
  let listingsUnavailable = false;
  try {
    const { data, error } = await db.rpc("list_rekber_listings_admin");
    if (error) throw error;
    listings = data ?? [];
  } catch (error) {
    listingsUnavailable = isMissingRpcError(
      error as { code?: string; message?: string }
    );
  }

  const nameMap = await loadDisplayNames(
    db,
    listings.map((l) => l.seller_id)
  );
  const displayName = (uid: string | null | undefined) =>
    displayNameFor(nameMap, user.id, uid);

  return (
    <section className="dashmain">
      <header>
        <div>
          <small className="eyebrow">PANEL ADMIN</small>
          <h1>Moderasi listing</h1>
          <p>
            Jeda atau aktifkan listing. Penghapusan tidak dibangun —
            tidak ada policy DELETE di database.
          </p>
        </div>
      </header>

      {params.notice && notices[params.notice] && (
        <div className="success rekber-message">{notices[params.notice]}</div>
      )}

      {listingsUnavailable && (
        <p className="token-muted">
          Moderasi belum aktif — migrasi database belum dijalankan.
        </p>
      )}
      {!listingsUnavailable && listings.length === 0 && (
        <div className="empty">
          <h3>Belum ada listing</h3>
        </div>
      )}
      {listings.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Listing</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id}>
                  <td>
                    <b>{listing.title}</b>
                    <small>{`Seller: ${displayName(listing.seller_id)}`}</small>
                  </td>
                  <td>{listing.category}</td>
                  <td>{money(listing.price)}</td>
                  <td>
                    <span className="rekber-status">{listing.status}</span>
                  </td>
                  <td>
                    {listing.status === "active" ? (
                      <form action={setListingStatusAdmin}>
                        <input type="hidden" name="listing_id" value={listing.id} />
                        <input type="hidden" name="status" value="paused" />
                        <SubmitButton className="rekber-reject" pendingLabel="Menjeda…">
                          Jeda
                        </SubmitButton>
                      </form>
                    ) : listing.status === "paused" ? (
                      <form action={setListingStatusAdmin}>
                        <input type="hidden" name="listing_id" value={listing.id} />
                        <input type="hidden" name="status" value="active" />
                        <SubmitButton className="btn" pendingLabel="Mengaktifkan…">
                          Aktifkan
                        </SubmitButton>
                      </form>
                    ) : (
                      <span className="role">Tidak ada tindakan</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
