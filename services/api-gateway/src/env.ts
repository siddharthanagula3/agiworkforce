export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `FATAL: ${name} environment variable is required but not set. Set ${name} in .env file.`,
    );
  }
  return value;
}
