"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel?: string;
};

/**
 * Tombol kirim dengan status loading dari form terdekat (useFormStatus).
 * Logika server action tidak diubah: komponen ini hanya menonaktifkan
 * tombol dan mengganti label selama pengiriman berlangsung.
 */
export default function SubmitButton({
  children,
  pendingLabel = "Memproses…",
  className,
  disabled,
  type = "submit",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  return (
    <button
      {...props}
      type={type}
      className={className}
      disabled={isDisabled}
      aria-disabled={isDisabled}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
