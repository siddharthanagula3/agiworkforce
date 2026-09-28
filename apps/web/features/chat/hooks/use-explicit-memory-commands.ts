'use client';

import { useCallback, type ReactElement } from 'react';
import { toast } from 'sonner';
import { translateUiPlural, useConfirmAction } from '@agiworkforce/ui';
import { useMemoryStore } from '@agiworkforce/unified-chat';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

const MEMORY_COMMANDS_PATH = '/api/memory/commands';
const MEMORY_COMMAND_HINT = /\b(remember(?:ing)?|forget|memor(?:y|ies|i[sz]e))\b/i;
const MEMORY_COMMAND_KIND_HINT: ReadonlyArray<[MemoryCommandKind, RegExp]> = [
  ['forget', /\bforget\b/i],
  ['remember', /\bremember/i],
];
const MEMORY_UNAVAILABLE_MESSAGE = 'Memory did not answer, so nothing was changed.';
const SETTLED_STATUSES = new Set(['stored', 'already_known', 'forgotten']);

type MemoryCommandKind = 'remember' | 'forget';

export type MemoryCommandStatus =
  | 'stored'
  | 'already_known'
  | 'refused'
  | 'confirmation_required'
  | 'nothing_to_forget'
  | 'forgotten'
  | 'failed';

export interface MemoryCommandReport {
  kind: MemoryCommandKind;
  status: MemoryCommandStatus;
}

interface MemoryCommandResponse {
  command: { kind: MemoryCommandKind; subject: string } | null;
  status?: MemoryCommandStatus;
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
  ) => Promise<MemoryCommandReport | null>;
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
    async (
      message: string,
      scope: { conversationId: string | null; projectId: string | null },
    ): Promise<MemoryCommandReport | null> => {
      if (!MEMORY_COMMAND_HINT.test(message)) return null;
      const request: MemoryCommandRequest = { message, ...scope };
      let result: MemoryCommandResponse;
      try {
        result = await postMemoryCommand(request);
      } catch (error) {
        toast.error(toUserMessage(error, MEMORY_UNAVAILABLE_MESSAGE));
        const kind = MEMORY_COMMAND_KIND_HINT.find(([, pattern]) => pattern.test(message))?.[0];
        return kind ? { kind, status: 'failed' } : null;
      }
      if (!result.command) return null;
      const report: MemoryCommandReport = {
        kind: result.command.kind,
        status: result.status ?? 'failed',
      };
      const matches = result.memories ?? [];
      if (!result.requiresConfirmation || matches.length === 0) {
        announce(result);
        return report;
      }
      confirm({
        title: translateUiPlural('chat', 'counts.forgetMemoriesTitle', matches.length, {
          one: 'Forget this memory?',
          other: 'Forget {{count}} memories?',
        }),
        description: translateUiPlural(
          'chat',
          'counts.forgetMemoriesBody',
          matches.length,
          {
            one: '{{memories}} Chats stop using it, and it cannot be restored.',
            other: '{{memories}} Chats stop using them, and they cannot be restored.',
          },
          { memories: matches.map((memory) => `“${memory.content}”`).join(' ') },
        ),
        confirmLabel: 'Forget',
        onConfirm: async () => {
          try {
            announce(await postMemoryCommand({ ...request, confirmed: true }));
          } catch (error) {
            toast.error(toUserMessage(error, MEMORY_UNAVAILABLE_MESSAGE));
          }
        },
      });
      return report;
    },
    [announce, confirm],
  );

  return { runExplicitMemoryCommand, memoryCommandDialog: dialog };
}
