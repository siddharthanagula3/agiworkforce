import './app-preview.css';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AudioLines,
  BatteryFull,
  Bell,
  Blocks,
  BookImage,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Copy,
  Cpu,
  FilePen,
  FileText,
  Files,
  FolderOpen,
  GitBranch,
  GitFork,
  HelpCircle,
  History,
  Laptop,
  Lock,
  Menu,
  MessageSquare,
  Mic,
  MonitorSmartphone,
  MoreHorizontal,
  MoreVertical,
  Palette,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Send,
  Settings,
  Shield,
  Signal,
  Slash,
  SquarePen,
  TerminalSquare,
  ThumbsDown,
  ThumbsUp,
  UserCircle,
  Wifi,
} from 'lucide-react';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import { CLI_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import { AgiMark } from '@/shared/components/agi/AgiMark';
import { APP_NAV_DESTINATIONS } from '@/shared/components/layout/app-nav-items';

export type PreviewKind = 'web' | 'desktop' | 'chrome' | 'panel' | 'editor' | 'terminal' | 'phone';

interface PreviewGeometry {
  frame: number;
  width: number;
  height: number;
}

export const PREVIEW_GEOMETRY: Record<PreviewKind, PreviewGeometry> = {
  web: { frame: 720, width: 1120, height: 700 },
  desktop: { frame: 720, width: 1120, height: 700 },
  chrome: { frame: 720, width: 1120, height: 700 },
  panel: { frame: 400, width: 400, height: 640 },
  editor: { frame: 720, width: 1120, height: 700 },
  terminal: { frame: 640, width: 880, height: 550 },
  phone: { frame: 270, width: 390, height: 844 },
};

function PreviewRoot({
  kind,
  label,
  className,
  children,
}: {
  kind: PreviewKind;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const geometry = PREVIEW_GEOMETRY[kind];
  const style = {
    '--dev-w': geometry.frame,
    '--dev-h': Math.round((geometry.frame * geometry.height) / geometry.width),
    '--app-w': geometry.width,
    '--app-h': geometry.height,
  } as CSSProperties;
  return (
    <figure
      className={['agi-dev', `agi-dev--${kind}`, 'agi-app', `agi-app--${kind}`, className]
        .filter(Boolean)
        .join(' ')}
      style={style}
      data-device={kind}
      data-geometry={`${geometry.width}x${geometry.height}`}
      aria-label={label}
    >
      <div className="agi-app-window" aria-hidden="true">
        {children}
      </div>
    </figure>
  );
}

function TrafficLights() {
  return (
    <span className="agi-app-lights">
      <i />
      <i />
      <i />
    </span>
  );
}

const SIDEBAR_DESTINATIONS = APP_NAV_DESTINATIONS.filter(
  (item) => !item.adminOnly && !item.requiresHealthSpace && !item.feature,
);

function AppSidebar({
  chats,
  macChrome,
  modeSwitch,
}: {
  chats: readonly string[];
  macChrome: boolean;
  modeSwitch: boolean;
}) {
  return (
    <aside className="agi-app-side">
      {macChrome ? <TrafficLights /> : null}
      <div className="agi-app-brand">
        <AgiMark className="agi-app-mark" />
        <span className="agi-app-wordmark">AGI Workforce</span>
        <Bell className="agi-app-icon agi-app-end agi-app-quiet" />
      </div>
      <div className="agi-app-controls">
        <span className="agi-app-iconbtn">
          <PanelLeft className="agi-app-icon" />
        </span>
        <span className="agi-app-newchat">
          <SquarePen className="agi-app-icon" />
          New Chat
        </span>
        <span className="agi-app-iconbtn">
          <TerminalSquare className="agi-app-icon" />
        </span>
      </div>
      <div className="agi-app-search">
        <Search className="agi-app-icon" />
        <span>Search</span>
        <kbd>⇧⌘F</kbd>
      </div>
      <nav className="agi-app-nav">
        {SIDEBAR_DESTINATIONS.map(({ id, label, icon: Icon }, index) => (
          <span key={id} className="agi-app-navrow" data-active={index === 0 || undefined}>
            <Icon className="agi-app-icon" />
            {label}
          </span>
        ))}
      </nav>
      <div className="agi-app-chats">
        <span className="agi-app-section">Chats</span>
        <span className="agi-app-group">
          <ChevronDown className="agi-app-icon agi-app-icon--sm" />
          <Calendar className="agi-app-icon agi-app-icon--sm" />
          Today
          <span className="agi-app-end">({chats.length})</span>
        </span>
        {chats.map((title, index) => (
          <span key={title} className="agi-app-session" data-active={index === 0 || undefined}>
            {title}
          </span>
        ))}
      </div>
      {modeSwitch ? (
        <span className="agi-app-modeswitch">
          <span>
            <Laptop className="agi-app-icon" />
            Local
          </span>
          <span data-on="true">
            <Cloud className="agi-app-icon" />
            Cloud
          </span>
        </span>
      ) : null}
    </aside>
  );
}

function ReplyActions() {
  return (
    <span className="agi-app-actions">
      <Copy className="agi-app-icon" />
      <ThumbsUp className="agi-app-icon" />
      <ThumbsDown className="agi-app-icon" />
      <RefreshCw className="agi-app-icon" />
      <GitFork className="agi-app-icon" />
      <MoreHorizontal className="agi-app-icon" />
    </span>
  );
}

function AppComposer() {
  return (
    <div className="agi-app-composer">
      <span className="agi-app-placeholder">Ask anything. Type / for commands</span>
      <div className="agi-app-composer-row">
        <Plus className="agi-app-icon agi-app-icon--lg" />
        <span className="agi-app-seg">
          <span data-on="true">Chat</span>
          <span>AGI Work</span>
        </span>
        <span className="agi-app-style agi-app-end">
          <Palette className="agi-app-icon" />
          Style
        </span>
        <span className="agi-app-model">
          <AgiMark className="agi-app-mark agi-app-mark--sm" />
          Auto
          <ChevronDown className="agi-app-icon agi-app-icon--sm" />
        </span>
        <Mic className="agi-app-icon agi-app-icon--lg" />
        <span className="agi-app-send">
          <AudioLines className="agi-app-icon" />
        </span>
      </div>
    </div>
  );
}

const WEB_CHATS = ['EU AI Act duties', 'Onboarding email', 'Pricing page copy'];
const WEB_TABLE = [
  ['Risk management', 'Required', 'Not required'],
  ['Human oversight', 'Design for it', 'Operate it'],
  ['Logging', 'Enable it', 'Keep six months'],
] as const;

function WebThread() {
  return (
    <div className="agi-app-thread">
      <p className="agi-app-user">Compare the EU AI Act duties for providers versus deployers.</p>
      <div className="agi-app-reply">
        <span className="agi-app-toolline">
          Searched the web
          <ChevronRight className="agi-app-icon" />
        </span>
        <p>Providers build for each duty and deployers operate it. Side by side:</p>
        <div className="agi-app-table">
          <span className="agi-app-th">Duty</span>
          <span className="agi-app-th">Provider</span>
          <span className="agi-app-th">Deployer</span>
          {WEB_TABLE.flatMap((row) => row.map((cell) => <span key={row[0] + cell}>{cell}</span>))}
        </div>
        <ReplyActions />
      </div>
    </div>
  );
}

const DESKTOP_CHATS = ['Release notes', 'Quarterly notes', 'Project checklist'];

function DesktopThread() {
  return (
    <div className="agi-app-thread">
      <p className="agi-app-user">Draft a release note from these notes.</p>
      <div className="agi-app-reply">
        <p className="agi-app-heading">Release notes</p>
        <p>Here is a first draft to edit. I kept to what the notes say:</p>
        <ul className="agi-app-list">
          <li>Review the launch checklist before the update goes out.</li>
          <li>Record the open questions so nothing is lost.</li>
          <li>Plan the next update once those are answered.</li>
        </ul>
        <ReplyActions />
      </div>
    </div>
  );
}

function AppShell({
  kind,
  label,
  className,
  chats,
  modeSwitch = false,
  children,
}: {
  kind: 'web' | 'desktop';
  label: string;
  className?: string;
  chats: readonly string[];
  modeSwitch?: boolean;
  children: ReactNode;
}) {
  const macChrome = kind === 'desktop';
  return (
    <PreviewRoot kind={kind} label={label} className={className}>
      {macChrome ? (
        <div className="agi-app-titlebar">
          <TrafficLights />
        </div>
      ) : (
        <div className="agi-app-chrome">
          <TrafficLights />
          <span className="agi-app-url">agiworkforce.com/chat</span>
        </div>
      )}
      <div className="agi-app-shell">
        <AppSidebar chats={chats} macChrome={macChrome} modeSwitch={modeSwitch} />
        <div className="agi-app-main">
          {children}
          <AppComposer />
        </div>
      </div>
    </PreviewRoot>
  );
}

export function WebAppPreview({ className }: { className?: string }) {
  return (
    <AppShell
      kind="web"
      label="Authored example of the AGI Web chat interface"
      className={className}
      chats={WEB_CHATS}
    >
      <WebThread />
    </AppShell>
  );
}

export function DesktopAppPreview({
  className,
  modeSwitch = false,
}: {
  className?: string;
  modeSwitch?: boolean;
}) {
  return (
    <AppShell
      kind="desktop"
      label="Authored example of the AGI Desktop app window"
      className={className}
      chats={DESKTOP_CHATS}
      modeSwitch={modeSwitch}
    >
      <DesktopThread />
    </AppShell>
  );
}

const PANEL_SUGGESTIONS = [
  'Summarize this page',
  'Explain this page in simple terms',
  'Pull out the names, dates and numbers',
  'Translate this page',
];

function SidePanel() {
  return (
    <div className="agi-app-panel">
      <div className="agi-app-panel-head">
        <Clock className="agi-app-icon" />
        <FilePen className="agi-app-icon" />
        <MoreVertical className="agi-app-icon" />
      </div>
      <div className="agi-app-panel-empty">
        <AgiMark className="agi-app-panel-mark" />
        <div className="agi-app-panel-suggestions">
          {PANEL_SUGGESTIONS.map((text) => (
            <span key={text} className="agi-app-panel-suggestion">
              <FileText className="agi-app-icon" />
              {text}
            </span>
          ))}
        </div>
      </div>
      <div className="agi-app-panel-composer">
        <span className="agi-app-panel-placeholder">How can I help you today?</span>
        <div className="agi-app-panel-bar">
          <Plus className="agi-app-icon agi-app-icon--lg" />
          <span className="agi-app-panel-chip">
            <Shield className="agi-app-icon agi-app-icon--sm" />
            Ask first
          </span>
          <span className="agi-app-panel-model agi-app-end">
            <AgiMark className="agi-app-mark agi-app-mark--sm" />
            Auto
            <ChevronDown className="agi-app-icon agi-app-icon--sm" />
          </span>
          <Mic className="agi-app-icon" />
        </div>
      </div>
    </div>
  );
}

const PAGE_LINES = [94, 88, 97, 82, 91, 0, 89, 76, 93, 85, 0, 92, 86, 78, 90];

export function ChromeAppPreview({ className }: { className?: string }) {
  return (
    <PreviewRoot
      kind="chrome"
      label="Authored example of the AGI side panel in Chrome"
      className={className}
    >
      <div className="agi-app-tabstrip">
        <TrafficLights />
        <span className="agi-app-tab">
          <FileText className="agi-app-icon agi-app-icon--sm" />
          Q3 Strategy
        </span>
        <Plus className="agi-app-icon agi-app-quiet" />
      </div>
      <div className="agi-app-toolbar">
        <ArrowLeft className="agi-app-icon" />
        <ArrowRight className="agi-app-icon agi-app-quiet" />
        <RotateCw className="agi-app-icon" />
        <span className="agi-app-omnibox">
          <Lock className="agi-app-icon agi-app-icon--sm" />
          docs.example.com/q3-strategy
        </span>
        <AgiMark className="agi-app-mark" />
        <PanelRight className="agi-app-icon" />
      </div>
      <div className="agi-app-browser">
        <div className="agi-app-page">
          <span className="agi-app-page-title">Q3 Strategy</span>
          {PAGE_LINES.map((width, index) =>
            width ? <i key={index} style={{ inlineSize: `${width}%` }} /> : <b key={index} />,
          )}
        </div>
        <SidePanel />
      </div>
    </PreviewRoot>
  );
}

export function SidePanelPreview({ className }: { className?: string }) {
  return (
    <PreviewRoot
      kind="panel"
      label="Authored example of the AGI Chrome side panel"
      className={className}
    >
      <SidePanel />
    </PreviewRoot>
  );
}

type CodeToken = readonly [text: string, kind?: 'keyword' | 'function' | 'type' | 'string'];

const EDITOR_CODE: ReadonlyArray<{
  line: string;
  change?: 'add' | 'remove';
  tokens: readonly CodeToken[];
}> = [
  {
    line: '1',
    tokens: [
      ['export function', 'keyword'],
      [' greet', 'function'],
      ['(name: '],
      ['string', 'type'],
      ['): '],
      ['string', 'type'],
      [' {'],
    ],
  },
  {
    line: '2',
    change: 'remove',
    tokens: [['  return', 'keyword'], [' `Hello, ${name}`', 'string'], [';']],
  },
  {
    line: '2',
    change: 'add',
    tokens: [['  const', 'keyword'], [' trimmed = name.'], ['trim', 'function'], ['();']],
  },
  {
    line: '3',
    change: 'add',
    tokens: [
      ['  return', 'keyword'],
      [' trimmed ? '],
      ['`Hello, ${trimmed}`', 'string'],
      [' : '],
      ["'Hello'", 'string'],
      [';'],
    ],
  },
  { line: '4', tokens: [['}']] },
];

const EDITOR_FILE = 'example.ts';
const APPROVAL_ACTIONS = [
  'Review change',
  `${TOOL_APPROVAL_ACTION_LABELS.approve} once`,
  `${TOOL_APPROVAL_ACTION_LABELS.approve} for session`,
  TOOL_APPROVAL_ACTION_LABELS.deny,
];

export function EditorAppPreview({ className }: { className?: string }) {
  return (
    <PreviewRoot kind="editor" label="Authored example of AGI in VS Code" className={className}>
      <div className="agi-app-titlebar agi-app-titlebar--editor">
        <TrafficLights />
        <span className="agi-app-command">
          <Search className="agi-app-icon agi-app-icon--sm" />
          workspace
        </span>
        <PanelRight className="agi-app-icon agi-app-quiet" />
      </div>
      <div className="agi-app-editor">
        <div className="agi-app-activity">
          <Files className="agi-app-icon agi-app-icon--lg" />
          <Search className="agi-app-icon agi-app-icon--lg" />
          <GitBranch className="agi-app-icon agi-app-icon--lg" />
          <Play className="agi-app-icon agi-app-icon--lg" />
          <Blocks className="agi-app-icon agi-app-icon--lg" />
          <span className="agi-app-activity-on">
            <AgiMark className="agi-app-mark" />
          </span>
        </div>
        <div className="agi-app-view">
          <div className="agi-app-view-head">
            <AgiMark className="agi-app-mark" />
            <span className="agi-app-view-title">AGI</span>
            <span className="agi-app-pill">Managed</span>
            <Plus className="agi-app-icon agi-app-end" />
            <History className="agi-app-icon" />
            <MoreHorizontal className="agi-app-icon" />
          </div>
          <div className="agi-app-view-thread">
            <p className="agi-app-view-user">Add a fallback for an empty name.</p>
            <p>
              I will trim the name and greet without it when nothing is left. The edit is ready for
              your review.
            </p>
            <div className="agi-app-approval">
              <span className="agi-app-approval-title">Approval needed</span>
              <span className="agi-app-approval-file">
                <code>write_file</code>
                {EDITOR_FILE}
                <span className="agi-app-diffstat">
                  <b>+2</b>
                  <i>-1</i>
                </span>
              </span>
              <span className="agi-app-approval-actions">
                {APPROVAL_ACTIONS.map((action, index) => (
                  <span key={action} data-primary={index === 1 || undefined}>
                    {action}
                  </span>
                ))}
              </span>
            </div>
          </div>
          <div className="agi-app-view-composer">
            <span className="agi-app-view-placeholder">Ask AGI to do anything…</span>
            <div className="agi-app-view-bar">
              <Plus className="agi-app-icon" />
              <Slash className="agi-app-icon" />
              <span className="agi-app-pill">
                <AgiMark className="agi-app-mark agi-app-mark--sm" />
                Auto
              </span>
              <span className="agi-app-view-send agi-app-end">
                <ArrowUp className="agi-app-icon" />
              </span>
            </div>
          </div>
        </div>
        <div className="agi-app-code">
          <div className="agi-app-code-tabs">
            <span data-active="true">
              <FileText className="agi-app-icon agi-app-icon--sm" />
              {EDITOR_FILE}
            </span>
          </div>
          <span className="agi-app-crumbs">
            src
            <ChevronRight className="agi-app-icon agi-app-icon--sm" />
            {EDITOR_FILE}
            <ChevronRight className="agi-app-icon agi-app-icon--sm" />
            greet
          </span>
          <div className="agi-app-code-lines">
            {EDITOR_CODE.map((row) => (
              <span
                key={row.line + (row.change ?? '')}
                className="agi-app-code-row"
                data-change={row.change}
              >
                <i>{row.line}</i>
                <b>{row.change === 'add' ? '+' : row.change === 'remove' ? '-' : ''}</b>
                <span>
                  {row.tokens.map(([text, kind], position) => (
                    <span key={`${position}${text}`} data-token={kind}>
                      {text}
                    </span>
                  ))}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="agi-app-statusbar">
        <span>
          <GitBranch className="agi-app-icon agi-app-icon--sm" />
          main
        </span>
        <span className="agi-app-end">Ln 3, Col 12</span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span>TypeScript</span>
        <span>
          <AgiMark className="agi-app-mark agi-app-mark--sm" />
          AGI
        </span>
      </div>
    </PreviewRoot>
  );
}

export type TerminalRouteMode = 'local' | 'byok' | 'managed';

const TERMINAL_ACCESS: Record<TerminalRouteMode, string> = {
  local: 'Local',
  byok: 'Your key',
  managed: 'Managed',
};

const TERMINAL_CHOICES = ['Yes', 'No', 'Allow Session', 'Always Allow'];

export function TerminalAppPreview({
  className,
  routeMode = 'local',
}: {
  className?: string;
  routeMode?: TerminalRouteMode;
}) {
  const provider = routeMode === 'local' ? CLI_LOCAL_RUNTIMES.names[0] : undefined;
  return (
    <PreviewRoot
      kind="terminal"
      label="Authored example of the AGI CLI in a terminal"
      className={className}
    >
      <div className="agi-app-titlebar agi-app-titlebar--terminal">
        <TrafficLights />
        <span className="agi-app-titletext">agi</span>
      </div>
      <div className="agi-app-tui" data-access={routeMode}>
        <div className="agi-app-tui-head">
          <b>AGI</b>
          <span>Auto</span>
          {provider ? <em>{provider}</em> : null}
          <span>main</span>
        </div>
        <div className="agi-app-tui-box" data-title="Tool Approval">
          <span>Allow write_file to modify:</span>
          <span>
            file.txt <i>(+1 / -1 lines)</i>
          </span>
          <span data-diff="remove">- alpha</span>
          <span data-diff="add">+ beta</span>
          <span className="agi-app-tui-choices">
            {TERMINAL_CHOICES.map((choice, index) => (
              <span key={choice} data-on={index === 0 || undefined}>
                [ {choice} ]
              </span>
            ))}
          </span>
          <i>←/→ move Enter confirm Tab note Esc = No</i>
        </div>
        <div className="agi-app-tui-box agi-app-tui-input" data-title="Default">
          <span>
            <b>&gt;</b> <i>Message AGI... Enter sends · Ctrl-J newline · / commands · @ files</i>
          </span>
        </div>
        <div className="agi-app-tui-status">
          <span>Default</span>
          <em>◉ {TERMINAL_ACCESS[routeMode]}</em>
          <span>
            ctx <u>[█░░░░░░░]</u> 12%
          </span>
          <i>/: commands</i>
          <i>Esc: quit</i>
          <i>Shift+Tab: mode</i>
        </div>
      </div>
    </PreviewRoot>
  );
}

const DRAWER_DESTINATIONS = [
  ['Chats', MessageSquare],
  ['Projects', FolderOpen],
  ['Library', BookImage],
  ['Remote', MonitorSmartphone],
] as const;

const DRAWER_RECENTS = ['Launch demo notes', 'Trip packing list', 'Weekly plan'];

const DRAWER_FOOTER = [
  ['Settings', Settings],
  ['Notifications', Bell],
  ['Help & About', HelpCircle],
] as const;

export function PhoneAppPreview({
  className,
  label = 'Authored example of the AGI Mobile chat screen',
  drawerOpen = false,
}: {
  className?: string;
  label?: string;
  drawerOpen?: boolean;
}) {
  return (
    <PreviewRoot kind="phone" label={label} className={className}>
      <div className="agi-app-phone-status">
        <span>9:41</span>
        <span className="agi-app-phone-island" />
        <span className="agi-app-phone-signal">
          <Signal className="agi-app-icon" />
          <Wifi className="agi-app-icon" />
          <BatteryFull className="agi-app-icon agi-app-icon--lg" />
        </span>
      </div>
      <div className="agi-app-phone-head">
        <Menu className="agi-app-icon agi-app-icon--xl" />
        <span className="agi-app-phone-title">AGI</span>
        <span className="agi-app-phone-compose agi-app-end">
          <SquarePen className="agi-app-icon agi-app-icon--lg" />
        </span>
      </div>
      <div className="agi-app-phone-body">
        <span className="agi-app-phone-mode">
          <span data-on="true">
            <Cpu className="agi-app-icon" />
            Local
          </span>
          <span>
            <Cloud className="agi-app-icon" />
            Cloud
          </span>
        </span>
        <span className="agi-app-phone-heading">How can I help you tonight?</span>
        <span className="agi-app-phone-sub">
          Start privately on this device. Use the sidebar for recents and projects.
        </span>
      </div>
      <div className="agi-app-phone-composer">
        <span className="agi-app-phone-placeholder">What&apos;s on your mind?</span>
        <div className="agi-app-phone-composer-row">
          <Plus className="agi-app-icon agi-app-icon--xl" />
          <span className="agi-app-phone-model">
            <AgiMark className="agi-app-mark" />
            Auto
            <ChevronDown className="agi-app-icon agi-app-icon--sm" />
          </span>
          <Mic className="agi-app-icon agi-app-icon--xl agi-app-end" />
          <span className="agi-app-phone-send">
            <Send className="agi-app-icon agi-app-icon--lg" />
          </span>
        </div>
      </div>
      {drawerOpen ? <PhoneDrawer /> : null}
    </PreviewRoot>
  );
}

function PhoneDrawer() {
  return (
    <>
      <span className="agi-app-phone-scrim" />
      <div className="agi-app-drawer">
        <div className="agi-app-drawer-head">
          <span className="agi-app-drawer-brand">AGI</span>
          <span className="agi-app-drawer-btn">
            <Search className="agi-app-icon agi-app-icon--lg" />
          </span>
          <span className="agi-app-drawer-btn">
            <SquarePen className="agi-app-icon agi-app-icon--lg" />
          </span>
          <span className="agi-app-drawer-btn">
            <UserCircle className="agi-app-icon agi-app-icon--lg" />
          </span>
        </div>
        <div className="agi-app-drawer-rows">
          {DRAWER_DESTINATIONS.map(([label, Icon], index) => (
            <span key={label} className="agi-app-drawer-row" data-active={index === 0 || undefined}>
              <Icon className="agi-app-icon agi-app-icon--lg" />
              {label}
            </span>
          ))}
        </div>
        <div className="agi-app-drawer-rows">
          <span className="agi-app-drawer-section">Recents</span>
          {DRAWER_RECENTS.map((title) => (
            <span key={title} className="agi-app-drawer-row">
              {title}
            </span>
          ))}
          <span className="agi-app-drawer-row agi-app-quiet">
            See all chats
            <ChevronRight className="agi-app-icon agi-app-end" />
          </span>
        </div>
        <div className="agi-app-drawer-rows agi-app-drawer-foot">
          {DRAWER_FOOTER.map(([label, Icon]) => (
            <span key={label} className="agi-app-drawer-row">
              <Icon className="agi-app-icon agi-app-icon--lg" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
