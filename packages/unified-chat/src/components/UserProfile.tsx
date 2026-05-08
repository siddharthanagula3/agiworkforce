import { useState, useRef, useEffect } from 'react';
import {
  Settings,
  HelpCircle,
  CreditCard,
  Smartphone,
  Keyboard,
  LogOut,
  ChevronRight,
  ArrowUpRight,
  Home,
  Info,
} from 'lucide-react';
import { PLAN_LABEL, type UIPlanTier, type UsageMeter } from '@agiworkforce/types';
import { cn } from '../lib/utils';
import { useSettingsStore } from '../stores/settingsStore';
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

/**
 * Map the legacy free/plan strings stored in settingsStore to the canonical UIPlanTier.
 * Legacy `free` is the alias for `byok` per MEMORY.md tier list.
 */
function resolvePlanTier(plan: string): UIPlanTier {
  if (plan === 'local') return 'local';
  if (plan === 'byok' || plan === 'free') return 'byok';
  if (plan === 'hobby') return 'hobby';
  if (plan === 'pro') return 'pro';
  if (plan === 'pro_plus' || plan === 'pro+') return 'pro_plus';
  if (plan === 'max') return 'max';
  // Fallback: treat unknown as byok (free tier)
  return 'byok';
}

/**
 * Derive a stub UsageMeter from the plan tier.
 *
 * TODO(backend): replace with real data from Supabase billing endpoint
 * when the managed-plan usage API lands. Track in UNIFIED_LAUNCH_PLAN.md §billing.
 */
function deriveUsageMeter(tier: UIPlanTier): UsageMeter {
  switch (tier) {
    case 'local':
      return { remaining: null, resetsAt: null, source: 'unbounded' };
    case 'byok':
      return { remaining: null, resetsAt: null, source: 'user-api-key' };
    case 'hobby': {
      // Stub: 62 % remaining, resets in 4 days.
      // TODO(backend): fetch real usage from /api/billing/usage
      const resetsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
      return { remaining: 0.62, resetsAt, source: 'managed-plan' };
    }
    case 'pro':
    case 'pro_plus':
    case 'max': {
      // Stub: Pro/Pro+/Max — show generous quota
      const resetsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      return { remaining: 0.85, resetsAt, source: 'managed-plan' };
    }
  }
}

/** Format days-until-reset from an ISO timestamp. */
function formatResetsIn(isoDate: string): string {
  const days = Math.max(
    0,
    Math.ceil((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
  if (days === 0) return 'today';
  if (days === 1) return 'in 1d';
  return `in ${days}d`;
}

/** Format token counts for the meter row: 0.62 remaining of 50k → "31k / 50k tokens" */
function formatTokenRow(remaining: number): { used: string; total: string } {
  // Stub total: 50k for Hobby.
  // TODO(backend): pull from plan entitlement once billing API lands.
  const totalK = 50;
  const usedK = Math.round(totalK * (1 - remaining) * 10) / 10;
  return {
    used: usedK >= 1 ? `${usedK}k` : `${Math.round(usedK * 1000)}`,
    total: `${totalK}k`,
  };
}

// ---------------------------------------------------------------------------
// UsageMeterRow — visual block shown inside the profile popover
// ---------------------------------------------------------------------------

interface UsageMeterRowProps {
  meter: UsageMeter;
  tier: UIPlanTier;
  onUpgradeClick: () => void;
}

function UsageMeterRow({ meter, tier, onUpgradeClick }: UsageMeterRowProps) {
  if (meter.source === 'unbounded') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-[var(--chat-text-muted)]">
        <Home size={11} className="shrink-0" />
        <span>Local model — no quota</span>
      </div>
    );
  }

  if (meter.source === 'user-api-key') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-[var(--chat-text-muted)]">
        <Info size={11} className="shrink-0" />
        <span>Using your own API key</span>
      </div>
    );
  }

  // managed-plan
  const pct = meter.remaining ?? 0;
  const barWidth = Math.round(pct * 100);
  const isLow = pct < 0.2;
  const { used, total } = formatTokenRow(pct);
  const resetLabel = meter.resetsAt ? formatResetsIn(meter.resetsAt) : '';

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="flex items-center justify-between text-[11px] text-[var(--chat-text-muted)]">
        <span>
          {used} / {total} tokens
          {resetLabel ? ` · resets ${resetLabel}` : ''}
        </span>
        {isLow && tier === 'hobby' && (
          <button
            type="button"
            onClick={onUpgradeClick}
            className="flex items-center gap-0.5 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            Upgrade
            <ArrowUpRight size={10} />
          </button>
        )}
      </div>
      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-[var(--chat-border)]">
        <div
          className={cn('h-1 rounded-full transition-all', isLow ? 'bg-amber-400' : 'bg-blue-500')}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserProfile
// ---------------------------------------------------------------------------

export function UserProfile({ collapsed }: UserProfileProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const profile = useSettingsStore((s) => s.profile);

  const tier = resolvePlanTier(profile.plan);
  const planLabel = PLAN_LABEL[tier];
  const meter = deriveUsageMeter(tier);

  const initials = getInitials(profile.fullName || 'User');
  const avatarColor = getAvatarColor(profile.fullName || 'user');
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

  function handleUpgradePlan() {
    window.dispatchEvent(new CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } }));
    setOpen(false);
  }

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
            'absolute bottom-full mb-1 left-0 z-50 w-64',
            'rounded-[var(--chat-radius-lg)] bg-[var(--chat-surface-elevated)]',
            'border border-[var(--chat-border)] shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
          )}
        >
          {/* Header: name + email + plan badge */}
          <div className="border-b border-[var(--chat-border)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[var(--chat-text-primary)] truncate">
                {displayName}
              </p>
              {/* Plan badge */}
              <span
                className={cn(
                  'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  tier === 'local' || tier === 'byok'
                    ? 'bg-[var(--chat-border)] text-[var(--chat-text-muted)]'
                    : tier === 'hobby'
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-purple-500/15 text-purple-400',
                )}
              >
                {planLabel}
              </span>
            </div>
            {profile.email && (
              <p className="text-[11px] text-[var(--chat-text-muted)] truncate mt-0.5">
                {profile.email}
              </p>
            )}
          </div>

          {/* Usage meter block */}
          <div className="border-b border-[var(--chat-border)]">
            <UsageMeterRow meter={meter} tier={tier} onUpgradeClick={handleUpgradePlan} />
          </div>

          <div className="p-1">
            {/* Settings */}
            <MenuButton
              icon={<Settings size={13} />}
              label="Settings"
              shortcut="⌘,"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('chat:action', {
                    detail: { type: 'open-settings', tab: 'general' },
                  }),
                );
                setOpen(false);
              }}
            />

            {/* Language */}
            <MenuButton
              icon={<ChevronRight size={13} />}
              label="Language"
              suffix={<ChevronRight size={12} className="text-[var(--chat-text-muted)]" />}
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('chat:action', {
                    detail: { type: 'open-settings', tab: 'general' },
                  }),
                );
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

            {/* View all plans (always visible — neutral discovery, no upsell language for byok/local) */}
            <MenuButton
              icon={<CreditCard size={13} />}
              label="View all plans"
              onClick={() => {
                handleUpgradePlan();
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
                window.dispatchEvent(
                  new CustomEvent('chat:action', {
                    detail: { type: 'open-settings', tab: 'general' },
                  }),
                );
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
