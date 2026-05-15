import { isTauri, isCloudWeb } from '@/lib/tauri-mock';
import { notifications, models as modelsApi } from '@agiworkforce/api';
import { getSimpleErrorMessage } from '@/lib/errorMessages';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  Bell,
  CreditCard,
  Mic,
  Palette,
  Plug,
  Server,
  Settings2,
  Shield,
  Wrench,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Loader2 } from 'lucide-react';

import {
  createDefaultLLMConfig,
  createDefaultWindowPreferences,
  getDefaultGlobalHotkeyCombo,
  useSettingsStore,
  type Language,
  type GlobalHotkeyPreferences,
} from '../../stores/settingsStore';
import { LEGACY_TAB_MAP, type SettingsTab } from '../../stores/settingsDialogStore';
import { useModelStore } from '../../stores/modelStore';
import type { NotificationSettings } from '../../hooks/useNotifications';
import { Button } from '../ui/Button';
import { SectionErrorBoundary } from '../ui/SectionErrorBoundary';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { useConnectorsStore } from '../../stores/connectorsStore';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';

import { GeneralTab } from './tabs/General';
import { AccountTab } from './tabs/Account';
import { AppearanceTab } from './tabs/Appearance';
import { PrivacyTab } from './tabs/Privacy';
import { ModelsKeysTab } from './tabs/ModelsKeys';
import { AgentsTab } from './tabs/Agents';
import { McpSkillsTab } from './tabs/McpSkills';
import { ConnectorsTab } from './tabs/Connectors';
import { NotificationsTab } from './tabs/Notifications';
import { VoiceTab } from './tabs/Voice';
import { CapabilitiesTab } from './tabs/Capabilities';

type CanonicalTab =
  | 'general'
  | 'account'
  | 'appearance'
  | 'privacy'
  | 'models-keys'
  | 'agents'
  | 'mcp-skills'
  | 'connectors'
  | 'notifications'
  | 'voice'
  | 'capabilities';

function resolveTab(tab: SettingsTab): CanonicalTab {
  return (LEGACY_TAB_MAP[tab] as CanonicalTab | undefined) ?? (tab as CanonicalTab);
}

const SETTINGS_NAV: { key: CanonicalTab; label: string; icon: React.ElementType }[] = [
  { key: 'general', label: 'General', icon: Settings2 },
  { key: 'account', label: 'Account', icon: CreditCard },
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'privacy', label: 'Privacy', icon: Shield },
  { key: 'models-keys', label: 'Models & Keys', icon: Server },
  { key: 'agents', label: 'Agents', icon: Zap },
  { key: 'mcp-skills', label: 'MCP & Skills', icon: Wrench },
  { key: 'connectors', label: 'Apps & Integrations', icon: Plug },
  { key: 'capabilities', label: 'Capabilities', icon: Zap },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'voice', label: 'Voice', icon: Mic },
];

const SELF_SAVING_TABS = new Set<CanonicalTab>(['mcp-skills', 'connectors']);
const WEB_HIDDEN_TABS = new Set<CanonicalTab>(['models-keys', 'voice']);
const visibleNav = isCloudWeb
  ? SETTINGS_NAV.filter((t) => !WEB_HIDDEN_TABS.has(t.key))
  : SETTINGS_NAV;

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

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

export function SettingsPanel({ open, onOpenChange, initialTab = 'general' }: SettingsPanelProps) {
  const hasInitializedOpenStateRef = useRef(false);
  const connectedConnectorCount = useConnectorsStore((state) => state.connectedIds.length);
  const llmConfig = useSettingsStore(useShallow((state) => state.llmConfig));
  const windowPreferences = useSettingsStore(useShallow((state) => state.windowPreferences));
  const chatPreferences = useSettingsStore(useShallow((state) => state.chatPreferences));
  const executionPreferences = useSettingsStore(useShallow((state) => state.executionPreferences));
  const allowedDirectories = useSettingsStore(useShallow((state) => state.allowedDirectories));
  const customModels = useSettingsStore(useShallow((state) => state.customModels));
  const features = useSettingsStore(useShallow((state) => state.features));
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

  const providerStatuses = useModelStore(useShallow((state) => state.providerStatuses));
  const checkProviderStatus = useModelStore((state) => state.checkProviderStatus);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('');
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(
    null,
  );
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const baselineSnapshotRef = useRef<string | null>(null);

  const resolvedLLMConfig = llmConfig ?? createDefaultLLMConfig();
  const resolvedWindowPreferences = windowPreferences ?? createDefaultWindowPreferences();
  const defaultGlobalHotkeyCombo = getDefaultGlobalHotkeyCombo();
  const resolvedGlobalHotkeyPreferences: GlobalHotkeyPreferences = globalHotkeyPreferences ?? {
    enabled: true,
    combo: defaultGlobalHotkeyCombo,
  };

  const ollamaStatus = providerStatuses.ollama;
  const isOllamaAvailable = ollamaStatus?.available && ollamaStatus?.ollamaRunning;
  const ollamaEnabled = Boolean(resolvedLLMConfig.defaultModels?.ollama);
  const isBusy = loading || isSaving || notificationLoading;

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
      await checkProviderStatus('ollama');
      const models =
        ((await modelsApi.llmGetOllamaModels().catch(() => [] as string[])) as string[]) || [];
      setOllamaModels(models);
      setSelectedOllamaModel((currentModel) => {
        const persistedModel = useSettingsStore.getState().llmConfig.defaultModels?.ollama;
        if (persistedModel && models.includes(persistedModel)) return persistedModel;
        if (currentModel && models.includes(currentModel)) return currentModel;
        return models[0] || '';
      });
    } catch (err) {
      console.error('Failed to refresh Ollama settings:', err);
      setOllamaModels([]);
      setSelectedOllamaModel('');
    } finally {
      setCheckingOllama(false);
    }
  }, [checkProviderStatus]);

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
          baselineSnapshotRef.current = buildCurrentSnapshot(loadedNotifications);
        } catch (err) {
          console.error('Failed to load settings:', err);
          toast.error('Failed to load settings');
          baselineSnapshotRef.current = null;
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
  const [activeTab, setActiveTab] = useState<CanonicalTab>(() => {
    const resolved = resolveTab(initialTab);
    return isCloudWeb && WEB_HIDDEN_TABS.has(resolved) ? 'general' : resolved;
  });

  const openGovernanceWorkspace = useCallback(() => {
    onOpenChange(false);
    useUnifiedChatStore.getState().openSidecar('governance');
  }, [onOpenChange]);

  const requiresDeferredSave = !SELF_SAVING_TABS.has(activeTab);

  useEffect(() => {
    if (open) {
      const resolved = resolveTab(initialTab);
      setActiveTab(isCloudWeb && WEB_HIDDEN_TABS.has(resolved) ? 'general' : resolved);
    }
  }, [open, initialTab]);

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
      if (notificationSettings) {
        await notifications.notificationSetSettings(
          notificationSettings as unknown as Parameters<
            typeof notifications.notificationSetSettings
          >[0],
        );
      }
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
  ]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true);
        return;
      }
      void handleCancel();
    },
    [handleCancel, onOpenChange],
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
        return <AccountTab />;
      case 'appearance':
        return <AppearanceTab />;
      case 'privacy':
        return <PrivacyTab onOpenGovernanceWorkspace={openGovernanceWorkspace} />;
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
            onProviderModeChange={handleProviderModeChange}
            onOllamaUrlChange={handleOllamaUrlChange}
            onOllamaEnabledChange={handleOllamaEnabledChange}
            onOllamaModelChange={handleOllamaModelChange}
            onAgentModeChange={handleAgentModeChange}
            onAutoApproveToolsChange={handleAutoApproveToolsChange}
            onCompactModeChange={handleCompactModeChange}
            onPromptCompletionChange={handlePromptCompletionChange}
            onExportSettings={() => void handleExportSettings()}
          />
        );
      case 'agents':
        return <AgentsTab onSettingsChange={() => setHasUnsavedChanges(true)} />;
      case 'mcp-skills':
        return <McpSkillsTab isBusy={isBusy} onOpenConnectors={() => setActiveTab('connectors')} />;
      case 'connectors':
        return <ConnectorsTab isBusy={isBusy} onOpenMcpSkills={() => setActiveTab('mcp-skills')} />;
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
      case 'capabilities':
        return <CapabilitiesTab />;
      default:
        return null;
    }
  };

  return (
    <SectionErrorBoundary sectionName="Settings Panel">
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden bg-background">
          <div className="flex h-[85vh]">
            <nav
              className="w-52 border-r border-border bg-muted py-4 px-2 space-y-1 shrink-0 overflow-y-auto"
              aria-label="Settings sections"
            >
              <DialogHeader className="px-3 pb-4">
                <DialogTitle className="text-lg font-bold">Settings</DialogTitle>
                <DialogDescription className="text-xs">
                  Configure your preferences
                </DialogDescription>
              </DialogHeader>

              {visibleNav.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key)}
                  disabled={isBusy}
                  aria-current={activeTab === item.key ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    activeTab === item.key
                      ? 'bg-background text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  } ${isBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {item.key === 'connectors' && connectedConnectorCount > 0 && (
                    <span
                      className="ml-auto shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-500/15 px-1.5 text-[10px] font-semibold text-green-500"
                      aria-label={`${connectedConnectorCount} connected`}
                    >
                      {connectedConnectorCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            <div className="flex-1 flex flex-col min-w-0">
              <div
                className={`flex-1 overflow-y-auto px-6 py-6 ${
                  isBusy ? 'pointer-events-none opacity-80' : ''
                }`}
              >
                {error && (
                  <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-6">{renderTabContent()}</div>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
                {requiresDeferredSave ? (
                  <>
                    {saveError && (
                      <div className="mr-auto rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {saveError}
                      </div>
                    )}
                    <Button variant="outline" onClick={() => void handleCancel()} disabled={isBusy}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => void handleSaveSettings()}
                      disabled={isBusy || !hasUnsavedChanges}
                    >
                      {loading || isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mr-auto text-xs text-muted-foreground">
                      Changes in this section apply immediately.
                    </p>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
                      Close
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SectionErrorBoundary>
  );
}
