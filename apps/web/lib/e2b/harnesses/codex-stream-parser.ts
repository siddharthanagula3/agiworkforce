import { z } from 'zod';
import type { AgentEvent } from '@agiworkforce/types/protocol';
import { toJsonValue } from './json';
import { MAX_ERROR_MESSAGE_LENGTH, SUCCESS_EXIT_CODE } from './limits';
import { toolCategoryFor, toolSummary } from './tool-activity';
import type {
  HarnessOutcome,
  HarnessParser,
  HarnessParserFlush,
  HarnessUsageReport,
} from './types';

const EVENT_TYPE = {
  threadStarted: 'thread.started',
  turnStarted: 'turn.started',
  turnCompleted: 'turn.completed',
  turnFailed: 'turn.failed',
  itemStarted: 'item.started',
  itemUpdated: 'item.updated',
  itemCompleted: 'item.completed',
  error: 'error',
} as const;

const ITEM_TYPE = {
  agentMessage: 'agent_message',
  reasoning: 'reasoning',
} as const;

const FAILED_ITEM_STATUS = 'failed';

const ItemSchema = z.looseObject({
  id: z.string().optional(),
  type: z.string().optional(),
  text: z.string().optional(),
  status: z.string().optional(),
  exit_code: z.number().optional(),
});

const UsageSchema = z.looseObject({
  input_tokens: z.number().optional(),
  cached_input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  reasoning_output_tokens: z.number().optional(),
});

const ErrorSchema = z.looseObject({ message: z.string().optional() });

const EventSchema = z.looseObject({
  type: z.string(),
  thread_id: z.string().optional(),
  item: ItemSchema.optional(),
  usage: UsageSchema.optional(),
  error: z.union([z.string(), ErrorSchema]).optional(),
  message: z.string().optional(),
});

type ParsedItem = z.infer<typeof ItemSchema>;

function usageReport(usage: z.infer<typeof UsageSchema>): HarnessUsageReport {
  return {
    ...(usage.input_tokens !== undefined ? { inputTokens: usage.input_tokens } : {}),
    ...(usage.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {}),
    ...(usage.cached_input_tokens !== undefined
      ? { cacheReadTokens: usage.cached_input_tokens }
      : {}),
    ...(usage.reasoning_output_tokens !== undefined
      ? { reasoningTokens: usage.reasoning_output_tokens }
      : {}),
  };
}

function errorMessageOf(event: z.infer<typeof EventSchema>): string | undefined {
  if (typeof event.error === 'string') return event.error;
  if (event.error && typeof event.error === 'object' && event.error.message) {
    return event.error.message;
  }
  return event.message;
}

function itemFailed(item: ParsedItem): boolean {
  if (item.status === FAILED_ITEM_STATUS) return true;
  return item.exit_code !== undefined && item.exit_code !== SUCCESS_EXIT_CODE;
}

export function createCodexStreamParser(): HarnessParser {
  const openItems = new Set<string>();
  const stderrLines: string[] = [];
  let sessionId: string | undefined;
  let usage: HarnessUsageReport | undefined;
  let finalText = '';
  let failed = false;
  let errorMessage: string | undefined;

  const startEvent = (item: ParsedItem, name: string): AgentEvent => {
    if (item.id) openItems.add(item.id);
    return {
      type: 'tool-execution-start',
      toolCallId: item.id ?? name,
      name,
      category: toolCategoryFor(name),
      summary: toolSummary(name, item),
      input: toJsonValue(item),
    };
  };

  return {
    push(line, stream) {
      if (stream === 'stderr') {
        if (line.trim()) stderrLines.push(line);
        return [];
      }
      if (!line.trim()) return [];

      let payload: unknown;
      try {
        payload = JSON.parse(line);
      } catch {
        return [];
      }
      const parsed = EventSchema.safeParse(payload);
      if (!parsed.success) return [];
      const event = parsed.data;

      if (event.type === EVENT_TYPE.threadStarted) {
        if (event.thread_id) sessionId = event.thread_id;
        return [{ type: 'lifecycle', phase: 'started' }];
      }

      if (event.type === EVENT_TYPE.itemStarted && event.item?.type) {
        const name = event.item.type;
        if (name === ITEM_TYPE.agentMessage || name === ITEM_TYPE.reasoning) return [];
        return [startEvent(event.item, name)];
      }

      if (event.type === EVENT_TYPE.itemCompleted && event.item?.type) {
        const item = event.item;
        const name = item.type ?? '';
        if (name === ITEM_TYPE.agentMessage) {
          if (!item.text) return [];
          finalText = item.text;
          return [{ type: 'text-delta', delta: item.text }];
        }
        if (name === ITEM_TYPE.reasoning) {
          return item.text ? [{ type: 'reasoning-delta', delta: item.text }] : [];
        }
        const events: AgentEvent[] = [];
        if (!item.id || !openItems.has(item.id)) events.push(startEvent(item, name));
        if (item.id) openItems.delete(item.id);
        events.push({
          type: 'tool-execution-end',
          toolCallId: item.id ?? name,
          name,
          output: toJsonValue(item),
          isError: itemFailed(item),
        });
        return events;
      }

      if (event.type === EVENT_TYPE.turnCompleted) {
        if (event.usage) usage = usageReport(event.usage);
        return [];
      }

      if (event.type === EVENT_TYPE.turnFailed || event.type === EVENT_TYPE.error) {
        failed = true;
        errorMessage = errorMessageOf(event)?.slice(0, MAX_ERROR_MESSAGE_LENGTH);
        return errorMessage ? [{ type: 'error', message: errorMessage }] : [];
      }

      return [];
    },

    finish(exitCode): HarnessParserFlush {
      const runFailed = failed || exitCode !== SUCCESS_EXIT_CODE;
      const message =
        errorMessage ||
        (runFailed ? stderrLines.slice(-1)[0]?.slice(0, MAX_ERROR_MESSAGE_LENGTH) : undefined);
      const outcome: HarnessOutcome = {
        stopReason: runFailed ? 'error' : 'end-turn',
        finalText,
        ...(sessionId ? { sessionId } : {}),
        ...(usage ? { usage } : {}),
        ...(message ? { errorMessage: message } : {}),
      };
      return { events: [], outcome };
    },
  };
}
