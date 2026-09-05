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

const CONVERSATION_ABSENT_STATUS = 404;

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

  // Branch groups only exist for a conversation the server has stored. Asking
  // about one the store has not seen yet, which is every chat between routing
  // to it and its first save, spends a request to be told 404 and leaves that
  // 404 in the browser's own network log. A conversation the store does not
  // list at all is still asked about, because that is what a fresh deep link
  // looks like before the list arrives.
  const conversationIsPending = useChatStore((state) =>
    conversationId === null
      ? false
      : state.conversations.length > 0 &&
        !state.conversations.some((conversation) => conversation.id === conversationId),
  );

  useEffect(() => {
    setGroups([]);
    if (!conversationId || !isLoaded || !isSignedIn || conversationIsPending) return;

    const controller = new AbortController();
    void getHeaders()
      .then((headers) =>
        fetch(managedCloudConversationBranchesPath(conversationId), {
          headers,
          signal: controller.signal,
        }),
      )
      .then(async (response) => {
        // A conversation the server has not persisted yet, which is every brand
        // new chat for the moment between routing to it and its first save,
        // answers 404. It has no branches, which is an answer rather than a
        // fault, so it is not worth an error in the console on every new chat.
        if (response.status === CONVERSATION_ABSENT_STATUS) return null;
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error?.message || 'Could not load conversation branches');
        }
        return ManagedCloudConversationBranchesResponseSchema.parse(await response.json());
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        setGroups(response?.groups ?? []);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        logger.warn('[useConversationBranches] Failed to load branch groups', error);
      });

    return () => controller.abort();
  }, [conversationId, conversationIsPending, getHeaders, isLoaded, isSignedIn]);

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
