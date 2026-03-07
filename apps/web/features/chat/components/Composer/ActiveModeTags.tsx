'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@shared/lib/utils';

export interface ModeTag {
  id: string;
  label: string;
  color: 'teal' | 'blue' | 'green' | 'indigo' | 'purple' | 'amber';
}

const COLOR_CLASSES: Record<ModeTag['color'], string> = {
  teal: 'bg-teal-500/15 text-teal-400',
  blue: 'bg-blue-500/15 text-blue-400',
  green: 'bg-green-500/15 text-green-400',
  indigo: 'bg-indigo-500/15 text-indigo-400',
  purple: 'bg-purple-500/15 text-purple-400',
  amber: 'bg-amber-500/15 text-amber-400',
};

interface ActiveModeTagsProps {
  tags: ModeTag[];
  onDismiss: (id: string) => void;
}

export function ActiveModeTags({ tags, onDismiss }: ActiveModeTagsProps) {
  if (tags.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
            COLOR_CLASSES[tag.color],
          )}
        >
          {tag.label}
          <button
            onClick={() => onDismiss(tag.id)}
            className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-white/20"
            aria-label={`Remove ${tag.label}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
