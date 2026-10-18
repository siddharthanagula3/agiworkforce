export function getEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `FATAL: ${key} environment variable is required but not set. Please set ${key} in your environment.`,
    );
  }
  return value;
}

export function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}
