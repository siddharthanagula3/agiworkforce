/**
 * Runtime environment detection for AGI Workforce.
 *
 * Detects whether code is running inside Tauri (desktop), a browser (cloud web),
 * or a test environment. All detection is based on global markers — no side effects.
 */

export enum RuntimeEnv {
  Tauri = 'tauri',
  CloudWeb = 'cloud-web',
  Test = 'test',
}

/** True when running inside the Tauri desktop shell. */
export const isTauri: boolean =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

/** True when running in a test runner (Vitest / Jest / Node test). */
export const isTest: boolean =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']);

/** True when running in a server-side Node.js context (SSR, API routes). */
export const isServer: boolean = typeof window === 'undefined' && !isTest;

/** True when running in a browser without Tauri (cloud/web mode). */
export const isCloudWeb: boolean = !isTauri && !isTest && !isServer;

/** Returns the current runtime environment as an enum value. */
export function getRuntimeEnv(): RuntimeEnv {
  if (isTauri) return RuntimeEnv.Tauri;
  if (isTest) return RuntimeEnv.Test;
  return RuntimeEnv.CloudWeb;
}
