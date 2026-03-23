import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Root /chat handler — serves index.html after auth check.
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env['SUPABASE_URL']!,
      process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env['SUPABASE_ANON_KEY']!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(_name: string, _value: string, _options: CookieOptions) {},
          remove(_name: string, _options: CookieOptions) {},
        },
      },
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirectTo', '/chat');
      return NextResponse.redirect(loginUrl);
    }

    const indexPath = join(process.cwd(), 'public', 'chat', 'index.html');
    const file = await readFile(indexPath);

    return new NextResponse(file, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return new NextResponse('Chat interface unavailable', { status: 500 });
  }
}
