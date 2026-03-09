/**
 * App Preferences Store
 *
 * Manages window/UI preferences (theme, language, startup position, dock)
 * and global hotkey preferences.
 *
 * Middleware: devtools(persist(subscribeWithSelector(...)))
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';

// ============================================================================
// Types
// ============================================================================

export type Theme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'es';

export interface WindowPreferences {
  theme: Theme;
  language: Language;
  startupPosition: 'center' | 'remember';
  dockOnStartup: 'left' | 'right' | null;
}

export interface GlobalHotkeyPreferences {
  /** Whether the global hotkey is enabled */
  enabled: boolean;
  /** The key combo string, e.g. "CommandOrControl+Shift+Space" */
  combo: string;
}

const FALLBACK_GLOBAL_HOTKEY_COMBO = 'CommandOrControl+Shift+Space';

export function getDefaultGlobalHotkeyCombo(): string {
  if (typeof navigator === 'undefined') return FALLBACK_GLOBAL_HOTKEY_COMBO;

  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform || navigator.platform || '').toLowerCase();

  if (platform.includes('mac')) return 'Command+Shift+Space';
  if (platform.includes('win')) return 'Control+Shift+Space';

  return FALLBACK_GLOBAL_HOTKEY_COMBO;
}

interface AppPreferencesState {
  windowPreferences: WindowPreferences;
  globalHotkeyPreferences: GlobalHotkeyPreferences;
}

interface AppPreferencesActions {
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  setStartupPosition: (position: 'center' | 'remember') => void;
  setDockOnStartup: (dock: 'left' | 'right' | null) => void;
  setGlobalHotkeyEnabled: (enabled: boolean) => void;
  setGlobalHotkeyCombo: (combo: string) => void;
}

export type AppPreferencesStore = AppPreferencesState & AppPreferencesActions;

// ============================================================================
// Defaults
// ============================================================================

export const defaultWindowPreferences: WindowPreferences = {
  theme: 'system',
  language: 'en',
  startupPosition: 'center',
  dockOnStartup: null,
};

export const createDefaultWindowPreferences = (): WindowPreferences => ({
  ...defaultWindowPreferences,
});

// ============================================================================
// Store
// ============================================================================

export const useAppPreferencesStore = create<AppPreferencesStore>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        windowPreferences: { ...defaultWindowPreferences },
        globalHotkeyPreferences: {
          enabled: true,
          combo: getDefaultGlobalHotkeyCombo(),
        },

        setTheme: (theme: Theme) => {
          set(
            (state) => ({ windowPreferences: { ...state.windowPreferences, theme } }),
            undefined,
            'appPreferences/setTheme',
          );

          if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            if (
              theme === 'dark' ||
              (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
            ) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          }
        },

        setLanguage: (language: Language) => {
          set(
            (state) => ({ windowPreferences: { ...state.windowPreferences, language } }),
            undefined,
            'appPreferences/setLanguage',
          );
        },

        setStartupPosition: (position: 'center' | 'remember') => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, startupPosition: position },
            }),
            undefined,
            'appPreferences/setStartupPosition',
          );
        },

        setDockOnStartup: (dock: 'left' | 'right' | null) => {
          set(
            (state) => ({
              windowPreferences: { ...state.windowPreferences, dockOnStartup: dock },
            }),
            undefined,
            'appPreferences/setDockOnStartup',
          );
        },

        setGlobalHotkeyEnabled: (enabled: boolean) => {
          set(
            (state) => ({
              globalHotkeyPreferences: { ...state.globalHotkeyPreferences, enabled },
            }),
            undefined,
            'appPreferences/setGlobalHotkeyEnabled',
          );
        },

        setGlobalHotkeyCombo: (combo: string) => {
          set(
            (state) => ({
              globalHotkeyPreferences: { ...state.globalHotkeyPreferences, combo },
            }),
            undefined,
            'appPreferences/setGlobalHotkeyCombo',
          );
        },
      })),
      {
        name: 'agiworkforce-app-preferences',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          windowPreferences: state.windowPreferences,
          globalHotkeyPreferences: state.globalHotkeyPreferences,
        }),
      },
    ),
    { name: 'AppPreferencesStore', enabled: import.meta.env.DEV },
  ),
);
