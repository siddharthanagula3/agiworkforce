import assert from 'node:assert/strict';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  artifactInclusionForPolicy,
  createArtifactStore,
  deriveArtifacts,
  EXPLICIT_ARTIFACT_DERIVATION_POLICY,
} from '@agiworkforce/artifacts';
import {
  ManagedCloudProjectUpdateRequestSchema,
  managedCloudProjectPath,
} from '@agiworkforce/cloud-contracts';
import {
  DEFAULT_RESEARCH_DELIVERABLE,
  getToolDisplayLabel,
  interactionMode,
  MANAGED_MEMORY_MAX_CONTENT_CHARS,
  MANAGED_MEMORY_MAX_PAGE_SIZE,
  MANAGED_MEMORY_SOURCES,
  readManagedMemoryCreateRequest,
  TOOL_APPROVAL_ACTION_LABELS,
  type ManagedMemoryCreateRequest,
  type ResearchStep,
} from '@agiworkforce/types';
import { hasUnsavedChanges } from '@agiworkforce/ui';
import { BUILT_IN_SLASH_COMMANDS, MemoryEditor, useMemoryStore } from '@agiworkforce/unified-chat';
import type { Project } from '@features/projects/stores/project-store';
import type { MessageResearchState } from '@shared/stores/web-chat-store';
import { ResearchActivity } from '@/features/chat/components/research/ResearchActivity';
import {
  ResearchPlan,
  type ResearchPlanSubmission,
} from '@/features/chat/components/research/ResearchPlan';
import { approvedResearchSteps, parseResearchPlanEvent } from '@/features/chat/utils/research-plan';
import { ProjectSettingsDialog } from '@/features/projects/components/ProjectSettingsDialog';
import { WEB_SETTINGS_NAV_GROUPS } from '@/features/settings/components/web-settings-navigation';
import { e2bExecutionToolDefs, WRITE_FILE_TOOL } from '@/lib/e2b/execution-tools';
import { CLI_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import { APP_NAV_DESTINATIONS } from '@/shared/components/layout/app-nav-items';
import { PREVIEW_GEOMETRY } from './AppPreviews';
import {
  APPROVAL_SCENE_REQUEST,
  ApprovalScenePreview,
  ARTIFACT_SCENE_MESSAGE,
  ArtifactScenePreview,
  ComposerScenePreview,
  ConsoleScenePreview,
  MEMORY_SCENE_REQUESTS,
  MemoryScenePreview,
  PROJECT_SCENE_DRAFT,
  ProjectScenePreview,
  RESEARCH_SCENE_DEPTH,
  RESEARCH_SCENE_PLAN,
  ResearchScenePreview,
} from './ScenePreviews';

const transport = vi.hoisted(() => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const state: {
    allow: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined;
    unexpected: string[];
    restore: () => void;
  } = {
    allow: undefined,
    unexpected: [],
    restore: () => {
      if (descriptor) Object.defineProperty(globalThis, 'fetch', descriptor);
      else Reflect.deleteProperty(globalThis, 'fetch');
    },
  };
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: (input: RequestInfo | URL, init?: RequestInit) => {
      if (state.allow) return state.allow(input, init);
      state.unexpected.push(`${init?.method ?? 'GET'} ${String(input)}`);
      return Promise.reject(new Error('Unexpected fetch outside a native observation.'));
    },
  });
  return state;
});

const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
type SonnerModule = typeof import('sonner');

vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<SonnerModule>();
  return {
    ...actual,
    toast: Object.assign(
      (...args: Parameters<typeof actual.toast>) => actual.toast(...args),
      actual.toast,
      notifications,
    ),
  };
});
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
}));
vi.mock('@/features/projects/components/KnowledgeFilesPanel', () => ({
  KnowledgeFilesPanel: () => null,
}));
vi.mock('@/features/projects/components/ProjectMemoryPanel', () => ({
  ProjectMemoryPanel: () => null,
}));
vi.mock('@/features/projects/components/ProjectDefaultModelField', () => ({
  ProjectDefaultModelField: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  try {
    expect(transport.unexpected).toEqual([]);
  } finally {
    transport.restore();
  }
});

const repoRoot = resolve(__dirname, '../../../../../..');
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

const scenes: Array<[string, (className?: string) => React.ReactElement]> = [
  ['artifact', (className) => <ArtifactScenePreview className={className} />],
  ['project', (className) => <ProjectScenePreview className={className} />],
  ['memory-controls', (className) => <MemoryScenePreview className={className} />],
  ['memory-facts', (className) => <MemoryScenePreview className={className} view="facts" />],
  ['research', (className) => <ResearchScenePreview className={className} />],
  ['approval', (className) => <ApprovalScenePreview className={className} />],
  ['console-members', (className) => <ConsoleScenePreview className={className} />],
  ['console-policy', (className) => <ConsoleScenePreview className={className} view="policy" />],
  ['console-audit', (className) => <ConsoleScenePreview className={className} view="audit" />],
  ['composer-commands', (className) => <ComposerScenePreview className={className} />],
  [
    'composer-attachments',
    (className) => <ComposerScenePreview className={className} view="attachments" />,
  ],
];

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

describe('every feature scene is a scaled, passive picture of the product', () => {
  it.each(scenes)('%s carries the web geometry, its scene name and a label', (scene, make) => {
    const root = sceneRoot(render(make('owner-slot')).container);
    const geometry = PREVIEW_GEOMETRY.web;
    expect(root).toHaveClass('agi-dev', 'agi-app--web', 'owner-slot');
    expect(root).toHaveAttribute('data-device', 'web');
    expect(root).toHaveAttribute('data-scene', scene);
    expect(root).toHaveAttribute('data-geometry', `${geometry.width}x${geometry.height}`);
    expect(root.getAttribute('aria-label')).toMatch(/^Authored example of /u);
    expect(root.style.getPropertyValue('--app-w')).toBe(String(geometry.width));
    expect(root.style.getPropertyValue('--app-h')).toBe(String(geometry.height));
  });

  it.each(scenes)('%s exposes no control a visitor could try to use', (_scene, make) => {
    const { container } = render(make());
    expect(sceneRoot(container).firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(
      container.querySelectorAll(
        'button,a,input,textarea,select,[tabindex],[contenteditable],[role="button"]',
      ),
    ).toHaveLength(0);
  });

  it.each(scenes)('%s sits in a browser window with an address', (_scene, make) => {
    const { container } = render(make());
    expect(container.querySelectorAll('.agi-app-chrome .agi-app-lights i')).toHaveLength(3);
    expect(text(container, '.agi-app-url')).toMatch(/^agiworkforce\.com\/(chat|workspace)/u);
  });

  it.each(scenes)('%s names no model, provider, plan or price', (_scene, make) => {
    const { container } = render(make());
    for (const picker of texts(container, '.agi-app-model')) expect(picker).toBe('Auto');
    expect(container.textContent).not.toMatch(
      /Best \(auto\)|Served by|GPT|Claude|Gemini|Sonnet|Opus|\$\d|\bPro\b|\bPlus\b/u,
    );
  });
});

describe('the scene stylesheet keeps to the web app palette and to scale', () => {
  const css = readSource('apps/web/features/marketing/components/app-preview/scene-preview.css');

  it('uses only the chat tokens the brief allows', () => {
    const allowed =
      /^--(?:u|app-w|corner-pill|agi-shadow|font-geist-mono|chat-(?:bg|sidebar-bg|input-bg|surface-hover|border|border-strong|text-primary|text-secondary|text-muted|text-placeholder|user-bubble-bg|success-text|destructive-text|code-[a-z-]+))$/u;
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
    expect(css).not.toMatch(/@media|@container/u);
  });

  it('scopes every rule to the design root and names new classes agi-scene-', () => {
    const selectors = Array.from(css.matchAll(/^([^\s@{}][^{}]*)\{/gmu), (match) =>
      (match[1] ?? '').trim(),
    );
    expect(selectors.length).toBeGreaterThan(100);
    for (const selector of selectors.flatMap((group) => group.split(',')))
      expect(selector.trim()).toMatch(/^\[data-design='agi'\] \.agi-(?:scene|app)-/u);
    const classes = new Set(Array.from(css.matchAll(/\.(agi-[a-z0-9-]+)/gu), (m) => m[1] ?? ''));
    const borrowed = [...classes].filter((name) => !name.startsWith('agi-scene-'));
    const shared = readSource('apps/web/features/marketing/components/app-preview/AppPreviews.tsx');
    for (const name of borrowed) expect(shared).toContain(name);
  });
});

describe('scenes inside the chat shell reuse the real sidebar and composer', () => {
  const destinations = APP_NAV_DESTINATIONS.filter(
    (item) => !item.adminOnly && !item.requiresHealthSpace && !item.feature,
  ).map((item) => item.label);
  const shelled = scenes.filter(([scene]) => !/^(artifact|console)/u.test(scene));

  it.each(shelled)('%s lists the navigation the signed-in app defines', (_scene, make) => {
    const { container } = render(make());
    expect(texts(container, '.agi-app-navrow')).toEqual(destinations);
    expect(text(container, '.agi-app-wordmark')).toBe('AGI Workforce');
  });

  it('marks Projects as the open destination on the project page only', () => {
    expect(
      texts(render(<ProjectScenePreview />).container, '.agi-app-navrow[data-active]'),
    ).toEqual(['Projects']);
    expect(
      texts(render(<ResearchScenePreview />).container, '.agi-app-navrow[data-active]'),
    ).toEqual([destinations[0]]);
  });

  it.each(scenes.filter(([scene]) => !/^console/u.test(scene)))(
    '%s composer keeps the real control order',
    (_scene, make) => {
      const composer = render(make()).container.querySelector('.agi-app-composer');
      expect(texts(composer as HTMLElement, '.agi-app-seg span')).toEqual(['Chat', 'AGI Work']);
      expect(text(composer as HTMLElement, '.agi-app-model')).toBe('Auto');
      expect(composer?.querySelector('.agi-app-model svg')).not.toBeNull();
    },
  );
});

describe('artifact beside a chat', () => {
  const container = draw(<ArtifactScenePreview />);

  it('shows the inline cards and the open panel', () => {
    expect(container.querySelector('.agi-app-side')).toBeNull();
    expect(texts(container, '.agi-scene-card-title')).toEqual(['Project notes', 'Next steps']);
    expect(texts(container, '.agi-scene-badge')).toEqual(['HTML', 'HTML']);
    expect(texts(container, '.agi-scene-card-sub')).toEqual(['Code · HTML', 'Code · HTML']);
    expect(text(container, '.agi-scene-ghost')).toBe('Download all');
    expect(text(container, '.agi-scene-artifacts-title')).toBe('Artifacts');
    expect(text(container, '.agi-scene-count')).toBe('2');
    expect(text(container, '.agi-scene-strip-action')).toBe('Download all');
    expect(
      Array.from(container.querySelectorAll('.agi-scene-viewtoggle span'), (node) => [
        node.getAttribute('data-view'),
        node.hasAttribute('data-on'),
      ]),
    ).toEqual([
      ['Preview', true],
      ['Source', false],
    ]);
    expect(text(container, '.agi-scene-artifact-name')).toBe('Project notes');
    expect(text(container, '.agi-scene-artifact-type')).toBe('· HTML');
    expect(text(container, '.agi-scene-version')).toBe('v1/1');
    expect(container.querySelectorAll('.agi-scene-artifact-actions svg')).toHaveLength(6);
    expect(text(container, '.agi-scene-artifact-heading')).toBe('Project notes');
  });

  it('the artifact viewer still ships what the scene shows', () => {
    expectSource('apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx', [
      'PanelRightOpen',
      '<h2 className="shrink-0 text-h5 text-foreground">Artifacts</h2>',
      '{artifacts.length}',
      'artifacts.length > 1',
      'FolderDown',
      'Download all',
    ]);
    expectSource('apps/web/features/chat/components/artifacts/ArtifactPreview.tsx', [
      'aria-label="Preview"',
      '<Eye className="h-3.5 w-3.5" aria-hidden="true" />',
      'aria-label="Source"',
      '<Code className="h-3.5 w-3.5" aria-hidden="true" />',
      '<TypeIcon type={artifact.type} className="h-4 w-4 text-muted-foreground" />',
      '· {typeLabel}',
      'v{shownVersionIndex + 1}/{versionCount}',
      '<ChevronLeft',
      '<ChevronRight',
      '<Copy className="h-3.5 w-3.5" />',
      '<Download className="h-3.5 w-3.5" aria-hidden="true" />',
      '<FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />',
      '<Library className="h-3.5 w-3.5" aria-hidden="true" />',
      '<Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />',
      'aria-label="Close artifact viewer"',
      '<div className="h-full w-full bg-white">',
    ]);
    expectSource('apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx', [
      "return 'HTML';",
      "return 'Code';",
      "html: 'HTML',",
      '{kindLabel(artifact.type)} · {extLabel(artifact)}',
      'return <Globe className={cls} aria-hidden="true" />;',
      'relative w-20 shrink-0',
      'artifacts.length > 1',
      'Download all',
    ]);
    expectSource('packages/ui/unified-chat/src/stores/uiStore.ts', [
      'export const MAX_SIDE_PANEL_WIDTH = 900;',
    ]);
  });
});

describe('project page with its settings dialog', () => {
  const container = draw(<ProjectScenePreview />);
  const dialog = container.querySelector('.agi-scene-dialog') as HTMLElement;

  it('draws the page under the dialog', () => {
    expect(container.querySelector('.agi-scene-scrim')).not.toBeNull();
    expect(text(container, '.agi-scene-project-name')).toBe('Investor deck');
    expect(text(container, '.agi-scene-project .agi-app-placeholder')).toBe(
      'New chat in Investor deck',
    );
    expect(texts(container, '.agi-scene-tabs span')).toEqual([
      'Chats',
      'Artifacts',
      'Work',
      'Sources',
      'Scheduled',
    ]);
    expect(texts(container, '.agi-scene-tabs span[data-on]')).toEqual(['Chats']);
    expect(container.querySelectorAll('.agi-scene-project-chat')).toHaveLength(3);
  });

  it('draws the settings dialog in the order the product lays it out', () => {
    expect(text(dialog, '.agi-scene-dialog-title')).toBe('Project settings');
    expect(texts(dialog, '.agi-scene-caps')).toEqual([
      'Project name',
      'Description',
      'Instructions',
      'Memory',
    ]);
    expect(texts(dialog, '.agi-scene-input[data-empty]')).toEqual(['What is this project for?']);
    expect(texts(dialog, '.agi-scene-help')).toEqual([
      'Set context and customize how AGI responds in this project.',
      'Chats here draw on what has been remembered account-wide, and anything learned here stays in this project.',
    ]);
    expect(text(dialog, '.agi-scene-checkrow-label')).toBe(
      'Use memories from outside this project',
    );
    expect(dialog.querySelector('.agi-scene-checkrow .agi-scene-tick')).toHaveAttribute('data-on');
    expect(
      texts(
        dialog,
        '.agi-scene-dialog-foot .agi-scene-textbtn, .agi-scene-dialog-foot > .agi-scene-btn',
      ),
    ).toEqual(['Delete project', 'Duplicate', 'Export', 'Save']);
    expect(dialog.querySelector('.agi-scene-textbtn[data-danger]')?.textContent).toBe(
      'Delete project',
    );
    expect(dialog.querySelector('.agi-scene-btn[data-ink]')?.textContent).toBe('Save');
  });

  it('the project page and dialog still ship what the scene shows', () => {
    expectSource('apps/web/app/chat/projects/[id]/page.tsx', [
      'aria-label="Back to projects"',
      '&larr;',
      '<MoreHorizontal',
      'placeholder={`New chat in ${project.name}`}',
      "const TAB_ORDER: readonly Tab[] = ['chats', 'artifacts', 'work', 'sources', 'scheduled'];",
      "chats: 'Chats',",
      "artifacts: 'Artifacts',",
      "work: 'Work',",
      "sources: 'Sources',",
      "scheduled: 'Scheduled',",
      "if (diffDays === 1) return 'Yesterday';",
      'maxWidth: 720,',
    ]);
    expectSource('packages/ui/ui/src/sidebar/project-icons.ts', [
      "export const DEFAULT_PROJECT_ICON_ID = 'folder';",
      "{ id: 'folder', label: 'Folder', Icon: Folder },",
    ]);
    expectSource('apps/web/features/projects/components/ProjectSettingsDialog.tsx', [
      '<DialogTitle className="text-base font-semibold">Project settings</DialogTitle>',
      'Project name',
      '<Smile className="h-4 w-4" aria-hidden="true" />',
      'Description',
      'placeholder="What is this project for?"',
      'Instructions',
      'Set context and customize how AGI responds in this project.',
      'Use memories from outside this project',
      "'Chats here draw on what has been remembered account-wide, and anything learned here stays in this project.'",
      "'Delete project'",
      "'Duplicate'",
      'Export',
      'Save',
      'sm:max-w-lg',
    ]);
    expectSource('packages/ui/ui/src/primitives/Dialog.tsx', ['bg-black/70']);
  });
});

describe('memory settings', () => {
  const controls = draw(<MemoryScenePreview />);
  const facts = draw(<MemoryScenePreview view="facts" />);

  it.each([
    ['controls', controls],
    ['facts', facts],
  ] as const)('%s view lists the settings sections the web app registers', (_view, container) => {
    expect(text(container, '.agi-scene-settings-nav > .agi-scene-dialog-title')).toBe('Settings');
    expect(text(container, '.agi-scene-settings-search')).toBe('Search');
    expect(texts(container, '.agi-scene-settings-group-label')).toEqual(
      WEB_SETTINGS_NAV_GROUPS.map((group) => group.label),
    );
    expect(texts(container, '.agi-scene-settings-item')).toEqual(
      WEB_SETTINGS_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label)),
    );
    expect(texts(container, '.agi-scene-settings-item[data-active]')).toEqual(['Memory']);
    expect(container.querySelector('.agi-scene-scrim')).not.toBeNull();
  });

  it('controls view shows the page as it opens', () => {
    expect(text(controls, '.agi-scene-pane-title')).toBe('Memory');
    expect(text(controls, '.agi-scene-pane-lede')).toBe(
      "Facts the assistant should remember about you across conversations. Stored on this device, and synced to your account across devices when you're signed in.",
    );
    expect(text(controls, '.agi-scene-helplink')).toBe('How memory works');
    expect(texts(controls, '.agi-scene-setting-title')).toEqual([
      'Persistent memory',
      'Save memories from chats',
      'Search past chats',
      'Allow memory generation from tool-assisted chats',
    ]);
    expect(texts(controls, '.agi-scene-setting-note')).toEqual([
      'Allow AGI to remember details across conversations',
      'Let AGI save lasting details you mention in a chat without being asked. When this is off, it saves only what you ask it to remember.',
      'Let AGI look up excerpts from your other conversations when answering. Never used in temporary chats.',
      'Create memories from chats that use tools, connectors, code, or web search',
    ]);
    expect(controls.querySelector('.agi-scene-panel .agi-scene-switch')).toHaveAttribute('data-on');
    expect(text(controls, '.agi-scene-memory-count > span')).toBe('5 saved memories');
    expect(texts(controls, '.agi-scene-memory-count .agi-scene-btn')).toEqual([
      'Import memories',
      'Manage memories',
      'Clear all memories',
    ]);
    expect(controls.querySelector('.agi-scene-editor')).toBeNull();
  });

  it('facts view shows the editor the Manage memories button scrolls to', () => {
    expect(text(facts, '.agi-scene-editor-label')).toBe('Add a new fact');
    expect(texts(facts, '.agi-scene-editor .agi-scene-input[data-empty]')).toEqual([
      'Example: I prefer Python over JavaScript for data work.',
      'Search memory',
    ]);
    expect(text(facts, '.agi-scene-editor-row .agi-scene-btn')).toBe('Add');
    expect(text(facts, '.agi-scene-editor-count')).toBe('0 / 280');
    const rows = facts.querySelectorAll('.agi-scene-fact');
    expect(rows).toHaveLength(5);
    expect(texts(facts, '.agi-scene-fact-foot > span:first-child').slice(0, 2)).toEqual([
      'Added by you 2h ago',
      'Added by you 2h ago',
    ]);
    for (const row of rows) expect(row.querySelectorAll('svg')).toHaveLength(2);
    expect(facts.querySelector('.agi-scene-pane-title')).toBeNull();
  });

  it('the memory settings still ship what the scene shows', () => {
    expectSource('apps/web/features/settings/sections/MemorySection.tsx', [
      'Memory\n        </h1>',
      'Facts the assistant should remember about you across conversations. Stored on this device,',
      'and synced to your account across devices when you&apos;re signed in.',
      '<HelpArticleLink docId="memory" label="How memory works" />',
      "'Persistent memory',",
      "'Allow AGI to remember details across conversations',",
      "other: '{{count}} saved memories',",
      'Import memories',
      'Manage memories',
      'Clear all memories',
      "'Save memories from chats',",
      "'Let AGI save lasting details you mention in a chat without being asked. When this is off, it saves only what you ask it to remember.',",
      "'Search past chats',",
      "'Let AGI look up excerpts from your other conversations when answering. Never used in temporary chats.',",
      "'Allow memory generation from tool-assisted chats',",
      "'Create memories from chats that use tools, connectors, code, or web search',",
      "document.getElementById(MEMORY_EDITOR_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth' });",
    ]);
    expectSource('packages/ui/unified-chat/src/components/MemoryEditor.tsx', [
      'Add a new fact',
      'placeholder="Example: I prefer Python over JavaScript for data work."',
      'const MAX_FACT_CHARS = 280;',
      '{draft.length} / {MAX_FACT_CHARS}',
      'placeholder="Search memory"',
      "return <>{fact.source ? 'Added by you' : 'Added'}</>;",
      'return `${hours}h ago`;',
      'return `${days}d ago`;',
      '<Pin size={13} strokeWidth={1.75} />',
      '<Trash2 size={13} strokeWidth={1.75} />',
    ]);
    expectSource('packages/ui/ui/src/settings-modal/SettingsModal.tsx', [
      "{title ?? t('modal.title', 'Settings')}",
      "placeholder={t('modal.searchPlaceholder', 'Search')}",
      'md:h-[min(94vh,680px)] md:w-[min(96vw,860px)]',
      'md:w-[220px]',
      '<div ref={paneRef} className="mx-auto w-full max-w-[672px]">',
      "?.scrollIntoView({ block: 'nearest' });",
    ]);
    expectSource('apps/web/features/settings/components/web-settings-navigation.ts', [
      "label: 'Memory',",
      'items: [...group.items, MEMORY_NAV_ITEM]',
    ]);
  });
});

describe('research plan awaiting start', () => {
  const container = draw(<ResearchScenePreview />);

  it('shows the plan before anything has been searched', () => {
    expect(text(container, '.agi-scene-research-status')).toBe(
      'Review the plan to start searching',
    );
    expect(text(container, '.agi-scene-research-sources')).toBe(
      'Searching the whole web. Add a source to narrow it.',
    );
    expect(text(container, '.agi-scene-research-heading')).toBe('Research plan');
    expect(texts(container, '.agi-scene-research .agi-scene-help')).toEqual([
      'Edit any step before it runs. What you start here is exactly what gets searched, and it spends your budget.',
      'The answer in a page, only what changes a decision.',
    ]);
    expect(texts(container, '.agi-scene-research-step')).toEqual([
      '1Find tools for planning tasks and tracking progress.',
      '2Compare collaboration and sharing options.',
      "3Check each tool's published documentation.",
    ]);
    expect(container.querySelectorAll('.agi-scene-research-step svg')).toHaveLength(3);
    expect(text(container, '.agi-scene-research-add')).toBe('Add a step');
    expect(container.querySelector('.agi-scene-fieldset')).toHaveAttribute(
      'data-legend',
      'Deliverable',
    );
    expect(
      Array.from(container.querySelectorAll('.agi-scene-radios > span'), (node) => [
        node.textContent,
        node.querySelector('.agi-scene-tick')?.hasAttribute('data-on'),
      ]),
    ).toEqual([
      ['Executive summary', true],
      ['Full report', false],
    ]);
    expect(texts(container, '.agi-scene-research .agi-scene-btn')).toEqual([
      'Start research',
      'Cancel',
    ]);
    expect(
      container.querySelector('.agi-scene-research .agi-scene-btn[data-ink]')?.textContent,
    ).toBe('Start research');
    expect(text(container, '.agi-scene-modechip')).toBe('Deep Research');
    expect(container.textContent).not.toMatch(/Sources for this run|Report|Citations|\[\d+\]/u);
  });

  it('the research plan still ships what the scene shows', () => {
    expectSource('apps/web/features/chat/components/research/ResearchPlan.tsx', [
      "const HEADING = 'Research plan';",
      "'Edit any step before it runs. What you start here is exactly what gets searched, and it spends your budget.';",
      "const ADD_STEP_LABEL = 'Add a step';",
      "const START_LABEL = 'Start research';",
      "const CANCEL_LABEL = 'Cancel';",
      "'executive-summary': 'Executive summary',",
      "'full-report': 'Full report',",
      "'executive-summary': 'The answer in a page, only what changes a decision.',",
      '<legend className="px-1 text-xs font-medium text-foreground">Deliverable</legend>',
      '<X className="h-3.5 w-3.5" aria-hidden="true" />',
      '<Plus className="h-3 w-3" aria-hidden="true" />',
    ]);
    expectSource('apps/web/features/chat/components/research/ResearchActivity.tsx', [
      "awaiting_approval: 'Review the plan to start searching',",
      '<ListChecks className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />',
      "? 'Searching the whole web. Add a source to narrow it.'",
    ]);
    expectSource('apps/web/features/chat/components/Composer/ChatComposerNew.tsx', [
      "overflowActiveOptions.push({ label: 'Deep Research', Icon: Telescope });",
    ]);
  });
});

describe('tool approval in chat', () => {
  const container = draw(<ApprovalScenePreview />);

  it('shows the waiting tool row with the three decisions in order', () => {
    expect(text(container, '.agi-scene-tool-badge')).toBe('F');
    expect(text(container, '.agi-scene-tool-name')).toBe('Write File');
    expect(text(container, '.agi-scene-tool-status')).toBe('Waiting for your approval');
    expect(text(container, '.agi-scene-tool-banner > span')).toBe(
      'This tool requires approval before execution.',
    );
    expect(texts(container, '.agi-scene-tool-actions .agi-scene-btn')).toEqual([
      TOOL_APPROVAL_ACTION_LABELS.allow,
      TOOL_APPROVAL_ACTION_LABELS.allowForChat,
      TOOL_APPROVAL_ACTION_LABELS.deny,
    ]);
    expect(texts(container, '.agi-scene-tool-actions .agi-scene-btn[data-ink]')).toEqual([
      TOOL_APPROVAL_ACTION_LABELS.allow,
    ]);
    expect(
      container.querySelector('.agi-scene-tool-actions .agi-scene-btn[data-ink] svg'),
    ).not.toBeNull();
    expect(text(container, '.agi-scene-tool-label')).toBe('Request');
    expect(JSON.parse(text(container, '.agi-scene-tool-request') ?? '')).toEqual({
      path: 'report.txt',
      content: 'Notes for the project report.',
    });
  });

  it('the tool card still ships what the scene shows', () => {
    expectSource('packages/ui/unified-chat/src/components/ToolCallCard.tsx', [
      ": 'This tool requires approval before execution.'}",
      '<AlertCircle',
      '<Play className="h-2.5 w-2.5" />',
      '{TOOL_APPROVAL_ACTION_LABELS.allow}',
      '{TOOL_APPROVAL_ACTION_LABELS.allowForChat}',
      '{TOOL_APPROVAL_ACTION_LABELS.deny}',
      'Request\n            </p>',
      '{JSON.stringify(args, null, 2)}',
      'iconStyle="badge"',
    ]);
    expectSource('packages/ui/unified-chat/src/components/InlineToolCall.tsx', [
      "return 'Waiting for your approval';",
      '<PauseCircle',
      "write: { kind: 'letter', letter: 'F' },",
    ]);
    expectSource('packages/contracts/types/src/tool-approval-policy.ts', [
      "allow: 'Allow',",
      "allowForChat: 'Allow for this chat',",
      "deny: 'Deny',",
    ]);
    expectSource('apps/web/lib/e2b/execution-tools.ts', [
      "export const WRITE_FILE_TOOL = 'write_file';",
    ]);
  });
});

describe('workspace console', () => {
  const members = draw(<ConsoleScenePreview />);
  const policy = draw(<ConsoleScenePreview view="policy" />);
  const audit = draw(<ConsoleScenePreview view="audit" />);

  it.each([
    ['members', members, '/workspace/people', 'Members'],
    ['policy', policy, '/workspace/policy', 'Policy'],
    ['audit', audit, '/workspace/audit', 'Audit'],
  ] as const)(
    '%s view sits at its own address with its nav row open',
    (_v, container, path, row) => {
      expect(text(container, '.agi-app-url')).toBe(`agiworkforce.com${path}`);
      expect(container.querySelector('.agi-app-side')).toBeNull();
      expect(text(container, '.agi-scene-console-eyebrow')).toBe('Administration');
      expect(text(container, '.agi-scene-console-name')).toBe('Workspace');
      expect(texts(container, '.agi-scene-console-group-title')).toEqual([
        'Workspace',
        'People',
        'Controls',
        'Records',
      ]);
      expect(texts(container, '.agi-scene-console-link b')).toEqual([
        'Overview',
        'Members',
        'Roles',
        'Identity',
        'Policy',
        'Models',
        'Connectors',
        'Code',
        'MCP servers',
        'Plugins',
        'Sharing',
        'Audit',
        'Data',
        'Usage',
        'Billing',
      ]);
      expect(texts(container, '.agi-scene-console-link[data-active] b')).toEqual([row]);
      expect(text(container, '.agi-scene-console-title')).toBe(row);
    },
  );

  it('every nav label and hint is the one the console defines', () => {
    const nav = readSource(
      'apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx',
    );
    for (const title of texts(members, '.agi-scene-console-group-title'))
      expect(nav).toContain(`title: '${title}',`);
    for (const label of texts(members, '.agi-scene-console-link b'))
      expect(nav).toContain(`label: '${label}'`);
    for (const hint of texts(members, '.agi-scene-console-link i'))
      expect(nav).toContain(`hint: '${hint}'`);
    for (const href of ['/workspace/people', '/workspace/policy', '/workspace/audit'])
      expect(nav).toContain(`href: '${href}',`);
    expectSource('apps/web/features/workspace-console/components/WorkspaceConsoleShell.tsx', [
      'Administration\n',
      'Workspace\n',
      'md:w-60',
    ]);
  });

  it('members view shows the invitation form and the member list', () => {
    expect(texts(members, '.agi-scene-sheet-title')).toEqual(['Invite teammate', 'Members']);
    expect(texts(members, '.agi-scene-sheet-head .agi-scene-sheet-note')).toEqual([
      'Invitations expire after 7 days.',
      '5 active members',
    ]);
    expect(texts(members, '.agi-scene-invite-field')).toEqual(['Email address', 'RoleMember role']);
    expect(text(members, '.agi-scene-invite .agi-scene-btn[data-ink]')).toBe('Create invitation');
    expect(texts(members, '.agi-scene-avatar')).toEqual(['A.', 'J.', 'M.', 'R.', 'S.']);
    expect(texts(members, '.agi-scene-member-email')).toEqual([
      'a.okafor@example.com',
      'j.lindqvist@example.com',
      'm.ferreira@example.com',
      'r.nakamura@example.com',
      's.adeyemi@example.com',
    ]);
    expect(text(members, '.agi-scene-member-role')).toBe('Owner role');
    expect(texts(members, '.agi-scene-member .agi-scene-picker')).toEqual([
      'Admin role',
      'Member role',
      'Member role',
      'Viewer role',
    ]);
    expect(members.querySelectorAll('.agi-scene-remove svg')).toHaveLength(4);
  });

  it('policy view shows real rows with the controls the page uses', () => {
    expect(text(policy, '.agi-scene-sheet-heading')).toBe('Workspace policy');
    expect(texts(policy, '.agi-scene-rule-title')).toEqual([
      'AGI-managed cloud compute',
      'Default privacy mode',
      'Public sharing',
      'Memory',
      'Secrets typed into chat',
    ]);
    expect(texts(policy, '.agi-scene-rule .agi-scene-picker')).toEqual(['Managed Cloud', 'Redact']);
    expect(policy.querySelectorAll('.agi-scene-rule .agi-scene-tick[data-on]')).toHaveLength(3);
    expect(text(policy, '.agi-scene-sheet-foot .agi-scene-btn')).toBe('Save policy');
    expect(policy.querySelector('.agi-scene-sheet-foot .agi-scene-btn')).not.toHaveAttribute(
      'data-ink',
    );
  });

  it('audit view shows all six columns and the export control', () => {
    expect(text(audit, '.agi-scene-sheet-heading')).toBe('Audit trail');
    expect(text(audit, '.agi-scene-picker[data-export]')).toBe('Export JSONL');
    expect(texts(audit, '.agi-scene-filters .agi-scene-picker')).toEqual([
      'All actions',
      'All outcomes',
      'All severities',
    ]);
    expect(texts(audit, '.agi-scene-audit-th')).toEqual([
      'When',
      'Actor',
      'Action',
      'Resource',
      'Surface',
      'Outcome',
    ]);
    expect(audit.querySelectorAll('.agi-scene-audit > span')).toHaveLength(30);
    expect(texts(audit, '.agi-scene-outcome')).toEqual(['success', 'success', 'denied', 'failure']);
    expect(text(audit, '.agi-scene-sheet-foot')).toBe(
      'Showing the most recent 4. Export for the full range.',
    );
    expect(audit.textContent).not.toContain('Clear filters');
  });

  it('the console pages still ship what the scenes show', () => {
    expectSource('apps/web/app/workspace/people/page.tsx', [
      'title="Members"',
      'description="Who belongs to this workspace, what role they hold, and how many seats that consumes."',
    ]);
    expectSource('apps/web/app/workspace/policy/page.tsx', [
      'title="Policy"',
      'description="What members of this workspace may run, where their chats may sync, and how long records are kept."',
    ]);
    expectSource('apps/web/app/workspace/audit/page.tsx', [
      'title="Audit"',
      'description="Administrative, policy, and access events for this workspace. Writes go through a security-definer function, so this record cannot be edited from the application."',
    ]);
    expectSource('apps/web/features/settings/sections/TeamSection.tsx', [
      '<SectionCard title="Invite teammate" description="Invitations expire after 7 days.">',
      'Email address',
      'aria-label="Invitation role"',
      '<option value="member">Member role</option>',
      '<option value="viewer">Viewer role</option>',
      '<option value="admin">Admin role</option>',
      "{createInvitation.isPending ? 'Creating…' : 'Create invitation'}",
      "other: '{{count}} active members',",
      '{member.name.slice(0, 2).toUpperCase()}',
      "<span style={{ color: 'var(--text-3)', fontWeight: 400 }}> (you)</span>",
      '{titleCase(member.role)} role',
      '<Trash2 size={15} />',
    ]);
    expectSource('apps/web/features/settings/sections/WorkspacePolicySection.tsx', [
      'Workspace policy',
      "? 'These rules bind every member of this workspace. Personal accounts are unaffected.'",
      'title="AGI-managed cloud compute"',
      'description="When off, members of this workspace cannot run managed turns, images, video, embeddings, or transcription."',
      'title="Default privacy mode"',
      'description="What a new conversation starts in for members of this workspace."',
      "label: 'Managed Cloud',",
      'title="Public sharing"',
      "? 'Members may publish a chat or an artifact to an anonymous public link.'",
      'title="Memory"',
      "? 'Members may use account memory. Each member still controls their own memory in personal settings.'",
      'title="Secrets typed into chat"',
      "label: 'Redact',",
      "hint: 'The secret is removed from the message before it is sent, and the member is told how many were removed.',",
      'role="switch"',
      '`Last changed ${new Date(overview.policy.updatedAt).toLocaleString()}`',
      "'Save policy'",
    ]);
    expectSource('apps/web/features/settings/sections/WorkspaceAuditSection.tsx', [
      'Audit trail',
      'Administrative and identity events for this workspace. Append-only, entries cannot be',
      'edited or removed, including by an owner. Exporting is itself recorded here.',
      'Export JSONL',
      '<option value="">All actions</option>',
      "{o === '' ? 'All outcomes' : o}",
      "{s === '' ? 'All severities' : s}",
      "{['When', 'Actor', 'Action', 'Resource', 'Surface', 'Outcome'].map((h) => (",
      "{event.actorUserId ?? 'system'}",
      'Showing the most recent {events.length}. Export for the full range.',
      '{filtered ? (',
    ]);
  });

  it('the sample audit rows use event names and resource types the product records', () => {
    expectSource('apps/web/lib/security-audit.ts', [
      "| 'admin_policy_changed'",
      "| 'scim_user_provisioned'",
      "| 'data_exported'",
    ]);
    expectSource('apps/web/lib/server/scim/scim-provisioning-service.ts', [
      "'scim_user_provisioned',\n    'scim_provisioned_user',",
    ]);
    expectSource('apps/web/app/api/settings/organization/audit/export/route.ts', [
      "eventType: 'data_exported',",
      "resourceType: 'enterprise_audit_events',",
      "outcome: 'denied',",
    ]);
    expectSource('apps/web/app/api/settings/organization/route.ts', [
      "resourceType: 'organization',",
    ]);
  });
});

describe('composer', () => {
  const commands = draw(<ComposerScenePreview />);
  const attachments = draw(<ComposerScenePreview view="attachments" />);

  it('commands view shows the menu a lone slash opens', () => {
    const builtIn = BUILT_IN_SLASH_COMMANDS.filter((command) => !command.requiredCapability);
    expect(builtIn.length).toBe(4);
    expect(text(commands, '.agi-app-draft')).toBe('/');
    expect(commands.querySelector('.agi-scene-slash')).toHaveAttribute(
      'data-menu',
      'Slash command suggestions',
    );
    expect(texts(commands, '.agi-scene-slash-row code')).toEqual(builtIn.map((c) => c.label));
    expect(texts(commands, '.agi-scene-slash-line i')).toEqual(builtIn.map((c) => c.description));
    expect(texts(commands, '.agi-scene-slash-row > span > i')).toEqual(
      builtIn.map((c) => c.example),
    );
    expect(commands.querySelectorAll('.agi-scene-slash-row > svg')).toHaveLength(4);
    expect(commands.querySelectorAll('.agi-scene-slash-row[data-active]')).toHaveLength(1);
    expect(text(commands, '.agi-scene-slash-foot')).toBe(
      'Use arrow keys to navigate, Enter to select, Esc to close',
    );
    expect(commands.querySelector('.agi-scene-attachments')).toBeNull();
  });

  it('attachments view shows the chips above the box and no menu', () => {
    expect(text(attachments, '.agi-scene-attachment-file')).toBe('deck-v7.pdf2.4 MB');
    expect(attachments.querySelector('.agi-scene-attachment-image')).toHaveAttribute(
      'data-file',
      'screenshot.png',
    );
    expect(attachments.querySelectorAll('.agi-scene-attachment-remove')).toHaveLength(2);
    expect(text(attachments, '.agi-app-draft')).toBe(
      'Summarize the deck and compare it with this screenshot.',
    );
    expect(attachments.querySelector('.agi-scene-slash')).toBeNull();
    const wrap = attachments.querySelector('.agi-scene-composer');
    expect(wrap?.firstElementChild).toHaveClass('agi-scene-attachments');
    expect(wrap?.lastElementChild).toHaveClass('agi-app-composer');
  });

  it('the composer still ships what the scenes show', () => {
    expectSource('packages/ui/unified-chat/src/components/SlashCommandMenu.tsx', [
      'aria-label="Slash command suggestions"',
      'Use arrow keys to navigate, Enter to select, Esc to close',
      'absolute bottom-full start-0 end-0 mb-2',
      '<code className="shrink-0 text-sm font-semibold text-primary">',
    ]);
    expectSource('packages/ui/unified-chat/src/lib/slashCommands.ts', [
      "label: '/search',",
      "description: 'Search the web',",
      "label: '/think',",
      "description: 'Extended reasoning',",
      "label: '/image',",
      "description: 'Generate an image',",
      "label: '/code',",
      "description: 'Run code in a sandbox',",
      'if (!query) return commands;',
    ]);
    expectSource('apps/web/features/chat/components/Composer/AttachmentPreview.tsx', [
      'return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;',
      "if (mimeType === 'application/pdf') return FileText;",
      "'max-w-[180px]',",
      'className="h-14 w-14 overflow-hidden rounded-lg border border-border/50 bg-muted/30"',
      "'absolute -end-1.5 -top-1.5 z-[var(--z-control)]',",
    ]);
  });
});

function one<T>(values: T[], name: string): T {
  if (values.length !== 1) throw new Error(`Expected exactly one ${name}.`);
  return values[0] as T;
}

const compact = (value: string) => value.replace(/\s+/gu, '');

const LIVE_CONTROLS =
  'a,button,input,select,textarea,form,[contenteditable],[tabindex],[hidden],[role="button"],[role="link"],[role="textbox"]';

describe('every scene stays a passive picture in initial server markup', () => {
  it.each(scenes)('%s ships no live control and only hidden icons', (_scene, make) => {
    const root = draw(make());
    expect(sceneRoot(root).firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(root.querySelectorAll(LIVE_CONTROLS)).toHaveLength(0);
    const icons = Array.from(root.querySelectorAll('svg'));
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(root.textContent).not.toMatch(/[▤▣◉➤▾]/u);
    expect(root.querySelector('.agi-dev-caret,.agi-mk-receipt')).toBeNull();
  });
});

describe('web feature scenes never render a Local route', () => {
  const localRuntime = `${(CLI_LOCAL_RUNTIMES.names[0] ?? '').toLowerCase()}(local)`;

  it.each(scenes)('%s has no Local route text, badge or switch', (_scene, make) => {
    const root = draw(make());
    const shown = root.textContent ?? '';
    expect(shown).not.toContain('Served by');
    expect(shown).not.toContain(localRuntime);
    expect(shown).not.toContain('stays on this device');
    expect(shown).not.toContain('Local and Cloud allowed');
    expect(shown).not.toMatch(/\bLocal\b|BYOK|Your key|Ollama/u);
    expect(root.querySelector('.agi-app-modeswitch')).toBeNull();
    expect(root.querySelector('.agi-dev-badge')).toBeNull();
  });
});

describe('artifact example follows the canonical derivation', () => {
  const include = artifactInclusionForPolicy(EXPLICIT_ARTIFACT_DERIVATION_POLICY);

  function panelSource(source: string) {
    const parsed = ts.createSourceFile(
      'ArtifactPreview.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const panels: ts.IfStatement[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isIfStatement(node) && node.expression.getText(parsed) === "variant === 'panel'")
        panels.push(node);
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    return one(panels, 'artifact panel branch').thenStatement.getText(parsed);
  }

  it('shows the cards, open page and first history entry the message derives', () => {
    const root = draw(<ArtifactScenePreview />);
    const derived = deriveArtifacts(ARTIFACT_SCENE_MESSAGE, { include });
    expect(derived.length).toBeGreaterThan(1);
    expect(new Set(derived.map((artifact) => artifact.id)).size).toBe(derived.length);
    const store = createArtifactStore();
    for (const artifact of derived) {
      expect(artifact.type).toBe('html');
      expect(artifact.language).toBe('html');
      const page = new DOMParser().parseFromString(artifact.content, 'text/html');
      expect(artifact.title).toBe(page.title);
      expect(page.querySelector('h1')?.textContent).toBe(artifact.title);
      expect(page.querySelector('p')?.textContent).toBeTruthy();
      store.getState().upsertArtifact(artifact);
    }
    expect(texts(root, '.agi-scene-card-title')).toEqual(derived.map((artifact) => artifact.title));
    expect(texts(root, '.agi-scene-badge')).toEqual(
      derived.map((artifact) => artifact.type.toUpperCase()),
    );
    expect(texts(root, '.agi-scene-card-sub')).toEqual(
      derived.map((artifact) => `Code · ${(artifact.language ?? '').toUpperCase()}`),
    );
    expect(text(root, '.agi-scene-count')).toBe(String(derived.length));
    const open = derived[0];
    if (!open) throw new Error('The example message derives no artifact');
    const page = new DOMParser().parseFromString(open.content, 'text/html');
    expect(text(root, '.agi-scene-artifact-name')).toBe(open.title);
    expect(text(root, '.agi-scene-artifact-type')).toBe(`· ${open.type.toUpperCase()}`);
    expect(text(root, '.agi-scene-artifact-heading')).toBe(page.querySelector('h1')?.textContent);
    expect(text(root, '.agi-scene-artifact-body')).toBe(page.querySelector('p')?.textContent);
    const history = store.getState().getArtifactVersions(open.id);
    expect(history).toHaveLength(1);
    expect(text(root, '.agi-scene-version')).toBe(`v${open.version}/${history.length}`);
    expect(root.textContent).not.toMatch(
      /Read \d+ files|\d[,.]\d+ words|\d+(?:\.\d+)? s|Saved to/u,
    );
  });

  it('requires the explicit marker while every page stays a renderable HTML example', () => {
    const marked = deriveArtifacts(ARTIFACT_SCENE_MESSAGE, { include });
    expect(ARTIFACT_SCENE_MESSAGE.split('<!-- @artifact -->')).toHaveLength(marked.length + 1);
    const unmarked = ARTIFACT_SCENE_MESSAGE.replaceAll('<!-- @artifact -->', '');
    expect(deriveArtifacts(unmarked, { include: 'renderable' })).toHaveLength(marked.length);
    expect(deriveArtifacts(unmarked, { include })).toEqual([]);
  });

  it('draws only controls that the panel branch of the real viewer renders', () => {
    const viewer = panelSource(
      readSource('apps/web/features/chat/components/artifacts/ArtifactPreview.tsx'),
    );
    for (const needle of [
      'aria-label="Preview"',
      'aria-label="Source"',
      'data-testid="artifact-version-chip"',
      'title="Copy"',
      'title="Download"',
      'title="Save to project"',
      'title="Save to Library"',
      'title="Fullscreen"',
      'aria-label="Close artifact viewer"',
    ])
      expect(viewer).toContain(needle);
  });
});

describe('approval example is a pending request the real tool accepts', () => {
  it('matches the file-write argument schema and the canonical display label', () => {
    const root = draw(<ApprovalScenePreview />);
    const args = JSON.parse(text(root, '.agi-scene-tool-request') ?? '') as Record<string, unknown>;
    expect(args).toEqual(APPROVAL_SCENE_REQUEST);
    const definition = e2bExecutionToolDefs().find(
      (tool) => tool.function.name === WRITE_FILE_TOOL,
    );
    if (!definition) throw new Error('The file-write tool definition is missing');
    const schema = definition.function.parameters;
    const required = schema['required'] as string[];
    const properties = schema['properties'] as Record<string, { type: string }>;
    expect(Object.keys(args).sort()).toEqual(required.toSorted());
    for (const key of required) expect(typeof args[key]).toBe(properties[key]?.type);
    expect(text(root, '.agi-scene-tool-name')).toBe(
      getToolDisplayLabel(WRITE_FILE_TOOL).displayName,
    );
  });

  it('shows the canonical choices without invented activity or a completed result', () => {
    const root = draw(<ApprovalScenePreview />);
    expect(texts(root, '.agi-scene-tool-actions .agi-scene-btn')).toEqual([
      TOOL_APPROVAL_ACTION_LABELS.allow,
      TOOL_APPROVAL_ACTION_LABELS.allowForChat,
      TOOL_APPROVAL_ACTION_LABELS.deny,
    ]);
    expect(texts(root, '.agi-scene-tool-status')).toEqual(['Waiting for your approval']);
    expect(text(root, '.agi-app-url')).toBe('agiworkforce.com/chat');
    expect(root.textContent).not.toMatch(
      /Plan · \d|\d+(?:\.\d+)? s|\+\d|Nothing on this list|Network|git push|pull request|Always/u,
    );
    expect(root.textContent).not.toMatch(/Result|File written|Saved|Completed|Done/u);
  });
});

describe('console example invents no workspace activity', () => {
  it.each(['members', 'policy', 'audit'] as const)('%s view in server markup', (view) => {
    const root = draw(<ConsoleScenePreview view={view} />);
    expect(sceneRoot(root).getAttribute('aria-label')).toMatch(/^Authored example of /u);
    expect(text(root, '.agi-scene-console-title')?.toLowerCase()).toBe(view);
    expect(root.textContent).not.toMatch(
      /12 seats|11 active|1 invitation|last sync|every change lands|Enforced server side|90 days|signed batches|resets in|seat cap|Runs stop at the cap|policy\.changed|scim\.user_provisioned/u,
    );
  });

  it('policy rows state what their switched-on control means', () => {
    const root = draw(<ConsoleScenePreview view="policy" />);
    const policy = readSource('apps/web/features/settings/sections/WorkspacePolicySection.tsx');
    const rows = Array.from(root.querySelectorAll('.agi-scene-rule'));
    const toggled = rows.filter((row) => row.querySelector('.agi-scene-tick'));
    expect(toggled.length).toBeGreaterThan(0);
    for (const row of toggled) {
      expect(row.querySelector('.agi-scene-tick')).toHaveAttribute('data-on');
      const note = row.querySelector('.agi-scene-sheet-note')?.textContent ?? '';
      expect(policy.includes(`? '${note}'`) || policy.includes(`description="${note}"`)).toBe(true);
      expect(note).not.toMatch(/^Off\b|is off\b/u);
    }
  });
});

describe('composer example uses the shared command and mode registries', () => {
  it('opens on the registered search selector over an unsent draft', () => {
    const root = draw(<ComposerScenePreview />);
    const mode = interactionMode('search');
    const native = one(
      BUILT_IN_SLASH_COMMANDS.filter((command) => command.id === 'search'),
      'built-in search command',
    );
    expect(mode.selector.label).toBe(native.label);
    expect(text(root, '.agi-scene-slash-row[data-active] code')).toBe(native.label);
    expect(text(root, '.agi-scene-slash-row[data-active] .agi-scene-slash-line i')).toBe(
      native.description,
    );
    expect(texts(root, '.agi-app-seg span[data-on]')).toEqual([
      interactionMode('chat').selector.label,
    ]);
    expect(text(root, '.agi-app-draft')).toBe('/');
    expect(root.querySelector('.agi-app-thread')?.textContent).not.toContain('/');
  });

  it.each(['commands', 'attachments'] as const)('%s view invents no sent state', (view) => {
    const root = draw(<ComposerScenePreview view={view} />);
    expect(root.textContent).not.toMatch(
      /\/research|\/summarise|Search · on|Enter to send|\d+:\d+ dictated|Served by/u,
    );
    expect(root.querySelector('.agi-app-thread')?.textContent).not.toContain(
      text(root, '.agi-app-draft'),
    );
  });
});

function readMemoryRequest(payload: unknown): ManagedMemoryCreateRequest {
  const read = readManagedMemoryCreateRequest(payload);
  if (!read.ok) throw new Error(`Invalid create request: ${read.field}.`);
  const raw = payload as Record<string, unknown>;
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== 2 || !keys.includes('content') || !keys.includes('source')) {
    throw new Error('The fact must contain only content and source.');
  }
  if (
    read.request.source === undefined ||
    read.request.source !== raw['source'] ||
    read.request.content !== raw['content']
  ) {
    throw new Error('The canonical reader must retain the fact content and source.');
  }
  return read.request;
}

interface NativeMemory {
  limit: number;
  fieldLabel: string;
  placeholder: string;
  actionLabel: string;
  counter: string;
  search: string;
  bodies: ManagedMemoryCreateRequest[];
  rows: Array<{ text: string; footer: string; actions: number }>;
}

function requireMemoryCorrespondence(
  payload: unknown,
  visible: string,
  native: NativeMemory,
  index: number,
) {
  const request = readMemoryRequest(payload);
  if (request.content !== request.content.trim())
    throw new Error('The fact must already be trimmed.');
  if (request.content.length > native.limit)
    throw new Error('The fact must fit the native editor.');
  if (visible !== request.content)
    throw new Error('The visible fact must equal its request content.');
  const posted = native.bodies[index];
  if (!posted) throw new Error('The native editor never posted this fact.');
  if (request.source !== posted.source) throw new Error('The fact must use the native Web source.');
  const body = new Map(Object.entries(posted));
  if (
    Reflect.ownKeys(request).length !== Reflect.ownKeys(posted).length ||
    Object.entries(request).some(([key, value]) => body.get(key) !== value)
  ) {
    throw new Error('The entire fact request must equal the native Web POST body.');
  }
  return request;
}

function requireMemoryEditor(pane: HTMLElement, native: NativeMemory) {
  if (
    !pane.matches('.agi-scene-settings-pane[data-view="facts"]') ||
    !pane.closest('[aria-hidden="true"]')
  ) {
    throw new Error('The facts must sit in the hidden settings pane of the picture.');
  }
  if (pane.querySelector(LIVE_CONTROLS)) {
    throw new Error('The settings pane must contain no live controls.');
  }
  const expected = [
    native.fieldLabel,
    native.placeholder,
    native.actionLabel,
    native.counter,
    native.search,
    ...native.rows.flatMap((row) => [row.text, row.footer]),
  ];
  if (compact(pane.textContent ?? '') !== compact(expected.join(''))) {
    throw new Error('The pane must show only the native empty form and the saved facts.');
  }
}

describe('memory facts correspond to the native editor', () => {
  let native: NativeMemory;
  const requests = MEMORY_SCENE_REQUESTS.map(readMemoryRequest);
  const first = one(requests.slice(0, 1), 'first authored fact');
  const facts = () => draw(<MemoryScenePreview view="facts" />);
  const pane = (root: HTMLElement) =>
    one(
      Array.from(root.querySelectorAll<HTMLElement>('.agi-scene-settings-pane')),
      'settings pane',
    );

  beforeAll(async () => {
    const ages = texts(facts(), '.agi-scene-fact-foot > span:first-child').map((footer) => {
      const age = /(\d+)([hd]) ago$/u.exec(footer ?? '');
      if (!age) throw new Error('A scene fact footer does not end in a native relative age.');
      return Number(age[1]) * (age[2] === 'h' ? 3_600_000 : 86_400_000);
    });
    expect(ages).toHaveLength(requests.length);
    const storage = Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index) ?? '';
      return [key, localStorage.getItem(key) ?? ''] as const;
    });
    const posts: { body: unknown; csrf: string | null; contentType: string | null }[] = [];
    const unexpected: string[] = [];
    const inFlight = new Set<Promise<Response>>();
    const csrf = 'memory-correspondence-test-boundary';
    const refusal = 'The test transport refuses this write.';
    let csrfCalls = 0;
    let listCalls = 0;
    const boundary = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      const response = Promise.resolve().then(() => {
        if (url === '/api/csrf' && method === 'GET' && init?.body === undefined) {
          csrfCalls += 1;
          return Response.json({ token: csrf, expiresIn: 0 });
        }
        if (
          url === `/api/memory?limit=${MANAGED_MEMORY_MAX_PAGE_SIZE}&offset=0` &&
          method === 'GET' &&
          init?.body === undefined
        ) {
          listCalls += 1;
          return Response.json({ memories: [], hasMore: false });
        }
        if (url === '/api/memory' && method === 'POST' && typeof init?.body === 'string') {
          const headers = new Headers(init.headers);
          posts.push({
            body: JSON.parse(init.body),
            csrf: headers.get('x-csrf-token'),
            contentType: headers.get('content-type'),
          });
          return Response.json({ error: { message: refusal } }, { status: 403 });
        }
        unexpected.push(`${method} ${url}`);
        throw new Error('Unexpected external request in the native Memory test.');
      });
      inFlight.add(response);
      void response.then(
        () => inFlight.delete(response),
        () => inFlight.delete(response),
      );
      return response;
    };
    const host = document.createElement('div');
    let view: Pick<ReturnType<typeof render>, 'unmount'> | undefined;
    let restoreStore: (() => void) | undefined;
    const priorDirty = hasUnsavedChanges();
    try {
      expect(priorDirty).toBe(false);
      transport.allow = boundary;
      await waitFor(() => expect(useMemoryStore.persist.hasHydrated()).toBe(true));
      const priorState = useMemoryStore.getState();
      restoreStore = () => {
        useMemoryStore.setState(priorState, true);
        expect(useMemoryStore.getState()).toBe(priorState);
      };
      useMemoryStore.setState({ facts: [], syncStatus: 'idle' });
      document.body.append(host);
      view = render(<MemoryEditor title={null} description="" hideClearAll />, { container: host });
      await waitFor(() => expect(useMemoryStore.getState().syncStatus).toBe('synced'));
      expect(listCalls).toBe(1);
      const form = one(Array.from(host.querySelectorAll('form')), 'native Add form');
      const input = one(Array.from(form.querySelectorAll('textarea')), 'native Add field');
      const add = one(
        Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')),
        'native Add action',
      );
      const fieldLabel = (
        one(Array.from(form.querySelectorAll('label')), 'native field label').textContent ?? ''
      ).trim();
      const actionLabel = (add.textContent ?? '').trim();
      expect(input.getAttribute('aria-label')).toBe(fieldLabel);
      const counter = (form.lastElementChild?.textContent ?? '').trim();
      const count = /^(\d+)\s*\/\s*(\d+)$/u.exec(counter);
      if (!count) throw new Error('Native Add counter changed; observe its current owner.');
      const limit = Number(count[2]);
      expect(Number(count[1])).toBe(0);
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThan(MANAGED_MEMORY_MAX_CONTENT_CHARS);
      expect(add.disabled).toBe(true);
      expect(host.querySelector('input[type="search"]')).toBeNull();
      fireEvent.change(input, { target: { value: 'x'.repeat(limit + 1) } });
      expect(input.value).toHaveLength(limit);
      expect(form.lastElementChild?.textContent?.trim()).toBe(`${limit} / ${limit}`);
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.submit(form);
      expect(add.disabled).toBe(true);
      expect(posts).toHaveLength(0);
      expect(useMemoryStore.getState().facts).toHaveLength(0);
      expect(hasUnsavedChanges()).toBe(false);
      for (const [index, request] of requests.entries()) {
        fireEvent.change(input, { target: { value: ` ${request.content} ` } });
        expect(request.content.length + 2).toBeLessThanOrEqual(limit);
        expect(form.lastElementChild?.textContent?.trim()).toBe(
          `${request.content.length + 2} / ${limit}`,
        );
        fireEvent.submit(form);
        expect(useMemoryStore.getState().facts).toHaveLength(1);
        expect(useMemoryStore.getState().facts[0]).toMatchObject({
          text: request.content,
          pending: true,
        });
        expect(input.value).toBe('');
        expect(add.disabled).toBe(true);
        await waitFor(() => {
          expect(posts).toHaveLength(index + 1);
          expect(host.querySelector('[role="alert"]')?.textContent).toBe(refusal);
          expect(add.disabled).toBe(false);
          expect(useMemoryStore.getState().facts).toHaveLength(0);
        });
        expect(posts[index]?.csrf).toBe(csrf);
        expect(posts[index]?.contentType).toBe('application/json');
        expect(input.value).toBe(request.content);
        expect(hasUnsavedChanges()).toBe(true);
      }
      expect(csrfCalls).toBeGreaterThan(0);
      fireEvent.change(input, { target: { value: '' } });
      expect(form.lastElementChild?.textContent?.trim()).toBe(counter);
      const now = Date.now();
      await act(async () => {
        useMemoryStore.setState({
          facts: requests.map((request, index) => {
            const at = new Date(now - (ages[index] ?? 0) - index * 60_000).toISOString();
            return {
              id: `scene-fact-${index}`,
              text: request.content,
              source: request.source,
              createdAt: at,
              updatedAt: at,
            };
          }),
        });
      });
      const list = one(
        Array.from(host.querySelectorAll('ul[aria-label="Memory facts"]')),
        'native fact list',
      );
      const rows = Array.from(list.children, (row) => ({
        text: (row.firstElementChild?.textContent ?? '').trim(),
        footer: (row.lastElementChild?.firstElementChild?.textContent ?? '')
          .replace(/\s+/gu, ' ')
          .trim(),
        actions: row.querySelectorAll('button').length - 1,
      }));
      native = {
        limit,
        fieldLabel,
        placeholder: input.placeholder,
        actionLabel,
        counter,
        search: one(
          Array.from(host.querySelectorAll<HTMLInputElement>('input[type="search"]')),
          'native memory search',
        ).placeholder,
        bodies: posts.map((post) => readMemoryRequest(post.body)),
        rows,
      };
    } finally {
      try {
        try {
          await act(async () => {
            await Promise.allSettled([...inFlight]);
            view?.unmount();
          });
        } finally {
          try {
            cleanup();
          } finally {
            host.remove();
          }
        }
        expect(unexpected).toEqual([]);
        expect(hasUnsavedChanges()).toBe(priorDirty);
      } finally {
        try {
          restoreStore?.();
        } finally {
          try {
            localStorage.clear();
            for (const [key, value] of storage) localStorage.setItem(key, value);
          } finally {
            transport.allow = undefined;
          }
        }
      }
    }
  });

  it('every saved fact is a request the native editor posts unchanged', () => {
    const shown = texts(facts(), '.agi-scene-fact > span:first-child');
    expect(shown).toHaveLength(requests.length);
    expect(native.bodies).toHaveLength(requests.length);
    for (const [index, payload] of MEMORY_SCENE_REQUESTS.entries()) {
      const request = requireMemoryCorrespondence(payload, shown[index] ?? '', native, index);
      expect(request).toEqual(native.bodies[index]);
    }
  });

  it('shows the native form labels, saved rows and nothing else, with no live control', () => {
    const root = facts();
    expect(text(root, '.agi-scene-editor-label')).toBe(native.fieldLabel);
    expect(text(root, '.agi-scene-editor-row .agi-scene-btn')).toBe(native.actionLabel);
    expect(text(root, '.agi-scene-editor-count')).toBe(native.counter);
    expect(texts(root, '.agi-scene-editor .agi-scene-input[data-empty]')).toEqual([
      native.placeholder,
      native.search,
    ]);
    expect(
      Array.from(root.querySelectorAll('.agi-scene-fact'), (row) => ({
        text: row.firstElementChild?.textContent,
        footer: row.querySelector('.agi-scene-fact-foot > span')?.textContent,
        actions: row.querySelectorAll('.agi-scene-fact-actions svg').length,
      })),
    ).toEqual(native.rows);
    expect(native.rows.map((row) => row.text)).toEqual(requests.map((request) => request.content));
    for (const row of native.rows) expect(row.footer).toMatch(/^Added by you \d+[hd] ago$/u);
    expect(sceneRoot(root).getAttribute('aria-label')).toMatch(/authored example/iu);
    requireMemoryEditor(pane(root), native);
    expect(text(draw(<MemoryScenePreview />), '.agi-scene-memory-count > span')).toBe(
      `${requests.length} saved memories`,
    );
    for (const view of ['controls', 'facts'] as const)
      expect(draw(<MemoryScenePreview view={view} />).textContent).not.toContain(
        'On · saved to your account',
      );
  });

  it('rejects an added saved receipt and an added live control', () => {
    const receipt = pane(facts());
    const note = document.createElement('span');
    note.textContent = 'On · saved to your account';
    receipt.append(note);
    expect(() => requireMemoryEditor(receipt, native)).toThrowError(
      'The pane must show only the native empty form and the saved facts.',
    );
    const control = pane(facts());
    control.append(document.createElement('button'));
    expect(() => requireMemoryEditor(control, native)).toThrowError(
      'The settings pane must contain no live controls.',
    );
    const elsewhere = pane(draw(<MemoryScenePreview />));
    expect(() => requireMemoryEditor(elsewhere, native)).toThrowError(
      'The facts must sit in the hidden settings pane of the picture.',
    );
  });

  it.each([
    ['null body', null, 'body'],
    ['array body', [], 'body'],
    ['missing content', {}, 'content'],
    ['non-string content', { content: 42 }, 'content'],
    ['empty content', { content: '' }, 'content'],
    ['whitespace content', { content: '   ' }, 'content'],
  ])('rejects malformed wire input: %s', (_name, payload, field) => {
    expect(readManagedMemoryCreateRequest(payload)).toMatchObject({ ok: false, field });
    expect(() => requireMemoryCorrespondence(payload, '', native, 0)).toThrowError(
      `Invalid create request: ${field}.`,
    );
  });

  it('rejects the wire content limit independently of the native editor limit', () => {
    const payload = { ...first, content: 'x'.repeat(MANAGED_MEMORY_MAX_CONTENT_CHARS + 1) };
    expect(readManagedMemoryCreateRequest(payload)).toMatchObject({ ok: false, field: 'content' });
    expect(() => requireMemoryCorrespondence(payload, payload.content, native, 0)).toThrowError(
      'Invalid create request: content.',
    );
  });

  it('rejects a source that the canonical reader silently projects away', () => {
    const payload = { ...first, source: 'not-a-memory-source' };
    const read = readManagedMemoryCreateRequest(payload);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error('The source-projection premise changed.');
    expect(read.request).not.toHaveProperty('source');
    expect(() => requireMemoryCorrespondence(payload, payload.content, native, 0)).toThrowError(
      'The canonical reader must retain the fact content and source.',
    );
  });

  it.each(['id', 'createdAt', 'updatedAt', 'sourceConversationId', 'serverId', 'pending'])(
    'rejects added saved-record field: %s',
    (field) => {
      const payload = { ...first, [field]: 'invented-saved-provenance' };
      expect(readManagedMemoryCreateRequest(payload).ok).toBe(true);
      expect(() => requireMemoryCorrespondence(payload, payload.content, native, 0)).toThrowError(
        'The fact must contain only content and source.',
      );
    },
  );

  it('rejects untrimmed content even though the canonical reader retains it', () => {
    const payload = { ...first, content: ` ${first.content} ` };
    expect(readMemoryRequest(payload).content).toBe(payload.content);
    expect(() => requireMemoryCorrespondence(payload, payload.content, native, 0)).toThrowError(
      'The fact must already be trimmed.',
    );
  });

  it('rejects wire-valid content that the actual native editor would clamp', () => {
    const payload = { ...first, content: 'x'.repeat(native.limit + 1) };
    expect(readMemoryRequest(payload).content).toBe(payload.content);
    expect(() => requireMemoryCorrespondence(payload, payload.content, native, 0)).toThrowError(
      'The fact must fit the native editor.',
    );
  });

  it('rejects different visible content before checking the Web POST', () => {
    expect(() =>
      requireMemoryCorrespondence(first, `${first.content} Different fact.`, native, 0),
    ).toThrowError('The visible fact must equal its request content.');
  });

  it('rejects a retained canonical source that belongs to another surface', () => {
    const source = MANAGED_MEMORY_SOURCES.find((value) => value !== native.bodies[0]?.source);
    if (source === undefined)
      throw new Error('An independent other-surface fixture is unavailable.');
    const payload = { ...first, source };
    expect(readMemoryRequest(payload).source).toBe(source);
    expect(() => requireMemoryCorrespondence(payload, payload.content, native, 0)).toThrowError(
      'The fact must use the native Web source.',
    );
  });

  it('rejects an extra canonical field in the Web body rather than comparing only content and source', () => {
    const body = { ...native.bodies[0], pinned: true } as ManagedMemoryCreateRequest;
    expect(readManagedMemoryCreateRequest(body).ok).toBe(true);
    expect(() =>
      requireMemoryCorrespondence(first, first.content, { ...native, bodies: [body] }, 0),
    ).toThrowError('The entire fact request must equal the native Web POST body.');
  });

  it('rejects a fact the native editor was never asked to post', () => {
    expect(() =>
      requireMemoryCorrespondence(first, first.content, native, native.bodies.length),
    ).toThrowError('The native editor never posted this fact.');
  });
});

type ProjectDraft = { name: string; instructions: string };

type CleanupFailure = { phase: string; error: Error };

function observationError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Project observation threw a non-Error value', { cause: error });
}

function captureCleanup(failures: CleanupFailure[], phase: string, action: () => void): void {
  try {
    action();
  } catch (error) {
    failures.push({ phase, error: observationError(error) });
  }
}

function disposeObservation(
  view: ReturnType<typeof render> | undefined,
  priorDirty: boolean,
): CleanupFailure[] {
  const failures: CleanupFailure[] = [];
  if (view) captureCleanup(failures, 'unmount', () => view.unmount());
  captureCleanup(failures, 'cleanup', cleanup);
  captureCleanup(failures, 'dirty-witness', () => expect(hasUnsavedChanges()).toBe(priorDirty));
  captureCleanup(failures, 'transport-reset', () => {
    transport.allow = undefined;
  });
  return failures;
}

function finishObservation(primary: Error | undefined, cleanupFailures: CleanupFailure[]): void {
  if (cleanupFailures.length) {
    const errors = cleanupFailures.map((failure) => failure.error);
    throw Object.assign(
      new AggregateError(
        primary ? [primary, ...errors] : errors,
        primary?.message ?? 'Project observation cleanup failed',
        { cause: primary ?? errors[0] },
      ),
      { cleanupFailures },
    );
  }
  if (primary) throw primary;
}

function readProjectDraft(payload: unknown): ProjectDraft {
  const parsed = ManagedCloudProjectUpdateRequestSchema.safeParse(payload);
  assert.ok(parsed.success, 'The authored draft must satisfy the actual update schema');
  assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload));
  assert.deepEqual(
    Reflect.ownKeys(payload).sort(),
    ['instructions', 'name'],
    'The authored draft must contain only name and instructions',
  );
  const raw = payload as Record<string, unknown>;
  assert.equal(typeof raw['name'], 'string', 'The authored name must be a string');
  assert.equal(typeof raw['instructions'], 'string', 'The authored instructions must be a string');
  assert.deepEqual(
    parsed.data,
    payload,
    'The canonical schema must retain the entire authored draft unchanged',
  );
  const draft = payload as ProjectDraft;
  assert.equal(draft.name.trim(), draft.name, 'The authored name must already be trimmed');
  assert.equal(
    draft.instructions.trim(),
    draft.instructions,
    'The authored instructions must already be trimmed',
  );
  assert.ok(draft.instructions.length > 0, 'The authored instruction example must be meaningful');
  return draft;
}

const sceneProjectDraft = () => readProjectDraft({ ...PROJECT_SCENE_DRAFT });

const nativeProject: Project = {
  id: 'native-project-correspondence-fixture',
  name: 'Existing native fixture name',
  instructions: 'Existing native fixture instructions',
  createdAt: 'fixture-only',
  updatedAt: 'fixture-only',
  usesGlobalMemory: true,
  usesAccountInstructions: false,
  usesAccountStyle: false,
  defaultModelId: null,
};

function nativeSettings() {
  const priorDirty = hasUnsavedChanges();
  let view: ReturnType<typeof render> | undefined;
  const dispose = () => disposeObservation(view, priorDirty);
  try {
    assert.equal(priorDirty, false, 'The native observation requires an isolated clean registry');
    const onUpdate = vi.fn();
    const onOpenChange = vi.fn();
    view = render(
      <ProjectSettingsDialog
        open
        project={nativeProject}
        onUpdate={onUpdate}
        onOpenChange={onOpenChange}
        onDelete={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Project settings' });
    const name = within(dialog).getByLabelText('Project name');
    const instructions = within(dialog).getByLabelText('Instructions');
    assert.ok(name instanceof HTMLInputElement);
    assert.ok(instructions instanceof HTMLTextAreaElement);
    const save = within(dialog).getByRole('button', { name: 'Save' });
    assert.ok(save instanceof HTMLButtonElement);
    const trimmed = (node: Element | null | undefined) => (node?.textContent ?? '').trim();
    const fieldLabels = Array.from(dialog.querySelectorAll('label[for]'));
    assert.equal(
      fieldLabels.length,
      3,
      'The native dialog must label name, description, instructions',
    );
    const fieldFor = (label: Element) => dialog.querySelector(`#${label.getAttribute('for')}`);
    assert.equal(fieldFor(fieldLabels[0] as Element), name);
    assert.equal(fieldFor(fieldLabels[2] as Element), instructions);
    const description = fieldFor(fieldLabels[1] as Element);
    assert.ok(description instanceof HTMLTextAreaElement);
    const checkboxes = Array.from(
      dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    assert.equal(checkboxes.length, 3, 'The native dialog must end its toggles with Memory');
    const memory = checkboxes[2] as HTMLInputElement;
    const memoryRow = memory.closest('label');
    const memoryText = Array.from(memoryRow?.querySelectorAll(':scope > span > span') ?? []);
    assert.equal(memoryText.length, 2, 'The native Memory toggle must carry a label and a helper');
    const actions = one(
      Array.from(dialog.querySelectorAll('[data-testid="project-settings-actions"]')),
      'native action row',
    );
    return {
      name,
      instructions,
      save,
      onUpdate,
      onOpenChange,
      title: trimmed(within(dialog).getByRole('heading', { name: 'Project settings' })),
      nameLabel: trimmed(fieldLabels[0]),
      descriptionLabel: trimmed(fieldLabels[1]),
      descriptionPlaceholder: description.placeholder,
      descriptionValue: description.value,
      instructionsLabel: trimmed(fieldLabels[2]),
      instructionsHelp: trimmed(instructions.parentElement?.querySelector('p')),
      memoryHeading: trimmed(memoryRow?.previousElementSibling),
      memoryLabel: trimmed(memoryText[0]),
      memoryHelp: trimmed(memoryText[1]),
      memoryChecked: memory.checked,
      actionLabels: Array.from(actions.querySelectorAll('button,a'), trimmed),
      saveLabel: trimmed(save),
      dispose,
    };
  } catch (error) {
    const primary = observationError(error);
    finishObservation(primary, dispose());
    throw primary;
  }
}

type NativeProject = Omit<
  ReturnType<typeof nativeSettings>,
  'name' | 'instructions' | 'save' | 'onUpdate' | 'onOpenChange' | 'dispose'
> & { nameLimit: number; body: unknown };

async function observeNativeProject(draft: ProjectDraft): Promise<NativeProject> {
  const { name, instructions, save, onUpdate, onOpenChange, dispose, ...labels } = nativeSettings();
  const requests: Array<{
    path: string;
    method: string;
    body: unknown;
    contentType: string | null;
  }> = [];
  transport.allow = async (input, init) => {
    const path = String(input);
    if (path !== managedCloudProjectPath(nativeProject.id) || init?.method !== 'PUT') {
      transport.unexpected.push(`${init?.method ?? 'GET'} ${path}`);
      throw new Error('Unexpected native Project request');
    }
    requests.push({
      path,
      method: init.method,
      body: JSON.parse(String(init.body)),
      contentType: new Headers(init.headers).get('Content-Type'),
    });
    throw new Error('Controlled Project update rejection; no stored response');
  };
  let primary: Error | undefined;
  try {
    expect(requests).toEqual([]);
    assert.ok(name.maxLength > 0, 'The native name input must expose its actual limit');
    assert.ok(
      draft.name.length + 2 <= name.maxLength,
      'The authored name must fit the native editor',
    );
    fireEvent.change(name, { target: { value: ` ${draft.name} ` } });
    fireEvent.change(instructions, { target: { value: ` ${draft.instructions} ` } });
    expect(requests).toEqual([]);
    expect(hasUnsavedChanges()).toBe(true);
    expect(save.disabled).toBe(false);
    await userEvent.setup().click(save);
    await waitFor(() => {
      expect(requests).toHaveLength(1);
      expect(notifications.error).toHaveBeenCalledTimes(1);
      expect(save.disabled).toBe(false);
    });
    expect(requests[0]?.contentType).toBe('application/json');
    const body = ManagedCloudProjectUpdateRequestSchema.parse(requests[0]?.body);
    expect(body).toEqual(requests[0]?.body);
    expect(body).toEqual({
      ...draft,
      description: null,
      usesGlobalMemory: nativeProject.usesGlobalMemory !== false,
      usesAccountInstructions: nativeProject.usesAccountInstructions !== false,
      usesAccountStyle: nativeProject.usesAccountStyle !== false,
      defaultModelId: nativeProject.defaultModelId ?? null,
    });
    expect(name.value).toBe(` ${draft.name} `);
    expect(instructions.value).toBe(` ${draft.instructions} `);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(notifications.success).not.toHaveBeenCalled();
    expect(hasUnsavedChanges()).toBe(true);
    return { ...labels, nameLimit: name.maxLength, body };
  } catch (error) {
    primary = observationError(error);
    throw primary;
  } finally {
    finishObservation(primary, dispose());
  }
}

const projectMarkup = () => draw(<ProjectScenePreview />);

function requireProjectScene(root: HTMLElement, payload: unknown, native: NativeProject): void {
  const draft = readProjectDraft(payload);
  assert.ok(draft.name.length <= native.nameLimit, 'The authored name must fit the native editor');
  const frame = one(Array.from(root.querySelectorAll('figure')), 'actual Project frame');
  assert.equal(
    frame.getAttribute('aria-label'),
    'Authored example of a project page with its settings open',
  );
  const body = one(Array.from(frame.querySelectorAll('.agi-app-window')), 'picture body');
  assert.equal(body.getAttribute('aria-hidden'), 'true');
  const dialog = one(
    Array.from(body.querySelectorAll('.agi-scene-dialog[data-dialog="project-settings"]')),
    'authored settings dialog',
  );
  const shown = (scope: Element, selector: string) =>
    (one(Array.from(scope.querySelectorAll(selector)), selector).textContent ?? '').trim();
  assert.equal(
    shown(dialog, '[data-field="name"]'),
    draft.name,
    'The visible name must equal the authored draft',
  );
  assert.equal(
    shown(dialog, '[data-field="instructions"]'),
    draft.instructions,
    'The visible instructions must equal the authored draft',
  );
  assert.equal(shown(dialog, '.agi-scene-dialog-title'), native.title);
  assert.deepEqual(
    Array.from(dialog.querySelectorAll('.agi-scene-caps'), (node) => node.textContent),
    [native.nameLabel, native.descriptionLabel, native.instructionsLabel, native.memoryHeading],
    'The field captions must be the native labels in the native order',
  );
  const description = one(
    Array.from(dialog.querySelectorAll('[data-field="description"]')),
    'description field',
  );
  assert.equal(description.textContent?.trim(), native.descriptionPlaceholder);
  assert.equal(description.hasAttribute('data-empty'), native.descriptionValue === '');
  assert.deepEqual(
    Array.from(dialog.querySelectorAll('.agi-scene-help'), (node) => node.textContent),
    [native.instructionsHelp, native.memoryHelp],
  );
  assert.equal(shown(dialog, '.agi-scene-checkrow-label'), native.memoryLabel);
  assert.equal(
    one(
      Array.from(dialog.querySelectorAll('.agi-scene-checkrow .agi-scene-tick')),
      'memory tick',
    ).hasAttribute('data-on'),
    native.memoryChecked,
    'The Memory tick must match the native checkbox state',
  );
  assert.deepEqual(
    Array.from(
      dialog.querySelectorAll(
        '.agi-scene-dialog-foot .agi-scene-textbtn, .agi-scene-dialog-foot > .agi-scene-btn',
      ),
      (node) => node.textContent,
    ),
    native.actionLabels,
    'The footer must list the native actions in the native order',
  );
  assert.equal(shown(dialog, '.agi-scene-dialog-foot > .agi-scene-btn'), native.saveLabel);
  assert.equal(shown(body, '.agi-scene-project-name'), draft.name);
  assert.equal(shown(body, '.agi-scene-project .agi-app-placeholder'), `New chat in ${draft.name}`);
  assert.equal(
    frame.querySelectorAll(LIVE_CONTROLS).length,
    0,
    'The entire marketing frame must remain passive',
  );
  assert.equal(
    dialog.querySelectorAll('ul,ol,li,time').length +
      frame.querySelectorAll('.agi-mk-receipt').length,
    0,
    'The settings draft must not invent saved files, threads, dates or receipts',
  );
  const expected = [
    native.title,
    native.nameLabel,
    draft.name,
    native.descriptionLabel,
    native.descriptionPlaceholder,
    native.instructionsLabel,
    native.instructionsHelp,
    draft.instructions,
    native.memoryHeading,
    native.memoryLabel,
    native.memoryHelp,
    ...native.actionLabels,
  ];
  assert.equal(
    compact(dialog.textContent ?? ''),
    compact(expected.join('')),
    'The dialog must contain exactly its authored fields and native labels',
  );
  assert.doesNotMatch(
    frame.textContent ?? '',
    /tokens|saved files|Project saved|Project updated|Changes saved/iu,
    'The frame must not add a token total or saved outcome',
  );
  const wire = ManagedCloudProjectUpdateRequestSchema.parse(native.body);
  assert.equal(wire.name, draft.name, 'The authored name must equal the real native PUT name');
  assert.equal(
    wire.instructions,
    draft.instructions,
    'The authored instructions must equal the real native PUT instructions',
  );
  assert.equal(wire.description, null, 'An empty description field must be sent as none');
  assert.equal(wire.usesGlobalMemory, native.memoryChecked);
}

describe('project settings correspond to the native dialog', () => {
  it('exports only the unsaved example fields without canonical projection', () => {
    expect(sceneProjectDraft()).toEqual(PROJECT_SCENE_DRAFT);
  });

  it('binds the passive picture to native labels and the real rejected PUT without saved outcomes', async () => {
    const draft = sceneProjectDraft();
    const native = await observeNativeProject(draft);
    expect(native.memoryChecked).toBe(true);
    requireProjectScene(projectMarkup(), draft, native);
  });

  it('keeps the native blank-name guard active even through Enter', () => {
    const native = nativeSettings();
    let primary: Error | undefined;
    try {
      fireEvent.change(native.name, { target: { value: '   ' } });
      expect(native.save.disabled).toBe(true);
      fireEvent.keyDown(native.name, { key: 'Enter' });
      expect(notifications.error).toHaveBeenCalledWith('Project name is required');
      expect(native.onUpdate).not.toHaveBeenCalled();
      expect(native.onOpenChange).not.toHaveBeenCalled();
      expect(transport.unexpected).toEqual([]);
    } catch (error) {
      primary = observationError(error);
      throw primary;
    } finally {
      finishObservation(primary, native.dispose());
    }
  });

  it('keeps the mounted marketing Save span passive', async () => {
    const priorDirty = hasUnsavedChanges();
    let view: ReturnType<typeof render> | undefined;
    let primary: Error | undefined;
    try {
      assert.equal(priorDirty, false, 'The marketing observation requires a clean registry');
      view = render(<ProjectScenePreview />);
      const save = one(
        Array.from(view.container.querySelectorAll('.agi-scene-dialog-foot > .agi-scene-btn')),
        'marketing Save',
      );
      expect(save.tagName).toBe('SPAN');
      expect(save.textContent).toBe('Save');
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      const before = view.container.innerHTML;
      await userEvent.setup().click(save);
      expect(view.container.innerHTML).toBe(before);
      expect(transport.unexpected).toEqual([]);
      expect(notifications.success).not.toHaveBeenCalled();
    } catch (error) {
      primary = observationError(error);
      throw primary;
    } finally {
      finishObservation(primary, disposeObservation(view, priorDirty));
    }
  });
});

describe('project correspondence negative controls', () => {
  it.each(['id', 'createdAt', 'updatedAt', 'files', 'threads', 'tokenCount', 'saved'])(
    'rejects projected saved-record or outcome field: %s',
    (field) => {
      const payload = { ...sceneProjectDraft(), [field]: 'invented-outcome' };
      expect(ManagedCloudProjectUpdateRequestSchema.safeParse(payload).success).toBe(true);
      expect(() => readProjectDraft(payload)).toThrowError(
        'The authored draft must contain only name and instructions',
      );
    },
  );

  it('rejects nullable wire instructions as a visible authored instruction example', () => {
    const payload = { ...sceneProjectDraft(), instructions: null };
    expect(ManagedCloudProjectUpdateRequestSchema.safeParse(payload).success).toBe(true);
    expect(() => readProjectDraft(payload)).toThrowError(
      'The authored instructions must be a string',
    );
  });

  it('rejects a name normalized by the wire schema', () => {
    const payload = { ...sceneProjectDraft(), name: ` ${sceneProjectDraft().name} ` };
    expect(ManagedCloudProjectUpdateRequestSchema.parse(payload).name).toBe(payload.name.trim());
    expect(() => readProjectDraft(payload)).toThrowError(
      'The canonical schema must retain the entire authored draft unchanged',
    );
  });

  it('rejects instructions that native Save would change', () => {
    const payload = {
      ...sceneProjectDraft(),
      instructions: ` ${sceneProjectDraft().instructions} `,
    };
    expect(ManagedCloudProjectUpdateRequestSchema.parse(payload).instructions).toBe(
      payload.instructions,
    );
    expect(() => readProjectDraft(payload)).toThrowError(
      'The authored instructions must already be trimmed',
    );
  });

  it.each(['name', 'instructions'] as const)('rejects a different visible %s', async (field) => {
    const draft = sceneProjectDraft();
    const native = await observeNativeProject(draft);
    const root = projectMarkup();
    one(
      Array.from(root.querySelectorAll(`.agi-scene-dialog [data-field="${field}"]`)),
      'actual visible field',
    ).textContent = 'A different authored value';
    expect(() => requireProjectScene(root, draft, native)).toThrowError(
      `The visible ${field} must equal the authored draft`,
    );
  });

  it('rejects an interactive marketing Save even when its label is correct', async () => {
    const draft = sceneProjectDraft();
    const native = await observeNativeProject(draft);
    const root = projectMarkup();
    const save = one(
      Array.from(root.querySelectorAll('.agi-scene-dialog-foot > .agi-scene-btn')),
      'actual Save span',
    );
    const button = document.createElement('button');
    button.className = save.className;
    button.textContent = save.textContent;
    save.replaceWith(button);
    expect(() => requireProjectScene(root, draft, native)).toThrowError(
      'The entire marketing frame must remain passive',
    );
  });

  it('rejects an extra statement inside the dialog and a saved outcome outside it', async () => {
    const draft = sceneProjectDraft();
    const native = await observeNativeProject(draft);
    const inside = projectMarkup();
    const receipt = document.createElement('span');
    receipt.textContent = 'Saved a moment ago';
    one(Array.from(inside.querySelectorAll('.agi-scene-dialog-body')), 'dialog body').append(
      receipt,
    );
    expect(() => requireProjectScene(inside, draft, native)).toThrowError(
      'The dialog must contain exactly its authored fields and native labels',
    );
    const outside = projectMarkup();
    const outcome = document.createElement('span');
    outcome.textContent = 'Every prompt contains 9.2k tokens of saved files';
    one(Array.from(outside.querySelectorAll('figure')), 'actual frame').append(outcome);
    expect(() => requireProjectScene(outside, draft, native)).toThrowError(
      'The frame must not add a token total or saved outcome',
    );
  });

  it('rejects a Memory tick that disagrees with the native checkbox', async () => {
    const draft = sceneProjectDraft();
    const native = await observeNativeProject(draft);
    const root = projectMarkup();
    one(
      Array.from(root.querySelectorAll('.agi-scene-checkrow .agi-scene-tick')),
      'memory tick',
    ).removeAttribute('data-on');
    expect(() => requireProjectScene(root, draft, native)).toThrowError(
      'The Memory tick must match the native checkbox state',
    );
  });

  it('rejects a wire-valid name beyond the actual native input limit', async () => {
    const draft = sceneProjectDraft();
    const native = await observeNativeProject(draft);
    const payload = { ...draft, name: 'x'.repeat(native.nameLimit + 1) };
    expect(readProjectDraft(payload)).toEqual(payload);
    expect(() => requireProjectScene(projectMarkup(), payload, native)).toThrowError(
      'The authored name must fit the native editor',
    );
  });
});

function authoredApprovalPlan(example: readonly unknown[]): ResearchStep[] {
  const parsed = parseResearchPlanEvent({ steps: example });
  assert.ok(parsed, 'the canonical parser must retain an authored plan');
  assert.equal(parsed.length, example.length, 'the parser must retain every authored step');
  assert.deepEqual(parsed, example, 'the parser must preserve every authored step unchanged');
  assert.deepEqual(
    approvedResearchSteps(parsed),
    parsed,
    'every authored step must belong to the native pending-search approval plan',
  );
  return parsed;
}

function requiredNode(root: ParentNode, selector: string): Element {
  const node = root.querySelector(selector);
  assert.ok(node, `the correspondence witness requires ${selector}`);
  return node;
}

function nativeApprovalMarkup(steps: ResearchStep[]): HTMLElement {
  const research: MessageResearchState = { phase: 'awaiting_approval', steps };
  return draw(
    <ResearchActivity research={research} isStreaming={false} onPlanDecision={vi.fn()} />,
  );
}

function assertIllustratedSteps(illustration: ParentNode, steps: ResearchStep[]): void {
  const rows = [...illustration.querySelectorAll('.agi-scene-research-step')];
  assert.deepEqual(
    rows.map((row) => ({
      status: row.getAttribute('data-status'),
      description: requiredNode(row, '.agi-scene-input').textContent,
    })),
    steps.map(({ status, description }) => ({ status, description })),
    'the illustration must show every parsed step unchanged and in order',
  );
  assert.deepEqual(
    rows.map((row) => requiredNode(row, 'i').textContent),
    steps.map((_step, index) => String(index + 1)),
    'the illustration must number the steps as the native list does',
  );
}

function assertOwnerLabels(illustration: ParentNode, native: ParentNode): void {
  assert.equal(
    requiredNode(illustration, '.agi-scene-research-heading').textContent,
    requiredNode(native, '#research-plan-heading').textContent,
    'the illustration heading must match the native plan heading',
  );
  assert.equal(
    requiredNode(illustration, '.agi-scene-research-status').textContent,
    requiredNode(native, '[data-testid="research-activity"] > span').textContent,
    'the illustration phase must match the native awaiting-approval fallback',
  );
  assert.equal(
    requiredNode(illustration, '.agi-scene-research-sources').textContent,
    requiredNode(native, '[data-testid="research-plan-sources"] > p').textContent,
    'the illustration source scope must match the native unscoped line',
  );
  assert.equal(
    requiredNode(illustration, '.agi-scene-research-plan .agi-scene-help').textContent,
    requiredNode(native, '#research-plan-heading + p').textContent,
    'the illustration note must match the native plan explanation',
  );
  assert.equal(
    requiredNode(illustration, '.agi-scene-research-add').textContent,
    requiredNode(native, 'section[aria-labelledby="research-plan-heading"] > button').textContent,
    'the illustration add control must match the native one',
  );
  assert.equal(
    requiredNode(illustration, '.agi-scene-fieldset').getAttribute('data-legend'),
    requiredNode(native, 'fieldset > legend').textContent,
    'the illustration deliverable legend must match the native legend',
  );
  assert.deepEqual(
    [...illustration.querySelectorAll('.agi-scene-radios > span')].map((node) => [
      node.getAttribute('data-depth'),
      node.textContent,
    ]),
    [...native.querySelectorAll('fieldset input[type="radio"]')].map((node) => [
      node.getAttribute('value'),
      node.parentElement?.textContent,
    ]),
    'the illustration depths must match the native radio group',
  );
  assert.deepEqual(
    [...illustration.querySelectorAll('.agi-scene-research .agi-scene-btn')].map(
      (node) => node.textContent,
    ),
    [
      requiredNode(native, '[data-testid="research-plan-start"]').textContent,
      requiredNode(native, '[data-testid="research-plan-cancel"]').textContent,
    ],
    'illustrated actions must match the native approval actions',
  );
}

function assertNativeStartReady(container: HTMLElement): HTMLButtonElement {
  const button = within(container).getByTestId('research-plan-start');
  assert.ok(button instanceof HTMLButtonElement, 'native Start must be a button');
  assert.equal(button.disabled, false, 'native Start must be enabled for the authored example');
  return button;
}

describe('research plan corresponds to the native approval step', () => {
  it('retains the full example and matches the real awaiting-approval labels and fields', () => {
    const steps = authoredApprovalPlan(RESEARCH_SCENE_PLAN);
    const illustration = draw(<ResearchScenePreview />);
    const native = nativeApprovalMarkup(steps);

    assertIllustratedSteps(illustration, steps);
    assertOwnerLabels(illustration, native);
    assert.deepEqual(
      [...native.querySelectorAll('input[type="text"]')]
        .filter((input) => input.getAttribute('aria-label')?.startsWith('Research step '))
        .map((input) => input.getAttribute('value')),
      steps.map((step) => step.description),
      'the native editable plan must retain every illustrated description',
    );
    assert.ok(native.querySelector('[data-testid="research-plan-sources"] select'));
    assert.ok(native.querySelector('fieldset input[type="radio"]'));
    assert.ok(native.querySelector('fieldset select'));
    assert.ok(native.querySelector('fieldset input[type="checkbox"]'));

    const figure = requiredNode(illustration, 'figure.agi-app[data-scene="research"]');
    assert.match(figure.getAttribute('aria-label') ?? '', /^Authored example\b/u);
    assert.match(figure.getAttribute('aria-label') ?? '', /waiting to start/u);
    assert.equal(requiredNode(illustration, '.agi-app-window').getAttribute('aria-hidden'), 'true');
    assert.equal(illustration.querySelectorAll(LIVE_CONTROLS).length, 0);
    assert.equal(
      illustration.querySelectorAll('.agi-sc-report,.agi-sc-sources,.agi-mk-receipt').length,
      0,
    );
    assert.doesNotMatch(
      requiredNode(illustration, '.agi-app-thread').textContent ?? '',
      /Sources for this run|Citations|\[\d+\]|Searching\.\.\.|Report ready/u,
    );
  });

  it('starts the real editable plan with every example step and the deliverable shown', async () => {
    const steps = authoredApprovalPlan(RESEARCH_SCENE_PLAN);
    const onStart = vi.fn<(submission: ResearchPlanSubmission) => void>();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ResearchPlan steps={steps} editable onStart={onStart} onCancel={onCancel} />,
    );

    await user.click(assertNativeStartReady(container));
    expect(onStart).toHaveBeenCalledTimes(1);
    assert.deepEqual(onStart.mock.calls[0], [{ steps, deliverable: DEFAULT_RESEARCH_DELIVERABLE }]);

    const illustration = draw(<ResearchScenePreview />);
    const depth = one(
      Array.from(
        container.querySelectorAll<HTMLInputElement>(
          `fieldset input[type="radio"][value="${RESEARCH_SCENE_DEPTH}"]`,
        ),
      ),
      'native radio for the illustrated depth',
    );
    await user.click(depth);
    expect(depth.checked).toBe(true);
    expect(
      [...illustration.querySelectorAll('.agi-scene-radios > span')]
        .filter((node) => node.querySelector('.agi-scene-tick')?.hasAttribute('data-on'))
        .map((node) => node.getAttribute('data-depth')),
    ).toEqual([RESEARCH_SCENE_DEPTH]);
    expect(requiredNode(illustration, '.agi-scene-fieldset .agi-scene-help').textContent).toBe(
      requiredNode(container, 'fieldset > p').textContent,
    );
    await user.click(assertNativeStartReady(container));
    expect(onStart).toHaveBeenCalledTimes(2);
    assert.deepEqual(onStart.mock.calls[1], [
      { steps, deliverable: { ...DEFAULT_RESEARCH_DELIVERABLE, depth: RESEARCH_SCENE_DEPTH } },
    ]);

    await user.click(within(container).getByTestId('research-plan-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(2);
  });
});

describe('research correspondence negative witnesses', () => {
  it('rejects duplicate ids even when the parser returns a nonempty plan', () => {
    const source = authoredApprovalPlan(RESEARCH_SCENE_PLAN);
    const first = source[0];
    assert.ok(first && source.length > 1, 'the duplicate-id witness requires two authored steps');
    const example = source.map((step, index) => (index === 1 ? { ...step, id: first.id } : step));
    assert.throws(() => authoredApprovalPlan(example), {
      name: 'AssertionError',
      message: /the parser must retain every authored step/u,
    });
  });

  it('rejects queued as a step status instead of treating a run label as the contract', () => {
    const source = authoredApprovalPlan(RESEARCH_SCENE_PLAN);
    const example = source.map((step, index) =>
      index === 0 ? { ...step, status: 'queued' } : step,
    );
    assert.throws(() => authoredApprovalPlan(example), {
      name: 'AssertionError',
      message: /the parser must retain every authored step/u,
    });
  });

  it.each([
    ['completed search', { status: 'completed' }],
    ['pending analyze', { type: 'analyze' }],
  ] as const)(
    'rejects a %s that canonical parsing accepts but native approval drops',
    (_name, change) => {
      const source = authoredApprovalPlan(RESEARCH_SCENE_PLAN);
      const example = source.map((step, index) => (index === 0 ? { ...step, ...change } : step));
      assert.throws(() => authoredApprovalPlan(example), {
        name: 'AssertionError',
        message: /every authored step must belong to the native pending-search approval plan/u,
      });
    },
  );

  it('rejects an all-blank plan through the real disabled Start control', async () => {
    const source = authoredApprovalPlan(RESEARCH_SCENE_PLAN);
    const steps = authoredApprovalPlan(source.map((step) => ({ ...step, description: ' \t\n ' })));
    const onStart = vi.fn<(submission: ResearchPlanSubmission) => void>();
    const { container } = render(<ResearchPlan steps={steps} editable onStart={onStart} />);
    assert.throws(() => assertNativeStartReady(container), {
      name: 'AssertionError',
      message: /native Start must be enabled for the authored example/u,
    });
    await userEvent.setup().click(within(container).getByTestId('research-plan-start'));
    expect(onStart).not.toHaveBeenCalled();
  });

  it.each(['changed description', 'missing row'] as const)(
    'rejects a parser/illustration mismatch caused by a %s',
    (mutation) => {
      const steps = authoredApprovalPlan(RESEARCH_SCENE_PLAN);
      const illustration = draw(<ResearchScenePreview />);
      const row = requiredNode(illustration, '.agi-scene-research-step');
      if (mutation === 'missing row') row.remove();
      else requiredNode(row, '.agi-scene-input').textContent = 'A completed report was generated.';
      assert.throws(() => assertIllustratedSteps(illustration, steps), {
        name: 'AssertionError',
        message: /the illustration must show every parsed step unchanged and in order/u,
      });
    },
  );

  it('rejects a changed Start label against the real native renderer', () => {
    const steps = authoredApprovalPlan(RESEARCH_SCENE_PLAN);
    const illustration = draw(<ResearchScenePreview />);
    requiredNode(illustration, '.agi-scene-research .agi-scene-btn').textContent = 'Run report';
    assert.throws(() => assertOwnerLabels(illustration, nativeApprovalMarkup(steps)), {
      name: 'AssertionError',
      message: /illustrated actions must match the native approval actions/u,
    });
  });
});
