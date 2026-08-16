
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSettingsStore } from '../stores/settingsStore';

interface WatchdogState {
  isStreaming: boolean;
  isLoading: boolean;
  currentStreamingMessageId: string | null;
}

function createWatchdog(
  timeoutMs: number,
  onTimeout: (setState: (partial: Partial<WatchdogState>) => void) => void,
) {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  return {
    start(setState: (partial: Partial<WatchdogState>) => void) {
      this.clear();
      timerId = setTimeout(() => {
        onTimeout(setState);
        timerId = null;
      }, timeoutMs);
    },

    extend(setState: (partial: Partial<WatchdogState>) => void) {
      this.start(setState);
    },

    clear() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },

    get isActive() {
      return timerId !== null;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();

  useSettingsStore.setState((state) => ({
    executionPreferences: {
      ...state.executionPreferences,
      streamInactivityTimeoutSeconds: 30,
    },
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('stream watchdog configuration', () => {
  it('reads streamInactivityTimeoutSeconds from settings', () => {
    const { executionPreferences } = useSettingsStore.getState();
    expect(typeof executionPreferences.streamInactivityTimeoutSeconds).toBe('number');
    expect(executionPreferences.streamInactivityTimeoutSeconds).toBeGreaterThan(0);
  });

  it('setStreamInactivityTimeoutSeconds updates the value', () => {
    useSettingsStore.getState().setStreamInactivityTimeoutSeconds(60);
    expect(useSettingsStore.getState().executionPreferences.streamInactivityTimeoutSeconds).toBe(
      60,
    );
  });
});

describe('watchdog starts on stream begin', () => {
  it('timer is active after start() is called', () => {
    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'msg-1',
    };

    const timeoutMs = 30_000;
    const onTimeout = vi.fn();
    const watchdog = createWatchdog(timeoutMs, onTimeout);

    watchdog.start((patch) => Object.assign(state, patch));

    expect(watchdog.isActive).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();

    watchdog.clear();
  });
});

describe('watchdog stops on normal stream end', () => {
  it('clear() deactivates the timer before it fires', () => {
    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'msg-2',
    };

    const onTimeout = vi.fn();
    const watchdog = createWatchdog(30_000, onTimeout);

    watchdog.start((patch) => Object.assign(state, patch));
    watchdog.clear();

    vi.advanceTimersByTime(30_001);

    expect(onTimeout).not.toHaveBeenCalled();
    expect(watchdog.isActive).toBe(false);
  });

  it('isStreaming stays true when stream ends gracefully (watchdog not triggered)', () => {
    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'msg-3',
    };

    const onTimeout = (setState: (patch: Partial<WatchdogState>) => void) => {
      setState({ isStreaming: false, isLoading: false, currentStreamingMessageId: null });
    };

    const watchdog = createWatchdog(30_000, onTimeout);
    watchdog.start((patch) => Object.assign(state, patch));

    state.isStreaming = false;
    state.isLoading = false;
    state.currentStreamingMessageId = null;
    watchdog.clear();

    vi.advanceTimersByTime(30_001);

    expect(state.isStreaming).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.currentStreamingMessageId).toBeNull();
  });
});

describe('watchdog timeout after inactivity', () => {
  it('fires the timeout callback after the configured period', () => {
    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'msg-4',
    };

    const onTimeout = (setState: (patch: Partial<WatchdogState>) => void) => {
      setState({ isStreaming: false, isLoading: false, currentStreamingMessageId: null });
    };

    const watchdog = createWatchdog(30_000, onTimeout);
    watchdog.start((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(30_000);

    expect(state.isStreaming).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.currentStreamingMessageId).toBeNull();
  });

  it('does not fire before the configured period elapses', () => {
    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'msg-5',
    };

    const onTimeout = (setState: (patch: Partial<WatchdogState>) => void) => {
      setState({ isStreaming: false, isLoading: false, currentStreamingMessageId: null });
    };

    const watchdog = createWatchdog(30_000, onTimeout);
    watchdog.start((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(29_999);

    expect(state.isStreaming).toBe(true);
    expect(state.isLoading).toBe(true);

    watchdog.clear();
  });

  it('resets isStreaming, isLoading, and currentStreamingMessageId on timeout', () => {
    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'streaming-msg-id',
    };

    const onTimeout = (setState: (patch: Partial<WatchdogState>) => void) => {
      setState({ isStreaming: false, isLoading: false, currentStreamingMessageId: null });
    };

    const watchdog = createWatchdog(10_000, onTimeout);
    watchdog.start((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(10_000);

    expect(state.isStreaming).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.currentStreamingMessageId).toBeNull();
  });
});

describe('watchdog extension on stream activity', () => {
  it('extend() resets the timer when called before it fires', () => {
    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'msg-6',
    };

    const onTimeout = (setState: (patch: Partial<WatchdogState>) => void) => {
      setState({ isStreaming: false, isLoading: false, currentStreamingMessageId: null });
    };

    const watchdog = createWatchdog(30_000, onTimeout);
    watchdog.start((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(25_000);
    watchdog.extend((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(25_000);

    expect(state.isStreaming).toBe(true);

    watchdog.clear();
  });

  it('multiple extend() calls each push the deadline forward', () => {
    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'msg-7',
    };

    let timeoutFired = false;
    const onTimeout = (setState: (patch: Partial<WatchdogState>) => void) => {
      timeoutFired = true;
      setState({ isStreaming: false, isLoading: false, currentStreamingMessageId: null });
    };

    const watchdog = createWatchdog(10_000, onTimeout);
    watchdog.start((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(8_000);
    watchdog.extend((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(8_000);
    watchdog.extend((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(8_000);
    watchdog.extend((patch) => Object.assign(state, patch));

    expect(timeoutFired).toBe(false);

    watchdog.clear();
  });

  it('timeout fires after silence following the last activity', () => {
    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'msg-8',
    };

    const onTimeout = (setState: (patch: Partial<WatchdogState>) => void) => {
      setState({ isStreaming: false, isLoading: false, currentStreamingMessageId: null });
    };

    const watchdog = createWatchdog(10_000, onTimeout);
    watchdog.start((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(5_000);
    watchdog.extend((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(10_000);

    expect(state.isStreaming).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.currentStreamingMessageId).toBeNull();
  });
});

describe('configurable timeout integration', () => {
  it('uses the value from settingsStore for the watchdog period', () => {
    useSettingsStore.getState().setStreamInactivityTimeoutSeconds(15);

    const timeoutMs =
      useSettingsStore.getState().executionPreferences.streamInactivityTimeoutSeconds * 1000;

    const state: WatchdogState = {
      isStreaming: true,
      isLoading: true,
      currentStreamingMessageId: 'msg-9',
    };

    const onTimeout = (setState: (patch: Partial<WatchdogState>) => void) => {
      setState({ isStreaming: false, isLoading: false, currentStreamingMessageId: null });
    };

    const watchdog = createWatchdog(timeoutMs, onTimeout);
    watchdog.start((patch) => Object.assign(state, patch));

    vi.advanceTimersByTime(14_999);
    expect(state.isStreaming).toBe(true);

    vi.advanceTimersByTime(1);
    expect(state.isStreaming).toBe(false);
  });
});
