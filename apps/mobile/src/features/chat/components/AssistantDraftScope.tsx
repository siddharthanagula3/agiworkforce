import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { AssistantFenceEditRequest } from '@/src/features/chat/services/assistantFenceEditRequest';
import { readAnswerDraft } from './answerDraftStore';

export interface AssistantDraftScopeValue {
  messageId: string;
  saveFenceEdit?: (request: AssistantFenceEditRequest) => Promise<void>;
}

const AssistantDraftScopeContext = createContext<AssistantDraftScopeValue | null>(null);

export function AssistantDraftScope({
  messageId,
  saveFenceEdit,
  children,
}: AssistantDraftScopeValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ messageId, ...(saveFenceEdit ? { saveFenceEdit } : {}) }),
    [messageId, saveFenceEdit],
  );
  return (
    <AssistantDraftScopeContext.Provider value={value}>
      {children}
    </AssistantDraftScopeContext.Provider>
  );
}

export function useAssistantDraftScope(): AssistantDraftScopeValue | null {
  return useContext(AssistantDraftScopeContext);
}

export function answerDraftKey(
  scope: AssistantDraftScopeValue | null,
  ...parts: readonly string[]
): string | null {
  return scope ? [scope.messageId, ...parts].join('\u0000') : null;
}

const unsavedDraftKeys = new Map<string, Set<string>>();

export function markUnsavedAnswerEdit(messageId: string, key: string, unsaved: boolean): void {
  const keys = unsavedDraftKeys.get(messageId);
  if (unsaved) {
    if (keys) keys.add(key);
    else unsavedDraftKeys.set(messageId, new Set([key]));
    return;
  }
  if (!keys) return;
  keys.delete(key);
  if (keys.size === 0) unsavedDraftKeys.delete(messageId);
}

export function hasUnsavedAnswerEdits(messageId: string): boolean {
  const keys = unsavedDraftKeys.get(messageId);
  if (!keys) return false;
  for (const key of [...keys]) {
    if (readAnswerDraft(key) !== undefined) return true;
    keys.delete(key);
  }
  unsavedDraftKeys.delete(messageId);
  return false;
}

export function useReportUnsavedAnswerEdit(
  scope: AssistantDraftScopeValue | null,
  key: string | null,
  unsaved: boolean,
): void {
  const messageId = scope?.messageId ?? null;
  useEffect(() => {
    if (messageId === null || key === null) return;
    markUnsavedAnswerEdit(messageId, key, unsaved);
  }, [messageId, key, unsaved]);
}
