import React, { StrictMode, useLayoutEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { useVoiceOutputOwner } from '@/src/features/voice/hooks/useVoiceOutputOwner';
import type { VoiceOutputOwner } from '@/src/features/voice/services/voiceOutput';
import { preparePlayback } from '@/src/features/voice/services/tts';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

jest.mock('@/services/api', () => ({ apiFetchBinary: jest.fn() }));
jest.mock('@/lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/src/features/voice/services/speechSettings', () => ({
  speechSettings: () => ({ rate: 1, pitch: 1, language: 'en-US' }),
}));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  isSpeakingAsync: jest.fn().mockResolvedValue(false),
  getAvailableVoicesAsync: jest.fn().mockResolvedValue([]),
}));

function Harness({
  scope = 'local',
  contextKey,
  onOwner,
}: {
  scope?: 'local' | 'cloud';
  contextKey: string;
  onOwner: (owner: VoiceOutputOwner | null) => void;
}) {
  const owner = useVoiceOutputOwner(scope, contextKey);
  useLayoutEffect(() => onOwner(owner), [onOwner, owner]);
  return null;
}

describe('speech owner source leases', () => {
  const speech = Speech.speak as jest.Mock;
  let latest: VoiceOutputOwner | null;
  const observe = (owner: VoiceOutputOwner | null) => {
    latest = owner;
  };
  const currentOwner = () => {
    if (!latest) throw new Error('Speech owner was not created');
    return latest;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    latest = null;
    speech.mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await latest?.dispose();
    await preparePlayback();
  });

  it('rejects a retained route owner without stopping replacement speech', async () => {
    const view = render(<Harness contextKey="route-a" onOwner={observe} />);
    const first = currentOwner();
    view.rerender(<Harness contextKey="route-b" onOwner={observe} />);
    const second = currentOwner();
    expect(second).not.toBe(first);
    const playing = second.start('Current route.');
    await waitFor(() => expect(speech).toHaveBeenCalledTimes(1));
    const stopped = Speech.stop as jest.Mock;
    const stopCount = stopped.mock.calls.length;

    await expect(first.start('Stale route.').done).resolves.toEqual({ status: 'stopped' });
    await first.dispose();
    expect(stopped).toHaveBeenCalledTimes(stopCount);
    expect(speech).toHaveBeenCalledTimes(1);
    speech.mock.calls[0][1].onDone();
    await expect(playing.done).resolves.toEqual({ status: 'done' });
  });

  it('does not revive an old owner after route A to B to A', async () => {
    const view = render(<Harness contextKey="route-a" onOwner={observe} />);
    const first = currentOwner();
    view.rerender(<Harness contextKey="route-b" onOwner={observe} />);
    view.rerender(<Harness contextKey="route-a" onOwner={observe} />);
    const restored = currentOwner();
    expect(restored).not.toBe(first);
    expect(restored.isCurrent()).toBe(true);
    await expect(first.start('Old render.').done).resolves.toEqual({ status: 'stopped' });
    expect(speech).not.toHaveBeenCalled();
  });

  it('creates a live owner after StrictMode setup replay and disposes the exact owner', async () => {
    const view = render(
      <StrictMode>
        <Harness contextKey="route-a" onOwner={observe} />
      </StrictMode>,
    );
    await waitFor(() => expect(currentOwner().isCurrent()).toBe(true));
    const owner = currentOwner();
    const playing = owner.start('StrictMode route.');
    await waitFor(() => expect(speech).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(owner.isCurrent()).toBe(false);
    await expect(playing.done).resolves.toEqual({ status: 'stopped' });
  });

  it('binds a Cloud owner to its original account epoch', async () => {
    activateCloudAccount('account-a');
    render(<Harness scope="cloud" contextKey="cloud-route" onOwner={observe} />);
    const first = currentOwner();
    await act(async () => {
      activateCloudAccount('account-b');
    });
    const second = currentOwner();
    expect(first.isCurrent()).toBe(false);
    expect(second).not.toBe(first);
    expect(second.source).toMatchObject({ scope: 'cloud', account: { ownerId: 'account-b' } });
    await expect(first.start('Account A text.').done).resolves.toEqual({ status: 'stopped' });
    expect(speech).not.toHaveBeenCalled();
  });

  it('keeps an unavailable Cloud source unavailable', async () => {
    render(<Harness scope="cloud" contextKey="cloud-route" onOwner={observe} />);
    const unavailable = currentOwner();
    expect(unavailable.source).toBeNull();
    await expect(unavailable.start('Private text.').done).resolves.toEqual({ status: 'stopped' });
    expect(speech).not.toHaveBeenCalled();
  });
});
