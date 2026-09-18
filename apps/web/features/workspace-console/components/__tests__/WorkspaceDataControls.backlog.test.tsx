import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useLegalHolds: vi.fn(),
  useCreateLegalHold: vi.fn(),
  useReleaseLegalHold: vi.fn(),
}));

vi.mock('../../hooks/use-legal-holds', () => ({
  useLegalHolds: mocks.useLegalHolds,
  useCreateLegalHold: mocks.useCreateLegalHold,
  useReleaseLegalHold: mocks.useReleaseLegalHold,
}));

import { WorkspaceDataControls } from '../WorkspaceDataControls';

function backlog(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    enforced: true,
    retentionDays: 30,
    cutoff: '2026-08-18T00:00:00.000Z',
    pendingDeletions: 12_400,
    heldFromDeletion: 0,
    perRunCeiling: 5000,
    runsRemaining: 3,
    lastSweptAt: '2026-09-16T00:00:00.000Z',
    estimatedCompletionAt: '2026-09-19T00:00:00.000Z',
    ...overrides,
  };
}

function state(over: Record<string, unknown>) {
  mocks.useLegalHolds.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: { holds: [], sweeps: [], backlog: backlog(over) },
  });
}

function strip() {
  return screen.getByRole('group', { name: 'Deletion backlog' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useCreateLegalHold.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
  mocks.useReleaseLegalHold.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  });
});

describe('the deletion backlog a workspace can finally see', () => {
  it('shows how much is waiting, how many runs are left and when it should finish', () => {
    state({});

    render(<WorkspaceDataControls />);

    const figures = within(strip());
    expect(figures.getByText('12,400')).toBeTruthy();
    expect(figures.getByText('Older than the 30-day window.')).toBeTruthy();
    expect(figures.getByText('3')).toBeTruthy();
    expect(figures.getByText('Each run deletes at most 5,000.')).toBeTruthy();
    expect(figures.getByText('Estimated to finish')).toBeTruthy();
  });

  it('says the sweep is caught up rather than showing a bare zero', () => {
    state({ pendingDeletions: 0, runsRemaining: 0 });

    render(<WorkspaceDataControls />);

    const figures = within(strip());
    expect(figures.getByText('Nothing')).toBeTruthy();
    expect(figures.getByText('The sweep has reached the whole retention window.')).toBeTruthy();
    expect(figures.queryByText('Sweeps still to run')).toBeNull();
    expect(figures.queryByText('Estimated to finish')).toBeNull();
  });

  it('admits it cannot date the finish until two sweeps have set a pace', () => {
    state({ estimatedCompletionAt: null });

    render(<WorkspaceDataControls />);

    expect(within(strip()).getByText('Known after two sweeps set a pace')).toBeTruthy();
  });

  it('counts what a legal hold is keeping separately from what is due', () => {
    state({ heldFromDeletion: 940 });

    render(<WorkspaceDataControls />);

    const figures = within(strip());
    expect(figures.getByText('940')).toBeTruthy();
    expect(figures.getByText('Kept by a legal hold, however old.')).toBeTruthy();
  });

  it('leaves the held figure out when no hold is keeping anything', () => {
    state({ heldFromDeletion: 0 });

    render(<WorkspaceDataControls />);

    expect(within(strip()).queryByText('Held from deletion')).toBeNull();
  });

  it('shows no backlog at all for a workspace that does not enforce retention', () => {
    state({ enforced: false, pendingDeletions: 0, runsRemaining: 0, retentionDays: null });

    render(<WorkspaceDataControls />);

    expect(screen.queryByRole('group', { name: 'Deletion backlog' })).toBeNull();
    expect(screen.getByText('No sweep has run')).toBeTruthy();
  });
});
