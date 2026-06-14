'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useChatStore } from '@/stores/chatStore';

/**
 * Hook that encapsulates conversation sharing logic.
 *
 * Reads messages from the global chat store, posts them to the working
 * /api/shared endpoint (backed by the migrated `shared_conversations` table),
 * and shows a Sonner toast with a copy-to-clipboard action on success.
 *
 * The share token is a client-generated UUID v4 that acts as the public
 * capability; /api/shared requires no auth/CSRF and returns the absolute
 * share URL ({ url }) pointing at the public /shared/[id] view page.
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
      // /api/shared treats the token as the capability: the client mints a
      // UUID v4 and the conversation is serialized as a JSON string. Message
      // keys are normalized to role/content/created_at to match the public
      // /shared/[id] view page renderer.
      const token = crypto.randomUUID();
      const payload = {
        token,
        title: conversationTitle || 'Shared conversation',
        messages: JSON.stringify(
          messages.map((m) => ({
            role: m.role,
            content: m.content,
            created_at: m.createdAt,
          })),
        ),
      };
      const res = await fetch('/api/shared', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = (err as { error?: { message?: string } }).error?.message ?? 'Failed to share';
        throw new Error(msg);
      }
      const data = (await res.json()) as { url: string };
      const shareUrl = data.url;
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
