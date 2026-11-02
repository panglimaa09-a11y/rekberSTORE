"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getUserKycStatus, kycGateErrorKey } from "@/lib/kyc";
import {
  LISTING_IMAGE_BUCKET,
  listingImagePath,
  validateListingImage,
} from "@/lib/listing-image";

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

  // Gambar cover (opsional): hanya jpeg/png/webp, maks 5 MB.
  const imageValue = form.get("image");
  const imageFile =
    imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
  if (validateListingImage(imageFile) !== null) {
    redirect("/dashboard/sell?error=image");
  }

  // Gerbang KYC: seller wajib KYC terverifikasi sebelum pasang penawaran.
  const sellerKyc = await getUserKycStatus(db, user.id);
  if (sellerKyc !== "approved") {
    redirect(`/dashboard/sell?error=${kycGateErrorKey(sellerKyc)}`);
  }

  // Unggah dulu, baru simpan listing: gagal unggah = listing tidak dibuat.
  let imagePath: string | null = null;
  if (imageFile) {
    const ext =
      imageFile.type === "image/png"
        ? "png"
        : imageFile.type === "image/webp"
          ? "webp"
          : "jpg";
    imagePath = listingImagePath(user.id, ext);
    const { error: uploadError } = await db.storage
      .from(LISTING_IMAGE_BUCKET)
      .upload(imagePath, imageFile, {
        contentType: imageFile.type,
        upsert: false,
      });
    if (uploadError) {
      redirect("/dashboard/sell?error=upload");
    }
  }

  const { error } = await db.from("marketplace_listings").insert({
    seller_id: user.id,
    title,
    category,
    description,
    price,
    ownership_confirmed: true,
    status: "active",
    image_path: imagePath,
  });

  if (error) {
    // Listing gagal disimpan: bersihkan objek yang telanjur terunggah.
    if (imagePath) {
      await db.storage.from(LISTING_IMAGE_BUCKET).remove([imagePath]);
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

  // Gerbang KYC: buyer wajib KYC terverifikasi sebelum mengajukan transaksi.
  const buyerKyc = await getUserKycStatus(db, user.id);
  if (buyerKyc !== "approved") {
    redirect(`/dashboard/browse?error=${kycGateErrorKey(buyerKyc)}`);
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

  // Gambar pengganti (opsional): validasi sama seperti saat membuat.
  const imageValue = form.get("image");
  const imageFile =
    imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
  if (validateListingImage(imageFile) !== null) {
    redirect(`/dashboard/my-listings/${id}/edit?error=image`);
  }

  // Path gambar lama, untuk dibersihkan bila diganti.
  const { data: current } = await db
    .from("marketplace_listings")
    .select("image_path")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  let imagePath: string | null | undefined;
  if (imageFile) {
    const ext =
      imageFile.type === "image/png"
        ? "png"
        : imageFile.type === "image/webp"
          ? "webp"
          : "jpg";
    imagePath = listingImagePath(user.id, ext);
    const { error: uploadError } = await db.storage
      .from(LISTING_IMAGE_BUCKET)
      .upload(imagePath, imageFile, {
        contentType: imageFile.type,
        upsert: false,
      });
    if (uploadError) {
      redirect(`/dashboard/my-listings/${id}/edit?error=upload`);
    }
  }

  const { data, error } = await db.from("marketplace_listings")
    .update(
      imagePath === undefined
        ? { title, category, description, price }
        : { title, category, description, price, image_path: imagePath }
    )
    .eq("id", id)
    .eq("seller_id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (imagePath) {
      await db.storage.from(LISTING_IMAGE_BUCKET).remove([imagePath]);
    }
    redirect(`/dashboard/my-listings/${id}/edit?error=database`);
  }

  // Gambar lama dihapus bila memungkinkan; kegagalan hapus tidak
  // menggagalkan edit yang sudah tersimpan.
  if (imagePath && current?.image_path && current.image_path !== imagePath) {
    await db.storage
      .from(LISTING_IMAGE_BUCKET)
      .remove([current.image_path]);
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
