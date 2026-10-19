jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/api', () => ({ api: { get: jest.fn() } }));

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';
import { ProjectArtifactsTab } from '@/src/features/projects/components/ProjectArtifactsTab';
import { ProjectRoutinesTab } from '@/src/features/projects/components/ProjectRoutinesTab';
import { useScheduleStore, type Schedule } from '@/src/features/schedules/store';

const PROJECT_ID = 'p-1';

function routine(overrides: Partial<Schedule>): Schedule {
  return {
    id: 'r-1',
    name: 'Weekly digest',
    prompt: 'Summarise the week',
    model: 'auto',
    recurrence: 'weekly',
    scheduledAt: null,
    timeOfDay: '09:00',
    timezone: 'UTC',
    isActive: true,
    lastRunAt: null,
    nextRunAt: null,
    lastRunStatus: null,
    projectId: PROJECT_ID,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('ProjectArtifactsTab', () => {
  it('lists the artifacts made in the project and opens the chat that made one', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      artifacts: [
        {
          id: 'a-1',
          conversationId: 'c-7',
          messageId: 'm-1',
          title: 'Pricing model',
          type: 'code',
          language: null,
          projectId: PROJECT_ID,
          createdAt: '2026-10-18T00:00:00.000Z',
        },
      ],
    });
    render(<ProjectArtifactsTab projectId={PROJECT_ID} />);

    fireEvent.press(await screen.findByLabelText('Open Pricing model in its chat'));
    expect(api.get).toHaveBeenCalledWith(
      '/api/artifacts/index?projectId=p-1',
      expect.objectContaining({ signal: expect.any(Object) }),
    );
    expect(useRouter().push).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'c-7' },
    });
  });

  it('says when the project has none and when the read failed', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    render(<ProjectArtifactsTab projectId={PROJECT_ID} />);
    expect(await screen.findByText('Artifacts could not be loaded')).toBeTruthy();
  });
});

describe('ProjectRoutinesTab', () => {
  it('lists only this project’s routines and creates new ones in the project', () => {
    useScheduleStore.setState({
      schedules: [routine({}), routine({ id: 'r-2', name: 'Elsewhere', projectId: 'p-2' })],
      fetchSchedules: jest.fn().mockResolvedValue(undefined),
    });
    render(<ProjectRoutinesTab projectId={PROJECT_ID} />);

    expect(screen.getByLabelText('Open routine Weekly digest')).toBeTruthy();
    expect(screen.queryByLabelText('Open routine Elsewhere')).toBeNull();
    fireEvent.press(screen.getByTestId('project-new-routine'));
    expect(useRouter().push).toHaveBeenCalledWith({
      pathname: '/(app)/schedules/create',
      params: { projectId: PROJECT_ID },
    });
  });
});
