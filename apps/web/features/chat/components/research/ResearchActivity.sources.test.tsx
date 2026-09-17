import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MessageResearchState } from '@shared/stores/web-chat-store';

import { ResearchActivity, parseResearchDomainList } from './ResearchActivity';

function awaitingApproval(): MessageResearchState {
  return {
    phase: 'awaiting_approval',
    label: 'Review the plan to start searching',
    searches: 0,
    sources: 0,
    elapsedMs: 0,
    startedAt: '2026-08-05T10:00:00.000Z',
    steps: [{ id: 'plan-1', type: 'search', description: 'Node LTS schedule', status: 'pending' }],
  };
}

describe('parseResearchDomainList', () => {
  it('splits on commas, semicolons and whitespace and drops blanks and repeats', () => {
    expect(parseResearchDomainList(' nature.com, who.int;  nature.com \n cdc.gov ')).toEqual([
      'nature.com',
      'who.int',
      'cdc.gov',
    ]);
    expect(parseResearchDomainList('   ')).toEqual([]);
  });
});

describe('choosing what a research run may read', () => {
  it('offers the source controls only while the plan is waiting on a decision', () => {
    const { rerender } = render(
      <ResearchActivity
        isStreaming={false}
        research={awaitingApproval()}
        onPlanDecision={vi.fn()}
      />,
    );
    expect(screen.getByTestId('research-plan-sources')).toBeInTheDocument();

    rerender(
      <ResearchActivity
        isStreaming
        research={{ ...awaitingApproval(), phase: 'searching' }}
        onPlanDecision={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('research-plan-sources')).toBeNull();
  });

  it('shows no source controls when the surface cannot start the run', () => {
    render(<ResearchActivity isStreaming={false} research={awaitingApproval()} />);

    expect(screen.queryByTestId('research-plan-sources')).toBeNull();
  });

  it('carries the reader’s choices with Start', () => {
    const onPlanDecision = vi.fn();
    render(
      <ResearchActivity
        isStreaming={false}
        research={awaitingApproval()}
        onPlanDecision={onPlanDecision}
      />,
    );

    fireEvent.click(screen.getByTestId('research-plan-use-files'));
    fireEvent.change(screen.getByTestId('research-plan-allow-domains'), {
      target: { value: 'nature.com, who.int' },
    });
    fireEvent.change(screen.getByTestId('research-plan-deny-domains'), {
      target: { value: 'content-farm.example' },
    });
    fireEvent.click(screen.getByTestId('research-plan-start'));

    expect(onPlanDecision).toHaveBeenCalledWith('start', {
      files: true,
      allowDomains: ['nature.com', 'who.int'],
      denyDomains: ['content-farm.example'],
    });
  });

  it('starts an unrestricted run when the reader answers nothing', () => {
    const onPlanDecision = vi.fn();
    render(
      <ResearchActivity
        isStreaming={false}
        research={awaitingApproval()}
        onPlanDecision={onPlanDecision}
      />,
    );

    fireEvent.click(screen.getByTestId('research-plan-start'));

    expect(onPlanDecision).toHaveBeenCalledWith('start', {
      files: false,
      allowDomains: [],
      denyDomains: [],
    });
  });
});
