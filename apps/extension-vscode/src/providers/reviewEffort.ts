import {
  DEVELOPER_REASONING_EFFORTS,
  type DeveloperReasoningEffort,
} from '@agiworkforce/local-runtime-contract';

const TRACE_PASS =
  'Trace how each value flows through the code and confirm every finding against the lines it cites before you report it.';
const EDGE_PASS =
  'Then make a second pass over error paths, boundary values, concurrency and backwards compatibility.';
const UNCONFIRMED_PASS =
  'After the confirmed issues, also report lower-confidence findings with severity hint and start each of their messages with "Unconfirmed:".';

export function resolveReviewEffort(
  requested: unknown,
  sessionEffort: DeveloperReasoningEffort,
): DeveloperReasoningEffort {
  return DEVELOPER_REASONING_EFFORTS.find((effort) => effort === requested) ?? sessionEffort;
}

export function reviewDepthInstruction(effort: DeveloperReasoningEffort): string {
  switch (effort) {
    case 'none':
    case 'minimal':
    case 'low':
      return 'Make one quick pass. Report only bugs and security problems you are certain of, and skip style and speculative concerns.';
    case 'medium':
      return '';
    case 'high':
      return TRACE_PASS;
    case 'xhigh':
      return `${TRACE_PASS} ${EDGE_PASS}`;
    case 'max':
      return `${TRACE_PASS} ${EDGE_PASS} ${UNCONFIRMED_PASS}`;
  }
}
