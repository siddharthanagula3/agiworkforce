'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ARTIFACT_TITLE_MAX_CHARS, normalizeArtifactTitle } from '../../stores/artifacts-store';

export const RENAME_ARTIFACT_LABEL = 'Rename';

export function ArtifactTitleField({
  title,
  editing,
  canRename,
  onStartEditing,
  onRename,
  onDone,
}: {
  title: string;
  editing: boolean;
  canRename: boolean;
  onStartEditing: () => void;
  onRename: (title: string) => void;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(title);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    settledRef.current = false;
    setDraft(title);
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [editing, title]);

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const next = normalizeArtifactTitle(draft);
    if (next && next !== title) onRename(next);
    onDone();
  };

  const cancel = () => {
    settledRef.current = true;
    onDone();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={ARTIFACT_TITLE_MAX_CHARS}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        aria-label="Artifact name"
        className="h-6 min-w-0 rounded-compact border border-[var(--chat-border-strong)] bg-background px-1.5 text-sm font-semibold leading-5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="artifact-title-input"
      />
    );
  }

  if (!canRename) {
    return (
      <span className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground">
        {title}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onStartEditing}
      className="min-w-0 truncate rounded-compact text-start text-sm font-semibold leading-5 text-foreground hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={RENAME_ARTIFACT_LABEL}
      aria-label={`${title}. ${RENAME_ARTIFACT_LABEL}`}
      data-testid="artifact-title"
    >
      {title}
    </button>
  );
}
