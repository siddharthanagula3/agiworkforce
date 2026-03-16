import {
  Brain,
  Check,
  Crown,
  DollarSign,
  Search,
  Sparkles,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  getModelMetadata,
  getAllowedAutoModesForTier,
  isModelAllowedForTier,
  PROVIDER_LABELS,
  PROVIDERS_IN_ORDER,
  type ModelMetadata,
} from '@/constants/llm';
import { cn } from '@/lib/utils';
import { useModelStore, AVAILABLE_MODELS } from '@shared/stores/model-store';
import { useUserProfileStore } from '@shared/stores/user-profile-store';

export type QuickModelSelectorProps = {
  className?: string;
  onClose?: () => void;
};

const AUTO_ECONOMY_ID = 'auto-economy';
const AUTO_BALANCED_ID = 'auto-balanced';
const AUTO_PREMIUM_ID = 'auto-premium';

const AUTO_IDS = new Set([AUTO_ECONOMY_ID, AUTO_BALANCED_ID, AUTO_PREMIUM_ID]);

const AUTO_MODE_CONFIG: Record<
  string,
  { name: string; description: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  [AUTO_ECONOMY_ID]: {
    name: 'Auto (Economy)',
    description: 'Fastest, most cost-effective',
    icon: DollarSign,
  },
  [AUTO_BALANCED_ID]: {
    name: 'Auto (Balanced)',
    description: 'Quality/cost sweet spot',
    icon: Zap,
  },
  [AUTO_PREMIUM_ID]: {
    name: 'Auto (Premium)',
    description: 'Maximum performance',
    icon: Crown,
  },
};

const QUALITY_TIER_LABELS: Record<string, { text: string; className: string }> = {
  fast: { text: 'Fast', className: 'text-emerald-600 dark:text-emerald-400' },
  balanced: { text: 'Balanced', className: 'text-blue-600 dark:text-blue-400' },
  best: { text: 'Best', className: 'text-amber-600 dark:text-amber-400' },
};

function getQualityLabel(tier: string | undefined) {
  return QUALITY_TIER_LABELS[tier ?? ''] ?? { text: '', className: '' };
}

export const QuickModelSelector = ({ className, onClose }: QuickModelSelectorProps) => {
  const { selectedModelId, thinkingEnabled, setSelectedModelId, setThinkingEnabled } =
    useModelStore();
  const userPlan = useUserProfileStore((state) => state.user?.plan) ?? 'free';

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isAutoMode = AUTO_IDS.has(selectedModelId);

  const availableAutoModes = useMemo(
    () => getAllowedAutoModesForTier(userPlan),
    [userPlan],
  );

  const modelGroups = useMemo(() => {
    const groups: Record<string, ModelMetadata[]> = {};
    const query = searchQuery.toLowerCase().trim();

    for (const p of PROVIDERS_IN_ORDER) {
      groups[p] = [];
    }

    for (const model of AVAILABLE_MODELS) {
      const providerKey = model.provider.toLowerCase();
      if (!groups[providerKey]) {
        groups[providerKey] = [];
      }

      if (!isModelAllowedForTier(model.id, userPlan)) continue;

      const metadata = getModelMetadata(model.id);
      if (!metadata) continue;

      if (query) {
        const matchesName = metadata.name.toLowerCase().includes(query);
        const matchesId = metadata.id.toLowerCase().includes(query);
        const matchesProvider = metadata.provider.toLowerCase().includes(query);
        const matchesBestFor = metadata.bestFor?.some((tag) =>
          tag.toLowerCase().includes(query),
        );
        if (!matchesName && !matchesId && !matchesProvider && !matchesBestFor) continue;
      }

      groups[providerKey]!.push(metadata);
    }

    return groups;
  }, [searchQuery, userPlan]);

  const handleSelectModel = (modelId: string) => {
    if (AUTO_IDS.has(modelId)) {
      setSelectedModelId(modelId);
      onClose?.();
      return;
    }
    setSelectedModelId(modelId);
    onClose?.();
  };

  const currentMetadata = selectedModelId ? getModelMetadata(selectedModelId) : null;
  const supportsThinking = currentMetadata?.capabilities?.thinking ?? false;

  const noResults =
    searchQuery !== '' && Object.values(modelGroups).every((models) => models.length === 0);

  return (
    <div
      className={cn(
        'w-72 rounded-xl border border-gray-200/70 bg-white/95 p-3 text-left shadow-2xl backdrop-blur-xl',
        'dark:border-gray-700 dark:bg-[#1a1a2e]/95',
        className,
      )}
    >
      <div className="flex items-center justify-between pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Models
        </p>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">Choose a provider</span>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search models..."
          className={cn(
            'w-full pl-7 pr-7 py-1.5 text-xs rounded-lg border transition-colors',
            'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50',
          )}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              searchInputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Auto Selection */}
      {!searchQuery && (
        <div className="mb-2 space-y-1">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Auto Selection
          </div>
          {availableAutoModes.map((modeId) => {
            const config = AUTO_MODE_CONFIG[modeId];
            if (!config) return null;
            const isSelected = selectedModelId === modeId;
            const IconComponent = config.icon;
            return (
              <button
                type="button"
                key={modeId}
                onClick={() => handleSelectModel(modeId)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors',
                  isSelected
                    ? 'border-amber-500 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-600 dark:border-amber-500/50 dark:from-amber-500/20 dark:to-orange-500/20 dark:text-amber-400'
                    : 'border-gray-200 bg-white text-gray-900 hover:border-primary/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-primary/40 dark:hover:bg-gray-700',
                )}
              >
                <div className="flex items-center gap-2">
                  <IconComponent
                    size={14}
                    className={isSelected ? 'text-amber-500' : 'text-gray-500'}
                  />
                  <div className="text-left">
                    <div className="font-medium">{config.name}</div>
                    <div className="text-[9px] text-gray-500 dark:text-gray-400">
                      {config.description}
                    </div>
                  </div>
                </div>
                {isSelected && <Check size={14} className="text-amber-500" />}
              </button>
            );
          })}

          {isAutoMode && (
            <div className="ml-6 mt-1 rounded-md bg-gray-50 px-3 py-1.5 text-[10px] dark:bg-gray-800">
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                <Sparkles size={10} className="text-amber-500" />
                <span>Best model selected automatically for each request</span>
              </div>
            </div>
          )}
        </div>
      )}

      <hr className="my-2 border-gray-200 dark:border-gray-700" />

      {/* Model list */}
      <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
        {noResults && (
          <div className="py-6 text-center">
            <Search size={24} className="mx-auto mb-2 text-gray-400" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No models found for &quot;{searchQuery}&quot;
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 text-[10px] text-primary hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {PROVIDERS_IN_ORDER.map((provider) => {
          const models = modelGroups[provider] ?? [];
          if (models.length === 0) return null;
          const providerLabel = PROVIDER_LABELS[provider] ?? provider;

          return (
            <div key={provider} className="space-y-1">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {providerLabel}
              </div>
              <div className="flex flex-col gap-1">
                {models.map((model) => {
                  const isActive = model.id === selectedModelId;
                  const qualityLabel = getQualityLabel(model.qualityTier);

                  return (
                    <button
                      type="button"
                      key={model.id}
                      onClick={() => handleSelectModel(model.id)}
                      title={model.name}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-xs transition-colors',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary shadow-sm dark:border-primary/50 dark:bg-primary/20'
                          : 'border-gray-200 bg-white text-gray-900 hover:border-primary/50 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-primary/40 dark:hover:bg-gray-700',
                      )}
                    >
                      <span className="flex items-center gap-1 truncate">
                        <span className="truncate">{model.name}</span>
                        <span className="flex items-center gap-0.5 shrink-0">
                          {model.capabilities?.tools && (
                            <span aria-label="Tool use">
                              <Wand2 size={10} className="text-blue-500 dark:text-blue-400" />
                            </span>
                          )}
                          {model.capabilities?.thinking && (
                            <span aria-label="Extended thinking">
                              <Brain size={10} className="text-purple-500 dark:text-purple-400" />
                            </span>
                          )}
                          {model.capabilities?.vision && (
                            <span aria-label="Vision">
                              <Sparkles size={10} className="text-amber-500 dark:text-amber-400" />
                            </span>
                          )}
                          {model.capabilities?.search && (
                            <span aria-label="Web search">
                              <Search size={10} className="text-green-500 dark:text-green-400" />
                            </span>
                          )}
                        </span>
                      </span>
                      {isActive ? (
                        <Check size={14} className="text-primary shrink-0" />
                      ) : (
                        <span className={cn('text-[10px] font-medium shrink-0', qualityLabel.className)}>
                          {qualityLabel.text}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Thinking toggle */}
      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          disabled={!supportsThinking}
          onClick={() => {
            if (!supportsThinking) return;
            setThinkingEnabled(!thinkingEnabled);
          }}
          title={supportsThinking ? 'Toggle extended thinking' : 'This model does not support thinking mode'}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-2 py-1 text-[10px] transition-colors',
            thinkingEnabled && supportsThinking
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800',
            !supportsThinking && 'opacity-50 cursor-not-allowed',
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            <Brain size={12} />
            <span>Thinking Mode</span>
          </div>
          <div
            className={cn(
              'h-3.5 w-6 rounded-full p-0.5 transition-colors',
              thinkingEnabled && supportsThinking ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600',
            )}
          >
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform',
                thinkingEnabled && supportsThinking ? 'translate-x-2.5' : 'translate-x-0',
              )}
            />
          </div>
        </button>
      </div>
    </div>
  );
};

export default QuickModelSelector;
