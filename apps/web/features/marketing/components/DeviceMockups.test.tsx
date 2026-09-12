import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChromeWindow,
  DesktopWindow,
  DEVICE_GEOMETRY,
  EditorWindow,
  PhoneDevice,
  SidePanelCard,
  TerminalWindow,
  WebWindow,
  type DeviceType,
} from './DeviceMockups';
import { ProductFrame, type ProductFrameVariant } from './ProductFrame';
import { HeroAppWindow } from './HeroAppWindow';
import { ChromeMockup, MobileMockup, VSCodeMockup } from './SurfaceMockups';

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

  it('keeps trust-route copy consistent with BYOK frame badges', () => {
    const desktop = render(
      <ProductFrame variant="desktop" title="AGI Desktop" badge="BYOK" routeMode="byok" />,
    );
    expect(desktop.container.textContent).toContain('Served by BYOK · your provider');
    expect(desktop.container.textContent).toContain('billed to your key');
    expect(desktop.container.textContent).not.toContain('Served by Local');

    const terminal = render(
      <ProductFrame variant="terminal" title="agi · zsh" badge="BYOK" routeMode="byok" />,
    );
    expect(terminal.container.textContent).toContain('BYOK · direct to your provider');
    expect(terminal.container.textContent).toContain('provider billed');
    expect(terminal.container.textContent).not.toContain('local · on-device');
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
        'docs.google.com · 4,200 words selected',
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
    expect(html).toContain('3,740 / 128,000');
  });
});
