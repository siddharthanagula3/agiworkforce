import './legacy-landing.css';
import './motion/motion.css';
import './mockup-responsive.css';
import './desktop-chrome-mockup-responsive.css';
import './editor-mockup-responsive.css';
import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  Cloud,
  Command,
  Folder,
  GitBranch,
  Globe,
  Library,
  Lock,
  Menu,
  Mic,
  Monitor,
  Plus,
  Play,
  Puzzle,
  RotateCw,
  Search,
  Send,
  SquarePen,
} from 'lucide-react';
import {
  PRIVACY_MODE_DISPLAY,
  PRIVACY_MODE_USAGE_IMPLICATION,
  TOOL_STATUS_PRESENTATION,
} from '@agiworkforce/types';
import { CLI_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import { APP_NAV_DESTINATIONS } from '@/shared/components/layout/app-nav-items';

const LOCAL_RUNTIME_LABEL = `${(CLI_LOCAL_RUNTIMES.names[0] ?? '').toLowerCase()}(local)`;

export type DeviceType = 'desktop' | 'web' | 'chrome' | 'editor' | 'terminal' | 'panel' | 'phone';

export const DEVICE_GEOMETRY: Record<DeviceType, { width: number; height: number }> = {
  desktop: { width: 720, height: 480 },
  web: { width: 720, height: 450 },
  chrome: { width: 720, height: 480 },
  editor: { width: 720, height: 450 },
  terminal: { width: 640, height: 400 },
  panel: { width: 400, height: 520 },
  phone: { width: 270, height: 585 },
};

export type RouteMode = 'local' | 'byok' | 'managed';

export interface DeviceWindowProps {
  title?: string;
  badge?: string;
  className?: string;
}

export interface TerminalWindowProps extends DeviceWindowProps {
  routeMode?: RouteMode;
}

interface RouteReceipt {
  lane: string;
  provider: string;
  cost: string;
}

export const ROUTE_RECEIPTS: Record<RouteMode, RouteReceipt> = {
  local: { lane: 'Local', provider: LOCAL_RUNTIME_LABEL, cost: '$0.00' },
  byok: { lane: 'BYOK', provider: 'your provider', cost: 'billed to your key' },
  managed: { lane: 'AGI Cloud', provider: 'Auto route', cost: 'metered in credits' },
};

function deviceStyle(type: DeviceType): CSSProperties {
  const { width, height } = DEVICE_GEOMETRY[type];
  return { '--dev-w': width, '--dev-h': height } as CSSProperties;
}

function DeviceRoot({
  type,
  label,
  className,
  children,
}: {
  type: DeviceType;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const { width, height } = DEVICE_GEOMETRY[type];
  return (
    <figure
      className={['agi-dev', `agi-dev--${type}`, className].filter(Boolean).join(' ')}
      style={deviceStyle(type)}
      data-device={type}
      data-geometry={`${width}x${height}`}
      aria-label={label}
    >
      <div className="agi-dev-shell">{children}</div>
    </figure>
  );
}

function WindowBar({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="agi-dev-bar" aria-hidden="true">
      <span className="agi-dev-lights">
        <i />
        <i />
        <i />
      </span>
      <span className="agi-dev-title">{title}</span>
      {badge ? <span className="agi-dev-badge">{badge}</span> : null}
    </div>
  );
}

export function Receipt({
  route,
  tokensIn,
  tokensOut,
  time,
  compact = false,
}: {
  route: RouteReceipt;
  tokensIn: string;
  tokensOut: string;
  time: string;
  compact?: boolean;
}) {
  const detail = compact
    ? `${route.lane} · ${route.provider} · ${time}`
    : `Served by ${route.lane} · ${route.provider} · ${tokensIn} in · ${tokensOut} out · ${route.cost} · ${time}`;
  return (
    <p className="agi-mk-receipt">
      <span className="agi-mk-dot" />
      {detail}
    </p>
  );
}

export function ToolRow({
  state,
  label,
  meta,
  icon,
}: {
  state: 'done' | 'wait';
  label: string;
  meta: string;
  icon?: ReactNode;
}) {
  return (
    <p className="agi-mk-tool" data-state={state}>
      <i>{icon ?? (state === 'done' ? '✓' : '●')}</i>
      <span>{label}</span>
      <span className="agi-mk-tool-meta">{meta}</span>
    </p>
  );
}

function ComposerBar({
  ghost,
  model,
  extra,
  sendIcon,
  modelIcon,
}: {
  ghost: string;
  model: string;
  extra?: ReactNode;
  sendIcon?: ReactNode;
  modelIcon?: ReactNode;
}) {
  return (
    <div className="agi-mk-composer">
      <div className="agi-mk-composer-row">
        <span className="agi-mk-ghost">
          {ghost}
          <span className="agi-dev-caret" />
        </span>
        <span className="agi-dev-send">{sendIcon ?? '➤'}</span>
      </div>
      <div className="agi-mk-composer-row agi-mk-composer-foot">
        <span className="agi-mk-seg">
          <span data-on="true">Chat</span>
          <span>AGI Work</span>
        </span>
        <span className="agi-mk-chip agi-mk-chip--model">
          {model} {modelIcon ?? '▾'}
        </span>
        {extra}
      </div>
    </div>
  );
}

function PageContextStrip({ icon }: { icon?: ReactNode } = {}) {
  return (
    <div className="agi-dev-pagestrip">
      <span className="agi-dev-pagestrip-icon">{icon ?? '▤'}</span>
      <span className="agi-dev-pagestrip-text">
        <span className="agi-dev-pagestrip-title">Q3 Strategy Doc</span>
        <span className="agi-dev-pagestrip-meta">docs.google.com</span>
      </span>
      <span className="agi-dev-pagestrip-badge">Context</span>
    </div>
  );
}

function PanelComposer({
  contextIcon,
  sendIcon,
  ghost = 'Ask about this page…',
  status = 'Paired · Desktop bridge',
}: {
  contextIcon?: ReactNode;
  sendIcon?: ReactNode;
  ghost?: ReactNode;
  status?: ReactNode;
} = {}) {
  return (
    <div className="agi-dev-panelcomposer">
      <span className="agi-dev-panelcomposer-row">
        <span className="agi-dev-panelcomposer-icon">{contextIcon ?? '▤'}</span>
        <span className="agi-dev-panelcomposer-ghost">
          <span className="agi-dev-type">{ghost}</span>
        </span>
        <span className="agi-dev-send">{sendIcon ?? '➤'}</span>
      </span>
      <span className="agi-dev-panelcomposer-foot">
        <span>{status}</span>
        <span>{PRIVACY_MODE_DISPLAY.managed.label}</span>
      </span>
    </div>
  );
}

export function DesktopWindow({
  title = 'AGI Workforce',
  badge = 'Cloud',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot
      type="desktop"
      label={title + ' desktop app authored example'}
      className={['agi-desktop-responsive', className].filter(Boolean).join(' ')}
    >
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-desk" aria-hidden="true">
        <div className="agi-desk-side">
          <div className="agi-desktop-navigation">
            <p className="agi-desk-brand">AGI</p>
            <p className="agi-desk-new">
              <Plus className="agi-device-icon" aria-hidden="true" focusable="false" /> New chat
            </p>
            <p className="agi-desk-item">
              <Search className="agi-device-icon" aria-hidden="true" focusable="false" /> Search
            </p>
            {APP_NAV_DESTINATIONS.filter(({ id }) => id === 'projects' || id === 'library').map(
              ({ id, label, icon: Icon }) => (
                <p className="agi-desk-item" key={id}>
                  <Icon className="agi-device-icon" aria-hidden="true" /> {label}
                </p>
              ),
            )}
          </div>
          <div className="agi-desktop-recents">
            <p className="agi-desk-group">Example chats</p>
            <p className="agi-desk-recent agi-desk-recent--on">Release notes</p>
            <p className="agi-desk-recent">Quarterly notes</p>
            <p className="agi-desk-recent">Project checklist</p>
          </div>
          <p className="agi-desk-foot">{PRIVACY_MODE_DISPLAY.managed.label}</p>
        </div>
        <div className="agi-mk-main">
          <div className="agi-mk-thread">
            <p className="agi-device-example-label">Example prompt</p>
            <div className="agi-mk-agi">
              <p className="agi-device-example-title">Release notes</p>
              <p>
                Review the launch checklist, record the open questions, and plan the next update.
              </p>
            </div>
          </div>
          <ComposerBar
            ghost="Draft a release note from these notes."
            model={'Auto · ' + PRIVACY_MODE_DISPLAY.managed.label}
            sendIcon={<ArrowUp className="agi-device-icon" aria-hidden="true" focusable="false" />}
            modelIcon={
              <ChevronDown className="agi-device-icon" aria-hidden="true" focusable="false" />
            }
          />
        </div>
      </div>
    </DeviceRoot>
  );
}

export function WebWindow({
  title = 'agiworkforce.com/chat',
  badge = 'Web',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot
      type="web"
      label="The AGI Web chat interface"
      className={['agi-web-responsive', className].filter(Boolean).join(' ')}
    >
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-web">
        <div className="agi-desk-side">
          <div className="agi-web-navigation">
            <p className="agi-desk-brand">AGI</p>
            <p className="agi-desk-new">+ New chat</p>
            <p className="agi-desk-item">
              <Search className="agi-web-icon" aria-hidden="true" focusable="false" /> Search{' '}
              <span className="agi-desk-kbd">
                <Command
                  className="agi-web-icon"
                  role="img"
                  aria-label="Command"
                  focusable="false"
                />
                K
              </span>
            </p>
            <p className="agi-desk-item">
              <Folder className="agi-web-icon" aria-hidden="true" focusable="false" /> Projects
            </p>
            <p className="agi-desk-item">
              <Library className="agi-web-icon" aria-hidden="true" focusable="false" /> Library
            </p>
          </div>
          <div className="agi-web-recents">
            <p className="agi-desk-group">Recents</p>
            <p className="agi-desk-recent agi-desk-recent--on">EU AI Act duties</p>
            <p className="agi-desk-recent">Onboarding email draft</p>
            <p className="agi-desk-recent">Pricing page copy</p>
            <p className="agi-desk-recent">Retention query</p>
          </div>
        </div>
        <div className="agi-mk-main">
          <div className="agi-mk-thread">
            <p className="agi-mk-user">
              Compare the EU AI Act duties for providers versus deployers.
            </p>
            <div className="agi-mk-agi">
              <ToolRow
                state="done"
                label="Searched the web"
                meta="5 sources · 1.4 s"
                icon={
                  <Check
                    className="agi-web-icon"
                    role="img"
                    aria-label="Completed"
                    focusable="false"
                  />
                }
              />
              <div
                className="agi-web-table-region"
                role="region"
                aria-label="Example comparison of EU AI Act duties"
                tabIndex={0}
              >
                <table className="agi-mk-table" aria-label="EU AI Act duties">
                  <thead>
                    <tr>
                      <th className="agi-mk-table-h" scope="col">
                        Duty
                      </th>
                      <th className="agi-mk-table-h" scope="col">
                        Provider
                      </th>
                      <th className="agi-mk-table-h" scope="col">
                        Deployer
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Risk management</td>
                      <td>Required</td>
                      <td>Not required</td>
                    </tr>
                    <tr>
                      <td>Human oversight</td>
                      <td>Design for it</td>
                      <td>Operate it</td>
                    </tr>
                    <tr>
                      <td>Logging</td>
                      <td>Enable it</td>
                      <td>Keep six months</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <span className="agi-mk-chips">
                <span className="agi-mk-chip">eur-lex.europa.eu</span>
                <span className="agi-mk-chip">digital-strategy.ec.europa.eu</span>
                <span className="agi-mk-chip">+3 sources</span>
              </span>
              <Receipt
                route={ROUTE_RECEIPTS.managed}
                tokensIn="3.1k"
                tokensOut="640"
                time="6.2 s"
              />
            </div>
          </div>
          <ComposerBar
            ghost="Ask a follow-up…"
            model="Auto"
            sendIcon={
              <Send className="agi-web-icon" role="img" aria-label="Send" focusable="false" />
            }
            modelIcon={
              <ChevronDown className="agi-web-icon" aria-hidden="true" focusable="false" />
            }
            extra={
              <span className="agi-mk-composer-meta">
                <span>Enter to send · Shift+Enter for newline</span>
              </span>
            }
          />
        </div>
      </div>
    </DeviceRoot>
  );
}

export function ChromeWindow({ badge = 'Chrome', className }: DeviceWindowProps) {
  return (
    <DeviceRoot
      type="chrome"
      label="AGI Chrome extension authored example"
      className={['agi-chrome-responsive', className].filter(Boolean).join(' ')}
    >
      <div className="agi-dev-bar agi-cr-tabbar" aria-hidden="true">
        <span className="agi-dev-lights">
          <i />
          <i />
          <i />
        </span>
        <span className="agi-cr-tabs">
          <span className="agi-cr-tab agi-cr-tab--on">
            <span className="agi-cr-tab-icon">
              <Folder className="agi-device-icon" aria-hidden="true" focusable="false" />
            </span>
            <span className="agi-cr-tab-label">Q3 Strategy · Google Docs</span>
          </span>
          <span className="agi-cr-tab">
            <span className="agi-cr-tab-icon">
              <Globe className="agi-device-icon" aria-hidden="true" focusable="false" />
            </span>
            <span className="agi-cr-tab-label">New Tab</span>
          </span>
          <span className="agi-cr-tab-add">
            <Plus className="agi-device-icon" aria-hidden="true" focusable="false" />
          </span>
        </span>
        <span className="agi-dev-badge">{badge}</span>
      </div>
      <div className="agi-cr-addressbar" aria-hidden="true">
        <span className="agi-cr-nav">
          <ArrowLeft className="agi-device-icon" aria-hidden="true" focusable="false" />
        </span>
        <span className="agi-cr-nav">
          <ArrowRight className="agi-device-icon" aria-hidden="true" focusable="false" />
        </span>
        <span className="agi-cr-nav">
          <RotateCw className="agi-device-icon" aria-hidden="true" focusable="false" />
        </span>
        <span className="agi-cr-url">
          <span className="agi-cr-lock">
            <Lock className="agi-device-icon" aria-hidden="true" focusable="false" />
          </span>
          docs.google.com
        </span>
        <span className="agi-cr-ext">AGI</span>
      </div>
      <div className="agi-dev-body agi-cr-viewport" aria-hidden="true">
        <div className="agi-cr-page">
          <div className="agi-cr-doc-head">
            <span className="agi-cr-doc-icon">
              <Folder className="agi-device-icon" aria-hidden="true" focusable="false" />
            </span>
            <span className="agi-cr-doc-title">Q3 Strategy Document</span>
          </div>
          <div className="agi-cr-doc">
            <p className="agi-cr-doc-copy">
              Review the launch checklist and record the open questions before the next team
              meeting.
            </p>
            <span className="agi-cr-line agi-cr-line--h1" />
            <span className="agi-cr-line" style={{ width: '94%' }} />
            <span className="agi-cr-line" style={{ width: '88%' }} />
            <span className="agi-cr-line" style={{ width: '97%' }} />
            <span className="agi-cr-line" style={{ width: '82%' }} />
            <span className="agi-cr-line" style={{ width: '91%' }} />
            <span className="agi-cr-gap" />
            <span className="agi-cr-line agi-cr-line--h2" />
            <span className="agi-cr-line" style={{ width: '89%' }} />
            <span className="agi-cr-line" style={{ width: '76%' }} />
            <span className="agi-cr-line agi-cr-line--sel" style={{ width: '93%' }} />
            <span className="agi-cr-line agi-cr-line--sel" style={{ width: '85%' }} />
            <span className="agi-cr-line agi-cr-line--sel" style={{ width: '91%' }} />
            <span className="agi-cr-line agi-cr-line--sel" style={{ width: '79%' }} />
            <span className="agi-cr-gap" />
            <span className="agi-cr-line agi-cr-line--h2" />
            <span className="agi-cr-line" style={{ width: '92%' }} />
            <span className="agi-cr-line" style={{ width: '86%' }} />
            <span className="agi-cr-line" style={{ width: '78%' }} />
          </div>
        </div>
        <div className="agi-cr-panel">
          <div className="agi-cr-panel-head">
            <span className="agi-cr-panel-logo">AGI</span>
            <span className="agi-cr-panel-mode">
              <Cloud className="agi-device-icon" aria-hidden="true" focusable="false" />{' '}
              {PRIVACY_MODE_DISPLAY.managed.label}
            </span>
          </div>
          <PageContextStrip
            icon={<Globe className="agi-device-icon" aria-hidden="true" focusable="false" />}
          />
          <div className="agi-cr-chat">
            <p className="agi-device-example-label">Example prompt</p>
          </div>
          <PanelComposer
            ghost="Summarise this page into a short checklist."
            status="Desktop optional"
            contextIcon={<Globe className="agi-device-icon" aria-hidden="true" focusable="false" />}
            sendIcon={<ArrowUp className="agi-device-icon" aria-hidden="true" focusable="false" />}
          />
        </div>
      </div>
    </DeviceRoot>
  );
}

export function SidePanelCard({
  title = 'AGI · side panel',
  badge = 'Page context',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot
      type="panel"
      label={`${title} interface`}
      className={['agi-panel-responsive', className].filter(Boolean).join(' ')}
    >
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-pn" aria-hidden="true">
        <PageContextStrip
          icon={
            <Globe
              className="agi-panel-icon"
              role="img"
              aria-label="Page context"
              focusable="false"
            />
          }
        />
        <div className="agi-pn-main">
          <div className="agi-pn-chips">
            <span className="agi-pn-chip--on">This page</span>
            <span>/tldr</span>
            <span>/extract</span>
          </div>
          <p className="agi-pn-msg">Summarize this page</p>
          <p className="agi-pn-line agi-pn-line--ok">
            <Check
              className="agi-panel-icon"
              role="img"
              aria-label="Context attached"
              focusable="false"
            />
            Browser page added
          </p>
          <p className="agi-pn-line agi-pn-line--dim">Page text included with your question</p>
        </div>
        <PanelComposer
          contextIcon={
            <Globe
              className="agi-panel-icon"
              role="img"
              aria-label="Page context"
              focusable="false"
            />
          }
          sendIcon={
            <ArrowUp
              className="agi-panel-icon"
              role="img"
              aria-label="Send message"
              focusable="false"
            />
          }
        />
      </div>
    </DeviceRoot>
  );
}

const EDITOR_LINES: ReadonlyArray<{ n: number; add?: boolean; code: ReactNode }> = [
  {
    n: 1,
    code: (
      <>
        <em className="agi-ed-kw">export function</em> <span className="agi-ed-fn">greet</span>(
      </>
    ),
  },
  {
    n: 2,
    code: (
      <span className="agi-ed-dim agi-ed-indent">
        name<span className="agi-ed-punc">:</span> <span className="agi-ed-type">string</span>
      </span>
    ),
  },
  {
    n: 3,
    code: (
      <span className="agi-ed-dim">
        {')'} <span className="agi-ed-punc">:</span> <span className="agi-ed-type">string</span>{' '}
        {'{'}
      </span>
    ),
  },
  {
    n: 4,
    add: true,
    code: (
      <span className="agi-ed-dim agi-ed-indent">
        <em className="agi-ed-kw">const</em> trimmed <span className="agi-ed-punc">=</span>{' '}
        name.trim()
      </span>
    ),
  },
  {
    n: 5,
    add: true,
    code: (
      <span className="agi-ed-dim agi-ed-indent">
        <em className="agi-ed-kw">return</em> trimmed ?{' '}
        <span className="agi-ed-fn">{'`Hello, ${trimmed}`'}</span> :{' '}
        <span className="agi-ed-fn">'Hello'</span>
      </span>
    ),
  },
  { n: 6, code: <span className="agi-ed-dim">{'}'}</span> },
];

export function EditorWindow({
  title = 'example.ts · AGI in VS Code',
  badge = 'VS Code',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot
      type="editor"
      label="AGI VS Code extension interface"
      className={['agi-editor-responsive', className].filter(Boolean).join(' ')}
    >
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-ed" aria-hidden="true">
        <div className="agi-ed-activity">
          <div className="agi-editor-tools">
            <span>
              <Folder className="agi-editor-icon" aria-hidden="true" focusable="false" />
            </span>
            <span>
              <Search className="agi-editor-icon" aria-hidden="true" focusable="false" />
            </span>
            <span className="agi-ed-act--on">
              <Bot className="agi-editor-icon" aria-hidden="true" focusable="false" />
            </span>
          </div>
          <div className="agi-editor-tools">
            <span>
              <GitBranch className="agi-editor-icon" aria-hidden="true" focusable="false" />
            </span>
            <span>
              <Play className="agi-editor-icon" aria-hidden="true" focusable="false" />
            </span>
            <span>
              <Puzzle className="agi-editor-icon" aria-hidden="true" focusable="false" />
            </span>
          </div>
        </div>
        <div className="agi-ed-editor">
          <div className="agi-ed-code">
            {EDITOR_LINES.map((line) => (
              <span key={line.n} className={line.add ? 'agi-ed-row agi-ed-row--add' : 'agi-ed-row'}>
                <span className="agi-ed-ln">{line.add ? '+' : line.n}</span>
                <span className="agi-ed-source">{line.code}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="agi-ed-panel">
          <div className="agi-ed-panel-head">
            <span className="agi-ed-panel-title">AGI</span>
            <span className="agi-ed-chip">@agi</span>
          </div>
          <div className="agi-ed-chat">
            <div className="agi-ed-msg">
              <span className="agi-ed-avatar">U</span>
              <p>Example request: add a fallback for an empty name.</p>
            </div>
            <div className="agi-ed-msg">
              <span className="agi-ed-avatar agi-ed-avatar--agi">A</span>
              <div className="agi-mk-agi">
                <p>
                  Proposed example: trim the name and use <code>'Hello'</code> when it is empty.
                  Review these changes before applying them.
                </p>
                <span className="agi-mk-actions">
                  <span className="agi-mk-btn agi-mk-btn--primary">Accept</span>
                  <span className="agi-mk-btn">Reject</span>
                </span>
              </div>
            </div>
          </div>
          <div className="agi-ed-input">
            <span className="agi-ed-chip">@agi</span>
            <span className="agi-dev-caret" />
          </div>
        </div>
      </div>
    </DeviceRoot>
  );
}

export function TerminalWindow({
  title = 'agi · zsh',
  badge = TOOL_STATUS_PRESENTATION['awaiting-approval'].label,
  className,
  routeMode = 'local',
}: TerminalWindowProps) {
  return (
    <DeviceRoot
      type="terminal"
      label="AGI CLI interface"
      className={['agi-terminal-responsive', className].filter(Boolean).join(' ')}
    >
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-term" aria-hidden="true">
        <p className="agi-term-line agi-term-strip">
          <span>{PRIVACY_MODE_DISPLAY[routeMode].label}</span>
          {routeMode === 'local' && CLI_LOCAL_RUNTIMES.names[0] ? (
            <span>{CLI_LOCAL_RUNTIMES.names[0]}</span>
          ) : null}
        </p>
        <div className="agi-term-proposal">
          <p className="agi-term-line agi-term-example">Example · file.txt</p>
          <p className="agi-term-line agi-term-cmd">Allow this edit?</p>
          <div className="agi-term-diff">
            <p className="agi-term-line">- alpha</p>
            <p className="agi-term-line">+ beta</p>
          </div>
        </div>
        <p className="agi-term-line agi-term-usage">{PRIVACY_MODE_USAGE_IMPLICATION[routeMode]}</p>
      </div>
    </DeviceRoot>
  );
}

export function PhoneDevice({
  label = 'AGI Mobile interface',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <DeviceRoot
      type="phone"
      label={label}
      className={['agi-phone-responsive', className].filter(Boolean).join(' ')}
    >
      <div className="agi-dev-body agi-ph" aria-hidden="true">
        <div className="agi-ph-status">
          <span className="agi-ph-time">11:10</span>
          <span className="agi-ph-signal">
            <i />
            <i />
            <i />
            <svg className="agi-ph-wifi" viewBox="0 0 14 10" fill="none">
              <path
                d="M1 8.5C2.8 5.5 5.2 4 7 4s4.2 1.5 6 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M3.5 8.5C4.8 6.8 5.8 6 7 6s2.2.8 3.5 2.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="7" cy="9" r="1" fill="currentColor" />
            </svg>
            <svg className="agi-ph-battery" viewBox="0 0 22 11" fill="none">
              <rect
                x="0.5"
                y="0.5"
                width="18"
                height="10"
                rx="2.5"
                stroke="currentColor"
                strokeOpacity="0.35"
              />
              <rect x="1.5" y="1.5" width="14" height="8" rx="1.5" fill="currentColor" />
              <path d="M20 3.5v4a1.5 1.5 0 000-4z" fill="currentColor" fillOpacity="0.4" />
            </svg>
          </span>
        </div>
        <div className="agi-ph-nav">
          <span className="agi-ph-navbtn">
            <Menu className="agi-phone-icon" role="img" aria-label="Navigation" focusable="false" />
          </span>
          <span className="agi-ph-name">AGI</span>
          <span className="agi-ph-navbtn">
            <SquarePen
              className="agi-phone-icon"
              role="img"
              aria-label="New chat"
              focusable="false"
            />
          </span>
        </div>
        <div className="agi-ph-main agi-ph-main--thread">
          <div className="agi-ph-toggle">
            <span className="agi-ph-toggle-btn agi-ph-toggle-btn--on">
              <Monitor className="agi-phone-icon" aria-hidden="true" focusable="false" />
              Local
            </span>
            <span className="agi-ph-toggle-btn">
              <Cloud className="agi-phone-icon" aria-hidden="true" focusable="false" />
              Cloud
            </span>
          </div>
          <div className="agi-mk-thread agi-mk-thread--phone">
            <p className="agi-mk-user">What did we decide for the launch demo?</p>
            <div className="agi-mk-agi">
              <ToolRow
                state="done"
                label="Memory"
                meta="3 facts"
                icon={
                  <Check
                    className="agi-phone-icon"
                    role="img"
                    aria-label="Memory found"
                    focusable="false"
                  />
                }
              />
              <p>
                From your memory: the demo runs from the CLI in Local mode, the deck lives in the
                Investor project, and the dry run is Thursday at 4pm. Want a reminder?
              </p>
              <Receipt
                route={ROUTE_RECEIPTS.local}
                tokensIn="900"
                tokensOut="120"
                time="1.1 s"
                compact
              />
            </div>
          </div>
        </div>
        <div className="agi-ph-composer-wrap">
          <div className="agi-ph-composer">
            <p className="agi-ph-ghost">Message AGI…</p>
            <div className="agi-ph-composer-foot">
              <span className="agi-ph-attach">
                <Plus className="agi-phone-icon" role="img" aria-label="Attach" focusable="false" />
              </span>
              <span className="agi-ph-model">
                <Blocks className="agi-phone-icon" aria-hidden="true" focusable="false" />
                AGI Standard
                <ChevronDown className="agi-phone-icon" aria-hidden="true" focusable="false" />
              </span>
              <span className="agi-ph-mic">
                <Mic
                  className="agi-phone-icon"
                  role="img"
                  aria-label="Microphone"
                  focusable="false"
                />
              </span>
              <span className="agi-dev-send">
                <ArrowUp
                  className="agi-phone-icon"
                  role="img"
                  aria-label="Send"
                  focusable="false"
                />
              </span>
            </div>
          </div>
        </div>
      </div>
    </DeviceRoot>
  );
}

export function AppWindow({
  title,
  badge,
  label,
  type = 'web',
  className,
  children,
}: {
  title: string;
  badge?: string;
  label: string;
  type?: DeviceType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <DeviceRoot type={type} label={label} className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-sc" aria-hidden="true">
        {children}
      </div>
    </DeviceRoot>
  );
}

export interface DeviceImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export function ImageWindow({
  title,
  badge,
  image,
  className,
}: {
  title: string;
  badge?: string;
  image: DeviceImage;
  className?: string;
}) {
  return (
    <figure
      className={['agi-dev', 'agi-dev--image', className].filter(Boolean).join(' ')}
      style={deviceStyle('desktop')}
      data-device="image"
    >
      <div className="agi-dev-shell">
        <WindowBar title={title} badge={badge} />
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="(min-width: 960px) 50vw, 100vw"
          className="agi-dev-image"
        />
      </div>
    </figure>
  );
}
