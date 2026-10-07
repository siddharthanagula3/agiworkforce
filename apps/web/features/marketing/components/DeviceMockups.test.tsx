import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import { CLI_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import { APP_NAV_DESTINATIONS } from '@/shared/components/layout/app-nav-items';
import {
  ChromeWindow,
  DesktopWindow,
  EditorWindow,
  PhoneDevice,
  SidePanelCard,
  TerminalWindow,
  WebWindow,
} from './DeviceMockups';
import {
  DesktopAppPreview,
  PhoneAppPreview,
  PREVIEW_GEOMETRY,
  type PreviewKind,
} from './app-preview/AppPreviews';
import { ProductFrame, type ProductFrameVariant } from './ProductFrame';
import { HeroAppWindow } from './HeroAppWindow';
import { ChromeMockup, MobileMockup, VSCodeMockup } from './SurfaceMockups';

const repoRoot = resolve(__dirname, '../../../../..');
const readSource = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

const previews: Array<[PreviewKind, () => React.ReactElement]> = [
  ['desktop', () => <DesktopWindow />],
  ['web', () => <WebWindow />],
  ['chrome', () => <ChromeWindow />],
  ['panel', () => <SidePanelCard />],
  ['editor', () => <EditorWindow />],
  ['terminal', () => <TerminalWindow />],
  ['phone', () => <PhoneDevice />],
];

function previewRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('figure.agi-app');
  if (!root) throw new Error('preview root not rendered');
  return root;
}

describe('every device preview is a scaled, passive picture of the product', () => {
  it.each(previews)('%s carries its design geometry and a label', (kind, make) => {
    const root = previewRoot(render(make()).container);
    const geometry = PREVIEW_GEOMETRY[kind];
    expect(root).toHaveClass('agi-dev', `agi-dev--${kind}`, `agi-app--${kind}`);
    expect(root).toHaveAttribute('data-device', kind);
    expect(root).toHaveAttribute('data-geometry', `${geometry.width}x${geometry.height}`);
    expect(root.getAttribute('aria-label')).toMatch(/^Authored example of /u);
    expect(root.style.getPropertyValue('--dev-w')).toBe(String(geometry.frame));
    expect(root.style.getPropertyValue('--app-w')).toBe(String(geometry.width));
    expect(root.style.getPropertyValue('--app-h')).toBe(String(geometry.height));
  });

  it.each(previews)('%s exposes no control a visitor could try to use', (_kind, make) => {
    const { container } = render(make());
    const root = previewRoot(container);
    expect(root.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(
      container.querySelectorAll(
        'button,a,input,textarea,select,[tabindex],[contenteditable],[role="button"]',
      ),
    ).toHaveLength(0);
  });

  it('keeps every design frame non-degenerate and no wider than its design', () => {
    for (const geometry of Object.values(PREVIEW_GEOMETRY)) {
      expect(geometry.frame).toBeGreaterThan(0);
      expect(geometry.frame).toBeLessThanOrEqual(geometry.width);
      expect(geometry.height).toBeGreaterThan(0);
    }
  });

  it('owner-supplied class names reach the root', () => {
    for (const element of [
      <WebWindow key="w" className="owner-slot" />,
      <PhoneDevice key="p" className="owner-slot" />,
      <TerminalWindow key="t" className="owner-slot" />,
    ]) {
      expect(previewRoot(render(element).container)).toHaveClass('owner-slot');
    }
  });
});

describe('Web and Desktop share the real app shell', () => {
  const destinations = APP_NAV_DESTINATIONS.filter(
    (item) => !item.adminOnly && !item.requiresHealthSpace && !item.feature,
  ).map((item) => item.label);

  it.each([
    ['web', <WebWindow key="web" />],
    ['desktop', <DesktopWindow key="desktop" />],
  ] as const)('%s lists the navigation the signed-in app defines', (_name, element) => {
    const { container } = render(element);
    expect(destinations.length).toBeGreaterThan(3);
    expect(
      Array.from(container.querySelectorAll('.agi-app-navrow'), (row) => row.textContent),
    ).toEqual(destinations);
    expect(container.querySelector('.agi-app-wordmark')?.textContent).toBe('AGI Workforce');
    expect(container.querySelector('.agi-app-newchat')?.textContent).toBe('New Chat');
    expect(container.querySelectorAll('.agi-app-navrow[data-active]')).toHaveLength(1);
  });

  it.each([
    ['web', <WebWindow key="web" />],
    ['desktop', <DesktopWindow key="desktop" />],
  ] as const)('%s composer matches the real control order and wording', (_name, element) => {
    const { container } = render(element);
    const composer = container.querySelector('.agi-app-composer');
    expect(composer?.querySelector('.agi-app-placeholder')?.textContent).toBe(
      'Ask anything. Type / for commands',
    );
    expect(
      Array.from(composer?.querySelectorAll('.agi-app-seg span') ?? [], (item) => item.textContent),
    ).toEqual(['Chat', 'AGI Work']);
    expect(composer?.querySelector('.agi-app-style')?.textContent).toBe('Style');
    expect(composer?.querySelector('.agi-app-model')?.textContent).toBe('Auto');
    expect(composer?.querySelector('.agi-app-model svg')).not.toBeNull();
    expect(composer?.lastElementChild?.lastElementChild).toHaveClass('agi-app-send');
    expect(container.textContent).not.toMatch(/Enter to send|Best \(auto\)|Served by/u);
  });

  it('the real composer still carries the placeholder the preview shows', () => {
    expect(readSource('apps/web/features/chat/components/Composer/ChatComposerNew.tsx')).toContain(
      'Ask anything. Type / for commands',
    );
  });

  it('Web sits in a browser window and Desktop in a Mac window', () => {
    const web = render(<WebWindow />).container;
    const desktop = render(<DesktopWindow />).container;
    expect(web.querySelector('.agi-app-url')?.textContent).toBe('agiworkforce.com/chat');
    expect(desktop.querySelector('.agi-app-url')).toBeNull();
    expect(desktop.querySelector('.agi-app-side > .agi-app-lights')).not.toBeNull();
  });

  it('HeroAppWindow and ProductFrame web render identical markup', () => {
    const hero = render(<HeroAppWindow />).container.innerHTML;
    const frame = render(<ProductFrame variant="web" title="agiworkforce.com/chat" badge="Web" />)
      .container.innerHTML;
    expect(hero).toBe(frame);
  });
});

describe('cloud-only surfaces never show a Local or own-key route', () => {
  const cloudSurfaces: Array<[string, () => React.ReactElement]> = [
    ['DesktopWindow', () => <DesktopWindow />],
    ['ProductFrame desktop', () => <ProductFrame variant="desktop" title="AGI Desktop" />],
    ['WebWindow', () => <WebWindow />],
    ['ChromeWindow', () => <ChromeWindow />],
    ['SidePanelCard', () => <SidePanelCard />],
    ['EditorWindow', () => <EditorWindow />],
  ];

  it.each(cloudSurfaces)('%s contains no Local, BYOK or own-key wording', (_name, make) => {
    const text = render(make()).container.textContent ?? '';
    expect(text).not.toMatch(/\bLocal\b|BYOK|Your key|Ollama/u);
  });

  it('the Local and Cloud switch is drawn only when a caller asks for it', () => {
    expect(render(<DesktopWindow />).container.querySelector('.agi-app-modeswitch')).toBeNull();
    const withSwitch = render(<DesktopAppPreview modeSwitch />).container;
    expect(
      Array.from(withSwitch.querySelectorAll('.agi-app-modeswitch > span'), (item) => [
        item.textContent,
        item.hasAttribute('data-on'),
      ]),
    ).toEqual([
      ['Local', false],
      ['Cloud', true],
    ]);
  });

  it.each([
    ['apps/desktop/electron/config.ts', 'This shell has no Local mode'],
    ['apps/desktop/electron/runtime/dispatcher.ts', 'localModels: false'],
    [
      'apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts',
      'MANAGED_WEB_CLOUD_TRUST_MODE',
    ],
    ['apps/extension/src/background.ts', 'executeChromeManagedChat'],
  ])('%s still contains %s', (path, needle) => {
    expect(readSource(path)).toContain(needle);
  });

  it('rejects routeMode on non-terminal frames at the type level', () => {
    // @ts-expect-error routeMode is only valid for the terminal variant
    const frame = <ProductFrame variant="desktop" title="T" routeMode="local" />;
    expect(frame).toBeTruthy();
  });
});

describe('Chrome side panel', () => {
  const suggestions = [
    'Summarize this page',
    'Explain this page in simple terms',
    'Pull out the names, dates and numbers',
    'Translate this page',
  ];

  it.each([
    ['in the browser window', <ChromeWindow key="c" />],
    ['alone', <SidePanelCard key="p" />],
    ['through the landing facade', <ChromeMockup key="m" />],
  ] as const)('%s shows the real empty state and composer', (_name, element) => {
    const { container } = render(element);
    const panel = container.querySelector('.agi-app-panel');
    expect(panel?.querySelectorAll('.agi-app-panel-head svg')).toHaveLength(3);
    expect(
      Array.from(panel?.querySelectorAll('.agi-app-panel-suggestion') ?? [], (i) => i.textContent),
    ).toEqual(suggestions);
    expect(panel?.querySelector('.agi-app-panel-placeholder')?.textContent).toBe(
      'How can I help you today?',
    );
    expect(panel?.querySelector('.agi-app-panel-chip')?.textContent).toBe('Ask first');
    expect(panel?.querySelector('.agi-app-panel-model')?.textContent).toBe('Auto');
    expect(panel?.textContent).not.toMatch(/Managed Cloud|Paired|This page|\/tldr/u);
  });

  it('the extension still ships the strings the preview shows', () => {
    const messages = readSource('apps/extension/_locales/en/messages.json');
    for (const text of [...suggestions, 'How can I help you today?', 'Ask first'])
      expect(messages).toContain(text);
  });
});

describe('VS Code view', () => {
  it.each([
    ['direct', <EditorWindow key="e" />],
    ['through the landing facade', <VSCodeMockup key="m" />],
  ] as const)('%s shows the real header, approval card and composer', (_name, element) => {
    const { container } = render(element);
    expect(container.querySelector('.agi-app-view-title')?.textContent).toBe('AGI');
    expect(container.querySelector('.agi-app-view-head .agi-app-pill')?.textContent).toBe(
      'Managed',
    );
    expect(container.querySelector('.agi-app-approval-title')?.textContent).toBe('Approval needed');
    expect(
      Array.from(
        container.querySelectorAll('.agi-app-approval-actions span'),
        (i) => i.textContent,
      ),
    ).toEqual([
      'Review change',
      `${TOOL_APPROVAL_ACTION_LABELS.approve} once`,
      `${TOOL_APPROVAL_ACTION_LABELS.approve} for session`,
      TOOL_APPROVAL_ACTION_LABELS.deny,
    ]);
    expect(container.querySelector('.agi-app-view-placeholder')?.textContent).toBe(
      'Ask AGI to do anything…',
    );
    expect(container.querySelectorAll('.agi-app-code-row[data-change="add"]')).toHaveLength(2);
    expect(container.querySelectorAll('.agi-app-code-row[data-change="remove"]')).toHaveLength(1);
    expect(container.querySelector('.agi-app-diffstat')?.textContent).toBe('+2-1');
    expect(container.textContent).not.toMatch(/Accept|Reject/u);
  });

  it('the extension still ships the strings the preview shows', () => {
    const webview = readSource(
      'apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts',
    );
    for (const text of [
      'Approval needed',
      'Review change',
      "label: APPROVE_VERB + ' once'",
      "label: APPROVE_VERB + ' for session'",
      'label: DENY_VERB',
      'JSON.stringify(TOOL_APPROVAL_ACTION_LABELS.approve)',
      'Ask AGI to do anything…',
    ])
      expect(webview).toContain(text);
  });
});

describe('CLI terminal', () => {
  it.each([
    ['local', 'Local', true],
    ['byok', 'Your key', false],
    ['managed', 'Managed', false],
  ] as const)('%s sessions show the access label the CLI prints', (routeMode, label, local) => {
    const { container } = render(<TerminalWindow routeMode={routeMode} />);
    expect(container.querySelector('.agi-app-tui')).toHaveAttribute('data-access', routeMode);
    expect(container.querySelector('.agi-app-tui-status em')?.textContent).toBe(`◉ ${label}`);
    const head = container.querySelector('.agi-app-tui-head')?.textContent ?? '';
    const runtime = CLI_LOCAL_RUNTIMES.names[0] ?? '';
    expect(runtime).not.toBe('');
    expect(head.includes(runtime)).toBe(local);
  });

  it('shows the approval box with the choices the CLI offers', () => {
    const { container } = render(<TerminalWindow />);
    const box = container.querySelector('.agi-app-tui-box');
    expect(box).toHaveAttribute('data-title', 'Tool Approval');
    expect(box?.textContent).toContain('Allow write_file to modify:');
    expect(
      Array.from(box?.querySelectorAll('.agi-app-tui-choices span') ?? [], (i) => i.textContent),
    ).toEqual(['[ Yes ]', '[ No ]', '[ Allow Session ]', '[ Always Allow ]']);
    expect(box?.querySelectorAll('.agi-app-tui-choices span[data-on]')).toHaveLength(1);
  });

  it('the CLI still prints the strings the preview shows', () => {
    const overlay = readSource('apps/cli/src/tui/widgets/approval_overlay.rs');
    for (const text of [
      'Tool Approval',
      'Allow write_file to modify:',
      ' Allow Session ',
      ' Always Allow ',
    ])
      expect(overlay).toContain(text);
    expect(readSource('apps/cli/src/tui/tui_app.rs')).toContain(
      'Message AGI...  Enter sends · Ctrl-J newline · / commands · @ files',
    );
    const design = readSource('apps/cli/src/design_system.rs');
    for (const text of ['"Local"', '"Your key"', '"Managed"']) expect(design).toContain(text);
  });

  it('shows workspace changes the way the CLI workspace pane prints them', () => {
    const { container } = render(<TerminalWindow view="changes" />);
    const box = container.querySelector('.agi-app-tui-box');
    expect(box).toHaveAttribute('data-title', 'Workspace · changes since the last commit');
    expect(container.querySelector('.agi-app-tui-choices')).toBeNull();
    const lines = Array.from(box?.querySelectorAll(':scope > span') ?? []);
    expect(lines[0]?.textContent).toBe('Changes since the last commit (1 file changed, +2 -1):');
    expect(lines[1]?.textContent).toBe('  M  src/greet.ts  +2 -1');
    const added = lines.filter((line) => line.getAttribute('data-diff') === 'add');
    const removed = lines.filter((line) => line.getAttribute('data-diff') === 'remove');
    expect([added.length, removed.length]).toEqual([2, 1]);
    for (const line of added) expect(line.textContent?.startsWith('+')).toBe(true);
    for (const line of removed) expect(line.textContent?.startsWith('-')).toBe(true);
    expect(lines.find((line) => line.getAttribute('data-diff') === 'hunk')?.textContent).toBe(
      '@@ -1,3 +1,4 @@',
    );
  });

  it('the CLI still prints the workspace pane the way the preview draws it', () => {
    const tui = readSource('apps/cli/src/tui/tui_app.rs');
    expect(tui).toContain('" Workspace · changes since the last commit "');
    for (const prefix of [
      'starts_with("+++")',
      "starts_with('+')",
      "starts_with('-')",
      'starts_with("@@")',
    ])
      expect(tui).toContain(prefix);
    expect(readSource('apps/cli/src/platform/runtime/git.rs')).toContain(
      '"changes since the last commit"',
    );
    const model = readSource('apps/cli/src/diff_model.rs');
    expect(model).toContain('"{} file{} changed, +{} -{}"');
    expect(model).toContain('"{}  {}  +{} -{}{suffix}"');
    expect(model).toContain("FileChangeKind::Modified => 'M'");
  });

  it('every ProductFrame variant keeps the authored-example label', () => {
    for (const variant of ['desktop', 'web', 'browser', 'editor', 'terminal', 'phone'] as const) {
      const { container, unmount } = render(<ProductFrame variant={variant} title="AGI Mobile" />);
      expect(container.querySelector('figure')?.getAttribute('aria-label'), variant).toMatch(
        /^Authored example of /,
      );
      unmount();
    }
  });

  it('ProductFrame passes the terminal route through', () => {
    const terminal = render(<ProductFrame variant="terminal" title="agi" routeMode="byok" />);
    expect(terminal.container.textContent).toContain('Your key');
    expect(terminal.container.textContent).not.toContain('◉ Local');
  });
});

describe('Mobile', () => {
  it.each([
    ['direct', <PhoneDevice key="p" />],
    ['through the landing facade', <MobileMockup key="m" />],
    ['through ProductFrame', <ProductFrame key="f" variant="phone" title="AGI Mobile" />],
  ] as const)('%s shows the home screen only', (_name, element) => {
    const { container } = render(element);
    expect(container.querySelector('.agi-app-phone-title')?.textContent).toBe('AGI');
    expect(
      Array.from(container.querySelectorAll('.agi-app-phone-mode > span'), (item) => [
        item.textContent,
        item.hasAttribute('data-on'),
      ]),
    ).toEqual([
      ['Local', true],
      ['Cloud', false],
    ]);
    expect(container.querySelector('.agi-app-phone-heading')?.textContent).toBe(
      'How can I help you tonight?',
    );
    expect(container.querySelector('.agi-app-phone-placeholder')?.textContent).toBe(
      "What's on your mind?",
    );
    expect(container.querySelector('.agi-app-phone-model')?.textContent).toBe('Auto');
    expect(container.querySelector('.agi-app-drawer')).toBeNull();
    expect(container.textContent).not.toMatch(/No project|space|return/u);
  });

  it('draws the real drawer rows when the side panel is open', () => {
    const { container } = render(<PhoneAppPreview drawerOpen />);
    const drawer = container.querySelector('.agi-app-drawer');
    expect(drawer?.querySelector('.agi-app-drawer-brand')?.textContent).toBe('AGI');
    expect(drawer?.querySelectorAll('.agi-app-drawer-btn')).toHaveLength(3);
    const rows = Array.from(
      drawer?.querySelectorAll('.agi-app-drawer-row') ?? [],
      (row) => row.textContent,
    );
    expect(rows.slice(0, 4)).toEqual(['Chats', 'Projects', 'Library', 'Remote']);
    expect(rows.slice(-3)).toEqual(['Settings', 'Notifications', 'Help & About']);
    expect(rows).toContain('See all chats');
    expect(container.querySelector('.agi-app-phone-scrim')).not.toBeNull();
  });

  it('the mobile app still ships the strings the preview shows', () => {
    expect(readSource('apps/mobile/app/(app)/(tabs)/chat.tsx')).toContain(
      'How can I help you tonight?',
    );
    expect(readSource('apps/mobile/src/features/chat/components/ChatInput.tsx')).toContain(
      "What's on your mind?",
    );
  });
});

describe('ProductFrame facade', () => {
  const variants: Array<[ProductFrameVariant, PreviewKind]> = [
    ['desktop', 'desktop'],
    ['web', 'web'],
    ['terminal', 'terminal'],
    ['phone', 'phone'],
    ['browser', 'panel'],
    ['editor', 'editor'],
  ];

  it.each(variants)('variant %s renders the %s preview', (variant, kind) => {
    const { container } = render(<ProductFrame variant={variant} title="T" badge="B" />);
    expect(previewRoot(container)).toHaveAttribute('data-device', kind);
  });

  it('renders a real screenshot inside the shared chrome when image is provided', () => {
    const { container } = render(
      <ProductFrame
        variant="terminal"
        title="agi · zsh"
        image={{ src: '/logo-512.png', width: 2940, height: 1414, alt: 'CLI' }}
      />,
    );
    const figure = container.querySelector('figure.agi-dev.agi-app');
    expect(figure?.className).toContain('agi-dev--image');
    expect(figure?.getAttribute('data-geometry')).toBe('2940x1414');
    expect(container.querySelector('img.agi-work-image')?.getAttribute('alt')).toBe('CLI');
    expect(container.querySelector('.agi-app-titletext')?.textContent).toBe('agi · zsh');
    expect(container.querySelector('.agi-app-titlebar')?.getAttribute('aria-hidden')).toBe('true');
  });
});
