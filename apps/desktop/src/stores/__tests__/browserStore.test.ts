import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { useBrowserStore, cleanupBrowserStore } from '../browserStore';

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
  isTauri: true,
}));

// AUDIT-P3-TEST-TYPE: Use Mock type with explicit function signature for better type safety
type InvokeMock = Mock<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>;

async function getInvokeMock(): Promise<InvokeMock> {
  const { invoke } = await import('../../lib/tauri-mock');
  return invoke as InvokeMock;
}

describe('browserStore', () => {
  let invokeMock: InvokeMock;

  beforeEach(async () => {
    invokeMock = await getInvokeMock();
    invokeMock.mockReset();

    useBrowserStore.setState({
      sessions: [],
      activeSessionId: null,
      initialized: false,
      screenshots: [],
      actions: [],
      domSnapshots: [],
      highlightedElement: null,
      isRecording: false,
      recordedSteps: [],
      isStreaming: false,
      streamIntervalId: null,
    });
  });

  afterEach(() => {
    cleanupBrowserStore();
  });

  it('should initialize browser store', () => {
    const state = useBrowserStore.getState();

    expect(state.sessions).toEqual([]);
    expect(state.activeSessionId).toBeNull();
    expect(state.initialized).toBe(false);
    expect(state.screenshots).toEqual([]);
    expect(state.actions).toEqual([]);
  });

  it('should initialize browser', async () => {
    invokeMock.mockResolvedValue(undefined);

    await useBrowserStore.getState().initialize();

    expect(useBrowserStore.getState().initialized).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('browser_init');
  });

  it('should launch browser session', async () => {
    const sessionId = 'session-123';
    invokeMock.mockResolvedValue(sessionId);

    const returnedId = await useBrowserStore.getState().launchBrowser('Chromium', false);

    const state = useBrowserStore.getState();
    expect(returnedId).toBe(sessionId);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]?.id).toBe(sessionId);
    expect(state.sessions[0]?.browserType).toBe('Chromium');
    expect(state.sessions[0]?.headless).toBe(false);
    expect(state.activeSessionId).toBe(sessionId);
    expect(invokeMock).toHaveBeenCalledWith('browser_launch', {
      browserType: 'Chromium',
      headless: false,
    });
  });

  it('offers the viewer its own controls and nothing that scripts or reads a page', () => {
    const actions = Object.entries(useBrowserStore.getState())
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);

    expect(actions).toEqual(
      expect.arrayContaining([
        'launchBrowser',
        'closeBrowser',
        'openTab',
        'navigateTab',
        'goBack',
        'goForward',
        'reloadTab',
        'getUrl',
        'getTitle',
        'startStreaming',
      ]),
    );
    for (const removed of [
      'executeScript',
      'executeAsyncScript',
      'callFunction',
      'executeInFrame',
      'getCookies',
      'setCookie',
      'clearCookies',
      'clickElement',
      'typeText',
      'fillForm',
      'uploadFile',
      'getPageContent',
      'getDOMSnapshot',
    ]) {
      expect(actions).not.toContain(removed);
    }
  });

  it('should open new tab in active session', async () => {
    const sessionId = 'session-456';
    invokeMock.mockResolvedValueOnce(sessionId);
    await useBrowserStore.getState().launchBrowser('Chromium', true);

    const tabId = 'tab-789';
    const url = 'https://google.com';
    invokeMock.mockResolvedValueOnce(tabId);

    const returnedTabId = await useBrowserStore.getState().openTab(url);

    expect(returnedTabId).toBe(tabId);
    expect(invokeMock).toHaveBeenCalledWith('browser_open_tab', { url });

    const session = useBrowserStore.getState().sessions[0];
    expect(session?.tabs).toHaveLength(1);
    expect(session?.tabs[0]?.id).toBe(tabId);
    expect(session?.tabs[0]?.url).toBe(url);
  });

  it('should close browser via the browser_close command', async () => {
    invokeMock.mockResolvedValueOnce('session-1');
    await useBrowserStore.getState().launchBrowser('Chromium', false);

    invokeMock.mockResolvedValueOnce('tab-1');
    await useBrowserStore.getState().openTab('https://example.com');

    invokeMock.mockResolvedValueOnce(undefined);
    await useBrowserStore.getState().closeBrowser('session-1');

    expect(invokeMock).toHaveBeenCalledWith('browser_close', { browserId: 'session-1' });
    expect(useBrowserStore.getState().sessions).toEqual([]);
    expect(useBrowserStore.getState().activeSessionId).toBeNull();
  });

  it('should navigate tab to new URL', async () => {
    invokeMock.mockResolvedValueOnce('session-1');
    await useBrowserStore.getState().launchBrowser('Chromium', true);

    invokeMock.mockResolvedValueOnce('tab-1');
    await useBrowserStore.getState().openTab('https://example.com');

    const newUrl = 'https://example.com/new';
    invokeMock.mockResolvedValueOnce(undefined);
    await useBrowserStore.getState().navigateTab('tab-1', newUrl);

    expect(invokeMock).toHaveBeenCalledWith('browser_navigate', { tabId: 'tab-1', url: newUrl });

    const session = useBrowserStore.getState().sessions[0];
    expect(session?.tabs[0]?.url).toBe(newUrl);
  });

  it('marks only the newest tab as active when opening a new tab', async () => {
    invokeMock.mockResolvedValueOnce('session-1');
    await useBrowserStore.getState().launchBrowser('Chromium', false);

    invokeMock.mockResolvedValueOnce('tab-1');
    await useBrowserStore.getState().openTab('https://example.com');

    invokeMock.mockResolvedValueOnce('tab-2');
    await useBrowserStore.getState().openTab('https://openai.com');

    const tabs = useBrowserStore.getState().sessions[0]?.tabs ?? [];
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.active).toBe(false);
    expect(tabs[1]?.active).toBe(true);
  });

  it('should switch active session', () => {
    useBrowserStore.setState({
      sessions: [
        { id: 'session-1', browserType: 'Chromium', headless: false, tabs: [], active: true },
        { id: 'session-2', browserType: 'Chromium', headless: true, tabs: [], active: false },
      ],
      activeSessionId: 'session-1',
    });

    useBrowserStore.getState().setActiveSession('session-2');

    expect(useBrowserStore.getState().activeSessionId).toBe('session-2');
  });

  it('should start and stop recording', () => {
    const { startRecording, stopRecording } = useBrowserStore.getState();

    startRecording();
    expect(useBrowserStore.getState().isRecording).toBe(true);
    expect(useBrowserStore.getState().recordedSteps).toEqual([]);

    stopRecording();
    expect(useBrowserStore.getState().isRecording).toBe(false);
  });

  it('should clear actions', () => {
    useBrowserStore.setState({
      actions: [
        {
          id: '1',
          type: 'click',
          timestamp: Date.now(),
          success: true,
          details: { selector: '#btn' },
        },
      ],
    });

    useBrowserStore.getState().clearActions();

    expect(useBrowserStore.getState().actions).toEqual([]);
  });

  it('should clear screenshots', () => {
    useBrowserStore.setState({
      screenshots: [
        {
          id: 'ss-1',
          timestamp: Date.now(),
          data: 'base64data',
          tabId: 'tab-1',
        },
      ],
    });

    useBrowserStore.getState().clearScreenshots();

    expect(useBrowserStore.getState().screenshots).toEqual([]);
  });

  it('should limit screenshots to 50', () => {
    const { addScreenshot } = useBrowserStore.getState();

    for (let i = 0; i < 60; i++) {
      addScreenshot({
        id: `ss-${i}`,
        timestamp: Date.now() + i,
        data: `data-${i}`,
        tabId: 'tab-1',
      });
    }

    const screenshots = useBrowserStore.getState().screenshots;
    expect(screenshots.length).toBe(50);

    expect(screenshots[0]?.id).toBe('ss-10');
    expect(screenshots[49]?.id).toBe('ss-59');
  });

  it('should handle browser errors gracefully', async () => {
    const errorMessage = 'Browser not found';
    invokeMock.mockRejectedValue(new Error(errorMessage));

    await expect(useBrowserStore.getState().launchBrowser('Chromium', false)).rejects.toThrow(
      errorMessage,
    );
  });
});
