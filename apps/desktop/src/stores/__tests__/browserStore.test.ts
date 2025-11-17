// Updated Nov 16, 2025: Fixed test to actually test browserStore instead of JavaScript primitives
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { useBrowserStore, cleanupBrowserStore } from '../browserStore';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

type TauriInvoke = (typeof import('@tauri-apps/api/core'))['invoke'];
type InvokeMock = Mock<Parameters<TauriInvoke>, ReturnType<TauriInvoke>>;

async function getInvokeMock(): Promise<InvokeMock> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke as InvokeMock;
}

describe('browserStore', () => {
  let invokeMock: InvokeMock;

  beforeEach(async () => {
    invokeMock = await getInvokeMock();
    invokeMock.mockReset();

    // Reset store to initial state
    useBrowserStore.setState({
      sessions: [],
      activeSessionId: null,
      initialized: false,
      screenshots: [],
      actions: [],
      domSnapshots: [],
      consoleLogs: [],
      networkRequests: [],
      highlightedElement: null,
      isRecording: false,
      recordedSteps: [],
      isStreaming: false,
      streamIntervalId: null,
    });
  });

  afterEach(() => {
    // Updated Nov 16, 2025: Proper cleanup to prevent memory leaks
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
  });

  it('should open new tab in active session', async () => {
    // First launch a browser
    const sessionId = 'session-456';
    invokeMock.mockResolvedValueOnce(sessionId);
    await useBrowserStore.getState().launchBrowser('Firefox', true);

    // Then open a tab
    const tabId = 'tab-789';
    const url = 'https://example.com';
    invokeMock.mockResolvedValueOnce(tabId);

    const returnedTabId = await useBrowserStore.getState().openTab(url);

    expect(returnedTabId).toBe(tabId);
    expect(invokeMock).toHaveBeenCalledWith('browser_open_tab', { url });

    const session = useBrowserStore.getState().sessions[0];
    expect(session?.tabs).toHaveLength(1);
    expect(session?.tabs[0]?.id).toBe(tabId);
    expect(session?.tabs[0]?.url).toBe(url);
  });

  it('should close tab', async () => {
    // Setup: launch browser and open tab
    invokeMock.mockResolvedValueOnce('session-1');
    await useBrowserStore.getState().launchBrowser('Chromium', false);

    invokeMock.mockResolvedValueOnce('tab-1');
    await useBrowserStore.getState().openTab('https://test.com');

    // Close the tab
    invokeMock.mockResolvedValueOnce(undefined);
    await useBrowserStore.getState().closeTab('tab-1');

    expect(invokeMock).toHaveBeenCalledWith('browser_close_tab', { tabId: 'tab-1' });

    const session = useBrowserStore.getState().sessions[0];
    expect(session?.tabs).toHaveLength(0);
  });

  it('should navigate tab to new URL', async () => {
    // Setup
    invokeMock.mockResolvedValueOnce('session-1');
    await useBrowserStore.getState().launchBrowser('Webkit', true);

    invokeMock.mockResolvedValueOnce('tab-1');
    await useBrowserStore.getState().openTab('https://old.com');

    // Navigate
    const newUrl = 'https://new.com';
    invokeMock.mockResolvedValueOnce(undefined);
    await useBrowserStore.getState().navigateTab('tab-1', newUrl);

    expect(invokeMock).toHaveBeenCalledWith('browser_navigate', { tabId: 'tab-1', url: newUrl });

    const session = useBrowserStore.getState().sessions[0];
    expect(session?.tabs[0]?.url).toBe(newUrl);
  });

  it('should switch active session', () => {
    // Setup multiple sessions
    useBrowserStore.setState({
      sessions: [
        { id: 'session-1', browserType: 'Chromium', headless: false, tabs: [], active: true },
        { id: 'session-2', browserType: 'Firefox', headless: true, tabs: [], active: false },
      ],
      activeSessionId: 'session-1',
    });

    useBrowserStore.getState().setActiveSession('session-2');

    expect(useBrowserStore.getState().activeSessionId).toBe('session-2');
  });

  it('should take screenshot', async () => {
    const base64Data = 'data:image/png;base64,iVBORw0KGgo...';
    invokeMock.mockResolvedValue(base64Data);

    const result = await useBrowserStore.getState().screenshot('tab-1');

    expect(result).toBe(base64Data);
    expect(invokeMock).toHaveBeenCalledWith('browser_screenshot', { tabId: 'tab-1' });
  });

  it('should click element', async () => {
    invokeMock.mockResolvedValue(undefined);

    await useBrowserStore.getState().clickElement('tab-1', '#submit-button');

    expect(invokeMock).toHaveBeenCalledWith('browser_click', {
      tabId: 'tab-1',
      selector: '#submit-button',
    });
  });

  it('should type text in element', async () => {
    invokeMock.mockResolvedValue(undefined);

    await useBrowserStore.getState().typeText('tab-1', '#email-input', 'test@example.com');

    expect(invokeMock).toHaveBeenCalledWith('browser_type', {
      tabId: 'tab-1',
      selector: '#email-input',
      text: 'test@example.com',
    });
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
    // Add some actions
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
    // Add some screenshots
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

    // Add 60 screenshots
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
    // Should keep the most recent ones
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
