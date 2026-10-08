import './scene-preview.css';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  BarChart3,
  Boxes,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Code,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  Folder,
  FolderDown,
  FolderPlus,
  Gavel,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Library,
  ListChecks,
  Mail,
  Maximize2,
  MoreHorizontal,
  PanelRightOpen,
  PauseCircle,
  Pin,
  Play,
  PlugZap,
  Plus,
  Puzzle,
  ScrollText,
  Search,
  Server,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Telescope,
  Terminal,
  Trash2,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  getToolDisplayLabel,
  TOOL_APPROVAL_ACTION_LABELS,
  type ManagedMemoryCreateRequest,
  type ResearchDeliverableDepth,
  type ResearchStep,
} from '@agiworkforce/types';
import { WEB_SETTINGS_NAV_GROUPS } from '@/features/settings/components/web-settings-navigation';
import { WRITE_FILE_TOOL } from '@/lib/e2b/execution-tools';
import { AppComposer, AppSidebar, PreviewRoot, ReplyActions, TrafficLights } from './AppPreviews';

function BrowserChrome({ url }: { url: string }) {
  return (
    <div className="agi-app-chrome">
      <TrafficLights />
      <span className="agi-app-url">{url}</span>
    </div>
  );
}

function SceneShell({
  scene,
  label,
  className,
  url = 'agiworkforce.com/chat',
  chats,
  activeId,
  overlay,
  children,
}: {
  scene: string;
  label: string;
  className?: string;
  url?: string;
  chats: readonly string[];
  activeId?: string;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PreviewRoot kind="web" scene={scene} label={label} className={className}>
      <BrowserChrome url={url} />
      <div className="agi-scene-stage">
        <div className="agi-app-shell">
          <AppSidebar chats={chats} activeId={activeId} />
          {children}
        </div>
        {overlay}
      </div>
    </PreviewRoot>
  );
}

function Tick({ on = false, round = false }: { on?: boolean; round?: boolean }) {
  return (
    <span className="agi-scene-tick" data-on={on || undefined} data-round={round || undefined}>
      {on && !round ? <Check className="agi-scene-tick-mark" /> : null}
    </span>
  );
}

function Toggle({ on = false }: { on?: boolean }) {
  return (
    <span className="agi-scene-switch" data-on={on || undefined}>
      <i />
    </span>
  );
}

function Picker({ value, wide = false }: { value: string; wide?: boolean }) {
  return (
    <span className="agi-scene-picker" data-wide={wide || undefined}>
      {value}
      <ChevronDown className="agi-app-icon agi-app-icon--sm" />
    </span>
  );
}

const ARTIFACT_PAGES = [
  { title: 'Project notes', body: 'Keep the next steps together.' },
  { title: 'Next steps', body: 'Confirm the outline, then draft the first section.' },
] as const;
const ARTIFACT_PAGE = ARTIFACT_PAGES[0];

export const ARTIFACT_SCENE_MESSAGE = ARTIFACT_PAGES.map((page) =>
  [
    '```html',
    '<!-- @artifact -->',
    '<!doctype html>',
    '<html lang="en">',
    `<head><title>${page.title}</title></head>`,
    '<body>',
    `  <h1>${page.title}</h1>`,
    `  <p>${page.body}</p>`,
    '</body>',
    '</html>',
    '```',
  ].join('\n'),
).join('\n\n');
const ARTIFACT_ACTIONS: readonly LucideIcon[] = [Copy, Download, FolderPlus, Library, Maximize2, X];

export function ArtifactScenePreview({ className }: { className?: string }) {
  return (
    <PreviewRoot
      kind="web"
      scene="artifact"
      label="Authored example of an artifact open beside a chat"
      className={className}
    >
      <BrowserChrome url="agiworkforce.com/chat" />
      <div className="agi-scene-split">
        <div className="agi-app-main agi-scene-narrow">
          <div className="agi-app-thread">
            <p className="agi-app-user">Make a page for my project notes.</p>
            <div className="agi-app-reply">
              <p>Here are two pages: the notes, and the next steps on their own.</p>
              <div className="agi-scene-cards">
                {ARTIFACT_PAGES.map((page) => (
                  <span key={page.title} className="agi-scene-card">
                    <span className="agi-scene-card-thumb" data-page="true">
                      <b />
                      <i />
                      <i />
                    </span>
                    <span className="agi-scene-card-text">
                      <span className="agi-scene-card-head">
                        <span className="agi-scene-card-title">{page.title}</span>
                        <span className="agi-scene-badge">HTML</span>
                      </span>
                      <span className="agi-scene-card-sub">Code · HTML</span>
                    </span>
                  </span>
                ))}
                <span className="agi-scene-ghost">
                  <FolderDown className="agi-scene-icon" />
                  Download all
                </span>
              </div>
              <ReplyActions />
            </div>
          </div>
          <AppComposer />
        </div>
        <aside className="agi-scene-artifacts">
          <div className="agi-scene-artifacts-strip">
            <PanelRightOpen className="agi-app-icon agi-app-quiet" />
            <span className="agi-scene-artifacts-title">Artifacts</span>
            <span className="agi-scene-count">{ARTIFACT_PAGES.length}</span>
            <span className="agi-scene-strip-action agi-app-end">
              <FolderDown className="agi-scene-icon" />
              Download all
            </span>
          </div>
          <div className="agi-scene-artifacts-bar">
            <span className="agi-scene-viewtoggle">
              <span data-on="true" data-view="Preview">
                <Eye className="agi-scene-icon" />
              </span>
              <span data-view="Source">
                <Code className="agi-scene-icon" />
              </span>
            </span>
            <Globe className="agi-app-icon agi-app-quiet" />
            <span className="agi-scene-artifact-name">{ARTIFACT_PAGE.title}</span>
            <span className="agi-scene-artifact-type">· HTML</span>
            <span className="agi-scene-version">
              <ChevronLeft className="agi-scene-icon" />
              <span>v1/1</span>
              <ChevronRight className="agi-scene-icon" />
            </span>
            <span className="agi-scene-artifact-actions agi-app-end">
              {ARTIFACT_ACTIONS.map((Icon, index) => (
                <span key={index}>
                  <Icon className="agi-scene-icon" />
                </span>
              ))}
            </span>
          </div>
          <div className="agi-scene-artifact-page">
            <span className="agi-scene-artifact-heading">{ARTIFACT_PAGE.title}</span>
            <span className="agi-scene-artifact-body">{ARTIFACT_PAGE.body}</span>
          </div>
        </aside>
      </div>
    </PreviewRoot>
  );
}

export const PROJECT_SCENE_DRAFT = {
  name: 'Investor deck',
  instructions:
    'Keep answers concise. Ask for sources before stating metrics. Do not invent customer names.',
} as const;
const PROJECT = PROJECT_SCENE_DRAFT;
const PROJECT_SIDEBAR_CHATS = ['Deck outline', 'Market size notes', 'Speaker notes'];
const PROJECT_TABS = ['Chats', 'Artifacts', 'Work', 'Sources', 'Scheduled'];
const PROJECT_CHATS = [
  ['Deck outline', 'Yesterday'],
  ['Market size notes', 'Mon'],
  ['Speaker notes', 'Sep 24'],
] as const;

function ProjectSettingsDialog() {
  return (
    <>
      <span className="agi-scene-scrim" />
      <div className="agi-scene-dialog" data-dialog="project-settings">
        <div className="agi-scene-dialog-head">
          <span className="agi-scene-dialog-title">Project settings</span>
          <span className="agi-scene-close">
            <X className="agi-app-icon" />
          </span>
        </div>
        <div className="agi-scene-dialog-body">
          <div className="agi-scene-formrow">
            <span className="agi-scene-caps">Project name</span>
            <span className="agi-scene-input" data-tall="true" data-field="name">
              <Smile className="agi-app-icon agi-app-quiet" />
              {PROJECT.name}
            </span>
          </div>
          <div className="agi-scene-formrow">
            <span className="agi-scene-caps">Description</span>
            <span
              className="agi-scene-input"
              data-rows="2"
              data-empty="true"
              data-field="description"
            >
              What is this project for?
            </span>
          </div>
          <div className="agi-scene-formrow">
            <span className="agi-scene-caps">Instructions</span>
            <span className="agi-scene-help">
              Set context and customize how AGI responds in this project.
            </span>
            <span className="agi-scene-input" data-rows="5" data-field="instructions">
              {PROJECT.instructions}
            </span>
          </div>
          <div className="agi-scene-formrow">
            <span className="agi-scene-caps">Memory</span>
            <span className="agi-scene-checkrow">
              <Tick on />
              <span>
                <span className="agi-scene-checkrow-label">
                  Use memories from outside this project
                </span>
                <span className="agi-scene-help">
                  Chats here draw on what has been remembered account-wide, and anything learned
                  here stays in this project.
                </span>
              </span>
            </span>
          </div>
        </div>
        <div className="agi-scene-dialog-foot">
          <span className="agi-scene-textbtn" data-danger="true">
            <Trash2 className="agi-app-icon" />
            Delete project
          </span>
          <span className="agi-scene-dialog-foot-mid">
            <span className="agi-scene-textbtn">
              <Copy className="agi-app-icon" />
              Duplicate
            </span>
            <span className="agi-scene-textbtn">
              <Download className="agi-app-icon" />
              Export
            </span>
          </span>
          <span className="agi-scene-btn" data-ink="true" data-size="lg">
            Save
          </span>
        </div>
      </div>
    </>
  );
}

export function ProjectScenePreview({ className }: { className?: string }) {
  return (
    <SceneShell
      scene="project"
      label="Authored example of a project page with its settings open"
      className={className}
      url="agiworkforce.com/chat/projects"
      chats={PROJECT_SIDEBAR_CHATS}
      activeId="projects"
      overlay={<ProjectSettingsDialog />}
    >
      <div className="agi-scene-project">
        <div className="agi-scene-project-top">
          <span className="agi-scene-project-back" data-action="Back to projects">
            ←
          </span>
          <span className="agi-scene-project-more">
            <MoreHorizontal className="agi-app-icon agi-app-icon--lg" />
          </span>
        </div>
        <div className="agi-scene-project-hero">
          <span className="agi-scene-project-badge">
            <Folder className="agi-scene-project-glyph" />
          </span>
          <span className="agi-scene-project-name">{PROJECT.name}</span>
        </div>
        <AppComposer placeholder={`New chat in ${PROJECT.name}`} />
        <div className="agi-scene-tabs">
          {PROJECT_TABS.map((tab, index) => (
            <span key={tab} data-on={index === 0 || undefined}>
              {tab}
            </span>
          ))}
        </div>
        <div className="agi-scene-project-chats">
          {PROJECT_CHATS.map(([title, date]) => (
            <span key={title} className="agi-scene-project-chat">
              <span>{title}</span>
              <i>{date}</i>
            </span>
          ))}
        </div>
      </div>
    </SceneShell>
  );
}

export type MemorySceneView = 'controls' | 'facts';

const MEMORY_SIDEBAR_CHATS = ['Weekly plan', 'Trip packing list', 'Release notes'];
const MEMORY_FACTS = [
  { request: { content: 'I prefer concise answers.', source: 'web' }, age: '2h ago' },
  { request: { content: 'My reports use British spelling.', source: 'web' }, age: '2h ago' },
  { request: { content: 'Our team plans in two-week sprints.', source: 'web' }, age: '3d ago' },
  { request: { content: 'I work in Pacific time.', source: 'web' }, age: '5d ago' },
  { request: { content: 'I use metric units.', source: 'web' }, age: '12d ago' },
] as const satisfies ReadonlyArray<{ request: ManagedMemoryCreateRequest; age: string }>;

export const MEMORY_SCENE_REQUESTS: readonly ManagedMemoryCreateRequest[] = MEMORY_FACTS.map(
  (fact) => fact.request,
);
const MEMORY_TOGGLES = [
  [
    'Save memories from chats',
    'Let AGI save lasting details you mention in a chat without being asked. When this is off, it saves only what you ask it to remember.',
    true,
  ],
  [
    'Search past chats',
    'Let AGI look up excerpts from your other conversations when answering. Never used in temporary chats.',
    true,
  ],
  [
    'Allow memory generation from tool-assisted chats',
    'Create memories from chats that use tools, connectors, code, or web search',
    false,
  ],
] as const;

function MemoryControls() {
  return (
    <>
      <div className="agi-scene-pane-head">
        <span className="agi-scene-pane-title">Memory</span>
        <span className="agi-scene-pane-lede">
          Facts the assistant should remember about you across conversations. Stored on this device,
          and synced to your account across devices when you&apos;re signed in.
        </span>
        <span className="agi-scene-helplink">
          <CircleHelp className="agi-scene-icon" />
          How memory works
        </span>
      </div>
      <div className="agi-scene-panel">
        <div className="agi-scene-setting">
          <span>
            <span className="agi-scene-setting-title">Persistent memory</span>
            <span className="agi-scene-setting-note">
              Allow AGI to remember details across conversations
            </span>
          </span>
          <Toggle on />
        </div>
        <div className="agi-scene-memory-count">
          <span>{MEMORY_FACTS.length} saved memories</span>
          <span className="agi-scene-btnrow">
            <span className="agi-scene-btn">Import memories</span>
            <span className="agi-scene-btn">Manage memories</span>
            <span className="agi-scene-btn" data-danger="true">
              Clear all memories
            </span>
          </span>
        </div>
      </div>
      <div className="agi-scene-settings">
        {MEMORY_TOGGLES.map(([title, note, on]) => (
          <div key={title} className="agi-scene-setting">
            <span>
              <span className="agi-scene-setting-title">{title}</span>
              <span className="agi-scene-setting-note">{note}</span>
            </span>
            <Toggle on={on} />
          </div>
        ))}
      </div>
    </>
  );
}

function MemoryFacts() {
  return (
    <div className="agi-scene-panel agi-scene-editor">
      <div className="agi-scene-editor-add">
        <span className="agi-scene-editor-label">Add a new fact</span>
        <span className="agi-scene-editor-row">
          <span className="agi-scene-input" data-rows="2" data-empty="true">
            Example: I prefer Python over JavaScript for data work.
          </span>
          <span className="agi-scene-btn" data-size="md" data-idle="true">
            Add
          </span>
        </span>
        <span className="agi-scene-editor-count">0 / 280</span>
      </div>
      <span className="agi-scene-input" data-empty="true">
        Search memory
      </span>
      <div className="agi-scene-facts">
        {MEMORY_FACTS.map(({ request, age }) => (
          <span key={request.content} className="agi-scene-fact">
            <span>{request.content}</span>
            <span className="agi-scene-fact-foot">
              <span>Added by you {age}</span>
              <span className="agi-scene-fact-actions">
                <Pin className="agi-app-icon agi-app-icon--sm" />
                <Trash2 className="agi-app-icon agi-app-icon--sm" />
              </span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MemoryScenePreview({
  className,
  view = 'controls',
}: {
  className?: string;
  view?: MemorySceneView;
}) {
  return (
    <SceneShell
      scene={`memory-${view}`}
      label="Authored example of the Memory settings in AGI Web"
      className={className}
      chats={MEMORY_SIDEBAR_CHATS}
      overlay={
        <>
          <span className="agi-scene-scrim" />
          <div className="agi-scene-settings-dialog" data-dialog="settings">
            <div className="agi-scene-settings-nav">
              <span className="agi-scene-dialog-title">Settings</span>
              <span className="agi-scene-input agi-scene-settings-search" data-empty="true">
                <Search className="agi-scene-icon" />
                Search
              </span>
              <div className="agi-scene-settings-groups">
                {WEB_SETTINGS_NAV_GROUPS.map((group, index) => (
                  <div key={group.label ?? index} className="agi-scene-settings-group">
                    <span className="agi-scene-settings-group-label">{group.label}</span>
                    {group.items.map(({ key, label, icon: Icon }) => (
                      <span
                        key={key}
                        className="agi-scene-settings-item"
                        data-active={key === 'memory' || undefined}
                      >
                        <Icon className="agi-app-icon" />
                        {label}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="agi-scene-settings-pane" data-view={view}>
              {view === 'facts' ? <MemoryFacts /> : <MemoryControls />}
            </div>
            <span className="agi-scene-close">
              <X className="agi-app-icon" />
            </span>
          </div>
        </>
      }
    >
      <div className="agi-app-main">
        <div className="agi-app-thread" />
        <AppComposer />
      </div>
    </SceneShell>
  );
}

const RESEARCH_SIDEBAR_CHATS = ['Planning tools for a team', 'Weekly plan', 'Release notes'];
export const RESEARCH_SCENE_PLAN = [
  {
    id: 'example-planning',
    type: 'search',
    description: 'Find tools for planning tasks and tracking progress.',
    status: 'pending',
  },
  {
    id: 'example-collaboration',
    type: 'search',
    description: 'Compare collaboration and sharing options.',
    status: 'pending',
  },
  {
    id: 'example-documentation',
    type: 'search',
    description: "Check each tool's published documentation.",
    status: 'pending',
  },
] as const satisfies readonly ResearchStep[];

export const RESEARCH_SCENE_DEPTH: ResearchDeliverableDepth = 'executive-summary';

const RESEARCH_DEPTHS: ReadonlyArray<readonly [ResearchDeliverableDepth, string]> = [
  ['executive-summary', 'Executive summary'],
  ['full-report', 'Full report'],
];

export function ResearchScenePreview({ className }: { className?: string }) {
  return (
    <SceneShell
      scene="research"
      label="Authored example of a research plan waiting to start"
      className={className}
      chats={RESEARCH_SIDEBAR_CHATS}
    >
      <div className="agi-app-main">
        <div className="agi-app-thread agi-scene-thread">
          <p className="agi-app-user">Compare project planning tools for a small team.</p>
          <div className="agi-scene-research">
            <div className="agi-scene-research-status">
              <ListChecks className="agi-scene-icon" />
              Review the plan to start searching
            </div>
            <div className="agi-scene-research-sources">
              Searching the whole web. Add a source to narrow it.
            </div>
            <div className="agi-scene-research-plan">
              <div>
                <span className="agi-scene-research-heading">Research plan</span>
                <span className="agi-scene-help">
                  Edit any step before it runs. What you start here is exactly what gets searched,
                  and it spends your budget.
                </span>
              </div>
              <div className="agi-scene-research-steps">
                {RESEARCH_SCENE_PLAN.map((step, index) => (
                  <span key={step.id} className="agi-scene-research-step" data-status={step.status}>
                    <i>{index + 1}</i>
                    <span className="agi-scene-input">{step.description}</span>
                    <X className="agi-scene-icon" />
                  </span>
                ))}
              </div>
              <span className="agi-scene-research-add">
                <Plus className="agi-app-icon agi-app-icon--sm" />
                Add a step
              </span>
              <div className="agi-scene-fieldset" data-legend="Deliverable">
                <span className="agi-scene-radios">
                  {RESEARCH_DEPTHS.map(([depth, label]) => (
                    <span key={depth} data-depth={depth}>
                      <Tick round on={depth === RESEARCH_SCENE_DEPTH} />
                      {label}
                    </span>
                  ))}
                </span>
                <span className="agi-scene-help">
                  The answer in a page, only what changes a decision.
                </span>
              </div>
              <span className="agi-scene-btnrow">
                <span className="agi-scene-btn" data-ink="true" data-size="sm">
                  Start research
                </span>
                <span className="agi-scene-btn" data-size="sm">
                  Cancel
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="agi-scene-composer agi-scene-composer--chip">
          <AppComposer>
            <span className="agi-scene-modechip">
              <Telescope className="agi-app-icon" />
              Deep Research
            </span>
          </AppComposer>
        </div>
      </div>
    </SceneShell>
  );
}

const APPROVAL_SIDEBAR_CHATS = ['Project report notes', 'Weekly plan', 'Release notes'];
export const APPROVAL_SCENE_REQUEST = {
  path: 'report.txt',
  content: 'Notes for the project report.',
} as const;
const APPROVAL_ACTIONS = [
  TOOL_APPROVAL_ACTION_LABELS.allow,
  TOOL_APPROVAL_ACTION_LABELS.allowForChat,
  TOOL_APPROVAL_ACTION_LABELS.deny,
];

export function ApprovalScenePreview({ className }: { className?: string }) {
  return (
    <SceneShell
      scene="approval"
      label="Authored example of a tool waiting for approval in a chat"
      className={className}
      chats={APPROVAL_SIDEBAR_CHATS}
    >
      <div className="agi-app-main">
        <div className="agi-app-thread">
          <p className="agi-app-user">Save these notes as report.txt.</p>
          <div className="agi-app-reply">
            <p>I will write the notes to report.txt once you approve the step below.</p>
            <div className="agi-scene-tool">
              <div className="agi-scene-tool-bar">
                <span className="agi-scene-tool-badge">F</span>
                <span className="agi-scene-tool-name">
                  {getToolDisplayLabel(WRITE_FILE_TOOL).displayName}
                </span>
                <span className="agi-scene-tool-status agi-app-end">Waiting for your approval</span>
                <PauseCircle className="agi-scene-icon" />
                <ChevronDown className="agi-scene-icon agi-app-quiet" />
              </div>
              <div className="agi-scene-tool-body">
                <div className="agi-scene-tool-banner">
                  <AlertCircle className="agi-scene-icon" />
                  <span>This tool requires approval before execution.</span>
                  <span className="agi-scene-tool-actions">
                    {APPROVAL_ACTIONS.map((action, index) => (
                      <span
                        key={action}
                        className="agi-scene-btn"
                        data-size="xs"
                        data-ink={index === 0 || undefined}
                      >
                        {index === 0 ? <Play className="agi-scene-tool-play" /> : null}
                        {action}
                      </span>
                    ))}
                  </span>
                </div>
                <div>
                  <span className="agi-scene-tool-label">Request</span>
                  <pre className="agi-scene-tool-request">
                    {JSON.stringify(APPROVAL_SCENE_REQUEST, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
        <AppComposer />
      </div>
    </SceneShell>
  );
}

export type ConsoleSceneView = 'members' | 'policy' | 'audit';

const CONSOLE_NAV: ReadonlyArray<{
  title: string;
  links: ReadonlyArray<readonly [label: string, hint: string, icon: LucideIcon]>;
}> = [
  {
    title: 'Workspace',
    links: [['Overview', 'Security posture and recommendations', ShieldCheck]],
  },
  {
    title: 'People',
    links: [
      ['Members', 'Roles, invitations, seats', Users],
      ['Roles', 'Permissions, custom roles, groups', UserCog],
      ['Identity', 'SSO, domains, SCIM provisioning', KeyRound],
    ],
  },
  {
    title: 'Controls',
    links: [
      ['Policy', 'Privacy, compute, features, exceptions', SlidersHorizontal],
      ['Models', 'Approved models and providers', Boxes],
      ['Connectors', 'Approved integrations and websites', PlugZap],
      ['Code', 'GitHub, MCP servers, desktop sync, review', Terminal],
      ['MCP servers', 'Servers this workspace publishes to its members', Server],
      ['Plugins', 'Plugins this workspace publishes, and who gets them', Puzzle],
      ['Sharing', 'Shared projects, conversations, artifacts and connectors', Share2],
    ],
  },
  {
    title: 'Records',
    links: [
      ['Audit', 'Trail and export', ScrollText],
      ['Data', 'Legal holds and retention sweeps', Gavel],
      ['Usage', 'Spend by member, model, provider', BarChart3],
      ['Billing', 'Plan, seats, invoices', CreditCard],
    ],
  },
];

const CONSOLE_PAGES: Record<
  ConsoleSceneView,
  { path: string; active: string; title: string; lede: string }
> = {
  members: {
    path: '/workspace/people',
    active: 'Members',
    title: 'Members',
    lede: 'Who belongs to this workspace, what role they hold, and how many seats that consumes.',
  },
  policy: {
    path: '/workspace/policy',
    active: 'Policy',
    title: 'Policy',
    lede: 'What members of this workspace may run, where their chats may sync, and how long records are kept.',
  },
  audit: {
    path: '/workspace/audit',
    active: 'Audit',
    title: 'Audit',
    lede: 'Administrative, policy, and access events for this workspace. Writes go through a security-definer function, so this record cannot be edited from the application.',
  },
};

const CONSOLE_MEMBERS = [
  { name: 'A. Okafor', role: 'Owner', email: 'a.okafor@example.com', self: true },
  { name: 'J. Lindqvist', role: 'Admin', email: 'j.lindqvist@example.com', self: false },
  { name: 'M. Ferreira', role: 'Member', email: 'm.ferreira@example.com', self: false },
  { name: 'R. Nakamura', role: 'Member', email: 'r.nakamura@example.com', self: false },
  { name: 'S. Adeyemi', role: 'Viewer', email: 's.adeyemi@example.com', self: false },
] as const;

function ConsoleMembers() {
  return (
    <>
      <div className="agi-scene-sheet">
        <div className="agi-scene-sheet-head">
          <span className="agi-scene-sheet-title">Invite teammate</span>
          <span className="agi-scene-sheet-note">Invitations expire after 7 days.</span>
        </div>
        <div className="agi-scene-invite">
          <span className="agi-scene-invite-field" data-grow="true">
            Email address
            <span className="agi-scene-input" data-control="true" />
          </span>
          <span className="agi-scene-invite-field">
            Role
            <Picker value="Member role" wide />
          </span>
          <span className="agi-scene-btn" data-ink="true" data-size="control">
            <Mail className="agi-scene-icon" />
            Create invitation
          </span>
        </div>
      </div>
      <div className="agi-scene-sheet">
        <div className="agi-scene-sheet-head">
          <span className="agi-scene-sheet-title">Members</span>
          <span className="agi-scene-sheet-note">{CONSOLE_MEMBERS.length} active members</span>
        </div>
        {CONSOLE_MEMBERS.map((member) => (
          <div key={member.email} className="agi-scene-member">
            <span className="agi-scene-avatar">{member.name.slice(0, 2).toUpperCase()}</span>
            <span className="agi-scene-member-id">
              <span className="agi-scene-member-name">
                {member.name}
                {member.self ? <i> (you)</i> : null}
              </span>
              <span className="agi-scene-member-email">{member.email}</span>
            </span>
            {member.self ? (
              <span className="agi-scene-member-role">{member.role} role</span>
            ) : (
              <>
                <Picker value={`${member.role} role`} wide />
                <span className="agi-scene-remove">
                  <Trash2 className="agi-scene-icon" />
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

const CONSOLE_POLICY: ReadonlyArray<
  readonly [title: string, note: string, control: boolean | string]
> = [
  [
    'AGI-managed cloud compute',
    'When off, members of this workspace cannot run managed turns, images, video, embeddings, or transcription.',
    true,
  ],
  [
    'Default privacy mode',
    'What a new conversation starts in for members of this workspace.',
    'Managed Cloud',
  ],
  [
    'Public sharing',
    'Members may publish a chat or an artifact to an anonymous public link.',
    true,
  ],
  [
    'Memory',
    'Members may use account memory. Each member still controls their own memory in personal settings.',
    true,
  ],
  [
    'Secrets typed into chat',
    'The secret is removed from the message before it is sent, and the member is told how many were removed.',
    'Redact',
  ],
];

function ConsolePolicy() {
  return (
    <div className="agi-scene-sheet">
      <div className="agi-scene-sheet-head">
        <span className="agi-scene-sheet-heading">
          <ShieldCheck className="agi-scene-icon" />
          Workspace policy
        </span>
        <span className="agi-scene-sheet-note" data-gap="true">
          These rules bind every member of this workspace. Personal accounts are unaffected.
        </span>
      </div>
      {CONSOLE_POLICY.map(([title, note, control]) => (
        <div key={title} className="agi-scene-rule">
          <span>
            <span className="agi-scene-rule-title">{title}</span>
            <span className="agi-scene-sheet-note">{note}</span>
          </span>
          {typeof control === 'string' ? <Picker value={control} /> : <Tick on={control} />}
        </div>
      ))}
      <div className="agi-scene-sheet-foot">
        <span className="agi-scene-sheet-note">Last changed 9/29/2026, 10:42:07 AM</span>
        <span className="agi-scene-btn" data-size="sm">
          Save policy
        </span>
      </div>
    </div>
  );
}

const CONSOLE_AUDIT_COLUMNS = ['When', 'Actor', 'Action', 'Resource', 'Surface', 'Outcome'];
const CONSOLE_AUDIT = [
  ['Example', 'example-owner', 'admin_policy_changed', 'organization', 'web', 'success'],
  ['Example', 'system', 'scim_user_provisioned', 'scim_provisioned_user', 'web', 'success'],
  ['Example', 'example-admin', 'data_exported', 'enterprise_audit_events', 'web', 'denied'],
  ['Example', 'example-owner', 'admin_policy_changed', 'organization', 'web', 'failure'],
] as const;
const CONSOLE_AUDIT_FILTERS = ['All actions', 'All outcomes', 'All severities'];

function ConsoleAudit() {
  return (
    <div className="agi-scene-sheet">
      <div className="agi-scene-sheet-head" data-split="true">
        <span>
          <span className="agi-scene-sheet-heading">
            <ScrollText className="agi-scene-icon" />
            Audit trail
          </span>
          <span className="agi-scene-sheet-note" data-gap="true">
            Administrative and identity events for this workspace. Append-only, entries cannot be
            edited or removed, including by an owner. Exporting is itself recorded here.
          </span>
        </span>
        <span className="agi-scene-picker" data-export="true">
          <Download className="agi-app-icon agi-app-icon--sm" />
          Export JSONL
        </span>
      </div>
      <div className="agi-scene-filters">
        {CONSOLE_AUDIT_FILTERS.map((filter) => (
          <Picker key={filter} value={filter} />
        ))}
      </div>
      <div className="agi-scene-audit">
        {CONSOLE_AUDIT_COLUMNS.map((column) => (
          <span key={column} className="agi-scene-audit-th">
            {column}
          </span>
        ))}
        {CONSOLE_AUDIT.flatMap(([when, actor, action, resource, surface, outcome], row) => [
          <span key={`${row}when`}>{when}</span>,
          <span key={`${row}actor`}>{actor}</span>,
          <span key={`${row}action`} data-strong="true">
            {action}
          </span>,
          <span key={`${row}resource`}>{resource}</span>,
          <span key={`${row}surface`} className="agi-app-quiet">
            {surface}
          </span>,
          <span key={`${row}outcome`}>
            <span className="agi-scene-outcome" data-outcome={outcome}>
              {outcome}
            </span>
          </span>,
        ])}
      </div>
      <div className="agi-scene-sheet-foot">
        <span className="agi-scene-sheet-note">
          Showing the most recent {CONSOLE_AUDIT.length}. Export for the full range.
        </span>
      </div>
    </div>
  );
}

export function ConsoleScenePreview({
  className,
  view = 'members',
}: {
  className?: string;
  view?: ConsoleSceneView;
}) {
  const page = CONSOLE_PAGES[view];
  return (
    <PreviewRoot
      kind="web"
      scene={`console-${view}`}
      label="Authored example of the AGI workspace console"
      className={className}
    >
      <BrowserChrome url={`agiworkforce.com${page.path}`} />
      <div className="agi-scene-console">
        <aside className="agi-scene-console-side">
          <span className="agi-scene-console-eyebrow">Administration</span>
          <span className="agi-scene-console-name">Workspace</span>
          <nav className="agi-scene-console-nav">
            {CONSOLE_NAV.map((section) => (
              <div key={section.title} className="agi-scene-console-group">
                <span className="agi-scene-console-group-title">{section.title}</span>
                {section.links.map(([label, hint, Icon]) => (
                  <span
                    key={label}
                    className="agi-scene-console-link"
                    data-active={label === page.active || undefined}
                  >
                    <Icon className="agi-app-icon" />
                    <span>
                      <b>{label}</b>
                      <i>{hint}</i>
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <div className="agi-scene-console-main">
          <div className="agi-scene-console-head">
            <span className="agi-scene-console-title">{page.title}</span>
            <span className="agi-scene-pane-lede">{page.lede}</span>
          </div>
          {view === 'members' ? <ConsoleMembers /> : null}
          {view === 'policy' ? <ConsolePolicy /> : null}
          {view === 'audit' ? <ConsoleAudit /> : null}
        </div>
      </div>
    </PreviewRoot>
  );
}

export type ComposerSceneView = 'commands' | 'attachments';

const COMPOSER_SIDEBAR_CHATS = ['Deck review', 'Weekly plan', 'Release notes'];
const SLASH_COMMANDS: ReadonlyArray<
  readonly [command: string, description: string, example: string, icon: LucideIcon]
> = [
  ['/search', 'Search the web', '/search latest AI news', Globe],
  ['/think', 'Extended reasoning', '/think solve this problem step by step', Brain],
  ['/image', 'Generate an image', '/image a futuristic city at dusk', ImageIcon],
  ['/code', 'Run code in a sandbox', '/code chart the first 20 prime numbers', Code],
];

export function ComposerScenePreview({
  className,
  view = 'commands',
}: {
  className?: string;
  view?: ComposerSceneView;
}) {
  return (
    <SceneShell
      scene={`composer-${view}`}
      label="Authored example of the AGI Web composer"
      className={className}
      chats={COMPOSER_SIDEBAR_CHATS}
    >
      <div className="agi-app-main">
        <div className="agi-app-thread">
          <p className="agi-app-user">Which slide should open the deck?</p>
          <div className="agi-app-reply">
            <p>Open with the problem slide. It gives the numbers that follow a reason to matter.</p>
            <ReplyActions />
          </div>
        </div>
        <div className="agi-scene-composer">
          {view === 'commands' ? (
            <div className="agi-scene-slash" data-menu="Slash command suggestions">
              {SLASH_COMMANDS.map(([command, description, example, Icon], index) => (
                <span
                  key={command}
                  className="agi-scene-slash-row"
                  data-active={index === 0 || undefined}
                >
                  <Icon className="agi-app-icon agi-app-quiet" />
                  <span>
                    <span className="agi-scene-slash-line">
                      <code>{command}</code>
                      <i>{description}</i>
                    </span>
                    <i>{example}</i>
                  </span>
                </span>
              ))}
              <span className="agi-scene-slash-foot">
                Use arrow keys to navigate, Enter to select, Esc to close
              </span>
            </div>
          ) : (
            <div className="agi-scene-attachments">
              <span className="agi-scene-attachment">
                <span className="agi-scene-attachment-file">
                  <FileText className="agi-app-icon agi-app-quiet" />
                  <span>
                    <b>deck-v7.pdf</b>
                    <i>2.4 MB</i>
                  </span>
                </span>
                <span className="agi-scene-attachment-remove">
                  <X className="agi-app-icon" />
                </span>
              </span>
              <span className="agi-scene-attachment">
                <span className="agi-scene-attachment-image" data-file="screenshot.png">
                  <i />
                  <b />
                </span>
                <span className="agi-scene-attachment-remove">
                  <X className="agi-app-icon" />
                </span>
              </span>
            </div>
          )}
          <AppComposer
            draft={
              view === 'commands' ? '/' : 'Summarize the deck and compare it with this screenshot.'
            }
          />
        </div>
      </div>
    </SceneShell>
  );
}
