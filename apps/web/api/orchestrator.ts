// Web stub for orchestrator — provides the same API surface as the desktop version
// but routes agent execution to the Next.js /api/agents/execute endpoint.

export const _stub = true;
export default {} as any;
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
export const isTauri = false;
export const countTokens = () => 0;
export const getTokenPercentage = () => 0;

export const BrowserVisualization = () => null;
export const MonacoEditor = () => null;
export const TerminalPanel = () => null;
export const MemoryPanel = () => null;
export const ScreenCaptureButton = () => null;
export const ErrorBoundary = ({ children }: any) => children;
export const TimeoutWarningDialog = () => null;
export const DiffViewer = () => null;

export const handleSlashCommand = () => {};

// --- Orchestrator types ---

export type AgentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SpawnAgentPayload {
  description: string;
  priority?: AgentPriority;
  deadline?: number;
  successCriteria?: string[];
}

// --- Orchestrator actions (web implementation via /api/agents/execute) ---

/**
 * Spawn an agent in the web environment by calling /api/agents/execute.
 * Uses "general" as the employeeId when no specific employee is targeted.
 */
export async function spawnAgent(payload: SpawnAgentPayload): Promise<string> {
  const agentId = `web-agent-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const response = await fetch('/api/agents/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: 'general',
        message: payload.description,
        model: 'auto',
      }),
    });

    if (!response.ok) {
      console.warn(`[orchestrator] spawnAgent HTTP ${response.status}`, payload);
    }
  } catch (error) {
    console.warn('[orchestrator] spawnAgent fetch failed:', error);
  }

  return agentId;
}

export async function cancelAgent(agentId: string): Promise<void> {
  console.debug('[orchestrator] cancelAgent (web no-op):', agentId);
}

export async function listAgents(): Promise<unknown[]> {
  return [];
}

/**
 * invoke stub for web — routes to real fetch or returns empty object.
 * New code should call fetch() directly rather than invoke().
 */
export const invoke = async (cmd: string, _args?: Record<string, unknown>): Promise<unknown> => {
  console.warn(`[orchestrator] invoke('${cmd}') called in web environment — use fetch() instead.`);
  return {};
};
