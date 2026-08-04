/**
 * Build-time flag injected by Vite (`define` in vite.config.ts) when the
 * bundle targets the Electron cloud shell. Undefined under plain tsc/tools
 * that do not run the Vite pipeline, hence the typeof guard.
 */
declare const __ELECTRON_BUILD__: boolean | undefined;

const runtimeGlobal =
  typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>) : undefined;
const browserWindow =
  typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : undefined;

export const isTauri = Boolean(
  runtimeGlobal?.['isTauri'] ||
  browserWindow?.['__TAURI_INTERNALS__'] ||
  browserWindow?.['__TAURI__'],
);

/**
 * True inside the cloud-only Electron shell (`VITE_BUILD_TARGET=electron`).
 * The Electron renderer behaves like the cloud-web build (`isCloudWeb` stays
 * true there) but is NOT same-origin with the API, so absolute API bases and
 * the preload host bridge apply.
 */
export const isElectronHost =
  typeof __ELECTRON_BUILD__ !== 'undefined' && __ELECTRON_BUILD__ === true;

export const isTestEnvironment =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || !!process.env['VITEST']);

export const isDesktopUiDevLocal =
  !isTauri &&
  !isTestEnvironment &&
  import.meta.env.DEV &&
  import.meta.env['VITE_DESKTOP_UI_DEV_LOCAL'] === '1';

export const supportsLocalAppMode = isTauri || isDesktopUiDevLocal;

export const isCloudWeb = !supportsLocalAppMode && !isTestEnvironment;
