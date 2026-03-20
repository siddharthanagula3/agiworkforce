/**
 * QuickStartPills Component
 *
 * Two rows of action pills shown in the empty chat state.
 * Each pill populates the chat input with a starter prompt
 * or triggers a specific app feature via the provided callback.
 *
 * Row 1: Code, Write, Research, Create Image
 * Row 2: From Drive, Search the Web, Terminal, Create Video
 */

import React from 'react';
import {
  Code,
  Pen,
  Search,
  Image,
  HardDrive,
  Globe,
  Terminal,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface PillDefinition {
  label: string;
  icon: LucideIcon;
  /** The action key passed to onPillClick. */
  action: string;
  /** Starter text injected into the chat input when the pill is clicked. */
  prompt: string;
}

const ROW_ONE: PillDefinition[] = [
  {
    label: 'Code',
    icon: Code,
    action: 'code',
    prompt: 'Help me write code for ',
  },
  {
    label: 'Write',
    icon: Pen,
    action: 'write',
    prompt: 'Help me write ',
  },
  {
    label: 'Research',
    icon: Search,
    action: 'research',
    prompt: 'Research and summarize information about ',
  },
  {
    label: 'Create Image',
    icon: Image,
    action: 'create-image',
    prompt: '/imagine ',
  },
];

const ROW_TWO: PillDefinition[] = [
  {
    label: 'From Drive',
    icon: HardDrive,
    action: 'from-drive',
    prompt: 'Read and analyze the file at ',
  },
  {
    label: 'Search the Web',
    icon: Globe,
    action: 'search-web',
    prompt: 'Search the web for ',
  },
  {
    label: 'Terminal',
    icon: Terminal,
    action: 'terminal',
    prompt: '/terminal ',
  },
  {
    label: 'Create Video',
    icon: Video,
    action: 'create-video',
    prompt: 'Create a video about ',
  },
];

interface QuickStartPillsProps {
  onPillClick: (action: string, prompt: string) => void;
  className?: string;
}

const PillRow: React.FC<{
  pills: PillDefinition[];
  onPillClick: (action: string, prompt: string) => void;
}> = ({ pills, onPillClick }) => (
  <div className="flex items-center justify-center gap-2 flex-wrap">
    {pills.map((pill) => {
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
);

export const QuickStartPills: React.FC<QuickStartPillsProps> = ({ onPillClick, className }) => (
  <div className={cn('flex flex-col items-center gap-2.5 w-full', className)}>
    <PillRow pills={ROW_ONE} onPillClick={onPillClick} />
    <PillRow pills={ROW_TWO} onPillClick={onPillClick} />
  </div>
);
