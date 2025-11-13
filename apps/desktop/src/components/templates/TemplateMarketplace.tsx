import React, { useEffect, useState } from 'react';
import { useTemplateStore } from '../../stores/templateStore';
import { TemplateCard } from './TemplateCard';
import { TemplateDetails } from './TemplateDetails';
import { TemplateCategory, CATEGORY_INFO } from '../../types/templates';

export const TemplateMarketplace: React.FC = () => {
  const {
    templates,
    installedTemplates,
    selectedTemplate,
    isLoading,
    error,
    searchQuery,
    selectedCategory,
    fetchTemplates,
    fetchInstalledTemplates,
    searchTemplates,
    filterByCategory,
    selectTemplate,
    clearError,
  } = useTemplateStore();

  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [showInstalled, setShowInstalled] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchInstalledTemplates();
  }, [fetchTemplates, fetchInstalledTemplates]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchTemplates(localSearchQuery);
  };

  const handleCategoryFilter = (category: TemplateCategory | null) => {
    filterByCategory(category);
  };

  const displayedTemplates = showInstalled ? installedTemplates : templates;
  const installedIds = new Set(installedTemplates.map((t) => t.id));

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Agent Template Marketplace
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Browse and install pre-built agent templates to automate your workflows
            </p>

            {/* Search and Filters */}
            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              <form onSubmit={handleSearch} className="flex-1">
                <input
                  type="text"
                  value={localSearchQuery}
                  onChange={(e) => setLocalSearchQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </form>
              <button
                onClick={() => setShowInstalled(!showInstalled)}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  showInstalled
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {showInstalled ? 'Show All' : 'Show Installed'}
              </button>
            </div>

            {/* Category Filters */}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => handleCategoryFilter(null)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                All Categories
              </button>
              {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => handleCategoryFilter(key as TemplateCategory)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {info.icon} {info.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded relative">
              <span className="block sm:inline">{error}</span>
              <button onClick={clearError} className="absolute top-0 bottom-0 right-0 px-4 py-3">
                <span className="text-2xl">&times;</span>
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="max-w-7xl mx-auto px-6 py-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading templates...</p>
          </div>
        )}

        {/* Templates Grid */}
        {!isLoading && (
          <div className="max-w-7xl mx-auto px-6 py-6">
            {displayedTemplates.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 dark:text-gray-400 text-lg">
                  {showInstalled
                    ? 'No installed templates. Install some from the marketplace!'
                    : 'No templates found. Try adjusting your search or filters.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isInstalled={installedIds.has(template.id)}
                    onSelect={() => selectTemplate(template)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sidebar - Template Details */}
      {selectedTemplate && (
        <div className="w-96 border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
          <TemplateDetails
            template={selectedTemplate}
            isInstalled={installedIds.has(selectedTemplate.id)}
            onClose={() => selectTemplate(null)}
          />
        </div>
      )}
    </div>
  );
};
