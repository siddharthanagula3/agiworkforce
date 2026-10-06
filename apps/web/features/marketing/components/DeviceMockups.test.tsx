import { describe, expect, it } from 'vitest';
import { render, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PRIVACY_MODE_DISPLAY,
  PRIVACY_MODE_USAGE_IMPLICATION,
  TOOL_STATUS_PRESENTATION,
} from '@agiworkforce/types';
import { CLI_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import {
  ChromeWindow,
  DesktopWindow,
  DEVICE_GEOMETRY,
  EditorWindow,
  PhoneDevice,
  SidePanelCard,
  TerminalWindow,
  ToolRow,
  WebWindow,
  type DeviceType,
} from './DeviceMockups';
import { ProductFrame, type ProductFrameVariant } from './ProductFrame';
import { HeroAppWindow } from './HeroAppWindow';
import { ChromeMockup, MobileMockup, VSCodeMockup } from './SurfaceMockups';

const LOCAL_RUNTIME_LABEL = `${(CLI_LOCAL_RUNTIMES.names[0] ?? '').toLowerCase()}(local)`;

describe('terminal approval example', () => {
  it('includes an approval-pending edit in its initial server markup', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../../../apps/cli/src/features/exec/tools/file_ops/mod.rs'),
      'utf8',
    );
    expect(source).toContain('"Allow this edit?"');
    expect(source).toContain('vec![format!("- {}", old_preview), format!("+ {}", new_preview)]');
    expect(source).toContain('edit_args.insert("old_string".to_string(), "alpha".to_string())');
    expect(source).toContain('edit_args.insert("new_string".to_string(), "beta".to_string())');
    const documentFragment = document.createElement('div');
    documentFragment.innerHTML = renderToStaticMarkup(<TerminalWindow />);
    const text = documentFragment.textContent ?? '';
    expect(text).toContain(TOOL_STATUS_PRESENTATION['awaiting-approval'].label);
    expect(text).toContain('Allow this edit?');
    expect(text).toContain('- alpha');
    expect(text).toContain('+ beta');
    expect(documentFragment.querySelectorAll('button,a,input,[tabindex]')).toHaveLength(0);
    expect(documentFragment.querySelector('.agi-dev-body')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(['local', 'byok', 'managed'] as const)(
    'keeps the %s example free of invented usage, results and platform guarantees',
    (routeMode) => {
      const markup = document.createElement('div');
      markup.innerHTML = renderToStaticMarkup(<TerminalWindow routeMode={routeMode} />);
      const text = markup.textContent ?? '';
      expect(text).toContain(PRIVACY_MODE_DISPLAY[routeMode].label);
      expect(text).toContain(PRIVACY_MODE_USAGE_IMPLICATION[routeMode]);
      expect(text).not.toMatch(
        /\$\d|\d+(?:\.\d+)?k|ctx \d|\d+ (?:failed|passed)|effort:|seatbelt/i,
      );
      expect(text).not.toContain('sandboxed');
      expect(text).not.toContain('commit as fix(routing)');
    },
  );
});

function deviceRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('.agi-dev');
  expect(root).not.toBeNull();
  return root as HTMLElement;
}

function expectGeometry(root: HTMLElement, type: DeviceType) {
  const { width, height } = DEVICE_GEOMETRY[type];
  expect(root.dataset['device']).toBe(type);
  expect(root.dataset['geometry']).toBe(`${width}x${height}`);
  expect(root.style.getPropertyValue('--dev-w')).toBe(String(width));
  expect(root.style.getPropertyValue('--dev-h')).toBe(String(height));
  expect(root.className).toContain(`agi-dev--${type}`);
}

describe('DeviceMockups geometry contract', () => {
  const cases: Array<[DeviceType, () => React.ReactElement]> = [
    ['desktop', () => <DesktopWindow />],
    ['web', () => <WebWindow />],
    ['chrome', () => <ChromeWindow />],
    ['editor', () => <EditorWindow />],
    ['terminal', () => <TerminalWindow />],
    ['panel', () => <SidePanelCard />],
    ['phone', () => <PhoneDevice />],
  ];

  it.each(cases)('%s renders its canonical geometry', (type, make) => {
    const { container } = render(make());
    expectGeometry(deviceRoot(container), type);
  });

  it('every device type has device-true, non-degenerate proportions', () => {
    for (const [type, { width, height }] of Object.entries(DEVICE_GEOMETRY)) {
      const ratio = width / height;
      if (type === 'phone') {
        expect(height / width).toBeCloseTo(19.5 / 9, 3);
      } else if (type === 'panel') {
        expect(ratio).toBeLessThan(1);
      } else {
        expect(ratio).toBeGreaterThanOrEqual(4 / 3);
        expect(ratio).toBeLessThanOrEqual(16 / 9);
      }
    }
  });

  it.each(cases.filter(([type]) => type !== 'phone'))(
    '%s shares the window-chrome DNA (lights + badge)',
    (_type, make) => {
      const { container } = render(make());
      expect(container.querySelectorAll('.agi-dev-lights i')).toHaveLength(3);
      expect(container.querySelector('.agi-dev-badge')).not.toBeNull();
    },
  );
});

describe('ProductFrame façade', () => {
  const variants: Array<[ProductFrameVariant, DeviceType]> = [
    ['desktop', 'desktop'],
    ['web', 'web'],
    ['terminal', 'terminal'],
    ['phone', 'phone'],
    ['browser', 'panel'],
    ['editor', 'editor'],
  ];

  it.each(variants)('variant %s renders canonical device %s', (variant, type) => {
    const { container } = render(<ProductFrame variant={variant} title="T" badge="B" />);
    expectGeometry(deviceRoot(container), type);
  });

  it('renders a real screenshot inside the shared chrome when image is provided', () => {
    const { container } = render(
      <ProductFrame
        variant="terminal"
        title="agi · zsh"
        image={{ src: '/logo-512.png', width: 2940, height: 1414, alt: 'CLI' }}
      />,
    );
    const root = deviceRoot(container);
    expect(root.className).toContain('agi-dev--image');
    expect(container.querySelector('img.agi-dev-image')).not.toBeNull();
    expect(container.querySelector('.agi-dev-title')?.textContent).toBe('agi · zsh');
  });

  it('keeps trust-route copy consistent with BYOK terminal badges', () => {
    const terminal = render(
      <ProductFrame variant="terminal" title="agi · zsh" badge="BYOK" routeMode="byok" />,
    );
    expect(terminal.container.textContent).toContain(PRIVACY_MODE_DISPLAY.byok.label);
    expect(terminal.container.textContent).toContain(PRIVACY_MODE_USAGE_IMPLICATION.byok);
    expect(terminal.container.textContent).not.toContain(PRIVACY_MODE_USAGE_IMPLICATION.local);
    expect(terminal.container.textContent).not.toContain('local · on-device');
  });
});

describe('cloud-only surfaces never render a Local or BYOK route', () => {
  const forbidden = [
    'Served by Local',
    'Served by BYOK',
    LOCAL_RUNTIME_LABEL,
    'Local ∨',
    '◆ Local',
    'Auto · Local',
  ];
  const cloudSurfaces: Array<[string, () => React.ReactElement]> = [
    ['DesktopWindow', () => <DesktopWindow />],
    ['ProductFrame desktop', () => <ProductFrame variant="desktop" title="AGI Desktop" />],
    ['WebWindow', () => <WebWindow />],
    ['ChromeWindow', () => <ChromeWindow />],
    ['SidePanelCard', () => <SidePanelCard />],
  ];

  it.each(cloudSurfaces)('%s contains no Local or BYOK route text', (_name, make) => {
    const text = render(make()).container.textContent ?? '';
    for (const literal of forbidden) expect(text).not.toContain(literal);
  });

  it('desktop receipt and composer chip name the managed route', () => {
    const text = render(<DesktopWindow />).container.textContent ?? '';
    expect(text).toContain('Served by AGI Cloud · Auto route');
    expect(text).toContain('Auto · AGI Cloud');
    expect(render(<DesktopWindow />).container.querySelector('.agi-dev-badge')?.textContent).toBe(
      'Cloud',
    );
  });

  it('chrome panel pill and composer foot carry the managed label', () => {
    const chrome = render(<ChromeWindow />).container;
    expect(chrome.querySelector('.agi-cr-panel-mode')?.textContent).toBe(
      `◆ ${PRIVACY_MODE_DISPLAY.managed.label}`,
    );
    expect(chrome.querySelector('.agi-dev-panelcomposer-foot')?.textContent).toContain(
      PRIVACY_MODE_DISPLAY.managed.label,
    );
  });

  it('terminal and phone still show Local', () => {
    expect(render(<TerminalWindow />).container.textContent).toContain(
      PRIVACY_MODE_DISPLAY.local.label,
    );
    expect(render(<PhoneDevice />).container.textContent).toContain('Local');
  });

  it('rejects routeMode on non-terminal frames at the type level', () => {
    // @ts-expect-error routeMode is only valid for the terminal variant
    const frame = <ProductFrame variant="desktop" title="T" routeMode="local" />;
    expect(frame).toBeTruthy();
  });
});

describe('enforcement anchors for the cloud-only claim', () => {
  const root = resolve(__dirname, '../../../../..');
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

  it.each([
    ['apps/desktop/electron/config.ts', 'This shell has no Local mode'],
    ['apps/desktop/electron/runtime/dispatcher.ts', 'localModels: false'],
    [
      'apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts',
      'MANAGED_WEB_CLOUD_TRUST_MODE',
    ],
    ['apps/extension/src/background.ts', 'executeChromeManagedChat'],
  ])('%s still contains %s', (path, needle) => {
    expect(read(path)).toContain(needle);
  });
});

describe('one canonical look per surface, everywhere', () => {
  it('HeroAppWindow and ProductFrame web render identical markup', () => {
    const hero = render(<HeroAppWindow />).container.innerHTML;
    const frame = render(<ProductFrame variant="web" title="agiworkforce.com/chat" badge="Web" />)
      .container.innerHTML;
    expect(hero).toBe(frame);
  });

  it('MobileMockup and ProductFrame phone render the same full phone', () => {
    const mockup = render(<MobileMockup />);
    const frame = render(<ProductFrame variant="phone" title="AGI Mobile" badge="Local" />);
    for (const target of [mockup, frame]) {
      const html = target.container.innerHTML;
      expect(html).toContain('From your memory');
      expect(html).toContain('Message AGI…');
      expect(html).toContain('AGI Standard');
      expect(target.container.querySelector('[data-geometry="270x585"]')).not.toBeNull();
    }
  });

  it('landing SurfaceMockups map to canonical devices', () => {
    expectGeometry(deviceRoot(render(<ChromeMockup />).container), 'chrome');
    expectGeometry(deviceRoot(render(<VSCodeMockup />).container), 'editor');
    expectGeometry(deviceRoot(render(<MobileMockup />).container), 'phone');
  });
});

describe('previously clipped strings render in full', () => {
  it('Chrome side panel composer carries the full placeholder', () => {
    const { container } = render(<ChromeWindow />);
    const ghost = container.querySelector('.agi-dev-panelcomposer-ghost');
    expect(ghost?.textContent).toBe('Ask about this page…');
  });

  it('panel card and chrome window share the page-context strip and composer', () => {
    for (const el of [<SidePanelCard key="p" />, <ChromeWindow key="c" />]) {
      const { container } = render(el);
      expect(container.querySelector('.agi-dev-pagestrip-title')?.textContent).toBe(
        'Q3 Strategy Doc',
      );
      expect(container.querySelector('.agi-dev-pagestrip-meta')?.textContent).toBe(
        'docs.google.com',
      );
      expect(container.querySelector('.agi-dev-panelcomposer-foot')?.textContent).toContain(
        'Paired · Desktop bridge',
      );
    }
  });

  it('web window renders the full composer strings', () => {
    const { container } = render(<WebWindow />);
    const html = container.innerHTML;
    expect(html).toContain('Ask a follow-up…');
    expect(html).toContain('Searched the web');
    expect(html).toContain('Enter to send · Shift+Enter for newline');
    expect(html).not.toContain('128,000');
    expect(html).not.toContain('$0.00');
  });
});

describe('page-chat panel example', () => {
  it('keeps page chat separate from Desktop handoff and persistent browser grants', () => {
    const { container } = render(<SidePanelCard />);
    expect(container.textContent).toContain('Browser page added');
    expect(container.textContent).toContain('Page text included with your question');
    expect(container.textContent).not.toContain('sent to Desktop');
    expect(container.textContent).not.toContain('permissions scoped to this task');
    expect(container.textContent).not.toContain('words selected');
    expect(container.textContent).toContain(PRIVACY_MODE_DISPLAY.managed.label);
  });

  it('uses vector icons instead of unsupported page, completion and send glyphs', () => {
    const { container } = render(<SidePanelCard />);
    expect(container.textContent).not.toMatch(/[\u25a4\u2713\u27a4]/u);
    expect(container.querySelectorAll('svg[aria-label="Page context"]')).toHaveLength(2);
    expect(container.querySelector('svg[aria-label="Context attached"]')).not.toBeNull();
    expect(container.querySelector('svg[aria-label="Send message"]')).not.toBeNull();
    expect(container.querySelectorAll('button, input, textarea')).toHaveLength(0);
  });
});

describe('readable Web example', () => {
  it('replaces unsupported Web symbol glyphs with named or decorative SVG icons', () => {
    const { container, getByRole } = render(<WebWindow />);
    expect(container.textContent).not.toMatch(/[\u2318\u2713\u2315\u25a4\u25c7\u27a4\u25be]/u);
    expect(container.querySelectorAll('svg.agi-web-icon')).toHaveLength(7);
    for (const name of ['search', 'folder', 'library', 'chevron-down']) {
      const icon = container.querySelector(`svg.lucide-${name}`);
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveAttribute('focusable', 'false');
    }
    for (const name of ['Command', 'Completed', 'Send']) {
      const icon = getByRole('img', { name });
      expect(icon.tagName.toLowerCase()).toBe('svg');
      expect(icon).toHaveClass('agi-web-icon');
      expect(icon).toHaveAttribute('focusable', 'false');
      expect(icon).not.toHaveAttribute('aria-hidden', 'true');
    }
    expect(container.querySelector('.agi-desk-kbd')?.textContent).toBe('K');
    expect(container.querySelector('.agi-mk-chip--model')?.textContent).toBe('Auto ');
    expect(container.querySelector('.agi-mk-tool')).toHaveAttribute('data-state', 'done');
  });

  it.each([
    ['done', '\u2713'],
    ['wait', '\u25cf'],
  ] as const)('preserves the default %s tool illustration for other callers', (state, symbol) => {
    const { container } = render(<ToolRow state={state} label="Source label" meta="Source meta" />);
    expect(container.querySelector('i')?.textContent).toBe(symbol);
    expect(container.querySelector('.agi-mk-tool')?.textContent).toBe(
      `${symbol}Source labelSource meta`,
    );
    expect(container.querySelector('.agi-mk-tool')).toHaveAttribute('data-state', state);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('preserves the default desktop composer icon output', () => {
    const { container } = render(<DesktopWindow />);
    expect(container.querySelector('.agi-dev-send')?.textContent).toBe('\u27a4');
    expect(container.querySelector('.agi-mk-chip--model')?.textContent).toBe(
      'Auto · AGI Cloud \u25be',
    );
    expect(container.querySelector('.agi-mk-composer svg')).toBeNull();
    expect(container.querySelector('.agi-web-icon')).toBeNull();
  });

  it('keeps the comparison accessible in its own keyboard scroll region', () => {
    const { container, getByRole } = render(<WebWindow />);
    const region = getByRole('region', { name: 'Example comparison of EU AI Act duties' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region.closest('[aria-hidden="true"]')).toBeNull();
    const table = within(region).getByRole('table', { name: 'EU AI Act duties' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Duty', 'Provider', 'Deployer']);
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent),
        ),
    ).toEqual([
      ['Risk management', 'Required', 'Not required'],
      ['Human oversight', 'Design for it', 'Operate it'],
      ['Logging', 'Enable it', 'Keep six months'],
    ]);
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it('retains the sidebar, sources, receipt and illustrated composer without dead controls', () => {
    const { container, queryAllByRole } = render(<WebWindow className="owner-slot" />);
    const root = deviceRoot(container);
    expect(root).toHaveClass('agi-web-responsive', 'owner-slot');
    expectGeometry(root, 'web');
    expect(container.querySelector('.agi-web-navigation')?.textContent).toContain('+ New chat');
    expect(container.querySelector('.agi-web-navigation')?.textContent).toContain('Search');
    expect(container.querySelector('.agi-web-navigation')?.textContent).toContain('Projects');
    expect(container.querySelector('.agi-web-navigation')?.textContent).toContain('Library');
    expect(
      Array.from(container.querySelectorAll('.agi-web-recents p'), (item) => item.textContent),
    ).toEqual([
      'Recents',
      'EU AI Act duties',
      'Onboarding email draft',
      'Pricing page copy',
      'Retention query',
    ]);
    expect(container.querySelector('.agi-mk-chips')?.textContent).toBe(
      'eur-lex.europa.eudigital-strategy.ec.europa.eu+3 sources',
    );
    expect(container.querySelector('.agi-mk-receipt')?.textContent).toBe(
      'Served by AGI Cloud · Auto route · 3.1k in · 640 out · metered in credits · 6.2 s',
    );
    expect(container.querySelector('.agi-mk-composer')?.textContent).toContain('Ask a follow-up…');
    expect(container.querySelector('.agi-mk-composer')?.textContent).toContain('Chat');
    expect(container.querySelector('.agi-mk-composer')?.textContent).toContain('AGI Work');
    expect(container.querySelector('.agi-mk-composer')?.textContent).toContain('Auto');
    expect(queryAllByRole('button')).toHaveLength(0);
    expect(queryAllByRole('textbox')).toHaveLength(0);
  });

  it.each([
    ['desktop', <DesktopWindow key="desktop" />],
    ['chrome', <ChromeWindow key="chrome" />],
    ['editor', <EditorWindow key="editor" />],
    ['terminal', <TerminalWindow key="terminal" />],
    ['panel', <SidePanelCard key="panel" />],
    ['phone', <PhoneDevice key="phone" />],
  ] as const)('leaves the %s illustration outside the Web reflow scope', (_name, example) => {
    const { container } = render(example);
    expect(deviceRoot(container)).not.toHaveClass('agi-web-responsive');
    expect(container.querySelector('.agi-web-table-region')).toBeNull();
  });
});
