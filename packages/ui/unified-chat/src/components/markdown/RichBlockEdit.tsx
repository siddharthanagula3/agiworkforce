import React, { createContext, useCallback, useContext, useState } from 'react';
import type { AssistantFenceEdit } from './assistantFenceEdits';

export type AssistantFenceEditHandler = (edit: AssistantFenceEdit) => Promise<void>;

export const RichBlockEditContext = createContext<AssistantFenceEditHandler | undefined>(undefined);
const RichBlockCommitContext = createContext<((content: string) => Promise<void>) | undefined>(
  undefined,
);

export function RichBlockEditScope({
  index,
  language,
  source,
  children,
}: {
  index: number;
  language: string;
  source: string;
  children: React.ReactNode;
}) {
  const onEdit = useContext(RichBlockEditContext);
  const value = useCallback(
    (content: string) => onEdit?.({ index, language, source, content }) ?? Promise.resolve(),
    [onEdit, index, language, source],
  );
  return (
    <RichBlockCommitContext.Provider value={onEdit ? value : undefined}>
      {children}
    </RichBlockCommitContext.Provider>
  );
}

export function useRichBlockEdit() {
  const commit = useContext(RichBlockCommitContext);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const save = async (content: string): Promise<boolean> => {
    if (saving || !commit) return false;
    setSaving(true);
    setError(false);
    try {
      await commit(content);
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, error, canPersist: Boolean(commit) };
}
