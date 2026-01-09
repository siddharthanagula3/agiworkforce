import { invoke } from '@/lib/tauri-mock';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  Activity,
  Check,
  Database,
  Download,
  Github,
  Loader2,
  Monitor,
  Settings2,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { MODEL_PRESETS, PROVIDER_LABELS } from '../../constants/llm';

import {
  createDefaultLLMConfig,
  createDefaultWindowPreferences,
  useSettingsStore,
  type Provider,
  type TaskCategory,
} from '../../stores/settingsStore';
import { ResourceMonitor } from '../ResourceMonitor';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { FavoriteModelsSelector } from './FavoriteModelsSelector';
import { AllowedDirectoriesSettings } from './AllowedDirectoriesSettings';
import { CustomInstructionsSettings } from './CustomInstructionsSettings';
import { UpdateSettings } from './UpdateSettings';
import { GitHubTokenConfig } from './GitHubTokenConfig';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  // Use individual selectors to prevent re-renders on unrelated state changes
  // Use useShallow for object selectors to prevent re-renders from reference changes
  const llmConfig = useSettingsStore(useShallow((state) => state.llmConfig));
  const windowPreferences = useSettingsStore(useShallow((state) => state.windowPreferences));
  const setTemperature = useSettingsStore((state) => state.setTemperature);
  const setMaxTokens = useSettingsStore((state) => state.setMaxTokens);
  const setDefaultModel = useSettingsStore((state) => state.setDefaultModel);
  const setTaskRouting = useSettingsStore((state) => state.setTaskRouting);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setStartupPosition = useSettingsStore((state) => state.setStartupPosition);
  const setDockOnStartup = useSettingsStore((state) => state.setDockOnStartup);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const saveSettings = useSettingsStore((state) => state.saveSettings);
  const loading = useSettingsStore((state) => state.loading);
  const error = useSettingsStore((state) => state.error);

  const resolvedLLMConfig = llmConfig ?? createDefaultLLMConfig();
  const resolvedWindowPreferences = windowPreferences ?? createDefaultWindowPreferences();

  useEffect(() => {
    if (open) {
      loadSettings().catch((err) => {
        console.error('Failed to load settings:', err);
      });
    }
  }, [open, loadSettings]);

  const handleSaveSettings = async () => {
    try {
      await saveSettings();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
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
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="llm-config" className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Models
                </TabsTrigger>
                <TabsTrigger value="instructions" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Instructions
                </TabsTrigger>
                <TabsTrigger value="filesystem" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Filesystem
                </TabsTrigger>
                <TabsTrigger value="integrations" className="flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  Integrations
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
                  <h3 className="text-lg font-semibold mb-4">LLM Configuration</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Configure default settings for language model interactions
                  </p>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="defaultProvider">Default Provider</Label>
                      <Select value="managed_cloud" disabled={true} onValueChange={() => {}}>
                        <SelectTrigger id="defaultProvider">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="managed_cloud">Managed Cloud (Vercel/Pro)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        All models are managed via the cloud infrastructure (Vercel Env)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="managedModel">Primary Model</Label>
                      <Select
                        value={
                          resolvedLLMConfig.defaultModels.managed_cloud || 'managed-cloud-auto'
                        }
                        onValueChange={(value) => setDefaultModel('managed_cloud', value)}
                      >
                        <SelectTrigger id="managedModel">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          <SelectItem value="managed-cloud-auto">Auto (Best Model)</SelectItem>
                          {Object.entries(MODEL_PRESETS).map(([provider, models]) => {
                            if (provider === 'managed_cloud' || provider === 'ollama') return null;
                            return (
                              <div key={provider}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground opacity-50">
                                  {PROVIDER_LABELS[provider as Provider]}
                                </div>
                                {models.map((model) => (
                                  <SelectItem key={model.value} value={model.value}>
                                    {model.label}
                                  </SelectItem>
                                ))}
                              </div>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Choose which model to use via the Managed Cloud.
                      </p>
                    </div>

                    <div className="space-y-3 rounded-lg border border-muted/30 p-4">
                      <div>
                        <h4 className="text-sm font-semibold">Task-aware routing</h4>
                        <p className="text-xs text-muted-foreground">
                          Choose defaults per task type. You can override per request in chat.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(
                          [
                            'search',
                            'code',
                            'docs',
                            'chat',
                            'vision',
                            'image',
                            'video',
                          ] as TaskCategory[]
                        ).map((category) => {
                          const routing = resolvedLLMConfig.taskRouting?.[category];
                          const currentModel =
                            routing?.model ||
                            resolvedLLMConfig.defaultModels.managed_cloud ||
                            'managed-cloud-auto';

                          return (
                            <div key={category} className="space-y-2">
                              <Label className="capitalize">{category}</Label>
                              <div className="flex gap-2">
                                {/* Hidden Provider Selector - Always Managed Cloud */}
                                <Select
                                  value={currentModel}
                                  onValueChange={(value) =>
                                    setTaskRouting(category, 'managed_cloud', value)
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select model" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[300px]">
                                    <SelectItem value="managed-cloud-auto">Auto</SelectItem>
                                    {Object.entries(MODEL_PRESETS).map(([provider, models]) => {
                                      if (provider === 'managed_cloud' || provider === 'ollama')
                                        return null;
                                      return (
                                        <div key={provider}>
                                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground opacity-50">
                                            {PROVIDER_LABELS[provider as Provider]}
                                          </div>
                                          {models.map((model) => (
                                            <SelectItem key={model.value} value={model.value}>
                                              {model.label}
                                            </SelectItem>
                                          ))}
                                        </div>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="temperature">
                        Temperature: {resolvedLLMConfig.temperature.toFixed(1)}
                      </Label>
                      <input
                        id="temperature"
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={resolvedLLMConfig.temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Lower values are more focused and deterministic. Higher values are more
                        creative.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maxTokens">Max Tokens</Label>
                      <Input
                        id="maxTokens"
                        type="number"
                        min="256"
                        max="32768"
                        step="256"
                        value={resolvedLLMConfig.maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum number of tokens to generate in responses
                      </p>
                    </div>

                    {}
                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                      <FavoriteModelsSelector />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="instructions" className="space-y-6 pt-6">
                <CustomInstructionsSettings />
              </TabsContent>

              <TabsContent value="filesystem" className="space-y-6 pt-6">
                <AllowedDirectoriesSettings />
              </TabsContent>

              <TabsContent value="integrations" className="space-y-6 pt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Integrations</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Configure external service integrations and credentials
                  </p>
                  <GitHubTokenConfig />
                </div>
              </TabsContent>

              <TabsContent value="window" className="space-y-6 pt-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Window Preferences</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Customize window behavior and appearance
                  </p>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="theme">Theme</Label>
                      <Select
                        value={resolvedWindowPreferences.theme}
                        onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
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
                      <Label htmlFor="startupPosition">Startup Position</Label>
                      <Select
                        value={resolvedWindowPreferences.startupPosition}
                        onValueChange={(value) =>
                          setStartupPosition(value as 'center' | 'remember')
                        }
                      >
                        <SelectTrigger id="startupPosition">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="center">Center Screen</SelectItem>
                          <SelectItem value="remember">Remember Last Position</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dockOnStartup">Dock on Startup</Label>
                      <Select
                        value={resolvedWindowPreferences.dockOnStartup || 'none'}
                        onValueChange={(value) =>
                          setDockOnStartup(value === 'none' ? null : (value as 'left' | 'right'))
                        }
                      >
                        <SelectTrigger id="dockOnStartup">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Don&apos;t Dock</SelectItem>
                          <SelectItem value="left">Dock Left</SelectItem>
                          <SelectItem value="right">Dock Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="data-privacy" className="space-y-6 pt-6">
                <DataPrivacyTab />
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
                  <UpdateSettings />
                </div>
              </TabsContent>
            </Tabs>
          )}

          <div className="flex justify-end gap-3 mt-6 pt-6 border-t px-6 pb-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings}>Save Changes</Button>
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
  const [crashReportingEnabled, setCrashReportingEnabled] = useState(true);
  const [savingCrashReporting, setSavingCrashReporting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadPreference = async () => {
      try {
        const result = await invoke<{ value: string } | null>('get_user_preference', {
          key: 'crash_reporting_enabled',
        });
        if (result && mounted) {
          setCrashReportingEnabled(result.value === 'true');
        }
      } catch (error) {
        if (mounted) {
          console.error('Failed to load crash reporting preference:', error);
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
      setExportError(error instanceof Error ? error.message : 'Failed to export data');
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
            Integration credentials (GitHub tokens, MCP server keys, etc.) are stored securely in
            your system keyring, separate from the database.
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
          <h4 className="font-semibold mb-2">Privacy First</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>No data is sent to AGI Workforce servers</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>All processing happens locally or with your chosen AI providers</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>You control which AI providers to use and when</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>Integration credentials are encrypted and stored in your system keyring</span>
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
