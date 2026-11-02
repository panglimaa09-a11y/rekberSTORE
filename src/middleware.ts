import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: req
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(
        items: {
          name: string;
          value: string;
          options?: Parameters<typeof res.cookies.set>[2];
        }[]
      ) {
        items.forEach(({ name, value }) => {
          req.cookies.set(name, value);
        });

        res = NextResponse.next({
          request: req
        });

        items.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (req.nextUrl.pathname.startsWith("/dashboard") && !user) {
    const target = req.nextUrl.clone();
    target.pathname = "/login";
    return NextResponse.redirect(target);
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*"]
};