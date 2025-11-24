import { Code, FileText, Search, Sparkles, Zap } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  onSuggestionClick?: (prompt: string) => void;
}

const SUGGESTIONS = [
  {
    icon: Code,
    title: 'Write Code',
    prompt: 'Help me build a React component with TypeScript',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: FileText,
    title: 'Draft Content',
    prompt: 'Write a professional email about project updates',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Search,
    title: 'Research',
    prompt: 'Explain how quantum computing works',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Zap,
    title: 'Analyze Data',
    prompt: 'Help me analyze this dataset and find insights',
    color: 'from-orange-500 to-red-500',
  },
];

export const EmptyState: React.FC<EmptyStateProps> = ({ onSuggestionClick }) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4">
      <div className="max-w-3xl w-full text-center space-y-8">
        {/* Welcome Message */}
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-semibold text-gray-900 dark:text-gray-100">
            How can I help you today?
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Choose a suggestion below or start typing your own question
          </p>
        </div>

        {/* Suggestion Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pointer-events-auto">
          {SUGGESTIONS.map((suggestion) => {
            const Icon = suggestion.icon;
            return (
              <button
                key={suggestion.title}
                onClick={() => onSuggestionClick?.(suggestion.prompt)}
                className={cn(
                  'group relative overflow-hidden rounded-2xl p-6 text-left',
                  'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
                  'hover:border-gray-300 dark:hover:border-gray-600',
                  'transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5',
                )}
              >
                {/* Gradient Background on Hover */}
                <div
                  className={cn(
                    'absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity',
                    `bg-gradient-to-br ${suggestion.color}`,
                  )}
                />

                {/* Content */}
                <div className="relative space-y-2">
                  <div
                    className={cn(
                      'inline-flex items-center justify-center w-10 h-10 rounded-lg',
                      `bg-gradient-to-br ${suggestion.color}`,
                    )}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {suggestion.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {suggestion.prompt}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
