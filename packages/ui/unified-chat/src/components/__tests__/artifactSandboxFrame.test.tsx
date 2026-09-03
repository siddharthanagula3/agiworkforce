import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ArtifactSandboxFrame } from '../artifact-components/ArtifactSandboxFrame';
import {
  configureArtifactSandboxOrigin,
  type ArtifactRenderPayload,
} from '../../lib/artifact-sandbox';

const SANDBOX_ORIGIN = 'https://sandbox.agiworkforce.test';

const PAYLOAD: ArtifactRenderPayload = {
  type: 'render',
  kind: 'html',
  html: '<!DOCTYPE html><html><body><p id="target">not-yet-run</p></body></html>',
  runScripts: true,
};

const FALLBACK_SRCDOC = '<!DOCTYPE html><html><body><p>fallback</p></body></html>';

afterEach(() => {
  cleanup();
  configureArtifactSandboxOrigin(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderFrame(props: Partial<React.ComponentProps<typeof ArtifactSandboxFrame>> = {}) {
  return render(
    <ArtifactSandboxFrame
      payload={PAYLOAD}
      fallbackSrcDoc={FALLBACK_SRCDOC}
      fallbackSandbox="allow-scripts allow-modals"
      title="Artifact preview"
      data-testid="frame"
      {...props}
    />,
  );
}

function stubContentWindow(frame: HTMLIFrameElement) {
  const postMessage = vi.fn();
  const contentWindow = { postMessage } as unknown as Window;
  Object.defineProperty(frame, 'contentWindow', {
    configurable: true,
    get: () => contentWindow,
  });
  return { contentWindow, postMessage };
}

function dispatchFromSandbox(source: Window, data: unknown, origin = SANDBOX_ORIGIN) {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { configurable: true, get: () => source });
  act(() => {
    window.dispatchEvent(event);
  });
}

describe('ArtifactSandboxFrame without a sandbox origin', () => {
  it('renders the same-document fallback exactly as before', () => {
    renderFrame();
    const frame = screen.getByTestId('frame') as HTMLIFrameElement;

    expect(frame.getAttribute('srcdoc')).toBe(FALLBACK_SRCDOC);
    expect(frame.getAttribute('src')).toBeNull();
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-modals');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('never grants the fallback allow-same-origin', () => {
    renderFrame({ fallbackSandbox: 'allow-scripts' });
    expect(screen.getByTestId('frame').getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('hands the mounted element back through frameRef', () => {
    const frameRef: { current: HTMLIFrameElement | null } = { current: null };
    renderFrame({ frameRef });
    expect(frameRef.current).toBe(screen.getByTestId('frame'));
  });
});

describe('ArtifactSandboxFrame with a sandbox origin', () => {
  it('points the preview at the sandbox origin, not at a srcdoc', () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    renderFrame();
    const frame = screen.getByTestId('frame') as HTMLIFrameElement;

    expect(frame.getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);
    expect(frame.getAttribute('srcdoc')).toBeNull();
    expect(frame.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(frame.getAttribute('data-artifact-sandbox-origin')).toBe(SANDBOX_ORIGIN);
  });

  it('ships the artifact only after the renderer says it is ready', () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    renderFrame();
    const frame = screen.getByTestId('frame') as HTMLIFrameElement;
    const { contentWindow, postMessage } = stubContentWindow(frame);

    expect(postMessage).not.toHaveBeenCalled();

    dispatchFromSandbox(contentWindow, { type: 'sandbox-ready' });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(PAYLOAD, SANDBOX_ORIGIN);
  });

  it('ignores a ready message from a window that is not our frame', () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    renderFrame();
    const frame = screen.getByTestId('frame') as HTMLIFrameElement;
    const { postMessage } = stubContentWindow(frame);

    const impostor = { postMessage: vi.fn() } as unknown as Window;
    dispatchFromSandbox(impostor, { type: 'sandbox-ready' });

    expect(postMessage).not.toHaveBeenCalled();
  });

  it('re-ships the artifact when the content changes after the handshake', () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    const { rerender } = renderFrame();
    const frame = screen.getByTestId('frame') as HTMLIFrameElement;
    const { contentWindow, postMessage } = stubContentWindow(frame);

    dispatchFromSandbox(contentWindow, { type: 'sandbox-ready' });
    postMessage.mockClear();

    const edited: ArtifactRenderPayload = { ...PAYLOAD, html: '<p id="target">edited</p>' };
    rerender(
      <ArtifactSandboxFrame
        payload={edited}
        fallbackSrcDoc={FALLBACK_SRCDOC}
        fallbackSandbox="allow-scripts allow-modals"
        title="Artifact preview"
        data-testid="frame"
      />,
    );

    expect(postMessage).toHaveBeenCalledWith(edited, SANDBOX_ORIGIN);
  });

  it('reports the renderer’s own failures', () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    const onRenderError = vi.fn();
    const onRenderComplete = vi.fn();
    renderFrame({ onRenderError, onRenderComplete });
    const frame = screen.getByTestId('frame') as HTMLIFrameElement;
    const { contentWindow } = stubContentWindow(frame);

    dispatchFromSandbox(contentWindow, { type: 'sandbox-ready' });
    dispatchFromSandbox(contentWindow, { type: 'render-error', error: 'Babel threw' });

    expect(onRenderError).toHaveBeenCalledWith('Babel threw');
    expect(onRenderComplete).not.toHaveBeenCalled();
  });

  it('reports a successful render', () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    const onRenderComplete = vi.fn();
    renderFrame({ onRenderComplete });
    const frame = screen.getByTestId('frame') as HTMLIFrameElement;
    const { contentWindow } = stubContentWindow(frame);

    dispatchFromSandbox(contentWindow, { type: 'sandbox-ready' });
    dispatchFromSandbox(contentWindow, { type: 'render-complete', kind: 'html' });

    expect(onRenderComplete).toHaveBeenCalledTimes(1);
  });
});

describe('ArtifactSandboxFrame degradation', () => {
  it('falls back to srcDoc and tells the host when the handshake never happens', async () => {
    vi.useFakeTimers();
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    const onFallback = vi.fn();
    renderFrame({ onFallback });

    expect(screen.getByTestId('frame').getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });

    const frame = screen.getByTestId('frame') as HTMLIFrameElement;
    expect(frame.getAttribute('srcdoc')).toBe(FALLBACK_SRCDOC);
    expect(frame.getAttribute('src')).toBeNull();
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('does not degrade once the handshake completed', async () => {
    vi.useFakeTimers();
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    const onFallback = vi.fn();
    renderFrame({ onFallback });
    const frame = screen.getByTestId('frame') as HTMLIFrameElement;
    const { contentWindow } = stubContentWindow(frame);

    dispatchFromSandbox(contentWindow, { type: 'sandbox-ready' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(onFallback).not.toHaveBeenCalled();
    expect(screen.getByTestId('frame').getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);
  });

  it('degrades immediately when the frame reports a load error', async () => {
    configureArtifactSandboxOrigin(SANDBOX_ORIGIN);
    const onFallback = vi.fn();
    renderFrame({ onFallback });
    const frame = screen.getByTestId('frame') as HTMLIFrameElement;

    fireEvent.error(frame);

    await waitFor(() => {
      expect(onFallback).toHaveBeenCalledTimes(1);
    });
    expect((screen.getByTestId('frame') as HTMLIFrameElement).getAttribute('srcdoc')).toBe(
      FALLBACK_SRCDOC,
    );
  });
});
