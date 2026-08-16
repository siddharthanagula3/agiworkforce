export const AGI_COMMANDS = [
  'help',
  'review',
  'security',
  'debt',
  'slop',
  'tests',
  'architecture',
  'explain',
  'rescan',
  'full-audit',
  'suppress',
  'unsuppress',
  'fix',
] as const;
export type AgiCommandName = (typeof AGI_COMMANDS)[number];

export type ParsedCommand =
  | { ok: true; command: Exclude<AgiCommandName, 'suppress' | 'unsuppress' | 'fix'> }
  | { ok: true; command: 'suppress'; findingId: string; reason: string }
  | { ok: true; command: 'unsuppress'; findingId: string }
  | { ok: true; command: 'fix'; findingId: string }
  | { ok: false; error: string };

const FINDING_ID_PATTERN = /^[0-9a-fA-F-]{8,64}$/;

export function parseAgiCommand(commentBody: string): ParsedCommand {
  const trimmed = commentBody.trim();
  if (!trimmed.startsWith('/agi')) return { ok: false, error: 'not an /agi command' };
  const rest = trimmed.slice('/agi'.length).trim();
  if (rest === '') return { ok: true, command: 'help' };

  const [name = '', ...args] = rest.split(/\s+/);
  const command = AGI_COMMANDS.find((c) => c === name);
  if (!command) return { ok: false, error: `unknown command: ${name.slice(0, 50)}` };

  switch (command) {
    case 'suppress': {
      const findingId = args[0];
      if (!findingId || !FINDING_ID_PATTERN.test(findingId)) {
        return { ok: false, error: 'suppress requires a finding id' };
      }
      const reasonMatch = /--reason\s+"([^"]{1,500})"/.exec(rest);
      if (!reasonMatch || reasonMatch[1] === undefined) {
        return { ok: false, error: 'suppress requires --reason "..."' };
      }
      return { ok: true, command, findingId, reason: reasonMatch[1] };
    }
    case 'unsuppress':
    case 'fix': {
      const findingId = args[0];
      if (!findingId || !FINDING_ID_PATTERN.test(findingId)) {
        return { ok: false, error: `${command} requires a finding id` };
      }
      return { ok: true, command, findingId };
    }
    default:
      return { ok: true, command };
  }
}

export const HELP_TEXT = `## AGI Guardian

Available commands:
- \`/agi help\` — show this help
- \`/agi review\` — run a full Guardian review of this PR
- \`/agi security\` — run the security and trust-boundary reviewers
- \`/agi debt\` — run the technical-debt analysis
- \`/agi slop\` — run the AI-slop and completeness rules
- \`/agi tests\` — run the test-quality reviewer
- \`/agi architecture\` — run the architecture and parity reviewer
- \`/agi explain\` — summarize the changes in this PR
- \`/agi rescan\` — re-run the last review against the current head
- \`/agi full-audit\` — run the full repository audit (subject to plan limits)
- \`/agi suppress <finding-id> --reason "..."\` — suppress a finding (owner + expiry recorded)
- \`/agi unsuppress <finding-id>\` — reopen a suppressed finding
- \`/agi fix <finding-id>\` — request a fix (approval-gated; disabled until write-phase rollout)`;
