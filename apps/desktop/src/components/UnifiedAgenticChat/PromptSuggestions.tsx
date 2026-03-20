/**
 * PromptSuggestions Component
 *
 * Displays category pills and prompt suggestion cards in the empty chat state.
 * Lets users discover and quickly fill the input with curated prompt templates.
 */

import React, { useState } from 'react';
import { Code2, PenLine, Search, BarChart3, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PromptCard {
  title: string;
  text: string;
}

interface PromptCategory {
  icon: LucideIcon;
  label: string;
  color: string;
  prompts: PromptCard[];
}

export const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    icon: Code2,
    label: 'Code',
    color: 'text-blue-400',
    prompts: [
      {
        title: 'Debug this error',
        text: 'Help me debug this error: ',
      },
      {
        title: 'Write a unit test',
        text: 'Write a comprehensive unit test for this function: ',
      },
      {
        title: 'Refactor for performance',
        text: 'Refactor this code for better performance and readability: ',
      },
      {
        title: 'Explain this code',
        text: 'Explain step-by-step what this code does: ',
      },
    ],
  },
  {
    icon: PenLine,
    label: 'Write',
    color: 'text-emerald-400',
    prompts: [
      {
        title: 'Draft an email',
        text: 'Draft a professional email for this situation: ',
      },
      {
        title: 'Write a blog post',
        text: 'Write an engaging blog post about: ',
      },
      {
        title: 'Summarize a document',
        text: 'Summarize the key points from this document: ',
      },
      {
        title: 'Proofread and improve',
        text: 'Proofread and improve the clarity of this text: ',
      },
    ],
  },
  {
    icon: Search,
    label: 'Research',
    color: 'text-violet-400',
    prompts: [
      {
        title: 'Deep dive on a topic',
        text: 'Do a comprehensive deep dive on the topic of: ',
      },
      {
        title: 'Compare alternatives',
        text: 'Compare and contrast these alternatives with pros and cons: ',
      },
      {
        title: 'Find recent papers',
        text: 'Find and summarize recent research papers on: ',
      },
      {
        title: 'Fact-check claims',
        text: 'Fact-check the following claims and provide sources: ',
      },
    ],
  },
  {
    icon: BarChart3,
    label: 'Analyze',
    color: 'text-amber-400',
    prompts: [
      {
        title: 'Analyze this dataset',
        text: 'Analyze this dataset and provide insights: ',
      },
      {
        title: 'Create a visualization',
        text: 'Create a visualization or chart for this data: ',
      },
      {
        title: 'Find patterns in logs',
        text: 'Find patterns and anomalies in these logs: ',
      },
      {
        title: 'Generate a report',
        text: 'Generate a structured report from this information: ',
      },
    ],
  },
  {
    icon: Sparkles,
    label: 'Create',
    color: 'text-pink-400',
    prompts: [
      {
        title: 'Design a logo concept',
        text: 'Generate a logo concept description for a company called: ',
      },
      {
        title: 'Generate an image',
        text: '/imagine ',
      },
      {
        title: 'Create a presentation',
        text: 'Create a structured presentation outline for: ',
      },
      {
        title: 'Build a prototype',
        text: 'Build a quick prototype or mockup for: ',
      },
    ],
  },
  {
    icon: Zap,
    label: 'Automate',
    color: 'text-orange-400',
    prompts: [
      {
        title: 'Set up a workflow',
        text: 'Set up an automated workflow that: ',
      },
      {
        title: 'Schedule a recurring task',
        text: '/schedule ',
      },
      {
        title: 'Connect two services',
        text: 'Help me connect these two services together: ',
      },
      {
        title: 'Monitor for changes',
        text: 'Set up monitoring to alert me when: ',
      },
    ],
  },
];

interface PromptSuggestionsProps {
  onSelectPrompt: (text: string) => void;
  className?: string;
}

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  onSelectPrompt,
  className,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const activeCategory =
    selectedCategory !== null
      ? (PROMPT_CATEGORIES.find((c) => c.label === selectedCategory) ?? null)
      : null;

  const handlePillClick = (label: string) => {
    setSelectedCategory((prev) => (prev === label ? null : label));
  };

  return (
    <div className={cn('flex flex-col items-center gap-3 w-full', className)}>
      {/* Category pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none max-w-full">
        {PROMPT_CATEGORIES.map((category) => {
          const Icon = category.icon;
          const isSelected = selectedCategory === category.label;
          return (
            <button
              key={category.label}
              type="button"
              onClick={() => handlePillClick(category.label)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 shrink-0 select-none',
                isSelected
                  ? 'bg-white/15 border-white/25 text-white'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60 hover:text-white/90',
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', isSelected ? category.color : 'text-current')} />
              <span>{category.label}</span>
            </button>
          );
        })}
      </div>

      {/* Prompt cards */}
      {activeCategory !== null && (
        <div className="grid grid-cols-2 gap-2 w-full max-w-xl">
          {activeCategory.prompts.map((prompt) => (
            <button
              key={prompt.title}
              type="button"
              onClick={() => onSelectPrompt(prompt.text)}
              className={cn(
                'text-left px-3 py-2.5 rounded-lg border border-white/10 bg-white/5',
                'hover:bg-white/10 hover:border-white/20 transition-all duration-150',
                'group',
              )}
            >
              <p className="text-sm font-medium text-white/80 group-hover:text-white truncate">
                {prompt.title}
              </p>
              <p className="text-xs text-white/40 group-hover:text-white/60 mt-0.5 truncate">
                {prompt.text}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
