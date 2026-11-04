"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getUserKycStatus, kycGateErrorKey } from "@/lib/kyc";
import { getMyRoles } from "@/lib/supabase/roles";
import {
  LISTING_IMAGE_BUCKET,
  listingImageExt,
  listingImagePath,
  validateListingImages,
} from "@/lib/listing-image";

type ListingDb = Awaited<ReturnType<typeof supabaseServer>>;

/** Berkas foto dari form: input baru `images` (multiple), dengan
 *  fallback input lama `image` (satu berkas, dari halaman yang
 *  tersimpan di cache browser sebelum perubahan ini). */
function collectListingFiles(form: FormData): File[] {
  const files: File[] = [];
  for (const value of [...form.getAll("images"), ...form.getAll("image")]) {
    if (value instanceof File && value.size > 0) files.push(value);
  }
  return files;
}

/** True bila error PostgREST berarti kolom image_paths belum ada
 *  (migrasi 80010 belum dijalankan) — bukan kegagalan database lain. */
function isMissingImagePathsColumn(error: {
  code?: string | null;
  message?: string | null;
} | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204") return true;
  return /image_paths/i.test(error.message ?? "");
}

/** Unggah semua foto, urut pilihan. Satu gagal = objek yang sudah
 *  terunggah dibersihkan lalu dialihkan ke halaman error unggah. */
async function uploadListingImages(
  db: ListingDb,
  userId: string,
  files: File[],
  uploadErrorRedirect: string
): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const path = listingImagePath(userId, listingImageExt(file));
    const { error } = await db.storage
      .from(LISTING_IMAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
    if (error) {
      if (paths.length > 0) {
        await db.storage.from(LISTING_IMAGE_BUCKET).remove(paths);
      }
      redirect(uploadErrorRedirect);
    }
    paths.push(path);
  }
  return paths;
}

const categories = [
  "Gaming",
  "Kreator",
  "Komunitas",
  "Bisnis digital",
  "Aset digital lainnya"
];

export async function createListing(form: FormData) {
  const title = String(form.get("title") || "").trim();
  const category = String(form.get("category") || "");
  const description = String(form.get("description") || "").trim();
  const price = Number(form.get("price"));

  if (
    title.length < 5 || title.length > 100 ||
    !categories.includes(category) ||
    description.length < 20 || description.length > 3000 ||
    !Number.isSafeInteger(price) || price < 1000 ||
    form.get("ownership") !== "yes"
  ) {
    redirect("/dashboard/sell?error=invalid");
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  // Foto (opsional, boleh beberapa): hanya tipe JPG/PNG/WebP yang
  // diperiksa — tidak ada batas ukuran per foto di aplikasi.
  const imageFiles = collectListingFiles(form);
  if (validateListingImages(imageFiles) !== null) {
    redirect("/dashboard/sell?error=image");
  }

  // Gerbang KYC: seller wajib KYC terverifikasi sebelum pasang
  // penawaran. Staf (admin/super_admin, rekber terpilih) memakai URL
  // sosmed, bukan KYC dokumen — gerbang dilewati untuk mereka.
  const sellerRoles = await getMyRoles(db, user.id);
  if (!sellerRoles.isStaff) {
    const sellerKyc = await getUserKycStatus(db, user.id);
    if (sellerKyc !== "approved") {
      redirect(`/dashboard/sell?error=${kycGateErrorKey(sellerKyc)}`);
    }
  }

  // Unggah dulu, baru simpan listing: gagal unggah = listing tidak dibuat.
  const imagePaths =
    imageFiles.length > 0
      ? await uploadListingImages(
          db,
          user.id,
          imageFiles,
          "/dashboard/sell?error=upload"
        )
      : [];
  const imagePath = imagePaths[0] ?? null;

  // Simpan daftar foto (image_paths, migrasi 80010) bila kolomnya
  // sudah ada; bila belum, simpan ulang hanya dengan cover
  // (image_path) agar listing tetap bisa dibuat — foto tambahan
  // baru tersimpan penuh setelah migrasi dijalankan.
  const listingRow = {
    seller_id: user.id,
    title,
    category,
    description,
    price,
    ownership_confirmed: true,
    status: "active",
    image_path: imagePath,
  };
  let { error } = await db.from("marketplace_listings").insert({
    ...listingRow,
    image_paths: imagePaths.length > 0 ? imagePaths : null,
  });
  if (error && isMissingImagePathsColumn(error)) {
    ({ error } = await db.from("marketplace_listings").insert(listingRow));
  }

  if (error) {
    // Listing gagal disimpan: bersihkan objek yang telanjur terunggah.
    if (imagePaths.length > 0) {
      await db.storage.from(LISTING_IMAGE_BUCKET).remove(imagePaths);
    }
    redirect("/dashboard/sell?error=database");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/browse");
  revalidatePath("/dashboard/my-listings");

  redirect("/dashboard/my-listings?success=1");
}

export async function requestTransaction(form: FormData) {
  const id = String(form.get("listing_id") || "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    redirect("/dashboard/browse?error=unavailable");
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  // Gerbang KYC: buyer wajib KYC terverifikasi sebelum mengajukan
  // transaksi. Staf (admin/super_admin, rekber terpilih) memakai URL
  // sosmed, bukan KYC dokumen — gerbang dilewati untuk mereka.
  const buyerRoles = await getMyRoles(db, user.id);
  if (!buyerRoles.isStaff) {
    const buyerKyc = await getUserKycStatus(db, user.id);
    if (buyerKyc !== "approved") {
      redirect(`/dashboard/browse?error=${kycGateErrorKey(buyerKyc)}`);
    }
  }

  const { data: transactionId, error } = await db.rpc(
    "create_rekber_transaction_with_reserve",
    { p_listing_id: id }
  );

  if (error) {
    const message = error.message.toUpperCase();

    if (message.includes("INSUFFICIENT_TOKENS")) {
      redirect("/dashboard/topup?error=insufficient");
    }

    if (message.includes("CANNOT_BUY_OWN_LISTING")) {
      redirect("/dashboard/browse?error=own_listing");
    }

    redirect("/dashboard/browse?error=transaction");
  }

  if (!transactionId) {
    redirect("/dashboard/browse?error=transaction");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard/topup");

  redirect("/dashboard/transactions?notice=created");
}

export async function respondToTransaction(form: FormData) {
  const id = String(form.get("transaction_id") || "").trim();
  const decision = String(form.get("decision") || "");

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    redirect("/dashboard/transactions?notice=invalid");
  }

  if (!["accept", "reject"].includes(decision)) {
    redirect("/dashboard/transactions?notice=invalid");
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await db.rpc("respond_rekber_transaction", {
    p_transaction_id: id,
    p_decision: decision
  });

  if (error) {
    redirect("/dashboard/transactions?notice=action_error");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard/topup");

  if (data === "expired") {
    redirect("/dashboard/transactions?notice=expired");
  }

  redirect(
    decision === "accept"
      ? "/dashboard/transactions?notice=accepted"
      : "/dashboard/transactions?notice=rejected"
  );
}

export async function cancelPendingTransaction(form: FormData) {
  const id = String(form.get("transaction_id") || "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    redirect("/dashboard/transactions?notice=invalid");
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  const { error } = await db.rpc("cancel_rekber_transaction", {
    p_transaction_id: id
  });

  if (error) {
    redirect("/dashboard/transactions?notice=action_error");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard/topup");

  redirect("/dashboard/transactions?notice=cancelled");
}

export async function updateListing(form: FormData) {
  const id = String(form.get("listing_id") || "").trim();
  const title = String(form.get("title") || "").trim();
  const category = String(form.get("category") || "");
  const description = String(form.get("description") || "").trim();
  const price = Number(form.get("price"));

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    redirect("/dashboard/my-listings?error=invalid");
  }

  if (
    title.length < 5 || title.length > 100 ||
    !categories.includes(category) ||
    description.length < 20 || description.length > 3000 ||
    !Number.isSafeInteger(price) || price < 1000
  ) {
    redirect(`/dashboard/my-listings/${id}/edit?error=invalid`);
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  // Foto pengganti (opsional, boleh beberapa): validasi sama seperti
  // saat membuat. Bila ada foto baru, foto itu mengganti SEMUA foto
  // lama; bila tidak ada, foto lama tetap dipakai.
  const imageFiles = collectListingFiles(form);
  if (validateListingImages(imageFiles) !== null) {
    redirect(`/dashboard/my-listings/${id}/edit?error=image`);
  }

  // Path foto lama, untuk dibersihkan bila diganti. select("*")
  // sengaja dipakai: kolom image_paths mungkin belum ada (migrasi
  // 80010 belum jalan) dan select eksplisit atas kolom yang belum
  // ada akan menggagalkan seluruh query.
  const { data: current } = await db
    .from("marketplace_listings")
    .select("*")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();
  const currentPaths: string[] = [
    ...(Array.isArray(current?.image_paths)
      ? current.image_paths.filter(
          (p: unknown): p is string => typeof p === "string" && p.length > 0
        )
      : []),
    ...(typeof current?.image_path === "string" && current.image_path
      ? [current.image_path]
      : []),
  ].filter((p, i, all) => all.indexOf(p) === i);

  let imagePaths: string[] = [];
  let imagePath: string | null | undefined;
  if (imageFiles.length > 0) {
    imagePaths = await uploadListingImages(
      db,
      user.id,
      imageFiles,
      `/dashboard/my-listings/${id}/edit?error=upload`
    );
    imagePath = imagePaths[0] ?? null;
  }

  const baseUpdate = { title, category, description, price };
  const imageUpdate =
    imagePath === undefined
      ? baseUpdate
      : {
          ...baseUpdate,
          image_path: imagePath,
          image_paths: imagePaths.length > 0 ? imagePaths : null,
        };
  let { data, error } = await db
    .from("marketplace_listings")
    .update(imageUpdate)
    .eq("id", id)
    .eq("seller_id", user.id)
    .select("id")
    .maybeSingle();
  if (error && imagePath !== undefined && isMissingImagePathsColumn(error)) {
    ({ data, error } = await db
      .from("marketplace_listings")
      .update(
        imagePath === undefined
          ? baseUpdate
          : { ...baseUpdate, image_path: imagePath }
      )
      .eq("id", id)
      .eq("seller_id", user.id)
      .select("id")
      .maybeSingle());
  }

  if (error || !data) {
    if (imagePaths.length > 0) {
      await db.storage.from(LISTING_IMAGE_BUCKET).remove(imagePaths);
    }
    redirect(`/dashboard/my-listings/${id}/edit?error=database`);
  }

  // Foto lama dihapus bila memungkinkan; kegagalan hapus tidak
  // menggagalkan edit yang sudah tersimpan.
  if (imagePaths.length > 0) {
    const stale = currentPaths.filter((p) => !imagePaths.includes(p));
    if (stale.length > 0) {
      await db.storage.from(LISTING_IMAGE_BUCKET).remove(stale);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/browse");
  revalidatePath(`/dashboard/items/${id}`);
  revalidatePath("/dashboard/my-listings");

  redirect("/dashboard/my-listings?notice=updated");
}

export async function setListingStatus(form: FormData) {
  const id = String(form.get("listing_id") || "").trim();
  const status = String(form.get("status") || "");

  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !["active", "paused"].includes(status)
  ) {
    redirect("/dashboard/my-listings?error=invalid");
  }

  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await db.from("marketplace_listings")
    .update({ status })
    .eq("id", id)
    .eq("seller_id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/dashboard/my-listings?error=database");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/browse");
  revalidatePath("/dashboard/my-listings");

  redirect(
    status === "paused"
      ? "/dashboard/my-listings?notice=paused"
      : "/dashboard/my-listings?notice=resumed"
  );
}
