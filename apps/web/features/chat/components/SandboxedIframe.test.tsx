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
});
