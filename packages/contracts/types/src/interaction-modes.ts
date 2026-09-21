/**
 * One vocabulary for the ways a person can address the product, and one answer
 * for what a switch between any two of them does. The modes were previously
 * three separate lists that did not know about each other: a work-mode enum on
 * the conversation, a set of composer booleans, and a handful of surfaces with
 * their own routes. Nothing said what happened to a draft, an attachment or a
 * running turn when the user moved between them.
 *
 * Every mode names where it is selected, which request carries it, and which
 * gate can withhold it; `scripts/check-interaction-modes.mjs` resolves all
 * three against their own source of truth, so a mode that is declared but not
 * reachable, or gated on an entitlement that does not exist, fails.
 *
 * @module interaction-modes
 */

import registryJson from './interaction-modes.json' with { type: 'json' };
import type { BillingPlanCapability } from './billing-catalog';
import type { ModelCapabilities } from './model-catalog';
import type { PrivacyMode } from './suite-contracts';

export type InteractionModeId = keyof typeof registryJson.modes;

export type ModelCapabilityKey = keyof ModelCapabilities;

export type InteractionModeDraft = 'carried' | 'dropped';

export interface InteractionModeSelector {
  /** Where the control that enters this mode lives. */
  file: string;
  /** A declaration in that file the guard resolves the control by. */
  marker: string;
  /** The copy that control renders. */
  label: string;
}

export interface InteractionModeRequest {
  kind: 'chat-completions' | 'route';
  /** The request field for `chat-completions`, the payload key for a route. */
  field: string;
  /** Repository path of the route that accepts it. */
  route: string;
}

export interface InteractionModeGates {
  /** A feature-registry id when the mode is one, otherwise null. */
  feature: string | null;
  entitlement: BillingPlanCapability;
}

export interface InteractionModeDefinition {
  label: string;
  description: string;
  selector: InteractionModeSelector;
  request: InteractionModeRequest;
  gates: InteractionModeGates;
  models: { catalog: string };
  requiredModelCapabilities: readonly ModelCapabilityKey[];
  requiredTools: readonly string[];
  optionalTools: readonly string[];
  sourceBehavior: string;
  fileBehavior: string;
  memoryBehavior: string;
  projectBehavior: string;
  approvalBehavior: string;
  streamingFormat: string;
  persistence: string;
  backgroundExecution: boolean;
  usageAccounting: string;
  billing: BillingPlanCapability;
  cancellation: string;
  resume: string;
  crossDevice: string;
  offline: string;
  trustModes: readonly PrivacyMode[];
  enterprisePolicy: string | null;
  outputTypes: readonly string[];
  draft: InteractionModeDraft;
}

export const INTERACTION_MODE_DEFINITIONS: Readonly<
  Record<InteractionModeId, InteractionModeDefinition>
> = Object.freeze(
  registryJson.modes as unknown as Record<InteractionModeId, InteractionModeDefinition>,
);

export const INTERACTION_MODES: readonly InteractionModeId[] = Object.freeze(
  Object.keys(INTERACTION_MODE_DEFINITIONS) as InteractionModeId[],
);

export function isInteractionMode(value: unknown): value is InteractionModeId {
  return typeof value === 'string' && value in INTERACTION_MODE_DEFINITIONS;
}

export function interactionMode(id: InteractionModeId): InteractionModeDefinition {
  return INTERACTION_MODE_DEFINITIONS[id];
}

/** What a switch costs the user. Empty means nothing is lost. */
export type InteractionModeLoss = 'draft' | 'attachments' | 'project' | 'memory' | 'conversation';

export interface InteractionModeTransition {
  from: InteractionModeId;
  to: InteractionModeId;
  draft: 'preserved' | 'cleared';
  attachments: 'preserved' | 'cleared';
  project: 'preserved' | 'cleared';
  memory: 'preserved' | 'cleared';
  sources: 'preserved' | 'reset';
  conversation: 'same' | 'new';
  runningTurn: 'continues' | 'must-end';
  model: 'kept' | 're-selected';
  requiredTools: readonly string[];
  optionalTools: readonly string[];
  approval: string;
  entitlement: BillingPlanCapability;
  trustModes: readonly PrivacyMode[];
  trustNarrowed: boolean;
  contextCarryOver: 'carried' | 'withheld';
  usageAccounting: string;
  reversible: boolean;
  loses: readonly InteractionModeLoss[];
  warns: boolean;
}

const NO_FILES = 'none';
const MEMORY_READ_WRITE = 'read-write';
const PROJECT_UNAVAILABLE = 'unavailable';

/**
 * Derived rather than tabulated: ninety hand-written pairs would go stale the
 * first time a mode was added, and every answer below already follows from
 * what the two modes declare about themselves.
 */
export function interactionModeTransition(
  from: InteractionModeId,
  to: InteractionModeId,
): InteractionModeTransition {
  const source = interactionMode(from);
  const target = interactionMode(to);

  const sameSession = source.persistence === target.persistence;
  const draft: 'preserved' | 'cleared' =
    source.draft === 'carried' && target.draft === 'carried' ? 'preserved' : 'cleared';
  const attachments: 'preserved' | 'cleared' =
    source.fileBehavior === target.fileBehavior && target.fileBehavior !== NO_FILES
      ? 'preserved'
      : 'cleared';
  const project: 'preserved' | 'cleared' =
    source.projectBehavior !== PROJECT_UNAVAILABLE && target.projectBehavior !== PROJECT_UNAVAILABLE
      ? 'preserved'
      : 'cleared';
  const memory: 'preserved' | 'cleared' =
    source.memoryBehavior === MEMORY_READ_WRITE && target.memoryBehavior === MEMORY_READ_WRITE
      ? 'preserved'
      : 'cleared';

  const loses: InteractionModeLoss[] = [];
  if (draft === 'cleared') loses.push('draft');
  if (attachments === 'cleared') loses.push('attachments');
  if (project === 'cleared') loses.push('project');
  if (memory === 'cleared') loses.push('memory');
  if (!sameSession) loses.push('conversation');

  return {
    from,
    to,
    draft,
    attachments,
    project,
    memory,
    sources: source.sourceBehavior === target.sourceBehavior ? 'preserved' : 'reset',
    conversation: sameSession ? 'same' : 'new',
    runningTurn:
      sameSession && source.streamingFormat === target.streamingFormat ? 'continues' : 'must-end',
    model: source.models.catalog === target.models.catalog ? 'kept' : 're-selected',
    requiredTools: target.requiredTools,
    optionalTools: target.optionalTools,
    approval: target.approvalBehavior,
    entitlement: target.gates.entitlement,
    trustModes: target.trustModes,
    trustNarrowed: target.trustModes.length < source.trustModes.length,
    contextCarryOver: sameSession ? 'carried' : 'withheld',
    usageAccounting: target.usageAccounting,
    reversible: sameSession && draft === 'preserved',
    loses,
    warns: loses.length > 0,
  };
}

export const INTERACTION_MODE_BLOCK_REASONS = [
  'unknown_mode',
  'not_entitled',
  'trust_boundary',
] as const;

export type InteractionModeBlockReason = (typeof INTERACTION_MODE_BLOCK_REASONS)[number];

/**
 * Why a switch cannot happen, or null when it can. The entitlement answer is
 * the caller's: this only says which one to ask, so the plan catalog stays the
 * single owner of who may use what.
 */
export function interactionModeBlock(
  to: unknown,
  context: { entitled: (capability: BillingPlanCapability) => boolean; trustMode?: PrivacyMode },
): InteractionModeBlockReason | null {
  if (!isInteractionMode(to)) return 'unknown_mode';
  const target = interactionMode(to);
  if (!context.entitled(target.gates.entitlement)) return 'not_entitled';
  if (context.trustMode && !target.trustModes.includes(context.trustMode)) return 'trust_boundary';
  return null;
}
