import { isTauri, isCloudWeb, isDesktopUiDevLocal } from '@/lib/tauri-mock';
import { notifications } from '@agiworkforce/desktop-command-client';
import { getSimpleErrorMessage } from '@/lib/errorMessages';
import { ollamaCheckStatus, ollamaListModels, ollamaPullModel } from '@/api/ollama';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { ChevronRight, Search } from 'lucide-react';
import {
  SETTINGS_NAV,
  SETTINGS_NAV_GROUPS as NAV_GROUPS,
  type SettingsNavKey,
} from '@agiworkforce/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { Loader2 } from 'lucide-react';

import {
  createDefaultLLMConfig,
  createDefaultWindowPreferences,
  getDefaultGlobalHotkeyCombo,
  useSettingsStore,
  type Language,
  type GlobalHotkeyPreferences,
  type PersonalizationPreferences,
} from '../../stores/settingsStore';
import { LEGACY_TAB_MAP, type SettingsTab } from '../../stores/settingsDialogStore';
import type { NotificationSettings } from '../../hooks/useNotifications';
import { Button } from '@/components/ui/Button';
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useConnectorsStore } from '../../stores/connectorsStore';

import { GeneralTab } from './tabs/General';
import { AccountTab } from './tabs/Account';
import { AppearanceTab } from './tabs/Appearance';
import { PrivacyTab } from './tabs/Privacy';
import { ModelsKeysTab } from './tabs/ModelsKeys';
import { AgentsTab } from './tabs/Agents';
import { CapabilitiesTab } from './tabs/Capabilities';
import { ConnectionsTab } from './tabs/Connections';
import { CoworkTab } from './tabs/Cowork';
import { ConnectorsTab } from './tabs/Connectors';
import { PluginsTab } from './tabs/Plugins';
import { NotificationsTab } from './tabs/Notifications';
import { VoiceTab } from './tabs/Voice';
import { MemoryTab } from './tabs/Memory';
import { UsageTab } from './tabs/Usage';
import { ExtensionsTab } from './tabs/Extensions';
import { DeveloperTab } from './tabs/Developer';
import { AgiCodeTab } from './tabs/AgiCode';
import { BillingTab } from './tabs/Billing';
import { AgiInChromeTab } from './tabs/AgiInChrome';
import { searchDesktopSettings, type DesktopSettingSearchEntry } from './settingsSearchIndex';

// Canonical settings tab keys — single source of truth in @agiworkforce/ui.
type CanonicalTab = SettingsNavKey;

function resolveTab(tab: SettingsTab): CanonicalTab {
  return (LEGACY_TAB_MAP[tab] as CanonicalTab | undefined) ?? (tab as CanonicalTab);
}

// SETTINGS_NAV + NAV_GROUPS imported from @agiworkforce/ui (single source of truth).

const LOCAL_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  sound_enabled: true,
  badge_enabled: true,
  desktop_notifications: true,
  enabled_types: [
    'system',
    'task_complete',
    'task_failed',
    'agent_activity',
    'mcp_server',
    'reminder',
    'info',
    'warning',
    'error',
  ],
  do_not_disturb: false,
  dnd_start_time: null,
  dnd_end_time: null,
};

function canPersistNotificationSettings(): boolean {
  return isTauri || isCloudWeb;
}

const SELF_SAVING_TABS = new Set<CanonicalTab>([
  'capabilities',
  'connections',
  'cowork',
  'connectors',
  'plugins',
]);
const WEB_HIDDEN_TABS = new Set<CanonicalTab>(['models-keys', 'voice']);
const LOCAL_HIDDEN_TABS = new Set<CanonicalTab>(['account', 'billing', 'usage']);
const visibleNav = isCloudWeb
  ? SETTINGS_NAV.filter((t) => !WEB_HIDDEN_TABS.has(t.key))
  : SETTINGS_NAV.filter((t) => !LOCAL_HIDDEN_TABS.has(t.key));

function resolveVisibleTab(tab: SettingsTab): CanonicalTab {
  const resolved = resolveTab(tab);
  if (isCloudWeb && WEB_HIDDEN_TABS.has(resolved)) return 'general';
  if (!isCloudWeb && LOCAL_HIDDEN_TABS.has(resolved)) return 'general';
  return resolved;
}

function stableSerialize(value: unknown): string {
  const sortRecursively = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortRecursively);
    if (input && typeof input === 'object') {
      return Object.keys(input as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = sortRecursively((input as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return input;
  };
  return JSON.stringify(sortRecursively(value));
}

type OllamaModelListItem = string | { id?: unknown; name?: unknown; model?: unknown };

function normalizeOllamaModelList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: OllamaModelListItem) => {
      if (typeof item === 'string') return item;
      const id = typeof item.id === 'string' ? item.id : null;
      const model = typeof item.model === 'string' ? item.model : null;
      const name = typeof item.name === 'string' ? item.name : null;
      return id ?? model ?? name ?? '';
    })
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
}

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

export function SettingsPanel({ open, onOpenChange, initialTab = 'general' }: SettingsPanelProps) {
  // Dialog chrome (title, search placeholder, footer buttons) reads the shared
  // corpus. The nav labels it filters do not: they are hardcoded English in
  // `SETTINGS_NAV` (packages/ui/ui/src/settings-nav.ts), so the search box
  // matches English text whatever the locale says on the placeholder.
  const { t } = useTranslation();
  const hasInitializedOpenStateRef = useRef(false);
  const connectedConnectorCount = useConnectorsStore((state) => state.connectedIds.length);
  const llmConfig = useSettingsStore(useShallow((state) => state.llmConfig));
  const windowPreferences = useSettingsStore(useShallow((state) => state.windowPreferences));
  const chatPreferences = useSettingsStore(useShallow((state) => state.chatPreferences));
  const executionPreferences = useSettingsStore(useShallow((state) => state.executionPreferences));
  const allowedDirectories = useSettingsStore(useShallow((state) => state.allowedDirectories));
  const customModels = useSettingsStore(useShallow((state) => state.customModels));
  const features = useSettingsStore(useShallow((state) => state.features));
  const personalization = useSettingsStore(useShallow((state) => state.personalization));
  const setPersonalization = useSettingsStore((state) => state.setPersonalization);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setAlwaysUseAgentMode = useSettingsStore((state) => state.setAlwaysUseAgentMode);
  const setAutoApproveTools = useSettingsStore((state) => state.setAutoApproveTools);
  const setCompactMode = useSettingsStore((state) => state.setCompactMode);
  const setPromptCompletionEnabled = useSettingsStore((state) => state.setPromptCompletionEnabled);
  const globalHotkeyPreferences = useSettingsStore(
    useShallow((state) => state.globalHotkeyPreferences),
  );
  const setGlobalHotkeyEnabled = useSettingsStore((state) => state.setGlobalHotkeyEnabled);
  const setGlobalHotkeyCombo = useSettingsStore((state) => state.setGlobalHotkeyCombo);
  const setDefaultModel = useSettingsStore((state) => state.setDefaultModel);
  const setProviderMode = useSettingsStore((state) => state.setProviderMode);
  const setOllamaUrl = useSettingsStore((state) => state.setOllamaUrl);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const saveSettings = useSettingsStore((state) => state.saveSettings);
  const loading = useSettingsStore((state) => state.loading);
  const error = useSettingsStore((state) => state.error);

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('');
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [installingOllamaModel, setInstallingOllamaModel] = useState(false);
  const [ollamaInstallError, setOllamaInstallError] = useState<string | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(
    null,
  );
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [navQuery, setNavQuery] = useState('');
  const [activeSearchResult, setActiveSearchResult] = useState<DesktopSettingSearchEntry | null>(
    null,
  );
  const { confirm, dialog: discardChangesDialog } = useConfirm();
  const baselineSnapshotRef = useRef<string | null>(null);
  const settingsContentRef = useRef<HTMLDivElement | null>(null);
  // Baseline for personalization specifically (separate from baselineSnapshotRef's
  // serialized string) so `handleCancel` can restore it directly via
  // `setPersonalization`. Needed because `loadSettings()` — unlike every other
  // field in the snapshot — never touches `personalization` (it isn't part of the
  // disk-backed settings_load payload type), so discarding changes must restore
  // it explicitly or a personalization edit would silently survive a "Cancel".
  const personalizationBaselineRef = useRef<PersonalizationPreferences | null>(null);

  const resolvedLLMConfig = llmConfig ?? createDefaultLLMConfig();
  const resolvedWindowPreferences = windowPreferences ?? createDefaultWindowPreferences();
  const defaultGlobalHotkeyCombo = getDefaultGlobalHotkeyCombo();
  const resolvedGlobalHotkeyPreferences: GlobalHotkeyPreferences = globalHotkeyPreferences ?? {
    enabled: true,
    combo: defaultGlobalHotkeyCombo,
  };

  const isOllamaAvailable = ollamaAvailable || ollamaModels.length > 0;
  const ollamaEnabled = Boolean(resolvedLLMConfig.defaultModels?.ollama);
  const isBusy = loading || isSaving || notificationLoading;
  const normalizedNavQuery = navQuery.trim().toLowerCase();
  const filteredNavGroups = useMemo(() => {
    const visibleByKey = new Map(visibleNav.map((item) => [item.key, item]));

    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.keys
        .map((key) => visibleByKey.get(key))
        .filter((item): item is (typeof SETTINGS_NAV)[number] => {
          if (!item) return false;
          if (!normalizedNavQuery) return true;
          return (
            item.label.toLowerCase().includes(normalizedNavQuery) ||
            item.key.toLowerCase().includes(normalizedNavQuery) ||
            (item.keywords?.some((kw) => kw.toLowerCase().includes(normalizedNavQuery)) ?? false)
          );
        }),
    })).filter((group) => group.items.length > 0);
  }, [normalizedNavQuery]);
  const settingSearchGroups = useMemo(() => {
    if (!normalizedNavQuery) return [];

    const visibleKeys = new Set(visibleNav.map((item) => item.key));
    const matchesByTab = new Map<CanonicalTab, DesktopSettingSearchEntry[]>();
    for (const match of searchDesktopSettings(normalizedNavQuery)) {
      if (!visibleKeys.has(match.tab)) continue;
      const matches = matchesByTab.get(match.tab) ?? [];
      matches.push(match);
      matchesByTab.set(match.tab, matches);
    }

    return visibleNav
      .map((item) => ({
        item,
        matches: matchesByTab.get(item.key) ?? [],
        sectionMatches:
          item.label.toLowerCase().includes(normalizedNavQuery) ||
          item.key.toLowerCase().includes(normalizedNavQuery) ||
          (item.keywords?.some((keyword) => keyword.toLowerCase().includes(normalizedNavQuery)) ??
            false),
      }))
      .filter((group) => group.sectionMatches || group.matches.length > 0);
  }, [normalizedNavQuery]);

  const handleExportSettings = useCallback(async () => {
    try {
      const storeState = useSettingsStore.getState();
      const exportData = JSON.stringify(
        {
          llmConfig: storeState.llmConfig,
          windowPreferences: storeState.windowPreferences,
          chatPreferences: storeState.chatPreferences,
          executionPreferences: storeState.executionPreferences,
          globalHotkeyPreferences: storeState.globalHotkeyPreferences,
          customModels: storeState.customModels,
        },
        null,
        2,
      );
      if (!isTauri) {
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agi-workforce-settings-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      const savePath = await save({
        defaultPath: `agi-workforce-settings-${new Date().toISOString().split('T')[0]}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (savePath) await writeTextFile(savePath, exportData);
    } catch (err) {
      console.error('Failed to export settings:', err);
    }
  }, []);

  const handleOllamaEnabledChange = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        const modelToSet = selectedOllamaModel || ollamaModels[0] || 'llama3';
        setDefaultModel('ollama', modelToSet);
        setSelectedOllamaModel(modelToSet);
      } else {
        setDefaultModel('ollama', '');
      }
      setHasUnsavedChanges(true);
    },
    [selectedOllamaModel, ollamaModels, setDefaultModel],
  );

  const handleOllamaModelChange = useCallback(
    (model: string) => {
      setSelectedOllamaModel(model);
      if (ollamaEnabled) setDefaultModel('ollama', model);
      setHasUnsavedChanges(true);
    },
    [ollamaEnabled, setDefaultModel],
  );

  const loadNotificationSettings = useCallback(async (): Promise<NotificationSettings | null> => {
    setNotificationLoading(true);
    setNotificationError(null);
    try {
      if (!canPersistNotificationSettings()) {
        setNotificationSettings(LOCAL_NOTIFICATION_SETTINGS);
        return LOCAL_NOTIFICATION_SETTINGS;
      }
      const s = (await notifications.notificationGetSettings()) as unknown as NotificationSettings;
      setNotificationSettings(s);
      return s;
    } catch (err) {
      console.error('Failed to load notification settings:', err);
      setNotificationError(getSimpleErrorMessage(err));
      setNotificationSettings(null);
      return null;
    } finally {
      setNotificationLoading(false);
    }
  }, []);

  const updateNotificationSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setNotificationSettings((current) => {
      if (!current) return current;
      return { ...current, ...updates };
    });
    setNotificationError(null);
    setHasUnsavedChanges(true);
  }, []);

  const refreshOllamaState = useCallback(async () => {
    setCheckingOllama(true);
    try {
      const baseUrl = useSettingsStore.getState().llmConfig.ollamaUrl || 'http://localhost:11434';
      const available = isDesktopUiDevLocal ? false : await ollamaCheckStatus(baseUrl);
      setOllamaAvailable(available);
      const rawModels =
        available && !isDesktopUiDevLocal ? await ollamaListModels(baseUrl).catch(() => []) : [];
      const models = normalizeOllamaModelList(rawModels);
      setOllamaModels(models);
      setSelectedOllamaModel((currentModel) => {
        const persistedModel = useSettingsStore.getState().llmConfig.defaultModels?.ollama;
        if (persistedModel && models.includes(persistedModel)) return persistedModel;
        if (currentModel && models.includes(currentModel)) return currentModel;
        return models[0] || '';
      });
    } catch (err) {
      console.error('Failed to refresh Ollama settings:', err);
      setOllamaAvailable(false);
      setOllamaModels([]);
      setSelectedOllamaModel('');
    } finally {
      setCheckingOllama(false);
    }
  }, []);

  const handleInstallOllamaModel = useCallback(
    async (modelName: string) => {
      const normalizedModelName = modelName.trim();
      if (!normalizedModelName || installingOllamaModel) return;

      setInstallingOllamaModel(true);
      setOllamaInstallError(null);
      try {
        const baseUrl = useSettingsStore.getState().llmConfig.ollamaUrl || 'http://localhost:11434';
        await ollamaPullModel(normalizedModelName, baseUrl);
        await refreshOllamaState();
        setSelectedOllamaModel(normalizedModelName);
        if (ollamaEnabled) {
          setDefaultModel('ollama', normalizedModelName);
        }
        toast.success(`${normalizedModelName} is ready to use`);
      } catch (err) {
        const message = getSimpleErrorMessage(err);
        setOllamaInstallError(message);
        toast.error(`Could not install ${normalizedModelName}`);
        throw err;
      } finally {
        setInstallingOllamaModel(false);
      }
    },
    [installingOllamaModel, ollamaEnabled, refreshOllamaState, setDefaultModel],
  );

  const buildCurrentSnapshot = useCallback((notifs: NotificationSettings | null) => {
    const state = useSettingsStore.getState();
    return stableSerialize({
      llmConfig: state.llmConfig,
      windowPreferences: state.windowPreferences,
      chatPreferences: state.chatPreferences,
      executionPreferences: state.executionPreferences,
      globalHotkeyPreferences: state.globalHotkeyPreferences,
      allowedDirectories: state.allowedDirectories,
      customModels: state.customModels,
      features: state.features,
      personalization: state.personalization,
      notifications: notifs,
    });
  }, []);

  useEffect(() => {
    if (open && !hasInitializedOpenStateRef.current) {
      hasInitializedOpenStateRef.current = true;
      void (async () => {
        try {
          const [, loadedNotifications] = await Promise.all([
            loadSettings(),
            loadNotificationSettings(),
          ]);
          // loadSettings() never touches personalization (see ref comment above),
          // so its baseline is just whatever is currently in the store at open time.
          personalizationBaselineRef.current = useSettingsStore.getState().personalization;
          baselineSnapshotRef.current = buildCurrentSnapshot(loadedNotifications);
        } catch (err) {
          console.error('Failed to load settings:', err);
          toast.error('Failed to load settings');
          baselineSnapshotRef.current = null;
          personalizationBaselineRef.current = null;
        }
        await refreshOllamaState();
        setHasUnsavedChanges(false);
      })();
      return;
    }
    if (!open) {
      hasInitializedOpenStateRef.current = false;
      baselineSnapshotRef.current = null;
    }
  }, [open, buildCurrentSnapshot, loadNotificationSettings, loadSettings, refreshOllamaState]);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<CanonicalTab>(() => resolveVisibleTab(initialTab));

  const requiresDeferredSave = !SELF_SAVING_TABS.has(activeTab);

  useEffect(() => {
    if (open) {
      setActiveTab(resolveVisibleTab(initialTab));
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (normalizedNavQuery) return;
    setActiveSearchResult(null);
  }, [normalizedNavQuery]);

  useEffect(() => {
    if (!activeSearchResult || activeSearchResult.tab !== activeTab) return;

    let cancelled = false;
    let cleanupHighlight: (() => void) | undefined;
    let attempt = 0;
    const locateAndHighlight = () => {
      if (cancelled) return;
      const content = settingsContentRef.current;
      const target = content?.querySelector<HTMLElement>(
        `[data-setting-search-id="${activeSearchResult.id}"]`,
      );

      if (!target && attempt < 20) {
        attempt += 1;
        window.setTimeout(locateAndHighlight, 50);
        return;
      }

      if (!target) {
        content?.scrollTo?.({ top: 0, behavior: 'smooth' });
        return;
      }

      target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      target.classList.add('outline', 'outline-2', 'outline-primary/60', 'outline-offset-4');
      target.focus?.({ preventScroll: true });

      const timeout = window.setTimeout(() => {
        target.classList.remove('outline', 'outline-2', 'outline-primary/60', 'outline-offset-4');
      }, 2400);
      cleanupHighlight = () => {
        window.clearTimeout(timeout);
        target.classList.remove('outline', 'outline-2', 'outline-primary/60', 'outline-offset-4');
      };
    };

    window.setTimeout(locateAndHighlight, 0);
    return () => {
      cancelled = true;
      cleanupHighlight?.();
    };
  }, [activeSearchResult, activeTab]);

  useEffect(() => {
    if (!open || !baselineSnapshotRef.current) return;
    const currentSnapshot = buildCurrentSnapshot(notificationSettings);
    setHasUnsavedChanges(currentSnapshot !== baselineSnapshotRef.current);
  }, [
    open,
    llmConfig,
    windowPreferences,
    chatPreferences,
    executionPreferences,
    globalHotkeyPreferences,
    allowedDirectories,
    customModels,
    features,
    personalization,
    notificationSettings,
    buildCurrentSnapshot,
  ]);

  const handleThemeChange = useCallback(
    (value: 'light' | 'dark' | 'system') => {
      setTheme(value);
      setHasUnsavedChanges(true);
    },
    [setTheme],
  );

  const handleLanguageChange = useCallback(
    (value: Language) => {
      setLanguage(value);
      setHasUnsavedChanges(true);
    },
    [setLanguage],
  );

  const handleAgentModeChange = useCallback(
    (value: boolean) => {
      setAlwaysUseAgentMode(value);
      setHasUnsavedChanges(true);
    },
    [setAlwaysUseAgentMode],
  );

  const handleAutoApproveToolsChange = useCallback(
    (value: boolean) => {
      setAutoApproveTools(value);
      setHasUnsavedChanges(true);
    },
    [setAutoApproveTools],
  );

  const handleCompactModeChange = useCallback(
    (value: boolean) => {
      setCompactMode(value);
      setHasUnsavedChanges(true);
    },
    [setCompactMode],
  );

  const handlePromptCompletionChange = useCallback(
    (value: boolean) => {
      setPromptCompletionEnabled(value);
      setHasUnsavedChanges(true);
    },
    [setPromptCompletionEnabled],
  );

  const handleGlobalHotkeyEnabledChange = useCallback(
    (value: boolean) => {
      setGlobalHotkeyEnabled(value);
      setHasUnsavedChanges(true);
    },
    [setGlobalHotkeyEnabled],
  );

  const handleGlobalHotkeyComboChange = useCallback(
    (value: string) => {
      setGlobalHotkeyCombo(value);
      setHasUnsavedChanges(true);
    },
    [setGlobalHotkeyCombo],
  );

  useEffect(() => {
    if (open) setSaveError(null);
  }, [open]);

  const handleSaveSettings = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveSettings();
      if (notificationSettings && canPersistNotificationSettings()) {
        await notifications.notificationSetSettings(
          notificationSettings as unknown as Parameters<
            typeof notifications.notificationSetSettings
          >[0],
        );
      }
      personalizationBaselineRef.current = useSettingsStore.getState().personalization;
      baselineSnapshotRef.current = buildCurrentSnapshot(notificationSettings);
      setHasUnsavedChanges(false);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSaveError(getSimpleErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }, [buildCurrentSnapshot, isSaving, notificationSettings, onOpenChange, saveSettings]);

  const handleCancel = useCallback(async () => {
    try {
      const [, loadedNotifications] = await Promise.all([
        loadSettings(),
        loadNotificationSettings(),
      ]);
      // loadSettings() does not revert personalization (it's not part of the
      // disk-backed payload), so restore it from the open-time baseline
      // explicitly — otherwise a discarded personalization edit would
      // silently survive Cancel/Escape/click-outside while every other field
      // correctly reverts.
      if (personalizationBaselineRef.current) {
        setPersonalization(personalizationBaselineRef.current);
      }
      baselineSnapshotRef.current = buildCurrentSnapshot(loadedNotifications);
      await refreshOllamaState();
    } catch (err) {
      console.error('Failed to reload settings:', err);
      setSaveError('Failed to discard changes. Please try again.');
      return;
    }
    setSaveError(null);
    setHasUnsavedChanges(false);
    onOpenChange(false);
  }, [
    buildCurrentSnapshot,
    loadNotificationSettings,
    loadSettings,
    onOpenChange,
    refreshOllamaState,
    setPersonalization,
  ]);

  // Any close path (X button, Escape, click-outside, footer "Cancel") ends up
  // here via handleDialogOpenChange/requestClose. Previously all of these
  // unconditionally called handleCancel(), which re-fetches settings from disk
  // and overwrites the live store — silently discarding any edit that wasn't
  // explicitly committed via "Save Changes", with zero warning to the user.
  // confirmDiscardIfNeeded() gates that: if there's nothing unsaved it's a
  // no-op passthrough; otherwise it blocks the close behind an explicit
  // "Discard changes?" confirmation.
  const confirmDiscardIfNeeded = useCallback(async (): Promise<boolean> => {
    if (!hasUnsavedChanges) return true;
    return confirm({
      title: 'Discard unsaved changes?',
      description:
        "You've made changes in Settings that haven't been saved. Closing now will discard them.",
      confirmText: 'Discard changes',
      cancelText: 'Keep editing',
      variant: 'destructive',
    });
  }, [hasUnsavedChanges, confirm]);

  const requestClose = useCallback(async () => {
    const shouldClose = await confirmDiscardIfNeeded();
    if (!shouldClose) return;
    await handleCancel();
  }, [confirmDiscardIfNeeded, handleCancel]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }
      void requestClose();
    },
    [requestClose, onOpenChange],
  );

  const handleOllamaUrlChange = useCallback(
    (url: string) => {
      setOllamaUrl(url);
      setHasUnsavedChanges(true);
    },
    [setOllamaUrl],
  );

  const handleProviderModeChange = useCallback(
    (mode: 'auto' | 'local' | 'cloud') => {
      setProviderMode(mode);
      setHasUnsavedChanges(true);
    },
    [setProviderMode],
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <GeneralTab
            resolvedWindowPreferences={resolvedWindowPreferences}
            resolvedGlobalHotkeyPreferences={resolvedGlobalHotkeyPreferences}
            defaultGlobalHotkeyCombo={defaultGlobalHotkeyCombo}
            onThemeChange={handleThemeChange}
            onLanguageChange={handleLanguageChange}
            onGlobalHotkeyEnabledChange={handleGlobalHotkeyEnabledChange}
            onGlobalHotkeyComboChange={handleGlobalHotkeyComboChange}
          />
        );
      case 'account':
        return <AccountTab scope="local" />;
      case 'billing':
        return <BillingTab />;
      case 'usage':
        return <UsageTab />;
      case 'appearance':
        return <AppearanceTab />;
      case 'privacy':
        return <PrivacyTab />;
      case 'models-keys':
        return (
          <ModelsKeysTab
            resolvedLLMConfig={resolvedLLMConfig}
            chatPreferences={chatPreferences}
            ollamaModels={ollamaModels}
            selectedOllamaModel={selectedOllamaModel}
            checkingOllama={checkingOllama}
            isOllamaAvailable={Boolean(isOllamaAvailable)}
            ollamaEnabled={ollamaEnabled}
            installingOllamaModel={installingOllamaModel}
            ollamaInstallError={ollamaInstallError}
            onProviderModeChange={handleProviderModeChange}
            onOllamaUrlChange={handleOllamaUrlChange}
            onOllamaEnabledChange={handleOllamaEnabledChange}
            onOllamaModelChange={handleOllamaModelChange}
            onRefreshOllamaState={refreshOllamaState}
            onInstallOllamaModel={handleInstallOllamaModel}
            onAgentModeChange={handleAgentModeChange}
            onAutoApproveToolsChange={handleAutoApproveToolsChange}
            onCompactModeChange={handleCompactModeChange}
            onPromptCompletionChange={handlePromptCompletionChange}
            onExportSettings={() => void handleExportSettings()}
          />
        );
      case 'agents':
        return <AgentsTab />;
      case 'capabilities':
        return <CapabilitiesTab />;
      case 'connections':
        return <ConnectionsTab />;
      case 'cowork':
        return <CoworkTab />;
      case 'connectors':
        return <ConnectorsTab />;
      case 'agi-code':
        return <AgiCodeTab />;
      case 'agi-in-chrome':
        return <AgiInChromeTab />;
      case 'plugins':
        return <PluginsTab />;
      case 'notifications':
        return (
          <NotificationsTab
            notificationLoading={notificationLoading}
            notificationSettings={notificationSettings}
            notificationError={notificationError}
            onUpdateNotificationSettings={updateNotificationSettings}
          />
        );
      case 'voice':
        return <VoiceTab />;
      case 'memory':
        return <MemoryTab />;
      case 'extensions':
        return <ExtensionsTab />;
      case 'developer':
        return <DeveloperTab />;
      default:
        return null;
    }
  };

  return (
    <SectionErrorBoundary sectionName="Settings Panel">
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          disableAnimation
          className="w-[min(1040px,calc(100vw-2rem))] max-w-none overflow-hidden border-border/70 bg-background p-0 shadow-2xl sm:rounded-xl"
        >
          <div className="flex h-[min(760px,calc(100vh-2rem))] min-h-0 flex-col md:flex-row">
            <nav
              className="max-h-[42%] w-full shrink-0 overflow-y-auto overscroll-contain border-b border-border bg-muted/70 px-3 py-4 md:max-h-none md:w-64 md:border-b-0 md:border-r"
              aria-label="Settings sections"
            >
              <DialogHeader className="px-1 pb-4">
                <DialogTitle className="text-lg font-semibold">{t('settings:title')}</DialogTitle>
                <DialogDescription className="sr-only">
                  Search and configure AGI Workforce preferences
                </DialogDescription>
              </DialogHeader>

              <label className="relative mb-4 block">
                <span className="sr-only">Search settings</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={navQuery}
                  onChange={(event) => {
                    setNavQuery(event.target.value);
                    setActiveSearchResult(null);
                  }}
                  placeholder={t('search')}
                  className="h-10 w-full rounded-lg border border-transparent bg-background/70 py-2 pl-9 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-border focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </label>

              <div className="space-y-5">
                {normalizedNavQuery
                  ? settingSearchGroups.map(({ item, matches }) => (
                      <div key={item.key} className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSearchResult(null);
                            setActiveTab(item.key);
                          }}
                          disabled={isBusy}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-left font-medium">
                            {item.label}
                          </span>
                        </button>
                        {matches.map((match) => (
                          <button
                            key={match.id}
                            type="button"
                            onClick={() => {
                              setActiveSearchResult(match);
                              setActiveTab(match.tab);
                            }}
                            disabled={isBusy}
                            aria-label={`${match.label}, ${item.label}`}
                            aria-current={activeSearchResult?.id === match.id ? 'true' : undefined}
                            className={`group flex w-full items-start gap-2 rounded-lg py-2 pl-10 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
                              activeSearchResult?.id === match.id
                                ? 'bg-background text-foreground shadow-xs'
                                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                            }`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {match.label}
                              </span>
                              <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                                {match.description}
                              </span>
                            </span>
                            <ChevronRight
                              className="mt-1 h-3.5 w-3.5 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </button>
                        ))}
                      </div>
                    ))
                  : filteredNavGroups.map((group, groupIndex) => (
                      <div key={group.label ?? 'primary'} className="space-y-1">
                        {group.label && (
                          <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                            {group.label}
                          </div>
                        )}
                        {group.items.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setActiveTab(item.key)}
                            disabled={isBusy}
                            aria-current={activeTab === item.key ? 'page' : undefined}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              activeTab === item.key
                                ? 'bg-background text-foreground shadow-xs'
                                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                            } ${isBusy ? 'cursor-not-allowed opacity-60' : ''}`}
                          >
                            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                            {item.key === 'connectors' && connectedConnectorCount > 0 && (
                              <span
                                className="ml-auto flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary"
                                aria-label={`${connectedConnectorCount} connected`}
                              >
                                {connectedConnectorCount}
                              </span>
                            )}
                          </button>
                        ))}
                        {groupIndex === 0 && filteredNavGroups.length > 1 && (
                          <div className="mx-3 mt-3 border-t border-border/70" aria-hidden="true" />
                        )}
                      </div>
                    ))}
                {(normalizedNavQuery
                  ? settingSearchGroups.length === 0
                  : filteredNavGroups.length === 0) && (
                  <div className="rounded-lg border border-border bg-background/60 px-3 py-3 text-sm text-muted-foreground">
                    No settings found
                  </div>
                )}
              </div>
            </nav>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div
                ref={settingsContentRef}
                aria-busy={isBusy || undefined}
                className={`flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7 ${
                  isBusy ? 'pointer-events-none opacity-80' : ''
                }`}
              >
                {/* Same bounded measure as the shared SettingsModal pane, so
                    Local and Cloud settings read at one width. */}
                <div className="mx-auto w-full max-w-[672px]">
                  {activeSearchResult && activeSearchResult.tab === activeTab && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="mb-5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-foreground">
                        Showing {activeSearchResult.label}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activeSearchResult.description}
                      </p>
                    </div>
                  )}
                  {error && (
                    <div
                      role="alert"
                      className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
                    >
                      {error}
                    </div>
                  )}

                  {loading ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-center justify-center py-8"
                    >
                      <Loader2
                        className="h-6 w-6 animate-spin text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="sr-only">Loading settings…</span>
                    </div>
                  ) : (
                    <div className="space-y-6">{renderTabContent()}</div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border bg-background/95 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
                {requiresDeferredSave ? (
                  <>
                    {saveError && (
                      <div
                        role="alert"
                        className="mr-auto rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                      >
                        {saveError}
                      </div>
                    )}
                    <Button variant="outline" onClick={() => void requestClose()} disabled={isBusy}>
                      {t('cancel')}
                    </Button>
                    <Button
                      onClick={() => void handleSaveSettings()}
                      disabled={isBusy || !hasUnsavedChanges}
                      isLoading={isSaving}
                    >
                      {isSaving ? t('settings:saving') : t('settings:saveChanges')}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mr-auto text-xs text-muted-foreground">
                      Changes in this section apply immediately.
                    </p>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
                      {t('close')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {discardChangesDialog}
    </SectionErrorBoundary>
  );
}
