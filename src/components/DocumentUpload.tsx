"use client";

import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

function sanitizeName(name: string) {
  const base = name.split("/").pop() ?? "berkas";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "berkas";
}

/**
 * Unggah berkas ke bucket privat admin-private-documents lewat sesi
 * pengguna sendiri (policy Storage menegakkan path milik sendiri).
 * Path hasil unggahan dimasukkan ke hidden input agar form profil
 * mengirimkannya ke server action — tidak ada path karangan.
 */
export default function DocumentUpload({
  userId,
  kind,
  label,
  inputName,
  existingPath,
}: {
  userId: string;
  kind: "qr" | "kyc";
  label: string;
  inputName: string;
  existingPath?: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">(
    "idle"
  );
  const [objectPath, setObjectPath] = useState("");
  const [fileName, setFileName] = useState("");
  const [errorText, setErrorText] = useState("");

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErrorText("Pilih berkas terlebih dahulu.");
      setState("error");
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrorText("Format berkas harus JPG, PNG, atau PDF.");
      setState("error");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrorText("Ukuran berkas maksimal 5 MB.");
      setState("error");
      return;
    }
    const supabase = supabaseBrowser();
    if (!supabase) {
      setErrorText("Konfigurasi Supabase browser belum tersedia.");
      setState("error");
      return;
    }
    setState("uploading");
    setErrorText("");
    const path = `${userId}/${kind}/${Date.now()}-${sanitizeName(file.name)}`;
    const { error } = await supabase.storage
      .from("admin-private-documents")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) {
      setErrorText("Unggahan gagal. Periksa policy Storage lalu coba lagi.");
      setState("error");
      return;
    }
    setObjectPath(path);
    setFileName(file.name);
    setState("done");
  };

  return (
    <div className="doc-upload">
      <span className="doc-upload-label">{label}</span>
      {existingPath && state !== "done" && (
        <small className="doc-upload-existing">
          Berkas tersimpan: {existingPath.split("/").pop()}
        </small>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        aria-label={label}
      />
      <button
        type="button"
        className="btn secondary"
        onClick={upload}
        disabled={state === "uploading"}
      >
        {state === "uploading" ? "Mengunggah…" : "Unggah berkas"}
      </button>
      {state === "done" && (
        <small className="doc-upload-ok">
          Terunggah: {fileName}. Path tersimpan ke form.
        </small>
      )}
      {state === "error" && (
        <small className="doc-upload-error" role="alert">
          {errorText}
        </small>
      )}
      <input type="hidden" name={inputName} value={objectPath} />
    </div>
  );
}
