export function requireEnv(name: string): string {
  const value =
    process.env[name] ??
    (name === 'NEON_DATABASE_URL' ? process.env['DATABASE_URL'] : undefined) ??
    (name === 'DATABASE_URL' ? process.env['NEON_DATABASE_URL'] : undefined);
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
  requireEnv('NEON_DATABASE_URL');

  const pairingConfigured =
    process.env['NODE_ENV'] === 'production' ||
    Boolean(process.env['SIGNALING_HTTP_URL']) ||
    process.env['ENABLE_MOBILE_PAIRING'] === 'true';
  if (pairingConfigured) {
    requireEnv('SIGNALING_INTERNAL_SECRET');
  }
}
