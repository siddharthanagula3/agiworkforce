import { useLayoutEffect, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    await waitFor(() =>
      expect(onRenderError).toHaveBeenCalledWith(
        'The preview could not start. Review the source or try again.',
      ),
    );
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

describe('SandboxedIframe AI bridge origin checks', () => {
  it('ignores an AI request its own frame posts from an opaque origin', () => {
    const runtime = { handle: vi.fn(async () => 'answer') };
    const { container } = render(
      <SandboxedIframe
        title="Published app"
        payload={{ type: 'render', kind: 'html', html: '<h1>App</h1>' }}
        fallbackSrcDoc="<h1>App</h1>"
        runtime={runtime}
      />,
    );
    const frame = container.querySelector('iframe')!;

    act(() =>
      post(frame.contentWindow, 'null', {
        type: 'runtime-request',
        id: 'runtime-1',
        request: { op: 'complete', prompt: 'hello', connectors: [] },
      }),
    );

    expect(runtime.handle).not.toHaveBeenCalled();
  });

  it('never hands the srcDoc fallback an AI bridge', () => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', '');
    const runtime = { handle: vi.fn(async () => 'answer') };
    const { container } = render(
      <SandboxedIframe
        title="Published app"
        payload={{ type: 'render', kind: 'html', html: '<h1>App</h1>' }}
        fallbackSrcDoc="<h1>App</h1>"
        runtime={runtime}
      />,
    );
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('srcdoc')).not.toBeNull();

    act(() =>
      post(frame.contentWindow, 'null', {
        type: 'runtime-request',
        id: 'runtime-1',
        request: { op: 'complete', prompt: 'hello', connectors: [] },
      }),
    );

    expect(runtime.handle).not.toHaveBeenCalled();
  });
});

it('does not deliver a late runtime result into a frame showing replacement content', async () => {
  let finish!: (value: unknown) => void;
  const runtime = {
    handle: vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  };
  const { container, rerender } = render(
    <SandboxedIframe
      title="Owned app"
      payload={{ type: 'render', kind: 'html', html: '<h1>First</h1>' }}
      fallbackSrcDoc="<h1>First</h1>"
      runtime={runtime}
    />,
  );
  const frame = container.querySelector('iframe')!;
  const sent = vi.spyOn(frame.contentWindow!, 'postMessage');
  act(() =>
    post(frame.contentWindow, SANDBOX_ORIGIN, {
      type: 'runtime-request',
      id: 'runtime-1',
      request: { op: 'storage.get', key: 'counter', shared: false },
    }),
  );
  expect(runtime.handle).toHaveBeenCalledOnce();
  rerender(
    <SandboxedIframe
      title="Owned app"
      payload={{ type: 'render', kind: 'html', html: '<h1>Replacement</h1>' }}
      fallbackSrcDoc="<h1>Replacement</h1>"
      runtime={runtime}
    />,
  );
  await act(async () => {
    finish('private old result');
    await Promise.resolve();
  });
  expect(sent.mock.calls.some(([message]) => message?.type === 'runtime-response')).toBe(false);
});

it('keeps a working sandbox when onLoad is acknowledged after its early ready event was missed', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(
      <SandboxedIframe
        title="Fast sandbox"
        payload={{ type: 'render', kind: 'html', html: '<p>Live</p>' }}
        fallbackSrcDoc="<p>Fallback</p>"
      />,
    );
    const frame = container.querySelector('iframe')!;
    act(() => post(frame.contentWindow, SANDBOX_ORIGIN, { type: 'render-complete', kind: 'html' }));
    act(() => vi.advanceTimersByTime(4_000));
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);
  } finally {
    vi.useRealTimers();
  }
});

it('does not let another frame acknowledge a missed sandbox handshake', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(
      <SandboxedIframe
        title="Owned sandbox"
        payload={{ type: 'render', kind: 'html', html: '<p>Live</p>' }}
        fallbackSrcDoc="<p>Fallback</p>"
      />,
    );
    fireEvent.load(container.querySelector('iframe')!);
    act(() =>
      post({ closed: false } as Window, SANDBOX_ORIGIN, { type: 'render-complete', kind: 'html' }),
    );
    act(() => vi.advanceTimersByTime(4_000));
    expect(container.querySelector('iframe')?.hasAttribute('srcdoc')).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it('subscribes before a fast mounted frame announces readiness', () => {
  vi.useFakeTimers();
  function ReadyAtCommit({ children }: { children: ReactNode }) {
    useLayoutEffect(() => {
      const frame = document.querySelector(
        'iframe[title="Commit-ready sandbox"]',
      ) as HTMLIFrameElement;
      post(frame.contentWindow, SANDBOX_ORIGIN, { type: 'sandbox-ready' });
    }, []);
    return children;
  }
  try {
    const { container } = render(
      <SandboxedIframe
        title="Commit-ready sandbox"
        payload={{ type: 'render', kind: 'html', html: '<p>Live</p>' }}
        fallbackSrcDoc="<p>Fallback</p>"
      />,
      { wrapper: ReadyAtCommit },
    );
    act(() => vi.advanceTimersByTime(4_000));
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);
  } finally {
    vi.useRealTimers();
  }
});

it('lets a cold document navigate before starting the short handshake deadline', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(
      <SandboxedIframe
        title="Cold sandbox"
        payload={{ type: 'render', kind: 'html', html: '<p>Live</p>' }}
        fallbackSrcDoc="<p>Fallback</p>"
      />,
    );
    act(() => vi.advanceTimersByTime(4_000));
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);
    fireEvent.load(frame);
    act(() => post(frame.contentWindow, SANDBOX_ORIGIN, { type: 'render-complete', kind: 'html' }));
    act(() => vi.advanceTimersByTime(4_000));
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(`${SANDBOX_ORIGIN}/`);
  } finally {
    vi.useRealTimers();
  }
});

it('still bounds a document that never loads or answers', () => {
  vi.useFakeTimers();
  try {
    const { container } = render(
      <SandboxedIframe
        title="Unreachable sandbox"
        payload={{ type: 'render', kind: 'html', html: '<p>Live</p>' }}
        fallbackSrcDoc="<p>Fallback</p>"
      />,
    );
    act(() => vi.advanceTimersByTime(16_000));
    expect(container.querySelector('iframe')?.hasAttribute('srcdoc')).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it('does not start a sandbox document before client hydration owns its handlers', () => {
  const html = renderToString(
    <SandboxedIframe
      title="Server preview"
      payload={{ type: 'render', kind: 'html', html: '<p>Owned</p>' }}
      fallbackSrcDoc="<p>Fallback</p>"
    />,
  );
  expect(html).not.toContain('<iframe');
  expect(html).toContain('Loading preview');
});

it('retires the previous execution realm before a replacement runtime can receive requests', () => {
  const first = { handle: vi.fn(async () => 'old') };
  const second = { handle: vi.fn(async () => 'new') };
  const payload = { type: 'render', kind: 'html', html: '<p>Owned</p>' } as const;
  const view = render(
    <SandboxedIframe title="Owned scope" payload={payload} fallbackSrcDoc="" runtime={first} />,
  );
  const oldSource = view.container.querySelector('iframe')!.contentWindow;
  view.rerender(
    <SandboxedIframe title="Owned scope" payload={payload} fallbackSrcDoc="" runtime={second} />,
  );
  const newSource = view.container.querySelector('iframe')!.contentWindow;
  expect(newSource).not.toBe(oldSource);
  act(() =>
    post(oldSource, SANDBOX_ORIGIN, {
      type: 'runtime-request',
      id: 'runtime-1',
      request: { op: 'storage.get', key: 'counter', shared: false },
    }),
  );
  expect(second.handle).not.toHaveBeenCalled();
});
