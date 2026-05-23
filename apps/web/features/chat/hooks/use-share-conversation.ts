'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useChatStore } from '@/stores/chatStore';
import { addCsrfHeaders } from '@/lib/client/csrf';

/**
 * Hook that encapsulates conversation sharing logic.
 *
 * Reads messages from the global chat store, posts them to /api/share, and
 * shows a Sonner toast with a copy-to-clipboard action on success.
 *
 * @param conversationTitle - The title used as the share payload title.
 *   Falls back to 'Shared conversation' when omitted or empty.
 */
export function useShareConversation(conversationTitle?: string) {
  const [isSharing, setIsSharing] = useState(false);
  const messages = useChatStore((s) => s.messages);
  const hasMessages = messages.length > 0;

  const share = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const payload = {
        title: conversationTitle || 'Shared conversation',
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      };
      const res = await fetch('/api/share', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = (err as { error?: { message?: string } }).error?.message ?? 'Failed to share';
        throw new Error(msg);
      }
      const data = (await res.json()) as { shareUrl: string };
      const shareUrl = data.shareUrl;
      toast.success('Share link created', {
        description: shareUrl,
        duration: 8000,
        action: {
          label: 'Copy link',
          onClick: () => {
            void navigator.clipboard.writeText(shareUrl);
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
  }, [conversationTitle, messages, isSharing]);

  return { share, isSharing, hasMessages };
}
