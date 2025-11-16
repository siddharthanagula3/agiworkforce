import React, { useState } from 'react';
import { Star, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';
import {
  getAllModels,
  getProviderModels,
  PROVIDER_LABELS,
  PROVIDERS_IN_ORDER,
} from '../../constants/llm';
import type { Provider } from '../../stores/settingsStore';
import { cn } from '../../lib/utils';

export const FavoriteModelsSelector: React.FC = () => {
  const favorites = useModelStore((s) => s.favorites);
  const toggleFavorite = useModelStore((s) => s.toggleFavorite);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<Set<Provider>>(
    new Set(PROVIDERS_IN_ORDER),
  );

  const toggleProvider = (provider: Provider) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const filteredModels = getAllModels().filter((model) =>
    searchQuery
      ? model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.id.toLowerCase().includes(searchQuery.toLowerCase())
      : true,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Favorite Models
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Star your favorite models for quick access in the model selector. These will appear at
          the top of the dropdown.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search models..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Models by Provider */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        {PROVIDERS_IN_ORDER.map((provider) => {
          const models = getProviderModels(provider).filter((model) =>
            filteredModels.includes(model),
          );

          if (models.length === 0) return null;

          const isExpanded = expandedProviders.has(provider);
          const favoriteCount = models.filter((m) => favorites.includes(m.id)).length;

          return (
            <div key={provider} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
              {/* Provider Header */}
              <button
                onClick={() => toggleProvider(provider)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {PROVIDER_LABELS[provider]}
                  </span>
                  <span className="text-xs text-gray-500">
                    {models.length} model{models.length !== 1 ? 's' : ''}
                  </span>
                  {favoriteCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                      <Star className="h-3 w-3 fill-current" />
                      {favoriteCount}
                    </span>
                  )}
                </div>
              </button>

              {/* Models List */}
              {isExpanded && (
                <div className="bg-white dark:bg-gray-900">
                  {models.map((model) => {
                    const isFavorite = favorites.includes(model.id);

                    return (
                      <button
                        key={model.id}
                        onClick={() => toggleFavorite(model.id)}
                        className="w-full flex items-start justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-t border-gray-100 dark:border-gray-800"
                      >
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {model.name}
                            </span>
                            {model.speed === 'very-fast' && (
                              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                                Fast
                              </span>
                            )}
                            {model.contextWindow && model.contextWindow >= 100000 && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                                Large Context
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="font-mono truncate">{model.id}</span>
                            {model.contextWindow && (
                              <span>
                                {model.contextWindow >= 1000000
                                  ? `${(model.contextWindow / 1000000).toFixed(1)}M`
                                  : `${(model.contextWindow / 1000).toFixed(0)}K`}{' '}
                                tokens
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(model.id);
                          }}
                          className={cn(
                            'flex-shrink-0 p-2 rounded-lg transition-colors',
                            isFavorite
                              ? 'text-yellow-500 hover:text-yellow-600'
                              : 'text-gray-400 hover:text-gray-600',
                          )}
                          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star
                            className={cn('h-5 w-5', isFavorite && 'fill-current')}
                          />
                        </button>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {favorites.length > 0 && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-sm">
            <Star className="h-4 w-4 text-blue-600 dark:text-blue-400 fill-current" />
            <span className="text-blue-900 dark:text-blue-100">
              <strong>{favorites.length}</strong> favorite model{favorites.length !== 1 ? 's' : ''}{' '}
              selected
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
