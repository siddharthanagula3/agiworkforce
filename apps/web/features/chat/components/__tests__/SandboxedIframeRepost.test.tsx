import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArtifactRenderPayload } from '@/lib/artifact-sandbox';

type ArtifactSandboxModule = typeof import('@/lib/artifact-sandbox');

const postRender = vi.hoisted(() => vi.fn());

vi.mock('@/lib/artifact-sandbox', async (importOriginal) => ({
  ...(await importOriginal<ArtifactSandboxModule>()),
  getSandboxOrigin: () => 'https://sandbox.example',
  isFromSandbox: () => true,
  postRenderToSandbox: postRender,
}));

import { SandboxedIframe } from '../SandboxedIframe';

const payloadOf = (html: string): ArtifactRenderPayload => ({ type: 'render', kind: 'html', html });

function announceReady(frame: HTMLIFrameElement) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'sandbox-ready' },
        origin: 'https://sandbox.example',
        source: frame.contentWindow,
      }),
    );
  });
}

describe('SandboxedIframe payload changes', () => {
  beforeEach(() => postRender.mockClear());

  it('re-posts the render payload when it changes after the sandbox connected', () => {
    const first = payloadOf('<p>v1</p>');
    const second = payloadOf('<p>v2</p>');
    const view = render(<SandboxedIframe payload={first} fallbackSrcDoc="" title="preview" />);
    const frame = view.getByTitle('preview') as HTMLIFrameElement;

    announceReady(frame);
    expect(postRender).toHaveBeenCalledTimes(1);
    expect(postRender.mock.calls[0]![1]).toEqual(first);

    view.rerender(<SandboxedIframe payload={second} fallbackSrcDoc="" title="preview" />);
    const replacement = view.getByTitle('preview') as HTMLIFrameElement;
    expect(replacement).not.toBe(frame);
    announceReady(replacement);
    expect(postRender).toHaveBeenCalledTimes(2);
    expect(postRender.mock.calls[1]![1]).toEqual(second);
  });

  it('does not post a changed payload before the sandbox has connected', () => {
    const view = render(
      <SandboxedIframe payload={payloadOf('<p>v1</p>')} fallbackSrcDoc="" title="preview" />,
    );
    view.rerender(
      <SandboxedIframe payload={payloadOf('<p>v2</p>')} fallbackSrcDoc="" title="preview" />,
    );
    expect(postRender).not.toHaveBeenCalled();
  });
});
