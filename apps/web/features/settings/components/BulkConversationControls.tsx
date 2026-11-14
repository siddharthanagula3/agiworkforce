'use client';

import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog, translateUiPlural } from '@agiworkforce/ui';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
  type WorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import {
  applyBulkConversationAction,
  fetchConversationHistoryStats,
} from '../services/conversation-data-service';

type Action = 'archive_all' | 'delete_all';
type Intent = {
  action: Action;
  phase: 'counting' | 'confirming' | 'writing' | 'done';
  generation: object;
  request: RequestAuthority;
  description: string;
  dispatched: boolean;
  ids: string[];
};
type View = {
  ready: object | null;
  intent: Intent | null;
  error: string | null;
  notice: string | null;
};
const EMPTY: View = { ready: null, intent: null, error: null, notice: null };
const STREAMING_ERROR = 'Finish or stop active replies before deleting all chats.';

function confirmationDescription(action: Action, count: number | null): string {
  if (action === 'archive_all') {
    const scope =
      count === null
        ? 'Every chat in the current workspace will move out of the sidebar'
        : translateUiPlural('settings', 'counts.chatsToArchive', count, {
            one: '{{count}} chat in the current workspace will move out of the sidebar',
            other: 'All {{count}} chats in the current workspace will move out of the sidebar',
          });
    return `${scope}. You can restore them from Archived chats at any time; this does not delete anything.`;
  }
  const scope =
    count === null
      ? 'Every chat in the current workspace, active and archived, will be removed from your history'
      : translateUiPlural('settings', 'counts.allChatsRemoved', count, {
          one: 'All {{count}} chat in the current workspace, active and archived, will be removed from your history',
          other:
            'All {{count}} chats in the current workspace, active and archived, will be removed from your history',
        });
  return `${scope}. You can restore them from Settings > Privacy > Recently deleted for 30 days. Memories learned from these chats stay until you delete them in Settings > Personalization.`;
}

function BulkRows({
  ready,
  action,
  writing = false,
  streaming,
  onChoose,
}: {
  ready: boolean;
  action: Action | null;
  writing?: boolean;
  streaming: boolean;
  onChoose: (action: Action) => void;
}) {
  return (
    <>
      {(['archive_all', 'delete_all'] as const).map((item) => {
        const deleting = item === 'delete_all';
        const disabled = !ready || (deleting && streaming);
        return (
          <div
            key={item}
            style={{
              padding: 'var(--space-4) 0',
              borderBottom: '1px solid var(--settings-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                {deleting
                  ? 'Delete all chats in this workspace'
                  : 'Archive all chats in this workspace'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                {deleting
                  ? 'Remove every active and archived conversation in this workspace from history. Restore them from Recently deleted within 30 days.'
                  : 'Move every chat out of the sidebar. You can restore them later.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChoose(item)}
              disabled={disabled}
              className="shrink-0 whitespace-nowrap"
              style={{
                padding: 'var(--space-2) var(--space-4)',
                fontSize: 14,
                fontWeight: 600,
                color: deleting ? 'var(--settings-destructive-text)' : 'var(--text-1)',
                background: 'transparent',
                border: `1px solid ${deleting ? 'var(--settings-destructive-text)' : 'var(--settings-border)'}`,
                borderRadius: 'var(--radius-md)',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {action === item
                ? writing
                  ? deleting
                    ? 'Deleting…'
                    : 'Archiving…'
                  : 'Preparing…'
                : deleting
                  ? 'Delete all'
                  : 'Archive all'}
            </button>
          </div>
        );
      })}
    </>
  );
}

function OwnedBulkControls({
  owner,
  epoch,
  scopeKey,
  organizationId,
}: {
  owner: WorkspaceOwner;
  epoch: number;
  scopeKey: string;
  organizationId: string | null;
}) {
  const router = useRouter();
  const streaming = useChatStore((state) => state.streamingConversationIds.length > 0);
  const lane = useMemo(
    () => ({
      active: false,
      generation: {} as object,
      ready: null as object | null,
      intent: null as Intent | null,
    }),
    [],
  );
  const [view, setView] = useState<View>(EMPTY);
  const ownerCurrent = useCallback(
    () =>
      owner.phase === 'admitted' &&
      owner.scopeKey === scopeKey &&
      workspaceOwnerIsCurrent(owner, epoch),
    [owner, epoch, scopeKey],
  );
  const current = (intent: Intent) =>
    lane.active &&
    lane.generation === intent.generation &&
    lane.intent === intent &&
    ownerCurrent();

  useLayoutEffect(() => {
    lane.active = true;
    lane.generation = {};
    lane.ready = {};
    setView({ ...EMPTY, ready: lane.ready });
    const retire = () => {
      lane.active = false;
      lane.ready = null;
      lane.intent?.request.retire();
      lane.intent = null;
    };
    const stop = subscribeWorkspaceAdmission(() => {
      if (!ownerCurrent()) {
        retire();
        setView(EMPTY);
      }
    });
    return () => {
      stop();
      retire();
    };
  }, [lane, ownerCurrent]);

  const finish = (intent: Intent, error: string | null = null, notice: string | null = null) => {
    if (!current(intent)) return;
    intent.phase = 'done';
    intent.request.retire();
    lane.intent = null;
    lane.ready = {};
    setView({ ready: lane.ready, intent: null, error, notice });
  };

  const choose = async (action: Action) => {
    const ready = view.ready;
    if (!ready || lane.ready !== ready || lane.intent || !lane.active || !ownerCurrent()) return;
    if (action === 'delete_all' && useChatStore.getState().streamingConversationIds.length > 0) {
      lane.ready = {};
      setView({ ...EMPTY, ready: lane.ready, error: STREAMING_ERROR });
      return;
    }

    const request = createRequestAuthority(
      owner.session,
      () => current(intent),
      () => {
        if (intent.phase !== 'writing') return;
        const store = useChatStore.getState();
        if (action === 'delete_all' && store.streamingConversationIds.length > 0) {
          throw new Error(STREAMING_ERROR);
        }
        intent.ids = store.conversations
          .filter((row) => action === 'delete_all' || !row.isArchived)
          .map((row) => row.id);
        intent.dispatched = true;
      },
    );
    const intent: Intent = {
      action,
      phase: 'counting',
      generation: lane.generation,
      request,
      description: '',
      dispatched: false,
      ids: [],
    };
    lane.intent = intent;
    lane.ready = null;
    setView({ ...EMPTY, intent });
    let count: number | null = null;
    try {
      const stats = await fetchConversationHistoryStats(undefined, { request, organizationId });
      count = action === 'archive_all' ? stats.activeConversationCount : stats.conversationCount;
    } catch {
      // An owned read failure may use the existing unnumbered scope. A retired
      // request must never turn into a fresh confirmation in the next workspace.
    }
    if (!request.isCurrent()) return;
    intent.phase = 'confirming';
    intent.description = confirmationDescription(action, count);
    setView({ ...EMPTY, intent });
  };

  const cancel = (intent: Intent) => {
    if (intent.phase === 'confirming') finish(intent);
  };
  const confirm = async (intent: Intent) => {
    if (!current(intent) || intent.phase !== 'confirming') return;
    intent.phase = 'writing';
    setView({ ...EMPTY, intent });
    if (
      intent.action === 'delete_all' &&
      useChatStore.getState().streamingConversationIds.length > 0
    ) {
      finish(intent, STREAMING_ERROR);
      return;
    }
    let acknowledged: number | null = null;
    try {
      const count = await applyBulkConversationAction(intent.action, {
        request: intent.request,
        organizationId,
      });
      if (!intent.request.isCurrent()) return;
      acknowledged = count;
      // Only reconcile rows present at dispatch. A later-created chat is not a
      // receipt for this operation. Workspace retirement fences all local effects.
      for (const id of intent.ids) {
        if (!intent.request.isCurrent()) return;
        const store = useChatStore.getState();
        if (intent.action === 'archive_all')
          store.updateConversation(id, { isArchived: true, isPinned: false });
        else store.deleteConversation(id);
      }
      if (!intent.request.isCurrent()) return;
      if (intent.action === 'delete_all') router.replace('/chat');
      finish(
        intent,
        null,
        intent.action === 'archive_all'
          ? translateUiPlural('settings', 'counts.archivedChats', count, {
              one: 'Archived {{count}} chat.',
              other: 'Archived {{count}} chats.',
            })
          : translateUiPlural('settings', 'counts.deletedChats', count, {
              one: 'Deleted {{count}} chat.',
              other: 'Deleted {{count}} chats.',
            }),
      );
    } catch (error) {
      if (!intent.request.isCurrent()) return;
      finish(
        intent,
        acknowledged !== null
          ? 'Your chat update was confirmed, but this view could not refresh. Reload this workspace to see the saved result.'
          : intent.dispatched
            ? 'We could not confirm whether your chats were updated. Check your chat history before starting another bulk action.'
            : error instanceof Error && error.message === STREAMING_ERROR
              ? STREAMING_ERROR
              : 'The chat update could not be started. Try again.',
      );
    }
  };

  const intent = view.intent;
  return (
    <>
      <BulkRows
        ready={view.ready !== null}
        action={intent?.action ?? null}
        writing={intent?.phase === 'writing'}
        streaming={streaming}
        onChoose={(action) => {
          void choose(action);
        }}
      />
      {intent?.phase === 'confirming' ? (
        <ConfirmDialog
          open
          title={
            intent.action === 'archive_all'
              ? 'Archive all chats in this workspace?'
              : 'Delete all chats in this workspace?'
          }
          description={intent.description}
          confirmText={intent.action === 'archive_all' ? 'Archive all' : 'Delete all chats'}
          variant={intent.action === 'archive_all' ? 'default' : 'destructive'}
          onConfirm={() => {
            void confirm(intent);
          }}
          onCancel={() => cancel(intent)}
          onOpenChange={(open) => {
            if (!open) cancel(intent);
          }}
        />
      ) : null}
      {view.error || view.notice ? (
        <div
          role={view.error ? 'alert' : 'status'}
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderBottom: '1px solid var(--settings-border)',
            color: view.error ? 'var(--chat-accent-primary)' : 'var(--text-2)',
            fontSize: 14,
          }}
        >
          {view.error ?? view.notice}
        </div>
      ) : null}
    </>
  );
}

export function BulkConversationControls() {
  const workspace = useAccountWorkspaces();
  const capture = useSessionSnapshot();
  const owner = observeWorkspaceOwner(capture());
  const data = workspace.data;
  const scopeKey = data
    ? JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId])
    : null;
  if (
    !owner ||
    owner.phase !== 'admitted' ||
    !data ||
    scopeKey === null ||
    owner.scopeKey !== scopeKey ||
    !workspaceOwnerIsCurrent(owner, owner.epoch)
  ) {
    return (
      <>
        <BulkRows ready={false} action={null} streaming={false} onChoose={() => undefined} />
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
          {workspace.requiresReload
            ? 'Reload this page to confirm the current workspace before managing chats.'
            : 'Your current workspace must finish loading before you can manage all chats.'}
          {workspace.isUnavailable && !workspace.requiresReload && !workspace.isSwitching ? (
            <button
              type="button"
              onClick={() => {
                void workspace.refetch();
              }}
            >
              Retry loading workspace
            </button>
          ) : null}
        </p>
      </>
    );
  }
  return (
    <OwnedBulkControls
      key={`${owner.incarnation}:${owner.epoch}:${scopeKey}`}
      owner={owner}
      epoch={owner.epoch}
      scopeKey={scopeKey}
      organizationId={data.activeOrganizationId}
    />
  );
}
