export type ChipType = 'code' | 'write' | 'research' | 'skills' | 'web';

interface QuickChipsProps {
  onChipClick: (chip: ChipType) => void;
}

const chips: { type: ChipType; label: string }[] = [
  { type: 'code', label: 'Code' },
  { type: 'write', label: 'Write' },
  { type: 'research', label: 'Research' },
  { type: 'web', label: 'Web Search' },
  { type: 'skills', label: 'Skills' },
];

export function QuickChips({ onChipClick }: QuickChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center pb-3">
      {chips.map((chip) => (
        <button
          key={chip.type}
          type="button"
          onClick={() => onChipClick(chip.type)}
          className="px-3 py-1.5 rounded-full text-xs bg-[var(--chat-surface-hover)] hover:bg-[var(--chat-accent-primary)]/10 text-[var(--chat-text-muted)] transition-colors"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
