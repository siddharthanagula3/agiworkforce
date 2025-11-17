// Updated Nov 16, 2025: Added UnlistenFn import for cleanup
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

export interface BrowserSession {
  id: string;
  browserType: 'Chromium' | 'Firefox' | 'Webkit';
  headless: boolean;
  tabs: BrowserTab[];
  active: boolean;
}

export type BrowserType = BrowserSession['browserType'];

export type ActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'extract'
  | 'screenshot'
  | 'scroll'
  | 'wait'
  | 'execute';

export interface BrowserAction {
  id: string;
  type: ActionType;
  timestamp: number;
  duration?: number;
  success: boolean;
  details: {
    url?: string;
    selector?: string;
    text?: string;
    script?: string;
    result?: any;
    error?: string;
  };
  screenshotId?: string;
}

export interface Screenshot {
  id: string;
  timestamp: number;
  data: string; // base64
  tabId: string;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DOMSnapshot {
  html: string;
  timestamp: number;
}

export interface ConsoleLog {
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: number;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  duration_ms: number;
  timestamp: number;
}

export interface RecordedStep {
  id: string;
  type: ActionType;
  selector?: string;
  value?: string;
  timestamp: number;
}

interface BrowserState {
  // Sessions
  sessions: BrowserSession[];
  activeSessionId: string | null;
  initialized: boolean;

  // Visualization state
  screenshots: Screenshot[];
  actions: BrowserAction[];
  domSnapshots: DOMSnapshot[];
  consoleLogs: ConsoleLog[];
  networkRequests: NetworkRequest[];
  highlightedElement: ElementBounds | null;

  // Recording state
  isRecording: boolean;
  recordedSteps: RecordedStep[];

  // Streaming state
  isStreaming: boolean;
  streamIntervalId: number | null;

  // Actions
  initialize: () => Promise<void>;
  launchBrowser: (browserType: BrowserType, headless: boolean) => Promise<string>;
  closeBrowser: (sessionId: string) => Promise<void>;
  openTab: (url: string) => Promise<string>;
  closeTab: (tabId: string) => Promise<void>;
  navigateTab: (tabId: string, url: string) => Promise<void>;
  clickElement: (tabId: string, selector: string) => Promise<void>;
  typeText: (tabId: string, selector: string, text: string) => Promise<void>;
  screenshot: (tabId: string) => Promise<string>;
  getPageContent: (tabId: string) => Promise<string>;
  executeScript: (tabId: string, script: string) => Promise<any>;
  setActiveSession: (sessionId: string) => void;

  // Visualization actions
  addAction: (action: BrowserAction) => void;
  addScreenshot: (screenshot: Screenshot) => void;
  highlightElement: (tabId: string, selector: string) => Promise<void>;
  clearHighlight: () => void;
  getDOMSnapshot: (tabId: string) => Promise<DOMSnapshot>;
  getConsoleLogs: (tabId: string) => Promise<ConsoleLog[]>;
  getNetworkActivity: (tabId: string) => Promise<NetworkRequest[]>;

  // Screenshot streaming
  startStreaming: (tabId: string) => void;
  stopStreaming: () => void;

  // Recording
  startRecording: () => void;
  stopRecording: () => void;
  addRecordedStep: (step: RecordedStep) => void;
  clearRecording: () => void;
  generatePlaywrightCode: () => string;

  // Clear data
  clearActions: () => void;
  clearScreenshots: () => void;

  // Updated Nov 16, 2025: Added cleanup function for event listeners
  cleanup: () => void;
}

// Updated Nov 16, 2025: Store unlisten functions for cleanup
const unlistenFunctions: UnlistenFn[] = [];

export const useBrowserStore = create<BrowserState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  initialized: false,

  // Visualization state
  screenshots: [],
  actions: [],
  domSnapshots: [],
  consoleLogs: [],
  networkRequests: [],
  highlightedElement: null,

  // Recording state
  isRecording: false,
  recordedSteps: [],

  // Streaming state
  isStreaming: false,
  streamIntervalId: null,

  // Updated Nov 16, 2025: Added error handling to event listeners
  initialize: async () => {
    try {
      await invoke('browser_init');
      set({ initialized: true });

      // Listen for browser automation events with error handling
      const unlisten1 = await listen('browser:action', (event: any) => {
        try {
          const action = event.payload as BrowserAction;
          get().addAction(action);
        } catch (error) {
          console.error('[browserStore] Error handling browser:action event:', error);
        }
      });
      unlistenFunctions.push(unlisten1);

      const unlisten2 = await listen('browser:console', (event: any) => {
        try {
          const log = event.payload as ConsoleLog;
          set((state) => ({
            consoleLogs: [...state.consoleLogs, log],
          }));
        } catch (error) {
          console.error('[browserStore] Error handling browser:console event:', error);
        }
      });
      unlistenFunctions.push(unlisten2);

      const unlisten3 = await listen('browser:network', (event: any) => {
        try {
          const request = event.payload as NetworkRequest;
          set((state) => ({
            networkRequests: [...state.networkRequests, request],
          }));
        } catch (error) {
          console.error('[browserStore] Error handling browser:network event:', error);
        }
      });
      unlistenFunctions.push(unlisten3);
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      set({ initialized: false });
      throw error;
    }
  },

  launchBrowser: async (browserType: BrowserType, headless: boolean) => {
    try {
      const sessionId = await invoke<string>('browser_launch', {
        browserType,
        headless,
      });

      const newSession: BrowserSession = {
        id: sessionId,
        browserType,
        headless,
        tabs: [],
        active: true,
      };

      set((state) => ({
        sessions: [...state.sessions, newSession],
        activeSessionId: sessionId,
      }));

      return sessionId;
    } catch (error) {
      console.error('Failed to launch browser:', error);
      throw error;
    }
  },

  closeBrowser: async (sessionId: string) => {
    try {
      // Note: Use closeTab to close individual tabs instead
      // No backend command for closing entire browser session yet

      set((state) => {
        const newSessions = state.sessions.filter((s) => s.id !== sessionId);
        let newActiveId = state.activeSessionId;

        if (state.activeSessionId === sessionId) {
          const nextSession = newSessions[0];
          newActiveId = nextSession ? nextSession.id : null;
        }

        return {
          sessions: newSessions,
          activeSessionId: newActiveId,
        };
      });
    } catch (error) {
      console.error('Failed to close browser:', error);
      throw error;
    }
  },

  openTab: async (url: string) => {
    try {
      const tabId = await invoke<string>('browser_open_tab', { url });

      set((state) => {
        const activeId = state.activeSessionId;
        if (!activeId) {
          return state;
        }

        const newSessions = state.sessions.map((session) => {
          if (session.id === activeId) {
            return {
              ...session,
              tabs: [...session.tabs, { id: tabId, url, title: url, active: true }],
            };
          }
          return session;
        });

        return { sessions: newSessions };
      });

      return tabId;
    } catch (error) {
      console.error('Failed to open tab:', error);
      throw error;
    }
  },

  closeTab: async (tabId: string) => {
    try {
      await invoke('browser_close_tab', { tabId });

      set((state) => {
        const newSessions = state.sessions.map((session) => ({
          ...session,
          tabs: session.tabs.filter((t) => t.id !== tabId),
        }));

        return { sessions: newSessions };
      });
    } catch (error) {
      console.error('Failed to close tab:', error);
      throw error;
    }
  },

  navigateTab: async (tabId: string, url: string) => {
    try {
      await invoke('browser_navigate', { tabId, url });

      set((state) => {
        const newSessions = state.sessions.map((session) => ({
          ...session,
          tabs: session.tabs.map((tab) => (tab.id === tabId ? { ...tab, url, title: url } : tab)),
        }));

        return { sessions: newSessions };
      });
    } catch (error) {
      console.error('Failed to navigate:', error);
      throw error;
    }
  },

  clickElement: async (tabId: string, selector: string) => {
    try {
      await invoke('browser_click', { tabId, selector });
    } catch (error) {
      console.error('Failed to click element:', error);
      throw error;
    }
  },

  typeText: async (tabId: string, selector: string, text: string) => {
    try {
      await invoke('browser_type', { tabId, selector, text });
    } catch (error) {
      console.error('Failed to type text:', error);
      throw error;
    }
  },

  screenshot: async (tabId: string) => {
    try {
      const data = await invoke<string>('browser_screenshot', { tabId });
      return data;
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      throw error;
    }
  },

  getPageContent: async (tabId: string) => {
    try {
      const content = await invoke<string>('browser_get_content', { tabId });
      return content;
    } catch (error) {
      console.error('Failed to get page content:', error);
      throw error;
    }
  },

  executeScript: async (tabId: string, script: string) => {
    try {
      const result = await invoke('browser_evaluate', { tabId, script });
      return result;
    } catch (error) {
      console.error('Failed to execute script:', error);
      throw error;
    }
  },

  setActiveSession: (sessionId: string) => {
    set({ activeSessionId: sessionId });
  },

  // Visualization actions
  addAction: (action: BrowserAction) => {
    set((state) => ({
      actions: [...state.actions, action],
    }));

    // If recording, add to recorded steps
    if (get().isRecording && action.success) {
      const step: RecordedStep = {
        id: crypto.randomUUID(),
        type: action.type,
        selector: action.details.selector,
        value: action.details.text || action.details.url,
        timestamp: action.timestamp,
      };
      get().addRecordedStep(step);
    }
  },

  addScreenshot: (screenshot: Screenshot) => {
    set((state) => {
      const screenshots = [...state.screenshots, screenshot];
      // Keep only last 50 screenshots
      if (screenshots.length > 50) {
        screenshots.shift();
      }
      return { screenshots };
    });
  },

  highlightElement: async (tabId: string, selector: string) => {
    try {
      const bounds = await invoke<ElementBounds>('browser_highlight_element', {
        tabId,
        selector,
      });
      set({ highlightedElement: bounds });
    } catch (error) {
      console.error('Failed to highlight element:', error);
      throw error;
    }
  },

  clearHighlight: () => {
    set({ highlightedElement: null });
  },

  getDOMSnapshot: async (tabId: string) => {
    try {
      const snapshot = await invoke<DOMSnapshot>('browser_get_dom_snapshot', { tabId });
      set((state) => ({
        domSnapshots: [...state.domSnapshots, snapshot],
      }));
      return snapshot;
    } catch (error) {
      console.error('Failed to get DOM snapshot:', error);
      throw error;
    }
  },

  getConsoleLogs: async (tabId: string) => {
    try {
      const logs = await invoke<ConsoleLog[]>('browser_get_console_logs', { tabId });
      set({ consoleLogs: logs });
      return logs;
    } catch (error) {
      console.error('Failed to get console logs:', error);
      throw error;
    }
  },

  getNetworkActivity: async (tabId: string) => {
    try {
      const requests = await invoke<NetworkRequest[]>('browser_get_network_activity', { tabId });
      set({ networkRequests: requests });
      return requests;
    } catch (error) {
      console.error('Failed to get network activity:', error);
      throw error;
    }
  },

  // Screenshot streaming
  startStreaming: (tabId: string) => {
    if (get().isStreaming) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const data = await invoke<string>('browser_get_screenshot_stream', { tabId });
        const screenshot: Screenshot = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          data,
          tabId,
        };
        get().addScreenshot(screenshot);
      } catch (error) {
        console.error('Failed to get screenshot stream:', error);
      }
    }, 500);

    set({ isStreaming: true, streamIntervalId: intervalId });
  },

  stopStreaming: () => {
    const { streamIntervalId } = get();
    if (streamIntervalId !== null) {
      window.clearInterval(streamIntervalId);
      set({ isStreaming: false, streamIntervalId: null });
    }
  },

  // Recording
  startRecording: () => {
    set({ isRecording: true, recordedSteps: [] });
  },

  stopRecording: () => {
    set({ isRecording: false });
  },

  addRecordedStep: (step: RecordedStep) => {
    set((state) => ({
      recordedSteps: [...state.recordedSteps, step],
    }));
  },

  clearRecording: () => {
    set({ recordedSteps: [] });
  },

  generatePlaywrightCode: () => {
    const { recordedSteps } = get();
    let code = `import { test, expect } from '@playwright/test';

test('recorded automation', async ({ page }) => {
`;

    recordedSteps.forEach((step) => {
      switch (step.type) {
        case 'navigate':
          code += `  await page.goto('${step.value}');\n`;
          break;
        case 'click':
          code += `  await page.click('${step.selector}');\n`;
          break;
        case 'type':
          code += `  await page.fill('${step.selector}', '${step.value}');\n`;
          break;
        case 'wait':
          code += `  await page.waitForSelector('${step.selector}');\n`;
          break;
        case 'screenshot':
          code += `  await page.screenshot({ path: 'screenshot.png' });\n`;
          break;
        case 'execute':
          code += `  await page.evaluate(() => { ${step.value} });\n`;
          break;
      }
    });

    code += `});\n`;
    return code;
  },

  // Clear data
  clearActions: () => {
    set({ actions: [] });
  },

  clearScreenshots: () => {
    set({ screenshots: [] });
  },

  // Updated Nov 16, 2025: Cleanup function for event listeners and intervals
  cleanup: () => {
    // Stop streaming if active
    const { streamIntervalId } = get();
    if (streamIntervalId !== null) {
      window.clearInterval(streamIntervalId);
      set({ isStreaming: false, streamIntervalId: null });
    }

    // Cleanup all event listeners
    unlistenFunctions.forEach((unlisten) => {
      try {
        unlisten();
      } catch (error) {
        console.error('[browserStore] Error cleaning up listener:', error);
      }
    });
    unlistenFunctions.length = 0;

    set({ initialized: false });
  },
}));

// Updated Nov 16, 2025: Export cleanup function for external use
export function cleanupBrowserStore() {
  useBrowserStore.getState().cleanup();
}
