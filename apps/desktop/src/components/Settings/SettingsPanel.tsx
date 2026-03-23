import { invoke, isTauri, isCloudWeb } from '@/lib/tauri-mock';
import { analyticsDeleteAllData } from '@/api/analytics';
import { McpClient } from '@/api/mcp';
import { getSimpleErrorMessage } from '@/lib/errorMessages';
import { toast } from 'sonner';
import { validateUrl } from '@/utils/security';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  Bell,
  Check,
  Cloud,
  CreditCard,
  Database,
  Download,
  Loader2,
  Mic,
  Palette,
  Plug,
  Server,
  Settings2,
  Shield,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  createDefaultLLMConfig,
  createDefaultWindowPreferences,
  getDefaultGlobalHotkeyCombo,
  useSettingsStore,
  type Language,
  type GlobalHotkeyPreferences,
} from '../../stores/settingsStore';
import { LEGACY_TAB_MAP, type SettingsTab } from '../../stores/settingsDialogStore';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { useModelStore } from '../../stores/modelStore';
import { errorTracking } from '../../services/errorTracking';
import type { NotificationSettings } from '../../hooks/useNotifications';
import { ResourceMonitor } from '../ResourceMonitor';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { AllowedDirectoriesSettings } from './AllowedDirectoriesSettings';
import { AutomationPermissionsSettings } from './AutomationPermissionsSettings';
import { CacheManagement } from './CacheManagement';
import { CustomInstructionsSettings } from './CustomInstructionsSettings';
import { MasterPasswordSettings } from './MasterPasswordSettings';
import { UpdateSettings } from './UpdateSettings';
import { ExtensionsSettings } from './ExtensionsSettings';
import { AgentsSettings } from './AgentsSettings';
import { InstructionFilesSettings } from './InstructionFilesSettings';
import { CustomModelsSettings } from './CustomModelsSettings';
import { SkillsPluginsSettings } from './SkillsPluginsSettings';
import { MCPServerSettings } from './MCPServerSettings';
import { MCPToolsSettings } from './MCPToolsSettings';
import { FavoriteModelsSelector } from './FavoriteModelsSelector';
import { ConnectorGallery } from '../Connectors/ConnectorGallery';
import { ConnectorHealthDashboard } from '../Connectors/ConnectorHealthDashboard';
import { useConnectorsStore } from '../../stores/connectorsStore';
import { VoiceSettings } from './VoiceSettings';
import { MemoryPanel } from '../Memory/MemoryPanel';
import { ResearchSettings } from './ResearchSettings';
import { ToolsPanel } from '../Tools/ToolsPanel';
import { KeybindingsSettings } from './KeybindingsSettings';
import { ThemeSettings } from './ThemeSettings';
import { TaskRoutingSettings } from './TaskRoutingSettings';
import { NotificationsSettings } from './NotificationsSettings';
import { AnalyticsSettings } from './AnalyticsSettings';
import { AccountSettings } from './AccountSettings';
import { FeaturesPrivacySettings } from './FeaturesPrivacySettings';
import { OAuthCredentialsPanel } from './OAuthCredentialsPanel';
import { SafetyPolicies } from '../Governance/SafetyPolicies';
import { AgentExecutionSettings } from './AgentExecutionSettings';
import { PersonalizationSettings } from './PersonalizationSettings';
import { TeamAccountSettings } from './TeamAccountSettings';
import { UsageDashboard } from './UsageDashboard';
import { useSimpleModeStore } from '../../stores/ui';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { cn } from '@/lib/utils';
import { useAppModeStore, selectMode, selectIsCloud } from '../../stores/appModeStore';

// ── Canonical tab IDs (10 tabs displayed in nav) ──────────────────────────────
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
  | 'voice';

/** Resolve any legacy alias to its canonical tab. */
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
  { key: 'mcp-skills', label: 'Customize', icon: Wrench },
  { key: 'connectors', label: 'Apps & Integrations', icon: Plug },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'voice', label: 'Voice', icon: Mic },
];

// ── Tabs that manage their own saves (no deferred Save/Cancel footer) ─────────
const SELF_SAVING_TABS = new Set<CanonicalTab>(['mcp-skills', 'connectors']);

// Web chat is cloud-only — no BYOK, no local LLMs, no voice
const WEB_HIDDEN_TABS = new Set<CanonicalTab>(['models-keys', 'voice']);
const visibleNav = isCloudWeb
  ? SETTINGS_NAV.filter((t) => !WEB_HIDDEN_TABS.has(t.key))
  : SETTINGS_NAV;

// ── BYOK providers ────────────────────────────────────────────────────────────
const BYOK_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', name: 'Google (Gemini)', placeholder: 'AIza...' },
  { id: 'xai', name: 'xAI (Grok)', placeholder: 'xai-...' },
  { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'mistral', name: 'Mistral', placeholder: 'API key...' },
  { id: 'perplexity', name: 'Perplexity', placeholder: 'pplx-...' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...' },
  { id: 'nvidia_nim', name: 'NVIDIA NIM', placeholder: 'nvapi-...' },
] as const;

// ── BYOK API Keys section ─────────────────────────────────────────────────────
function BYOKApiKeysSection() {
  const [keys, setKeys] = React.useState<Record<string, string>>({});
  const [statuses, setStatuses] = React.useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const savedTimersRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    const timers = savedTimersRef.current;
    return () => {
      for (const timerId of Object.values(timers)) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  const handleSave = React.useCallback(
    async (providerId: string) => {
      const key = keys[providerId]?.trim();
      if (!key) return;
      setStatuses((s) => ({ ...s, [providerId]: 'saving' }));
      setErrors((e) => ({ ...e, [providerId]: '' }));
      try {
        await McpClient.saveApiKey(providerId, key);
        setStatuses((s) => ({ ...s, [providerId]: 'saved' }));
        setKeys((k) => ({ ...k, [providerId]: '' }));
        if (savedTimersRef.current[providerId]) {
          window.clearTimeout(savedTimersRef.current[providerId]);
        }
        savedTimersRef.current[providerId] = window.setTimeout(() => {
          setStatuses((s) => ({ ...s, [providerId]: 'idle' }));
          delete savedTimersRef.current[providerId];
        }, 2500);
      } catch (err) {
        setStatuses((s) => ({ ...s, [providerId]: 'error' }));
        setErrors((e) => ({ ...e, [providerId]: String(err) }));
      }
    },
    [keys],
  );

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">API Keys (BYOK)</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Enter your own API keys for each AI provider. Keys are encrypted and stored locally.
      </p>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {BYOK_PROVIDERS.map(({ id, name, placeholder }) => {
          const status = statuses[id] ?? 'idle';
          return (
            <div key={id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-36 shrink-0 text-sm font-medium">{name}</span>
              <input
                type="password"
                value={keys[id] ?? ''}
                onChange={(e) => setKeys((k) => ({ ...k, [id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSave(id);
                }}
                placeholder={placeholder}
                className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="button"
                disabled={!keys[id]?.trim() || status === 'saving'}
                onClick={() => void handleSave(id)}
                className="shrink-0 h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {status === 'saving' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : status === 'saved' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  'Save'
                )}
              </button>
              {errors[id] && <p className="text-xs text-destructive mt-1">{errors[id]}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stable-serialize helper ───────────────────────────────────────────────────
function stableSerialize(value: unknown): string {
  const sortRecursively = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(sortRecursively);
    }
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

// ── Restart Onboarding section ────────────────────────────────────────────────
function RestartOnboardingSection() {
  const handleRestart = () => {
    useSimpleModeStore.setState({ onboardingCompleted: false });
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Onboarding</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Re-run the first-run setup wizard to reconfigure API keys, model selection, and tour.
      </p>
      <Button variant="outline" size="sm" onClick={handleRestart}>
        Restart Onboarding Wizard
      </Button>
    </div>
  );
}

// ── Data & Privacy section (inline component) ─────────────────────────────────
function DataPrivacySection() {
  const chatStorageMode = useSettingsStore((state) => state.chatPreferences.chatStorageMode);
  const setChatStorageMode = useSettingsStore((state) => state.setChatStorageMode);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [clearingData, setClearingData] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
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
      } catch (err) {
        if (mounted) {
          console.error('Failed to load crash reporting preference:', err);
          setCrashReportingEnabled(errorTracking.getConfig().enabled);
        }
      }
    };
    void loadPreference();
    return () => {
      mounted = false;
    };
  }, []);

  const handleClearAllData = async () => {
    const confirmed = confirm(
      'Are you sure you want to clear all local data? This will delete chat history, settings, cached data, and encrypted local credentials, then reload the app.',
    );
    if (!confirmed) return;

    setClearingData(true);
    setClearError(null);

    try {
      const results = await Promise.allSettled([
        invoke('clear_local_database'),
        invoke('cache_clear_all'),
        invoke('settings_v2_clear_cache'),
        analyticsDeleteAllData(),
      ]);

      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => getSimpleErrorMessage(result.reason));

      if (failures.length > 0) {
        throw new Error(failures.join('; '));
      }

      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    } catch (err) {
      setClearError(getSimpleErrorMessage(err));
    } finally {
      setClearingData(false);
    }
  };

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
    } catch (err) {
      console.error('Failed to save crash reporting preference:', err);
    } finally {
      setSavingCrashReporting(false);
    }
  }, []);

  const exportSuccessTimerRef = useRef<number | null>(null);
  const exportErrorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (exportSuccessTimerRef.current) window.clearTimeout(exportSuccessTimerRef.current);
      if (exportErrorTimerRef.current) window.clearTimeout(exportErrorTimerRef.current);
    };
  }, []);

  const handleExportData = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      const exportData = await invoke<string>('export_user_data');

      // Web fallback: use blob download
      if (!isTauri) {
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agi-workforce-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setExportSuccess(true);
        if (exportSuccessTimerRef.current) window.clearTimeout(exportSuccessTimerRef.current);
        exportSuccessTimerRef.current = window.setTimeout(() => setExportSuccess(false), 5000);
      } else {
        const savePath = await save({
          defaultPath: `agi-workforce-export-${new Date().toISOString().split('T')[0]}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (savePath) {
          await writeTextFile(savePath, exportData);
          setExportSuccess(true);
          if (exportSuccessTimerRef.current) window.clearTimeout(exportSuccessTimerRef.current);
          exportSuccessTimerRef.current = window.setTimeout(() => setExportSuccess(false), 5000);
        }
      }
    } catch (err) {
      console.error('Failed to export data:', err);
      setExportError(getSimpleErrorMessage(err));
      if (exportErrorTimerRef.current) window.clearTimeout(exportErrorTimerRef.current);
      exportErrorTimerRef.current = window.setTimeout(() => setExportError(null), 5000);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Data &amp; Privacy</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your data, privacy settings, and GDPR compliance
      </p>

      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-md bg-muted p-3">
              <Download className="h-6 w-6 text-muted-foreground" />
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
          {isTauri ? (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                All your data is stored locally on your device at:
              </p>
              <code className="block rounded bg-secondary px-3 py-2 text-xs font-mono">
                {typeof window !== 'undefined' && navigator.platform.startsWith('Win')
                  ? '%APPDATA%\\AGI Workforce\\'
                  : '~/.local/share/agi-workforce/'}
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Integration credentials (GitHub tokens, MCP server keys, etc.) are stored securely
                in an encrypted local database.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Stored securely in the cloud. Data is encrypted at rest and in transit.
            </p>
          )}
        </div>

        {!isCloudWeb && (
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div>
              <h4 className="font-semibold mb-1">Chat History Storage</h4>
              <p className="text-sm text-muted-foreground">
                Choose where your chat history is kept. Local storage never leaves your device.
                Cloud sync backs up your conversations to your account.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label htmlFor="chatStorageMode" className="text-sm font-medium">
                  Sync chat history to cloud
                </label>
                <p className="text-xs text-muted-foreground">
                  {chatStorageMode === 'cloud'
                    ? 'Conversations are synced to your account after each message.'
                    : 'Conversations stay on this device only (default).'}
                </p>
              </div>
              <Switch
                id="chatStorageMode"
                checked={chatStorageMode === 'cloud'}
                onCheckedChange={(checked) => setChatStorageMode(checked ? 'cloud' : 'local')}
              />
            </div>
          </div>
        )}

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
                settings, cached data, and encrypted local credentials. This action cannot be
                undone.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleClearAllData()}
                disabled={clearingData}
              >
                {clearingData ? 'Clearing...' : 'Clear All Data'}
              </Button>
              {clearError && <p className="mt-3 text-sm text-red-600">{clearError}</p>}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h4 className="font-semibold mb-2">Privacy &amp; Security</h4>
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
                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-hidden peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700"></div>
              </label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {crashReportingEnabled
              ? 'Crash reporting is enabled. Thank you for helping us improve!'
              : 'Crash reporting is disabled. You can enable it anytime.'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This preference applies immediately and is not controlled by Save/Cancel.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── App Mode section (Local / Cloud toggle) ───────────────────────────────────
function AppModeSection() {
  const mode = useAppModeStore(selectMode);
  const isCloud = useAppModeStore(selectIsCloud);

  // Detect whether the user is signed in (planTier > free implies cloud auth)
  const planTier = useAppModeStore((state) => state.planTier);
  const isAuthenticated = planTier !== 'free';

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Mode</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Choose between fully local (offline, free) or cloud-connected (Pro features).
      </p>

      {/* Toggle buttons */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => useAppModeStore.getState().setMode('local')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            mode === 'local'
              ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50 border-emerald-500/30'
              : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <Shield className="h-4 w-4 shrink-0" />
          <span>Local</span>
          <span className="text-xs opacity-70">(Free)</span>
        </button>

        <button
          type="button"
          onClick={() => useAppModeStore.getState().setMode('cloud')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
            mode === 'cloud'
              ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50 border-blue-500/30'
              : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <Cloud className="h-4 w-4 shrink-0" />
          <span>Cloud</span>
          <span className="text-xs opacity-70">(Pro)</span>
        </button>
      </div>

      {/* Cloud-specific sub-panel */}
      {isCloud && !isAuthenticated && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
          <Cloud className="h-4 w-4 text-blue-400 shrink-0" />
          <p className="text-sm text-blue-400 flex-1">
            Sign in to unlock Cloud Mode and sync your conversations across devices.
          </p>
          <button
            type="button"
            onClick={() => toast.info('Sign-in flow coming soon.')}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50 hover:bg-blue-500/30 transition-colors"
          >
            Sign in to enable Cloud Mode
          </button>
        </div>
      )}

      {isCloud && isAuthenticated && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
          <Cloud className="h-4 w-4 text-blue-400 shrink-0" />
          <p className="text-sm text-blue-400 flex-1">
            Plan: <span className="font-semibold capitalize">{planTier}</span>{' '}
            <span className="opacity-70">($20/mo)</span>
          </p>
          <button
            type="button"
            onClick={() => toast.info('Billing portal coming soon.')}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50 hover:bg-blue-500/30 transition-colors"
          >
            Manage Billing &rarr;
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component props ──────────────────────────────────────────────────────
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

      // Web fallback: use blob download
      if (!isTauri) {
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agi-workforce-settings-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const savePath = await save({
        defaultPath: `agi-workforce-settings-${new Date().toISOString().split('T')[0]}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (savePath) {
        await writeTextFile(savePath, exportData);
      }
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
      if (ollamaEnabled) {
        setDefaultModel('ollama', model);
      }
      setHasUnsavedChanges(true);
    },
    [ollamaEnabled, setDefaultModel],
  );

  const loadNotificationSettings = useCallback(async (): Promise<NotificationSettings | null> => {
    setNotificationLoading(true);
    setNotificationError(null);
    try {
      const settings = await invoke<NotificationSettings>('notification_get_settings');
      setNotificationSettings(settings);
      return settings;
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
        (await invoke<string[]>('llm_get_ollama_models').catch(() => [] as string[])) || [];
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

  const buildCurrentSnapshot = useCallback((notifications: NotificationSettings | null) => {
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
      notifications,
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
  }, [
    open,
    buildCurrentSnapshot,
    loadNotificationSettings,
    loadSettings,
    notificationSettings,
    refreshOllamaState,
  ]);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<CanonicalTab>(() => {
    const resolved = resolveTab(initialTab);
    return isCloudWeb && WEB_HIDDEN_TABS.has(resolved) ? 'general' : resolved;
  });

  const openGovernanceWorkspace = useCallback(() => {
    onOpenChange(false);
    useUnifiedChatStore.getState().openSidecar('governance');
  }, [onOpenChange]);

  // Tabs that skip the deferred Save/Cancel footer
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
        await invoke('notification_set_settings', { settings: notificationSettings });
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

  // ── Tab content renderer ──────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      // ── 1. General (General + Keybindings) ─────────────────────────────
      case 'general':
        return (
          <>
            {isCloudWeb ? (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
                <Cloud className="h-4 w-4 text-blue-400 shrink-0" />
                <p className="text-sm text-blue-400">
                  You are using AGI Workforce Cloud. Models and billing are managed by your plan.
                </p>
              </div>
            ) : (
              <AppModeSection />
            )}

            {isTauri && (
              <div className="pt-6 border-t border-border">
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
                          placeholder={defaultGlobalHotkeyCombo}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use Tauri accelerator format, e.g.{' '}
                          <code className="rounded bg-muted px-1 py-0.5">
                            {defaultGlobalHotkeyCombo}
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
            )}

            {isTauri && (
              <div className="pt-6 border-t border-border">
                <h3 className="text-lg font-semibold mb-4">System Resources</h3>
                <ResourceMonitor showTools={true} />
              </div>
            )}

            {isTauri && (
              <div className="pt-6 border-t border-border">
                <h3 className="text-lg font-semibold mb-4">Agent Permissions</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  macOS system permissions required for agent mode automation.
                </p>
                <AutomationPermissionsSettings />
              </div>
            )}

            {isTauri && (
              <div className="pt-6 border-t border-border">
                <UpdateSettings />
              </div>
            )}

            <div className="pt-6 border-t border-border">
              <RestartOnboardingSection />
            </div>

            {/* Keybindings (merged from old 'keybindings' tab) */}
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Keybindings</h3>
              <KeybindingsSettings />
            </div>
          </>
        );

      // ── 2. Account (Account & Billing + Usage + Team & Devices) ───────
      case 'account':
        return (
          <>
            <AccountSettings />
            <div className="pt-6 border-t border-border">
              <UsageDashboard />
            </div>
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Team &amp; Devices</h3>
              <TeamAccountSettings />
            </div>
          </>
        );

      // ── 3. Appearance (Personalization + Themes) ───────────────────────
      case 'appearance':
        return (
          <>
            <PersonalizationSettings />
            <div className="pt-6 border-t border-border">
              <MemoryPanel />
            </div>
            <div className="pt-6 border-t border-border">
              <CustomInstructionsSettings />
            </div>
            <div className="pt-6 border-t border-border">
              <InstructionFilesSettings />
            </div>
            <div className="pt-6 border-t border-border">
              <AgentsSettings />
            </div>
            {/* Themes (merged from old 'themes' tab) */}
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Themes</h3>
              <ThemeSettings />
            </div>
          </>
        );

      // ── 4. Privacy (Privacy & Data + Analytics + Governance) ──────────
      case 'privacy':
        return (
          <>
            <div>
              <h3 className="text-lg font-semibold mb-1">Master Password</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Encrypt stored API keys and secrets with an Argon2id-derived master password.
              </p>
              <MasterPasswordSettings />
            </div>
            <div className="pt-6 border-t border-border">
              <DataPrivacySection />
            </div>
            <div className="pt-6 border-t border-border">
              <CacheManagement />
            </div>
            <div className="pt-6 border-t border-border">
              <AllowedDirectoriesSettings />
            </div>
            {/* Analytics (merged from old 'analytics' tab) */}
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Analytics</h3>
              <AnalyticsSettings />
            </div>
            {/* Governance (merged from old 'governance' tab) */}
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-1">Governance &amp; Compliance</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Governance now lives in a dedicated workspace. Keep policy controls here and open
                the right panel for approvals, audit events, and execution history.
              </p>
              <div className="rounded-lg border border-border bg-card/60 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h4 className="text-sm font-medium">Open governance workspace</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Review pending approvals, audit integrity, and tool history without
                      duplicating those views inside Settings.
                    </p>
                  </div>
                  <Button variant="outline" onClick={openGovernanceWorkspace}>
                    Open Workspace
                  </Button>
                </div>
              </div>
              <div className="pt-6">
                <SafetyPolicies />
              </div>
            </div>
          </>
        );

      // ── 5. Models & Keys (API Keys + Custom Models + Task Routing) ─────
      case 'models-keys':
        return (
          <>
            <BYOKApiKeysSection />

            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Local Models</h3>
              <div className="space-y-6">
                {/* Provider Mode */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Provider Mode</label>
                  <div className="flex gap-2">
                    {(['auto', 'local', 'cloud'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setProviderMode(mode);
                          setHasUnsavedChanges(true);
                        }}
                        className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                          (resolvedLLMConfig.providerMode ?? 'auto') === mode
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-border hover:bg-accent'
                        }`}
                      >
                        {mode === 'auto' ? '⚡ Auto' : mode === 'local' ? '🖥️ Local' : '☁️ Cloud'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(resolvedLLMConfig.providerMode ?? 'auto') === 'local'
                      ? 'Always use local Ollama. No data leaves your machine.'
                      : (resolvedLLMConfig.providerMode ?? 'auto') === 'cloud'
                        ? 'Always use cloud providers (OpenAI, Anthropic, etc.).'
                        : 'Automatically route to the best provider for each task.'}
                  </p>
                </div>

                {/* Ollama URL */}
                {(resolvedLLMConfig.providerMode ?? 'auto') !== 'cloud' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Ollama URL</label>
                    <input
                      type="url"
                      value={resolvedLLMConfig.ollamaUrl ?? 'http://localhost:11434'}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw.trim()) {
                          setOllamaUrl(raw);
                          setHasUnsavedChanges(true);
                          return;
                        }
                        try {
                          new URL(raw);
                          const result = validateUrl(raw, { allowLocalhost: true });
                          if (!result.valid) {
                            toast.error(result.error ?? 'Invalid Ollama URL');
                            return;
                          }
                          setOllamaUrl(result.sanitized ?? raw);
                        } catch {
                          setOllamaUrl(raw);
                        }
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="http://localhost:11434"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL for the local Ollama server. Default: http://localhost:11434
                    </p>
                  </div>
                )}

                <div className="rounded-lg border border-border bg-card p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="rounded-md bg-muted p-3">
                        <Server className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold mb-2">Local Ollama (Offline Mode)</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Use Ollama for offline AI processing. Models run locally on your machine
                          for complete privacy and no internet required.
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
                    <Switch checked={ollamaEnabled} onCheckedChange={handleOllamaEnabledChange} />
                  </div>
                </div>

                <FavoriteModelsSelector />
                <CustomModelsSettings />
              </div>
            </div>

            {/* Task Routing (merged from old 'task-routing' tab) */}
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Task Routing</h3>
              <TaskRoutingSettings />
            </div>

            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Settings Management</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Export or import your settings configuration
              </p>
              <Button variant="outline" size="sm" onClick={() => void handleExportSettings()}>
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
                <li>OpenAI (GPT-5.4, GPT-5.4 Mini, o3)</li>
                <li>Anthropic (Claude Opus 4.6, Sonnet 4.6, Haiku 4.5)</li>
                <li>Google (Gemini 3.1 Flash Lite, Gemini 3.1 Pro)</li>
                <li>xAI (Grok 4, Grok 4.1 Fast)</li>
                <li>DeepSeek (R1, V3.2)</li>
                <li>Mistral (Large, Codestral)</li>
                <li>Qwen (Qwen3.5 Plus, Qwen3.5 Flash)</li>
                <li>Kimi (K2.5, K2.5 Thinking)</li>
                <li>Perplexity (Sonar Pro, Sonar Reasoning)</li>
                <li>NVIDIA NIM (Nemotron Ultra, Super, Nano — free tier)</li>
                <li>OpenRouter (200+ models, generous free tier)</li>
                <li>Ollama (any local model)</li>
              </ul>
            </div>
          </>
        );

      // ── 6. Agents (Agent Execution + Features) ────────────────────────
      case 'agents':
        return (
          <>
            <AgentExecutionSettings onSettingsChange={() => setHasUnsavedChanges(true)} />
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Features</h3>
              <FeaturesPrivacySettings />
            </div>
          </>
        );

      // ── 7. MCP & Skills (MCP & Skills + MCP Server + Tools + Research) ─
      case 'mcp-skills':
        return (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Customize your workforce</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Manage the skills, tools, research defaults, and integrations your agents can
                    use.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('connectors')}
                  disabled={isBusy}
                >
                  <Plug className="mr-2 h-4 w-4" />
                  Open integrations
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    title: 'Skills & Plugins',
                    description: 'Install reusable capabilities and project-specific helpers.',
                    icon: Zap,
                  },
                  {
                    title: 'MCP Tools',
                    description: 'Control which tools and servers are available to agents.',
                    icon: Wrench,
                  },
                  {
                    title: 'Research Defaults',
                    description: 'Tune search, sources, and retrieval behavior.',
                    icon: Database,
                  },
                  {
                    title: 'Integrations',
                    description: 'Connect the apps and services your workforce can reach.',
                    icon: Plug,
                    action: () => setActiveTab('connectors'),
                  },
                ].map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={item.action}
                    disabled={!item.action || isBusy}
                    className={cn(
                      'rounded-lg border border-border bg-background p-3 text-left transition-colors',
                      item.action ? 'hover:border-primary/40 hover:bg-muted/40' : 'cursor-default',
                      !item.action && 'opacity-90',
                    )}
                  >
                    <item.icon className="h-4 w-4 text-primary" />
                    <div className="mt-3 text-sm font-medium">{item.title}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <MCPToolsSettings />
            <div className="pt-6 border-t border-border">
              <SkillsPluginsSettings />
            </div>
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">MCP Server</h3>
              <MCPServerSettings />
            </div>
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Tools</h3>
              <div className="h-full flex flex-col min-h-0">
                <ToolsPanel />
              </div>
            </div>
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Research</h3>
              <ResearchSettings />
            </div>
          </div>
        );

      // ── 8. Connectors (Connectors + OAuth + Extensions) ───────────────
      case 'connectors':
        return (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Apps & integrations</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Connect your accounts, monitor connector health, and manage OAuth or extension
                    access from one place.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('mcp-skills')}
                  disabled={isBusy}
                >
                  <Wrench className="mr-2 h-4 w-4" />
                  Open customize
                </Button>
              </div>
            </div>

            <ConnectorGallery />
            <ConnectorHealthDashboard />
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">OAuth Credentials</h3>
              <OAuthCredentialsPanel />
            </div>
            <div className="pt-6 border-t border-border">
              <h3 className="text-lg font-semibold mb-4">Extensions</h3>
              <ExtensionsSettings />
            </div>
          </div>
        );

      // ── 9. Notifications ───────────────────────────────────────────────
      case 'notifications':
        return (
          <NotificationsSettings
            notificationLoading={notificationLoading}
            notificationSettings={notificationSettings}
            notificationError={notificationError}
            onUpdateNotificationSettings={updateNotificationSettings}
          />
        );

      // ── 10. Voice ──────────────────────────────────────────────────────
      case 'voice':
        return <VoiceSettings />;

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-5xl w-full p-0 overflow-hidden bg-background">
        <div className="flex h-[85vh]">
          {/* Vertical sidebar navigation */}
          <div className="w-52 border-r border-border bg-muted py-4 px-2 space-y-1 shrink-0 overflow-y-auto">
            <DialogHeader className="px-3 pb-4">
              <DialogTitle className="text-lg font-bold">Settings</DialogTitle>
              <DialogDescription className="text-xs">Configure your preferences</DialogDescription>
            </DialogHeader>

            {visibleNav.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                disabled={isBusy}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                  activeTab === item.key
                    ? 'bg-background text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                } ${isBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate flex-1 text-left">{item.label}</span>
                {item.key === 'connectors' && connectedConnectorCount > 0 && (
                  <span className="ml-auto shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-500/15 px-1.5 text-[10px] font-semibold text-green-500">
                    {connectedConnectorCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content area */}
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

            {/* Footer buttons */}
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
  );
}
