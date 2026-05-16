import { Code2, PenLine, Search, Image, Film, Monitor } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import type { ActiveMode } from '../stores/chatStore';

export type ChipType = NonNullable<ActiveMode>;

export type QuickChipsMode = 'four' | 'six';

interface QuickChipsProps {
  onChipClick: (chip: NonNullable<ActiveMode>) => void;
  mode?: QuickChipsMode;
}

type ChipDef = { type: NonNullable<ActiveMode>; label: string; icon: React.ReactNode };

const SIX_CHIPS: ChipDef[] = [
  { type: 'code', label: 'Code', icon: <Code2 size={13} /> },
  { type: 'write', label: 'Write', icon: <PenLine size={13} /> },
  { type: 'research', label: 'Research', icon: <Search size={13} /> },
  { type: 'image', label: 'Image', icon: <Image size={13} /> },
  { type: 'video', label: 'Video', icon: <Film size={13} /> },
  { type: 'computer', label: 'Computer', icon: <Monitor size={13} /> },
];

const FOUR_CHIPS: ChipDef[] = SIX_CHIPS.slice(0, 4);

export function QuickChips({ onChipClick, mode = 'six' }: QuickChipsProps) {
  const activeMode = useChatStore((s) => s.activeMode);
  const setActiveMode = useChatStore((s) => s.setActiveMode);
  const chips = mode === 'four' ? FOUR_CHIPS : SIX_CHIPS;

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
