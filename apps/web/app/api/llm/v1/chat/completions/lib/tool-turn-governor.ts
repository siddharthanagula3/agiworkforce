/**
 * Per-turn tool governor.
 *
 * A turn that keeps asking for a tool the harness cannot run, or keeps issuing
 * the query it just issued, burns the whole step budget and answers nothing.
 * The governor is the single place that decides a tool has stopped being worth
 * offering, and every rule it enforces resolves the same way: the tool leaves
 * the offered set for the rest of the turn, so the model has to write an answer
 * instead of retrying.
 *
 * Pure: no I/O, no clock.
 *
 * @module chat/completions/tool-turn-governor
 */

export const CHAT_TURN_TOOL_CALL_CAP = 16;
export const AGI_WORK_TURN_TOOL_CALL_CAP = 120;

export type ToolWithdrawalReason = 'unavailable' | 'budget' | 'repeated-query' | 'turn-cap';

export interface ToolTurnGovernor {
  /** Drop a tool from the offered set for the remainder of the turn. */
  withdraw(name: string, reason: ToolWithdrawalReason): void;
  isWithdrawn(name: string): boolean;
  withdrawalReason(name: string): ToolWithdrawalReason | undefined;
  /** Filter one step's tool list down to what is still on offer. */
  offered<T>(tools: readonly T[] | undefined, nameOf: (tool: T) => string): T[] | undefined;
  /**
   * Record a search query. `repeat` means this normalised query already ran
   * this turn, which is the breaker: the caller withdraws the search tool and
   * tells the model to answer from what it has.
   */
  noteQuery(name: string, rawQuery: unknown): 'new' | 'repeat';
  /** Count one tool call against the turn cap. */
  countCall(): { withinCap: boolean; used: number };
  capReached(): boolean;
  /** True exactly once, for the step that must render the stopped row. */
  claimCapAnnouncement(): boolean;
  callsUsed(): number;
  cap: number;
}

const QUERY_PUNCTUATION = /[^\p{L}\p{N}\s]+/gu;
const QUERY_WHITESPACE = /\s+/gu;

/**
 * Near-identical queries are the same query for breaker purposes: case,
 * punctuation and word order carry no search intent that a repeat would honour.
 */
export function normaliseSearchQuery(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const flattened = raw
    .toLowerCase()
    .replace(QUERY_PUNCTUATION, ' ')
    .replace(QUERY_WHITESPACE, ' ')
    .trim();
  if (flattened.length === 0) return '';
  return flattened.split(' ').sort().join(' ');
}

export function resolveTurnToolCallCap(agiWorkTurn: boolean): number {
  return agiWorkTurn ? AGI_WORK_TURN_TOOL_CALL_CAP : CHAT_TURN_TOOL_CALL_CAP;
}

export function turnToolCapMessage(cap: number): string {
  return (
    `Tool budget reached: this turn has already made its ${cap} allowed tool calls. ` +
    'No further tools will run. Answer now from what you already have, and say ' +
    'plainly which parts you could not confirm.'
  );
}

export function turnToolCapRowSummary(used: number): string {
  return `Stopped after ${used} tool calls`;
}

export function withdrawnToolMessage(name: string): string {
  return (
    `${name} is closed for this turn and was not run. Answer from what you ` +
    'already have, and say plainly which parts you could not confirm.'
  );
}

export function repeatedQueryMessage(query: string): string {
  return (
    `Repeated search: "${query}" already ran this turn and returned the results ` +
    'above. Searching it again would return the same thing, so web search is now ' +
    'closed for this turn. Answer from the results you have, and say plainly ' +
    'which parts you could not confirm.'
  );
}

/**
 * Withdrawal reasons that are evidence about the MODEL rather than about us.
 *
 * Empty by design and read through the predicate below, so a reason added later
 * is not evidence until someone deliberately puts it here. Every reason the
 * governor has today is a harness fact: `unavailable` is a sandbox or executor
 * down on our side, `budget` and `turn-cap` are our own caps, and
 * `repeated-query` is a search loop rather than a loss of tool support.
 */
const MODEL_ATTRIBUTABLE_WITHDRAWALS: ReadonlySet<ToolWithdrawalReason> =
  new Set<ToolWithdrawalReason>();

export function withdrawalIsModelEvidence(reason: ToolWithdrawalReason): boolean {
  return MODEL_ATTRIBUTABLE_WITHDRAWALS.has(reason);
}

export interface ToolCapabilityEvidence {
  toolsOffered: boolean;
  wellFormedCalls: number;
  malformedCalls: number;
  requiredToolsMissed: number;
}

export function emptyToolCapabilityEvidence(): ToolCapabilityEvidence {
  return { toolsOffered: false, wellFormedCalls: 0, malformedCalls: 0, requiredToolsMissed: 0 };
}

/**
 * `undefined` means the turn says nothing about tool support: either no tool was
 * offered, or one was offered, none was required, and the model answered without
 * calling it, which is a legitimate answer rather than a failure.
 */
export function resolveToolCapabilityObservation(
  evidence: ToolCapabilityEvidence,
): boolean | undefined {
  if (!evidence.toolsOffered) return undefined;
  if (evidence.malformedCalls > 0 || evidence.requiredToolsMissed > 0) return false;
  return evidence.wellFormedCalls > 0 ? true : undefined;
}

export function createToolTurnGovernor(cap: number): ToolTurnGovernor {
  const withdrawn = new Map<string, ToolWithdrawalReason>();
  const queriesByTool = new Map<string, Set<string>>();
  let used = 0;
  let capAnnounced = false;

  return {
    cap,
    withdraw(name, reason) {
      if (!name || withdrawn.has(name)) return;
      withdrawn.set(name, reason);
    },
    isWithdrawn(name) {
      return withdrawn.has(name);
    },
    withdrawalReason(name) {
      return withdrawn.get(name);
    },
    offered(tools, nameOf) {
      if (!tools) return undefined;
      if (withdrawn.size === 0) return [...tools];
      return tools.filter((tool) => !withdrawn.has(nameOf(tool)));
    },
    noteQuery(name, rawQuery) {
      const normalised = normaliseSearchQuery(rawQuery);
      if (normalised.length === 0) return 'new';
      const seen = queriesByTool.get(name) ?? new Set<string>();
      queriesByTool.set(name, seen);
      if (seen.has(normalised)) return 'repeat';
      seen.add(normalised);
      return 'new';
    },
    countCall() {
      used += 1;
      return { withinCap: used <= cap, used };
    },
    capReached() {
      return used >= cap;
    },
    claimCapAnnouncement() {
      if (capAnnounced) return false;
      capAnnounced = true;
      return true;
    },
    callsUsed() {
      return used;
    },
  };
}
