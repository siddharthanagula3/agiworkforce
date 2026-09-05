import type { ScrubbedErrorPayload, ScrubbedStackFrame } from './types';

const STACK_LINE_PATTERN = /^\s*at\s+(.*)$/;
const ANONYMOUS_FRAME_NAME = '<anonymous>';
const UNKNOWN_ERROR_NAME = 'Error';
const MAX_SCRUBBED_FRAMES = 25;

function scrubStackLine(line: string): ScrubbedStackFrame {
  const rest = STACK_LINE_PATTERN.exec(line)?.[1]?.trim();
  if (!rest) return { functionName: ANONYMOUS_FRAME_NAME };

  const locationStart = rest.indexOf('(');
  if (locationStart === -1) return { functionName: ANONYMOUS_FRAME_NAME };

  const functionName = rest.slice(0, locationStart).trim();
  return { functionName: functionName.length > 0 ? functionName : ANONYMOUS_FRAME_NAME };
}

export function scrubErrorPayload(error: Error): ScrubbedErrorPayload {
  const name = error.name && error.name.length > 0 ? error.name : UNKNOWN_ERROR_NAME;
  const stackLines = typeof error.stack === 'string' ? error.stack.split('\n').slice(1) : [];
  const frames = stackLines.slice(0, MAX_SCRUBBED_FRAMES).map(scrubStackLine);
  return { name, frames };
}
