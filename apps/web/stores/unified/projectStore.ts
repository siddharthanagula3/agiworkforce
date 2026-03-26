export {
  _stub,
  useAuth,
  useAccountStore,
  useModelStore,
  useMemoryStore,
  useArtifactStore,
  useExecutionStore,
  useTerminalStore,
  useBrowserStore,
  useMcpStore,
  useUpdaterStore,
  useUsageStore,
  useCloudStore,
  useAutomationStore,
  useErrorStore,
  useSchedulerStore,
  useMediaGenerationStore,
  useCustomInstructionsStore,
  useCodeStore,
  useSettingsStore,
  useBillingUsageStore,
  invoke,
  isTauri,
  countTokens,
  getTokenPercentage,
  BrowserVisualization,
  MonacoEditor,
  TerminalPanel,
  MemoryPanel,
  ScreenCaptureButton,
  ErrorBoundary,
  TimeoutWarningDialog,
  DiffViewer,
  handleSlashCommand,
} from './desktop-stubs';

export { default } from './desktop-stubs';

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

// projectStore-specific exports
export const selectCurrentFolder = (state: any) => (state?.currentFolder ?? null) as string | null;
export const selectRecentFolders = (state: any) => (state?.recentFolders ?? []) as string[];
export const formatFolderPath = (p: string) => p;
export const selectActiveProjects = () => [] as any[];
export const selectArchivedProjects = () => [] as any[];
export type Project = any;
export type ProjectFile = any;
