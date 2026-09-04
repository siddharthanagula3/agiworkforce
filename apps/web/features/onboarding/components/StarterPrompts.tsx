'use client';

import { starterPromptsFor } from '../lib/use-cases';

interface StarterPromptsProps {
  useCase: string | null;
  onSelect: (prompt: string) => void;
}

export function StarterPrompts({ useCase, onSelect }: StarterPromptsProps) {
  const prompts = starterPromptsFor(useCase);

  if (prompts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">Start with one of these</p>
      <div className="flex flex-wrap gap-2" aria-label="Prompt suggestions">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="rounded-full border border-input px-3.5 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
