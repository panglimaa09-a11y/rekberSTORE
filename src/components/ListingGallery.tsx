"use client";

import { useState } from "react";

/**
 * Galeri foto detail listing: foto pertama (cover) tampil besar,
 * foto lainnya bisa dipilih lewat thumbnail di bawahnya. Bila hanya
 * satu foto, thumbnail tidak ditampilkan.
 */
export default function ListingGallery({
  urls,
  title,
  badge,
}: {
  urls: string[];
  title: string;
  badge?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const current = Math.min(index, urls.length - 1);
  const currentUrl = urls[current];

  if (!currentUrl) return null;

  return (
    <div>
      <div className="shop-hero-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={currentUrl} src={currentUrl} alt={title} />
        {badge}
      </div>
      {urls.length > 1 && (
        <div className="gallery-thumbs" aria-label="Foto listing lainnya">
          {urls.map((url, i) => (
            <button
              key={url}
              type="button"
              className={`gallery-thumb${i === current ? " active" : ""}`}
              aria-label={`Lihat foto ${i + 1}`}
              aria-current={i === current}
              onClick={() => setIndex(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
