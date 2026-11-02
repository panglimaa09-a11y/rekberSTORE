import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRoles = {
  roles: string[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
};

/**
 * Peran pemanggil dari tabel user_roles (RLS: baca baris sendiri).
 * Gagal baca = bukan staf (fail-closed untuk UI; penegakan akhir
 * tetap di RPC security definer di database).
 */
export async function getMyRoles(
  db: SupabaseClient,
  userId: string
): Promise<StaffRoles> {
  try {
    const { data, error } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) throw error;
    const roles = (data ?? []).map((r) => String(r.role));
    const isAdmin = roles.includes("admin");
    const isSuperAdmin = roles.includes("super_admin");
    return { roles, isAdmin, isSuperAdmin, isStaff: isAdmin || isSuperAdmin };
  } catch {
    return { roles: [], isAdmin: false, isSuperAdmin: false, isStaff: false };
  }
}
