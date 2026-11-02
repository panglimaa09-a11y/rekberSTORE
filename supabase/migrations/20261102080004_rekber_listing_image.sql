-- ============================================================================
-- RekberSTORE: kolom gambar cover listing + policy Storage bucket publik.
-- Dijalankan Tuan di SQL Editor. Idempotent.
--
-- 1. marketplace_listings.image_path: path objek di bucket publik
--    "marketplace-listings", format <seller_uid>/<uuid>.<ext>.
--    NULL = listing tanpa gambar (tampil blok netral, tanpa gambar
--    karangan). Bucketnya sendiri dibuat lewat dashboard dan tidak
--    dibuat ulang di sini.
-- 2. Policy storage.objects untuk bucket marketplace-listings:
--    - baca publik (anon + authenticated): hero gambar dimuat <img>
--      tanpa header auth, jadi SELECT untuk anon wajib ada.
--    - tulis/ubah/hapus: hanya pemilik folder (segmen pertama nama
--      objek = uid seller). Nama policy berawalan listing_image_ agar
--      tidak bentrok dengan policy yang sudah ada di bucket ini.
--    Policy ini BELUM terverifikasi terhadap policy yang sudah ada di
--    dashboard (isi policy bucket tidak ada di repo); jalankan file ini
--    apa adanya di SQL Editor dan periksa unggahan sungguhan setelahnya.
-- ============================================================================
begin;

alter table public.marketplace_listings
  add column if not exists image_path text;

comment on column public.marketplace_listings.image_path is
  'Path objek gambar cover di bucket marketplace-listings (<seller_uid>/<uuid>.<ext>); null bila tanpa gambar.';

drop policy if exists listing_image_public_read on storage.objects;
create policy listing_image_public_read on storage.objects
for select to public
using (bucket_id = 'marketplace-listings');

drop policy if exists listing_image_owner_insert on storage.objects;
create policy listing_image_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'marketplace-listings'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists listing_image_owner_update on storage.objects;
create policy listing_image_owner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'marketplace-listings'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'marketplace-listings'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists listing_image_owner_delete on storage.objects;
create policy listing_image_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'marketplace-listings'
  and split_part(name, '/', 1) = auth.uid()::text
);

commit;
