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
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2.5 text-left transition-all hover:bg-zinc-800 hover:border-white/20',
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
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium text-zinc-100">{name}</div>
              <div
                className={cn(
                  'mt-0.5 inline-flex items-center rounded-xs bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300',
                  isTierLoading && 'animate-pulse',
                )}
              >
                {displayedPlanName}
              </div>
            </div>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-72 rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Header: email + plan */}
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-sm font-medium text-zinc-100 truncate">{email}</div>
            <div
              className={cn(
                'mt-1 inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-300',
                isTierLoading && 'animate-pulse',
              )}
            >
              {displayedPlanName}
            </div>
          </div>

          {/* Quick settings: Appearance + Language */}
          <div className="border-b border-white/10 py-2">
            {/* Appearance toggle */}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-xs text-zinc-400">Appearance</span>
              <div className="flex rounded-lg bg-white/10 p-0.5">
                <button
                  type="button"
                  onClick={() => handleThemeChange('light')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    theme === 'light'
                      ? 'bg-white/20 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                  title="Light"
                >
                  <Sun className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    theme === 'dark'
                      ? 'bg-white/20 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                  title="Dark"
                >
                  <Moon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange('system')}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    theme === 'system'
                      ? 'bg-white/20 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                  title="System"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Language selector */}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-xs text-zinc-400">Language</span>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-white/10 border-none rounded-md px-2 py-1 text-xs text-zinc-200 outline-none cursor-pointer hover:bg-white/20 transition-colors"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-zinc-900 text-zinc-200">
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
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <User className="h-4 w-4 text-zinc-400" />
              <span>Account</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => openSettings('general'))}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <Settings className="h-4 w-4 text-zinc-400" />
              <span>Preferences</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => openSettings('personalization'))}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <Sparkles className="h-4 w-4 text-zinc-400" />
              <span>Personalization</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => openShortcuts())}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <Keyboard className="h-4 w-4 text-zinc-400" />
              <span>Shortcuts</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => openSettings('connectors'))}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <Plug className="h-4 w-4 text-zinc-400" />
              <span>Connectors</span>
            </button>
          </div>

          {/* Footer: Help + Log out */}
          <div className="border-t border-white/10 py-1">
            <button
              type="button"
              onClick={() =>
                handleAction(() => window.open('https://docs.agiworkforce.com', '_blank'))
              }
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <HelpCircle className="h-4 w-4 text-zinc-400" />
              <span>Help</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(() => void useAuthStore.getState().signOut())}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-red-400 transition-colors hover:bg-white/5"
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
