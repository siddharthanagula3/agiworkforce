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
  type ConversationShareVisibility,
} from '@agiworkforce/cloud-contracts';
import { toUserMessage } from '@/lib/user-error-message';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from '@features/chat/stores/artifacts-store';
import { snapshotArtifacts } from '@features/chat/lib/shared-conversation-snapshot';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { TEMPORARY_CHAT_SHARE_REFUSAL } from '@/lib/temporary-chat-policy';
import { SHARE_CONVERSATION_CLIENT_DEADLINE_MS } from '@/lib/deadline-policy';

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
  newMessages: number;
  newMessagesVary: boolean;
}

interface InFlightShareRequest {
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
  dismissed: boolean;
  timedOut: boolean;
}

interface ConversationLiveShares {
  conversationId: string;
  shares: ActiveConversationShare[];
}

const SHARE_LOOKUP_FAILED = 'Could not check whether this chat already has a shared link.';
const NO_SHARES: ActiveConversationShare[] = [];

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
  signal: AbortSignal,
): Promise<ActiveConversationShare[]> {
  const res = await fetch(conversationSharesPath(conversationId), {
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw new Error(SHARE_LOOKUP_FAILED);
  const { shares, workspace } = ConversationShareListResponseSchema.parse(await res.json());
  return shares
    .filter((share) => !share.expired)
    .map((share) => ({
      url: share.shareUrl,
      token: share.token,
      expiresAt: share.expiresAt,
      messageCount: share.messageCount,
      audience: share.visibility,
      workspace: workspace ?? null,
    }));
}

export function useShareConversation(
  conversationTitle?: string,
  modelId?: string,
  conversationId?: string | null,
  open = false,
) {
  const [isSharing, setIsSharing] = useState(false);
  const [liveShares, setLiveShares] = useState<ConversationLiveShares | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<InFlightShareRequest | null>(null);
  const messages = useChatStore((s) => s.messages);
  const isTemporary = useChatStore((s) =>
    conversationId
      ? (s.conversations.find((c) => c.id === conversationId)?.isTemporary ?? false)
      : false,
  );
  const messageCount = messages.length;
  const hasMessages = messageCount > 0;
  const storedConversationId =
    conversationId &&
    !isTemporary &&
    ConversationShareListQuerySchema.safeParse({ conversation_id: conversationId }).success
      ? conversationId
      : null;
  const checkingShare =
    open &&
    storedConversationId !== null &&
    (lookupPending || liveShares?.conversationId !== storedConversationId);
  const shownShares =
    !checkingShare && liveShares && liveShares.conversationId === conversationId
      ? liveShares.shares
      : NO_SHARES;
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
      newMessages: Math.max(0, messageCount - fewestShown),
      newMessagesVary: shownShares.some((share) => share.messageCount !== fewestShown),
    };
  }, [shownShares, messageCount]);

  useLayoutEffect(() => {
    if (!open) return;
    setLookupPending(true);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || !storedConversationId) return;
    const controller = new AbortController();
    readLiveShares(storedConversationId, controller.signal).then(
      (shares) => {
        if (controller.signal.aborted) return;
        setLiveShares({ conversationId: storedConversationId, shares });
        setLookupPending(false);
        setError(null);
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setLiveShares({ conversationId: storedConversationId, shares: [] });
        setLookupPending(false);
        setError(toUserMessage(caught, SHARE_LOOKUP_FAILED));
      },
    );
    return () => controller.abort();
  }, [open, storedConversationId]);

  const beginRequest = useCallback((): InFlightShareRequest | null => {
    if (inFlightRef.current) return null;
    const controller = new AbortController();
    const request: InFlightShareRequest = {
      controller,
      timeout: undefined as unknown as ReturnType<typeof setTimeout>,
      dismissed: false,
      timedOut: false,
    };
    request.timeout = setTimeout(() => {
      request.timedOut = true;
      controller.abort();
    }, SHARE_CONVERSATION_CLIENT_DEADLINE_MS);
    inFlightRef.current = request;
    setIsSharing(true);
    setError(null);
    return request;
  }, []);

  const finishRequest = useCallback((request: InFlightShareRequest) => {
    clearTimeout(request.timeout);
    if (inFlightRef.current !== request) return;
    inFlightRef.current = null;
    setIsSharing(false);
  }, []);

  const showRequestError = useCallback(
    (request: InFlightShareRequest, caught: unknown, fallback: string) => {
      if (request.dismissed || inFlightRef.current !== request) return;
      setError(
        request.timedOut
          ? 'The request took too long. Please try again.'
          : toUserMessage(caught, fallback),
      );
    },
    [],
  );

  const cancelPending = useCallback(() => {
    const request = inFlightRef.current;
    if (!request) return;
    request.dismissed = true;
    clearTimeout(request.timeout);
    request.controller.abort();
    inFlightRef.current = null;
    setIsSharing(false);
  }, []);

  useEffect(
    () => () => {
      const request = inFlightRef.current;
      if (!request) return;
      request.dismissed = true;
      clearTimeout(request.timeout);
      request.controller.abort();
      inFlightRef.current = null;
    },
    [],
  );

  const share = useCallback(
    async (expiresInDays: ShareExpiryDays): Promise<boolean> => {
      if (!hasMessages || !conversationId) {
        setError('Add a message before creating a public link.');
        return false;
      }
      const sharedConversationId = conversationId;
      if (isTemporary) {
        setError(TEMPORARY_CHAT_SHARE_REFUSAL);
        return false;
      }
      const request = beginRequest();
      if (!request) return false;
      try {
        const res = await fetch(CONVERSATION_SHARES_PATH, {
          method: 'POST',
          headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({
            conversation_id: sharedConversationId,
            title: conversationTitle || 'Shared Session',
            model_id: modelId,
            expires_in_days: expiresInDays,
            messages: snapshotMessages(sharedConversationId, messages),
          }),
          signal: request.controller.signal,
        });
        if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to share'));
        const created = readCreatedShare(await res.json());
        setLiveShares((current) => ({
          conversationId: sharedConversationId,
          shares: [
            created,
            ...(current?.conversationId === sharedConversationId ? current.shares : []),
          ],
        }));
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
      messages,
      hasMessages,
      isTemporary,
      beginRequest,
      finishRequest,
      showRequestError,
    ],
  );

  const updateLink = useCallback(async (): Promise<boolean> => {
    if (!activeShare || !conversationId) return false;
    if (!hasMessages) {
      setError('Add a message before updating the link.');
      return false;
    }
    const sharedConversationId = conversationId;
    const request = beginRequest();
    if (!request) return false;
    try {
      const res = await fetch(conversationSharesPath(sharedConversationId), {
        method: 'PUT',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          tokens: shownShares.map((link) => link.token),
          title: conversationTitle || 'Shared Session',
          model_id: modelId,
          messages: snapshotMessages(sharedConversationId, messages),
        }),
        signal: request.controller.signal,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, 'Could not update the link.'));
      const refreshed = ConversationSharesRefreshedSchema.parse(await res.json());
      setLiveShares((current) => ({
        conversationId: sharedConversationId,
        shares: (current?.conversationId === sharedConversationId ? current.shares : [])
          .filter((link) => refreshed.tokens.includes(link.token))
          .map((link) => ({ ...link, messageCount: refreshed.messageCount })),
      }));
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
    conversationTitle,
    modelId,
    conversationId,
    messages,
    hasMessages,
    beginRequest,
    finishRequest,
    showRequestError,
  ]);

  const revoke = useCallback(async (): Promise<boolean> => {
    if (!activeShare || !conversationId) return false;
    const sharedConversationId = conversationId;
    const request = beginRequest();
    if (!request) return false;
    try {
      const res = await fetch(conversationSharesPath(sharedConversationId), {
        method: 'DELETE',
        headers: await addCsrfHeaders(),
        credentials: 'include',
        signal: request.controller.signal,
      });
      if (!res.ok) {
        throw new Error('Failed to revoke share link');
      }
      ConversationSharesRevokedSchema.parse(await res.json());
      setLiveShares({ conversationId: sharedConversationId, shares: [] });
      return true;
    } catch (err) {
      showRequestError(request, err, 'Could not revoke the public link.');
      return false;
    } finally {
      finishRequest(request);
    }
  }, [activeShare, conversationId, beginRequest, finishRequest, showRequestError]);

  /**
   * Move every live link of the chat to one audience. Tokens and expiries are
   * untouched, so switching back restores the same URLs on the same clocks.
   */
  const setAudience = useCallback(
    async (audience: ShareAudience): Promise<boolean> => {
      if (!activeShare || audience === activeShare.audience) return false;
      const request = beginRequest();
      if (!request) return false;
      try {
        for (const link of shownShares.filter((candidate) => candidate.audience !== audience)) {
          const res = await fetch(conversationSharePath(link.token), {
            method: 'PATCH',
            headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({ visibility: audience }),
            signal: request.controller.signal,
          });
          if (!res.ok) {
            throw new Error(await readErrorMessage(res, 'Could not change who can open this.'));
          }
          const body = ConversationShareAudienceResponseSchema.parse(await res.json());
          setLiveShares(
            (current) =>
              current && {
                ...current,
                shares: current.shares.map((share) =>
                  share.token === link.token ? { ...share, audience: body.visibility } : share,
                ),
              },
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
    [activeShare, shownShares, beginRequest, finishRequest, showRequestError],
  );

  return {
    share,
    updateLink,
    revoke,
    setAudience,
    isSharing,
    hasMessages,
    isTemporary,
    activeShare,
    checkingShare,
    error,
    cancelPending,
  };
}
