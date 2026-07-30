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

function validateOptionalInteger(name: string, minimum: number, maximum: number): void {
  const raw = process.env[name];
  if (raw === undefined) return;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`FATAL: ${name} must be an integer between ${minimum} and ${maximum}.`);
  }
}

/**
 * Validates that all required startup environment variables are present.
 * Call this once at process start before initialising any services.
 * Throws on the first missing variable so the process exits with a clear error.
 */
export function validateStartupEnv(): void {
  requireEnv('JWT_SECRET');
  requireEnv('NEON_DATABASE_URL');
  validateOptionalInteger('PORT', 1, 65_535);
  validateOptionalInteger('SHUTDOWN_GRACE_MS', 1_000, 300_000);
  validateOptionalInteger('WS_MAX_MESSAGE_SIZE', 1_024, 16 * 1024 * 1024);
  validateOptionalInteger('WS_AUTH_TIMEOUT_MS', 1_000, 300_000);

  if (process.env['HOST'] !== undefined && !process.env['HOST']?.trim()) {
    throw new Error('FATAL: HOST must not be empty when set.');
  }

  const pairingConfigured =
    process.env['NODE_ENV'] === 'production' ||
    Boolean(process.env['SIGNALING_HTTP_URL']) ||
    process.env['ENABLE_MOBILE_PAIRING'] === 'true';
  if (pairingConfigured) {
    requireEnv('SIGNALING_INTERNAL_SECRET');
  }
}
