/**
 * Task-family eval corpus: SEED.
 *
 * Design source of truth:
 * `docs/architecture/execution-plan-contract.md` §6, which states
 * plainly that there is **no eval corpus and no `evals` directory in the repo
 * today** and that the corpus is a prerequisite for Stage 2, not a parallel
 * nice-to-have. This file is the first instalment of that prerequisite.
 *
 * WHAT IT IS
 * ----------
 * Twelve task families × six labelled requests each, plus a block of
 * deliberately-ambiguous requests. Each row pins two things against today's
 * behaviour:
 *
 *  1. `expectedFamily`: what `classifyTaskFamily` must return for these
 *     structural signals.
 *  2. `expectedBaselineRoute`: the model and effective profile the CURRENT
 *     Auto policy resolves for this task type and tier, with the task-family
 *     stage OFF. This is the control the design document's §5.1 quality gate
 *     ("≥ 98% of the balanced-model baseline") is measured against.
 *
 * WHAT IT IS NOT
 * --------------
 *  - **Not a learned router and not training data.** Nothing fits parameters to
 *    these rows. They are assertions.
 *  - **Not a grader.** §6 also requires a grader and a recorded quality
 *    baseline per family. Neither exists yet; a route is not a quality
 *    measurement, and this file must not be read as one. CPST cannot be
 *    computed from this file alone.
 *  - **Not a CPST baseline.** That needs the Stage 0 ledger rows
 *    (`apps/web/lib/cpst-telemetry.ts` writes the fields; two weeks of them are
 *    the exit criterion).
 *
 * PRIVACY
 * -------
 * Every row is synthetic and structural. A row carries flags, counts, MIME
 * strings, and lengths, never message text, never a user identifier, never a
 * transcript. There is no real user data here and there is no place to put any:
 * `TaskFamilySignals` has no content field.
 *
 * DETERMINISM
 * -----------
 * No wall-clock value appears in any row, and no assertion derived from these
 * rows may read one. Identical inputs must produce identical rows forever.
 *
 * @module routing/__tests__/fixtures/task-family-corpus
 * @packageDocumentation
 */

import { getRoutingSlotModel } from '@agiworkforce/types';
import type { TaskFamily, TaskFamilySignals } from '../../task-family';
import type { RoutingTaskType } from '../../types';

export type BaselineRoutePin = string;

export interface TaskFamilyCorpusCase {
  id: string;
  expectedFamily: TaskFamily | null;
  signals: TaskFamilySignals;
  taskType: RoutingTaskType;
  subscriptionTier: 'free' | 'pro' | 'max';
  expectedBaselineRoute: BaselineRoutePin;
  note: string;
}

export const CORPUS_RUNTIME_PROFILE_ID = 'web/cloud-chat';

const COMPUTER_USE_UNAVAILABLE: BaselineRoutePin = 'unavailable:no_eligible_route';

const BASELINE_ROUTES = {
  workhorseBalanced: `${getRoutingSlotModel('workhorse_general')}@balanced`,
  workhorseEconomy: `${getRoutingSlotModel('workhorse_general')}@economy`,
  generalBalanced: `${getRoutingSlotModel('general_balanced')}@balanced`,
  generalPremium: `${getRoutingSlotModel('flagship_general')}@premium`,
  codingBalanced: `${getRoutingSlotModel('coding_balanced')}@balanced`,
  codingPremium: `${getRoutingSlotModel('flagship_coding')}@premium`,
  multimodalBalanced: `${getRoutingSlotModel('multimodal_balanced')}@balanced`,
  longContextBalanced: `${getRoutingSlotModel('long_context_balanced')}@balanced`,
  reasoningEconomy: `${getRoutingSlotModel('reasoning_economy')}@economy`,
  reasoningBalanced: `${getRoutingSlotModel('reasoning_balanced')}@balanced`,
  reasoningPremium: `${getRoutingSlotModel('reasoning_premium_pro')}@premium`,
  // The `research` task now prefers `search_premium` at every profile band.
  // It previously preferred `search_fast`, whose model carries
  // `capabilities.research: false`, so Deep Research resolved to a model that
  // could not perform it, `researchModeAllowed()` refused, and the research loop
  // silently never ran. These rows pinned that broken baseline.
  searchPremiumBalanced: `${getRoutingSlotModel('search_premium')}@balanced`,
} as const satisfies Record<string, BaselineRoutePin>;

export const TASK_FAMILY_CORPUS: readonly TaskFamilyCorpusCase[] = [
  {
    id: 'deep_research/01',
    expectedFamily: 'deep_research',
    signals: {
      researchMode: true,
      messageCharCount: 42,
      runtimeProfileId: CORPUS_RUNTIME_PROFILE_ID,
    },
    taskType: 'research',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.searchPremiumBalanced,
    note: 'Deep Research toggle alone is decisive.',
  },
  {
    id: 'deep_research/02',
    expectedFamily: 'deep_research',
    signals: { researchMode: true, webSearch: true, messageCharCount: 120 },
    taskType: 'research',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.searchPremiumBalanced,
    note: 'Research outranks the plain web-search toggle.',
  },
  {
    id: 'deep_research/03',
    expectedFamily: 'deep_research',
    signals: { researchMode: true, workMode: 'agiwork' },
    taskType: 'research',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.searchPremiumBalanced,
    note: 'Research outranks agiwork, matching resolveToolAwareTaskType order.',
  },
  {
    id: 'deep_research/04',
    expectedFamily: 'deep_research',
    signals: { researchMode: true, declaredToolCount: 3, toolChoiceForced: true },
    taskType: 'research',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.searchPremiumBalanced,
    note: 'Caller tools do not displace an explicit research request.',
  },
  {
    id: 'deep_research/05',
    expectedFamily: 'deep_research',
    signals: { researchMode: true, estimatedInputTokens: 90_000 },
    taskType: 'research',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Research outranks the long-context guard; free tier clamps the band.',
  },
  {
    id: 'deep_research/06',
    expectedFamily: 'deep_research',
    signals: {
      researchMode: true,
      attachments: [{ mime: 'image/png', type: 'image' }],
      messageCharCount: 300,
    },
    taskType: 'research',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.searchPremiumBalanced,
    note: 'Research outranks attachments.',
  },

  {
    id: 'agentic_work/01',
    expectedFamily: 'agentic_work',
    signals: { workMode: 'agiwork', messageCharCount: 200 },
    taskType: 'agentic',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalPremium,
    note: 'The work-mode toggle alone is decisive.',
  },
  {
    id: 'agentic_work/02',
    expectedFamily: 'agentic_work',
    signals: { workMode: 'agiwork', codeExecution: true },
    taskType: 'agentic',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalPremium,
    note: 'agiwork outranks code_execution, matching resolveToolAwareTaskType.',
  },
  {
    id: 'agentic_work/03',
    expectedFamily: 'agentic_work',
    signals: { workMode: 'agiwork', officeCreation: true },
    taskType: 'agentic',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Both map to agentic; agiwork is checked first and reported as such.',
  },
  {
    id: 'agentic_work/04',
    expectedFamily: 'agentic_work',
    signals: { workMode: 'agiwork', declaredToolCount: 8 },
    taskType: 'agentic',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Work mode outranks a caller tool surface.',
  },
  {
    id: 'agentic_work/05',
    expectedFamily: 'agentic_work',
    signals: { workMode: 'agiwork', estimatedInputTokens: 120_000 },
    taskType: 'agentic',
    subscriptionTier: 'free',
    expectedBaselineRoute: `${getRoutingSlotModel('coding_fast')}@economy`,
    note: 'Free tier clamps agentic to the economy band.',
  },
  {
    id: 'agentic_work/06',
    expectedFamily: 'agentic_work',
    signals: {
      workMode: 'agiwork',
      attachments: [{ mime: 'image/jpeg', type: 'image' }],
      priorTurnCount: 4,
    },
    taskType: 'agentic',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalPremium,
    note: 'Work mode outranks attachments.',
  },

  {
    id: 'document_authoring/01',
    expectedFamily: 'document_authoring',
    signals: { officeCreation: true, messageCharCount: 160 },
    taskType: 'agentic',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Office creation alone is decisive.',
  },
  {
    id: 'document_authoring/02',
    expectedFamily: 'document_authoring',
    signals: { officeCreation: true, workMode: 'chat' },
    taskType: 'agentic',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalPremium,
    note: 'Explicit chat work mode does not suppress the office toggle.',
  },
  {
    id: 'document_authoring/03',
    expectedFamily: 'document_authoring',
    signals: { officeCreation: true, codeExecution: true },
    taskType: 'agentic',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalPremium,
    note: 'Office creation outranks code execution, mirroring the tool-aware order.',
  },
  {
    id: 'document_authoring/04',
    expectedFamily: 'document_authoring',
    signals: { officeCreation: true, declaredToolCount: 2 },
    taskType: 'agentic',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Caller tools do not displace the office toggle.',
  },
  {
    id: 'document_authoring/05',
    expectedFamily: 'document_authoring',
    signals: { officeCreation: true, estimatedInputTokens: 65_000 },
    taskType: 'agentic',
    subscriptionTier: 'free',
    expectedBaselineRoute: `${getRoutingSlotModel('coding_fast')}@economy`,
    note: 'Office creation outranks the long-context guard.',
  },
  {
    id: 'document_authoring/06',
    expectedFamily: 'document_authoring',
    signals: { officeCreation: true, thinkingMode: true, priorTurnCount: 2 },
    taskType: 'agentic',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalPremium,
    note: 'Office creation outranks extended thinking.',
  },

  {
    id: 'code_execution/01',
    expectedFamily: 'code_execution',
    signals: { codeExecution: true, messageCharCount: 240 },
    taskType: 'coding',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.codingPremium,
    note: 'Run-code toggle alone is decisive.',
  },
  {
    id: 'code_execution/02',
    expectedFamily: 'code_execution',
    signals: { codeExecution: true, workMode: 'chat' },
    taskType: 'coding',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.codingBalanced,
    note: 'Chat work mode does not suppress the run-code toggle.',
  },
  {
    id: 'code_execution/03',
    expectedFamily: 'code_execution',
    signals: { codeExecution: true, declaredToolCount: 5, toolChoiceForced: true },
    taskType: 'coding',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.codingPremium,
    note: 'The explicit sandbox toggle outranks a caller tool surface.',
  },
  {
    id: 'code_execution/04',
    expectedFamily: 'code_execution',
    signals: { codeExecution: true, webSearch: true },
    taskType: 'coding',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.codingBalanced,
    note: 'Code execution outranks the web-search toggle.',
  },
  {
    id: 'code_execution/05',
    expectedFamily: 'code_execution',
    signals: { codeExecution: true, estimatedInputTokens: 80_000 },
    taskType: 'coding',
    subscriptionTier: 'free',
    expectedBaselineRoute: `${getRoutingSlotModel('coding_fast')}@economy`,
    note: 'Free tier clamps coding to the economy band.',
  },
  {
    id: 'code_execution/06',
    expectedFamily: 'code_execution',
    signals: { codeExecution: true, thinkingMode: true, priorTurnCount: 9 },
    taskType: 'coding',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.codingPremium,
    note: 'Code execution outranks extended thinking.',
  },

  {
    id: 'web_grounded_answer/01',
    expectedFamily: 'web_grounded_answer',
    signals: { webSearch: true, messageCharCount: 55 },
    taskType: 'research',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.searchPremiumBalanced,
    note: 'Plain web-search toggle without the Deep Research mode.',
  },
  {
    id: 'web_grounded_answer/02',
    expectedFamily: 'web_grounded_answer',
    signals: { webFetch: true, messageCharCount: 90 },
    taskType: 'general',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'web_fetch grounds the answer without changing the canonical task type.',
  },
  {
    id: 'web_grounded_answer/03',
    expectedFamily: 'web_grounded_answer',
    signals: { webSearch: true, webFetch: true, workMode: 'chat' },
    taskType: 'general',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Both grounding toggles collapse to one family.',
  },
  {
    id: 'web_grounded_answer/04',
    expectedFamily: 'web_grounded_answer',
    signals: { webSearch: true, messageCharCount: 30, priorTurnCount: 1 },
    taskType: 'simple_chat',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'A grounded one-liner still classifies as simple_chat canonically.',
  },
  {
    id: 'web_grounded_answer/05',
    expectedFamily: 'web_grounded_answer',
    signals: { webSearch: true, attachments: [{ mime: 'image/png', type: 'image' }] },
    taskType: 'general',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Explicit tool toggles outrank attachments in the priority order.',
  },
  {
    id: 'web_grounded_answer/06',
    expectedFamily: 'web_grounded_answer',
    signals: { webFetch: true, declaredToolCount: 4 },
    taskType: 'general',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Server-owned grounding outranks a caller tool surface.',
  },

  {
    id: 'screen_automation/01',
    expectedFamily: 'screen_automation',
    signals: {
      attachments: [{ mime: 'image/png', type: 'screenshot' }],
      declaredToolCount: 3,
    },
    taskType: 'computer-use',
    subscriptionTier: 'max',
    expectedBaselineRoute: COMPUTER_USE_UNAVAILABLE,
    note: 'Screenshot plus a tool surface is the structural stand-in for automation.',
  },
  {
    id: 'screen_automation/02',
    expectedFamily: 'screen_automation',
    signals: {
      attachments: [{ mime: 'image/jpeg', type: 'screenshot' }],
      toolChoiceForced: true,
    },
    taskType: 'computer-use',
    subscriptionTier: 'pro',
    expectedBaselineRoute: COMPUTER_USE_UNAVAILABLE,
    note: 'A forced tool_choice counts as a tool surface.',
  },
  {
    id: 'screen_automation/03',
    expectedFamily: 'screen_automation',
    signals: {
      attachments: [
        { mime: 'image/png', type: 'screenshot' },
        { mime: 'image/png', type: 'image' },
      ],
      declaredToolCount: 1,
    },
    taskType: 'computer-use',
    subscriptionTier: 'max',
    expectedBaselineRoute: COMPUTER_USE_UNAVAILABLE,
    note: 'A screenshot in a mixed attachment set still wins.',
  },
  {
    id: 'screen_automation/04',
    expectedFamily: 'screen_automation',
    signals: {
      attachments: [{ mime: 'image/png', type: 'screenshot' }],
      declaredToolCount: 12,
      messageCharCount: 40,
    },
    taskType: 'computer-use',
    subscriptionTier: 'free',
    expectedBaselineRoute: COMPUTER_USE_UNAVAILABLE,
    note: 'Free tier is refused for the same reason every tier is: no live route.',
  },
  {
    id: 'screen_automation/05',
    expectedFamily: 'screen_automation',
    signals: {
      attachments: [{ mime: 'image/png', type: 'screenshot' }],
      declaredToolCount: 2,
      estimatedInputTokens: 20_000,
    },
    taskType: 'computer-use',
    subscriptionTier: 'pro',
    expectedBaselineRoute: COMPUTER_USE_UNAVAILABLE,
    note: 'Attachments outrank the token-budget guard.',
  },
  {
    id: 'screen_automation/06',
    expectedFamily: 'screen_automation',
    signals: {
      attachments: [{ mime: 'image/png', type: 'screenshot' }],
      toolChoiceForced: true,
      thinkingMode: true,
    },
    taskType: 'computer-use',
    subscriptionTier: 'max',
    expectedBaselineRoute: COMPUTER_USE_UNAVAILABLE,
    note: 'Extended thinking does not displace screen automation.',
  },

  {
    id: 'vision/01',
    expectedFamily: 'vision',
    signals: { attachments: [{ mime: 'image/png', type: 'image' }], messageCharCount: 25 },
    taskType: 'multimodal',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.multimodalBalanced,
    note: 'A single image attachment.',
  },
  {
    id: 'vision/02',
    expectedFamily: 'vision',
    signals: { attachments: [{ mime: 'video/mp4', type: 'video' }] },
    taskType: 'multimodal',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.multimodalBalanced,
    note: 'Video MIME routes to the same family as image.',
  },
  {
    id: 'vision/03',
    expectedFamily: 'vision',
    signals: {
      attachments: [{ mime: 'image/png', type: 'screenshot' }],
      messageCharCount: 60,
    },
    taskType: 'multimodal',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.multimodalBalanced,
    note: 'A bare screenshot with no tool surface is vision, not automation.',
  },
  {
    id: 'vision/04',
    expectedFamily: 'vision',
    signals: {
      attachments: [
        { mime: 'image/png', type: 'image' },
        { mime: 'image/webp', type: 'image' },
      ],
      priorTurnCount: 3,
    },
    taskType: 'multimodal',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Free tier clamps multimodal to the economy band.',
  },
  {
    id: 'vision/05',
    expectedFamily: 'vision',
    signals: {
      attachments: [{ mime: 'image/*', type: 'image' }],
      estimatedInputTokens: 70_000,
    },
    taskType: 'multimodal',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.multimodalBalanced,
    note: 'Attachments outrank the long-context guard, matching classifyTaskLocally.',
  },
  {
    id: 'vision/06',
    expectedFamily: 'vision',
    signals: { attachments: [{ mime: 'image/gif', type: 'image' }], thinkingMode: true },
    taskType: 'multimodal',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.multimodalBalanced,
    note: 'Attachments outrank extended thinking.',
  },

  {
    id: 'long_context/01',
    expectedFamily: 'long_context',
    signals: { estimatedInputTokens: 50_001, messageCharCount: 400 },
    taskType: 'long_context',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.longContextBalanced,
    note: 'One token over the threshold, the boundary is strict, as in classify.ts.',
  },
  {
    id: 'long_context/02',
    expectedFamily: 'long_context',
    signals: { estimatedInputTokens: 250_000, priorTurnCount: 40 },
    taskType: 'long_context',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.longContextBalanced,
    note: 'A long transcript.',
  },
  {
    id: 'long_context/03',
    expectedFamily: 'long_context',
    signals: { estimatedInputTokens: 900_000, workMode: 'chat' },
    taskType: 'long_context',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.longContextBalanced,
    note: 'An explicit chat work mode is not a decisive signal on its own.',
  },
  {
    id: 'long_context/04',
    expectedFamily: 'long_context',
    signals: { estimatedInputTokens: 60_000 },
    taskType: 'long_context',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Free tier clamps long context to the economy band.',
  },
  {
    id: 'long_context/05',
    expectedFamily: 'long_context',
    signals: { estimatedInputTokens: 120_000, attachments: [] },
    taskType: 'long_context',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.longContextBalanced,
    note: 'An empty attachment array is not an attachment.',
  },
  {
    id: 'long_context/06',
    expectedFamily: 'long_context',
    signals: { estimatedInputTokens: 51_000, thinkingMode: true, declaredToolCount: 3 },
    taskType: 'long_context',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.longContextBalanced,
    note: 'The token budget outranks both the tool surface and extended thinking.',
  },

  {
    id: 'caller_tool_loop/01',
    expectedFamily: 'caller_tool_loop',
    signals: { declaredToolCount: 1, messageCharCount: 150 },
    taskType: 'general',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'A single caller-declared tool.',
  },
  {
    id: 'caller_tool_loop/02',
    expectedFamily: 'caller_tool_loop',
    signals: { toolChoiceForced: true, messageCharCount: 45 },
    taskType: 'simple_chat',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'A forced tool_choice with no tools[] still means a tool loop.',
  },
  {
    id: 'caller_tool_loop/03',
    expectedFamily: 'caller_tool_loop',
    signals: { declaredToolCount: 16, toolChoiceForced: true },
    taskType: 'coding',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.codingPremium,
    note: 'Caller tools never change the canonical task type, coding stays coding.',
  },
  {
    id: 'caller_tool_loop/04',
    expectedFamily: 'caller_tool_loop',
    signals: { declaredToolCount: 6, workMode: 'chat', priorTurnCount: 5 },
    taskType: 'agentic',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Tools plus an explicit chat mode is still a caller loop, not agiwork.',
  },
  {
    id: 'caller_tool_loop/05',
    expectedFamily: 'caller_tool_loop',
    signals: { declaredToolCount: 2, estimatedInputTokens: 10_000 },
    taskType: 'general',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Below the long-context threshold the tool surface decides.',
  },
  {
    id: 'caller_tool_loop/06',
    expectedFamily: 'caller_tool_loop',
    signals: { declaredToolCount: 3, thinkingMode: true },
    taskType: 'coding',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.codingBalanced,
    note: 'A tool surface outranks extended thinking.',
  },

  {
    id: 'extended_thinking/01',
    expectedFamily: 'extended_thinking',
    signals: { thinkingMode: true, messageCharCount: 210 },
    taskType: 'reasoning',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.reasoningPremium,
    note: 'The thinking toggle with nothing else set.',
  },
  {
    id: 'extended_thinking/02',
    expectedFamily: 'extended_thinking',
    signals: { thinkingMode: true, declaredToolCount: 0 },
    taskType: 'reasoning',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.reasoningBalanced,
    note: 'A zero-length tools array is not a tool surface.',
  },
  {
    id: 'extended_thinking/03',
    expectedFamily: 'extended_thinking',
    signals: { thinkingMode: true, workMode: 'chat', priorTurnCount: 2 },
    taskType: 'general',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Extended thinking can narrow a plain general request.',
  },
  {
    id: 'extended_thinking/04',
    expectedFamily: 'extended_thinking',
    signals: { thinkingMode: true, estimatedInputTokens: 4_000 },
    taskType: 'coding',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.codingPremium,
    note: 'Extended thinking on a coding request.',
  },
  {
    id: 'extended_thinking/05',
    expectedFamily: 'extended_thinking',
    signals: { thinkingMode: true, messageCharCount: 12 },
    taskType: 'reasoning',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.reasoningEconomy,
    note: 'The thinking toggle outranks the residual length branch.',
  },
  {
    id: 'extended_thinking/06',
    expectedFamily: 'extended_thinking',
    signals: { thinkingMode: true, webSearch: false, researchMode: false },
    taskType: 'reasoning',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.reasoningBalanced,
    note: 'Explicitly false toggles are signals that were considered and rejected.',
  },

  {
    id: 'simple_chat/01',
    expectedFamily: 'simple_chat',
    signals: { messageCharCount: 4 },
    taskType: 'simple_chat',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'A greeting.',
  },
  {
    id: 'simple_chat/02',
    expectedFamily: 'simple_chat',
    signals: { messageCharCount: 79, workMode: 'chat' },
    taskType: 'simple_chat',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'One character under the simple-chat boundary.',
  },
  {
    id: 'simple_chat/03',
    expectedFamily: 'simple_chat',
    signals: { messageCharCount: 30, priorTurnCount: 0, estimatedInputTokens: 12 },
    taskType: 'simple_chat',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'A first turn; the premium tier still routes to the economy band.',
  },
  {
    id: 'simple_chat/04',
    expectedFamily: 'simple_chat',
    signals: { messageCharCount: 20, attachments: [] },
    taskType: 'simple_chat',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'An empty attachment array falls through to the length branch.',
  },
  {
    id: 'simple_chat/05',
    expectedFamily: 'simple_chat',
    signals: { messageCharCount: 61, declaredToolCount: 0, toolChoiceForced: false },
    taskType: 'simple_chat',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Tool signals present but negative.',
  },
  {
    id: 'simple_chat/06',
    expectedFamily: 'simple_chat',
    signals: { messageCharCount: 15, estimatedInputTokens: 50_000 },
    taskType: 'simple_chat',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Exactly at the long-context threshold, which is strict, not over it.',
  },

  {
    id: 'general_chat/01',
    expectedFamily: 'general_chat',
    signals: { messageCharCount: 80 },
    taskType: 'general',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Exactly at the simple-chat boundary, which is exclusive.',
  },
  {
    id: 'general_chat/02',
    expectedFamily: 'general_chat',
    signals: { messageCharCount: 900, priorTurnCount: 6 },
    taskType: 'general',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'A long plain turn with no tools and no attachments.',
  },
  {
    id: 'general_chat/03',
    expectedFamily: 'general_chat',
    signals: { messageCharCount: 400, workMode: 'chat' },
    taskType: 'creative_writing',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.codingBalanced,
    note: 'Prose intent is a CONTENT signal; only the canonical classifier sees it.',
  },
  {
    id: 'general_chat/04',
    expectedFamily: 'general_chat',
    signals: { messageCharCount: 2_400, estimatedInputTokens: 30_000 },
    taskType: 'general',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Below the long-context threshold.',
  },
  {
    id: 'general_chat/05',
    expectedFamily: 'general_chat',
    signals: { messageCharCount: 130, attachments: [], declaredToolCount: 0 },
    taskType: 'creative_writing',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.codingBalanced,
    note: 'Empty collections are not signals.',
  },
  {
    id: 'general_chat/06',
    expectedFamily: 'general_chat',
    signals: { messageCharCount: 500, thinkingMode: false, researchMode: false },
    taskType: 'general',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Every toggle explicitly off.',
  },

  {
    id: 'ambiguous/01',
    expectedFamily: null,
    signals: {},
    taskType: 'general',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'No signals at all.',
  },
  {
    id: 'ambiguous/02',
    expectedFamily: null,
    signals: { priorTurnCount: 3 },
    taskType: 'general',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'A turn count is not decisive on its own.',
  },
  {
    id: 'ambiguous/03',
    expectedFamily: null,
    signals: { runtimeProfileId: CORPUS_RUNTIME_PROFILE_ID },
    taskType: 'simple_chat',
    subscriptionTier: 'free',
    expectedBaselineRoute: BASELINE_ROUTES.workhorseEconomy,
    note: 'Surface alone decides nothing; it is recorded, not branched on.',
  },
  {
    id: 'ambiguous/04',
    expectedFamily: null,
    signals: { estimatedInputTokens: 8_000, priorTurnCount: 2 },
    taskType: 'general',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.generalBalanced,
    note: 'Under the long-context threshold with no length signal for the residual.',
  },
  {
    id: 'ambiguous/05',
    expectedFamily: null,
    signals: { workMode: 'chat', declaredToolCount: 0, toolChoiceForced: false },
    taskType: 'coding',
    subscriptionTier: 'max',
    expectedBaselineRoute: BASELINE_ROUTES.codingPremium,
    note: 'Every toggle off and no length, the coding intent is content-only.',
  },
  {
    id: 'ambiguous/06',
    expectedFamily: null,
    signals: { attachments: [], webSearch: false, officeCreation: false },
    taskType: 'creative_writing',
    subscriptionTier: 'pro',
    expectedBaselineRoute: BASELINE_ROUTES.codingBalanced,
    note: 'Negative signals plus an empty attachment array still cannot decide.',
  },
];
