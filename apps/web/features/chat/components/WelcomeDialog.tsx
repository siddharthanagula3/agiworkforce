/**
 * WelcomeDialog Component
 *
 * First-time modal for new users, shown once on initial visit.
 * Introduces AGI Workforce and offers to start the guided help tour.
 *
 * Features:
 * - Friendly welcome message with brief product intro
 * - Quick-start guidance (API key or free tier)
 * - "Get Started" button that dismisses and optionally starts the tour
 * - "Skip" option to dismiss without starting the tour
 * - Only shown once (persisted via localStorage flag)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@shared/ui/dialog';
import { Button } from '@/components/ui/Button';
import { Sparkles, Zap, Globe, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

const WELCOME_SEEN_KEY = 'agi-welcome-seen';

interface WelcomeDialogProps {
  /** Callback fired when dialog is dismissed. If startTour is true, the caller should start the help tour. */
  onDismiss: (startTour: boolean) => void;
}

const HIGHLIGHTS = [
  {
    icon: Globe,
    label: 'Multi-model',
    description: 'Connect any LLM provider -- OpenAI, Anthropic, Google, or run models locally.',
    color: 'text-blue-500 bg-blue-500/10',
  },
  {
    icon: Zap,
    label: 'Tools',
    description: 'AI skills and MCP tools -- from writing to research to code and beyond.',
    color: 'text-amber-500 bg-amber-500/10',
  },
  {
    icon: Mic,
    label: 'Voice',
    description:
      'Speak naturally with voice input. Dictate messages hands-free, anywhere in the app.',
    color: 'text-purple-500 bg-purple-500/10',
  },
];

/**
 * Check if the welcome dialog has already been shown.
 * Returns true if the user has NOT seen the welcome yet (i.e., should show it).
 */
export function shouldShowWelcome(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(WELCOME_SEEN_KEY) !== 'true';
}

/** Mark the welcome dialog as seen so it will not show again. */
export function markWelcomeSeen(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WELCOME_SEEN_KEY, 'true');
}

/** Reset the welcome dialog flag so it will show again on next visit. */
export function resetWelcomeFlag(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(WELCOME_SEEN_KEY);
}

export function WelcomeDialog({ onDismiss }: WelcomeDialogProps) {
  const [open, setOpen] = useState(false);

  // Check on mount whether to show the dialog
  useEffect(() => {
    if (shouldShowWelcome()) {
      // Brief delay to let the page render first
      const timer = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const handleGetStarted = useCallback(() => {
    markWelcomeSeen();
    setOpen(false);
    onDismiss(true);
  }, [onDismiss]);

  const handleSkip = useCallback(() => {
    markWelcomeSeen();
    setOpen(false);
    onDismiss(false);
  }, [onDismiss]);

  // Prevent closing by clicking backdrop without marking as seen
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        markWelcomeSeen();
        setOpen(false);
        onDismiss(false);
      }
    },
    [onDismiss],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby="welcome-dialog-description">
        {/* Decorative gradient header */}
        <div className="absolute inset-x-0 top-0 h-1.5 rounded-t-lg bg-gradient-to-r from-blue-500 via-purple-500 to-teal-500" />

        <DialogHeader className="pt-4 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-teal-500 bg-clip-text text-transparent">
            Welcome to AGI Workforce
          </DialogTitle>
          <DialogDescription id="welcome-dialog-description" className="text-base mt-2">
            Your AI assistant that works with any model
          </DialogDescription>
        </DialogHeader>

        {/* Feature highlights */}
        <div className="my-4 grid gap-3">
          {HIGHLIGHTS.map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/30 p-3"
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  item.color,
                )}
              >
                <item.icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick start hint */}
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-3">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-1">Quick start</p>
          <p className="text-xs text-blue-700/80 dark:text-blue-400/80 leading-relaxed">
            Set up your API key in Settings to use your own models, or start chatting right away
            with the free tier. You can switch models anytime from the composer.
          </p>
        </div>

        <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleSkip} className="w-full sm:w-auto">
            Skip for now
          </Button>
          <Button
            onClick={handleGetStarted}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
          >
            Get Started
            <Sparkles className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
