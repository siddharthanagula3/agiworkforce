import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SandboxedIframe } from './SandboxedIframe';

describe('SandboxedIframe', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves the dedicated sandbox origin for a verifiable postMessage handshake', () => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', 'https://sandbox.agiworkforce.com');

    render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<h1>Verified</h1>' }}
        fallbackSrcDoc="<!doctype html><h1>Fallback</h1>"
      />,
    );

    const iframe = screen.getByTitle('Artifact preview');
    expect(iframe).toHaveAttribute('src', 'https://sandbox.agiworkforce.com/');
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
    expect(iframe).not.toHaveAttribute('srcdoc');
  });

  it('keeps the same-origin srcDoc fallback on an opaque origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', '');

    render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<h1>Verified</h1>' }}
        fallbackSrcDoc="<!doctype html><h1>Fallback</h1>"
      />,
    );

    const iframe = screen.getByTitle('Artifact preview');
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-modals');
    expect(iframe).not.toHaveAttribute('sandbox', expect.stringContaining('allow-same-origin'));
  });

  it('ignores a render-error posted by any origin other than the sandbox', () => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', 'https://sandbox.agiworkforce.com');
    const onRenderError = vi.fn();

    render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<h1>Verified</h1>' }}
        fallbackSrcDoc="<!doctype html><h1>Fallback</h1>"
        onRenderError={onRenderError}
      />,
    );

    const forged = new MessageEvent('message', {
      data: { type: 'render-error', error: 'forged' },
      origin: 'https://evil.example',
    });
    window.dispatchEvent(forged);
    expect(onRenderError).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'render-error', error: 'genuine' },
        origin: 'https://sandbox.agiworkforce.com',
      }),
    );
    expect(onRenderError).toHaveBeenCalledWith('genuine');
  });

  it('refuses a sandbox origin that is the app’s own origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', window.location.origin);

    render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<h1>Verified</h1>' }}
        fallbackSrcDoc="<!doctype html><h1>Fallback</h1>"
      />,
    );

    const iframe = screen.getByTitle('Artifact preview');
    expect(iframe).not.toHaveAttribute('src');
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-modals');
  });
});
