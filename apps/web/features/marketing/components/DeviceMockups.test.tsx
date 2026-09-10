import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChromeWindow,
  DesktopWindow,
  DEVICE_GEOMETRY,
  EditorWindow,
  ImageWindow,
  PhoneDevice,
  SidePanelCard,
  TerminalWindow,
  WebWindow,
  type DeviceType,
} from './DeviceMockups';

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

describe('device windows carry their frame contract', () => {
  it('renders a real screenshot inside the shared chrome when an image is provided', () => {
    const { container } = render(
      <ImageWindow
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
    const desktop = render(<DesktopWindow title="AGI Desktop" badge="BYOK" routeMode="byok" />);
    expect(desktop.container.textContent).toContain('Served by BYOK · your provider');
    expect(desktop.container.textContent).toContain('billed to your key');
    expect(desktop.container.textContent).not.toContain('Served by Local');

    const terminal = render(<TerminalWindow title="agi · zsh" badge="BYOK" routeMode="byok" />);
    expect(terminal.container.textContent).toContain('BYOK · direct to your provider');
    expect(terminal.container.textContent).toContain('provider billed');
    expect(terminal.container.textContent).not.toContain('local · on-device');
  });

  it('the phone renders its full composer and memory copy', () => {
    const { container } = render(<PhoneDevice label="AGI Mobile interface" />);
    const html = container.innerHTML;
    expect(html).toContain('From your memory');
    expect(html).toContain('Message AGI…');
    expect(html).toContain('AGI Standard');
    expect(container.querySelector('[data-geometry="270x585"]')).not.toBeNull();
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
