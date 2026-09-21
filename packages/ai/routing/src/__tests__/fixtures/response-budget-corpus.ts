import type { AnswerDepth, AnswerFormat, ClarificationRequirement } from '../../response-budget';
import type { RoutingTaskType } from '../../types';

export interface ResponseBudgetCase {
  id: string;
  message: string;
  taskType: RoutingTaskType;
  minimumSufficientDepth: AnswerDepth;
  acceptableFormats: readonly AnswerFormat[];
  explanationRequired: boolean;
  clarificationRequired: ClarificationRequirement;
  reasoningComplexity: 'minimal' | 'low' | 'normal' | 'high';
}

export const RESPONSE_BUDGET_CORPUS: readonly ResponseBudgetCase[] = [
  {
    id: 'explicit-one-word',
    message: 'Is this valid JSON? Answer yes or no.',
    taskType: 'simple_chat',
    minimumSufficientDepth: 'one_word',
    acceptableFormats: ['word'],
    explanationRequired: false,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'minimal',
  },
  {
    id: 'direct-status',
    message: 'Did the production deployment succeed?',
    taskType: 'simple_chat',
    minimumSufficientDepth: 'one_sentence',
    acceptableFormats: ['sentence'],
    explanationRequired: false,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'high',
  },
  {
    id: 'direct-model-value',
    message: 'What model am I using?',
    taskType: 'simple_chat',
    minimumSufficientDepth: 'one_sentence',
    acceptableFormats: ['sentence'],
    explanationRequired: false,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'minimal',
  },
  {
    id: 'brief-qualification',
    message: 'Quick answer: is this API available in Local mode?',
    taskType: 'simple_chat',
    minimumSufficientDepth: 'very_short',
    acceptableFormats: ['plain_text'],
    explanationRequired: false,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'low',
  },
  {
    id: 'short-current-lookup',
    message: "Who is NVIDIA's current CEO?",
    taskType: 'research',
    minimumSufficientDepth: 'short',
    acceptableFormats: ['mixed'],
    explanationRequired: false,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'low',
  },
  {
    id: 'normal-request',
    message: 'Review this module for correctness and suggest the necessary repair.',
    taskType: 'coding',
    minimumSufficientDepth: 'normal',
    acceptableFormats: ['mixed'],
    explanationRequired: false,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'normal',
  },
  {
    id: 'detailed-explanation',
    message: 'Explain why the cache invalidation race happens and show your reasoning.',
    taskType: 'coding',
    minimumSufficientDepth: 'detailed',
    acceptableFormats: ['mixed'],
    explanationRequired: true,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'high',
  },
  {
    id: 'comprehensive-request',
    message: 'Give me a comprehensive comparison of these architectures.',
    taskType: 'reasoning',
    minimumSufficientDepth: 'comprehensive',
    acceptableFormats: ['mixed'],
    explanationRequired: true,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'high',
  },
  {
    id: 'explicit-json',
    message: 'Return the result as JSON.',
    taskType: 'general',
    minimumSufficientDepth: 'normal',
    acceptableFormats: ['json'],
    explanationRequired: false,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'normal',
  },
  {
    id: 'expansion-follow-up',
    message: 'Go deeper on point 2.',
    taskType: 'general',
    minimumSufficientDepth: 'detailed',
    acceptableFormats: ['mixed'],
    explanationRequired: true,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'normal',
  },
  {
    id: 'correction-shorter',
    message: 'That was too long. Just answer briefly.',
    taskType: 'simple_chat',
    minimumSufficientDepth: 'very_short',
    acceptableFormats: ['plain_text'],
    explanationRequired: false,
    clarificationRequired: 'not_required',
    reasoningComplexity: 'minimal',
  },
];
