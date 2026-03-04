import { invoke } from '@/lib/tauri-mock';
import { getSimpleErrorMessage } from '@/lib/errorMessages';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  Bell,
  Check,
  CreditCard,
  Database,
  Download,
  Loader2,
  Plug,
  Puzzle,
  Server,
  Settings2,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  createDefaultLLMConfig,
  createDefaultWindowPreferences,
  useSettingsStore,
  type Language,
  type GlobalHotkeyPreferences,
} from '../../stores/settingsStore';
import type { SettingsTab } from '../../stores/settingsDialogStore';
import { useAccountStore } from '../../stores/accountStore';
import { useAuthStore } from '../../stores/auth';
import { openPricingPage } from '../../utils/navigation';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { useModelStore } from '../../stores/modelStore';
import { errorTracking } from '../../services/errorTracking';
import { ResourceMonitor } from '../ResourceMonitor';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { AllowedDirectoriesSettings } from './AllowedDirectoriesSettings';
import { AutomationPermissionsSettings } from './AutomationPermissionsSettings';
import { CustomInstructionsSettings } from './CustomInstructionsSettings';
import { MasterPasswordSettings } from './MasterPasswordSettings';
import { UpdateSettings } from './UpdateSettings';
import { ExtensionsSettings } from './ExtensionsSettings';
import { AgentsSettings } from './AgentsSettings';
import { InstructionFilesSettings } from './InstructionFilesSettings';
import { CustomModelsSettings } from './CustomModelsSettings';
import { SkillsPluginsSettings } from './SkillsPluginsSettings';
import { TaskRoutingSettings } from './TaskRoutingSettings';
import { FavoriteModelsSelector } from './FavoriteModelsSelector';
import { ConnectorsGallery } from '../Connectors/ConnectorsGallery';
import { OAuthCredentialsPanel } from './OAuthCredentialsPanel';
import { VoiceSettings } from './VoiceSettings';
import { MemoryPanel } from '../Memory/MemoryPanel';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

const SETTINGS_NAV: { key: SettingsTab; label: string; icon: React.ElementType }[] = [
  { key: 'general', label: 'General', icon: Settings2 },
  { key: 'account', label: 'Account & Billing', icon: CreditCard },
  { key: 'personalization', label: 'Personalization', icon: Sparkles },
  { key: 'privacy', label: 'Privacy & Data', icon: Shield },
  { key: 'connectors', label: 'Connectors', icon: Plug },
  { key: 'api-keys', label: 'API Keys', icon: Server },
  { key: 'extensions', label: 'Extensions', icon: Puzzle },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

export function SettingsPanel({ open, onOpenChange, initialTab = 'general' }: SettingsPanelProps) {
  const llmConfig = useSettingsStore(useShallow((state) => state.llmConfig));
  const windowPreferences = useSettingsStore(useShallow((state) => state.windowPreferences));
  const chatPreferences = useSettingsStore(useShallow((state) => state.chatPreferences));
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setAlwaysUseAgentMode = useSettingsStore((state) => state.setAlwaysUseAgentMode);
  const setAutoApproveTools = useSettingsStore((state) => state.setAutoApproveTools);
  const setCompactMode = useSettingsStore((state) => state.setCompactMode);
  const setPromptCompletionEnabled = useSettingsStore((state) => state.setPromptCompletionEnabled);
  const setTemperature = useSettingsStore((state) => state.setTemperature);
  const setMaxTokens = useSettingsStore((state) => state.setMaxTokens);
  const globalHotkeyPreferences = useSettingsStore(
    useShallow((state) => state.globalHotkeyPreferences),
  );
  const setGlobalHotkeyEnabled = useSettingsStore((state) => state.setGlobalHotkeyEnabled);
  const setGlobalHotkeyCombo = useSettingsStore((state) => state.setGlobalHotkeyCombo);
  const setDefaultModel = useSettingsStore((state) => state.setDefaultModel);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const saveSettings = useSettingsStore((state) => state.saveSettings);
  const loading = useSettingsStore((state) => state.loading);
  const error = useSettingsStore((state) => state.error);

  const providerStatuses = useModelStore(useShallow((state) => state.providerStatuses));
  const checkProviderStatus = useModelStore((state) => state.checkProviderStatus);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('');
  const [checkingOllama, setCheckingOllama] = useState(false);

  const resolvedLLMConfig = llmConfig ?? createDefaultLLMConfig();
  const resolvedWindowPreferences = windowPreferences ?? createDefaultWindowPreferences();
  const resolvedGlobalHotkeyPreferences: GlobalHotkeyPreferences = globalHotkeyPreferences ?? {
    enabled: true,
    combo: 'CommandOrControl+Shift+Space',
  };

  const ollamaStatus = providerStatuses.ollama;
  const isOllamaAvailable = ollamaStatus?.available && ollamaStatus?.ollamaRunning;
  const ollamaEnabled = Boolean(resolvedLLMConfig.defaultModels?.ollama);

  const handleOllamaEnabledChange = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        const modelToSet = selectedOllamaModel || ollamaModels[0] || 'llama3';
        setDefaultModel('ollama', modelToSet);
        setSelectedOllamaModel(modelToSet);
      } else {
        setDefaultModel('ollama', '');
      }
    },
    [selectedOllamaModel, ollamaModels, setDefaultModel],
  );

  const handleOllamaModelChange = useCallback(
    (model: string) => {
      setSelectedOllamaModel(model);
      if (ollamaEnabled) {
        setDefaultModel('ollama', model);
      }
    },
    [ollamaEnabled, setDefaultModel],
  );

  useEffect(() => {
    if (open) {
      loadSettings().catch((err) => {
        console.error('Failed to load settings:', err);
      });
      setCheckingOllama(true);
      checkProviderStatus('ollama')
        .then(() => {
          invoke<string[]>('llm_get_ollama_models')
            .then((models) => {
              setOllamaModels(models || []);
              const persistedModel = resolvedLLMConfig.defaultModels?.ollama;
              if (persistedModel && models?.includes(persistedModel)) {
                setSelectedOllamaModel(persistedModel);
              } else if (models && models.length > 0 && !selectedOllamaModel) {
                setSelectedOllamaModel(models[0] || '');
              }
            })
            .catch(() => {
              setOllamaModels([]);
            });
        })
        .finally(() => setCheckingOllama(false));
    }
  }, [
    open,
    loadSettings,
    checkProviderStatus,
    selectedOllamaModel,
    resolvedLLMConfig.defaultModels?.ollama,
  ]);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const accountData = useAccountStore((state) => state.account);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

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

  const handleTemperatureChange = useCallback(
    (value: string) => {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        setTemperature(Math.max(0, Math.min(2, parsed)));
        setHasUnsavedChanges(true);
      }
    },
    [setTemperature],
  );

  const handleMaxTokensChange = useCallback(
    (value: string) => {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        setMaxTokens(parsed);
        setHasUnsavedChanges(true);
      }
    },
    [setMaxTokens],
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
    if (open) {
      setHasUnsavedChanges(false);
    }
  }, [open]);

  const handleSaveSettings = async () => {
    try {
      await saveSettings();
      setHasUnsavedChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleCancel = async () => {
    if (hasUnsavedChanges) {
      try {
        await loadSettings();
      } catch (error) {
        console.error('Failed to reload settings:', error);
      }
    }
    setHasUnsavedChanges(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full p-0 overflow-hidden">
        <div className="flex h-[85vh]">
          {/* Vertical sidebar navigation */}
          <div className="w-52 border-r border-border bg-muted/30 py-4 px-2 space-y-1 shrink-0 overflow-y-auto">
            <DialogHeader className="px-3 pb-4">
              <DialogTitle className="text-lg font-bold">Settings</DialogTitle>
              <DialogDescription className="text-xs">Configure your preferences</DialogDescription>
            </DialogHeader>

            {SETTINGS_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                  activeTab === item.key
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Content area */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {loading && !llmConfig ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* General Tab */}
                  {activeTab === 'general' && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold mb-4">Window Preferences</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                          Customize window behavior and appearance
                        </p>
                        <div className="space-y-6">
                          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                            <h4 className="font-semibold">Global Hotkey</h4>
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <Label htmlFor="globalHotkeyEnabled">Enable Global Hotkey</Label>
                                <p className="text-xs text-muted-foreground">
                                  Open AGI Workforce from anywhere with a keyboard shortcut.
                                </p>
                              </div>
                              <Switch
                                id="globalHotkeyEnabled"
                                checked={resolvedGlobalHotkeyPreferences.enabled}
                                onCheckedChange={handleGlobalHotkeyEnabledChange}
                              />
                            </div>
                            {resolvedGlobalHotkeyPreferences.enabled && (
                              <div className="space-y-2">
                                <Label htmlFor="globalHotkeyCombo">Key Combination</Label>
                                <input
                                  id="globalHotkeyCombo"
                                  type="text"
                                  value={resolvedGlobalHotkeyPreferences.combo}
                                  onChange={(e) => handleGlobalHotkeyComboChange(e.target.value)}
                                  placeholder="CommandOrControl+Shift+Space"
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                                <p className="text-xs text-muted-foreground">
                                  Use Tauri accelerator format, e.g.{' '}
                                  <code className="rounded bg-muted px-1 py-0.5">
                                    CommandOrControl+Shift+Space
                                  </code>
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="theme">Theme</Label>
                            <Select
                              value={resolvedWindowPreferences.theme}
                              onValueChange={(value) =>
                                handleThemeChange(value as 'light' | 'dark' | 'system')
                              }
                            >
                              <SelectTrigger id="theme">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="light">Light</SelectItem>
                                <SelectItem value="dark">Dark</SelectItem>
                                <SelectItem value="system">System</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="language">Language</Label>
                            <Select
                              value={resolvedWindowPreferences.language}
                              onValueChange={(value) => handleLanguageChange(value as Language)}
                            >
                              <SelectTrigger id="language">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SUPPORTED_LANGUAGES.map((lang) => (
                                  <SelectItem key={lang.code} value={lang.code}>
                                    {lang.nativeName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-border">
                        <VoiceSettings />
                      </div>

                      <div className="pt-6 border-t border-border">
                        <h3 className="text-lg font-semibold mb-4">System Resources</h3>
                        <ResourceMonitor showTools={true} />
                      </div>
                      <div className="pt-6 border-t border-border">
                        <h3 className="text-lg font-semibold mb-4">Agent Permissions</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          macOS system permissions required for agent mode automation.
                        </p>
                        <AutomationPermissionsSettings />
                      </div>
                      <div className="pt-6 border-t border-border">
                        <UpdateSettings />
                      </div>
                    </>
                  )}

                  {/* Account & Billing Tab */}
                  {activeTab === 'account' && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Account</h3>
                      <div className="rounded-lg border border-border bg-card p-6">
                        <div className="flex items-center gap-4 mb-6">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-purple-500 text-xl font-semibold text-white">
                            {accountData.avatar ? (
                              <img
                                src={accountData.avatar}
                                alt={accountData.displayName || ''}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <span>
                                {(accountData.displayName || accountData.email || 'U')
                                  .split(/[\s._-]+/)
                                  .filter(Boolean)
                                  .map((n: string) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="text-lg font-semibold">
                              {accountData.displayName ||
                                accountData.email?.split('@')[0] ||
                                'User'}
                            </div>
                            <div className="text-sm text-muted-foreground">{accountData.email}</div>
                            <div className="mt-1 inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-primary">
                              {accountData.planDisplayName || 'Free'}
                            </div>
                          </div>
                        </div>

                        {accountData.credits && (
                          <div className="space-y-3 mb-6">
                            {accountData.credits.daily_limit_cents !== undefined &&
                              accountData.credits.daily_limit_cents > 0 && (
                                <div className="rounded-lg border border-border bg-muted/30 p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">Daily Credits</span>
                                    <span className="text-sm text-muted-foreground">
                                      {accountData.credits.daily_remaining_cents ?? 0} remaining
                                    </span>
                                  </div>
                                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full bg-primary transition-all"
                                      style={{
                                        width: `${Math.min(
                                          ((accountData.credits.daily_used_cents || 0) /
                                            (accountData.credits.daily_limit_cents || 1)) *
                                            100,
                                          100,
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                            {accountData.credits.allocated_cents &&
                              accountData.credits.allocated_cents > 0 && (
                                <div className="rounded-lg border border-border bg-muted/30 p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">Monthly Credits</span>
                                    <span className="text-sm text-muted-foreground">
                                      {accountData.credits.remaining_cents ?? 0} remaining
                                    </span>
                                  </div>
                                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full bg-primary transition-all"
                                      style={{
                                        width: `${Math.min(
                                          ((accountData.credits.used_cents || 0) /
                                            (accountData.credits.allocated_cents || 1)) *
                                            100,
                                          100,
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                          </div>
                        )}

                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openPricingPage()}
                          >
                            <CreditCard className="mr-2 h-4 w-4" />
                            Manage Subscription
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void useAuthStore.getState().signOut()}
                          >
                            Sign Out
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Personalization Tab */}
                  {activeTab === 'personalization' && (
                    <>
                      <MemoryPanel />
                      <div className="pt-6 border-t border-border">
                        <CustomInstructionsSettings />
                      </div>
                      <div className="pt-6 border-t border-border">
                        <InstructionFilesSettings />
                      </div>
                      <div className="pt-6 border-t border-border">
                        <AgentsSettings />
                      </div>
                    </>
                  )}

                  {/* Privacy & Data Tab */}
                  {activeTab === 'privacy' && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold mb-1">Master Password</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Encrypt stored API keys and secrets with an Argon2id-derived master
                          password.
                        </p>
                        <MasterPasswordSettings />
                      </div>
                      <div className="pt-6 border-t border-border">
                        <DataPrivacyTab />
                      </div>
                      <div className="pt-6 border-t border-border">
                        <AllowedDirectoriesSettings />
                      </div>
                    </>
                  )}

                  {/* Connectors Tab */}
                  {activeTab === 'connectors' && (
                    <>
                      <ConnectorsGallery />
                      <div className="pt-6 border-t border-border">
                        <OAuthCredentialsPanel />
                      </div>
                    </>
                  )}

                  {/* API Keys Tab */}
                  {activeTab === 'api-keys' && (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold mb-4">AI Provider</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                          Your AI requests are handled through your subscription plan
                        </p>
                        <div className="space-y-6">
                          <div className="rounded-lg border border-border bg-card p-6">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-4">
                                <div className="rounded-md bg-muted p-3">
                                  <Server className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-semibold mb-2">
                                    Local Ollama (Offline Mode)
                                  </h4>
                                  <p className="text-sm text-muted-foreground mb-3">
                                    Use Ollama for offline AI processing. Models run locally on your
                                    machine for complete privacy and no internet required.
                                  </p>
                                  {checkingOllama ? (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      <span>Checking Ollama status...</span>
                                    </div>
                                  ) : isOllamaAvailable ? (
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2 text-xs text-green-600">
                                        <Check className="h-3 w-3" />
                                        <span>Ollama is running and available</span>
                                      </div>
                                      {ollamaEnabled && ollamaModels.length > 0 && (
                                        <Select
                                          value={selectedOllamaModel}
                                          onValueChange={handleOllamaModelChange}
                                        >
                                          <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select model" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {ollamaModels.map((model) => (
                                              <SelectItem key={model} value={model}>
                                                {model}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-yellow-600">
                                      Ollama not detected. Install from{' '}
                                      <a
                                        href="https://ollama.ai"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline"
                                      >
                                        ollama.ai
                                      </a>
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Switch
                                checked={ollamaEnabled}
                                onCheckedChange={handleOllamaEnabledChange}
                              />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="text-base font-semibold">Model Configuration</h4>
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label htmlFor="temperature">
                                  Temperature ({resolvedLLMConfig.temperature?.toFixed(1) ?? '0.7'})
                                </Label>
                                <input
                                  id="temperature"
                                  type="range"
                                  min="0"
                                  max="2"
                                  step="0.1"
                                  value={resolvedLLMConfig.temperature ?? 0.7}
                                  onChange={(e) => handleTemperatureChange(e.target.value)}
                                  className="w-full"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Precise</span>
                                  <span>Creative</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="maxTokens">Max Tokens</Label>
                                <input
                                  id="maxTokens"
                                  type="number"
                                  value={resolvedLLMConfig.maxTokens ?? 4096}
                                  onChange={(e) => handleMaxTokensChange(e.target.value)}
                                  min={1}
                                  max={200000}
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                              </div>
                            </div>
                          </div>

                          <FavoriteModelsSelector />
                          <CustomModelsSettings />
                          <TaskRoutingSettings />
                        </div>
                      </div>

                      <div className="pt-6 border-t border-border">
                        <h3 className="text-lg font-semibold mb-4">Settings Management</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Export or import your settings configuration
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const settings = useSettingsStore.getState();
                              const exportData = JSON.stringify(
                                {
                                  llmConfig: settings.llmConfig,
                                  windowPreferences: settings.windowPreferences,
                                  chatPreferences: settings.chatPreferences,
                                  executionPreferences: settings.executionPreferences,
                                  globalHotkeyPreferences: settings.globalHotkeyPreferences,
                                  customModels: settings.customModels,
                                },
                                null,
                                2,
                              );
                              const savePath = await save({
                                defaultPath: `agi-workforce-settings-${new Date().toISOString().split('T')[0]}.json`,
                                filters: [{ name: 'JSON', extensions: ['json'] }],
                              });
                              if (savePath) {
                                await writeTextFile(savePath, exportData);
                              }
                            } catch (error) {
                              console.error('Failed to export settings:', error);
                            }
                          }}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export Settings
                        </Button>
                      </div>

                      <div className="pt-6 border-t border-border">
                        <h3 className="text-lg font-semibold mb-4">Model Behavior</h3>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="agentMode">Always Use Agent Mode</Label>
                              <p className="text-xs text-muted-foreground">
                                Agent mode enables tool use, web browsing, and code execution
                              </p>
                            </div>
                            <Switch
                              id="agentMode"
                              checked={chatPreferences?.alwaysUseAgentMode ?? false}
                              onCheckedChange={handleAgentModeChange}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="autoApprove">Auto-Approve Tools</Label>
                              <p className="text-xs text-muted-foreground">
                                Automatically approve safe tool executions without confirmation
                              </p>
                            </div>
                            <Switch
                              id="autoApprove"
                              checked={chatPreferences?.autoApproveTools ?? false}
                              onCheckedChange={handleAutoApproveToolsChange}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="compactMode">Compact Mode</Label>
                              <p className="text-xs text-muted-foreground">
                                Reduce spacing between messages for a denser view
                              </p>
                            </div>
                            <Switch
                              id="compactMode"
                              checked={chatPreferences?.compactMode ?? false}
                              onCheckedChange={handleCompactModeChange}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="promptCompletion">Prompt Completion</Label>
                              <p className="text-xs text-muted-foreground">
                                Show AI-powered suggestions as you type
                              </p>
                            </div>
                            <Switch
                              id="promptCompletion"
                              checked={chatPreferences?.promptCompletionEnabled ?? true}
                              onCheckedChange={handlePromptCompletionChange}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 text-xs text-muted-foreground">
                        <h4 className="font-medium mb-2">Supported Providers</h4>
                        <ul className="list-disc list-inside space-y-1">
                          <li>OpenAI (GPT-4o, GPT-4.5, o1, o3-mini)</li>
                          <li>Anthropic (Claude 4, Sonnet, Haiku)</li>
                          <li>Google (Gemini 2.0 Flash, Pro)</li>
                          <li>xAI (Grok-3, Grok-3 Mini)</li>
                          <li>DeepSeek (R1, V3)</li>
                          <li>Mistral (Large, Codestral)</li>
                          <li>Meta Llama (via Ollama)</li>
                          <li>Perplexity (Sonar Pro, Sonar)</li>
                          <li>OpenRouter (any model)</li>
                        </ul>
                      </div>
                    </>
                  )}

                  {/* Extensions Tab */}
                  {activeTab === 'extensions' && (
                    <>
                      <ExtensionsSettings />
                      <div className="pt-6 border-t border-border">
                        <SkillsPluginsSettings />
                      </div>
                    </>
                  )}

                  {/* Notifications Tab */}
                  {activeTab === 'notifications' && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Notifications</h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        Configure how you receive notifications
                      </p>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>Desktop Notifications</Label>
                            <p className="text-xs text-muted-foreground">
                              Show system notifications for agent completions and alerts
                            </p>
                          </div>
                          <Switch
                            checked={localStorage.getItem('notifications_desktop') !== 'false'}
                            onCheckedChange={(v) =>
                              localStorage.setItem('notifications_desktop', String(v))
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>Sound Effects</Label>
                            <p className="text-xs text-muted-foreground">
                              Play sounds for message received and task completion
                            </p>
                          </div>
                          <Switch
                            checked={localStorage.getItem('notifications_sound') !== 'false'}
                            onCheckedChange={(v) =>
                              localStorage.setItem('notifications_sound', String(v))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => void handleCancel()}>
                Cancel
              </Button>
              <Button onClick={() => void handleSaveSettings()} disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DataPrivacyTab() {
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [crashReportingEnabled, setCrashReportingEnabled] = useState(() => {
    return errorTracking.getConfig().enabled;
  });
  const [savingCrashReporting, setSavingCrashReporting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadPreference = async () => {
      try {
        const result = await invoke<{ value: string } | null>('get_user_preference', {
          key: 'crash_reporting_enabled',
        });
        if (result && mounted) {
          const enabled = result.value === 'true';
          setCrashReportingEnabled(enabled);
          errorTracking.updateConfig({ enabled });
        }
      } catch (error) {
        if (mounted) {
          console.error('Failed to load crash reporting preference:', error);
          setCrashReportingEnabled(errorTracking.getConfig().enabled);
        }
      }
    };
    void loadPreference();

    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleCrashReporting = useCallback(async (enabled: boolean) => {
    setSavingCrashReporting(true);
    try {
      await invoke('set_user_preference', {
        key: 'crash_reporting_enabled',
        value: enabled.toString(),
        category: 'privacy',
        dataType: 'boolean',
        description: 'Enable automatic crash reporting via Sentry',
      });
      errorTracking.updateConfig({ enabled });
      setCrashReportingEnabled(enabled);
    } catch (error) {
      console.error('Failed to save crash reporting preference:', error);
    } finally {
      setSavingCrashReporting(false);
    }
  }, []);

  const exportSuccessTimerRef = useRef<number | null>(null);
  const exportErrorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (exportSuccessTimerRef.current) {
        window.clearTimeout(exportSuccessTimerRef.current);
      }
      if (exportErrorTimerRef.current) {
        window.clearTimeout(exportErrorTimerRef.current);
      }
    };
  }, []);

  const handleExportData = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      const exportData = await invoke<string>('export_user_data');

      const savePath = await save({
        defaultPath: `agi-workforce-export-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          {
            name: 'JSON',
            extensions: ['json'],
          },
        ],
      });

      if (savePath) {
        await writeTextFile(savePath, exportData);
        setExportSuccess(true);
        if (exportSuccessTimerRef.current) {
          window.clearTimeout(exportSuccessTimerRef.current);
        }
        exportSuccessTimerRef.current = window.setTimeout(() => setExportSuccess(false), 5000);
      }
    } catch (error) {
      console.error('Failed to export data:', error);
      setExportError(getSimpleErrorMessage(error));
      if (exportErrorTimerRef.current) {
        window.clearTimeout(exportErrorTimerRef.current);
      }
      exportErrorTimerRef.current = window.setTimeout(() => setExportError(null), 5000);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Data & Privacy</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your data, privacy settings, and GDPR compliance
      </p>

      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-primary/10 p-3">
              <Download className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-2">Export Your Data</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Download all your conversations, messages, and settings in JSON format. This
                includes all data stored locally on your device.
              </p>
              <Button onClick={handleExportData} disabled={exporting} size="sm">
                {exporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export Data
                  </>
                )}
              </Button>
              {exportSuccess && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  <span>Data exported successfully!</span>
                </div>
              )}
              {exportError && (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
                  <X className="h-4 w-4" />
                  <span>{exportError}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h4 className="font-semibold mb-2">Data Storage</h4>
          <p className="text-sm text-muted-foreground mb-2">
            All your data is stored locally on your device at:
          </p>
          <code className="block rounded bg-secondary px-3 py-2 text-xs font-mono">
            {typeof window !== 'undefined' && navigator.platform.startsWith('Win')
              ? '%APPDATA%\\AGI Workforce\\'
              : '~/.local/share/agi-workforce/'}
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            Integration credentials (GitHub tokens, MCP server keys, etc.) are stored securely in an
            encrypted local database.
          </p>
        </div>

        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-red-500/10 p-3">
              <Database className="h-6 w-6 text-red-500" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-2 text-red-600 dark:text-red-400">
                Clear Local Storage
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Reset the application to its initial state. This will clear all chat history,
                settings, and cached data. This action cannot be undone.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (
                    confirm(
                      'Are you sure you want to clear all local storage? This will reset the app and reload the window.',
                    )
                  ) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
              >
                Clear All Data
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h4 className="font-semibold mb-2">Privacy & Security</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>Chat history and settings are stored locally on your device</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>Integration credentials are encrypted and stored locally on your device</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>You can export your data at any time in standard JSON format</span>
            </li>
          </ul>
        </div>

        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <h4 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
            GDPR Compliance
          </h4>
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            AGI Workforce respects your right to data portability and privacy. Use the export
            feature above to exercise your GDPR rights. To delete all your data, simply uninstall
            the application and remove the data directory.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-semibold mb-2">Crash Reporting</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Help us improve AGI Workforce by automatically sending crash reports and error
                diagnostics. Reports include stack traces and system information but never include
                your conversations, API keys, or personal data.
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground mb-3">
                <li>Error messages and stack traces</li>
                <li>Operating system and app version</li>
                <li>Memory and performance metrics</li>
                <li>NO personal data, API keys, or conversation content</li>
              </ul>
            </div>
            <div className="ml-4">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={crashReportingEnabled}
                  disabled={savingCrashReporting}
                  onChange={(e) => void handleToggleCrashReporting(e.target.checked)}
                />
                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-hidden peer-focus:ring-2 peer-focus:ring-primary peer-focus:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"></div>
              </label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {crashReportingEnabled
              ? 'Crash reporting is enabled. Thank you for helping us improve!'
              : 'Crash reporting is disabled. You can enable it anytime.'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
