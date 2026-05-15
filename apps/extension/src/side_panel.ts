import { QueueFullError } from '@agiworkforce/runtime';
import {
  getCoreManualModelOptions,
  normalizeModelId,
  PROVIDER_DISPLAY,
  CAPABILITY_LABEL,
  type ProviderId,
  type CapabilityTier,
} from '@agiworkforce/types';
import { getExtensionSendQueue } from './sendQueue';
import { clearChildren, setText, createElementWith, setChild } from './dom-helpers';
import {
  saveConversation,
  listConversations,
  deleteConversation,
  type HistoryMessage,
  type ConversationEntry,
} from './conversation-history';
import { sanitizeHtml, renderMarkdown } from './side_panel/markdown';
import { setupVoiceInput } from './side_panel/voice';

const extensionSendQueue = getExtensionSendQueue();

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
  currentApiKey: string | null;
  isConnected: boolean;
  /**
   * Whether extended thinking is enabled for the next outgoing message.
   * Persisted to chrome.storage.local as 'agi_thinking_enabled'.
   * The value is forwarded to the desktop bridge as `extended_thinking: true` in
   * the CHAT_MESSAGE payload. The bridge handles the provider-specific mapping.
   * TODO(Phase 3 bridge): wire the desktop bridge to consume `extendedThinking`
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
    currentApiKey: null,
    isConnected: false,
    thinkingEnabled: false,
  };
}

const _ctx: SharedSidePanelContext = createSharedSidePanelContext();

/**
 * Capability tier mapping for model-picker sub-labels.
 * Keys are canonical model IDs as stored in models.json / MANUAL_OVERRIDE_MODEL_IDS.
 * Mirrors the quality-tier data from the model catalog, expressed as the
 * three-tier vocabulary the design system uses in every picker.
 */
/* eslint-disable no-restricted-syntax -- FIXME: P1-CHROMEEXT-MODELID-MIGRATION: lookup-table mirror of models.json fields used for UI sub-labels. Migrate to derive from `getModelCatalog()` once it exposes capability+provider tiers per model. Tracked as Phase D follow-up. */
const MODEL_CAPABILITY: Record<string, CapabilityTier> = {
  // Anthropic
  'claude-opus-4.6': 'most-capable',
  'claude-opus-4-7': 'most-capable',
  'claude-sonnet-4.6': 'balanced',
  'claude-sonnet-4-6': 'balanced',
  'claude-haiku-4.5': 'fastest',
  'claude-haiku-4-5': 'fastest',
  // OpenAI
  'gpt-5.4-pro': 'most-capable',
  'gpt-5.4': 'most-capable',
  'gpt-5.4-mini': 'balanced',
  'gpt-5.4-codex': 'balanced',
  'gpt-5.4-codex-medium': 'balanced',
  // Google
  'gemini-3.1-pro-preview': 'balanced',
  'gemini-3.1-flash-lite': 'fastest',
  // DeepSeek
  'deepseek-chat': 'balanced',
  'deepseek-reasoner': 'most-capable',
  'deepseek-r1': 'most-capable',
  // Qwen
  'qwen-max': 'balanced',
  // Moonshot
  'kimi-k2.5-thinking': 'most-capable',
  // Zhipu
  'glm-4.7': 'balanced',
  // xAI
  'grok-4': 'most-capable',
  // Perplexity
  'sonar-pro': 'most-capable',
  // Mistral
  'mistral-large-3': 'balanced',
};

/**
 * Maps each canonical model ID to its provider identifier.
 * Used to group models in the picker and resolve provider logos.
 */
const MODEL_PROVIDER: Record<string, ProviderId> = {
  // Anthropic
  'claude-opus-4.6': 'anthropic',
  'claude-opus-4-7': 'anthropic',
  'claude-sonnet-4.6': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-haiku-4.5': 'anthropic',
  'claude-haiku-4-5': 'anthropic',
  // OpenAI
  'gpt-5.4-pro': 'openai',
  'gpt-5.4': 'openai',
  'gpt-5.4-mini': 'openai',
  'gpt-5.4-codex': 'openai',
  'gpt-5.4-codex-medium': 'openai',
  // Google
  'gemini-3.1-pro-preview': 'google',
  'gemini-3.1-flash-lite': 'google',
  // DeepSeek
  'deepseek-chat': 'deepseek',
  'deepseek-reasoner': 'deepseek',
  'deepseek-r1': 'deepseek',
  // Qwen
  'qwen-max': 'qwen',
  // Moonshot
  'kimi-k2.5-thinking': 'moonshot',
  // Zhipu
  'glm-4.7': 'zhipu',
  // xAI
  'grok-4': 'xai',
  // Perplexity
  'sonar-pro': 'perplexity',
  // Mistral
  'mistral-large-3': 'mistral' as ProviderId,
};

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
    provider: MODEL_PROVIDER[option.id] as ProviderId | undefined,
    capability: MODEL_CAPABILITY[option.id] as CapabilityTier | undefined,
  })),
];

const SIDE_PANEL_MODEL_BADGES: Record<string, string> = {
  auto: 'Best (auto)',
  'claude-sonnet-4.6': 'Sonnet 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-opus-4.6': 'Opus 4.6',
  'claude-opus-4-7': 'Opus 4.7',
  'claude-haiku-4.5': 'Haiku 4.5',
  'claude-haiku-4-5': 'Haiku 4.5',
  'gpt-5.4-pro': 'GPT-5.4 Pro',
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'deepseek-r1': 'DeepSeek R1',
  'deepseek-chat': 'DeepSeek',
  'deepseek-reasoner': 'DeepSeek R1',
  'sonar-pro': 'Sonar Pro',
  'grok-4': 'Grok 4',
  'mistral-large-3': 'Mistral',
};
/* eslint-enable no-restricted-syntax */

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

type SidePanelTab = 'chat' | 'workflows';

const STORAGE_KEY = 'agi_side_panel_messages';
const MAX_STORED_MESSAGES = 50;
const API_KEY_STORAGE_KEY = 'agi_api_key';

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

function saveApiKey(key: string): void {
  chrome.storage.session.set({ [API_KEY_STORAGE_KEY]: key }).catch((_err: unknown) => {
    // CRIT-004: Do NOT fall back to chrome.storage.local for credentials.
    // Credentials must not persist across browser sessions in plaintext storage.
    console.error('[AGI] Session storage unavailable; API key not saved');
  });
}

/**
 * Load the API key from chrome.storage.session.
 * Migrates from chrome.storage.local if a legacy key is found there.
 * Returns null if not set.
 */
// Guard to prevent concurrent API key migrations from racing.
let _apiKeyMigrationPromise: Promise<string | null> | null = null;

async function loadApiKey(): Promise<string | null> {
  if (_apiKeyMigrationPromise) return _apiKeyMigrationPromise;
  _apiKeyMigrationPromise = loadApiKeyInternal();
  try {
    return await _apiKeyMigrationPromise;
  } finally {
    _apiKeyMigrationPromise = null;
  }
}

function loadApiKeyInternal(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.session.get(API_KEY_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const sessionKey = result[API_KEY_STORAGE_KEY] as string | undefined;
      if (sessionKey && sessionKey.trim()) {
        resolve(sessionKey.trim());
        return;
      }
      // Fallback: check local storage for a key saved by an older version.
      chrome.storage.local.get(API_KEY_STORAGE_KEY, (localResult) => {
        const localKey = localResult[API_KEY_STORAGE_KEY] as string | undefined;
        if (localKey && localKey.trim()) {
          // Migrate to session storage and remove from local storage.
          chrome.storage.session.set({ [API_KEY_STORAGE_KEY]: localKey.trim() }).catch(() => {});
          chrome.storage.local.remove(API_KEY_STORAGE_KEY).catch(() => {});
          resolve(localKey.trim());
        } else {
          resolve(null);
        }
      });
    });
  });
}

function clearStoredApiKey(): void {
  chrome.storage.session.remove(API_KEY_STORAGE_KEY).catch(() => {});
  chrome.storage.local.remove(API_KEY_STORAGE_KEY).catch(() => {
    // Ignore storage errors.
  });
}

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    /* ── AGI design tokens (dark) ── */
    :root {
      --agi-ext-accent: #21808d;
      --agi-ext-accent-secondary: #da7756;
      --agi-ext-focus: #21808d;
      --agi-ext-on-accent: #ffffff;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f14;
      color: #e2e8f0;
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
      background: #13131a;
      border-bottom: 1px solid #1e1e2e;
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
      width: 26px;
      height: 26px;
      background: linear-gradient(135deg, var(--agi-ext-accent), var(--agi-ext-accent-secondary));
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
    }
    #sp-title {
      font-size: 13px;
      font-weight: 600;
      color: #f1f5f9;
      white-space: nowrap;
    }
    #sp-model-badge {
      font-size: 10px;
      color: var(--agi-ext-accent);
      background: rgba(33, 128, 141, 0.12);
      border: 1px solid rgba(33, 128, 141, 0.3);
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
      color: #64748b;
      border-radius: 5px;
      padding: 4px 6px;
      font-size: 13px;
      line-height: 1;
      transition: color 0.15s, background 0.15s;
    }
    .sp-icon-btn:hover { color: #e2e8f0; background: #1e1e2e; }

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
    #sp-messages::-webkit-scrollbar-thumb { background: #1e2030; border-radius: 4px; }

    /* ── Empty state (hidden; chips live in composer bar) ── */
    #sp-empty { display: none; }

    /* ── Inline prompt chips under the composer ── */
    #sp-prompt-chips {
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      overflow: hidden;
      padding: 4px 0 0;
    }
    #sp-prompt-chips.hidden { display: none; }
    .sp-cmd-chip { display: inline-block; padding: 3px 10px; font-size: 11px; font-family: 'SF Mono', Monaco, monospace; background: rgba(33, 128, 141, 0.1); color: var(--agi-ext-accent); border-radius: 12px; cursor: pointer; transition: background 0.15s; border: 1px solid rgba(33, 128, 141, 0.25); white-space: nowrap; flex-shrink: 0; }
    .sp-cmd-chip:hover { background: #334155; color: #c7d2fe; }

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
    #sp-blocked-title { font-size: 14px; font-weight: 600; color: #94a3b8; }
    #sp-blocked-desc { font-size: 11px; color: #475569; line-height: 1.55; max-width: 200px; }

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
      background: rgba(33, 128, 141, 0.2);
      color: #e8e4db;
      border-bottom-right-radius: 3px;
    }
    .sp-bubble-assistant {
      background: #1a1a2e;
      color: #e2e8f0;
      border: 1px solid #1e2030;
      border-bottom-left-radius: 3px;
    }
    .sp-bubble-error {
      background: #450a0a;
      border-color: #7f1d1d;
      color: #fca5a5;
    }
    .sp-timestamp {
      font-size: 10px;
      color: #334155;
      padding: 0 3px;
    }

    /* ── Markdown rendering inside assistant bubbles ── */
    .sp-bubble-assistant code {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 3px;
      padding: 1px 4px;
      font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 11px;
      color: #a5f3fc;
    }
    .sp-bubble-assistant pre {
      background: #0d1117;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 10px;
      overflow-x: auto;
      margin: 4px 0;
      font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 11px;
      color: #c9d1d9;
      white-space: pre;
    }
    .sp-bubble-assistant pre code {
      background: none;
      border: none;
      padding: 0;
      color: inherit;
    }
    .sp-bubble-assistant strong { color: #f8fafc; font-weight: 600; }
    .sp-bubble-assistant em { color: #cbd5e1; font-style: italic; }
    .sp-bubble-assistant a { color: #818cf8; text-decoration: underline; }
    .sp-bubble-assistant ul, .sp-bubble-assistant ol {
      padding-left: 16px;
      margin: 4px 0;
    }
    .sp-bubble-assistant li { margin: 2px 0; }
    .sp-bubble-assistant h1, .sp-bubble-assistant h2, .sp-bubble-assistant h3 {
      font-weight: 600;
      color: #f1f5f9;
      margin: 6px 0 3px;
    }
    .sp-bubble-assistant h1 { font-size: 15px; }
    .sp-bubble-assistant h2 { font-size: 14px; }
    .sp-bubble-assistant h3 { font-size: 13px; }
    .sp-bubble-assistant blockquote {
      border-left: 3px solid var(--agi-ext-accent);
      padding-left: 8px;
      color: #94a3b8;
      margin: 4px 0;
    }
    .sp-bubble-assistant hr {
      border: none;
      border-top: 1px solid #1e293b;
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

    /* ── Thinking dots ── */
    .sp-thinking {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: #1a1a2e;
      border: 1px solid #1e2030;
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
      background: #13131a;
      border: 1px solid #1e1e2e;
      border-radius: 6px;
      color: #64748b;
      font-size: 11px;
      padding: 4px 9px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .sp-tool-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: rgba(33, 128, 141, 0.08); }
    .sp-tool-btn.active { color: #a5f3fc; border-color: #0891b2; background: #0c1a2e; }
    .sp-tool-btn.has-context { color: #86efac; border-color: #166534; background: #052e16; }

    /* ── Mic pulsing indicator ── */
    .sp-mic-pulse {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #ef4444;
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
      background: #0a0a10;
      border-bottom: 1px solid #1e1e2e;
      flex-shrink: 0;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 11px;
    }
    #sp-console-panel.open { display: flex; }
    .sp-console-entry {
      padding: 3px 10px;
      border-bottom: 1px solid #111118;
      line-height: 1.4;
      word-break: break-all;
    }
    .sp-console-log { color: #e2e8f0; }
    .sp-console-warn { color: #fbbf24; background: #1c1a05; }
    .sp-console-error { color: #f87171; background: #1c0505; }
    .sp-console-info { color: #60a5fa; }
    .sp-console-debug { color: #6b7280; }
    .sp-console-time {
      color: #475569;
      font-size: 9px;
      margin-right: 6px;
    }
    .sp-console-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      background: #0d0d14;
      border-bottom: 1px solid #1e1e2e;
      position: sticky;
      top: 0;
    }
    .sp-console-title { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .sp-console-clear {
      background: none;
      border: none;
      color: #64748b;
      font-size: 10px;
      cursor: pointer;
      padding: 2px 6px;
    }
    .sp-console-clear:hover { color: #e2e8f0; }

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
      background: #13131a;
      border: 1px solid #1e1e2e;
      border-radius: 8px;
      padding: 4px;
      z-index: 100;
      box-shadow: 0 -4px 16px rgba(0,0,0,0.4);
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
    .sp-shortcut-item:hover { background: #1e1e2e; }
    .sp-shortcut-name { font-size: 12px; color: #e2e8f0; flex: 1; }
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
    .sp-shortcut-action-btn:hover { background: #2d2d40; }
    .sp-shortcuts-empty {
      padding: 10px 8px;
      color: #475569;
      font-size: 11px;
      text-align: center;
    }
    .sp-save-shortcut-row {
      display: flex;
      gap: 4px;
      padding: 6px 4px 4px;
      border-top: 1px solid #1e1e2e;
    }
    .sp-save-shortcut-input {
      flex: 1;
      background: #0f0f14;
      border: 1px solid #1e1e2e;
      border-radius: 4px;
      color: #e2e8f0;
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
      background: #13131a;
      border: 1px solid #1e1e2e;
      border-radius: 8px;
      padding: 4px;
      z-index: 100;
      box-shadow: 0 -4px 16px rgba(0,0,0,0.4);
    }
    #sp-tools-dropdown.open { display: block; }
    #sp-tools-dropdown::-webkit-scrollbar { width: 4px; }
    #sp-tools-dropdown::-webkit-scrollbar-track { background: transparent; }
    #sp-tools-dropdown::-webkit-scrollbar-thumb { background: #1e2030; border-radius: 4px; }
    .sp-tools-empty {
      padding: 10px 8px;
      color: #475569;
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
    .sp-tool-item:hover { background: #1e1e2e; }
    .sp-tool-item-name {
      font-size: 12px;
      color: #e2e8f0;
      font-weight: 500;
    }
    .sp-tool-item-desc {
      font-size: 10px;
      color: #64748b;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    /* ── Input row ── */
    #sp-input-area {
      padding: 8px 10px 10px;
      border-top: 1px solid #1e1e2e;
      flex-shrink: 0;
    }
    #sp-input-row {
      display: flex;
      gap: 6px;
      align-items: flex-end;
    }
    #sp-input {
      flex: 1;
      background: #13131a;
      border: 1px solid #1e1e2e;
      border-radius: 10px;
      color: #e2e8f0;
      font-size: 13px;
      padding: 8px 11px;
      resize: none;
      outline: none;
      font-family: inherit;
      line-height: 1.5;
      max-height: 120px;
      min-height: 38px;
      overflow-y: auto;
      transition: border-color 0.15s;
    }
    #sp-input:focus { border-color: var(--agi-ext-focus); }
    #sp-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    #sp-input::placeholder { color: #334155; }
    #sp-send-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: 8px;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.1s;
    }
    #sp-send-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); transform: scale(1.05); }
    #sp-send-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-send-btn:disabled { background: #1e1e2e; color: #334155; cursor: not-allowed; transform: none; }

    /* ── Attachment + button and menu ── */
    .sp-attach-wrapper { position: relative; flex-shrink: 0; }
    .sp-attach-btn {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #13131a;
      border: 1px solid #1e1e2e;
      border-radius: 8px;
      color: #64748b;
      font-size: 18px;
      font-weight: 300;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    .sp-attach-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: rgba(33, 128, 141, 0.08); }
    #sp-attach-menu {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      min-width: 190px;
      background: #13131a;
      border: 1px solid #1e1e2e;
      border-radius: 8px;
      padding: 4px;
      z-index: 150;
      box-shadow: 0 -4px 16px rgba(0,0,0,0.5);
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
      color: #cbd5e1;
      transition: background 0.12s, color 0.12s;
      user-select: none;
    }
    .sp-attach-menu-item:hover { background: #1e1e2e; color: #e2e8f0; }
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
      border: 1px solid #1e1e2e;
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
      background: #1e1e2e;
      border: 1px solid #334155;
      border-radius: 50%;
      color: #94a3b8;
      font-size: 10px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background 0.12s, color 0.12s;
    }
    .sp-attachment-remove:hover { background: #7f1d1d; color: #fca5a5; border-color: #7f1d1d; }

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
      background: #1a1a28;
      border: 1px solid #2d2d40;
      border-radius: 12px;
      color: #64748b;
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
      background: #334155;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .sp-context-chip.has-context {
      color: #86efac;
      border-color: #166534;
      background: #052e16;
    }
    .sp-context-chip.has-context::before { background: #22c55e; }
    .sp-context-chip:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: rgba(33, 128, 141, 0.08); }
    .sp-context-chip:hover::before { background: var(--agi-ext-accent); }
    .sp-context-chip.loading { opacity: 0.6; cursor: wait; }

    /* ── Settings bar ── */
    #sp-settings-bar {
      display: none; /* shown when settings are open */
      flex-direction: column;
      gap: 5px;
      padding: 6px 10px 8px;
      background: #0a0a10;
      border-bottom: 1px solid #1e1e2e;
      flex-shrink: 0;
    }
    #sp-settings-bar.open { display: flex; }
    .sp-settings-label {
      font-size: 10px;
      color: #475569;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .sp-settings-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .sp-settings-input {
      flex: 1;
      background: #13131a;
      border: 1px solid #1e1e2e;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 11px;
      padding: 5px 9px;
      outline: none;
      font-family: 'SF Mono', Consolas, monospace;
      transition: border-color 0.15s;
      min-width: 0;
    }
    .sp-settings-input:focus { border-color: var(--agi-ext-focus); }
    .sp-settings-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-settings-input::placeholder { color: #334155; }
    .sp-settings-btn {
      background: #1e1e2e;
      color: #94a3b8;
      border: 1px solid #2d2d40;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      white-space: nowrap;
    }
    .sp-settings-btn:hover { color: #e2e8f0; border-color: var(--agi-ext-accent); }

    /* ── Auth bar ── */
    #sp-auth-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: #0d0d14;
      border-bottom: 1px solid #1e1e2e;
      flex-shrink: 0;
    }
    #sp-auth-input {
      flex: 1;
      background: #13131a;
      border: 1px solid #1e1e2e;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 11px;
      padding: 5px 9px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s;
      min-width: 0;
    }
    #sp-auth-input:focus { border-color: var(--agi-ext-focus); }
    #sp-auth-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    #sp-auth-input::placeholder { color: #334155; }
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
      background: #052e16;
      color: #86efac;
      border: 1px solid #166534;
    }
    #sp-status-pill.disconnected {
      background: #1c0505;
      color: #f87171;
      border: 1px solid #7f1d1d;
    }
    .sp-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    #sp-status-pill.connected .sp-status-dot { background: #22c55e; }
    #sp-status-pill.disconnected .sp-status-dot { background: #ef4444; }

    /* ── Tab bar ── */
    #sp-tab-bar {
      display: flex;
      background: #13131a;
      border-bottom: 1px solid #1e1e2e;
      flex-shrink: 0;
    }
    .sp-tab {
      flex: 1;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #64748b;
      font-size: 12px;
      font-weight: 500;
      padding: 9px 0;
      cursor: pointer;
      letter-spacing: 0.02em;
      transition: color 0.15s, border-color 0.15s;
    }
    .sp-tab:hover { color: #94a3b8; }
    .sp-tab.sp-tab-active { color: var(--agi-ext-accent); border-bottom-color: var(--agi-ext-accent); }
    #sp-chat-panel { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    #sp-chat-panel.sp-tab-hidden { display: none; }
    #sp-workflows { display: none; flex: 1; overflow-y: auto; padding: 12px 10px; flex-direction: column; gap: 16px; }
    #sp-workflows.sp-tab-visible { display: flex; }
    #sp-workflows::-webkit-scrollbar { width: 4px; }
    #sp-workflows::-webkit-scrollbar-track { background: transparent; }
    #sp-workflows::-webkit-scrollbar-thumb { background: #1e2030; border-radius: 4px; }
    .sp-wf-section { background: #1a1a28; border: 1px solid #1e1e2e; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .sp-wf-section-header { display: flex; align-items: center; justify-content: space-between; }
    .sp-wf-section-title { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; }
    .sp-wf-empty { color: #475569; font-size: 11px; line-height: 1.55; padding: 4px 0; }
    .sp-wf-shortcuts-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-wf-shortcut-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: #0f0f14; border: 1px solid #1e1e2e; border-radius: 7px; }
    .sp-wf-shortcut-icon { font-size: 14px; flex-shrink: 0; }
    .sp-wf-shortcut-info { flex: 1; min-width: 0; }
    .sp-wf-shortcut-name { font-size: 12px; font-weight: 500; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-wf-shortcut-meta { font-size: 10px; color: #475569; margin-top: 1px; }
    .sp-wf-shortcut-btns { display: flex; gap: 4px; flex-shrink: 0; }
    .sp-wf-btn-replay { background: rgba(33, 128, 141, 0.12); border: 1px solid rgba(33, 128, 141, 0.3); color: var(--agi-ext-accent); font-size: 11px; padding: 3px 9px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-btn-replay:hover { background: rgba(33, 128, 141, 0.22); }
    .sp-wf-btn-delete { background: none; border: 1px solid #1e1e2e; color: #64748b; font-size: 11px; padding: 3px 7px; border-radius: 5px; cursor: pointer; transition: color 0.12s, border-color 0.12s; }
    .sp-wf-btn-delete:hover { color: #f87171; border-color: #7f1d1d; }
    .sp-wf-tasks-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-wf-task-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: #0f0f14; border: 1px solid #1e1e2e; border-radius: 7px; }
    .sp-wf-task-info { flex: 1; min-width: 0; }
    .sp-wf-task-name { font-size: 12px; font-weight: 500; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-wf-task-schedule-badge { display: inline-block; font-size: 9px; color: var(--agi-ext-accent); background: rgba(33, 128, 141, 0.12); border: 1px solid rgba(33, 128, 141, 0.3); border-radius: 3px; padding: 1px 5px; margin-top: 2px; }
    .sp-wf-task-toggle { appearance: none; width: 30px; height: 16px; border-radius: 8px; background: #1e1e2e; position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
    .sp-wf-task-toggle:checked { background: var(--agi-ext-accent); }
    .sp-wf-task-toggle::after { content: ''; position: absolute; width: 12px; height: 12px; border-radius: 50%; background: white; top: 2px; left: 2px; transition: transform 0.2s; }
    .sp-wf-task-toggle:checked::after { transform: translateX(14px); }
    .sp-wf-task-delete { background: none; border: 1px solid #1e1e2e; color: #64748b; font-size: 11px; padding: 3px 7px; border-radius: 5px; cursor: pointer; transition: color 0.12s, border-color 0.12s; }
    .sp-wf-task-delete:hover { color: #f87171; border-color: #7f1d1d; }
    .sp-wf-new-task-btn { background: rgba(33, 128, 141, 0.12); border: 1px solid rgba(33, 128, 141, 0.3); color: var(--agi-ext-accent); font-size: 11px; padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-new-task-btn:hover { background: rgba(33, 128, 141, 0.22); }
    .sp-wf-new-task-form { display: none; flex-direction: column; gap: 7px; padding: 10px; background: #0f0f14; border: 1px solid #1e1e2e; border-radius: 7px; }
    .sp-wf-new-task-form.open { display: flex; }
    .sp-wf-form-label { font-size: 10px; color: #64748b; margin-bottom: 1px; }
    .sp-wf-form-input { background: #13131a; border: 1px solid #1e1e2e; border-radius: 5px; color: #e2e8f0; font-size: 12px; padding: 5px 8px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; }
    .sp-wf-form-input:focus { border-color: var(--agi-ext-focus); }
    .sp-wf-form-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-wf-form-input::placeholder { color: #334155; }
    .sp-wf-form-select { background: #13131a; border: 1px solid #1e1e2e; border-radius: 5px; color: #e2e8f0; font-size: 12px; padding: 5px 8px; outline: none; font-family: inherit; width: 100%; }
    .sp-wf-form-select:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-wf-form-save-btn { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border: none; border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; align-self: flex-end; transition: background 0.12s; }
    .sp-wf-form-save-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-wf-form-save-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-wf-form-cancel-btn { background: none; border: 1px solid #1e1e2e; color: #64748b; border-radius: 5px; padding: 6px 10px; font-size: 12px; cursor: pointer; align-self: flex-end; transition: color 0.12s; }
    .sp-wf-form-cancel-btn:hover { color: #e2e8f0; }
    .sp-wf-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .sp-wf-create-shortcut-btn { background: rgba(33, 128, 141, 0.12); border: 1px solid rgba(33, 128, 141, 0.3); color: var(--agi-ext-accent); font-size: 11px; padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-create-shortcut-btn:hover { background: rgba(33, 128, 141, 0.22); }
    .sp-create-shortcut-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999; align-items: center; justify-content: center; }
    .sp-create-shortcut-overlay.open { display: flex; }
    .sp-create-shortcut-modal { background: #13131a; border: 1px solid #1e1e2e; border-radius: 10px; padding: 18px 18px 14px; width: 290px; max-width: 95vw; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
    .sp-create-shortcut-header { display: flex; align-items: center; justify-content: space-between; }
    .sp-create-shortcut-title { font-size: 13px; font-weight: 600; color: #e2e8f0; }
    .sp-create-shortcut-close { background: none; border: none; color: #64748b; font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1; transition: color 0.12s; }
    .sp-create-shortcut-close:hover { color: #e2e8f0; }
    .sp-create-shortcut-field { display: flex; flex-direction: column; gap: 4px; }
    .sp-create-shortcut-label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .sp-create-shortcut-input { background: #0f0f14; border: 1px solid #1e1e2e; border-radius: 5px; color: #e2e8f0; font-size: 12px; padding: 6px 9px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; box-sizing: border-box; }
    .sp-create-shortcut-input:focus { border-color: var(--agi-ext-focus); }
    .sp-create-shortcut-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-create-shortcut-input::placeholder { color: #334155; }
    .sp-create-shortcut-textarea { background: #0f0f14; border: 1px solid #1e1e2e; border-radius: 5px; color: #e2e8f0; font-size: 12px; padding: 6px 9px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; box-sizing: border-box; resize: none; height: 70px; line-height: 1.4; }
    .sp-create-shortcut-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-create-shortcut-textarea:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-create-shortcut-textarea::placeholder { color: #334155; }
    .sp-create-shortcut-schedule-row { display: flex; align-items: center; justify-content: space-between; }
    .sp-create-shortcut-schedule-label { font-size: 12px; color: #94a3b8; }
    .sp-create-shortcut-toggle { appearance: none; width: 34px; height: 18px; border-radius: 9px; background: #1e1e2e; position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; border: none; outline: none; }
    .sp-create-shortcut-toggle:checked { background: var(--agi-ext-accent); }
    .sp-create-shortcut-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-create-shortcut-toggle::after { content: ''; position: absolute; width: 13px; height: 13px; border-radius: 50%; background: white; top: 2.5px; left: 2.5px; transition: transform 0.2s; }
    .sp-create-shortcut-toggle:checked::after { transform: translateX(16px); }
    .sp-create-shortcut-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 2px; }
    .sp-create-shortcut-cancel { background: none; border: 1px solid #1e1e2e; color: #64748b; border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: color 0.12s; }
    .sp-create-shortcut-cancel:hover { color: #e2e8f0; }
    .sp-create-shortcut-save { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border: none; border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background 0.12s; }
    .sp-create-shortcut-save:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-create-shortcut-save:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-wf-group-desc { font-size: 11px; color: #64748b; line-height: 1.55; }
    .sp-wf-group-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .sp-wf-group-action-btn { display: flex; align-items: center; gap: 5px; background: #13131a; border: 1px solid #1e1e2e; border-radius: 6px; color: #94a3b8; font-size: 11px; padding: 5px 11px; cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s; }
    .sp-wf-group-action-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: rgba(33, 128, 141, 0.08); }
    .sp-wf-group-action-btn.active { color: #86efac; border-color: #166534; background: #052e16; }
    .sp-wf-record-bar { display: flex; align-items: center; gap: 8px; }
    .sp-wf-record-btn { display: flex; align-items: center; gap: 6px; background: #dc2626; border: none; color: white; font-size: 12px; font-weight: 600; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: background 0.15s, transform 0.1s; flex-shrink: 0; }
    .sp-wf-record-btn:hover { background: #b91c1c; transform: scale(1.02); }
    .sp-wf-record-btn.recording { background: #450a0a; border: 1px solid #dc2626; animation: sp-record-pulse 1.5s infinite; }
    .sp-wf-record-btn.recording:hover { background: #7f1d1d; }
    @keyframes sp-record-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); } 50% { box-shadow: 0 0 0 6px rgba(220, 38, 38, 0); } }
    .sp-wf-record-dot { width: 8px; height: 8px; border-radius: 50%; background: white; flex-shrink: 0; }
    .sp-wf-record-btn.recording .sp-wf-record-dot { background: #ef4444; animation: sp-pulse 1s infinite; }
    .sp-wf-action-counter { font-size: 11px; color: #94a3b8; flex: 1; }
    .sp-wf-action-counter strong { color: #e2e8f0; }
    .sp-wf-save-dialog { display: none; flex-direction: column; gap: 6px; padding: 10px; background: #0f0f14; border: 1px solid rgba(33, 128, 141, 0.3); border-radius: 8px; }
    .sp-wf-save-dialog.open { display: flex; }
    .sp-wf-save-dialog-title { font-size: 12px; font-weight: 600; color: var(--agi-ext-accent); }
    .sp-wf-count-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; font-size: 10px; font-weight: 600; background: rgba(33, 128, 141, 0.2); color: var(--agi-ext-accent); border-radius: 9px; padding: 0 5px; }
    .sp-model-selector-wrap { position: relative; }
    #sp-model-selector-btn { display: flex; align-items: center; gap: 4px; background: rgba(33, 128, 141, 0.12); border: 1px solid rgba(33, 128, 141, 0.3); border-radius: 5px; padding: 3px 8px; color: var(--agi-ext-accent); font-size: 10px; font-weight: 500; cursor: pointer; transition: background 0.12s, border-color 0.12s; white-space: nowrap; }
    #sp-model-selector-btn:hover { background: rgba(33, 128, 141, 0.22); border-color: var(--agi-ext-accent); }
    #sp-model-selector-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-model-selector-btn .sp-chevron { font-size: 8px; transition: transform 0.15s; }
    #sp-model-selector-btn.open .sp-chevron { transform: rotate(180deg); }
    #sp-model-dropdown { display: none; position: absolute; top: 100%; right: 0; margin-top: 4px; min-width: 180px; max-height: 280px; overflow-y: auto; background: #13131a; border: 1px solid #1e1e2e; border-radius: 8px; padding: 4px; z-index: 200; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
    #sp-model-dropdown.open { display: block; }
    .sp-model-option { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 5px; cursor: pointer; transition: background 0.12s; font-size: 11px; color: #94a3b8; }
    .sp-model-option:hover { background: #1e1e2e; color: #e2e8f0; }
    .sp-model-option.selected { color: var(--agi-ext-accent); background: rgba(33, 128, 141, 0.12); }
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
      background: #2d2d40;
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
      color: #475569;
      white-space: nowrap;
    }
    .sp-model-option.selected .sp-model-option-sublabel { color: var(--agi-ext-accent); opacity: 0.7; }
    .sp-model-option:hover .sp-model-option-sublabel { color: #64748b; }

    /* "Best (auto)" option — visually distinct row */
    .sp-model-option-auto {
      border-bottom: 1px solid #1e1e2e;
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
      border-bottom: 1px solid #1e1e2e;
      margin-bottom: 2px;
    }
    .sp-model-picker-title {
      font-size: 9px;
      font-weight: 600;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .provider-count-badge {
      font-size: 10px;
      color: #64748b;
      background: #1e1e2e;
      border: 1px solid #2d2d40;
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
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 6px 9px 2px;
    }
    .sp-model-group-header:not(:first-child) {
      border-top: 1px solid #1e1e2e;
      margin-top: 4px;
      padding-top: 8px;
    }

    /* Thinking toggle row at bottom of dropdown */
    .sp-thinking-toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 9px 5px;
      border-top: 1px solid #1e1e2e;
      margin-top: 4px;
    }
    .sp-thinking-toggle-label {
      flex: 1;
      font-size: 10px;
      color: #64748b;
      user-select: none;
      cursor: pointer;
    }
    .sp-thinking-toggle-label.active { color: var(--agi-ext-accent); }
    .sp-thinking-toggle {
      appearance: none;
      width: 28px;
      height: 15px;
      border-radius: 8px;
      background: #1e1e2e;
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
      background: #13131a;
      border: 1px solid #1e1e2e;
      border-radius: 8px;
      padding: 4px;
      z-index: 200;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    }
    #sp-history-dropdown.open { display: block; }
    #sp-history-dropdown::-webkit-scrollbar { width: 4px; }
    #sp-history-dropdown::-webkit-scrollbar-track { background: transparent; }
    #sp-history-dropdown::-webkit-scrollbar-thumb { background: #1e2030; border-radius: 4px; }
    .sp-history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px 4px;
      border-bottom: 1px solid #1e1e2e;
      margin-bottom: 2px;
    }
    .sp-history-title { font-size: 9px; font-weight: 600; color: #334155; text-transform: uppercase; letter-spacing: 0.08em; }
    .sp-history-empty { padding: 12px 8px; color: #475569; font-size: 11px; text-align: center; }
    .sp-history-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 8px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .sp-history-item:hover { background: #1e1e2e; }
    .sp-history-item-text { flex: 1; min-width: 0; }
    .sp-history-item-title {
      font-size: 11px;
      color: #e2e8f0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-history-item-date { font-size: 9px; color: #475569; margin-top: 1px; }
    .sp-history-item-del {
      background: none;
      border: none;
      color: #475569;
      font-size: 12px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      line-height: 1;
      flex-shrink: 0;
      transition: color 0.12s, background 0.12s;
    }
    .sp-history-item-del:hover { color: #f87171; background: #1c0505; }
  `;
  document.head.appendChild(style);
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

  const ts = el('span', { class: 'sp-timestamp' }, formatTime(msg.timestamp));

  wrapper.appendChild(bubble);
  wrapper.appendChild(ts);
  return wrapper;
}

function renderMessages(): void {
  const container = document.getElementById('sp-messages')!;
  const chips = document.getElementById('sp-prompt-chips');

  if (_ctx.messages.length === 0) {
    if (chips) chips.classList.remove('hidden');
    // Remove all message nodes and reset counter
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    _ctx.lastRenderedCount = 0;
    return;
  }

  if (chips) chips.classList.add('hidden');

  // Only append messages that haven't been rendered yet — avoids full DOM rebuild on each
  // streaming chunk and preserves browser focus/scroll state for already-rendered bubbles.
  if (_ctx.lastRenderedCount > _ctx.messages.length) {
    // Messages were cleared — rebuild from scratch
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    _ctx.lastRenderedCount = 0;
  }

  for (let i = _ctx.lastRenderedCount; i < _ctx.messages.length; i++) {
    const msg = _ctx.messages[i];
    if (msg) container.appendChild(buildBubble(msg));
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
            resolve(results[0].result as string);
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
            apiKey: _ctx.currentApiKey ?? undefined,
            // TODO(Phase 3 bridge): bridge must consume extendedThinking and
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
      apiKey: _ctx.currentApiKey ?? undefined,
      // TODO(Phase 3 bridge): bridge must consume extendedThinking and
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
    pill.className = 'connected';
    const dot = document.createElement('span');
    dot.className = 'sp-status-dot';
    pill.replaceChildren(dot, 'Connected');
  } else {
    pill.className = 'disconnected';
    const dot = document.createElement('span');
    dot.className = 'sp-status-dot';
    pill.replaceChildren(dot, 'Not Connected');
  }
}

async function validateAndSaveApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;

  _ctx.currentApiKey = trimmed;
  saveApiKey(trimmed);

  // Optimistically mark connected — real validation happens when a message is sent
  _ctx.isConnected = true;
  updateConnectionStatus();
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
  badge.textContent = SIDE_PANEL_MODEL_BADGES[normalizedModelId] ?? normalizedModelId;
}

function updateSendButton(): void {
  const btn = document.getElementById('sp-send-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = _ctx.isStreaming;
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
  setText(btn, `\uD83D\uDD27 AI Tools (${count})`);

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
      item.appendChild(el('div', { class: 'sp-tool-item-desc' }, tool.description));
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

function buildUI(): void {
  clearChildren(document.body);

  const header = el('div', { id: 'sp-header' });
  const headerLeft = el('div', { id: 'sp-header-left' });
  headerLeft.appendChild(el('div', { id: 'sp-logo' }, '🤖'));
  const titleWrap = el('div', {});
  titleWrap.appendChild(el('div', { id: 'sp-title' }, 'AGI Workforce'));
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
    const classes = [
      'sp-model-option',
      isSelected ? 'selected' : '',
      isAuto ? 'sp-model-option-auto' : '',
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

    // Checkmark
    opt.appendChild(el('span', { class: 'sp-model-option-check' }, isSelected ? '✓' : ''));

    opt.addEventListener('click', () => {
      currentModelValue = m.value;
      chrome.storage.local.set({ agi_model: m.value }).catch(() => {});
      updateModelBadge(m.value);
      renderModelDropdown();
      modelDropdownEl.classList.remove('open');
      modelSelectorBtn.classList.remove('open');
    });

    return opt;
  }

  function renderModelDropdown(): void {
    clearChildren(modelDropdownEl);

    // 0. Provider count badge header
    const pickerHeader = el('div', { class: 'sp-model-picker-header' });
    pickerHeader.appendChild(el('span', { class: 'sp-model-picker-title' }, 'Select model'));
    pickerHeader.appendChild(el('span', { class: 'provider-count-badge' }, '13+ providers'));
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
      currentModelValue = normalizeModelId(stored) ?? stored;
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
  const summarizeBtn = el(
    'button',
    { class: 'sp-icon-btn', id: 'sp-summarize-btn', title: 'Summarize current page' },
    '📝',
  );
  summarizeBtn.addEventListener('click', () => {
    if (_ctx.isStreaming) return;
    sendMessage('/summarize');
  });
  headerRight.appendChild(summarizeBtn);

  // ── History button + dropdown ──────────────────────────────────────────────
  const historyWrapper = el('div', { class: 'sp-history-wrapper' });
  const historyBtn = el(
    'button',
    { class: 'sp-icon-btn', id: 'sp-history-btn', title: 'Conversation history' },
    '🕐',
  );
  const historyDropdown = el('div', { id: 'sp-history-dropdown' });

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

  function renderHistoryDropdown(entries: ConversationEntry[]): void {
    clearChildren(historyDropdown);
    const hdr = el('div', { class: 'sp-history-header' });
    hdr.appendChild(el('span', { class: 'sp-history-title' }, 'History'));
    historyDropdown.appendChild(hdr);

    if (entries.length === 0) {
      historyDropdown.appendChild(
        el('div', { class: 'sp-history-empty' }, 'No saved conversations'),
      );
      return;
    }

    for (const entry of entries) {
      const item = el('div', { class: 'sp-history-item' });
      const textCol = el('div', { class: 'sp-history-item-text' });
      textCol.appendChild(el('div', { class: 'sp-history-item-title' }, entry.title));
      textCol.appendChild(
        el('div', { class: 'sp-history-item-date' }, formatHistoryDate(entry.savedAt)),
      );
      item.appendChild(textCol);

      const delBtn = el('button', { class: 'sp-history-item-del', title: 'Delete' }, '✕');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(entry.id)
          .then(() => listConversations())
          .then((updated) => renderHistoryDropdown(updated))
          .catch((err) => console.warn('[SidePanel] history delete failed:', err));
      });
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        historyDropdown.classList.remove('open');
        historyBtn.classList.remove('active');
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
      });
      historyDropdown.appendChild(item);
    }
  }

  historyBtn.addEventListener('click', () => {
    const isOpen = historyDropdown.classList.toggle('open');
    historyBtn.classList.toggle('active', isOpen);
    if (isOpen) {
      listConversations()
        .then((entries) => renderHistoryDropdown(entries))
        .catch((err) => console.warn('[SidePanel] history list failed:', err));
    }
  });

  document.addEventListener('click', (e) => {
    if (!historyWrapper.contains(e.target as Node)) {
      historyDropdown.classList.remove('open');
      historyBtn.classList.remove('active');
    }
  });

  historyWrapper.appendChild(historyBtn);
  historyWrapper.appendChild(historyDropdown);
  headerRight.appendChild(historyWrapper);
  // ─────────────────────────────────────────────────────────────────────────

  const clearBtn = el(
    'button',
    { class: 'sp-icon-btn', id: 'sp-clear-btn', title: 'Clear conversation' },
    '🗑',
  );
  clearBtn.addEventListener('click', () => {
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
  const settingsToggleBtn = el(
    'button',
    { class: 'sp-icon-btn', id: 'sp-settings-btn', title: 'Settings' },
    '⚙',
  );
  settingsToggleBtn.addEventListener('click', () => {
    const bar = document.getElementById('sp-settings-bar');
    if (bar) bar.classList.toggle('open');
  });
  const consoleToggleBtn = el(
    'button',
    { class: 'sp-icon-btn', id: 'sp-console-toggle-btn', title: 'Toggle console logs' },
    '🖥',
  );
  consoleToggleBtn.addEventListener('click', () => {
    const panel = document.getElementById('sp-console-panel');
    if (panel) {
      const isOpen = panel.classList.toggle('open');
      if (isOpen) refreshConsoleLogs();
    }
  });

  headerRight.appendChild(consoleToggleBtn);
  headerRight.appendChild(settingsToggleBtn);
  headerRight.appendChild(clearBtn);
  header.appendChild(headerRight);
  document.body.appendChild(header);

  const settingsBar = el('div', { id: 'sp-settings-bar' });

  const bridgeUrlLabel = el('div', { class: 'sp-settings-label' }, 'Bridge URL');
  const bridgeUrlRow = el('div', { class: 'sp-settings-row' });

  const bridgeUrlInput = el('input', {
    class: 'sp-settings-input',
    id: 'sp-bridge-url-input',
    type: 'text',
    placeholder: 'ws://localhost:8787',
    spellcheck: 'false',
  }) as HTMLInputElement;

  const bridgeUrlSaveBtn = el('button', { class: 'sp-settings-btn' }, 'Apply');

  bridgeUrlRow.appendChild(bridgeUrlInput);
  bridgeUrlRow.appendChild(bridgeUrlSaveBtn);
  settingsBar.appendChild(bridgeUrlLabel);
  settingsBar.appendChild(bridgeUrlRow);

  document.body.appendChild(settingsBar);

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

  chrome.storage.local.get('agi_bridge_url', (result) => {
    if (chrome.runtime.lastError) return;
    const stored = result['agi_bridge_url'] as string | undefined;
    if (stored && bridgeUrlInput instanceof HTMLInputElement) {
      bridgeUrlInput.value = stored;
    }
  });

  // Save bridge URL and reconnect — only local URLs allowed
  const saveBridgeUrl = (): void => {
    const raw = (bridgeUrlInput as HTMLInputElement).value.trim();
    if (!raw) {
      chrome.storage.local.remove('agi_bridge_url');
    } else {
      // Validate: only allow localhost/127.0.0.1 URLs to prevent data exfiltration
      try {
        const normalized = raw.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
        const parsed = new URL(normalized);
        const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
        if (!allowedHosts.has(parsed.hostname)) {
          // Show inline error instead of saving
          const bar = document.getElementById('sp-settings-bar');
          if (bar) {
            const existing = bar.querySelector('.sp-bridge-error');
            if (existing) existing.remove();
            const errEl = document.createElement('div');
            errEl.className = 'sp-bridge-error';
            errEl.style.cssText = 'color: #f87171; font-size: 10px; padding: 2px 0;';
            errEl.textContent = 'Only local URLs (localhost, 127.0.0.1) are allowed';
            bar.appendChild(errEl);
            setTimeout(() => errEl.remove(), 4000);
          }
          return;
        }
      } catch {
        return; // Invalid URL, silently reject
      }
      chrome.storage.local
        .set({ agi_bridge_url: raw })
        .catch((err: unknown) => console.warn('[SidePanel] Failed to save bridge URL:', err));
    }
    // Notify background to reconnect with new URL
    chrome.runtime
      .sendMessage({ type: 'BRIDGE_URL_CHANGED', url: raw })
      .catch((err: unknown) =>
        console.warn('[SidePanel] Failed to notify bridge URL change:', err),
      );
    const bar = document.getElementById('sp-settings-bar');
    if (bar) bar.classList.remove('open');
  };

  bridgeUrlSaveBtn.addEventListener('click', saveBridgeUrl);
  bridgeUrlInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') saveBridgeUrl();
  });

  const authBar = el('div', { id: 'sp-auth-bar' });

  const authInput = el('input', {
    id: 'sp-auth-input',
    type: 'password',
    placeholder: 'API key (stored locally)',
    autocomplete: 'off',
    spellcheck: 'false',
  }) as HTMLInputElement;

  const authSaveBtn = el('button', { id: 'sp-auth-save-btn' }, 'Save');

  const statusPill = el('div', { id: 'sp-status-pill', class: 'disconnected' });
  const statusDot0 = document.createElement('span');
  statusDot0.className = 'sp-status-dot';
  statusPill.replaceChildren(statusDot0, 'Not Connected');

  authBar.appendChild(authInput);
  authBar.appendChild(authSaveBtn);
  authBar.appendChild(statusPill);
  document.body.appendChild(authBar);

  const saveKey = (): void => {
    const val = authInput.value.trim();
    if (!val) {
      // Clear key
      _ctx.currentApiKey = null;
      _ctx.isConnected = false;
      clearStoredApiKey();
      authInput.value = '';
      updateConnectionStatus();
      return;
    }
    void validateAndSaveApiKey(val);
    authInput.value = '';
  };

  authSaveBtn.addEventListener('click', saveKey);
  authInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') saveKey();
  });

  const tabBar = el('div', { id: 'sp-tab-bar' });
  const chatTabBtn = el('button', { class: 'sp-tab sp-tab-active', 'data-tab': 'chat' }, 'Chat');
  const workflowsTabBtn = el('button', { class: 'sp-tab', 'data-tab': 'workflows' }, 'Workflows');
  tabBar.appendChild(chatTabBtn);
  tabBar.appendChild(workflowsTabBtn);
  document.body.appendChild(tabBar);

  function switchTab(tab: SidePanelTab): void {
    const chatPanelEl = document.getElementById('sp-chat-panel');
    const workflowsPanelEl = document.getElementById('sp-workflows');
    const inputAreaEl = document.getElementById('sp-input-area');
    const toolbarEl = document.getElementById('sp-toolbar');
    chatTabBtn.classList.toggle('sp-tab-active', tab === 'chat');
    workflowsTabBtn.classList.toggle('sp-tab-active', tab === 'workflows');
    if (chatPanelEl) chatPanelEl.classList.toggle('sp-tab-hidden', tab !== 'chat');
    if (workflowsPanelEl) workflowsPanelEl.classList.toggle('sp-tab-visible', tab === 'workflows');
    if (inputAreaEl) inputAreaEl.style.display = tab === 'chat' ? '' : 'none';
    if (toolbarEl) toolbarEl.style.display = tab === 'chat' ? '' : 'none';
    if (tab === 'workflows') {
      refreshWorkflowsShortcuts();
      refreshWorkflowsTasks();
    }
  }
  chatTabBtn.addEventListener('click', () => switchTab('chat'));
  workflowsTabBtn.addEventListener('click', () => switchTab('workflows'));

  const chatPanel = el('div', { id: 'sp-chat-panel' });

  const msgsArea = el('div', { id: 'sp-messages' });
  // #sp-empty retained as an invisible sentinel so renderMessages() can reference it without guard.
  msgsArea.appendChild(el('div', { id: 'sp-empty' }));

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
  shieldPath.setAttribute('stroke', '#94a3b8');
  shieldPath.setAttribute('stroke-width', '1.5');
  shieldPath.setAttribute('stroke-linejoin', 'round');
  const shieldLine = document.createElementNS(svgNS, 'line');
  shieldLine.setAttribute('x1', '12');
  shieldLine.setAttribute('y1', '8');
  shieldLine.setAttribute('x2', '12');
  shieldLine.setAttribute('y2', '13');
  shieldLine.setAttribute('stroke', '#94a3b8');
  shieldLine.setAttribute('stroke-width', '1.5');
  shieldLine.setAttribute('stroke-linecap', 'round');
  const shieldCircle = document.createElementNS(svgNS, 'circle');
  shieldCircle.setAttribute('cx', '12');
  shieldCircle.setAttribute('cy', '16');
  shieldCircle.setAttribute('r', '0.75');
  shieldCircle.setAttribute('fill', '#94a3b8');
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
      text: 'AGI Workforce cannot assist with the content on this page.',
    }),
  );
  msgsArea.appendChild(blockedState);

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
      saveNameInput.style.borderColor = '#dc2626';
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
          saveNameInput.style.borderColor = '#dc2626';
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
            saveNameInput.style.borderColor = '#dc2626';
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
      scNameInput.style.borderColor = '#dc2626';
      setTimeout(() => {
        scNameInput.style.borderColor = '';
      }, 1500);
      return;
    }
    if (!prompt) {
      scPromptInput.style.borderColor = '#dc2626';
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
          scNameInput.style.borderColor = '#dc2626';
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
        ntNameInput.style.borderColor = '#dc2626';
        setTimeout(() => {
          ntNameInput.style.borderColor = '';
        }, 1500);
      }
      if (!prompt) {
        ntPromptInput.style.borderColor = '#dc2626';
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

  const toolbar = el('div', { id: 'sp-toolbar' });

  // Context button is now rendered as a persistent chip in the composer bar (see below).
  // The toolbar slot is intentionally empty for context; the chip is built inside inputArea.

  const micBtn = el('button', { class: 'sp-tool-btn', id: 'sp-mic-btn', title: 'Voice input' });
  setText(micBtn, '🎤');
  toolbar.appendChild(micBtn);

  const groupBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-group-btn',
    title: 'Add current tab to AGI Workforce group',
  });
  setText(groupBtn, '📂 Group');
  let isGrouped = false;
  groupBtn.addEventListener('click', () => {
    const msgType = isGrouped ? 'REMOVE_TAB_FROM_GROUP' : 'ADD_TAB_TO_GROUP';
    chrome.runtime.sendMessage(
      { type: msgType },
      (response: { success?: boolean; grouped?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !response?.success) return;
        isGrouped = response.grouped ?? false;
        setText(groupBtn, isGrouped ? '📂 Ungroup' : '📂 Group');
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
  setText(shortcutsBtn, '⚡ Shortcuts');

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
  setText(toolsBtn, '\uD83D\uDD27 AI Tools (0)');

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
  const inputRow = el('div', { id: 'sp-input-row' });

  const inputEl = el('textarea', {
    id: 'sp-input',
    placeholder: 'Ask anything…',
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

  const sendBtn = el('button', { id: 'sp-send-btn', title: 'Send (Enter)' });
  setText(sendBtn, '↑');
  sendBtn.addEventListener('click', () => {
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
  screenshotItem.appendChild(
    createElementWith({ tag: 'span', className: 'sp-attach-icon', text: '📷' }),
  );
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
  fileItem.appendChild(createElementWith({ tag: 'span', className: 'sp-attach-icon', text: '🗄' }));
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

  const promptChipsRow = el('div', { id: 'sp-prompt-chips' });
  for (const cmd of ['/summarize', '/explain', '/extract', '/code']) {
    const chip = el('span', { class: 'sp-cmd-chip' }, cmd);
    chip.addEventListener('click', () => sendMessage(cmd));
    promptChipsRow.appendChild(chip);
  }

  inputArea.appendChild(attachmentBar);
  inputArea.appendChild(inputRow);
  inputArea.appendChild(composerBar);
  inputArea.appendChild(promptChipsRow);
  document.body.appendChild(inputArea);

  setupVoiceInput(micBtn, inputEl, autoResizeInput);
  renderMessages();
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
        noLogs.style.color = '#475569';
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
        item.appendChild(el('div', { class: 'sp-wf-shortcut-icon' }, isPromptBased ? '/' : '⚡'));
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

  const chunk = msg as ChatChunk;
  if (chunk.type !== 'CHAT_CHUNK') return;
  if (chunk.id !== _ctx.currentStreamId) return;

  if (chunk.error) {
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

Promise.all([
  loadApiKey().then((key) => {
    if (key) {
      _ctx.currentApiKey = key;
      _ctx.isConnected = true;
      updateConnectionStatus();
    }
  }),
  loadMessages().then(() => {
    if (_ctx.messages.length > 0) {
      renderMessages();
    }
  }),
])
  .then(() => {
    // Check for pending chat from context menu (selection, summarize, explain, translate)
    checkPendingChat();
  })
  .catch((err) => {
    // Boot errors must not surface to the user, but log for debugging.
    console.error('[SidePanel] Boot initialization failed:', err);
  });

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
