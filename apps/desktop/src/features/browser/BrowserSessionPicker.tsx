import {
  BROWSER_SESSION_KINDS,
  browserSessionCapability,
  type BrowserSessionKind,
} from '@agiworkforce/types';
import { Cloud, Globe, MonitorPlay } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SessionPresentation {
  label: string;
  description: string;
  icon: LucideIcon;
}

const PRESENTATION: Record<BrowserSessionKind, SessionPresentation> = {
  'user-chrome': {
    label: 'Your Chrome',
    description:
      'Runs in the browser you are signed in to, through the AGI extension. Start it from Chrome, not from here.',
    icon: Globe,
  },
  'built-in': {
    label: 'Built-in browser',
    description:
      'A separate profile on this machine. Watch every step here, and it closes with the app.',
    icon: MonitorPlay,
  },
  cloud: {
    label: 'Cloud browser',
    description: 'An isolated browser that keeps working after you disconnect.',
    icon: Cloud,
  },
};

interface BrowserSessionPickerProps {
  value: BrowserSessionKind;
  onChange: (kind: BrowserSessionKind) => void;
  className?: string;
}

export function BrowserSessionPicker({ value, onChange, className }: BrowserSessionPickerProps) {
  return (
    <div role="radiogroup" aria-label="Browser session" className={cn('space-y-1.5', className)}>
      {BROWSER_SESSION_KINDS.map((kind) => {
        const capability = browserSessionCapability(kind);
        const { label, description, icon: Icon } = PRESENTATION[kind];
        const selected = value === kind;
        const reasonId = capability.unavailableReason
          ? `browser-session-${kind}-reason`
          : undefined;

        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-describedby={reasonId}
            disabled={!capability.available}
            onClick={() => onChange(kind)}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
              selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20',
              !capability.available && 'cursor-not-allowed opacity-60 hover:bg-transparent',
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 space-y-0.5">
              <span className="block text-xs font-medium text-foreground">{label}</span>
              <span className="block text-xs text-muted-foreground">{description}</span>
              {capability.unavailableReason && (
                <span id={reasonId} className="block text-xs text-muted-foreground">
                  {capability.unavailableReason}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
