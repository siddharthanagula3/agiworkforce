/**
 * usePromptSuggestions Hook
 *
 * Generates context-aware prompt suggestions similar to Gemini CLI.
 * Analyzes user input and provides helpful continuation suggestions.
 */

import { useMemo } from 'react';

export interface PromptSuggestion {
  text: string;
  description: string;
  type: 'continuation' | 'expansion' | 'alternative' | 'code' | 'question';
  icon: string;
}

const SUGGESTION_PATTERNS = [
  {
    pattern: /^help\s+with\s+(\w+)/i,
    suggestions: (match: RegExpMatchArray) => [
      {
        text: `help me ${match[1]} step by step`,
        description: 'Get detailed step-by-step guidance',
        type: 'expansion' as const,
        icon: '📋',
      },
      {
        text: `help me ${match[1]} with examples`,
        description: 'Include practical examples',
        type: 'expansion' as const,
        icon: '💡',
      },
      {
        text: `help me debug ${match[1]}`,
        description: 'Focus on troubleshooting',
        type: 'alternative' as const,
        icon: '🐛',
      },
    ],
  },
  {
    pattern: /^write\s+a\s+(\w+)(?:\s+for\s+(.+))?/i,
    suggestions: (match: RegExpMatchArray) => {
      const type = match[1];
      const subject = match[2] || 'this task';
      return [
        {
          text: `write a ${type} for ${subject} with comments`,
          description: 'Include explanatory comments',
          type: 'expansion' as const,
          icon: '💬',
        },
        {
          text: `write a ${type} for ${subject} following best practices`,
          description: 'Follow industry best practices',
          type: 'expansion' as const,
          icon: '⭐',
        },
        {
          text: `write a ${type} for ${subject} with error handling`,
          description: 'Include error handling',
          type: 'expansion' as const,
          icon: '⚠️',
        },
      ];
    },
  },
  {
    pattern: /^explain\s+(.+)$/i,
    suggestions: (match: RegExpMatchArray) => [
      {
        text: `explain ${match[1]} like I'm 5`,
        description: 'Simplify for beginners',
        type: 'alternative' as const,
        icon: '👶',
      },
      {
        text: `explain ${match[1]} with examples`,
        description: 'Include practical examples',
        type: 'expansion' as const,
        icon: '📚',
      },
      {
        text: `explain ${match[1]} in detail`,
        description: 'Deep dive explanation',
        type: 'expansion' as const,
        icon: '🔍',
      },
    ],
  },
  {
    pattern: /^how\s+to\s+(.+)$/i,
    suggestions: (match: RegExpMatchArray) => [
      {
        text: `how to ${match[1]} in Python`,
        description: 'Python solution',
        type: 'code' as const,
        icon: '🐍',
      },
      {
        text: `how to ${match[1]} in JavaScript`,
        description: 'JavaScript solution',
        type: 'code' as const,
        icon: '🟨',
      },
      {
        text: `how to ${match[1]} step by step`,
        description: 'Detailed walkthrough',
        type: 'continuation' as const,
        icon: '👣',
      },
    ],
  },
  {
    pattern: /^create\s+a\s+(.+)$/i,
    suggestions: (match: RegExpMatchArray) => [
      {
        text: `create a ${match[1]} with tests`,
        description: 'Include test cases',
        type: 'expansion' as const,
        icon: '✅',
      },
      {
        text: `create a ${match[1]} from scratch`,
        description: 'Start from zero',
        type: 'continuation' as const,
        icon: '🆕',
      },
      {
        text: `create a ${match[1]} with documentation`,
        description: 'Include documentation',
        type: 'expansion' as const,
        icon: '📖',
      },
    ],
  },
  {
    pattern: /^fix\s+(.+)$/i,
    suggestions: (match: RegExpMatchArray) => [
      {
        text: `fix ${match[1]} and explain the issue`,
        description: 'Fix and explain root cause',
        type: 'expansion' as const,
        icon: '🔧',
      },
      {
        text: `fix ${match[1]} without breaking tests`,
        description: 'Ensure tests still pass',
        type: 'expansion' as const,
        icon: '🧪',
      },
      {
        text: `fix ${match[1]} with a better approach`,
        description: 'Find optimal solution',
        type: 'alternative' as const,
        icon: '✨',
      },
    ],
  },
  {
    pattern: /^optimize\s+(.+)$/i,
    suggestions: (match: RegExpMatchArray) => [
      {
        text: `optimize ${match[1]} for performance`,
        description: 'Focus on speed',
        type: 'expansion' as const,
        icon: '⚡',
      },
      {
        text: `optimize ${match[1]} for readability`,
        description: 'Make it clearer',
        type: 'expansion' as const,
        icon: '👁️',
      },
      {
        text: `optimize ${match[1]} for memory usage`,
        description: 'Reduce memory footprint',
        type: 'expansion' as const,
        icon: '💾',
      },
    ],
  },
  {
    pattern: /^refactor\s+(.+)$/i,
    suggestions: (match: RegExpMatchArray) => [
      {
        text: `refactor ${match[1]} to be more modular`,
        description: 'Break into smaller pieces',
        type: 'expansion' as const,
        icon: '🧩',
      },
      {
        text: `refactor ${match[1]} using design patterns`,
        description: 'Apply design patterns',
        type: 'expansion' as const,
        icon: '🎨',
      },
      {
        text: `refactor ${match[1]} for better testing`,
        description: 'Improve testability',
        type: 'expansion' as const,
        icon: '🧬',
      },
    ],
  },
];

// General suggestions based on input length and context
const GENERAL_SUGGESTIONS = [
  {
    text: 'with examples',
    description: 'Add practical examples',
    type: 'expansion' as const,
    icon: '💡',
  },
  {
    text: 'step by step',
    description: 'Break into steps',
    type: 'expansion' as const,
    icon: '📋',
  },
  {
    text: 'with code',
    description: 'Include code samples',
    type: 'code' as const,
    icon: '💻',
  },
  {
    text: 'in detail',
    description: 'Deep dive explanation',
    type: 'expansion' as const,
    icon: '🔍',
  },
  {
    text: 'for beginners',
    description: 'Simplify for learning',
    type: 'alternative' as const,
    icon: '👶',
  },
  {
    text: 'for production',
    description: 'Production-ready solution',
    type: 'alternative' as const,
    icon: '🚀',
  },
];

export function usePromptSuggestions(input: string): PromptSuggestion[] {
  return useMemo(() => {
    if (!input || input.length < 3) {
      return [];
    }

    // Check pattern-based suggestions first
    for (const { pattern, suggestions } of SUGGESTION_PATTERNS) {
      const match = input.match(pattern);
      if (match) {
        return suggestions(match);
      }
    }

    // For short, simple inputs, suggest continuations
    if (input.length < 20 && !input.includes('?')) {
      // Return top 3 general suggestions
      return GENERAL_SUGGESTIONS.slice(0, 3);
    }

    // For longer inputs or questions, suggest refinements
    if (input.includes('?')) {
      return [
        {
          text: input + ' with examples',
          description: 'Include practical examples',
          type: 'expansion' as const,
          icon: '💡',
        },
        {
          text: input + ' step by step',
          description: 'Break into manageable steps',
          type: 'expansion' as const,
          icon: '📋',
        },
      ];
    }

    return [];
  }, [input]);
}
