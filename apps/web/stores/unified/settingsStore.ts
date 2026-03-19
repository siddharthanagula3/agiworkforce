/**
 * STUB: Desktop-port compilation shim. Returns empty state.
 * Web app should use real implementations when available.
 *
 * Fields like chatPreferences.compactMode, alwaysUseAgentMode are desktop-only
 * and intentionally return false on web. The llmConfig shape delegates to the
 * real settingsStore (stores/settingsStore.ts) where possible.
 */

/** Empty state object used as default for all stub stores */
const EMPTY_STATE: Record<string, never> = {};

/**
 * Creates a stub Zustand-compatible hook with getState() support.
 * Accepts an optional selector; returns empty object if no selector or result of selector(empty).
 */
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

/** Typed chat preferences shape mirroring desktop settingsStore.ChatPreferences */
interface ChatPreferences {
  promptCompletionEnabled: boolean;
  alwaysUseAgentMode: boolean;
  compactMode: boolean;
  autoApproveTools: boolean;
  autoInjectSkills?: boolean;
}

/** Typed settings state for web stub — includes fields accessed by shared UnifiedAgenticChat */
interface SettingsStubState {
  chatPreferences: ChatPreferences;
}

const SETTINGS_STUB_STATE: SettingsStubState = {
  chatPreferences: {
    promptCompletionEnabled: false,
    alwaysUseAgentMode: false,
    compactMode: false,
    autoApproveTools: false,
    autoInjectSkills: false,
  },
};

interface SettingsStoreHook {
  <T>(selector: (state: SettingsStubState) => T): T;
  (): SettingsStubState;
  getState: () => SettingsStubState;
}

const settingsStoreHook: SettingsStoreHook = ((selector?: (state: SettingsStubState) => unknown) =>
  selector ? selector(SETTINGS_STUB_STATE) : SETTINGS_STUB_STATE) as SettingsStoreHook;
settingsStoreHook.getState = () => SETTINGS_STUB_STATE;

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
export const useSettingsStore = settingsStoreHook;
export const useBillingUsageStore = createStubStore();

// General dummy exports (covers many cases)
export const invoke = async () => ({});
export const isTauri = false;
export const countTokens = () => 0;
export const getTokenPercentage = () => 0;

export const BrowserVisualization = (_props?: Record<string, unknown>) => null;
export const MonacoEditor = (_props?: Record<string, unknown>) => null;
export const TerminalPanel = (_props?: Record<string, unknown>) => null;
export const MemoryPanel = (_props?: Record<string, unknown>) => null;
export const ScreenCaptureButton = (_props?: Record<string, unknown>) => null;
export const ErrorBoundary = ({ children }: { children: React.ReactNode }) => children;
export const TimeoutWarningDialog = (_props?: Record<string, unknown>) => null;
export const DiffViewer = (_props?: Record<string, unknown>) => null;

export const handleSlashCommand = () => {};

// Missing named exports from settingsStore stub
export type Provider = string;
