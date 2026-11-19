import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VoiceSampleButton } from './VoiceSampleButton';

class FakeAudio {
  static instances: FakeAudio[] = [];
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  private settle: { resolve: () => void; reject: (reason: Error) => void } | null = null;

  constructor(readonly src: string) {
    FakeAudio.instances.push(this);
  }

  play() {
    return new Promise<void>((resolve, reject) => {
      this.settle = { resolve, reject };
    });
  }

  resolvePlay() {
    this.settle?.resolve();
  }

  rejectPlay() {
    this.settle?.reject(new Error('aborted'));
  }
}

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ samples: { 'voice-a': 'a.mp3', 'voice-b': 'b.mp3' } }),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderButton(voiceUri: string, voiceName: string) {
  const view = render(<VoiceSampleButton voiceUri={voiceUri} voiceName={voiceName} />);
  await screen.findByTestId('voice-sample-toggle');
  return view;
}

describe('VoiceSampleButton', () => {
  it('ignores a rejected play from a retired voice after the selection changes', async () => {
    const user = userEvent.setup();
    const view = await renderButton('voice-a', 'Alpha');
    await user.click(screen.getByTestId('voice-sample-toggle'));
    const retired = FakeAudio.instances[0]!;

    view.rerender(<VoiceSampleButton voiceUri="voice-b" voiceName="Beta" />);
    await waitFor(() =>
      expect(screen.getByTestId('voice-sample-toggle').getAttribute('aria-label')).toBe(
        'Play a sample of Beta',
      ),
    );
    expect(retired.pause).toHaveBeenCalled();

    await act(async () => {
      retired.rejectPlay();
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('voice-sample-toggle').getAttribute('aria-busy')).toBe('false');
  });

  it('ignores a late error event from a retired voice while the new sample starts', async () => {
    const user = userEvent.setup();
    const view = await renderButton('voice-a', 'Alpha');
    await user.click(screen.getByTestId('voice-sample-toggle'));
    const retired = FakeAudio.instances[0]!;
    const lateError = retired.onerror;

    view.rerender(<VoiceSampleButton voiceUri="voice-b" voiceName="Beta" />);
    await waitFor(() =>
      expect(screen.getByTestId('voice-sample-toggle').getAttribute('aria-label')).toBe(
        'Play a sample of Beta',
      ),
    );
    await user.click(screen.getByTestId('voice-sample-toggle'));
    const current = FakeAudio.instances[1]!;
    await act(async () => {
      current.resolvePlay();
    });
    expect(screen.getByTestId('voice-sample-toggle').getAttribute('aria-pressed')).toBe('true');

    act(() => {
      lateError?.();
      retired.onended?.();
    });

    expect(screen.getByTestId('voice-sample-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('still reports a failure of the current sample', async () => {
    const user = userEvent.setup();
    await renderButton('voice-a', 'Alpha');
    await user.click(screen.getByTestId('voice-sample-toggle'));

    await act(async () => {
      FakeAudio.instances[0]!.rejectPlay();
    });

    expect(screen.getByRole('status').textContent).toBe(
      'The sample could not play. Try again later.',
    );
  });
});
