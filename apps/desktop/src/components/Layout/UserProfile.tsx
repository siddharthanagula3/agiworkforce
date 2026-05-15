import * as Popover from '@radix-ui/react-popover';
import {
  HelpCircle,
  Keyboard,
  LogOut,
  Monitor,
  Moon,
  Plug,
  Settings,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { useAccountStore, selectIsTierLoading, useAuthStore } from '../../stores/auth';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import { useThemeContext } from '../../providers/ThemeProvider';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import type { Language } from '../../stores/settingsStore';

interface UserProfileProps {
  collapsed?: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({ collapsed = false }) => {
  const [open, setOpen] = useState(false);
  const account = useAccountStore((state) => state.account);
  const isTierLoading = useAccountStore(selectIsTierLoading);
  const { theme, setTheme: setThemeContext } = useThemeContext();
  useSettingsStore((state) => state.windowPreferences?.theme ?? 'system'); // keep store in sync
  const language = useSettingsStore((state) => state.windowPreferences?.language ?? 'en');
  const openSettings = useSettingsDialogStore((state) => state.openSettings);
  const openShortcuts = useSettingsDialogStore((state) => state.openShortcuts);

  const { displayName, email, planDisplayName } = account;
  const displayedPlanName = isTierLoading ? 'Loading...' : planDisplayName;
  const name = displayName || email?.split('@')[0] || 'Account';

  const initials = name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    setThemeContext(value);
    useSettingsStore.getState().setTheme(value);
  };

  const handleLanguageChange = (value: string) => {
    useSettingsStore.getState().setLanguage(value as Language);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5 text-left transition-all hover:bg-[hsl(var(--accent))] hover:border-[hsl(var(--border))] overflow-hidden cursor-pointer',
            collapsed && 'justify-center px-2',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
            {account.avatar ? (
              <img
                src={account.avatar}
                alt={name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          {!collapsed && (
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                {name}
              </div>
              <div
                className={cn(
                  'mt-0.5 inline-flex max-w-full items-center rounded-xs bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] truncate',
                  isTierLoading && 'animate-pulse',
                )}
              >
                {displayedPlanName}
              </div>
            </div>
          )}
        </div>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-72 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--popover))] shadow-2xl backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Header: email + plan */}
          <div className="border-b border-[hsl(var(--border))] px-4 py-3">
            <div className="text-sm font-medium text-[hsl(var(--popover-foreground))] truncate">
              {email}
            </div>
            <div
              className={cn(
                'mt-1 inline-flex items-center rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]',
                isTierLoading && 'animate-pulse',
              )}
            >
              {displayedPlanName}
            </div>
          </div>

          {/* Quick settings: Appearance + Language */}
          <div className="border-b border-[hsl(var(--border))] py-2">
            {/* Appearance toggle */}
            <div className="flex items-center justify-between px-4 py-2">
              <span id="appearance-label" className="text-xs text-[hsl(var(--muted-foreground))]">
                Appearance
              </span>
              <div
                className="flex rounded-lg bg-[hsl(var(--muted))] p-0.5"
                role="radiogroup"
                aria-labelledby="appearance-label"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === 'light'}
                  onClick={() => handleThemeChange('light')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    theme === 'light'
                      ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                  )}
                  title="Light"
                  aria-label="Light theme"
                >
                  <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === 'dark'}
                  onClick={() => handleThemeChange('dark')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    theme === 'dark'
                      ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                  )}
                  title="Dark"
                  aria-label="Dark theme"
                >
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === 'system'}
                  onClick={() => handleThemeChange('system')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    theme === 'system'
                      ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                  )}
                  title="System"
                  aria-label="System theme"
                >
                  <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Language selector */}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Language</span>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-[hsl(var(--muted))] border-none rounded-md px-2 py-1 text-xs text-[hsl(var(--popover-foreground))] outline-none cursor-pointer hover:bg-[hsl(var(--accent))] transition-colors"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option
                    key={lang.code}
                    value={lang.code}
                    className="bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))]"
                  >
                    {lang.nativeName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Navigation items */}
          <div className="py-1">
            <button
              type="button"
              onClick={() => handleAction(() => openSettings('account'))}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-[hsl(var(--popover-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              <User className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              <span>Account</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => openSettings('general'))}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-[hsl(var(--popover-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              <Settings className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              <span>Preferences</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => openSettings('personalization'))}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-[hsl(var(--popover-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              <Sparkles className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              <span>Personalization</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => openShortcuts())}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-[hsl(var(--popover-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              <Keyboard className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              <span>Shortcuts</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => openSettings('connectors'))}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-[hsl(var(--popover-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              <Plug className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              <span>Connectors</span>
            </button>
          </div>

          {/* Footer: Help + Log out */}
          <div className="border-t border-[hsl(var(--border))] py-1">
            <button
              type="button"
              onClick={() =>
                handleAction(() => window.open('https://docs.agiworkforce.com', '_blank'))
              }
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-[hsl(var(--popover-foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
            >
              <HelpCircle className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              <span>Help</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => void useAuthStore.getState().signOut())}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-red-400 transition-colors hover:bg-[hsl(var(--accent))]"
            >
              <LogOut className="h-4 w-4 text-red-400" />
              <span>Log Out</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default UserProfile;
