-- ============================================================================
-- RekberSTORE: beberapa foto per listing (image_paths) + hapus batas
-- ukuran foto di aplikasi.
-- Dijalankan Tuan di SQL Editor SETELAH 20261102080009, SEBELUM
-- memakai form multi-foto. Idempotent. HANYA definisi + backfill
-- dari kolom lama; tidak menyentuh data lain.
--
-- 1. marketplace_listings.image_paths text[]: semua path objek di
--    bucket publik "marketplace-listings", urut pilihan, foto
--    pertama = cover. image_path dipertahankan sebagai cover agar
--    kartu browse/toko tetap jalan.
-- 2. Backfill: listing lama yang hanya punya image_path mendapat
--    image_paths = array[image_path]; baris yang image_paths-nya
--    sudah terisi tidak diubah.
-- 3. Kode aplikasi (commit yang sama) sudah tahan bila kolom ini
--    belum ada: insert/update mencoba menyimpan image_paths, dan
--    bila kolom belum ada, jatuh ke image_path saja (hanya cover
--    yang tersimpan). Karena itu migrasi ini WAJIB dijalankan agar
--    foto ke-2 dan seterusnya ikut tersimpan; listing yang dibuat
--    sebelum migrasi hanya menyimpan foto pertama.
-- ============================================================================
begin;

alter table public.marketplace_listings
  add column if not exists image_paths text[];

comment on column public.marketplace_listings.image_paths is
  'Semua path objek foto di bucket marketplace-listings, urut pilihan; elemen pertama = cover (sama dengan image_path).';

update public.marketplace_listings
set image_paths = array[image_path]
where image_path is not null
  and (image_paths is null or cardinality(image_paths) = 0);

commit;
