/**
 * Canonical no-op stubs for web-port compilation.
 *
 * Many modules in the web app were ported from the desktop (Tauri) app and
 * import symbols that don't exist in the web context (IPC, native components,
 * etc.). Rather than duplicating identical stub exports in 50+ files, import
 * them from here.
 *
 * Usage:
 *   export { ErrorBoundary, BrowserVisualization, ... } from '@/utils/stubs';
 *
 * NOTE: Store hooks intentionally use broad return types to match Zustand's
 * flexible selector pattern. The `any` usages are intentional for stub
 * compatibility — the ESLint config disables no-explicit-any for utils/.
 */

import type { ReactNode } from 'react';

// Default export for modules that `export default`
const _defaultStub: Record<string, unknown> = {};
export default _defaultStub;

// ---------------------------------------------------------------------------
// Store hook type — mimics Zustand's hook signature
// Uses `any` for selector/return to match Zustand's flexible API
// ---------------------------------------------------------------------------
interface StubStoreHook {
  (selector?: (state: any) => any): any;
  getState: () => any;
  setState: (partial: Record<string, unknown>) => void;
  subscribe: (...args: any[]) => () => void;
}

function makeStoreHook(): StubStoreHook {
  const emptyState: Record<string, unknown> = {};
  const hook = ((selector?: (state: any) => any) =>
    selector ? selector(emptyState) : emptyState) as StubStoreHook;
  hook.getState = () => emptyState;
  hook.setState = () => {};
  hook.subscribe =
    (..._args: any[]) =>
    () => {};
  return hook;
}

// ---------------------------------------------------------------------------
// Store hooks (no-op selectors)
// ---------------------------------------------------------------------------
export const useAuth = () => ({ user: null });
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

// ---------------------------------------------------------------------------
// Tauri / IPC stubs
// ---------------------------------------------------------------------------
export const invoke = async <T = unknown>(..._args: unknown[]): Promise<T> => ({}) as T;
export const isTauri = false;

// ---------------------------------------------------------------------------
// Token counting
// ---------------------------------------------------------------------------
export const countTokens = () => 0;
export const getTokenPercentage = () => 0;

// ---------------------------------------------------------------------------
// Component stubs (render nothing or pass-through)
// ---------------------------------------------------------------------------
export const BrowserVisualization = (_props?: Record<string, unknown>) => null;
export const MonacoEditor = (_props?: Record<string, unknown>) => null;
export const TerminalPanel = (_props?: Record<string, unknown>) => null;
export const MemoryPanel = (_props?: Record<string, unknown>) => null;
export const ScreenCaptureButton = (_props?: Record<string, unknown>) => null;
export const TimeoutWarningDialog = (_props?: Record<string, unknown>) => null;
export const DiffViewer = (_props?: Record<string, unknown>) => null;
export const CanvasWorkspace = (_props?: Record<string, unknown>) => null;
export const SubscriptionLockDialog = (_props?: Record<string, unknown>) => null;
export const SubscriptionGate = (_props?: Record<string, unknown>) => null;

// ---------------------------------------------------------------------------
// Error boundary stubs (pass children through)
// ---------------------------------------------------------------------------
export const ErrorBoundary = ({ children }: { children: ReactNode }) => children;
export const ChatErrorBoundary = ({ children }: { children: ReactNode }) => children;

// ---------------------------------------------------------------------------
// Handler stubs
// ---------------------------------------------------------------------------
export const handleSlashCommand = () => {};
export const executeTerminalCommand = async (
  ..._args: unknown[]
): Promise<Record<string, unknown>> => ({});
export const executeBrowserCommand = async (
  ..._args: unknown[]
): Promise<Record<string, unknown>> => ({});
export const executeCodeCommand = async (
  ..._args: unknown[]
): Promise<Record<string, unknown>> => ({});
export const executeDatabaseCommand = async (
  ..._args: unknown[]
): Promise<Record<string, unknown>> => ({});
export const executeUndoCommand = async (
  ..._args: unknown[]
): Promise<Record<string, unknown>> => ({});

// ---------------------------------------------------------------------------
// Approval actions stub
// ---------------------------------------------------------------------------
export const respondToolConfirmation = async (
  _id: string,
  _decision: string | boolean,
): Promise<void> => {};

// ---------------------------------------------------------------------------
// Clipboard stub
// ---------------------------------------------------------------------------
export const copyToClipboard = async (
  text: string,
  _opts?: Record<string, unknown>,
): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Subscription gate stubs
// ---------------------------------------------------------------------------
export type SubscriptionGateResult = {
  allowed: boolean;
  hasAccess?: boolean;
  reason?: string;
  requiresUpgrade?: boolean;
  currentTier?: string;
  currentStatus?: string;
};
export type SubscriptionStatus = string;
export const checkSubscription = () => ({ allowed: true, hasAccess: true });

// ---------------------------------------------------------------------------
// Model store extra exports
// ---------------------------------------------------------------------------
export const selectLastRoutingDecision = () => ({});
export type ModelMetadata = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Project store extra exports
// ---------------------------------------------------------------------------
export const selectCurrentFolder = (state: any) =>
  ((state?.currentFolder as string) ?? null) as string | null;
export const selectRecentFolders = (state: any) =>
  ((state?.recentFolders as string[]) ?? []) as string[];
export const formatFolderPath = (p: string) => p;
export const selectActiveProjects = () => [] as Record<string, unknown>[];
export const selectArchivedProjects = () => [] as Record<string, unknown>[];
export interface Project {
  id: string;
  name: string;
  description: string;
  customInstructions: string;
  color: string;
  icon: string;
  files: ProjectFile[];
  conversationIds: string[];
  isArchived: boolean;
  createdAt: string;
  [key: string]: unknown;
}
export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Plan/theme stubs
// ---------------------------------------------------------------------------
export const LLM_MODELS: unknown[] = [];
export const PLAN_MODELS: unknown[] = [];
export const supabase: Record<string, unknown> = {};
export const supabaseAuth: Record<string, unknown> & { getUser: () => { id: string } | null } = {
  getUser: () => null,
};
export type SubscriptionTier = 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';
export const ThemeProvider = ({ children }: { children: ReactNode }) =>
  children as React.ReactElement;
export const useTheme = () => ({ theme: 'dark' as string, setTheme: (_t: string) => {} });
export const useThemeContext = () => ({ theme: 'dark' as string, setTheme: (_t: string) => {} });

// Explicit React import for ThemeProvider return type
import type React from 'react';
