import React from 'react';
import type { AgentTemplate } from '../../types/templates';
import {
  CATEGORY_INFO,
  DIFFICULTY_INFO,
  formatDuration,
  getCategoryColor,
} from '../../types/templates';
import { useTemplateStore } from '../../stores/templateStore';

interface TemplateCardProps {
  template: AgentTemplate;
  isInstalled: boolean;
  onSelect: () => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({ template, isInstalled, onSelect }) => {
  const { installTemplate, uninstallTemplate, isLoading } = useTemplateStore();
  const [installing, setInstalling] = React.useState(false);

  const handleInstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setInstalling(true);
    try {
      if (isInstalled) {
        await uninstallTemplate(template.id);
      } else {
        await installTemplate(template.id);
      }
    } finally {
      setInstalling(false);
    }
  };

  const categoryInfo = CATEGORY_INFO[template.category];
  const difficultyInfo = DIFFICULTY_INFO[template.difficulty_level];
  const categoryColor = getCategoryColor(template.category);

  return (
    <div
      onClick={onSelect}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer border border-gray-200 dark:border-gray-700 p-4 flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-3xl">{template.icon}</span>
          <div>
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{template.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs px-2 py-1 rounded-full bg-${categoryColor}-100 text-${categoryColor}-700 dark:bg-${categoryColor}-900 dark:text-${categoryColor}-300`}
              >
                {categoryInfo.name}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-full bg-${difficultyInfo.color}-100 text-${difficultyInfo.color}-700 dark:bg-${difficultyInfo.color}-900 dark:text-${difficultyInfo.color}-300`}
              >
                {difficultyInfo.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 flex-grow line-clamp-3">
        {template.description}
      </p>

      {/* Tools */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-1">
          {template.tools.slice(0, 4).map((tool) => (
            <span
              key={tool}
              className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
            >
              {tool}
            </span>
          ))}
          {template.tools.length > 4 && (
            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
              +{template.tools.length - 4} more
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span title="Estimated duration">
            ⏱️ {formatDuration(template.estimated_duration_ms)}
          </span>
          <span title="Install count">📥 {template.install_count}</span>
        </div>
        <button
          onClick={handleInstall}
          disabled={installing || isLoading}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            isInstalled
              ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800'
              : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {installing ? 'Processing...' : isInstalled ? 'Uninstall' : 'Install'}
        </button>
      </div>
    </div>
  );
};
