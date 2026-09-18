import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResearchGap, ResearchStep } from '@agiworkforce/types';

import { ResearchPlan, parseResearchGapsEvent } from '../ResearchPlan';

function step(id: string, description: string): ResearchStep {
  return { id, type: 'search', description, status: 'pending' };
}

const PLAN: ResearchStep[] = [
  step('plan-1', 'battery degradation rates'),
  step('plan-2', 'charging infrastructure coverage'),
];

describe('ResearchPlan', () => {
  it('starts the run with the edited step, not the one the model proposed', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ResearchPlan steps={PLAN} editable onStart={onStart} />);

    const first = screen.getByLabelText('Research step 1');
    await user.clear(first);
    await user.type(first, 'battery degradation in cold climates');
    await user.click(screen.getByRole('button', { name: 'Start research' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    const submission = onStart.mock.calls[0]?.[0];
    expect(submission.steps.map((s: ResearchStep) => s.description)).toEqual([
      'battery degradation in cold climates',
      'charging infrastructure coverage',
    ]);
  });

  it('drops a removed step and adds a new one', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ResearchPlan steps={PLAN} editable onStart={onStart} />);

    await user.click(screen.getByRole('button', { name: /Remove this step: battery/ }));
    await user.click(screen.getByRole('button', { name: 'Add a step' }));
    await user.type(screen.getByLabelText('Research step 2'), 'resale values');
    await user.click(screen.getByRole('button', { name: 'Start research' }));

    expect(onStart.mock.calls[0]?.[0].steps.map((s: ResearchStep) => s.description)).toEqual([
      'charging infrastructure coverage',
      'resale values',
    ]);
  });

  it('carries the deliverable chosen before the run starts', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ResearchPlan steps={PLAN} editable onStart={onStart} />);

    await user.click(screen.getByRole('radio', { name: 'Executive summary' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /Format/ }), 'prose-with-tables');
    await user.click(screen.getByRole('checkbox', { name: /Save the finished report/ }));
    await user.click(screen.getByRole('button', { name: 'Start research' }));

    expect(onStart.mock.calls[0]?.[0].deliverable).toMatchObject({
      depth: 'executive-summary',
      format: 'prose-with-tables',
      saveToLibrary: true,
    });
  });

  it('refuses to start an empty plan', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ResearchPlan steps={[step('plan-1', '')]} editable onStart={onStart} />);

    expect(screen.getByRole('button', { name: 'Start research' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Start research' }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('renders the open gaps with the reason each is still open', () => {
    const gaps: ResearchGap[] = [
      {
        id: 'plan-1',
        question: 'battery degradation rates',
        status: 'open',
        reason: 'Searched, but the report does not answer it.',
      },
      {
        id: 'plan-2',
        question: 'charging coverage',
        status: 'closed',
        reason: 'Answered in the report.',
      },
    ];

    render(<ResearchPlan steps={PLAN} editable={false} gaps={gaps} />);

    expect(screen.getByText(/Gaps \(1\)/)).toBeInTheDocument();
    expect(screen.getAllByText('battery degradation rates')).toHaveLength(2);
    expect(screen.getByText(/the report does not answer it/)).toBeInTheDocument();
    expect(screen.queryByText('charging coverage')).not.toBeInTheDocument();
  });

  it('hides every editing control when the plan is no longer editable', () => {
    render(<ResearchPlan steps={PLAN} editable={false} />);

    expect(screen.queryByRole('button', { name: 'Start research' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Research step 1')).not.toBeInTheDocument();
  });
});

describe('parseResearchGapsEvent', () => {
  it('keeps well-formed gaps and rejects anything else', () => {
    expect(
      parseResearchGapsEvent({
        gaps: [
          { id: 'plan-1', question: 'q', status: 'open', reason: 'r' },
          { id: 'plan-2', question: 'q', status: 'maybe', reason: 'r' },
        ],
      }),
    ).toEqual([{ id: 'plan-1', question: 'q', status: 'open', reason: 'r' }]);
    expect(parseResearchGapsEvent({ gaps: [] })).toBeNull();
    expect(parseResearchGapsEvent(null)).toBeNull();
  });
});
