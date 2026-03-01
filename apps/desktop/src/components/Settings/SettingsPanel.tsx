import { invoke } from '@/lib/tauri-mock';
import { getSimpleErrorMessage } from '@/lib/errorMessages';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  Activity,
  Bot,
  Check,
  Database,
  Download,
  Github,
  Loader2,
  Monitor,
  Plug,
  Puzzle,
  Server,
  Settings2,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  createDefaultLLMConfig,
  createDefaultWindowPreferences,
  useSettingsStore,
  type Language,
  type GlobalHotkeyPreferences,
} from '../../stores/settingsStore';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { useModelStore } from '../../stores/modelStore';
import { errorTracking } from '../../services/errorTracking';
import { ResourceMonitor } from '../ResourceMonitor';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
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

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  // Use individual selectors to prevent re-renders on unrelated state changes
  // Use useShallow for object selectors to prevent re-renders from reference changes
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

  // Ollama status from model store
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

  // SET-001 fix: Derive ollamaEnabled from persisted settings, not local state
  const ollamaEnabled = Boolean(resolvedLLMConfig.defaultModels?.ollama);

  // SET-001 fix: Handler that persists Ollama enabled state
  const handleOllamaEnabledChange = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        // When enabling, set the selected model (or first available model)
        const modelToSet = selectedOllamaModel || ollamaModels[0] || 'llama3';
        setDefaultModel('ollama', modelToSet);
        setSelectedOllamaModel(modelToSet);
      } else {
        // When disabling, clear the Ollama model
        setDefaultModel('ollama', '');
      }
    },
    [selectedOllamaModel, ollamaModels, setDefaultModel],
  );

  // SET-001 fix: Handler that persists selected Ollama model
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
      // Check Ollama status when panel opens
      setCheckingOllama(true);
      checkProviderStatus('ollama')
        .then(() => {
          // Try to get available Ollama models
          invoke<string[]>('llm_get_ollama_models')
            .then((models) => {
              setOllamaModels(models || []);
              // SET-001 fix: Initialize from persisted settings first, then fallback to first available
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

  // Track if settings have been modified (for warning on cancel)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // SET-004: Wrapped handlers that track unsaved changes
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

  // Reset hasUnsavedChanges when panel opens (fresh state)
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

  // SET-004: Handler for canceling - reload settings from backend to discard changes
  const handleCancel = async () => {
    if (hasUnsavedChanges) {
      // Reload settings from backend to discard local changes
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
      <DialogContent className="max-w-7xl max-h-[90vh] w-full p-0 overflow-hidden">
        <div className="h-[90vh] overflow-y-auto">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl font-bold">Settings</DialogTitle>
            <DialogDescription>
              Configure LLM preferences, integrations, and application settings
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mx-6 mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading && !llmConfig ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="llm-config" className="mt-6 px-6">
              <TabsList className="grid w-full grid-cols-10">
                <TabsTrigger value="llm-config" className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Models
                </TabsTrigger>
                <TabsTrigger value="instructions" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Instructions
                </TabsTrigger>
                <TabsTrigger value="agents" className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Agents
                </TabsTrigger>
                <TabsTrigger value="filesystem" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Filesystem
                </TabsTrigger>
                <TabsTrigger value="integrations" className="flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  Integrations
                </TabsTrigger>
                <TabsTrigger value="connectors" className="flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  Connectors
                </TabsTrigger>
                <TabsTrigger value="skills-plugins" className="flex items-center gap-2">
                  <Puzzle className="h-4 w-4" />
                  Skills
                </TabsTrigger>
                <TabsTrigger value="window" className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Window
                </TabsTrigger>
                <TabsTrigger value="data-privacy" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Privacy
                </TabsTrigger>
                <TabsTrigger value="system" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  System
                </TabsTrigger>
              </TabsList>

              <TabsContent value="llm-config" className="space-y-6 pt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">AI Provider</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Your AI requests are handled through your subscription plan
                  </p>

                  <div className="space-y-6">
                    {/* Ollama Local Option */}
                    <div className="rounded-lg border border-border bg-card p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="rounded-md bg-muted p-3">
                            <Server className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold mb-2">Local Ollama (Offline Mode)</h4>
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
                                  <div className="space-y-2">
                                    <Label htmlFor="ollamaModel" className="text-xs">
                                      Select Model
                                    </Label>
                                    <Select
                                      value={selectedOllamaModel}
                                      onValueChange={handleOllamaModelChange}
                                    >
                                      <SelectTrigger id="ollamaModel" className="h-8 text-xs">
                                        <SelectValue placeholder="Select an Ollama model" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ollamaModels.map((model) => (
                                          <SelectItem key={model} value={model} className="text-xs">
                                            {model}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <X className="h-3 w-3 text-orange-500" />
                                <span>
                                  Ollama not detected. Install from ollama.ai to use local models.
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <Switch
                            checked={ollamaEnabled}
                            onCheckedChange={handleOllamaEnabledChange}
                            disabled={!isOllamaAvailable}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Agent Mode Settings */}
                    <div className="rounded-lg border border-border bg-card p-6">
                      <h4 className="font-semibold mb-4">Agent Mode</h4>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="alwaysAgentMode">Always Use Agent Mode</Label>
                            <p className="text-xs text-muted-foreground">
                              When enabled, all messages will use AGI Workforce's automation
                              capabilities (file operations, web search, terminal, etc.). Otherwise,
                              tools are only used when an action is detected.
                            </p>
                          </div>
                          <Switch
                            id="alwaysAgentMode"
                            checked={chatPreferences.alwaysUseAgentMode}
                            onCheckedChange={handleAgentModeChange}
                          />
                        </div>

                        <div className="border-t border-border pt-4 flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="compactMode">Compact Mode</Label>
                            <p className="text-xs text-muted-foreground">
                              Show simple one-line status messages instead of detailed tool output
                              blocks.
                            </p>
                          </div>
                          <Switch
                            id="compactMode"
                            checked={chatPreferences.compactMode}
                            onCheckedChange={handleCompactModeChange}
                          />
                        </div>

                        <div className="border-t border-border pt-4 flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="promptCompletion">Prompt Completion</Label>
                            <p className="text-xs text-muted-foreground">
                              Show AI-powered ghost-text suggestions as you type.
                            </p>
                          </div>
                          <Switch
                            id="promptCompletion"
                            checked={chatPreferences.promptCompletionEnabled}
                            onCheckedChange={handlePromptCompletionChange}
                          />
                        </div>

                        <div className="border-t border-border pt-4 flex items-start justify-between gap-4">
                          <div className="space-y-0.5">
                            <Label htmlFor="autoApproveTools" className="flex items-center gap-2">
                              Auto-Approve All Tools
                              {chatPreferences.autoApproveTools && (
                                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                                  ACTIVE
                                </span>
                              )}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Skip all &quot;Allow this action?&quot; confirmation dialogs. Every
                              tool call (file writes, terminal commands, web access, etc.) is
                              automatically approved without asking.{' '}
                              <strong className="text-orange-600 dark:text-orange-400">
                                Use with caution.
                              </strong>
                            </p>
                          </div>
                          <Switch
                            id="autoApproveTools"
                            checked={chatPreferences.autoApproveTools}
                            onCheckedChange={handleAutoApproveToolsChange}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Generation Parameters */}
                <div className="border-t border-border pt-6">
                  <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <h4 className="font-semibold">Generation Parameters</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="temperature">
                          Temperature{' '}
                          <span className="text-xs text-muted-foreground">
                            ({resolvedLLMConfig.temperature.toFixed(1)})
                          </span>
                        </Label>
                        <input
                          id="temperature"
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={resolvedLLMConfig.temperature}
                          onChange={(e) => handleTemperatureChange(e.target.value)}
                          className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Precise (0)</span>
                          <span>Creative (2)</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="maxTokens">Max Tokens</Label>
                        <input
                          id="maxTokens"
                          type="number"
                          min="256"
                          max="200000"
                          step="256"
                          value={resolvedLLMConfig.maxTokens}
                          onChange={(e) => handleMaxTokensChange(e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <p className="text-xs text-muted-foreground">
                          Maximum tokens per response (256–200000)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Favorite Models */}
                <div className="border-t border-border pt-6">
                  <FavoriteModelsSelector />
                </div>

                {/* Custom Model Endpoints */}
                <div className="border-t border-border pt-6">
                  <CustomModelsSettings />
                </div>

                {/* Task Routing */}
                <div className="border-t border-border pt-6">
                  <TaskRoutingSettings />
                </div>

                {/* Intelligent Routing Info */}
                <div className="border-t border-border pt-6">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-6">
                    <h3 className="text-lg font-semibold mb-3">Intelligent Model Routing</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      We automatically route your requests to the optimal model based on multiple
                      factors:
                    </p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        <span>
                          <strong>Performance Benchmarks</strong> - Models are selected based on
                          proven performance metrics for each task type
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        <span>
                          <strong>Industry Standards</strong> - Following best practices for model
                          selection and task optimization
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        <span>
                          <strong>Subscription Tier</strong> - Access to models is determined by
                          your current plan
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        <span>
                          <strong>Cost Efficiency</strong> - Balancing quality with cost to maximize
                          your credit usage
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="instructions" className="space-y-6 pt-6">
                <CustomInstructionsSettings />
                <div className="border-t border-border pt-6">
                  <InstructionFilesSettings />
                </div>
              </TabsContent>

              <TabsContent value="agents" className="space-y-6 pt-6">
                <AgentsSettings />
              </TabsContent>

              <TabsContent value="filesystem" className="space-y-6 pt-6">
                <AllowedDirectoriesSettings />
              </TabsContent>

              <TabsContent value="integrations" className="space-y-6 pt-6">
                <ExtensionsSettings />
              </TabsContent>

              <TabsContent value="connectors" className="space-y-6 pt-6">
                <ConnectorsGallery />
              </TabsContent>

              <TabsContent value="skills-plugins" className="space-y-6 pt-6">
                <SkillsPluginsSettings />
              </TabsContent>

              <TabsContent value="window" className="space-y-6 pt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Window Preferences</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Customize window behavior and appearance
                  </p>

                  <div className="space-y-6">
                    {/* Global Hotkey */}
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
              </TabsContent>

              <TabsContent value="data-privacy" className="space-y-6 pt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Master Password</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Encrypt stored API keys and secrets with an Argon2id-derived master password.
                  </p>
                  <MasterPasswordSettings />
                </div>
                <div className="pt-6 border-t border-border">
                  <DataPrivacyTab />
                </div>
              </TabsContent>

              <TabsContent value="system" className="space-y-6 pt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">System Resources</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Monitor your system performance and resource usage
                  </p>
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
              </TabsContent>
            </Tabs>
          )}

          {/* TODO(release): Add Privacy Policy link -> https://agiworkforce.com/privacy */}
          {/* TODO(release): Add Terms of Service link -> https://agiworkforce.com/terms */}
          {/* TODO(release): Add Support link -> https://agiworkforce.com/support */}
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t px-6 pb-6">
            <Button variant="outline" onClick={() => void handleCancel()}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveSettings()} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
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
  // SET-007: Initialize from errorTracking service to ensure consistency
  const [crashReportingEnabled, setCrashReportingEnabled] = useState(() => {
    return errorTracking.getConfig().enabled;
  });
  const [savingCrashReporting, setSavingCrashReporting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadPreference = async () => {
      try {
        // Try to load from Tauri backend (source of truth)
        const result = await invoke<{ value: string } | null>('get_user_preference', {
          key: 'crash_reporting_enabled',
        });
        if (result && mounted) {
          const enabled = result.value === 'true';
          setCrashReportingEnabled(enabled);
          // SET-007: Sync with errorTracking service
          errorTracking.updateConfig({ enabled });
        }
      } catch (error) {
        if (mounted) {
          console.error('Failed to load crash reporting preference:', error);
          // Fall back to errorTracking service state
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
      // SET-007: Update both Tauri backend and errorTracking service
      await invoke('set_user_preference', {
        key: 'crash_reporting_enabled',
        value: enabled.toString(),
        category: 'privacy',
        dataType: 'boolean',
        description: 'Enable automatic crash reporting via Sentry',
      });
      // Sync with errorTracking service
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
                <li>• Error messages and stack traces</li>
                <li>• Operating system and app version</li>
                <li>• Memory and performance metrics</li>
                <li>• NO personal data, API keys, or conversation content</li>
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
