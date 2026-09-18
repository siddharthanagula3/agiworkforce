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

const CONNECTORS = [
  { connectorId: 'notion', label: 'Notion' },
  { connectorId: 'google-drive', label: 'Google Drive' },
];

function addSource(kind: string, value?: string) {
  fireEvent.change(screen.getByTestId('research-plan-add-kind'), { target: { value: kind } });
  if (value !== undefined) {
    const field =
      kind === 'connector'
        ? screen.getByTestId('research-plan-add-connector')
        : screen.getByTestId('research-plan-add-domain');
    fireEvent.change(field, { target: { value } });
  }
  fireEvent.click(screen.getByTestId('research-plan-add-source'));
}

function renderPlan(onPlanDecision = vi.fn(), connectorOptions = CONNECTORS) {
  render(
    <ResearchActivity
      isStreaming={false}
      research={awaitingApproval()}
      onPlanDecision={onPlanDecision}
      connectorOptions={connectorOptions}
    />,
  );
  return onPlanDecision;
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
  it('offers the source picker only while the plan is waiting on a decision', () => {
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

  it('shows no source picker when the surface cannot start the run', () => {
    render(<ResearchActivity isStreaming={false} research={awaitingApproval()} />);

    expect(screen.queryByTestId('research-plan-sources')).toBeNull();
  });

  it('starts an unrestricted run when the reader adds nothing', () => {
    const onPlanDecision = renderPlan();

    fireEvent.click(screen.getByTestId('research-plan-start'));

    expect(onPlanDecision).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        files: false,
        allowDomains: [],
        denyDomains: [],
        connectors: [],
      }),
    );
  });

  it('adds sites, files and a connected app as individual sources', () => {
    const onPlanDecision = renderPlan();

    addSource('web', 'nature.com, who.int');
    addSource('files');
    addSource('connector', 'notion');
    fireEvent.click(screen.getByTestId('research-plan-start'));

    expect(screen.getAllByTestId('research-plan-source')).toHaveLength(4);
    expect(onPlanDecision).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        files: true,
        allowDomains: ['nature.com', 'who.int'],
        denyDomains: [],
        connectors: ['notion'],
      }),
    );
  });

  it('removes one source without disturbing the rest', () => {
    const onPlanDecision = renderPlan();

    addSource('web', 'nature.com');
    addSource('connector', 'notion');
    addSource('connector', 'google-drive');
    fireEvent.click(screen.getByTestId('research-plan-remove-connector:notion'));
    fireEvent.click(screen.getByTestId('research-plan-start'));

    expect(onPlanDecision).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        files: false,
        allowDomains: ['nature.com'],
        denyDomains: [],
        connectors: ['google-drive'],
      }),
    );
  });

  it('keeps an excluded site apart from an allowed one', () => {
    const onPlanDecision = renderPlan();

    addSource('web', 'nature.com');
    addSource('web-excluded', 'content-farm.example');
    fireEvent.click(screen.getByTestId('research-plan-start'));

    expect(onPlanDecision).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        files: false,
        allowDomains: ['nature.com'],
        denyDomains: ['content-farm.example'],
        connectors: [],
      }),
    );
  });

  it('never adds the same source twice', () => {
    const onPlanDecision = renderPlan();

    addSource('web', 'nature.com');
    addSource('web', 'nature.com');
    addSource('files');
    fireEvent.click(screen.getByTestId('research-plan-start'));

    expect(screen.getAllByTestId('research-plan-source')).toHaveLength(2);
    expect(onPlanDecision).toHaveBeenCalledWith(
      'start',
      expect.objectContaining({
        files: true,
        allowDomains: ['nature.com'],
        denyDomains: [],
        connectors: [],
      }),
    );
  });

  it('offers no connected-app option to an account with none connected', () => {
    renderPlan(vi.fn(), []);

    expect(screen.queryByTestId('research-plan-add-connector')).toBeNull();
    expect(
      [...screen.getByTestId('research-plan-add-kind').querySelectorAll('option')].map(
        (option) => option.value,
      ),
    ).toEqual(['web', 'web-excluded', 'files']);
  });
});
