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
  browserCloseTab,
  browserSwitchTab,
  browserListTabs,
  browserNavigate,
  browserGoBack,
  browserGoForward,
  browserReload,
  browserGetUrl,
  browserGetTitle,
  browserClick,
  browserType,
  browserGetText,
  browserGetAttribute,
  browserWaitForSelector,
  browserSelectOption,
  browserCheck as browserCheckElement,
  browserUncheck,
  browserScreenshot,
  browserEvaluate,
  browserHover,
  browserFocus,
  browserQueryAll,
  browserScrollIntoView,
  browserGetContent,
  browserGetDomSnapshot,
  browserExecuteAsyncJs,
  browserGetElementState,
  browserWaitForInteractive,
  browserFillForm,
  browserDragAndDrop,
  browserUploadFile,
  browserGetCookies,
  browserSetCookie,
  browserClearCookies,
  browserGetPerformanceMetrics,
  browserWaitForNavigation,
  browserGetFrames,
  browserExecuteInFrame,
  browserCallFunction,
  browserGetScreenshotStream,
  browserHighlightElement,
  browserCheckStatus,
  findElementSemantic,
  findAllElementsSemantic,
  clickSemantic,
  typeSemantic,
  getAccessibilityTree,
  getDomSemanticGraph,
  getInteractiveElements,
  findByRole,
  type BrowserCookie,
  type BrowserStatusResult,
  type ElementStateResult,
  type PerformanceMetrics,
  type FrameContext,
  type TabInfo as ApiTabInfo,
  type ElementBoundsResult,
} from '../api/browser';

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

export interface RecordedStep {
  id: string;
  type: ActionType;
  selector?: string;
  value?: string;
  timestamp: number;
}

// Re-export API types for consumers
export type {
  BrowserCookie,
  BrowserStatusResult,
  ElementStateResult,
  PerformanceMetrics,
  FrameContext,
  ApiTabInfo,
  ElementBoundsResult,
};

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

  // --- Lifecycle ---
  initialize: () => Promise<void>;
  checkStatus: () => Promise<BrowserStatusResult>;
  launchBrowser: (browserType: BrowserType, headless: boolean) => Promise<string>;
  closeBrowser: (sessionId: string) => Promise<void>;

  // --- Tab management ---
  openTab: (url: string) => Promise<string>;
  closeTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => Promise<void>;
  listTabs: () => Promise<ApiTabInfo[]>;
  setActiveSession: (sessionId: string) => void;

  // --- Navigation ---
  navigateTab: (tabId: string, url: string) => Promise<void>;
  goBack: (tabId?: string) => Promise<void>;
  goForward: (tabId?: string) => Promise<void>;
  reloadTab: (tabId?: string) => Promise<void>;
  getUrl: (tabId?: string) => Promise<string>;
  getTitle: (tabId?: string) => Promise<string>;
  waitForNavigation: (timeoutMs?: number, tabId?: string) => Promise<void>;

  // --- DOM interaction ---
  clickElement: (tabId: string, selector: string) => Promise<void>;
  typeText: (tabId: string, selector: string, text: string) => Promise<void>;
  getText: (selector: string, tabId?: string) => Promise<string>;
  getAttribute: (selector: string, attribute: string, tabId?: string) => Promise<string | null>;
  waitForSelector: (selector: string, timeout?: number, tabId?: string) => Promise<void>;
  selectOption: (selector: string, value: string, tabId?: string) => Promise<void>;
  checkElement: (selector: string, tabId?: string) => Promise<void>;
  uncheckElement: (selector: string, tabId?: string) => Promise<void>;
  hoverElement: (selector: string, tabId?: string) => Promise<void>;
  focusElement: (selector: string, tabId?: string) => Promise<void>;
  queryAll: (selector: string, tabId?: string) => Promise<string[]>;
  scrollIntoView: (selector: string, tabId?: string) => Promise<void>;
  getElementState: (selector: string, tabId?: string) => Promise<ElementStateResult>;
  waitForInteractive: (selector: string, timeoutMs?: number, tabId?: string) => Promise<void>;

  // --- Forms ---
  fillForm: (
    selector: string,
    data: Record<string, string | number | boolean>,
    tabId?: string,
  ) => Promise<void>;
  dragAndDrop: (source: string, target: string, tabId?: string) => Promise<void>;
  uploadFile: (selector: string, paths: string[], tabId?: string) => Promise<void>;

  // --- Screenshots & content ---
  screenshot: (tabId: string) => Promise<string>;
  getPageContent: (tabId: string) => Promise<string>;
  getDOMSnapshot: (tabId: string) => Promise<DOMSnapshot>;
  highlightElement: (tabId: string, selector: string) => Promise<void>;
  clearHighlight: () => void;

  // --- JavaScript execution ---
  executeScript: (tabId: string, script: string) => Promise<unknown>;
  executeAsyncScript: (script: string, tabId?: string) => Promise<unknown>;
  callFunction: (functionName: string, args: unknown, tabId?: string) => Promise<unknown>;
  executeInFrame: (frameId: string, script: string, tabId?: string) => Promise<unknown>;

  // --- Cookies ---
  getCookies: (tabId?: string) => Promise<BrowserCookie[]>;
  setCookie: (cookie: BrowserCookie, tabId?: string) => Promise<void>;
  clearCookies: (tabId?: string) => Promise<void>;

  // --- Frames & performance ---
  getPerformanceMetrics: (tabId?: string) => Promise<PerformanceMetrics>;
  getFrames: (tabId?: string) => Promise<FrameContext[]>;

  // --- Semantic selectors ---
  findSemantic: (query: string, tabId?: string) => Promise<string>;
  findAllSemantic: (query: string, tabId?: string) => Promise<string[]>;
  clickSemantic: (query: string, tabId?: string) => Promise<void>;
  typeSemantic: (query: string, text: string, tabId?: string) => Promise<void>;

  // --- Accessibility ---
  getAccessibilityTree: (tabId?: string) => Promise<unknown>;
  getDomSemanticGraph: (tabId?: string) => Promise<unknown>;
  getInteractiveElements: (tabId?: string) => Promise<string[]>;
  findByRole: (role: string, name?: string, tabId?: string) => Promise<string>;

  // --- Streaming ---
  startStreaming: (tabId: string) => void;
  stopStreaming: () => void;

  // --- Recording ---
  startRecording: () => void;
  stopRecording: () => void;
  addRecordedStep: (step: RecordedStep) => void;
  clearRecording: () => void;
  generatePlaywrightCode: () => string;

  // --- Actions & screenshots state ---
  addAction: (action: BrowserAction) => void;
  addScreenshot: (screenshot: Screenshot) => void;
  clearActions: () => void;
  clearScreenshots: () => void;

  // --- Cleanup ---
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

        // =====================================================================
        // Lifecycle
        // =====================================================================

        initialize: async () => {
          try {
            // STR-005 fix: Clean up any existing listeners before re-initializing
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

        // =====================================================================
        // Tab management
        // =====================================================================

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

        closeTab: async (tabId: string) => {
          try {
            await browserCloseTab(tabId);

            set(
              (state) => {
                for (const session of state.sessions) {
                  const tabIndex = session.tabs.findIndex((t) => t.id === tabId);
                  if (tabIndex >= 0) {
                    const wasActive = session.tabs[tabIndex]?.active === true;
                    session.tabs.splice(tabIndex, 1);
                    if (wasActive && session.tabs.length > 0) {
                      session.tabs[0]!.active = true;
                    }
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

        switchTab: async (tabId: string) => {
          try {
            await browserSwitchTab(tabId);
            set(
              (state) => {
                for (const session of state.sessions) {
                  if (!session.tabs.some((t) => t.id === tabId)) continue;
                  for (const tab of session.tabs) {
                    tab.active = tab.id === tabId;
                  }
                  break;
                }
              },
              undefined,
              'browser/switchTab',
            );
          } catch (error) {
            console.error('Failed to switch tab:', error);
            throw error;
          }
        },

        listTabs: async () => {
          try {
            return await browserListTabs();
          } catch (error) {
            console.error('Failed to list tabs:', error);
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

        // =====================================================================
        // Navigation
        // =====================================================================

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

        waitForNavigation: async (timeoutMs?: number, tabId?: string) => {
          try {
            await browserWaitForNavigation(timeoutMs, tabId);
          } catch (error) {
            console.error('Failed to wait for navigation:', error);
            throw error;
          }
        },

        // =====================================================================
        // DOM interaction
        // =====================================================================

        clickElement: async (tabId: string, selector: string) => {
          try {
            await browserClick(selector, tabId);
          } catch (error) {
            console.error('Failed to click element:', error);
            throw error;
          }
        },

        typeText: async (tabId: string, selector: string, text: string) => {
          try {
            await browserType(selector, text, tabId);
          } catch (error) {
            console.error('Failed to type text:', error);
            throw error;
          }
        },

        getText: async (selector: string, tabId?: string) => {
          try {
            return await browserGetText(selector, tabId);
          } catch (error) {
            console.error('Failed to get text:', error);
            throw error;
          }
        },

        getAttribute: async (selector: string, attribute: string, tabId?: string) => {
          try {
            return await browserGetAttribute(selector, attribute, tabId);
          } catch (error) {
            console.error('Failed to get attribute:', error);
            throw error;
          }
        },

        waitForSelector: async (selector: string, timeout?: number, tabId?: string) => {
          try {
            await browserWaitForSelector(selector, timeout, tabId);
          } catch (error) {
            console.error('Failed to wait for selector:', error);
            throw error;
          }
        },

        selectOption: async (selector: string, value: string, tabId?: string) => {
          try {
            await browserSelectOption(selector, value, tabId);
          } catch (error) {
            console.error('Failed to select option:', error);
            throw error;
          }
        },

        checkElement: async (selector: string, tabId?: string) => {
          try {
            await browserCheckElement(selector, tabId);
          } catch (error) {
            console.error('Failed to check element:', error);
            throw error;
          }
        },

        uncheckElement: async (selector: string, tabId?: string) => {
          try {
            await browserUncheck(selector, tabId);
          } catch (error) {
            console.error('Failed to uncheck element:', error);
            throw error;
          }
        },

        hoverElement: async (selector: string, tabId?: string) => {
          try {
            await browserHover(selector, tabId);
          } catch (error) {
            console.error('Failed to hover element:', error);
            throw error;
          }
        },

        focusElement: async (selector: string, tabId?: string) => {
          try {
            await browserFocus(selector, tabId);
          } catch (error) {
            console.error('Failed to focus element:', error);
            throw error;
          }
        },

        queryAll: async (selector: string, tabId?: string) => {
          try {
            return await browserQueryAll(selector, tabId);
          } catch (error) {
            console.error('Failed to query all:', error);
            throw error;
          }
        },

        scrollIntoView: async (selector: string, tabId?: string) => {
          try {
            await browserScrollIntoView(selector, tabId);
          } catch (error) {
            console.error('Failed to scroll into view:', error);
            throw error;
          }
        },

        getElementState: async (selector: string, tabId?: string) => {
          try {
            return await browserGetElementState(selector, tabId);
          } catch (error) {
            console.error('Failed to get element state:', error);
            throw error;
          }
        },

        waitForInteractive: async (selector: string, timeoutMs?: number, tabId?: string) => {
          try {
            await browserWaitForInteractive(selector, timeoutMs, tabId);
          } catch (error) {
            console.error('Failed to wait for interactive:', error);
            throw error;
          }
        },

        // =====================================================================
        // Forms
        // =====================================================================

        fillForm: async (
          selector: string,
          data: Record<string, string | number | boolean>,
          tabId?: string,
        ) => {
          try {
            await browserFillForm(selector, data, tabId);
          } catch (error) {
            console.error('Failed to fill form:', error);
            throw error;
          }
        },

        dragAndDrop: async (source: string, target: string, tabId?: string) => {
          try {
            await browserDragAndDrop(source, target, tabId);
          } catch (error) {
            console.error('Failed to drag and drop:', error);
            throw error;
          }
        },

        uploadFile: async (selector: string, paths: string[], tabId?: string) => {
          try {
            await browserUploadFile(selector, paths, tabId);
          } catch (error) {
            console.error('Failed to upload file:', error);
            throw error;
          }
        },

        // =====================================================================
        // Screenshots & content
        // =====================================================================

        screenshot: async (tabId: string) => {
          try {
            const data = await browserScreenshot(undefined, tabId);
            return data;
          } catch (error) {
            console.error('Failed to take screenshot:', error);
            throw error;
          }
        },

        getPageContent: async (tabId: string) => {
          try {
            const content = await browserGetContent(tabId);
            return content;
          } catch (error) {
            console.error('Failed to get page content:', error);
            throw error;
          }
        },

        getDOMSnapshot: async (tabId: string) => {
          try {
            const html = await browserGetDomSnapshot(tabId);
            const snapshot: DOMSnapshot = { html, timestamp: Date.now() };
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

        highlightElement: async (tabId: string, selector: string) => {
          try {
            const result = await browserHighlightElement(selector, tabId);
            if (result.bounds) {
              set({ highlightedElement: result.bounds }, undefined, 'browser/highlightElement');
            }
          } catch (error) {
            console.error('Failed to highlight element:', error);
            throw error;
          }
        },

        clearHighlight: () => {
          set({ highlightedElement: null }, undefined, 'browser/clearHighlight');
        },

        // =====================================================================
        // JavaScript execution
        // =====================================================================

        executeScript: async (tabId: string, script: string) => {
          try {
            const result = await browserEvaluate(script, tabId);
            return result;
          } catch (error) {
            console.error('Failed to execute script:', error);
            throw error;
          }
        },

        executeAsyncScript: async (script: string, tabId?: string) => {
          try {
            return await browserExecuteAsyncJs(script, tabId);
          } catch (error) {
            console.error('Failed to execute async script:', error);
            throw error;
          }
        },

        callFunction: async (functionName: string, args: unknown, tabId?: string) => {
          try {
            return await browserCallFunction(functionName, args, tabId);
          } catch (error) {
            console.error('Failed to call function:', error);
            throw error;
          }
        },

        executeInFrame: async (frameId: string, script: string, tabId?: string) => {
          try {
            return await browserExecuteInFrame(frameId, script, tabId);
          } catch (error) {
            console.error('Failed to execute in frame:', error);
            throw error;
          }
        },

        // =====================================================================
        // Cookies
        // =====================================================================

        getCookies: async (tabId?: string) => {
          try {
            return await browserGetCookies(tabId);
          } catch (error) {
            console.error('Failed to get cookies:', error);
            throw error;
          }
        },

        setCookie: async (cookie: BrowserCookie, tabId?: string) => {
          try {
            await browserSetCookie(cookie, tabId);
          } catch (error) {
            console.error('Failed to set cookie:', error);
            throw error;
          }
        },

        clearCookies: async (tabId?: string) => {
          try {
            await browserClearCookies(tabId);
          } catch (error) {
            console.error('Failed to clear cookies:', error);
            throw error;
          }
        },

        // =====================================================================
        // Frames & performance
        // =====================================================================

        getPerformanceMetrics: async (tabId?: string) => {
          try {
            return await browserGetPerformanceMetrics(tabId);
          } catch (error) {
            console.error('Failed to get performance metrics:', error);
            throw error;
          }
        },

        getFrames: async (tabId?: string) => {
          try {
            return await browserGetFrames(tabId);
          } catch (error) {
            console.error('Failed to get frames:', error);
            throw error;
          }
        },

        // =====================================================================
        // Semantic selectors
        // =====================================================================

        findSemantic: async (query: string, tabId?: string) => {
          try {
            return await findElementSemantic(query, tabId);
          } catch (error) {
            console.error('Failed to find semantic element:', error);
            throw error;
          }
        },

        findAllSemantic: async (query: string, tabId?: string) => {
          try {
            return await findAllElementsSemantic(query, tabId);
          } catch (error) {
            console.error('Failed to find all semantic elements:', error);
            throw error;
          }
        },

        clickSemantic: async (query: string, tabId?: string) => {
          try {
            await clickSemantic(query, tabId);
          } catch (error) {
            console.error('Failed to click semantic element:', error);
            throw error;
          }
        },

        typeSemantic: async (query: string, text: string, tabId?: string) => {
          try {
            await typeSemantic(query, text, tabId);
          } catch (error) {
            console.error('Failed to type in semantic element:', error);
            throw error;
          }
        },

        // =====================================================================
        // Accessibility
        // =====================================================================

        getAccessibilityTree: async (tabId?: string) => {
          try {
            return await getAccessibilityTree(tabId);
          } catch (error) {
            console.error('Failed to get accessibility tree:', error);
            throw error;
          }
        },

        getDomSemanticGraph: async (tabId?: string) => {
          try {
            return await getDomSemanticGraph(tabId);
          } catch (error) {
            console.error('Failed to get DOM semantic graph:', error);
            throw error;
          }
        },

        getInteractiveElements: async (tabId?: string) => {
          try {
            return await getInteractiveElements(tabId);
          } catch (error) {
            console.error('Failed to get interactive elements:', error);
            throw error;
          }
        },

        findByRole: async (role: string, name?: string, tabId?: string) => {
          try {
            return await findByRole(role, name, tabId);
          } catch (error) {
            console.error('Failed to find by role:', error);
            throw error;
          }
        },

        // =====================================================================
        // Streaming
        // =====================================================================

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

        // =====================================================================
        // Recording
        // =====================================================================

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

        // =====================================================================
        // Actions & screenshots state
        // =====================================================================

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

        addScreenshot: (screenshotItem: Screenshot) => {
          set(
            (state) => {
              state.screenshots.push(screenshotItem);
              // Keep max 50 screenshots
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

        // =====================================================================
        // Cleanup
        // =====================================================================

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
