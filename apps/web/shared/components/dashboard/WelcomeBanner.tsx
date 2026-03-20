'use client';

/**
 * WelcomeBanner — first-run experience for new web users
 *
 * Shows a progress checklist of key onboarding steps:
 *   1. Account created (always checked)
 *   2. First chat started
 *   3. Billing set up
 *   4. Desktop connected
 *   5. Team invited
 *
 * Persisted in localStorage via a simple key. Dismisses when all items are
 * completed OR when the user clicks "Got it".
 *
 * Designed to match the DashboardHome glassmorphism card style.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  X,
  MessageSquare,
  CreditCard,
  Monitor,
  Users,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@shared/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  actionLabel: string;
}

interface OnboardingProgress {
  dismissed: boolean;
  completed: Record<string, boolean>;
  /** ISO timestamp of first banner render — used to suppress for older accounts */
  shownAt: string;
}

// ---------------------------------------------------------------------------
// Checklist definition
// ---------------------------------------------------------------------------

const CHECKLIST: ChecklistItem[] = [
  {
    id: 'account_created',
    label: 'Account created',
    description: 'Welcome aboard! Your account is ready.',
    icon: Sparkles,
    href: '/dashboard',
    actionLabel: 'Dashboard',
  },
  {
    id: 'first_chat',
    label: 'Start your first chat',
    description: 'Ask anything, generate content, or run an agent.',
    icon: MessageSquare,
    href: '/chat',
    actionLabel: 'Open Chat',
  },
  {
    id: 'billing',
    label: 'Set up billing',
    description: 'Unlock higher limits and more AI capabilities.',
    icon: CreditCard,
    href: '/dashboard/billing',
    actionLabel: 'View Plans',
  },
  {
    id: 'desktop',
    label: 'Connect desktop app',
    description: 'Download and link the desktop agent for full autonomy.',
    icon: Monitor,
    href: '/dashboard/settings',
    actionLabel: 'Get Desktop App',
  },
  {
    id: 'team',
    label: 'Invite your team',
    description: 'Collaborate with colleagues using shared workspaces.',
    icon: Users,
    href: '/dashboard/workforce',
    actionLabel: 'Invite Team',
  },
];

const STORAGE_KEY = 'agw_onboarding_progress';
const ACCOUNT_AGE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadProgress(): OnboardingProgress {
  if (typeof window === 'undefined') {
    return {
      dismissed: false,
      completed: { account_created: true },
      shownAt: new Date().toISOString(),
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OnboardingProgress;
      // Always mark account_created as done
      parsed.completed['account_created'] = true;
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return {
    dismissed: false,
    completed: { account_created: true },
    shownAt: new Date().toISOString(),
  };
}

function saveProgress(progress: OnboardingProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WelcomeBannerProps {
  /** User display name for the greeting */
  displayName?: string;
  /** If true the banner is suppressed (e.g. user signed up > 7 days ago) */
  suppress?: boolean;
}

export function WelcomeBanner({ displayName, suppress }: WelcomeBannerProps) {
  const router = useRouter();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Hydrate from localStorage only on client
  useEffect(() => {
    const loaded = loadProgress();
    // Suppress if the banner was shown more than 7 days ago (returning user)
    const shownAge = Date.now() - new Date(loaded.shownAt).getTime();
    if (shownAge > ACCOUNT_AGE_THRESHOLD_MS) {
      loaded.dismissed = true;
    }
    setProgress(loaded);
  }, []);

  const updateProgress = useCallback((updates: Partial<OnboardingProgress>) => {
    setProgress((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates, completed: { ...prev.completed, ...updates.completed } };
      saveProgress(next);
      return next;
    });
  }, []);

  const handleDismiss = useCallback(() => {
    updateProgress({ dismissed: true });
  }, [updateProgress]);

  const handleItemClick = useCallback(
    (item: ChecklistItem) => {
      // Mark as completed when the user navigates to the action
      updateProgress({ completed: { [item.id]: true } });
      router.push(item.href);
    },
    [router, updateProgress],
  );

  // Don't render until hydrated, suppressed, or dismissed
  if (!progress || progress.dismissed || suppress) return null;

  const completedCount = CHECKLIST.filter((c) => progress.completed[c.id]).length;
  const allDone = completedCount === CHECKLIST.length;

  // Auto-dismiss if all items done
  if (allDone) {
    saveProgress({ ...progress, dismissed: true });
    return null;
  }

  const progressPercent = Math.round((completedCount / CHECKLIST.length) * 100);

  return (
    <section
      aria-label="Getting started checklist"
      className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-primary/[0.06] via-white/[0.02] to-purple-500/[0.04] p-4 backdrop-blur-xl sm:p-5"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">
              {displayName ? `Welcome, ${displayName}!` : 'Welcome to AGI Workforce!'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              {completedCount}/{CHECKLIST.length} steps complete
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="hidden text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors sm:block"
            aria-expanded={expanded}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/40 hover:bg-white/[0.04] hover:text-muted-foreground transition-colors"
            aria-label="Dismiss welcome banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-purple-500 transition-[width] duration-500"
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Checklist — always visible on desktop, toggled on mobile */}
      <ul
        className={[
          'mt-3 space-y-1 transition-all duration-200',
          expanded ? 'block' : 'hidden sm:block',
        ].join(' ')}
      >
        {CHECKLIST.map((item) => {
          const isDone = Boolean(progress.completed[item.id]);
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => !isDone && handleItemClick(item)}
                disabled={isDone}
                className={[
                  'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
                  'transition-colors duration-150',
                  isDone ? 'cursor-default opacity-60' : 'hover:bg-white/[0.04] cursor-pointer',
                ].join(' ')}
              >
                {/* Completion icon */}
                <div className="flex-shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/30" />
                  )}
                </div>

                {/* Icon badge */}
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white/[0.04]">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      'text-xs font-medium',
                      isDone ? 'line-through text-muted-foreground/50' : 'text-foreground',
                    ].join(' ')}
                  >
                    {item.label}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground/50">
                    {item.description}
                  </p>
                </div>

                {/* Action chevron */}
                {!isDone && (
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/30 transition-transform duration-150 group-hover:translate-x-0.5" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Mobile expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 flex w-full items-center justify-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors sm:hidden"
        aria-expanded={expanded}
      >
        {expanded ? 'Show less' : `Show ${CHECKLIST.length - completedCount} remaining steps`}
      </button>

      {/* Got it dismiss */}
      <div className="mt-3 flex justify-end border-t border-white/[0.04] pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground/60 hover:text-muted-foreground"
          onClick={handleDismiss}
        >
          Got it, hide this
        </Button>
      </div>
    </section>
  );
}

export default WelcomeBanner;
