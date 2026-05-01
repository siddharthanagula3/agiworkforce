/**
 * QuickStartPills Component
 *
 * Quick action pills shown in the empty chat state.
 * Each pill populates the composer or opens the matching surface.
 *
 * Product source of truth target: Research, Browser, Code, Write, Skills.
 */

import React from 'react';
import { Code, Pen, Search, Globe, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PillDefinition {
  label: string;
  icon: LucideIcon;
  /** The action key passed to onPillClick. */
  action: string;
  /** Starter text injected into the chat input when the pill is clicked. */
  prompt: string;
}

const PILLS: PillDefinition[] = [
  {
    label: 'Research',
    icon: Search,
    action: 'research',
    prompt:
      'Research this topic deeply, compare the strongest alternatives, cite sources, and end with an executive summary: ',
  },
  {
    label: 'Browser',
    icon: Globe,
    action: 'web',
    prompt:
      'Use the browser to complete this workflow, ask before risky actions, and summarize each step: ',
  },
  {
    label: 'Code',
    icon: Code,
    action: 'code',
    prompt:
      'Inspect this project, explain the safest implementation plan, then make the code change for: ',
  },
  {
    label: 'Write',
    icon: Pen,
    action: 'write',
    prompt:
      'Draft a polished investor-ready update with crisp structure, risks, and next steps about: ',
  },
  {
    label: 'Skills',
    icon: Sparkles,
    action: 'skills',
    prompt: '',
  },
];

interface QuickStartPillsProps {
  onPillClick: (action: string, prompt: string) => void;
  className?: string;
}

export const QuickStartPills: React.FC<QuickStartPillsProps> = ({ onPillClick, className }) => (
  <div className={cn('flex flex-col items-center gap-2.5 w-full', className)}>
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {PILLS.map((pill) => {
        const Icon = pill.icon;
        return (
          <button
            key={pill.action}
            type="button"
            onClick={() => onPillClick(pill.action, pill.prompt)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium',
              'bg-white/5 hover:bg-white/10 border border-white/10',
              'text-white/70 hover:text-white/95',
              'transition-colors duration-150 cursor-pointer select-none shrink-0',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{pill.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);
