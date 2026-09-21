import type { SpanDomain } from './span';

// These ran inside one unnamed request latency each, so a slow clone and a
// failing pull request were the same number.
export const CODE_ACTIONS = [
  'clone',
  'commit_push',
  'diff',
  'notebook_execute',
  'pull_request',
  'sandbox_provision',
  'terminal_command',
  'worktree_cleanup',
] as const;

export type CodeAction = (typeof CODE_ACTIONS)[number];

export interface CodeActionSpan {
  readonly action: CodeAction;
  readonly domain: SpanDomain;
}

// A pull request fails for somebody else's reasons, so it is not counted with
// the sandbox work around it.
export const CODE_ACTION_SPANS: readonly CodeActionSpan[] = [
  { action: 'clone', domain: 'sandbox' },
  { action: 'commit_push', domain: 'sandbox' },
  { action: 'diff', domain: 'sandbox' },
  { action: 'notebook_execute', domain: 'sandbox' },
  { action: 'pull_request', domain: 'external' },
  { action: 'sandbox_provision', domain: 'sandbox' },
  { action: 'terminal_command', domain: 'sandbox' },
  { action: 'worktree_cleanup', domain: 'sandbox' },
];

export function codeActionSpanName(action: CodeAction): string {
  return `code.${action}`;
}

export function codeActionDomain(action: CodeAction): SpanDomain {
  return CODE_ACTION_SPANS.find((entry) => entry.action === action)?.domain ?? 'sandbox';
}
