import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CameraCaptureDialog } from './CameraCaptureDialog';

/**
 * `getUserMedia` hands back a live stream with no UI of its own. The failure
 * this component exists to prevent is capturing a frame the user never saw —
 * camera light on, photo attached, no preview. These cover that, and the other
 * half of the same problem: a stream left running after the dialog closes.
 */

const stopTrack = vi.fn();
let getUserMedia: ReturnType<typeof vi.fn>;

function fakeStream() {
  return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
}

beforeEach(() => {
  stopTrack.mockClear();
  getUserMedia = vi.fn(async () => fakeStream());
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  // jsdom has no media pipeline; play() rejects without this.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CameraCaptureDialog — lifecycle', () => {
  it('requests no camera access while closed', () => {
    render(<CameraCaptureDialog open={false} onClose={vi.fn()} onCapture={vi.fn()} />);

    // Turning the camera on for a dialog nobody opened is the worst version of
    // this bug.
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks for video only — never the microphone', async () => {
    render(<CameraCaptureDialog open onClose={vi.fn()} onCapture={vi.fn()} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.anything() }),
    );
  });

  it('stops every track when it unmounts', async () => {
    const { unmount } = render(<CameraCaptureDialog open onClose={vi.fn()} onCapture={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    unmount();

    // A live track here leaves the camera light on after the dialog is gone.
    expect(stopTrack).toHaveBeenCalled();
  });

  it('stops a stream that arrives after it closed', async () => {
    let resolveStream: ((stream: MediaStream) => void) | undefined;
    getUserMedia.mockImplementation(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );

    const { unmount } = render(<CameraCaptureDialog open onClose={vi.fn()} onCapture={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    // The user dismissed the dialog while the permission prompt was still up.
    unmount();
    resolveStream?.(fakeStream());

    await waitFor(() => expect(stopTrack).toHaveBeenCalled());
  });
});

describe('CameraCaptureDialog — capture', () => {
  it('does not capture before the stream is ready', async () => {
    getUserMedia.mockImplementation(() => new Promise<MediaStream>(() => {}));
    const onCapture = vi.fn();
    render(<CameraCaptureDialog open onClose={vi.fn()} onCapture={onCapture} />);

    const button = await screen.findByRole('button', { name: /capture/i });

    expect(button).toBeDisabled();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it('explains a denied permission instead of failing silently', async () => {
    getUserMedia.mockRejectedValue(new Error('NotAllowedError'));
    render(<CameraCaptureDialog open onClose={vi.fn()} onCapture={vi.fn()} />);

    expect(await screen.findByText(/camera access was blocked/i)).toBeInTheDocument();
  });

  it('reports an unsupported browser rather than hanging on "waiting"', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });

    render(<CameraCaptureDialog open onClose={vi.fn()} onCapture={vi.fn()} />);

    expect(await screen.findByText(/does not provide camera access/i)).toBeInTheDocument();
  });
});

describe('CameraCaptureDialog — dismissal', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<CameraCaptureDialog open onClose={onClose} onCapture={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('closes from the Cancel button without capturing', async () => {
    const onClose = vi.fn();
    const onCapture = vi.fn();
    render(<CameraCaptureDialog open onClose={onClose} onCapture={onCapture} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();
  });
});
