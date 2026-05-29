'use client';

import { useMemo } from 'react';
import { HostBridgeContext, type ChatHostBridge } from '@agiworkforce/unified-chat';
import { WebChatRuntime } from '@/lib/runtime/WebChatRuntime';
import { useChatStore } from '@/stores/chatStore';
import { WebShellV3 } from '../v3/WebShellV3';

/** Adapts the existing web chatStore into the unified-chat host bridge contract. */
function useWebHostBridge(): ChatHostBridge {
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const addConversationToStore = useChatStore((s) => s.addConversation);

  return useMemo<ChatHostBridge>(
    () => ({
      getSnapshot: () => ({
        activeConversationId,
        conversations: conversations.map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      }),
      selectConversation: (id) => setActiveConversation(id),
      createConversation: (title = 'New Conversation') => {
        const id = crypto.randomUUID();
        addConversationToStore({
          id,
          title,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setActiveConversation(id);
        return id;
      },
    }),
    [conversations, activeConversationId, setActiveConversation, addConversationToStore],
  );
}

/** Memoized runtime singleton for the lifetime of the page mount. */
function useWebChatRuntime(): WebChatRuntime {
  return useMemo(() => new WebChatRuntime(), []);
}

/**
 * Full v3 web chat surface.
 *
 * Kept as an internal component while the Web chat implementation converges.
 * Do not expose a second public chat route or query-param switch; `/chat` is
 * the single public Web chat URL.
 */
export default function UnifiedChatPage() {
  const runtime = useWebChatRuntime();
  const hostBridge = useWebHostBridge();

  return (
    <HostBridgeContext.Provider value={hostBridge}>
      <div className="flex h-full w-full overflow-hidden">
        <WebShellV3 runtime={runtime} hostBridge={hostBridge} />
      </div>
    </HostBridgeContext.Provider>
  );
}
