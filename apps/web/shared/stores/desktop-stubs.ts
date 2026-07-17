/**
 * Shared desktop-port compilation stubs.
 *
 * FIX (audit 2026-05-20, §8): the previous default export was
 * `export default {} as any;` — a stub that silently swallowed any call.
 * It is now a typed empty record so consumers either:
 *
 *   1. Use a named export (preferred — every store hook is named below), or
 *   2. Type-check against `DesktopStubsDefault` and see the empty shape.
 *
 * Each store hook still no-ops because the web bundle imports them through
 * this module (`apps/web/shared/stores/desktop-stubs.ts`) and the *callers* are runtime-gated
 * behind `isTauri()` / `isCloudWeb()` (see `packages/client/client-runtime/src/detect.ts`).
 * If a future call reaches a stub on the web, the dev-only warn surfaces
 * the mistake without crashing the render.
 *
 * Individual stub files (mediaGenerationStore.ts, etc.) re-export from here
 * and add file-specific extras as needed.
 */

/** Shape of the default export. Intentionally empty; not a passthrough. */
export type DesktopStubsDefault = Record<string, never>;
const defaultExport: DesktopStubsDefault = Object.freeze({});

export const _stub = true;
export default defaultExport;

/** Dev-only call notice so a misrouted call surfaces in the console. */
function warnStubCalled(name: string): void {
  if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] !== 'production') {
    console.warn(
      `[desktop-stubs] ${name} was called on the web bundle. ` +
        'This hook is desktop-only and should be guarded by isTauri()/isCloudWeb().',
    );
  }
}

type StoreSelector<S> = (state: S) => unknown;
type StubHook<S> = ((selector?: StoreSelector<S>) => unknown) & {
  getState: () => S;
};

/** Factory: produce a no-op hook whose default state is `{}`. */
function makeStubHook(name: string): StubHook<Record<string, never>> {
  const empty = Object.freeze({}) as Record<string, never>;
  const fn = ((selector?: StoreSelector<Record<string, never>>) => {
    warnStubCalled(name);
    return selector ? selector(empty) : empty;
  }) as StubHook<Record<string, never>>;
  fn.getState = () => empty;
  return fn;
}

export const useAuth = (): { user: null } => {
  warnStubCalled('useAuth');
  return { user: null };
};

export const useAccountStore = makeStubHook('useAccountStore');
export const useModelStore = makeStubHook('useModelStore');
export const useProjectStore = makeStubHook('useProjectStore');
export const useMemoryStore = makeStubHook('useMemoryStore');
export const useArtifactStore = makeStubHook('useArtifactStore');
export const useExecutionStore = makeStubHook('useExecutionStore');
export const useTerminalStore = makeStubHook('useTerminalStore');
export const useBrowserStore = makeStubHook('useBrowserStore');
export const useMcpStore = makeStubHook('useMcpStore');
export const useUpdaterStore = makeStubHook('useUpdaterStore');
export const useUsageStore = makeStubHook('useUsageStore');
export const useCloudStore = makeStubHook('useCloudStore');
export const useAutomationStore = makeStubHook('useAutomationStore');
export const useErrorStore = makeStubHook('useErrorStore');
export const useSchedulerStore = makeStubHook('useSchedulerStore');
export const useMediaGenerationStore = makeStubHook('useMediaGenerationStore');
export const useCustomInstructionsStore = makeStubHook('useCustomInstructionsStore');
export const useCodeStore = makeStubHook('useCodeStore');
export const useSettingsStore = makeStubHook('useSettingsStore');
export const useBillingUsageStore = makeStubHook('useBillingUsageStore');

// General dummy exports (covers many cases)
export const invoke = async (): Promise<Record<string, never>> => {
  warnStubCalled('invoke');
  return {};
};
export const isTauri = false;
export const countTokens = (): number => 0;
export const getTokenPercentage = (): number => 0;

// React-component stubs. Typed as null-returning components so consumers
// importing them as JSX still type-check.
import type { ReactNode } from 'react';
type StubComponentProps = Record<string, unknown>;
export const BrowserVisualization = (_props?: StubComponentProps): null => null;
export const MonacoEditor = (_props?: StubComponentProps): null => null;
export const TerminalPanel = (_props?: StubComponentProps): null => null;
export const MemoryPanel = (_props?: StubComponentProps): null => null;
export const ScreenCaptureButton = (_props?: StubComponentProps): null => null;
export const ErrorBoundary = ({ children }: { children: ReactNode }): ReactNode => children;
export const TimeoutWarningDialog = (_props?: StubComponentProps): null => null;
export const DiffViewer = (_props?: StubComponentProps): null => null;

export const handleSlashCommand = (): void => {};
