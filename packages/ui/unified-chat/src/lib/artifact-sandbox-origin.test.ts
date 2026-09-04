/**
 * artifact-sandbox-origin.test.ts, DES-C15, the origin half.
 *
 * The whole point of the artifact origin is that the preview document does NOT
 * inherit the app's Content-Security-Policy. That only holds if:
 *   - we resolve the right origin per platform (Tauri maps a custom scheme
 *     differently on Windows than on macOS/Linux),
 *   - we refuse origins that could not be an isolated renderer,
 *   - we authenticate the frame's messages before trusting them, and
 *   - we address the payload to that frame and nothing else.
 *
 * Each of those is asserted here against the real module, not a double.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ARTIFACT_SANDBOX_SCHEME,
  buildArtifactSandboxUrl,
  configureArtifactSandboxOrigin,
  getArtifactSandboxOrigin,
  isArtifactSandboxMessage,
  postRenderToArtifactSandbox,
  type ArtifactRenderPayload,
} from './artifact-sandbox';

type Mutable = Record<string, unknown>;

function installTauriInternals(osName: 'macos' | 'windows'): void {
  (globalThis as Mutable)['__TAURI_INTERNALS__'] = {
    convertFileSrc(filePath: string, protocol = 'asset') {
      const path = encodeURIComponent(filePath);
      return osName === 'windows'
        ? `http://${protocol}.localhost/${path}`
        : `${protocol}://localhost/${path}`;
    },
  };
}

afterEach(() => {
  configureArtifactSandboxOrigin(undefined);
  delete (globalThis as Mutable)['__TAURI_INTERNALS__'];
  delete (globalThis as Mutable)['__AGI_ARTIFACT_SANDBOX_ORIGIN__'];
  vi.restoreAllMocks();
});

describe('getArtifactSandboxOrigin', () => {
  it('is null with no host, so callers keep the srcDoc fallback', () => {
    expect(getArtifactSandboxOrigin()).toBeNull();
    expect(buildArtifactSandboxUrl()).toBeNull();
  });

  it('derives the macOS/Linux mapping from the Tauri runtime', () => {
    installTauriInternals('macos');
    expect(getArtifactSandboxOrigin()).toBe(`${ARTIFACT_SANDBOX_SCHEME}://localhost`);
    expect(buildArtifactSandboxUrl()).toBe(`${ARTIFACT_SANDBOX_SCHEME}://localhost/`);
  });

  it('derives the Windows mapping from the Tauri runtime', () => {
    installTauriInternals('windows');
    expect(getArtifactSandboxOrigin()).toBe(`http://${ARTIFACT_SANDBOX_SCHEME}.localhost`);
  });

  it('ignores a Tauri runtime that does not implement convertFileSrc', () => {
    (globalThis as Mutable)['__TAURI_INTERNALS__'] = {};
    expect(getArtifactSandboxOrigin()).toBeNull();
  });

  it('survives a convertFileSrc that throws', () => {
    (globalThis as Mutable)['__TAURI_INTERNALS__'] = {
      convertFileSrc() {
        throw new Error('no scheme registered');
      },
    };
    expect(getArtifactSandboxOrigin()).toBeNull();
  });

  it('prefers a host-injected origin over the Tauri mapping', () => {
    installTauriInternals('macos');
    (globalThis as Mutable)['__AGI_ARTIFACT_SANDBOX_ORIGIN__'] = 'https://sandbox.agiworkforce.com';
    expect(getArtifactSandboxOrigin()).toBe('https://sandbox.agiworkforce.com');
  });

  it('normalizes away trailing slashes and paths', () => {
    configureArtifactSandboxOrigin('https://sandbox.agiworkforce.com/');
    expect(getArtifactSandboxOrigin()).toBe('https://sandbox.agiworkforce.com');
  });

  it('rejects origins that could not be an isolated renderer', () => {
    for (const bad of [
      'http://evil.example.com', // plain http on a real host
      'javascript:alert(1)', // not an origin at all
      'file:///etc/passwd',
      'not a url',
      '',
      '   ',
    ]) {
      configureArtifactSandboxOrigin(bad);
      expect(getArtifactSandboxOrigin(), `${bad} must be rejected`).toBeNull();
    }
  });

  it('accepts loopback http for the dev server and the Windows mapping', () => {
    for (const good of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://x.localhost']) {
      configureArtifactSandboxOrigin(good);
      expect(getArtifactSandboxOrigin()).toBe(good);
    }
  });

  it('null disables the origin path even when a Tauri runtime is present', () => {
    installTauriInternals('macos');
    configureArtifactSandboxOrigin(null);
    expect(getArtifactSandboxOrigin()).toBeNull();
  });

  it('refuses an origin that is really this app’s own origin', () => {
    const here = window.location.origin;
    expect(here).not.toBe('null');
    configureArtifactSandboxOrigin(here);
    expect(getArtifactSandboxOrigin()).toBeNull();
  });
});

describe('isArtifactSandboxMessage', () => {
  const SANDBOX = 'https://sandbox.agiworkforce.com';

  function fakeFrame(contentWindow: unknown): HTMLIFrameElement {
    return { contentWindow } as unknown as HTMLIFrameElement;
  }

  function event(origin: string, source: unknown): MessageEvent {
    return { origin, source, data: { type: 'sandbox-ready' } } as unknown as MessageEvent;
  }

  it('accepts the frame we mounted, at the origin we expect', () => {
    configureArtifactSandboxOrigin(SANDBOX);
    const win = {};
    expect(isArtifactSandboxMessage(event(SANDBOX, win), fakeFrame(win))).toBe(true);
  });

  it('rejects a message from a different window at the right origin', () => {
    configureArtifactSandboxOrigin(SANDBOX);
    expect(isArtifactSandboxMessage(event(SANDBOX, {}), fakeFrame({}))).toBe(false);
  });

  it('rejects our frame once it is no longer on the sandbox origin', () => {
    configureArtifactSandboxOrigin(SANDBOX);
    const win = {};
    expect(isArtifactSandboxMessage(event('https://evil.example', win), fakeFrame(win))).toBe(
      false,
    );
  });

  it('accepts an opaque origin only together with the window match', () => {
    configureArtifactSandboxOrigin(SANDBOX);
    const win = {};
    expect(isArtifactSandboxMessage(event('null', win), fakeFrame(win))).toBe(true);
    expect(isArtifactSandboxMessage(event('null', {}), fakeFrame(win))).toBe(false);
  });

  it('rejects everything when no sandbox origin is configured', () => {
    const win = {};
    expect(isArtifactSandboxMessage(event(SANDBOX, win), fakeFrame(win))).toBe(false);
  });

  it('rejects a null frame', () => {
    configureArtifactSandboxOrigin(SANDBOX);
    expect(isArtifactSandboxMessage(event(SANDBOX, {}), null)).toBe(false);
  });
});

describe('postRenderToArtifactSandbox', () => {
  const SANDBOX = `${ARTIFACT_SANDBOX_SCHEME}://localhost`;
  const payload: ArtifactRenderPayload = {
    type: 'render',
    kind: 'html',
    html: '<p>hi</p>',
    runScripts: true,
  };

  function frameWithSpy() {
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;
    return { frame, postMessage };
  }

  it('addresses the payload to the origin the sandbox answered from', () => {
    configureArtifactSandboxOrigin(SANDBOX);
    const { frame, postMessage } = frameWithSpy();
    expect(postRenderToArtifactSandbox(frame, payload, SANDBOX)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(payload, SANDBOX);
  });

  it('falls back to "*" only for an opaque reply origin', () => {
    configureArtifactSandboxOrigin(SANDBOX);
    const { frame, postMessage } = frameWithSpy();
    postRenderToArtifactSandbox(frame, payload, 'null');
    expect(postMessage).toHaveBeenCalledWith(payload, '*');
  });

  it('does nothing when there is no sandbox origin', () => {
    const { frame, postMessage } = frameWithSpy();
    expect(postRenderToArtifactSandbox(frame, payload, SANDBOX)).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('does nothing when the frame has no content window', () => {
    configureArtifactSandboxOrigin(SANDBOX);
    const frame = { contentWindow: null } as unknown as HTMLIFrameElement;
    expect(postRenderToArtifactSandbox(frame, payload, SANDBOX)).toBe(false);
  });
});
