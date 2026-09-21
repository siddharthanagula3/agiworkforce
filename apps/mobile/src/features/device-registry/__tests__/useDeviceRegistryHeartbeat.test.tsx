jest.mock('../heartbeat', () => {
  const actual = jest.requireActual('../heartbeat');
  return {
    ...actual,
    sendMobileHeartbeat: jest.fn(async () => true),
  };
});

import { render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { DEVICE_HEARTBEAT_INTERVAL_MS } from '@agiworkforce/cloud-contracts';
import {
  HEARTBEAT_RETRY_BASE_MS,
  recordHeartbeatResult,
  resetDeviceStatusMetrics,
  sendMobileHeartbeat,
} from '../heartbeat';
import { useDeviceRegistryHeartbeat } from '../useDeviceRegistryHeartbeat';

function Harness() {
  useDeviceRegistryHeartbeat();
  return null;
}

const send = sendMobileHeartbeat as jest.Mock;
const appState = AppState as unknown as { currentState: string };

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
  resetDeviceStatusMetrics();
  appState.currentState = 'active';
  send.mockReset();
  send.mockImplementation(async () => {
    recordHeartbeatResult(true);
    return true;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useDeviceRegistryHeartbeat', () => {
  it('waits the ordinary interval between beats the relay accepted', async () => {
    const view = render(<Harness />);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(DEVICE_HEARTBEAT_INTERVAL_MS - 1);
    expect(send).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('retries on the backoff after a refused beat instead of the flat interval', async () => {
    send.mockImplementation(async () => {
      recordHeartbeatResult(false);
      throw new Error('relay unreachable');
    });

    const view = render(<Harness />);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(HEARTBEAT_RETRY_BASE_MS);
    expect(send).toHaveBeenCalledTimes(2);
    await settle();

    jest.advanceTimersByTime(HEARTBEAT_RETRY_BASE_MS * 2);
    expect(send).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it('returns to the ordinary interval once the relay answers again', async () => {
    send.mockImplementationOnce(async () => {
      recordHeartbeatResult(false);
      throw new Error('relay unreachable');
    });

    const view = render(<Harness />);
    await settle();

    jest.advanceTimersByTime(HEARTBEAT_RETRY_BASE_MS);
    expect(send).toHaveBeenCalledTimes(2);
    await settle();

    jest.advanceTimersByTime(HEARTBEAT_RETRY_BASE_MS * 2);
    expect(send).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(DEVICE_HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it('beats nothing while the app is backgrounded and resumes on foreground', async () => {
    appState.currentState = 'background';

    const view = render(<Harness />);
    await settle();
    expect(send).not.toHaveBeenCalled();

    appState.currentState = 'active';
    jest.advanceTimersByTime(DEVICE_HEARTBEAT_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it('stops scheduling once the shell unmounts', async () => {
    const view = render(<Harness />);
    await settle();
    view.unmount();

    jest.advanceTimersByTime(DEVICE_HEARTBEAT_INTERVAL_MS * 4);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
