import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ARTIFACT_RENDER_FAILURE_MESSAGE, SandboxedIframe } from './SandboxedIframe';

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
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { container } = render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<h1>Verified</h1>' }}
        fallbackSrcDoc="<!doctype html><h1>Fallback</h1>"
        onRenderError={onRenderError}
      />,
    );
    // The source is what makes a message genuine, alongside the origin: the
    // listener now requires both, so these events carry the frame that a real
    // sandbox message would come from.
    const source = container.querySelector('iframe')?.contentWindow ?? null;

    const forged = new MessageEvent('message', {
      data: { type: 'render-error', error: 'forged' },
      origin: 'https://evil.example',
      source,
    });
    window.dispatchEvent(forged);
    expect(onRenderError).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'render-error', error: 'genuine' },
        origin: 'https://sandbox.agiworkforce.com',
        source,
      }),
    );
    expect(onRenderError).toHaveBeenCalledWith(ARTIFACT_RENDER_FAILURE_MESSAGE);
    expect(onRenderError).not.toHaveBeenCalledWith('genuine');
    expect(console.error).toHaveBeenCalledWith('[artifact-preview] render failed', 'genuine');
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

describe('SandboxedIframe element picker bridge', () => {
  const SANDBOX = 'https://sandbox.agiworkforce.com';
  const SELECTION = {
    selector: 'main > p',
    text: 'Hello',
    html: '<p>Hello</p>',
    rect: { x: 1, y: 2, width: 3, height: 4 },
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function mountPicker(active: boolean) {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', SANDBOX);
    const picker = {
      active,
      onSelect: vi.fn(),
      onCancel: vi.fn(),
      onUnavailable: vi.fn(),
    };
    const view = render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<p>Hello</p>' }}
        fallbackSrcDoc="<!doctype html><p>Fallback</p>"
        picker={picker}
      />,
    );
    const source = view.container.querySelector('iframe')?.contentWindow ?? null;
    const post = (data: unknown, origin = SANDBOX) =>
      window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
    return { picker, post, view };
  }

  it('forwards a selection the sandbox reports while selection mode is on', () => {
    const { picker, post } = mountPicker(true);

    post({ type: 'picker-selection', selection: SELECTION });

    expect(picker.onSelect).toHaveBeenCalledWith(SELECTION);
  });

  it('ignores a selection posted by any other origin', () => {
    const { picker, post } = mountPicker(true);

    post({ type: 'picker-selection', selection: SELECTION }, 'https://evil.example');

    expect(picker.onSelect).not.toHaveBeenCalled();
  });

  it('ignores a selection from a window that is not the sandbox frame', () => {
    const { picker } = mountPicker(true);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'picker-selection', selection: SELECTION },
        origin: SANDBOX,
        source: window,
      }),
    );

    expect(picker.onSelect).not.toHaveBeenCalled();
  });

  it('ignores selections and cancels while selection mode is off', () => {
    const { picker, post } = mountPicker(false);

    post({ type: 'picker-selection', selection: SELECTION });
    post({ type: 'picker-cancel' });

    expect(picker.onSelect).not.toHaveBeenCalled();
    expect(picker.onCancel).not.toHaveBeenCalled();
  });

  it('drops a selection whose shape is not what the sandbox sends', () => {
    const { picker, post } = mountPicker(true);

    post({ type: 'picker-selection', selection: { ...SELECTION, rect: 'big' } });
    post({ type: 'picker-selection', selection: { ...SELECTION, selector: 'a'.repeat(900) } });
    post({ type: 'picker-selection' });

    expect(picker.onSelect).not.toHaveBeenCalled();
  });

  it('passes a cancel from the sandbox on', () => {
    const { picker, post } = mountPicker(true);

    post({ type: 'picker-cancel' });

    expect(picker.onCancel).toHaveBeenCalledOnce();
  });

  it('says selection is unavailable when the sandbox is not in use', () => {
    vi.stubEnv('NEXT_PUBLIC_SANDBOX_ORIGIN', '');
    const onUnavailable = vi.fn();

    render(
      <SandboxedIframe
        title="Artifact preview"
        payload={{ type: 'render', kind: 'html', html: '<p>Hello</p>' }}
        fallbackSrcDoc="<!doctype html><p>Fallback</p>"
        picker={{ active: true, onSelect: vi.fn(), onCancel: vi.fn(), onUnavailable }}
      />,
    );

    expect(onUnavailable).toHaveBeenCalled();
  });

  it('keeps the frame sandbox attributes unchanged while selection mode is on', () => {
    const { view } = mountPicker(true);

    expect(view.container.querySelector('iframe')).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-same-origin',
    );
  });
});
