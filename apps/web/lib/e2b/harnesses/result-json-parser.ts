import { z } from 'zod';
import type { AgentEvent } from '@agiworkforce/types/protocol';
import { MAX_ERROR_MESSAGE_LENGTH, MAX_HARNESS_TEXT_LENGTH, SUCCESS_EXIT_CODE } from './limits';
import type {
  HarnessOutcome,
  HarnessParser,
  HarnessParserFlush,
  HarnessUsageReport,
} from './types';

const SUCCESS_SUBTYPE = 'success';

const ResultSchema = z.looseObject({
  type: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  session_id: z.string().optional(),
  total_cost_usd: z.number().optional(),
  usage: z
    .looseObject({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
    })
    .optional(),
});

function usageOf(parsed: z.infer<typeof ResultSchema>): HarnessUsageReport | undefined {
  const usage = parsed.usage;
  const report: HarnessUsageReport = {
    ...(usage?.input_tokens !== undefined ? { inputTokens: usage.input_tokens } : {}),
    ...(usage?.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {}),
    ...(usage?.cache_read_input_tokens !== undefined
      ? { cacheReadTokens: usage.cache_read_input_tokens }
      : {}),
    ...(usage?.cache_creation_input_tokens !== undefined
      ? { cacheWriteTokens: usage.cache_creation_input_tokens }
      : {}),
    ...(parsed.total_cost_usd !== undefined ? { costUsd: parsed.total_cost_usd } : {}),
  };
  return Object.keys(report).length > 0 ? report : undefined;
}

export function createResultJsonParser(): HarnessParser {
  const stdout: string[] = [];
  const stderrLines: string[] = [];

  return {
    push(line, stream) {
      if (stream === 'stderr') {
        if (line.trim()) stderrLines.push(line);
        return [];
      }
      if (line.trim()) stdout.push(line);
      return [];
    },

    finish(exitCode): HarnessParserFlush {
      const raw = stdout.join('\n').slice(0, MAX_HARNESS_TEXT_LENGTH);
      const stderrTail = stderrLines.slice(-1)[0]?.slice(0, MAX_ERROR_MESSAGE_LENGTH);
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = undefined;
      }
      const parsed = payload === undefined ? null : ResultSchema.safeParse(payload);

      if (!parsed || !parsed.success) {
        const failed = exitCode !== SUCCESS_EXIT_CODE;
        const events: AgentEvent[] = raw ? [{ type: 'text-delta', delta: raw }] : [];
        const outcome: HarnessOutcome = {
          stopReason: failed ? 'error' : 'end-turn',
          finalText: raw,
          ...(failed && stderrTail ? { errorMessage: stderrTail } : {}),
        };
        return { events, outcome };
      }

      const record = parsed.data;
      const text = typeof record.result === 'string' ? record.result : raw;
      const failed =
        record.is_error === true ||
        (record.subtype !== undefined && record.subtype !== SUCCESS_SUBTYPE) ||
        exitCode !== SUCCESS_EXIT_CODE;
      const usage = usageOf(record);
      const outcome: HarnessOutcome = {
        stopReason: failed ? 'error' : 'end-turn',
        finalText: text,
        ...(record.session_id ? { sessionId: record.session_id } : {}),
        ...(usage ? { usage } : {}),
        ...(failed
          ? { errorMessage: (text || stderrTail || '').slice(0, MAX_ERROR_MESSAGE_LENGTH) }
          : {}),
      };
      const events: AgentEvent[] = text ? [{ type: 'text-delta', delta: text }] : [];
      return { events, outcome };
    },
  };
}
