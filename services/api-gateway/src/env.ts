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
}
