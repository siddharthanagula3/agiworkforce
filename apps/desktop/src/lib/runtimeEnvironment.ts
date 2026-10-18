const runtimeGlobal =
  typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>) : undefined;
const browserWindow =
  typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : undefined;

export const isTauri = Boolean(
  runtimeGlobal?.['isTauri'] ||
  browserWindow?.['__TAURI_INTERNALS__'] ||
  browserWindow?.['__TAURI__'],
);

export const isTestEnvironment =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']);

export const isDesktopUiDevLocal =
  !isTauri &&
  !isTestEnvironment &&
  import.meta.env.DEV &&
  import.meta.env['VITE_DESKTOP_UI_DEV_LOCAL'] === '1';

export const supportsLocalAppMode = isTauri || isDesktopUiDevLocal;

export const isCloudWeb = !supportsLocalAppMode && !isTestEnvironment;
