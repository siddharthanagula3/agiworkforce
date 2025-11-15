import React, { useState } from 'react';
import {
  Wrench,
  Check,
  X,
  RotateCw,
  Copy,
  Clock,
  ChevronDown,
  ChevronRight,
  Code,
} from 'lucide-react';
import { ToolExecution } from '../../../stores/unifiedChatStore';
import { CodeBlock } from '../Visualizations/CodeBlock';

export interface ToolExecutionCardProps {
  execution: ToolExecution;
  showInputOutput?: boolean;
  enableRetry?: boolean;
  onRetry?: () => void;
  className?: string;
}

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({
  execution,
  showInputOutput = true,
  enableRetry = false,
  onRetry,
  className = '',
}) => {
  const [showInput, setShowInput] = useState(false);
  const [showOutput, setShowOutput] = useState(false);

  const formattedTime = new Date(execution.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formattedDuration =
    execution.duration < 1000
      ? `${execution.duration}ms`
      : `${(execution.duration / 1000).toFixed(2)}s`;

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatJson = (data: any): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const inputJson = execution.input ? formatJson(execution.input) : '';
  const outputJson = execution.output ? formatJson(execution.output) : '';

  return (
    <div
      className={`tool-execution-card rounded-lg border ${
        execution.success
          ? 'border-gray-200 dark:border-gray-700'
          : 'border-red-200 dark:border-red-900'
      } bg-white dark:bg-gray-800 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div
            className={`p-2 rounded-lg ${
              execution.success
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-red-500 bg-red-50 dark:bg-red-900/20'
            } flex-shrink-0`}
          >
            <Wrench size={20} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium uppercase text-gray-600 dark:text-gray-400">
                Tool Execution
              </span>
              {execution.success ? (
                <Check size={14} className="text-green-500" />
              ) : (
                <X size={14} className="text-red-500" />
              )}
            </div>

            {/* Tool Name */}
            <div className="flex items-center gap-2 mb-2">
              <Code size={16} className="text-gray-600 dark:text-gray-400" />
              <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                {execution.toolName}
              </span>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formattedTime}
              </span>
              <span>{formattedDuration}</span>
            </div>

            {/* Error Message */}
            {!execution.success && execution.error && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300">
                {execution.error}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {enableRetry && onRetry && (
            <button
              onClick={onRetry}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Retry execution"
            >
              <RotateCw size={14} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Input/Output Sections */}
      {showInputOutput && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {/* Input Section */}
          {execution.input && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowInput(!showInput)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 hover:text-gray-900 dark:hover:text-gray-100"
              >
                {showInput ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Input
              </button>
              {showInput && (
                <div className="relative">
                  <button
                    onClick={() => handleCopy(inputJson)}
                    className="absolute top-2 right-2 p-1.5 hover:bg-gray-700 rounded transition-colors z-10"
                    title="Copy input"
                  >
                    <Copy size={12} className="text-gray-400" />
                  </button>
                  <CodeBlock
                    code={inputJson}
                    language="json"
                    showLineNumbers={false}
                    enableCopy={false}
                  />
                </div>
              )}
            </div>
          )}

          {/* Output Section */}
          {execution.success && execution.output && (
            <div className="p-4">
              <button
                onClick={() => setShowOutput(!showOutput)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 hover:text-gray-900 dark:hover:text-gray-100"
              >
                {showOutput ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Output
              </button>
              {showOutput && (
                <div className="relative">
                  <button
                    onClick={() => handleCopy(outputJson)}
                    className="absolute top-2 right-2 p-1.5 hover:bg-gray-700 rounded transition-colors z-10"
                    title="Copy output"
                  >
                    <Copy size={12} className="text-gray-400" />
                  </button>
                  <CodeBlock
                    code={outputJson}
                    language="json"
                    showLineNumbers={false}
                    enableCopy={false}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolExecutionCard;
