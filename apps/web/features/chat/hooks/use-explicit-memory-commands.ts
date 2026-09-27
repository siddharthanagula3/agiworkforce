'use client';

import { useCallback, type ReactElement } from 'react';
import { toast } from 'sonner';
import { useConfirmAction } from '@agiworkforce/ui';
import { useMemoryStore } from '@agiworkforce/unified-chat';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

const MEMORY_COMMANDS_PATH = '/api/memory/commands';
const MEMORY_COMMAND_HINT = /\b(remember(?:ing)?|forget|memor(?:y|ies|i[sz]e))\b/i;
const MEMORY_UNAVAILABLE_MESSAGE = 'Memory did not answer, so nothing was changed.';
const SETTLED_STATUSES = new Set(['stored', 'already_known', 'forgotten']);

interface MemoryCommandResponse {
  command: { kind: 'remember' | 'forget'; subject: string } | null;
  status?: string;
  message?: string;
  requiresConfirmation?: boolean;
  memories?: Array<{ id: string; content: string }>;
}

interface MemoryCommandRequest {
  message: string;
  conversationId: string | null;
  projectId: string | null;
  confirmed?: boolean;
}

async function postMemoryCommand(body: MemoryCommandRequest): Promise<MemoryCommandResponse> {
  const response = await fetch(MEMORY_COMMANDS_PATH, {
    method: 'POST',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as
    (MemoryCommandResponse & { error?: { message?: string } }) | null;
  if (!response.ok || data === null) {
    throw new Error(data?.error?.message || MEMORY_UNAVAILABLE_MESSAGE);
  }
  return data;
}

export function useExplicitMemoryCommands(): {
  runExplicitMemoryCommand: (
    message: string,
    scope: { conversationId: string | null; projectId: string | null },
  ) => void;
  memoryCommandDialog: ReactElement | null;
} {
  const { confirm, dialog } = useConfirmAction();
  const hydrateMemories = useMemoryStore((s) => s.hydrateFromServer);

  const announce = useCallback(
    (result: MemoryCommandResponse) => {
      if (!result.message) return;
      if (result.status && SETTLED_STATUSES.has(result.status)) {
        toast.success(result.message);
        void hydrateMemories();
        return;
      }
      toast(result.message);
    },
    [hydrateMemories],
  );

  const runExplicitMemoryCommand = useCallback(
    (message: string, scope: { conversationId: string | null; projectId: string | null }) => {
      if (!MEMORY_COMMAND_HINT.test(message)) return;
      const request: MemoryCommandRequest = { message, ...scope };
      void (async () => {
        let result: MemoryCommandResponse;
        try {
          result = await postMemoryCommand(request);
        } catch (error) {
          toast.error(toUserMessage(error, MEMORY_UNAVAILABLE_MESSAGE));
          return;
        }
        if (!result.command) return;
        const matches = result.memories ?? [];
        if (!result.requiresConfirmation || matches.length === 0) {
          announce(result);
          return;
        }
        confirm({
          title:
            matches.length === 1 ? 'Forget this memory?' : `Forget ${matches.length} memories?`,
          description: `${matches.map((memory) => `“${memory.content}”`).join(' ')} Chats stop using ${
            matches.length === 1 ? 'it' : 'them'
          }, and ${matches.length === 1 ? 'it' : 'they'} cannot be restored.`,
          confirmLabel: 'Forget',
          onConfirm: async () => {
            try {
              announce(await postMemoryCommand({ ...request, confirmed: true }));
            } catch (error) {
              toast.error(toUserMessage(error, MEMORY_UNAVAILABLE_MESSAGE));
            }
          },
        });
      })();
    },
    [announce, confirm],
  );

  return { runExplicitMemoryCommand, memoryCommandDialog: dialog };
}
