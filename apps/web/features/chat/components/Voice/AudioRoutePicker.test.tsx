import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';

import { AudioRoutePicker } from './AudioRoutePicker';

const DEVICES = [
  { kind: 'audiooutput', deviceId: 'default', label: 'MacBook Pro Speakers' },
  { kind: 'audiooutput', deviceId: 'bt-1', label: 'AirPods Pro' },
  { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Microphone' },
];

let setSinkId: ReturnType<typeof vi.fn>;

function stubMediaDevices(devices: unknown[] = DEVICES) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: vi.fn(async () => devices),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

function renderPicker() {
  const audio = document.createElement('audio');
  const ref = createRef<HTMLAudioElement>();
  Object.defineProperty(ref, 'current', { value: audio, writable: true });
  render(<AudioRoutePicker audioRef={ref} />);
  return audio;
}

beforeEach(() => {
  setSinkId = vi.fn(async () => undefined);
  Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
    configurable: true,
    value: setSinkId,
  });
  stubMediaDevices();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AudioRoutePicker', () => {
  it('names the active output on the trigger once two outputs exist', async () => {
    renderPicker();

    expect(
      await screen.findByRole('button', { name: /audio output, macbook pro speakers/i }),
    ).toBeTruthy();
  });

  it('routes playback to the chosen device and marks it', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(await screen.findByTestId('voice-audio-route-trigger'));
    const airpods = await screen.findByRole('menuitemradio', { name: /airpods pro/i });
    await user.click(airpods);

    expect(setSinkId).toHaveBeenCalledWith('bt-1');
    await waitFor(() =>
      expect(screen.getByTestId('voice-audio-route-trigger').getAttribute('aria-label')).toContain(
        'AirPods Pro',
      ),
    );
  });

  it('keeps the old route when the browser refuses the switch', async () => {
    setSinkId.mockRejectedValueOnce(new Error('NotAllowedError'));
    const user = userEvent.setup();
    renderPicker();

    await user.click(await screen.findByTestId('voice-audio-route-trigger'));
    await user.click(await screen.findByRole('menuitemradio', { name: /airpods pro/i }));

    await waitFor(() =>
      expect(screen.getByTestId('voice-audio-route-trigger').getAttribute('aria-label')).toContain(
        'MacBook Pro Speakers',
      ),
    );
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    renderPicker();

    const trigger = await screen.findByTestId('voice-audio-route-trigger');
    await user.click(trigger);
    expect(screen.getByTestId('voice-audio-route-menu')).toBeTruthy();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('voice-audio-route-menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('renders nothing rather than a dead control when there is only one output', async () => {
    stubMediaDevices([DEVICES[0], DEVICES[2]]);
    const { container } = render(<AudioRoutePicker audioRef={createRef<HTMLAudioElement>()} />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders nothing where the browser cannot switch outputs at all', async () => {
    delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>)['setSinkId'];
    const { container } = render(<AudioRoutePicker audioRef={createRef<HTMLAudioElement>()} />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
