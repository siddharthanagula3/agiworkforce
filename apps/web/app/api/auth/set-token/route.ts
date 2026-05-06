import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireCsrfToken } from '@/lib/csrf';
import { requireEnv } from '@/utils/env';
import { withRateLimit } from '@/lib/rate-limit';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

// JWTs are typically 200-2000 chars; refresh tokens similar. 4 KB is a generous cap that rejects junk.
const TOKEN_MAX_BYTES = 4096;

const BodySchema = z.object({
  token: z.string().min(20).max(TOKEN_MAX_BYTES).optional(),
  refreshToken: z.string().min(20).max(TOKEN_MAX_BYTES).optional(),
});

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'auth-login');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  let parsed: z.infer<typeof BodySchema>;
  try {
    const raw = await request.json();
    parsed = BodySchema.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  if (!parsed.token && !parsed.refreshToken) {
    return NextResponse.json({ ok: false, error: 'No token provided' }, { status: 400 });
  }

  // Fix WEB-SET-TOKEN-UNVALIDATED: verify the access token actually belongs to a real Supabase user
  // before setting it as a session cookie. This blocks the WEB-CSRF-ANON-FORGE attack chain
  // (anon CSRF token + this endpoint = forged auth cookie) by requiring a valid JWT.
  //
  // WEB-SET-TOKEN-REFRESHTOKEN-UNVALIDATED fix (2026-05-04 audit):
  // Previously the validation gate was `if (parsed.token)`, so a request that
  // supplied ONLY `refreshToken` skipped validation entirely and the
  // `agi_refresh_token` cookie was written unconditionally. That made
  // session fixation trivial (set victim's browser cookie to attacker's
  // refresh token, victim's next session refresh runs as attacker). We now
  // require either:
  //   (a) the access token to be valid and to match the refresh token's user, OR
  //   (b) the refresh token alone to successfully exchange via Supabase.
  // Either way the refresh token is proven to belong to a real account
  // before we persist it to a cookie.
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const verifier = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let verifiedUserId: string | null = null;
  if (parsed.token) {
    const { data, error } = await verifier.auth.getUser(parsed.token);
    if (error || !data?.user) {
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
    }
    verifiedUserId = data.user.id;
  }

  if (parsed.refreshToken) {
    // C-1 fix: when only a refresh_token is supplied, the previous code
    // called setSession({ access_token: '', refresh_token }) which
    // Supabase's auth-js rejects with AuthSessionMissingError, returning
    // 401 unconditionally. The refresh-only client path
    // (apps/web/shared/lib/api.ts:setRefreshToken) was therefore
    // permanently broken. refreshSession({ refresh_token }) is the
    // documented API that performs an actual refresh-token exchange and
    // returns the resulting session.
    //
    // I-1 fix: we ALWAYS call refreshSession (even when an access_token
    // is present) so the refresh_token is independently validated against
    // Supabase. Otherwise the access_token-present path defaults to
    // setSession which only verifies the access_token and trusts the
    // refresh_token without exchange -- enabling a mix-and-match attack
    // where an attacker submits their-own-access + victim's-refresh and
    // both client.user.id values come from the (attacker's) access_token.
    let refreshedUserId: string;
    try {
      const { data: refreshed, error: refreshErr } = await verifier.auth.refreshSession({
        refresh_token: parsed.refreshToken,
      });
      if (refreshErr || !refreshed?.session?.user) {
        return NextResponse.json({ ok: false, error: 'Invalid refresh token' }, { status: 401 });
      }
      refreshedUserId = refreshed.session.user.id;
    } catch {
      // refreshSession may throw on certain SDK versions for malformed input.
      return NextResponse.json({ ok: false, error: 'Invalid refresh token' }, { status: 401 });
    }
    if (verifiedUserId && refreshedUserId !== verifiedUserId) {
      // Defense against mix-and-match: attacker submits user A's valid
      // access_token alongside user B's refresh_token. Refusing here
      // ensures the cookie pair we persist always belongs to one user.
      return NextResponse.json(
        { ok: false, error: 'Token/refreshToken user mismatch' },
        { status: 401 },
      );
    }
  }

  const cookieStore = await cookies();
  if (parsed.token) {
    cookieStore.set('agi_access_token', parsed.token, COOKIE_OPTS);
  }
  if (parsed.refreshToken) {
    cookieStore.set('agi_refresh_token', parsed.refreshToken, {
      ...COOKIE_OPTS,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }

  return NextResponse.json({ ok: true });
}
