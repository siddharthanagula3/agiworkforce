'use client';

import { useCallback, useState } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import { useChatStore } from '@shared/stores/web-chat-store';
import { addCsrfHeaders } from '@/lib/client/csrf';

export type ShareExpiryDays = 1 | 7 | 30;

export interface ActiveConversationShare {
  url: string;
  token: string;
  expiresAt: string;
  messageCount: number;
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
  };
}

export function useShareConversation(conversationTitle?: string, modelId?: string) {
  const [isSharing, setIsSharing] = useState(false);
  const [activeShare, setActiveShare] = useState<ActiveConversationShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messages = useChatStore((s) => s.messages);
  const hasMessages = messages.length > 0;

  const share = useCallback(
    async (expiresInDays: ShareExpiryDays): Promise<boolean> => {
      if (isSharing) return false;
      if (!hasMessages) {
        setError('Add a message before creating a public link.');
        return false;
      }
      setIsSharing(true);
      setError(null);
      try {
        const payload = {
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
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = (err as { error?: { message?: string } }).error?.message ?? 'Failed to share';
          throw new Error(msg);
        }
        setActiveShare(readCreatedShare(await res.json()));
        return true;
      } catch (err) {
        setError(toUserMessage(err, 'Could not create the public link.'));
        return false;
      } finally {
        setIsSharing(false);
      }
    },
    [conversationTitle, modelId, messages, isSharing, hasMessages],
  );

  const revoke = useCallback(async (): Promise<boolean> => {
    if (!activeShare) return false;
    setIsSharing(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${activeShare.token}`, {
        method: 'DELETE',
        headers: await addCsrfHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to revoke share link');
      }
      setActiveShare(null);
      return true;
    } catch (err) {
      setError(toUserMessage(err, 'Could not revoke the public link.'));
      return false;
    } finally {
      setIsSharing(false);
    }
  }, [activeShare]);

  return {
    share,
    revoke,
    isSharing,
    hasMessages,
    activeShare,
    error,
    clearError: () => setError(null),
  };
}
