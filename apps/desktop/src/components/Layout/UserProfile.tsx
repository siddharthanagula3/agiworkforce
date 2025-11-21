import React from 'react';
import { Settings, CreditCard } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '../../lib/utils';

interface UserProfileProps {
  name?: string;
  email?: string;
  avatar?: string;
  onSettingsClick?: () => void;
  onBillingClick?: () => void;
  collapsed?: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  name = 'Siddhartha Nagula',
  email = 'siddhartha@agiworkforce.com',
  avatar,
  onSettingsClick,
  onBillingClick,
  collapsed = false,
}) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2.5 text-left transition-all hover:bg-zinc-800 hover:border-white/20',
            collapsed && 'justify-center px-2',
          )}
        >
          {/* Avatar */}
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-semibold text-white">
            {avatar ? (
              <img src={avatar} alt={name} className="h-full w-full rounded-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          {/* User Info (hidden when collapsed) */}
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium text-zinc-100">{name}</div>
              <div className="truncate text-xs text-zinc-400">{email}</div>
            </div>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-64 rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* User Info Header */}
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-sm font-semibold text-white">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={name}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-100">{name}</div>
                <div className="truncate text-xs text-zinc-400">{email}</div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <button
              type="button"
              onClick={() => {
                onSettingsClick?.();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <Settings className="h-4 w-4 text-zinc-400" />
              <span>Settings</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onBillingClick?.();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5"
            >
              <CreditCard className="h-4 w-4 text-zinc-400" />
              <span>Billing</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default UserProfile;
