'use client';

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { ChevronDown, Zap, Sparkles, Crown, Check, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { useChatStore, AUTO_MODELS, type ModelTier } from '@/stores/chatStore';

interface Model {
  id: string;
  object: string;
  owned_by: string;
  tier: string;
  context_window?: number;
  max_output?: number;
}

interface ModelSelectorProps {
  className?: string;
}

// Display names for providers
const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  alibaba: 'Alibaba',
  moonshot: 'Moonshot',
  perplexity: 'Perplexity',
};

// Provider colors
const PROVIDER_COLORS: Record<string, string> = {
  openai: 'text-green-500',
  anthropic: 'text-amber-500',
  google: 'text-blue-500',
  deepseek: 'text-cyan-500',
  xai: 'text-purple-500',
  alibaba: 'text-orange-500',
  moonshot: 'text-pink-500',
  perplexity: 'text-teal-500',
};

// Tier badges
const TIER_BADGES: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  economy: { icon: Zap, color: 'text-green-500 bg-green-500/10', label: 'Economy' },
  balanced: { icon: Sparkles, color: 'text-blue-500 bg-blue-500/10', label: 'Balanced' },
  premium: { icon: Crown, color: 'text-amber-500 bg-amber-500/10', label: 'Premium' },
};

// Get tier from model tier name
function getModelTierCategory(tier: string): ModelTier {
  switch (tier.toLowerCase()) {
    case 'hobby':
    case 'free':
      return 'economy';
    case 'pro':
      return 'balanced';
    case 'max':
    case 'enterprise':
      return 'premium';
    default:
      return 'balanced';
  }
}

export const ModelSelector = memo(function ModelSelector({ className = '' }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModel = useChatStore((state) => state.selectedModel);
  const selectedModelTier = useChatStore((state) => state.selectedModelTier);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);

  // Fetch available models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const { getSupabaseClient } = await import('@/services/supabase');
        const supabase = getSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const headers: HeadersInit = {};
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }

        const response = await fetch('/api/llm/v1/models', { headers });
        if (response.ok) {
          const data = await response.json();
          setModels(data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get display name for selected model
  const getSelectedDisplayName = useCallback(() => {
    if (selectedModel.startsWith('auto-')) {
      const autoModel = AUTO_MODELS[selectedModel as keyof typeof AUTO_MODELS];
      return autoModel?.name || 'Auto';
    }
    return selectedModel;
  }, [selectedModel]);

  // Handle model selection
  const handleSelectModel = useCallback(
    (modelId: string, tier: ModelTier) => {
      setSelectedModel(modelId, tier);
      setIsOpen(false);
    },
    [setSelectedModel],
  );

  // Group models by provider
  const groupedModels = React.useMemo(() => {
    const groups: Record<string, Model[]> = {};
    for (const model of models) {
      const provider = model.owned_by;
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(model);
    }
    return groups;
  }, [models]);

  const currentTierBadge = TIER_BADGES[selectedModelTier] || TIER_BADGES.balanced;
  const TierIcon = currentTierBadge.icon;

  return (
    <div className={clsx('relative', className)} ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg',
          'bg-gray-100 dark:bg-charcoal-800',
          'hover:bg-gray-200 dark:hover:bg-charcoal-700',
          'border border-gray-200 dark:border-gray-700',
          'text-sm font-medium text-gray-700 dark:text-gray-300',
          'transition-colors duration-200',
        )}
      >
        <span className={clsx('p-1 rounded', currentTierBadge.color)}>
          <TierIcon className="w-3.5 h-3.5" />
        </span>
        <span className="truncate max-w-[150px]">{getSelectedDisplayName()}</span>
        <ChevronDown className={clsx('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={clsx(
            'absolute top-full right-0 mt-1 z-50',
            'w-[320px] max-h-[70vh] overflow-y-auto',
            'bg-white dark:bg-charcoal-800',
            'border border-gray-200 dark:border-gray-700/50',
            'rounded-xl shadow-xl',
            'animate-in fade-in slide-in-from-top-2 duration-200',
          )}
        >
          {/* Auto modes */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1">
              Auto Selection
            </p>
            {Object.entries(AUTO_MODELS).map(([id, model]) => {
              const badge = TIER_BADGES[model.tier];
              const BadgeIcon = badge.icon;
              const isSelected = selectedModel === id;

              return (
                <button
                  key={id}
                  onClick={() => handleSelectModel(id, model.tier)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left',
                    'hover:bg-gray-100 dark:hover:bg-charcoal-700',
                    'transition-colors duration-150',
                    isSelected && 'bg-teal-50 dark:bg-teal-900/30',
                  )}
                >
                  <span className={clsx('p-1.5 rounded', badge.color)}>
                    <BadgeIcon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {model.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-normal">
                      {model.description}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-teal-500" />}
                </button>
              );
            })}
          </div>

          {/* Specific models */}
          {isLoading ? (
            <div className="p-4 text-center text-sm text-gray-500">Loading models...</div>
          ) : (
            <div className="p-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1">
                Specific Models
              </p>
              {Object.entries(groupedModels).map(([provider, providerModels]) => (
                <div key={provider} className="mt-2 first:mt-0">
                  <p
                    className={clsx(
                      'text-xs font-semibold px-2 py-1',
                      PROVIDER_COLORS[provider] || 'text-gray-500',
                    )}
                  >
                    {PROVIDER_NAMES[provider] || provider}
                  </p>
                  {providerModels.map((model) => {
                    const tier = getModelTierCategory(model.tier);
                    const badge = TIER_BADGES[tier];
                    const BadgeIcon = badge.icon;
                    const isSelected = selectedModel === model.id;
                    const isLocked = false; // Models are already filtered by tier on the server

                    return (
                      <button
                        key={model.id}
                        onClick={() => !isLocked && handleSelectModel(model.id, tier)}
                        disabled={isLocked}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left',
                          'hover:bg-gray-100 dark:hover:bg-gray-700',
                          'transition-colors duration-150',
                          isSelected && 'bg-blue-50 dark:bg-blue-900/30',
                          isLocked && 'opacity-50 cursor-not-allowed',
                        )}
                      >
                        <span className={clsx('p-1 rounded', badge.color)}>
                          <BadgeIcon className="w-3.5 h-3.5" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {model.id}
                          </p>
                          {model.context_window && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {(model.context_window / 1000).toFixed(0)}k context
                            </p>
                          )}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-teal-500" />}
                        {isLocked && <Lock className="w-4 h-4 text-gray-400" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ModelSelector;
