// STUB FILE FOR WEB PORT COMPILATION
// Re-exports minimal working stubs for hooks that are desktop-only.
// The actual implementations exist in stores/unified/*.ts.
export const _stub = true;
export default {} as any;
export const useAuth = () => ({ user: null as any });

// Desktop-only stores — provide functional no-op stubs for web compilation.
// Each stub supports selector usage: useXStore(selector) and useXStore.getState()

const makeStoreHook = () => {
  const hook: any = (selector?: any) => (selector ? selector({} as any) : ({} as any));
  hook.getState = () => ({}) as any;
  hook.setState = () => {};
  hook.subscribe = () => () => {};
  return hook;
};

export const useAccountStore = makeStoreHook();
export const useModelStore = makeStoreHook();
export const useProjectStore = makeStoreHook();
export const useMemoryStore = makeStoreHook();
export const useArtifactStore = makeStoreHook();
export const useExecutionStore = makeStoreHook();
export const useTerminalStore = makeStoreHook();
export const useBrowserStore = makeStoreHook();
export const useMcpStore = makeStoreHook();
export const useUpdaterStore = makeStoreHook();
export const useUsageStore = makeStoreHook();
export const useCloudStore = makeStoreHook();
export const useAutomationStore = makeStoreHook();
export const useErrorStore = makeStoreHook();
export const useSchedulerStore = makeStoreHook();
export const useMediaGenerationStore = makeStoreHook();
export const useCustomInstructionsStore = makeStoreHook();
export const useCodeStore = makeStoreHook();
export const useSettingsStore = makeStoreHook();
export const useBillingUsageStore = makeStoreHook();

// General dummy exports
export const invoke = async () => ({}) as any;
export const isTauri = false;
export const countTokens = () => 0;
export const getTokenPercentage = () => 0;

export const BrowserVisualization = (_props?: any) => null;
export const MonacoEditor = (_props?: any) => null;
export const TerminalPanel = (_props?: any) => null;
export const MemoryPanel = (_props?: any) => null;
export const ScreenCaptureButton = (_props?: any) => null;
export const ErrorBoundary = ({ children }: any) => children as any;
export const TimeoutWarningDialog = (_props?: any) => null;
export const DiffViewer = (_props?: any) => null;

export const handleSlashCommand = () => {};
