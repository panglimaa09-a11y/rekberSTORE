"use client";

import { useRef, useState } from "react";
import { LISTING_IMAGE_TYPES } from "@/lib/listing-image";

type PickedPhoto = {
  key: string;
  file: File;
  url: string;
};

/**
 * Pemilih beberapa foto listing. Setiap foto yang dipilih tampil di
 * kotaknya sendiri (kotak "+" berubah menjadi gambar yang dipilih),
 * dan satu kotak "+" baru selalu tersedia di ujung untuk menambah
 * foto lagi. Foto pertama menjadi cover.
 *
 * Berkas dikirim apa adanya lewat input file `multiple` yang sama
 * (disinkronkan lewat DataTransfer agar hapus foto juga menghapusnya
 * dari pengiriman form). Tidak ada cek ukuran di sini — hanya tipe
 * JPG/PNG/WebP yang diterima, sesuai penghapusan batas 5 MB.
 */
export default function ListingPhotoPicker({
  name = "images",
  label = "Foto (opsional)",
}: {
  name?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const transferRef = useRef<DataTransfer | null>(null);
  const keyCounter = useRef(0);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [errorText, setErrorText] = useState("");

  function getTransfer(): DataTransfer {
    if (!transferRef.current) {
      transferRef.current = new DataTransfer();
    }
    return transferRef.current;
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const transfer = getTransfer();
    const added: PickedPhoto[] = [];
    let rejected = false;
    for (const file of Array.from(fileList)) {
      if (!LISTING_IMAGE_TYPES.includes(file.type)) {
        rejected = true;
        continue;
      }
      keyCounter.current += 1;
      const key = `${file.name}-${file.size}-${file.lastModified}-${keyCounter.current}`;
      transfer.items.add(file);
      added.push({ key, file, url: URL.createObjectURL(file) });
    }
    if (rejected) {
      setErrorText("Hanya foto JPG, PNG, atau WebP yang diterima.");
    } else {
      setErrorText("");
    }
    if (added.length > 0) {
      setPhotos((prev) => [...prev, ...added]);
    }
    if (inputRef.current) {
      inputRef.current.files = transfer.files;
    }
  }

  function removePhoto(key: string) {
    setPhotos((prev) => {
      const removed = prev.find((p) => p.key === key);
      if (removed) URL.revokeObjectURL(removed.url);
      const next = prev.filter((p) => p.key !== key);
      const transfer = new DataTransfer();
      for (const photo of next) transfer.items.add(photo.file);
      transferRef.current = transfer;
      if (inputRef.current) inputRef.current.files = transfer.files;
      return next;
    });
  }

  return (
    <div className="photo-field">
      <span>{label}</span>
      <div className="photo-picker">
        {photos.map((photo, index) => (
          <div className="photo-tile" key={photo.key}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`Foto ${index + 1}`} />
            <span className="photo-tile-badge">
              {index === 0 ? "Cover" : `Foto ${index + 1}`}
            </span>
            <button
              type="button"
              className="photo-tile-remove"
              aria-label={`Hapus foto ${index + 1}`}
              onClick={() => removePhoto(photo.key)}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="photo-tile photo-tile-add"
          aria-label="Tambah foto"
          onClick={() => inputRef.current?.click()}
        >
          <span aria-hidden="true">+</span>
          <small>Tambah foto</small>
        </button>
      </div>
      <input
        ref={inputRef}
        className="photo-picker-input"
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label="Pilih foto listing"
        onChange={(e) => addFiles(e.target.files)}
      />
      <p>Foto pertama jadi cover di marketplace. Pilih beberapa foto, JPG, PNG, atau WebP.</p>
      {errorText && (
        <p className="photo-picker-error" role="alert">
          {errorText}
        </p>
      )}
    </div>
  );
}
