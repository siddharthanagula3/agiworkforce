// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
type ScanModule0 = typeof import('../src/features/cloud-bridge/clerkAuth');
type ScanModule1 = typeof import('../src/features/cloud-bridge/freeTrialClient');
type ScanModule2 = typeof import('../src/features/cloud-bridge/capabilityDocument');

const chromeMock = vi.hoisted(() => {
  vi.stubGlobal(
    'SpeechRecognition',
    class {
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(document, 'adoptedStyleSheets', {
    configurable: true,
    writable: true,
    value: [],
  });
  const messageListeners: Array<(message: unknown, sender: { id: string; url: string }) => void> =
    [];
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn() });
  const area = () => {
    const values: Record<string, unknown> = {};
    return {
      get: vi.fn(
        async (
          keys: string | string[] | null,
          callback?: (result: Record<string, unknown>) => void,
        ) => {
          const names =
            keys === null ? Object.keys(values) : typeof keys === 'string' ? [keys] : keys;
          const result = Object.fromEntries(
            names.filter((key) => key in values).map((key) => [key, structuredClone(values[key])]),
          );
          callback?.(result);
          return result;
        },
      ),
      set: vi.fn(async (items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(values, structuredClone(items));
        callback?.();
      }),
      remove: vi.fn(async (keys: string | string[], callback?: () => void) => {
        for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key];
        callback?.();
      }),
    };
  };
  const mock = {
    messageListeners,
    cancellationReply: undefined as (() => Promise<unknown>) | undefined,
    memoryReply: undefined as (() => Promise<unknown>) | undefined,
    skillReply: undefined as (() => Promise<Response>) | undefined,
    screenshotDataUrl: '' as string,
    screenshotError: '' as string,
    deferScreenshots: false,
    screenshotReplies: [] as Array<
      (response: { success: boolean; data?: string; error?: string }) => void
    >,
    taskCallback: undefined as ((response: unknown) => void) | undefined,
    tasks: [] as Array<Record<string, unknown>>,
    runtime: {
      id: 'test-extension',
      onMessage: {
        ...event(),
        addListener: vi.fn((listener: (typeof messageListeners)[number]) =>
          messageListeners.push(listener),
        ),
      },
      onConnect: event(),
      connect: vi.fn(() => ({
        onMessage: event(),
        onDisconnect: event(),
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      })),
      sendMessage: vi.fn((message: { type?: string }, callback?: (response: unknown) => void) => {
        if (message.type === 'CANCEL_STREAM' && mock.cancellationReply)
          return mock.cancellationReply();
        if (message.type === 'LIST_MEMORIES' && mock.memoryReply) return mock.memoryReply();
        if (message?.type === 'CAPTURE_SCREENSHOT') {
          if (mock.deferScreenshots)
            return new Promise((resolve) => {
              mock.screenshotReplies.push((response) => {
                callback?.(response);
                resolve(response);
              });
            });
          const response = mock.screenshotError
            ? { success: false, error: mock.screenshotError }
            : { success: true, data: mock.screenshotDataUrl };
          callback?.(response);
          return Promise.resolve(response);
        }
        if (message.type === 'CREATE_SCHEDULED_TASK' || message.type === 'UPDATE_SCHEDULED_TASK') {
          mock.taskCallback = callback;
          return Promise.resolve(undefined);
        }
        const response =
          message.type === 'LIST_SCHEDULED_TASKS'
            ? { success: true, tasks: mock.tasks }
            : { success: true };
        callback?.(response);
        return Promise.resolve(response);
      }),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
      lastError: undefined as { message: string } | undefined,
    },
    storage: {
      local: area(),
      session: { ...area(), onChanged: event() },
      sync: area(),
      onChanged: event(),
    },
    tabs: {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(),
      create: vi.fn(),
      onActivated: event(),
      onUpdated: event(),
    },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
    commands: { getAll: vi.fn(async () => []) },
    permissions: { contains: vi.fn(async () => true) },
    action: { onClicked: event() },
    sidePanel: { setPanelBehavior: vi.fn(async () => undefined) },
    i18n: {
      getMessage: vi.fn((key: string, substitutions: string[] = []) =>
        catalogMessage(key, substitutions),
      ),
      getUILanguage: vi.fn(() => 'en'),
    },
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      mock.skillReply && String(input).endsWith('/api/skills')
        ? mock.skillReply()
        : new Response('{}', { status: 503 }),
    ),
  );
  return mock;
});

const account = vi.hoisted(() => ({
  summarized: '',
  signedIn: true,
  uploadsAllowed: true,
  ready: true,
  modelIds: [] as string[],
  onChange: undefined as (() => void) | undefined,
  owner: { accountId: 'account-fixture', authIncarnation: 'session-fixture' },
  revoke: vi.fn(async (): Promise<void> => undefined),
  signOut: vi.fn(async (): Promise<void> => {
    account.signedIn = false;
  }),
}));

vi.mock('../src/features/cloud-bridge/clerkAuth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  isClerkExtensionAuthConfigured: () => true,
  getFreshClerkAuthContext: async () =>
    account.signedIn ? { token: 'fixture-session', owner: account.owner } : null,
  getFreshClerkToken: async () => (account.signedIn ? 'fixture-session' : null),
  observeClerkAuth: async (onChange: () => void) => {
    account.onChange = onChange;
    return () => undefined;
  },
  revokeSyncedWebSession: () => account.revoke(),
  signOutClerk: () => account.signOut(),
}));

vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => {
  const actual = await importOriginal<ScanModule1>();
  return {
    ...actual,
    getManagedModelAccess: async (): Promise<
      import('../src/features/cloud-bridge/freeTrialClient').ManagedModelAccess
    > => ({
      subscriptionTier: 'pro',
      subscriptionStatus: 'active',
      modelIds: account.modelIds,
      allowedAutoModes: [],
      usage: parseManagedUsageSummaryResponse({
        plan_tier: 'pro',
        usage_percentage: 0,
        usage_reset_at: null,
        period_start: null,
        period_end: null,
        session_usage_percentage: 0,
        session_reset_at: null,
        weekly_usage_percentage: 0,
        weekly_reset_at: null,
        flagship_weekly_usage_percentage: 0,
        flagship_weekly_reset_at: null,
        has_usage_remaining: true,
        usage_allocation: account.ready ? 'provisioned' : 'pending',
        subscription_status: 'active',
      }),
    }),
  };
});
vi.mock('../src/features/cloud-bridge/capabilityDocument', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  fetchAccountSummary: async () => ({
    displayName:
      ((account.summarized = account.owner.authIncarnation), account.owner.authIncarnation),
    email: null,
    capabilityDocument: {
      granted: [
        'canUseSkills',
        'canUseVoice',
        ...(account.uploadsAllowed ? ['canUploadFiles'] : []),
      ],
      deniedBy: account.uploadsAllowed ? {} : { canUploadFiles: ['settings'] },
      sources: {
        model: 'fixture-model',
        tier: 'fixture-tier',
        surface: 'fixture-surface',
        settings: 'fixture-settings',
      },
    },
  }),
}));
import { getRoutingSlotModel, parseManagedUsageSummaryResponse } from '@agiworkforce/types';

import catalog from '../_locales/en/messages.json';
import { upsertConversation } from '../src/features/background/conversation-history';
import {
  assignConversationOwner,
  resolveBrowserConversationScope,
} from '../src/features/background/conversation-session';
import '../src/side_panel';

function catalogMessage(key: string, substitutions: string[]): string {
  const entry = (
    catalog as Record<
      string,
      { message: string; placeholders?: Record<string, { content: string }> }
    >
  )[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

function attachmentBar(): HTMLElement {
  const bar = document.getElementById('sp-attachment-bar');
  if (!bar) throw new Error('composer attachment bar was never built');
  return bar;
}

function noticeText(): string {
  return attachmentBar().querySelector('.sp-attachment-notice')?.textContent ?? '';
}

async function expectReadyAccount(): Promise<void> {
  await vi.waitFor(() => {
    expect((document.getElementById('sp-input') as HTMLTextAreaElement).disabled).toBe(false);
    expect(account.summarized).toBe(account.owner.authIncarnation);
    expect((document.getElementById('sp-attach-file-item') as HTMLButtonElement).hidden).toBe(
      !account.uploadsAllowed,
    );
  });
}

async function changeOwner(authIncarnation: string): Promise<void> {
  account.owner = { ...account.owner, authIncarnation };
  account.onChange!();
  await expectReadyAccount();
}

describe('side panel Stop confirmation', () => {
  afterEach(() => {
    vi.useRealTimers();
    chromeMock.cancellationReply = undefined;
    chromeMock.memoryReply = undefined;
    chromeMock.skillReply = undefined;
    document.getElementById('sp-new-chat-btn')!.click();
  });
  beforeEach(async () => {
    account.owner = { accountId: 'account-fixture', authIncarnation: 'session-fixture' };
    account.signedIn = true;
    account.ready = true;
    chromeMock.cancellationReply = undefined;
    chromeMock.memoryReply = undefined;
    chromeMock.skillReply = undefined;
    account.modelIds = [getRoutingSlotModel('general_fast')];
    account.onChange!();
    await expectReadyAccount();
    document.getElementById('sp-new-chat-btn')!.click();
    await vi.waitFor(() =>
      expect(document.getElementById('sp-send-btn')!.getAttribute('data-mode')).toBe('send'),
    );
    chromeMock.runtime.sendMessage.mockClear();
  });

  const input = (): HTMLTextAreaElement =>
    document.getElementById('sp-input') as HTMLTextAreaElement;
  const sendButton = (): HTMLButtonElement =>
    document.getElementById('sp-send-btn') as HTMLButtonElement;
  const chats = () =>
    chromeMock.runtime.sendMessage.mock.calls.filter(
      ([message]) => message.type === 'CHAT_MESSAGE',
    );
  async function startRun(): Promise<Record<string, unknown>> {
    input().value = 'Start the owned task';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(sendButton().disabled).toBe(false);
      expect(sendButton().getAttribute('data-mode')).toBe('send');
    });
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(chats()).toHaveLength(1));
    const message = chats()[0]![0] as Record<string, unknown>;
    chunk(message, {
      text: 'Preserved partial output',
      cloudRun: {
        runId: '11111111-1111-4111-8111-111111111111',
        runPath: '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
        state: 'running',
        lastSequence: -1,
      },
    });
    await vi.waitFor(() => expect(sendButton().getAttribute('data-mode')).toBe('stop'));
    return message;
  }
  function chunk(message: Record<string, unknown>, patch: Record<string, unknown>): void {
    for (const listener of chromeMock.messageListeners)
      listener(
        {
          type: 'CHAT_CHUNK',
          owner: message.owner,
          clientInstanceId: message.clientInstanceId,
          id: message.id,
          ...patch,
        },
        { id: 'test-extension', url: 'chrome-extension://test/side_panel.html' },
      );
  }
  function queue(): void {
    input().value = 'Queued follow-up';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(input().value).toBe('');
    expect(chats()).toHaveLength(1);
  }

  it('clears an open Memory view before a replacement session receives a delayed response', async () => {
    let reply!: (response: unknown) => void;
    chromeMock.memoryReply = () => new Promise((resolve) => (reply = resolve));
    document.getElementById('sp-menu-btn')!.click();
    const memory = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (button) => button.textContent === catalog.spAccountMemory.message,
    );
    memory!.click();
    await vi.waitFor(() => expect(reply).toBeDefined());
    const sheet = document.getElementById('sp-memory')!;
    const draft = sheet.querySelector<HTMLInputElement>('input')!;
    draft.value = 'Old session draft';
    try {
      await changeOwner('replacement-memory-session');
      expect(sheet.hidden).toBe(true);
      expect(draft.value).toBe('');
    } finally {
      reply({
        success: true,
        memories: [{ id: 'old', content: 'Old session result' }],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(sheet.textContent).not.toContain('Old session result');
    expect(sheet.querySelector('.sp-memory-list')?.childElementCount).toBe(0);
  });

  it.each([true, false])('discards a retired Skills response (success=%s)', async (success) => {
    let reply!: (response: Response) => void;
    chromeMock.skillReply = () => new Promise((resolve) => (reply = resolve));
    document.getElementById('sp-attach-btn')!.click();
    document.getElementById('sp-skills-item')!.click();
    await vi.waitFor(() => expect(reply).toBeDefined());
    const menu = document.getElementById('sp-skill-menu')!;
    try {
      await changeOwner(`replacement-skills-${success}`);
      expect(menu.classList.contains('open')).toBe(false);
      expect(menu.childElementCount).toBe(0);
    } finally {
      reply(
        new Response(
          JSON.stringify({
            skills: [{ name: 'retired-private-skill', source: 'personal' }],
          }),
          { status: success ? 200 : 503 },
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      document.body.click();
    }
    expect(menu.childElementCount).toBe(0);
    expect(menu.textContent).not.toContain('retired-private-skill');
    expect(menu.textContent).not.toContain(catalog.spSkillsLoadFailed.message);
  });

  it('retires the open command palette and its saved chat titles on an owner change', async () => {
    await upsertConversation(
      account.owner,
      'conv-palette-owner',
      [
        {
          role: 'user',
          content: 'Private palette title',
          timestamp: 1000,
          runtime: 'managed-cloud',
        },
      ],
      { selectedModel: getRoutingSlotModel('general_fast') },
    );
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    const backdrop = document.querySelector<HTMLElement>('.sp-palette-backdrop')!;
    const query = backdrop.querySelector<HTMLInputElement>('input')!;
    try {
      await vi.waitFor(() => expect(backdrop.textContent).toContain('Private palette title'));
      query.value = 'Private palette';
      query.dispatchEvent(new Event('input', { bubbles: true }));
      await changeOwner('replacement-palette-session');
      expect(backdrop.hidden).toBe(true);
      expect(backdrop.querySelectorAll('[role="option"]')).toHaveLength(0);
      expect(query.value).toBe('');
    } finally {
      query.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
  });

  it.each(['owner', 'chat'])('retires a pending microphone notice on %s change', async (kind) => {
    document.getElementById('sp-mic-btn')!.click();
    const notice = document.getElementById('sp-mic-notice')!;
    try {
      await vi.waitFor(() => expect(notice.classList.contains('visible')).toBe(true));
      if (kind === 'owner') await changeOwner('replacement-microphone-session');
      else document.getElementById('sp-new-chat-btn')!.click();
      expect(notice.classList.contains('visible')).toBe(false);
    } finally {
      const decline = [...notice.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === catalog.spVoiceNoticeDecline.message,
      );
      decline!.click();
    }
  });

  it.each(['owner', 'chat'])('stops read aloud on %s change', async (kind) => {
    const synthDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'speechSynthesis');
    const utteranceDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'SpeechSynthesisUtterance',
    );
    const speak = vi.fn();
    const cancel = vi.fn();
    Object.defineProperty(globalThis, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel, getVoices: () => [] },
    });
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class {
        constructor(readonly text: string) {}
      },
    });
    try {
      const message = await startRun();
      chunk(message, {
        text: '',
        done: true,
        cloudRun: {
          runId: '11111111-1111-4111-8111-111111111111',
          runPath: '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
          state: 'completed',
          lastSequence: -1,
        },
      });
      const button = document.querySelector<HTMLButtonElement>('.sp-read-aloud-btn')!;
      expect(button).not.toBeNull();
      button.click();
      await vi.waitFor(() => expect(speak).toHaveBeenCalledOnce());
      cancel.mockClear();
      if (kind === 'owner') await changeOwner('replacement-read-aloud-session');
      else document.getElementById('sp-new-chat-btn')!.click();
      expect(cancel).toHaveBeenCalledOnce();
      expect(button.getAttribute('aria-pressed')).toBe('false');
    } finally {
      if (synthDescriptor) Object.defineProperty(globalThis, 'speechSynthesis', synthDescriptor);
      else Reflect.deleteProperty(globalThis, 'speechSynthesis');
      if (utteranceDescriptor)
        Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', utteranceDescriptor);
      else Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance');
    }
  });

  it('clears a retired owner draft while preserving a same-owner account refresh', async () => {
    try {
      input().value = 'Private draft for the current owner';
      input().dispatchEvent(new Event('input', { bubbles: true }));
      account.onChange!();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await expectReadyAccount();
      expect(input().value).toBe('Private draft for the current owner');
      await changeOwner('replacement-draft-session');
      expect(input().value).toBe('');
      expect(sendButton().disabled).toBe(true);
      input().value = 'Draft for the replacement owner';
      input().dispatchEvent(new Event('input', { bubbles: true }));
      account.onChange!();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await expectReadyAccount();
      expect(input().value).toBe('Draft for the replacement owner');
    } finally {
      input().value = '';
      input().dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  it('restores only the active project preference owned by the authenticated session', async () => {
    const owner = { ...account.owner, authIncarnation: 'project-restore-session' };
    await chromeMock.storage.local.set({
      agi_active_project: { owner, project: { id: 'owned-project', name: 'Owned project' } },
    });
    await changeOwner(owner.authIncarnation);
    await vi.waitFor(() => {
      expect(document.getElementById('sp-project-chip')?.hidden).toBe(false);
      expect(document.getElementById('sp-project-chip-label')?.textContent).toContain(
        'Owned project',
      );
    });
    await changeOwner('different-project-session');
    expect(document.getElementById('sp-project-chip')?.hidden).toBe(true);
  });

  it('does not send a model turn when the selected project has not been acknowledged', async () => {
    const owner = { ...account.owner, authIncarnation: 'project-send-session' };
    await chromeMock.storage.local.set({
      agi_active_project: { owner, project: { id: 'selected-project', name: 'Selected project' } },
    });
    await changeOwner(owner.authIncarnation);
    input().value = 'Use the selected project';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.sp-bubble-error')).not.toBeNull());
    expect(chats()).toHaveLength(0);
    expect(document.body.textContent).toContain(catalog.spProjectChatNotSaved.message);
  });

  it('restores a saved chat project instead of the pending new-chat preference', async () => {
    const owner = { ...account.owner, authIncarnation: 'project-history-session' };
    const id = 'conv-project-bootstrap';
    await upsertConversation(
      owner,
      id,
      [
        {
          role: 'user',
          content: 'Saved project question',
          timestamp: 1000,
          runtime: 'managed-cloud',
        },
        {
          role: 'assistant',
          content: 'Saved project answer',
          timestamp: 2000,
          runtime: 'managed-cloud',
        },
      ],
      { selectedModel: getRoutingSlotModel('general_fast') },
      'saved-project',
    );
    const scope = await resolveBrowserConversationScope('project-test');
    await assignConversationOwner(scope, owner, id);
    await chromeMock.storage.local.set({
      agi_active_project: {
        owner,
        project: { id: 'different-project', name: 'New chat preference' },
      },
      agi_project_names: { 'saved-project': 'Saved chat project' },
    });
    await changeOwner(owner.authIncarnation);
    await vi.waitFor(() => expect(document.body.textContent).toContain('Saved project answer'));
    expect(document.getElementById('sp-project-chip-label')?.textContent).toContain(
      'Saved chat project',
    );
    expect(document.getElementById('sp-project-chip')?.hidden).toBe(false);
    chromeMock.runtime.sendMessage.mockClear();
    document.getElementById('sp-project-chip-clear')!.click();
    await vi.waitFor(() =>
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SYNC_CONVERSATION', conversationId: id }),
        expect.any(Function),
      ),
    );
  });

  it('confirms foreground Stop before revoking credentials and never sends queued text on logout', async () => {
    await startRun();
    queue();
    account.revoke.mockClear();
    let confirm!: (response: unknown) => void;
    chromeMock.cancellationReply = () => new Promise((resolve) => (confirm = resolve));
    document.getElementById('sp-menu-btn')!.click();
    const logout = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (button) => button.textContent === catalog.spAccountLogOut.message,
    );
    expect(logout).toBeDefined();
    logout!.click();
    try {
      await vi.waitFor(() => expect(confirm).toBeDefined());
      expect(account.revoke).not.toHaveBeenCalled();
    } finally {
      confirm?.({
        success: true,
        cancellationConfirmed: true,
        cloudRun: {
          runId: '11111111-1111-4111-8111-111111111111',
          runPath: '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
          state: 'cancelled',
          lastSequence: 3,
        },
      });
    }
    await vi.waitFor(() => expect(account.revoke).toHaveBeenCalledOnce());
    expect(chats()).toHaveLength(1);
  });

  it('still signs out when foreground Stop fails', async () => {
    await startRun();
    account.revoke.mockClear();
    chromeMock.cancellationReply = async () => ({ success: false, error: 'Offline' });
    document.getElementById('sp-menu-btn')!.click();
    const logout = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (button) => button.textContent === catalog.spAccountLogOut.message,
    );
    logout!.click();
    await vi.waitFor(() => expect(account.revoke).toHaveBeenCalledOnce());
  });

  it('does not sign out a replacement account session while foreground Stop settles', async () => {
    await startRun();
    account.revoke.mockClear();
    let confirm!: (response: unknown) => void;
    chromeMock.cancellationReply = () => new Promise((resolve) => (confirm = resolve));
    document.getElementById('sp-menu-btn')!.click();
    const logout = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (button) => button.textContent === catalog.spAccountLogOut.message,
    );
    logout!.click();
    await vi.waitFor(() => expect(confirm).toBeDefined());
    await changeOwner('replacement-session');
    confirm({ success: true, cancellationConfirmed: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(account.revoke).not.toHaveBeenCalled();
    expect(account.signedIn).toBe(true);
    expect(account.owner.authIncarnation).toBe('replacement-session');
  });

  it.each(['refused', 'rejected', 'undefined', 'malformed'] as const)(
    'retains the active run and parks queued text after a %s cancellation response',
    async (kind) => {
      await startRun();
      queue();
      chromeMock.cancellationReply = () =>
        kind === 'rejected'
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(
              kind === 'refused'
                ? { success: false }
                : kind === 'malformed'
                  ? { success: 'true' }
                  : undefined,
            );
      sendButton().click();
      await vi.waitFor(() => expect(input().value).toBe('Queued follow-up'));
      expect(noticeText()).toContain(catalog.spCancellationUnconfirmed.message);
      expect(chats()).toHaveLength(1);
      expect(document.body.textContent).toContain('Preserved partial output');
      expect(sendButton().getAttribute('data-mode')).toBe('stop');
      expect(sendButton().disabled).toBe(false);
    },
  );

  it.each(['chunk-first', 'reply-first'] as const)(
    'drains one follow-up only after confirmed Stop (%s)',
    async (order) => {
      const message = await startRun();
      queue();
      let reply!: (response: unknown) => void;
      chromeMock.cancellationReply = () =>
        new Promise((resolve) => {
          reply = resolve;
        });
      sendButton().click();
      expect(sendButton().disabled).toBe(true);
      const done = () =>
        chunk(message, {
          text: '',
          done: true,
          error: 'Cancelled.',
          errorCode: 'cancelled',
          cloudRun: {
            runId: '11111111-1111-4111-8111-111111111111',
            runPath: '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
            state: 'cancelled',
            lastSequence: -1,
          },
        });
      if (order === 'chunk-first') {
        done();
        expect(chats()).toHaveLength(1);
      }
      reply({ success: true });
      await vi.waitFor(() => expect(chats()).toHaveLength(2));
      if (order === 'reply-first') done();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(chats()).toHaveLength(2);
      expect((chats()[1]![0] as Record<string, unknown>).text).toBe('Queued follow-up');
    },
  );

  it.each(['new-chat', 'new-session'] as const)(
    'ignores an old successful Stop after %s replacement',
    async (change) => {
      await startRun();
      queue();
      let reply!: (response: unknown) => void;
      const cancellationResponse = new Promise((resolve) => {
        reply = resolve;
      });
      chromeMock.cancellationReply = () => cancellationResponse;
      sendButton().click();
      if (change === 'new-chat') document.getElementById('sp-new-chat-btn')!.click();
      else await changeOwner('replacement-stop-session');
      await new Promise((resolve) => setTimeout(resolve, 0));
      chromeMock.cancellationReply = undefined;
      reply({ success: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(chats()).toHaveLength(1);
      expect(sendButton().getAttribute('data-mode')).toBe('send');
      expect(noticeText()).not.toContain(catalog.spCancellationUnconfirmed.message);
    },
  );
  it.each(['error', 'timeout'] as const)(
    'uses an independently observed same-run terminal event after cancellation %s',
    async (failure) => {
      const message = await startRun();
      queue();
      if (failure === 'timeout') vi.useFakeTimers();
      let reject!: (reason: Error) => void;
      chromeMock.cancellationReply = () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        });
      sendButton().click();
      chunk(message, {
        text: '',
        done: true,
        cloudRun: {
          runId: '11111111-1111-4111-8111-111111111111',
          runPath: '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
          state: 'completed',
          lastSequence: -1,
        },
      });
      expect(chats()).toHaveLength(1);
      if (failure === 'timeout') await vi.advanceTimersByTimeAsync(15_000);
      else reject(new Error('Cancellation reply failed'));
      await vi.waitFor(() => expect(chats()).toHaveLength(2));
      expect(noticeText()).not.toContain(catalog.spCancellationUnconfirmed.message);
      expect((chats()[1]![0] as Record<string, unknown>).text).toBe('Queued follow-up');
      vi.useRealTimers();
    },
  );

  it.each(['paused', 'foreign-terminal', 'done-only'] as const)(
    'refuses %s as same-run terminal confirmation',
    async (kind) => {
      const message = await startRun();
      queue();
      let reject!: (reason: Error) => void;
      chromeMock.cancellationReply = () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        });
      sendButton().click();
      chunk(message, {
        text: '',
        done: true,
        ...(kind === 'done-only'
          ? {}
          : {
              cloudRun: {
                runId:
                  kind === 'foreign-terminal'
                    ? '22222222-2222-4222-8222-222222222222'
                    : '11111111-1111-4111-8111-111111111111',
                runPath:
                  kind === 'foreign-terminal'
                    ? '/api/llm/v1/chat/completions/runs/22222222-2222-4222-8222-222222222222'
                    : '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
                state: kind === 'paused' ? 'paused' : 'completed',
                lastSequence: -1,
              },
            }),
      });
      expect(sendButton().getAttribute('data-mode')).toBe('stopping');
      expect(sendButton().disabled).toBe(true);
      expect(chats()).toHaveLength(1);
      reject(new Error('Cancellation reply failed'));
      await vi.waitFor(() => expect(input().value).toBe('Queued follow-up'));
      expect(noticeText()).toContain(catalog.spCancellationUnconfirmed.message);
      expect(chats()).toHaveLength(1);
      expect(sendButton().getAttribute('data-mode')).toBe('stop');
      expect(sendButton().disabled).toBe(false);
      chromeMock.cancellationReply = async () => ({ success: true });
      sendButton().click();
      await vi.waitFor(() => expect(sendButton().getAttribute('data-mode')).toBe('send'));
      const cancellations = chromeMock.runtime.sendMessage.mock.calls.filter(
        ([value]) => value.type === 'CANCEL_STREAM',
      );
      expect(cancellations).toHaveLength(2);
      expect(cancellations[1]![0]).toEqual(
        expect.objectContaining({
          cloudRun: expect.objectContaining({ runId: '11111111-1111-4111-8111-111111111111' }),
        }),
      );
      expect(chats()).toHaveLength(1);
    },
  );

  it('retains Stop retry after a deadline and ignores its later success', async () => {
    await startRun();
    queue();
    vi.useFakeTimers();
    let reply!: (response: unknown) => void;
    chromeMock.cancellationReply = () =>
      new Promise((resolve) => {
        reply = resolve;
      });
    sendButton().click();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(noticeText()).toContain(catalog.spCancellationUnconfirmed.message);
    expect(input().value).toBe('Queued follow-up');
    expect(sendButton().getAttribute('data-mode')).toBe('stop');
    reply({ success: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(chats()).toHaveLength(1);
    expect(sendButton().getAttribute('data-mode')).toBe('stop');
    vi.useRealTimers();
  });

  it('retries the retained run without automatically sending parked text', async () => {
    const message = await startRun();
    queue();
    chromeMock.cancellationReply = async () => ({ success: false });
    sendButton().click();
    await vi.waitFor(() => expect(input().value).toBe('Queued follow-up'));
    chromeMock.cancellationReply = async () => ({ success: true });
    sendButton().click();
    await vi.waitFor(() => expect(sendButton().getAttribute('data-mode')).toBe('send'));
    const cancellations = chromeMock.runtime.sendMessage.mock.calls.filter(
      ([value]) => value.type === 'CANCEL_STREAM',
    );
    expect(cancellations).toHaveLength(2);
    expect(cancellations[1]![0]).toEqual(
      expect.objectContaining({
        id: message.id,
        owner: message.owner,
        cloudRun: expect.objectContaining({ runId: '11111111-1111-4111-8111-111111111111' }),
      }),
    );
    expect(chats()).toHaveLength(1);
    expect(input().value).toBe('Queued follow-up');
  });
});
