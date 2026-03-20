import { useState } from 'react';
import { ChevronDown, Gem, Scale, Zap, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useModelStore, selectSpeedQualityMode } from '../../stores/modelStore';
import type { SpeedQualityMode } from '../../stores/modelStore';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';

interface ModeOption {
  id: SpeedQualityMode;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  pillClassName: string;
  activeClassName: string;
}

const MODE_MAP: Record<SpeedQualityMode, ModeOption> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    description: 'Fastest responses, lower cost',
    Icon: ({ className }) => <Zap className={className} />,
    pillClassName: 'text-emerald-600 dark:text-emerald-400',
    activeClassName:
      'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/20 dark:text-emerald-400',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Best quality for cost tradeoff',
    Icon: ({ className }) => <Scale className={className} />,
    pillClassName: 'text-blue-600 dark:text-blue-400',
    activeClassName:
      'border-blue-500 bg-blue-500/10 text-blue-700 dark:border-blue-500/50 dark:bg-blue-500/20 dark:text-blue-400',
  },
  quality: {
    id: 'quality',
    label: 'Quality',
    description: 'Most capable model, extended thinking',
    Icon: ({ className }) => <Gem className={className} />,
    pillClassName: 'text-amber-600 dark:text-amber-400',
    activeClassName:
      'border-amber-500 bg-amber-500/10 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-400',
  },
};

const MODE_ORDER: SpeedQualityMode[] = ['fast', 'balanced', 'quality'];

export const SpeedQualitySelector = () => {
  const [open, setOpen] = useState(false);

  const speedQualityMode = useModelStore(selectSpeedQualityMode);
  const setSpeedQualityMode = useModelStore((s) => s.setSpeedQualityMode);

  const current = MODE_MAP[speedQualityMode];
  const CurrentIcon = current.Icon;

  const handleSelect = (mode: SpeedQualityMode) => {
    setSpeedQualityMode(mode);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Speed/quality mode: ${current.label}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
            'border-border/60 bg-background hover:bg-accent hover:border-border',
            open && 'bg-accent border-border',
            current.pillClassName,
          )}
        >
          <CurrentIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{current.label}</span>
          <ChevronDown
            className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-56 p-1.5"
        role="listbox"
        aria-label="Speed/quality mode"
      >
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Response mode
        </p>
        <div className="space-y-0.5">
          {MODE_ORDER.map((modeId) => {
            const option = MODE_MAP[modeId];
            const isSelected = speedQualityMode === modeId;
            const OptionIcon = option.Icon;
            return (
              <button
                type="button"
                key={modeId}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(modeId)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-xs transition-colors',
                  isSelected
                    ? option.activeClassName
                    : 'border-transparent text-foreground hover:bg-accent hover:border-border/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <OptionIcon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isSelected ? '' : 'text-muted-foreground',
                    )}
                  />
                  <div className="text-left">
                    <div className="font-medium leading-none">{option.label}</div>
                    <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                      {option.description}
                    </div>
                  </div>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
