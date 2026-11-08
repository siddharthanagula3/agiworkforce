'use client';

import { useState } from 'react';

/** Empty-chat suggestions. Choosing one fills the draft and does not send it. */
export const COMPOSER_SUGGESTIONS = ['Draft a plan', 'Search my notes', 'Review a file'] as const;

export function ComposerSuggestions({ onPick }: { onPick: (text: string) => void }) {
  const [shown, setShown] = useState(true);

  if (!shown) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
          onClick={() => setShown(true)}
        >
          Show suggestions
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {COMPOSER_SUGGESTIONS.map((text) => (
        <button
          key={text}
          type="button"
          className="rounded-full border border-border px-3 py-1 text-sm"
          onClick={() => onPick(text)}
        >
          {text}
        </button>
      ))}
      <button
        type="button"
        className="rounded-full px-3 py-1 text-sm text-muted-foreground"
        onClick={() => setShown(false)}
      >
        Hide suggestions
      </button>
    </div>
  );
}
