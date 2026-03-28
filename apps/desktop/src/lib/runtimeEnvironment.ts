export const isTauri =
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export const isTestEnvironment =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']);

export const isCloudWeb = !isTauri && !isTestEnvironment;
