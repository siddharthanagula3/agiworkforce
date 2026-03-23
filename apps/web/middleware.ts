import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Edge Middleware — auth guard for /chat and /billing.
 * Runs BEFORE static files on Vercel Edge Network.
 * Same pattern as Claude.ai, ChatGPT, Gemini, Perplexity.
 */
export async function middleware(request: NextRequest) {
  // Skip auth for static assets (JS, CSS, images, fonts)
  const pathname = request.nextUrl.pathname;
  if (/\.(js|css|png|jpg|svg|ico|woff2?|ttf|json|map)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env['SUPABASE_URL'] || '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env['SUPABASE_ANON_KEY'] || '',
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/chat', '/chat/:path*', '/billing', '/billing/:path*'],
};
