import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { TasksPage } from '../TasksPage';

function client(): ManagedCloudAgentRunClient {
  return {
    listRuns: vi.fn(async () => ({ runs: [], nextCursor: null })),
    getRun: vi.fn(),
    cancelRun: vi.fn(),
    followRun: vi.fn(),
  } as unknown as ManagedCloudAgentRunClient;
}

describe('Tasks maturity disclosure', () => {
  it('marks the Tasks header with the Managed Cloud maturity status', async () => {
    render(
      <TasksPage
        transport={{ client: client(), openConversation: vi.fn(), notifyError: vi.fn() }}
      />,
    );

    const badge = await screen.findByTestId('agi-work-maturity-badge');
    expect(badge.textContent).toBe('Alpha');
    expect(badge.getAttribute('title')).toContain('public alpha');
  });
});
