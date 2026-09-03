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

const LINE_TYPE = {
  system: 'system',
  assistant: 'assistant',
  user: 'user',
  result: 'result',
} as const;

const INIT_SUBTYPE = 'init';
const SUCCESS_SUBTYPE = 'success';

const BLOCK_TYPE = {
  text: 'text',
  thinking: 'thinking',
  toolUse: 'tool_use',
  toolResult: 'tool_result',
} as const;

const UNNAMED_TOOL = 'tool';

const UsageSchema = z.looseObject({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
});

const BlockSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  thinking: z.string().optional(),
  signature: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  input: z.unknown().optional(),
  tool_use_id: z.string().optional(),
  content: z.unknown().optional(),
  is_error: z.boolean().optional(),
});

const MessageSchema = z.looseObject({
  content: z.union([z.string(), z.array(BlockSchema)]).optional(),
  usage: UsageSchema.optional(),
});

const LineSchema = z.looseObject({
  type: z.string(),
  subtype: z.string().optional(),
  session_id: z.string().optional(),
  message: MessageSchema.optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  total_cost_usd: z.number().optional(),
  usage: UsageSchema.optional(),
  error: z.string().optional(),
});

type ParsedUsage = z.infer<typeof UsageSchema>;
type ParsedBlock = z.infer<typeof BlockSchema>;

function toUsageReport(usage: ParsedUsage, costUsd?: number): HarnessUsageReport {
  return {
    ...(usage.input_tokens !== undefined ? { inputTokens: usage.input_tokens } : {}),
    ...(usage.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {}),
    ...(usage.cache_read_input_tokens !== undefined
      ? { cacheReadTokens: usage.cache_read_input_tokens }
      : {}),
    ...(usage.cache_creation_input_tokens !== undefined
      ? { cacheWriteTokens: usage.cache_creation_input_tokens }
      : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}

function addUsage(target: HarnessUsageReport, addition: HarnessUsageReport): HarnessUsageReport {
  const merged: HarnessUsageReport = { ...target };
  for (const key of [
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
  ] as const) {
    const value = addition[key];
    if (value === undefined) continue;
    merged[key] = (merged[key] ?? 0) + value;
  }
  if (addition.costUsd !== undefined) merged.costUsd = (merged.costUsd ?? 0) + addition.costUsd;
  return merged;
}

function toolResultOutput(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const parsed = BlockSchema.safeParse(block);
        return parsed.success && typeof parsed.data.text === 'string' ? parsed.data.text : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return content === undefined || content === null ? '' : JSON.stringify(content);
}

function blocksOf(content: string | ParsedBlock[] | undefined): ParsedBlock[] {
  if (Array.isArray(content)) return content;
  if (typeof content === 'string') return [{ type: BLOCK_TYPE.text, text: content }];
  return [];
}

export interface MessageStreamParserOptions {
  emitThinking: boolean;
}

export function createMessageStreamParser(options: MessageStreamParserOptions): HarnessParser {
  const toolNames = new Map<string, string>();
  const stderrLines: string[] = [];
  let sessionId: string | undefined;
  let streamedUsage: HarnessUsageReport = {};
  let resultUsage: HarnessUsageReport | undefined;
  let finalText = '';
  let assistantText = '';
  let resultSeen = false;
  let resultFailed = false;
  let resultErrorMessage: string | undefined;

  const handleAssistant = (blocks: ParsedBlock[]): AgentEvent[] => {
    const events: AgentEvent[] = [];
    for (const block of blocks) {
      if (block.type === BLOCK_TYPE.text && block.text) {
        assistantText = block.text;
        events.push({ type: 'text-delta', delta: block.text });
        continue;
      }
      if (block.type === BLOCK_TYPE.thinking && block.thinking && options.emitThinking) {
        events.push({
          type: 'reasoning-delta',
          delta: block.thinking,
          ...(block.signature ? { signature: block.signature } : {}),
        });
        continue;
      }
      if (block.type === BLOCK_TYPE.toolUse && block.id) {
        const name = block.name ?? UNNAMED_TOOL;
        toolNames.set(block.id, name);
        events.push({
          type: 'tool-execution-start',
          toolCallId: block.id,
          name,
          category: toolCategoryFor(name),
          summary: toolSummary(name, block.input),
          input: toJsonValue(block.input),
        });
      }
    }
    return events;
  };

  const handleUser = (blocks: ParsedBlock[]): AgentEvent[] => {
    const events: AgentEvent[] = [];
    for (const block of blocks) {
      if (block.type !== BLOCK_TYPE.toolResult || !block.tool_use_id) continue;
      events.push({
        type: 'tool-execution-end',
        toolCallId: block.tool_use_id,
        name: toolNames.get(block.tool_use_id) ?? UNNAMED_TOOL,
        output: toolResultOutput(block.content),
        isError: block.is_error === true,
      });
    }
    return events;
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
      const parsed = LineSchema.safeParse(payload);
      if (!parsed.success) return [];
      const record = parsed.data;
      if (record.session_id) sessionId = record.session_id;

      if (record.type === LINE_TYPE.system) {
        return record.subtype === INIT_SUBTYPE ? [{ type: 'lifecycle', phase: 'started' }] : [];
      }
      if (record.type === LINE_TYPE.assistant) {
        if (record.message?.usage) {
          streamedUsage = addUsage(streamedUsage, toUsageReport(record.message.usage));
        }
        return handleAssistant(blocksOf(record.message?.content));
      }
      if (record.type === LINE_TYPE.user) {
        return handleUser(blocksOf(record.message?.content));
      }
      if (record.type === LINE_TYPE.result) {
        resultSeen = true;
        resultFailed = record.is_error === true || record.subtype !== SUCCESS_SUBTYPE;
        if (typeof record.result === 'string') finalText = record.result;
        if (record.usage) {
          resultUsage = toUsageReport(
            record.usage,
            record.total_cost_usd !== undefined ? record.total_cost_usd : undefined,
          );
        } else if (record.total_cost_usd !== undefined) {
          resultUsage = { costUsd: record.total_cost_usd };
        }
        if (resultFailed) {
          resultErrorMessage = (
            record.error ??
            (typeof record.result === 'string' ? record.result : record.subtype) ??
            ''
          ).slice(0, MAX_ERROR_MESSAGE_LENGTH);
        }
      }
      return [];
    },

    finish(exitCode): HarnessParserFlush {
      const usage =
        resultUsage ?? (Object.keys(streamedUsage).length > 0 ? streamedUsage : undefined);
      const failed = resultFailed || (!resultSeen && exitCode !== SUCCESS_EXIT_CODE);
      const errorMessage =
        resultErrorMessage ||
        (failed ? stderrLines.slice(-1)[0]?.slice(0, MAX_ERROR_MESSAGE_LENGTH) : undefined);
      const outcome: HarnessOutcome = {
        stopReason: failed ? 'error' : 'end-turn',
        finalText: finalText || assistantText,
        ...(sessionId ? { sessionId } : {}),
        ...(usage ? { usage } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      };
      return { events: [], outcome };
    },
  };
}
