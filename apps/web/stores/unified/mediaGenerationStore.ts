/**
 * STUB: Desktop-port compilation shim. Returns empty state with a dev-only
 * warn on call so a misrouted importer surfaces in the console.
 *
 * FIX (audit 2026-05-20, §8): the previous `export default {} as any` plus
 * 24 `as any` dummy hooks let an unguarded importer silently swallow every
 * selector call on the web bundle. The replacement uses typed no-op
 * factories (see `./desktop-stubs.ts`) and a typed default export.
 *
 * FIX (audit 2026-05-20, §8): the `_useCustomInstructionsStoreFn` line
 * previously omitted parens around the ternary body (lines 56-57 of the
 * old file) while every sibling wrapped it — a reader could mis-parse the
 * arrow-body precedence. All hooks now share one factory so the
 * inconsistency cannot recur.
 */
import {
  _stub,
  useAuth,
  useAccountStore,
  useModelStore,
  useProjectStore,
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
import type { DesktopStubsDefault } from './desktop-stubs';

export {
  _stub,
  useAuth,
  useAccountStore,
  useModelStore,
  useProjectStore,
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
};

const defaultExport: DesktopStubsDefault = Object.freeze({});
export default defaultExport;
