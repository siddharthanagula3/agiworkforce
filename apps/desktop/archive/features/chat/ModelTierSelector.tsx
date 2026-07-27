import { Brain, Sparkles, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ModelTier = 'instant' | 'latest' | 'thinking';

interface TierConfig {
  label: string;
  description: string;
  Icon: React.ElementType;
}

const TIER_CONFIG: Record<ModelTier, TierConfig> = {
  instant: {
    label: 'Instant',
    description: 'Fastest response',
    Icon: Zap,
  },
  latest: {
    label: 'Latest',
    description: 'Recommended',
    Icon: Sparkles,
  },
  thinking: {
    label: 'Thinking',
    description: 'Most capable',
    Icon: Brain,
  },
};

const TIERS: ModelTier[] = ['instant', 'latest', 'thinking'];

interface ModelTierSelectorProps {
  activeTier: ModelTier | null;
  onTierSelect: (tier: ModelTier) => void;
  className?: string;
}

export const ModelTierSelector = ({
  activeTier,
  onTierSelect,
  className,
}: ModelTierSelectorProps) => {
  return (
    <div
      className={cn('flex items-center gap-1 rounded-lg bg-white/5 p-0.5', className)}
      role="radiogroup"
      aria-label="Model tier"
    >
      {TIERS.map((tier) => {
        const { label, description, Icon } = TIER_CONFIG[tier];
        const isActive = activeTier === tier;

        return (
          <button
            key={tier}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={description}
            onClick={() => onTierSelect(tier)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              isActive ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/75',
            )}
          >
            <Icon size={12} className="shrink-0" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
};
