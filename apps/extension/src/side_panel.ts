/**
 * Side panel — AGI Workforce streaming chat interface
 * Pure DOM/TypeScript, no framework. CSS injected via <style> tag.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── State ───────────────────────────────────────────────────────────────────

const messages: ChatMessage[] = [];
let pendingPageContext: string | null = null;
let isStreaming = false;
let currentStreamId: string | null = null;

// ─── CSS ─────────────────────────────────────────────────────────────────────

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
  `;
  document.head.appendChild(style);
}

// ─── Markdown renderer (regex-based, no deps) ────────────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code: string) => {
    return `<pre><code>${code.trimEnd()}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold + italic (*** or ___)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold (** or __)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic (* or _) — avoid matching list bullets
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');

  // Unordered lists
  html = html.replace(/^[*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>$2');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );

  // Paragraphs — double newlines become paragraph breaks
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

// ─── DOM helpers ─────────────────────────────────────────────────────────────

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

// ─── Render ──────────────────────────────────────────────────────────────────

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
    bubble.innerHTML = renderMarkdown(msg.content);
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
    // Remove all message nodes
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    return;
  }

  empty.style.display = 'none';

  // Rebuild from scratch (simple enough for chat — messages rarely exceed dozens)
  container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
  for (const msg of messages) {
    container.appendChild(buildBubble(msg));
  }

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
  bubble.innerHTML = renderMarkdown(fullText);
  if (done) {
    bubble.classList.remove('sp-cursor');
  } else {
    bubble.classList.add('sp-cursor');
  }
  scrollToBottom();
}

// ─── Page context ─────────────────────────────────────────────────────────────

async function capturePageContext(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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

// ─── Voice input ─────────────────────────────────────────────────────────────

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recognition: any = null;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
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
      micBtn.classList.remove('active');
      micBtn.innerHTML = '🎤';
      micBtn.title = 'Voice input';
      recognition = null;
    };

    recognition.start();
  });
}

// ─── Send message ─────────────────────────────────────────────────────────────

function sendMessage(text: string): void {
  if (!text.trim() || isStreaming) return;

  const userMsg: ChatMessage = {
    id: `u-${Date.now()}`,
    role: 'user',
    content: text.trim(),
    timestamp: Date.now(),
  };
  messages.push(userMsg);
  renderMessages();

  const pageCtx = pendingPageContext;
  pendingPageContext = null;
  updateContextButton();

  const streamId = `a-${Date.now()}`;
  currentStreamId = streamId;
  isStreaming = true;
  updateSendButton();

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
    },
    () => {
      // Acknowledge — streaming chunks arrive via onMessage
      if (chrome.runtime.lastError) {
        handleStreamError(streamId, chrome.runtime.lastError.message ?? 'Extension error');
      }
    },
  );
}

function handleStreamError(id: string, errorText: string): void {
  removeThinking();
  const assistantMsg: ChatMessage = {
    id,
    role: 'assistant',
    content: `Error: ${errorText}`,
    error: true,
    timestamp: Date.now(),
  };
  messages.push(assistantMsg);
  renderMessages();
  isStreaming = false;
  currentStreamId = null;
  updateSendButton();
}

// ─── Update helpers ───────────────────────────────────────────────────────────

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

function updateSendButton(): void {
  const btn = document.getElementById('sp-send-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = isStreaming;
}

function autoResizeInput(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
}

// ─── Build UI ─────────────────────────────────────────────────────────────────

function buildUI(): void {
  document.body.innerHTML = '';

  // Header
  const header = el('div', { id: 'sp-header' });
  const headerLeft = el('div', { id: 'sp-header-left' });
  headerLeft.appendChild(el('div', { id: 'sp-logo' }, '🤖'));
  const titleWrap = el('div', {});
  titleWrap.appendChild(el('div', { id: 'sp-title' }, 'AGI Workforce'));
  titleWrap.appendChild(el('div', { id: 'sp-model-badge' }, 'AI Assistant'));
  headerLeft.appendChild(titleWrap);
  header.appendChild(headerLeft);

  const headerRight = el('div', { id: 'sp-header-right' });
  const clearBtn = el(
    'button',
    { class: 'sp-icon-btn', id: 'sp-clear-btn', title: 'Clear conversation' },
    '🗑',
  );
  clearBtn.addEventListener('click', () => {
    messages.length = 0;
    isStreaming = false;
    currentStreamId = null;
    pendingPageContext = null;
    updateContextButton();
    updateSendButton();
    renderMessages();
  });
  headerRight.appendChild(clearBtn);
  header.appendChild(headerRight);
  document.body.appendChild(header);

  // Messages area
  const msgsArea = el('div', { id: 'sp-messages' });
  const emptyState = el('div', { id: 'sp-empty' });
  emptyState.innerHTML = `
    <div id="sp-empty-icon">🤖</div>
    <div id="sp-empty-title">AGI Workforce Assistant</div>
    <div id="sp-empty-hint">Ask anything about the current page,<br>or start a conversation below.</div>
  `;
  msgsArea.appendChild(emptyState);
  document.body.appendChild(msgsArea);

  // Toolbar (page context + mic)
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

  document.body.appendChild(toolbar);

  // Input area
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

  // Wire up voice after DOM is ready
  setupVoiceInput(micBtn, inputEl);

  // Initial render
  renderMessages();
}

// ─── Message listener (streaming chunks) ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const chunk = msg as ChatChunk;
  if (chunk.type !== 'CHAT_CHUNK') return;
  if (chunk.id !== currentStreamId) return;

  if (chunk.error) {
    handleStreamError(chunk.id, chunk.error);
    return;
  }

  // First chunk — remove thinking dots, add assistant message
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
    // Append to existing streaming message
    const existing = messages.find((m) => m.id === chunk.id)!;
    existing.content += chunk.text;
    updateStreamingBubble(chunk.id, existing.content, chunk.done);
  }

  if (chunk.done) {
    const existing = messages.find((m) => m.id === chunk.id);
    if (existing) {
      existing.streaming = false;
    }
    removeThinking();
    isStreaming = false;
    currentStreamId = null;
    updateSendButton();
    // Final render to remove cursor
    renderMessages();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

injectStyles();
buildUI();
