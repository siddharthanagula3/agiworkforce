/**
 * STUB: Desktop-port compilation shim. Returns empty state.
 * Web app should use real implementations when available.
 */
export const _stub = true;
export default {} as any;
export const useAuth = () => ({ user: null });
const _useAccountStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useAccountStoreFn.getState = () => ({});
export const useAccountStore = _useAccountStoreFn;
const _useModelStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useModelStoreFn.getState = () => ({});
export const useModelStore = _useModelStoreFn;
// Mutable state backing the useProjectStore stub (supports FolderSelector tests)
let _projectStore: Record<string, unknown> = {
  currentFolder: null as string | null,
  recentFolders: [] as string[],
  projects: [] as any[],
  setCurrentFolder: (folder: string | null) => {
    _projectStore = { ..._projectStore, currentFolder: folder };
  },
  removeRecentFolder: (path: string) => {
    _projectStore = {
      ..._projectStore,
      recentFolders: (_projectStore['recentFolders'] as string[]).filter((f) => f !== path),
    };
  },
  clearRecentFolders: () => {
    _projectStore = { ..._projectStore, recentFolders: [] };
  },
};
const _useProjectStoreFn: any = (selector?: any) =>
  selector ? selector(_projectStore) : _projectStore;
_useProjectStoreFn.getState = () => _projectStore;
_useProjectStoreFn.setState = (partial: any) => {
  _projectStore = { ..._projectStore, ...partial };
};
export const useProjectStore = _useProjectStoreFn;
const _useMemoryStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useMemoryStoreFn.getState = () => ({});
export const useMemoryStore = _useMemoryStoreFn;
const _useArtifactStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useArtifactStoreFn.getState = () => ({});
export const useArtifactStore = _useArtifactStoreFn;
const _useExecutionStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useExecutionStoreFn.getState = () => ({});
export const useExecutionStore = _useExecutionStoreFn;
const _useTerminalStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useTerminalStoreFn.getState = () => ({});
export const useTerminalStore = _useTerminalStoreFn;
const _useBrowserStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useBrowserStoreFn.getState = () => ({});
export const useBrowserStore = _useBrowserStoreFn;
const _useMcpStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useMcpStoreFn.getState = () => ({});
export const useMcpStore = _useMcpStoreFn;
const _useUpdaterStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useUpdaterStoreFn.getState = () => ({});
export const useUpdaterStore = _useUpdaterStoreFn;
const _useUsageStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useUsageStoreFn.getState = () => ({});
export const useUsageStore = _useUsageStoreFn;
const _useCloudStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useCloudStoreFn.getState = () => ({});
export const useCloudStore = _useCloudStoreFn;
const _useAutomationStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useAutomationStoreFn.getState = () => ({});
export const useAutomationStore = _useAutomationStoreFn;
const _useErrorStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useErrorStoreFn.getState = () => ({});
export const useErrorStore = _useErrorStoreFn;
const _useSchedulerStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useSchedulerStoreFn.getState = () => ({});
export const useSchedulerStore = _useSchedulerStoreFn;
const _useMediaGenerationStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useMediaGenerationStoreFn.getState = () => ({});
export const useMediaGenerationStore = _useMediaGenerationStoreFn;
const _useCustomInstructionsStoreFn: any = (selector?: any) =>
  selector ? selector({} as any) : {};
_useCustomInstructionsStoreFn.getState = () => ({});
export const useCustomInstructionsStore = _useCustomInstructionsStoreFn;
const _useCodeStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useCodeStoreFn.getState = () => ({});
export const useCodeStore = _useCodeStoreFn;
const _useSettingsStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useSettingsStoreFn.getState = () => ({});
export const useSettingsStore = _useSettingsStoreFn;
const _useBillingUsageStoreFn: any = (selector?: any) => (selector ? selector({} as any) : {});
_useBillingUsageStoreFn.getState = () => ({});
export const useBillingUsageStore = _useBillingUsageStoreFn;

// General dummy exports (covers many cases)
export const invoke = async () => ({});
export const isTauri = false;
export const countTokens = () => 0;
export const getTokenPercentage = () => 0;

export const BrowserVisualization = (_props?: any) => null;
export const MonacoEditor = (_props?: any) => null;
export const TerminalPanel = (_props?: any) => null;
export const MemoryPanel = (_props?: any) => null;
export const ScreenCaptureButton = (_props?: any) => null;
export const ErrorBoundary = ({ children }: any) => children;
export const TimeoutWarningDialog = (_props?: any) => null;
export const DiffViewer = (_props?: any) => null;

export const handleSlashCommand = () => {};
// ... will add more if tsc complains

// Missing named exports from projectStore stub
export const selectCurrentFolder = (state: any) => (state?.currentFolder ?? null) as string | null;
export const selectRecentFolders = (state: any) => (state?.recentFolders ?? []) as string[];
export const formatFolderPath = (p: string) => p;
export const selectActiveProjects = () => [] as any[];
export const selectArchivedProjects = () => [] as any[];
export type Project = any;
export type ProjectFile = any;
