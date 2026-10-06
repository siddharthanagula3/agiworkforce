import assert from 'node:assert/strict';
import { describe, expect, it, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_RESEARCH_DELIVERABLE, type ResearchStep } from '@agiworkforce/types';
import type { MessageResearchState } from '@shared/stores/web-chat-store';
import { approvedResearchSteps, parseResearchPlanEvent } from '../../chat/utils/research-plan';
import { ResearchActivity } from '../../chat/components/research/ResearchActivity';
import {
  ResearchPlan,
  type ResearchPlanSubmission,
} from '../../chat/components/research/ResearchPlan';
import * as FeatureScenes from './FeatureScenes';
import { ResearchWindow } from './FeatureScenes';

function sourceExample(): readonly unknown[] {
  assert.ok(
    Object.prototype.hasOwnProperty.call(FeatureScenes, 'RESEARCH_PLAN_EXAMPLE'),
    'FeatureScenes must export RESEARCH_PLAN_EXAMPLE; no private example is allowed',
  );
  const example: unknown = Reflect.get(FeatureScenes, 'RESEARCH_PLAN_EXAMPLE');
  assert.ok(
    Array.isArray(example),
    'FeatureScenes must export RESEARCH_PLAN_EXAMPLE; no private example is allowed',
  );
  return example;
}

function authoredApprovalPlan(example: readonly unknown[]): ResearchStep[] {
  const parsed = parseResearchPlanEvent({ steps: example });
  assert.ok(parsed, 'the canonical parser must retain an authored plan');
  assert.equal(parsed.length, example.length, 'the parser must retain every authored step');
  assert.deepEqual(parsed, example, 'the parser must preserve every authored step unchanged');
  assert.deepEqual(
    approvedResearchSteps(parsed),
    parsed,
    'every authored step must belong to the native pending-search approval plan',
  );
  return parsed;
}

function markup(html: string): HTMLDivElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

function required(root: ParentNode, selector: string): Element {
  const node = root.querySelector(selector);
  assert.ok(node, `the correspondence witness requires ${selector}`);
  return node;
}

function nativeApprovalMarkup(steps: ResearchStep[]): HTMLDivElement {
  const research: MessageResearchState = { phase: 'awaiting_approval', steps };
  return markup(
    renderToStaticMarkup(
      <ResearchActivity research={research} isStreaming={false} onPlanDecision={vi.fn()} />,
    ),
  );
}

function assertIllustratedSteps(illustration: ParentNode, steps: ResearchStep[]): void {
  const rows = [...illustration.querySelectorAll('.agi-sc-research-steps > li')];
  assert.deepEqual(
    rows.map((row) => ({
      status: row.getAttribute('data-status'),
      description: required(row, 'span').textContent,
    })),
    steps.map(({ status, description }) => ({ status, description })),
    'the illustration must show every parsed step unchanged and in order',
  );
}

function assertOwnerLabels(illustration: ParentNode, native: ParentNode): void {
  assert.equal(
    required(illustration, '.agi-sc-card-head').textContent,
    required(native, '#research-plan-heading').textContent,
    'the illustration heading must match the native plan heading',
  );
  assert.equal(
    required(illustration, '.agi-sc-card > p').textContent,
    required(native, '[data-testid="research-activity"] > span').textContent,
    'the illustration phase must match the native awaiting-approval fallback',
  );
  assert.deepEqual(
    [...illustration.querySelectorAll('.agi-mk-actions > span')].map((node) => node.textContent),
    [
      required(native, '[data-testid="research-plan-start"]').textContent,
      required(native, '[data-testid="research-plan-cancel"]').textContent,
    ],
    'illustrated actions must match the native approval actions',
  );
}

function assertNativeStartReady(container: HTMLElement): HTMLButtonElement {
  const button = within(container).getByTestId('research-plan-start');
  assert.ok(button instanceof HTMLButtonElement, 'native Start must be a button');
  assert.equal(button.disabled, false, 'native Start must be enabled for the authored example');
  return button;
}

describe('authored research plan correspondence', () => {
  it('exports the authored example from the actual scene source', () => {
    sourceExample();
  });

  it('retains the full example and matches the real awaiting-approval labels and fields', () => {
    const steps = authoredApprovalPlan(sourceExample());
    const illustration = markup(renderToStaticMarkup(<ResearchWindow />));
    const native = nativeApprovalMarkup(steps);

    assertIllustratedSteps(illustration, steps);
    assertOwnerLabels(illustration, native);
    assert.deepEqual(
      [...native.querySelectorAll('input[type="text"]')]
        .filter((input) => input.getAttribute('aria-label')?.startsWith('Research step '))
        .map((input) => (input as HTMLInputElement).value),
      steps.map((step) => step.description),
      'the native editable plan must retain every illustrated description',
    );
    assert.ok(native.querySelector('[data-testid="research-plan-sources"] select'));
    assert.ok(native.querySelector('fieldset input[type="radio"]'));
    assert.ok(native.querySelector('fieldset select'));
    assert.ok(native.querySelector('fieldset input[type="checkbox"]'));

    const figure = required(illustration, 'figure.agi-research-responsive');
    assert.match(figure.getAttribute('aria-label') ?? '', /^Example\b/u);
    assert.match(figure.getAttribute('aria-label') ?? '', /awaiting approval/u);
    assert.match(required(illustration, '.agi-sc-note').textContent ?? '', /^Example\b/u);
    assert.equal(required(illustration, '.agi-dev-body').getAttribute('aria-hidden'), 'true');
    assert.equal(
      illustration.querySelectorAll('button,a,input,select,textarea,[tabindex]').length,
      0,
    );
    assert.equal(
      illustration.querySelectorAll('.agi-sc-report,.agi-sc-sources,.agi-mk-receipt').length,
      0,
    );
  });

  it('starts the real editable plan with every example step and the canonical deliverable', async () => {
    const steps = authoredApprovalPlan(sourceExample());
    const onStart = vi.fn<(submission: ResearchPlanSubmission) => void>();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ResearchPlan steps={steps} editable onStart={onStart} onCancel={onCancel} />,
    );

    await user.click(assertNativeStartReady(container));
    expect(onStart).toHaveBeenCalledTimes(1);
    assert.deepEqual(onStart.mock.calls[0], [{ steps, deliverable: DEFAULT_RESEARCH_DELIVERABLE }]);
    await user.click(within(container).getByTestId('research-plan-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('research correspondence negative witnesses', () => {
  it('rejects duplicate ids even when the parser returns a nonempty plan', () => {
    const source = authoredApprovalPlan(sourceExample());
    const first = source[0];
    assert.ok(first && source.length > 1, 'the duplicate-id witness requires two authored steps');
    const example = source.map((step, index) => (index === 1 ? { ...step, id: first.id } : step));
    assert.throws(() => authoredApprovalPlan(example), {
      name: 'AssertionError',
      message: /the parser must retain every authored step/u,
    });
  });

  it('rejects queued as a step status instead of treating a run label as the contract', () => {
    const source = authoredApprovalPlan(sourceExample());
    const example = source.map((step, index) =>
      index === 0 ? { ...step, status: 'queued' } : step,
    );
    assert.throws(() => authoredApprovalPlan(example), {
      name: 'AssertionError',
      message: /the parser must retain every authored step/u,
    });
  });

  it.each([
    ['completed search', { status: 'completed' }],
    ['pending analyze', { type: 'analyze' }],
  ] as const)(
    'rejects a %s that canonical parsing accepts but native approval drops',
    (_name, change) => {
      const source = authoredApprovalPlan(sourceExample());
      const example = source.map((step, index) => (index === 0 ? { ...step, ...change } : step));
      assert.throws(() => authoredApprovalPlan(example), {
        name: 'AssertionError',
        message: /every authored step must belong to the native pending-search approval plan/u,
      });
    },
  );

  it('rejects an all-blank plan through the real disabled Start control', async () => {
    const source = authoredApprovalPlan(sourceExample());
    const steps = authoredApprovalPlan(source.map((step) => ({ ...step, description: ' \t\n ' })));
    const onStart = vi.fn<(submission: ResearchPlanSubmission) => void>();
    const { container } = render(<ResearchPlan steps={steps} editable onStart={onStart} />);
    assert.throws(() => assertNativeStartReady(container), {
      name: 'AssertionError',
      message: /native Start must be enabled for the authored example/u,
    });
    await userEvent.setup().click(within(container).getByTestId('research-plan-start'));
    expect(onStart).not.toHaveBeenCalled();
  });

  it.each(['changed description', 'missing row'] as const)(
    'rejects a parser/illustration mismatch caused by a %s',
    (mutation) => {
      const steps = authoredApprovalPlan(sourceExample());
      const illustration = markup(renderToStaticMarkup(<ResearchWindow />));
      const row = required(illustration, '.agi-sc-research-steps > li');
      if (mutation === 'missing row') row.remove();
      else required(row, 'span').textContent = 'A completed report was generated.';
      assert.throws(() => assertIllustratedSteps(illustration, steps), {
        name: 'AssertionError',
        message: /the illustration must show every parsed step unchanged and in order/u,
      });
    },
  );

  it('rejects a changed Start label against the real native renderer', () => {
    const steps = authoredApprovalPlan(sourceExample());
    const illustration = markup(renderToStaticMarkup(<ResearchWindow />));
    required(illustration, '.agi-mk-actions > span').textContent = 'Run report';
    assert.throws(() => assertOwnerLabels(illustration, nativeApprovalMarkup(steps)), {
      name: 'AssertionError',
      message: /illustrated actions must match the native approval actions/u,
    });
  });
});
