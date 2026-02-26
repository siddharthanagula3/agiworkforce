const fs = require('fs');
const path = require('path');

const MISSING_MODULES = [
  '@/api/agi_checkpoint',
  '@/components/Execution/TimeoutWarningDialog',
  '@/components/ROIDashboard/roiStore',
  '@/constants/errorMessages',
  '@/constants/event-names',
  '@/api/client',
  '@/api/orchestrator',
  '@/api/toolConfirmation',
  '@/api/workflow',
  '@/handlers/slashCommandHandlers',
  '@/stores/artifactStore',
  '@/stores/memoryStore',
  '@/stores/schedulerStore',
  '@/stores/unified/accountStore',
  '@/stores/unified/artifactStore',
  '@/stores/unified/auth',
  '@/stores/unified/automationStore',
  '@/stores/unified/billingUsage',
  '@/stores/unified/browserStore',
  '@/stores/unified/cloudStore',
  '@/stores/unified/codeStore',
  '@/stores/unified/customInstructionsStore',
  '@/stores/unified/errorStore',
  '@/stores/unified/executionStore',
  '@/stores/unified/mcpStore',
  '@/stores/unified/mediaGenerationStore',
  '@/stores/unified/memoryStore',
  '@/stores/unified/modelStore',
  '@/stores/unified/projectStore',
  '@/stores/unified/settingsStore',
  '@/stores/unified/terminalStore',
  '@/stores/unified/updaterStore',
  '@/stores/unified/usageStore',
  '@/types/analytics',
  '@/types/automationEnhanced',
  '@/types/calendar',
  '@/types/capture',
  '@/types/chat',
  '@/types/cloud',
  '@/types/document',
  '@/types/email',
  '@/types/mcp',
  '@/types/media',
  '@/types/roi',
  '@/types/supabase',
  '@/types/teams',
  '@/types/toolCalling',
  '@/types/workflow',
  '@/utils/autoCorrection',
  '@/utils/captureTransforms',
  '@/utils/clipboard',
  '@/utils/commandHistory',
  '@/utils/credits',
  '@/utils/ipc',
  '@/utils/navigation',
  '@/utils/security',
  '@/utils/subscriptionGate',
  '@/utils/tokenCount',
  '@/components/Browser/BrowserVisualization',
  '@/components/Canvas',
  '@/components/Editor/MonacoEditor',
  '@/components/ErrorBoundary',
  '@/components/Execution/TerminalPanel',
  '@/components/MemoryPanel',
  '@/components/ScreenCapture/ScreenCaptureButton',
  '@/components/Subscription',
  '@/components/UnifiedAgenticChat/Sidecar/DiffViewer'
];

const STUB_CONTENT = `
// STUB FILE FOR WEB PORT COMPILATION
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
`;

const TARGET_DIR = path.resolve(__dirname, '..');

for (const mod of MISSING_MODULES) {
  if (mod.startsWith('@/')) {
    const relativePath = mod.substring(2);
    // Determine if it should be an index file or a tsx/ts file. We will just use .ts
    // but wait, some are components which default to .tsx
    const isComponent = relativePath.startsWith('components/');
    const ext = isComponent ? '.tsx' : '.ts';
    
    // First let's check if the directory path has a slash, meaning it's a specific file
    // e.g. components/Browser/BrowserVisualization
    let filePath = path.join(TARGET_DIR, relativePath + ext);
    
    // If it's just a directory namespace import like `@/types/chat`, typically it's `types/chat/index.ts` OR `types/chat.ts`.
    // We will just create `types/chat.ts` for simplicity.
    
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    if (!fs.existsSync(filePath)) {
      // maybe it's a directory index? Let's write to .ts first
      fs.writeFileSync(filePath, STUB_CONTENT, 'utf8');
      console.log('Stubbed', filePath);
    }
  }
}

