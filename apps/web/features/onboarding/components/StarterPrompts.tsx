'use client';

import { useEffect, useState } from 'react';
import { fetchStoredPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { starterPromptsFor } from '../lib/use-cases';

interface StoredGeneralPreferences {
  primaryUseCase?: string;
}

interface StarterPromptsProps {
  onSelect: (prompt: string) => void;
}

export function StarterPrompts({ onSelect }: StarterPromptsProps) {
  const [prompts, setPrompts] = useState<readonly string[]>(() => starterPromptsFor(null));

  useEffect(() => {
    let cancelled = false;
    fetchStoredPreferenceNamespace<StoredGeneralPreferences>('general')
      .then((stored) => {
        if (cancelled) return;
        setPrompts(starterPromptsFor(stored.primaryUseCase ?? null));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (prompts.length === 0) return null;

  return (
    <div
      className="flex w-full flex-wrap items-center justify-center gap-2"
      aria-label="Prompt suggestions"
    >
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="rounded-full border border-[var(--chat-border-subtle)] px-3.5 py-1.5 text-sm text-[var(--chat-text-secondary)] transition-colors hover:text-[var(--chat-text-primary)]"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
