'use client';

import { useCallback, useMemo, useState } from 'react';
import { Check, ChevronRight, Loader2, ShieldCheck, X } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger, Textarea } from '@agiworkforce/ui';
import { TOOL_APPROVAL_GUIDANCE_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import type { Message } from '@shared/stores/web-chat-store';
import { isApprovalTurnLive, type ToolApprovalDecision } from '@/lib/hooks/useChatStream';
import { humanizeToolName } from '../messages/ToolTimeline';

export interface PendingApprovalItem {
  assistantMessageId: string;
  toolCallId: string;
  name: string;
  label: string;
  input?: string;
}

type ResolveApproval = (
  assistantMessageId: string,
  toolCallId: string,
  decision: ToolApprovalDecision,
  guidance?: string,
) => Promise<void>;

interface ApprovalInboxProps {
  messages: Message[];
  onResolve: ResolveApproval;
  onShowMessage?: (assistantMessageId: string) => void;
  isApprovalLive?: (assistantMessageId: string) => boolean;
}

const MAX_VISIBLE_INPUT_CHARS = 1_200;

function formatApprovalInput(input: string | Record<string, unknown> | undefined) {
  if (!input) return undefined;

  let formatted: string;
  if (typeof input === 'string') {
    try {
      formatted = JSON.stringify(JSON.parse(input) as unknown, null, 2);
    } catch {
      formatted = input;
    }
  } else {
    try {
      formatted = JSON.stringify(input, null, 2);
    } catch {
      return undefined;
    }
  }

  if (!formatted.trim()) return undefined;
  return formatted.length > MAX_VISIBLE_INPUT_CHARS
    ? `${formatted.slice(0, MAX_VISIBLE_INPUT_CHARS)}\n…`
    : formatted;
}

export function collectPendingApprovals(messages: Message[]): PendingApprovalItem[] {
  const approvals: PendingApprovalItem[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role !== 'assistant') continue;

    const projection = message.metadata?.cloudApproval;
    if (projection) {
      for (const call of projection.calls) {
        if (call.approvalDecision) continue;
        const key = `${message.id}:${call.toolCallId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        approvals.push({
          assistantMessageId: message.id,
          toolCallId: call.toolCallId,
          name: call.name,
          label: humanizeToolName(call.name, call.input),
          input: formatApprovalInput(call.input),
        });
      }
      continue;
    }

    for (const tool of message.metadata?.tools ?? []) {
      if (
        tool.status !== 'awaiting_approval' ||
        tool.requiresApproval !== true ||
        !tool.toolCallId ||
        tool.approved !== undefined
      ) {
        continue;
      }
      const key = `${message.id}:${tool.toolCallId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      approvals.push({
        assistantMessageId: message.id,
        toolCallId: tool.toolCallId,
        name: tool.name,
        label: humanizeToolName(tool.name, tool.args, tool.parameters ?? tool.rawArgs),
        input: formatApprovalInput(tool.parameters ?? tool.rawArgs ?? tool.args),
      });
    }
  }

  return approvals;
}

function approvalKey(item: PendingApprovalItem) {
  return `${item.assistantMessageId}:${item.toolCallId}`;
}

export function ApprovalInbox({
  messages,
  onResolve,
  onShowMessage,
  isApprovalLive = isApprovalTurnLive,
}: ApprovalInboxProps) {
  const approvals = useMemo(() => collectPendingApprovals(messages), [messages]);
  const [resolvingKeys, setResolvingKeys] = useState<Set<string>>(() => new Set());
  const [guidanceByKey, setGuidanceByKey] = useState<Record<string, string>>({});

  const resolve = useCallback(
    async (item: PendingApprovalItem, decision: ToolApprovalDecision) => {
      const key = approvalKey(item);
      const guidance = guidanceByKey[key]?.trim();
      setResolvingKeys((current) => new Set(current).add(key));
      try {
        await onResolve(item.assistantMessageId, item.toolCallId, decision, guidance || undefined);
        setGuidanceByKey((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      } finally {
        setResolvingKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [guidanceByKey, onResolve],
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-8 gap-1.5 px-2"
          aria-label={`Approvals (${approvals.length} pending)`}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span className="hidden text-xs sm:inline">Approvals</span>
          {approvals.length > 0 && (
            <span
              className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-amber-950"
              aria-hidden="true"
            >
              {approvals.length > 99 ? '99+' : approvals.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Approvals</h2>
            <p className="text-xs text-muted-foreground">
              {approvals.length === 0
                ? 'No tools are waiting for a decision.'
                : `${approvals.length} tool ${approvals.length === 1 ? 'request needs' : 'requests need'} your review.`}
            </p>
          </div>
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>

        {approvals.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            New requests will appear here and inline in the conversation.
          </div>
        ) : (
          <div className="max-h-[min(30rem,70vh)] overflow-y-auto p-2">
            {approvals.map((item) => {
              const key = approvalKey(item);
              const resolving = resolvingKeys.has(key);
              const expired = !isApprovalLive(item.assistantMessageId);

              return (
                <article
                  key={key}
                  className="rounded-lg border border-border/60 bg-muted/15 p-3 [&+&]:mt-2"
                >
                  <div className="flex items-start gap-2">
                    <ShieldCheck
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium">{item.label}</h3>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {item.name}
                      </p>
                    </div>
                  </div>

                  {item.input && (
                    <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background/70 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {item.input}
                    </pre>
                  )}

                  {expired ? (
                    <div className="mt-3 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                      This request expired. Open the conversation to rerun the turn.
                    </div>
                  ) : (
                    <>
                      <Textarea
                        id={`approval-guidance-${key}`}
                        value={guidanceByKey[key] ?? ''}
                        onChange={(event) =>
                          setGuidanceByKey((current) => ({ ...current, [key]: event.target.value }))
                        }
                        disabled={resolving}
                        rows={2}
                        maxLength={TOOL_APPROVAL_GUIDANCE_MAX_LENGTH}
                        placeholder="Add guidance to steer the run (optional)"
                        aria-label={`Guidance for ${item.label}`}
                        className="mt-3 min-h-16 resize-none text-xs"
                      />
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          disabled={resolving}
                          onClick={() => void resolve(item, 'rejected')}
                          aria-label={`Reject ${item.label}`}
                        >
                          {resolving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Reject
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1.5"
                          disabled={resolving}
                          onClick={() => void resolve(item, 'approved')}
                          aria-label={`Approve ${item.label}`}
                        >
                          {resolving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Approve
                        </Button>
                      </div>
                    </>
                  )}

                  {onShowMessage && (
                    <button
                      type="button"
                      onClick={() => onShowMessage(item.assistantMessageId)}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Show in conversation
                      <ChevronRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
