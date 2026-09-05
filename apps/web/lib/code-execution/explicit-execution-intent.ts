/**
 * Explicit code-execution intent in the user's own words.
 *
 * Separate from the implicit tool-attachment heuristics: those answer "is an
 * execution tool worth offering", this answers "did the user ask for code to be
 * run". A turn that only offers the tool is a turn the model is free to answer
 * from memory, which is what produced a code block, an invented result, and no
 * execution call.
 *
 * Every phrase lives here so a new phrasing is a one-line change with a test
 * rather than an edit inside a request pipeline.
 *
 * @module code-execution/explicit-execution-intent
 * @packageDocumentation
 */

const RUN_DIRECTIVE_PHRASES: readonly string[] = [
  'run the code',
  'run this code',
  'run that code',
  'run your code',
  'run some code',
  'run code',
  'run the script',
  'run this script',
  'run that script',
  'run the program',
  'run the snippet',
  'run the notebook',
  'run the query',
  'run the numbers',
  'run python',
  'run javascript',
  'run nodejs',
  'run sql',
  'run it and',
  'run and show',
  'actually run',
  'write and run',
  'code and run',
  'run again',
  'rerun',
  're-run',
  'execute the code',
  'execute this code',
  'execute that code',
  'execute your code',
  'execute code',
  'execute the script',
  'execute this script',
  'execute the program',
  'execute the snippet',
  'execute the query',
  'execute it',
  'the code you ran',
  'code you ran',
  'code you actually ran',
  'code you executed',
];

const COMPUTATION_VERB_PHRASES: readonly string[] = [
  'compute',
  'computes',
  'computed',
  'calculate',
  'calculates',
  'calculated',
  'simulate',
  'simulation',
  'benchmark',
  'count',
  'tally',
  'sum',
  'average',
  'solve',
  'sort',
  'plot',
  'graph',
  'chart',
  'parse',
  'convert',
];

const RUNTIME_SUBJECT_PHRASES: readonly string[] = [
  'python',
  'python3',
  'javascript',
  'typescript',
  'nodejs',
  'node.js',
  'sql',
  'bash',
  'shell',
  'pandas',
  'numpy',
  'matplotlib',
  'code',
  'script',
  'program',
  'notebook',
  'sandbox',
  'interpreter',
];

const EXPLANATION_FRAME_PHRASES: readonly string[] = [
  'explain how to',
  'explain how you',
  'explain what',
  'explain the',
  'how do i',
  'how do you',
  'how would i',
  'how would you',
  'how can i',
  'how does',
  'what does',
  'what is',
  'what would',
  'teach me',
  'walk me through',
  'show me how to',
  'tell me how to',
  'is it possible to',
  'do i need to',
];

function escapeForPattern(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPhrasePattern(phrases: readonly string[]): RegExp {
  const alternation = phrases
    .map(escapeForPattern)
    .sort((a, b) => b.length - a.length)
    .join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternation})(?![\\p{L}\\p{N}_])`, 'iu');
}

const RUN_DIRECTIVE_PATTERN = buildPhrasePattern(RUN_DIRECTIVE_PHRASES);
const COMPUTATION_VERB_PATTERN = buildPhrasePattern(COMPUTATION_VERB_PHRASES);
const RUNTIME_SUBJECT_PATTERN = buildPhrasePattern(RUNTIME_SUBJECT_PHRASES);
const EXPLANATION_FRAME_PATTERN = buildPhrasePattern(EXPLANATION_FRAME_PHRASES);

const FENCED_CODE_PATTERN = /```[\s\S]*?(?:```|$)/g;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;

export type ExplicitExecutionIntentSignal = 'run_directive' | 'computation';

export const EXPLICIT_EXECUTION_INTENT_PHRASES: Readonly<{
  run_directive: readonly string[];
  computation_verb: readonly string[];
  runtime_subject: readonly string[];
  explanation_frame: readonly string[];
}> = Object.freeze({
  run_directive: RUN_DIRECTIVE_PHRASES,
  computation_verb: COMPUTATION_VERB_PHRASES,
  runtime_subject: RUNTIME_SUBJECT_PHRASES,
  explanation_frame: EXPLANATION_FRAME_PHRASES,
});

/**
 * A pasted snippet is context, not a request. Left in, a fenced block supplies
 * both halves of the computation signal on its own: the fence tag is a runtime
 * and any `sum(` inside it is a verb, so pasting code with nothing asked would
 * force a run.
 */
function requestTextOnly(text: string): string {
  return text.replace(FENCED_CODE_PATTERN, ' ').replace(INLINE_CODE_PATTERN, ' ');
}

function matchIndex(pattern: RegExp, text: string): number {
  return pattern.exec(text)?.index ?? -1;
}

/**
 * The signal this text carries, or `null` when it carries none.
 *
 * `computation` needs both a computation verb and a runtime subject, because
 * either alone is ordinary conversation: "what does this code do" names a
 * runtime with nothing to run, and "calculate the tip on 40" wants arithmetic,
 * not a sandbox. Returning the signal rather than a boolean keeps the reason
 * auditable in telemetry.
 *
 * An explanation frame ahead of the ask turns the whole sentence into a
 * question about running rather than a request to run: "explain how to run the
 * code" carries a run directive it does not mean. Position is what separates
 * that from "run the code and explain what it does", where the frame trails an
 * ask the user did make.
 */
export function detectExplicitCodeExecutionIntent(
  text: string,
): ExplicitExecutionIntentSignal | null {
  if (!text) return null;
  const request = requestTextOnly(text);
  const explanationAt = matchIndex(EXPLANATION_FRAME_PATTERN, request);

  const directiveAt = matchIndex(RUN_DIRECTIVE_PATTERN, request);
  if (directiveAt >= 0) {
    return explanationAt >= 0 && explanationAt < directiveAt ? null : 'run_directive';
  }

  const verbAt = matchIndex(COMPUTATION_VERB_PATTERN, request);
  if (verbAt < 0 || !RUNTIME_SUBJECT_PATTERN.test(request)) return null;
  return explanationAt >= 0 && explanationAt < verbAt ? null : 'computation';
}

export function hasExplicitCodeExecutionIntent(text: string): boolean {
  return detectExplicitCodeExecutionIntent(text) !== null;
}
