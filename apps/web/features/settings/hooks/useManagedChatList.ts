'use client';

import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { translateUiPlural } from '@agiworkforce/ui';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner, subscribeWorkspaceAdmission, workspaceOwnerIsCurrent,
} from '@/features/workspaces/lib/workspace-admission';
import { toWebConversation } from '@/lib/hooks/useConversations';
import {
  applyBulkConversationAction, deleteManagedConversation, listArchivedConversations,
  listDeletedConversations, restoreArchivedConversation, restoreDeletedConversation,
  type ArchivedConversationPage, type ArchivedConversationSummary,
} from '../services/conversation-data-service';

type Kind = 'archived' | 'deleted';
type Action = 'restore' | 'delete' | 'delete_archived';
type Intent = {
  action: Action;
  row: ArchivedConversationSummary | null;
  page: ArchivedConversationPage;
  phase: 'confirming' | 'writing';
  request: RequestAuthority;
  dispatched: boolean;
  ids: string[];
};
type Lane = {
  active: boolean;
  token: object;
  page: ArchivedConversationPage | null;
  operation: RequestAuthority | null;
  intent: Intent | null;
};
type View = {
  lane: Lane;
  token: object;
  page: ArchivedConversationPage | null;
  loading: boolean;
  loadingMore: boolean;
  intent: Intent | null;
  error: string | null;
  notice: string | null;
};
const STREAMING_ERROR = 'Finish or stop active replies before deleting these chats.';

export function useManagedChatList(kind: Kind) {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const epoch = owner?.epoch;
  const data = workspace.data;
  const scopeKey = data ? JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId]) : null;
  const organizationId = data?.activeOrganizationId ?? null;
  const router = useRouter();
  const lane = useMemo<Lane>(() => ({ active: false, token: {}, page: null, operation: null, intent: null }),
    [owner, epoch, scopeKey, kind]);
  const [state, setState] = useState<View | null>(null);
  const view = state?.lane === lane ? state : null;
  const ownerCurrent = useCallback(() => !!owner && epoch !== undefined && scopeKey !== null &&
    owner.phase === 'admitted' && owner.scopeKey === scopeKey && workspaceOwnerIsCurrent(owner, epoch),
    [owner, epoch, scopeKey]);
  const current = useCallback(() => lane.active && ownerCurrent(), [lane, ownerCurrent]);
  const list = kind === 'archived' ? listArchivedConversations : listDeletedConversations;
  const publish = useCallback((patch: Partial<View>) => {
    if (!current()) return;
    const token = {};
    lane.token = token;
    setState((previous) => ({ lane, page: null, loading: false, loadingMore: false,
      intent: null, error: null, notice: null, ...(previous?.lane === lane ? previous : {}), ...patch, token }));
  }, [current, lane]);

  const read = useCallback(async (append: boolean, retainedCount = 0, notice: string | null = null) => {
    if (!current() || lane.operation || lane.intent) return;
    const previous = lane.page;
    if (append && !previous?.hasMore) return;
    const request = createRequestAuthority(owner!.session, () => current() && lane.operation === request);
    lane.operation = request;
    lane.page = null;
    publish({ loading: !append, loadingMore: append, error: null, notice });
    try {
      let page = await list(append ? previous!.nextOffset : 0, undefined, { request, organizationId });
      request.assertCurrent();
      const offset = append ? previous!.nextOffset : 0;
      if (page.nextOffset < offset || (page.hasMore && (!page.conversations.length || page.nextOffset <= offset))) {
        throw new Error('Chat page did not advance');
      }
      if (!append) {
        while (page.hasMore && page.conversations.length < retainedCount) {
          const next = await list(page.nextOffset, undefined, { request, organizationId });
          request.assertCurrent();
          if (next.nextOffset < page.nextOffset || (next.hasMore &&
            (!next.conversations.length || next.nextOffset <= page.nextOffset))) throw new Error('Chat page did not advance');
          const ids = new Set(page.conversations.map((row) => row.id));
          if (next.hasMore && !next.conversations.some((row) => !ids.has(row.id))) throw new Error('Chat page did not advance');
          page = { ...next, conversations: [...page.conversations, ...next.conversations.filter((row) => !ids.has(row.id))] };
        }
      } else {
        const ids = new Set(previous!.conversations.map((row) => row.id));
        page = { ...page, conversations: [...previous!.conversations, ...page.conversations.filter((row) => !ids.has(row.id))] };
      }
      request.assertCurrent();
      lane.operation = null;
      lane.page = page;
      publish({ page, loading: false, loadingMore: false });
    } catch {
      if (request.isCurrent()) {
        lane.operation = null;
        publish({ loading: false, loadingMore: false,
          error: 'Chats could not be loaded. Refresh the list before managing chats.' });
      }
    } finally {
      if (lane.operation === request) lane.operation = null;
      request.retire();
    }
  }, [current, lane, list, organizationId, owner, publish]);

  useLayoutEffect(() => {
    lane.active = true;
    const retire = () => {
      lane.active = false;
      lane.page = null;
      lane.operation?.retire();
      lane.intent?.request.retire();
      lane.operation = null;
      lane.intent = null;
    };
    const stop = subscribeWorkspaceAdmission(() => {
      if (!ownerCurrent()) { retire(); setState(null); }
    });
    if (ownerCurrent()) void read(false);
    return () => { stop(); retire(); };
  }, [lane, ownerCurrent, read]);

  const isReady = view?.token === lane.token && !!view?.page && lane.page === view.page && current() && !lane.operation && !lane.intent;
  const execute = async (intent: Intent) => {
    if (!current() || lane.intent !== intent || intent.phase !== 'confirming') return;
    intent.phase = 'writing';
    publish({ intent, error: null, notice: null });
    let confirmed = false;
    let notice: string | null = null;
    try {
      const scope = { request: intent.request, organizationId };
      if (intent.action === 'restore') {
        const restored = await (kind === 'archived' ? restoreArchivedConversation : restoreDeletedConversation)(intent.row!.id, scope);
        intent.request.assertCurrent();
        confirmed = true;
        const conversation = toWebConversation(restored);
        intent.request.assertCurrent();
        useChatStore.getState().upsertConversation(conversation);
        intent.request.assertCurrent();
        notice = `Restored “${intent.row!.title}”.`;
      } else {
        let count = 1;
        if (intent.action === 'delete_archived') count = await applyBulkConversationAction('delete_archived', scope);
        else await deleteManagedConversation(intent.row!.id, scope);
        intent.request.assertCurrent();
        confirmed = true;
        for (const id of intent.ids) {
          intent.request.assertCurrent();
          const store = useChatStore.getState();
          const active = store.activeConversationId === id;
          store.deleteConversation(id);
          intent.request.assertCurrent();
          if (active) router.replace('/chat');
          intent.request.assertCurrent();
        }
        notice = intent.action === 'delete_archived'
          ? translateUiPlural('settings', 'counts.deletedArchivedChats', count, {
            one: 'Deleted {{count}} archived chat.', other: 'Deleted {{count}} archived chats.',
          })
          : `Deleted “${intent.row!.title}”.`;
      }
    } catch (error) {
      if (!intent.request.isCurrent()) return;
      notice = confirmed
        ? 'Your chat update was confirmed, but this view could not refresh. Refresh the list to see the saved result.'
        : intent.dispatched
          ? 'We could not confirm whether your chats were updated. Check the refreshed list before choosing another action.'
          : error instanceof Error && error.message === STREAMING_ERROR ? STREAMING_ERROR
            : 'The chat update could not be started.';
    } finally {
      if (current() && lane.intent === intent) {
        intent.request.retire();
        lane.intent = null;
        lane.page = null;
        publish({ intent: null, notice });
        // Reads reconcile an uncertain receipt; they never replay the mutation.
        void read(false, intent.action === 'delete_archived' && confirmed ? 0
          : Math.max(0, intent.page.conversations.length - (confirmed ? 1 : 0)), notice);
      } else intent.request.retire();
    }
  };

  const choose = (action: Action, row: ArchivedConversationSummary | null = null) => {
    const page = view?.page;
    if (!isReady || view?.token !== lane.token || !page || lane.page !== page || lane.operation || lane.intent || !current()) return;
    if (action === 'delete_archived' && kind !== 'archived') return;
    if (action !== 'delete_archived' && (!row || !page.conversations.includes(row))) return;
    let intent: Intent;
    const request = createRequestAuthority(owner!.session,
      () => current() && lane.intent === intent,
      () => {
        if (intent.phase !== 'writing') throw new Error('Chat action is not ready');
        const store = useChatStore.getState();
        if (action !== 'restore' && (action === 'delete_archived'
          ? store.streamingConversationIds.length > 0 : store.streamingConversationIds.includes(row!.id))) {
          throw new Error(STREAMING_ERROR);
        }
        intent.ids = action === 'delete_archived'
          ? store.conversations.filter((item) => item.isArchived).map((item) => item.id)
          : [row!.id];
        intent.dispatched = true;
      });
    intent = { action, row, page, phase: 'confirming', request, dispatched: false, ids: [] };
    lane.intent = intent;
    lane.page = null;
    publish({ intent, error: null, notice: null });
    if (action === 'restore') void execute(intent);
  };
  const cancel = (intent: Intent) => {
    if (!current() || lane.intent !== intent || intent.phase !== 'confirming') return;
    intent.request.retire();
    lane.intent = null;
    lane.page = intent.page;
    publish({ intent: null });
  };
  const confirmation = view?.intent?.phase === 'confirming' ? view.intent : null;
  const admitted = ownerCurrent();
  const resolvingWorkspace = !admitted && (workspace.isLoading || workspace.isSwitching);
  return {
    conversations: admitted ? view?.page?.conversations ?? [] : [],
    hasMore: admitted && !!view?.page?.hasMore,
    loading: resolvingWorkspace || (admitted && (!view || view.loading)),
    loadingMore: !!view?.loadingMore,
    ready: isReady,
    actionId: view?.intent ? view.intent.row?.id ?? 'all' : null,
    error: admitted ? view?.error ?? null : resolvingWorkspace ? null : workspace.requiresReload
      ? 'Reload this page to confirm the current workspace before managing chats.'
      : 'Your current workspace must finish loading before you can manage chats.',
    loadFailed: (!admitted && !resolvingWorkspace) || (admitted && !!view?.error && !lane.page),
    notice: admitted ? view?.notice ?? null : null,
    retry: () => {
      if (!admitted) { if (!workspace.requiresReload && !workspace.isSwitching) void workspace.refetch(); return; }
      if (view?.token === lane.token && !lane.operation && !lane.intent) void read(false, 0, view.notice);
    },
    loadMore: () => { if (isReady && view?.token === lane.token && view?.page === lane.page) void read(true); },
    restore: (row: ArchivedConversationSummary) => choose('restore', row),
    remove: (row: ArchivedConversationSummary) => choose('delete', row),
    removeAll: () => choose('delete_archived'),
    confirmation,
    confirm: () => { if (confirmation) void execute(confirmation); },
    cancel: () => { if (confirmation) cancel(confirmation); },
  };
}
