import {
  CONTEXT_SOURCE_CLASSES,
  contextSourceClassPolicy,
  type ContextSourceClass,
} from '@agiworkforce/context';

/**
 * The message the user just sent. It is not a stored context class, but it has
 * a place in the order: everything below it is something the model was told
 * earlier, and the person is here now.
 */
export const CURRENT_REQUEST = 'current_request';

/**
 * What the user set in settings for their whole account. It rides in the system
 * preamble rather than being loaded per turn, so the taxonomy has no class for
 * it, but it competes with the project instruction that refines it and has to
 * have a rank.
 */
export const ACCOUNT_INSTRUCTION = 'account_instruction';

export type PrecedenceEntry =
  ContextSourceClass | typeof CURRENT_REQUEST | typeof ACCOUNT_INSTRUCTION;

/**
 * The one order every surface reads, highest authority first.
 *
 * Security policy is above the current request because a user cannot instruct
 * their way out of it. Everything the user or the operator states as an
 * instruction sits above everything that is merely material, and third-party
 * material sits last because it is the only category an attacker can write.
 */
export const CONTEXT_PRECEDENCE: readonly PrecedenceEntry[] = [
  'security_policy',
  CURRENT_REQUEST,
  'agent_instruction',
  'current_task_state',
  'local_repository_instruction',
  'project_instruction',
  'template_instruction',
  ACCOUNT_INSTRUCTION,
  'account_memory',
  'project_sibling_chat',
  'past_chat',
  'project_knowledge_file',
  'library_file',
  'user_upload',
  'connector_result',
  'web_result',
];

export function precedenceRank(entry: PrecedenceEntry): number {
  const rank = CONTEXT_PRECEDENCE.indexOf(entry);
  if (rank < 0) throw new Error(`Context entry ${entry} has no place in the precedence order`);
  return rank;
}

export function outranks(winner: PrecedenceEntry, loser: PrecedenceEntry): boolean {
  return precedenceRank(winner) < precedenceRank(loser);
}

export function orderByPrecedence<T extends { entry: PrecedenceEntry }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => precedenceRank(a.entry) - precedenceRank(b.entry));
}

export type DirectiveSubject =
  'language' | 'formatting' | 'length' | 'tone' | 'identity' | 'answer_disclosure';

const SUBJECT_PATTERNS: Readonly<Record<DirectiveSubject, RegExp>> = {
  language:
    /\b(?:respond|reply|answer|write|speak)\b[^.]{0,40}?\b(?:in|using)\s+(?!bullets?\b|prose\b|tables?\b|markdown\b|code\b|detail\b|full\b|short\b|brief\b)[A-Za-z][A-Za-z-]{2,}/iu,
  formatting: /\b(?:bullet|bullets|table|tables|prose|heading|headings|markdown|code block)\b/iu,
  length: /\b(?:concise|brief|short|terse|verbose|detailed|thorough|long)\b/iu,
  tone: /\b(?:formal|casual|friendly|warm|blunt|tone|register|emoji)\b/iu,
  identity: /\b(?:call me|address me|my name is|refer to me)\b/iu,
  // Whether the answer is handed over or held back. A standing "just give me
  // the answer" preference and a mode built on withholding it are the same
  // directive with opposite values, and nothing else in this list catches that.
  answer_disclosure:
    /\b(?:give (?:me )?the answer|just the answer|full solution|solve it for me|work it out for me|hold(?:ing)? the answer back|until the user has attempted)\b/iu,
};

export function directiveSubjects(text: string): DirectiveSubject[] {
  return (Object.keys(SUBJECT_PATTERNS) as DirectiveSubject[]).filter((subject) =>
    SUBJECT_PATTERNS[subject].test(text),
  );
}

/**
 * Text that asks the model to set aside what it was told before. It is refused
 * wherever it appears below the security policy, whoever wrote it, because the
 * one place a user legitimately changes their mind is the current request and
 * the current request does not need to say this to be obeyed.
 */
const OVERRIDE_PATTERNS: readonly RegExp[] = [
  /\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|earlier|above|system|the\s+system)\b/iu,
  /\bdisregard\s+(?:all\s+|any\s+)?(?:previous|prior|earlier|above|system|safety|the\s+system)\b/iu,
  /\boverride\s+(?:the\s+)?(?:system|safety|security|policy|guardrails?)\b/iu,
  /\byou\s+are\s+no\s+longer\s+bound\b/iu,
  /\bforget\s+(?:all\s+|your\s+)?(?:previous|prior|earlier|instructions|rules)\b/iu,
];

export function attemptsInstructionOverride(text: string): boolean {
  return OVERRIDE_PATTERNS.some((pattern) => pattern.test(text));
}

export type ConflictKind =
  | 'security_override_attempt'
  | 'untrusted_instruction'
  | 'stale_memory_vs_current_request'
  | 'narrower_scope_wins';

export interface InstructionCandidate {
  id: string;
  entry: PrecedenceEntry;
  text: string;
}

export interface InstructionConflict {
  kind: ConflictKind;
  subject: DirectiveSubject | null;
  winnerId: string;
  loserId: string;
  reason: string;
}

export interface InstructionResolution {
  applied: InstructionCandidate[];
  refused: InstructionCandidate[];
  conflicts: InstructionConflict[];
}

function isMerelyMaterial(entry: PrecedenceEntry): boolean {
  if (entry === CURRENT_REQUEST || entry === ACCOUNT_INSTRUCTION) return false;
  return !contextSourceClassPolicy(entry).isInstruction;
}

function isRecalled(entry: PrecedenceEntry): boolean {
  return entry === 'account_memory' || entry === 'past_chat' || entry === 'project_sibling_chat';
}

/**
 * Resolves what actually reaches the model when several sources say different
 * things.
 *
 * Three refusals are enforced here rather than described in prompt text, which
 * is the whole point: a sentence telling the model that the current request
 * wins is guidance, and guidance is what an injected instruction competes with.
 */
export function resolveInstructionConflicts(
  candidates: readonly InstructionCandidate[],
): InstructionResolution {
  const ordered = orderByPrecedence(candidates);
  const applied: InstructionCandidate[] = [];
  const refused: InstructionCandidate[] = [];
  const conflicts: InstructionConflict[] = [];

  const securityPolicy = ordered.find((candidate) => candidate.entry === 'security_policy');
  const currentRequest = ordered.find((candidate) => candidate.entry === CURRENT_REQUEST);
  const requestSubjects = currentRequest ? directiveSubjects(currentRequest.text) : [];

  for (const candidate of ordered) {
    if (candidate.entry !== 'security_policy' && attemptsInstructionOverride(candidate.text)) {
      refused.push(candidate);
      conflicts.push({
        kind: 'security_override_attempt',
        subject: null,
        winnerId: securityPolicy?.id ?? 'security_policy',
        loserId: candidate.id,
        reason: `${candidate.entry} asks for earlier instructions to be set aside; the security policy outranks every source below it.`,
      });
      continue;
    }

    if (isMerelyMaterial(candidate.entry) && !isRecalled(candidate.entry)) {
      refused.push(candidate);
      conflicts.push({
        kind: 'untrusted_instruction',
        subject: null,
        winnerId: currentRequest?.id ?? securityPolicy?.id ?? 'security_policy',
        loserId: candidate.id,
        reason: `${candidate.entry} is material, not instruction; text inside it is quoted, never obeyed.`,
      });
      continue;
    }

    if (currentRequest && isRecalled(candidate.entry)) {
      const contested = directiveSubjects(candidate.text).filter((subject) =>
        requestSubjects.includes(subject),
      );
      if (contested.length > 0) {
        refused.push(candidate);
        for (const subject of contested) {
          conflicts.push({
            kind: 'stale_memory_vs_current_request',
            subject,
            winnerId: currentRequest.id,
            loserId: candidate.id,
            reason: `${candidate.entry} and the current request both set ${subject}; what the user asks now wins.`,
          });
        }
        continue;
      }
    }

    // `applied` is already in precedence order, so anything found here outranks
    // this candidate. Two instructions setting the same thing is not a blend:
    // the more specific one wins outright and the broader one is not sent.
    const subjects = directiveSubjects(candidate.text);
    const outranked = applied.find((earlier) =>
      directiveSubjects(earlier.text).some((subject) => subjects.includes(subject)),
    );
    if (outranked) {
      const subject =
        subjects.find((entry) => directiveSubjects(outranked.text).includes(entry)) ?? null;
      refused.push(candidate);
      conflicts.push({
        kind: 'narrower_scope_wins',
        subject,
        winnerId: outranked.id,
        loserId: candidate.id,
        reason: `${outranked.entry} and ${candidate.entry} both set ${subject ?? 'the same directive'}; the more specific one wins and the broader one is not sent.`,
      });
      continue;
    }

    applied.push(candidate);
  }

  return { applied, refused, conflicts };
}

export function assertPrecedenceCoversEveryClass(): void {
  const missing = CONTEXT_SOURCE_CLASSES.filter(
    (sourceClass) => !CONTEXT_PRECEDENCE.includes(sourceClass),
  );
  if (missing.length > 0) {
    throw new Error(`Context classes missing from the precedence order: ${missing.join(', ')}`);
  }
}
