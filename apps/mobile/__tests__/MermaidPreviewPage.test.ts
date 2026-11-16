import vm from 'vm';
import {
  buildMermaidPreviewHtml,
  parseMermaidPreviewMessage,
} from '../src/features/chat/components/sandboxedArtifactHtml';

interface FakeSvg {
  attributes: Record<string, string>;
  style: { maxWidth: string };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

function fakeSvg(attributes: Record<string, string>, maxWidth = '512px'): FakeSvg {
  const svg: FakeSvg = {
    attributes: { ...attributes },
    style: { maxWidth },
    getAttribute: (name) => svg.attributes[name] ?? null,
    setAttribute: (name, value) => {
      svg.attributes[name] = value;
    },
  };
  return svg;
}

interface PageOptions {
  svg?: FakeSvg | null;
  rejectWith?: string;
  documentWidth?: number;
  clientWidth?: number;
  hostRight?: number;
  bodyHeight?: number;
  appearance?: { background: string; dark: boolean; fontScale?: number; fitToWidth?: boolean };
}

function pageScript(html: string): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
  return scripts[scripts.length - 1]!;
}

async function runPage(options: PageOptions = {}) {
  const svg =
    options.svg === undefined ? fakeSvg({ viewBox: '0 0 900.4 120', width: '100%' }) : options.svg;
  const posted: Array<Record<string, unknown>> = [];
  const listeners: Record<string, (event: unknown) => void> = {};
  const host = {
    innerHTML: '',
    textContent: '',
    getBoundingClientRect: () => ({ right: options.hostRight ?? 900 }),
    querySelector: () => svg,
  };
  const initialize = jest.fn();
  const html = buildMermaidPreviewHtml(
    'graph LR\n A-->B',
    'window.mermaid = {};',
    options.appearance,
  );
  const context = vm.createContext({
    window: {
      ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) },
    },
    document: {
      getElementById: () => host,
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listener;
      },
      documentElement: {
        scrollWidth: options.documentWidth ?? 912,
        clientWidth: options.clientWidth ?? 393,
      },
      body: { getBoundingClientRect: () => ({ height: options.bodyHeight ?? 144.2 }) },
    },
    XMLSerializer: class {
      serializeToString(element: FakeSvg) {
        const pad = element.attributes['pad'];
        return `<svg width="${element.attributes['width']}" height="${element.attributes['height']}" style="${element.style.maxWidth}"${pad ? ` pad="${pad}"` : ''}></svg>`;
      }
    },
    mermaid: {
      initialize,
      render: () =>
        options.rejectWith !== undefined
          ? Promise.reject(new Error(options.rejectWith))
          : Promise.resolve({ svg: '<svg></svg>' }),
    },
  });
  vm.runInContext(pageScript(html), context);
  await new Promise((resolve) => setImmediate(resolve));
  return { posted, listeners, host, svg, initialize, html };
}

describe('the mermaid preview page', () => {
  it('draws the diagram at its natural size and reports the size it drew', async () => {
    const { posted, svg } = await runPage();

    expect(svg?.attributes['width']).toBe('901');
    expect(svg?.attributes['height']).toBe('120');
    expect(svg?.style.maxWidth).toBe('');
    expect(posted).toEqual([
      {
        type: 'rendered',
        height: 145,
        width: 912,
        svg: '<svg width="901" height="120" style=""></svg>',
      },
    ]);
  });

  it('reports the width of the page when the drawing is wider than its frame', async () => {
    const { posted } = await runPage({ documentWidth: 1500, hostRight: 1488 });

    expect(posted[0]).toMatchObject({ type: 'rendered', width: 1500 });
  });

  it('fits a wide drawing to the screen width for the full-screen view and keeps its proportions', async () => {
    const { svg, posted } = await runPage({
      appearance: { background: '#fff', dark: false, fitToWidth: true },
      clientWidth: 393,
    });

    expect(svg?.attributes['width']).toBe('369');
    expect(svg?.attributes['height']).toBe('49');
    expect(posted[0]).toMatchObject({ svg: '<svg width="901" height="120" style=""></svg>' });
  });

  it('leaves a drawing narrower than the screen at its natural size when fitting', async () => {
    const { svg } = await runPage({
      appearance: { background: '#fff', dark: false, fitToWidth: true },
      svg: fakeSvg({ viewBox: '0 0 300 100', width: '100%' }),
    });

    expect(svg?.attributes['width']).toBe('300');
    expect(svg?.attributes['height']).toBe('100');
  });

  it('keeps a drawing that already has a pixel size', async () => {
    const { svg } = await runPage({
      svg: fakeSvg({ viewBox: '0 0 300 100', width: '300', height: '100' }, ''),
    });

    expect(svg?.attributes['width']).toBe('300');
  });

  it('configures labels as plain svg text so the drawing can be saved as a file', async () => {
    const { initialize } = await runPage({ appearance: { background: '#000', dark: true } });

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: 'strict',
        theme: 'dark',
        htmlLabels: false,
        flowchart: { htmlLabels: false, useMaxWidth: true },
        suppressErrorRendering: true,
      }),
    );
  });

  it.each([
    [1, undefined],
    [1.5, '24px'],
    [3.1, '50px'],
  ])('sizes diagram labels to the text size setting (scale %s)', async (fontScale, fontSize) => {
    const { initialize } = await runPage({
      appearance: { background: '#fff', dark: false, fontScale },
    });

    const config = initialize.mock.calls[0]![0] as { themeVariables?: { fontSize: string } };
    expect(config.themeVariables?.fontSize).toBe(fontSize);
  });

  it('refuses a diagram whose remote resource the policy blocked, once it has drawn', async () => {
    const { posted, listeners } = await runPage();

    listeners['securitypolicyviolation']?.({ blockedURI: 'https://tracker.example/pixel.png' });

    expect(posted.map((message) => message['type'])).toEqual(['rendered', 'failed']);
    expect(posted[1]).toEqual({ type: 'failed', reason: 'it loads content from another site' });
  });

  it('never reports a drawing the policy refused before the drawing finished', async () => {
    const posted: Array<Record<string, unknown>> = [];
    const listeners: Record<string, (event: unknown) => void> = {};
    const html = buildMermaidPreviewHtml('graph LR\n A-->B', 'window.mermaid = {};');
    let finish: (value: { svg: string }) => void = () => undefined;
    const host = {
      innerHTML: '',
      textContent: '',
      getBoundingClientRect: () => ({ right: 100 }),
      querySelector: () => null,
    };
    const context = vm.createContext({
      window: {
        ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) },
      },
      document: {
        getElementById: () => host,
        addEventListener: (type: string, listener: (event: unknown) => void) => {
          listeners[type] = listener;
        },
        documentElement: { scrollWidth: 100 },
        body: { getBoundingClientRect: () => ({ height: 50 }) },
      },
      XMLSerializer: class {
        serializeToString() {
          return '';
        }
      },
      mermaid: {
        initialize: () => undefined,
        render: () => new Promise((resolve) => (finish = resolve)),
      },
    });
    vm.runInContext(pageScript(html), context);

    listeners['securitypolicyviolation']?.({ blockedURI: 'http://cdn.example/icon.svg' });
    finish({ svg: '<svg></svg>' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(posted).toEqual([{ type: 'failed', reason: 'it loads content from another site' }]);
  });

  it('ignores a policy block that is not a remote resource', async () => {
    const { posted, listeners } = await runPage();

    listeners['securitypolicyviolation']?.({ blockedURI: 'inline' });
    listeners['securitypolicyviolation']?.({ blockedURI: 'eval' });
    listeners['securitypolicyviolation']?.({});

    expect(posted.map((message) => message['type'])).toEqual(['rendered']);
  });

  it('reports the first line of why mermaid could not draw it', async () => {
    const { posted, host } = await runPage({ rejectWith: 'Parse error on line 1' });

    expect(host.textContent).toBe('Could not render this diagram.');
    expect(posted).toEqual([{ type: 'failed', reason: 'Parse error on line 1' }]);
  });

  it('drops a drawing too large to send back but still reports its size', async () => {
    const huge = fakeSvg({ viewBox: '0 0 10 10', width: '100%', pad: 'x'.repeat(2_100_000) });

    const { posted } = await runPage({ svg: huge });

    expect(posted[0]).toMatchObject({ type: 'rendered', width: 912, svg: '' });
  });
});

describe('the mermaid preview message', () => {
  it('carries the drawn width and svg', () => {
    expect(
      parseMermaidPreviewMessage(
        JSON.stringify({ type: 'rendered', height: 145, width: 912, svg: '<svg></svg>' }),
      ),
    ).toEqual({ type: 'rendered', height: 145, width: 912, svg: '<svg></svg>' });
  });

  it('accepts a message from an older page that has no width or svg', () => {
    expect(parseMermaidPreviewMessage(JSON.stringify({ type: 'rendered', height: 80 }))).toEqual({
      type: 'rendered',
      height: 80,
      width: null,
      svg: null,
    });
  });

  it('drops a width that is not a positive number and an empty svg', () => {
    expect(
      parseMermaidPreviewMessage(
        JSON.stringify({ type: 'rendered', height: 80, width: -4, svg: '' }),
      ),
    ).toEqual({ type: 'rendered', height: 80, width: null, svg: null });
  });

  it('draws at natural size inside a page that scrolls sideways', () => {
    const html = buildMermaidPreviewHtml('graph LR\n A-->B', 'window.mermaid = {};');
    expect(html).toContain('overflow:auto');
    expect(html).toContain('width:max-content;min-width:100%');
    expect(html).toContain('max-width:none !important');
    expect(html).toContain('minimum-scale=1');
  });
});
