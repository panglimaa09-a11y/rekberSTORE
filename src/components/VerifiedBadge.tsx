/**
 * Lencana "✓ Terverifikasi" untuk identitas admin (role admin/super_admin).
 *
 * Otomatis untuk semua staf: penunjukan oleh pemilik platform adalah
 * verifikasinya — tanpa syarat kelengkapan profil (penegakan wajib-isi
 * URL sosmed untuk menangani transaksi berlaku terpisah dan tidak
 * memengaruhi lencana ini). Bukan staf: tidak merender apa pun.
 *
 * Dipakai ulang apa adanya oleh modul pencari admin berikutnya: cukup
 * teruskan isStaff + size. Komponen server murni (tanpa "use client").
 */
export default function VerifiedBadge({
  isStaff,
  size = "default",
}: {
  isStaff: boolean;
  size?: "small" | "default";
}) {
  if (!isStaff) return null;
  return (
    <span
      className={
        size === "small" ? "verified-badge verified-badge-sm" : "verified-badge"
      }
    >
      ✓ Terverifikasi
    </span>
  );
}
