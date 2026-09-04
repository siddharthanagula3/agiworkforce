/**
 * artifact-preview-capability.test.ts, DES-C15.
 *
 * The probe is what stands between the user and a silently inert artifact
 * preview inside the packaged desktop app, so its failure modes matter as much
 * as its happy path: an inconclusive measurement must resolve `'unknown'` (which
 * every caller renders as "say nothing"), never `'blocked'`, or the app would
 * warn about a restriction that does not exist.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  probeSameDocumentScriptSupport,
  getSameDocumentScriptSupport,
  __resetSameDocumentScriptSupportCache,
  SCRIPTS_BLOCKED_NOTICE,
} from '../artifact-preview-capability';

function probeDocument(marked = true) {
  return {
    documentElement: {
      hasAttribute: (name: string) => marked && name === 'data-agi-artifact-probe',
    },
  };
}

function stubIframes(options: { flag?: unknown; contentWindow?: unknown; marked?: boolean }) {
  const created: HTMLIFrameElement[] = [];
  const realCreate = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    const element = realCreate(tagName);
    if (tagName !== 'iframe') return element;
    const frame = element as HTMLIFrameElement;
    created.push(frame);
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      get: () =>
        'contentWindow' in options
          ? options.contentWindow
          : {
              __agiArtifactInlineScriptProbe: options.flag,
              document: probeDocument(options.marked ?? true),
            },
    });
    Object.defineProperty(frame, 'srcdoc', {
      configurable: true,
      set: () => {
        queueMicrotask(() => frame.dispatchEvent(new Event('load')));
      },
      get: () => '',
    });
    return frame;
  }) as typeof document.createElement);
  return { created, restore: () => spy.mockRestore() };
}

afterEach(() => {
  vi.restoreAllMocks();
  __resetSameDocumentScriptSupportCache();
});

describe('probeSameDocumentScriptSupport', () => {
  it('reports allowed when the probe document ran its inline script', async () => {
    const stub = stubIframes({ flag: true });
    await expect(probeSameDocumentScriptSupport(document)).resolves.toBe('allowed');
    stub.restore();
  });

  it('reports blocked when the inherited CSP stopped the inline script', async () => {
    const stub = stubIframes({ flag: undefined });
    await expect(probeSameDocumentScriptSupport(document)).resolves.toBe('blocked');
    stub.restore();
  });

  it('reports unknown, never blocked, when the frame is unreadable', async () => {
    const stub = stubIframes({ contentWindow: null });
    await expect(probeSameDocumentScriptSupport(document)).resolves.toBe('unknown');
    stub.restore();
  });

  it('removes its probe frame from the document once it has an answer', async () => {
    const stub = stubIframes({ flag: true });
    await probeSameDocumentScriptSupport(document);
    expect(stub.created).toHaveLength(1);
    expect(stub.created[0]!.parentNode).toBeNull();
    stub.restore();
  });

  it('never runs model content: the probe frame carries only the fixed probe doc', async () => {
    const stub = stubIframes({ flag: true });
    await probeSameDocumentScriptSupport(document);
    expect(stub.created[0]!.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    stub.restore();
  });

  it('ignores an about:blank load instead of misreporting it as blocked', async () => {
    vi.useFakeTimers();
    const stub = stubIframes({ flag: undefined, marked: false });
    const pending = probeSameDocumentScriptSupport(document);
    await vi.advanceTimersByTimeAsync(2_500);
    await expect(pending).resolves.toBe('unknown');
    stub.restore();
    vi.useRealTimers();
  });

  it('navigates the probe frame before inserting it, and ships the marked probe document', async () => {
    const order: string[] = [];
    let assignedSrcdoc = '';
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = realCreate(tagName);
      if (tagName !== 'iframe') return element;
      Object.defineProperty(element, 'srcdoc', {
        configurable: true,
        set: (value: string) => {
          assignedSrcdoc = value;
          order.push('srcdoc');
        },
        get: () => assignedSrcdoc,
      });
      return element;
    }) as typeof document.createElement);
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(((node: Node) => {
      order.push('append');
      return node;
    }) as typeof document.body.appendChild);

    void probeSameDocumentScriptSupport(document);

    expect(order).toEqual(['srcdoc', 'append']);
    expect(assignedSrcdoc).toContain('data-agi-artifact-probe');
    expect(assignedSrcdoc).toContain('__agiArtifactInlineScriptProbe');
    appendSpy.mockRestore();
  });
});

describe('getSameDocumentScriptSupport', () => {
  it('measures once and shares the result across every preview', async () => {
    const stub = stubIframes({ flag: undefined });
    const [a, b] = await Promise.all([
      getSameDocumentScriptSupport(),
      getSameDocumentScriptSupport(),
    ]);
    expect(a).toBe('blocked');
    expect(b).toBe('blocked');
    expect(stub.created).toHaveLength(1);
    stub.restore();
  });
});

describe('SCRIPTS_BLOCKED_NOTICE', () => {
  it('names the cause so the user does not read it as a broken app', () => {
    expect(SCRIPTS_BLOCKED_NOTICE).toContain('security policy');
  });
});
