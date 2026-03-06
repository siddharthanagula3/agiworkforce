// STUB FILE FOR WEB PORT COMPILATION
// Provides no-op store hooks that mimic Zustand's selector pattern
// for desktop-only scheduler store that doesn't exist in the web app.

/** Empty state object used as default for all stub stores */
const EMPTY_STATE: Record<string, never> = {};

interface StubStoreHook {
  <T>(selector: (state: Record<string, never>) => T): T;
  (): Record<string, never>;
  getState: () => Record<string, never>;
}

function createStubStore(): StubStoreHook {
  const hook = ((selector?: (state: Record<string, never>) => unknown) =>
    selector ? selector(EMPTY_STATE) : EMPTY_STATE) as StubStoreHook;
  hook.getState = () => EMPTY_STATE;
  return hook;
}

export const _stub = true;
export default EMPTY_STATE;
export const useAuth = () => ({ user: null });
export const useAccountStore = createStubStore();
export const useModelStore = createStubStore();
export const useProjectStore = createStubStore();
export const useMemoryStore = createStubStore();
export const useArtifactStore = createStubStore();
export const useExecutionStore = createStubStore();
export const useTerminalStore = createStubStore();
export const useBrowserStore = createStubStore();
export const useMcpStore = createStubStore();
export const useUpdaterStore = createStubStore();
export const useUsageStore = createStubStore();
export const useCloudStore = createStubStore();
export const useAutomationStore = createStubStore();
export const useErrorStore = createStubStore();
export const useSchedulerStore = createStubStore();
export const useMediaGenerationStore = createStubStore();
export const useCustomInstructionsStore = createStubStore();
export const useCodeStore = createStubStore();
export const useSettingsStore = createStubStore();
export const useBillingUsageStore = createStubStore();

// General dummy exports (covers many cases)
export const invoke = async () => ({});
export const isTauri = false;
export const countTokens = () => 0;
export const getTokenPercentage = () => 0;

export const BrowserVisualization = () => null;
export const MonacoEditor = () => null;
export const TerminalPanel = () => null;
export const MemoryPanel = () => null;
export const ScreenCaptureButton = () => null;
export const ErrorBoundary = ({ children }: { children: React.ReactNode }) => children;
export const TimeoutWarningDialog = () => null;
export const DiffViewer = () => null;

export const handleSlashCommand = () => {};
