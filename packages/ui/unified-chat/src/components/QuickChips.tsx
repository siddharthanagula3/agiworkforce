import { Code2, PenLine, Search, Image, Film, Monitor } from 'lucide-react';
import { quickStartIntentLabel } from '@agiworkforce/types';
import { useChatStore } from '../stores/chatStore';
import type { ActiveMode } from '../stores/chatStore';

export type ChipType = NonNullable<ActiveMode>;

export type QuickChipsMode = 'four' | 'six';

export type QuickChipAvailability = Partial<Record<ChipType, boolean>>;

interface QuickChipsProps {
  onChipClick: (chip: NonNullable<ActiveMode>) => void;
  mode?: QuickChipsMode;
  /**
   * An explicitly false capability hides its quick action. Missing values
   * preserve the existing defaults for hosts that have not declared support.
   */
  availability?: QuickChipAvailability;
}

type ChipDef = { type: NonNullable<ActiveMode>; label: string; icon: React.ReactNode };

/**
 * Labels come from the shared quick-start vocabulary in @agiworkforce/types so
 * this surface and the web greeting cannot introduce the product with different
 * words again. Icons stay here because they are React nodes and the vocabulary
 * module is deliberately framework-free (mobile imports it too).
 *
 * The ACTION still differs by surface and that is intended: these chips toggle a
 * mode in the unified-chat store, while web prefills its composer, because the
 * two surfaces keep separate chat stores. Shared words, surface-appropriate
 * behaviour.
 */
const SIX_CHIPS: ChipDef[] = [
  { type: 'code', label: quickStartIntentLabel('code'), icon: <Code2 size={13} /> },
  { type: 'write', label: quickStartIntentLabel('write'), icon: <PenLine size={13} /> },
  { type: 'research', label: quickStartIntentLabel('research'), icon: <Search size={13} /> },
  { type: 'image', label: quickStartIntentLabel('image'), icon: <Image size={13} /> },
  { type: 'video', label: quickStartIntentLabel('video'), icon: <Film size={13} /> },
  { type: 'computer', label: quickStartIntentLabel('computer'), icon: <Monitor size={13} /> },
];

const FOUR_CHIPS: ChipDef[] = SIX_CHIPS.slice(0, 4);

export function QuickChips({ onChipClick, mode = 'six', availability }: QuickChipsProps) {
  const activeMode = useChatStore((s) => s.activeMode);
  const setActiveMode = useChatStore((s) => s.setActiveMode);
  const chips = (mode === 'four' ? FOUR_CHIPS : SIX_CHIPS).filter(
    (chip) => availability?.[chip.type] !== false,
  );

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
