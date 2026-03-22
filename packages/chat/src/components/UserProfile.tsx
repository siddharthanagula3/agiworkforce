import { useState, useRef, useEffect } from 'react';
import {
  Settings,
  HelpCircle,
  CreditCard,
  Smartphone,
  Keyboard,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { Tooltip } from './ui/Tooltip';

interface UserProfileProps {
  collapsed: boolean;
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return (parts[0]![0] ?? 'U').toUpperCase();
  return ((parts[0]![0] ?? '') + (parts[parts.length - 1]![0] ?? '')).toUpperCase();
}

function getAvatarColor(name: string): string {
  // Deterministic hue from name string
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 38%)`;
}

function getPlanLabel(plan: string): string {
  if (plan === 'pro') return 'Pro';
  if (plan === 'enterprise') return 'Enterprise';
  return 'Free';
}

export function UserProfile({ collapsed }: UserProfileProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const profile = useSettingsStore((s) => s.profile);
  const openSettings = useUIStore((s) => s.openSettings);

  const initials = getInitials(profile.fullName || 'User');
  const avatarColor = getAvatarColor(profile.fullName || 'user');
  const planLabel = getPlanLabel(profile.plan);
  const displayName = profile.fullName.trim() || 'Your Account';

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const avatar = (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white select-none"
      style={{ backgroundColor: avatarColor }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );

  const trigger = (
    <button
      ref={triggerRef}
      onClick={() => setOpen((prev) => !prev)}
      className={cn(
        'flex w-full items-center gap-2 rounded-[var(--chat-radius-md)] px-2 py-2 transition-colors',
        'text-left hover:bg-[var(--chat-surface-hover)]',
        open && 'bg-[var(--chat-surface-hover)]',
        collapsed && 'justify-center px-0',
      )}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      {avatar}
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--chat-text-primary)] leading-tight">
            {displayName}
          </p>
          <p className="truncate text-[11px] text-[var(--chat-text-muted)] leading-tight">
            {planLabel} plan
          </p>
        </div>
      )}
    </button>
  );

  return (
    <div className="relative">
      {collapsed ? (
        <Tooltip content={displayName} side="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}

      {/* Popover menu */}
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Account menu"
          className={cn(
            'absolute bottom-full mb-1 left-0 z-50 w-56',
            'rounded-[var(--chat-radius-lg)] bg-[var(--chat-surface-elevated)]',
            'border border-[var(--chat-border)] shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
          )}
        >
          {/* Email header */}
          <div className="border-b border-[var(--chat-border)] px-3 py-2.5">
            <p className="text-xs font-medium text-[var(--chat-text-primary)] truncate">
              {displayName}
            </p>
            {profile.email && (
              <p className="text-[11px] text-[var(--chat-text-muted)] truncate mt-0.5">
                {profile.email}
              </p>
            )}
          </div>

          <div className="p-1">
            {/* Settings */}
            <MenuButton
              icon={<Settings size={13} />}
              label="Settings"
              shortcut="⌘,"
              onClick={() => {
                openSettings('general');
                setOpen(false);
              }}
            />

            {/* Language */}
            <MenuButton
              icon={<ChevronRight size={13} />}
              label="Language"
              suffix={<ChevronRight size={12} className="text-[var(--chat-text-muted)]" />}
              onClick={() => {
                openSettings('general');
                setOpen(false);
              }}
            />

            {/* Get help */}
            <MenuButton
              icon={<HelpCircle size={13} />}
              label="Get help"
              onClick={() => {
                window.open('https://agiworkforce.com/help', '_blank');
                setOpen(false);
              }}
            />

            <div className="my-1 h-px bg-[var(--chat-border)]" />

            {/* View all plans */}
            <MenuButton
              icon={<CreditCard size={13} />}
              label="View all plans"
              onClick={() => {
                openSettings('billing');
                setOpen(false);
              }}
            />

            {/* Get apps */}
            <MenuButton
              icon={<Smartphone size={13} />}
              label="Get apps"
              onClick={() => {
                window.open('https://agiworkforce.com/download', '_blank');
                setOpen(false);
              }}
            />

            {/* Keyboard shortcuts */}
            <MenuButton
              icon={<Keyboard size={13} />}
              label="Keyboard shortcuts"
              onClick={() => {
                openSettings('general');
                setOpen(false);
              }}
            />

            <div className="my-1 h-px bg-[var(--chat-border)]" />

            {/* Log out */}
            <MenuButton
              icon={<LogOut size={13} />}
              label="Log out"
              destructive
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('chat:action', { detail: { type: 'logout' } }),
                );
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface MenuButtonProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  suffix?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

function MenuButton({
  icon,
  label,
  shortcut,
  suffix,
  onClick,
  destructive = false,
}: MenuButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-[var(--chat-radius-sm)] px-2 py-1.5 transition-colors',
        'text-sm text-left outline-none',
        destructive
          ? 'text-[var(--chat-destructive)] hover:bg-[var(--chat-destructive)]/10'
          : 'text-[var(--chat-text-primary)] hover:bg-[var(--chat-surface-hover)]',
      )}
    >
      <span
        className={cn(
          'shrink-0',
          destructive ? 'text-[var(--chat-destructive)]' : 'text-[var(--chat-text-muted)]',
        )}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[11px] text-[var(--chat-text-muted)]">{shortcut}</span>}
      {suffix}
    </button>
  );
}
