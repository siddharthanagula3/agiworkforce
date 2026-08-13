import { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Loader2, Shield } from 'lucide-react';
import { formatChatExecutionModeLabel } from '@agiworkforce/types';
import { window as desktopWindow } from '@agiworkforce/desktop-command-client';
import { toast } from 'sonner';
import { isTauri, isCloudWeb, isElectronHost } from '@/lib/tauri-mock';
import { Button } from '@/ui/Button';
import { Label } from '@/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/Select';
import { Switch } from '@/ui/Switch';
import { useAppModeStore, selectMode, selectIsCloud } from '../../../../stores/appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from '../../../../stores/auth';
import { useSimpleModeStore } from '../../../../stores/ui';
import { SUPPORTED_LANGUAGES } from '../../../../i18n';
import { cn } from '@/lib/utils';
import { DESKTOP_CLOUD_TAGLINE } from '../../../../constants/cloudAvailability';
import { PLAN_DISPLAY_NAMES } from '../../../../lib/cloudAccountTypes';
import type { Language, GlobalHotkeyPreferences } from '../../../../stores/settingsStore';

const LazyResourceMonitor = lazy(() =>
  import('@/features/resource-monitor').then((m) => ({ default: m.ResourceMonitor })),
);
const LazyAutomationPermissionsSettings = lazy(() =>
  import('../../AutomationPermissionsSettings').then((m) => ({
    default: m.AutomationPermissionsSettings,
  })),
);
const LazyUpdateSettings = lazy(() =>
  import('../../UpdateSettings').then((m) => ({ default: m.UpdateSettings })),
);
const LazyKeybindingsSettings = lazy(() =>
  import('../../KeybindingsSettings').then((m) => ({ default: m.KeybindingsSettings })),
);
const LazyNetworkProxySettings = lazy(() =>
  import('../../NetworkProxySettings').then((m) => ({ default: m.NetworkProxySettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function AppModeSection() {
  const mode = useAppModeStore(selectMode);
  const isCloud = useAppModeStore(selectIsCloud);
  const hasCloudAccountSession = useAuthStore(selectHasCloudAccountSession);
  const sessionValidated = useAuthStore((state) => state.sessionValidated);
  const planTier = useAuthStore((state) => state.plan);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Mode</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Run models locally or with your own provider keys (BYOK). {DESKTOP_CLOUD_TAGLINE}
      </p>
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
          <span>{formatChatExecutionModeLabel('local_only')}</span>
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
          <span>{formatChatExecutionModeLabel('cloud_managed')}</span>
        </button>
      </div>

      {isCloud && !sessionValidated && (
        <div className="rounded-lg border border-zinc-500/20 bg-zinc-500/5 px-4 py-3 flex items-center gap-3">
          <Loader2 className="h-4 w-4 text-zinc-400 shrink-0 animate-spin" />
          <p className="text-sm text-zinc-400 flex-1">Checking authentication...</p>
        </div>
      )}
      {isCloud && sessionValidated && !hasCloudAccountSession && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
          <Cloud className="h-4 w-4 text-blue-400 shrink-0" />
          <p className="text-sm text-blue-400 flex-1">{DESKTOP_CLOUD_TAGLINE}</p>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('chat:action', {
                  detail: { type: 'open-settings', tab: 'account' },
                }),
              )
            }
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50 hover:bg-blue-500/30 transition-colors"
          >
            Account
          </button>
        </div>
      )}
      {isCloud && hasCloudAccountSession && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
          <Cloud className="h-4 w-4 text-blue-400 shrink-0" />
          <p className="text-sm text-blue-400 flex-1">
            Plan:{' '}
            <span className="font-semibold">
              {planTier ? PLAN_DISPLAY_NAMES[planTier] : 'Loading…'}
            </span>
          </p>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } }),
              )
            }
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50 hover:bg-blue-500/30 transition-colors"
          >
            Manage Billing &rarr;
          </button>
        </div>
      )}
    </div>
  );
}

function RestartOnboardingSection() {
  const restartOnboarding = () => {
    useSimpleModeStore.setState({ onboardingCompleted: false });
    useAppModeStore.getState().setHasSelectedMode(false);
    useAppModeStore.getState().setMode('local');
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Onboarding</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Re-run the first-run setup to choose Local Mode, BYOK, or Cloud Mode.
      </p>
      <Button variant="outline" size="sm" onClick={restartOnboarding}>
        Restart Onboarding Wizard
      </Button>
    </div>
  );
}

export function MenuBarResidencySetting() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void desktopWindow
      .windowGetState()
      .then((state) => {
        if (!cancelled) setEnabled(state.keepInMenuBar);
      })
      .catch((cause) => {
        if (cancelled) return;
        console.error('Failed to load menu bar preference', cause);
        setError('Could not load the menu bar preference.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = async (nextEnabled: boolean) => {
    const previous = enabled;
    setEnabled(nextEnabled);
    setUpdating(true);
    setError(null);
    try {
      await desktopWindow.windowSetMenuBarMode(nextEnabled);
    } catch (cause) {
      console.error('Failed to update menu bar preference', cause);
      setEnabled(previous);
      setError('Could not update the menu bar preference.');
      toast.error('Could not update the menu bar preference');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      className="rounded-lg border border-border bg-card p-6"
      data-setting-search-id="menu-bar"
      tabIndex={-1}
    >
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="keepInMenuBar">Show in menu bar</Label>
          <p className="text-xs text-muted-foreground">
            Keep AGI Workforce in the macOS menu bar or system tray when the main window is closed.
          </p>
        </div>
        <Switch
          id="keepInMenuBar"
          checked={enabled}
          disabled={loading || updating}
          onCheckedChange={(value) => void handleChange(value)}
        />
      </div>
      {error && (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export interface GeneralTabProps {
  resolvedWindowPreferences: { theme: string; language: string };
  resolvedGlobalHotkeyPreferences: GlobalHotkeyPreferences;
  defaultGlobalHotkeyCombo: string;
  onThemeChange: (value: 'light' | 'dark' | 'system') => void;
  onLanguageChange: (value: Language) => void;
  onGlobalHotkeyEnabledChange: (value: boolean) => void;
  onGlobalHotkeyComboChange: (value: string) => void;
}

export function GeneralTab({
  resolvedWindowPreferences,
  resolvedGlobalHotkeyPreferences,
  defaultGlobalHotkeyCombo,
  onThemeChange,
  onLanguageChange,
  onGlobalHotkeyEnabledChange,
  onGlobalHotkeyComboChange,
}: GeneralTabProps) {
  // Only the theme and language controls below read the shared corpus, because
  // the language switcher itself lives on this tab and used to stay English
  // after you switched locale. The rest of this tab ("Window Preferences",
  // "Global Hotkey", "Network", "System Resources", "Agent Permissions",
  // "Keybindings" and their descriptions) is still English literals: those
  // strings have no counterpart in packages/ui/i18n/locales, so translating
  // them needs new corpus keys in all twelve locales, not a t() call here.
  const { t } = useTranslation();

  return (
    <>
      {isCloudWeb ? (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-center gap-3">
          <Cloud className="h-4 w-4 text-blue-400 shrink-0" />
          <p className="text-sm text-blue-400">
            You are using AGI Workforce {formatChatExecutionModeLabel('cloud_managed')}. Models and
            billing are managed by your plan.
          </p>
        </div>
      ) : (
        <AppModeSection />
      )}

      {isTauri && (
        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-semibold mb-4">Window Preferences</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Configure window behavior and appearance
          </p>
          <div className="space-y-6">
            <MenuBarResidencySetting />

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
                  onCheckedChange={onGlobalHotkeyEnabledChange}
                />
              </div>
              {resolvedGlobalHotkeyPreferences.enabled && (
                <div className="space-y-2">
                  <Label htmlFor="globalHotkeyCombo">Key Combination</Label>
                  <input
                    id="globalHotkeyCombo"
                    type="text"
                    value={resolvedGlobalHotkeyPreferences.combo}
                    onChange={(e) => onGlobalHotkeyComboChange(e.target.value)}
                    placeholder={defaultGlobalHotkeyCombo}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use Tauri accelerator format, e.g.{' '}
                    <code className="rounded bg-muted px-1 py-0.5">{defaultGlobalHotkeyCombo}</code>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme">{t('settings:theme')}</Label>
              <Select
                value={resolvedWindowPreferences.theme}
                onValueChange={(value) => onThemeChange(value as 'light' | 'dark' | 'system')}
              >
                <SelectTrigger id="theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t('settings:light')}</SelectItem>
                  <SelectItem value="dark">{t('settings:dark')}</SelectItem>
                  <SelectItem value="system">{t('settings:system')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">{t('settings:language')}</Label>
              <Select
                value={resolvedWindowPreferences.language}
                onValueChange={(value) => onLanguageChange(value as Language)}
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
          <h3 className="text-lg font-semibold mb-4">Network</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Configure corporate proxy, authentication, bypass, and trust settings for model traffic.
          </p>
          <Suspense fallback={<Fallback label="Loading network settings..." />}>
            <LazyNetworkProxySettings />
          </Suspense>
        </div>
      )}

      {isTauri && (
        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-semibold mb-4">System Resources</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Device-only CPU, memory, and runtime controls. These do not change your Managed Cloud
            allowance or cloud sandbox resources.
          </p>
          <Suspense fallback={<Fallback label="Loading system resource settings..." />}>
            <LazyResourceMonitor showTools={true} />
          </Suspense>
        </div>
      )}

      {isTauri && (
        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-semibold mb-4">Agent Permissions</h3>
          <p className="text-sm text-muted-foreground mb-4">
            macOS permissions for actions performed on this device. Managed Cloud tool approvals and
            sandbox permissions are enforced separately by your account policy.
          </p>
          <Suspense fallback={<Fallback label="Loading automation permissions..." />}>
            <LazyAutomationPermissionsSettings />
          </Suspense>
        </div>
      )}

      {(isTauri || isElectronHost) && (
        <div className="pt-6 border-t border-border">
          <Suspense fallback={<Fallback label="Loading update settings..." />}>
            <LazyUpdateSettings />
          </Suspense>
        </div>
      )}

      {isTauri && (
        <div className="pt-6 border-t border-border">
          <RestartOnboardingSection />
        </div>
      )}

      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-4">Keybindings</h3>
        <Suspense fallback={<Fallback label="Loading keybindings..." />}>
          <LazyKeybindingsSettings />
        </Suspense>
      </div>
    </>
  );
}
