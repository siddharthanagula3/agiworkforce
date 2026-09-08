import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SandboxedIframe } from './SandboxedIframe';

const SANDBOX_ORIGIN = 'https://sandbox.agiworkforce.com';
const SANDBOX_DOCUMENT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'infrastructure',
  'sandbox',
  'index.html',
);

function post(source: Window | null, origin: string, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', SANDBOX_ORIGIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * The sandbox document already refuses a message whose source is not its own
 * parent, and says why: any window that can reach a frame can post to it, so an
 * origin match alone lets a nested frame or an opener on that origin drive the
 * renderer. The parent's own listener had the mirror-image hole, while the
 * fallback listener a few lines below it checked source correctly.
 */
describe('SandboxedIframe trusts only its own frame', () => {
  it('ignores a render error from another window on the sandbox origin', async () => {
    const onRenderError = vi.fn();
    render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<p>hi</p>' }}
        fallbackSrcDoc="<!doctype html><h1>Fallback</h1>"
        onRenderError={onRenderError}
      />,
    );

    const impostor = { closed: false } as unknown as Window;
    post(impostor, SANDBOX_ORIGIN, { type: 'render-error', error: 'injected by another window' });

    await waitFor(() => expect(onRenderError).not.toHaveBeenCalled());
    expect(screen.queryByText(/injected by another window/)).toBeNull();
  });

  it('ignores a message from an origin that is not the configured sandbox', async () => {
    const onRenderError = vi.fn();
    const { container } = render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<p>hi</p>' }}
        fallbackSrcDoc="<!doctype html><h1>Fallback</h1>"
        onRenderError={onRenderError}
      />,
    );
    const frame = container.querySelector('iframe');

    post(frame?.contentWindow ?? null, 'https://evil.example.com', {
      type: 'render-error',
      error: 'wrong origin',
    });

    await waitFor(() => expect(onRenderError).not.toHaveBeenCalled());
  });

  it('accepts a render error from its own frame on the configured origin', async () => {
    const onRenderError = vi.fn();
    const { container } = render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<p>hi</p>' }}
        fallbackSrcDoc="<!doctype html><h1>Fallback</h1>"
        onRenderError={onRenderError}
      />,
    );
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();

    post(frame?.contentWindow ?? null, SANDBOX_ORIGIN, {
      type: 'render-error',
      error: 'real failure',
    });

    await waitFor(() => expect(onRenderError).toHaveBeenCalledWith('real failure'));
  });
});

/**
 * The sandbox document ships one set of bytes to every deployment, so the dev
 * parent origins in its allowlist are live in production too: a page a user is
 * running on their own localhost could drive the deployed renderer.
 */
describe('the sandbox document allowlist', () => {
  const source = readFileSync(SANDBOX_DOCUMENT, 'utf8');

  it('checks the message source, not the origin alone', () => {
    expect(source).toMatch(/event\.source !== window\.parent/);
  });

  it('admits a localhost parent only when it is itself served from localhost', () => {
    expect(source, 'a deployed sandbox must not accept a parent on the developer machine').toMatch(
      /isLocalHost|IS_LOCAL_SANDBOX|localhostParentsAllowed/,
    );
  });

  it('keeps the production parents unconditional', () => {
    expect(source).toContain('https://chat.agiworkforce.com');
    expect(source).toContain('https://agiworkforce.com');
  });
});
