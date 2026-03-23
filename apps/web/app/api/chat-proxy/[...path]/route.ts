import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Auth-gated proxy for the desktop Vite SPA at /chat.
 *
 * Flow:
 *   1. Check Supabase auth session
 *   2. If not authenticated → redirect to /login?redirectTo=/chat
 *   3. If authenticated → serve the static SPA file from public/chat/
 *
 * This replaces the direct static file serving so we get server-side
 * auth protection — same pattern as Claude.ai, ChatGPT, Gemini.
 */

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function getMimeType(path: string): string {
  const ext = path.substring(path.lastIndexOf('.'));
  return MIME_TYPES[ext] || 'application/octet-stream';
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  try {
    const supabase = createServerClient(
      process.env['NEXT_PUBLIC_SUPABASE_URL'] || process.env['SUPABASE_URL']!,
      process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env['SUPABASE_ANON_KEY']!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(_name: string, _value: string, _options: CookieOptions) {
            // Read-only in route handler
          },
          remove(_name: string, _options: CookieOptions) {
            // Read-only in route handler
          },
        },
      },
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();
    return !!session;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await params;
  const filePath = pathSegments?.join('/') || 'index.html';

  // Static assets (JS, CSS, fonts, images) — serve without auth check for performance
  const isAsset = /\.(js|css|png|jpg|svg|ico|woff2?|ttf|json|map)$/i.test(filePath);

  if (!isAsset) {
    // HTML/SPA routes — require auth
    const isAuthenticated = await checkAuth(request);
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirectTo', '/chat');
      return NextResponse.redirect(loginUrl);
    }
  }

  // Serve the file from public/chat/
  try {
    const resolvedPath = join(process.cwd(), 'public', 'chat', filePath);

    // Prevent path traversal
    if (!resolvedPath.startsWith(join(process.cwd(), 'public', 'chat'))) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const file = await readFile(resolvedPath);
    const contentType = getMimeType(filePath);

    return new NextResponse(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    });
  } catch {
    // File not found — serve index.html for SPA routing
    try {
      const indexPath = join(process.cwd(), 'public', 'chat', 'index.html');
      const indexFile = await readFile(indexPath);

      // SPA fallback also needs auth
      const isAuthenticated = await checkAuth(request);
      if (!isAuthenticated) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirectTo', '/chat');
        return NextResponse.redirect(loginUrl);
      }

      return new NextResponse(indexFile, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return new NextResponse('Not Found', { status: 404 });
    }
  }
}
