"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
export async function login(form:FormData){const p=z.object({email:z.string().email(),password:z.string().min(8)}).safeParse({email:form.get("email"),password:form.get("password")});if(!p.success)redirect("/login?error=invalid");const s=await supabaseServer();const {error}=await s.auth.signInWithPassword(p.data);if(error)redirect("/login?error=invalid");redirect("/dashboard");}
export async function register(form:FormData){const p=z.object({name:z.string().min(2).max(100),email:z.string().email(),password:z.string().min(8)}).safeParse({name:form.get("name"),email:form.get("email"),password:form.get("password")});if(!p.success)redirect("/register?error=invalid");const s=await supabaseServer();const {error}=await s.auth.signUp({email:p.data.email,password:p.data.password,options:{data:{display_name:p.data.name}}});if(error)redirect("/register?error=failed");redirect("/register?success=check_email");}
export async function logout(){const s=await supabaseServer();await s.auth.signOut();redirect("/");}
