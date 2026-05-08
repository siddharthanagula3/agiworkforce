export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `FATAL: ${name} environment variable is required but not set. Set ${name} in your deployment environment (e.g., Vercel, Railway, etc.).`,
    );
  }
  return value;
}

/**
 * Validates that all required startup environment variables are present.
 * Call this once at process start before initialising any services.
 * Throws on the first missing variable so the process exits with a clear error.
 */
export function validateStartupEnv(): void {
  requireEnv('JWT_SECRET');
  requireEnv('SUPABASE_URL');
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  // P0-G (2026-05-08): the gateway mints per-request Supabase JWTs to
  // drive RLS in user-scoped routes. SUPABASE_ANON_KEY is the public
  // PostgREST key used as the apikey header; SUPABASE_JWT_SECRET is the
  // shared secret PostgREST verifies the gateway-minted JWT against.
  // Both are in the Supabase project's "Project Settings → API" panel.
  // Deploy-time prereq for Fly.io:
  //   fly secrets set SUPABASE_ANON_KEY=...
  //   fly secrets set SUPABASE_JWT_SECRET=...
  requireEnv('SUPABASE_ANON_KEY');
  requireEnv('SUPABASE_JWT_SECRET');
}
