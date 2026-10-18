import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { toast } from 'sonner';
import type { UnlistenFn } from '../lib/tauri-mock';
import {
  browserInit,
  browserLaunch,
  browserClose,
  browserOpenTab,
  browserNavigate,
  browserGoBack,
  browserGoForward,
  browserReload,
  browserGetUrl,
  browserGetTitle,
  browserGetScreenshotStream,
  browserCheckStatus,
  type BrowserStatusResult,
} from '../api/browser';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

export interface BrowserSession {
  id: string;
  browserType: 'Chromium';
  headless: boolean;
  tabs: BrowserTab[];
  active: boolean;
}

export type BrowserType = BrowserSession['browserType'];

export type ActionType =
  'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'scroll' | 'wait' | 'execute';

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

export interface RecordedStep {
  id: string;
  type: ActionType;
  selector?: string;
  value?: string;
  timestamp: number;
}

export type { BrowserStatusResult };

interface BrowserState {
  sessions: BrowserSession[];
  activeSessionId: string | null;
  initialized: boolean;

  screenshots: Screenshot[];
  actions: BrowserAction[];
  domSnapshots: DOMSnapshot[];
  highlightedElement: ElementBounds | null;

  isRecording: boolean;
  recordedSteps: RecordedStep[];

  isStreaming: boolean;
  streamIntervalId: number | null;

  initialize: () => Promise<void>;
  checkStatus: () => Promise<BrowserStatusResult>;
  launchBrowser: (browserType: BrowserType, headless: boolean) => Promise<string>;
  closeBrowser: (sessionId: string) => Promise<void>;

  openTab: (url: string) => Promise<string>;
  setActiveSession: (sessionId: string) => void;

  navigateTab: (tabId: string, url: string) => Promise<void>;
  goBack: (tabId?: string) => Promise<void>;
  goForward: (tabId?: string) => Promise<void>;
  reloadTab: (tabId?: string) => Promise<void>;
  getUrl: (tabId?: string) => Promise<string>;
  getTitle: (tabId?: string) => Promise<string>;

  clearHighlight: () => void;

  startStreaming: (tabId: string) => void;
  stopStreaming: () => void;

  startRecording: () => void;
  stopRecording: () => void;
  addRecordedStep: (step: RecordedStep) => void;
  clearRecording: () => void;
  generatePlaywrightCode: () => string;

  addAction: (action: BrowserAction) => void;
  addScreenshot: (screenshot: Screenshot) => void;
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
        highlightedElement: null,

        isRecording: false,
        recordedSteps: [],

        isStreaming: false,
        streamIntervalId: null,

        initialize: async () => {
          try {
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

            await browserInit();
            set({ initialized: true }, undefined, 'browser/initialize');
          } catch (error) {
            console.error('Failed to initialize browser:', error);
            toast.error('Failed to initialize browser');
            set({ initialized: false }, undefined, 'browser/initialize/error');
            throw error;
          }
        },

        checkStatus: async () => {
          try {
            return await browserCheckStatus();
          } catch (error) {
            console.error('Failed to check browser status:', error);
            throw error;
          }
        },

        launchBrowser: async (browserType: BrowserType, headless: boolean) => {
          try {
            const sessionId = await browserLaunch({ browserType, headless });

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
            toast.error('Failed to launch browser');
            throw error;
          }
        },

        closeBrowser: async (sessionId: string) => {
          try {
            await browserClose(sessionId);
          } catch (error) {
            console.error('[browserStore] Failed to close browser process on backend:', error);
            // Continue so UI state is still cleaned up even if backend call fails
          }

          try {
            set(
              (state) => {
                const session = state.sessions.find((s) => s.id === sessionId);
                const removedTabIds = new Set(session?.tabs.map((tab) => tab.id) ?? []);
                const sessionIndex = state.sessions.findIndex((s) => s.id === sessionId);
                if (sessionIndex >= 0) {
                  state.sessions.splice(sessionIndex, 1);
                }

                state.screenshots = state.screenshots.filter(
                  (shot) => !removedTabIds.has(shot.tabId),
                );

                const nextActiveSessionId =
                  state.activeSessionId === sessionId
                    ? (state.sessions[0]?.id ?? null)
                    : state.activeSessionId;
                state.activeSessionId = nextActiveSessionId;

                for (const activeSession of state.sessions) {
                  activeSession.active = activeSession.id === nextActiveSessionId;
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
            const tabId = await browserOpenTab(url);

            set(
              (state) => {
                const session = state.sessions.find((s) => s.id === state.activeSessionId);
                if (session) {
                  for (const tab of session.tabs) {
                    tab.active = false;
                  }
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

        setActiveSession: (sessionId: string) => {
          set(
            (state) => {
              state.activeSessionId = sessionId;
              for (const session of state.sessions) {
                session.active = session.id === sessionId;
              }
            },
            undefined,
            'browser/setActiveSession',
          );
        },

        navigateTab: async (tabId: string, url: string) => {
          try {
            await browserNavigate(url, tabId);

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

        goBack: async (tabId?: string) => {
          try {
            await browserGoBack(tabId);
          } catch (error) {
            console.error('Failed to go back:', error);
            throw error;
          }
        },

        goForward: async (tabId?: string) => {
          try {
            await browserGoForward(tabId);
          } catch (error) {
            console.error('Failed to go forward:', error);
            throw error;
          }
        },

        reloadTab: async (tabId?: string) => {
          try {
            await browserReload(tabId);
          } catch (error) {
            console.error('Failed to reload:', error);
            throw error;
          }
        },

        getUrl: async (tabId?: string) => {
          try {
            return await browserGetUrl(tabId);
          } catch (error) {
            console.error('Failed to get URL:', error);
            throw error;
          }
        },

        getTitle: async (tabId?: string) => {
          try {
            return await browserGetTitle(tabId);
          } catch (error) {
            console.error('Failed to get title:', error);
            throw error;
          }
        },

        clearHighlight: () => {
          set({ highlightedElement: null }, undefined, 'browser/clearHighlight');
        },

        startStreaming: (tabId: string) => {
          if (get().isStreaming) {
            return;
          }

          const intervalId = window.setInterval(async () => {
            try {
              const data = await browserGetScreenshotStream(tabId);
              const screenshotItem: Screenshot = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                data,
                tabId,
              };
              get().addScreenshot(screenshotItem);
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
                code += `  await page.goto(${JSON.stringify(step.value)});\n`;
                break;
              case 'click':
                code += `  await page.click(${JSON.stringify(step.selector)});\n`;
                break;
              case 'type':
                code += `  await page.fill(${JSON.stringify(step.selector)}, ${JSON.stringify(step.value)});\n`;
                break;
              case 'wait':
                code += `  await page.waitForSelector(${JSON.stringify(step.selector)});\n`;
                break;
              case 'screenshot':
                code += `  await page.screenshot({ path: 'screenshot.png' });\n`;
                break;
              case 'execute':
                code += `  // User script omitted for safety\n`;
                break;
            }
          });

          code += `});\n`;
          return code;
        },

        addAction: (action: BrowserAction) => {
          set(
            (state) => {
              state.actions.push(action);
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

        addScreenshot: (screenshotItem: Screenshot) => {
          set(
            (state) => {
              state.screenshots.push(screenshotItem);
              if (state.screenshots.length > 50) {
                state.screenshots.shift();
              }
            },
            undefined,
            'browser/addScreenshot',
          );
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

          unlistenFunctions.forEach((unlisten) => {
            try {
              unlisten();
            } catch (error) {
              console.error('[browserStore] Error cleaning up listener:', error);
            }
          });
          unlistenFunctions.length = 0;

          set(
            {
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

export const selectBrowserSessions = (state: BrowserState) => state.sessions;
export const selectActiveSessionId = (state: BrowserState) => state.activeSessionId;
export const selectBrowserInitialized = (state: BrowserState) => state.initialized;

export const selectScreenshots = (state: BrowserState) => state.screenshots;
export const selectBrowserActions = (state: BrowserState) => state.actions;
export const selectDomSnapshots = (state: BrowserState) => state.domSnapshots;
export const selectHighlightedElement = (state: BrowserState) => state.highlightedElement;

export const selectBrowserIsRecording = (state: BrowserState) => state.isRecording;
export const selectRecordedSteps = (state: BrowserState) => state.recordedSteps;

export const selectIsStreaming = (state: BrowserState) => state.isStreaming;
export const selectStreamIntervalId = (state: BrowserState) => state.streamIntervalId;

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
