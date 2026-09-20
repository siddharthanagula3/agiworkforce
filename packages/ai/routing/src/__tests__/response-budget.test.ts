import { describe, expect, it } from 'vitest';

import {
  RESPONSE_OUTPUT_TOKEN_CEILINGS,
  planResponseBudget,
  type SemanticResponseAssessment,
} from '../response-budget';
import { RESPONSE_BUDGET_CORPUS } from './fixtures/response-budget-corpus';

describe('response budget planning', () => {
  it.each(RESPONSE_BUDGET_CORPUS)('matches the labelled minimum for $id', (entry) => {
    const plan = planResponseBudget({ message: entry.message, taskType: entry.taskType });

    expect(plan.depth).toBe(entry.minimumSufficientDepth);
    expect(entry.acceptableFormats).toContain(plan.format);
    expect(plan.explanationRequired).toBe(entry.explanationRequired);
    expect(plan.clarification).toBe(entry.clarificationRequired);
  });

  it('lets exact user depth and format instructions override a semantic assessment', () => {
    const semanticAssessment: SemanticResponseAssessment = {
      accepted: true,
      answerDepth: 'comprehensive',
      answerFormat: 'table',
      explanationRequired: true,
      clarification: 'not_required',
    };

    expect(
      planResponseBudget({
        message: 'Answer in one sentence and return JSON.',
        taskType: 'general',
        apiResponseFormat: 'json_object',
        semanticAssessment,
      }),
    ).toMatchObject({
      depth: 'one_sentence',
      format: 'json',
      source: 'explicit',
      explanationRequired: false,
    });
  });

  it('uses one accepted semantic assessment for implicit response requirements', () => {
    const semanticAssessment: SemanticResponseAssessment = {
      accepted: true,
      answerDepth: 'short',
      answerFormat: 'bullets',
      explanationRequired: true,
      clarification: 'uncertain',
    };

    expect(
      planResponseBudget({
        message: 'Assess the options.',
        taskType: 'general',
        semanticAssessment,
      }),
    ).toMatchObject({
      depth: 'short',
      format: 'bullets',
      source: 'semantic',
      explanationRequired: true,
      clarification: 'uncertain',
    });
  });

  it('ignores an assessment the coordinator did not accept', () => {
    const semanticAssessment: SemanticResponseAssessment = {
      accepted: false,
      answerDepth: 'comprehensive',
      answerFormat: 'table',
      explanationRequired: true,
      clarification: 'required',
    };

    expect(
      planResponseBudget({
        message: 'Assess the options.',
        taskType: 'general',
        semanticAssessment,
      }),
    ).toMatchObject({ depth: 'normal', format: 'mixed', source: 'default' });
  });

  it('asks only one concise question when critical information is missing', () => {
    const plan = planResponseBudget({
      message: 'Deploy it.',
      taskType: 'agentic',
      semanticAssessment: {
        accepted: true,
        answerDepth: 'detailed',
        answerFormat: 'steps',
        explanationRequired: true,
        clarification: 'required',
      },
    });

    expect(plan.depth).toBe('very_short');
    expect(plan.outputTokenBudget).toBe(RESPONSE_OUTPUT_TOKEN_CEILINGS.very_short);
    expect(plan.instruction).toBe(
      'Ask one concise clarification question. Do not speculate or add background.',
    );
  });

  it('clamps the semantic ceiling to caller and model limits', () => {
    expect(
      planResponseBudget({
        message: 'Give me a comprehensive report.',
        taskType: 'general',
        requestedMaxOutputTokens: 900,
        modelMaxOutputTokens: 600,
      }).outputTokenBudget,
    ).toBe(600);
  });

  it('does not make visible output detailed merely because reasoning is hard', () => {
    const simple = planResponseBudget({
      message: 'Did the production deployment succeed?',
      taskType: 'simple_chat',
    });
    const hard = planResponseBudget({
      message: 'Did the production deployment succeed?',
      taskType: 'reasoning',
      semanticAssessment: {
        accepted: true,
        answerDepth: 'one_sentence',
        answerFormat: 'sentence',
        explanationRequired: false,
        clarification: 'not_required',
      },
    });

    expect(simple.outputTokenBudget).toBe(hard.outputTokenBudget);
    expect(hard.depth).toBe('one_sentence');
  });
});
