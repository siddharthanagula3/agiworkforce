import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

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
    result?: unknown;
    error?: string;
  };
  screenshotId?: string;
}

export interface Screenshot {
  id: string;
  timestamp: number;
  data: string;
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
  sessions: BrowserSession[];
  activeSessionId: string | null;
  initialized: boolean;

  screenshots: Screenshot[];
  actions: BrowserAction[];
  domSnapshots: DOMSnapshot[];
  consoleLogs: ConsoleLog[];
  networkRequests: NetworkRequest[];
  highlightedElement: ElementBounds | null;

  isRecording: boolean;
  recordedSteps: RecordedStep[];

  isStreaming: boolean;
  streamIntervalId: number | null;

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
  executeScript: (tabId: string, script: string) => Promise<unknown>;
  setActiveSession: (sessionId: string) => void;

  addAction: (action: BrowserAction) => void;
  addScreenshot: (screenshot: Screenshot) => void;
  highlightElement: (tabId: string, selector: string) => Promise<void>;
  clearHighlight: () => void;
  getDOMSnapshot: (tabId: string) => Promise<DOMSnapshot>;
  getConsoleLogs: (tabId: string) => Promise<ConsoleLog[]>;
  getNetworkActivity: (tabId: string) => Promise<NetworkRequest[]>;

  startStreaming: (tabId: string) => void;
  stopStreaming: () => void;

  startRecording: () => void;
  stopRecording: () => void;
  addRecordedStep: (step: RecordedStep) => void;
  clearRecording: () => void;
  generatePlaywrightCode: () => string;

  clearActions: () => void;
  clearScreenshots: () => void;

  cleanup: () => void;
}

const unlistenFunctions: UnlistenFn[] = [];

export const useBrowserStore = create<BrowserState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
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

        initialize: async () => {
          try {
            // STR-005 fix: Clean up any existing listeners before re-initializing
            // This prevents duplicate listeners if initialize() is called multiple times
            if (unlistenFunctions.length > 0) {
              unlistenFunctions.forEach((unlisten) => {
                try {
                  unlisten();
                } catch (error) {
                  console.error('[browserStore] Error cleaning up existing listener:', error);
                }
              });
              unlistenFunctions.length = 0;
            }

            await invoke('browser_init');
            set({ initialized: true }, undefined, 'browser/initialize');

            const unlisten1 = await listen<BrowserAction>('browser:action', (event) => {
              try {
                const action = event?.payload;
                if (action) {
                  get().addAction(action);
                }
              } catch (error) {
                console.error('[browserStore] Error handling browser:action event:', error);
              }
            });
            unlistenFunctions.push(unlisten1);

            const unlisten2 = await listen<ConsoleLog>('browser:console', (event) => {
              try {
                const log = event?.payload;
                if (log) {
                  set(
                    (state) => {
                      state.consoleLogs.push(log);
                      // STR-003 fix: Cap consoleLogs at 5000 entries (matching terminalLogs pattern)
                      if (state.consoleLogs.length > 5000) {
                        state.consoleLogs = state.consoleLogs.slice(-5000);
                      }
                    },
                    undefined,
                    'browser/consoleLog',
                  );
                }
              } catch (error) {
                console.error('[browserStore] Error handling browser:console event:', error);
              }
            });
            unlistenFunctions.push(unlisten2);

            const unlisten3 = await listen<NetworkRequest>('browser:network', (event) => {
              try {
                const request = event?.payload;
                if (request) {
                  set(
                    (state) => {
                      state.networkRequests.push(request);
                      // STR-003 fix: Cap networkRequests at 5000 entries
                      if (state.networkRequests.length > 5000) {
                        state.networkRequests = state.networkRequests.slice(-5000);
                      }
                    },
                    undefined,
                    'browser/networkRequest',
                  );
                }
              } catch (error) {
                console.error('[browserStore] Error handling browser:network event:', error);
              }
            });
            unlistenFunctions.push(unlisten3);
          } catch (error) {
            console.error('Failed to initialize browser:', error);
            set({ initialized: false }, undefined, 'browser/initialize/error');
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

            set(
              (state) => {
                state.sessions.push(newSession);
                state.activeSessionId = sessionId;
              },
              undefined,
              'browser/launchBrowser',
            );

            return sessionId;
          } catch (error) {
            console.error('Failed to launch browser:', error);
            throw error;
          }
        },

        closeBrowser: async (sessionId: string) => {
          // BUG-001 fix: invoke backend to terminate the browser process before removing from state
          try {
            await invoke('browser_close', { browserId: sessionId });
          } catch (error) {
            console.error('[browserStore] Failed to close browser process on backend:', error);
            // Continue so UI state is still cleaned up even if backend call fails
          }

          try {
            set(
              (state) => {
                const sessionIndex = state.sessions.findIndex((s) => s.id === sessionId);
                if (sessionIndex >= 0) {
                  state.sessions.splice(sessionIndex, 1);
                }

                if (state.activeSessionId === sessionId) {
                  state.activeSessionId = state.sessions[0]?.id ?? null;
                }
              },
              undefined,
              'browser/closeBrowser',
            );
          } catch (error) {
            console.error('Failed to close browser:', error);
            throw error;
          }
        },

        openTab: async (url: string) => {
          try {
            const tabId = await invoke<string>('browser_open_tab', { url });

            set(
              (state) => {
                const session = state.sessions.find((s) => s.id === state.activeSessionId);
                if (session) {
                  session.tabs.push({ id: tabId, url, title: url, active: true });
                }
              },
              undefined,
              'browser/openTab',
            );

            return tabId;
          } catch (error) {
            console.error('Failed to open tab:', error);
            throw error;
          }
        },

        closeTab: async (tabId: string) => {
          try {
            await invoke('browser_close_tab', { tabId });

            set(
              (state) => {
                for (const session of state.sessions) {
                  const tabIndex = session.tabs.findIndex((t) => t.id === tabId);
                  if (tabIndex >= 0) {
                    session.tabs.splice(tabIndex, 1);
                    break;
                  }
                }
                // WRK-004 fix: Clear screenshots for this tab to prevent memory leak
                state.screenshots = state.screenshots.filter((s) => s.tabId !== tabId);
              },
              undefined,
              'browser/closeTab',
            );
          } catch (error) {
            console.error('Failed to close tab:', error);
            throw error;
          }
        },

        navigateTab: async (tabId: string, url: string) => {
          try {
            await invoke('browser_navigate', { tabId, url });

            set(
              (state) => {
                for (const session of state.sessions) {
                  const tab = session.tabs.find((t) => t.id === tabId);
                  if (tab) {
                    tab.url = url;
                    tab.title = url;
                    break;
                  }
                }
              },
              undefined,
              'browser/navigateTab',
            );
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
          set({ activeSessionId: sessionId }, undefined, 'browser/setActiveSession');
        },

        addAction: (action: BrowserAction) => {
          set(
            (state) => {
              state.actions.push(action);
              // STR-003 fix: Cap actions array at 1000 entries
              if (state.actions.length > 1000) {
                state.actions = state.actions.slice(-1000);
              }
            },
            undefined,
            'browser/addAction',
          );

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
          set(
            (state) => {
              state.screenshots.push(screenshot);
              // Keep max 50 screenshots
              if (state.screenshots.length > 50) {
                state.screenshots.shift();
              }
            },
            undefined,
            'browser/addScreenshot',
          );
        },

        highlightElement: async (tabId: string, selector: string) => {
          try {
            const bounds = await invoke<ElementBounds>('browser_highlight_element', {
              tabId,
              selector,
            });
            set({ highlightedElement: bounds }, undefined, 'browser/highlightElement');
          } catch (error) {
            console.error('Failed to highlight element:', error);
            throw error;
          }
        },

        clearHighlight: () => {
          set({ highlightedElement: null }, undefined, 'browser/clearHighlight');
        },

        getDOMSnapshot: async (tabId: string) => {
          try {
            const snapshot = await invoke<DOMSnapshot>('browser_get_dom_snapshot', { tabId });
            set(
              (state) => {
                state.domSnapshots.push(snapshot);
                // AUDIT-006-002 fix: Cap domSnapshots at 50 entries
                if (state.domSnapshots.length > 50) {
                  state.domSnapshots = state.domSnapshots.slice(-50);
                }
              },
              undefined,
              'browser/getDOMSnapshot',
            );
            return snapshot;
          } catch (error) {
            console.error('Failed to get DOM snapshot:', error);
            throw error;
          }
        },

        getConsoleLogs: async (tabId: string) => {
          try {
            const logs = await invoke<ConsoleLog[]>('browser_get_console_logs', { tabId });
            set({ consoleLogs: logs }, undefined, 'browser/getConsoleLogs');
            return logs;
          } catch (error) {
            console.error('Failed to get console logs:', error);
            throw error;
          }
        },

        getNetworkActivity: async (tabId: string) => {
          try {
            const requests = await invoke<NetworkRequest[]>('browser_get_network_activity', {
              tabId,
            });
            set({ networkRequests: requests }, undefined, 'browser/getNetworkActivity');
            return requests;
          } catch (error) {
            console.error('Failed to get network activity:', error);
            throw error;
          }
        },

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

          set(
            { isStreaming: true, streamIntervalId: intervalId },
            undefined,
            'browser/startStreaming',
          );
        },

        stopStreaming: () => {
          const { streamIntervalId } = get();
          if (streamIntervalId !== null) {
            window.clearInterval(streamIntervalId);
            set({ isStreaming: false, streamIntervalId: null }, undefined, 'browser/stopStreaming');
          }
        },

        startRecording: () => {
          set({ isRecording: true, recordedSteps: [] }, undefined, 'browser/startRecording');
        },

        stopRecording: () => {
          set({ isRecording: false }, undefined, 'browser/stopRecording');
        },

        addRecordedStep: (step: RecordedStep) => {
          set(
            (state) => {
              state.recordedSteps.push(step);
              // AUDIT-006-003 fix: Cap recordedSteps at 1000 entries
              if (state.recordedSteps.length > 1000) {
                state.recordedSteps = state.recordedSteps.slice(-1000);
              }
            },
            undefined,
            'browser/addRecordedStep',
          );
        },

        clearRecording: () => {
          set({ recordedSteps: [] }, undefined, 'browser/clearRecording');
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

        clearActions: () => {
          set({ actions: [] }, undefined, 'browser/clearActions');
        },

        clearScreenshots: () => {
          set({ screenshots: [] }, undefined, 'browser/clearScreenshots');
        },

        cleanup: () => {
          const { streamIntervalId } = get();
          if (streamIntervalId !== null) {
            window.clearInterval(streamIntervalId);
          }

          // STR-005 fix: Clean up all event listeners
          unlistenFunctions.forEach((unlisten) => {
            try {
              unlisten();
            } catch (error) {
              console.error('[browserStore] Error cleaning up listener:', error);
            }
          });
          unlistenFunctions.length = 0;

          // STR-005 fix: Reset all state to prevent data leaking across sessions
          set(
            {
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
            },
            undefined,
            'browser/cleanup',
          );
        },
      })),
    ),
    { name: 'BrowserStore', enabled: import.meta.env.DEV },
  ),
);

export function cleanupBrowserStore() {
  useBrowserStore.getState().cleanup();
}

// Selectors
export const selectBrowserSessions = (state: BrowserState) => state.sessions;
export const selectActiveSessionId = (state: BrowserState) => state.activeSessionId;
export const selectBrowserInitialized = (state: BrowserState) => state.initialized;

export const selectScreenshots = (state: BrowserState) => state.screenshots;
export const selectBrowserActions = (state: BrowserState) => state.actions;
export const selectDomSnapshots = (state: BrowserState) => state.domSnapshots;
export const selectConsoleLogs = (state: BrowserState) => state.consoleLogs;
export const selectNetworkRequests = (state: BrowserState) => state.networkRequests;
export const selectHighlightedElement = (state: BrowserState) => state.highlightedElement;

export const selectBrowserIsRecording = (state: BrowserState) => state.isRecording;
export const selectRecordedSteps = (state: BrowserState) => state.recordedSteps;

export const selectIsStreaming = (state: BrowserState) => state.isStreaming;
export const selectStreamIntervalId = (state: BrowserState) => state.streamIntervalId;

// Derived selectors
export const selectActiveSession = (state: BrowserState) =>
  state.sessions.find((s) => s.id === state.activeSessionId);
export const selectSessionById = (sessionId: string) => (state: BrowserState) =>
  state.sessions.find((s) => s.id === sessionId);
export const selectActiveTabs = (state: BrowserState) => {
  const session = state.sessions.find((s) => s.id === state.activeSessionId);
  return session?.tabs ?? [];
};
export const selectActiveTab = (state: BrowserState) => {
  const session = state.sessions.find((s) => s.id === state.activeSessionId);
  return session?.tabs.find((t) => t.active);
};
export const selectSessionCount = (state: BrowserState) => state.sessions.length;
export const selectHasActiveSessions = (state: BrowserState) => state.sessions.length > 0;
export const selectLatestScreenshot = (state: BrowserState) =>
  state.screenshots[state.screenshots.length - 1];
export const selectScreenshotCount = (state: BrowserState) => state.screenshots.length;
export const selectActionCount = (state: BrowserState) => state.actions.length;
export const selectRecordedStepCount = (state: BrowserState) => state.recordedSteps.length;
export const selectErrorLogs = (state: BrowserState) =>
  state.consoleLogs.filter((log) => log.level === 'error');
export const selectFailedRequests = (state: BrowserState) =>
  state.networkRequests.filter((req) => req.status >= 400);
