'use client';

import { useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight, SquarePen } from '@agiworkforce/icons';
import {
  HOST_MENU_SHORTCUTS,
  describeAccelerator,
  type HostBridge,
} from '@agiworkforce/local-runtime-contract';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@agiworkforce/ui';
import { NEW_CHAT_PATH } from '@/features/chat/lib/new-chat-entry';
import { useGuardedRouter } from '@shared/hooks/use-guarded-router';
import { useHostNavigation } from '../hooks/use-host-navigation';

const HOST_NAVIGATION_ATTRIBUTE = 'data-host-navigation';
const TOOLTIP_DELAY_MS = 200;

const BUTTON_CLASS = cn(
  'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground',
  'transition-colors hover:bg-accent hover:text-foreground',
  'outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
  'disabled:pointer-events-none disabled:opacity-40',
);

function chordFor(id: string, platform: string): string | null {
  const shortcut = HOST_MENU_SHORTCUTS.find((candidate) => candidate.id === id);
  return shortcut ? describeAccelerator(shortcut.accelerator, platform) : null;
}

interface ControlProps {
  label: string;
  chord: string | null;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Control({ label, chord, disabled, onClick, children }: ControlProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={chord ? `${label} (${chord})` : label}
          disabled={disabled}
          onClick={onClick}
          className={BUTTON_CLASS}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{chord ? `${label}  ${chord}` : label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Back, forward and new chat, beside the window buttons the shell floats over
 * the title strip.
 *
 * Only macOS hands the strip to the page, and only a shell that exposes its
 * window history gets the controls, so a browser and an older shell render
 * nothing. While they are drawn the stylesheet moves everything that steps
 * aside for the window buttons clear of them as well, keyed on the attribute
 * this sets before paint.
 */
export function DesktopHistoryControls({ host }: { host: HostBridge }) {
  const navigation = useHostNavigation(host);
  const router = useGuardedRouter();
  const drawn = navigation !== null && host.platform.includes('darwin');

  useLayoutEffect(() => {
    if (!drawn) return undefined;
    const root = document.documentElement;
    root.setAttribute(HOST_NAVIGATION_ATTRIBUTE, '');
    return () => root.removeAttribute(HOST_NAVIGATION_ATTRIBUTE);
  }, [drawn]);

  if (!drawn || !navigation) return null;

  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <div
        role="toolbar"
        aria-label="Window history"
        className="fixed left-[var(--agi-window-traffic-inset)] top-0 z-[var(--z-sticky)] flex h-[var(--agi-window-title-strip)] items-center gap-0.5"
      >
        <Control
          label="Back"
          chord={chordFor('host-back', host.platform)}
          disabled={!navigation.canGoBack}
          onClick={() => navigation.go('back')}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Control>
        <Control
          label="Forward"
          chord={chordFor('host-forward', host.platform)}
          disabled={!navigation.canGoForward}
          onClick={() => navigation.go('forward')}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Control>
        <Control
          label="New chat"
          chord={chordFor('host-new-chat', host.platform)}
          onClick={() => router.push(NEW_CHAT_PATH)}
        >
          <SquarePen className="h-4 w-4" aria-hidden="true" />
        </Control>
      </div>
    </TooltipProvider>
  );
}
