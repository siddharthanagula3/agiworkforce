import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlCodePreview } from '../HtmlCodePreview';
import {
  ARTIFACT_CSP_CONTENT,
  configureArtifactSandboxOrigin,
} from '../../../lib/artifact-sandbox';
import { SCRIPTS_BLOCKED_NOTICE } from '../../../lib/artifact-preview-capability';

const probe = vi.hoisted(() => vi.fn<() => 'unknown' | 'allowed' | 'blocked'>());
type OriginalUseSameDocumentScriptSupportModule =
  typeof import('../../../hooks/useSameDocumentScriptSupport');

vi.mock('../../../hooks/useSameDocumentScriptSupport', async (original) => ({
  ...(await original<OriginalUseSameDocumentScriptSupportModule>()),
  useSameDocumentScriptSupport: () => probe(),
}));

const origin = 'https://artifact.test';
const code =
  '<input id="a"><button onclick="document.getElementById(\'out\').textContent = 5">Add</button><output id="out">Enter two numbers</output>';

beforeEach(() => {
  configureArtifactSandboxOrigin(null);
  probe.mockReset().mockReturnValue('blocked');
});
afterEach(() => {
  cleanup();
  configureArtifactSandboxOrigin(undefined);
  vi.useRealTimers();
});

function send(frame: HTMLIFrameElement, data: unknown) {
  fireEvent(window, new MessageEvent('message', { source: frame.contentWindow, origin, data }));
}

describe('HTML code preview capability', () => {
  it('uses the configured isolated frame without a parent-runtime or connector grant', () => {
    configureArtifactSandboxOrigin(origin);
    render(<HtmlCodePreview code={code} />);
    const frame = screen.getByTitle('HTML preview') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe(`${origin}/`);
    expect(frame.hasAttribute('srcdoc')).toBe(false);
    expect(probe).not.toHaveBeenCalled();
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    send(frame, { type: 'sandbox-ready' });
    expect(post).toHaveBeenCalledWith(
      { type: 'render', kind: 'html', html: code, runScripts: true },
      origin,
    );
    const count = post.mock.calls.length;
    send(frame, {
      type: 'runtime-request',
      id: 'runtime-1',
      request: { op: 'storage.list', prefix: null },
    });
    expect(post).toHaveBeenCalledTimes(count);
    send(frame, { type: 'render-complete' });
    expect(screen.queryByLabelText('Loading HTML preview')).toBeNull();
  });

  it('shows an honest source notice when scripts are blocked or support cannot be verified', () => {
    const view = render(<HtmlCodePreview code={code} />);
    expect(screen.getByRole('status').textContent).toBe(SCRIPTS_BLOCKED_NOTICE);
    expect(view.container.querySelector('iframe')).toBeNull();
    probe.mockReturnValue('unknown');
    view.rerender(<HtmlCodePreview code={code} />);
    expect(screen.getByRole('status').textContent).toContain('unavailable');
    expect(view.container.querySelector('iframe')).toBeNull();
  });

  it('uses only the opaque sandbox and canonical CSP after verifying same-document script support', () => {
    probe.mockReturnValue('allowed');
    render(<HtmlCodePreview code={code} />);
    const frame = screen.getByTitle('HTML preview');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain(ARTIFACT_CSP_CONTENT);
    expect(frame.getAttribute('srcdoc')).toContain(code);
    expect(frame.hasAttribute('src')).toBe(false);
  });

  it('preserves scriptless HTML as an inert static preview without probing script support', () => {
    render(<HtmlCodePreview code="<h2>Hello</h2><p>A static greeting.</p>" />);
    const frame = screen.getByTitle('HTML preview');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<h2>Hello</h2>');
    expect(screen.getByText('Static HTML preview')).toBeTruthy();
    expect(probe).not.toHaveBeenCalled();
  });

  it('keeps a failed sandbox handshake from exposing inert interactive controls', async () => {
    vi.useFakeTimers();
    configureArtifactSandboxOrigin(origin);
    const view = render(<HtmlCodePreview code={code} />);
    await act(async () => vi.advanceTimersByTime(3_001));
    expect(view.container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(SCRIPTS_BLOCKED_NOTICE);
    fireEvent.click(screen.getByRole('button', { name: 'Retry isolated preview' }));
    expect(screen.getByTitle('HTML preview').getAttribute('src')).toBe(`${origin}/`);
  });

  it('reports render failure without echoing untrusted error content and supports retry', () => {
    configureArtifactSandboxOrigin(origin);
    render(<HtmlCodePreview code={code} />);
    const first = screen.getByTitle('HTML preview') as HTMLIFrameElement;
    send(first, { type: 'render-error', error: '<script>secret source</script>' });
    expect(screen.queryByTitle('HTML preview')).toBeNull();
    expect(screen.getByRole('status').textContent).not.toContain('secret source');
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    expect(screen.getByTitle('HTML preview')).not.toBe(first);
  });
});
