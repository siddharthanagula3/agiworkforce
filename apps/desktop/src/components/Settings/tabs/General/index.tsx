import { Suspense, lazy } from 'react';
import { Cloud, Loader2, Shield } from 'lucide-react';
import { isTauri, isCloudWeb } from '@/lib/tauri-mock';
import { toast } from 'sonner';
import { Button } from '../../../ui/Button';
import { Label } from '../../../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/Select';
import { Switch } from '../../../ui/Switch';
import { useAppModeStore, selectMode, selectIsCloud } from '../../../../stores/appModeStore';
import { useAuthStore } from '../../../../stores/auth';
import { useSimpleModeStore } from '../../../../stores/ui';
import { SUPPORTED_LANGUAGES } from '../../../../i18n';
import { cn } from '@/lib/utils';
import type { Language, GlobalHotkeyPreferences } from '../../../../stores/settingsStore';

const LazyResourceMonitor = lazy(() =>
  import('../../../ResourceMonitor').then((m) => ({ default: m.ResourceMonitor })),
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionValidated = useAuthStore((state) => state.sessionValidated);
  const planTier = useAppModeStore((state) => state.planTier);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Mode</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Choose between fully local (offline) or cloud-connected.
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
        </button>
      </div>

      {isCloud && !sessionValidated && (
        <div className="rounded-lg border border-zinc-500/20 bg-zinc-500/5 px-4 py-3 flex items-center gap-3">
          <Loader2 className="h-4 w-4 text-zinc-400 shrink-0 animate-spin" />
          <p className="text-sm text-zinc-400 flex-1">Checking authentication...</p>
        </div>
      )}
      {isCloud && sessionValidated && !isAuthenticated && (
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

function RestartOnboardingSection() {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">Onboarding</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Re-run the first-run setup wizard to reconfigure API keys, model selection, and tour.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => useSimpleModeStore.setState({ onboardingCompleted: false })}
      >
        Restart Onboarding Wizard
      </Button>
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
              <Label htmlFor="theme">Theme</Label>
              <Select
                value={resolvedWindowPreferences.theme}
                onValueChange={(value) => onThemeChange(value as 'light' | 'dark' | 'system')}
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
          <h3 className="text-lg font-semibold mb-4">System Resources</h3>
          <Suspense fallback={<Fallback label="Loading system resource settings..." />}>
            <LazyResourceMonitor showTools={true} />
          </Suspense>
        </div>
      )}

      {isTauri && (
        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-semibold mb-4">Agent Permissions</h3>
          <p className="text-sm text-muted-foreground mb-4">
            macOS system permissions required for agent mode automation.
          </p>
          <Suspense fallback={<Fallback label="Loading automation permissions..." />}>
            <LazyAutomationPermissionsSettings />
          </Suspense>
        </div>
      )}

      {isTauri && (
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
