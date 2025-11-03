import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

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

interface BrowserState {
  // Sessions
  sessions: BrowserSession[];
  activeSessionId: string | null;
  initialized: boolean;

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
}

export const useBrowserStore = create<BrowserState>((set) => ({
  sessions: [],
  activeSessionId: null,
  initialized: false,

  initialize: async () => {
    try {
      await invoke('browser_init');
      set({ initialized: true });
    } catch (error) {
      console.error('Failed to initialize browser:', error);
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
      await invoke('browser_close', { sessionId });

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
              tabs: [
                ...session.tabs,
                { id: tabId, url, title: url, active: true },
              ],
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
          tabs: session.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, url, title: url } : tab
          ),
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
      const result = await invoke('browser_execute_script', { tabId, script });
      return result;
    } catch (error) {
      console.error('Failed to execute script:', error);
      throw error;
    }
  },

  setActiveSession: (sessionId: string) => {
    set({ activeSessionId: sessionId });
  },
}));
