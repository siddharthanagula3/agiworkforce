import DOMPurify from 'dompurify';

/**
 * Side-panel UI message shape.
 *
 * File-local type for the Chrome extension side panel renderer.
 * Cannot import from `@agiworkforce/types` (workspace package, not bundled
 * with the extension). Field mapping to canonical ChatMessage:
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

const messages: ChatMessage[] = [];
let pendingPageContext: string | null = null;
let isStreaming = false;
let currentStreamId: string | null = null;
let streamTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
// Track how many messages have already been rendered to avoid full DOM rebuilds.
let lastRenderedCount = 0;

let currentApiKey: string | null = null;
let isConnected = false;

interface WebMCPToolEntry {
  name: string;
  description: string;
}
let discoveredTools: WebMCPToolEntry[] = [];

let isRecording = false;
let recordingActionCount = 0;

type SidePanelTab = 'chat' | 'workflows';

const STORAGE_KEY = 'agi_side_panel_messages';
const MAX_STORED_MESSAGES = 50;
const API_KEY_STORAGE_KEY = 'agi_api_key';

function saveMessages(): void {
  const toSave = messages.slice(-MAX_STORED_MESSAGES);
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
        messages.push(...stored.slice(-MAX_STORED_MESSAGES));
        lastRenderedCount = 0;
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
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
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
      color: #7c3aed;
      background: #1e1b4b;
      border: 1px solid #312e81;
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

    /* ── Empty state ── */
    #sp-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #475569;
      text-align: center;
      padding: 32px 16px;
    }
    #sp-empty-icon { font-size: 32px; opacity: 0.5; }
    #sp-empty-title { font-size: 14px; font-weight: 500; color: #64748b; }
    #sp-empty-hint { font-size: 11px; color: #334155; line-height: 1.5; }
    #sp-empty-cmds { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
    .sp-cmd-chip { display: inline-block; padding: 4px 10px; font-size: 11px; font-family: 'SF Mono', Monaco, monospace; background: #1e293b; color: #a5b4fc; border-radius: 12px; cursor: pointer; transition: background 0.15s; border: 1px solid #334155; }
    .sp-cmd-chip:hover { background: #334155; color: #c7d2fe; }

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
      background: #3730a3;
      color: #e0e7ff;
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
      border-left: 3px solid #4338ca;
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
      color: #6366f1;
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
      background: #6366f1;
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
    .sp-tool-btn:hover { color: #a5b4fc; border-color: #4338ca; background: #1a1a2e; }
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
    .sp-save-shortcut-input:focus { border-color: #4338ca; }
    .sp-save-shortcut-btn {
      background: #4338ca;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      white-space: nowrap;
    }
    .sp-save-shortcut-btn:hover { background: #3730a3; }

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
    #sp-input:focus { border-color: #4338ca; }
    #sp-input::placeholder { color: #334155; }
    #sp-send-btn {
      background: #4338ca;
      color: white;
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
    #sp-send-btn:hover:not(:disabled) { background: #3730a3; transform: scale(1.05); }
    #sp-send-btn:disabled { background: #1e1e2e; color: #334155; cursor: not-allowed; transform: none; }

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
    .sp-settings-input:focus { border-color: #4338ca; }
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
    .sp-settings-btn:hover { color: #e2e8f0; border-color: #4338ca; }

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
    #sp-auth-input:focus { border-color: #4338ca; }
    #sp-auth-input::placeholder { color: #334155; }
    #sp-auth-save-btn {
      background: #4338ca;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
      white-space: nowrap;
    }
    #sp-auth-save-btn:hover { background: #3730a3; }

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
    .sp-tab.sp-tab-active { color: #6366f1; border-bottom-color: #6366f1; }
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
    .sp-wf-btn-replay { background: #1e1b4b; border: 1px solid #312e81; color: #a5b4fc; font-size: 11px; padding: 3px 9px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-btn-replay:hover { background: #312e81; }
    .sp-wf-btn-delete { background: none; border: 1px solid #1e1e2e; color: #64748b; font-size: 11px; padding: 3px 7px; border-radius: 5px; cursor: pointer; transition: color 0.12s, border-color 0.12s; }
    .sp-wf-btn-delete:hover { color: #f87171; border-color: #7f1d1d; }
    .sp-wf-tasks-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-wf-task-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: #0f0f14; border: 1px solid #1e1e2e; border-radius: 7px; }
    .sp-wf-task-info { flex: 1; min-width: 0; }
    .sp-wf-task-name { font-size: 12px; font-weight: 500; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-wf-task-schedule-badge { display: inline-block; font-size: 9px; color: #7c3aed; background: #1e1b4b; border: 1px solid #312e81; border-radius: 3px; padding: 1px 5px; margin-top: 2px; }
    .sp-wf-task-toggle { appearance: none; width: 30px; height: 16px; border-radius: 8px; background: #1e1e2e; position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
    .sp-wf-task-toggle:checked { background: #4338ca; }
    .sp-wf-task-toggle::after { content: ''; position: absolute; width: 12px; height: 12px; border-radius: 50%; background: white; top: 2px; left: 2px; transition: transform 0.2s; }
    .sp-wf-task-toggle:checked::after { transform: translateX(14px); }
    .sp-wf-task-delete { background: none; border: 1px solid #1e1e2e; color: #64748b; font-size: 11px; padding: 3px 7px; border-radius: 5px; cursor: pointer; transition: color 0.12s, border-color 0.12s; }
    .sp-wf-task-delete:hover { color: #f87171; border-color: #7f1d1d; }
    .sp-wf-new-task-btn { background: #1e1b4b; border: 1px solid #312e81; color: #a5b4fc; font-size: 11px; padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-new-task-btn:hover { background: #312e81; }
    .sp-wf-new-task-form { display: none; flex-direction: column; gap: 7px; padding: 10px; background: #0f0f14; border: 1px solid #1e1e2e; border-radius: 7px; }
    .sp-wf-new-task-form.open { display: flex; }
    .sp-wf-form-label { font-size: 10px; color: #64748b; margin-bottom: 1px; }
    .sp-wf-form-input { background: #13131a; border: 1px solid #1e1e2e; border-radius: 5px; color: #e2e8f0; font-size: 12px; padding: 5px 8px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; }
    .sp-wf-form-input:focus { border-color: #4338ca; }
    .sp-wf-form-input::placeholder { color: #334155; }
    .sp-wf-form-select { background: #13131a; border: 1px solid #1e1e2e; border-radius: 5px; color: #e2e8f0; font-size: 12px; padding: 5px 8px; outline: none; font-family: inherit; width: 100%; }
    .sp-wf-form-save-btn { background: #4338ca; color: white; border: none; border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; align-self: flex-end; transition: background 0.12s; }
    .sp-wf-form-save-btn:hover { background: #3730a3; }
    .sp-wf-form-cancel-btn { background: none; border: 1px solid #1e1e2e; color: #64748b; border-radius: 5px; padding: 6px 10px; font-size: 12px; cursor: pointer; align-self: flex-end; transition: color 0.12s; }
    .sp-wf-form-cancel-btn:hover { color: #e2e8f0; }
    .sp-wf-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .sp-wf-group-desc { font-size: 11px; color: #64748b; line-height: 1.55; }
    .sp-wf-group-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .sp-wf-group-action-btn { display: flex; align-items: center; gap: 5px; background: #13131a; border: 1px solid #1e1e2e; border-radius: 6px; color: #94a3b8; font-size: 11px; padding: 5px 11px; cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s; }
    .sp-wf-group-action-btn:hover { color: #a5b4fc; border-color: #4338ca; background: #1a1a2e; }
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
    .sp-wf-save-dialog { display: none; flex-direction: column; gap: 6px; padding: 10px; background: #0f0f14; border: 1px solid #312e81; border-radius: 8px; }
    .sp-wf-save-dialog.open { display: flex; }
    .sp-wf-save-dialog-title { font-size: 12px; font-weight: 600; color: #a5b4fc; }
    .sp-wf-count-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; font-size: 10px; font-weight: 600; background: #312e81; color: #a5b4fc; border-radius: 9px; padding: 0 5px; }
    .sp-model-selector-wrap { position: relative; }
    #sp-model-selector-btn { display: flex; align-items: center; gap: 4px; background: #1e1b4b; border: 1px solid #312e81; border-radius: 5px; padding: 3px 8px; color: #a5b4fc; font-size: 10px; font-weight: 500; cursor: pointer; transition: background 0.12s, border-color 0.12s; white-space: nowrap; }
    #sp-model-selector-btn:hover { background: #312e81; border-color: #4338ca; }
    #sp-model-selector-btn .sp-chevron { font-size: 8px; transition: transform 0.15s; }
    #sp-model-selector-btn.open .sp-chevron { transform: rotate(180deg); }
    #sp-model-dropdown { display: none; position: absolute; top: 100%; right: 0; margin-top: 4px; min-width: 180px; max-height: 280px; overflow-y: auto; background: #13131a; border: 1px solid #1e1e2e; border-radius: 8px; padding: 4px; z-index: 200; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
    #sp-model-dropdown.open { display: block; }
    .sp-model-option { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 5px; cursor: pointer; transition: background 0.12s; font-size: 11px; color: #94a3b8; }
    .sp-model-option:hover { background: #1e1e2e; color: #e2e8f0; }
    .sp-model-option.selected { color: #a5b4fc; background: #1e1b4b; }
    .sp-model-option-check { width: 14px; text-align: center; font-size: 10px; flex-shrink: 0; }
    .sp-model-option-label { flex: 1; }
  `;
  document.head.appendChild(style);
}

function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'code',
      'pre',
      'a',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'span',
      'div',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'sup',
      'sub',
      'del',
      'ins',
      'mark',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'title', 'colspan', 'rowspan'],
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'textarea',
      'select',
      'button',
      'img',
    ],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'src',
      'class',
      'id',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

function renderMarkdown(text: string): string {
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code: string) => {
    return `<pre><code>${code.trimEnd()}</code></pre>`;
  });

  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Negative lookahead/behind avoids matching list bullets
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  html = html.replace(/^---+$/gm, '<hr>');

  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>$2');

  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Only allow http(s) URLs to block javascript: scheme injection
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match: string, text: string, url: string) => {
    const safeUrl = /^https?:\/\//i.test(url.trim()) ? url : '#';
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap block elements
      if (/^<(h[1-6]|ul|ol|li|pre|blockquote|hr)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
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
  const empty = document.getElementById('sp-empty')!;

  if (messages.length === 0) {
    empty.style.display = 'flex';
    // Remove all message nodes and reset counter
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    lastRenderedCount = 0;
    return;
  }

  empty.style.display = 'none';

  // Only append messages that haven't been rendered yet — avoids full DOM rebuild on each
  // streaming chunk and preserves browser focus/scroll state for already-rendered bubbles.
  if (lastRenderedCount > messages.length) {
    // Messages were cleared — rebuild from scratch
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    lastRenderedCount = 0;
  }

  for (let i = lastRenderedCount; i < messages.length; i++) {
    const msg = messages[i];
    if (msg) container.appendChild(buildBubble(msg));
  }
  lastRenderedCount = messages.length;

  scrollToBottom();
}

function showThinking(): void {
  const container = document.getElementById('sp-messages')!;
  const empty = document.getElementById('sp-empty')!;
  empty.style.display = 'none';

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

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null;
  start(): void;
  stop(): void;
};

function setupVoiceInput(micBtn: HTMLButtonElement, inputEl: HTMLTextAreaElement): void {
  const w = window as unknown as Record<string, unknown>;
  const SpeechRecognitionCtor: SpeechRecognitionCtor | undefined =
    (w['SpeechRecognition'] as SpeechRecognitionCtor | undefined) ??
    (w['webkitSpeechRecognition'] as SpeechRecognitionCtor | undefined);

  if (!SpeechRecognitionCtor) {
    micBtn.title = 'Voice input not supported in this browser';
    micBtn.style.opacity = '0.4';
    micBtn.style.cursor = 'not-allowed';
    return;
  }

  let recognition: InstanceType<SpeechRecognitionCtor> | null = null;
  let listening = false;

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition?.stop();
      return;
    }

    recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add('active');
      micBtn.innerHTML = '<span class="sp-mic-pulse"></span>';
      micBtn.title = 'Listening… click to stop';
    };

    recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
      const transcript = (event.results[0]?.[0]?.transcript ?? '') as string;
      if (transcript) {
        inputEl.value = inputEl.value ? `${inputEl.value} ${transcript}` : transcript;
        autoResizeInput(inputEl);
      }
    };

    recognition.onerror = () => {
      /* ignore */
    };

    recognition.onend = () => {
      listening = false;
      // Memory-leak guard: only update DOM if document is still active
      if (document.body) {
        micBtn.classList.remove('active');
        micBtn.innerHTML = '🎤';
        micBtn.title = 'Voice input';
      }
      recognition = null;
    };

    recognition.start();
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
  if (!text.trim() || isStreaming) return;

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
    messages.push(userMsg);
    saveMessages();
    renderMessages();

    capturePageContext()
      .then((ctx) => {
        if (ctx) pendingPageContext = ctx;

        const pageCtx = pendingPageContext;
        pendingPageContext = null;
        updateContextButton();

        const streamId = `a-${Date.now()}`;
        currentStreamId = streamId;
        isStreaming = true;
        updateSendButton();

        if (streamTimeoutHandle) clearTimeout(streamTimeoutHandle);
        streamTimeoutHandle = setTimeout(() => {
          if (isStreaming && currentStreamId === streamId) {
            handleStreamError(streamId, 'Response timed out. Please try again.');
          }
          streamTimeoutHandle = null;
        }, 90_000);

        showThinking();

        const history = messages
          .slice(0, -1)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        chrome.runtime.sendMessage(
          {
            type: 'CHAT_MESSAGE',
            id: streamId,
            text: actualPrompt,
            pageContext: pageCtx ?? undefined,
            conversationHistory: history,
            apiKey: currentApiKey ?? undefined,
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
  messages.push(userMsg);
  saveMessages();
  renderMessages();

  const pageCtx = pendingPageContext;
  pendingPageContext = null;
  updateContextButton();

  const streamId = `a-${Date.now()}`;
  currentStreamId = streamId;
  isStreaming = true;
  updateSendButton();

  // Safety timeout: if no chunks arrive within 90s, stop streaming to prevent stuck UI
  if (streamTimeoutHandle) clearTimeout(streamTimeoutHandle);
  streamTimeoutHandle = setTimeout(() => {
    if (isStreaming && currentStreamId === streamId) {
      handleStreamError(streamId, 'Response timed out. Please try again.');
    }
    streamTimeoutHandle = null;
  }, 90_000);

  showThinking();

  // Build conversation history (exclude the message we're about to send)
  const history = messages
    .slice(0, -1)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  chrome.runtime.sendMessage(
    {
      type: 'CHAT_MESSAGE',
      id: streamId,
      text: userMsg.content,
      pageContext: pageCtx ?? undefined,
      conversationHistory: history,
      apiKey: currentApiKey ?? undefined,
    },
    () => {
      if (chrome.runtime.lastError) {
        handleStreamError(streamId, chrome.runtime.lastError.message ?? 'Extension error');
      }
    },
  );
}

function handleStreamError(id: string, errorText: string): void {
  if (streamTimeoutHandle) {
    clearTimeout(streamTimeoutHandle);
    streamTimeoutHandle = null;
  }
  removeThinking();
  const assistantMsg: ChatMessage = {
    id,
    role: 'assistant',
    content: `Error: ${errorText}`,
    error: true,
    timestamp: Date.now(),
  };
  messages.push(assistantMsg);
  saveMessages();
  renderMessages();
  isStreaming = false;
  currentStreamId = null;
  updateSendButton();
}

function updateConnectionStatus(): void {
  const pill = document.getElementById('sp-status-pill');
  if (!pill) return;
  if (isConnected) {
    pill.className = 'connected';
    pill.innerHTML = '<span class="sp-status-dot"></span>Connected';
  } else {
    pill.className = 'disconnected';
    pill.innerHTML = '<span class="sp-status-dot"></span>Not Connected';
  }
}

async function validateAndSaveApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;

  currentApiKey = trimmed;
  saveApiKey(trimmed);

  // Optimistically mark connected — real validation happens when a message is sent
  isConnected = true;
  updateConnectionStatus();
}

let contextBtn: HTMLButtonElement | null = null;

function updateContextButton(): void {
  if (!contextBtn) return;
  if (pendingPageContext) {
    contextBtn.classList.add('has-context');
    contextBtn.title = 'Page context attached — click to remove';
    contextBtn.innerHTML = '✅ Page context';
  } else {
    contextBtn.classList.remove('has-context');
    contextBtn.title = 'Add page content to next message';
    contextBtn.innerHTML = '📄 Add page context';
  }
}

function updateModelBadge(modelId: string): void {
  const badge = document.getElementById('sp-model-badge');
  if (!badge) return;
  const short: Record<string, string> = {
    auto: 'Auto',
    'claude-sonnet-4-6': 'Sonnet 4.6',
    'claude-opus-4-6': 'Opus 4.6',
    'claude-haiku-4-5': 'Haiku 4.5',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-mini': 'GPT-5.4 Mini',
    'gemini-3.1-pro-preview': 'Gemini Pro',
    'gemini-3-flash': 'Gemini Flash',
    'mistral-large': 'Mistral',
    'deepseek-chat': 'DeepSeek',
    'ollama-local': 'Local',
  };
  badge.textContent = short[modelId] ?? modelId;
}

function updateSendButton(): void {
  const btn = document.getElementById('sp-send-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = isStreaming;
}

function updateToolsButton(): void {
  const btn = document.getElementById('sp-tools-btn');
  const dropdown = document.getElementById('sp-tools-dropdown');
  if (!btn || !dropdown) return;

  const count = discoveredTools.length;
  btn.innerHTML = `\uD83D\uDD27 AI Tools (${count})`;

  if (count === 0) {
    btn.classList.remove('has-context');
    dropdown.innerHTML = '<div class="sp-tools-empty">No tools discovered on this page</div>';
    return;
  }

  btn.classList.add('has-context');
  dropdown.innerHTML = '';
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

function buildUI(): void {
  document.body.innerHTML = '';

  const header = el('div', { id: 'sp-header' });
  const headerLeft = el('div', { id: 'sp-header-left' });
  headerLeft.appendChild(el('div', { id: 'sp-logo' }, '🤖'));
  const titleWrap = el('div', {});
  titleWrap.appendChild(el('div', { id: 'sp-title' }, 'AGI Workforce'));
  headerLeft.appendChild(titleWrap);

  const modelSelectorWrap = el('div', { class: 'sp-model-selector-wrap' });
  const modelSelectorBtn = el('button', { id: 'sp-model-selector-btn' });
  modelSelectorBtn.innerHTML =
    '<span id="sp-model-badge">AI Assistant</span><span class="sp-chevron">▾</span>';
  const modelDropdownEl = el('div', { id: 'sp-model-dropdown' });
  const modelOptionsList = [
    { value: 'auto', label: 'Auto (Best Available)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
    { value: 'gemini-3-flash', label: 'Gemini 3 Flash' },
    { value: 'mistral-large', label: 'Mistral Large' },
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'ollama-local', label: 'Ollama (Local)' },
  ];
  let currentModelValue = 'auto';
  function renderModelDropdown(): void {
    modelDropdownEl.innerHTML = '';
    for (const m of modelOptionsList) {
      const opt = el('div', {
        class: `sp-model-option${m.value === currentModelValue ? ' selected' : ''}`,
      });
      opt.appendChild(
        el('span', { class: 'sp-model-option-check' }, m.value === currentModelValue ? '✓' : ''),
      );
      opt.appendChild(el('span', { class: 'sp-model-option-label' }, m.label));
      opt.addEventListener('click', () => {
        currentModelValue = m.value;
        chrome.storage.local.set({ agi_model: m.value }).catch(() => {});
        updateModelBadge(m.value);
        renderModelDropdown();
        modelDropdownEl.classList.remove('open');
        modelSelectorBtn.classList.remove('open');
      });
      modelDropdownEl.appendChild(opt);
    }
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
  chrome.storage.local.get('agi_model', (result) => {
    if (chrome.runtime.lastError) return;
    const stored = result['agi_model'] as string | undefined;
    if (stored) currentModelValue = stored;
    updateModelBadge(stored ?? 'auto');
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
    if (isStreaming) return;
    sendMessage('/summarize');
  });
  headerRight.appendChild(summarizeBtn);

  const clearBtn = el(
    'button',
    { class: 'sp-icon-btn', id: 'sp-clear-btn', title: 'Clear conversation' },
    '🗑',
  );
  clearBtn.addEventListener('click', () => {
    if (streamTimeoutHandle) {
      clearTimeout(streamTimeoutHandle);
      streamTimeoutHandle = null;
    }
    messages.length = 0;
    lastRenderedCount = 0;
    isStreaming = false;
    currentStreamId = null;
    pendingPageContext = null;
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
    placeholder: 'ws://localhost:8765',
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
      if (entries) entries.innerHTML = '';
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
  statusPill.innerHTML = '<span class="sp-status-dot"></span>Not Connected';

  authBar.appendChild(authInput);
  authBar.appendChild(authSaveBtn);
  authBar.appendChild(statusPill);
  document.body.appendChild(authBar);

  const saveKey = (): void => {
    const val = authInput.value.trim();
    if (!val) {
      // Clear key
      currentApiKey = null;
      isConnected = false;
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
  const emptyState = el('div', { id: 'sp-empty' });
  emptyState.innerHTML = `
    <div id="sp-empty-icon">🤖</div>
    <div id="sp-empty-title">AGI Workforce Assistant</div>
    <div id="sp-empty-hint">Ask anything about the current page,<br>or try a slash command:</div>
    <div id="sp-empty-cmds">
      <span class="sp-cmd-chip">/summarize</span>
      <span class="sp-cmd-chip">/explain</span>
      <span class="sp-cmd-chip">/translate</span>
      <span class="sp-cmd-chip">/extract</span>
      <span class="sp-cmd-chip">/tldr</span>
      <span class="sp-cmd-chip">/code</span>
    </div>
  `;
  msgsArea.appendChild(emptyState);
  chatPanel.appendChild(msgsArea);
  document.body.appendChild(chatPanel);

  setTimeout(() => {
    const chips = document.querySelectorAll('.sp-cmd-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const cmd = chip.textContent?.trim();
        if (cmd) sendMessage(cmd);
      });
    });
  }, 0);

  const workflowsPanel = el('div', { id: 'sp-workflows' });

  const recordSection = el('div', { class: 'sp-wf-section' });
  const recordHeader = el('div', { class: 'sp-wf-section-header' });
  recordHeader.appendChild(el('div', { class: 'sp-wf-section-title' }, 'Recording'));
  recordSection.appendChild(recordHeader);
  const recordBar = el('div', { class: 'sp-wf-record-bar' });
  const recordBtn = el('button', { class: 'sp-wf-record-btn', id: 'sp-wf-record-btn' });
  recordBtn.innerHTML = '<span class="sp-wf-record-dot"></span> Record';
  const actionCounter = el('div', { class: 'sp-wf-action-counter', id: 'sp-wf-action-counter' });
  actionCounter.style.display = 'none';
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
          const counter = document.getElementById('sp-wf-action-counter');
          if (counter)
            counter.innerHTML = `<strong>${recordingActionCount}</strong> actions recorded`;
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
          const origText = recordBtn.innerHTML;
          recordBtn.innerHTML = '<span class="sp-wf-record-dot"></span> Error';
          setTimeout(() => {
            recordBtn.innerHTML = origText;
          }, 1500);
          return;
        }
        isRecording = false;
        stopRecordingPoll();
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = '<span class="sp-wf-record-dot"></span> Record';
        actionCounter.style.display = 'none';
        saveDialog.classList.add('open');
        saveNameInput.value = '';
        saveNameInput.focus();
      });
    } else {
      chrome.runtime.sendMessage({ type: 'START_RECORDING' }, () => {
        if (chrome.runtime.lastError) {
          const origText = recordBtn.innerHTML;
          recordBtn.innerHTML = '<span class="sp-wf-record-dot"></span> Error';
          setTimeout(() => {
            recordBtn.innerHTML = origText;
          }, 1500);
          return;
        }
        isRecording = true;
        recordingActionCount = 0;
        recordBtn.classList.add('recording');
        recordBtn.innerHTML = '<span class="sp-wf-record-dot"></span> Stop';
        actionCounter.style.display = '';
        actionCounter.innerHTML = '<strong>0</strong> actions recorded';
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
  shortcutsTitle.innerHTML =
    'Saved Shortcuts <span class="sp-wf-count-badge" id="sp-wf-shortcuts-count">0</span>';
  shortcutsSectionHeader.appendChild(shortcutsTitle);
  shortcutsSection.appendChild(shortcutsSectionHeader);
  const wfShortcutsList = el('div', { class: 'sp-wf-shortcuts-list', id: 'sp-wf-shortcuts-list' });
  wfShortcutsList.innerHTML = '<div class="sp-wf-empty">Record your first workflow</div>';
  shortcutsSection.appendChild(wfShortcutsList);
  workflowsPanel.appendChild(shortcutsSection);

  const tasksSection = el('div', { class: 'sp-wf-section' });
  const tasksSectionHeader = el('div', { class: 'sp-wf-section-header' });
  const tasksTitle = el('div', { class: 'sp-wf-section-title' });
  tasksTitle.innerHTML =
    'Scheduled Tasks <span class="sp-wf-count-badge" id="sp-wf-tasks-count">0</span>';
  tasksSectionHeader.appendChild(tasksTitle);
  const newTaskBtn = el(
    'button',
    { class: 'sp-wf-new-task-btn', id: 'sp-wf-new-task-btn' },
    '+ New Task',
  );
  tasksSectionHeader.appendChild(newTaskBtn);
  tasksSection.appendChild(tasksSectionHeader);
  const wfTasksList = el('div', { class: 'sp-wf-tasks-list', id: 'sp-wf-tasks-list' });
  wfTasksList.innerHTML = '<div class="sp-wf-empty">No scheduled tasks</div>';
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

  contextBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-context-btn',
    title: 'Add page content to next message',
  });
  contextBtn.innerHTML = '📄 Add page context';
  contextBtn.addEventListener('click', async () => {
    if (pendingPageContext) {
      pendingPageContext = null;
      updateContextButton();
      return;
    }
    contextBtn!.innerHTML = '⏳ Capturing…';
    contextBtn!.disabled = true;
    const ctx = await capturePageContext();
    contextBtn!.disabled = false;
    if (ctx) {
      pendingPageContext = ctx;
    }
    updateContextButton();
  });
  toolbar.appendChild(contextBtn);

  const micBtn = el('button', { class: 'sp-tool-btn', id: 'sp-mic-btn', title: 'Voice input' });
  micBtn.innerHTML = '🎤';
  toolbar.appendChild(micBtn);

  const groupBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-group-btn',
    title: 'Add current tab to AGI Workforce group',
  });
  groupBtn.innerHTML = '📂 Group';
  let isGrouped = false;
  groupBtn.addEventListener('click', () => {
    const msgType = isGrouped ? 'REMOVE_TAB_FROM_GROUP' : 'ADD_TAB_TO_GROUP';
    chrome.runtime.sendMessage(
      { type: msgType },
      (response: { success?: boolean; grouped?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !response?.success) return;
        isGrouped = response.grouped ?? false;
        groupBtn.innerHTML = isGrouped ? '📂 Ungroup' : '📂 Group';
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
  shortcutsBtn.innerHTML = '⚡ Shortcuts';

  const shortcutsDropdown = el('div', { id: 'sp-shortcuts-dropdown' });
  shortcutsDropdown.innerHTML = '<div class="sp-shortcuts-empty">No saved shortcuts</div>';

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
  toolsBtn.innerHTML = '\uD83D\uDD27 AI Tools (0)';

  const toolsDropdown = el('div', { id: 'sp-tools-dropdown' });
  toolsDropdown.innerHTML = '<div class="sp-tools-empty">No tools discovered on this page</div>';

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
  sendBtn.innerHTML = '↑';
  sendBtn.addEventListener('click', () => {
    const text = inputEl.value;
    inputEl.value = '';
    autoResizeInput(inputEl);
    sendMessage(text);
  });

  inputRow.appendChild(inputEl);
  inputRow.appendChild(sendBtn);
  inputArea.appendChild(inputRow);
  document.body.appendChild(inputArea);

  setupVoiceInput(micBtn, inputEl);
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
      entries.innerHTML = '';
      const logs = response.logs ?? [];
      if (logs.length === 0) {
        entries.innerHTML =
          '<div style="padding:10px 8px;color:#475569;font-size:11px;text-align:center">No console logs captured</div>';
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
      dropdown.innerHTML = '';
      const shortcuts = response.shortcuts ?? [];
      if (shortcuts.length === 0) {
        dropdown.innerHTML = '<div class="sp-shortcuts-empty">No saved shortcuts</div>';
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
            shortcuts?: Array<{ id: string; name: string; actions: unknown[]; createdAt: number }>;
          }
        | undefined,
    ) => {
      if (chrome.runtime.lastError || !response?.success) return;
      const list = document.getElementById('sp-wf-shortcuts-list');
      const countBadge = document.getElementById('sp-wf-shortcuts-count');
      if (!list) return;
      list.innerHTML = '';
      const shortcuts = response.shortcuts ?? [];
      if (countBadge) countBadge.textContent = String(shortcuts.length);
      if (shortcuts.length === 0) {
        list.innerHTML = '<div class="sp-wf-empty">Record your first workflow</div>';
        return;
      }
      for (const sc of shortcuts) {
        const item = el('div', { class: 'sp-wf-shortcut-item' });
        item.appendChild(el('div', { class: 'sp-wf-shortcut-icon' }, '⚡'));
        const info = el('div', { class: 'sp-wf-shortcut-info' });
        info.appendChild(el('div', { class: 'sp-wf-shortcut-name' }, sc.name));
        const actionsCount = Array.isArray(sc.actions) ? sc.actions.length : 0;
        const dateStr = new Date(sc.createdAt).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        });
        info.appendChild(
          el('div', { class: 'sp-wf-shortcut-meta' }, `${actionsCount} actions · ${dateStr}`),
        );
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
      list.innerHTML = '';
      const tasks = response.tasks ?? [];
      if (countBadge) countBadge.textContent = String(tasks.length);
      if (tasks.length === 0) {
        list.innerHTML = '<div class="sp-wf-empty">No scheduled tasks</div>';
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
  if (chunk.id !== currentStreamId) return;

  if (chunk.error) {
    handleStreamError(chunk.id, chunk.error);
    return;
  }

  if (!messages.find((m) => m.id === chunk.id)) {
    removeThinking();
    const assistantMsg: ChatMessage = {
      id: chunk.id,
      role: 'assistant',
      content: chunk.text,
      streaming: true,
      timestamp: Date.now(),
    };
    messages.push(assistantMsg);
    renderMessages();
  } else {
    const existing = messages.find((m) => m.id === chunk.id)!;
    existing.content += chunk.text;
    updateStreamingBubble(chunk.id, existing.content, chunk.done);
  }

  if (chunk.done) {
    if (streamTimeoutHandle) {
      clearTimeout(streamTimeoutHandle);
      streamTimeoutHandle = null;
    }
    const existing = messages.find((m) => m.id === chunk.id);
    if (existing) {
      existing.streaming = false;
    }
    removeThinking();
    isStreaming = false;
    currentStreamId = null;
    updateSendButton();
    saveMessages();
    renderMessages();
  }
});

injectStyles();
buildUI();

Promise.all([
  loadApiKey().then((key) => {
    if (key) {
      currentApiKey = key;
      isConnected = true;
      updateConnectionStatus();
    }
  }),
  loadMessages().then(() => {
    if (messages.length > 0) {
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
            if (ctx) pendingPageContext = ctx;
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
