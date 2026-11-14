'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CONVERSATION_SHARES_PATH,
  ConversationShareAudienceResponseSchema,
  ConversationShareCreatedSchema,
  ConversationShareListQuerySchema,
  ConversationShareListResponseSchema,
  ConversationSharesRefreshedSchema,
  ConversationSharesRevokedSchema,
  conversationSharePath,
  conversationSharesPath,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  type ConversationShareVisibility,
} from '@agiworkforce/cloud-contracts';
import { toUserMessage } from '@/lib/user-error-message';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from '@features/chat/stores/artifacts-store';
import { snapshotArtifacts } from '@features/chat/lib/shared-conversation-snapshot';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { TEMPORARY_CHAT_SHARE_REFUSAL } from '@/lib/temporary-chat-policy';
import { SHARE_CONVERSATION_CLIENT_DEADLINE_MS } from '@/lib/deadline-policy';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner,
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
} from '@/features/workspaces/lib/workspace-admission';

export type ShareExpiryDays = 1 | 7 | 30;

/**
 * Who may open the shared page. `public` is knowledge of the link;
 * `organization` closes the link and leaves it readable only to the members of
 * the owner's workspace. Expiry applies to both.
 */
export type ShareAudience = ConversationShareVisibility;

export interface ActiveConversationShare {
  url: string;
  token: string;
  expiresAt: string;
  messageCount: number;
  audience: ShareAudience;
  /** Null when the sharer belongs to no workspace, so there is nobody to share with. */
  workspace: { memberCount: number } | null;
}

export interface ConversationShare extends ActiveConversationShare {
  linkCount: number;
  mayHaveUnlistedLinks: boolean;
  newMessages: number;
  newMessagesVary: boolean;
}

interface InFlightShareRequest {
  view: ShareView;
  authority: RequestAuthority;
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
  dismissed: boolean;
  timedOut: boolean;
}

interface ShareScope {
  conversationId: string | null | undefined;
  session: SessionAuthority | null;
  selector: string;
  isCurrent: () => boolean;
}

interface ShareView {
  scope: ShareScope;
  active: boolean;
  requests: Set<RequestAuthority>;
}

function viewIsCurrent(view: ShareView | null): view is ShareView {
  return view !== null && view.active && view.scope.isCurrent();
}

function retireView(view: ShareView): void {
  view.active = false;
  for (const request of view.requests) request.retire();
  view.requests.clear();
}

interface ConversationLiveShares {
  view: ShareView;
  conversationId: string;
  shares: ActiveConversationShare[];
  lookupFailed: boolean;
  complete: boolean;
}

const SHARE_LOOKUP_FAILED = 'Could not check whether this chat already has a shared link.';
const TRANSCRIPT_NOT_READY = 'This chat is still loading. Try again in a moment.';
const NO_SHARES: ActiveConversationShare[] = [];
const NO_MESSAGES: Message[] = [];

type ChatStoreState = ReturnType<typeof useChatStore.getState>;

function transcriptOf(
  state: ChatStoreState,
  conversationId: string | null | undefined,
): Message[] | null {
  return conversationId && state.activeConversationId === conversationId ? state.messages : null;
}

function readCreatedShare(value: unknown): ActiveConversationShare {
  const parsed = ConversationShareCreatedSchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid share response');
  return {
    url: parsed.data.shareUrl,
    token: parsed.data.token,
    expiresAt: parsed.data.expiresAt,
    messageCount: parsed.data.messageCount,
    audience: parsed.data.visibility,
    workspace: parsed.data.workspace,
  };
}

function snapshotMessages(conversationId: string, messages: Message[]) {
  return messages.map((m) => {
    const artifacts =
      m.role === 'assistant'
        ? snapshotArtifacts(
            conversationId,
            m.id,
            m.content,
            useArtifactsStore.getState().getMessageArtifacts(m.id),
          )
        : [];
    return {
      role: m.role,
      content: m.content,
      created_at: m.createdAt,
      ...(m.metadata?.artifactDerivation
        ? { artifact_derivation: m.metadata.artifactDerivation }
        : {}),
      ...(artifacts.length > 0 ? { artifacts } : {}),
      ...(m.attachments && m.attachments.length > 0
        ? {
            attachments: m.attachments.map((a) => ({
              name: a.name,
              type: a.type,
              mimeType: a.mimeType,
            })),
          }
        : {}),
    };
  });
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body: unknown = await res.json().catch(() => ({}));
  return (body as { error?: { message?: string } }).error?.message ?? fallback;
}

async function readLiveShares(
  conversationId: string,
  authority: RequestAuthority,
  selector: string,
): Promise<{ shares: ActiveConversationShare[]; complete: boolean }> {
  const res = await authority.fetch(conversationSharesPath(conversationId), {
    cache: 'no-store',
    headers: { [MANAGED_CLOUD_ORGANIZATION_HEADER]: selector },
  });
  if (!res.ok) throw new Error(SHARE_LOOKUP_FAILED);
  const { shares, workspace, complete } = ConversationShareListResponseSchema.parse(
    await res.json(),
  );
  authority.assertCurrent();
  return {
    complete,
    shares: shares
      .filter((share) => !share.expired)
      .map((share) => ({
        url: share.shareUrl,
        token: share.token,
        expiresAt: share.expiresAt,
        messageCount: share.messageCount,
        audience: share.visibility,
        workspace: workspace ?? null,
      })),
  };
}

async function writeShare(
  request: InFlightShareRequest,
  path: string,
  method: string,
  body: string | undefined,
  fallback: string,
): Promise<unknown> {
  request.authority.assertCurrent();
  const headers = await addCsrfHeaders({
    'Content-Type': 'application/json',
    [MANAGED_CLOUD_ORGANIZATION_HEADER]: request.view.scope.selector,
  });
  request.authority.assertCurrent();
  const response = await request.authority.fetch(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    signal: request.controller.signal,
  });
  if (!response.ok) {
    const message = await readErrorMessage(response, fallback);
    request.authority.assertCurrent();
    throw new Error(message);
  }
  const result: unknown = await response.json();
  request.authority.assertCurrent();
  return result;
}

export function useShareConversation(
  conversationTitle?: string,
  modelId?: string,
  conversationId?: string | null,
  open = false,
) {
  const workspace = useAccountWorkspaces();
  const captureSession = useSessionSnapshot();
  const owner = observeWorkspaceOwner(captureSession());
  const epoch = owner?.epoch;
  const workspaceData = workspace.data;
  const scopeKey = workspaceData
    ? JSON.stringify([
        workspaceData.scope,
        workspaceData.activeWorkspaceId,
        workspaceData.activeOrganizationId,
      ])
    : null;
  const renderedScope = useRef<ShareScope | null>(null);
  const scope = useMemo(() => {
    const next: ShareScope = {
      conversationId,
      session: owner?.session ?? null,
      selector:
        workspaceData?.activeOrganizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      isCurrent: () =>
        renderedScope.current === next &&
        open &&
        !!owner &&
        epoch !== undefined &&
        scopeKey !== null &&
        owner.phase === 'admitted' &&
        owner.scopeKey === scopeKey &&
        workspaceOwnerIsCurrent(owner, epoch),
    };
    return Object.assign(next, { binding: { conversationId } });
  }, [owner, epoch, scopeKey, workspaceData?.activeOrganizationId, open, conversationId]);
  renderedScope.current = scope;
  const [view, setView] = useState<ShareView | null>(null);
  const [, redraw] = useState(0);
  const isViewCurrent = useCallback(() => viewIsCurrent(view), [view]);
  const [sharingRequest, setSharingRequest] = useState<InFlightShareRequest | null>(null);
  const [liveShares, commitLiveShares] = useState<ConversationLiveShares | null>(null);
  const liveSharesRef = useRef<ConversationLiveShares | null>(null);
  const setLiveShares = useCallback(
    (update: (current: ConversationLiveShares | null) => ConversationLiveShares | null) => {
      const next = update(liveSharesRef.current);
      if (next === liveSharesRef.current || !next || !viewIsCurrent(next.view)) return;
      liveSharesRef.current = next;
      commitLiveShares((current) =>
        liveSharesRef.current === next && viewIsCurrent(next.view) ? next : current,
      );
    },
    [],
  );
  const [lookupPending, setLookupPending] = useState<ShareView | null>(null);
  const [viewError, setViewError] = useState<{ view: ShareView; message: string } | null>(null);
  const setError = useCallback(
    (message: string | null) => {
      if (!viewIsCurrent(view)) return;
      setViewError((current) => {
        if (!viewIsCurrent(view)) return current;
        return message === null ? null : { view, message };
      });
    },
    [view],
  );
  const inFlightRef = useRef<InFlightShareRequest | null>(null);
  useLayoutEffect(() => {
    const next: ShareView = { scope, active: true, requests: new Set() };
    setView(next);
    const retire = () => {
      retireView(next);
      const pending = inFlightRef.current;
      if (pending?.view === next) {
        pending.dismissed = true;
        clearTimeout(pending.timeout);
        pending.controller.abort();
        inFlightRef.current = null;
        setSharingRequest((current) => (current === pending ? null : current));
      }
    };
    const reconcile = () => {
      if (viewIsCurrent(next)) return;
      retire();
      redraw((value) => value + 1);
    };
    const stopWorkspace = subscribeWorkspaceAdmission(reconcile);
    const stopSession = scope.session?.subscribe?.(reconcile);
    return () => {
      stopWorkspace();
      stopSession?.();
      retire();
    };
  }, [scope]);
  const workspacePending =
    open &&
    (workspace.isLoading ||
      workspace.isSwitching ||
      (scope.isCurrent() && (view === null || view.scope !== scope)));
  const workspaceUnavailable = open && !workspacePending && !viewIsCurrent(view);
  const error = workspaceUnavailable
    ? workspace.requiresReload
      ? 'Reload this page to confirm your workspace before sharing.'
      : 'Sharing is unavailable until your account and workspace are ready. Close this dialog and try again.'
    : viewIsCurrent(view) && viewError?.view === view
      ? viewError.message
      : null;
  const transcript = useChatStore((s) => transcriptOf(s, conversationId));
  const isTemporary = useChatStore((s) =>
    conversationId
      ? (s.conversations.find((c) => c.id === conversationId)?.isTemporary ?? false)
      : false,
  );
  const messageCount = (transcript ?? NO_MESSAGES).length;
  const hasMessages = messageCount > 0;
  const storedConversationId =
    conversationId &&
    !isTemporary &&
    ConversationShareListQuerySchema.safeParse({ conversation_id: conversationId }).success
      ? conversationId
      : null;
  const checkingShare =
    open &&
    viewIsCurrent(view) &&
    storedConversationId !== null &&
    (lookupPending === view ||
      liveShares?.view !== view ||
      liveShares.conversationId !== storedConversationId);
  const loadingChat = open && storedConversationId !== null && transcript === null;
  const shownLiveShares =
    viewIsCurrent(view) &&
    liveShares?.view === view &&
    !checkingShare &&
    !loadingChat &&
    liveShares.conversationId === conversationId
      ? liveShares
      : null;
  const shownShares = shownLiveShares?.shares ?? NO_SHARES;
  const inventoryIncomplete = shownLiveShares !== null && !shownLiveShares.complete;
  const activeShare = useMemo((): ConversationShare | null => {
    const widest: ShareAudience = shownShares.some((share) => share.audience === 'public')
      ? 'public'
      : 'organization';
    const shown = shownShares.find((share) => share.audience === widest);
    if (!shown) return null;
    const fewestShown = Math.min(...shownShares.map((share) => share.messageCount));
    return {
      ...shown,
      linkCount: shownShares.length,
      mayHaveUnlistedLinks: inventoryIncomplete,
      newMessages: Math.max(0, messageCount - fewestShown),
      newMessagesVary: shownShares.some((share) => share.messageCount !== fewestShown),
    };
  }, [shownShares, inventoryIncomplete, messageCount]);

  useEffect(() => {
    if (!viewIsCurrent(view) || !view.scope.session || !storedConversationId) return;
    const authority = createRequestAuthority(view.scope.session, () => viewIsCurrent(view));
    view.requests.add(authority);
    setLookupPending((current) => (viewIsCurrent(view) ? view : current));
    setError(null);
    readLiveShares(storedConversationId, authority, view.scope.selector)
      .then(
        ({ shares, complete }) => {
          if (!authority.isCurrent()) return;
          setLiveShares((current) =>
            viewIsCurrent(view)
              ? {
                  view,
                  conversationId: storedConversationId,
                  shares,
                  lookupFailed: false,
                  complete,
                }
              : current,
          );
          setLookupPending((current) => (viewIsCurrent(view) && current === view ? null : current));
          setError(null);
        },
        (caught: unknown) => {
          if (!authority.isCurrent()) return;
          setLiveShares((current) =>
            viewIsCurrent(view)
              ? {
                  view,
                  conversationId: storedConversationId,
                  shares: [],
                  lookupFailed: true,
                  complete: false,
                }
              : current,
          );
          setLookupPending((current) => (viewIsCurrent(view) && current === view ? null : current));
          setError(toUserMessage(caught, SHARE_LOOKUP_FAILED));
        },
      )
      .finally(() => {
        authority.retire();
        view.requests.delete(authority);
      });
    return () => {
      authority.retire();
      view.requests.delete(authority);
    };
  }, [view, storedConversationId, setError, setLiveShares]);

  const beginRequest = useCallback((): InFlightShareRequest | null => {
    if (!viewIsCurrent(view) || !view.scope.session || inFlightRef.current) return null;
    const controller = new AbortController();
    const authority = createRequestAuthority(
      view.scope.session,
      () => viewIsCurrent(view) && !controller.signal.aborted,
    );
    view.requests.add(authority);
    const request: InFlightShareRequest = {
      view,
      authority,
      controller,
      timeout: undefined as unknown as ReturnType<typeof setTimeout>,
      dismissed: false,
      timedOut: false,
    };
    request.timeout = setTimeout(() => {
      request.timedOut = true;
      controller.abort();
      authority.retire();
    }, SHARE_CONVERSATION_CLIENT_DEADLINE_MS);
    inFlightRef.current = request;
    setSharingRequest((current) =>
      viewIsCurrent(view) && inFlightRef.current === request ? request : current,
    );
    setError(null);
    return request;
  }, [view, setError]);

  const finishRequest = useCallback((request: InFlightShareRequest) => {
    clearTimeout(request.timeout);
    request.authority.retire();
    request.view.requests.delete(request.authority);
    if (inFlightRef.current !== request) return;
    inFlightRef.current = null;
    setSharingRequest((current) => (current === request ? null : current));
  }, []);

  const showRequestError = useCallback(
    (request: InFlightShareRequest, caught: unknown, fallback: string) => {
      if (request.dismissed || !viewIsCurrent(request.view) || inFlightRef.current !== request)
        return;
      setError(
        request.timedOut
          ? 'The request took too long. Please try again.'
          : toUserMessage(caught, fallback),
      );
    },
    [setError],
  );

  const cancelPending = useCallback(() => {
    if (view) retireView(view);
    const request = inFlightRef.current;
    redraw((value) => value + 1);
    if (!request || request.view !== view) return;
    request.dismissed = true;
    clearTimeout(request.timeout);
    request.controller.abort();
    inFlightRef.current = null;
    setSharingRequest((current) => (current === request ? null : current));
  }, [view]);

  const share = useCallback(
    async (expiresInDays: ShareExpiryDays): Promise<boolean> => {
      if (!isViewCurrent()) return false;
      if (!conversationId) {
        setError('Add a message before creating a public link.');
        return false;
      }
      const sharedConversationId = conversationId;
      if (isTemporary) {
        setError(TEMPORARY_CHAT_SHARE_REFUSAL);
        return false;
      }
      const sharedMessages = transcriptOf(useChatStore.getState(), sharedConversationId);
      if (!sharedMessages) {
        setError(TRANSCRIPT_NOT_READY);
        return false;
      }
      if (sharedMessages.length === 0) {
        setError('Add a message before creating a public link.');
        return false;
      }
      const request = beginRequest();
      if (!request) return false;
      try {
        const body = JSON.stringify({
          conversation_id: sharedConversationId,
          title: conversationTitle || 'Shared Session',
          model_id: modelId,
          expires_in_days: expiresInDays,
          messages: snapshotMessages(sharedConversationId, sharedMessages),
        });
        const result = await writeShare(
          request,
          CONVERSATION_SHARES_PATH,
          'POST',
          body,
          'Failed to share',
        );
        request.authority.assertCurrent();
        const created = readCreatedShare(result);
        setLiveShares((current) => {
          if (!viewIsCurrent(request.view)) return current;
          const listed =
            current?.view === request.view && current.conversationId === sharedConversationId
              ? current
              : null;
          return {
            view: request.view,
            conversationId: sharedConversationId,
            shares: [created, ...(listed?.shares ?? [])],
            lookupFailed: listed?.lookupFailed ?? false,
            complete: listed?.complete ?? false,
          };
        });
        return true;
      } catch (err) {
        showRequestError(request, err, 'Could not create the public link.');
        return false;
      } finally {
        finishRequest(request);
      }
    },
    [
      conversationTitle,
      modelId,
      conversationId,
      isTemporary,
      isViewCurrent,
      setError,
      beginRequest,
      finishRequest,
      showRequestError,
      setLiveShares,
    ],
  );

  const updateLink = useCallback(async (): Promise<boolean> => {
    if (!isViewCurrent()) return false;
    if (!shownLiveShares?.complete || liveSharesRef.current !== shownLiveShares) return false;
    if (!activeShare || !conversationId) return false;
    const sharedConversationId = conversationId;
    const sharedMessages = transcriptOf(useChatStore.getState(), sharedConversationId);
    if (!sharedMessages) {
      setError(TRANSCRIPT_NOT_READY);
      return false;
    }
    if (sharedMessages.length === 0) {
      setError('Add a message before updating the link.');
      return false;
    }
    const request = beginRequest();
    if (!request) return false;
    try {
      const body = JSON.stringify({
        tokens: shownShares.map((link) => link.token),
        title: conversationTitle || 'Shared Session',
        model_id: modelId,
        messages: snapshotMessages(sharedConversationId, sharedMessages),
      });
      const result = await writeShare(
        request,
        conversationSharesPath(sharedConversationId),
        'PUT',
        body,
        'Could not update the link.',
      );
      request.authority.assertCurrent();
      const refreshed = ConversationSharesRefreshedSchema.parse(result);
      setLiveShares((current) => {
        if (!viewIsCurrent(request.view)) return current;
        const listed =
          current?.view === request.view && current.conversationId === sharedConversationId
            ? current
            : null;
        return {
          view: request.view,
          conversationId: sharedConversationId,
          shares: (listed?.shares ?? [])
            .filter((link) => refreshed.tokens.includes(link.token))
            .map((link) => ({ ...link, messageCount: refreshed.messageCount })),
          lookupFailed: listed?.lookupFailed ?? false,
          complete: listed?.complete ?? false,
        };
      });
      return true;
    } catch (err) {
      showRequestError(request, err, 'Could not update the link.');
      return false;
    } finally {
      finishRequest(request);
    }
  }, [
    activeShare,
    shownShares,
    shownLiveShares,
    conversationTitle,
    modelId,
    conversationId,
    isViewCurrent,
    setError,
    beginRequest,
    finishRequest,
    showRequestError,
    setLiveShares,
  ]);

  const revoke = useCallback(async (): Promise<boolean> => {
    if (!storedConversationId || (!activeShare && !inventoryIncomplete)) return false;
    const sharedConversationId = storedConversationId;
    const request = beginRequest();
    if (!request) return false;
    try {
      const result = await writeShare(
        request,
        conversationSharesPath(sharedConversationId),
        'DELETE',
        undefined,
        'Failed to revoke share link',
      );
      request.authority.assertCurrent();
      ConversationSharesRevokedSchema.parse(result);
      setLiveShares((current) =>
        viewIsCurrent(request.view)
          ? {
              view: request.view,
              conversationId: sharedConversationId,
              shares: [],
              lookupFailed: false,
              complete: false,
            }
          : current,
      );
      try {
        const inventory = await readLiveShares(
          sharedConversationId,
          request.authority,
          request.view.scope.selector,
        );
        request.authority.assertCurrent();
        setLiveShares((current) =>
          viewIsCurrent(request.view)
            ? {
                view: request.view,
                conversationId: sharedConversationId,
                ...inventory,
                lookupFailed: false,
              }
            : current,
        );
      } catch {
        if (!request.dismissed && viewIsCurrent(request.view)) {
          setError(
            'The revocation request succeeded, but the remaining links could not be checked. Close and reopen this dialog to check again.',
          );
        }
      }
      return true;
    } catch (err) {
      showRequestError(request, err, 'Could not revoke the public link.');
      return false;
    } finally {
      finishRequest(request);
    }
  }, [
    activeShare,
    storedConversationId,
    inventoryIncomplete,
    beginRequest,
    finishRequest,
    showRequestError,
    setError,
    setLiveShares,
  ]);

  /**
   * Move every live link of the chat to one audience. Tokens and expiries are
   * untouched, so switching back restores the same URLs on the same clocks.
   */
  const setAudience = useCallback(
    async (audience: ShareAudience): Promise<boolean> => {
      if (!shownLiveShares?.complete || liveSharesRef.current !== shownLiveShares) return false;
      if (!activeShare || audience === activeShare.audience) return false;
      const request = beginRequest();
      if (!request) return false;
      try {
        for (const link of shownShares.filter((candidate) => candidate.audience !== audience)) {
          request.authority.assertCurrent();
          const result = await writeShare(
            request,
            conversationSharePath(link.token),
            'PATCH',
            JSON.stringify({ visibility: audience }),
            'Could not change who can open this.',
          );
          request.authority.assertCurrent();
          const body = ConversationShareAudienceResponseSchema.parse(result);
          setLiveShares((current) =>
            viewIsCurrent(request.view) && current?.view === request.view
              ? {
                  ...current,
                  shares: current.shares.map((share) =>
                    share.token === link.token ? { ...share, audience: body.visibility } : share,
                  ),
                }
              : current,
          );
        }
        return true;
      } catch (err) {
        showRequestError(request, err, 'Could not change who can open this.');
        return false;
      } finally {
        finishRequest(request);
      }
    },
    [
      activeShare,
      shownShares,
      shownLiveShares,
      beginRequest,
      finishRequest,
      showRequestError,
      setLiveShares,
    ],
  );

  return {
    view,
    isViewCurrent,
    workspacePending,
    workspaceUnavailable,
    share,
    updateLink,
    revoke,
    setAudience,
    isSharing: viewIsCurrent(view) && sharingRequest?.view === view,
    hasMessages,
    isTemporary,
    activeShare,
    inventoryIncomplete,
    checkingShare,
    loadingChat,
    error,
    cancelPending,
  };
}
