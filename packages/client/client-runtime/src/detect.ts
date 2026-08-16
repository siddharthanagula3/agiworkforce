
export enum RuntimeEnv {
  Tauri = 'tauri',
  CloudWeb = 'cloud-web',
  Test = 'test',
}

export const isTauri: boolean =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export const isTest: boolean =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']);

export const isServer: boolean = typeof window === 'undefined' && !isTest;

export const isCloudWeb: boolean = !isTauri && !isTest && !isServer;

export function getRuntimeEnv(): RuntimeEnv {
  if (isTauri) return RuntimeEnv.Tauri;
  if (isTest) return RuntimeEnv.Test;
  return RuntimeEnv.CloudWeb;
}
