import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toolStatusPhrase } from '@agiworkforce/provider-protocol';
import { detectFileDiff, TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import { KIND_TO_BADGE } from '@agiworkforce/unified-chat';
import { AGI_WORK_LABEL } from '@/features/chat/lib/agi-work';
import { APP_NAV_DESTINATIONS } from '@/shared/components/layout/app-nav-items';
import { PREVIEW_GEOMETRY } from './AppPreviews';
import { AgentRunScenePreview, DiffScenePreview, ImageScenePreview } from './WorkScenePreviews';

const repoRoot = resolve(__dirname, '../../../../../..');
const previewDir = 'apps/web/features/marketing/components/app-preview';
const readSource = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');
const expectSource = (path: string, needles: readonly string[]) => {
  const source = readSource(path);
  for (const needle of needles)
    expect(source, `${path} should contain ${needle}`).toContain(needle);
};

const texts = (container: HTMLElement, selector: string) =>
  Array.from(container.querySelectorAll(selector), (node) => node.textContent);
const text = (container: HTMLElement, selector: string) =>
  container.querySelector(selector)?.textContent;

const chatScenes: Array<[string, (className?: string) => React.ReactElement]> = [
  ['work-run', (className) => <AgentRunScenePreview className={className} />],
  ['work-diff', (className) => <DiffScenePreview className={className} />],
];

const SCREENSHOT = {
  src: '/product/example-screen.png',
  width: 2240,
  height: 1400,
  alt: 'The chat screen with a reply open',
};

function draw(element: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

function sceneRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('figure.agi-app');
  if (!root) throw new Error('scene root not rendered');
  return root;
}

describe('the chat scenes are scaled, passive pictures of the web app', () => {
  it.each(chatScenes)('%s carries the web geometry, its scene name and a label', (scene, make) => {
    const root = sceneRoot(render(make('owner-slot')).container);
    const geometry = PREVIEW_GEOMETRY.web;
    expect(root).toHaveClass('agi-dev', 'agi-app--web', 'agi-work', 'owner-slot');
    expect(root).toHaveAttribute('data-device', 'web');
    expect(root).toHaveAttribute('data-scene', scene);
    expect(root).toHaveAttribute('data-geometry', `${geometry.width}x${geometry.height}`);
    expect(root.getAttribute('aria-label')).toMatch(/^Authored example of /u);
    expect(root.style.getPropertyValue('--app-w')).toBe(String(geometry.width));
    expect(root.style.getPropertyValue('--app-h')).toBe(String(geometry.height));
  });

  it.each(chatScenes)('%s exposes no control a visitor could try to use', (_scene, make) => {
    const { container } = render(make());
    expect(sceneRoot(container).firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(
      container.querySelectorAll(
        'button,a,input,textarea,select,[tabindex],[contenteditable],[role="button"]',
      ),
    ).toHaveLength(0);
  });

  it.each(chatScenes)('%s sits in a browser window on the chat address', (_scene, make) => {
    const { container } = render(make());
    expect(container.querySelectorAll('.agi-app-chrome .agi-app-lights i')).toHaveLength(3);
    expect(text(container, '.agi-app-url')).toBe('agiworkforce.com/chat');
  });

  it.each(chatScenes)('%s keeps the signed-in sidebar and the Auto picker', (_scene, make) => {
    const { container } = render(make());
    const destinations = APP_NAV_DESTINATIONS.filter(
      (item) => !item.adminOnly && !item.requiresHealthSpace && !item.feature,
    ).map((item) => item.label);
    expect(texts(container, '.agi-app-navrow')).toEqual(destinations);
    expect(texts(container, '.agi-app-navrow[data-active]')).toEqual([destinations[0]]);
    expect(container.querySelectorAll('.agi-app-session[data-active]')).toHaveLength(1);
    expect(texts(container, '.agi-app-seg span')).toEqual(['Chat', AGI_WORK_LABEL]);
    expect(texts(container, '.agi-app-model')).toEqual(['Auto']);
    expect(container.querySelector('.agi-app-model svg')).not.toBeNull();
  });

  it.each(chatScenes)('%s names no model, provider, plan, price or local route', (_scene, make) => {
    const { container } = render(make());
    expect(container.textContent).not.toMatch(
      /Best \(auto\)|Served by|GPT|Claude|Gemini|Sonnet|Opus|\$\d|\bPro\b|\bPlus\b|\bLocal\b|BYOK|Your key|Ollama/iu,
    );
  });
});

describe('the work stylesheet keeps to the web app palette and to scale', () => {
  const css = readSource(`${previewDir}/work-scene-preview.css`);
  const component = readSource(`${previewDir}/WorkScenePreviews.tsx`);
  const shared = [
    readSource(`${previewDir}/app-preview.css`),
    readSource(`${previewDir}/AppPreviews.tsx`),
  ].join('\n');
  const classNames = (source: string, prefix: string) =>
    new Set(
      Array.from(
        source.matchAll(new RegExp(`(?<![\\w-])(${prefix}-[a-z0-9-]+)`, 'gu')),
        (match) => match[1] ?? '',
      ),
    );

  it('uses only the web app tokens', () => {
    const allowed =
      /^--(?:u|app-w|corner-pill|font-geist-mono|chat-(?:bg|sidebar-bg|input-bg|surface-hover|border|border-strong|text-primary|text-secondary|text-muted|text-placeholder|user-bubble-bg|success|success-text|destructive|destructive-text|code-bg|code-syntax-[a-z]+))$/u;
    const used = new Set(Array.from(css.matchAll(/var\((--[a-z0-9-]+)/gu), (match) => match[1]));
    expect(used.size).toBeGreaterThan(8);
    for (const token of used) expect(token).toMatch(allowed);
  });

  it('paints no amber, accent or warning colour and no raw colour value', () => {
    expect(css).not.toMatch(/amber|brown|orange|yellow|warning|accent/iu);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });

  it('sizes everything from the design unit', () => {
    const lengths = Array.from(css.matchAll(/(?<![\w.-])(\d*\.?\d+)(px|rem|vw|vh|pt)\b/gu));
    expect(lengths.map((match) => match[0]).filter((length) => length !== '1px')).toEqual([]);
    expect(css).toContain('--u: calc(100cqw / var(--app-w));');
    expect(css).toContain('container-type: inline-size;');
    expect(css).not.toMatch(/@media|@container/u);
  });

  it('scopes every rule to the design root', () => {
    const selectors = Array.from(css.matchAll(/^([^\s@{}][^{}]*)\{/gmu), (match) =>
      (match[1] ?? '').trim(),
    );
    expect(selectors.length).toBeGreaterThan(40);
    for (const selector of selectors.flatMap((group) => group.split(',')))
      expect(selector.trim()).toMatch(/^\[data-design='agi'\] \.agi-(?:work|app)-?/u);
  });

  it('styles every class the scenes draw and draws every class it styles', () => {
    const styled = classNames(css, 'agi-work');
    const drawn = classNames(component, 'agi-work');
    expect([...drawn].filter((name) => !styled.has(name))).toEqual([]);
    expect([...styled].filter((name) => !drawn.has(name))).toEqual([]);
    const borrowed = [...classNames(css, 'agi-app'), ...classNames(component, 'agi-app')].filter(
      (name) => name !== 'agi-app--image',
    );
    expect(borrowed.length).toBeGreaterThan(10);
    for (const name of borrowed) expect(shared, `${name} is not a shared class`).toContain(name);
  });

  it('imports its icons from the one icon package and writes no comment', () => {
    expect(component).not.toMatch(/\/\/|\/\*/u);
    expect(css).not.toMatch(/\/\*/u);
    const iconModules = Array.from(
      component.matchAll(/from '([^']*(?:lucide|icons)[^']*)'/gu),
      (match) => match[1],
    );
    expect(iconModules).toEqual(['lucide-react']);
  });
});

describe('AGI Work run in the thread', () => {
  const container = draw(<AgentRunScenePreview />);
  const rows = Array.from(container.querySelectorAll('.agi-work-run-rows > *'));
  const tools = Array.from(container.querySelectorAll<HTMLElement>('.agi-work-tool'));

  it('opens on the task and the live elapsed line with no spinner', () => {
    expect(text(container, '.agi-app-user')).toBe('Summarize survey.csv as a one-page report.');
    expect(container.querySelector('.agi-work-run')).toHaveAttribute('data-status', 'running');
    expect(text(container, '.agi-work-run-summary')).toMatch(/^Working for \d+s$/u);
    expect(container.querySelectorAll('.agi-work-run-head svg')).toHaveLength(1);
  });

  it('puts the first plan step on the plan line and later steps in the rows', () => {
    expect(text(container, '.agi-work-run-plan')).toBe(
      'Read the survey export and list its questions.',
    );
    expect(texts(container, '.agi-work-step-text')).toEqual([
      '2. Count the answers to each question.',
      '3. Write a one-page summary report.',
    ]);
    expect(
      Array.from(container.querySelectorAll('.agi-work-step'), (node) =>
        node.getAttribute('data-status'),
      ),
    ).toEqual(['completed', 'running']);
    expect(container.querySelectorAll('.agi-work-step-mark svg')).toHaveLength(2);
  });

  it('lists the tool calls in order with one still running', () => {
    expect(rows.map((row) => row.className)).toEqual([
      'agi-work-tool',
      'agi-work-tool',
      'agi-work-step',
      'agi-work-tool',
      'agi-work-step',
      'agi-work-tool',
    ]);
    expect(tools.map((tool) => tool.getAttribute('data-tool'))).toEqual([
      'list_files',
      'read_file',
      'execute_code',
      'write_file',
    ]);
    expect(texts(container, '.agi-work-tool-name')).toEqual([
      'Listing files',
      'Reading file',
      'Running code',
      'Writing file',
    ]);
    expect(texts(container, '.agi-work-tool-badge')).toEqual(['F', 'F', '>', 'F']);
    expect(texts(container, '.agi-work-tool-status')).toEqual(['Running']);
    expect(
      Array.from(container.querySelectorAll('.agi-work-tool-bar'), (bar) =>
        bar.getAttribute('data-status'),
      ),
    ).toEqual([null, null, null, 'running']);
    expect(text(tools[3] as HTMLElement, '.agi-work-tool-status')).toBe('Running');
    expect(tools[3]?.querySelectorAll('.agi-work-tool-bar svg')).toHaveLength(2);
    for (const done of tools.slice(0, 3))
      expect(done.querySelectorAll('.agi-work-tool-bar svg')).toHaveLength(1);
    for (const elapsed of texts(container, '.agi-work-tool-time'))
      expect(elapsed).toMatch(/^(?:\d{1,3}ms|\d{1,2}\.\ds)$/u);
    expect(container.querySelector('.agi-work-tool-body')).toBeNull();
  });

  it('writes each row the way the product names that tool', () => {
    for (const tool of tools) {
      const name = tool.getAttribute('data-tool') ?? '';
      expect(text(tool, '.agi-work-tool-name')).toBe(toolStatusPhrase(name));
      const badge = name === 'execute_code' ? KIND_TO_BADGE.bash : KIND_TO_BADGE['fs-list'];
      expect(badge.kind === 'letter' ? badge.letter : null).toBe(
        text(tool, '.agi-work-tool-badge'),
      );
    }
  });

  it('holds the composer in AGI Work with Stop in the send slot', () => {
    const composer = container.querySelector('.agi-work-composer') as HTMLElement;
    expect(texts(composer, '.agi-app-seg span[data-on]')).toEqual([AGI_WORK_LABEL]);
    expect(text(composer, '.agi-app-placeholder')).toBe('Follow up');
    expect(composer.querySelector('.agi-app-send.agi-work-stop svg')).not.toBeNull();
    expect(texts(composer, '.agi-work-bar > span')).toEqual(['Project', 'Files', 'Connectors']);
    expect(composer.querySelectorAll('.agi-work-bar svg')).toHaveLength(3);
  });

  it('the run spine and the composer still ship what the scene shows', () => {
    expectSource('packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx', [
      "const AGI_WORK_RUNNING_PREFIX = 'Working for';",
      'return `${AGI_WORK_RUNNING_PREFIX} ${formatElapsedDuration(activity.startedAtMs, nowMs)}`;',
      'return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;',
      'if (spinnerless) return null;',
      'data-testid="agi-work-plan-sentence"',
      '<Clock3 className="h-3.5 w-3.5" aria-hidden="true" />',
      "case 'filesystem':\n      return 'fs-list';",
      "case 'code-execution':\n      return 'bash';",
      'name={traceRowName(entry)}',
      "startedAt={entry.status === 'running' ? entry.startedAtMs : undefined}",
      "isOpen && 'rotate-90',",
    ]);
    expectSource('packages/ui/unified-chat/src/components/InlineToolCall.tsx', [
      "return 'Running';",
      '<Loader2',
      '<ChevronRight',
    ]);
    expectSource('packages/ui/unified-chat/src/components/ToolCallCard.tsx', [
      'if (ms < 1000) return `${ms}ms`;',
      'if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;',
    ]);
    expectSource('apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts', [
      'summary: `${index + 1}. ${step.description}`,',
      'export const AGIWORK_PLAN_MIN_STEPS = 3;',
      "in_progress: 'running',",
    ]);
    expectSource('packages/ui/unified-chat/src/lib/agi-work-progress.ts', [
      "const sentence = first.summary.replace(PLAN_STEP_ORDINAL, '').trim();",
    ]);
    expectSource('apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts', [
      "if (toolName === 'execute_code') return 'code-execution';",
    ]);
    expectSource('apps/web/features/chat/components/Composer/ChatComposerNew.tsx', [
      "const TURN_ACTIVE_PLACEHOLDER = 'Follow up';",
      "agiwork: 'AGI Work',",
      "project: 'Project',",
      "files: 'Files',",
      "plugins: 'Connectors',",
      "const sendButtonMode = isTurnActive ? 'stop' : 'send';",
      "const workScopeBarVisible = canUseAgiWork && workMode === 'agiwork';",
      '<Folder className={WORK_BAR_GLYPH_CLASS} />',
      '<LibraryBig className={WORK_BAR_GLYPH_CLASS} />',
      '<PluginsGlyph className={WORK_BAR_GLYPH_CLASS} />',
      'rounded-b-2xl border border-t-0 border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)]',
    ]);
    expectSource('apps/web/features/chat/components/Composer/SendButton.tsx', [
      '<Square className="h-4 w-4" fill="currentColor" aria-hidden="true" />',
      'rounded-full bg-foreground text-background',
    ]);
    expectSource('apps/web/features/chat/lib/agi-work.ts', [
      "export const AGI_WORK_LABEL = 'AGI Work';",
    ]);
  });
});

describe('file edit waiting for approval', () => {
  const container = draw(<DiffScenePreview />);
  const request = {
    path: 'src/send.ts',
    old_text: '  const res = await fetchAll();\n  render(res);\n  return res.status;',
    new_text:
      '  const first = await fetchFirst();\n  render(first, { stream: true });\n  return first.status;',
  };
  const diff = detectFileDiff(request);

  it('opens the run on the decision it is holding', () => {
    expect(text(container, '.agi-app-user')).toBe(
      'Stream the first response instead of waiting for all of them.',
    );
    expect(container.querySelector('.agi-work-run')).toHaveAttribute(
      'data-status',
      'awaiting-approval',
    );
    expect(text(container, '.agi-work-run-summary')).toBe(
      'Needs approval · Review Edit File action',
    );
    expect(container.querySelectorAll('.agi-work-run-head svg')).toHaveLength(2);
    expect(container.querySelector('.agi-work-composer')).toBeNull();
    expect(texts(container, '.agi-app-seg span[data-on]')).toEqual(['Chat']);
  });

  it('shows the waiting tool row with the three decisions in order', () => {
    expect(container.querySelectorAll('.agi-work-tool')).toHaveLength(1);
    expect(container.querySelector('.agi-work-tool')).toHaveAttribute('data-tool', 'edit_file');
    expect(container.querySelector('.agi-work-tool-card')).toHaveAttribute('data-gated', 'true');
    expect(text(container, '.agi-work-tool-badge')).toBe('F');
    expect(text(container, '.agi-work-tool-name')).toBe('Review Edit File action');
    expect(text(container, '.agi-work-tool-time')).toBe('');
    expect(text(container, '.agi-work-tool-status')).toBe('Waiting for your approval');
    expect(text(container, '.agi-work-banner-text')).toBe(
      'This tool requires approval before execution.',
    );
    expect(texts(container, '.agi-work-btn')).toEqual([
      TOOL_APPROVAL_ACTION_LABELS.allow,
      TOOL_APPROVAL_ACTION_LABELS.allowForChat,
      TOOL_APPROVAL_ACTION_LABELS.deny,
    ]);
    expect(texts(container, '.agi-work-btn')).toEqual(['Allow', 'Allow for this chat', 'Deny']);
    expect(texts(container, '.agi-work-btn[data-ink]')).toEqual(['Allow']);
    expect(container.querySelector('.agi-work-btn[data-ink] svg')).not.toBeNull();
    expect(container.textContent).not.toMatch(/Approve|Reject/u);
  });

  it('draws the request as the diff the product derives from it', () => {
    expect(diff).not.toBeNull();
    expect(text(container, '.agi-work-label')).toBe('Request');
    expect(text(container, '.agi-work-diff-path')).toBe(diff?.filePath);
    expect(text(container, '.agi-work-diff-added')).toBe(`+${diff?.additions}`);
    expect(text(container, '.agi-work-diff-removed')).toBe(`-${diff?.deletions}`);
    expect(text(container, '.agi-work-diff-head')).toBe('src/send.ts+3-3');
    expect(
      Array.from(container.querySelectorAll('.agi-work-diff-line'), (line) => [
        line.getAttribute('data-diff'),
        line.querySelector('i')?.textContent,
        line.querySelector('span')?.textContent,
      ]),
    ).toEqual(
      diff?.lines.map((line) => [line.type, line.type === 'add' ? '+' : '-', line.content]),
    );
    expect(texts(container, ".agi-work-diff-line[data-diff='remove'] span")).toEqual(
      request.old_text.split('\n'),
    );
    expect(texts(container, ".agi-work-diff-line[data-diff='add'] span")).toEqual(
      request.new_text.split('\n'),
    );
  });

  it('the tool card still ships what the scene shows', () => {
    expectSource('packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx', [
      "return active ? `Needs approval · ${active}` : 'Needs approval';",
      'return <PauseCircle className="h-4 w-4" aria-hidden="true" />;',
      "case 'filesystem':\n      return 'fs-list';",
    ]);
    expectSource('apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts', [
      'return `Review ${humanizeIdentifier(toolName)} action`;',
      '.replace(/\\b\\w/g, (letter) => letter.toUpperCase());',
      "toolName === 'edit_file'",
    ]);
    expectSource('packages/ui/unified-chat/src/components/InlineToolCall.tsx', [
      "return 'Waiting for your approval';",
      '<PauseCircle',
      "'fs-list': { kind: 'letter', letter: 'F' },",
    ]);
    expectSource('packages/ui/unified-chat/src/components/ToolCallCard.tsx', [
      ": 'This tool requires approval before execution.'}",
      '<AlertCircle',
      '<Play className="h-2.5 w-2.5" />',
      '{TOOL_APPROVAL_ACTION_LABELS.allow}',
      '{TOOL_APPROVAL_ACTION_LABELS.allowForChat}',
      '{TOOL_APPROVAL_ACTION_LABELS.deny}',
      'Request\n            </p>',
      'const requestDiff = useMemo(() => (codeBlock ? null : detectFileDiff(args)), [codeBlock, args]);',
      '<FileDiffBlock {...requestDiff} />',
      'data-testid="tool-file-diff"',
      "{filePath ?? 'diff'}",
      '+{additions}</span>',
      '-{deletions}</span>',
      "{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}",
      "line.type === 'add' && 'bg-success-fill/10 text-success-text',",
      "line.type === 'remove' && 'bg-danger-fill/10 text-danger-text',",
    ]);
    expectSource('packages/contracts/types/src/tool-approval-policy.ts', [
      "allow: 'Allow',",
      "allowForChat: 'Allow for this chat',",
      "deny: 'Deny',",
    ]);
    expectSource('apps/web/lib/e2b/execution-tools.ts', [
      "export const EDIT_FILE_TOOL = 'edit_file';",
      "old_text: { type: 'string', description: 'Exact text to replace.' },",
      "new_text: { type: 'string', description: 'Replacement text.' },",
    ]);
    expectSource('packages/contracts/types/src/tool-request-diff.ts', [
      "const OLD_TEXT_KEYS = ['old_text', 'oldText', 'old_string', 'oldString', 'before'];",
    ]);
  });
});

describe('image in an app window', () => {
  it('frames the image it is given and keeps it readable to assistive technology', () => {
    const { container } = render(
      <ImageScenePreview title="AGI" image={SCREENSHOT} className="owner-slot" />,
    );
    const root = sceneRoot(container);
    expect(root).toHaveClass('agi-dev', 'agi-dev--image', 'agi-app--image', 'agi-work');
    expect(root).toHaveClass('owner-slot');
    expect(root).toHaveAttribute('data-device', 'image');
    expect(root).toHaveAttribute('data-scene', 'work-image');
    expect(root).toHaveAttribute('data-geometry', `${SCREENSHOT.width}x${SCREENSHOT.height}`);
    expect(root.style.getPropertyValue('--dev-w')).toBe(String(PREVIEW_GEOMETRY.web.frame));
    expect(root.style.getPropertyValue('--app-w')).toBe(String(PREVIEW_GEOMETRY.web.width));
    expect(root.firstElementChild).toHaveClass('agi-app-window', 'agi-work-imagewindow');
    expect(root.firstElementChild).not.toHaveAttribute('aria-hidden');

    const image = container.querySelector('img');
    expect(image).toHaveClass('agi-work-image');
    expect(image).toHaveAttribute('alt', SCREENSHOT.alt);
    expect(image).toHaveAttribute('width', String(SCREENSHOT.width));
    expect(image).toHaveAttribute('height', String(SCREENSHOT.height));
    expect(image).toHaveAttribute('sizes', '(min-width: 960px) 50vw, 100vw');
    expect(image?.closest('[aria-hidden="true"]')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('draws the real window bar around it, with the title and no badge by default', () => {
    const { container } = render(<ImageScenePreview title="AGI" image={SCREENSHOT} />);
    const bar = container.querySelector('.agi-app-titlebar') as HTMLElement;
    expect(bar).toHaveClass('agi-work-titlebar');
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar.querySelectorAll('.agi-app-lights i')).toHaveLength(3);
    expect(text(bar, '.agi-app-titletext')).toBe('AGI');
    expect(bar.querySelector('.agi-work-titlebadge')).toBeNull();
    expect(container.querySelector('.agi-dev-bar,.agi-dev-shell,.agi-dev-badge')).toBeNull();
    expect(
      container.querySelectorAll('button,a,input,textarea,select,[tabindex],[role="button"]'),
    ).toHaveLength(0);
  });

  it('shows the badge the caller passes and nothing of its own', () => {
    const { container } = render(
      <ImageScenePreview title="AGI Workforce" badge="Cloud" image={SCREENSHOT} />,
    );
    expect(text(container, '.agi-work-titlebadge')).toBe('Cloud');
    expect(container.querySelector('.agi-work-titlebadge')).toHaveClass('agi-app-pill');
    expect(sceneRoot(container).textContent).toBe('AGI WorkforceCloud');
  });
});
