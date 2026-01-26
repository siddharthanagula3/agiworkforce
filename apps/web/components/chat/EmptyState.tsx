'use client';

import React, { memo } from 'react';
import {
  Sparkles,
  Code,
  FileText,
  Lightbulb,
  MessageSquare,
  Palette,
  Calculator,
} from 'lucide-react';
import { clsx } from 'clsx';

interface EmptyStateProps {
  onSuggestionClick?: (prompt: string) => void;
}

const SUGGESTIONS = [
  {
    icon: Code,
    label: 'Write code',
    prompt: 'Help me write a function that',
    color: 'text-blue-500 bg-blue-500/10',
  },
  {
    icon: FileText,
    label: 'Analyze text',
    prompt: 'Please analyze the following text:',
    color: 'text-green-500 bg-green-500/10',
  },
  {
    icon: Lightbulb,
    label: 'Brainstorm ideas',
    prompt: 'I need help brainstorming ideas for',
    color: 'text-yellow-500 bg-yellow-500/10',
  },
  {
    icon: MessageSquare,
    label: 'Draft an email',
    prompt: 'Help me write a professional email about',
    color: 'text-purple-500 bg-purple-500/10',
  },
  {
    icon: Palette,
    label: 'Creative writing',
    prompt: 'Write a creative story about',
    color: 'text-pink-500 bg-pink-500/10',
  },
  {
    icon: Calculator,
    label: 'Solve a problem',
    prompt: 'Help me solve this problem:',
    color: 'text-orange-500 bg-orange-500/10',
  },
];

export const EmptyState = memo(function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
      {/* Logo / Icon */}
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg mb-6">
        <Sparkles className="w-8 h-8 text-white" />
      </div>

      {/* Welcome text */}
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        How can I help you today?
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-center max-w-md mb-8">
        I can help with writing, coding, analysis, creative tasks, and much more. Just ask!
      </p>

      {/* Suggestion grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-2xl">
        {SUGGESTIONS.map((suggestion) => {
          const Icon = suggestion.icon;
          return (
            <button
              key={suggestion.label}
              onClick={() => onSuggestionClick?.(suggestion.prompt)}
              className={clsx(
                'flex items-center gap-3 p-4 rounded-xl text-left',
                'border border-gray-200 dark:border-gray-700',
                'bg-white dark:bg-gray-800',
                'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                'hover:border-gray-300 dark:hover:border-gray-600',
                'transition-all duration-200',
                'group',
              )}
            >
              <div className={clsx('p-2 rounded-lg', suggestion.color)}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {suggestion.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-8 text-center max-w-md">
        Your conversations are securely stored and can be accessed from any device.
        <br />
        AI responses may be inaccurate. Please verify important information.
      </p>
    </div>
  );
});

export default EmptyState;
