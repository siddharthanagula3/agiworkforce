/**
 * useShortcutActions — maps shortcut action IDs to concrete implementations.
 *
 * This hook wires up all shortcut actions defined in DEFAULT_SHORTCUTS and
 * registers them via useKeyboardShortcuts. It resolves key bindings from the
 * store (custom overrides first, then defaults).
 *
 * For actions that require deep component interaction (e.g. focus input,
 * open model selector) we dispatch custom DOM events that the relevant
 * components can listen to. This avoids tight coupling.
 */

import { useMemo } from 'react';
import { invoke } from '../lib/tauri-mock';
import { useKeyboardShortcuts, type KeyboardShortcut } from './useKeyboardShortcuts';
import { useSettingsStore } from '../stores/settingsStore';
import { useSettingsDialogStore } from '../stores/settingsDialogStore';
import { useModelStore } from '../stores/modelStore';
import { useUIStore } from '../stores/ui';
import { useUnifiedChatStore } from '../stores/unifiedChatStore';
import { DEFAULT_SHORTCUTS, parseCombo, type ShortcutDefinition } from '../constants/shortcuts';

// ---------------------------------------------------------------------------
// Custom DOM event names used to coordinate with deep components
// ---------------------------------------------------------------------------

export const SHORTCUT_EVENT = {
  FOCUS_INPUT: 'agi:shortcut:focusInput',
  MODEL_SELECT: 'agi:shortcut:modelSelect',
  TOOL_TIMELINE: 'agi:shortcut:toolTimeline',
  VOICE_INPUT: 'agi:shortcut:voiceInput',
  APP_SEARCH: 'agi:shortcut:appSearch',
} as const;

function dispatchShortcutEvent(name: string): void {
  window.dispatchEvent(new CustomEvent(name));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShortcutActions(): void {
  const customKeybindings = useSettingsStore((state) => state.customKeybindings);
  const openSettings = useSettingsDialogStore((state) => state.openSettings);

  const toggleThinkingMode = useModelStore((state) => state.toggleThinkingMode);
  const cycleModelVariant = useModelStore((state) => state.cycleModelVariant);
  const selectedModel = useModelStore((state) => state.selectedModel);
  const availableModels = useModelStore((state) => state.availableModels);
  const selectModel = useModelStore((state) => state.selectModel);

  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);

  const createConversation = useUnifiedChatStore((state) => state.createConversation);

  const setAgentMode = useSettingsStore((state) => state.setAgentMode);
  const agentMode = useSettingsStore((state) => state.chatPreferences.agentMode);

  // ---------------------------------------------------------------------------
  // Action implementations
  // ---------------------------------------------------------------------------

  const actions: Record<string, () => void | Promise<void>> = useMemo(
    () => ({
      'chat.new': () => {
        createConversation('New chat');
      },

      'chat.clear': () => {
        // Dispatch event; the chat view listens and clears messages
        window.dispatchEvent(new CustomEvent('agi:shortcut:clearChat'));
      },

      'chat.focusInput': () => {
        dispatchShortcutEvent(SHORTCUT_EVENT.FOCUS_INPUT);
      },

      'chat.copyLast': async () => {
        // The chat view can intercept this; fall back to clipboard API
        window.dispatchEvent(new CustomEvent('agi:shortcut:copyLast'));
      },

      'chat.voiceInput': () => {
        dispatchShortcutEvent(SHORTCUT_EVENT.VOICE_INPUT);
      },

      'app.settings': () => {
        openSettings();
      },

      'app.search': () => {
        dispatchShortcutEvent(SHORTCUT_EVENT.APP_SEARCH);
      },

      'model.select': () => {
        dispatchShortcutEvent(SHORTCUT_EVENT.MODEL_SELECT);
      },

      'model.cycle': () => {
        if (!availableModels.length) return;
        const currentIdx = availableModels.findIndex((m) => m.id === selectedModel);
        const nextIdx = (currentIdx + 1) % availableModels.length;
        const next = availableModels[nextIdx];
        if (next) {
          void selectModel(next.id, next.provider);
        }
      },

      'model.toggleThinking': () => {
        toggleThinkingMode();
      },

      'model.cycleVariant': () => {
        cycleModelVariant();
      },

      'agent.cycle': async () => {
        const modes = ['plan', 'build', 'autopilot'] as const;
        const currentIdx = modes.indexOf(agentMode as (typeof modes)[number]);
        const nextMode = modes[(currentIdx + 1) % modes.length] ?? 'build';
        await setAgentMode(nextMode);
      },

      'agent.planMode': async () => {
        await setAgentMode('plan');
      },

      'agent.buildMode': async () => {
        await setAgentMode('build');
      },

      'tools.timeline': () => {
        dispatchShortcutEvent(SHORTCUT_EVENT.TOOL_TIMELINE);
      },

      'window.toggleSidebar': () => {
        setSidebarCollapsed(!sidebarCollapsed);
      },

      'window.minimize': async () => {
        try {
          await invoke('minimize_window');
        } catch {
          console.warn('[useShortcutActions] minimize_window not available');
        }
      },

      'window.fullscreen': async () => {
        try {
          await invoke('toggle_fullscreen');
        } catch {
          console.warn('[useShortcutActions] toggle_fullscreen not available');
        }
      },

      'window.zoomIn': () => {
        const current = parseFloat(
          document.documentElement.style.getPropertyValue('--zoom') || '1',
        );
        document.documentElement.style.setProperty('--zoom', String(Math.min(2, current + 0.1)));
      },

      'window.zoomOut': () => {
        const current = parseFloat(
          document.documentElement.style.getPropertyValue('--zoom') || '1',
        );
        document.documentElement.style.setProperty('--zoom', String(Math.max(0.5, current - 0.1)));
      },

      'window.zoomReset': () => {
        document.documentElement.style.removeProperty('--zoom');
      },
    }),
    [
      availableModels,
      selectedModel,
      agentMode,
      sidebarCollapsed,
      createConversation,
      openSettings,
      toggleThinkingMode,
      cycleModelVariant,
      selectModel,
      setAgentMode,
      setSidebarCollapsed,
    ],
  );

  // ---------------------------------------------------------------------------
  // Build KeyboardShortcut array from resolved bindings
  // ---------------------------------------------------------------------------

  const shortcuts: KeyboardShortcut[] = useMemo(() => {
    return DEFAULT_SHORTCUTS.flatMap((def: ShortcutDefinition) => {
      const action = actions[def.action];
      if (!action) return [];

      // Resolve custom or default combo
      let key = def.key;
      let modifiers = def.modifiers;

      const custom = customKeybindings[def.id];
      if (custom) {
        const parsed = parseCombo(custom);
        if (parsed) {
          key = parsed.key;
          modifiers = parsed.modifiers;
        }
      }

      const shortcut: KeyboardShortcut = {
        key,
        modifiers,
        description: def.description,
        action: (event: KeyboardEvent) => {
          event.preventDefault();
          return action();
        },
      };
      return [shortcut];
    });
  }, [actions, customKeybindings]);

  useKeyboardShortcuts(shortcuts, { enabled: true });
}

/**
 * Utility: attach a listener to a shortcut custom DOM event.
 * Returns a cleanup function to remove the listener.
 */
export function onShortcutEvent(eventName: string, handler: () => void): () => void {
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
