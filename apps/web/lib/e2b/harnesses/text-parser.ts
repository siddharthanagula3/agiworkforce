import type { AgentEvent } from '@agiworkforce/types/protocol';
import { MAX_ERROR_MESSAGE_LENGTH, MAX_HARNESS_TEXT_LENGTH, SUCCESS_EXIT_CODE } from './limits';
import type { HarnessOutcome, HarnessParser, HarnessParserFlush } from './types';

const LINE_BREAK = '\n';

export function createTextParser(): HarnessParser {
  const stderrLines: string[] = [];
  let text = '';

  return {
    push(line, stream) {
      if (stream === 'stderr') {
        if (line.trim()) stderrLines.push(line);
        return [];
      }
      if (!line.trim()) return [];
      const delta = `${line}${LINE_BREAK}`;
      if (text.length < MAX_HARNESS_TEXT_LENGTH) text += delta;
      const events: AgentEvent[] = [{ type: 'text-delta', delta }];
      return events;
    },

    finish(exitCode): HarnessParserFlush {
      const failed = exitCode !== SUCCESS_EXIT_CODE;
      const errorMessage = failed
        ? (stderrLines.slice(-1)[0] ?? text).slice(0, MAX_ERROR_MESSAGE_LENGTH)
        : undefined;
      const events: AgentEvent[] = errorMessage ? [{ type: 'error', message: errorMessage }] : [];
      const outcome: HarnessOutcome = {
        stopReason: failed ? 'error' : 'end-turn',
        finalText: text.trimEnd(),
        ...(errorMessage ? { errorMessage } : {}),
      };
      return { events, outcome };
    },
  };
}
