import React, { useState, useMemo } from 'react';
import { Search, X, Filter, Star, Clock, Grid, List } from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';
import { ModelCard } from './ModelCard';
import { getAllModels, PROVIDER_LABELS, PROVIDERS_IN_ORDER } from '../../constants/llm';
import type { Provider } from '../../stores/settingsStore';
import type { ModelMetadata } from '../../constants/llm';
import { cn } from '../../lib/utils';

interface ModelSelectorProps {
  onSelect?: (modelId: string, provider: Provider) => void;
  showBenchmarks?: boolean;
  className?: string;
}

type ViewMode = 'grid' | 'list';
type FilterMode = 'all' | 'favorites' | 'recent';

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  onSelect,
  showBenchmarks = false,
  className,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<Set<Provider>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const {
    selectedModel,
    favorites,
    recentModels,
    selectModel,
    toggleFavorite,
  } = useModelStore();

  const allModels = useMemo(() => getAllModels(), []);

  // Filter models based on search, provider filter, and mode
  const filteredModels = useMemo(() => {
    let models = allModels;

    // Apply filter mode
    if (filterMode === 'favorites') {
      models = models.filter((m) => favorites.includes(m.id));
    } else if (filterMode === 'recent') {
      models = models.filter((m) => recentModels.includes(m.id));
    }

    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      models = models.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.provider.toLowerCase().includes(query) ||
          m.bestFor.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    // Apply provider filter
    if (selectedProviders.size > 0) {
      models = models.filter((m) => selectedProviders.has(m.provider));
    }

    return models;
  }, [allModels, searchQuery, selectedProviders, filterMode, favorites, recentModels]);

  // Group models by provider
  const modelsByProvider = useMemo(() => {
    const grouped: Record<Provider, ModelMetadata[]> = {
      openai: [],
      anthropic: [],
      google: [],
      ollama: [],
      xai: [],
      deepseek: [],
      qwen: [],
      mistral: [],
      moonshot: [],
    };

    filteredModels.forEach((model) => {
      grouped[model.provider].push(model);
    });

    return grouped;
  }, [filteredModels]);

  const handleModelSelect = (model: ModelMetadata) => {
    selectModel(model.id, model.provider);
    onSelect?.(model.id, model.provider);
  };

  const toggleProviderFilter = (provider: Provider) => {
    const newSet = new Set(selectedProviders);
    if (newSet.has(provider)) {
      newSet.delete(provider);
    } else {
      newSet.add(provider);
    }
    setSelectedProviders(newSet);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedProviders(new Set());
    setFilterMode('all');
  };

  const hasActiveFilters = searchQuery || selectedProviders.size > 0 || filterMode !== 'all';

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search Bar */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search models by name, provider, or capability..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'grid'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
              )}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'list'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter Mode Tabs */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setFilterMode('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              filterMode === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
            )}
          >
            <Filter className="inline h-3 w-3 mr-1" />
            All Models
          </button>
          <button
            onClick={() => setFilterMode('favorites')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              filterMode === 'favorites'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
            )}
          >
            <Star className="inline h-3 w-3 mr-1" />
            Favorites ({favorites.length})
          </button>
          <button
            onClick={() => setFilterMode('recent')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              filterMode === 'recent'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
            )}
          >
            <Clock className="inline h-3 w-3 mr-1" />
            Recent ({recentModels.length})
          </button>
        </div>

        {/* Provider Filters */}
        <div className="flex flex-wrap gap-2">
          {PROVIDERS_IN_ORDER.map((provider) => (
            <button
              key={provider}
              onClick={() => toggleProviderFilter(provider)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                selectedProviders.has(provider)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
              )}
            >
              {PROVIDER_LABELS[provider]}
            </button>
          ))}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/30"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Models List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredModels.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 dark:text-gray-600 mb-2">
              <Search className="h-12 w-12 mx-auto mb-3" />
              <p className="text-lg font-medium">No models found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {PROVIDERS_IN_ORDER.map((provider) => {
              const models = modelsByProvider[provider];
              if (models.length === 0) return null;

              return (
                <div key={provider}>
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
                    {PROVIDER_LABELS[provider]}
                    <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                      ({models.length} {models.length === 1 ? 'model' : 'models'})
                    </span>
                  </h3>

                  <div
                    className={cn(
                      viewMode === 'grid'
                        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                        : 'space-y-2',
                    )}
                  >
                    {models.map((model) => (
                      <ModelCard
                        key={model.id}
                        model={model}
                        selected={selectedModel === model.id}
                        favorite={favorites.includes(model.id)}
                        onClick={() => handleModelSelect(model)}
                        onToggleFavorite={() => toggleFavorite(model.id)}
                        compact={viewMode === 'list'}
                        showBenchmarks={showBenchmarks}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer with Model Count */}
      <div className="flex-shrink-0 p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
          Showing {filteredModels.length} of {allModels.length} models
          {selectedModel && (
            <span className="ml-2 text-blue-600 dark:text-blue-400">
              • Selected: {allModels.find((m) => m.id === selectedModel)?.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
