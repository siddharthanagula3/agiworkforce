'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import { useChatStore } from '@shared/stores/web-chat-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { TEMPORARY_CHAT_SHARE_REFUSAL } from '@/lib/temporary-chat-policy';
import { SHARE_CONVERSATION_CLIENT_DEADLINE_MS } from '@/lib/deadline-policy';

export type ShareExpiryDays = 1 | 7 | 30;

/**
 * Who may open the shared page. `public` is knowledge of the link;
 * `organization` closes the link and leaves it readable only to the members of
 * the owner's workspace. Expiry applies to both.
 */
export type ShareAudience = 'public' | 'organization';

export interface ActiveConversationShare {
  url: string;
  token: string;
  expiresAt: string;
  messageCount: number;
  audience: ShareAudience;
  /** Null when the sharer belongs to no workspace, so there is nobody to share with. */
  workspace: { memberCount: number } | null;
}

interface InFlightShareRequest {
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
  dismissed: boolean;
  timedOut: boolean;
}

function readAudience(value: unknown): ShareAudience {
  return value === 'organization' ? 'organization' : 'public';
}

function readWorkspace(value: unknown): ActiveConversationShare['workspace'] {
  if (!value || typeof value !== 'object') return null;
  const count = Number((value as { memberCount?: unknown }).memberCount ?? 0);
  return { memberCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0 };
}

function readCreatedShare(value: unknown): ActiveConversationShare {
  if (!value || typeof value !== 'object') throw new Error('Invalid share response');
  const row = value as Record<string, unknown>;
  if (
    typeof row['shareUrl'] !== 'string' ||
    typeof row['token'] !== 'string' ||
    typeof row['expiresAt'] !== 'string' ||
    typeof row['messageCount'] !== 'number'
  ) {
    throw new Error('Invalid share response');
  }
  return {
    url: row['shareUrl'],
    token: row['token'],
    expiresAt: row['expiresAt'],
    messageCount: row['messageCount'],
    audience: readAudience(row['visibility']),
    workspace: readWorkspace(row['workspace']),
  };
}

export function useShareConversation(
  conversationTitle?: string,
  modelId?: string,
  conversationId?: string | null,
) {
  const [isSharing, setIsSharing] = useState(false);
  const [activeShare, setActiveShare] = useState<ActiveConversationShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<InFlightShareRequest | null>(null);
  const messages = useChatStore((s) => s.messages);
  const isTemporary = useChatStore((s) =>
    conversationId
      ? (s.conversations.find((c) => c.id === conversationId)?.isTemporary ?? false)
      : false,
  );
  const hasMessages = messages.length > 0;

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
      if (isTemporary) {
        setError(TEMPORARY_CHAT_SHARE_REFUSAL);
        return false;
      }
      const request = beginRequest();
      if (!request) return false;
      try {
        const payload = {
          conversation_id: conversationId,
          title: conversationTitle || 'Shared Session',
          model_id: modelId,
          expires_in_days: expiresInDays,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            created_at: m.createdAt,
            ...(m.attachments && m.attachments.length > 0
              ? {
                  attachments: m.attachments.map((a) => ({
                    name: a.name,
                    type: a.type,
                    mimeType: a.mimeType,
                  })),
                }
              : {}),
          })),
        };
        const res = await fetch('/api/share', {
          method: 'POST',
          headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify(payload),
          signal: request.controller.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = (err as { error?: { message?: string } }).error?.message ?? 'Failed to share';
          throw new Error(msg);
        }
        setActiveShare(readCreatedShare(await res.json()));
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

  const revoke = useCallback(async (): Promise<boolean> => {
    if (!activeShare) return false;
    const request = beginRequest();
    if (!request) return false;
    try {
      const res = await fetch(`/api/share/${activeShare.token}`, {
        method: 'DELETE',
        headers: await addCsrfHeaders(),
        credentials: 'include',
        signal: request.controller.signal,
      });
      if (!res.ok) {
        throw new Error('Failed to revoke share link');
      }
      setActiveShare(null);
      return true;
    } catch (err) {
      showRequestError(request, err, 'Could not revoke the public link.');
      return false;
    } finally {
      finishRequest(request);
    }
  }, [activeShare, beginRequest, finishRequest, showRequestError]);

  /**
   * Move the live share between audiences. The token and the expiry are
   * untouched, so switching back restores the same URL on the same clock.
   */
  const setAudience = useCallback(
    async (audience: ShareAudience): Promise<boolean> => {
      if (!activeShare || audience === activeShare.audience) return false;
      const request = beginRequest();
      if (!request) return false;
      try {
        const res = await fetch(`/api/share/${activeShare.token}`, {
          method: 'PATCH',
          headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({ visibility: audience }),
          signal: request.controller.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg =
            (err as { error?: { message?: string } }).error?.message ??
            'Could not change who can open this.';
          throw new Error(msg);
        }
        const body = (await res.json()) as { visibility?: unknown };
        setActiveShare((current) =>
          current?.token === activeShare.token
            ? { ...current, audience: readAudience(body.visibility) }
            : current,
        );
        return true;
      } catch (err) {
        showRequestError(request, err, 'Could not change who can open this.');
        return false;
      } finally {
        finishRequest(request);
      }
    },
    [activeShare, beginRequest, finishRequest, showRequestError],
  );

  return {
    share,
    revoke,
    setAudience,
    isSharing,
    hasMessages,
    isTemporary,
    activeShare,
    error,
    cancelPending,
    clearError: () => setError(null),
  };
}
