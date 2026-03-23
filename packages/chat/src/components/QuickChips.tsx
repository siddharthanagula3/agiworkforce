import { Code2, PenLine, FlaskConical, Zap, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

export type ChipType = 'code' | 'write' | 'research' | 'skills' | 'web';

interface Chip {
  type: ChipType;
  label: string;
  icon: React.ReactNode;
}

const CHIPS: Chip[] = [
  { type: 'code', label: 'Code', icon: <Code2 size={14} /> },
  { type: 'write', label: 'Write', icon: <PenLine size={14} /> },
  { type: 'research', label: 'Research', icon: <FlaskConical size={14} /> },
  { type: 'skills', label: 'Skills', icon: <Zap size={14} /> },
  { type: 'web', label: 'Web', icon: <Globe size={14} /> },
];

interface QuickChipsProps {
  onChipClick: (type: ChipType) => void;
  className?: string;
}

export function QuickChips({ onChipClick, className }: QuickChipsProps) {
  return (
    <div className={cn('flex items-center justify-center gap-2 px-4 pb-2', className)}>
      {CHIPS.map((chip, index) => (
        <button
          key={chip.type}
          type="button"
          onClick={() => onChipClick(chip.type)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-[var(--chat-border)]',
            'px-3 py-1.5 text-sm text-[var(--chat-text-secondary)]',
            'transition-colors duration-150 hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
            'animate-fade-in',
          )}
          style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
        >
          {chip.icon}
          <span>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}
