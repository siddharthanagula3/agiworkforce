import { act, fireEvent, render } from '@testing-library/react-native';

import { SendErrorBanner } from '../SendErrorBanner';
import {
  FREE_CAPACITY_BUSY_MESSAGE,
  type FreeCapacityErrorState,
} from '@/src/features/chat/utils/freeCapacityRecovery';

const NOW_MS = Date.parse('2026-09-01T12:00:00.000Z');
const FREE_CAPACITY_CODE = 'free_capacity_unavailable';
const QUOTA_RESET_MS = 12 * 60 * 60 * 1_000;

function freeCapacityState(retryAtMs: number | null): FreeCapacityErrorState {
  return { retryAtMs, code: FREE_CAPACITY_CODE };
}

function renderBanner(freeCapacity: FreeCapacityErrorState | null, onRetry = jest.fn()) {
  const view = render(
    <SendErrorBanner
      error={FREE_CAPACITY_BUSY_MESSAGE}
      freeCapacity={freeCapacity}
      onRetry={onRetry}
      onDismiss={jest.fn()}
    />,
  );
  return { ...view, onRetry };
}

describe('SendErrorBanner free-capacity countdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts down and keeps retry disabled until retry_at passes', () => {
    const { getByText, queryByText, getByLabelText, onRetry } = renderBanner(
      freeCapacityState(NOW_MS + 3_000),
    );

    expect(getByText('Free capacity is busy. You can retry in 3s.')).toBeTruthy();
    expect(queryByText(FREE_CAPACITY_BUSY_MESSAGE)).toBeNull();

    const retry = getByLabelText('Retry sending message');
    expect(retry.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(retry);
    expect(onRetry).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(getByText('Free capacity is busy. You can retry in 2s.')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(getByText(FREE_CAPACITY_BUSY_MESSAGE)).toBeTruthy();

    const enabledRetry = getByLabelText('Retry sending message');
    expect(enabledRetry.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(enabledRetry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('counts from when the error arrives, not from when the banner mounted', () => {
    const onDismiss = jest.fn();
    const onRetry = jest.fn();
    const { rerender, getByText } = render(
      <SendErrorBanner error={null} freeCapacity={null} onRetry={onRetry} onDismiss={onDismiss} />,
    );

    act(() => {
      jest.advanceTimersByTime(60 * 60 * 1_000);
    });

    rerender(
      <SendErrorBanner
        error={FREE_CAPACITY_BUSY_MESSAGE}
        freeCapacity={freeCapacityState(Date.now() + 30_000)}
        onRetry={onRetry}
        onDismiss={onDismiss}
      />,
    );

    expect(getByText('Free capacity is busy. You can retry in 30s.')).toBeTruthy();
  });

  it('never renders the wire code', () => {
    const { queryByText, toJSON } = renderBanner(freeCapacityState(NOW_MS + 30_000));

    expect(queryByText(FREE_CAPACITY_CODE)).toBeNull();
    expect(JSON.stringify(toJSON())).not.toContain(FREE_CAPACITY_CODE);
  });

  it('behaves as today when retry_at is absent', () => {
    const { getByText, getByLabelText, onRetry } = renderBanner(freeCapacityState(null));

    expect(getByText(FREE_CAPACITY_BUSY_MESSAGE)).toBeTruthy();
    fireEvent.press(getByLabelText('Retry sending message'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('behaves as today when retry_at is already past', () => {
    const { getByText, getByLabelText, onRetry } = renderBanner(freeCapacityState(NOW_MS - 1_000));

    expect(getByText(FREE_CAPACITY_BUSY_MESSAGE)).toBeTruthy();
    fireEvent.press(getByLabelText('Retry sending message'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('reads a multi-minute backoff in minutes rather than raw seconds', () => {
    const { getByText, getByLabelText } = renderBanner(freeCapacityState(NOW_MS + 583_000));

    expect(getByText('Free capacity is busy. You can retry in 9m 43s.')).toBeTruthy();
    expect(getByLabelText('Retry sending message').props.accessibilityState.disabled).toBe(true);
  });

  it('does not lock retry behind a quota reset hours away', () => {
    const { getByText, getByLabelText, onRetry } = renderBanner(
      freeCapacityState(NOW_MS + QUOTA_RESET_MS),
    );

    expect(getByText(FREE_CAPACITY_BUSY_MESSAGE)).toBeTruthy();
    const retry = getByLabelText('Retry sending message');
    expect(retry.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('behaves as today for an error that carries no free-capacity state', () => {
    const { getByText, getByLabelText, onRetry } = renderBanner(null);

    expect(getByText(FREE_CAPACITY_BUSY_MESSAGE)).toBeTruthy();
    fireEvent.press(getByLabelText('Retry sending message'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
