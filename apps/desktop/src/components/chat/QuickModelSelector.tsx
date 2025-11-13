import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Star, Clock, Zap, Check } from 'lucide-react';
import { useModelStore, selectFavoriteModelsMetadata, selectRecentModelsMetadata } from '../../stores/modelStore';
import { getModelMetadata, PROVIDER_LABELS } from '../../constants/llm';
import type { Provider } from '../../stores/settingsStore';
import { cn } from '../../lib/utils';

interface QuickModelSelectorProps {
  onModelChange?: (modelId: string, provider: Provider) => void;
  className?: string;
}

export const QuickModelSelector: React.FC<QuickModelSelectorProps> = ({
  onModelChange,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    selectedModel,
    selectedProvider,
    selectModel,
    favorites,
    recentModels,
  } = useModelStore();

  const favoriteModels = useModelStore(selectFavoriteModelsMetadata);
  const recentModelsMeta = useModelStore(selectRecentModelsMetadata);

  const currentModel = selectedModel ? getModelMetadata(selectedModel) : null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleModelSelect = async (modelId: string, provider: Provider) => {
    await selectModel(modelId, provider);
    onModelChange?.(modelId, provider);
    setIsOpen(false);
  };

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
          'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600',
          'hover:bg-gray-50 dark:hover:bg-gray-700',
          'focus:ring-2 focus:ring-blue-500 focus:outline-none',
        )}
      >
        {currentModel ? (
          <>
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {currentModel.name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {currentModel.provider}
              </span>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-gray-500 transition-transform flex-shrink-0',
                isOpen && 'rotate-180',
              )}
            />
          </>
        ) : (
          <>
            <span className="text-sm text-gray-500 dark:text-gray-400">Select Model</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-gray-500 transition-transform',
                isOpen && 'rotate-180',
              )}
            />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute top-full mt-2 right-0 w-80 bg-white dark:bg-gray-800',
            'border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg',
            'max-h-[500px] overflow-y-auto z-50',
          )}
        >
          {/* Favorites Section */}
          {favoriteModels.length > 0 && (
            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
                <Star className="h-3 w-3" />
                <span>Favorites</span>
              </div>
              {favoriteModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleModelSelect(model.id, model.provider)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg',
                    'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left',
                    selectedModel === model.id && 'bg-blue-50 dark:bg-blue-900/20',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {model.name}
                      </span>
                      {model.speed === 'very-fast' && (
                        <Zap className="h-3 w-3 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {PROVIDER_LABELS[model.provider]}
                    </div>
                  </div>
                  {selectedModel === model.id && (
                    <Check className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Recent Section */}
          {recentModelsMeta.length > 0 && (
            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
                <Clock className="h-3 w-3" />
                <span>Recent</span>
              </div>
              {recentModelsMeta.map((model) => {
                // Skip if already in favorites (to avoid duplication)
                if (favorites.includes(model.id)) return null;

                return (
                  <button
                    key={model.id}
                    onClick={() => handleModelSelect(model.id, model.provider)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 rounded-lg',
                      'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left',
                      selectedModel === model.id && 'bg-blue-50 dark:bg-blue-900/20',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {model.name}
                        </span>
                        {model.speed === 'very-fast' && (
                          <Zap className="h-3 w-3 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {PROVIDER_LABELS[model.provider]}
                      </div>
                    </div>
                    {selectedModel === model.id && (
                      <Check className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Browse All Models Link */}
          <div className="p-2">
            <button
              onClick={() => {
                setIsOpen(false);
                // TODO: Open full model selector in settings
                console.log('Open full model selector');
              }}
              className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-center"
            >
              Browse All Models →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
