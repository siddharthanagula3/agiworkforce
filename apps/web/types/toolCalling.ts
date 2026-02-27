
// STUB FILE FOR WEB PORT COMPILATION
export const _stub = true;
export default {} as any;

export interface DiffData {
  file_path?: string;
  old_content?: string;
  new_content?: string;
  hunks: Array<{
    old_start: number;
    old_lines: number;
    new_start: number;
    new_lines: number;
    lines: Array<{
      type: 'add' | 'remove' | 'context';
      content: string;
      line_number?: number;
    }>;
  }>;
}
export const useAuth = () => ({ user: null });
export const useAccountStore = () => ({});
export const useModelStore = () => ({});
export const useProjectStore = () => ({});
export const useMemoryStore = () => ({});
export const useArtifactStore = () => ({});
export const useExecutionStore = () => ({});
export const useTerminalStore = () => ({});
export const useBrowserStore = () => ({});
export const useMcpStore = () => ({});
export const useUpdaterStore = () => ({});
export const useUsageStore = () => ({});
export const useCloudStore = () => ({});
export const useAutomationStore = () => ({});
export const useErrorStore = () => ({});
export const useSchedulerStore = () => ({});
export const useMediaGenerationStore = () => ({});
export const useCustomInstructionsStore = () => ({});
export const useCodeStore = () => ({});
export const useSettingsStore = () => ({});
export const useBillingUsageStore = () => ({});

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
export const ErrorBoundary = ({children}: any) => children;
export const TimeoutWarningDialog = () => null;
export const DiffViewer = () => null;

export const handleSlashCommand = () => {};
// ... will add more if tsc complains
