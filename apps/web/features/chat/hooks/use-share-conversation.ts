'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useChatStore } from '@/stores/chatStore';
import { addCsrfHeaders } from '@/lib/client/csrf';

/**
 * Hook that encapsulates conversation sharing logic.
 *
 * Reads messages from the global chat store, posts them to /api/share
 * (backed by the `shared_sessions` table). The route authenticates the
 * caller via Clerk, records owner_id, and returns a revoke token so the
 * link can be taken down later via DELETE /api/share/[token].
 */
export function useShareConversation(conversationTitle?: string, modelId?: string) {
  const [isSharing, setIsSharing] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const messages = useChatStore((s) => s.messages);
  const hasMessages = messages.length > 0;

  const share = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const payload = {
        title: conversationTitle || 'Shared Session',
        model_id: modelId,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          created_at: m.createdAt,
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
      const data = (await res.json()) as { shareUrl: string; token: string };
      setShareToken(data.token);
      toast.success('Share link created', {
        description: data.shareUrl,
        duration: 8000,
        action: {
          label: 'Copy link',
          onClick: () => {
            void navigator.clipboard.writeText(data.shareUrl);
            toast.success('Link copied');
          },
        },
      });
    } catch (err) {
      toast.error('Could not share conversation', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setIsSharing(false);
    }
  }, [conversationTitle, modelId, messages, isSharing]);

  const revoke = useCallback(async () => {
    if (!shareToken) return;
    try {
      const res = await fetch(`/api/share/${shareToken}`, {
        method: 'DELETE',
        headers: await addCsrfHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to revoke share link');
      }
      setShareToken(null);
      toast.success('Share link revoked');
    } catch (err) {
      toast.error('Could not revoke share link', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  }, [shareToken]);

  return { share, revoke, isSharing, hasMessages, hasActiveShare: shareToken !== null };
}
