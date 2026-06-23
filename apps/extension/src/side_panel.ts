import { QueueFullError } from '@agiworkforce/runtime';
import { getExtensionTokensCss } from './tokens';
import {
  getCoreManualModelOptions,
  normalizeModelId,
  PROVIDER_DISPLAY,
  CAPABILITY_LABEL,
  getModelMetadataById,
  getPickerModelTier,
  type ProviderId,
  type CapabilityTier,
} from '@agiworkforce/types';
import { getExtensionSendQueue } from './sendQueue';
import {
  clearChildren,
  setText,
  createElementWith,
  setChild,
  appendSvgString,
} from './dom-helpers';
import {
  saveConversation,
  listConversations,
  deleteConversation,
  type HistoryMessage,
  type ConversationEntry,
} from './features/background/conversation-history';
import { sanitizeHtml, renderMarkdown } from './features/side-panel/markdown';
import { setupVoiceInput } from './features/side-panel/voice';
import { markOnboardingComplete, isOnboardingComplete } from './features/side-panel/onboarding';
import { ALLOWED_BRIDGE_HOSTS, validateBridgeUrl, sanitizePageText } from './background/policy';
import {
  Terminal,
  FileText,
  FilePen,
  Search,
  Globe,
  CircleCheck,
  Loader2,
  Folder,
  Plug,
  ChevronRight,
  ArrowUp,
  Clock,
  Trash2,
  Monitor,
  Mic,
  Camera,
  FileImage,
  Zap,
  FileEdit,
  Copy,
  Square,
  renderIcon,
} from './assets/icons';
import {
  buildComputerUsePanel,
  COMPUTER_USE_PANEL_CSS,
  type ComputerUsePanelAPI,
} from './features/side-panel/computerUsePanel';
import {
  loadPairingState,
  requestPairing,
  unpair,
  type PairingState,
} from './features/native-bridge/pairing';
import { isMemoryItem, MEMORY_STORAGE_KEY } from './background/memory-bridge';
import { mountInviteCodeModal } from './features/cloud-bridge/InviteCodeModal';
import {
  getAuthToken,
  getRemainingFreePrompts,
  storeSessionToken,
  clearAuthToken,
  FREE_TRIAL_PROMPT_LIMIT,
  FREE_TRIAL_MODEL,
} from './features/cloud-bridge/freeTrialClient';

const extensionSendQueue = getExtensionSendQueue();

// ── Drawer: shared storage keys ──────────────────────────────────────────────
/** Storage key matching inPagePanel/setup.ts IN_PAGE_PANEL_ENABLED_KEY */
const SP_IN_PAGE_PANEL_ENABLED_KEY = 'in_page_panel_enabled';
/** Storage key matching background.ts siteAllowlistCache + inPagePanel/setup.ts */
const SP_SITE_ALLOWLIST_KEY = 'agi_site_allowlist';

/** Session timer for the stats footer in the drawer */
let _drawerSessionStart = Date.now();
let _drawerSessionTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Module-level reference to the cloud account UI refresh function.
 * Populated by buildUI() after the inner function is created so that the
 * chrome.runtime.onMessage listener (which runs at module scope, outside
 * buildUI's closure) can call it to update the quota bar and header badge
 * in response to FREE_PROMPTS_UPDATED / __QUOTA_EXCEEDED__ / __AUTH_REQUIRED__.
 */
let refreshCloudAccountUI: () => Promise<void> = async () => {
  /* no-op until buildUI() initialises the real implementation */
};

/**
 * Side-panel UI message shape.
 *
 * File-local type for the Chrome extension side panel renderer.
 * Kept local because the extension renderer only needs a subset of the
 * canonical chat contract. Field mapping to canonical ChatMessage:
 *   - `id`        → canonical `id`
 *   - `role`      → canonical `role`
 *   - `content`   → canonical `content`
 *   - `timestamp` → canonical `createdAt` (here as Unix ms instead of ISO string)
 *   - `streaming` → canonical `isStreaming`
 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  timestamp: number;
}

interface ChatChunk {
  type: 'CHAT_CHUNK';
  id: string;
  text: string;
  done: boolean;
  error?: string;
}

export interface SharedSidePanelContext {
  messages: ChatMessage[];
  pendingPageContext: string | null;
  isStreaming: boolean;
  currentStreamId: string | null;
  streamTimeoutHandle: ReturnType<typeof setTimeout> | null;
  /** Track how many messages have already been rendered to avoid full DOM rebuilds. */
  lastRenderedCount: number;
  isConnected: boolean;
  /**
   * Whether extended thinking is enabled for the next outgoing message.
   * Persisted to chrome.storage.local as 'agi_thinking_enabled'.
   * The value is forwarded to the desktop bridge as `extended_thinking: true` in
   * the CHAT_MESSAGE payload. The bridge handles the provider-specific mapping.
   * Phase 3 bridge: wire the desktop bridge to consume `extendedThinking`
   * in the ChatRequest type and forward it to providers that support it
   * (Anthropic thinking blocks, OpenAI reasoning effort, Gemini thinkingBudget).
   */
  thinkingEnabled: boolean;
}

function createSharedSidePanelContext(): SharedSidePanelContext {
  return {
    messages: [],
    pendingPageContext: null,
    isStreaming: false,
    currentStreamId: null,
    streamTimeoutHandle: null,
    lastRenderedCount: 0,
    isConnected: false,
    thinkingEnabled: false,
  };
}

const _ctx: SharedSidePanelContext = createSharedSidePanelContext();

function getModelCapabilityTier(modelId: string): CapabilityTier | undefined {
  const meta = getModelMetadataById(modelId);
  if (!meta) return undefined;
  switch (meta.qualityTier) {
    case 'fast':
      return 'fastest';
    case 'balanced':
      return 'balanced';
    case 'best':
      return 'most-capable';
    default:
      return undefined;
  }
}

function getModelProvider(modelId: string): ProviderId | undefined {
  const meta = getModelMetadataById(modelId);
  return meta?.provider as ProviderId | undefined;
}

// Provider display order in the grouped picker.
const PROVIDER_GROUP_ORDER: ProviderId[] = [
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'xai',
  'perplexity',
  'qwen',
  'moonshot',
  'zhipu',
  'ollama',
  'lmstudio',
  'custom-openai-compatible',
  'agi-cloud',
];

interface SidePanelModelOption {
  value: string;
  label: string;
  provider?: ProviderId | string;
  capability?: CapabilityTier;
}

const SIDE_PANEL_MODEL_OPTIONS: SidePanelModelOption[] = [
  { value: 'auto', label: 'Best (auto)', provider: undefined, capability: undefined },
  ...getCoreManualModelOptions().map((option) => ({
    value: option.id,
    label: option.label,
    provider: getModelProvider(option.id),
    capability: getModelCapabilityTier(option.id),
  })),
];

const _modelBadgeCache: Record<string, string> = (() => {
  const cache: Record<string, string> = { auto: 'Best (auto)' };
  for (const opt of getCoreManualModelOptions()) {
    cache[opt.id] = opt.label;
  }
  return cache;
})();

function getModelBadgeLabel(modelId: string): string {
  return _modelBadgeCache[modelId] ?? modelId;
}
interface WebMCPToolEntry {
  name: string;
  description: string;
}
let discoveredTools: WebMCPToolEntry[] = [];

let isRecording = false;
let recordingActionCount = 0;

/**
 * Pending image attachments added via the composer + menu.
 * Each entry is a data-URL (base64 PNG/JPEG) to be prepended to the
 * next outgoing message. Cleared after send.
 */
const pendingAttachments: string[] = [];

/**
 * Hostname of the active browser tab, shown in the persistent context chip.
 * Updated whenever the side panel receives focus or a tab-changed message.
 */
let currentPageHostname = '';

type SidePanelTab = 'chat' | 'workflows' | 'computer-use';

const STORAGE_KEY = 'agi_side_panel_messages';
const MAX_STORED_MESSAGES = 50;

function saveMessages(): void {
  const toSave = _ctx.messages.slice(-MAX_STORED_MESSAGES);
  chrome.storage.local.set({ [STORAGE_KEY]: toSave }).catch((err) => {
    console.warn('[SidePanel] Failed to persist messages:', err);
  });
}

async function loadMessages(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve();
        return;
      }
      const raw = result[STORAGE_KEY];
      const stored = Array.isArray(raw) ? (raw as ChatMessage[]) : undefined;
      if (stored && stored.length > 0) {
        _ctx.messages.push(...stored.slice(-MAX_STORED_MESSAGES));
        _ctx.lastRenderedCount = 0;
      }
      resolve();
    });
  });
}

function clearStoredMessages(): void {
  chrome.storage.local.remove(STORAGE_KEY).catch((err) => {
    console.warn('[SidePanel] Failed to clear stored messages:', err);
  });
}

function injectStyles(): void {
  // M-08 audit 2026-05-19: switched from `document.createElement('style')` +
  // textContent + appendChild (which CSP `style-src 'self'` blocks) to
  // Constructable Stylesheets (`new CSSStyleSheet().replaceSync(...)` +
  // `document.adoptedStyleSheets`). Constructable sheets are a DOM API, not
  // CSS-source delivery, so they bypass style-src entirely. Chrome 73+
  // supports them; manifest minimum_chrome_version is 132 so we're safe.
  const cssText = `
    /* ── AGI design tokens (dark) ── */
    ${getExtensionTokensCss('dark')}

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-size: 13px;
    }

    /* ── Header ── */
    #sp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--agi-ext-surface);
      border-bottom: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
      gap: 8px;
    }
    #sp-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    #sp-logo {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      /* currentColor for the 11 gray spokes; amber spoke is hard-wired in SVG */
      color: var(--agi-ext-text-muted);
    }
    #sp-logo svg {
      width: 24px;
      height: 24px;
      display: block;
    }
    #sp-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--agi-ext-text);
      white-space: nowrap;
    }
    #sp-model-badge {
      font-size: 10px;
      color: var(--agi-ext-accent);
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
      border-radius: 4px;
      padding: 1px 6px;
      white-space: nowrap;
    }
    #sp-header-right {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .sp-icon-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--agi-ext-text-muted);
      border-radius: 5px;
      padding: 4px 6px;
      font-size: 13px;
      line-height: 1;
      transition: color 0.15s, background 0.15s;
    }
    .sp-icon-btn:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }

    /* ── Messages area ── */
    #sp-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }
    #sp-messages::-webkit-scrollbar { width: 4px; }
    #sp-messages::-webkit-scrollbar-track { background: transparent; }
    #sp-messages::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }

    /* ── Empty state — Claude-style calm centered ── */
    #sp-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 40px 20px 16px;
      gap: 10px;
      text-align: center;
    }
    #sp-empty.hidden { display: none; }
    #sp-empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      opacity: 0.7;
    }
    #sp-empty-headline {
      font-size: 16px;
      font-weight: 600;
      color: var(--agi-ext-text);
      letter-spacing: -0.015em;
    }
    #sp-empty-subtext {
      font-size: 12px;
      color: var(--agi-ext-text-muted);
      line-height: 1.55;
      max-width: 220px;
    }

    /* ── Inline prompt chips under the composer (design-spec §8.2) ── */
    #sp-prompt-chips {
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      overflow: hidden;
      padding: 6px 10px 0;
    }
    #sp-prompt-chips.hidden { display: none; }
    .sp-cmd-chip {
      display: inline-flex;
      align-items: center;
      height: 28px;
      padding: 0 10px;
      font-size: 11px;
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text-muted);
      border-radius: 999px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      border: 1px solid var(--agi-ext-border);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .sp-cmd-chip:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }

    /* ── Blocked / restricted-site state ── */
    #sp-blocked {
      display: none;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: center;
      padding: 32px 20px;
    }
    #sp-blocked.visible { display: flex; }
    #sp-blocked-shield {
      width: 48px;
      height: 48px;
      opacity: 0.35;
    }
    #sp-blocked-title { font-size: 14px; font-weight: 600; color: var(--agi-ext-text-muted); }
    #sp-blocked-desc { font-size: 11px; color: var(--agi-ext-text-muted); opacity: 0.7; line-height: 1.55; max-width: 200px; }

    /* ── Message bubbles ── */
    .sp-msg {
      display: flex;
      flex-direction: column;
      max-width: 88%;
      gap: 3px;
    }
    .sp-msg-user {
      align-self: flex-end;
      align-items: flex-end;
    }
    .sp-msg-assistant {
      align-self: flex-start;
      align-items: flex-start;
    }
    .sp-bubble {
      padding: 8px 11px;
      border-radius: 12px;
      line-height: 1.55;
      font-size: 13px;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .sp-bubble-user {
      background: color-mix(in srgb, var(--agi-ext-accent) 18%, transparent);
      color: var(--agi-ext-text);
      border-bottom-right-radius: 3px;
    }
    .sp-bubble-assistant {
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      border: 1px solid var(--agi-ext-border);
      border-bottom-left-radius: 3px;
    }
    .sp-bubble-error {
      background: var(--agi-ext-danger-bg);
      border-color: var(--agi-ext-danger-border);
      color: var(--agi-ext-danger);
    }
    /* ── Bubble action row (timestamp + copy) ── */
    .sp-bubble-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 16px;
    }
    .sp-msg-user .sp-bubble-actions { justify-content: flex-end; }
    .sp-timestamp {
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      opacity: 0.5;
      padding: 0 3px;
    }
    .sp-copy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      padding: 2px;
      border-radius: 3px;
      opacity: 0;
      transition: opacity 0.15s, color 0.15s, background 0.15s;
    }
    .sp-msg:hover .sp-copy-btn { opacity: 1; }
    .sp-copy-btn:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }
    .sp-copy-btn.copied { color: var(--agi-ext-success); opacity: 1; }

    /* ── Markdown rendering inside assistant bubbles ── */
    .sp-bubble-assistant code {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 3px;
      padding: 1px 4px;
      font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 11px;
      color: var(--agi-ext-accent);
    }
    .sp-bubble-assistant pre {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 10px;
      overflow-x: auto;
      margin: 4px 0;
      font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 11px;
      color: var(--agi-ext-text);
      white-space: pre;
    }
    .sp-bubble-assistant pre code {
      background: none;
      border: none;
      padding: 0;
      color: inherit;
    }
    .sp-bubble-assistant strong { color: var(--agi-ext-text); font-weight: 600; }
    .sp-bubble-assistant em { color: var(--agi-ext-text-muted); font-style: italic; }
    .sp-bubble-assistant a { color: var(--agi-ext-accent); text-decoration: underline; }
    .sp-bubble-assistant ul, .sp-bubble-assistant ol {
      padding-left: 16px;
      margin: 4px 0;
    }
    .sp-bubble-assistant li { margin: 2px 0; }
    .sp-bubble-assistant h1, .sp-bubble-assistant h2, .sp-bubble-assistant h3 {
      font-weight: 600;
      color: var(--agi-ext-text);
      margin: 6px 0 3px;
    }
    .sp-bubble-assistant h1 { font-size: 15px; }
    .sp-bubble-assistant h2 { font-size: 14px; }
    .sp-bubble-assistant h3 { font-size: 13px; }
    .sp-bubble-assistant blockquote {
      border-left: 3px solid var(--agi-ext-accent);
      padding-left: 8px;
      color: var(--agi-ext-text-muted);
      margin: 4px 0;
    }
    .sp-bubble-assistant hr {
      border: none;
      border-top: 1px solid var(--agi-ext-border);
      margin: 6px 0;
    }

    /* ── Cursor blink for streaming ── */
    .sp-cursor::after {
      content: '▋';
      animation: sp-blink 0.7s steps(1) infinite;
      color: var(--agi-ext-accent);
      font-size: 12px;
    }
    @keyframes sp-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    /* ── Inline tool-call UI (design-spec §4) ── */
    .tool-call {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
      color: var(--agi-ext-text-muted);
    }
    .tool-call__bar {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 4px;
      cursor: pointer;
      user-select: none;
      border-radius: 5px;
      transition: background 120ms ease;
    }
    .tool-call__bar:hover { background: var(--agi-ext-hover); }
    .tool-call__icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      color: var(--agi-ext-text-muted);
      opacity: 0.7;
    }
    .tool-call__icon svg { width: 14px; height: 14px; }
    .tool-call__label { color: var(--agi-ext-text-muted); font-weight: 400; font-size: 12px; }
    .tool-call__summary {
      color: var(--agi-ext-text-muted);
      opacity: 0.7;
      font-size: 11px;
      margin-left: 4px;
      max-width: 260px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tool-call__chevron {
      width: 12px;
      height: 12px;
      color: var(--agi-ext-text-muted);
      opacity: 0.6;
      margin-left: auto;
      transition: transform 160ms ease;
      flex-shrink: 0;
    }
    .tool-call__chevron svg { width: 12px; height: 12px; }
    .tool-call--open .tool-call__chevron { transform: rotate(90deg); }
    .tool-call__body {
      display: none;
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 10px 12px;
      font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 11px;
      color: var(--agi-ext-text);
      overflow-x: auto;
      max-height: 320px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .tool-call--open .tool-call__body { display: block; }
    /* multi-step vertical guideline */
    .tool-call-stack {
      border-left: 1px solid var(--agi-ext-border);
      padding-left: 10px;
      margin-left: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    /* spinner rotation for pending/running state */
    .tool-call--running .tool-call__icon { color: var(--agi-ext-text-muted); }
    .tool-call--running .tool-call__icon svg { animation: sp-spin 0.8s linear infinite; }
    @keyframes sp-spin { to { transform: rotate(360deg); } }
    .tool-call--error .tool-call__label { color: var(--agi-ext-danger); }
    .tool-call--error .tool-call__icon { color: var(--agi-ext-danger); }
    .tool-call--success .tool-call__icon { color: var(--agi-ext-success); }

    /* ── Thinking dots ── */
    .sp-thinking {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 12px;
      border-bottom-left-radius: 3px;
    }
    .sp-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--agi-ext-accent);
      animation: sp-bounce 1.2s infinite;
    }
    .sp-dot:nth-child(2) { animation-delay: 0.2s; }
    .sp-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes sp-bounce {
      0%, 100% { transform: translateY(0); opacity: 0.4; }
      50% { transform: translateY(-4px); opacity: 1; }
    }

    /* ── Context / voice toolbar ── */
    #sp-toolbar {
      display: flex;
      gap: 6px;
      padding: 6px 10px 0;
      flex-shrink: 0;
    }
    .sp-tool-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 4px 9px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .sp-tool-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-tool-btn.active { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 15%, transparent); }
    .sp-tool-btn.has-context { color: var(--agi-ext-success); border-color: var(--agi-ext-success-border); background: var(--agi-ext-success-bg); }

    /* ── Mic pulsing indicator ── */
    .sp-mic-pulse {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--agi-ext-danger);
      animation: sp-pulse 1s infinite;
    }
    @keyframes sp-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.4); opacity: 0.6; }
    }

    /* ── Console log viewer ── */
    #sp-console-panel {
      display: none;
      flex-direction: column;
      max-height: 200px;
      overflow-y: auto;
      background: var(--agi-ext-bg);
      border-bottom: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 11px;
    }
    #sp-console-panel.open { display: flex; }
    .sp-console-entry {
      padding: 3px 10px;
      border-bottom: 1px solid var(--agi-ext-border);
      line-height: 1.4;
      word-break: break-all;
    }
    .sp-console-log { color: var(--agi-ext-text); }
    .sp-console-warn { color: var(--agi-ext-warning); background: rgba(251, 191, 36, 0.06); }
    .sp-console-error { color: var(--agi-ext-danger); background: var(--agi-ext-danger-bg); }
    .sp-console-info { color: var(--agi-ext-info); }
    .sp-console-debug { color: var(--agi-ext-text-muted); }
    .sp-console-time {
      color: var(--agi-ext-text-muted);
      font-size: 9px;
      margin-right: 6px;
    }
    .sp-console-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      background: var(--agi-ext-bg);
      border-bottom: 1px solid var(--agi-ext-border);
      position: sticky;
      top: 0;
    }
    .sp-console-title { font-size: 10px; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .sp-console-clear {
      background: none;
      border: none;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      cursor: pointer;
      padding: 2px 6px;
    }
    .sp-console-clear:hover { color: var(--agi-ext-text); }

    /* ── Shortcuts dropdown ── */
    .sp-shortcuts-wrapper { position: relative; }
    #sp-shortcuts-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 4px;
      min-width: 240px;
      max-height: 260px;
      overflow-y: auto;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 4px;
      z-index: 100;
      box-shadow: var(--agi-ext-shadow-panel);
    }
    #sp-shortcuts-dropdown.open { display: block; }
    .sp-shortcut-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .sp-shortcut-item:hover { background: var(--agi-ext-hover); }
    .sp-shortcut-name { font-size: 12px; color: var(--agi-ext-text); flex: 1; }
    .sp-shortcut-actions {
      display: flex;
      gap: 4px;
    }
    .sp-shortcut-action-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 3px;
      transition: background 0.12s;
    }
    .sp-shortcut-action-btn:hover { background: var(--agi-ext-overlay); }
    .sp-shortcuts-empty {
      padding: 10px 8px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      text-align: center;
    }
    .sp-save-shortcut-row {
      display: flex;
      gap: 4px;
      padding: 6px 4px 4px;
      border-top: 1px solid var(--agi-ext-border);
    }
    .sp-save-shortcut-input {
      flex: 1;
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 4px;
      color: var(--agi-ext-text);
      font-size: 11px;
      padding: 4px 6px;
      outline: none;
    }
    .sp-save-shortcut-input:focus { border-color: var(--agi-ext-focus); }
    .sp-save-shortcut-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-save-shortcut-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      white-space: nowrap;
    }
    .sp-save-shortcut-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-save-shortcut-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* ── AI Tools dropdown ── */
    .sp-tools-wrapper {
      position: relative;
    }
    #sp-tools-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 4px;
      min-width: 220px;
      max-height: 240px;
      overflow-y: auto;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 4px;
      z-index: 100;
      box-shadow: var(--agi-ext-shadow-panel);
    }
    #sp-tools-dropdown.open { display: block; }
    #sp-tools-dropdown::-webkit-scrollbar { width: 4px; }
    #sp-tools-dropdown::-webkit-scrollbar-track { background: transparent; }
    #sp-tools-dropdown::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }
    .sp-tools-empty {
      padding: 10px 8px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      text-align: center;
    }
    .sp-tool-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 8px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .sp-tool-item:hover { background: var(--agi-ext-hover); }
    .sp-tool-item-name {
      font-size: 12px;
      color: var(--agi-ext-text);
      font-weight: 500;
    }
    .sp-tool-item-desc {
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    /* ── Input row (composer §7) ── */
    #sp-input-area {
      padding: 6px 10px 8px;
      border-top: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
    }
    /* outer composer shell */
    #sp-composer-shell {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 16px;
      padding: 6px 8px 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    #sp-composer-shell:focus-within {
      border-color: color-mix(in srgb, var(--agi-ext-accent) 50%, transparent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--agi-ext-accent) 18%, transparent);
    }
    #sp-composer-shell.dragover {
      border-color: color-mix(in srgb, var(--agi-ext-accent) 80%, transparent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--agi-ext-accent) 35%, transparent);
    }
    #sp-input-row {
      display: flex;
      gap: 6px;
      align-items: flex-end;
    }
    #sp-input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--agi-ext-text);
      font-size: 13px;
      padding: 4px 4px;
      resize: none;
      outline: none;
      font-family: inherit;
      line-height: 1.5;
      max-height: 120px;
      min-height: 28px;
      overflow-y: auto;
    }
    #sp-input::placeholder { color: var(--agi-ext-border-strong); }
    #sp-send-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.1s;
    }
    #sp-send-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); transform: scale(1.05); }
    #sp-send-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-send-btn:disabled { background: var(--agi-ext-overlay); color: var(--agi-ext-border-strong); cursor: not-allowed; transform: none; }
    #sp-send-btn[data-mode="stop"] { background: var(--agi-ext-danger); }
    #sp-send-btn[data-mode="stop"]:hover { background: color-mix(in srgb, var(--agi-ext-danger) 80%, black); }

    /* ── Attachment + button and menu ── */
    .sp-attach-wrapper { position: relative; flex-shrink: 0; }
    .sp-attach-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--agi-ext-text-muted);
      font-size: 18px;
      font-weight: 300;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.15s, background 0.15s;
    }
    .sp-attach-btn:hover { color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    #sp-attach-menu {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      min-width: 190px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 4px;
      z-index: 150;
      box-shadow: var(--agi-ext-shadow-panel);
    }
    #sp-attach-menu.open { display: block; }
    .sp-attach-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      color: var(--agi-ext-text-muted);
      transition: background 0.12s, color 0.12s;
      user-select: none;
    }
    .sp-attach-menu-item:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-attach-icon { font-size: 14px; flex-shrink: 0; }
    .sp-attach-file-input { display: none; }

    /* ── Attachment preview bar ── */
    #sp-attachment-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 4px 2px 6px;
    }
    .sp-attachment-chip {
      position: relative;
      display: inline-flex;
      border-radius: 6px;
      overflow: visible;
      border: 1px solid var(--agi-ext-border);
    }
    .sp-attachment-thumb {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 5px;
      display: block;
    }
    .sp-attachment-remove {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 16px;
      height: 16px;
      background: var(--agi-ext-hover);
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 50%;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background 0.12s, color 0.12s;
    }
    .sp-attachment-remove:hover { background: var(--agi-ext-danger-bg); color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }

    /* ── Composer bottom bar: persistent page-context chip ── */
    #sp-composer-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 2px 0;
    }
    .sp-context-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: var(--agi-ext-overlay);
      border: 1px solid var(--agi-ext-border);
      border-radius: 12px;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      font-weight: 500;
      padding: 2px 9px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      white-space: nowrap;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sp-context-chip::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--agi-ext-border-strong);
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .sp-context-chip.has-context {
      color: var(--agi-ext-success);
      border-color: var(--agi-ext-success-border);
      background: var(--agi-ext-success-bg);
    }
    .sp-context-chip.has-context::before { background: var(--agi-ext-success); }
    .sp-context-chip:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-context-chip:hover::before { background: var(--agi-ext-accent); }
    .sp-context-chip.loading { opacity: 0.6; cursor: wait; }

    /* ── Autonomy toggle (BLOCKER-01) ── */
    #sp-action-mode-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      background: var(--agi-ext-overlay);
      border: 1px solid var(--agi-ext-border);
      border-radius: 12px;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      font-weight: 500;
      padding: 2px 8px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
      user-select: none;
    }
    #sp-action-mode-toggle:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    #sp-action-mode-toggle[data-mode="act"] {
      color: var(--agi-ext-accent);
      border-color: var(--agi-ext-accent);
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
    }
    #sp-action-mode-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* W5-06: quick mode toggle */
    #sp-quick-mode-toggle {
      display: inline-flex;
      align-items: center;
      background: var(--agi-ext-overlay);
      border: 1px solid var(--agi-ext-border);
      border-radius: 12px;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      font-weight: 500;
      padding: 2px 8px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
      user-select: none;
    }
    #sp-quick-mode-toggle:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    #sp-quick-mode-toggle.sp-quick-mode-active {
      color: var(--agi-ext-accent);
      border-color: var(--agi-ext-accent);
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
    }
    #sp-quick-mode-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* ── Inline permission consent card (BLOCKER-02) ── */
    .sp-permission-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border: 1px solid var(--agi-ext-warning);
      border-radius: 10px;
      background: var(--agi-ext-warning-bg, color-mix(in srgb, var(--agi-ext-warning) 10%, var(--agi-ext-surface)));
      padding: 10px 12px;
      margin: 4px 0;
      align-self: stretch;
    }
    .sp-permission-card-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--agi-ext-warning);
    }
    .sp-permission-card-desc {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
      line-height: 1.4;
    }
    .sp-permission-card-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .sp-permission-btn {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 6px;
      border: 1px solid var(--agi-ext-border);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
    }
    .sp-permission-btn:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-permission-btn-allow {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border-color: var(--agi-ext-accent);
    }
    .sp-permission-btn-allow:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-permission-btn-always {
      border-color: var(--agi-ext-accent);
      color: var(--agi-ext-accent);
    }
    .sp-permission-btn-always:hover { background: color-mix(in srgb, var(--agi-ext-accent) 10%, transparent); }

    /* ── Offline onboarding screen (BLOCKER-02b) ── */
    #sp-offline-onboarding {
      display: none;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      text-align: center;
      padding: 32px 20px;
    }
    #sp-offline-onboarding.visible { display: flex; }
    #sp-offline-onboarding-icon {
      width: 48px;
      height: 48px;
      opacity: 0.5;
    }
    #sp-offline-onboarding-title { font-size: 14px; font-weight: 600; color: var(--agi-ext-text); }
    #sp-offline-onboarding-desc { font-size: 12px; color: var(--agi-ext-text-muted); line-height: 1.55; max-width: 220px; }
    #sp-offline-onboarding-cta {
      font-size: 12px;
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid var(--agi-ext-accent);
      background: transparent;
      color: var(--agi-ext-accent);
      cursor: pointer;
      transition: background 0.12s;
    }
    #sp-offline-onboarding-cta:hover { background: color-mix(in srgb, var(--agi-ext-accent) 10%, transparent); }

    /* ── Settings bar (Phase 3: removed — bridge URL now in drawer) ── */

    /* ── Auth bar ── */
    #sp-auth-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--agi-ext-bg);
      border-bottom: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
    }
    #sp-auth-input {
      flex: 1;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 11px;
      padding: 5px 9px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s;
      min-width: 0;
    }
    #sp-auth-input:focus { border-color: var(--agi-ext-focus); }
    #sp-auth-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    #sp-auth-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    #sp-auth-save-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
      white-space: nowrap;
    }
    #sp-auth-save-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    #sp-auth-save-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* ── Connection status pill ── */
    #sp-status-pill {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      border-radius: 10px;
      padding: 3px 8px;
      flex-shrink: 0;
      font-weight: 500;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    #sp-status-pill.connected {
      background: var(--agi-ext-success-bg);
      color: var(--agi-ext-success);
      border: 1px solid var(--agi-ext-success-border);
    }
    #sp-status-pill.disconnected {
      background: var(--agi-ext-danger-bg);
      color: var(--agi-ext-danger);
      border: 1px solid var(--agi-ext-danger-border);
    }
    .sp-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    #sp-status-pill.connected .sp-status-dot { background: var(--agi-ext-success); }
    #sp-status-pill.disconnected .sp-status-dot { background: var(--agi-ext-danger); }
    #sp-status-pill.cloud {
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      color: var(--agi-ext-accent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
    }
    #sp-status-pill.cloud .sp-status-dot { background: var(--agi-ext-accent); }

    /* ── Bridge-offline notice (shown above composer when desktop not connected) ── */
    #sp-bridge-notice {
      display: none;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: color-mix(in srgb, var(--agi-ext-danger) 8%, transparent);
      border-top: 1px solid var(--agi-ext-danger-border);
      font-size: 11px;
      color: var(--agi-ext-danger);
      flex-shrink: 0;
    }
    #sp-bridge-notice.visible { display: flex; }
    #sp-bridge-notice-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--agi-ext-danger);
      flex-shrink: 0;
    }
    #sp-bridge-notice-text { flex: 1; line-height: 1.4; }
    #sp-bridge-notice-reconnect {
      background: none;
      border: 1px solid var(--agi-ext-danger-border);
      color: var(--agi-ext-danger);
      border-radius: 5px;
      padding: 2px 8px;
      font-size: 10px;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background 0.12s;
    }
    #sp-bridge-notice-reconnect:hover {
      background: color-mix(in srgb, var(--agi-ext-danger) 12%, transparent);
    }
    /* Model picker dims when bridge is offline — selection is persisted but has no
       immediate effect until the desktop bridge is connected. */
    .sp-model-selector-wrap.bridge-offline #sp-model-selector-btn {
      opacity: 0.45;
      cursor: default;
      pointer-events: none;
    }

    /* ── Tab bar ── */
    #sp-tab-bar {
      display: flex;
      background: var(--agi-ext-surface);
      border-bottom: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
    }
    .sp-tab {
      flex: 1;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--agi-ext-text-muted);
      font-size: 12px;
      font-weight: 500;
      padding: 9px 0;
      cursor: pointer;
      letter-spacing: 0.02em;
      transition: color 0.15s, border-color 0.15s;
    }
    .sp-tab:hover { color: var(--agi-ext-text); }
    .sp-tab.sp-tab-active { color: var(--agi-ext-accent); border-bottom-color: var(--agi-ext-accent); }
    #sp-chat-panel { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    #sp-chat-panel.sp-tab-hidden { display: none; }
    #sp-workflows { display: none; flex: 1; overflow-y: auto; padding: 12px 10px; flex-direction: column; gap: 16px; }
    #sp-workflows.sp-tab-visible { display: flex; }
    #sp-workflows::-webkit-scrollbar { width: 4px; }
    #sp-workflows::-webkit-scrollbar-track { background: transparent; }
    #sp-workflows::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }
    .sp-wf-section { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .sp-wf-section-header { display: flex; align-items: center; justify-content: space-between; }
    .sp-wf-section-title { font-size: 11px; font-weight: 600; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .sp-wf-empty { color: var(--agi-ext-text-muted); font-size: 11px; line-height: 1.55; padding: 4px 0; }
    .sp-wf-shortcuts-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-wf-shortcut-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 7px; }
    .sp-wf-shortcut-icon { font-size: 14px; flex-shrink: 0; }
    .sp-wf-shortcut-info { flex: 1; min-width: 0; }
    .sp-wf-shortcut-name { font-size: 12px; font-weight: 500; color: var(--agi-ext-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-wf-shortcut-meta { font-size: 10px; color: var(--agi-ext-text-muted); margin-top: 1px; }
    .sp-wf-shortcut-btns { display: flex; gap: 4px; flex-shrink: 0; }
    .sp-wf-btn-replay { background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); color: var(--agi-ext-accent); font-size: 11px; padding: 3px 9px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-btn-replay:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); }
    .sp-wf-btn-delete { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); font-size: 11px; padding: 3px 7px; border-radius: 5px; cursor: pointer; transition: color 0.12s, border-color 0.12s; }
    .sp-wf-btn-delete:hover { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-wf-tasks-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-wf-task-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 7px; }
    .sp-wf-task-info { flex: 1; min-width: 0; }
    .sp-wf-task-name { font-size: 12px; font-weight: 500; color: var(--agi-ext-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-wf-task-schedule-badge { display: inline-block; font-size: 9px; color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); border-radius: 3px; padding: 1px 5px; margin-top: 2px; }
    .sp-wf-task-toggle { appearance: none; width: 30px; height: 16px; border-radius: 8px; background: var(--agi-ext-hover); position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
    .sp-wf-task-toggle:checked { background: var(--agi-ext-accent); }
    .sp-wf-task-toggle::after { content: ''; position: absolute; width: 12px; height: 12px; border-radius: 50%; background: white; top: 2px; left: 2px; transition: transform 0.2s; }
    .sp-wf-task-toggle:checked::after { transform: translateX(14px); }
    .sp-wf-task-delete { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); font-size: 11px; padding: 3px 7px; border-radius: 5px; cursor: pointer; transition: color 0.12s, border-color 0.12s; }
    .sp-wf-task-delete:hover { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-wf-new-task-btn { background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); color: var(--agi-ext-accent); font-size: 11px; padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-new-task-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); }
    .sp-wf-new-task-form { display: none; flex-direction: column; gap: 7px; padding: 10px; background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 7px; }
    .sp-wf-new-task-form.open { display: flex; }
    .sp-wf-form-label { font-size: 10px; color: var(--agi-ext-text-muted); margin-bottom: 1px; }
    .sp-wf-form-input { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 5px; color: var(--agi-ext-text); font-size: 12px; padding: 5px 8px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; }
    .sp-wf-form-input:focus { border-color: var(--agi-ext-focus); }
    .sp-wf-form-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-wf-form-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-wf-form-select { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 5px; color: var(--agi-ext-text); font-size: 12px; padding: 5px 8px; outline: none; font-family: inherit; width: 100%; }
    .sp-wf-form-select:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-wf-form-save-btn { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border: none; border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; align-self: flex-end; transition: background 0.12s; }
    .sp-wf-form-save-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-wf-form-save-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-wf-form-cancel-btn { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); border-radius: 5px; padding: 6px 10px; font-size: 12px; cursor: pointer; align-self: flex-end; transition: color 0.12s; }
    .sp-wf-form-cancel-btn:hover { color: var(--agi-ext-text); }
    .sp-wf-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .sp-wf-create-shortcut-btn { background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); color: var(--agi-ext-accent); font-size: 11px; padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-create-shortcut-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); }
    .sp-create-shortcut-overlay { display: none; position: fixed; inset: 0; background: var(--agi-ext-scrim); z-index: 9999; align-items: center; justify-content: center; }
    .sp-create-shortcut-overlay.open { display: flex; }
    .sp-create-shortcut-modal { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 10px; padding: 18px 18px 14px; width: 290px; max-width: 95vw; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 8px 32px var(--agi-ext-modal-shadow); }
    .sp-create-shortcut-header { display: flex; align-items: center; justify-content: space-between; }
    .sp-create-shortcut-title { font-size: 13px; font-weight: 600; color: var(--agi-ext-text); }
    .sp-create-shortcut-close { background: none; border: none; color: var(--agi-ext-text-muted); font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1; transition: color 0.12s; }
    .sp-create-shortcut-close:hover { color: var(--agi-ext-text); }
    .sp-create-shortcut-field { display: flex; flex-direction: column; gap: 4px; }
    .sp-create-shortcut-label { font-size: 10px; font-weight: 600; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .sp-create-shortcut-input { background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 5px; color: var(--agi-ext-text); font-size: 12px; padding: 6px 9px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; box-sizing: border-box; }
    .sp-create-shortcut-input:focus { border-color: var(--agi-ext-focus); }
    .sp-create-shortcut-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-create-shortcut-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-create-shortcut-textarea { background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 5px; color: var(--agi-ext-text); font-size: 12px; padding: 6px 9px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; box-sizing: border-box; resize: none; height: 70px; line-height: 1.4; }
    .sp-create-shortcut-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-create-shortcut-textarea:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-create-shortcut-textarea::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-create-shortcut-schedule-row { display: flex; align-items: center; justify-content: space-between; }
    .sp-create-shortcut-schedule-label { font-size: 12px; color: var(--agi-ext-text-muted); }
    .sp-create-shortcut-toggle { appearance: none; width: 34px; height: 18px; border-radius: 9px; background: var(--agi-ext-hover); position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; border: none; outline: none; }
    .sp-create-shortcut-toggle:checked { background: var(--agi-ext-accent); }
    .sp-create-shortcut-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-create-shortcut-toggle::after { content: ''; position: absolute; width: 13px; height: 13px; border-radius: 50%; background: white; top: 2.5px; left: 2.5px; transition: transform 0.2s; }
    .sp-create-shortcut-toggle:checked::after { transform: translateX(16px); }
    .sp-create-shortcut-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 2px; }
    .sp-create-shortcut-cancel { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: color 0.12s; }
    .sp-create-shortcut-cancel:hover { color: var(--agi-ext-text); }
    .sp-create-shortcut-save { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border: none; border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background 0.12s; }
    .sp-create-shortcut-save:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-create-shortcut-save:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-wf-group-desc { font-size: 11px; color: var(--agi-ext-text-muted); line-height: 1.55; }
    .sp-wf-group-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .sp-wf-group-action-btn { display: flex; align-items: center; gap: 5px; background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 6px; color: var(--agi-ext-text-muted); font-size: 11px; padding: 5px 11px; cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s; }
    .sp-wf-group-action-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-wf-group-action-btn.active { color: var(--agi-ext-success); border-color: var(--agi-ext-success-border); background: var(--agi-ext-success-bg); }
    .sp-wf-record-bar { display: flex; align-items: center; gap: 8px; }
    .sp-wf-record-btn { display: flex; align-items: center; gap: 6px; background: var(--agi-ext-danger); border: none; color: white; font-size: 12px; font-weight: 600; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: background 0.15s, transform 0.1s; flex-shrink: 0; }
    .sp-wf-record-btn:hover { background: color-mix(in srgb, var(--agi-ext-danger) 85%, black); transform: scale(1.02); }
    .sp-wf-record-btn.recording { background: var(--agi-ext-danger-bg); border: 1px solid var(--agi-ext-danger); animation: sp-record-pulse 1.5s infinite; }
    .sp-wf-record-btn.recording:hover { background: var(--agi-ext-danger-bg); }
    @keyframes sp-record-pulse { 0%, 100% { box-shadow: 0 0 0 0 var(--agi-ext-transparent-shadow); } 50% { box-shadow: 0 0 0 6px var(--agi-ext-transparent-shadow); } }
    .sp-wf-record-dot { width: 8px; height: 8px; border-radius: 50%; background: white; flex-shrink: 0; }
    .sp-wf-record-btn.recording .sp-wf-record-dot { background: var(--agi-ext-danger); animation: sp-pulse 1s infinite; }
    .sp-wf-action-counter { font-size: 11px; color: var(--agi-ext-text-muted); flex: 1; }
    .sp-wf-action-counter strong { color: var(--agi-ext-text); }
    .sp-wf-save-dialog { display: none; flex-direction: column; gap: 6px; padding: 10px; background: var(--agi-ext-bg); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); border-radius: 8px; }
    .sp-wf-save-dialog.open { display: flex; }
    .sp-wf-save-dialog-title { font-size: 12px; font-weight: 600; color: var(--agi-ext-accent); }
    .sp-wf-count-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; font-size: 10px; font-weight: 600; background: color-mix(in srgb, var(--agi-ext-accent) 20%, transparent); color: var(--agi-ext-accent); border-radius: 9px; padding: 0 5px; }
    .sp-model-selector-wrap { position: relative; }
    #sp-model-selector-btn { display: flex; align-items: center; gap: 4px; background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); border-radius: 5px; padding: 3px 8px; color: var(--agi-ext-accent); font-size: 10px; font-weight: 500; cursor: pointer; transition: background 0.12s, border-color 0.12s; white-space: nowrap; }
    #sp-model-selector-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); border-color: var(--agi-ext-accent); }
    #sp-model-selector-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-model-selector-btn .sp-chevron { font-size: 8px; transition: transform 0.15s; }
    #sp-model-selector-btn.open .sp-chevron { transform: rotate(180deg); }
    #sp-model-dropdown { display: none; position: absolute; top: 100%; left: 0; right: auto; margin-top: 4px; min-width: 200px; max-width: calc(100vw - 24px); max-height: 280px; overflow-y: auto; background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 8px; padding: 4px; z-index: 200; box-shadow: 0 4px 16px var(--agi-ext-modal-shadow); }
    #sp-model-dropdown.open { display: block; }
    .sp-model-option { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 5px; cursor: pointer; transition: background 0.12s; font-size: 11px; color: var(--agi-ext-text-muted); }
    .sp-model-option:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-model-option.selected { color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); }
    .sp-model-option-check { width: 14px; text-align: center; font-size: 10px; flex-shrink: 0; }
    .sp-model-option-label { flex: 1; }

    /* ── Enhanced model picker ── */
    .sp-model-option-logo {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
      object-fit: contain;
      display: block;
    }
    .sp-model-option-logo-placeholder {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      background: var(--agi-ext-hover);
      flex-shrink: 0;
    }
    .sp-model-option-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }
    .sp-model-option-name {
      font-size: 11px;
      color: inherit;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sp-model-option-sublabel {
      font-size: 9px;
      color: var(--agi-ext-text-muted);
      white-space: nowrap;
    }
    .sp-model-option.selected .sp-model-option-sublabel { color: var(--agi-ext-accent); opacity: 0.7; }
    .sp-model-option:hover .sp-model-option-sublabel { color: var(--agi-ext-text-muted); }

    /* ── Free-tier model gating: Upgrade badge on premium models ── */
    .sp-model-option.premium-gated { opacity: 0.75; }
    .sp-model-option.premium-gated:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); opacity: 1; cursor: pointer; }
    .sp-model-upgrade-tag {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      background: linear-gradient(90deg, #f59e0b, #f97316);
      border-radius: 3px;
      padding: 1px 5px;
      flex-shrink: 0;
      white-space: nowrap;
    }

    /* "Best (auto)" option — visually distinct row */
    .sp-model-option-auto {
      border-bottom: 1px solid var(--agi-ext-border);
      margin-bottom: 4px;
      padding-bottom: 10px;
    }
    .sp-model-option-auto .sp-model-option-name {
      font-weight: 600;
      color: var(--agi-ext-accent);
    }
    .sp-model-option-auto:hover .sp-model-option-name { color: var(--agi-ext-accent); opacity: 0.85; }
    .sp-model-auto-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--agi-ext-accent), var(--agi-ext-accent-secondary));
      flex-shrink: 0;
    }

    /* Model picker header row with provider-count badge */
    .sp-model-picker-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 9px 4px;
      border-bottom: 1px solid var(--agi-ext-border);
      margin-bottom: 2px;
    }
    .sp-model-picker-title {
      font-size: 9px;
      font-weight: 600;
      color: var(--agi-ext-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .provider-count-badge {
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      background: var(--agi-ext-hover);
      border: 1px solid var(--agi-ext-border);
      border-radius: 10px;
      padding: 1px 7px;
      font-weight: 500;
      white-space: nowrap;
      margin-left: auto;
    }

    /* Provider group header */
    .sp-model-group-header {
      font-size: 9px;
      font-weight: 600;
      color: var(--agi-ext-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 6px 9px 2px;
    }
    .sp-model-group-header:not(:first-child) {
      border-top: 1px solid var(--agi-ext-border);
      margin-top: 4px;
      padding-top: 8px;
    }

    /* Thinking toggle row at bottom of dropdown */
    .sp-thinking-toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 9px 5px;
      border-top: 1px solid var(--agi-ext-border);
      margin-top: 4px;
    }
    .sp-thinking-toggle-label {
      flex: 1;
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      user-select: none;
      cursor: pointer;
    }
    .sp-thinking-toggle-label.active { color: var(--agi-ext-accent); }
    .sp-thinking-toggle {
      appearance: none;
      width: 28px;
      height: 15px;
      border-radius: 8px;
      background: var(--agi-ext-hover);
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
      border: none;
      outline: none;
    }
    .sp-thinking-toggle:checked { background: var(--agi-ext-accent); }
    .sp-thinking-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-thinking-toggle::after {
      content: '';
      position: absolute;
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: white;
      top: 2px;
      left: 2px;
      transition: transform 0.2s;
    }
    .sp-thinking-toggle:checked::after { transform: translateX(13px); }

    /* ── History dropdown ── */
    .sp-history-wrapper { position: relative; }
    #sp-history-dropdown {
      display: none;
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      width: 260px;
      max-height: 320px;
      overflow-y: auto;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 4px;
      z-index: 200;
      box-shadow: 0 4px 16px var(--agi-ext-modal-shadow);
    }
    #sp-history-dropdown.open { display: block; }
    #sp-history-dropdown::-webkit-scrollbar { width: 4px; }
    #sp-history-dropdown::-webkit-scrollbar-track { background: transparent; }
    #sp-history-dropdown::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }
    .sp-history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px 4px;
      border-bottom: 1px solid var(--agi-ext-border);
      margin-bottom: 2px;
    }
    .sp-history-title { font-size: 9px; font-weight: 600; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
    .sp-history-empty { padding: 12px 8px; color: var(--agi-ext-text-muted); font-size: 11px; text-align: center; }
    .sp-history-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 8px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .sp-history-item:hover { background: var(--agi-ext-hover); }
    .sp-history-item-text { flex: 1; min-width: 0; }
    .sp-history-item-title {
      font-size: 11px;
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-history-item-date { font-size: 9px; color: var(--agi-ext-text-muted); margin-top: 1px; }
    .sp-history-item-del {
      background: none;
      border: none;
      color: var(--agi-ext-text-muted);
      font-size: 12px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      line-height: 1;
      flex-shrink: 0;
      transition: color 0.12s, background 0.12s;
    }
    .sp-history-item-del:hover { color: var(--agi-ext-danger); background: var(--agi-ext-danger-bg); }

    /* ── Phase 2: Tab bar hidden (Workflows / CU are drawer launchers now) ── */
    #sp-tab-bar { display: none; }

    /* ── Phase 2: Settings drawer ──────────────────────────────────────────── */
    #sp-drawer-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: var(--agi-ext-scrim);
      z-index: 1000;
    }
    #sp-drawer-overlay.open { display: block; }
    #sp-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-width: 100%;
      background: var(--agi-ext-bg);
      border-left: 1px solid var(--agi-ext-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateX(100%);
      transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1001;
    }
    #sp-drawer.open { transform: translateX(0); }
    #sp-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
    }
    #sp-drawer-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--agi-ext-text);
    }
    #sp-drawer-close {
      background: transparent;
      border: none;
      color: var(--agi-ext-text-muted);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      transition: color 0.12s, background 0.12s;
    }
    #sp-drawer-close:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }
    #sp-drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 0 0 8px;
    }
    #sp-drawer-body::-webkit-scrollbar { width: 4px; }
    #sp-drawer-body::-webkit-scrollbar-track { background: transparent; }
    #sp-drawer-body::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }
    /* Drawer sections */
    .sp-drawer-section {
      padding: 12px 14px;
      border-bottom: 1px solid var(--agi-ext-border);
    }
    .sp-drawer-section-title {
      font-size: 9px;
      font-weight: 700;
      color: var(--agi-ext-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 10px;
    }
    /* Launcher buttons (Workflows / Computer Use) */
    .sp-drawer-launcher-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--agi-ext-text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      text-align: left;
      margin-bottom: 6px;
    }
    .sp-drawer-launcher-btn:last-child { margin-bottom: 0; }
    .sp-drawer-launcher-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-drawer-launcher-icon { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: var(--agi-ext-hover); }
    .sp-drawer-launcher-label { flex: 1; }
    .sp-drawer-launcher-desc { font-size: 10px; color: var(--agi-ext-text-muted); margin-top: 1px; font-weight: 400; }
    .sp-drawer-launcher-chevron { font-size: 10px; color: var(--agi-ext-text-muted); flex-shrink: 0; }
    /* Tools row */
    .sp-drawer-tools-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .sp-drawer-tool-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 7px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 6px 11px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      flex-shrink: 0;
    }
    .sp-drawer-tool-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-drawer-tool-btn.active { color: var(--agi-ext-success); border-color: var(--agi-ext-success-border); background: var(--agi-ext-success-bg); }
    /* Connection / pairing */
    .sp-drawer-pairing-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .sp-drawer-pairing-label { font-size: 12px; color: var(--agi-ext-text-muted); }
    .sp-drawer-pairing-fingerprint {
      font-size: 10px;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      color: var(--agi-ext-success);
      background: var(--agi-ext-success-bg);
      border: 1px solid var(--agi-ext-success-border);
      border-radius: 4px;
      padding: 1px 6px;
    }
    .sp-drawer-pairing-error {
      font-size: 11px;
      color: var(--agi-ext-danger);
      min-height: 16px;
      margin-bottom: 6px;
    }
    .sp-drawer-btn-row { display: flex; gap: 6px; }
    .sp-drawer-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 5px 12px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    .sp-drawer-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .sp-drawer-btn-primary { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-btn-primary:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); color: var(--agi-ext-on-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-btn-danger { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-drawer-btn-danger:hover { background: var(--agi-ext-danger-bg); color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    /* Allowlist */
    .sp-drawer-allowlist-help { font-size: 11px; color: var(--agi-ext-text-muted); line-height: 1.5; margin-bottom: 8px; }
    .sp-drawer-allowlist-current-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .sp-drawer-allowlist-origin {
      flex: 1;
      font-size: 11px;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-drawer-allowlist-toggle-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 5px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 3px 10px;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.12s, border-color 0.12s, background 0.12s;
    }
    .sp-drawer-allowlist-toggle-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-allowlist-toggle-btn.is-remove { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-drawer-allowlist-toggle-btn.is-remove:hover { background: var(--agi-ext-danger-bg); }
    .sp-drawer-allowlist-toggle-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .sp-drawer-allowlist-list { list-style: none; display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
    .sp-drawer-allowlist-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 5px;
      font-size: 11px;
    }
    .sp-drawer-allowlist-item.is-current { border-color: var(--agi-ext-accent); }
    .sp-drawer-allowlist-item-origin {
      flex: 1;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-drawer-allowlist-item-remove {
      background: none;
      border: none;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      cursor: pointer;
      padding: 1px 5px;
      border-radius: 3px;
      transition: color 0.12s, background 0.12s;
      flex-shrink: 0;
    }
    .sp-drawer-allowlist-item-remove:hover { color: var(--agi-ext-danger); background: var(--agi-ext-danger-bg); }
    .sp-drawer-allowlist-empty { font-size: 11px; color: var(--agi-ext-text-muted); padding: 4px 0; }
    /* Memory */
    .sp-drawer-memory-help { font-size: 11px; color: var(--agi-ext-text-muted); line-height: 1.5; margin-bottom: 8px; }
    .sp-drawer-memory-add-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 5px 12px;
      cursor: pointer;
      transition: color 0.12s, border-color 0.12s;
      margin-bottom: 8px;
    }
    .sp-drawer-memory-add-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-memory-editor { display: none; flex-direction: column; gap: 6px; margin-bottom: 8px; }
    .sp-drawer-memory-editor.open { display: flex; }
    .sp-drawer-memory-textarea {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 12px;
      padding: 6px 9px;
      outline: none;
      font-family: inherit;
      resize: none;
      height: 64px;
      line-height: 1.4;
      width: 100%;
      box-sizing: border-box;
    }
    .sp-drawer-memory-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-drawer-memory-textarea::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-drawer-memory-editor-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .sp-drawer-memory-list { list-style: none; display: flex; flex-direction: column; gap: 5px; }
    .sp-drawer-memory-item {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 7px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .sp-drawer-memory-item-content { font-size: 11px; color: var(--agi-ext-text); line-height: 1.4; }
    .sp-drawer-memory-item-meta { font-size: 9px; color: var(--agi-ext-text-muted); }
    .sp-drawer-memory-item-row { display: flex; gap: 5px; margin-top: 2px; }
    .sp-drawer-memory-item-edit-btn {
      background: none; border: 1px solid var(--agi-ext-border); border-radius: 4px;
      color: var(--agi-ext-text-muted); font-size: 10px; padding: 2px 6px; cursor: pointer;
      transition: color 0.12s, border-color 0.12s;
    }
    .sp-drawer-memory-item-edit-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-memory-item-delete-btn {
      background: none; border: 1px solid var(--agi-ext-border); border-radius: 4px;
      color: var(--agi-ext-text-muted); font-size: 10px; padding: 2px 6px; cursor: pointer;
      transition: color 0.12s, border-color 0.12s, background 0.12s;
    }
    .sp-drawer-memory-item-delete-btn:hover { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-drawer-memory-item-delete-btn.is-confirm { color: white; background: var(--agi-ext-danger); border-color: var(--agi-ext-danger); }
    .sp-drawer-memory-item-textarea {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 5px;
      color: var(--agi-ext-text);
      font-size: 11px;
      padding: 5px 7px;
      outline: none;
      font-family: inherit;
      resize: none;
      height: 52px;
      line-height: 1.4;
      width: 100%;
      box-sizing: border-box;
    }
    .sp-drawer-memory-item-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-drawer-memory-empty { font-size: 11px; color: var(--agi-ext-text-muted); padding: 4px 0; }
    /* In-page panel toggle */
    .sp-drawer-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sp-drawer-toggle-label { font-size: 12px; color: var(--agi-ext-text-muted); }
    .sp-drawer-toggle-switch {
      appearance: none;
      width: 34px;
      height: 18px;
      border-radius: 9px;
      background: var(--agi-ext-hover);
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
      border: none;
      outline: none;
    }
    .sp-drawer-toggle-switch:checked { background: var(--agi-ext-accent); }
    .sp-drawer-toggle-switch:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-drawer-toggle-switch::after {
      content: '';
      position: absolute;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: white;
      top: 2.5px;
      left: 2.5px;
      transition: transform 0.2s;
    }
    .sp-drawer-toggle-switch:checked::after { transform: translateX(16px); }
    /* Bridge URL inside drawer */
    .sp-drawer-bridge-row { display: flex; gap: 6px; margin-top: 4px; }
    .sp-drawer-bridge-input {
      flex: 1;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 11px;
      padding: 5px 8px;
      outline: none;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      transition: border-color 0.15s;
      min-width: 0;
    }
    .sp-drawer-bridge-input:focus { border-color: var(--agi-ext-focus); }
    .sp-drawer-bridge-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-drawer-bridge-error { font-size: 10px; color: var(--agi-ext-danger); padding: 2px 0; margin-top: 2px; }
    /* Cloud unlock */
    .sp-drawer-cloud-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
      border-radius: 7px;
      color: var(--agi-ext-accent);
      font-size: 12px;
      font-weight: 500;
      padding: 8px 14px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .sp-drawer-cloud-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 20%, transparent); border-color: var(--agi-ext-accent); }

    /* ── AGI Cloud sign-in / quota UI ── */
    .sp-cloud-account {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sp-cloud-signed-in {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sp-cloud-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--agi-ext-accent) 20%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 35%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--agi-ext-accent);
      flex-shrink: 0;
    }
    .sp-cloud-user-info {
      flex: 1;
      min-width: 0;
    }
    .sp-cloud-user-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--agi-ext-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sp-cloud-user-tier {
      font-size: 10px;
      color: var(--agi-ext-text-muted);
    }
    .sp-cloud-signout-btn {
      background: transparent;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 5px;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      padding: 3px 7px;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.15s, border-color 0.15s;
    }
    .sp-cloud-signout-btn:hover { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger); }

    /* Quota bar */
    .sp-quota-bar-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .sp-quota-bar-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--agi-ext-text-muted);
    }
    .sp-quota-bar-model {
      font-size: 9px;
      color: var(--agi-ext-text-muted);
      opacity: 0.7;
    }
    .sp-quota-bar-bg {
      height: 4px;
      border-radius: 2px;
      background: var(--agi-ext-border);
      overflow: hidden;
    }
    .sp-quota-bar-fill {
      height: 100%;
      border-radius: 2px;
      background: var(--agi-ext-accent);
      transition: width 0.3s ease;
    }
    .sp-quota-bar-fill.exhausted {
      background: var(--agi-ext-danger);
    }
    .sp-quota-upgrade-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .sp-quota-upgrade-btn {
      font-size: 10px;
      font-weight: 600;
      color: var(--agi-ext-accent);
      background: color-mix(in srgb, var(--agi-ext-accent) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 25%, transparent);
      border-radius: 5px;
      padding: 3px 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.12s;
    }
    .sp-quota-upgrade-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 18%, transparent); }

    /* Sign-in prompt (when not signed in) */
    .sp-cloud-signin-prompt {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sp-cloud-signin-desc {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
      line-height: 1.45;
    }
    .sp-cloud-signin-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      background: var(--agi-ext-accent);
      border: none;
      border-radius: 7px;
      color: var(--agi-ext-on-accent);
      font-size: 12px;
      font-weight: 600;
      padding: 8px 14px;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .sp-cloud-signin-btn:hover { opacity: 0.88; }
    .sp-cloud-token-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .sp-cloud-token-input {
      flex: 1;
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 10px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      padding: 5px 8px;
      outline: none;
      min-width: 0;
      transition: border-color 0.15s;
    }
    .sp-cloud-token-input:focus { border-color: var(--agi-ext-focus); }
    .sp-cloud-token-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.55; }
    .sp-cloud-token-save-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 10px;
      font-weight: 600;
      padding: 5px 9px;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.12s;
    }
    .sp-cloud-token-save-btn:hover { background: var(--agi-ext-hover); }
    .sp-cloud-token-hint {
      font-size: 9px;
      color: var(--agi-ext-text-muted);
      opacity: 0.7;
      line-height: 1.4;
    }

    /* Quota badge in the chat header */
    #sp-quota-badge {
      display: none;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      padding: 2px 7px;
      white-space: nowrap;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    #sp-quota-badge.visible { display: flex; }
    #sp-quota-badge.has-prompts {
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      color: var(--agi-ext-accent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 28%, transparent);
    }
    #sp-quota-badge.exhausted {
      background: var(--agi-ext-danger-bg);
      color: var(--agi-ext-danger);
      border: 1px solid var(--agi-ext-danger-border);
    }
    #sp-quota-badge:hover { opacity: 0.8; }

    /* Drawer footer */
    #sp-drawer-footer {
      padding: 10px 14px;
      border-top: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
      background: var(--agi-ext-bg);
    }
    .sp-drawer-stats-row {
      display: flex;
      gap: 12px;
      margin-bottom: 8px;
    }
    .sp-drawer-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 5px 10px;
      flex: 1;
    }
    .sp-drawer-stat-value { font-size: 14px; font-weight: 600; color: var(--agi-ext-text); }
    .sp-drawer-stat-label { font-size: 9px; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .sp-drawer-about-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      gap: 4px;
    }
    .sp-drawer-about-url {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 140px;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
    }
    /* ⋮ button in header */
    #sp-menu-btn {
      position: relative;
    }

    /* ── First-run onboarding carousel overlay ── */
    #sp-onboarding-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: var(--agi-ext-bg);
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      overflow: hidden;
    }
    #sp-onboarding-overlay.visible { display: flex; }

    #sp-onboarding-header {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 10px 12px 6px;
      flex-shrink: 0;
    }
    #sp-onboarding-skip {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 5px;
      transition: color 0.15s, background 0.15s;
    }
    #sp-onboarding-skip:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }
    #sp-onboarding-skip:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    #sp-onboarding-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* individual step panels */
    .sp-ob-step {
      display: none;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 20px 24px 0;
      gap: 0;
      overflow-y: auto;
    }
    .sp-ob-step.active { display: flex; }

    .sp-ob-hero {
      width: 80px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
      flex-shrink: 0;
    }
    .sp-ob-hero svg { width: 80px; height: 80px; display: block; }

    .sp-ob-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--agi-ext-text);
      text-align: center;
      margin-bottom: 16px;
      flex-shrink: 0;
    }

    /* Step 1 uses icon-text rows instead of a body paragraph */
    .sp-ob-rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      max-width: 340px;
    }
    .sp-ob-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .sp-ob-row-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
      color: var(--agi-ext-text-muted);
    }
    .sp-ob-row-icon svg { width: 16px; height: 16px; display: block; }
    .sp-ob-row-icon.danger { color: var(--agi-ext-danger); }
    .sp-ob-row-text {
      font-size: 12px;
      color: var(--agi-ext-text-muted);
      line-height: 1.5;
    }
    .sp-ob-row-text.danger { color: var(--agi-ext-danger); }
    .sp-ob-learn-more {
      color: var(--agi-ext-accent);
      text-decoration: underline;
      cursor: pointer;
      background: none;
      border: none;
      font-size: 12px;
      padding: 0;
      display: inline;
      font-family: inherit;
    }
    .sp-ob-learn-more:hover { opacity: 0.8; }
    .sp-ob-learn-more:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* Steps 2-5 body text */
    .sp-ob-body {
      font-size: 12px;
      color: var(--agi-ext-text-muted);
      line-height: 1.6;
      text-align: center;
      max-width: 300px;
      flex-shrink: 0;
    }

    /* footer: step dots + nav buttons */
    #sp-onboarding-footer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 14px 24px 22px;
      flex-shrink: 0;
    }

    .sp-ob-dots {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .sp-ob-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--agi-ext-border-strong);
      transition: background 0.2s, width 0.2s;
    }
    .sp-ob-dot.active {
      width: 18px;
      border-radius: 3px;
      background: var(--agi-ext-accent);
    }

    .sp-ob-nav {
      display: flex;
      gap: 8px;
      width: 100%;
      max-width: 300px;
    }
    .sp-ob-btn-back {
      flex: 1;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--agi-ext-border-strong);
      background: transparent;
      color: var(--agi-ext-text-muted);
      font-size: 12px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
      font-family: inherit;
    }
    .sp-ob-btn-back:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-ob-btn-back:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-ob-btn-back[hidden] { display: none; }

    .sp-ob-btn-next {
      flex: 2;
      padding: 8px 14px;
      border-radius: 8px;
      border: none;
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.12s;
      font-family: inherit;
    }
    .sp-ob-btn-next:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-ob-btn-next:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
  `;
  // M-08 audit 2026-05-19: Constructable Stylesheet — CSP-compliant
  // because it's a DOM API call, not a <style> tag.
  if (
    typeof CSSStyleSheet === 'function' &&
    typeof (CSSStyleSheet.prototype as { replaceSync?: unknown }).replaceSync === 'function'
  ) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText + '\n' + COMPUTER_USE_PANEL_CSS);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } else {
    // Fallback path for environments without Constructable Stylesheets
    // (some JSDOM versions used in tests). Tests don't render the panel,
    // so missing styles here is acceptable.
    const fallback = document.createElement('style');
    fallback.textContent = cssText;
    document.head.appendChild(fallback);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

function scrollToBottom(): void {
  const msgs = document.getElementById('sp-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildBubble(msg: ChatMessage): HTMLElement {
  const isUser = msg.role === 'user';
  const wrapper = el('div', { class: `sp-msg sp-msg-${msg.role}`, 'data-id': msg.id });

  const bubble = el('div', {
    class: `sp-bubble sp-bubble-${msg.role}${msg.error ? ' sp-bubble-error' : ''}${msg.streaming ? ' sp-cursor' : ''}`,
    id: `sp-bubble-${msg.id}`,
  });

  if (isUser) {
    bubble.textContent = msg.content;
  } else {
    bubble.innerHTML = sanitizeHtml(renderMarkdown(msg.content));
  }

  wrapper.appendChild(bubble);

  // Action row: timestamp + copy button (assistant only)
  const actionRow = el('div', { class: 'sp-bubble-actions' });
  const ts = el('span', { class: 'sp-timestamp' }, formatTime(msg.timestamp));
  actionRow.appendChild(ts);

  if (!isUser) {
    const copyBtn = el('button', {
      class: 'sp-copy-btn',
      title: 'Copy',
      'aria-label': 'Copy response',
    });
    copyBtn.appendChild(renderIcon(Copy, 11));
    copyBtn.addEventListener('click', () => {
      navigator.clipboard
        .writeText(msg.content)
        .then(() => {
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 1500);
        })
        .catch(() => {});
    });
    actionRow.appendChild(copyBtn);
  }

  wrapper.appendChild(actionRow);
  return wrapper;
}

/** Map tool name to its Lucide SVG string. */
function toolIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('bash') || n.includes('shell') || n.includes('terminal') || n.includes('run'))
    return Terminal;
  if (n.includes('write') || n.includes('create')) return FilePen;
  if (n.includes('edit') || n.includes('patch') || n.includes('apply')) return FilePen;
  if (n.includes('read') || n.includes('view') || n.includes('file')) return FileText;
  if (n.includes('search') || n.includes('find')) return Search;
  if (n.includes('fetch') || n.includes('url') || n.includes('web')) return Globe;
  if (n.includes('list') || n.includes('ls') || n.includes('dir') || n.includes('folder'))
    return Folder;
  if (n.includes('mcp') || n.includes('plug') || n.includes('tool')) return Plug;
  if (n.includes('done') || n.includes('check') || n.includes('success')) return CircleCheck;
  if (n.includes('load') || n.includes('pending') || n.includes('running')) return Loader2;
  return Plug;
}

interface ToolCallBlock {
  name: string;
  summary: string;
  body: string;
  state: 'pending' | 'running' | 'success' | 'error';
}

/**
 * Parse tool-call fences from message content.
 * Format: [TOOL:name:state] summary\nbody\n[/TOOL]
 * Returns segments: plain text strings or ToolCallBlock objects.
 */
function parseToolCalls(content: string): Array<string | ToolCallBlock> {
  const segments: Array<string | ToolCallBlock> = [];
  // Regex: [TOOL:name:state] summary\nbody\n[/TOOL]
  const re = /\[TOOL:([^:\]]+):?(pending|running|success|error)?\]([\s\S]*?)\[\/TOOL\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) segments.push(content.slice(last, m.index));
    const name = m[1]!.trim();
    const state = (m[2] ?? 'success') as ToolCallBlock['state'];
    const inner = m[3] ?? '';
    const newline = inner.indexOf('\n');
    const summary = newline >= 0 ? inner.slice(0, newline).trim() : inner.trim();
    const body = newline >= 0 ? inner.slice(newline + 1).trim() : '';
    segments.push({ name, summary, body, state });
    last = m.index + m[0].length;
  }
  if (last < content.length) segments.push(content.slice(last));
  return segments;
}

function buildToolCallEl(block: ToolCallBlock): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `tool-call tool-call--${block.state}`;

  const bar = document.createElement('div');
  bar.className = 'tool-call__bar';
  bar.setAttribute('role', 'button');
  bar.setAttribute('aria-expanded', 'false');
  bar.setAttribute('tabindex', '0');

  const iconEl = renderIcon(
    block.state === 'pending' || block.state === 'running' ? Loader2 : toolIcon(block.name),
    14,
    'tool-call__icon',
  );
  bar.appendChild(iconEl);

  const label = document.createElement('span');
  label.className = 'tool-call__label';
  label.textContent = block.name;
  bar.appendChild(label);

  if (block.summary) {
    const summary = document.createElement('span');
    summary.className = 'tool-call__summary';
    summary.textContent = block.summary;
    bar.appendChild(summary);
  }

  const chevron = renderIcon(ChevronRight, 12, 'tool-call__chevron');
  bar.appendChild(chevron);

  const body = document.createElement('div');
  body.className = 'tool-call__body';
  body.textContent = block.body;

  const toggle = (): void => {
    const open = wrapper.classList.toggle('tool-call--open');
    bar.setAttribute('aria-expanded', String(open));
  };
  bar.addEventListener('click', toggle);
  bar.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  wrapper.appendChild(bar);
  wrapper.appendChild(body);
  return wrapper;
}

function buildBubbleWithTools(msg: ChatMessage): HTMLElement {
  const segments = parseToolCalls(msg.content);
  const hasTools = segments.some((s) => typeof s !== 'string');
  if (!hasTools) return buildBubble(msg);

  const wrapper = document.createElement('div');
  wrapper.className = `sp-msg sp-msg-${msg.role}`;
  wrapper.setAttribute('data-id', msg.id);

  const textParts: string[] = [];
  const toolBlocks: ToolCallBlock[] = [];

  for (const seg of segments) {
    if (typeof seg === 'string') {
      textParts.push(seg);
    } else {
      toolBlocks.push(seg);
    }
  }

  if (textParts.join('').trim()) {
    const bubble = document.createElement('div');
    bubble.className = `sp-bubble sp-bubble-${msg.role}${msg.error ? ' sp-bubble-error' : ''}${msg.streaming ? ' sp-cursor' : ''}`;
    bubble.id = `sp-bubble-${msg.id}`;
    bubble.innerHTML = sanitizeHtml(renderMarkdown(textParts.join('')));
    wrapper.appendChild(bubble);
  }

  if (toolBlocks.length > 0) {
    if (toolBlocks.length === 1) {
      wrapper.appendChild(buildToolCallEl(toolBlocks[0]!));
    } else {
      const stack = document.createElement('div');
      stack.className = 'tool-call-stack';
      for (const block of toolBlocks) {
        stack.appendChild(buildToolCallEl(block));
      }
      wrapper.appendChild(stack);
    }
  }

  const actionRow = document.createElement('div');
  actionRow.className = 'sp-bubble-actions';
  const ts = document.createElement('span');
  ts.className = 'sp-timestamp';
  ts.textContent = formatTime(msg.timestamp);
  actionRow.appendChild(ts);

  if (msg.role === 'assistant') {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'sp-copy-btn';
    copyBtn.title = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy response');
    copyBtn.appendChild(renderIcon(Copy, 11));
    copyBtn.addEventListener('click', () => {
      const text = textParts.join('').trim();
      navigator.clipboard
        .writeText(text || msg.content)
        .then(() => {
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 1500);
        })
        .catch(() => {});
    });
    actionRow.appendChild(copyBtn);
  }

  wrapper.appendChild(actionRow);
  return wrapper;
}

function renderMessages(): void {
  const container = document.getElementById('sp-messages')!;
  const chips = document.getElementById('sp-prompt-chips');
  const emptyEl = document.getElementById('sp-empty');

  if (_ctx.messages.length === 0) {
    if (chips) chips.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.remove('hidden');
    // Remove all message nodes and reset counter
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    _ctx.lastRenderedCount = 0;
    return;
  }

  if (chips) chips.classList.add('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');

  // Only append messages that haven't been rendered yet — avoids full DOM rebuild on each
  // streaming chunk and preserves browser focus/scroll state for already-rendered bubbles.
  if (_ctx.lastRenderedCount > _ctx.messages.length) {
    // Messages were cleared — rebuild from scratch
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    _ctx.lastRenderedCount = 0;
  }

  for (let i = _ctx.lastRenderedCount; i < _ctx.messages.length; i++) {
    const msg = _ctx.messages[i];
    if (msg) container.appendChild(buildBubbleWithTools(msg));
  }
  _ctx.lastRenderedCount = _ctx.messages.length;

  scrollToBottom();
}

function showThinking(): void {
  const container = document.getElementById('sp-messages')!;
  const chips = document.getElementById('sp-prompt-chips');
  if (chips) chips.classList.add('hidden');

  const wrap = el('div', { class: 'sp-msg sp-msg-assistant sp-thinking-wrap' });
  const thinking = el('div', { class: 'sp-thinking' });
  thinking.appendChild(el('div', { class: 'sp-dot' }));
  thinking.appendChild(el('div', { class: 'sp-dot' }));
  thinking.appendChild(el('div', { class: 'sp-dot' }));
  wrap.appendChild(thinking);
  container.appendChild(wrap);
  scrollToBottom();
}

function removeThinking(): void {
  document.querySelectorAll('.sp-thinking-wrap').forEach((n) => n.remove());
}

function updateStreamingBubble(id: string, fullText: string, done: boolean): void {
  const bubble = document.getElementById(`sp-bubble-${id}`);
  if (!bubble) return;
  bubble.innerHTML = sanitizeHtml(renderMarkdown(fullText));
  if (done) {
    bubble.classList.remove('sp-cursor');
  } else {
    bubble.classList.add('sp-cursor');
  }
  scrollToBottom();
}

async function capturePageContext(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const tab = tabs[0];
      if (!tab?.id) {
        resolve(null);
        return;
      }
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => (document.body?.innerText ?? '').slice(0, 5000),
        },
        (results) => {
          if (chrome.runtime.lastError || !results?.[0]) {
            resolve(null);
          } else {
            const raw = typeof results[0].result === 'string' ? results[0].result : '';
            resolve(sanitizePageText(raw).slice(0, 5000));
          }
        },
      );
    });
  });
}

function expandSlashCommand(
  raw: string,
): { display: string; prompt: string; captureContext: boolean } | null {
  const trimmed = raw.trim();
  const commands: Record<string, { display: string; prompt: string; captureContext: boolean }> = {
    '/summarize': {
      display: '/summarize',
      prompt:
        'Summarize this page concisely. Include key points, main arguments, and any important details.',
      captureContext: true,
    },
    '/explain': {
      display: '/explain',
      prompt: 'Explain the content of this page in simple terms. Break down any complex concepts.',
      captureContext: true,
    },
    '/translate': {
      display: '/translate',
      prompt:
        'Translate the main content of this page to English. If already in English, translate to Spanish.',
      captureContext: true,
    },
    '/extract': {
      display: '/extract',
      prompt:
        'Extract the key structured data from this page: names, dates, numbers, emails, URLs, addresses, and any other notable entities. Format as a bulleted list.',
      captureContext: true,
    },
    '/code': {
      display: '/code',
      prompt:
        'Extract and explain all code snippets on this page. For each snippet, describe what it does and suggest improvements.',
      captureContext: true,
    },
    '/tldr': {
      display: '/tldr',
      prompt: 'Give me a TL;DR of this page in 2-3 sentences.',
      captureContext: true,
    },
  };

  if (commands[trimmed]) return commands[trimmed]!;

  // e.g. "/translate to French"
  for (const [cmd, meta] of Object.entries(commands)) {
    if (trimmed.startsWith(cmd + ' ')) {
      const extra = trimmed.slice(cmd.length + 1).trim();
      return {
        display: trimmed,
        prompt: `${meta.prompt}\n\nAdditional instruction: ${extra}`,
        captureContext: meta.captureContext,
      };
    }
  }

  return null;
}

function sendMessage(text: string): void {
  if (!text.trim() || _ctx.isStreaming) return;

  // Route through the shared priority send queue for backpressure /
  // cancellation parity with other surfaces. Drain immediately — current
  // behavior is direct send.
  try {
    extensionSendQueue.enqueue({ value: text, mode: 'prompt' });
  } catch (err) {
    if (err instanceof QueueFullError) {
      console.warn('[SidePanel] queue lane full:', err.lane);
      return;
    }
    throw err;
  }
  extensionSendQueue.dequeue();

  const slashCmd = expandSlashCommand(text);
  if (slashCmd?.captureContext) {
    // For context-requiring commands, auto-capture page context first
    const displayText = slashCmd.display;
    const actualPrompt = slashCmd.prompt;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: displayText,
      timestamp: Date.now(),
    };
    _ctx.messages.push(userMsg);
    saveMessages();
    renderMessages();

    capturePageContext()
      .then((capturedCtx) => {
        if (capturedCtx) _ctx.pendingPageContext = capturedCtx;

        const pageCtx = _ctx.pendingPageContext;
        _ctx.pendingPageContext = null;
        // Round-2 audit P0 #3 fix (2026-05-21): snapshot pendingAttachments
        // BEFORE clearing so the wire payload below carries them. Prior
        // behaviour cleared the buffer first, so attachments never reached
        // the background handler.
        const attachmentsToSend = pendingAttachments.slice();
        pendingAttachments.length = 0;
        updateContextButton();
        updateAttachmentPreview();

        const streamId = `a-${Date.now()}`;
        _ctx.currentStreamId = streamId;
        _ctx.isStreaming = true;
        updateSendButton();

        if (_ctx.streamTimeoutHandle) clearTimeout(_ctx.streamTimeoutHandle);
        _ctx.streamTimeoutHandle = setTimeout(() => {
          if (_ctx.isStreaming && _ctx.currentStreamId === streamId) {
            handleStreamError(streamId, 'Response timed out. Please try again.');
          }
          _ctx.streamTimeoutHandle = null;
        }, 90_000);

        showThinking();

        const history = _ctx.messages
          .slice(0, -1)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        chrome.runtime.sendMessage(
          {
            type: 'CHAT_MESSAGE',
            id: streamId,
            text: actualPrompt,
            pageContext: pageCtx ?? undefined,
            conversationHistory: history,
            // Round-2 audit P0 #3 (2026-05-21): forward the snapshot taken
            // above so the model can see the user's images / pastes.
            attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
            // SECURITY (H-10 audit 2026-05-19): `apiKey:` stays off the
            // CHAT_MESSAGE wire payload. Chrome chat remains bridge-scoped.
            // Phase 3 bridge: bridge must consume extendedThinking and
            // forward to providers that support it (Anthropic thinking blocks,
            // OpenAI reasoning effort, Gemini thinkingBudget).
            extendedThinking: _ctx.thinkingEnabled || undefined,
          },
          () => {
            if (chrome.runtime.lastError) {
              handleStreamError(streamId, chrome.runtime.lastError.message ?? 'Extension error');
            }
          },
        );
      })
      .catch((err) => {
        console.error('[SidePanel] Failed to capture page context for chat:', err);
      });
    return;
  }

  const userMsg: ChatMessage = {
    id: `u-${Date.now()}`,
    role: 'user',
    content: text.trim(),
    timestamp: Date.now(),
  };
  _ctx.messages.push(userMsg);
  saveMessages();
  renderMessages();

  const pageCtx = _ctx.pendingPageContext;
  _ctx.pendingPageContext = null;
  // Round-2 audit P0 #3 fix (2026-05-21): snapshot before clearing so the
  // CHAT_MESSAGE payload below actually carries the user's attachments.
  const attachmentsToSend = pendingAttachments.slice();
  pendingAttachments.length = 0;
  updateContextButton();
  updateAttachmentPreview();

  const streamId = `a-${Date.now()}`;
  _ctx.currentStreamId = streamId;
  _ctx.isStreaming = true;
  updateSendButton();

  // Safety timeout: if no chunks arrive within 90s, stop streaming to prevent stuck UI
  if (_ctx.streamTimeoutHandle) clearTimeout(_ctx.streamTimeoutHandle);
  _ctx.streamTimeoutHandle = setTimeout(() => {
    if (_ctx.isStreaming && _ctx.currentStreamId === streamId) {
      handleStreamError(streamId, 'Response timed out. Please try again.');
    }
    _ctx.streamTimeoutHandle = null;
  }, 90_000);

  showThinking();

  // Build conversation history (exclude the message we're about to send)
  const history = _ctx.messages
    .slice(0, -1)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  chrome.runtime.sendMessage(
    {
      type: 'CHAT_MESSAGE',
      id: streamId,
      text: userMsg.content,
      pageContext: pageCtx ?? undefined,
      conversationHistory: history,
      // Round-2 audit P0 #3 (2026-05-21): forward the snapshot so attachments
      // actually reach the model.
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      // SECURITY (H-10 audit 2026-05-19): `apiKey:` stays off the
      // CHAT_MESSAGE wire payload. See chrome-HIGH-3.
      // Phase 3 bridge: bridge must consume extendedThinking and
      // forward to providers that support it (Anthropic thinking blocks,
      // OpenAI reasoning effort, Gemini thinkingBudget).
      extendedThinking: _ctx.thinkingEnabled || undefined,
    },
    () => {
      if (chrome.runtime.lastError) {
        handleStreamError(streamId, chrome.runtime.lastError.message ?? 'Extension error');
      }
    },
  );
}

function handleStreamError(id: string, errorText: string): void {
  if (_ctx.streamTimeoutHandle) {
    clearTimeout(_ctx.streamTimeoutHandle);
    _ctx.streamTimeoutHandle = null;
  }
  removeThinking();
  const assistantMsg: ChatMessage = {
    id,
    role: 'assistant',
    content: `Error: ${errorText}`,
    error: true,
    timestamp: Date.now(),
  };
  _ctx.messages.push(assistantMsg);
  saveMessages();
  renderMessages();
  _ctx.isStreaming = false;
  _ctx.currentStreamId = null;
  updateSendButton();
}

function updateConnectionStatus(): void {
  const pill = document.getElementById('sp-status-pill');
  if (!pill) return;
  if (_ctx.isConnected) {
    // Bridge is online (native or HTTP bridge connected).
    pill.className = 'connected';
    const dot = document.createElement('span');
    dot.className = 'sp-status-dot';
    pill.replaceChildren(dot, 'Bridge');
  } else {
    // No bridge — fail closed inside the extension boundary.
    pill.className = 'disconnected';
    const dot = document.createElement('span');
    dot.className = 'sp-status-dot';
    pill.replaceChildren(dot, 'Offline');
  }
  // Keep composer gate and model picker in sync whenever connection changes.
  updateComposerGatedByConnection();
}

/**
 * Gate the chat composer based on bridge availability.
 *
 * When the desktop bridge is offline:
 *  - The bridge-notice banner is shown above the input.
 *  - The textarea placeholder explains why input is blocked.
 *  - The send button is disabled (unless already streaming, which has its own stop).
 *  - The model picker is dimmed (selection is stored but has no immediate effect).
 *
 * When connected, all restrictions are lifted.  setBlockedState() may
 * separately disable the composer on restricted URLs; that takes precedence
 * because a restricted URL means AGI can't read the page at all.
 */
function updateComposerGatedByConnection(): void {
  const notice = document.getElementById('sp-bridge-notice');
  const inputEl = document.getElementById('sp-input') as HTMLTextAreaElement | null;
  const sendBtnEl = document.getElementById('sp-send-btn') as HTMLButtonElement | null;
  const modelWrap = document.querySelector('.sp-model-selector-wrap');

  const offline = !_ctx.isConnected;

  if (notice) {
    notice.classList.toggle('visible', offline);
  }

  if (modelWrap) {
    modelWrap.classList.toggle('bridge-offline', offline);
  }

  // Only change the input/send state when the page is NOT already blocked
  // by setBlockedState (blocked = input.disabled set because of restricted URL).
  // We detect this by checking if input is already disabled for a non-connection reason:
  // setBlockedState sets placeholder to "Can't access this page" — if that is set, leave it.
  if (inputEl && inputEl.placeholder !== "Can't access this page") {
    if (offline) {
      inputEl.placeholder = 'Start the AGI desktop app to enable chat…';
    } else {
      inputEl.placeholder = 'Ask anything... (/ for commands)';
    }
  }

  // Disable send unless we're actively streaming (stop button must remain enabled)
  if (sendBtnEl && sendBtnEl.getAttribute('data-mode') !== 'stop') {
    sendBtnEl.disabled = offline;
  }
}

// BLOCKER-02b: show/hide the offline onboarding screen
function setOfflineOnboardingVisible(visible: boolean): void {
  const el2 = document.getElementById('sp-offline-onboarding');
  const msgsEl = document.getElementById('sp-messages');
  if (!el2) return;
  if (visible) {
    el2.classList.add('visible');
    // Hide other message-area content while onboarding is shown
    if (msgsEl) {
      msgsEl.querySelectorAll('.sp-msg, .sp-thinking-wrap, #sp-empty').forEach((n) => {
        (n as HTMLElement).style.display = 'none';
      });
    }
  } else {
    el2.classList.remove('visible');
    if (msgsEl) {
      msgsEl.querySelectorAll('.sp-msg, .sp-thinking-wrap, #sp-empty').forEach((n) => {
        (n as HTMLElement).style.display = '';
      });
    }
  }
}

// BLOCKER-02: render inline permission consent card in the messages area
function renderPermissionCard(requestId: string, domain: string, actionDescription: string): void {
  const msgsEl = document.getElementById('sp-messages');
  if (!msgsEl) return;

  // Remove any existing card with the same requestId (idempotent)
  const existing = document.querySelector(`[data-permission-id="${CSS.escape(requestId)}"]`);
  if (existing) existing.remove();

  const card = document.createElement('div');
  card.className = 'sp-permission-card';
  card.setAttribute('data-permission-id', requestId);

  const titleEl = document.createElement('div');
  titleEl.className = 'sp-permission-card-title';
  titleEl.textContent = 'Permission required';
  card.appendChild(titleEl);

  const descEl = document.createElement('div');
  descEl.className = 'sp-permission-card-desc';
  descEl.textContent = `AGI wants to ${actionDescription}. Allow?`;
  card.appendChild(descEl);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'sp-permission-card-actions';

  const sendDecision = (decision: 'allow' | 'deny' | 'always'): void => {
    card.remove();
    chrome.runtime
      .sendMessage({ type: 'PERMISSION_RESPONSE', requestId, decision })
      .catch((err: unknown) => console.warn('[SidePanel] PERMISSION_RESPONSE failed:', err));
  };

  const allowBtn = document.createElement('button');
  allowBtn.className = 'sp-permission-btn sp-permission-btn-allow';
  allowBtn.textContent = 'Allow this action';
  allowBtn.addEventListener('click', () => sendDecision('allow'));
  actionsRow.appendChild(allowBtn);

  const alwaysBtn = document.createElement('button');
  alwaysBtn.className = 'sp-permission-btn sp-permission-btn-always';
  alwaysBtn.textContent = `Always allow on ${domain}`;
  alwaysBtn.addEventListener('click', () => sendDecision('always'));
  actionsRow.appendChild(alwaysBtn);

  const denyBtn = document.createElement('button');
  denyBtn.className = 'sp-permission-btn';
  denyBtn.textContent = 'Decline';
  denyBtn.addEventListener('click', () => sendDecision('deny'));
  actionsRow.appendChild(denyBtn);

  card.appendChild(actionsRow);
  msgsEl.appendChild(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

let contextBtn: HTMLButtonElement | null = null;

function updateContextButton(): void {
  // contextBtn is now the persistent composer-bar chip (sp-context-chip)
  if (!contextBtn) return;
  const hostname = currentPageHostname || 'page';
  if (_ctx.pendingPageContext) {
    contextBtn.classList.add('has-context');
    contextBtn.title = 'Page context attached — click to detach';
    contextBtn.textContent = hostname;
  } else {
    contextBtn.classList.remove('has-context');
    contextBtn.title = 'Attach page content to next message';
    contextBtn.textContent = hostname;
  }
}

function updateModelBadge(modelId: string): void {
  const badge = document.getElementById('sp-model-badge');
  if (!badge) return;
  const normalizedModelId = normalizeModelId(modelId) ?? modelId;
  badge.textContent = getModelBadgeLabel(normalizedModelId);
}

function updateSendButton(): void {
  const btn = document.getElementById('sp-send-btn') as HTMLButtonElement | null;
  if (!btn) return;
  if (_ctx.isStreaming) {
    btn.disabled = false;
    btn.setAttribute('data-mode', 'stop');
    btn.title = 'Stop generating';
    clearChildren(btn);
    btn.appendChild(renderIcon(Square, 14));
  } else {
    btn.disabled = false;
    btn.setAttribute('data-mode', 'send');
    btn.title = 'Send';
    clearChildren(btn);
    btn.appendChild(renderIcon(ArrowUp, 16));
  }
}

/**
 * Read a File as a data URL with a single Promise wrapper around FileReader.
 * Keeps the drop/paste path readable without sprinkling reader.onload chains
 * through the call sites. Resolves to null on read error so callers can
 * filter and move on instead of throwing through Promise.all.
 */
function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Accept files from a drag-drop or paste event and append their data URLs to
 * `pendingAttachments`. Enforces the same caps as the VS Code webview: max
 * 8 files per call total (including any already pending) and 10 MB per file.
 * Image-only filter matches the existing +menu accept="image/*" behavior.
 *
 * Round-2 audit P0 #3 — chrome-ext composer drag-drop + paste-image wire,
 * 2026-05-21. Reuses the existing attachment preview UI; no schema work
 * needed because the wire path through CHAT_MESSAGE already snapshots
 * pendingAttachments per the round-3 fix in commit `38034fedb`.
 */
function acceptIncomingComposerFiles(files: File[] | FileList): void {
  const MAX_BYTES = 10 * 1024 * 1024;
  const MAX_TOTAL_ATTACHMENTS = 8;
  const incoming: File[] = Array.from(files).filter(
    (file) => file.type.startsWith('image/') && file.size <= MAX_BYTES,
  );
  if (incoming.length === 0) return;

  const remainingSlots = Math.max(0, MAX_TOTAL_ATTACHMENTS - pendingAttachments.length);
  if (remainingSlots === 0) return;
  const accepted = incoming.slice(0, remainingSlots);

  void Promise.all(accepted.map(readFileAsDataUrl)).then((results) => {
    for (const dataUrl of results) {
      if (dataUrl) pendingAttachments.push(dataUrl);
    }
    updateAttachmentPreview();
  });
}

function updateAttachmentPreview(): void {
  const bar = document.getElementById('sp-attachment-bar');
  if (!bar) return;
  clearChildren(bar);
  if (pendingAttachments.length === 0) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  for (let i = 0; i < pendingAttachments.length; i++) {
    const dataUrl = pendingAttachments[i]!;
    const chip = el('div', { class: 'sp-attachment-chip' });
    const thumb = el('img', {
      class: 'sp-attachment-thumb',
      src: dataUrl,
      alt: 'attachment',
    }) as HTMLImageElement;
    const removeBtn = el('button', { class: 'sp-attachment-remove', title: 'Remove' }, '×');
    const idx = i;
    removeBtn.addEventListener('click', () => {
      pendingAttachments.splice(idx, 1);
      updateAttachmentPreview();
    });
    chip.appendChild(thumb);
    chip.appendChild(removeBtn);
    bar.appendChild(chip);
  }
}

function updateToolsButton(): void {
  const btn = document.getElementById('sp-tools-btn');
  const dropdown = document.getElementById('sp-tools-dropdown');
  if (!btn || !dropdown) return;

  const count = discoveredTools.length;
  btn.replaceChildren(renderIcon(Plug, 14), document.createTextNode(` Tools (${count})`));

  if (count === 0) {
    btn.classList.remove('has-context');
    setChild(dropdown, {
      tag: 'div',
      className: 'sp-tools-empty',
      text: 'No tools discovered on this page',
    });
    return;
  }

  btn.classList.add('has-context');
  clearChildren(dropdown);
  for (const tool of discoveredTools) {
    const item = el('div', { class: 'sp-tool-item' });
    item.appendChild(el('div', { class: 'sp-tool-item-name' }, tool.name));
    if (tool.description) {
      // SECURITY (M-09 audit 2026-05-19): prefix tool descriptions with the
      // source hostname so users can distinguish extension-supplied copy
      // from page-supplied copy. Defends against page tool-poisoning
      // attempts that imitate extension UI prompts (Invariant Labs TPA).
      const prefixed = currentPageHostname
        ? `(from ${currentPageHostname}) ${tool.description}`
        : tool.description;
      item.appendChild(el('div', { class: 'sp-tool-item-desc' }, prefixed));
    }
    item.addEventListener('click', () => {
      const inputEl = document.getElementById('sp-input') as HTMLTextAreaElement | null;
      if (inputEl) {
        inputEl.value = `Use the ${tool.name} tool to `;
        inputEl.focus();
        autoResizeInput(inputEl);
      }
      dropdown.classList.remove('open');
    });
    dropdown.appendChild(item);
  }
}

function autoResizeInput(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
}

/**
 * Returns true for URLs where content scripts cannot run and page context is
 * unavailable: browser internal pages, extension pages, data: URIs, etc.
 */
function isRestrictedUrl(url: string): boolean {
  if (!url) return false;
  const RESTRICTED = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'data:', 'file:///'];
  return RESTRICTED.some((prefix) => url.startsWith(prefix));
}

/**
 * Toggles the blocked-site overlay.  When blocked the composer is disabled so
 * the user can see that AGI cannot access the page content.
 */
function setBlockedState(blocked: boolean): void {
  const blockedEl = document.getElementById('sp-blocked');
  const promptChips = document.getElementById('sp-prompt-chips');
  const msgsEl = document.getElementById('sp-messages');
  const inputEl = document.getElementById('sp-input') as HTMLTextAreaElement | null;
  const sendBtnEl = document.getElementById('sp-send-btn') as HTMLButtonElement | null;
  const composerBar = document.getElementById('sp-composer-bar');

  if (!blockedEl) return;

  if (blocked) {
    blockedEl.classList.add('visible');
    if (promptChips) promptChips.classList.add('hidden');
    if (msgsEl) {
      msgsEl.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    }
    if (inputEl) {
      inputEl.disabled = true;
      inputEl.placeholder = "Can't access this page";
    }
    if (sendBtnEl) sendBtnEl.disabled = true;
    if (composerBar) composerBar.style.opacity = '0.4';
  } else {
    blockedEl.classList.remove('visible');
    if (inputEl) {
      inputEl.disabled = false;
      inputEl.placeholder = 'Ask anything... (/ for commands)';
    }
    if (sendBtnEl) sendBtnEl.disabled = false;
    if (composerBar) composerBar.style.opacity = '';
    // Re-show prompt chips only if there are no messages yet
    if (promptChips && _ctx.messages.length === 0) promptChips.classList.remove('hidden');
  }
}

/**
 * Queries the active tab URL and updates the persistent context chip label.
 * Safe to call multiple times; falls back gracefully when tab API is unavailable.
 */
function refreshPageHostname(): void {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return;
      const url = tabs[0]?.url ?? '';
      try {
        currentPageHostname = url ? new URL(url).hostname : '';
      } catch {
        currentPageHostname = '';
      }
      setBlockedState(isRestrictedUrl(url));
      updateContextButton();
    });
  } catch {
    // chrome.tabs unavailable in test/SSR environment — ignore
  }
}

/**
 * Builds the first-run onboarding carousel overlay and appends it (hidden) to
 * document.body.  Call showOnboardingOverlay() after the async storage check
 * to reveal it.  The overlay sits at z-index 9999 so it covers the composer
 * and toolbar without needing to toggle their display state.
 *
 * Steps:
 *  0 — Beta disclosure ("I understand")
 *  1 — Automate repetitive tasks ("Next")
 *  2 — Tab group access ("Next")
 *  3 — Shortcuts ("Let's go" → dismisses)
 *  4 — Pin hint (inline inside carousel, same dismiss path)
 */
function buildOnboardingOverlay(onComplete: () => void): void {
  const TOTAL_STEPS = 5;
  let currentStep = 0;

  // ── Helper: SVG icons (inline, CSP-safe) ────────────────────────────────

  const flaskSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 3h6M9 3v7l-4 8a2 2 0 0 0 1.8 2.9h10.4A2 2 0 0 0 19 18.9L15 10V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="9.5" cy="16" r="0.75" fill="currentColor"/>
    <circle cx="13" cy="17.5" r="0.75" fill="currentColor"/>
  </svg>`;

  const eyeSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
  </svg>`;

  const warnSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="0.75" fill="currentColor"/>
  </svg>`;

  // Hero SVG for step 1 (stacked browser windows with checklist glyph)
  const browserStackSvg = `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="6" y="18" width="56" height="42" rx="6" stroke="var(--agi-ext-border-strong)" stroke-width="1.5" fill="var(--agi-ext-surface)"/>
    <rect x="12" y="12" width="56" height="42" rx="6" stroke="var(--agi-ext-border-strong)" stroke-width="1.5" fill="var(--agi-ext-surface)"/>
    <rect x="18" y="8" width="56" height="42" rx="6" fill="var(--agi-ext-overlay)" stroke="var(--agi-ext-border-strong)" stroke-width="1.5"/>
    <line x1="18" y1="19" x2="74" y2="19" stroke="var(--agi-ext-border)" stroke-width="1"/>
    <circle cx="25" cy="14" r="2.5" fill="var(--agi-ext-accent)"/>
    <line x1="30" y1="26" x2="50" y2="26" stroke="var(--agi-ext-text-muted)" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="30" y1="33" x2="60" y2="33" stroke="var(--agi-ext-text-muted)" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="30" y1="40" x2="54" y2="40" stroke="var(--agi-ext-text-muted)" stroke-width="1.5" stroke-linecap="round"/>
    <polyline points="24,25 27,28 31,22" stroke="var(--agi-ext-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="24,32 27,35 31,29" stroke="var(--agi-ext-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="24,39 27,42 31,36" stroke="var(--agi-ext-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // Hero SVG for step 2 (browser tab group)
  const tabGroupSvg = `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="8" y="28" width="64" height="42" rx="6" fill="var(--agi-ext-overlay)" stroke="var(--agi-ext-border-strong)" stroke-width="1.5"/>
    <rect x="10" y="14" width="22" height="16" rx="4" fill="var(--agi-ext-accent)" opacity="0.85"/>
    <rect x="34" y="18" width="18" height="12" rx="3" fill="var(--agi-ext-surface)" stroke="var(--agi-ext-border-strong)" stroke-width="1"/>
    <rect x="54" y="18" width="14" height="12" rx="3" fill="var(--agi-ext-surface)" stroke="var(--agi-ext-border-strong)" stroke-width="1"/>
    <text x="21" y="25" font-size="7" fill="var(--agi-ext-on-accent)" text-anchor="middle" font-family="-apple-system,sans-serif" font-weight="600">AGI</text>
    <line x1="16" y1="44" x2="64" y2="44" stroke="var(--agi-ext-border)" stroke-width="1"/>
    <rect x="14" y="50" width="52" height="8" rx="2" fill="var(--agi-ext-surface)"/>
    <rect x="14" y="62" width="40" height="4" rx="2" fill="var(--agi-ext-surface)"/>
  </svg>`;

  // Hero SVG for step 3 (slash command menu)
  const shortcutMenuSvg = `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="10" y="16" width="60" height="48" rx="8" fill="var(--agi-ext-overlay)" stroke="var(--agi-ext-border-strong)" stroke-width="1.5"/>
    <rect x="14" y="22" width="52" height="12" rx="4" fill="var(--agi-ext-surface)" stroke="var(--agi-ext-accent)" stroke-width="1"/>
    <text x="21" y="31" font-size="9" fill="var(--agi-ext-accent)" font-family="monospace" font-weight="700">/</text>
    <text x="27" y="31" font-size="7.5" fill="var(--agi-ext-text-muted)" font-family="-apple-system,sans-serif">search shortcuts</text>
    <rect x="14" y="38" width="52" height="8" rx="3" fill="var(--agi-ext-hover)"/>
    <text x="21" y="44.5" font-size="7" fill="var(--agi-ext-accent)" font-family="monospace">/</text>
    <text x="27" y="44.5" font-size="7" fill="var(--agi-ext-text)" font-family="-apple-system,sans-serif">sales-lead</text>
    <rect x="14" y="49" width="52" height="7" rx="3" fill="transparent"/>
    <text x="21" y="54.5" font-size="7" fill="var(--agi-ext-accent)" font-family="monospace">/</text>
    <text x="27" y="54.5" font-size="7" fill="var(--agi-ext-text-muted)" font-family="-apple-system,sans-serif">unsubscribe</text>
    <line x1="14" y1="58" x2="66" y2="58" stroke="var(--agi-ext-border)" stroke-width="1"/>
    <text x="21" y="64.5" font-size="7" fill="var(--agi-ext-accent)" font-family="-apple-system,sans-serif">+ Create new shortcut</text>
  </svg>`;

  // Hero SVG for step 4 (extension card with pin icon highlighted)
  const pinHintSvg = `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="8" y="28" width="52" height="34" rx="6" fill="var(--agi-ext-overlay)" stroke="var(--agi-ext-border-strong)" stroke-width="1.5"/>
    <rect x="14" y="36" width="28" height="4" rx="2" fill="var(--agi-ext-surface)"/>
    <rect x="14" y="44" width="20" height="3" rx="1.5" fill="var(--agi-ext-surface)"/>
    <!-- pin icon in top-right of card, highlighted -->
    <circle cx="53" cy="35" r="10" fill="var(--agi-ext-accent)" opacity="0.15"/>
    <path d="M53 29l2 4h3l-2.5 3.5 1 4-3.5-2-3.5 2 1-4L48 33h3l2-4z" stroke="var(--agi-ext-accent)" stroke-width="1.2" stroke-linejoin="round" fill="none"/>
    <!-- arrow pointing to pin -->
    <path d="M44 50 Q42 42 48 37" stroke="var(--agi-ext-accent-secondary)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <polyline points="46,36 48,37 47,39" stroke="var(--agi-ext-accent-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // ── Overlay container ────────────────────────────────────────────────────
  const overlay = el('div', {
    id: 'sp-onboarding-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Welcome to AGI — first-time setup',
  });

  // ── Skip button ─────────────────────────────────────────────────────────
  const header = el('div', { id: 'sp-onboarding-header' });
  const skipBtn = el(
    'button',
    { id: 'sp-onboarding-skip', 'aria-label': 'Skip onboarding' },
    'Skip',
  );
  header.appendChild(skipBtn);
  overlay.appendChild(header);

  // ── Steps container ──────────────────────────────────────────────────────
  const body = el('div', { id: 'sp-onboarding-body' });

  // Step 0: Beta disclosure
  const step0 = el('div', {
    class: 'sp-ob-step active',
    'data-step': '0',
    role: 'tabpanel',
    'aria-label': 'Step 1 of 5',
  });
  step0.appendChild(el('div', { class: 'sp-ob-title' }, 'This is a beta feature'));
  const rows0 = el('div', { class: 'sp-ob-rows' });

  // Row 1: flask
  const row0a = el('div', { class: 'sp-ob-row' });
  const row0aIcon = el('div', { class: 'sp-ob-row-icon', 'aria-hidden': 'true' });
  appendSvgString(row0aIcon, flaskSvg);
  const row0aText = el(
    'div',
    { class: 'sp-ob-row-text' },
    'This is an early beta with risks distinct from other AGI products. You are fully responsible for all actions taken with it.',
  );
  row0a.appendChild(row0aIcon);
  row0a.appendChild(row0aText);
  rows0.appendChild(row0a);

  // Row 2: eye
  const row0b = el('div', { class: 'sp-ob-row' });
  const row0bIcon = el('div', { class: 'sp-ob-row-icon', 'aria-hidden': 'true' });
  appendSvgString(row0bIcon, eyeSvg);
  const row0bText = el(
    'div',
    { class: 'sp-ob-row-text' },
    'AGI can take screenshots of the page when responding. For privacy, avoid using it on sensitive sites like health, banking, or dating platforms.',
  );
  row0b.appendChild(row0bIcon);
  row0b.appendChild(row0bText);
  rows0.appendChild(row0b);

  // Row 3: warning (danger text + learn more)
  const row0c = el('div', { class: 'sp-ob-row' });
  const row0cIcon = el('div', { class: 'sp-ob-row-icon danger', 'aria-hidden': 'true' });
  appendSvgString(row0cIcon, warnSvg);
  const row0cText = el('div', { class: 'sp-ob-row-text danger' });
  row0cText.appendChild(
    document.createTextNode(
      'Malicious actors can hide instructions in websites, emails, and documents that trick AI into taking harmful actions without your knowledge. ',
    ),
  );
  const learnMoreBtn = el('button', { class: 'sp-ob-learn-more' }, 'Learn more');
  learnMoreBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://agi.build/safety' }).catch(() => {});
  });
  row0cText.appendChild(learnMoreBtn);
  row0c.appendChild(row0cIcon);
  row0c.appendChild(row0cText);
  rows0.appendChild(row0c);

  step0.appendChild(rows0);
  body.appendChild(step0);

  // Step 1: Value prop — automate repetitive tasks
  const step1 = el('div', {
    class: 'sp-ob-step',
    'data-step': '1',
    role: 'tabpanel',
    'aria-label': 'Step 2 of 5',
  });
  const step1Hero = el('div', { class: 'sp-ob-hero' });
  appendSvgString(step1Hero, browserStackSvg);
  step1.appendChild(step1Hero);
  step1.appendChild(el('div', { class: 'sp-ob-title' }, 'Automate your repetitive tasks'));
  step1.appendChild(
    el(
      'div',
      { class: 'sp-ob-body' },
      'AGI can take on multi-step work like QA testing, researching sales leads, and data entry across multiple sites. You can focus elsewhere knowing AGI is working in the background.',
    ),
  );
  body.appendChild(step1);

  // Step 2: Tab group access
  const step2 = el('div', {
    class: 'sp-ob-step',
    'data-step': '2',
    role: 'tabpanel',
    'aria-label': 'Step 3 of 5',
  });
  const step2Hero = el('div', { class: 'sp-ob-hero' });
  appendSvgString(step2Hero, tabGroupSvg);
  step2.appendChild(step2Hero);
  step2.appendChild(el('div', { class: 'sp-ob-title' }, 'AGI has tab group access'));
  step2.appendChild(
    el(
      'div',
      { class: 'sp-ob-body' },
      'When AGI is open in a tab group, it can access the URL, context, and information of all the tabs in that group.',
    ),
  );
  body.appendChild(step2);

  // Step 3: Shortcuts
  const step3 = el('div', {
    class: 'sp-ob-step',
    'data-step': '3',
    role: 'tabpanel',
    'aria-label': 'Step 4 of 5',
  });
  const step3Hero = el('div', { class: 'sp-ob-hero' });
  appendSvgString(step3Hero, shortcutMenuSvg);
  step3.appendChild(step3Hero);
  step3.appendChild(el('div', { class: 'sp-ob-title' }, 'Use shortcuts to save time'));
  step3.appendChild(
    el(
      'div',
      { class: 'sp-ob-body' },
      'Shortcuts make it easy to send instructions you repeat often. Type / in the chat to find and create shortcuts.',
    ),
  );
  body.appendChild(step3);

  // Step 4: Pin hint
  const step4 = el('div', {
    class: 'sp-ob-step',
    'data-step': '4',
    role: 'tabpanel',
    'aria-label': 'Step 5 of 5',
  });
  const step4Hero = el('div', { class: 'sp-ob-hero' });
  appendSvgString(step4Hero, pinHintSvg);
  step4.appendChild(step4Hero);
  step4.appendChild(el('div', { class: 'sp-ob-title' }, 'Pin AGI for quick access'));
  step4.appendChild(
    el(
      'div',
      { class: 'sp-ob-body' },
      'Click the pin icon in the top-right corner of the extension window to keep AGI always one click away.',
    ),
  );
  body.appendChild(step4);

  overlay.appendChild(body);

  // ── Footer: progress dots + nav buttons ─────────────────────────────────
  const footer = el('div', { id: 'sp-onboarding-footer' });

  const dotsRow = el('div', {
    class: 'sp-ob-dots',
    role: 'tablist',
    'aria-label': 'Onboarding steps',
  });
  const dots: HTMLElement[] = [];
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const dot = el('div', {
      class: i === 0 ? 'sp-ob-dot active' : 'sp-ob-dot',
      role: 'tab',
      'aria-label': `Step ${i + 1}`,
    });
    dots.push(dot);
    dotsRow.appendChild(dot);
  }
  footer.appendChild(dotsRow);

  const navRow = el('div', { class: 'sp-ob-nav' });
  const backBtn = el(
    'button',
    { class: 'sp-ob-btn-back', 'aria-label': 'Back', hidden: '' },
    'Back',
  );
  const nextBtn = el(
    'button',
    { class: 'sp-ob-btn-next', 'aria-label': 'Continue — step 1 of 5' },
    'I understand',
  );
  navRow.appendChild(backBtn);
  navRow.appendChild(nextBtn);
  footer.appendChild(navRow);
  overlay.appendChild(footer);

  // ── Step labels for each step's primary button ───────────────────────────
  const stepLabels: string[] = ['I understand', 'Next', 'Next', "Let's go", 'Done'];
  const stepAriaLabels: string[] = [
    'Continue — step 1 of 5',
    'Continue — step 2 of 5',
    'Continue — step 3 of 5',
    'Continue — step 4 of 5',
    'Dismiss onboarding',
  ];

  // ── Navigation logic ─────────────────────────────────────────────────────
  function dismiss(): void {
    markOnboardingComplete();
    overlay.classList.remove('visible');
    onComplete();
  }

  function goToStep(step: number): void {
    const steps = body.querySelectorAll<HTMLElement>('.sp-ob-step');
    steps.forEach((s, i) => {
      s.classList.toggle('active', i === step);
    });
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === step);
    });
    currentStep = step;
    // Back button: hidden on step 0
    if (step === 0) {
      backBtn.setAttribute('hidden', '');
    } else {
      backBtn.removeAttribute('hidden');
    }
    // Primary button label
    nextBtn.textContent = stepLabels[step] ?? 'Next';
    nextBtn.setAttribute('aria-label', stepAriaLabels[step] ?? 'Continue');
    // Focus primary button on each step transition
    nextBtn.focus();
  }

  nextBtn.addEventListener('click', () => {
    if (currentStep < TOTAL_STEPS - 1) {
      goToStep(currentStep + 1);
    } else {
      dismiss();
    }
  });

  backBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  });

  skipBtn.addEventListener('click', () => dismiss());

  // Esc key dismisses
  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  });

  document.body.appendChild(overlay);
}

/**
 * Reveals the onboarding carousel and focuses the primary button.
 * Called from the boot Promise.all once we confirm onboarding is incomplete.
 */
function showOnboardingOverlay(): void {
  const overlay = document.getElementById('sp-onboarding-overlay');
  if (!overlay) return;
  overlay.classList.add('visible');
  // Focus the primary CTA for keyboard users
  const nextBtn = overlay.querySelector<HTMLButtonElement>('.sp-ob-btn-next');
  if (nextBtn) {
    // Defer slightly so the overlay is painted before focus
    setTimeout(() => nextBtn.focus(), 50);
  }
}

function buildUI(): void {
  clearChildren(document.body);

  const header = el('div', { id: 'sp-header' });
  const headerLeft = el('div', { id: 'sp-header-left' });

  // L-11 audit 2026-05-19: replaced innerHTML SVG injection with
  // DOMParser-based import. Same end result — static SVG literal rendered
  // into the wrapper — but no HTML parser involved.
  const logoEl = el('div', { id: 'sp-logo' });
  // AGI brand mark: 12 spokes radiating from center (inner r=4.6, outer r=9).
  // Spoke at index 0 (12 o'clock) uses amber/terra accent; others inherit text
  // color via currentColor. Geometry mirrors packages/ui/src/AgiMark.tsx.
  const logoSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="AGI" role="img">
    <line x1="12" y1="7.4" x2="12" y2="3" stroke="var(--agi-ext-accent-secondary,#da7756)" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="14.3" y1="8.016" x2="16.5" y2="4.206" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="15.984" y1="9.7" x2="19.794" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="16.6" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="15.984" y1="14.3" x2="19.794" y2="16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="14.3" y1="15.984" x2="16.5" y2="19.794" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="12" y1="16.6" x2="12" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="9.7" y1="15.984" x2="7.5" y2="19.794" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="8.016" y1="14.3" x2="4.206" y2="16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="7.4" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="8.016" y1="9.7" x2="4.206" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="9.7" y1="8.016" x2="7.5" y2="4.206" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  appendSvgString(logoEl, logoSvg);
  headerLeft.appendChild(logoEl);

  const titleWrap = el('div', {});
  titleWrap.appendChild(el('div', { id: 'sp-title' }, 'AGI'));
  headerLeft.appendChild(titleWrap);

  const modelSelectorWrap = el('div', { class: 'sp-model-selector-wrap' });
  const modelSelectorBtn = el('button', { id: 'sp-model-selector-btn' });
  const modelBadge = document.createElement('span');
  modelBadge.id = 'sp-model-badge';
  modelBadge.textContent = 'AI Assistant';
  const chevron = document.createElement('span');
  chevron.className = 'sp-chevron';
  chevron.textContent = '▾';
  modelSelectorBtn.replaceChildren(modelBadge, chevron);
  const modelDropdownEl = el('div', { id: 'sp-model-dropdown' });
  let currentModelValue = 'auto';

  /**
   * Resolves the chrome-extension URL for a provider logo SVG.
   * Falls back to undefined when chrome.runtime is unavailable (tests / SSR).
   */
  function resolveProviderLogoUrl(providerId: string): string | undefined {
    try {
      return chrome.runtime.getURL(`icons/providers/${providerId}.svg`);
    } catch {
      return undefined;
    }
  }

  /**
   * Builds a single model-option row with:
   *  - 16px provider logo (or circle placeholder)
   *  - Model name
   *  - 1-line capability sub-label (Fastest / Balanced / Most capable)
   *  - Checkmark on the selected item
   */
  function buildModelOptionRow(m: SidePanelModelOption, isSelected: boolean): HTMLElement {
    const isAuto = m.value === 'auto';

    // FREE-TIER MODEL GATING:
    // Economy models (in tierAllowedModels.economy) are selectable by all users.
    // Pro-additions and flagship models are visible but gated with an "Upgrade"
    // badge. Clicking a gated model opens the pricing/waitlist page instead of
    // selecting the model. The "auto" option is always freely selectable.
    const pickerTier = isAuto ? 'economy' : getPickerModelTier(m.value);
    const isPremiumGated = !isAuto && (pickerTier === 'balanced' || pickerTier === 'premium');

    const classes = [
      'sp-model-option',
      isSelected ? 'selected' : '',
      isAuto ? 'sp-model-option-auto' : '',
      isPremiumGated ? 'premium-gated' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const opt = el('div', { class: classes });

    // Logo / dot
    if (isAuto) {
      opt.appendChild(el('div', { class: 'sp-model-auto-dot' }));
    } else if (m.provider) {
      const logoUrl = resolveProviderLogoUrl(m.provider);
      if (logoUrl) {
        const img = el('img', {
          class: 'sp-model-option-logo',
          src: logoUrl,
          alt: m.provider,
        }) as HTMLImageElement;
        img.addEventListener('error', () => {
          const ph = el('div', { class: 'sp-model-option-logo-placeholder' });
          img.replaceWith(ph);
        });
        opt.appendChild(img);
      } else {
        opt.appendChild(el('div', { class: 'sp-model-option-logo-placeholder' }));
      }
    } else {
      opt.appendChild(el('div', { class: 'sp-model-option-logo-placeholder' }));
    }

    // Text block: name + sub-label
    const textBlock = el('div', { class: 'sp-model-option-text' });
    textBlock.appendChild(el('span', { class: 'sp-model-option-name' }, m.label));
    if (m.capability) {
      const capLabel = CAPABILITY_LABEL[m.capability];
      textBlock.appendChild(el('span', { class: 'sp-model-option-sublabel' }, capLabel));
    } else if (isAuto) {
      textBlock.appendChild(
        el('span', { class: 'sp-model-option-sublabel' }, 'Automatic provider selection'),
      );
    }
    opt.appendChild(textBlock);

    if (isPremiumGated) {
      // Show "Upgrade" badge instead of checkmark — clicking opens pricing page.
      opt.appendChild(el('span', { class: 'sp-model-upgrade-tag' }, 'Upgrade'));
      opt.addEventListener('click', () => {
        // Close dropdown
        modelDropdownEl.classList.remove('open');
        modelSelectorBtn.classList.remove('open');
        // Navigate to pricing/waitlist page
        chrome.tabs.create({ url: 'https://agiworkforce.com/pricing' }).catch(() => {});
      });
    } else {
      // Checkmark for economy/auto (selectable) models
      opt.appendChild(el('span', { class: 'sp-model-option-check' }, isSelected ? '✓' : ''));
      opt.addEventListener('click', () => {
        currentModelValue = m.value;
        chrome.storage.local.set({ agi_model: m.value }).catch(() => {});
        updateModelBadge(m.value);
        renderModelDropdown();
        modelDropdownEl.classList.remove('open');
        modelSelectorBtn.classList.remove('open');
      });
    }

    return opt;
  }

  function renderModelDropdown(): void {
    clearChildren(modelDropdownEl);

    // 0. Provider count badge header
    const pickerHeader = el('div', { class: 'sp-model-picker-header' });
    pickerHeader.appendChild(el('span', { class: 'sp-model-picker-title' }, 'Select model'));
    // FIX (audit batch-222 [LOW] documentation drift, 2026-06-13): derive the
    // provider count from the actual model options instead of a hardcoded "13+".
    const providerCount = new Set(
      SIDE_PANEL_MODEL_OPTIONS.map((o) => o.provider).filter((p): p is string => Boolean(p)),
    ).size;
    pickerHeader.appendChild(
      el('span', { class: 'provider-count-badge' }, `${providerCount} providers`),
    );
    modelDropdownEl.appendChild(pickerHeader);

    // 1. "Best (auto)" as the first option, visually distinct
    const autoOpt = SIDE_PANEL_MODEL_OPTIONS.find((m) => m.value === 'auto');
    if (autoOpt) {
      modelDropdownEl.appendChild(buildModelOptionRow(autoOpt, currentModelValue === 'auto'));
    }

    // 2. Collect non-auto options grouped by provider
    const nonAutoOptions = SIDE_PANEL_MODEL_OPTIONS.filter((m) => m.value !== 'auto');

    // Build an ordered map of provider -> options
    const grouped = new Map<string, SidePanelModelOption[]>();
    for (const m of nonAutoOptions) {
      const provKey = m.provider ?? '__unknown__';
      if (!grouped.has(provKey)) grouped.set(provKey, []);
      grouped.get(provKey)!.push(m);
    }

    // Render in canonical provider order, then any remainder
    const rendered = new Set<string>();
    for (const pid of PROVIDER_GROUP_ORDER) {
      const opts = grouped.get(pid);
      if (!opts || opts.length === 0) continue;
      rendered.add(pid);
      const provDisplay = PROVIDER_DISPLAY[pid];
      const headerLabel = provDisplay?.label ?? pid;
      modelDropdownEl.appendChild(el('div', { class: 'sp-model-group-header' }, headerLabel));
      for (const m of opts) {
        modelDropdownEl.appendChild(buildModelOptionRow(m, currentModelValue === m.value));
      }
    }

    // Any providers not in PROVIDER_GROUP_ORDER
    for (const [provKey, opts] of grouped.entries()) {
      if (rendered.has(provKey)) continue;
      modelDropdownEl.appendChild(
        el(
          'div',
          { class: 'sp-model-group-header' },
          provKey !== '__unknown__' ? provKey : 'Other',
        ),
      );
      for (const m of opts) {
        modelDropdownEl.appendChild(buildModelOptionRow(m, currentModelValue === m.value));
      }
    }

    // 3. Thinking toggle at the bottom
    const toggleRow = el('div', { class: 'sp-thinking-toggle-row' });
    const toggleLabel = el(
      'label',
      { class: `sp-thinking-toggle-label${_ctx.thinkingEnabled ? ' active' : ''}` },
      'Extended thinking',
    );
    const toggleInput = el('input', {
      class: 'sp-thinking-toggle',
      type: 'checkbox',
    }) as HTMLInputElement;
    toggleInput.checked = _ctx.thinkingEnabled;
    toggleInput.addEventListener('change', () => {
      _ctx.thinkingEnabled = toggleInput.checked;
      chrome.storage.local.set({ agi_thinking_enabled: _ctx.thinkingEnabled }).catch(() => {});
      if (_ctx.thinkingEnabled) {
        toggleLabel.classList.add('active');
      } else {
        toggleLabel.classList.remove('active');
      }
    });
    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggleInput);
    modelDropdownEl.appendChild(toggleRow);
  }
  modelSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpenNow = modelDropdownEl.classList.toggle('open');
    modelSelectorBtn.classList.toggle('open', isOpenNow);
  });
  document.addEventListener('click', (e: MouseEvent) => {
    if (!modelSelectorWrap.contains(e.target as Node)) {
      modelDropdownEl.classList.remove('open');
      modelSelectorBtn.classList.remove('open');
    }
  });
  chrome.storage.local.get(['agi_model', 'agi_thinking_enabled'], (result) => {
    if (chrome.runtime.lastError) return;
    const stored = result['agi_model'] as string | undefined;
    if (stored) {
      const resolved = normalizeModelId(stored) ?? stored;
      // FREE-TIER GATE: if the previously stored model is premium-gated, reset
      // to 'auto' so the user cannot bypass the tier check via stale storage.
      const storedTier = getPickerModelTier(resolved);
      if (storedTier === 'balanced' || storedTier === 'premium') {
        currentModelValue = 'auto';
        chrome.storage.local.remove('agi_model').catch(() => {});
      } else {
        currentModelValue = resolved;
      }
    }
    const storedThinking = result['agi_thinking_enabled'] as boolean | undefined;
    if (storedThinking !== undefined) {
      _ctx.thinkingEnabled = storedThinking;
    }
    updateModelBadge(currentModelValue);
    renderModelDropdown();
  });
  modelSelectorWrap.appendChild(modelSelectorBtn);
  modelSelectorWrap.appendChild(modelDropdownEl);
  headerLeft.appendChild(modelSelectorWrap);
  header.appendChild(headerLeft);

  const headerRight = el('div', { id: 'sp-header-right' });

  // ── ＋ new chat button ─────────────────────────────────────────────────────
  const newChatBtn = el('button', {
    class: 'sp-icon-btn',
    id: 'sp-new-chat-btn',
    title: 'New chat',
    'aria-label': 'New chat',
  });
  newChatBtn.appendChild(renderIcon(FilePen, 16));
  newChatBtn.addEventListener('click', () => {
    if (_ctx.streamTimeoutHandle) {
      clearTimeout(_ctx.streamTimeoutHandle);
      _ctx.streamTimeoutHandle = null;
    }
    if (_ctx.messages.length > 0) {
      const toSave: HistoryMessage[] = _ctx.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));
      saveConversation(toSave).catch((err) =>
        console.warn('[SidePanel] failed to save conversation to history:', err),
      );
    }
    _ctx.messages.length = 0;
    _ctx.lastRenderedCount = 0;
    _ctx.isStreaming = false;
    _ctx.currentStreamId = null;
    _ctx.pendingPageContext = null;
    clearStoredMessages();
    updateContextButton();
    updateSendButton();
    renderMessages();
  });
  headerRight.appendChild(newChatBtn);

  // ── Quota badge (cloud free-prompts remaining) ─────────────────────────────
  // Built in the drawer section block but inserted into the header here so it
  // appears between the new-chat button and the menu button.
  // `quotaBadgeEl` is defined later when the drawer is built; we use a late
  // reference via getElementById at reveal time so the element is available
  // after the initial DOM pass. For the header we create a placeholder span
  // that becomes the actual badge once the drawer code runs.
  // NOTE: quotaBadgeEl is declared via `let` in the drawer closure below and
  // appended to headerRight there. We reserve the slot here via a wrapper so
  // the layout order is correct.
  const quotaBadgeSlot = el('span', { id: 'sp-quota-badge-slot' });
  headerRight.appendChild(quotaBadgeSlot);

  // ── ⋮ menu button (opens settings drawer) ─────────────────────────────────
  const menuBtn = el('button', {
    class: 'sp-icon-btn',
    id: 'sp-menu-btn',
    title: 'Settings',
    'aria-label': 'Open settings',
  });
  menuBtn.textContent = '⋮';
  headerRight.appendChild(menuBtn);
  header.appendChild(headerRight);
  document.body.appendChild(header);

  // ── Helper: history load+restore (shared by drawer history section) ────────
  function formatHistoryDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function restoreHistoryEntry(entry: ConversationEntry): void {
    if (_ctx.isStreaming) return;
    if (_ctx.streamTimeoutHandle) {
      clearTimeout(_ctx.streamTimeoutHandle);
      _ctx.streamTimeoutHandle = null;
    }
    _ctx.messages.length = 0;
    _ctx.lastRenderedCount = 0;
    _ctx.isStreaming = false;
    _ctx.currentStreamId = null;
    _ctx.pendingPageContext = null;
    for (const hm of entry.messages) {
      _ctx.messages.push({
        id: `h-${hm.timestamp}-${Math.random().toString(36).slice(2, 5)}`,
        role: hm.role,
        content: hm.content,
        timestamp: hm.timestamp,
      });
    }
    saveMessages();
    updateContextButton();
    updateSendButton();
    renderMessages();
    scrollToBottom();
  }

  // #sp-settings-bar removed in Phase 3: the drawer's Bridge URL section
  // supersedes it. The bridge-url save logic is in the drawer (drawerSaveBridgeUrl).
  // bridgeUrlInput stub kept as an invisible element for legacy code that calls
  // document.getElementById('sp-bridge-url-input').
  const bridgeUrlInput = el('input', {
    id: 'sp-bridge-url-input',
    type: 'hidden',
  }) as HTMLInputElement;
  document.body.appendChild(bridgeUrlInput);

  // ── Phase 3: Settings Drawer (all popup controls now live here) ──────────────
  // The popup has been retired. All pairing, allowlist, memory, cloud-unlock,
  // bridge-URL, tools, and chat-action controls live exclusively in this drawer.

  const drawerOverlay = el('div', { id: 'sp-drawer-overlay' });
  const drawer = el('div', { id: 'sp-drawer', role: 'dialog', 'aria-label': 'Settings' });

  function openDrawer(): void {
    drawerOverlay.classList.add('open');
    drawer.classList.add('open');
    // Refresh dynamic content when drawer opens
    void refreshDrawerPairingState();
    void refreshDrawerAllowlist();
    void refreshDrawerMemory();
    void refreshDrawerStats();
    void refreshDrawerTabInfo();
  }
  function closeDrawer(): void {
    drawerOverlay.classList.remove('open');
    drawer.classList.remove('open');
  }

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (drawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });
  drawerOverlay.addEventListener('click', closeDrawer);

  // ── Drawer header ──────────────────────────────────────────────────────────
  const drawerHeader = el('div', { id: 'sp-drawer-header' });
  drawerHeader.appendChild(el('div', { id: 'sp-drawer-title' }, 'Settings'));
  const drawerClose = el('button', { id: 'sp-drawer-close', 'aria-label': 'Close settings' }, '✕');
  drawerClose.addEventListener('click', closeDrawer);
  drawerHeader.appendChild(drawerClose);
  drawer.appendChild(drawerHeader);

  const drawerBody = el('div', { id: 'sp-drawer-body' });

  // ── Section 0: Chat actions (History / Summarize / Clear / Console / Open-in-Desktop) ──
  const chatActionsSection = el('div', { class: 'sp-drawer-section' });
  chatActionsSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Chat'));
  const chatActionsRow = el('div', { class: 'sp-drawer-tools-row' });

  // History button — opens the conversation history dropdown (now inside drawer)
  const drawerHistoryBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-history-btn',
    title: 'Conversation history',
  });
  drawerHistoryBtn.appendChild(renderIcon(Clock, 13));
  drawerHistoryBtn.appendChild(document.createTextNode(' History'));

  // History sub-list inside drawer (inline, not a floating dropdown)
  const drawerHistoryList = el('div', { id: 'sp-drawer-history-list', hidden: '' });
  drawerHistoryList.style.cssText =
    'margin-top: 6px; display: flex; flex-direction: column; gap: 3px;';

  function renderDrawerHistory(entries: ConversationEntry[]): void {
    clearChildren(drawerHistoryList);
    if (entries.length === 0) {
      const empty = el('div', {}, 'No saved conversations');
      empty.style.cssText = 'font-size:11px;color:var(--agi-ext-text-muted);padding:4px 2px;';
      drawerHistoryList.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const item = el('div', {});
      item.style.cssText =
        'display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:5px;cursor:pointer;background:var(--agi-ext-surface);border:1px solid var(--agi-ext-border);';
      const textCol = el('div', {});
      textCol.style.cssText = 'flex:1;min-width:0;';
      const title = el('div', {}, entry.title);
      title.style.cssText =
        'font-size:11px;color:var(--agi-ext-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      const date = el('div', {}, formatHistoryDate(entry.savedAt));
      date.style.cssText = 'font-size:9px;color:var(--agi-ext-text-muted);margin-top:1px;';
      textCol.appendChild(title);
      textCol.appendChild(date);
      item.appendChild(textCol);

      const delBtn = el('button', { title: 'Delete' }, '✕');
      delBtn.style.cssText =
        'background:none;border:none;color:var(--agi-ext-text-muted);font-size:12px;cursor:pointer;padding:2px 4px;border-radius:3px;line-height:1;flex-shrink:0;';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(entry.id)
          .then(() => listConversations())
          .then((updated) => renderDrawerHistory(updated))
          .catch((err) => console.warn('[SidePanel] history delete failed:', err));
      });
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        restoreHistoryEntry(entry);
        closeDrawer();
      });
      drawerHistoryList.appendChild(item);
    }
  }

  drawerHistoryBtn.addEventListener('click', () => {
    const isHidden = drawerHistoryList.hasAttribute('hidden');
    if (isHidden) {
      drawerHistoryList.removeAttribute('hidden');
      listConversations()
        .then((entries) => renderDrawerHistory(entries))
        .catch((err) => console.warn('[SidePanel] history list failed:', err));
    } else {
      drawerHistoryList.setAttribute('hidden', '');
    }
  });
  chatActionsRow.appendChild(drawerHistoryBtn);

  // Summarize button
  const drawerSummarizeBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-summarize-btn',
    title: 'Summarize current page',
  });
  drawerSummarizeBtn.appendChild(renderIcon(FileEdit, 13));
  drawerSummarizeBtn.appendChild(document.createTextNode(' Summarize'));
  drawerSummarizeBtn.addEventListener('click', () => {
    closeDrawer();
    if (!_ctx.isStreaming) sendMessage('/summarize');
  });
  chatActionsRow.appendChild(drawerSummarizeBtn);

  // Clear conversation button
  const drawerClearChatBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-clear-chat-btn',
    title: 'Clear conversation',
  });
  drawerClearChatBtn.appendChild(renderIcon(Trash2, 13));
  drawerClearChatBtn.appendChild(document.createTextNode(' Clear'));
  drawerClearChatBtn.addEventListener('click', () => {
    closeDrawer();
    if (_ctx.streamTimeoutHandle) {
      clearTimeout(_ctx.streamTimeoutHandle);
      _ctx.streamTimeoutHandle = null;
    }
    if (_ctx.messages.length > 0) {
      const toSave: HistoryMessage[] = _ctx.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));
      saveConversation(toSave).catch((err) =>
        console.warn('[SidePanel] failed to save on clear:', err),
      );
    }
    _ctx.messages.length = 0;
    _ctx.lastRenderedCount = 0;
    _ctx.isStreaming = false;
    _ctx.currentStreamId = null;
    _ctx.pendingPageContext = null;
    clearStoredMessages();
    updateContextButton();
    updateSendButton();
    renderMessages();
  });
  chatActionsRow.appendChild(drawerClearChatBtn);

  // Console toggle button
  const drawerConsoleBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-console-btn',
    title: 'Toggle console logs',
  });
  drawerConsoleBtn.appendChild(renderIcon(Monitor, 13));
  drawerConsoleBtn.appendChild(document.createTextNode(' Console'));
  drawerConsoleBtn.addEventListener('click', () => {
    closeDrawer();
    const panel = document.getElementById('sp-console-panel');
    if (panel) {
      const isOpen = panel.classList.toggle('open');
      if (isOpen) refreshConsoleLogs();
    }
  });
  chatActionsRow.appendChild(drawerConsoleBtn);

  // Open-in-desktop button
  const drawerOpenDesktopBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-open-desktop-btn',
    title: 'Open in desktop app',
  });
  drawerOpenDesktopBtn.appendChild(renderIcon(Monitor, 13));
  drawerOpenDesktopBtn.appendChild(document.createTextNode(' Open Desktop'));
  drawerOpenDesktopBtn.addEventListener('click', () => {
    closeDrawer();
    chrome.runtime
      .sendMessage({ type: 'OPEN_IN_DESKTOP' })
      .catch((err: unknown) => console.warn('[SidePanel] OPEN_IN_DESKTOP failed:', err));
  });
  chatActionsRow.appendChild(drawerOpenDesktopBtn);

  chatActionsSection.appendChild(chatActionsRow);
  chatActionsSection.appendChild(drawerHistoryList);
  drawerBody.appendChild(chatActionsSection);

  // ── Section 1: Views (Workflows + Computer Use launchers) ──────────────────
  const viewsSection = el('div', { class: 'sp-drawer-section' });
  viewsSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Views'));

  const wfLaunchBtn = el('button', {
    class: 'sp-drawer-launcher-btn',
    id: 'sp-drawer-wf-btn',
    title: 'Open Workflows',
  });
  const wfIcon = el('div', { class: 'sp-drawer-launcher-icon' });
  wfIcon.appendChild(renderIcon(Zap, 14));
  const wfTextBlock = el('div', { class: 'sp-drawer-launcher-label' });
  wfTextBlock.appendChild(el('div', {}, 'Workflows'));
  wfTextBlock.appendChild(
    el('div', { class: 'sp-drawer-launcher-desc' }, 'Shortcuts and scheduled tasks'),
  );
  wfLaunchBtn.appendChild(wfIcon);
  wfLaunchBtn.appendChild(wfTextBlock);
  wfLaunchBtn.appendChild(el('span', { class: 'sp-drawer-launcher-chevron' }, '›'));
  wfLaunchBtn.addEventListener('click', () => {
    closeDrawer();
    switchTab('workflows');
  });
  viewsSection.appendChild(wfLaunchBtn);

  const cuLaunchBtn = el('button', {
    class: 'sp-drawer-launcher-btn',
    id: 'sp-drawer-cu-btn',
    title: 'Open Computer Use',
  });
  const cuIcon = el('div', { class: 'sp-drawer-launcher-icon' });
  cuIcon.appendChild(renderIcon(Monitor, 14));
  const cuTextBlock = el('div', { class: 'sp-drawer-launcher-label' });
  cuTextBlock.appendChild(el('div', {}, 'Computer Use'));
  cuTextBlock.appendChild(
    el('div', { class: 'sp-drawer-launcher-desc' }, 'Browser automation agent'),
  );
  cuLaunchBtn.appendChild(cuIcon);
  cuLaunchBtn.appendChild(cuTextBlock);
  cuLaunchBtn.appendChild(el('span', { class: 'sp-drawer-launcher-chevron' }, '›'));
  cuLaunchBtn.addEventListener('click', () => {
    closeDrawer();
    switchTab('computer-use');
  });
  viewsSection.appendChild(cuLaunchBtn);
  drawerBody.appendChild(viewsSection);

  // ── Section 2: Tools (Capture / Refresh / Group) ───────────────────────────
  const toolsSection = el('div', { class: 'sp-drawer-section' });
  toolsSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Tools'));
  const toolsRow = el('div', { class: 'sp-drawer-tools-row' });

  const drawerCaptureBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-capture-btn',
    title: 'Capture page screenshot',
  });
  drawerCaptureBtn.appendChild(renderIcon(Camera, 13));
  drawerCaptureBtn.appendChild(document.createTextNode(' Capture'));
  drawerCaptureBtn.addEventListener('click', async () => {
    drawerCaptureBtn.textContent = ' Capturing…';
    (drawerCaptureBtn as HTMLButtonElement).disabled = true;
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'CAPTURE_SCREENSHOT',
        format: 'png',
        quality: 90,
      })) as { success: boolean; error?: string };
      if (res.success) {
        drawerCaptureBtn.textContent = ' Captured!';
        drawerCaptureBtn.classList.add('active');
        setTimeout(() => {
          drawerCaptureBtn.replaceChildren(
            renderIcon(Camera, 13),
            document.createTextNode(' Capture'),
          );
          drawerCaptureBtn.classList.remove('active');
          (drawerCaptureBtn as HTMLButtonElement).disabled = false;
        }, 1500);
      } else {
        throw new Error(res.error ?? 'Failed');
      }
    } catch {
      drawerCaptureBtn.textContent = ' Failed';
      setTimeout(() => {
        drawerCaptureBtn.replaceChildren(
          renderIcon(Camera, 13),
          document.createTextNode(' Capture'),
        );
        (drawerCaptureBtn as HTMLButtonElement).disabled = false;
      }, 1500);
    }
  });
  toolsRow.appendChild(drawerCaptureBtn);

  const drawerRefreshBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-refresh-btn',
    title: 'Refresh panel data',
  });
  drawerRefreshBtn.appendChild(renderIcon(Loader2, 13));
  drawerRefreshBtn.appendChild(document.createTextNode(' Refresh'));
  drawerRefreshBtn.addEventListener('click', async () => {
    (drawerRefreshBtn as HTMLButtonElement).disabled = true;
    try {
      await Promise.all([
        refreshDrawerPairingState(),
        refreshDrawerAllowlist(),
        refreshDrawerMemory(),
        refreshDrawerStats(),
        refreshDrawerTabInfo(),
      ]);
    } finally {
      (drawerRefreshBtn as HTMLButtonElement).disabled = false;
    }
  });
  toolsRow.appendChild(drawerRefreshBtn);

  // Group button mirrors the toolbar's sp-group-btn
  const drawerGroupBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-group-btn',
    title: 'Add current tab to group',
  });
  drawerGroupBtn.appendChild(renderIcon(Folder, 13));
  let drawerGrouped = false;
  const drawerGroupLabel = document.createTextNode(' Group');
  drawerGroupBtn.appendChild(drawerGroupLabel);
  drawerGroupBtn.addEventListener('click', () => {
    const msgType = drawerGrouped ? 'REMOVE_TAB_FROM_GROUP' : 'ADD_TAB_TO_GROUP';
    chrome.runtime.sendMessage(
      { type: msgType },
      (response: { success?: boolean; grouped?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !response?.success) return;
        drawerGrouped = response.grouped ?? false;
        drawerGroupLabel.textContent = drawerGrouped ? ' Ungroup' : ' Group';
        drawerGroupBtn.classList.toggle('active', drawerGrouped);
      },
    );
  });
  toolsRow.appendChild(drawerGroupBtn);
  toolsSection.appendChild(toolsRow);
  drawerBody.appendChild(toolsSection);

  // ── Section 3: Connection / Pairing ───────────────────────────────────────
  const pairingSection = el('div', { class: 'sp-drawer-section' });
  pairingSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Desktop Pairing'));

  const pairingRow = el('div', { class: 'sp-drawer-pairing-row' });
  const pairingLabel = el(
    'span',
    { class: 'sp-drawer-pairing-label', id: 'sp-drawer-pairing-label' },
    'Not paired',
  );
  const pairingFingerprint = el('span', {
    class: 'sp-drawer-pairing-fingerprint',
    id: 'sp-drawer-pairing-fingerprint',
    hidden: '',
  });
  pairingRow.appendChild(pairingLabel);
  pairingRow.appendChild(pairingFingerprint);
  pairingSection.appendChild(pairingRow);

  const pairingError = el('div', {
    class: 'sp-drawer-pairing-error',
    id: 'sp-drawer-pairing-error',
  });
  pairingSection.appendChild(pairingError);

  const pairingBtnRow = el('div', { class: 'sp-drawer-btn-row' });
  const drawerPairBtn = el(
    'button',
    {
      class: 'sp-drawer-btn sp-drawer-btn-primary',
      id: 'sp-drawer-pair-btn',
    },
    'Pair with Desktop',
  );
  const drawerUnpairBtn = el(
    'button',
    {
      class: 'sp-drawer-btn sp-drawer-btn-danger',
      id: 'sp-drawer-unpair-btn',
      hidden: '',
    },
    'Unpair',
  );

  function applyDrawerPairingState(state: PairingState): void {
    pairingError.textContent = '';
    switch (state.phase) {
      case 'idle':
        pairingLabel.textContent = 'Not paired';
        pairingFingerprint.setAttribute('hidden', '');
        drawerPairBtn.textContent = 'Pair with Desktop';
        (drawerPairBtn as HTMLButtonElement).disabled = false;
        drawerPairBtn.removeAttribute('hidden');
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
      case 'requesting':
        pairingLabel.textContent = 'Pairing…';
        pairingFingerprint.setAttribute('hidden', '');
        drawerPairBtn.textContent = 'Pairing…';
        (drawerPairBtn as HTMLButtonElement).disabled = true;
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
      case 'paired':
        pairingLabel.textContent = 'Paired';
        if (state.fingerprint) {
          pairingFingerprint.textContent = state.fingerprint;
          pairingFingerprint.removeAttribute('hidden');
        } else {
          pairingFingerprint.setAttribute('hidden', '');
        }
        drawerPairBtn.setAttribute('hidden', '');
        drawerUnpairBtn.removeAttribute('hidden');
        break;
      case 'error':
        pairingLabel.textContent = 'Pairing failed';
        pairingFingerprint.setAttribute('hidden', '');
        if (state.error) pairingError.textContent = state.error;
        drawerPairBtn.textContent = 'Retry Pairing';
        (drawerPairBtn as HTMLButtonElement).disabled = false;
        drawerPairBtn.removeAttribute('hidden');
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
    }
  }

  drawerPairBtn.addEventListener('click', async () => {
    applyDrawerPairingState({ phase: 'requesting', fingerprint: null, error: null });
    const next = await requestPairing();
    applyDrawerPairingState(next);
  });
  drawerUnpairBtn.addEventListener('click', async () => {
    const next = await unpair();
    applyDrawerPairingState(next);
  });

  pairingBtnRow.appendChild(drawerPairBtn);
  pairingBtnRow.appendChild(drawerUnpairBtn);
  pairingSection.appendChild(pairingBtnRow);
  drawerBody.appendChild(pairingSection);

  async function refreshDrawerPairingState(): Promise<void> {
    const state = await loadPairingState();
    applyDrawerPairingState(state);
  }

  // ── Section 4: In-Page Panel toggle ───────────────────────────────────────
  const inPageSection = el('div', { class: 'sp-drawer-section' });
  inPageSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'In-Page Panel'));
  const inPageRow = el('div', { class: 'sp-drawer-toggle-row' });
  inPageRow.appendChild(el('span', { class: 'sp-drawer-toggle-label' }, 'Page chat overlay'));
  const inPageToggle = el('input', {
    type: 'checkbox',
    class: 'sp-drawer-toggle-switch',
    id: 'sp-drawer-in-page-toggle',
    'aria-label': 'Toggle in-page panel',
  }) as HTMLInputElement;
  inPageToggle.checked = true; // default on
  chrome.storage.local.get(SP_IN_PAGE_PANEL_ENABLED_KEY, (result) => {
    if (chrome.runtime.lastError) return;
    const val = result[SP_IN_PAGE_PANEL_ENABLED_KEY] as boolean | undefined;
    inPageToggle.checked = val !== false;
  });
  inPageToggle.addEventListener('change', () => {
    chrome.storage.local
      .set({ [SP_IN_PAGE_PANEL_ENABLED_KEY]: inPageToggle.checked })
      .catch(() => {});
  });
  inPageRow.appendChild(inPageToggle);
  inPageSection.appendChild(inPageRow);
  drawerBody.appendChild(inPageSection);

  // ── Section 5: Site Allowlist ──────────────────────────────────────────────
  const allowlistSection = el('div', { class: 'sp-drawer-section' });
  allowlistSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Site Allowlist'));
  allowlistSection.appendChild(
    el(
      'p',
      { class: 'sp-drawer-allowlist-help' },
      'Pages on these origins can run AGI automation in their tab. Add the current site, then reload it.',
    ),
  );

  const allowlistCurrentRow = el('div', { class: 'sp-drawer-allowlist-current-row' });
  const allowlistOriginLabel = el(
    'span',
    {
      class: 'sp-drawer-allowlist-origin',
      id: 'sp-drawer-allowlist-origin',
    },
    '—',
  );
  const allowlistToggleBtn = el(
    'button',
    {
      class: 'sp-drawer-allowlist-toggle-btn',
      id: 'sp-drawer-allowlist-toggle',
    },
    'Add',
  ) as HTMLButtonElement;
  (allowlistToggleBtn as HTMLButtonElement).disabled = true;
  allowlistCurrentRow.appendChild(allowlistOriginLabel);
  allowlistCurrentRow.appendChild(allowlistToggleBtn);
  allowlistSection.appendChild(allowlistCurrentRow);

  const allowlistList = el('ul', {
    class: 'sp-drawer-allowlist-list',
    id: 'sp-drawer-allowlist-list',
    'aria-label': 'Allowlisted origins',
  });
  const allowlistEmpty = el(
    'div',
    { class: 'sp-drawer-allowlist-empty', id: 'sp-drawer-allowlist-empty', hidden: '' },
    'No sites allowlisted yet.',
  );
  allowlistSection.appendChild(allowlistList);
  allowlistSection.appendChild(allowlistEmpty);
  drawerBody.appendChild(allowlistSection);

  async function drawerReadAllowlist(): Promise<string[]> {
    try {
      const res = await chrome.storage.local.get(SP_SITE_ALLOWLIST_KEY);
      const list = (res as Record<string, unknown>)[SP_SITE_ALLOWLIST_KEY];
      return Array.isArray(list) ? (list as string[]).filter((s) => typeof s === 'string') : [];
    } catch {
      return [];
    }
  }
  async function drawerWriteAllowlist(next: string[]): Promise<void> {
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of next) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        const u = new URL(trimmed);
        const origin = u.origin;
        if (!seen.has(origin)) {
          seen.add(origin);
          cleaned.push(origin);
        }
      } catch {
        /* drop malformed */
      }
    }
    cleaned.sort();
    await chrome.storage.local.set({ [SP_SITE_ALLOWLIST_KEY]: cleaned });
  }
  function drawerCurrentTabOrigin(): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url;
        if (!url) return resolve(null);
        try {
          resolve(new URL(url).origin);
        } catch {
          resolve(null);
        }
      });
    });
  }
  async function renderDrawerAllowlistList(
    list: string[],
    currentOrigin: string | null,
  ): Promise<void> {
    clearChildren(allowlistList);
    if (list.length === 0) {
      allowlistEmpty.removeAttribute('hidden');
      return;
    }
    allowlistEmpty.setAttribute('hidden', '');
    for (const origin of list) {
      const li = el('li', {
        class: `sp-drawer-allowlist-item${origin === currentOrigin ? ' is-current' : ''}`,
      });
      const originSpan = el('span', { class: 'sp-drawer-allowlist-item-origin' }, origin);
      li.appendChild(originSpan);
      const removeBtn = el(
        'button',
        {
          type: 'button',
          class: 'sp-drawer-allowlist-item-remove',
          'aria-label': `Remove ${origin} from allowlist`,
        },
        'Remove',
      );
      removeBtn.addEventListener('click', async () => {
        const cur = await drawerReadAllowlist();
        await drawerWriteAllowlist(cur.filter((o) => o !== origin));
        await refreshDrawerAllowlist();
      });
      li.appendChild(removeBtn);
      allowlistList.appendChild(li);
    }
  }
  async function refreshDrawerAllowlist(): Promise<void> {
    const [list, origin] = await Promise.all([drawerReadAllowlist(), drawerCurrentTabOrigin()]);
    allowlistOriginLabel.textContent = origin ?? 'No active tab';
    (allowlistToggleBtn as HTMLButtonElement).disabled = !origin;
    if (origin) {
      const present = list.includes(origin);
      allowlistToggleBtn.textContent = present ? 'Remove' : 'Add';
      allowlistToggleBtn.classList.toggle('is-remove', present);
    } else {
      allowlistToggleBtn.textContent = 'Add';
      allowlistToggleBtn.classList.remove('is-remove');
    }
    await renderDrawerAllowlistList(list, origin);
  }
  allowlistToggleBtn.addEventListener('click', async () => {
    const origin = await drawerCurrentTabOrigin();
    if (!origin) return;
    const list = await drawerReadAllowlist();
    const present = list.includes(origin);
    await drawerWriteAllowlist(present ? list.filter((o) => o !== origin) : [...list, origin]);
    await refreshDrawerAllowlist();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SP_SITE_ALLOWLIST_KEY] && drawer.classList.contains('open')) {
      void refreshDrawerAllowlist();
    }
  });

  // ── Section 6: Memory ──────────────────────────────────────────────────────
  const DRAWER_DELETE_CONFIRM_MS = 3000;
  const memorySection = el('div', { class: 'sp-drawer-section' });
  memorySection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Memory'));
  memorySection.appendChild(
    el(
      'p',
      { class: 'sp-drawer-memory-help' },
      'Saved facts and preferences reused across sessions. Stored on this device only.',
    ),
  );

  const memoryAddBtn = el(
    'button',
    {
      class: 'sp-drawer-memory-add-btn',
      id: 'sp-drawer-memory-add-btn',
    },
    'Add memory',
  );
  memorySection.appendChild(memoryAddBtn);

  const memoryEditor = el('div', {
    class: 'sp-drawer-memory-editor',
    id: 'sp-drawer-memory-editor',
  });
  const memoryTextarea = el('textarea', {
    class: 'sp-drawer-memory-textarea',
    id: 'sp-drawer-memory-textarea',
    placeholder: 'Enter a fact, preference, or pattern to remember…',
    rows: '3',
    maxlength: '2000',
  }) as HTMLTextAreaElement;
  const memoryEditorActions = el('div', { class: 'sp-drawer-memory-editor-actions' });
  const memorySaveBtn = el(
    'button',
    { class: 'sp-drawer-btn sp-drawer-btn-primary', id: 'sp-drawer-memory-save-btn' },
    'Save',
  );
  const memoryCancelBtn = el(
    'button',
    { class: 'sp-drawer-btn', id: 'sp-drawer-memory-cancel-btn' },
    'Cancel',
  );
  memoryEditorActions.appendChild(memorySaveBtn);
  memoryEditorActions.appendChild(memoryCancelBtn);
  memoryEditor.appendChild(memoryTextarea);
  memoryEditor.appendChild(memoryEditorActions);
  memorySection.appendChild(memoryEditor);

  const memoryList = el('ul', {
    class: 'sp-drawer-memory-list',
    id: 'sp-drawer-memory-list',
    'aria-label': 'Saved memories',
  });
  const memoryEmpty = el(
    'div',
    { class: 'sp-drawer-memory-empty', id: 'sp-drawer-memory-empty', hidden: '' },
    'No saved memories yet.',
  );
  memorySection.appendChild(memoryList);
  memorySection.appendChild(memoryEmpty);
  drawerBody.appendChild(memorySection);

  type DrawerMemoryMessageType = 'LIST_MEMORIES' | 'ADD_MEMORY' | 'UPDATE_MEMORY' | 'DELETE_MEMORY';
  async function sendDrawerMemoryMsg(
    type: DrawerMemoryMessageType,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    try {
      const res = (await chrome.runtime.sendMessage({ type, ...payload })) as Record<
        string,
        unknown
      >;
      return res ?? {};
    } catch {
      return { success: false };
    }
  }
  function drawerFormatRelTime(iso: string): string {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      if (diff < 60_000) return 'just now';
      const m = Math.floor(diff / 60_000);
      if (m < 60) return `${m} min ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h} h ago`;
      return `${Math.floor(h / 24)} d ago`;
    } catch {
      return '';
    }
  }

  type DrawerMemoryItem = { id: string; content: string; createdAt: string; updatedAt?: string };

  function buildDrawerMemoryItem(item: DrawerMemoryItem): HTMLLIElement {
    const li = el('li', { class: 'sp-drawer-memory-item' });
    li.dataset['id'] = item.id;
    const contentEl = el('span', { class: 'sp-drawer-memory-item-content' }, item.content);
    const metaEl = el(
      'span',
      { class: 'sp-drawer-memory-item-meta' },
      drawerFormatRelTime(item.updatedAt || item.createdAt),
    );
    const actionRow = el('div', { class: 'sp-drawer-memory-item-row' });

    const editBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-memory-item-edit-btn' },
      'Edit',
    );
    const deleteBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-memory-item-delete-btn' },
      'Delete',
    ) as HTMLButtonElement;

    let confirmTimer: ReturnType<typeof setTimeout> | null = null;
    deleteBtn.addEventListener('click', () => {
      if (deleteBtn.classList.contains('is-confirm')) {
        if (confirmTimer !== null) {
          clearTimeout(confirmTimer);
          confirmTimer = null;
        }
        sendDrawerMemoryMsg('DELETE_MEMORY', { id: item.id })
          .then(() => refreshDrawerMemory())
          .catch(() => {});
      } else {
        deleteBtn.classList.add('is-confirm');
        deleteBtn.textContent = 'Confirm?';
        confirmTimer = setTimeout(() => {
          deleteBtn.classList.remove('is-confirm');
          deleteBtn.textContent = 'Delete';
          confirmTimer = null;
        }, DRAWER_DELETE_CONFIRM_MS);
      }
    });

    editBtn.addEventListener('click', () => {
      if (li.querySelector('.sp-drawer-memory-item-textarea')) return;
      contentEl.hidden = true;
      editBtn.hidden = true;
      deleteBtn.hidden = true;
      const editArea = el('textarea', {
        class: 'sp-drawer-memory-item-textarea',
        rows: '2',
        maxlength: '2000',
      }) as HTMLTextAreaElement;
      editArea.value = item.content;
      const editSave = el(
        'button',
        { type: 'button', class: 'sp-drawer-btn sp-drawer-btn-primary' },
        'Save',
      );
      const editCancel = el('button', { type: 'button', class: 'sp-drawer-btn' }, 'Cancel');
      const editActions = el('div', { class: 'sp-drawer-memory-editor-actions' });
      editActions.appendChild(editSave);
      editActions.appendChild(editCancel);
      editSave.addEventListener('click', async () => {
        const txt = editArea.value.trim();
        if (!txt) return;
        (editSave as HTMLButtonElement).disabled = true;
        await sendDrawerMemoryMsg('UPDATE_MEMORY', { id: item.id, content: txt });
        await refreshDrawerMemory();
      });
      editCancel.addEventListener('click', () => {
        editArea.remove();
        editActions.remove();
        contentEl.hidden = false;
        editBtn.hidden = false;
        deleteBtn.hidden = false;
      });
      li.insertBefore(editArea, actionRow);
      li.insertBefore(editActions, actionRow);
      editArea.focus();
    });

    actionRow.appendChild(editBtn);
    actionRow.appendChild(deleteBtn);
    li.appendChild(contentEl);
    li.appendChild(metaEl);
    li.appendChild(actionRow);
    return li;
  }

  async function refreshDrawerMemory(): Promise<void> {
    const res = await sendDrawerMemoryMsg('LIST_MEMORIES');
    const raw = Array.isArray(res['memories']) ? (res['memories'] as unknown[]) : [];
    const items = raw.filter(isMemoryItem);
    clearChildren(memoryList);
    if (items.length === 0) {
      memoryEmpty.removeAttribute('hidden');
      return;
    }
    memoryEmpty.setAttribute('hidden', '');
    for (const item of items) {
      memoryList.appendChild(buildDrawerMemoryItem(item as DrawerMemoryItem));
    }
  }

  function showDrawerMemoryEditor(show: boolean): void {
    memoryEditor.classList.toggle('open', show);
    if (show) {
      memoryTextarea.value = '';
      memoryTextarea.focus();
    }
  }
  memoryAddBtn.addEventListener('click', () => showDrawerMemoryEditor(true));
  memoryCancelBtn.addEventListener('click', () => showDrawerMemoryEditor(false));
  memorySaveBtn.addEventListener('click', async () => {
    const content = memoryTextarea.value.trim();
    if (!content) return;
    (memorySaveBtn as HTMLButtonElement).disabled = true;
    await sendDrawerMemoryMsg('ADD_MEMORY', { content });
    showDrawerMemoryEditor(false);
    (memorySaveBtn as HTMLButtonElement).disabled = false;
    await refreshDrawerMemory();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[MEMORY_STORAGE_KEY] && drawer.classList.contains('open')) {
      void refreshDrawerMemory();
    }
  });

  // ── Section 7: Bridge URL ──────────────────────────────────────────────────
  const bridgeSection = el('div', { class: 'sp-drawer-section' });
  bridgeSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Bridge URL'));
  const drawerBridgeInput = el('input', {
    class: 'sp-drawer-bridge-input',
    id: 'sp-drawer-bridge-input',
    type: 'text',
    placeholder: 'ws://localhost:8787',
    spellcheck: 'false',
  }) as HTMLInputElement;
  chrome.storage.local.get('agi_bridge_url', (result) => {
    if (chrome.runtime.lastError) return;
    const stored = result['agi_bridge_url'] as string | undefined;
    if (stored) drawerBridgeInput.value = stored;
  });
  const drawerBridgeRow = el('div', { class: 'sp-drawer-bridge-row' });
  drawerBridgeRow.appendChild(drawerBridgeInput);
  const drawerBridgeSaveBtn = el(
    'button',
    { class: 'sp-drawer-btn', id: 'sp-drawer-bridge-save-btn' },
    'Apply',
  );
  drawerBridgeRow.appendChild(drawerBridgeSaveBtn);
  bridgeSection.appendChild(drawerBridgeRow);
  const drawerBridgeError = el('div', { class: 'sp-drawer-bridge-error', hidden: '' });
  bridgeSection.appendChild(drawerBridgeError);
  drawerBody.appendChild(bridgeSection);

  function drawerSaveBridgeUrl(): void {
    const raw = (drawerBridgeInput as HTMLInputElement).value.trim();
    if (!raw) {
      chrome.storage.local.remove('agi_bridge_url');
    } else {
      const validated = validateBridgeUrl(raw);
      if (!validated) {
        const allowed = Array.from(ALLOWED_BRIDGE_HOSTS).join(', ');
        drawerBridgeError.textContent = `Only local URLs (${allowed}) are allowed`;
        drawerBridgeError.removeAttribute('hidden');
        setTimeout(() => drawerBridgeError.setAttribute('hidden', ''), 8000);
        return;
      }
      chrome.storage.local
        .set({ agi_bridge_url: raw })
        .catch((err: unknown) => console.warn('[SidePanel] drawer bridge save failed:', err));
    }
    drawerBridgeError.setAttribute('hidden', '');
    chrome.runtime
      .sendMessage({ type: 'BRIDGE_URL_CHANGED', url: raw })
      .catch((err: unknown) => console.warn('[SidePanel] drawer bridge notify failed:', err));
    // Also sync the old settings-bar input so both stay in sync
    const oldInput = document.getElementById('sp-bridge-url-input') as HTMLInputElement | null;
    if (oldInput) oldInput.value = raw;
  }
  drawerBridgeSaveBtn.addEventListener('click', drawerSaveBridgeUrl);
  drawerBridgeInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') drawerSaveBridgeUrl();
  });

  // ── Section 8: AGI Cloud (sign-in + free-trial quota) ────────────────────
  const cloudSection = el('div', { class: 'sp-drawer-section' });
  cloudSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'AGI Cloud'));

  // Container that swaps between signed-in and signed-out views
  const cloudAccountEl = el('div', { class: 'sp-cloud-account', id: 'sp-cloud-account' });

  // ── Signed-out view ──────────────────────────────────────────────────────
  const signinPrompt = el('div', {
    class: 'sp-cloud-signin-prompt',
    id: 'sp-cloud-signin-prompt',
  });
  signinPrompt.appendChild(
    el(
      'span',
      { class: 'sp-cloud-signin-desc' },
      'Sign in to get 3 free cloud chat prompts routed through AGI economy models.',
    ),
  );

  const signinBtn = el('button', { class: 'sp-cloud-signin-btn', id: 'sp-cloud-signin-btn' });
  signinBtn.textContent = 'Sign in to AGI Cloud';
  signinBtn.addEventListener('click', () => {
    // Open the web sign-in page. After signing in, the user can copy their
    // session token from the developer tools or the extension token page.
    chrome.tabs.create({ url: 'https://agiworkforce.com/sign-in' }).catch(() => {});
  });
  signinPrompt.appendChild(signinBtn);

  // Token paste row (for users who are already signed in on web)
  const tokenRow = el('div', { class: 'sp-cloud-token-row' });
  const tokenInput = el('input', {
    type: 'password',
    class: 'sp-cloud-token-input',
    id: 'sp-cloud-token-input',
    placeholder: 'Paste Clerk session token…',
    autocomplete: 'off',
    spellcheck: 'false',
  }) as HTMLInputElement;
  const tokenSaveBtn = el(
    'button',
    { class: 'sp-cloud-token-save-btn', id: 'sp-cloud-token-save-btn' },
    'Save',
  );
  tokenRow.appendChild(tokenInput);
  tokenRow.appendChild(tokenSaveBtn);
  signinPrompt.appendChild(tokenRow);
  signinPrompt.appendChild(
    el(
      'span',
      { class: 'sp-cloud-token-hint' },
      'Already signed in on agiworkforce.com? Copy your token from Account settings.',
    ),
  );

  // ── Signed-in view ───────────────────────────────────────────────────────
  const signedInView = el('div', {
    class: 'sp-cloud-signed-in',
    id: 'sp-cloud-signed-in',
    style: 'display:none',
  });
  const avatarEl = el('div', { class: 'sp-cloud-avatar', id: 'sp-cloud-avatar' }, 'A');
  const userInfoEl = el('div', { class: 'sp-cloud-user-info' });
  const userLabelEl = el('div', {
    class: 'sp-cloud-user-label',
    id: 'sp-cloud-user-label',
  });
  userLabelEl.textContent = 'AGI Account';
  const userTierEl = el('div', { class: 'sp-cloud-user-tier', id: 'sp-cloud-user-tier' });
  userTierEl.textContent = 'Free tier';
  userInfoEl.appendChild(userLabelEl);
  userInfoEl.appendChild(userTierEl);
  const signoutBtn = el(
    'button',
    { class: 'sp-cloud-signout-btn', id: 'sp-cloud-signout-btn' },
    'Sign out',
  );
  signedInView.appendChild(avatarEl);
  signedInView.appendChild(userInfoEl);
  signedInView.appendChild(signoutBtn);

  // ── Quota bar ────────────────────────────────────────────────────────────
  const quotaWrap = el('div', {
    class: 'sp-quota-bar-wrap',
    id: 'sp-quota-bar-wrap',
    style: 'display:none',
  });
  const quotaTopRow = el('div', { class: 'sp-quota-bar-row' });
  const quotaLabel = el('span', { id: 'sp-quota-label' }, 'Free prompts');
  const quotaCount = el('span', { id: 'sp-quota-count' }, `0 / ${FREE_TRIAL_PROMPT_LIMIT}`);
  quotaTopRow.appendChild(quotaLabel);
  quotaTopRow.appendChild(quotaCount);
  const quotaBarBg = el('div', { class: 'sp-quota-bar-bg' });
  const quotaBarFill = el('div', {
    class: 'sp-quota-bar-fill',
    id: 'sp-quota-bar-fill',
    style: 'width:0%',
  });
  quotaBarBg.appendChild(quotaBarFill);
  const quotaModelRow = el('div', { class: 'sp-quota-bar-row' });
  const quotaModelLabel = el(
    'span',
    { class: 'sp-quota-bar-model', id: 'sp-quota-model-label' },
    `Model: ${FREE_TRIAL_MODEL}`,
  );
  quotaModelRow.appendChild(quotaModelLabel);
  quotaWrap.appendChild(quotaTopRow);
  quotaWrap.appendChild(quotaBarBg);
  quotaWrap.appendChild(quotaModelRow);

  // Upgrade row (shown when quota exhausted)
  const quotaUpgradeRow = el('div', {
    class: 'sp-quota-upgrade-row',
    id: 'sp-quota-upgrade-row',
    style: 'display:none',
  });
  const quotaExhaustedLabel = el(
    'span',
    { style: 'font-size:10px;color:var(--agi-ext-danger)' },
    'Free prompts used',
  );
  const quotaUpgradeBtn = el(
    'button',
    { class: 'sp-quota-upgrade-btn', id: 'sp-quota-upgrade-btn' },
    'Upgrade',
  );
  quotaUpgradeRow.appendChild(quotaExhaustedLabel);
  quotaUpgradeRow.appendChild(quotaUpgradeBtn);
  quotaWrap.appendChild(quotaUpgradeRow);

  cloudAccountEl.appendChild(signinPrompt);
  cloudAccountEl.appendChild(signedInView);
  cloudAccountEl.appendChild(quotaWrap);
  cloudSection.appendChild(cloudAccountEl);
  drawerBody.appendChild(cloudSection);

  // ── "Unlock AGI Cloud" button (invite-code path, kept below sign-in) ────
  let drawerCloudModal: ReturnType<typeof mountInviteCodeModal> | null = null;
  const inviteCodeSection = el('div', { class: 'sp-drawer-section' });
  const drawerCloudBtn = el(
    'button',
    { class: 'sp-drawer-cloud-btn', id: 'sp-drawer-cloud-btn' },
    'Enter invite code',
  );
  drawerCloudBtn.addEventListener('click', () => {
    if (!drawerCloudModal) {
      drawerCloudModal = mountInviteCodeModal(document.body, {
        open: true,
        source: 'computer-use',
        defaultTab: 'invite',
        onClose: () => drawerCloudModal?.update({ open: false }),
        onRedeemed: (_inviteId) => {
          void refreshCloudAccountUI();
        },
      });
    } else {
      drawerCloudModal.show();
    }
  });
  inviteCodeSection.appendChild(drawerCloudBtn);
  drawerBody.appendChild(inviteCodeSection);

  // ── Quota badge in header (click opens drawer to cloud section) ──────────
  // Insert into the slot reserved in the header above.
  const quotaBadgeEl = el('div', {
    id: 'sp-quota-badge',
    title: 'AGI Cloud free prompts',
    style: 'cursor:pointer',
  });
  quotaBadgeEl.addEventListener('click', () => {
    const drawerEl = document.getElementById('sp-drawer');
    if (drawerEl && !drawerEl.classList.contains('open')) {
      drawerEl.classList.add('open');
      const overlayEl = document.getElementById('sp-drawer-overlay');
      if (overlayEl) overlayEl.classList.add('open');
    }
  });
  // Attach to the slot created in the header section above
  const quotaSlot = document.getElementById('sp-quota-badge-slot');
  if (quotaSlot) quotaSlot.replaceWith(quotaBadgeEl);
  else document.body.appendChild(quotaBadgeEl);

  // ── Cloud UI state helpers ───────────────────────────────────────────────
  // Wire the module-level placeholder to the real implementation (which closes
  // over signinPrompt, signedInView, quotaWrap, quotaBadgeEl, etc.).
  refreshCloudAccountUI = async function (): Promise<void> {
    const token = await getAuthToken();
    if (!token) {
      // Signed out
      signinPrompt.style.display = '';
      signedInView.style.display = 'none';
      quotaWrap.style.display = 'none';
      quotaBadgeEl.classList.remove('visible', 'has-prompts', 'exhausted');
      return;
    }

    // Signed in
    signinPrompt.style.display = 'none';
    signedInView.style.display = '';
    quotaWrap.style.display = '';

    const remaining = await getRemainingFreePrompts();
    const used = FREE_TRIAL_PROMPT_LIMIT - remaining;
    const pct = Math.round((used / FREE_TRIAL_PROMPT_LIMIT) * 100);

    quotaCount.textContent = `${remaining} / ${FREE_TRIAL_PROMPT_LIMIT} remaining`;
    (quotaBarFill as HTMLElement).style.width = `${pct}%`;
    if (remaining === 0) {
      (quotaBarFill as HTMLElement).classList.add('exhausted');
      quotaUpgradeRow.style.display = '';
    } else {
      (quotaBarFill as HTMLElement).classList.remove('exhausted');
      quotaUpgradeRow.style.display = 'none';
    }

    // Header badge
    quotaBadgeEl.classList.add('visible');
    quotaBadgeEl.classList.remove('has-prompts', 'exhausted');
    if (remaining > 0) {
      quotaBadgeEl.textContent = `${remaining} free`;
      quotaBadgeEl.classList.add('has-prompts');
    } else {
      quotaBadgeEl.textContent = 'Upgrade';
      quotaBadgeEl.classList.add('exhausted');
    }
  };

  // Token save handler
  tokenSaveBtn.addEventListener('click', async () => {
    const raw = tokenInput.value.trim();
    if (!raw) return;
    await storeSessionToken(raw);
    tokenInput.value = '';
    await refreshCloudAccountUI();
  });
  tokenInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') tokenSaveBtn.click();
  });

  // Sign-out handler
  signoutBtn.addEventListener('click', async () => {
    await clearAuthToken();
    await refreshCloudAccountUI();
  });

  // Upgrade button — open agiworkforce.com pricing
  quotaUpgradeBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://agiworkforce.com/pricing' }).catch(() => {});
  });

  // Initial load
  void refreshCloudAccountUI();

  drawer.appendChild(drawerBody);

  // ── Drawer footer: stats + about ───────────────────────────────────────────
  const drawerFooter = el('div', { id: 'sp-drawer-footer' });
  const statsRow = el('div', { class: 'sp-drawer-stats-row' });
  const tabCountStat = el('div', { class: 'sp-drawer-stat' });
  const tabCountVal = el('div', { class: 'sp-drawer-stat-value', id: 'sp-drawer-tab-count' }, '-');
  tabCountStat.appendChild(tabCountVal);
  tabCountStat.appendChild(el('div', { class: 'sp-drawer-stat-label' }, 'Tabs'));
  const actionCountStat = el('div', { class: 'sp-drawer-stat' });
  const actionCountVal = el(
    'div',
    { class: 'sp-drawer-stat-value', id: 'sp-drawer-action-count' },
    '-',
  );
  actionCountStat.appendChild(actionCountVal);
  actionCountStat.appendChild(el('div', { class: 'sp-drawer-stat-label' }, 'Actions'));
  const sessionTimeStat = el('div', { class: 'sp-drawer-stat' });
  const sessionTimeVal = el(
    'div',
    { class: 'sp-drawer-stat-value', id: 'sp-drawer-session-time' },
    '0:00',
  );
  sessionTimeStat.appendChild(sessionTimeVal);
  sessionTimeStat.appendChild(el('div', { class: 'sp-drawer-stat-label' }, 'Session'));
  statsRow.appendChild(tabCountStat);
  statsRow.appendChild(actionCountStat);
  statsRow.appendChild(sessionTimeStat);
  drawerFooter.appendChild(statsRow);

  const aboutRow = el('div', { class: 'sp-drawer-about-row' });
  aboutRow.appendChild(el('span', {}, `v${chrome.runtime.getManifest().version}`));
  const aboutUrlSpan = el('span', { class: 'sp-drawer-about-url', id: 'sp-drawer-about-url' }, '—');
  aboutRow.appendChild(aboutUrlSpan);
  const aboutTabId = el('span', { id: 'sp-drawer-tab-id' }, '');
  aboutRow.appendChild(aboutTabId);
  drawerFooter.appendChild(aboutRow);
  drawer.appendChild(drawerFooter);

  async function refreshDrawerStats(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      tabCountVal.textContent = String(tabs.length);
      const statsData = await chrome.storage.local.get('stats');
      const count = (statsData['stats'] as { actionCount?: number } | undefined)?.actionCount ?? 0;
      actionCountVal.textContent = String(count);
    } catch {
      /* ignore */
    }
  }
  async function refreshDrawerTabInfo(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.url) {
        try {
          const url = new URL(tab.url);
          const chars = [...`${url.hostname}${url.pathname}`];
          aboutUrlSpan.textContent =
            chars.length > 28 ? chars.slice(0, 28).join('') + '…' : chars.join('');
          aboutUrlSpan.title = tab.url;
        } catch {
          aboutUrlSpan.textContent = 'Unknown';
        }
      }
      if (tab?.id != null) aboutTabId.textContent = `#${tab.id}`;
    } catch {
      /* ignore */
    }
  }

  // Session timer for drawer stats footer
  function startDrawerSessionTimer(): void {
    if (_drawerSessionTimer !== null) return;
    _drawerSessionStart = Date.now();
    const update = (): void => {
      const elapsed = Math.floor((Date.now() - _drawerSessionStart) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      const el2 = document.getElementById('sp-drawer-session-time');
      if (el2) el2.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    };
    update();
    _drawerSessionTimer = setInterval(update, 1000);
  }
  startDrawerSessionTimer();

  document.body.appendChild(drawerOverlay);
  document.body.appendChild(drawer);

  const consolePanel = el('div', { id: 'sp-console-panel' });
  const consoleHeader = el('div', { class: 'sp-console-header' });
  consoleHeader.appendChild(el('span', { class: 'sp-console-title' }, 'Console'));
  const consoleClearBtn = el('button', { class: 'sp-console-clear' }, 'Clear');
  consoleClearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_CONSOLE_LOGS' }, () => {
      if (chrome.runtime.lastError) return;
      const entries = consolePanel.querySelector('.sp-console-entries');
      if (entries) clearChildren(entries);
    });
  });
  const consoleRefreshBtn = el('button', { class: 'sp-console-clear' }, 'Refresh');
  consoleRefreshBtn.addEventListener('click', () => refreshConsoleLogs());
  consoleHeader.appendChild(consoleRefreshBtn);
  consoleHeader.appendChild(consoleClearBtn);
  consolePanel.appendChild(consoleHeader);
  consolePanel.appendChild(el('div', { class: 'sp-console-entries' }));
  document.body.appendChild(consolePanel);

  // Phase 3: #sp-settings-bar removed; bridge URL is managed exclusively via the
  // drawer's Bridge URL section (drawerSaveBridgeUrl). The hidden bridgeUrlInput
  // element is kept in the DOM so that the drawer's sync line (oldInput?.value = raw)
  // remains a silent no-op rather than a querySelector miss.

  const statusPill = el('div', { id: 'sp-status-pill', class: 'disconnected' });
  const statusDot0 = document.createElement('span');
  statusDot0.className = 'sp-status-dot';
  statusPill.replaceChildren(statusDot0, 'Offline');

  const authBar = el('div', { id: 'sp-auth-bar' });
  authBar.appendChild(statusPill);
  document.body.appendChild(authBar);

  const tabBar = el('div', { id: 'sp-tab-bar' });
  const chatTabBtn = el('button', { class: 'sp-tab', 'data-tab': 'chat' }, 'Chat');
  const workflowsTabBtn = el('button', { class: 'sp-tab', 'data-tab': 'workflows' }, 'Workflows');
  const cuTabBtn = el(
    'button',
    { class: 'sp-tab sp-tab-active', 'data-tab': 'computer-use' },
    'Computer Use',
  );
  tabBar.appendChild(chatTabBtn);
  tabBar.appendChild(workflowsTabBtn);
  tabBar.appendChild(cuTabBtn);
  document.body.appendChild(tabBar);

  // Build computer-use panel (kept in module scope so event handlers can reach it)
  const cuPanel: ComputerUsePanelAPI = buildComputerUsePanel();

  function switchTab(tab: SidePanelTab): void {
    const chatPanelEl = document.getElementById('sp-chat-panel');
    const workflowsPanelEl = document.getElementById('sp-workflows');
    const inputAreaEl = document.getElementById('sp-input-area');
    const toolbarEl = document.getElementById('sp-toolbar');
    chatTabBtn.classList.toggle('sp-tab-active', tab === 'chat');
    workflowsTabBtn.classList.toggle('sp-tab-active', tab === 'workflows');
    cuTabBtn.classList.toggle('sp-tab-active', tab === 'computer-use');
    if (chatPanelEl) chatPanelEl.classList.toggle('sp-tab-hidden', tab !== 'chat');
    if (workflowsPanelEl) workflowsPanelEl.classList.toggle('sp-tab-visible', tab === 'workflows');
    cuPanel.panelEl.classList.toggle('sp-tab-visible', tab === 'computer-use');
    if (inputAreaEl) inputAreaEl.style.display = tab === 'chat' ? '' : 'none';
    if (toolbarEl) toolbarEl.style.display = tab === 'chat' ? '' : 'none';
    if (tab === 'workflows') {
      refreshWorkflowsShortcuts();
      refreshWorkflowsTasks();
    }
    if (tab === 'computer-use') {
      cuPanel.refreshAuthChip();
    }
  }
  chatTabBtn.addEventListener('click', () => switchTab('chat'));
  workflowsTabBtn.addEventListener('click', () => switchTab('workflows'));
  cuTabBtn.addEventListener('click', () => switchTab('computer-use'));

  const chatPanel = el('div', { id: 'sp-chat-panel' });

  const msgsArea = el('div', { id: 'sp-messages' });
  // #sp-empty: composer-first empty state (design-spec §8); hidden when messages present
  const emptyState = el('div', { id: 'sp-empty' });
  const emptyIcon = el('div', { id: 'sp-empty-icon' });
  // L-11 audit 2026-05-19: see logo SVG above.
  const emptyIconSvg = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="url(#emGrad)" opacity="0.18"/>
    <circle cx="20" cy="15" r="5" stroke="url(#emGrad)" stroke-width="1.75"/>
    <path d="M10 32c0-5.523 4.477-8.5 10-8.5s10 2.977 10 8.5" stroke="url(#emGrad)" stroke-width="1.75" stroke-linecap="round"/>
    <defs><linearGradient id="emGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#21808d"/><stop offset="1" stop-color="#da7756"/>
    </linearGradient></defs>
  </svg>`;
  appendSvgString(emptyIcon, emptyIconSvg);
  emptyState.appendChild(emptyIcon);
  emptyState.appendChild(el('div', { id: 'sp-empty-headline' }, 'How can I help you today?'));
  emptyState.appendChild(
    el(
      'div',
      { id: 'sp-empty-subtext' },
      'Ask a question, summarize a page, or type / for commands.',
    ),
  );
  msgsArea.appendChild(emptyState);

  const blockedState = el('div', { id: 'sp-blocked' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const shield = document.createElementNS(svgNS, 'svg');
  shield.id = 'sp-blocked-shield';
  shield.setAttribute('viewBox', '0 0 24 24');
  shield.setAttribute('fill', 'none');
  shield.setAttribute('aria-hidden', 'true');
  const shieldPath = document.createElementNS(svgNS, 'path');
  shieldPath.setAttribute(
    'd',
    'M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4z',
  );
  shieldPath.setAttribute('stroke', 'var(--agi-ext-text-muted)');
  shieldPath.setAttribute('stroke-width', '1.5');
  shieldPath.setAttribute('stroke-linejoin', 'round');
  const shieldLine = document.createElementNS(svgNS, 'line');
  shieldLine.setAttribute('x1', '12');
  shieldLine.setAttribute('y1', '8');
  shieldLine.setAttribute('x2', '12');
  shieldLine.setAttribute('y2', '13');
  shieldLine.setAttribute('stroke', 'var(--agi-ext-text-muted)');
  shieldLine.setAttribute('stroke-width', '1.5');
  shieldLine.setAttribute('stroke-linecap', 'round');
  const shieldCircle = document.createElementNS(svgNS, 'circle');
  shieldCircle.setAttribute('cx', '12');
  shieldCircle.setAttribute('cy', '16');
  shieldCircle.setAttribute('r', '0.75');
  shieldCircle.setAttribute('fill', 'var(--agi-ext-text-muted)');
  shield.appendChild(shieldPath);
  shield.appendChild(shieldLine);
  shield.appendChild(shieldCircle);
  blockedState.appendChild(shield);
  blockedState.appendChild(
    createElementWith({ tag: 'div', id: 'sp-blocked-title', text: "Can't access this page" }),
  );
  blockedState.appendChild(
    createElementWith({
      tag: 'div',
      id: 'sp-blocked-desc',
      text: 'Browser automation is not available on this page.',
    }),
  );
  msgsArea.appendChild(blockedState);

  // BLOCKER-02b: offline onboarding — shown when bridge is unreachable on first open
  const offlineOnboarding = el('div', { id: 'sp-offline-onboarding' });
  const offlineIcon = el('div', { id: 'sp-offline-onboarding-icon' });
  const offlineIconSvg = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="url(#ofGrad)" opacity="0.18"/>
    <circle cx="20" cy="15" r="5" stroke="url(#ofGrad)" stroke-width="1.75"/>
    <path d="M10 32c0-5.523 4.477-8.5 10-8.5s10 2.977 10 8.5" stroke="url(#ofGrad)" stroke-width="1.75" stroke-linecap="round"/>
    <defs><linearGradient id="ofGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="var(--agi-ext-text-muted)"/><stop offset="1" stop-color="var(--agi-ext-text-muted)"/>
    </linearGradient></defs>
  </svg>`;
  appendSvgString(offlineIcon, offlineIconSvg);
  offlineOnboarding.appendChild(offlineIcon);
  offlineOnboarding.appendChild(
    el('div', { id: 'sp-offline-onboarding-title' }, 'Desktop app not running'),
  );
  offlineOnboarding.appendChild(
    el(
      'div',
      { id: 'sp-offline-onboarding-desc' },
      'AGI runs locally. Open the AGI desktop app to connect, then refresh this panel.',
    ),
  );
  const offlineCta = el('button', { id: 'sp-offline-onboarding-cta' }, 'Download AGI Desktop');
  offlineCta.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://agi.build/download' }).catch(() => {});
  });
  offlineOnboarding.appendChild(offlineCta);
  msgsArea.appendChild(offlineOnboarding);

  chatPanel.appendChild(msgsArea);
  document.body.appendChild(chatPanel);

  const workflowsPanel = el('div', { id: 'sp-workflows' });

  const recordSection = el('div', { class: 'sp-wf-section' });
  const recordHeader = el('div', { class: 'sp-wf-section-header' });
  recordHeader.appendChild(el('div', { class: 'sp-wf-section-title' }, 'Recording'));
  recordSection.appendChild(recordHeader);
  const recordBar = el('div', { class: 'sp-wf-record-bar' });
  const recordBtn = el('button', { class: 'sp-wf-record-btn', id: 'sp-wf-record-btn' });
  const actionCounter = el('div', { class: 'sp-wf-action-counter', id: 'sp-wf-action-counter' });
  actionCounter.style.display = 'none';
  function setRecordBtnLabel(label: string): void {
    const dot = document.createElement('span');
    dot.className = 'sp-wf-record-dot';
    recordBtn.replaceChildren(dot, ` ${label}`);
  }
  function setActionCounterLabel(count: number): void {
    const strong = document.createElement('strong');
    strong.textContent = String(count);
    actionCounter.replaceChildren(strong, ' actions recorded');
  }
  setRecordBtnLabel('Record');
  recordBar.appendChild(recordBtn);
  recordBar.appendChild(actionCounter);
  recordSection.appendChild(recordBar);

  const saveDialog = el('div', { class: 'sp-wf-save-dialog', id: 'sp-wf-save-dialog' });
  saveDialog.appendChild(el('div', { class: 'sp-wf-save-dialog-title' }, 'Save this recording'));
  const saveNameInput = el('input', {
    class: 'sp-wf-form-input',
    placeholder: 'Workflow name...',
    id: 'sp-wf-save-name',
  }) as HTMLInputElement;
  saveDialog.appendChild(saveNameInput);
  const saveDialogActions = el('div', { class: 'sp-wf-form-actions' });
  const saveCancelBtn = el('button', { class: 'sp-wf-form-cancel-btn' }, 'Discard');
  const saveConfirmBtn = el('button', { class: 'sp-wf-form-save-btn' }, 'Save');
  saveDialogActions.appendChild(saveCancelBtn);
  saveDialogActions.appendChild(saveConfirmBtn);
  saveDialog.appendChild(saveDialogActions);
  recordSection.appendChild(saveDialog);

  let recordingPollInterval: ReturnType<typeof setInterval> | null = null;
  function startRecordingPoll() {
    stopRecordingPoll();
    recordingPollInterval = setInterval(() => {
      chrome.runtime.sendMessage(
        { type: 'GET_RECORDED_ACTIONS' },
        (resp: { success?: boolean; actions?: unknown[] } | undefined) => {
          if (chrome.runtime.lastError || !resp?.success) return;
          recordingActionCount = resp.actions?.length ?? 0;
          setActionCounterLabel(recordingActionCount);
        },
      );
    }, 1500);
  }
  function stopRecordingPoll() {
    if (recordingPollInterval !== null) {
      clearInterval(recordingPollInterval);
      recordingPollInterval = null;
    }
  }
  recordBtn.addEventListener('click', () => {
    if (isRecording) {
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, () => {
        if (chrome.runtime.lastError) {
          setRecordBtnLabel('Error');
          setTimeout(() => setRecordBtnLabel('Stop'), 1500);
          return;
        }
        isRecording = false;
        stopRecordingPoll();
        recordBtn.classList.remove('recording');
        setRecordBtnLabel('Record');
        actionCounter.style.display = 'none';
        saveDialog.classList.add('open');
        saveNameInput.value = '';
        saveNameInput.focus();
      });
    } else {
      chrome.runtime.sendMessage({ type: 'START_RECORDING' }, () => {
        if (chrome.runtime.lastError) {
          setRecordBtnLabel('Error');
          setTimeout(() => setRecordBtnLabel('Record'), 1500);
          return;
        }
        isRecording = true;
        recordingActionCount = 0;
        recordBtn.classList.add('recording');
        setRecordBtnLabel('Stop');
        actionCounter.style.display = '';
        setActionCounterLabel(0);
        saveDialog.classList.remove('open');
        startRecordingPoll();
      });
    }
  });
  saveCancelBtn.addEventListener('click', () => saveDialog.classList.remove('open'));
  saveConfirmBtn.addEventListener('click', () => {
    const name = saveNameInput.value.trim();
    if (!name) {
      saveNameInput.style.borderColor = 'var(--agi-ext-danger)';
      setTimeout(() => {
        saveNameInput.style.borderColor = '';
      }, 1500);
      return;
    }
    chrome.runtime.sendMessage(
      { type: 'GET_RECORDED_ACTIONS' },
      (recResp: { success?: boolean; actions?: unknown[] } | undefined) => {
        if (chrome.runtime.lastError || !recResp?.success) {
          const origPlaceholder = saveNameInput.placeholder;
          saveNameInput.placeholder = 'Failed to retrieve actions';
          saveNameInput.style.borderColor = 'var(--agi-ext-danger)';
          setTimeout(() => {
            saveNameInput.placeholder = origPlaceholder;
            saveNameInput.style.borderColor = '';
          }, 2000);
          return;
        }
        const recActions = recResp.actions ?? [];
        if (recActions.length === 0) {
          saveDialog.classList.remove('open');
          return;
        }
        chrome.runtime.sendMessage({ type: 'SAVE_SHORTCUT', name, actions: recActions }, () => {
          if (chrome.runtime.lastError) {
            const origPlaceholder = saveNameInput.placeholder;
            saveNameInput.placeholder = 'Failed to save shortcut';
            saveNameInput.style.borderColor = 'var(--agi-ext-danger)';
            setTimeout(() => {
              saveNameInput.placeholder = origPlaceholder;
              saveNameInput.style.borderColor = '';
            }, 2000);
            return;
          }
          saveDialog.classList.remove('open');
          refreshWorkflowsShortcuts();
        });
      },
    );
  });
  saveNameInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') saveConfirmBtn.click();
  });
  workflowsPanel.appendChild(recordSection);

  const shortcutsSection = el('div', { class: 'sp-wf-section' });
  const shortcutsSectionHeader = el('div', { class: 'sp-wf-section-header' });
  const shortcutsTitle = el('div', { class: 'sp-wf-section-title' });
  shortcutsTitle.appendChild(document.createTextNode('Saved Shortcuts '));
  shortcutsTitle.appendChild(
    createElementWith({
      tag: 'span',
      className: 'sp-wf-count-badge',
      id: 'sp-wf-shortcuts-count',
      text: '0',
    }),
  );
  shortcutsSectionHeader.appendChild(shortcutsTitle);
  const createShortcutBtn = el(
    'button',
    { class: 'sp-wf-create-shortcut-btn', id: 'sp-wf-create-shortcut-btn' },
    '+ Create shortcut',
  );
  shortcutsSectionHeader.appendChild(createShortcutBtn);
  shortcutsSection.appendChild(shortcutsSectionHeader);
  const wfShortcutsList = el('div', { class: 'sp-wf-shortcuts-list', id: 'sp-wf-shortcuts-list' });
  setChild(wfShortcutsList, {
    tag: 'div',
    className: 'sp-wf-empty',
    text: 'Record your first workflow or create a prompt shortcut',
  });
  shortcutsSection.appendChild(wfShortcutsList);
  workflowsPanel.appendChild(shortcutsSection);

  /* ── Create-shortcut modal overlay ── */
  const createShortcutOverlay = el('div', {
    class: 'sp-create-shortcut-overlay',
    id: 'sp-create-shortcut-overlay',
  });
  const createShortcutModal = el('div', { class: 'sp-create-shortcut-modal' });
  const modalHeader = el('div', { class: 'sp-create-shortcut-header' });
  modalHeader.appendChild(el('div', { class: 'sp-create-shortcut-title' }, 'Create shortcut'));
  const modalCloseBtn = el('button', { class: 'sp-create-shortcut-close', title: 'Close' }, '×');
  modalHeader.appendChild(modalCloseBtn);
  createShortcutModal.appendChild(modalHeader);

  const nameField = el('div', { class: 'sp-create-shortcut-field' });
  nameField.appendChild(el('div', { class: 'sp-create-shortcut-label' }, 'Name'));
  const scNameInput = el('input', {
    class: 'sp-create-shortcut-input',
    placeholder: '/ task-name',
    id: 'sp-sc-name',
  }) as HTMLInputElement;
  nameField.appendChild(scNameInput);
  createShortcutModal.appendChild(nameField);

  const promptField = el('div', { class: 'sp-create-shortcut-field' });
  promptField.appendChild(el('div', { class: 'sp-create-shortcut-label' }, 'Prompt'));
  const scPromptInput = el('textarea', {
    class: 'sp-create-shortcut-textarea',
    placeholder: 'Enter your prompt text...',
    id: 'sp-sc-prompt',
  }) as HTMLTextAreaElement;
  promptField.appendChild(scPromptInput);
  createShortcutModal.appendChild(promptField);

  const startFromField = el('div', { class: 'sp-create-shortcut-field' });
  startFromField.appendChild(el('div', { class: 'sp-create-shortcut-label' }, 'Start from'));
  const scStartUrlInput = el('input', {
    class: 'sp-create-shortcut-input',
    placeholder: 'https://example.com',
    id: 'sp-sc-starturl',
    type: 'url',
  }) as HTMLInputElement;
  startFromField.appendChild(scStartUrlInput);
  createShortcutModal.appendChild(startFromField);

  const scheduleRow = el('div', { class: 'sp-create-shortcut-schedule-row' });
  scheduleRow.appendChild(el('div', { class: 'sp-create-shortcut-schedule-label' }, 'Schedule'));
  const scScheduleToggle = el('input', {
    type: 'checkbox',
    class: 'sp-create-shortcut-toggle',
    id: 'sp-sc-schedule',
  }) as HTMLInputElement;
  scheduleRow.appendChild(scScheduleToggle);
  createShortcutModal.appendChild(scheduleRow);

  const modalActions = el('div', { class: 'sp-create-shortcut-actions' });
  const scCancelBtn = el('button', { class: 'sp-create-shortcut-cancel' }, 'Cancel');
  const scSaveBtn = el('button', { class: 'sp-create-shortcut-save' }, 'Create shortcut');
  modalActions.appendChild(scCancelBtn);
  modalActions.appendChild(scSaveBtn);
  createShortcutModal.appendChild(modalActions);
  createShortcutOverlay.appendChild(createShortcutModal);
  document.body.appendChild(createShortcutOverlay);

  function openCreateShortcutModal(): void {
    scNameInput.value = '';
    scPromptInput.value = '';
    scStartUrlInput.value = '';
    scScheduleToggle.checked = false;
    createShortcutOverlay.classList.add('open');
    setTimeout(() => scNameInput.focus(), 50);
  }
  function closeCreateShortcutModal(): void {
    createShortcutOverlay.classList.remove('open');
  }

  createShortcutBtn.addEventListener('click', openCreateShortcutModal);
  modalCloseBtn.addEventListener('click', closeCreateShortcutModal);
  scCancelBtn.addEventListener('click', closeCreateShortcutModal);
  createShortcutOverlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === createShortcutOverlay) closeCreateShortcutModal();
  });

  scSaveBtn.addEventListener('click', () => {
    const name = scNameInput.value.trim();
    const prompt = scPromptInput.value.trim();
    if (!name) {
      scNameInput.style.borderColor = 'var(--agi-ext-danger)';
      setTimeout(() => {
        scNameInput.style.borderColor = '';
      }, 1500);
      return;
    }
    if (!prompt) {
      scPromptInput.style.borderColor = 'var(--agi-ext-danger)';
      setTimeout(() => {
        scPromptInput.style.borderColor = '';
      }, 1500);
      return;
    }
    const startUrl = scStartUrlInput.value.trim() || undefined;
    const scheduled = scScheduleToggle.checked;
    (scSaveBtn as HTMLButtonElement).disabled = true;
    scSaveBtn.textContent = 'Saving...';
    chrome.runtime.sendMessage(
      { type: 'SAVE_SHORTCUT', name, actions: [], prompt, startUrl, scheduled },
      () => {
        (scSaveBtn as HTMLButtonElement).disabled = false;
        scSaveBtn.textContent = 'Create shortcut';
        if (chrome.runtime.lastError) {
          scNameInput.style.borderColor = 'var(--agi-ext-danger)';
          setTimeout(() => {
            scNameInput.style.borderColor = '';
          }, 2000);
          return;
        }
        closeCreateShortcutModal();
        refreshWorkflowsShortcuts();
      },
    );
  });

  scNameInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeCreateShortcutModal();
  });
  scPromptInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeCreateShortcutModal();
  });

  const tasksSection = el('div', { class: 'sp-wf-section' });
  const tasksSectionHeader = el('div', { class: 'sp-wf-section-header' });
  const tasksTitle = el('div', { class: 'sp-wf-section-title' });
  tasksTitle.appendChild(document.createTextNode('Scheduled Tasks '));
  tasksTitle.appendChild(
    createElementWith({
      tag: 'span',
      className: 'sp-wf-count-badge',
      id: 'sp-wf-tasks-count',
      text: '0',
    }),
  );
  tasksSectionHeader.appendChild(tasksTitle);
  const newTaskBtn = el(
    'button',
    { class: 'sp-wf-new-task-btn', id: 'sp-wf-new-task-btn' },
    '+ New Task',
  );
  tasksSectionHeader.appendChild(newTaskBtn);
  tasksSection.appendChild(tasksSectionHeader);
  const wfTasksList = el('div', { class: 'sp-wf-tasks-list', id: 'sp-wf-tasks-list' });
  setChild(wfTasksList, { tag: 'div', className: 'sp-wf-empty', text: 'No scheduled tasks' });
  tasksSection.appendChild(wfTasksList);

  const newTaskForm = el('div', { class: 'sp-wf-new-task-form', id: 'sp-wf-new-task-form' });
  newTaskForm.appendChild(el('div', { class: 'sp-wf-form-label' }, 'Task Name'));
  const ntNameInput = el('input', {
    class: 'sp-wf-form-input',
    placeholder: 'e.g. Check news',
    id: 'sp-wf-nt-name',
  }) as HTMLInputElement;
  newTaskForm.appendChild(ntNameInput);
  newTaskForm.appendChild(el('div', { class: 'sp-wf-form-label' }, 'Prompt'));
  const ntPromptInput = el('input', {
    class: 'sp-wf-form-input',
    placeholder: 'What should the AI do?',
    id: 'sp-wf-nt-prompt',
  }) as HTMLInputElement;
  newTaskForm.appendChild(ntPromptInput);
  newTaskForm.appendChild(el('div', { class: 'sp-wf-form-label' }, 'Schedule'));
  const ntScheduleSelect = el('select', {
    class: 'sp-wf-form-select',
    id: 'sp-wf-nt-schedule',
  }) as HTMLSelectElement;
  for (const opt of [
    { value: 'hourly', label: 'Hourly' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
  ]) {
    ntScheduleSelect.appendChild(el('option', { value: opt.value }, opt.label));
  }
  newTaskForm.appendChild(ntScheduleSelect);
  const ntFormActions = el('div', { class: 'sp-wf-form-actions' });
  const ntCancelBtn = el('button', { class: 'sp-wf-form-cancel-btn' }, 'Cancel');
  const ntSaveBtn = el('button', { class: 'sp-wf-form-save-btn' }, 'Create Task');
  ntFormActions.appendChild(ntCancelBtn);
  ntFormActions.appendChild(ntSaveBtn);
  newTaskForm.appendChild(ntFormActions);
  tasksSection.appendChild(newTaskForm);
  workflowsPanel.appendChild(tasksSection);

  newTaskBtn.addEventListener('click', () => {
    newTaskForm.classList.toggle('open');
    if (newTaskForm.classList.contains('open')) ntNameInput.focus();
  });
  ntCancelBtn.addEventListener('click', () => {
    newTaskForm.classList.remove('open');
    ntNameInput.value = '';
    ntPromptInput.value = '';
  });
  ntSaveBtn.addEventListener('click', () => {
    const name = ntNameInput.value.trim();
    const prompt = ntPromptInput.value.trim();
    if (!name || !prompt) {
      if (!name) {
        ntNameInput.style.borderColor = 'var(--agi-ext-danger)';
        setTimeout(() => {
          ntNameInput.style.borderColor = '';
        }, 1500);
      }
      if (!prompt) {
        ntPromptInput.style.borderColor = 'var(--agi-ext-danger)';
        setTimeout(() => {
          ntPromptInput.style.borderColor = '';
        }, 1500);
      }
      return;
    }
    chrome.runtime.sendMessage(
      {
        type: 'CREATE_SCHEDULED_TASK',
        task: {
          name,
          prompt,
          enabled: true,
          scheduleType: ntScheduleSelect.value,
          scheduleValue: '',
        },
      },
      () => {
        if (chrome.runtime.lastError) return;
        ntNameInput.value = '';
        ntPromptInput.value = '';
        newTaskForm.classList.remove('open');
        refreshWorkflowsTasks();
      },
    );
  });

  const groupsSection = el('div', { class: 'sp-wf-section' });
  groupsSection.appendChild(
    (() => {
      const h = el('div', { class: 'sp-wf-section-header' });
      h.appendChild(el('div', { class: 'sp-wf-section-title' }, 'Tab Groups'));
      return h;
    })(),
  );
  groupsSection.appendChild(
    el('div', { class: 'sp-wf-group-desc' }, 'Organize tabs into groups for focused workflows.'),
  );
  const groupBtnsRow = el('div', { class: 'sp-wf-group-btns' });
  const wfGroupAddBtn = el('button', { class: 'sp-wf-group-action-btn' }, '+ Group Tab');
  const wfGroupRemoveBtn = el('button', { class: 'sp-wf-group-action-btn' }, '- Ungroup Tab');
  wfGroupAddBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { type: 'ADD_TAB_TO_GROUP' },
      (resp: { success?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !resp?.success) return;
        wfGroupAddBtn.classList.add('active');
        wfGroupAddBtn.textContent = 'Grouped!';
        setTimeout(() => {
          wfGroupAddBtn.classList.remove('active');
          wfGroupAddBtn.textContent = '+ Group Tab';
        }, 1500);
      },
    );
  });
  wfGroupRemoveBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { type: 'REMOVE_TAB_FROM_GROUP' },
      (resp: { success?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !resp?.success) return;
        wfGroupRemoveBtn.textContent = 'Removed!';
        setTimeout(() => {
          wfGroupRemoveBtn.textContent = '- Ungroup Tab';
        }, 1500);
      },
    );
  });
  groupBtnsRow.appendChild(wfGroupAddBtn);
  groupBtnsRow.appendChild(wfGroupRemoveBtn);
  groupsSection.appendChild(groupBtnsRow);
  workflowsPanel.appendChild(groupsSection);
  document.body.appendChild(workflowsPanel);

  // Computer Use panel — append after workflows; shown/hidden by switchTab()
  document.body.appendChild(cuPanel.panelEl);

  // Wire escalation events from content scripts / background into the panel UI.
  // The background relays 'agi:escalate' CustomEvents as runtime messages.
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;
    if (m['type'] === 'AGI_CU_STEP') {
      const step = m['step'] as Parameters<ComputerUsePanelAPI['appendStep']>[0];
      cuPanel.appendStep(step);
      // Auto-switch to Computer Use tab when the agent starts
      switchTab('computer-use');
    } else if (m['type'] === 'AGI_CU_ESCALATE') {
      const reason = typeof m['reason'] === 'string' ? m['reason'] : 'Fast-path autofill stalled.';
      cuPanel.showHandoffBanner(reason);
      switchTab('computer-use');
    } else if (m['type'] === 'AGI_CU_APPROVE_REQUEST') {
      // Background is asking the panel to show an approval card for an action.
      // The panel resolves the card and replies with AGI_CU_APPROVE_RESPONSE.
      const requestId = typeof m['requestId'] === 'string' ? m['requestId'] : '';
      const toolName = typeof m['toolName'] === 'string' ? m['toolName'] : 'action';
      const description = typeof m['description'] === 'string' ? m['description'] : '';
      switchTab('computer-use');
      cuPanel.showApprovalCard(toolName, description, (allowed: boolean) => {
        void chrome.runtime.sendMessage({
          type: 'AGI_CU_APPROVE_RESPONSE',
          requestId,
          allowed,
        });
      });
    }
  });

  // ── "Run Autofill" button orchestration ───────────────────────────────────
  // Message flow (secure 3-context design):
  //   1. User clicks "Run Autofill" in the Computer Use tab controls bar.
  //   2. Side panel sends AGI_RUN_AUTOFILL to the content script of the
  //      active tab (DOM work only — no CDP).
  //   3. Content script returns { success, platform, autofill, escalation }.
  //   4. If escalation.shouldEscalate, side panel:
  //      a. Shows the handoff banner.
  //      b. Switches to the Computer Use tab.
  //      c. Sends AGI_START_COMPUTER_USE to the BACKGROUND (CDP-capable).
  //   5. Background validates the tab's origin against siteAllowlistCache,
  //      then starts runAgentLoop() and streams AGI_CU_STEP events back.
  cuPanel.onRunAutofill(() => {
    void (async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTabId = activeTab?.id;
      if (!activeTabId) {
        cuPanel.showHandoffBanner('Could not determine the active tab. Please try again.');
        return;
      }

      let resp: Record<string, unknown> | null = null;
      try {
        resp = (await chrome.tabs.sendMessage(activeTabId, {
          type: 'AGI_RUN_AUTOFILL',
        })) as Record<string, unknown> | null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cuPanel.showHandoffBanner(`Autofill failed: ${msg}`);
        return;
      }

      if (!resp || !resp['success']) {
        const errMsg = typeof resp?.['error'] === 'string' ? resp['error'] : 'Autofill failed';
        cuPanel.showHandoffBanner(String(errMsg));
        return;
      }

      const escalation = resp['escalation'] as
        | { shouldEscalate?: boolean; agentGoal?: string; triggers?: unknown[] }
        | undefined;

      if (!escalation?.shouldEscalate) {
        // Fast-path completed cleanly — no agent loop needed.
        cuPanel.showHandoffBanner('Autofill complete. No agent escalation needed.');
        switchTab('computer-use');
        return;
      }

      // Fast-path stalled → hand off to the computer-use agent loop.
      const goal = typeof escalation.agentGoal === 'string' ? escalation.agentGoal : '';
      cuPanel.showHandoffBanner(
        `Fast-path autofill stalled (${String(escalation.triggers?.length ?? 0)} trigger(s)). ` +
          `Switching to computer use…`,
      );
      switchTab('computer-use');

      // Persist the "ask before acting" preference so the background can read it.
      await chrome.storage.local.set({
        agi_cu_ask_before_acting: cuPanel.isAskBeforeActing(),
      });

      // Ask background to start the CDP agent loop.
      void chrome.runtime.sendMessage({
        type: 'AGI_START_COMPUTER_USE',
        goal,
        tabId: activeTabId,
      });
    })();
  });

  const toolbar = el('div', { id: 'sp-toolbar' });

  // Context button is now rendered as a persistent chip in the composer bar (see below).
  // The toolbar slot is intentionally empty for context; the chip is built inside inputArea.

  const micBtn = el('button', { class: 'sp-tool-btn', id: 'sp-mic-btn', title: 'Voice input' });
  micBtn.appendChild(renderIcon(Mic, 16));
  toolbar.appendChild(micBtn);

  const groupBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-group-btn',
    title: 'Add current tab to group',
  });
  groupBtn.appendChild(renderIcon(Folder, 14));
  const groupBtnLabel = document.createTextNode(' Group');
  groupBtn.appendChild(groupBtnLabel);
  let isGrouped = false;
  groupBtn.addEventListener('click', () => {
    const msgType = isGrouped ? 'REMOVE_TAB_FROM_GROUP' : 'ADD_TAB_TO_GROUP';
    chrome.runtime.sendMessage(
      { type: msgType },
      (response: { success?: boolean; grouped?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !response?.success) return;
        isGrouped = response.grouped ?? false;
        groupBtnLabel.textContent = isGrouped ? ' Ungroup' : ' Group';
        groupBtn.classList.toggle('has-context', isGrouped);
      },
    );
  });
  toolbar.appendChild(groupBtn);

  const shortcutsWrapper = el('div', { class: 'sp-shortcuts-wrapper' });
  const shortcutsBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-shortcuts-btn',
    title: 'Saved shortcuts',
  });
  shortcutsBtn.appendChild(renderIcon(Zap, 14));
  shortcutsBtn.appendChild(document.createTextNode(' Shortcuts'));

  const shortcutsDropdown = el('div', { id: 'sp-shortcuts-dropdown' });
  setChild(shortcutsDropdown, {
    tag: 'div',
    className: 'sp-shortcuts-empty',
    text: 'No saved shortcuts',
  });

  shortcutsBtn.addEventListener('click', () => {
    const isOpen = shortcutsDropdown.classList.toggle('open');
    if (isOpen) refreshShortcuts();
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!shortcutsWrapper.contains(e.target as Node)) {
      shortcutsDropdown.classList.remove('open');
    }
  });

  shortcutsWrapper.appendChild(shortcutsDropdown);
  shortcutsWrapper.appendChild(shortcutsBtn);
  toolbar.appendChild(shortcutsWrapper);

  const toolsWrapper = el('div', { class: 'sp-tools-wrapper' });
  const toolsBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-tools-btn',
    title: 'WebMCP tools discovered on this page',
  });
  toolsBtn.appendChild(renderIcon(Plug, 14));
  toolsBtn.appendChild(document.createTextNode(' Tools (0)'));

  const toolsDropdown = el('div', { id: 'sp-tools-dropdown' });
  setChild(toolsDropdown, {
    tag: 'div',
    className: 'sp-tools-empty',
    text: 'No tools discovered on this page',
  });

  toolsBtn.addEventListener('click', () => {
    toolsDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!toolsWrapper.contains(e.target as Node)) {
      toolsDropdown.classList.remove('open');
    }
  });

  toolsWrapper.appendChild(toolsDropdown);
  toolsWrapper.appendChild(toolsBtn);
  toolbar.appendChild(toolsWrapper);

  document.body.appendChild(toolbar);

  const inputArea = el('div', { id: 'sp-input-area' });
  const composerShell = el('div', { id: 'sp-composer-shell' });
  const inputRow = el('div', { id: 'sp-input-row' });

  const inputEl = el('textarea', {
    id: 'sp-input',
    placeholder: 'Type / for commands',
    rows: '1',
  }) as HTMLTextAreaElement;

  inputEl.addEventListener('input', () => autoResizeInput(inputEl));
  inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputEl.value;
      inputEl.value = '';
      autoResizeInput(inputEl);
      sendMessage(text);
    }
  });

  // 2026-05-21 — paste-image support on the textarea. Captures clipboard image
  // items (screenshots, copied images) so users don't have to round-trip
  // through the +menu. Mirrors `packages/unified-chat/ChatInput.tsx` and the
  // VS Code webview composer wire. Image-only kind, single readAsDataURL per
  // file, the existing 8-attachment cap below applies on append.
  inputEl.addEventListener('paste', (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && file.type.startsWith('image/')) pasted.push(file);
      }
    }
    if (pasted.length > 0) {
      e.preventDefault();
      acceptIncomingComposerFiles(pasted);
    }
  });

  const sendBtn = el('button', {
    id: 'sp-send-btn',
    title: 'Send (Cmd+Enter)',
    'data-mode': 'send',
  });
  sendBtn.appendChild(renderIcon(ArrowUp, 16));
  sendBtn.addEventListener('click', () => {
    if (sendBtn.getAttribute('data-mode') === 'stop') {
      // Cancel the active stream
      if (_ctx.currentStreamId) {
        chrome.runtime.sendMessage({ type: 'CANCEL_STREAM', id: _ctx.currentStreamId });
      }
      handleStreamError(_ctx.currentStreamId ?? 'cancelled', 'Cancelled.');
      return;
    }
    const text = inputEl.value;
    inputEl.value = '';
    autoResizeInput(inputEl);
    sendMessage(text);
  });

  // + attachment button and 2-item popup menu
  const attachWrapper = el('div', { class: 'sp-attach-wrapper' });

  const attachBtn = el('button', {
    class: 'sp-attach-btn',
    id: 'sp-attach-btn',
    title: 'Add attachment',
  });
  setText(attachBtn, '+');

  const attachMenu = el('div', { id: 'sp-attach-menu' });

  const screenshotItem = el('div', { class: 'sp-attach-menu-item' });
  screenshotItem.appendChild(renderIcon(Camera, 16));
  screenshotItem.appendChild(document.createTextNode('Take a screenshot'));
  screenshotItem.addEventListener('click', () => {
    attachMenu.classList.remove('open');
    chrome.runtime.sendMessage(
      { type: 'CAPTURE_SCREENSHOT', format: 'png', quality: 90 },
      (resp: { success?: boolean; data?: string } | undefined) => {
        if (chrome.runtime.lastError || !resp?.success || !resp.data) return;
        pendingAttachments.push(resp.data);
        updateAttachmentPreview();
      },
    );
  });

  const fileItem = el('div', { class: 'sp-attach-menu-item' });
  fileItem.appendChild(renderIcon(FileImage, 16));
  fileItem.appendChild(document.createTextNode('Add an image'));
  const fileInput = el('input', {
    type: 'file',
    accept: 'image/*',
    class: 'sp-attach-file-input',
    id: 'sp-attach-file-input',
  }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        pendingAttachments.push(result);
        updateAttachmentPreview();
      }
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });
  fileItem.addEventListener('click', () => {
    attachMenu.classList.remove('open');
    fileInput.click();
  });

  attachMenu.appendChild(screenshotItem);
  attachMenu.appendChild(fileItem);
  attachWrapper.appendChild(attachMenu);
  attachWrapper.appendChild(attachBtn);
  attachWrapper.appendChild(fileInput);

  attachBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    attachMenu.classList.toggle('open');
  });
  document.addEventListener('click', (e: MouseEvent) => {
    if (!attachWrapper.contains(e.target as Node)) {
      attachMenu.classList.remove('open');
    }
  });

  // Attachment preview bar (hidden until an attachment is added)
  const attachmentBar = el('div', { id: 'sp-attachment-bar' });
  attachmentBar.style.display = 'none';

  inputRow.appendChild(attachWrapper);
  inputRow.appendChild(inputEl);
  inputRow.appendChild(sendBtn);

  composerShell.appendChild(inputRow);

  // Persistent page-context chip in the composer bottom bar
  const composerBar = el('div', { id: 'sp-composer-bar' });
  contextBtn = el('button', {
    class: 'sp-context-chip',
    id: 'sp-context-chip',
    title: 'Attach page content to next message',
  });
  contextBtn.textContent = currentPageHostname || 'page';
  contextBtn.addEventListener('click', async () => {
    if (_ctx.pendingPageContext) {
      _ctx.pendingPageContext = null;
      updateContextButton();
      return;
    }
    const chip = contextBtn!;
    const prevText = chip.textContent ?? '';
    chip.textContent = 'capturing…';
    chip.classList.add('loading');
    chip.disabled = true;
    const ctx = await capturePageContext();
    chip.disabled = false;
    chip.classList.remove('loading');
    if (ctx) {
      _ctx.pendingPageContext = ctx;
    } else {
      chip.textContent = prevText;
    }
    updateContextButton();
  });
  composerBar.appendChild(contextBtn);

  // BLOCKER-01: autonomy toggle — persists to agi_action_mode in chrome.storage.local
  const actionModeToggle = el('button', {
    id: 'sp-action-mode-toggle',
    title: 'Toggle automation permission mode',
    'data-mode': 'ask',
  });
  actionModeToggle.textContent = 'Ask before acting';
  chrome.storage.local.get({ agi_action_mode: 'ask' }, (items) => {
    const stored = items['agi_action_mode'];
    const mode = stored === 'ask' || stored === 'act' ? stored : 'ask';
    actionModeToggle.setAttribute('data-mode', mode);
    actionModeToggle.textContent = mode === 'act' ? 'Act without asking' : 'Ask before acting';
  });
  actionModeToggle.addEventListener('click', () => {
    const current = actionModeToggle.getAttribute('data-mode') as 'ask' | 'act';
    const next = current === 'ask' ? 'act' : 'ask';
    actionModeToggle.setAttribute('data-mode', next);
    actionModeToggle.textContent = next === 'act' ? 'Act without asking' : 'Ask before acting';
    chrome.runtime
      .sendMessage({ type: 'SET_ACTION_MODE', mode: next })
      .catch((err: unknown) => console.warn('[SidePanel] Failed to set action mode:', err));
  });
  composerBar.appendChild(actionModeToggle);

  // W5-06: quick mode toggle — overrides model with fast-status slot for low-latency replies
  const quickModeToggle = el('button', {
    id: 'sp-quick-mode-toggle',
    title: 'Quick mode: use fast model for low-latency replies',
    'data-active': 'false',
  });
  quickModeToggle.textContent = 'Quick';
  chrome.storage.local.get({ agi_quick_mode: false }, (items) => {
    const active = items['agi_quick_mode'] === true;
    quickModeToggle.setAttribute('data-active', active ? 'true' : 'false');
    quickModeToggle.classList.toggle('sp-quick-mode-active', active);
  });
  quickModeToggle.addEventListener('click', () => {
    const current = quickModeToggle.getAttribute('data-active') === 'true';
    const next = !current;
    quickModeToggle.setAttribute('data-active', next ? 'true' : 'false');
    quickModeToggle.classList.toggle('sp-quick-mode-active', next);
    chrome.runtime
      .sendMessage({ type: 'SET_QUICK_MODE', enabled: next })
      .catch((err: unknown) => console.warn('[SidePanel] Failed to set quick mode:', err));
  });
  composerBar.appendChild(quickModeToggle);

  const promptChipsRow = el('div', { id: 'sp-prompt-chips' });
  for (const cmd of ['/summarize', '/explain', '/extract', '/code']) {
    const chip = el('span', { class: 'sp-cmd-chip' }, cmd);
    chip.addEventListener('click', () => sendMessage(cmd));
    promptChipsRow.appendChild(chip);
  }

  composerShell.appendChild(composerBar);

  // Bridge-offline notice — shown at the top of the input area when the
  // desktop bridge is not connected. Includes a reconnect button that
  // triggers the same flow as the popup's manual reconnect.
  const bridgeNotice = el('div', { id: 'sp-bridge-notice' });
  const bridgeNoticeDot = el('span', { id: 'sp-bridge-notice-dot' });
  const bridgeNoticeText = el('span', { id: 'sp-bridge-notice-text' }, 'Desktop not connected');
  const bridgeNoticeReconnect = el(
    'button',
    { id: 'sp-bridge-notice-reconnect', type: 'button' },
    'Reconnect',
  );
  bridgeNoticeReconnect.addEventListener('click', () => {
    chrome.runtime
      .sendMessage({ type: 'RECONNECT_NATIVE' })
      .catch((err: unknown) => console.warn('[SidePanel] RECONNECT_NATIVE failed:', err));
  });
  bridgeNotice.appendChild(bridgeNoticeDot);
  bridgeNotice.appendChild(bridgeNoticeText);
  bridgeNotice.appendChild(bridgeNoticeReconnect);

  inputArea.appendChild(bridgeNotice);
  inputArea.appendChild(attachmentBar);
  inputArea.appendChild(composerShell);
  inputArea.appendChild(promptChipsRow);
  document.body.appendChild(inputArea);

  // First-run onboarding carousel overlay — built hidden; revealed after the
  // async agi_onboarding_completed storage check in the boot Promise.all.
  // Callback re-runs probeBridgeStatus() so the correct post-onboarding state
  // (offline or connected) is shown as soon as the carousel is dismissed.
  buildOnboardingOverlay(() => {
    void probeBridgeStatus();
  });

  // 2026-05-21 — drag-drop image attachments onto the composer. Highlights
  // the shell while a Files drag is in flight; on drop we route through
  // acceptIncomingComposerFiles which handles size cap, image-only filter,
  // and the 8-attachment ceiling. Matches the VS Code webview behaviour
  // shipped in this same session.
  composerShell.addEventListener('dragover', (event: DragEvent) => {
    const types = event.dataTransfer?.types;
    if (!types) return;
    let hasFile = false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'Files') {
        hasFile = true;
        break;
      }
    }
    if (!hasFile) return;
    event.preventDefault();
    composerShell.classList.add('dragover');
  });
  composerShell.addEventListener('dragleave', (event: DragEvent) => {
    const relatedNode = event.relatedTarget as Node | null;
    if (relatedNode && composerShell.contains(relatedNode)) return;
    composerShell.classList.remove('dragover');
  });
  composerShell.addEventListener('drop', (event: DragEvent) => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    composerShell.classList.remove('dragover');
    acceptIncomingComposerFiles(event.dataTransfer.files);
  });

  setupVoiceInput(micBtn, inputEl, autoResizeInput);
  renderMessages();

  // Claude-style front door: default to Chat. The panel is now the extension's
  // primary surface (opened on toolbar click), so it must read as a chat first.
  // Computer-Use still auto-activates when a CU event actually arrives.
  switchTab('chat');
}

function refreshConsoleLogs(): void {
  chrome.runtime.sendMessage(
    { type: 'GET_CONSOLE_LOGS' },
    (
      response:
        | { success?: boolean; logs?: Array<{ level: string; message: string; timestamp: number }> }
        | undefined,
    ) => {
      if (chrome.runtime.lastError || !response?.success) return;
      const entries = document.querySelector('.sp-console-entries');
      if (!entries) return;
      clearChildren(entries);
      const logs = response.logs ?? [];
      if (logs.length === 0) {
        const noLogs = createElementWith({ tag: 'div', text: 'No console logs captured' });
        noLogs.style.padding = '10px 8px';
        noLogs.style.color = 'var(--agi-ext-text-muted)';
        noLogs.style.fontSize = '11px';
        noLogs.style.textAlign = 'center';
        entries.appendChild(noLogs);
        return;
      }
      for (const log of logs) {
        const entry = el('div', { class: `sp-console-entry sp-console-${log.level}` });
        const time = new Date(log.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        entry.appendChild(el('span', { class: 'sp-console-time' }, time));
        entry.appendChild(document.createTextNode(log.message));
        entries.appendChild(entry);
      }
      const panel = document.getElementById('sp-console-panel');
      if (panel) panel.scrollTop = panel.scrollHeight;
    },
  );
}

function refreshShortcuts(): void {
  chrome.runtime.sendMessage(
    { type: 'LIST_SHORTCUTS' },
    (
      response:
        | {
            success?: boolean;
            shortcuts?: Array<{ id: string; name: string; actions: unknown[]; createdAt: number }>;
          }
        | undefined,
    ) => {
      if (chrome.runtime.lastError || !response?.success) return;
      const dropdown = document.getElementById('sp-shortcuts-dropdown');
      if (!dropdown) return;
      clearChildren(dropdown);
      const shortcuts = response.shortcuts ?? [];
      if (shortcuts.length === 0) {
        setChild(dropdown, {
          tag: 'div',
          className: 'sp-shortcuts-empty',
          text: 'No saved shortcuts',
        });
      } else {
        for (const sc of shortcuts) {
          const item = el('div', { class: 'sp-shortcut-item' });
          item.appendChild(el('span', { class: 'sp-shortcut-name' }, sc.name));
          const actions = el('div', { class: 'sp-shortcut-actions' });
          const playBtn = el('button', { class: 'sp-shortcut-action-btn', title: 'Replay' }, '▶');
          playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'REPLAY_SHORTCUT', shortcutId: sc.id }, () => {});
            dropdown.classList.remove('open');
          });
          const delBtn = el('button', { class: 'sp-shortcut-action-btn', title: 'Delete' }, '✕');
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'DELETE_SHORTCUT', shortcutId: sc.id }, () => {
              if (!chrome.runtime.lastError) refreshShortcuts();
            });
          });
          actions.appendChild(playBtn);
          actions.appendChild(delBtn);
          item.appendChild(actions);
          dropdown.appendChild(item);
        }
      }

      const saveRow = el('div', { class: 'sp-save-shortcut-row' });
      const nameInput = el('input', {
        class: 'sp-save-shortcut-input',
        placeholder: 'Name this shortcut…',
      }) as HTMLInputElement;
      const saveBtn = el('button', { class: 'sp-save-shortcut-btn' }, 'Save Recording');
      saveBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) return;
        // Get recorded actions from content script
        chrome.runtime.sendMessage(
          { type: 'GET_RECORDED_ACTIONS' },
          (recResponse: { success?: boolean; actions?: unknown[] } | undefined) => {
            if (chrome.runtime.lastError || !recResponse?.success) return;
            const recActions = recResponse.actions ?? [];
            if (recActions.length === 0) return;
            chrome.runtime.sendMessage(
              {
                type: 'SAVE_SHORTCUT',
                name,
                actions: recActions,
              },
              () => {
                if (!chrome.runtime.lastError) {
                  nameInput.value = '';
                  refreshShortcuts();
                }
              },
            );
          },
        );
      });
      saveRow.appendChild(nameInput);
      saveRow.appendChild(saveBtn);
      dropdown.appendChild(saveRow);
    },
  );
}

function refreshWorkflowsShortcuts(): void {
  chrome.runtime.sendMessage(
    { type: 'LIST_SHORTCUTS' },
    (
      response:
        | {
            success?: boolean;
            shortcuts?: Array<{
              id: string;
              name: string;
              actions: unknown[];
              createdAt: number;
              prompt?: string;
              startUrl?: string;
              scheduled?: boolean;
            }>;
          }
        | undefined,
    ) => {
      if (chrome.runtime.lastError || !response?.success) return;
      const list = document.getElementById('sp-wf-shortcuts-list');
      const countBadge = document.getElementById('sp-wf-shortcuts-count');
      if (!list) return;
      clearChildren(list);
      const shortcuts = response.shortcuts ?? [];
      if (countBadge) countBadge.textContent = String(shortcuts.length);
      if (shortcuts.length === 0) {
        setChild(list, {
          tag: 'div',
          className: 'sp-wf-empty',
          text: 'Record your first workflow or create a prompt shortcut',
        });
        return;
      }
      for (const sc of shortcuts) {
        const item = el('div', { class: 'sp-wf-shortcut-item' });
        const isPromptBased = sc.prompt && Array.isArray(sc.actions) && sc.actions.length === 0;
        const shortcutIcon = el('div', { class: 'sp-wf-shortcut-icon' });
        if (isPromptBased) {
          shortcutIcon.textContent = '/';
        } else {
          shortcutIcon.appendChild(renderIcon(Zap, 14));
        }
        item.appendChild(shortcutIcon);
        const info = el('div', { class: 'sp-wf-shortcut-info' });
        info.appendChild(el('div', { class: 'sp-wf-shortcut-name' }, sc.name));
        const actionsCount = Array.isArray(sc.actions) ? sc.actions.length : 0;
        const dateStr = new Date(sc.createdAt).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        });
        const metaText = isPromptBased
          ? `prompt shortcut${sc.scheduled ? ' · scheduled' : ''} · ${dateStr}`
          : `${actionsCount} actions · ${dateStr}`;
        info.appendChild(el('div', { class: 'sp-wf-shortcut-meta' }, metaText));
        item.appendChild(info);
        const btns = el('div', { class: 'sp-wf-shortcut-btns' });
        const playBtn = el(
          'button',
          { class: 'sp-wf-btn-replay', title: 'Replay workflow' },
          '▶ Play',
        );
        playBtn.addEventListener('click', () => {
          playBtn.textContent = '...';
          (playBtn as HTMLButtonElement).disabled = true;
          chrome.runtime.sendMessage({ type: 'REPLAY_SHORTCUT', shortcutId: sc.id }, () => {
            playBtn.textContent = '▶ Play';
            (playBtn as HTMLButtonElement).disabled = false;
          });
        });
        btns.appendChild(playBtn);
        const delBtn = el('button', { class: 'sp-wf-btn-delete', title: 'Delete' }, '✕');
        delBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'DELETE_SHORTCUT', shortcutId: sc.id }, () => {
            if (!chrome.runtime.lastError) refreshWorkflowsShortcuts();
          });
        });
        btns.appendChild(delBtn);
        item.appendChild(btns);
        list.appendChild(item);
      }
    },
  );
}

function refreshWorkflowsTasks(): void {
  chrome.runtime.sendMessage(
    { type: 'LIST_SCHEDULED_TASKS' },
    (
      response:
        | {
            success?: boolean;
            tasks?: Array<{
              id: string;
              name: string;
              enabled: boolean;
              scheduleType: string;
              scheduleValue: string;
              lastRun?: number;
            }>;
          }
        | undefined,
    ) => {
      if (chrome.runtime.lastError || !response?.success) return;
      const list = document.getElementById('sp-wf-tasks-list');
      const countBadge = document.getElementById('sp-wf-tasks-count');
      if (!list) return;
      clearChildren(list);
      const tasks = response.tasks ?? [];
      if (countBadge) countBadge.textContent = String(tasks.length);
      if (tasks.length === 0) {
        setChild(list, { tag: 'div', className: 'sp-wf-empty', text: 'No scheduled tasks' });
        return;
      }
      for (const task of tasks) {
        const item = el('div', { class: 'sp-wf-task-item' });
        const toggle = el('input', {
          type: 'checkbox',
          class: 'sp-wf-task-toggle',
        }) as HTMLInputElement;
        toggle.checked = task.enabled;
        toggle.addEventListener('change', () => {
          const previousState = !toggle.checked;
          chrome.runtime.sendMessage(
            {
              type: 'UPDATE_SCHEDULED_TASK',
              taskId: task.id,
              updates: { enabled: toggle.checked },
            },
            (resp: { success?: boolean } | undefined) => {
              if (chrome.runtime.lastError || !resp?.success) {
                toggle.checked = previousState;
              }
            },
          );
        });
        item.appendChild(toggle);
        const info = el('div', { class: 'sp-wf-task-info' });
        info.appendChild(el('div', { class: 'sp-wf-task-name' }, task.name));
        info.appendChild(el('span', { class: 'sp-wf-task-schedule-badge' }, task.scheduleType));
        item.appendChild(info);
        const delBtn = el('button', { class: 'sp-wf-task-delete', title: 'Delete task' }, '✕');
        delBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'DELETE_SCHEDULED_TASK', taskId: task.id }, () => {
            if (!chrome.runtime.lastError) refreshWorkflowsTasks();
          });
        });
        item.appendChild(delBtn);
        list.appendChild(item);
      }
    },
  );
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const envelope = msg as { type: string };

  if (envelope.type === 'WEBMCP_TOOLS_CHANGED') {
    const toolsMsg = msg as { tools: WebMCPToolEntry[] };
    discoveredTools = (toolsMsg.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
    }));
    updateToolsButton();
    return;
  }

  // BLOCKER-02: inline permission card
  if (envelope.type === 'PERMISSION_REQUIRED') {
    const permMsg = msg as { requestId: string; domain: string; actionDescription: string };
    renderPermissionCard(permMsg.requestId, permMsg.domain, permMsg.actionDescription);
    return;
  }

  // Cloud free-trial quota refresh — background emits this after each streamed
  // response so the quota bar and header badge stay current without a full page
  // reload.
  if (envelope.type === 'FREE_PROMPTS_UPDATED') {
    void refreshCloudAccountUI();
    return;
  }

  // Live connection-status updates from the background service worker.
  // Background now also broadcasts these via chrome.runtime.sendMessage so
  // extension views (side panel, popup) receive them — not just content scripts.
  if (envelope.type === 'CONNECTION_STATUS_CHANGED') {
    const statusMsg = msg as { connected?: boolean; status?: string };
    const nowConnected = statusMsg.connected === true;
    if (nowConnected !== _ctx.isConnected) {
      _ctx.isConnected = nowConnected;
      updateConnectionStatus();
      if (nowConnected) {
        chrome.storage.local.set({ agi_ever_connected: true }).catch(() => {});
        setOfflineOnboardingVisible(false);
      }
    }
    return;
  }

  const chunk = msg as ChatChunk;
  if (chunk.type !== 'CHAT_CHUNK') return;
  if (chunk.id !== _ctx.currentStreamId) return;

  if (chunk.error) {
    // Cloud free-trial sentinels: show actionable UI instead of a generic error
    // bubble.  The background sets these when the gateway returns a 403 quota
    // response or a 401 auth failure so we can guide the user to upgrade/sign-in
    // rather than surfacing a confusing "request failed" message.
    if (chunk.error === '__QUOTA_EXCEEDED__') {
      // Snap the local counter so the quota bar shows 0 immediately, then open
      // the upgrade row in the cloud section without a full drawer toggle.
      void refreshCloudAccountUI();
      // Remove the thinking bubble if still present.
      removeThinking();
      _ctx.isStreaming = false;
      _ctx.currentStreamId = null;
      updateSendButton();
      // Show an inline assistant bubble explaining the limit, pointing user to drawer.
      const limitMsg: ChatMessage = {
        id: chunk.id,
        role: 'assistant',
        content:
          "You've used all 3 free cloud prompts. Open the **AGI Cloud** section in the drawer to upgrade or enter an invite code.",
        error: true,
        timestamp: Date.now(),
      };
      if (!_ctx.messages.find((m) => m.id === chunk.id)) {
        _ctx.messages.push(limitMsg);
      }
      renderMessages();
      return;
    }
    if (chunk.error === '__AUTH_REQUIRED__') {
      removeThinking();
      _ctx.isStreaming = false;
      _ctx.currentStreamId = null;
      updateSendButton();
      void refreshCloudAccountUI();
      const authMsg: ChatMessage = {
        id: chunk.id,
        role: 'assistant',
        content:
          'Sign in to AGI Cloud to send messages. Open the **AGI Cloud** section in the drawer.',
        error: true,
        timestamp: Date.now(),
      };
      if (!_ctx.messages.find((m) => m.id === chunk.id)) {
        _ctx.messages.push(authMsg);
      }
      renderMessages();
      return;
    }
    handleStreamError(chunk.id, chunk.error);
    return;
  }

  if (!_ctx.messages.find((m) => m.id === chunk.id)) {
    removeThinking();
    const assistantMsg: ChatMessage = {
      id: chunk.id,
      role: 'assistant',
      content: chunk.text,
      streaming: true,
      timestamp: Date.now(),
    };
    _ctx.messages.push(assistantMsg);
    renderMessages();
  } else {
    const existing = _ctx.messages.find((m) => m.id === chunk.id)!;
    existing.content += chunk.text;
    updateStreamingBubble(chunk.id, existing.content, chunk.done);
  }

  if (chunk.done) {
    if (_ctx.streamTimeoutHandle) {
      clearTimeout(_ctx.streamTimeoutHandle);
      _ctx.streamTimeoutHandle = null;
    }
    const existing = _ctx.messages.find((m) => m.id === chunk.id);
    if (existing) {
      existing.streaming = false;
    }
    removeThinking();
    _ctx.isStreaming = false;
    _ctx.currentStreamId = null;
    updateSendButton();
    saveMessages();
    renderMessages();
  }
});

injectStyles();
buildUI();
// Populate hostname chip as soon as UI is available
refreshPageHostname();

// ── First-run onboarding gate ─────────────────────────────────────────────
// isOnboardingComplete() reads agi_onboarding_completed from chrome.storage.local
// (defined in features/side-panel/onboarding.ts and covered by unit tests).
// We check it BEFORE probing bridge status so we don't surface the offline-
// onboarding screen underneath the carousel (double-overlay bug).
// probeBridgeStatus() is called by the carousel's onComplete callback; and
// also in the returning-user branch below.
// The storage key literal lives only in features/side-panel/onboarding.ts;
// isOnboardingComplete() encapsulates the read so the key is a single source
// of truth shared with the unit tests.
void (async () => {
  const onboardingDone = await isOnboardingComplete();
  if (!onboardingDone) {
    showOnboardingOverlay();
    // Defer bridge status until onboarding carousel is dismissed.
    // probeBridgeStatus() is invoked by the onComplete callback in buildUI().
    loadMessages()
      .then(() => {
        if (_ctx.messages.length > 0) renderMessages();
      })
      .catch(() => {});
    return;
  }
  // Onboarding already complete — normal boot.
  Promise.all([
    loadMessages().then(() => {
      if (_ctx.messages.length > 0) {
        renderMessages();
      }
    }),
    // Probe bridge status on init — updates connection pill if desktop is running
    probeBridgeStatus(),
  ])
    .then(() => {
      // Check for pending chat from context menu (selection, summarize, explain, translate)
      checkPendingChat();
    })
    .catch((err) => {
      // Boot errors must not surface to the user, but log for debugging.
      console.error('[SidePanel] Boot initialization failed:', err);
    });
})();

async function probeBridgeStatus(): Promise<void> {
  // Ask the background service worker for the live native-connection status.
  // This is the only authoritative source: the desktop `:8787` server only
  // serves `POST /pair` and WebSocket upgrades — a direct HTTP GET to
  // `/v1/status` always fails (404 or ECONNREFUSED), so the side panel used
  // to permanently show "Offline" even when the desktop app was running.
  //
  // GET_CONNECTION_STATUS also triggers a fresh native ping in background
  // (background.ts:1033) so the status it returns is up-to-date.
  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'GET_CONNECTION_STATUS',
    })) as { success?: boolean; nativeConnected?: boolean; connectionStatus?: string } | undefined;

    const connected = result?.nativeConnected === true;
    if (connected !== _ctx.isConnected) {
      _ctx.isConnected = connected;
      updateConnectionStatus();
    }
    if (connected) {
      // Mark ever-connected so the onboarding screen is not shown on future
      // opens even if the desktop is temporarily closed.
      chrome.storage.local.set({ agi_ever_connected: true }).catch(() => {});
      setOfflineOnboardingVisible(false);
    } else {
      // BLOCKER-02b: not connected. Show offline onboarding on first use.
      chrome.storage.local.get({ agi_ever_connected: false }, (items) => {
        if (!items['agi_ever_connected']) {
          setOfflineOnboardingVisible(true);
        }
      });
    }
  } catch {
    // Background not available (e.g. service worker restarting) — show
    // onboarding only on first use; otherwise leave current state unchanged.
    chrome.storage.local.get({ agi_ever_connected: false }, (items) => {
      if (!items['agi_ever_connected']) {
        setOfflineOnboardingVisible(true);
      }
    });
  }
}

function checkPendingChat(): void {
  chrome.storage.session.get('agi_pending_chat', (result) => {
    if (chrome.runtime.lastError) return;
    const pending = result['agi_pending_chat'] as
      | { type: string; text: string; url: string; timestamp: number }
      | undefined;
    if (!pending || Date.now() - pending.timestamp > 30_000) return;

    // Clear immediately so it doesn't re-fire
    chrome.storage.session.remove('agi_pending_chat').catch(() => {});

    let prompt = '';
    switch (pending.type) {
      case 'ask':
        prompt = pending.text;
        break;
      case 'explain':
        prompt = `Explain the following:\n\n"${pending.text}"`;
        break;
      case 'translate':
        prompt = `Translate the following to English (or if already English, to Spanish):\n\n"${pending.text}"`;
        break;
      case 'summarize':
        // Auto-capture page context then send
        capturePageContext()
          .then((ctx) => {
            if (ctx) _ctx.pendingPageContext = ctx;
            sendMessage(
              'Summarize this page concisely. Include key points, main arguments, and any important details.',
            );
          })
          .catch((err) => {
            console.error('[SidePanel] Failed to capture page context for summarize:', err);
          });
        return;
      default:
        return;
    }

    if (prompt) {
      sendMessage(prompt);
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes['agi_pending_chat']?.newValue) {
    checkPendingChat();
  }
});
