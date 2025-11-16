import { useCallback, useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  Key,
  Settings2,
  Monitor,
  Shield,
  Download,
  Users,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { Label } from '../ui/Label';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import {
  useSettingsStore,
  type Provider,
  createDefaultLLMConfig,
  createDefaultWindowPreferences,
} from '../../stores/settingsStore';
import { cn } from '../../lib/utils';
import { EmployeesPage } from '../../pages/EmployeesPage';
import { FavoriteModelsSelector } from './FavoriteModelsSelector';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface APIKeyFieldProps {
  provider: Provider;
  label: string;
  placeholder: string;
}

function APIKeyField({ provider, label, placeholder }: APIKeyFieldProps) {
  const { apiKeys, setAPIKey, testAPIKey, loading } = useSettingsStore();
  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    setLocalKey(apiKeys[provider as keyof typeof apiKeys] || '');
  }, [apiKeys, provider]);

  const handleSave = async () => {
    if (!localKey.trim()) return;
    try {
      await setAPIKey(provider, localKey.trim());
      setTestResult('success');
      setTimeout(() => setTestResult(null), 3000);
    } catch (error) {
      setTestResult('error');
      setTimeout(() => setTestResult(null), 3000);
    }
  };

  const handleTest = async () => {
    if (!localKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const success = await testAPIKey(provider);
      setTestResult(success ? 'success' : 'error');
      setTimeout(() => setTestResult(null), 3000);
    } catch (error) {
      setTestResult('error');
      setTimeout(() => setTestResult(null), 3000);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={provider}>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={provider}
            type={showKey ? 'text' : 'password'}
            placeholder={placeholder}
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={
            loading || !localKey.trim() || localKey === apiKeys[provider as keyof typeof apiKeys]
          }
        >
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={testing || !localKey.trim()}
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
        </Button>
        {testResult && (
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-md',
              testResult === 'success'
                ? 'bg-green-500/20 text-green-500'
                : 'bg-red-500/20 text-red-500',
            )}
          >
            {testResult === 'success' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Your API key is securely stored in the system keyring
      </p>
    </div>
  );
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const {
    llmConfig,
    windowPreferences,
    setDefaultProvider,
    setTemperature,
    setMaxTokens,
    setDefaultModel,
    setTheme,
    setStartupPosition,
    setDockOnStartup,
    loadSettings,
    saveSettings,
    loading,
    error,
  } = useSettingsStore();

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
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Settings</DialogTitle>
          <DialogDescription>
            Configure your API keys, LLM preferences, and application settings
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && !llmConfig ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="api-keys" className="mt-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="api-keys" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                API Keys
              </TabsTrigger>
              <TabsTrigger value="llm-config" className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                LLM Configuration
              </TabsTrigger>
              <TabsTrigger value="agent-library" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Agent Library
              </TabsTrigger>
              <TabsTrigger value="window" className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                Window
              </TabsTrigger>
              <TabsTrigger value="data-privacy" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Data & Privacy
              </TabsTrigger>
            </TabsList>

            <TabsContent value="api-keys" className="space-y-6 pt-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">API Keys</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Configure your API keys for different LLM providers. Keys are stored securely in
                  your system keyring.
                </p>

                <div className="space-y-6">
                  <APIKeyField provider="openai" label="OpenAI API Key" placeholder="sk-..." />

                  <APIKeyField
                    provider="anthropic"
                    label="Anthropic API Key"
                    placeholder="sk-ant-..."
                  />

                  <APIKeyField provider="google" label="Google AI API Key" placeholder="AIza..." />

                  <APIKeyField provider="xai" label="XAI API Key" placeholder="xai-..." />

                  <APIKeyField provider="deepseek" label="DeepSeek API Key" placeholder="sk-..." />

                  <APIKeyField provider="qwen" label="Qwen API Key" placeholder="sk-..." />

                  <APIKeyField provider="mistral" label="Mistral API Key" placeholder="..." />

                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-primary/10 p-2">
                        <Key className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">Ollama (Local)</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Ollama runs locally and doesn&apos;t require an API key. Make sure Ollama
                          is running on http://localhost:11434
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="llm-config" className="space-y-6 pt-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">LLM Configuration</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Configure default settings for language model interactions
                </p>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="defaultProvider">Default Provider</Label>
                    <Select
                      value={resolvedLLMConfig.defaultProvider}
                      onValueChange={(value) => setDefaultProvider(value as Provider)}
                    >
                      <SelectTrigger id="defaultProvider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="google">Google AI</SelectItem>
                        <SelectItem value="ollama">Ollama (Local)</SelectItem>
                        <SelectItem value="xai">XAI (Grok)</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="qwen">Qwen (Alibaba)</SelectItem>
                        <SelectItem value="mistral">Mistral AI</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The system will automatically fall back to other providers if this one fails
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="openaiModel">OpenAI Model</Label>
                      <Select
                        value={resolvedLLMConfig.defaultModels.openai}
                        onValueChange={(value) => setDefaultModel('openai', value)}
                      >
                        <SelectTrigger id="openaiModel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                          <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                          <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="anthropicModel">Anthropic Model</Label>
                      <Select
                        value={resolvedLLMConfig.defaultModels.anthropic}
                        onValueChange={(value) => setDefaultModel('anthropic', value)}
                      >
                        <SelectTrigger id="anthropicModel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="claude-3-5-sonnet-20241022">
                            Claude 3.5 Sonnet
                          </SelectItem>
                          <SelectItem value="claude-3-opus-20240229">Claude 3 Opus</SelectItem>
                          <SelectItem value="claude-3-haiku-20240307">Claude 3 Haiku</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="googleModel">Google AI Model</Label>
                      <Select
                        value={resolvedLLMConfig.defaultModels.google}
                        onValueChange={(value) => setDefaultModel('google', value)}
                      >
                        <SelectTrigger id="googleModel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                          <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ollamaModel">Ollama Model</Label>
                      <Select
                        value={resolvedLLMConfig.defaultModels.ollama}
                        onValueChange={(value) => setDefaultModel('ollama', value)}
                      >
                        <SelectTrigger id="ollamaModel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="llama3.3">Llama 3.3</SelectItem>
                          <SelectItem value="llama3">Llama 3</SelectItem>
                          <SelectItem value="qwen2.5">Qwen 2.5</SelectItem>
                          <SelectItem value="deepseek-coder">DeepSeek Coder</SelectItem>
                          <SelectItem value="codellama">Code Llama</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="xaiModel">XAI Model</Label>
                      <Select
                        value={resolvedLLMConfig.defaultModels.xai}
                        onValueChange={(value) => setDefaultModel('xai', value)}
                      >
                        <SelectTrigger id="xaiModel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="grok-4">Grok 4</SelectItem>
                          <SelectItem value="grok-3">Grok 3</SelectItem>
                          <SelectItem value="grok-2">Grok 2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="deepseekModel">DeepSeek Model</Label>
                      <Select
                        value={resolvedLLMConfig.defaultModels.deepseek}
                        onValueChange={(value) => setDefaultModel('deepseek', value)}
                      >
                        <SelectTrigger id="deepseekModel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deepseek-chat">DeepSeek V3.2</SelectItem>
                          <SelectItem value="deepseek-coder">DeepSeek Coder V2</SelectItem>
                          <SelectItem value="deepseek-reasoner">DeepSeek Reasoner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="qwenModel">Qwen Model</Label>
                      <Select
                        value={resolvedLLMConfig.defaultModels.qwen}
                        onValueChange={(value) => setDefaultModel('qwen', value)}
                      >
                        <SelectTrigger id="qwenModel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qwen-max">Qwen 2.5 Max</SelectItem>
                          <SelectItem value="qwen-plus">Qwen 2.5 Plus</SelectItem>
                          <SelectItem value="qwen-coder">Qwen 3 Coder</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mistralModel">Mistral Model</Label>
                      <Select
                        value={resolvedLLMConfig.defaultModels.mistral}
                        onValueChange={(value) => setDefaultModel('mistral', value)}
                      >
                        <SelectTrigger id="mistralModel">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mistral-large-latest">Mistral Large 2</SelectItem>
                          <SelectItem value="codestral-latest">Codestral</SelectItem>
                          <SelectItem value="mistral-small-latest">Mistral Small</SelectItem>
                        </SelectContent>
                      </Select>
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

                  {/* Favorite Models Selector */}
                  <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                    <FavoriteModelsSelector />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="agent-library" className="space-y-6 pt-6">
              <div className="h-[600px]">
                <EmployeesPage />
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
                      onValueChange={(value) => setStartupPosition(value as 'center' | 'remember')}
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
          </Tabs>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveSettings}>Save Changes</Button>
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

  // Load crash reporting preference
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const result = await invoke<{ value: string } | null>('get_user_preference', {
          key: 'crash_reporting_enabled',
        });
        if (result) {
          setCrashReportingEnabled(result.value === 'true');
        }
      } catch (error) {
        console.error('Failed to load crash reporting preference:', error);
      }
    };
    void loadPreference();
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

  const handleExportData = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      // Get export data from backend
      const exportData = await invoke<string>('export_user_data');

      // Show save dialog
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
        // Write to file
        await writeTextFile(savePath, exportData);
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 5000);
      }
    } catch (error) {
      console.error('Failed to export data:', error);
      setExportError(error instanceof Error ? error.message : 'Failed to export data');
      setTimeout(() => setExportError(null), 5000);
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
            Your API keys are stored securely in your system keyring, separate from the database.
          </p>
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
              <span>API keys are encrypted and stored in your system keyring</span>
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
                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary peer-focus:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"></div>
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
