'use client';

import { useChatStore, selectDraftContent } from '@shared/stores/web-chat-store';

export const WORK_ENTRY_POINTS = [
  'file',
  'artifact',
  'connector_result',
  'browser_page',
  'desktop_context',
] as const;

export type WorkEntryPoint = (typeof WORK_ENTRY_POINTS)[number];

export const WORK_ENTRY_POINT_LABELS: Readonly<Record<WorkEntryPoint, string>> = Object.freeze({
  file: 'Start Work from this file',
  artifact: 'Start Work from this artifact',
  connector_result: 'Start Work from this result',
  browser_page: 'Start Work from this page',
  desktop_context: 'Start Work from this window',
});

const OBJECTIVE_OPENERS: Readonly<Record<WorkEntryPoint, string>> = Object.freeze({
  file: 'Work from the file',
  artifact: 'Work from the artifact',
  connector_result: 'Work from the result of',
  browser_page: 'Work from the page',
  desktop_context: 'Work from the window',
});

export interface WorkLaunchSource {
  entryPoint: WorkEntryPoint;
  title: string;
  reference?: string | null;
  detail?: string | null;
}

export interface WorkLaunchRequest {
  source: WorkLaunchSource;
  objective?: string | null;
  conversationId?: string | null;
}

export function buildWorkObjective(request: WorkLaunchRequest): string {
  const { source } = request;
  const title = source.title.trim();
  const lines = [
    `${OBJECTIVE_OPENERS[source.entryPoint]} ${title || 'this'}`.trim(),
    source.reference?.trim() ? `Source: ${source.reference.trim()}` : null,
    source.detail?.trim() || null,
    request.objective?.trim() || null,
  ];
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

// A draft the person already typed is newer than anything a menu contributes,
// so the objective is appended under it rather than replacing it.
export function mergeIntoDraft(draft: string, objective: string): string {
  return draft.trim() ? `${draft.replace(/\s+$/, '')}\n\n${objective}` : objective;
}

/**
 * An omitted conversationId means the open conversation; an explicit null means
 * a new chat.
 */
export function startWork(request: WorkLaunchRequest): void {
  const state = useChatStore.getState();
  const conversationId =
    request.conversationId === undefined ? state.activeConversationId : request.conversationId;
  const draft = selectDraftContent(conversationId)(state);
  state.setComposerToggles({ workMode: 'agiwork' }, conversationId);
  state.setDraftContent(mergeIntoDraft(draft, buildWorkObjective(request)), conversationId);
}
