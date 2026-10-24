import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NOTIFICATION_TARGET_ATTRIBUTE,
  notificationTargetValue,
  useNotificationTarget,
  useNotificationTargetStore,
  type NotificationTargetKind,
} from '../notificationTarget';

function List({
  kind,
  ids,
  ready,
}: {
  kind: NotificationTargetKind;
  ids: string[];
  ready: boolean;
}) {
  const revealedId = useNotificationTarget(kind, ids, ready);
  return (
    <ul>
      {ids.map((id) => (
        <li
          key={id}
          tabIndex={-1}
          data-revealed={revealedId === id}
          {...{ [NOTIFICATION_TARGET_ATTRIBUTE]: notificationTargetValue(kind, id) }}
        >
          {id}
        </li>
      ))}
    </ul>
  );
}

function request(kind: NotificationTargetKind, id: string) {
  act(() => useNotificationTargetStore.getState().request({ kind, id }));
}

describe('useNotificationTarget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationTargetStore.setState({ pending: null });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('scrolls to, focuses and highlights the row a notification named', () => {
    request('schedule', 'job-2');
    render(<List kind="schedule" ids={['job-1', 'job-2']} ready />);

    const row = screen.getByText('job-2');
    expect(row).toHaveFocus();
    expect(row.dataset['revealed']).toBe('true');
    expect(screen.getByText('job-1').dataset['revealed']).toBe('false');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(useNotificationTargetStore.getState().pending).toBeNull();
  });

  it('waits for a list that is still loading, then reveals the row', () => {
    request('trigger', 'trigger-9');
    const { rerender } = render(<List kind="trigger" ids={[]} ready={false} />);
    expect(useNotificationTargetStore.getState().pending).toEqual({
      kind: 'trigger',
      id: 'trigger-9',
    });

    rerender(<List kind="trigger" ids={['trigger-9']} ready />);
    expect(screen.getByText('trigger-9')).toHaveFocus();
    expect(useNotificationTargetStore.getState().pending).toBeNull();
  });

  it('drops a request for an item the loaded list no longer has', () => {
    request('background-agent', 'gone');
    render(<List kind="background-agent" ids={['still-here']} ready />);

    expect(screen.getByText('still-here')).not.toHaveFocus();
    expect(screen.getByText('still-here').dataset['revealed']).toBe('false');
    expect(useNotificationTargetStore.getState().pending).toBeNull();
  });

  it('leaves a request for another kind of item alone', () => {
    request('trigger', 'shared-id');
    render(<List kind="schedule" ids={['shared-id']} ready />);

    expect(screen.getByText('shared-id')).not.toHaveFocus();
    expect(useNotificationTargetStore.getState().pending).toEqual({
      kind: 'trigger',
      id: 'shared-id',
    });
  });

  it('ends the highlight after a moment and keeps focus on the row', () => {
    request('schedule', 'job-1');
    render(<List kind="schedule" ids={['job-1']} ready />);
    const row = screen.getByText('job-1');
    expect(row.dataset['revealed']).toBe('true');

    act(() => vi.advanceTimersByTime(3000));
    expect(row.dataset['revealed']).toBe('false');
    expect(row).toHaveFocus();
  });
});
