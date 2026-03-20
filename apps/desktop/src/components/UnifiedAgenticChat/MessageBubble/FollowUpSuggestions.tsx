/**
 * FollowUpSuggestions Component
 *
 * Content-aware follow-up suggestion pills that appear at the end of the last
 * assistant message, similar to ChatGPT's follow-up suggestion chips.
 */

import React, { useMemo } from 'react';
import { BarChart3, Bug, Code, Globe, Lightbulb, Save, Sparkles } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface Suggestion {
  label: string;
  icon: React.ReactNode;
}

export interface FollowUpSuggestionsProps {
  messageContent: string;
  onSuggestionClick: (suggestion: string) => void;
}

/**
 * Analyze message content and return up to 3 contextually relevant suggestions.
 */
function derivesuggestions(content: string): Suggestion[] {
  const all: Array<{ pattern: RegExp; suggestions: Suggestion[] }> = [
    {
      // Code blocks (triple backticks)
      pattern: /```/,
      suggestions: [
        { label: 'Run this code', icon: <Code className="h-3 w-3" /> },
        { label: 'Write tests', icon: <Code className="h-3 w-3" /> },
        { label: 'Explain this', icon: <Lightbulb className="h-3 w-3" /> },
      ],
    },
    {
      // Error / stack trace indicators
      pattern:
        /(?:error|exception|traceback|stack trace|at line \d|TypeError|SyntaxError|ReferenceError)/i,
      suggestions: [
        { label: 'Fix this error', icon: <Bug className="h-3 w-3" /> },
        { label: 'Explain the cause', icon: <Lightbulb className="h-3 w-3" /> },
        { label: 'Write tests', icon: <Code className="h-3 w-3" /> },
      ],
    },
    {
      // Data, numbers, or tables
      pattern: /(?:\|.+\||\d{4,}|%|\$\d|avg|mean|total|count|sum|chart|graph|dataset)/i,
      suggestions: [
        { label: 'Visualize this', icon: <BarChart3 className="h-3 w-3" /> },
        { label: 'Summarize key points', icon: <Sparkles className="h-3 w-3" /> },
        { label: 'Save as artifact', icon: <Save className="h-3 w-3" /> },
      ],
    },
    {
      // URLs or web content
      pattern: /(?:https?:\/\/|search result|web page|source:|reference:)/i,
      suggestions: [
        { label: 'Search deeper', icon: <Globe className="h-3 w-3" /> },
        { label: 'Open top result', icon: <Globe className="h-3 w-3" /> },
        { label: 'Summarize key points', icon: <Sparkles className="h-3 w-3" /> },
      ],
    },
  ];

  for (const { pattern, suggestions } of all) {
    if (pattern.test(content)) {
      return suggestions.slice(0, 3);
    }
  }

  // Default fallback
  return [
    { label: 'Tell me more', icon: <Sparkles className="h-3 w-3" /> },
    { label: 'Save as artifact', icon: <Save className="h-3 w-3" /> },
  ];
}

export const FollowUpSuggestions: React.FC<FollowUpSuggestionsProps> = ({
  messageContent,
  onSuggestionClick,
}) => {
  const suggestions = useMemo(() => derivesuggestions(messageContent), [messageContent]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-2 mt-3')}>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.label}
          type="button"
          onClick={() => onSuggestionClick(suggestion.label)}
          className={cn(
            'flex items-center gap-1.5',
            'bg-white/5 hover:bg-white/10',
            'border border-white/10',
            'rounded-full px-3 py-1.5',
            'text-xs text-white/70 hover:text-white/90',
            'transition-colors cursor-pointer',
          )}
        >
          <span className="text-white/50">{suggestion.icon}</span>
          {suggestion.label}
        </button>
      ))}
    </div>
  );
};
