import React, { useState } from 'react';
import type { AgentTemplate } from '../../types/templates';
import { CATEGORY_INFO, DIFFICULTY_INFO, formatDuration } from '../../types/templates';
import { useTemplateStore } from '../../stores/templateStore';
import { TemplateInstaller } from './TemplateInstaller';

interface TemplateDetailsProps {
  template: AgentTemplate;
  isInstalled: boolean;
  onClose: () => void;
}

export const TemplateDetails: React.FC<TemplateDetailsProps> = ({
  template,
  isInstalled,
  onClose,
}) => {
  const { installTemplate, uninstallTemplate, isLoading } = useTemplateStore();
  const [showInstaller, setShowInstaller] = useState(false);
  const [installing, setInstalling] = React.useState(false);

  const handleInstall = async () => {
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

  const handleExecute = () => {
    setShowInstaller(true);
  };

  const categoryInfo = CATEGORY_INFO[template.category];
  const difficultyInfo = DIFFICULTY_INFO[template.difficulty_level];

  if (showInstaller) {
    return <TemplateInstaller template={template} onClose={() => setShowInstaller(false)} />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{template.icon}</span>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{template.name}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {categoryInfo.name} • {difficultyInfo.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            disabled={installing || isLoading}
            className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isInstalled
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {installing ? 'Processing...' : isInstalled ? 'Uninstall' : 'Install'}
          </button>
          {isInstalled && (
            <button
              onClick={handleExecute}
              className="flex-1 px-4 py-2 rounded-md font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              Execute
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Description */}
        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
          <p className="text-gray-600 dark:text-gray-400">{template.description}</p>
        </section>

        {/* Metadata */}
        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Details</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Category:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {categoryInfo.icon} {categoryInfo.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Difficulty:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {difficultyInfo.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Estimated Duration:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatDuration(template.estimated_duration_ms)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Installs:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {template.install_count}
              </span>
            </div>
          </div>
        </section>

        {/* Tools */}
        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Required Tools
          </h3>
          <div className="flex flex-wrap gap-2">
            {template.tools.map((tool) => (
              <span
                key={tool}
                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm"
              >
                {tool}
              </span>
            ))}
          </div>
        </section>

        {/* Workflow Steps */}
        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Workflow Steps
          </h3>
          <div className="space-y-3">
            {template.workflow.steps.map((step, index) => (
              <div
                key={step.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white">{step.name}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {step.description}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Tool: {step.tool_id}</span>
                      <span>•</span>
                      <span>Timeout: {step.timeout_seconds}s</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Success Criteria */}
        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Success Criteria
          </h3>
          <ul className="space-y-2">
            {template.success_criteria.map((criterion, index) => (
              <li key={index} className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Default Prompts */}
        {Object.keys(template.default_prompts).length > 0 && (
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Default Prompts
            </h3>
            <div className="space-y-3">
              {Object.entries(template.default_prompts).map(([key, value]) => (
                <div
                  key={key}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                >
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1 capitalize">
                    {key}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
