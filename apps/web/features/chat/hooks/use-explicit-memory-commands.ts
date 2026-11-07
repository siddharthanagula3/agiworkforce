'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';
import { toast } from 'sonner';
import { translateUiPlural, useConfirmAction } from '@agiworkforce/ui';
import {
  parseManagedMemoryCommandResponse,
  type ManagedMemoryCommandRequest,
  type ManagedMemoryCommandResponse,
  type ManagedMemoryCommandStatus,
} from '@agiworkforce/types';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { useCloudMemory, useMemoryView } from '@/features/memory/use-cloud-memory';
import type { CloudMemoryController } from '@/features/memory/cloud-memory-controller';
import { toUserMessage } from '@/lib/user-error-message';

const MEMORY_COMMANDS_PATH = '/api/memory/commands';
const MEMORY_COMMAND_HINT = /\b(remember(?:ing)?|forget|memor(?:y|ies|i[sz]e))\b/i;
const MEMORY_COMMAND_KIND_HINT: ReadonlyArray<[MemoryCommandKind, RegExp]> = [
  ['forget', /\bforget\b/i],
  ['remember', /\bremember/i],
];
const MEMORY_UNAVAILABLE_MESSAGE =
  'Memory did not answer, so it is unknown whether anything was saved or deleted. Check Memory in Settings.';
const STATUS_RECEIPTS: Readonly<Record<ManagedMemoryCommandStatus, string>> = {
  stored: 'Saved to memory.',
  already_known: 'Already in memory, so nothing changed.',
  overruled: 'Not saved: a pinned memory on the same topic takes priority.',
  refused: 'Not saved: memory is off, or this is something memory does not keep.',
  forgotten: 'Deleted the matching memories.',
  nothing_to_forget: 'No saved memory matched, so nothing was deleted.',
  confirmation_required: 'Waiting for your confirmation before anything is deleted.',
};
const SETTLED_STATUSES = new Set(['stored', 'already_known', 'forgotten']);

type MemoryCommandKind = 'remember' | 'forget';

export type MemoryCommandStatus = ManagedMemoryCommandStatus | 'failed';

export interface MemoryCommandReport {
  kind: MemoryCommandKind;
  status: MemoryCommandStatus;
}

async function postMemoryCommand(
  body: ManagedMemoryCommandRequest,
  authority: RequestAuthority,
  controller: CloudMemoryController,
  current: () => boolean,
): Promise<ManagedMemoryCommandResponse> {
  authority.assertCurrent();
  return controller.request(MEMORY_COMMANDS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, parseManagedMemoryCommandResponse, {
    current: () => authority.isCurrent() && current(), mutation: true,
    changesFacts: (result) => result.status === 'stored' || result.status === 'forgotten',
    acknowledgedFacts: (result, facts) => {
      if (result.status !== 'forgotten') return facts;
      if (!result.memories) return [];
      const removed = new Set(result.memories.map((memory) => memory.id));
      return facts.filter((fact) => !removed.has(fact.id));
    },
  });
}

export function useExplicitMemoryCommands(): {
  runExplicitMemoryCommand: (
    message: string,
    scope: { conversationId: string | null; projectId: string | null },
    authority: RequestAuthority,
  ) => Promise<MemoryCommandReport | null>;
  memoryCommandDialog: ReactElement | null;
} {
  const controller = useCloudMemory();
  const capture = useMemoryView(controller);
  const renderedController = useRef(controller);
  renderedController.current = controller;
  const hookLifetime = useRef<object | null>(null);
  useLayoutEffect(() => {
    hookLifetime.current = {};
    return () => { hookLifetime.current = null; };
  }, []);
  const { confirm, dialog } = useConfirmAction();
  const confirmationOwnerRef = useRef<RequestAuthority | null>(null);
  const generationRef = useRef<object>({});
  useEffect(() => () => {
    generationRef.current = {};
    confirmationOwnerRef.current?.retire();
    confirmationOwnerRef.current = null;
  }, [controller]);

  const announce = useCallback(
    (result: ManagedMemoryCommandResponse) => {
      const receipt =
        result.message ?? (result.status ? STATUS_RECEIPTS[result.status] : undefined);
      if (!receipt) return;
      if (result.status && SETTLED_STATUSES.has(result.status)) {
        toast.success(receipt);
        return;
      }
      toast(receipt);
    },
    [],
  );

  const runExplicitMemoryCommand = useCallback(
    async (
      message: string,
      scope: { conversationId: string | null; projectId: string | null },
      authority: RequestAuthority,
    ): Promise<MemoryCommandReport | null> => {
      if (!MEMORY_COMMAND_HINT.test(message) || !authority.isCurrent()) return null;
      if (!hookLifetime.current || renderedController.current !== controller) return null;
      if (!controller) {
        const kind = MEMORY_COMMAND_KIND_HINT.find(([, pattern]) => pattern.test(message))?.[0];
        if (!kind) return null;
        toast.error('Cloud memory is unavailable until your account and workspace are ready. This command was not sent to memory.');
        return { kind, status: 'failed' };
      }
      const viewCurrent = capture();
      if (!viewCurrent() ||
          controller.owner.session.userId !== authority.session.userId ||
          controller.owner.session.sessionId !== authority.session.sessionId) return null;
      const generation = {};
      generationRef.current = generation;
      const current = () => viewCurrent() && authority.isCurrent() && generationRef.current === generation;
      confirmationOwnerRef.current?.retire();
      confirmationOwnerRef.current = null;
      const request: ManagedMemoryCommandRequest = { message, ...scope };
      let result: ManagedMemoryCommandResponse;
      try {
        result = await postMemoryCommand(request, authority, controller, current);
      } catch (error) {
        if (!current()) return null;
        toast.error(toUserMessage(error, MEMORY_UNAVAILABLE_MESSAGE));
        const kind = MEMORY_COMMAND_KIND_HINT.find(([, pattern]) => pattern.test(message))?.[0];
        return kind ? { kind, status: 'failed' } : null;
      }
      if (!current()) return null;
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
      const confirmationAuthority: RequestAuthority = createRequestAuthority(
        authority.session,
        () => current() &&
          confirmationOwnerRef.current === confirmationAuthority,
      );
      confirmationOwnerRef.current = confirmationAuthority;
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
        onCancel: () => {
          confirmationAuthority.retire();
          if (confirmationOwnerRef.current === confirmationAuthority) confirmationOwnerRef.current = null;
        },
        onConfirm: async () => {
          try {
            if (!confirmationAuthority.isCurrent()) return;
            const confirmed = await postMemoryCommand({ ...request, confirmed: true }, confirmationAuthority, controller, current);
            confirmationAuthority.assertCurrent();
            announce(confirmed);
          } catch (error) {
            if (confirmationAuthority.isCurrent()) toast.error(toUserMessage(error, MEMORY_UNAVAILABLE_MESSAGE));
          } finally {
            confirmationAuthority.retire();
            if (confirmationOwnerRef.current === confirmationAuthority) confirmationOwnerRef.current = null;
          }
        },
      });
      return report;
    },
    [announce, confirm, controller, capture],
  );

  return { runExplicitMemoryCommand, memoryCommandDialog: confirmationOwnerRef.current?.isCurrent() ? dialog : null };
}
