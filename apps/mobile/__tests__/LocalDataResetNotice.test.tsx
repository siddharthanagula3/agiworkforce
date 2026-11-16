import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { LocalDataResetNotice } from '@/src/features/edge-cases/components/LocalDataResetNotice';
import {
  acknowledgeLocalDataReset,
  reportLocalDataReset,
  useLocalDataResetStore,
} from '@/storage/localDataReset';

jest.mock('@/lib/mmkv', () => {
  const values = new Map<string, string>();
  return {
    whenMmkvReady: (cb: () => void) => cb(),
    storage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      delete: (key: string) => values.delete(key),
    },
  };
});

function pressOk(call: unknown[] | undefined): void {
  const buttons = call?.[2] as AlertButton[] | undefined;
  const ok = buttons?.find((button) => button.text === 'OK');
  if (!ok?.onPress) throw new Error('The notice has no OK button');
  act(() => ok.onPress!());
}

let alerts: jest.SpyInstance;

beforeEach(() => {
  alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  acknowledgeLocalDataReset(['chats', 'memory']);
});

afterEach(() => {
  alerts.mockRestore();
});

describe('Local data not restored from another phone', () => {
  it('says once which Local data could not be restored and why', () => {
    reportLocalDataReset('chats');
    reportLocalDataReset('memory');
    const view = render(<LocalDataResetNotice />);
    view.rerender(<LocalDataResetNotice />);

    expect(alerts).toHaveBeenCalledTimes(1);
    const [title, body] = alerts.mock.calls[0] as [string, string];
    expect(title).toBe('Local chats and saved memories not restored');
    expect(body).toContain('previous phone');
    expect(body).toContain('key that never leaves');
    expect(body).toContain('Download on-device models again');
    expect(`${title} ${body}`).not.toContain(String.fromCharCode(8212));
  });

  it('clears the notice only when the person acknowledges it', () => {
    reportLocalDataReset('chats');
    render(<LocalDataResetNotice />);
    expect(useLocalDataResetStore.getState().pending).toEqual(['chats']);

    pressOk(alerts.mock.calls[0]);

    expect(useLocalDataResetStore.getState().pending).toEqual([]);
  });

  it('shows a loss found after the first notice once that one is acknowledged', () => {
    reportLocalDataReset('chats');
    render(<LocalDataResetNotice />);
    act(() => reportLocalDataReset('memory'));
    expect(alerts).toHaveBeenCalledTimes(1);

    pressOk(alerts.mock.calls[0]);

    expect(alerts).toHaveBeenCalledTimes(2);
    expect(alerts.mock.calls[1]?.[0]).toBe('Saved memories not restored');
    expect(useLocalDataResetStore.getState().pending).toEqual(['memory']);
  });
});
