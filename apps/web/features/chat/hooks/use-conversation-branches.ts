'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/identity/client';
import { useRouter } from 'next/navigation';
import {
  ManagedCloudConversationBranchesResponseSchema,
  ManagedCloudCreateConversationBranchResponseSchema,
  managedCloudConversationBranchesPath,
  normalizeManagedCloudConversation,
  type ManagedCloudConversationBranchGroup,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useChatStore } from '@shared/stores/web-chat-store';
import { toUserMessage } from '@/lib/user-error-message';
import { logger } from '@shared/lib/logger';
import { toast } from 'sonner';

type BranchGroupsByMessageId = Readonly<Record<string, ManagedCloudConversationBranchGroup>>;

export interface UseConversationBranchesResult {
  groupsByMessageId: BranchGroupsByMessageId;
  branchingMessageId: string | null;
  createBranch: (messageId: string) => Promise<void>;
  switchBranch: (conversationId: string) => void;
}

export function useConversationBranches(
  conversationId: string | null,
): UseConversationBranchesResult {
  const { getToken, isLoaded, isSignedIn } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<ManagedCloudConversationBranchGroup[]>([]);
  const [branchingMessageId, setBranchingMessageId] = useState<string | null>(null);

  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!isLoaded) throw new Error('Authentication is still loading');
    if (!isSignedIn) throw new Error('Sign in to branch this conversation');
    const token = await getToken();
    if (!token) throw new Error('Sign in to branch this conversation');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    setGroups([]);
    if (!conversationId || !isLoaded || !isSignedIn) return;

    const controller = new AbortController();
    void getHeaders()
      .then((headers) =>
        fetch(managedCloudConversationBranchesPath(conversationId), {
          headers,
          signal: controller.signal,
        }),
      )
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error?.message || 'Could not load conversation branches');
        }
        return ManagedCloudConversationBranchesResponseSchema.parse(await response.json());
      })
      .then((response) => {
        if (!controller.signal.aborted) setGroups(response.groups);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        logger.warn('[useConversationBranches] Failed to load branch groups', error);
      });

    return () => controller.abort();
  }, [conversationId, getHeaders, isLoaded, isSignedIn]);

  const groupsByMessageId = useMemo<BranchGroupsByMessageId>(
    () => Object.fromEntries(groups.map((group) => [group.messageId, group])),
    [groups],
  );

  const createBranch = useCallback(
    async (messageId: string): Promise<void> => {
      if (!conversationId || branchingMessageId) return;
      setBranchingMessageId(messageId);
      try {
        const headers = await addCsrfHeaders(await getHeaders());
        const response = await fetch(managedCloudConversationBranchesPath(conversationId), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messageId,
            requestId: crypto.randomUUID(),
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error?.message || 'Could not create conversation branch');
        }

        const body = ManagedCloudCreateConversationBranchResponseSchema.parse(
          await response.json(),
        );
        const conversation = normalizeManagedCloudConversation(body.conversation);
        useChatStore.getState().addConversation({
          id: conversation.id,
          title: conversation.title,
          model: conversation.model ?? null,
          projectId: conversation.projectId,
          isPinned: conversation.pinned,
          isStarred: conversation.starred,
          isArchived: conversation.archived,
          isTemporary: conversation.isTemporary,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        });
        toast.success('Conversation branch created');
        router.push(`/chat/${conversation.id}`);
      } catch (error) {
        toast.error(toUserMessage(error, 'Could not create conversation branch'));
      } finally {
        setBranchingMessageId(null);
      }
    },
    [branchingMessageId, conversationId, getHeaders, router],
  );

  const switchBranch = useCallback(
    (targetConversationId: string) => {
      if (targetConversationId === conversationId) return;
      router.push(`/chat/${targetConversationId}`);
    },
    [conversationId, router],
  );

  return {
    groupsByMessageId,
    branchingMessageId,
    createBranch,
    switchBranch,
  };
}
