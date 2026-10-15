import { authorizeBrowserToolUrl, authorizeBrowserToolTab } from './tabAuthority';
import { isTaskTabAction, type TaskTabAction } from '../computer-use/browserToolDefinitions';
import type { BrowserContextTabReference } from '../../types';
import { MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH } from '@agiworkforce/cloud-contracts';

export async function admitSelectedContextTabs(
  value: unknown,
  windowId: number | undefined,
  assertCurrent: () => Promise<void>,
): Promise<readonly BrowserContextTabReference[]> {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    JSON.stringify(value).length > MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH
  )
    throw new Error('Selected tab references exceed the browser context budget or are invalid.');
  if (!Number.isSafeInteger(windowId) || windowId === undefined || windowId < 0)
    throw new Error('Selected tabs require a verified browser window.');
  const seen = new Set<number>();
  const references: BrowserContextTabReference[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('A selected tab reference is invalid.');
    const reference = raw as Record<string, unknown>;
    const tabId = reference['tabId'];
    const url = reference['url'];
    const documentId = reference['documentId'];
    if (
      Object.keys(reference).some(
        (key) => !['tabId', 'windowId', 'url', 'title', 'documentId'].includes(key),
      ) ||
      typeof tabId !== 'number' ||
      !Number.isSafeInteger(tabId) ||
      tabId < 0 ||
      seen.has(tabId) ||
      reference['windowId'] !== windowId ||
      typeof url !== 'string' ||
      typeof reference['title'] !== 'string' ||
      (documentId !== undefined && (typeof documentId !== 'string' || documentId.length === 0))
    )
      throw new Error(
        'A selected tab reference is invalid, duplicated or belongs to another window.',
      );
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
      throw new Error('Selected tabs must use ordinary HTTP(S) URLs without embedded credentials.');
    await assertCurrent();
    const authorized = await authorizeBrowserToolTab(tabId);
    await assertCurrent();
    const tab = await chrome.tabs.get(tabId);
    await assertCurrent();
    if (
      authorized.url !== url ||
      tab.url !== url ||
      tab.windowId !== windowId ||
      tab.status === 'loading'
    )
      throw new Error(
        'A selected tab changed or is still loading. Attach it again when the page has settled.',
      );
    if (documentId !== undefined) {
      const currentDocument = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        func: () => window.location.href,
      });
      await assertCurrent();
      if (
        currentDocument.length !== 1 ||
        currentDocument[0]?.documentId !== documentId ||
        currentDocument[0].result !== url
      )
        throw new Error(
          'A selected tab reloaded after its context was captured. Attach the page again.',
        );
    }
    const current = await authorizeBrowserToolTab(tabId);
    await assertCurrent();
    const finalTab = await chrome.tabs.get(tabId);
    await assertCurrent();
    if (
      current.url !== url ||
      finalTab.url !== url ||
      finalTab.windowId !== windowId ||
      finalTab.status === 'loading'
    )
      throw new Error('A selected tab changed during admission.');
    seen.add(tabId);
    references.push(
      Object.freeze({
        tabId,
        windowId,
        url,
        title: reference['title'],
        ...(typeof documentId === 'string' ? { documentId } : {}),
      }),
    );
  }
  return references;
}

export interface TaskTabPlan {
  readonly action: TaskTabAction;
  readonly sourceTabId: number;
  readonly sourceUrl: string;
  readonly targetTabId: number | null;
  readonly targetUrl: string;
  readonly returnTabId: number | null;
  readonly returnUrl: string | null;
}

export interface TaskTabReceipt {
  readonly action: TaskTabAction;
  readonly affectedTabId: number;
  readonly tabId: number;
  readonly url: string;
  readonly knownTabs: readonly { tabId: number; closeable: boolean }[];
}

export interface TaskWindowResizePlan {
  readonly sourceTabId: number;
  readonly sourceUrl: string;
  readonly windowId: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly requestedWidth: number;
  readonly requestedHeight: number;
}

export interface TaskWindowResizeReceipt {
  readonly tabId: number;
  readonly windowId: number;
  readonly width: number;
  readonly height: number;
  readonly requestedWidth: number;
  readonly requestedHeight: number;
  readonly matchedRequestedSize: boolean;
}

export interface TaskTabContext {
  readonly initialTabId: number;
  readonly selectedTabs?: readonly BrowserContextTabReference[];
  readonly windowId: number | undefined;
  readonly signal?: AbortSignal;
  readonly currentTabId: () => number;
  readonly assertCurrent: () => Promise<void>;
  readonly beginTransition: (tabId: number) => symbol;
  readonly commitTransition: (token: symbol, url: string) => void;
  readonly abortTransition: (token: symbol) => void;
  readonly transitionFailed: () => void;
}

class TaskTabUnavailableError extends Error {
  constructor(readonly tabId: number) {
    super('This task tab is no longer available.');
  }
}

export class TaskTabs {
  private readonly owned = new Map<number, boolean>();
  private readonly selectedSnapshots = new Map<number, BrowserContextTabReference>();
  private readonly plans = new WeakSet<TaskTabPlan>();
  private readonly resizePlans = new WeakSet<TaskWindowResizePlan>();

  constructor(private readonly context: TaskTabContext) {
    this.owned.set(context.initialTabId, false);
    for (const reference of context.selectedTabs ?? []) {
      this.owned.set(reference.tabId, false);
      this.selectedSnapshots.set(reference.tabId, reference);
    }
  }

  async list(): Promise<{
    tabId: number;
    tabs: Array<{ tabId: number; url: string; closeable: boolean }>;
  }> {
    const tabs: Array<{ tabId: number; url: string; closeable: boolean }> = [];
    for (const [tabId, closeable] of this.owned) {
      try {
        const tab = await this.read(tabId);
        tabs.push({ tabId, url: tab.url, closeable });
      } catch (error) {
        await this.assertCurrent();
        if (!(error instanceof TaskTabUnavailableError) || tabId === this.context.currentTabId())
          throw error;
        this.owned.delete(tabId);
        this.selectedSnapshots.delete(tabId);
      }
    }
    await this.assertCurrent();
    return { tabId: this.context.currentTabId(), tabs };
  }

  private async readWindow(): Promise<
    Omit<TaskWindowResizePlan, 'requestedWidth' | 'requestedHeight'>
  > {
    await this.assertCurrent();
    const windowId = this.context.windowId;
    if (windowId === undefined || !Number.isSafeInteger(windowId) || windowId < 0)
      throw new Error('This task has no verified browser window to resize.');
    const sourceTabId = this.context.currentTabId();
    const source = await this.read(sourceTabId);
    const current = await this.read(sourceTabId);
    if (
      this.context.currentTabId() !== sourceTabId ||
      current.url !== source.url ||
      !current.active
    )
      throw new Error('The current task tab changed before window resizing.');
    const window = await chrome.windows.get(windowId, { populate: false });
    await this.assertCurrent();
    if (
      window.id !== windowId ||
      !window.focused ||
      window.type !== 'normal' ||
      window.state !== 'normal'
    )
      throw new Error(
        'Only the focused normal browser window containing the task can be resized. Restore the window first if it is maximized or fullscreen.',
      );
    const { left, top, width, height } = window;
    if (
      typeof left !== 'number' ||
      !Number.isSafeInteger(left) ||
      typeof top !== 'number' ||
      !Number.isSafeInteger(top) ||
      typeof width !== 'number' ||
      !Number.isSafeInteger(width) ||
      width <= 0 ||
      typeof height !== 'number' ||
      !Number.isSafeInteger(height) ||
      height <= 0
    )
      throw new Error('Chrome did not return verified task-window dimensions.');
    return { sourceTabId, sourceUrl: current.url, windowId, left, top, width, height };
  }

  async prepareResize(args: Record<string, unknown>): Promise<TaskWindowResizePlan> {
    const { width, height } = args;
    if (
      Object.keys(args).length !== 2 ||
      typeof width !== 'number' ||
      !Number.isSafeInteger(width) ||
      width <= 0 ||
      typeof height !== 'number' ||
      !Number.isSafeInteger(height) ||
      height <= 0
    )
      throw new Error('resize_window requires only positive integer width and height.');
    const plan = Object.freeze({
      ...(await this.readWindow()),
      requestedWidth: width,
      requestedHeight: height,
    });
    this.resizePlans.add(plan);
    return plan;
  }

  async resize(plan: TaskWindowResizePlan): Promise<TaskWindowResizeReceipt> {
    if (!this.resizePlans.has(plan))
      throw new Error('Window resizing has no task-owned approval plan.');
    this.resizePlans.delete(plan);
    let focusLost = false;
    const onFocusChanged = (windowId: number): void => {
      if (windowId !== plan.windowId) focusLost = true;
    };
    const assertFocus = (): void => {
      if (focusLost) throw new Error('The task window lost foreground focus during resizing.');
    };
    chrome.windows.onFocusChanged.addListener(onFocusChanged);
    try {
      const before = await this.readWindow();
      if (
        JSON.stringify({
          ...before,
          requestedWidth: plan.requestedWidth,
          requestedHeight: plan.requestedHeight,
        }) !== JSON.stringify(plan)
      )
        throw new Error('The approved task tab or window dimensions changed before resizing.');
      await this.assertCurrent();
      assertFocus();
      await chrome.windows.update(plan.windowId, {
        width: plan.requestedWidth,
        height: plan.requestedHeight,
      });
      await this.assertCurrent();
      assertFocus();
      const actual = await this.readWindow();
      assertFocus();
      if (
        actual.sourceTabId !== plan.sourceTabId ||
        actual.sourceUrl !== plan.sourceUrl ||
        actual.windowId !== plan.windowId
      )
        throw new Error('The task tab or window changed during resizing.');
      return {
        tabId: actual.sourceTabId,
        windowId: actual.windowId,
        width: actual.width,
        height: actual.height,
        requestedWidth: plan.requestedWidth,
        requestedHeight: plan.requestedHeight,
        matchedRequestedSize:
          actual.width === plan.requestedWidth && actual.height === plan.requestedHeight,
      };
    } finally {
      chrome.windows.onFocusChanged.removeListener(onFocusChanged);
    }
  }

  private async assertCurrent(): Promise<void> {
    if (this.context.signal?.aborted) throw this.context.signal.reason;
    await this.context.assertCurrent();
    if (this.context.signal?.aborted) throw this.context.signal.reason;
  }

  private async read(tabId: number): Promise<chrome.tabs.Tab & { url: string }> {
    if (!this.owned.has(tabId)) throw new Error('That tab is not owned by this browser task.');
    await this.assertCurrent();
    const snapshot = this.selectedSnapshots.get(tabId);
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      await this.assertCurrent();
      throw new TaskTabUnavailableError(tabId);
    }
    await this.assertCurrent();
    if (!tab.url || tab.windowId !== this.context.windowId)
      throw new Error('The task tab changed or moved to another window.');
    if (snapshot)
      await admitSelectedContextTabs([snapshot], this.context.windowId, () => this.assertCurrent());
    const admitted = await authorizeBrowserToolTab(tabId);
    await this.assertCurrent();
    const current = await chrome.tabs.get(tabId);
    await this.assertCurrent();
    if (current.url !== admitted.url || current.windowId !== this.context.windowId)
      throw new Error('The task tab changed while its permission was being verified.');
    if (snapshot && current.url !== snapshot.url)
      throw new Error('The attached tab changed before this task first read it. Attach it again.');
    this.selectedSnapshots.delete(tabId);
    return { ...current, url: admitted.url };
  }

  async prepare(action: TaskTabAction, args: Record<string, unknown>): Promise<TaskTabPlan> {
    if (!isTaskTabAction(action)) throw new Error('Unsupported task tab action.');
    await this.assertCurrent();
    if (this.context.windowId === undefined)
      throw new Error('This task has no verified browser window for tab management.');
    const sourceTabId = this.context.currentTabId();
    const source = await this.read(sourceTabId);
    let targetTabId: number | null = null;
    let targetUrl: string;
    let returnTabId: number | null = null;
    let returnUrl: string | null = null;
    if (action === 'open_tab') {
      if (Object.keys(args).length !== 1 || typeof args['url'] !== 'string')
        throw new Error('open_tab requires only a URL.');
      targetUrl = new URL(args['url'], source.url).href;
      await authorizeBrowserToolUrl(targetUrl);
      await this.assertCurrent();
    } else {
      if (
        Object.keys(args).some(
          (key) => key !== 'tabId' && (action !== 'close_tab' || key !== 'returnToTabId'),
        ) ||
        typeof args['tabId'] !== 'number' ||
        !Number.isSafeInteger(args['tabId']) ||
        args['tabId'] < 0
      )
        throw new Error(`${action} requires a task-owned tab ID.`);
      targetTabId = args['tabId'];
      if (action === 'close_tab' && this.owned.get(targetTabId) !== true)
        throw new Error('Only tabs created by this task can be closed.');
      const target = await this.read(targetTabId);
      targetUrl = target.url;
      if (action === 'close_tab' && targetTabId === sourceTabId) {
        const requestedReturn = args['returnToTabId'];
        if (
          typeof requestedReturn !== 'number' ||
          !Number.isSafeInteger(requestedReturn) ||
          requestedReturn < 0 ||
          requestedReturn === targetTabId
        )
          throw new Error(
            'Closing the current task tab requires an explicit different returnToTabId owned by the task.',
          );
        returnTabId = requestedReturn;
        returnUrl = (await this.read(returnTabId)).url;
      } else if (args['returnToTabId'] !== undefined)
        throw new Error('returnToTabId is only used when closing the current task tab.');
    }
    const plan = Object.freeze({
      action,
      sourceTabId,
      sourceUrl: source.url,
      targetTabId,
      targetUrl,
      returnTabId,
      returnUrl,
    });
    this.plans.add(plan);
    return plan;
  }

  private async activate(tabId: number, url: string): Promise<void> {
    const target = await this.read(tabId);
    if (target.url !== url) throw new Error('The approved task tab changed before activation.');
    await this.assertCurrent();
    const token = this.context.beginTransition(tabId);
    try {
      await chrome.tabs.update(tabId, { active: true });
      await this.assertCurrent();
      const current = await this.read(tabId);
      if (current.url !== url) throw new Error('The approved task tab changed during activation.');
      if (!current.active) throw new Error('Chrome did not activate the approved task tab.');
      this.context.commitTransition(token, url);
      await this.assertCurrent();
    } catch (error) {
      this.context.abortTransition(token);
      this.context.transitionFailed();
      throw error;
    }
  }

  private async waitForCreatedTab(tabId: number, url: string): Promise<void> {
    const deadline = Date.now() + 3_000;
    while (Date.now() <= deadline) {
      await this.assertCurrent();
      const tab = await this.waitForPreparation(
        chrome.tabs.get(tabId),
        Math.max(0, deadline - Date.now()),
      );
      await this.assertCurrent();
      if (tab.windowId !== this.context.windowId)
        throw new Error('The new task tab moved to another window.');
      if (tab.url === url) return;
      if (tab.url && tab.url !== 'about:blank')
        throw new Error('The new task tab navigated away from the approved URL.');
      await this.waitForPreparation(
        new Promise<void>((resolve) => setTimeout(resolve, 100)),
        Math.max(0, deadline - Date.now()),
      );
    }
    throw new Error(
      'A new task tab was opened but did not reach its approved URL in time. It was not activated.',
    );
  }

  private waitForPreparation<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (value: T): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.context.signal?.removeEventListener('abort', abort);
        resolve(value);
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.context.signal?.removeEventListener('abort', abort);
        reject(error);
      };
      const abort = (): void =>
        fail(
          this.context.signal?.reason ??
            new DOMException('Tab preparation cancelled', 'AbortError'),
        );
      const timer = setTimeout(
        () =>
          fail(
            new Error(
              'A new task tab was opened but its approved destination could not be verified in time. It was not activated.',
            ),
          ),
        timeoutMs,
      );
      this.context.signal?.addEventListener('abort', abort, { once: true });
      operation.then(finish, fail);
      if (this.context.signal?.aborted) abort();
    });
  }

  async execute(plan: TaskTabPlan): Promise<TaskTabReceipt> {
    if (!this.plans.has(plan)) throw new Error('The tab action has no task-owned approval plan.');
    this.plans.delete(plan);
    const source = await this.read(this.context.currentTabId());
    if (this.context.currentTabId() !== plan.sourceTabId || source.url !== plan.sourceUrl)
      throw new Error('The current task tab changed after approval.');
    let affectedTabId = plan.targetTabId;
    if (plan.action === 'open_tab') {
      await authorizeBrowserToolUrl(plan.targetUrl);
      await this.assertCurrent();
      const created = await chrome.tabs.create({
        url: plan.targetUrl,
        windowId: this.context.windowId,
        active: false,
      });
      if (typeof created.id !== 'number' || !Number.isSafeInteger(created.id) || created.id < 0)
        throw new Error('Chrome did not return a verified new task tab.');
      affectedTabId = created.id;
      this.owned.set(created.id, true);
      await this.assertCurrent();
      await this.waitForCreatedTab(created.id, plan.targetUrl);
      const target = await this.read(created.id);
      await this.activate(created.id, target.url);
    } else {
      const target = await this.read(plan.targetTabId!);
      if (target.url !== plan.targetUrl)
        throw new Error('The approved task tab changed after approval.');
      if (plan.action === 'switch_tab') await this.activate(plan.targetTabId!, plan.targetUrl);
      else {
        if (plan.returnTabId !== null) await this.activate(plan.returnTabId, plan.returnUrl!);
        await this.assertCurrent();
        const closing = await this.read(plan.targetTabId!);
        if (closing.url !== plan.targetUrl)
          throw new Error('The task-created tab changed before closing.');
        await chrome.tabs.remove(plan.targetTabId!);
        this.owned.delete(plan.targetTabId!);
        await this.assertCurrent();
      }
    }
    const current = await this.read(this.context.currentTabId());
    return {
      action: plan.action,
      affectedTabId: affectedTabId!,
      tabId: this.context.currentTabId(),
      url: current.url,
      knownTabs: [...this.owned].map(([tabId, closeable]) => ({ tabId, closeable })),
    };
  }
}
