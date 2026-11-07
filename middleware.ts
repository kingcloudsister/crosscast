import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Every page and API route requires a signed-in Supabase user, except the login page itself.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";
  let response = NextResponse.next({ request });
  let user = null;

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // getUser() checks the token with Supabase Auth instead of trusting the cookie, and refreshes expired sessions.
    ({
      data: { user },
    } = await supabase.auth.getUser());
  }

  if (!user && !isLoginPage) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in to Crosscast." }, { status: 401 });
    }
    return redirectWithCookies(request, response, "/login");
  }

  if (user && isLoginPage) {
    return redirectWithCookies(request, response, "/");
  }

  return response;
}

function redirectWithCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const redirect = NextResponse.redirect(new URL(pathname, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  // Skip Next assets and the public PWA files, which the browser may fetch without the session cookie.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
