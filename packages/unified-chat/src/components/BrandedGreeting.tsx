/**
 * BrandedGreeting Component — Phase A Slice 5 (ported from UAC)
 *
 * Personalized, time-aware greeting shown in the empty chat state.
 * User name injected via optional prop (host provides from its auth store).
 */

import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface GreetingTemplate {
  headline: (name: string | null) => string;
  subline: string;
}

const MORNING_GREETINGS: GreetingTemplate[] = [
  {
    headline: (name) => (name ? `Good morning, ${name}` : 'Good morning'),
    subline: 'What are we accomplishing today?',
  },
  {
    headline: (name) => (name ? `Rise and shine, ${name}` : 'Rise and shine'),
    subline: 'Your AI workforce is ready to start the day.',
  },
];

const AFTERNOON_GREETINGS: GreetingTemplate[] = [
  {
    headline: (name) => (name ? `Good afternoon, ${name}` : 'Good afternoon'),
    subline: 'What can we get done?',
  },
  {
    headline: (name) => (name ? `Hi ${name}` : 'Hello'),
    subline: 'Your AI workforce is standing by.',
  },
];

const EVENING_GREETINGS: GreetingTemplate[] = [
  {
    headline: (name) => (name ? `Good evening, ${name}` : 'Good evening'),
    subline: 'Working late? Your workforce never sleeps.',
  },
  {
    headline: (name) => (name ? `Hi ${name}` : 'Hello'),
    subline: 'What shall we tackle tonight?',
  },
];

function getGreeting(name: string | null): { headline: string; subline: string } {
  const hour = new Date().getHours();

  let pool: GreetingTemplate[];
  if (hour >= 5 && hour < 12) {
    pool = MORNING_GREETINGS;
  } else if (hour >= 12 && hour < 18) {
    pool = AFTERNOON_GREETINGS;
  } else {
    pool = EVENING_GREETINGS;
  }

  // Use the minute hand to pick a stable-but-rotated entry within a session.
  const index = new Date().getMinutes() % pool.length;
  const template = pool[index] ?? pool[0]!;

  return {
    headline: template.headline(name),
    subline: template.subline,
  };
}

export interface BrandedGreetingProps {
  /** User's first name (optional — host provides from its auth store). */
  userName?: string | null;
  className?: string;
}

export const BrandedGreeting: React.FC<BrandedGreetingProps> = ({ userName = null, className }) => {
  const firstName = useMemo(() => {
    if (!userName) return null;
    // Take only the first word of the display name for a friendlier greeting
    return userName.split(' ')[0] ?? null;
  }, [userName]);

  const { headline, subline } = useMemo(() => getGreeting(firstName), [firstName]);

  return (
    <div className={cn('flex flex-col items-center gap-3 text-center select-none', className)}>
      {/* Animated brand icon */}
      <div
        className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-500/20"
        aria-hidden="true"
      >
        <Sparkles className="h-6 w-6 text-violet-400 animate-pulse" />
      </div>

      {/* Headline */}
      <h1 className="text-2xl font-semibold text-white/90 tracking-tight leading-tight">
        {headline}
      </h1>

      {/* Branded sub-tagline */}
      <p className="text-sm text-white/40 font-medium">{subline}</p>

      {/* Platform tagline */}
      <p className="text-xs text-white/30 italic mt-1">
        Beyond one model. Beyond one surface. AGI in your hands.
      </p>
    </div>
  );
};
