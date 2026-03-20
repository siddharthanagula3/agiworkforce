/**
 * GeneralSettings tab content
 *
 * Extracted from SettingsPanel.tsx for code organization.
 * Handles: Global Hotkey, Theme, Language, Voice, System Resources,
 * Agent Permissions, and Update settings.
 */
import { useState } from 'react';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { ResourceMonitor } from '../ResourceMonitor';
import { AutomationPermissionsSettings } from './AutomationPermissionsSettings';
import { UpdateSettings } from './UpdateSettings';
import { VoiceSettings } from './VoiceSettings';
import { FontSelector } from './FontSelector';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import type { Language, GlobalHotkeyPreferences } from '../../stores/settingsStore';

interface GeneralSettingsProps {
  resolvedGlobalHotkeyPreferences: GlobalHotkeyPreferences;
  defaultGlobalHotkeyCombo: string;
  resolvedWindowPreferences: { theme: 'light' | 'dark' | 'system'; language: string };
  onGlobalHotkeyEnabledChange: (value: boolean) => void;
  onGlobalHotkeyComboChange: (value: string) => void;
  onThemeChange: (value: 'light' | 'dark' | 'system') => void;
  onLanguageChange: (value: Language) => void;
}

export function GeneralSettings({
  resolvedGlobalHotkeyPreferences,
  defaultGlobalHotkeyCombo,
  resolvedWindowPreferences,
  onGlobalHotkeyEnabledChange,
  onGlobalHotkeyComboChange,
  onThemeChange,
  onLanguageChange,
}: GeneralSettingsProps) {
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);

  const handleHotkeyBlur = (value: string) => {
    const hotkeyPattern = /^(ctrl|cmd|alt|shift)(\+(ctrl|cmd|alt|shift))*\+\w+$/i;
    if (value && !hotkeyPattern.test(value)) {
      setHotkeyError('Invalid shortcut format. Example: Ctrl+Shift+Space');
    } else {
      setHotkeyError(null);
    }
  };

  return (
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
                  onBlur={(e) => handleHotkeyBlur(e.target.value)}
                  placeholder={defaultGlobalHotkeyCombo}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {hotkeyError && <p className="text-destructive text-xs mt-1">{hotkeyError}</p>}
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

      <div className="pt-6 border-t border-border">
        <FontSelector />
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
  );
}
