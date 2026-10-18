import { BROWSER_COMMAND_TIMEOUT_MS } from '@agiworkforce/types';
import { authorizeBrowserToolTab, authorizeBrowserToolUrl } from '../browser-tools/tabAuthority';
import {
  click,
  getTargetSignature,
  inspectSelectorActivation,
  INPUT_CLEANUP_TIMEOUT_MS,
  navigate,
  navigateHistoryTarget,
  registerActiveTab,
  resolveHistoryTarget,
  screenshot,
  typeIntoSelector,
  unregisterActiveTab,
  type ActiveTabRegistration,
} from '../computer-use/cdpDriver';
import {
  acquireDebugger,
  awaitCdpOperation,
  debuggerSessionIdentity,
  releaseDebugger,
  sendDebuggerCommand,
  throwIfCdpCancelled,
} from '../computer-use/debuggerSession';

interface NativeDocument {
  frameId: string;
  loaderId: string;
}

const HISTORY_SETTLE_POLL_MS = 100;

export class NativeBrowserDriver {
  readonly signal: AbortSignal;
  private tabId: number | null = null;
  private windowId: number | null = null;
  private sourceUrl: string | null = null;
  private document: NativeDocument | null = null;
  private destination: string | null = null;
  private session: symbol | null = null;
  private registration: ActiveTabRegistration | null = null;
  private disposed = false;

  constructor(
    private readonly controller: AbortController,
    private readonly assertExternalOwnership: () => void,
  ) {
    this.signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(BROWSER_COMMAND_TIMEOUT_MS),
    ]);
    chrome.tabs.onRemoved.addListener(this.onRemoved);
    chrome.tabs.onActivated.addListener(this.onActivated);
    chrome.tabs.onUpdated.addListener(this.onUpdated);
    chrome.windows.onFocusChanged.addListener(this.onWindowFocused);
  }

  private readonly onRemoved = (tabId: number): void => {
    if (tabId === this.tabId) this.cancel('The paired browser tab was closed.');
  };

  private readonly onActivated = (active: chrome.tabs.OnActivatedInfo): void => {
    if (active.windowId === this.windowId && active.tabId !== this.tabId)
      this.cancel('The foreground browser tab changed during paired work.');
  };

  private readonly onWindowFocused = (windowId: number): void => {
    if (this.windowId !== null && windowId >= 0 && windowId !== this.windowId)
      this.cancel('The foreground browser window changed during paired work.');
  };

  private readonly onUpdated = (tabId: number, change: chrome.tabs.OnUpdatedInfo): void => {
    if (tabId !== this.tabId) return;
    if (
      change.url !== undefined &&
      change.url !== this.sourceUrl &&
      change.url !== this.destination
    )
      this.cancel('The paired browser page changed to an unexpected address.');
    else if (change.status === 'loading' && !this.destination)
      this.cancel('The original paired browser document started navigating.');
  };

  cancel(message: string): void {
    if (!this.controller.signal.aborted) this.controller.abort(new Error(message));
  }

  async openTab(
    url: string,
  ): Promise<{ tabId: number; url: string; destination: 'paired-browser'; sharedProfile: true }> {
    const check = (): void => {
      this.assertExternalOwnership();
      throwIfCdpCancelled(this.signal);
    };
    check();
    await authorizeBrowserToolUrl(url);
    check();
    const tab = await chrome.tabs.create({ url, active: true });
    check();
    if (!Number.isSafeInteger(tab.id))
      throw new Error('The browser did not acknowledge the new tab.');
    return { tabId: tab.id!, url, destination: 'paired-browser', sharedProfile: true };
  }

  async resolveTabId(explicitTabId?: number): Promise<number | null> {
    this.assertExternalOwnership();
    throwIfCdpCancelled(this.signal);
    const window = await chrome.windows.getLastFocused();
    if (!Number.isSafeInteger(window.id)) return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
    if (
      typeof tab?.id !== 'number' ||
      !Number.isSafeInteger(tab.id) ||
      tab.id < 0 ||
      !tab.url ||
      !/^https?:\/\//u.test(tab.url)
    )
      return null;
    this.assertExternalOwnership();
    throwIfCdpCancelled(this.signal);
    if (explicitTabId !== undefined && explicitTabId !== tab.id)
      throw new Error('The requested browser tab is not the foreground paired tab.');
    this.tabId = tab.id;
    this.windowId = window.id!;
    this.sourceUrl = tab.url;
    await this.assertOwnership(tab.id);
    this.session = await acquireDebugger(tab.id, this.signal);
    try {
      this.document = await this.readDocument(tab.id, this.signal);
      await this.assertOwnership(tab.id);
      this.registration = registerActiveTab(
        tab.id,
        () => this.cancel('Browser control was detached during paired work.'),
        () => this.assertOwnership(tab.id!),
        () => this.assertOwnership(tab.id!, true),
      );
      return tab.id;
    } catch (error) {
      this.cancel(
        error instanceof Error
          ? error.message
          : 'The paired browser document could not be verified.',
      );
      throw error;
    }
  }

  private async readDocument(tabId: number, signal?: AbortSignal): Promise<NativeDocument> {
    if (!this.session || debuggerSessionIdentity(tabId) !== this.session)
      throw new Error('The original paired browser debugger session changed.');
    const response = await sendDebuggerCommand<{
      frameTree?: { frame?: { id?: unknown; loaderId?: unknown } };
    }>(tabId, 'Page.getFrameTree', {}, signal);
    const frame = response.frameTree?.frame;
    if (
      !frame ||
      typeof frame.id !== 'string' ||
      !frame.id ||
      typeof frame.loaderId !== 'string' ||
      !frame.loaderId
    )
      throw new Error('The paired browser document could not be identified.');
    return { frameId: frame.id, loaderId: frame.loaderId };
  }

  async assertOwnership(tabId: number, cleanup = false): Promise<void> {
    try {
      if (!cleanup) throwIfCdpCancelled(this.signal);
      this.assertExternalOwnership();
      if (this.disposed || tabId !== this.tabId || this.windowId === null || !this.sourceUrl)
        throw new Error('The original paired browser command lease changed.');
      const authorized = await authorizeBrowserToolTab(tabId);
      const tab = await chrome.tabs.get(tabId);
      const window = await chrome.windows.getLastFocused();
      const [active] = await chrome.tabs.query({ active: true, windowId: this.windowId });
      if (window.id !== this.windowId || tab.windowId !== this.windowId || active?.id !== tabId)
        throw new Error('The original paired browser tab is no longer foreground.');
      if (
        authorized.url !== tab.url ||
        (tab.url !== this.sourceUrl && tab.url !== this.destination)
      )
        throw new Error('The paired browser page changed outside the approved action.');
      if (this.session) {
        const current = await this.readDocument(
          tabId,
          cleanup ? AbortSignal.timeout(INPUT_CLEANUP_TIMEOUT_MS) : this.signal,
        );
        if (
          this.document &&
          (current.frameId !== this.document.frameId ||
            current.loaderId !== this.document.loaderId) &&
          !(this.destination && tab.url === this.destination)
        )
          throw new Error('The original paired browser document changed.');
      }
      this.assertExternalOwnership();
      if (!cleanup) throwIfCdpCancelled(this.signal);
    } catch (error) {
      if (!cleanup)
        this.cancel(
          error instanceof Error
            ? error.message
            : 'The paired browser lease could not be verified.',
        );
      throw error;
    }
  }

  async click(tabId: number, selector: string) {
    await this.assertOwnership(tabId);
    const signature = await getTargetSignature(tabId, selector, this.signal);
    if (!signature) throw new Error('The paired click target is unavailable or ambiguous.');
    const activation = await inspectSelectorActivation(tabId, selector, this.signal);
    if (activation.kind === 'navigation' && activation.url) this.destination = activation.url;
    await click(tabId, selector, this.signal, { expectedSignature: signature });
    await this.assertOwnership(tabId);
    const current = await chrome.tabs.get(tabId);
    await this.assertOwnership(tabId);
    return {
      inputSource: 'cdp' as const,
      nativeInputAcknowledged: true as const,
      targetVerified: true as const,
      observedUrl: current.url ?? this.sourceUrl,
      navigationObserved: current.url !== this.sourceUrl,
    };
  }

  async type(tabId: number, selector: string, text: string, clear: boolean) {
    await this.assertOwnership(tabId);
    const receipt = await typeIntoSelector(tabId, selector, text, clear, this.signal);
    await this.assertOwnership(tabId);
    return receipt;
  }

  async navigate(tabId: number, url: string): Promise<void> {
    await this.assertOwnership(tabId);
    await authorizeBrowserToolUrl(url);
    this.destination = new URL(url).href;
    await navigate(tabId, this.destination, this.signal);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        chrome.tabs.onUpdated.removeListener(updated);
        this.signal.removeEventListener('abort', aborted);
        if (error) reject(error);
        else resolve();
      };
      const verify = async (): Promise<void> => {
        try {
          await this.assertOwnership(tabId);
          const tab = await chrome.tabs.get(tabId);
          const current = await this.readDocument(tabId, this.signal);
          await this.assertOwnership(tabId);
          const documentChanged =
            !this.document ||
            current.frameId !== this.document.frameId ||
            current.loaderId !== this.document.loaderId;
          const fragmentChanged = new URL(this.sourceUrl!).hash !== new URL(this.destination!).hash;
          if (
            tab.url === this.destination &&
            tab.status === 'complete' &&
            (documentChanged || fragmentChanged)
          )
            finish();
        } catch (error) {
          finish(error);
        }
      };
      const updated = (id: number): void => {
        if (id === tabId) void verify();
      };
      const aborted = (): void =>
        finish(
          this.signal.reason instanceof Error
            ? this.signal.reason
            : new Error('The paired navigation was cancelled.'),
        );
      chrome.tabs.onUpdated.addListener(updated);
      this.signal.addEventListener('abort', aborted, { once: true });
      if (this.signal.aborted) aborted();
      else void verify();
    });
  }

  async history(tabId: number, direction: 'back' | 'forward'): Promise<void> {
    await this.assertOwnership(tabId);
    const target = await resolveHistoryTarget(tabId, direction, this.signal);
    if (!target) throw new Error(`This tab has no web page to go ${direction} to.`);
    await authorizeBrowserToolUrl(target.url);
    const current = await chrome.tabs.get(tabId);
    if (!current.url || (current.url !== this.sourceUrl && current.url !== this.destination))
      throw new Error('The paired browser page changed outside the approved action.');
    this.sourceUrl = current.url;
    this.document = await this.readDocument(tabId, this.signal);
    this.destination = target.url;
    await this.assertOwnership(tabId);
    await navigateHistoryTarget(tabId, target, this.signal);
    const reverse = direction === 'back' ? 'forward' : 'back';
    while (true) {
      throwIfCdpCancelled(this.signal);
      const tab = await chrome.tabs.get(tabId);
      if (tab.url === target.url && tab.status === 'complete') {
        await this.assertOwnership(tabId);
        const landed = await resolveHistoryTarget(tabId, reverse, this.signal);
        if (landed?.sourceEntryId === target.entryId) return;
      }
      await awaitCdpOperation(
        new Promise<void>((resolve) => setTimeout(resolve, HISTORY_SETTLE_POLL_MS)),
        this.signal,
      );
    }
  }

  async capture(tabId: number): Promise<string> {
    await this.assertOwnership(tabId);
    const image = await screenshot(tabId, this.signal);
    await this.assertOwnership(tabId);
    return image;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    chrome.tabs.onRemoved.removeListener(this.onRemoved);
    chrome.tabs.onActivated.removeListener(this.onActivated);
    chrome.tabs.onUpdated.removeListener(this.onUpdated);
    chrome.windows.onFocusChanged.removeListener(this.onWindowFocused);
    if (this.tabId !== null && this.registration)
      unregisterActiveTab(this.tabId, this.registration);
    if (this.tabId !== null && this.session) {
      try {
        await awaitCdpOperation(
          releaseDebugger(this.tabId, this.session),
          AbortSignal.timeout(INPUT_CLEANUP_TIMEOUT_MS),
        );
      } catch {
        console.warn('The paired browser debugger release is unconfirmed.');
      }
    }
  }
}
