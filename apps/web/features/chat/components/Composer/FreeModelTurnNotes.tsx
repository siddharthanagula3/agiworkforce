'use client';

import type { FreeModelTurnNote } from '../../lib/free-model-turn-notes';

export function FreeModelTurnNotes({ notes }: { notes: readonly FreeModelTurnNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="free-model-turn-notes"
      className="mb-2 rounded-lg border border-[var(--chat-border-subtle)] bg-[var(--chat-surface-elevated)] px-3 py-2 text-[13px] leading-relaxed text-[var(--chat-text-secondary)]"
    >
      <ul className="space-y-1">
        {notes.map((note) => (
          <li key={note.id} data-testid={`free-model-turn-note-${note.id}`}>
            {note.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
