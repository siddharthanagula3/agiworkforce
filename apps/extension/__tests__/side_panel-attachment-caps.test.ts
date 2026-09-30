/**
 * The side-panel composer must not hold attachments the managed transport will
 * refuse to send. `executeChromeManagedChat` runs `assertAttachmentBudget`
 * (freeTrialClient) on the way out: at most MANAGED_CHAT_MAX_ATTACHMENTS images
 * totalling MANAGED_CHAT_MAX_ATTACHMENT_BYTES decoded bytes, each a base64 PNG,
 * JPEG, WebP or GIF. Anything the composer admits past that is discovered as a
 * failed turn *after* send, with the user's text already consumed.
 *
 * These tests drive the real listeners built by `buildUI()`, drop, paste, the
 * `+` menu file picker and the `+` menu screenshot, and read the resulting
 * attachments back out of the preview chips.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const chromeMock = vi.hoisted(() => {
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
      onMessage: event(),
      onConnect: event(),
      connect: vi.fn(() => ({
        onMessage: event(),
        onDisconnect: event(),
        postMessage: vi.fn(),
        disconnect: vi.fn(),
      })),
      sendMessage: vi.fn((message: { type?: string }, callback?: (response: unknown) => void) => {
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
    vi.fn(async () => new Response('{}', { status: 503 })),
  );
  return mock;
});

const account = vi.hoisted(() => ({
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
  ...(await importOriginal<typeof import('../src/features/cloud-bridge/clerkAuth')>()),
  isClerkExtensionAuthConfigured: () => true,
  getFreshClerkAuthContext: async () =>
    account.signedIn ? { token: 'fixture-session', owner: account.owner } : null,
  getFreshClerkToken: async () => (account.signedIn ? 'fixture-session' : null),
  getClerkAccountProfile: async () => null,
  observeClerkAuth: async (onChange: () => void) => {
    account.onChange = onChange;
    return () => undefined;
  },
  revokeSyncedWebSession: () => account.revoke(),
  signOutClerk: () => account.signOut(),
}));

vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/features/cloud-bridge/freeTrialClient')>();
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
    getManagedUsageHistory: async () => null,
  };
});
vi.mock('../src/features/cloud-bridge/capabilityDocument', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/cloud-bridge/capabilityDocument')>()),
  fetchAccountSummary: async () => ({
    displayName: account.owner.authIncarnation,
    email: null,
    capabilityDocument: {
      granted: account.uploadsAllowed ? ['canUploadFiles'] : [],
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
import {
  deleteConversation,
  saveConversation,
} from '../src/features/background/conversation-history';
import { getManagedModelBadgeLabel } from '../src/features/cloud-bridge/managedModelPicker';

import catalog from '../_locales/en/messages.json';
import {
  createMultimodalUserContent,
  MANAGED_CHAT_MAX_ATTACHMENTS,
  MANAGED_CHAT_MAX_ATTACHMENT_BYTES,
  MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES,
} from '../src/features/cloud-bridge/freeTrialClient';
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

function pendingDataUrls(): string[] {
  return Array.from(attachmentBar().querySelectorAll<HTMLImageElement>('.sp-attachment-thumb')).map(
    (img) => img.getAttribute('src') ?? '',
  );
}

function noticeText(): string {
  return attachmentBar().querySelector('.sp-attachment-notice')?.textContent ?? '';
}

function imageFile(sizeBytes: number, type = 'image/png', name = 'shot.png'): File {
  return new File([new Uint8Array(sizeBytes).fill(65)], name, { type });
}

function dataUrlOfBytes(bytes: number, mime = 'image/png'): string {
  return `data:${mime};base64,${'A'.repeat(Math.ceil(bytes / 3) * 4)}`;
}

function dropFiles(files: File[]): void {
  const shell = document.getElementById('sp-composer-shell') ?? attachmentBar().parentElement;
  if (!shell) throw new Error('composer shell was never built');
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files, types: ['Files'] } });
  shell.dispatchEvent(event);
}

function pasteFiles(files: File[]): void {
  const input = document.getElementById('sp-input');
  if (!input) throw new Error('composer input was never built');
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    },
  });
  input.dispatchEvent(event);
}

function pickFiles(files: File[]): void {
  const input = document.getElementById('sp-attach-file-input') as HTMLInputElement | null;
  if (!input) throw new Error('composer file input was never built');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function captureScreenshot(dataUrl: string): void {
  chromeMock.screenshotDataUrl = dataUrl;
  const screenshotItem = document.getElementById('sp-attach-screenshot-item');
  if (!screenshotItem) throw new Error('screenshot menu item was never built');
  screenshotItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

async function expectPendingCount(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(pendingDataUrls()).toHaveLength(count);
  });
}

async function clearPending(): Promise<void> {
  dropFiles([imageFile(8, 'image/png', 'reset.png')]);
  await vi.waitFor(() => {
    expect(attachmentBar().querySelector('.sp-attachment-thumb')).not.toBeNull();
  });
  await vi.waitFor(async () => {
    let removeBtn = attachmentBar().querySelector<HTMLElement>('.sp-attachment-remove');
    while (removeBtn) {
      removeBtn.click();
      removeBtn = attachmentBar().querySelector<HTMLElement>('.sp-attachment-remove');
    }
    for (let settle = 0; settle < 2; settle += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(attachmentBar().querySelector('.sp-attachment-thumb')).toBeNull();
    }
  });
}

beforeEach(async () => {
  account.owner = { accountId: 'account-fixture', authIncarnation: 'session-fixture' };
  account.signedIn = true;
  account.uploadsAllowed = true;
  account.ready = true;
  account.modelIds = [];
  chromeMock.screenshotError = '';
  chromeMock.deferScreenshots = false;
  chromeMock.screenshotReplies = [];
  chromeMock.runtime.lastError = undefined;
  chromeMock.tasks = [];
  chromeMock.taskCallback = undefined;
  account.revoke.mockReset().mockResolvedValue(undefined);
  account.signOut.mockReset().mockImplementation(async () => {
    account.signedIn = false;
  });
  account.onChange?.();
  await expectReadyAccount();
  await clearPending();
  document.querySelector<HTMLButtonElement>('#sp-wf-new-task-form .sp-wf-form-cancel-btn')?.click();
  expect(pendingDataUrls()).toHaveLength(0);
  expect(noticeText()).toBe('');
});

describe('side panel composer attachment caps', () => {
  it('shows file-read progress while send is gated', async () => {
    pickFiles([imageFile(16, 'image/png', 'reading.png')]);

    expect(attachmentBar().textContent).toContain(catalog.spAttachmentAdding.message);
    await expectPendingCount(1);
    expect(noticeText()).toBe('');
  });

  it('shows an actionable screenshot capture failure', async () => {
    chromeMock.screenshotError = 'Capture unavailable';
    captureScreenshot('');

    await vi.waitFor(() => expect(noticeText()).toContain('Capture unavailable'));
    expect(pendingDataUrls()).toHaveLength(0);
  });

  it('stops dropped files at the transport count cap and says why', async () => {
    dropFiles(
      Array.from({ length: MANAGED_CHAT_MAX_ATTACHMENTS + 3 }, (_, i) =>
        imageFile(16, 'image/png', `drop-${i}.png`),
      ),
    );

    await expectPendingCount(MANAGED_CHAT_MAX_ATTACHMENTS);
    expect(noticeText()).toContain(String(MANAGED_CHAT_MAX_ATTACHMENTS));
  });

  it('hands the send path a payload it accepts once the composer is full', async () => {
    dropFiles(
      Array.from({ length: MANAGED_CHAT_MAX_ATTACHMENTS + 3 }, (_, i) =>
        imageFile(16, 'image/png', `drop-${i}.png`),
      ),
    );
    await expectPendingCount(MANAGED_CHAT_MAX_ATTACHMENTS);

    expect(() => createMultimodalUserContent('describe these', pendingDataUrls())).not.toThrow();
  });

  it('refuses a paste that would exceed the count cap', async () => {
    dropFiles(
      Array.from({ length: MANAGED_CHAT_MAX_ATTACHMENTS }, (_, i) =>
        imageFile(16, 'image/png', `drop-${i}.png`),
      ),
    );
    await expectPendingCount(MANAGED_CHAT_MAX_ATTACHMENTS);

    pasteFiles([imageFile(16, 'image/png', 'pasted.png')]);

    await vi.waitFor(() => {
      expect(noticeText()).toContain(String(MANAGED_CHAT_MAX_ATTACHMENTS));
    });
    expect(pendingDataUrls()).toHaveLength(MANAGED_CHAT_MAX_ATTACHMENTS);
  });

  it('refuses a `+` menu pick that would exceed the count cap', async () => {
    dropFiles(
      Array.from({ length: MANAGED_CHAT_MAX_ATTACHMENTS }, (_, i) =>
        imageFile(16, 'image/png', `drop-${i}.png`),
      ),
    );
    await expectPendingCount(MANAGED_CHAT_MAX_ATTACHMENTS);

    pickFiles([imageFile(16, 'image/png', 'picked.png')]);

    await vi.waitFor(() => {
      expect(noticeText()).toContain(String(MANAGED_CHAT_MAX_ATTACHMENTS));
    });
    expect(pendingDataUrls()).toHaveLength(MANAGED_CHAT_MAX_ATTACHMENTS);
  });

  it('accepts a file between the retired 10 MB literal and the canonical per-file cap', async () => {
    expect(MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES).toBeGreaterThan(10 * 1024 * 1024);

    dropFiles([imageFile(10 * 1024 * 1024 + 1, 'image/png', 'just-over-ten.png')]);

    await expectPendingCount(1);
    expect(noticeText()).toBe('');
  });

  it('still refuses a file above the canonical per-file cap', async () => {
    dropFiles([imageFile(MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES + 1, 'image/png', 'over-cap.png')]);

    await vi.waitFor(() => {
      expect(noticeText()).toContain('over-cap.png is too large');
    });
    expect(pendingDataUrls()).toHaveLength(0);
  });

  it('rejects image types the transport cannot encode', async () => {
    dropFiles([imageFile(16, 'image/svg+xml', 'vector.svg')]);

    await vi.waitFor(() => {
      expect(noticeText()).toContain('vector.svg cannot be attached');
    });
    expect(noticeText()).toContain('PNG');
    expect(pendingDataUrls()).toHaveLength(0);
  });

  it('keeps the `+` menu screenshot inside the request byte budget', async () => {
    const halfBudget = Math.floor(MANAGED_CHAT_MAX_ATTACHMENT_BYTES * 0.6);
    captureScreenshot(dataUrlOfBytes(halfBudget));
    await expectPendingCount(1);
    expect(noticeText()).toBe('');

    captureScreenshot(dataUrlOfBytes(halfBudget));

    expect(pendingDataUrls()).toHaveLength(1);
    expect(noticeText()).toContain('MB');
  });

  it('adds a Drawer capture to the composer instead of reporting a false success', async () => {
    chromeMock.screenshotDataUrl = dataUrlOfBytes(24);
    const drawerCapture = document.getElementById('sp-drawer-capture-btn');
    expect(drawerCapture).not.toBeNull();

    drawerCapture!.click();

    await expectPendingCount(1);
    expect(pendingDataUrls()[0]).toBe(chromeMock.screenshotDataUrl);
    expect(document.getElementById('sp-chat-panel')?.classList.contains('sp-tab-hidden')).toBe(
      false,
    );
    expect(document.getElementById('sp-input-area')?.style.display).toBe('');
  });
});

async function refreshAccount(): Promise<void> {
  expect(account.onChange).toBeTypeOf('function');
  account.onChange!();
  await vi.waitFor(() => {
    expect((document.getElementById('sp-input') as HTMLTextAreaElement).disabled).toBe(
      !account.signedIn || !account.ready,
    );
    const message = account.signedIn ? 'spQuotaAllocationPending' : 'spGateSignInToChat';
    expect(document.getElementById('sp-cloud-gate-message')!.textContent).toBe(
      catalogMessage(message, []),
    );
  });
}

describe('attachment account and capability admission', () => {
  it('refuses file intake when the signed-in account denies uploads', async () => {
    account.uploadsAllowed = false;
    account.onChange!();
    await vi.waitFor(() =>
      expect((document.getElementById('sp-attach-file-item') as HTMLButtonElement).hidden).toBe(
        true,
      ),
    );
    dropFiles([imageFile(16)]);
    await vi.waitFor(() => expect(noticeText()).toBe(catalogMessage('spAttachmentUploadsOff', [])));
    expect(pendingDataUrls()).toHaveLength(0);
  });
  it('disables capture until allocation is ready and refuses signed-out file drops', async () => {
    for (const signedIn of [false, true]) {
      account.signedIn = signedIn;
      account.ready = false;
      await refreshAccount();
      expect((document.getElementById('sp-attach-btn') as HTMLButtonElement).disabled).toBe(true);
      expect(
        (document.getElementById('sp-attach-screenshot-item') as HTMLButtonElement).disabled,
      ).toBe(true);
      if (!signedIn) {
        dropFiles([imageFile(16)]);
        await vi.waitFor(() =>
          expect(noticeText()).toBe(catalogMessage('spAttachmentUploadsOff', [])),
        );
        expect(pendingDataUrls()).toHaveLength(0);
      }
    }
  });
});

function clickSignOut(): void {
  document.getElementById('sp-cloud-signout-btn')!.click();
}

describe('the real side-panel account sign-out owner', () => {
  it('finishes web revocation before Clerk sign-out and clearing owner-bound drafts', async () => {
    dropFiles([imageFile(16)]);
    await expectPendingCount(1);
    let finish!: () => void;
    account.revoke.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    chromeMock.runtime.sendMessage.mockClear();
    chromeMock.storage.local.remove.mockClear();
    account.signOut.mockClear();
    clickSignOut();
    await vi.waitFor(() => expect(account.revoke).toHaveBeenCalledOnce());
    expect(account.signOut).not.toHaveBeenCalled();
    expect(pendingDataUrls()).toHaveLength(1);
    expect(chromeMock.storage.local.remove).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() =>
      expect((document.getElementById('sp-input') as HTMLTextAreaElement).disabled).toBe(true),
    );
    expect(account.signOut).toHaveBeenCalledOnce();
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'MANAGED_CLOUD_AUTH_CHANGED',
      previousOwner: account.owner,
    });
    expect(chromeMock.runtime.sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
      account.signOut.mock.invocationCallOrder[0]!,
    );
    expect(chromeMock.storage.session.remove).toHaveBeenCalledWith(['agi_clerk_session_token']);
    expect(chromeMock.storage.local.remove).toHaveBeenCalledWith(['agi_dev_bearer_token']);
    expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([
      'agi_api_key',
      'agi_user_id',
      'agi_user_tier',
      'agi_session',
    ]);
    expect(pendingDataUrls()).toHaveLength(0);
    expect(document.getElementById('sp-cloud-signout-status')!.textContent).toBe('');
  });
  it('reports failed shared-session revocation while still ending local access', async () => {
    account.revoke.mockRejectedValueOnce(new Error('fixture session revocation refused'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    clickSignOut();
    await vi.waitFor(() =>
      expect(document.getElementById('sp-cloud-signout-status')!.textContent).toBe(
        catalogMessage('spCloudSignOutSyncFailed', []),
      ),
    );
    await vi.waitFor(() =>
      expect((document.getElementById('sp-input') as HTMLTextAreaElement).disabled).toBe(true),
    );
    expect(account.signOut).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalled();
    expect(chromeMock.storage.local.remove).toHaveBeenCalledWith([
      'agi_api_key',
      'agi_user_id',
      'agi_user_tier',
      'agi_session',
    ]);
  });
});

function openTaskDraft(): HTMLButtonElement {
  document.getElementById('sp-wf-new-task-btn')!.click();
  (document.getElementById('sp-wf-nt-name') as HTMLInputElement).value = 'Fixture task';
  (document.getElementById('sp-wf-nt-prompt') as HTMLTextAreaElement).value = 'Summarize my page';
  return document.getElementById('sp-wf-nt-save') as HTMLButtonElement;
}

describe('the real scheduled-task form keeps refused requests reviewable', () => {
  it.each(['authorization', 'runtime', 'missing-response'] as const)(
    'preserves the create draft after %s failure',
    async (failure) => {
      const save = openTaskDraft();
      save.click();
      expect(save.disabled).toBe(true);
      expect(save.textContent).toBe(catalogMessage('spTaskCreating', []));
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CREATE_SCHEDULED_TASK', owner: account.owner }),
        expect.any(Function),
      );
      chromeMock.runtime.lastError =
        failure === 'runtime' ? { message: 'Worker unavailable' } : undefined;
      chromeMock.taskCallback!(
        failure === 'missing-response'
          ? undefined
          : { success: false, error: 'Owner authorization denied' },
      );
      chromeMock.runtime.lastError = undefined;
      expect(document.getElementById('sp-wf-new-task-form')!.classList.contains('open')).toBe(true);
      expect(document.getElementById('sp-wf-nt-error')!.textContent).toBe(
        failure === 'runtime'
          ? 'Worker unavailable'
          : failure === 'missing-response'
            ? catalogMessage('spTaskCreateFailed', [])
            : 'Owner authorization denied',
      );
      expect((document.getElementById('sp-wf-nt-name') as HTMLInputElement).value).toBe(
        'Fixture task',
      );
      expect(save.disabled).toBe(false);
      expect(save.textContent).toBe(catalogMessage('spTaskCreate', []));
    },
  );
  it('preserves the edit draft and restores its edit label after a denied update', async () => {
    chromeMock.tasks = [
      {
        id: 'task_1700000000000_abcdef123456',
        name: 'Fixture task',
        prompt: 'Existing prompt',
        enabled: true,
        scheduleType: 'daily',
        scheduleValue: '',
      },
    ];
    document.getElementById('sp-tab-workflows')!.click();
    let edit!: HTMLButtonElement;
    await vi.waitFor(() => {
      edit = Array.from(
        document.querySelectorAll<HTMLButtonElement>('#sp-wf-tasks-list button'),
      ).find((button) => button.title === catalogMessage('spTaskEdit', ['Fixture task']))!;
      expect(edit).toBeDefined();
    });
    edit.click();
    const save = document.getElementById('sp-wf-nt-save') as HTMLButtonElement;
    (document.getElementById('sp-wf-nt-name') as HTMLInputElement).value = 'Edited task';
    save.click();
    expect(save.textContent).toBe(catalogMessage('spTaskSaving', []));
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UPDATE_SCHEDULED_TASK',
        owner: account.owner,
        taskId: chromeMock.tasks[0]!.id,
      }),
      expect.any(Function),
    );
    chromeMock.taskCallback!({ success: false, error: 'Owner authorization denied' });
    expect(document.getElementById('sp-wf-new-task-form')!.classList.contains('open')).toBe(true);
    expect(document.getElementById('sp-wf-nt-error')!.textContent).toBe(
      'Owner authorization denied',
    );
    expect((document.getElementById('sp-wf-nt-name') as HTMLInputElement).value).toBe(
      'Edited task',
    );
    expect(save.disabled).toBe(false);
    expect(save.textContent).toBe(catalogMessage('spTaskSaveChanges', []));
  });
  it('discards a delayed create response after sign-out closes the owner-bound draft', async () => {
    openTaskDraft().click();
    const reply = chromeMock.taskCallback!;
    expect(reply).toBeTypeOf('function');
    clickSignOut();
    await vi.waitFor(() =>
      expect((document.getElementById('sp-input') as HTMLTextAreaElement).disabled).toBe(true),
    );
    reply({ success: false, error: 'Old account request failed' });
    expect(document.getElementById('sp-wf-new-task-form')!.classList.contains('open')).toBe(false);
    expect(document.getElementById('sp-wf-nt-error')!.textContent).toBe('');
    expect((document.getElementById('sp-wf-nt-name') as HTMLInputElement).value).toBe('');
  });
});

async function expectReadyAccount(): Promise<void> {
  await vi.waitFor(() => {
    expect((document.getElementById('sp-input') as HTMLTextAreaElement).disabled).toBe(false);
    expect(document.getElementById('sp-cloud-user-label')!.textContent).toBe(
      account.owner.authIncarnation,
    );
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

describe('image intake stays with its admitted account epoch', () => {
  describe('New Chat and existing conversation invalidation', () => {
    it('New Chat immediately cancels a pending image read without admitting its late result', async () => {
      const readers: FileReader[] = [];
      let complete!: (event: ProgressEvent<FileReader>) => void;
      vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (
        this: FileReader,
      ) {
        readers.push(this);
        complete = this.onload!;
      });
      const abort = vi.spyOn(FileReader.prototype, 'abort');
      pickFiles([imageFile(16)]);
      await vi.waitFor(() => expect(readers).toHaveLength(1));
      const reader = readers[0]!;
      expect((document.getElementById('sp-attach-btn') as HTMLButtonElement).disabled).toBe(true);
      document.getElementById('sp-new-chat-btn')!.click();
      const blockedAfterReset = (document.getElementById('sp-attach-btn') as HTMLButtonElement)
        .disabled;
      Object.defineProperty(reader, 'result', { value: dataUrlOfBytes(16) });
      complete.call(reader, new ProgressEvent('load') as ProgressEvent<FileReader>);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(blockedAfterReset).toBe(false);
      expect(abort).toHaveBeenCalledOnce();
      expect(pendingDataUrls()).toHaveLength(0);
      expect(noticeText()).toBe('');
    });

    it.each(['menu', 'drawer'] as const)(
      'New Chat releases a pending %s capture and its late reply cannot release the new intake',
      async (source) => {
        chromeMock.deferScreenshots = true;
        const button = document.getElementById(
          source === 'menu' ? 'sp-attach-screenshot-item' : 'sp-drawer-capture-btn',
        ) as HTMLButtonElement;
        button.click();
        expect(chromeMock.screenshotReplies).toHaveLength(1);
        document.getElementById('sp-new-chat-btn')!.click();
        const blockedAfterReset = (document.getElementById('sp-attach-btn') as HTMLButtonElement)
          .disabled;
        const oldReply = chromeMock.screenshotReplies[0]!;
        if (blockedAfterReset) {
          oldReply({ success: true, data: dataUrlOfBytes(16) });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        (document.getElementById('sp-attach-screenshot-item') as HTMLButtonElement).click();
        expect(chromeMock.screenshotReplies).toHaveLength(2);
        oldReply({ success: true, data: dataUrlOfBytes(16) });
        const blockedDuringNewIntake = (
          document.getElementById('sp-attach-btn') as HTMLButtonElement
        ).disabled;
        expect(pendingDataUrls()).toHaveLength(0);
        chromeMock.screenshotReplies[1]!({ success: true, data: dataUrlOfBytes(24) });
        await expectPendingCount(1);
        expect(blockedAfterReset).toBe(false);
        expect(blockedDuringNewIntake).toBe(true);
        expect(pendingDataUrls()).toEqual([dataUrlOfBytes(24)]);
        expect(noticeText()).toBe('');
      },
    );

    it('New Chat preserves already admitted image drafts within the same account', async () => {
      pickFiles([imageFile(16)]);
      await expectPendingCount(1);
      const admitted = pendingDataUrls();
      document.getElementById('sp-new-chat-btn')!.click();
      expect(pendingDataUrls()).toEqual(admitted);
      expect((document.getElementById('sp-attach-btn') as HTMLButtonElement).disabled).toBe(false);
    });

    async function selectAdmittedModel(): Promise<void> {
      account.modelIds = [getRoutingSlotModel('general_fast')];
      account.onChange!();
      let option!: HTMLButtonElement;
      await vi.waitFor(() => {
        option = Array.from(
          document.querySelectorAll<HTMLButtonElement>('#sp-model-dropdown [role="menuitemradio"]'),
        ).find((button) => button.getAttribute('aria-checked') === 'false')!;
        expect(option).toBeDefined();
      });
      option.click();
      expect(document.getElementById('sp-model-badge')!.textContent).toBe(
        getManagedModelBadgeLabel(account.modelIds[0]!),
      );
    }

    it('model selection releases the obsolete capture lease and preserves completed images', async () => {
      pickFiles([imageFile(16)]);
      await expectPendingCount(1);
      const admitted = pendingDataUrls();
      chromeMock.deferScreenshots = true;
      (document.getElementById('sp-attach-screenshot-item') as HTMLButtonElement).click();
      await selectAdmittedModel();
      const blockedAfterSelection = (document.getElementById('sp-attach-btn') as HTMLButtonElement)
        .disabled;
      chromeMock.screenshotReplies[0]!({ success: true, data: dataUrlOfBytes(24) });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(blockedAfterSelection).toBe(false);
      expect(pendingDataUrls()).toEqual(admitted);
    });

    it('account model reconciliation releases an obsolete capture lease', async () => {
      await selectAdmittedModel();
      chromeMock.deferScreenshots = true;
      (document.getElementById('sp-drawer-capture-btn') as HTMLButtonElement).click();
      account.modelIds = [];
      account.onChange!();
      await vi.waitFor(() =>
        expect(document.getElementById('sp-model-badge')!.textContent).toBe(
          getManagedModelBadgeLabel('auto'),
        ),
      );
      const blockedAfterReconciliation = (
        document.getElementById('sp-attach-btn') as HTMLButtonElement
      ).disabled;
      chromeMock.screenshotReplies[0]!({ success: true, data: dataUrlOfBytes(24) });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(blockedAfterReconciliation).toBe(false);
      expect(pendingDataUrls()).toHaveLength(0);
    });

    it('restoring a saved conversation releases its predecessor capture lease', async () => {
      const content = 'Stored conversation intake ownership fixture';
      const conversationId = await saveConversation(account.owner, [
        { role: 'user', content, timestamp: Date.now(), runtime: 'managed-cloud' },
      ]);
      try {
        document.getElementById('sp-history-btn')!.click();
        let restore!: HTMLButtonElement;
        await vi.waitFor(() => {
          restore = Array.from(
            document.querySelectorAll<HTMLButtonElement>('[data-conversation-restore="true"]'),
          ).find((button) => button.textContent?.includes(content))!;
          expect(restore).toBeDefined();
        });
        chromeMock.deferScreenshots = true;
        (document.getElementById('sp-attach-screenshot-item') as HTMLButtonElement).click();
        restore.click();
        await vi.waitFor(() =>
          expect(document.getElementById('sp-messages')!.textContent).toContain(content),
        );
        const blockedAfterRestore = (document.getElementById('sp-attach-btn') as HTMLButtonElement)
          .disabled;
        chromeMock.screenshotReplies[0]!({ success: true, data: dataUrlOfBytes(24) });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(blockedAfterRestore).toBe(false);
        expect(pendingDataUrls()).toHaveLength(0);
      } finally {
        for (const reply of chromeMock.screenshotReplies) reply({ success: false });
        await deleteConversation(account.owner, conversationId);
      }
    });
  });

  it('cancels a delayed file read on same-account session replacement and rejects late completion', async () => {
    const readers: FileReader[] = [];
    let complete!: (event: ProgressEvent<FileReader>) => void;
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      readers.push(this);
      complete = this.onload!;
    });
    const abort = vi.spyOn(FileReader.prototype, 'abort');
    dropFiles([imageFile(16)]);
    await vi.waitFor(() => expect(readers).toHaveLength(1));
    const reader = readers[0]!;
    await changeOwner('replacement-session');
    expect(abort).toHaveBeenCalledOnce();
    Object.defineProperty(reader, 'result', { value: dataUrlOfBytes(16) });
    complete.call(reader, new ProgressEvent('load') as ProgressEvent<FileReader>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pendingDataUrls()).toHaveLength(0);
    expect(document.querySelector('.sp-attachment-notices')).toBeNull();
    expect((document.getElementById('sp-attach-btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(['menu', 'drawer'] as const)(
    'discards a delayed %s capture after session replacement and an A-to-B-to-A return',
    async (source) => {
      chromeMock.deferScreenshots = true;
      const button = document.getElementById(
        source === 'menu' ? 'sp-attach-screenshot-item' : 'sp-drawer-capture-btn',
      ) as HTMLButtonElement;
      button.click();
      expect(chromeMock.screenshotReplies).toHaveLength(1);
      await changeOwner('replacement-session');
      await changeOwner('session-fixture');
      chromeMock.screenshotReplies[0]!({ success: true, data: dataUrlOfBytes(16) });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(pendingDataUrls()).toHaveLength(0);
      expect(noticeText()).toBe('');
      expect((document.getElementById('sp-attach-btn') as HTMLButtonElement).disabled).toBe(false);
      expect(document.getElementById('sp-drawer-capture-btn')!.classList.contains('active')).toBe(
        false,
      );
    },
  );

  it('ignores an old capture without releasing a new account intake', async () => {
    chromeMock.deferScreenshots = true;
    (document.getElementById('sp-attach-screenshot-item') as HTMLButtonElement).click();
    await changeOwner('replacement-session');
    (document.getElementById('sp-attach-screenshot-item') as HTMLButtonElement).click();
    expect(chromeMock.screenshotReplies).toHaveLength(2);
    chromeMock.screenshotReplies[0]!({ success: true, data: dataUrlOfBytes(16) });
    expect(pendingDataUrls()).toHaveLength(0);
    expect((document.getElementById('sp-send-btn') as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById('sp-attach-btn') as HTMLButtonElement).disabled).toBe(true);
    const input = document.getElementById('sp-input') as HTMLTextAreaElement;
    input.value = 'Keep this draft until capture finishes';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const sent = chromeMock.runtime.sendMessage.mock.calls.filter(
      ([message]) => message.type === 'CHAT_MESSAGE',
    ).length;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input.value).toBe('Keep this draft until capture finishes');
    expect(
      chromeMock.runtime.sendMessage.mock.calls.filter(
        ([message]) => message.type === 'CHAT_MESSAGE',
      ),
    ).toHaveLength(sent);
    chromeMock.screenshotReplies[1]!({ success: true, data: dataUrlOfBytes(16) });
    await expectPendingCount(1);
    expect((document.getElementById('sp-attach-btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('refuses capture while signed out or uploads are unavailable, including late results', async () => {
    chromeMock.deferScreenshots = true;
    (document.getElementById('sp-attach-screenshot-item') as HTMLButtonElement).click();
    account.uploadsAllowed = false;
    account.onChange!();
    await expectReadyAccount();
    chromeMock.screenshotReplies[0]!({ success: true, data: dataUrlOfBytes(16) });
    expect(pendingDataUrls()).toHaveLength(0);
    const requests = chromeMock.screenshotReplies.length;
    (document.getElementById('sp-drawer-capture-btn') as HTMLButtonElement).click();
    expect(chromeMock.screenshotReplies).toHaveLength(requests);
    account.signedIn = false;
    await refreshAccount();
    (document.getElementById('sp-drawer-capture-btn') as HTMLButtonElement).click();
    expect(chromeMock.screenshotReplies).toHaveLength(requests);
  });
});
