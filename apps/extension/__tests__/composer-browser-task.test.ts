import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyTaskLocally } from '@agiworkforce/routing';
import type { ComputerUseCommandResponse } from '../src/types';
import { isTrustedExtensionPageSender } from '../src/background/policy';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import { getModelMetadataById, isAutoModeModelId, modelsCatalog } from '@agiworkforce/types';
import {
  applyBrowserActivityEvent,
  pageContextStillDescribes,
  resolveComposerPrompt,
  requestsCurrentPageContext,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';
import {
  BrowserRunActivityTranslator,
  browserActivityEnvelope,
} from '../src/features/computer-use/browserTurnActivity';
import { buildBrowserApprovalCard } from '../src/features/side-panel/computerUsePanel';
import { buildBrowserTurnControls } from '../src/features/side-panel/bubbles';
import { parseBrowserUploadBinding } from '../src/features/computer-use/userFileUpload';

const catalog = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../_locales/en/messages.json'),
    'utf8',
  ),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

function getMessage(key: string, substitutions: string[] = []): string {
  const entry = catalog[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const browserStart = source.indexOf('interface ComposerBrowserRun');
const browserEnd = source.indexOf('function cancelCurrentManagedStream', browserStart);
const browserSource = source.slice(browserStart, browserEnd);
const browserControlsStart = source.indexOf("cuPanel.panelEl.querySelector('.sp-cu-stop-btn')");
const browserControlsSource = source.slice(
  browserControlsStart,
  source.indexOf('const viewTabs', browserControlsStart),
);
const sendSource = program.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      [
        'sendMessage',
        'canAdmitComposerMessage',
        'dispatchTurn',
        'continueTurnWithMemory',
        'continueTurn',
        'postTurn',
        'sendChatTurn',
        'selectedModelSupportsChatTools',
      ].includes(node.name?.text ?? ''),
  )
  .map((node) => node.getText(program))
  .join('\n');

const IMAGE_DATA_URL = 'data:image/png;base64,AA==';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

interface RunSnapshot {
  runId: string;
  startSent: boolean;
  cancelling: boolean;
  controls: { element: HTMLElement; cards: HTMLElement };
}

interface HarnessAPI {
  sendMessage(text: string): void;
  startComposerBrowserTask(goal: string): void;
  cancelComposerBrowserTask(reason?: 'user_stopped' | 'user_cleared'): void;
  applyComposerBrowserMessage(message: Record<string, unknown>): void;
  canAdmitComposerMessage(text: string): boolean;
  getRun(): RunSnapshot | null;
}

function harness() {
  let panelRun: string | null = null;
  const panelEl = document.createElement('div');
  const stopButton = document.createElement('button');
  stopButton.className = 'sp-cu-stop-btn';
  const clearButton = document.createElement('button');
  clearButton.className = 'sp-cu-clear-btn';
  panelEl.append(stopButton, clearButton);
  const defaultStop = vi.fn();
  stopButton.addEventListener('click', defaultStop);
  const context = {
    managedCloudOwner: { accountId: 'user-a', authIncarnation: 'session-a' },
    conversationId: 'conversation-a',
    conversationGeneration: 1,
    selectedModel: 'catalog-selected-browser-model',
    messages: [] as SidePanelChatMessage[],
    isStreaming: false,
    currentStreamId: null as string | null,
    quickMode: false,
    pendingPageContext: null,
    needsMessageRebuild: false,
  };
  const query = vi.fn(async () => [{ id: 7, url: 'https://example.com/form' }]);
  const send = vi.fn(
    async (message: Record<string, unknown>): Promise<ComputerUseCommandResponse> => {
      if (message.type === 'AGI_START_COMPUTER_USE') {
        return { success: true, runId: String(message.runId), runGeneration: 2 };
      }
      return { success: true, running: false };
    },
  );
  const panel = {
    panelEl,
    clearLog: vi.fn(),
    setRunState: vi.fn((running: boolean, runId: string) => {
      panelRun = running ? runId : null;
    }),
    ownsRun: (runId: string) => panelRun === runId,
    hideHandoffBanner: vi.fn(),
    showHandoffBanner: vi.fn(),
  };
  const saveMessages = vi.fn();
  const pendingAttachments: { dataUrl: string; mimeType: string }[] = [];
  const dependencies = {
    _ctx: context,
    chrome: { tabs: { query }, runtime: { sendMessage: send } },
    cuPanel: panel,
    BrowserRunActivityTranslator,
    browserActivityEnvelope,
    applyBrowserActivityEvent,
    buildBrowserTurnControls,
    buildBrowserApprovalCard,
    parseBrowserUploadBinding,
    isAutoModeModelId,
    getModelMetadataById,
    activeBrowserToolTier: vi.fn(async () => 'read'),
    hasHistoryPermission: vi.fn(async () => false),
    activePageQuery: async () => ({ active: true, currentWindow: true }),
    activePageSource: { tabId: 7, url: 'https://example.com/form' },
    sameManagedCloudOwner,
    pageContextStillDescribes,
    PAGE_CONTEXT_CHANGED_REASON: 'The active page changed before the task started.',
    describeCancellationReason: (reason: unknown) =>
      reason === 'user_stopped' ? 'Browser task stopped.' : null,
    saveMessages,
    saveMessagesNow: vi.fn(async () => saveMessages()),
    renderMessages: vi.fn(),
    updateSendButton: vi.fn(),
    updateContextButton: vi.fn(),
    updateAgentPageIndicator: vi.fn(),
    clearPendingPageContext: vi.fn(),
    trimLiveMessages: vi.fn(),
    classifyTaskLocally,
    resolveComposerPrompt,
    requestsCurrentPageContext,
    managedCloudChatState: 'ready',
    stoppingStreamId: null,
    projectChatAwaitsAccountCopy: () => false,
    ensureProjectChatInAccount: vi.fn(async () => true),
    ensureTemporaryConversation: vi.fn(async () => 'temporary-conversation'),
    renderMemoryNotice: vi.fn(),
    MEMORY_COMMAND_HINT: /(?!)/u,
    runChatMemoryCommand: vi.fn(async () => undefined),
    setThinkingLabel: vi.fn(),
    showThinking: vi.fn(),
    t: getMessage,
    capabilityAllowed: () => true,
    capabilityDocument: {},
    selectedModelImageLimitNotice: () => null,
    composerImageCount: () => pendingAttachments.length,
    pendingDocuments: [] as unknown[],
    pendingBrowserContextTabs: [] as unknown[],
    promptShortcuts: [],
    expandPromptShortcut: (prompt: string) => prompt,
    advanceConversationGeneration: vi.fn(),
    renderModelNotice: vi.fn(),
    takeComposerDocuments: () => [],
    turnAttachmentDescriptors: () => [],
    pageReference: (source: unknown) => source,
    turnPayloadByMessageId: new Map(),
    hasUnconfirmedStreamCancellation: () => false,
    managedQuickModeActive: () => context.quickMode,
    historyRestoreInProgress: false,
    composerAttachmentIntakes: new Set(),
    composerDocumentsSettled: () => true,
    pendingAttachmentCount: () => pendingAttachments.length,
    composerVideoMode: false,
    composerSkill: null as string | null,
    canCreateVideos: () => false,
    startVideoTurn: vi.fn(),
    pendingAttachments,
    extensionSendQueue: { enqueue: vi.fn(), dequeue: vi.fn() },
    QueueFullError: Error,
    expandSlashCommand: (prompt: string) =>
      prompt.startsWith('/')
        ? { display: prompt, prompt: 'Summarize the page', captureContext: true }
        : null,
    capturePageContextWithSiteAccess: vi.fn(() => dependencies.capturePageContext()),
    capturePageContext: vi.fn(
      async (): Promise<
        | { ok: true; text: string; source: { tabId: number; url: string } }
        | { ok: false; reason: string }
      > => ({ ok: false, reason: 'capture permission denied' }),
    ),
    handleStreamError: vi.fn(),
    updateAttachmentPreview: vi.fn(),
    beginManagedStream: vi.fn(() => {
      context.isStreaming = true;
      context.currentStreamId = 'chat-stream';
      return 'chat-stream';
    }),
    selectModelHistory: vi.fn(() => []),
    managedOutboundRoutingPayload: () => ({}),
    managedTurnPersistencePayload: () => ({}),
    PAGE_CONTEXT_EMPTY_REASON: 'No page context',
    SIDE_PANEL_CLIENT_INSTANCE_ID: 'panel-client',
  };
  const compiled = ts.transpileModule(
    `let composerContextNotice = null;
     let composerAttachmentNotice = null;
     let lastStreamPersistAtMs = 0;
     ${browserSource}\n${sendSource}\n${browserControlsSource}
     return {sendMessage, startComposerBrowserTask, cancelComposerBrowserTask,
       applyComposerBrowserMessage, canAdmitComposerMessage,
       getRun: () => composerBrowserRun};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const api = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as HarnessAPI;
  return {
    api,
    context,
    query,
    send,
    panel,
    saveMessages,
    dependencies,
    pendingAttachments,
    stopButton,
    clearButton,
    defaultStop,
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('browser tasks from the real composer functions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('chrome', { i18n: { getMessage, getUILanguage: () => 'en' } });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('accepts background lifecycle events and rejects content-script or foreign sender claims', () => {
    const listenerStart = source.indexOf(
      'chrome.runtime.onMessage.addListener((msg: unknown, sender: chrome.runtime.MessageSender) => {',
    );
    expect(listenerStart).toBeGreaterThan(-1);
    const bodyStart = source.indexOf('=> {', listenerStart) + 4;
    const bodyEnd = source.indexOf('const m = msg as Record<string, unknown>;', bodyStart);
    const compiled = ts.transpileModule(
      `return function(msg, sender) {${source.slice(bodyStart, bodyEnd)} return true;};`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    );
    // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
    const accepts = new Function('isTrustedExtensionPageSender', 'chrome', compiled.outputText)(
      isTrustedExtensionPageSender,
      { runtime: { id: 'extension-a', getURL: () => 'chrome-extension://extension-a/' } },
    ) as (message: object, sender: chrome.runtime.MessageSender) => boolean | undefined;
    const event = { type: 'AGI_CU_STATE', status: 'completed', runId: 'cu_run_a' };
    expect(
      accepts(event, { id: 'extension-a', url: 'chrome-extension://extension-a/background.js' }),
    ).toBe(true);
    expect(
      accepts(event, {
        id: 'extension-a',
        url: 'https://example.com',
        tab: { id: 7, url: 'https://example.com' } as chrome.tabs.Tab,
      }),
    ).toBeUndefined();
    expect(
      accepts(event, { id: 'extension-b', url: 'chrome-extension://extension-b/background.js' }),
    ).toBeUndefined();
  });

  it('routes an explicit click through computer use with the admitted model', async () => {
    const h = harness();
    h.api.sendMessage('Click the Update preview button');
    h.context.selectedModel = 'later-model-selection';
    await settle();
    expect(h.send).toHaveBeenCalledWith({
      type: 'AGI_START_COMPUTER_USE',
      runId: h.api.getRun()?.runId,
      goal: 'Click the Update preview button',
      tabId: 7,
      modelSelection: 'catalog-selected-browser-model',
      historyConversationId: 'conversation-a',
    });
    expect(h.context.messages[0]).toMatchObject({
      role: 'user',
      content: 'Click the Update preview button',
    });
    expect(h.context.messages[1]?.streaming).toBe(true);
    expect(h.context.messages[1]?.cloudAgentRun).toBeUndefined();
    expect(h.context.messages[1]?.provider).toBeUndefined();
  });

  it('keeps ordinary chat on CHAT_MESSAGE', async () => {
    const h = harness();
    h.api.sendMessage('What does clicking this button do?');
    await settle();
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CHAT_MESSAGE', text: 'What does clicking this button do?' }),
      expect.any(Function),
    );
    expect(h.api.getRun()).toBeNull();
  });

  it.each([
    'Click Submit test file locally on this local test page. Do not select another file. Read its upload confirmation and report the byte count and SHA-256.',
    'Please click Update preview on the current page',
    'Use the browser on this local test page to hover the Hover card, double-click Double-click details, right-click Open local context menu, then choose Beta in Choose a category with select_option. Read the DOM and report the actual states. Do not submit any form.',
    'On this page, click Update preview',
    'Use the browser to perform a horizontal swipe inside Swipe area. Verify the page reports the actual swipe result.',
  ])('routes a named page action through the published classifier: %s', async (goal) => {
    const h = harness();
    h.api.sendMessage(goal);
    await settle();
    expect(h.send).toHaveBeenCalledExactlyOnceWith({
      type: 'AGI_START_COMPUTER_USE',
      runId: h.api.getRun()?.runId,
      goal,
      tabId: 7,
      modelSelection: 'catalog-selected-browser-model',
      historyConversationId: 'conversation-a',
    });
    expect(h.context.messages[0]?.content).toBe(goal);
  });

  it.each([
    'Explain how to click Submit test file locally on this local test page',
    'Write code to click Submit test file locally on this local test page',
    'Click handlers on this local test page need debugging',
    'Do not click Submit test file locally on this local test page',
    'The page says: Click Submit test file locally on this local test page',
    '"Click Submit test file locally on this local test page"',
    'Use the browser on this local test page to explain how to click Submit',
    'Use the browser on this local test page to write Playwright code',
    'Do not use the browser on this local test page to click Submit',
    'The instructions say: Use the browser on this local test page to click Submit',
    'On this page, click handlers are disabled',
    'On this page, do not click Submit',
    'Use the browser to perform code analysis of a swipe handler',
    'Use the browser to perform an explanation of a horizontal swipe',
    'Do not use the browser to perform a horizontal swipe inside Swipe area',
  ])('keeps advice, refusal and quoted page-action text in chat: %s', async (text) => {
    const h = harness();
    h.api.sendMessage(text);
    await settle();
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CHAT_MESSAGE', text }),
      expect.any(Function),
    );
    expect(h.api.getRun()).toBeNull();
  });

  it('preserves slash page-context capture and attached chat rather than admitting browser control', async () => {
    const h = harness();
    h.api.sendMessage('/summarize click the button');
    await settle();
    expect(h.dependencies.capturePageContext).toHaveBeenCalledOnce();
    expect(h.send).not.toHaveBeenCalled();
    const attached = harness();
    attached.pendingAttachments.push({ dataUrl: IMAGE_DATA_URL, mimeType: 'image/png' });
    attached.api.sendMessage('Click the Update preview button');
    await settle();
    expect(attached.api.getRun()).toBeNull();
    expect(attached.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CHAT_MESSAGE', attachments: [IMAGE_DATA_URL] }),
      expect.any(Function),
    );
  });

  it('answers a natural-language page request using the same bounded capture path', async () => {
    const h = harness();
    h.dependencies.capturePageContext.mockResolvedValue({
      ok: true,
      text: 'The actual page contains 46 trial plots.',
      source: { tabId: 7, url: 'https://example.com/form' },
    });
    h.api.sendMessage('Summarize this page.');
    await settle();
    expect(h.dependencies.capturePageContext).toHaveBeenCalledOnce();
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CHAT_MESSAGE',
        text: 'Summarize this page.',
        pageContext: 'The actual page contains 46 trial plots.',
      }),
      expect.any(Function),
    );
    expect(h.api.getRun()).toBeNull();
  });

  it('does not send a page request without the page when capture is refused', async () => {
    const h = harness();
    h.api.sendMessage('What is on this page?');
    await settle();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.dependencies.handleStreamError).toHaveBeenCalledWith(
      'chat-stream',
      'capture permission denied',
    );
  });

  it('blocks a second submit immediately while the active tab query is pending', async () => {
    const h = harness();
    const tab = deferred<{ id: number; url: string }[]>();
    h.query.mockReturnValue(tab.promise);
    h.api.sendMessage('Click the Update preview button');
    h.api.sendMessage('Fill the name field');
    expect(h.context.messages).toHaveLength(2);
    expect(h.api.canAdmitComposerMessage('Click the next button')).toBe(false);
    tab.resolve([{ id: 7, url: 'https://example.com/form' }]);
    await settle();
    expect(h.send).toHaveBeenCalledOnce();
  });

  it('does not start after Stop cancels a delayed tab query', async () => {
    const h = harness();
    const tab = deferred<{ id: number; url: string }[]>();
    h.query.mockReturnValue(tab.promise);
    h.api.sendMessage('Fill the name field');
    h.stopButton.click();
    tab.resolve([{ id: 7, url: 'https://example.com/form' }]);
    await settle();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.context.messages[1]).toMatchObject({
      streaming: false,
      content: 'Browser task stopped before it started.',
    });
    expect(h.context.isStreaming).toBe(false);
    expect(h.defaultStop).not.toHaveBeenCalled();
  });

  it('clears the existing task log and cancels pending admission without a duplicate request', async () => {
    const h = harness();
    const start = deferred<{ success: boolean; runId: string; runGeneration: number }>();
    h.send.mockImplementation(async (message) =>
      message.type === 'AGI_START_COMPUTER_USE' ? start.promise : { success: true, running: false },
    );
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    h.clearButton.click();
    await settle();
    expect(h.panel.clearLog).toHaveBeenCalledOnce();
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send).toHaveBeenLastCalledWith({
      type: 'CANCEL_COMPUTER_USE',
      runId,
      reason: 'user_cleared',
    });
    expect(h.context.isStreaming).toBe(false);
    start.resolve({ success: true, runId, runGeneration: 3 });
    await settle();
    expect(h.api.getRun()).toBeNull();
  });

  it('cancels the exact pending admission and ignores its delayed start acknowledgement', async () => {
    const h = harness();
    const start = deferred<{ success: boolean; runId: string; runGeneration: number }>();
    h.send.mockImplementation(async (message) =>
      message.type === 'AGI_START_COMPUTER_USE' ? start.promise : { success: true, running: false },
    );
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    h.api.cancelComposerBrowserTask();
    await settle();
    expect(h.send).toHaveBeenLastCalledWith({
      type: 'CANCEL_COMPUTER_USE',
      runId,
      reason: 'user_stopped',
    });
    start.resolve({ success: true, runId, runGeneration: 3 });
    await settle();
    expect(h.api.getRun()).toBeNull();
    expect(h.context.isStreaming).toBe(false);
    expect(h.panel.ownsRun(runId)).toBe(false);
  });

  it('surfaces permission refusal in the transcript and restores Send', async () => {
    const h = harness();
    h.send.mockResolvedValue({
      success: false,
      error: 'Browser control is not allowed for this site.',
    });
    h.api.sendMessage('Fill the name field');
    await settle();
    expect(h.context.messages[1]).toMatchObject({
      streaming: false,
      error: true,
      content: 'Browser control is not allowed for this site.',
    });
    expect(h.context.messages[1]?.browserActivity?.status).toBe('failed');
    expect(h.panel.showHandoffBanner).not.toHaveBeenCalled();
    expect(h.api.canAdmitComposerMessage('Try again')).toBe(true);
  });

  it('retains Stop if the background refuses cancellation', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    h.send.mockResolvedValue({
      success: false,
      running: true,
      error: 'Ownership no longer matches',
    });
    h.api.cancelComposerBrowserTask();
    await settle();
    expect(h.context.isStreaming).toBe(true);
    expect(h.api.getRun()?.cancelling).toBe(false);
    expect(h.api.getRun()?.controls.element.textContent).toContain('Ownership no longer matches');
  });

  it('refuses a changed active page before any browser request', async () => {
    const h = harness();
    h.query.mockResolvedValue([{ id: 8, url: 'https://example.com/other' }]);
    h.api.sendMessage('Fill the name field');
    await settle();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.context.messages[1]?.content).toContain('active page changed');
  });

  it('does not admit a task after the account changes during tab lookup', async () => {
    const h = harness();
    const tab = deferred<{ id: number; url: string }[]>();
    h.query.mockReturnValue(tab.promise);
    h.api.sendMessage('Fill the name field');
    h.context.managedCloudOwner = { accountId: 'user-b', authIncarnation: 'session-b' };
    tab.resolve([{ id: 7, url: 'https://example.com/form' }]);
    await settle();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('persists the actual final response and ignores events from another run', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_STATE',
      status: 'error',
      runId: 'other-run',
      reason: 'stale failure',
    });
    expect(h.context.isStreaming).toBe(true);
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_STEP',
      runId,
      step: { kind: 'final', finalMessage: 'I filled the name field with Alex.' },
    });
    h.api.applyComposerBrowserMessage({ type: 'AGI_CU_STATE', runId, status: 'completed' });
    expect(h.context.messages[1]).toMatchObject({
      streaming: false,
      content: 'I filled the name field with Alex.',
    });
    expect(h.saveMessages).toHaveBeenCalled();
    expect(h.context.messages[1]?.cloudAgentRun).toBeUndefined();
    expect(h.context.isStreaming).toBe(false);
  });

  it('does not write an old browser final into a newer conversation', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    h.context.conversationId = 'conversation-b';
    h.context.messages = [{ id: 'new-message', role: 'user', content: 'New chat', timestamp: 1 }];
    h.saveMessages.mockClear();
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_STEP',
      runId,
      step: { kind: 'final', finalMessage: 'old final' },
    });
    h.api.applyComposerBrowserMessage({ type: 'AGI_CU_STATE', runId, status: 'completed' });
    expect(h.context.messages).toHaveLength(1);
    expect(h.saveMessages).not.toHaveBeenCalled();
  });

  it('reconciles an evicted worker and releases the composer after verified inactivity', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(h.send).toHaveBeenLastCalledWith({ type: 'GET_COMPUTER_USE_STATE' });
    expect(h.api.getRun()).toBeNull();
    expect(h.context.messages[1]).toMatchObject({ streaming: false, error: true });
  });

  it('keeps a still-live run and retries a transient state lookup failure', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    h.send.mockRejectedValueOnce(new Error('worker waking up'));
    await vi.advanceTimersByTimeAsync(90_000);
    expect(h.api.getRun()?.runId).toBe(runId);
    h.send.mockResolvedValue({ success: true, running: true, runId });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(h.api.getRun()?.runId).toBe(runId);
    expect(h.context.isStreaming).toBe(true);
  });
  it('renders steps inside the assistant turn without opening the Computer Use view', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_STATE',
      status: 'running',
      runId,
      runGeneration: 2,
    });
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_STEP',
      runId,
      step: {
        kind: 'tool_call',
        stepNumber: 1,
        toolName: 'type',
        toolArgs: { index: 3, text: 'hunter2-secret' },
      },
    });
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_STEP',
      runId,
      step: {
        kind: 'tool_result',
        stepNumber: 1,
        toolName: 'type',
        toolResult: 'Typed into field [3]',
        actionOutcome: { status: 'succeeded' },
      },
    });
    const assistant = h.context.messages[1]!;
    expect(assistant.browserActivity?.status).toBe('running');
    expect(assistant.browserActivity?.entries).toEqual([
      expect.objectContaining({ kind: 'tool', summary: 'Typing', status: 'completed' }),
    ]);
    expect(JSON.stringify(assistant.browserEvents)).not.toContain('hunter2-secret');
    expect(h.panel.setRunState).not.toHaveBeenCalled();
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_STEP',
      runId,
      step: { kind: 'final', stepNumber: 2, finalMessage: 'Filled the name field.' },
    });
    h.api.applyComposerBrowserMessage({ type: 'AGI_CU_STATE', status: 'completed', runId });
    expect(assistant).toMatchObject({ content: 'Filled the name field.', streaming: false });
    expect(assistant.browserActivity?.status).toBe('completed');
  });

  it('asks for approval inline and answers with the run, generation and tab it was asked for', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_APPROVE_REQUEST',
      runId,
      runGeneration: 2,
      tabId: 7,
      requestId: 'cu_approve_1',
      toolName: 'click',
      description: 'Click element [4] on this page.',
      canAllowForTask: true,
    });
    const card = h.api.getRun()!.controls.cards.querySelector('.sp-cu-approval');
    expect(card?.textContent).toContain('Click element [4] on this page.');
    (card?.querySelector('.sp-cu-approval-allow') as HTMLButtonElement).click();
    await settle();
    expect(h.send).toHaveBeenLastCalledWith({
      type: 'AGI_CU_APPROVE_RESPONSE',
      requestId: 'cu_approve_1',
      runId,
      runGeneration: 2,
      tabId: 7,
      allowed: true,
      forTask: false,
    });
    expect(h.api.getRun()!.controls.cards.childElementCount).toBe(0);
  });

  it('denies a pending inline approval when Stop ends the run', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_APPROVE_REQUEST',
      runId,
      runGeneration: 2,
      tabId: 7,
      requestId: 'cu_approve_2',
      toolName: 'click',
      description: 'Click.',
    });
    h.api.cancelComposerBrowserTask();
    await settle();
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'AGI_CU_APPROVE_RESPONSE',
        requestId: 'cu_approve_2',
        allowed: false,
      }),
    );
    expect(h.api.getRun()).toBeNull();
    expect(h.context.messages[1]?.browserActivity?.status).toBe('cancelled');
  });

  it('refuses an approval for a run that no longer owns this conversation', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    h.context.conversationGeneration = 2;
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_APPROVE_REQUEST',
      runId,
      runGeneration: 2,
      tabId: 7,
      requestId: 'cu_approve_3',
      toolName: 'click',
      description: 'Click.',
    });
    await settle();
    expect(h.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'cu_approve_3', allowed: false }),
    );
  });

  it('offers Take over while running and Hand back while the user holds the page', async () => {
    const h = harness();
    h.api.sendMessage('Fill the name field');
    await settle();
    const runId = h.api.getRun()!.runId;
    const toggle = h.api
      .getRun()!
      .controls.element.querySelector('.sp-cu-takeover-btn') as HTMLButtonElement;
    expect(toggle.textContent).toBe('Take over');
    toggle.click();
    await settle();
    expect(h.send).toHaveBeenLastCalledWith({ type: 'PAUSE_COMPUTER_USE', runId });
    h.api.applyComposerBrowserMessage({
      type: 'AGI_CU_STATE',
      status: 'paused',
      runId,
      reason: 'Sign in first.',
    });
    expect(toggle.textContent).toBe('Hand back');
    expect(h.context.messages[1]?.browserActivity?.status).toBe('paused');
    toggle.click();
    await settle();
    expect(h.send).toHaveBeenLastCalledWith({ type: 'RESUME_COMPUTER_USE', runId });
  });

  it('lets a tool-capable model decide, so a page action stays an ordinary chat turn', async () => {
    const h = harness();
    h.context.selectedModel = 'auto';
    h.api.sendMessage('Click the Update preview button');
    await settle();
    expect(h.api.getRun()).toBeNull();
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CHAT_MESSAGE',
        text: 'Click the Update preview button',
        browserToolTier: 'read',
      }),
      expect.any(Function),
    );
    expect(h.send.mock.calls.at(-1)?.[0]).not.toHaveProperty('browserHistory');
    expect(h.dependencies.capturePageContext).not.toHaveBeenCalled();
  });

  it('offers browser tools to a tool-capable model from another provider, gated on the catalog', async () => {
    const otherProvider = Object.values(modelsCatalog.models).find(
      (model) =>
        model.provider !== 'anthropic' &&
        model.capabilities.tools === true &&
        model.capabilities.vision === true &&
        getModelMetadataById(model.id) !== null,
    );
    expect(otherProvider).toBeDefined();
    const h = harness();
    h.context.selectedModel = otherProvider!.id;
    h.api.sendMessage('Click the Update preview button');
    await settle();
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CHAT_MESSAGE',
        modelSelection: otherProvider!.id,
        browserToolTier: 'read',
      }),
      expect.any(Function),
    );
  });

  it('offers history search with the turn once the user has turned it on', async () => {
    const h = harness();
    h.context.selectedModel = 'auto';
    vi.mocked(h.dependencies.hasHistoryPermission).mockResolvedValue(true);
    h.api.sendMessage('Find the flight page I looked at yesterday');
    await settle();
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CHAT_MESSAGE', browserHistory: true }),
      expect.any(Function),
    );
  });
});
