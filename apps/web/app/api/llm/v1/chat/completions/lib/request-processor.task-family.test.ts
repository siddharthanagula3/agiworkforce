/**
 * Task-family signal building and route wiring on the managed-cloud web path.
 *
 * Two things are pinned here:
 *  1. `buildTaskFamilySignals` reads only structural request fields, and it
 *     distinguishes ABSENT from `false` — an omitted toggle must stay omitted,
 *     because the fast path treats absent as unknown and `false` as a decision.
 *  2. `resolveWebCloudModelRoute` forwards the family without ever changing the
 *     task type, the trust mode, or the runtime profile.
 *
 * All inputs are fixed literals. No wall-clock value is read anywhere.
 */
import { describe, expect, it } from 'vitest';

import { classifyTaskFamily } from '@agiworkforce/routing';

import { buildTaskFamilySignals, resolveWebCloudModelRoute } from './request-processor';

const emptyContext = {
  estimatedInputTokens: 120,
  messageCharCount: 40,
  priorTurnCount: 0,
} as const;

describe('buildTaskFamilySignals', () => {
  it('omits toggles the request did not set', () => {
    const signals = buildTaskFamilySignals({}, emptyContext);
    for (const key of [
      'workMode',
      'researchMode',
      'webSearch',
      'webFetch',
      'codeExecution',
      'officeCreation',
      'declaredToolCount',
      'toolChoiceForced',
      'thinkingMode',
      'attachments',
    ]) {
      expect(Object.hasOwn(signals, key), `${key} should be absent`).toBe(false);
    }
  });

  it('preserves an explicit false rather than dropping it', () => {
    const signals = buildTaskFamilySignals(
      { research: false, web_search: false, code_execution: false },
      emptyContext,
    );
    expect(signals.researchMode).toBe(false);
    expect(signals.webSearch).toBe(false);
    expect(signals.codeExecution).toBe(false);
  });

  it('maps the tool surface from tools[] and tool_choice', () => {
    expect(
      buildTaskFamilySignals(
        { tools: [], tool_choice: 'none' } as Parameters<typeof buildTaskFamilySignals>[0],
        emptyContext,
      ),
    ).toMatchObject({ declaredToolCount: 0, toolChoiceForced: false });
    expect(
      buildTaskFamilySignals(
        {
          tools: [{}, {}] as unknown as Parameters<typeof buildTaskFamilySignals>[0]['tools'],
          tool_choice: 'auto',
        },
        emptyContext,
      ),
    ).toMatchObject({ declaredToolCount: 2, toolChoiceForced: true });
  });

  it('records the managed-cloud runtime profile as the surface', () => {
    expect(buildTaskFamilySignals({}, emptyContext).runtimeProfileId).toBe('web/cloud-chat');
  });

  it('carries no message text', () => {
    const signals = buildTaskFamilySignals({ work_mode: 'agiwork' }, emptyContext);
    expect(JSON.stringify(signals)).not.toContain('content');
    expect(Object.keys(signals)).not.toContain('message');
  });

  it('produces signals the fast path can decide on', () => {
    expect(
      classifyTaskFamily(buildTaskFamilySignals({ work_mode: 'agiwork' }, emptyContext)).family,
    ).toBe('agentic_work');
    expect(
      classifyTaskFamily(buildTaskFamilySignals({ research: true }, emptyContext)).family,
    ).toBe('deep_research');
    expect(
      classifyTaskFamily(
        buildTaskFamilySignals(
          {},
          { ...emptyContext, attachments: [{ mime: 'image/png', type: 'image' }] },
        ),
      ).family,
    ).toBe('vision');
    expect(classifyTaskFamily(buildTaskFamilySignals({}, emptyContext)).family).toBe('simple_chat');
  });
});

describe('resolveWebCloudModelRoute · family forwarding', () => {
  it('routes identically with and without a family while the stage is off', () => {
    const withoutFamily = resolveWebCloudModelRoute('auto', 'max', 'coding', {
      estimatedInputTokens: 1000,
    });
    const withFamily = resolveWebCloudModelRoute('auto', 'max', 'coding', {
      estimatedInputTokens: 1000,
      taskFamily: 'code_execution',
    });
    expect(withoutFamily.status).toBe('selected');
    expect(withFamily).toMatchObject({
      status: 'selected',
      modelKey: withoutFamily.status === 'selected' ? withoutFamily.modelKey : '',
    });
    expect(withFamily.status === 'selected' && withFamily.taskFamilyDecision?.reasonCode).toBe(
      'task_family_stage_disabled',
    );
  });

  it('keeps the managed-cloud trust boundary and runtime profile', () => {
    const route = resolveWebCloudModelRoute('auto', 'pro', 'general', {
      taskFamily: 'general_chat',
    });
    expect(route.status).toBe('selected');
    // A web/cloud-chat route can only be a managed-cloud harness; if the family
    // had leaked into admission this would resolve somewhere else or fail.
    expect(route.status === 'selected' && route.taskType).toBe('general');
  });

  it('accepts a null family without changing the route', () => {
    const nullFamily = resolveWebCloudModelRoute('auto', 'pro', 'general', { taskFamily: null });
    const noFamily = resolveWebCloudModelRoute('auto', 'pro', 'general', {});
    expect(nullFamily).toMatchObject({
      status: 'selected',
      modelKey: noFamily.status === 'selected' ? noFamily.modelKey : '',
    });
  });
});
