import './legacy-landing.css';
import './motion/motion.css';
import { Typewriter, type TypedLine, type TypedLineClasses } from './motion/Typewriter';
import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import { DESKTOP_LOCAL_RUNTIMES } from '@/lib/marketing-constants';

const LOCAL_RUNTIME_LABEL = `${(DESKTOP_LOCAL_RUNTIMES.names[0] ?? '').toLowerCase()}(local)`;

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
  routeMode?: RouteMode;
}

interface RouteReceipt {
  lane: string;
  provider: string;
  cost: string;
}

const ROUTE_RECEIPTS: Record<RouteMode, RouteReceipt> = {
  local: { lane: 'Local', provider: LOCAL_RUNTIME_LABEL, cost: '$0.00' },
  byok: { lane: 'BYOK', provider: 'your provider', cost: 'billed to your key' },
  managed: { lane: 'AGI Cloud', provider: 'Auto route', cost: '$0.004' },
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

function Receipt({
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

function ToolRow({ state, label, meta }: { state: 'done' | 'wait'; label: string; meta: string }) {
  return (
    <p className="agi-mk-tool" data-state={state}>
      <i>{state === 'done' ? '✓' : '●'}</i>
      <span>{label}</span>
      <span className="agi-mk-tool-meta">{meta}</span>
    </p>
  );
}

function ComposerBar({ ghost, model, extra }: { ghost: string; model: string; extra?: ReactNode }) {
  return (
    <div className="agi-mk-composer">
      <div className="agi-mk-composer-row">
        <span className="agi-mk-ghost">
          {ghost}
          <span className="agi-dev-caret" />
        </span>
        <span className="agi-dev-send">➤</span>
      </div>
      <div className="agi-mk-composer-row agi-mk-composer-foot">
        <span className="agi-mk-seg">
          <span data-on="true">Chat</span>
          <span>AGI Work</span>
        </span>
        <span className="agi-mk-chip agi-mk-chip--model">{model} ▾</span>
        {extra}
      </div>
    </div>
  );
}

function PageContextStrip() {
  return (
    <div className="agi-dev-pagestrip">
      <span className="agi-dev-pagestrip-icon">▤</span>
      <span className="agi-dev-pagestrip-text">
        <span className="agi-dev-pagestrip-title">Q3 Strategy Doc</span>
        <span className="agi-dev-pagestrip-meta">docs.google.com · 4,200 words selected</span>
      </span>
      <span className="agi-dev-pagestrip-badge">Context</span>
    </div>
  );
}

function PanelComposer() {
  return (
    <div className="agi-dev-panelcomposer">
      <span className="agi-dev-panelcomposer-row">
        <span className="agi-dev-panelcomposer-icon">▤</span>
        <span className="agi-dev-panelcomposer-ghost">
          <span className="agi-dev-type">Ask about this page…</span>
        </span>
        <span className="agi-dev-send">➤</span>
      </span>
      <span className="agi-dev-panelcomposer-foot">
        <span>Paired · Desktop bridge</span>
        <span>Local ∨</span>
      </span>
    </div>
  );
}

export function DesktopWindow({
  title = 'AGI Workforce',
  badge = 'Local',
  className,
  routeMode = 'local',
}: DeviceWindowProps) {
  const route = ROUTE_RECEIPTS[routeMode];
  return (
    <DeviceRoot type="desktop" label={`${title} desktop app interface`} className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-desk" aria-hidden="true">
        <div className="agi-desk-side">
          <p className="agi-desk-brand">AGI</p>
          <p className="agi-desk-new">+ New chat</p>
          <p className="agi-desk-item">
            ⌕ Search <span className="agi-desk-kbd">⌘K</span>
          </p>
          <p className="agi-desk-item">
            ▤ Projects <span className="agi-desk-count">3</span>
          </p>
          <p className="agi-desk-item">
            ◇ Artifacts <span className="agi-desk-count">12</span>
          </p>
          <p className="agi-desk-item">
            ↻ Scheduled <span className="agi-desk-count">2</span>
          </p>
          <p className="agi-desk-item">
            ⌁ Dispatch <span className="agi-desk-beta">Beta</span>
          </p>
          <p className="agi-desk-group">Recents</p>
          <p className="agi-desk-recent agi-desk-recent--on">Release note for 1.2.0</p>
          <p className="agi-desk-recent">Quarterly notes</p>
          <p className="agi-desk-recent">Rust build fix</p>
          <p className="agi-desk-recent">Audit export</p>
          <p className="agi-desk-foot">→ Sign in · Cloud sync</p>
        </div>
        <div className="agi-mk-main">
          <div className="agi-mk-thread">
            <p className="agi-mk-user">Summarise the three open PRs and draft the release note.</p>
            <div className="agi-mk-agi">
              <ToolRow state="done" label="github · list pull requests" meta="3 results · 0.6 s" />
              <ToolRow state="done" label="Read 3 diffs" meta="412 lines" />
              <p>
                Three PRs are ready: routing health scopes, the model catalogue, and the pre-push
                worktree hook. The draft is below; writing it to the changelog needs your approval.
              </p>
              <div className="agi-mk-approval">
                <span className="agi-mk-approval-head">Approval · write file</span>
                <span className="agi-mk-approval-body">CHANGELOG.md · 14 lines added</span>
                <span className="agi-mk-actions">
                  <span className="agi-mk-btn agi-mk-btn--primary">Allow once</span>
                  <span className="agi-mk-btn">Always</span>
                  <span className="agi-mk-btn">Deny</span>
                </span>
              </div>
              <Receipt route={route} tokensIn="2.1k" tokensOut="380" time="3.8 s" />
            </div>
          </div>
          <ComposerBar ghost="Message AGI…" model={`Auto · ${route.lane}`} />
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
    <DeviceRoot type="web" label="The AGI Web chat interface" className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-web" aria-hidden="true">
        <div className="agi-desk-side">
          <p className="agi-desk-brand">AGI</p>
          <p className="agi-desk-new">+ New chat</p>
          <p className="agi-desk-item">
            ⌕ Search <span className="agi-desk-kbd">⌘K</span>
          </p>
          <p className="agi-desk-item">▤ Projects</p>
          <p className="agi-desk-item">◇ Library</p>
          <p className="agi-desk-group">Recents</p>
          <p className="agi-desk-recent agi-desk-recent--on">EU AI Act duties</p>
          <p className="agi-desk-recent">Onboarding email draft</p>
          <p className="agi-desk-recent">Pricing page copy</p>
          <p className="agi-desk-recent">Retention query</p>
        </div>
        <div className="agi-mk-main">
          <div className="agi-mk-thread">
            <p className="agi-mk-user">
              Compare the EU AI Act duties for providers versus deployers.
            </p>
            <div className="agi-mk-agi">
              <ToolRow state="done" label="Searched the web" meta="5 sources · 1.4 s" />
              <div className="agi-mk-table">
                <span className="agi-mk-table-h">Duty</span>
                <span className="agi-mk-table-h">Provider</span>
                <span className="agi-mk-table-h">Deployer</span>
                <span>Risk management</span>
                <span>Required</span>
                <span>Not required</span>
                <span>Human oversight</span>
                <span>Design for it</span>
                <span>Operate it</span>
                <span>Logging</span>
                <span>Enable it</span>
                <span>Keep six months</span>
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
            extra={
              <span className="agi-mk-composer-meta">
                <span>Enter to send · Shift+Enter for newline</span>
                <span>3,740 / 128,000</span>
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
    <DeviceRoot type="chrome" label="AGI Chrome extension interface" className={className}>
      <div className="agi-dev-bar agi-cr-tabbar" aria-hidden="true">
        <span className="agi-dev-lights">
          <i />
          <i />
          <i />
        </span>
        <span className="agi-cr-tabs">
          <span className="agi-cr-tab agi-cr-tab--on">
            <span className="agi-cr-tab-icon">▤</span>
            <span className="agi-cr-tab-label">Q3 Strategy · Google Docs</span>
          </span>
          <span className="agi-cr-tab">
            <span className="agi-cr-tab-icon">✦</span>
            <span className="agi-cr-tab-label">New Tab</span>
          </span>
          <span className="agi-cr-tab-add">+</span>
        </span>
        <span className="agi-dev-badge">{badge}</span>
      </div>
      <div className="agi-cr-addressbar" aria-hidden="true">
        <span className="agi-cr-nav">‹</span>
        <span className="agi-cr-nav">›</span>
        <span className="agi-cr-nav">↺</span>
        <span className="agi-cr-url">
          <span className="agi-cr-lock">●</span>
          docs.google.com/document/d/1xQ3Strategy…
        </span>
        <span className="agi-cr-ext">AGI</span>
      </div>
      <div className="agi-dev-body agi-cr-viewport" aria-hidden="true">
        <div className="agi-cr-page">
          <div className="agi-cr-doc-head">
            <span className="agi-cr-doc-icon">▤</span>
            <span className="agi-cr-doc-title">Q3 Strategy Document</span>
          </div>
          <div className="agi-cr-doc">
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
            <span className="agi-cr-panel-mode">◆ Local</span>
          </div>
          <PageContextStrip />
          <div className="agi-cr-chat">
            <p className="agi-cr-msg agi-cr-msg--user">Summarise the key risks from this doc</p>
            <div className="agi-cr-msg agi-cr-msg--agi">
              <span className="agi-cr-agi-name">AGI</span>
              <p>Three risks stand out in the selected section:</p>
              <ul className="agi-mk-list">
                <li>
                  Market timing <span className="agi-mk-cite">¶ 4</span>
                </li>
                <li>
                  One cloud provider for everything <span className="agi-mk-cite">¶ 9</span>
                </li>
                <li>
                  EU regulatory uncertainty <span className="agi-mk-cite">¶ 12</span>
                </li>
              </ul>
              <span className="agi-mk-actions">
                <span className="agi-mk-btn">Insert as comment</span>
                <span className="agi-mk-btn">Copy</span>
              </span>
              <p className="agi-cr-msg-fade">Paired with AGI Desktop · Local mode · 1.9 s</p>
            </div>
          </div>
          <PanelComposer />
        </div>
      </div>
    </DeviceRoot>
  );
}

export function SidePanelCard({
  title = 'AGI · side panel',
  badge = 'Scoped',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot type="panel" label={`${title} interface`} className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-pn" aria-hidden="true">
        <PageContextStrip />
        <div className="agi-pn-main">
          <div className="agi-pn-chips">
            <span className="agi-pn-chip--on">This page</span>
            <span>/tldr</span>
            <span>/extract</span>
          </div>
          <p className="agi-pn-msg">Summarize this page</p>
          <p className="agi-pn-line agi-pn-line--ok">✓ Context captured · sent to Desktop</p>
          <p className="agi-pn-line agi-pn-line--dim">
            Paired bridge · permissions scoped to this task
          </p>
        </div>
        <PanelComposer />
      </div>
    </DeviceRoot>
  );
}

const EDITOR_LINES: ReadonlyArray<{ n: number; add?: boolean; code: ReactNode }> = [
  {
    n: 1,
    code: (
      <>
        <em className="agi-ed-kw">import</em>{' '}
        <span className="agi-ed-dim">
          {'{'} processChat, ChatConfig {'}'}
        </span>
      </>
    ),
  },
  {
    n: 2,
    code: (
      <>
        <em className="agi-ed-kw">from</em> <span className="agi-ed-fn">'@agi/sdk'</span>
      </>
    ),
  },
  { n: 3, code: <span className="agi-ed-dim">&nbsp;</span> },
  {
    n: 4,
    code: (
      <>
        <em className="agi-ed-kw">export async function</em>{' '}
        <span className="agi-ed-fn">runChat</span>
        <span className="agi-ed-dim">(</span>
      </>
    ),
  },
  {
    n: 5,
    code: (
      <span className="agi-ed-dim agi-ed-indent">
        config<span className="agi-ed-punc">:</span> <span className="agi-ed-type">ChatConfig</span>
      </span>
    ),
  },
  {
    n: 6,
    code: (
      <span className="agi-ed-dim">
        {')'} <span className="agi-ed-punc">:</span> <span className="agi-ed-type">Promise</span>
        {'<string>'} {'{'}
      </span>
    ),
  },
  {
    n: 7,
    add: true,
    code: (
      <span className="agi-ed-dim agi-ed-indent">
        <em className="agi-ed-kw">try</em> {'{'}
      </span>
    ),
  },
  {
    n: 8,
    code: (
      <span className="agi-ed-dim agi-ed-indent">
        &nbsp;&nbsp;<em className="agi-ed-kw">const</em> stream{' '}
        <span className="agi-ed-punc">=</span> <span className="agi-ed-kw">await</span>{' '}
        <span className="agi-ed-fn">processChat</span>(config)
      </span>
    ),
  },
  {
    n: 9,
    code: (
      <span className="agi-ed-dim agi-ed-indent">
        &nbsp;&nbsp;<em className="agi-ed-kw">return</em> stream.text()
      </span>
    ),
  },
  {
    n: 10,
    add: true,
    code: (
      <span className="agi-ed-dim agi-ed-indent">
        {'}'} <em className="agi-ed-kw">catch</em> (error) {'{'}
      </span>
    ),
  },
  {
    n: 11,
    add: true,
    code: (
      <span className="agi-ed-dim agi-ed-indent">
        &nbsp;&nbsp;<em className="agi-ed-kw">throw new</em>{' '}
        <span className="agi-ed-type">ProviderError</span>(error)
      </span>
    ),
  },
  { n: 12, add: true, code: <span className="agi-ed-dim agi-ed-indent">{'}'}</span> },
  { n: 13, code: <span className="agi-ed-dim">{'}'}</span> },
];

export function EditorWindow({
  title = 'workspace.ts · AGI in VS Code',
  badge = 'VS Code',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot type="editor" label="AGI VS Code extension interface" className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-ed" aria-hidden="true">
        <div className="agi-ed-activity">
          <span>⊞</span>
          <span>⊘</span>
          <span className="agi-ed-act--on">◈</span>
          <span>⊙</span>
          <span>⊗</span>
          <span>⊕</span>
        </div>
        <div className="agi-ed-editor">
          <div className="agi-ed-code">
            {EDITOR_LINES.map((line) => (
              <span key={line.n} className={line.add ? 'agi-ed-row agi-ed-row--add' : 'agi-ed-row'}>
                <span className="agi-ed-ln">{line.add ? '+' : line.n}</span>
                <span>{line.code}</span>
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
              <p>@agi explain runChat and add error handling</p>
            </div>
            <div className="agi-ed-msg">
              <span className="agi-ed-avatar agi-ed-avatar--agi">A</span>
              <div className="agi-mk-agi">
                <p>
                  Streams a chat response from <code>processChat</code>. I wrapped the stream in{' '}
                  <code>try/catch</code> and rethrow as <code>ProviderError</code>, so the caller
                  sees which provider failed.
                </p>
                <span className="agi-mk-actions">
                  <span className="agi-mk-btn agi-mk-btn--primary">Apply +4</span>
                  <span className="agi-mk-btn">Reject</span>
                </span>
                <Receipt
                  route={ROUTE_RECEIPTS.local}
                  tokensIn="1.4k"
                  tokensOut="210"
                  time="0.9 s"
                  compact
                />
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

const TERMINAL_TYPED_LABEL = 'AGI CLI session transcript';
const TERMINAL_LINE_CLASSES: TypedLineClasses = {
  line: 'agi-term-line',
  kinds: { dim: 'agi-term-line--dim', ok: 'agi-term-ok', cmd: 'agi-term-cmd' },
};

function terminalLines(boundaryLabel: string): readonly TypedLine[] {
  return [
    { kind: 'ok', text: boundaryLabel },
    { kind: 'cmd', text: '› fix the failing test in packages/ai/routing' },
    { kind: 'dim', text: '  read   packages/ai/routing/src/auto.ts' },
    { kind: 'dim', text: '  run    pnpm vitest auto.test.ts          1 failed' },
    { kind: 'dim', text: '  edit   src/auto.ts                       +4 -1' },
    { kind: 'dim', text: '  run    pnpm vitest auto.test.ts          12 passed' },
    { kind: 'ok', text: '✓ fixed · the health scope read a stale snapshot' },
    { kind: 'out', text: '  commit as fix(routing): read the live snapshot? [y/n]' },
  ];
}

export function TerminalWindow({
  title = 'agi · zsh',
  badge = 'sandboxed',
  className,
  routeMode = 'local',
}: DeviceWindowProps) {
  const isByok = routeMode === 'byok';
  const isManaged = routeMode === 'managed';
  const routeLabel = isByok ? 'BYOK' : isManaged ? 'managed cloud' : 'local model';
  const providerLabel = isByok ? 'your provider' : isManaged ? 'AGI managed' : LOCAL_RUNTIME_LABEL;
  const boundaryLabel = isByok
    ? '● BYOK · direct to your provider'
    : isManaged
      ? '● cloud · managed by AGI'
      : '● local · on-device & private';
  const footerMode = isByok ? 'BYOK' : isManaged ? 'cloud' : 'local';

  return (
    <DeviceRoot type="terminal" label="AGI CLI interface" className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-term" aria-hidden="true">
        <p className="agi-term-line agi-term-line--dim agi-term-strip">
          <span>
            AGI · <span className="agi-term-ok">{routeLabel}</span> · {providerLabel}
          </span>
          <span className="agi-term-hud">
            in 8.4k · out 1.2k ·{' '}
            <span className="agi-term-ok">{isByok ? 'provider billed' : '$0.0000'}</span> · ctx 12%
          </span>
        </p>
        <Typewriter
          lines={terminalLines(boundaryLabel)}
          label={TERMINAL_TYPED_LABEL}
          classes={TERMINAL_LINE_CLASSES}
        />
        <p className="agi-term-line">
          <span className="agi-term-prompt">›</span> y<span className="agi-term-caret" />
        </p>
        <p className="agi-term-line agi-term-line--dim">
          Default · {footerMode} · effort:Medium · sandbox: seatbelt
        </p>
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
    <DeviceRoot type="phone" label={label} className={className}>
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
          <span className="agi-ph-navbtn">☰</span>
          <span className="agi-ph-name">AGI</span>
          <span className="agi-ph-navbtn">✎</span>
        </div>
        <div className="agi-ph-main agi-ph-main--thread">
          <div className="agi-ph-toggle">
            <span className="agi-ph-toggle-btn agi-ph-toggle-btn--on">⊞ Local</span>
            <span className="agi-ph-toggle-btn">☁ Cloud</span>
          </div>
          <div className="agi-mk-thread agi-mk-thread--phone">
            <p className="agi-mk-user">What did we decide for the launch demo?</p>
            <div className="agi-mk-agi">
              <ToolRow state="done" label="Memory" meta="3 facts" />
              <p>
                From your memory: the demo runs on Desktop in Local mode, the deck lives in the
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
              <span className="agi-ph-attach">+</span>
              <span className="agi-ph-model">⊡ AGI Standard ∨</span>
              <span className="agi-ph-mic">◉</span>
              <span className="agi-dev-send">➤</span>
            </div>
          </div>
        </div>
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
