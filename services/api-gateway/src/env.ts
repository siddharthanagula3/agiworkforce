export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `FATAL: ${name} environment variable is required but not set. Set ${name} in your deployment environment (e.g., Vercel, Railway, etc.).`,
    );
  }
  return value;
}
