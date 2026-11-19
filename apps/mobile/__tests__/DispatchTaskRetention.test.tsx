/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import type { DispatchTaskStatusEvent } from '@agiworkforce/types';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <View {...props} /> });
});

jest.mock('@/components/ui/Card', () => {
  const { View } = require('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...tokens,
    colors: tokens.lightColors,
    useThemeColors: () => tokens.lightColors,
    useTheme: () => ({ colors: tokens.lightColors, isDark: false, statusBarStyle: 'dark' }),
  };
});

jest.mock('@/services/companion', () => ({
  sendDispatchTask: jest.fn(),
  cancelDispatchTask: jest.fn(),
  replyToDispatchTask: jest.fn(),
}));

jest.mock('@/src/features/companion/components/DispatchTaskReply', () => {
  const { View } = require('react-native');
  return {
    DispatchTaskReply: ({ taskRequestId }: { taskRequestId: string }) => (
      <View testID={`reply-${taskRequestId}`} />
    ),
  };
});

import { DispatchTaskComposer } from '../src/features/companion/components/DispatchTaskComposer';
import { useDispatchTaskStore } from '../stores/dispatchTaskStore';

function send(requestId: string, at: number) {
  useDispatchTaskStore.getState().addOutgoingTask({
    requestId,
    prompt: `prompt ${requestId}`,
    title: `Task ${requestId}`,
    sentAt: new Date(at).toISOString(),
  });
}

function status(
  requestId: string,
  next: DispatchTaskStatusEvent['status'],
  extra: Partial<DispatchTaskStatusEvent> = {},
): DispatchTaskStatusEvent {
  return {
    action: 'dispatch.task.status',
    version: 1,
    requestId,
    status: next,
    updatedAt: '2026-11-09T10:00:00.000Z',
    ...extra,
  };
}

const ASK = {
  toolCallId: 'call-1',
  kind: 'input' as const,
  inputKey: 'form',
  message: 'Which room?',
  fields: [],
};

describe('dispatch task retention', () => {
  beforeEach(() => {
    useDispatchTaskStore.getState().reset();
  });

  it('keeps an older task that needs an answer reachable behind four newer finished tasks', () => {
    send('A', 1);
    useDispatchTaskStore.getState().applyStatus(status('A', 'awaiting_input', { pending: [ASK] }));
    for (const [index, id] of ['B', 'C', 'D', 'E'].entries()) {
      send(id, 10 + index);
      useDispatchTaskStore.getState().applyStatus(status(id, 'completed'));
    }

    const screen = render(<DispatchTaskComposer />);

    expect(screen.getByTestId('reply-A')).toBeTruthy();
    expect(screen.getByLabelText('Cancel Task A')).toBeTruthy();
    expect(screen.getByText('Task E')).toBeTruthy();
    expect(screen.getByText('Task B')).toBeTruthy();
  });

  it('limits only finished history to the four most recent', () => {
    for (const [index, id] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) {
      send(id, index);
      useDispatchTaskStore.getState().applyStatus(status(id, 'completed'));
    }

    const screen = render(<DispatchTaskComposer />);

    expect(screen.queryByText('Task A')).toBeNull();
    expect(screen.queryByText('Task B')).toBeNull();
    expect(screen.getByText('Task C')).toBeTruthy();
    expect(screen.getByText('Task F')).toBeTruthy();
  });

  it('shows a task that becomes active again after the window has moved past it', () => {
    send('A', 1);
    useDispatchTaskStore.getState().applyStatus(status('A', 'running'));
    for (const [index, id] of ['B', 'C', 'D', 'E'].entries()) {
      send(id, 10 + index);
      useDispatchTaskStore.getState().applyStatus(status(id, 'completed'));
    }
    const screen = render(<DispatchTaskComposer />);
    expect(screen.getByLabelText('Cancel Task A')).toBeTruthy();

    act(() => {
      useDispatchTaskStore
        .getState()
        .applyStatus(status('A', 'awaiting_input', { pending: [ASK] }));
    });

    expect(screen.getByTestId('reply-A')).toBeTruthy();
  });

  it('never evicts an unfinished task when more than the session cap has been sent', () => {
    send('OLD', 0);
    useDispatchTaskStore.getState().applyStatus(status('OLD', 'running'));
    for (let index = 0; index < 30; index += 1) {
      send(`T${index}`, 100 + index);
      useDispatchTaskStore.getState().applyStatus(status(`T${index}`, 'completed'));
    }

    const tasks = useDispatchTaskStore.getState().tasks;
    expect(tasks.some((task) => task.requestId === 'OLD')).toBe(true);
    expect(tasks.length).toBeLessThanOrEqual(25);
    expect(tasks[0]?.requestId).toBe('T29');
  });

  it('evicts the oldest finished task first once the cap is reached', () => {
    for (let index = 0; index < 26; index += 1) {
      send(`T${index}`, index);
      useDispatchTaskStore.getState().applyStatus(status(`T${index}`, 'completed'));
    }

    const ids = useDispatchTaskStore.getState().tasks.map((task) => task.requestId);
    expect(ids).toHaveLength(25);
    expect(ids).not.toContain('T0');
    expect(ids).toContain('T25');
  });

  it('clears only finished tasks', () => {
    send('A', 1);
    useDispatchTaskStore.getState().applyStatus(status('A', 'running'));
    send('B', 2);
    useDispatchTaskStore.getState().applyStatus(status('B', 'completed'));
    send('C', 3);

    useDispatchTaskStore.getState().clearFinished();

    expect(useDispatchTaskStore.getState().tasks.map((task) => task.requestId)).toEqual(['C', 'A']);
  });
});
