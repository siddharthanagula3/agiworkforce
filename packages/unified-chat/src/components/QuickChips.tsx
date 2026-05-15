import { Code2, PenLine, GraduationCap, Coffee } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import type { ActiveMode } from '../stores/chatStore';

export type ChipType = NonNullable<ActiveMode>;

interface QuickChipsProps {
  onChipClick: (chip: NonNullable<ActiveMode>) => void;
}

const chips: { type: NonNullable<ActiveMode>; label: string; icon: React.ReactNode }[] = [
  { type: 'code', label: 'Code', icon: <Code2 size={13} /> },
  { type: 'write', label: 'Write', icon: <PenLine size={13} /> },
  { type: 'learn', label: 'Learn', icon: <GraduationCap size={13} /> },
  { type: 'life', label: 'Life stuff', icon: <Coffee size={13} /> },
];

export function QuickChips({ onChipClick }: QuickChipsProps) {
  const activeMode = useChatStore((s) => s.activeMode);
  const setActiveMode = useChatStore((s) => s.setActiveMode);

  const handleClick = (type: NonNullable<ActiveMode>) => {
    const next = activeMode === type ? null : type;
    setActiveMode(next);
    if (next) onChipClick(next);
  };

  return (
    <div className="flex flex-wrap gap-2 justify-center pt-2 pb-1">
      {chips.map((chip) => (
        <button
          key={chip.type}
          type="button"
          onClick={() => handleClick(chip.type)}
          className={
            activeMode === chip.type
              ? 'inline-flex items-center gap-1.5 h-[34px] px-3 rounded-full text-[13px] border border-[var(--chat-accent-primary)]/40 bg-[var(--chat-accent-primary)]/20 text-[var(--chat-accent-primary)] transition-colors'
              : 'inline-flex items-center gap-1.5 h-[34px] px-3 rounded-full text-[13px] border border-[var(--chat-border)] bg-[var(--chat-surface-base)] hover:bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)] transition-colors'
          }
        >
          {chip.icon}
          {chip.label}
        </button>
      ))}
    </div>
  );
}
