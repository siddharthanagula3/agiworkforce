/**
 * Utility functions for safe environment variable access
 */

/**
 * Get an environment variable with a fallback value
 * @param key - Environment variable name
 * @param fallback - Fallback value if env var is not set
 * @returns The environment variable value or fallback
 */
export function getEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

/**
 * Get a required environment variable, throwing an error if not set
 * @param key - Environment variable name
 * @returns The environment variable value
 * @throws Error if the environment variable is not set
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `FATAL: ${key} environment variable is required but not set. Please set ${key} in your environment.`,
    );
  }
  return value;
}

/**
 * Get an optional environment variable
 * @param key - Environment variable name
 * @returns The environment variable value or undefined
 */
export function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}
