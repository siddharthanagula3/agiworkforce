import React, { useState } from 'react';
import type { AgentTemplate } from '../../types/templates';
import { useTemplateStore } from '../../stores/templateStore';

interface TemplateInstallerProps {
  template: AgentTemplate;
  onClose: () => void;
}

export const TemplateInstaller: React.FC<TemplateInstallerProps> = ({ template, onClose }) => {
  const { executeTemplate } = useTemplateStore();
  const [params, setParams] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extract parameter placeholders from workflow steps
  const getRequiredParams = (): string[] => {
    const paramSet = new Set<string>();
    template.workflow.steps.forEach((step) => {
      Object.values(step.parameters).forEach((value) => {
        const strValue = JSON.stringify(value);
        const matches = strValue.matchAll(/\{\{(\w+)\}\}/g);
        for (const match of matches) {
          paramSet.add(match[1]);
        }
      });
    });
    return Array.from(paramSet);
  };

  const requiredParams = getRequiredParams();

  const handleParamChange = (param: string, value: string) => {
    setParams((prev) => ({ ...prev, [param]: value }));
  };

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      const executionResult = await executeTemplate(template.id, params);
      setResult(executionResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const canExecute = requiredParams.every((param) => params[param]?.trim());

  return (
    <div className="bg-white dark:bg-gray-800 h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Configure Template</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{template.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <span className="text-2xl">&times;</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {result ? (
          /* Execution Result */
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Execution Result
            </h3>
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
              <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono">
                {result}
              </pre>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setResult(null);
                  setParams({});
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Run Again
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* Configuration Form */
          <form onSubmit={handleExecute} className="space-y-6">
            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-300">
                Fill in the required parameters below to configure this template for execution.
              </p>
            </div>

            {/* Parameters */}
            {requiredParams.length === 0 ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                <p>No parameters required. Click execute to run the template.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Parameters</h3>
                {requiredParams.map((param) => (
                  <div key={param}>
                    <label
                      htmlFor={param}
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      {param.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </label>
                    <input
                      id={param}
                      type="text"
                      value={params[param] || ''}
                      onChange={(e) => handleParamChange(param, e.target.value)}
                      placeholder={`Enter ${param}...`}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                <p className="text-sm text-red-900 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Preview */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Workflow Preview
              </h3>
              <div className="space-y-2">
                {template.workflow.steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                  >
                    <span className="flex-shrink-0 w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <span>{step.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="submit"
                disabled={!canExecute || executing}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {executing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    Executing...
                  </span>
                ) : (
                  'Execute Template'
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={executing}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
