import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useBrowserStore, type RecordedStep, type ActionType } from '../stores/browserStore';

// Types for browser automation
export interface NavigateOptions {
  url: string;
  tabId?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface ClickOptions {
  selector: string;
  tabId?: string;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
}

export interface TypeOptions {
  selector: string;
  text: string;
  tabId?: string;
  delay?: number;
  clear?: boolean;
}

export interface ScreenshotOptions {
  tabId?: string;
  fullPage?: boolean;
  selector?: string;
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface ExtractOptions {
  tabId?: string;
  selector?: string;
  attribute?: string;
  multiple?: boolean;
}

export interface ExecuteScriptOptions {
  tabId?: string;
  script: string;
  args?: unknown[];
  timeout?: number;
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
  loading: boolean;
}

export interface AutomationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

export interface PlaybackOptions {
  delayBetweenSteps?: number;
  stopOnError?: boolean;
  onStepStart?: (step: RecordedStep, index: number) => void;
  onStepComplete?: (step: RecordedStep, index: number, result: AutomationResult) => void;
  onPlaybackComplete?: (results: AutomationResult[]) => void;
}

export interface BrowserAutomationHook {
  // State
  isExecuting: boolean;
  isPlayingBack: boolean;
  currentStep: number;
  totalSteps: number;
  lastError: string | null;

  // Navigation
  navigate: (options: NavigateOptions) => Promise<AutomationResult<void>>;
  goBack: (tabId?: string) => Promise<AutomationResult<void>>;
  goForward: (tabId?: string) => Promise<AutomationResult<void>>;
  reload: (tabId?: string) => Promise<AutomationResult<void>>;

  // Interaction
  click: (options: ClickOptions) => Promise<AutomationResult<void>>;
  type: (options: TypeOptions) => Promise<AutomationResult<void>>;
  hover: (selector: string, tabId?: string) => Promise<AutomationResult<void>>;
  focus: (selector: string, tabId?: string) => Promise<AutomationResult<void>>;
  scroll: (selector: string, tabId?: string) => Promise<AutomationResult<void>>;
  selectOption: (
    selector: string,
    value: string,
    tabId?: string,
  ) => Promise<AutomationResult<void>>;
  check: (selector: string, tabId?: string) => Promise<AutomationResult<void>>;
  uncheck: (selector: string, tabId?: string) => Promise<AutomationResult<void>>;

  // Content
  screenshot: (options?: ScreenshotOptions) => Promise<AutomationResult<string>>;
  extract: (options: ExtractOptions) => Promise<AutomationResult<string | string[]>>;
  getPageContent: (tabId?: string) => Promise<AutomationResult<string>>;
  getUrl: (tabId?: string) => Promise<AutomationResult<string>>;
  getTitle: (tabId?: string) => Promise<AutomationResult<string>>;

  // Script execution
  executeScript: (options: ExecuteScriptOptions) => Promise<AutomationResult<unknown>>;

  // Tab management
  getTabs: () => Promise<AutomationResult<TabInfo[]>>;
  closeTab: (tabId: string) => Promise<AutomationResult<void>>;
  switchTab: (tabId: string) => Promise<AutomationResult<void>>;
  newTab: (url?: string) => Promise<AutomationResult<string>>;

  // Playback
  playRecording: (steps: RecordedStep[], options?: PlaybackOptions) => Promise<AutomationResult[]>;
  stopPlayback: () => void;

  // Utilities
  waitForSelector: (
    selector: string,
    tabId?: string,
    timeout?: number,
  ) => Promise<AutomationResult<void>>;
  waitForNavigation: (tabId?: string, timeout?: number) => Promise<AutomationResult<void>>;
  highlight: (selector: string, tabId?: string) => Promise<AutomationResult<void>>;
  clearHighlight: () => void;
}

/**
 * Custom hook for browser automation that connects React components to Tauri backend commands.
 * Provides a comprehensive API for controlling browser automation including navigation,
 * interaction, content extraction, and script execution.
 */
export function useBrowserAutomation(): BrowserAutomationHook {
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const playbackAbortRef = useRef(false);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  const {
    sessions,
    activeSessionId,
    addAction,
    highlightElement,
    clearHighlight: storeClearHighlight,
  } = useBrowserStore();

  // Get the active tab ID
  const getActiveTabId = useCallback(
    (providedTabId?: string): string | null => {
      if (providedTabId) return providedTabId;

      const activeSession = sessions.find((s) => s.id === activeSessionId);
      const activeTab = activeSession?.tabs.find((t) => t.active);
      return activeTab?.id || null;
    },
    [sessions, activeSessionId],
  );

  // Helper to execute automation command with error handling and action logging
  const executeCommand = useCallback(
    async <T>(
      commandName: string,
      args: Record<string, unknown>,
      actionType: ActionType,
      actionDetails: Record<string, unknown> = {},
    ): Promise<AutomationResult<T>> => {
      const startTime = Date.now();
      setIsExecuting(true);
      setLastError(null);

      try {
        const result = await invoke<T>(commandName, args);
        const duration = Date.now() - startTime;

        // Log successful action
        addAction({
          id: crypto.randomUUID(),
          type: actionType,
          timestamp: startTime,
          duration,
          success: true,
          details: {
            ...actionDetails,
            result,
          },
        });

        return { success: true, data: result, duration };
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        setLastError(errorMessage);

        // Log failed action
        addAction({
          id: crypto.randomUUID(),
          type: actionType,
          timestamp: startTime,
          duration,
          success: false,
          details: {
            ...actionDetails,
            error: errorMessage,
          },
        });

        return { success: false, error: errorMessage, duration };
      } finally {
        setIsExecuting(false);
      }
    },
    [addAction],
  );

  // Navigation commands
  const navigate = useCallback(
    async (options: NavigateOptions): Promise<AutomationResult<void>> => {
      const tabId = getActiveTabId(options.tabId);
      if (!tabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>(
        'browser_navigate',
        {
          tabId,
          url: options.url,
          waitUntil: options.waitUntil,
          timeout: options.timeout,
        },
        'navigate',
        { url: options.url },
      );
    },
    [getActiveTabId, executeCommand],
  );

  const goBack = useCallback(
    async (tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>('browser_go_back', { tabId: activeTabId }, 'navigate', {
        url: 'back',
      });
    },
    [getActiveTabId, executeCommand],
  );

  const goForward = useCallback(
    async (tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>('browser_go_forward', { tabId: activeTabId }, 'navigate', {
        url: 'forward',
      });
    },
    [getActiveTabId, executeCommand],
  );

  const reload = useCallback(
    async (tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>('browser_reload', { tabId: activeTabId }, 'navigate', {
        url: 'reload',
      });
    },
    [getActiveTabId, executeCommand],
  );

  // Interaction commands
  const click = useCallback(
    async (options: ClickOptions): Promise<AutomationResult<void>> => {
      const tabId = getActiveTabId(options.tabId);
      if (!tabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>(
        'browser_click',
        {
          tabId,
          selector: options.selector,
          button: options.button,
          clickCount: options.clickCount,
          delay: options.delay,
        },
        'click',
        { selector: options.selector },
      );
    },
    [getActiveTabId, executeCommand],
  );

  const type = useCallback(
    async (options: TypeOptions): Promise<AutomationResult<void>> => {
      const tabId = getActiveTabId(options.tabId);
      if (!tabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>(
        'browser_type',
        {
          tabId,
          selector: options.selector,
          text: options.text,
          delay: options.delay,
          clear: options.clear,
        },
        'type',
        { selector: options.selector, text: options.text },
      );
    },
    [getActiveTabId, executeCommand],
  );

  const hover = useCallback(
    async (selector: string, tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>(
        'browser_hover',
        { tabId: activeTabId, selector },
        'click', // Using click type as hover is similar
        { selector },
      );
    },
    [getActiveTabId, executeCommand],
  );

  const focus = useCallback(
    async (selector: string, tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>('browser_focus', { tabId: activeTabId, selector }, 'click', {
        selector,
      });
    },
    [getActiveTabId, executeCommand],
  );

  const scroll = useCallback(
    async (selector: string, tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>(
        'browser_scroll_into_view',
        { tabId: activeTabId, selector },
        'scroll',
        { selector },
      );
    },
    [getActiveTabId, executeCommand],
  );

  const selectOption = useCallback(
    async (selector: string, value: string, tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>(
        'browser_select_option',
        { tabId: activeTabId, selector, value },
        'click',
        { selector, text: value },
      );
    },
    [getActiveTabId, executeCommand],
  );

  const check = useCallback(
    async (selector: string, tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>('browser_check', { tabId: activeTabId, selector }, 'click', {
        selector,
      });
    },
    [getActiveTabId, executeCommand],
  );

  const uncheck = useCallback(
    async (selector: string, tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>('browser_uncheck', { tabId: activeTabId, selector }, 'click', {
        selector,
      });
    },
    [getActiveTabId, executeCommand],
  );

  // Content commands
  const screenshot = useCallback(
    async (options: ScreenshotOptions = {}): Promise<AutomationResult<string>> => {
      const tabId = getActiveTabId(options.tabId);
      if (!tabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<string>(
        'browser_screenshot',
        {
          tabId,
          fullPage: options.fullPage,
          selector: options.selector,
          format: options.format,
          quality: options.quality,
        },
        'screenshot',
        { selector: options.selector },
      );
    },
    [getActiveTabId, executeCommand],
  );

  const extract = useCallback(
    async (options: ExtractOptions): Promise<AutomationResult<string | string[]>> => {
      const tabId = getActiveTabId(options.tabId);
      if (!tabId) {
        return { success: false, error: 'No active tab available' };
      }

      // Use browser_get_text for simple text extraction or browser_evaluate for complex queries
      if (options.attribute) {
        return executeCommand<string>(
          'browser_get_attribute',
          { tabId, selector: options.selector, attribute: options.attribute },
          'extract',
          { selector: options.selector },
        );
      }

      return executeCommand<string>(
        'browser_get_text',
        { tabId, selector: options.selector || 'body' },
        'extract',
        { selector: options.selector },
      );
    },
    [getActiveTabId, executeCommand],
  );

  const getPageContent = useCallback(
    async (tabId?: string): Promise<AutomationResult<string>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<string>(
        'browser_get_dom_snapshot',
        { tabId: activeTabId },
        'extract',
        {},
      );
    },
    [getActiveTabId, executeCommand],
  );

  const getUrl = useCallback(
    async (tabId?: string): Promise<AutomationResult<string>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<string>('browser_get_url', { tabId: activeTabId }, 'extract', {});
    },
    [getActiveTabId, executeCommand],
  );

  const getTitle = useCallback(
    async (tabId?: string): Promise<AutomationResult<string>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<string>('browser_get_title', { tabId: activeTabId }, 'extract', {});
    },
    [getActiveTabId, executeCommand],
  );

  // Script execution
  const executeScript = useCallback(
    async (options: ExecuteScriptOptions): Promise<AutomationResult<unknown>> => {
      const tabId = getActiveTabId(options.tabId);
      if (!tabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<unknown>(
        'browser_evaluate',
        {
          tabId,
          script: options.script,
          args: options.args,
          timeout: options.timeout,
        },
        'execute',
        { script: options.script },
      );
    },
    [getActiveTabId, executeCommand],
  );

  // Tab management
  const getTabs = useCallback(async (): Promise<AutomationResult<TabInfo[]>> => {
    try {
      setIsExecuting(true);
      const tabs = await invoke<TabInfo[]>('browser_list_tabs');
      return { success: true, data: tabs };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const closeTab = useCallback(async (tabId: string): Promise<AutomationResult<void>> => {
    try {
      setIsExecuting(true);
      await invoke('browser_close_tab', { tabId });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const switchTab = useCallback(async (tabId: string): Promise<AutomationResult<void>> => {
    try {
      setIsExecuting(true);
      await invoke('browser_switch_tab', { tabId });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const newTab = useCallback(async (url?: string): Promise<AutomationResult<string>> => {
    try {
      setIsExecuting(true);
      const tabId = await invoke<string>('browser_open_tab', { url });
      return { success: true, data: tabId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    } finally {
      setIsExecuting(false);
    }
  }, []);

  // Utility commands
  const waitForSelector = useCallback(
    async (
      selector: string,
      tabId?: string,
      timeout: number = 30000,
    ): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>(
        'browser_wait_for_selector',
        { tabId: activeTabId, selector, timeout },
        'wait',
        { selector },
      );
    },
    [getActiveTabId, executeCommand],
  );

  const waitForNavigation = useCallback(
    async (tabId?: string, timeout: number = 30000): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      return executeCommand<void>(
        'browser_wait_for_navigation',
        { tabId: activeTabId, timeout },
        'wait',
        {},
      );
    },
    [getActiveTabId, executeCommand],
  );

  const highlight = useCallback(
    async (selector: string, tabId?: string): Promise<AutomationResult<void>> => {
      const activeTabId = getActiveTabId(tabId);
      if (!activeTabId) {
        return { success: false, error: 'No active tab available' };
      }

      try {
        await highlightElement(activeTabId, selector);
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    },
    [getActiveTabId, highlightElement],
  );

  const clearHighlight = useCallback(() => {
    storeClearHighlight();
  }, [storeClearHighlight]);

  // Playback functionality
  const playRecording = useCallback(
    async (steps: RecordedStep[], options: PlaybackOptions = {}): Promise<AutomationResult[]> => {
      const {
        delayBetweenSteps = 500,
        stopOnError = false,
        onStepStart,
        onStepComplete,
        onPlaybackComplete,
      } = options;

      playbackAbortRef.current = false;
      setIsPlayingBack(true);
      setTotalSteps(steps.length);
      setCurrentStep(0);

      const results: AutomationResult[] = [];

      // Set up event listeners for playback progress
      const unlisten = await listen<{ step: number; total: number }>(
        'browser:playback_progress',
        (event) => {
          setCurrentStep(event.payload.step);
        },
      );
      unlistenersRef.current.push(unlisten);

      try {
        for (let i = 0; i < steps.length; i++) {
          if (playbackAbortRef.current) {
            break;
          }

          const step = steps[i];
          if (!step) continue;

          setCurrentStep(i + 1);

          onStepStart?.(step, i);

          let result: AutomationResult;

          switch (step.type) {
            case 'navigate':
              result = await navigate({ url: step.value || '' });
              break;
            case 'click':
              result = await click({ selector: step.selector || '' });
              break;
            case 'type':
              result = await type({ selector: step.selector || '', text: step.value || '' });
              break;
            case 'wait':
              result = await waitForSelector(step.selector || '', undefined, 30000);
              break;
            case 'screenshot':
              result = await screenshot();
              break;
            case 'execute':
              result = await executeScript({ script: step.value || '' });
              break;
            case 'scroll':
              result = await scroll(step.selector || '');
              break;
            default:
              result = { success: false, error: `Unknown step type: ${step.type}` };
          }

          results.push(result);
          onStepComplete?.(step, i, result);

          if (!result.success && stopOnError) {
            break;
          }

          // Delay between steps
          if (i < steps.length - 1 && delayBetweenSteps > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayBetweenSteps));
          }
        }
      } finally {
        setIsPlayingBack(false);
        setCurrentStep(0);
        setTotalSteps(0);

        // Clean up listeners
        unlistenersRef.current.forEach((fn) => fn());
        unlistenersRef.current = [];

        onPlaybackComplete?.(results);
      }

      return results;
    },
    [navigate, click, type, waitForSelector, screenshot, executeScript, scroll],
  );

  const stopPlayback = useCallback(() => {
    playbackAbortRef.current = true;
  }, []);

  return {
    // State
    isExecuting,
    isPlayingBack,
    currentStep,
    totalSteps,
    lastError,

    // Navigation
    navigate,
    goBack,
    goForward,
    reload,

    // Interaction
    click,
    type,
    hover,
    focus,
    scroll,
    selectOption,
    check,
    uncheck,

    // Content
    screenshot,
    extract,
    getPageContent,
    getUrl,
    getTitle,

    // Script execution
    executeScript,

    // Tab management
    getTabs,
    closeTab,
    switchTab,
    newTab,

    // Playback
    playRecording,
    stopPlayback,

    // Utilities
    waitForSelector,
    waitForNavigation,
    highlight,
    clearHighlight,
  };
}

export default useBrowserAutomation;
