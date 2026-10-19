import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockListAgents = jest.fn();
const mockGet = jest.fn();

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@agiworkforce/types', () => ({
  ...jest.requireActual('@agiworkforce/types'),
  connectorsReleased: () => true,
}));
jest.mock('@/src/features/agents/service', () => ({
  listAgents: (...args: unknown[]) => mockListAgents(...args),
}));
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: jest.fn(async () => ({
    connectors: [
      { connectorId: 'gmail', toolConnectorId: 'gmail-tools', name: 'Gmail' },
      { connectorId: 'slack', name: 'Slack' },
    ],
  })),
}));
jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { schedules: true } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));

import { ScheduleAccessSection } from '../components/ScheduleAccessSection';
import { fetchSchedules } from '../service';

describe('schedule agent and connector access', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs a schedule as a chosen agent and narrows its connectors', async () => {
    mockListAgents.mockResolvedValue([
      { id: 'agent-1', name: 'Planner', status: 'active' },
      { id: 'agent-2', name: 'Old', status: 'retired' },
    ]);
    const onAgentChange = jest.fn();
    const onConnectorsChange = jest.fn();
    const { findByText, queryByText, getByLabelText } = render(
      <ScheduleAccessSection
        agentId={null}
        connectors={null}
        onAgentChange={onAgentChange}
        onConnectorsChange={onConnectorsChange}
      />,
    );
    fireEvent.press(await findByText('Planner'));
    expect(onAgentChange).toHaveBeenCalledWith('agent-1');
    expect(queryByText('Old')).toBeNull();

    await waitFor(() => expect(getByLabelText('Slack')).toBeTruthy());
    fireEvent(getByLabelText('Slack'), 'valueChange', false);
    expect(onConnectorsChange).toHaveBeenCalledWith(['gmail-tools']);
  });

  it('reads the agent and connectors back from a saved schedule', async () => {
    mockGet.mockResolvedValue({
      schedules: [
        {
          id: 'task-1',
          userId: 'user-1',
          name: 'Brief',
          description: null,
          scheduleType: 'cron',
          cronExpression: '0 9 * * *',
          executeAt: null,
          intervalMs: null,
          timezone: 'UTC',
          isEnabled: true,
          expiresAt: null,
          maxExecutions: null,
          executionCount: 0,
          actionType: 'agent',
          actionConfig: null,
          prompt: 'Brief me',
          model: 'auto',
          status: 'active',
          lastExecutedAt: null,
          nextExecutionAt: null,
          lastError: null,
          metadata: { productRecurrence: 'daily', timeOfDay: '09:00' },
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          agentId: '7d1b5c1e-0b3f-4a43-9a43-6b1d0f2b5f11',
          connectors: ['gmail-tools'],
        },
      ],
      pagination: { limit: 50, offset: 0 },
    });
    const [schedule] = await fetchSchedules();
    expect(schedule?.agentId).toBe('7d1b5c1e-0b3f-4a43-9a43-6b1d0f2b5f11');
    expect(schedule?.connectors).toEqual(['gmail-tools']);
  });
});
