'use client';

import React from 'react';
import { Search, Code2, PenLine, Image as ImageIcon } from 'lucide-react';
import { cn } from '@shared/lib/utils';

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

const SUGGESTIONS = [
  {
    id: 'research',
    icon: Search,
    title: 'Research a topic',
    description: 'Get in-depth analysis on any subject',
    prompt: 'Research the latest developments in ',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  {
    id: 'code',
    icon: Code2,
    title: 'Review code',
    description: 'Get feedback on code quality and bugs',
    prompt: 'Review this code and suggest improvements:\n\n',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'write',
    icon: PenLine,
    title: 'Write content',
    description: 'Draft articles, emails, or documentation',
    prompt: 'Write a ',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  {
    id: 'image',
    icon: ImageIcon,
    title: 'Generate an image',
    description: 'Create images from text descriptions',
    prompt: '[Generate Image] Create an image of ',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
];

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SUGGESTIONS.map((suggestion) => {
        const Icon = suggestion.icon;
        return (
          <button
            key={suggestion.id}
            onClick={() => onSelect(suggestion.prompt)}
            className={cn(
              'group flex items-start gap-3 rounded-xl border border-border/30 bg-card/40 p-4 text-left backdrop-blur-sm transition-all duration-200',
              'hover:border-border/60 hover:bg-card/60 hover:shadow-sm',
            )}
          >
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                suggestion.bgColor,
              )}
            >
              <Icon className={cn('h-4.5 w-4.5', suggestion.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{suggestion.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{suggestion.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
