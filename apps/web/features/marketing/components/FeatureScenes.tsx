import { AppWindow, Receipt, ROUTE_RECEIPTS, ToolRow } from './DeviceMockups';

const STEP_GLYPH = { done: '✓', active: '●', pending: '○' } as const;

type StepState = keyof typeof STEP_GLYPH;

function Step({ state, label, meta }: { state: StepState; label: string; meta: string }) {
  return (
    <li className="agi-sc-step" data-state={state}>
      <i>{STEP_GLYPH[state]}</i>
      <span>{label}</span>
      <span className="agi-sc-meta">{meta}</span>
    </li>
  );
}

function Perm({ label, state }: { label: string; state: 'allowed' | 'ask' | 'denied' }) {
  return (
    <li className="agi-sc-perm" data-state={state}>
      <span>{label}</span>
      <span className="agi-sc-meta">
        <i /> {state}
      </span>
    </li>
  );
}

export function AgentRunWindow() {
  return (
    <AppWindow
      title="agiworkforce.com/chat · agent run"
      badge="Local"
      label="An AGI agent run paused on an approval"
    >
      <div className="agi-sc-split" data-cols="3-2">
        <div className="agi-mk-thread agi-sc-pad">
          <p className="agi-mk-user">Triage the failing nightly build and open a fix PR.</p>
          <div className="agi-mk-agi">
            <div className="agi-sc-card">
              <span className="agi-sc-card-head">Plan · 4 steps</span>
              <ul className="agi-sc-steps">
                <Step state="done" label="Read the failing job log" meta="3.1 s" />
                <Step state="done" label="Reproduce in the sandbox" meta="41 s" />
                <Step state="active" label="Edit packages/ai/routing/src/auto.ts" meta="waiting" />
                <Step state="pending" label="Open a pull request" meta="after approval" />
              </ul>
            </div>
            <div className="agi-mk-approval">
              <span className="agi-mk-approval-head">Approval · edit file</span>
              <span className="agi-mk-approval-body">src/auto.ts · +4 −1</span>
              <span className="agi-mk-actions">
                <span className="agi-mk-btn agi-mk-btn--primary">Allow once</span>
                <span className="agi-mk-btn">Always</span>
                <span className="agi-mk-btn">Deny</span>
              </span>
            </div>
            <Receipt route={ROUTE_RECEIPTS.local} tokensIn="12k" tokensOut="1.1k" time="58 s" />
          </div>
        </div>
        <aside className="agi-sc-rail">
          <span className="agi-sc-card-head">Permissions for this run</span>
          <ul className="agi-sc-perms">
            <Perm label="Read files" state="allowed" />
            <Perm label="Run tests in the sandbox" state="allowed" />
            <Perm label="Edit files" state="ask" />
            <Perm label="Network" state="denied" />
            <Perm label="git push" state="ask" />
          </ul>
          <p className="agi-sc-note">Nothing on this list runs without you.</p>
        </aside>
      </div>
    </AppWindow>
  );
}

export function ArtifactsWindow() {
  return (
    <AppWindow
      title="agiworkforce.com/chat · artifact"
      badge="Web"
      label="An AGI artifact open beside the chat"
    >
      <div className="agi-sc-split" data-cols="2-3">
        <div className="agi-mk-thread agi-sc-pad">
          <p className="agi-mk-user">Turn the interview notes into a one-page brief.</p>
          <div className="agi-mk-agi">
            <ToolRow state="done" label="Read 3 files" meta="2,140 words" />
            <p>
              Drafted the brief as an artifact. Version 3 tightens the summary and adds the table.
            </p>
            <Receipt
              route={ROUTE_RECEIPTS.managed}
              tokensIn="4.8k"
              tokensOut="900"
              time="9.4 s"
              compact
            />
          </div>
        </div>
        <div className="agi-sc-panel">
          <div className="agi-sc-panel-head">
            <span className="agi-sc-tabs">
              <span data-on="true">Preview</span>
              <span>Code</span>
            </span>
            <span className="agi-sc-tabs agi-sc-tabs--versions">
              <span>v1</span>
              <span>v2</span>
              <span data-on="true">v3</span>
            </span>
          </div>
          <div className="agi-sc-doc">
            <p className="agi-sc-doc-title">Customer interview brief</p>
            <span className="agi-cr-line" style={{ width: '92%' }} />
            <span className="agi-cr-line" style={{ width: '84%' }} />
            <span className="agi-cr-line" style={{ width: '88%' }} />
            <div className="agi-mk-table agi-sc-doc-table">
              <span className="agi-mk-table-h">Theme</span>
              <span className="agi-mk-table-h">Mentions</span>
              <span className="agi-mk-table-h">Quote</span>
              <span>Onboarding time</span>
              <span>7 of 9</span>
              <span>Two days lost to setup</span>
              <span>Export formats</span>
              <span>5 of 9</span>
              <span>Give me the CSV</span>
              <span>Pricing clarity</span>
              <span>4 of 9</span>
              <span>Which plan is mine</span>
            </div>
          </div>
          <div className="agi-sc-panel-foot">
            <span>Copy</span>
            <span>Download .md</span>
            <span>Open in Library</span>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

export function ResearchWindow() {
  return (
    <AppWindow
      title="agiworkforce.com/chat · deep research"
      badge="Web"
      label="An AGI deep research run with its plan and report"
    >
      <div className="agi-sc-split" data-cols="2-3">
        <aside className="agi-sc-rail agi-sc-rail--left">
          <span className="agi-sc-card-head">Research plan · approved</span>
          <ul className="agi-sc-steps">
            <Step state="done" label="EU AI Act deployer obligations" meta="6 hits" />
            <Step state="done" label="GPAI code of practice status" meta="4 hits" />
            <Step state="done" label="National enforcement timelines" meta="5 hits" />
            <Step state="done" label="SME exemptions, article 62" meta="3 hits" />
            <Step state="done" label="Fines and thresholds" meta="4 hits" />
          </ul>
          <p className="agi-sc-note">12 sources read · 3 rejected (paywall, duplicate)</p>
        </aside>
        <div className="agi-sc-report">
          <p className="agi-sc-doc-title">Deployer duties under the EU AI Act</p>
          <p>
            Deployers of high risk systems must run them under the provider's instructions, keep
            human oversight in place, and retain logs for at least six months
            <span className="agi-mk-cite">1</span>. Obligations phase in by risk class, with the
            general purpose provisions already in force <span className="agi-mk-cite">2</span>.
          </p>
          <p>
            Small deployers keep the same duties but gain simplified documentation and lower penalty
            ceilings <span className="agi-mk-cite">3</span>.
          </p>
          <ul className="agi-sc-sources">
            <li>
              <span className="agi-mk-cite">1</span> eur-lex.europa.eu
            </li>
            <li>
              <span className="agi-mk-cite">2</span> digital-strategy.ec.europa.eu
            </li>
            <li>
              <span className="agi-mk-cite">3</span> europarl.europa.eu
            </li>
          </ul>
          <Receipt route={ROUTE_RECEIPTS.managed} tokensIn="41k" tokensOut="2.3k" time="84 s" />
        </div>
      </div>
    </AppWindow>
  );
}

const MEMORY_FACTS = [
  { text: 'Prefers answers in British English.', source: 'You · Settings' },
  { text: 'The launch demo runs on Desktop in Local mode.', source: 'Chat · Launch plan' },
  {
    text: 'The weekly report goes out Friday at 4pm to the leadership list.',
    source: 'Chat · Reporting',
  },
  { text: 'Uses pnpm, never npm, in the monorepo.', source: 'Chat · Rust build fix' },
  { text: 'The investor deck lives in the Investor project.', source: 'Project · Investor deck' },
] as const;

export function MemoryWindow() {
  return (
    <AppWindow title="Settings · Memory" badge="Local" label="The AGI memory list in settings">
      <div className="agi-sc-page">
        <div className="agi-sc-page-head">
          <span className="agi-sc-page-title">Memory</span>
          <span className="agi-sc-toggle" data-on="true">
            <i /> On · stays on this device
          </span>
        </div>
        <div className="agi-sc-search">Search memory…</div>
        <ul className="agi-sc-list">
          {MEMORY_FACTS.map((fact) => (
            <li className="agi-sc-fact" key={fact.text}>
              <span className="agi-sc-fact-text">{fact.text}</span>
              <span className="agi-sc-fact-row">
                <span className="agi-sc-meta">{fact.source}</span>
                <span className="agi-sc-links">
                  <span>Edit</span>
                  <span>Delete</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div className="agi-sc-panel-foot">
          <span>{MEMORY_FACTS.length} facts</span>
          <span>Export</span>
          <span>Clear all</span>
        </div>
      </div>
    </AppWindow>
  );
}

const PROJECT_FILES = [
  { name: 'deck-v7.pdf', meta: '2.1 MB · today' },
  { name: 'metrics-q3.csv', meta: '48 KB · yesterday' },
  { name: 'notes.md', meta: '6 KB · 2 Sep' },
  { name: 'board-transcript.txt', meta: '31 KB · 1 Sep' },
] as const;

const PROJECT_THREADS = [
  { name: 'Rewrite the traction slide', meta: 'today' },
  { name: 'Sanity check the CAC math', meta: 'yesterday' },
  { name: 'Draft the ask', meta: '2 Sep' },
] as const;

export function ProjectWindow() {
  return (
    <AppWindow
      title="agiworkforce.com/chat/projects/investor-deck"
      badge="Web"
      label="An AGI project home with instructions, files and threads"
    >
      <div className="agi-sc-page">
        <div className="agi-sc-page-head">
          <span className="agi-sc-page-title">Investor deck</span>
          <span className="agi-sc-meta">3 threads · 4 files · Local and Cloud allowed</span>
        </div>
        <div className="agi-sc-card">
          <span className="agi-sc-card-head">Instructions</span>
          <p className="agi-sc-instructions">
            Answer as the founder. Cite the metrics file for any number. Never invent a customer
            name.
          </p>
        </div>
        <div className="agi-sc-split" data-cols="1-1">
          <div>
            <span className="agi-sc-card-head">Files</span>
            <ul className="agi-sc-list agi-sc-list--tight">
              {PROJECT_FILES.map((file) => (
                <li key={file.name}>
                  <span>{file.name}</span>
                  <span className="agi-sc-meta">{file.meta}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <span className="agi-sc-card-head">Threads</span>
            <ul className="agi-sc-list agi-sc-list--tight">
              {PROJECT_THREADS.map((thread) => (
                <li key={thread.name}>
                  <span>{thread.name}</span>
                  <span className="agi-sc-meta">{thread.meta}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="agi-mk-receipt">
          <span className="agi-mk-dot" />
          Every prompt here carries the instructions and 4 files · 9.2k tokens of context
        </p>
      </div>
    </AppWindow>
  );
}

const CONSOLE_MEMBERS = [
  { name: 'A. Okafor', role: 'Owner', seat: 'SSO', last: 'today' },
  { name: 'J. Lindqvist', role: 'Admin', seat: 'SSO', last: 'today' },
  { name: 'M. Ferreira', role: 'Member', seat: 'SCIM', last: 'yesterday' },
  { name: 'R. Nakamura', role: 'Member', seat: 'SCIM', last: '2 Sep' },
  { name: 'S. Adeyemi', role: 'Viewer', seat: 'Invite', last: 'pending' },
] as const;

const CONSOLE_AUDIT = [
  { time: '09:14', actor: 'A. Okafor', action: 'policy.changed', outcome: 'success' },
  { time: '09:02', actor: 'system', action: 'scim.user_provisioned', outcome: 'success' },
  { time: '08:41', actor: 'J. Lindqvist', action: 'data_exported', outcome: 'denied' },
  { time: '08:40', actor: 'A. Okafor', action: 'admin_policy_changed', outcome: 'success' },
] as const;

export function ConsoleWindow({
  view = 'members',
}: {
  view?: 'members' | 'policy' | 'audit' | 'usage';
}) {
  return (
    <AppWindow title="agiworkforce.com/workspace" badge="Console" label="The AGI workspace console">
      <div className="agi-sc-split" data-cols="1-4">
        <aside className="agi-sc-rail agi-sc-rail--left agi-sc-rail--nav">
          {[
            'Overview',
            'Members',
            'Policy',
            'Models',
            'Connectors',
            'Usage',
            'Identity',
            'Audit',
          ].map((item) => (
            <span
              className="agi-sc-navitem"
              data-on={
                (view === 'members' && item === 'Members') ||
                (view === 'policy' && item === 'Policy') ||
                (view === 'audit' && item === 'Audit') ||
                (view === 'usage' && item === 'Usage')
                  ? 'true'
                  : undefined
              }
              key={item}
            >
              {item}
            </span>
          ))}
        </aside>
        {view === 'members' ? (
          <div className="agi-sc-page">
            <div className="agi-sc-page-head">
              <span className="agi-sc-page-title">Members</span>
              <span className="agi-sc-meta">12 seats · 11 active · 1 invitation</span>
            </div>
            <div className="agi-mk-table agi-sc-table" data-cols="4">
              <span className="agi-mk-table-h">Name</span>
              <span className="agi-mk-table-h">Role</span>
              <span className="agi-mk-table-h">Seat</span>
              <span className="agi-mk-table-h">Last active</span>
              {CONSOLE_MEMBERS.map((member) => (
                <span className="agi-sc-row" key={member.name}>
                  <span>{member.name}</span>
                  <span>{member.role}</span>
                  <span>{member.seat}</span>
                  <span>{member.last}</span>
                </span>
              ))}
            </div>
            <p className="agi-mk-receipt">
              <span className="agi-mk-dot" />
              SSO: SAML connected · SCIM: on, last sync 09:02 · every change lands in the audit
              trail
            </p>
          </div>
        ) : null}
        {view === 'policy' ? (
          <div className="agi-sc-page">
            <div className="agi-sc-page-head">
              <span className="agi-sc-page-title">Policy</span>
              <span className="agi-sc-meta">Enforced server side</span>
            </div>
            <ul className="agi-sc-perms">
              <Perm label="Local runs allowed" state="allowed" />
              <Perm label="BYOK allowed" state="allowed" />
              <Perm label="AGI Cloud allowed" state="allowed" />
              <Perm label="Public share links" state="denied" />
              <Perm label="Data export" state="ask" />
              <Perm label="Client sync to phones" state="denied" />
            </ul>
            <div className="agi-sc-card">
              <span className="agi-sc-card-head">Retention</span>
              <p className="agi-sc-instructions">
                90 days, enforced. Legal holds exempt two conversations.
              </p>
            </div>
          </div>
        ) : null}
        {view === 'usage' ? (
          <div className="agi-sc-page">
            <div className="agi-sc-page-head">
              <span className="agi-sc-page-title">Usage</span>
              <span className="agi-sc-meta">This billing period · resets in 27 days</span>
            </div>
            <ul className="agi-sc-usage">
              <li>
                <span className="agi-sc-usage-row">
                  <span>Local</span>
                  <span className="agi-sc-meta">312 runs · $0.00</span>
                </span>
                <span className="agi-sc-bar" data-fill="0" />
              </li>
              <li>
                <span className="agi-sc-usage-row">
                  <span>BYOK</span>
                  <span className="agi-sc-meta">1,048 runs · billed by your provider</span>
                </span>
                <span className="agi-sc-bar" data-fill="0" />
              </li>
              <li>
                <span className="agi-sc-usage-row">
                  <span>AGI Cloud</span>
                  <span className="agi-sc-meta">$12.40 of the $25.00 seat cap</span>
                </span>
                <span className="agi-sc-bar" data-fill="50" />
              </li>
            </ul>
            <div className="agi-sc-card">
              <span className="agi-sc-card-head">Spend ceiling</span>
              <p className="agi-sc-instructions">
                Runs stop at the cap. Overage stays off until an owner turns it on.
              </p>
            </div>
            <div className="agi-sc-panel-foot">
              <span>Export CSV</span>
              <span>By member</span>
              <span>By model</span>
            </div>
          </div>
        ) : null}
        {view === 'audit' ? (
          <div className="agi-sc-page">
            <div className="agi-sc-page-head">
              <span className="agi-sc-page-title">Audit</span>
              <span className="agi-sc-meta">Streaming to your SIEM · signed batches</span>
            </div>
            <div className="agi-mk-table agi-sc-table" data-cols="4">
              <span className="agi-mk-table-h">Time</span>
              <span className="agi-mk-table-h">Actor</span>
              <span className="agi-mk-table-h">Action</span>
              <span className="agi-mk-table-h">Outcome</span>
              {CONSOLE_AUDIT.map((event) => (
                <span className="agi-sc-row" key={event.time + event.action}>
                  <span>{event.time}</span>
                  <span>{event.actor}</span>
                  <span className="agi-sc-mono">{event.action}</span>
                  <span data-outcome={event.outcome}>{event.outcome}</span>
                </span>
              ))}
            </div>
            <div className="agi-sc-panel-foot">
              <span>Export JSONL</span>
              <span>Filter</span>
              <span>Legal hold</span>
            </div>
          </div>
        ) : null}
      </div>
    </AppWindow>
  );
}

const SLASH_COMMANDS = [
  { name: '/research', hint: 'Plan searches, wait for approval, cite every claim' },
  { name: '/code', hint: 'Run in the sandbox and return the output' },
  { name: '/image', hint: 'Generate or edit an image' },
  { name: '/summarise', hint: 'Condense the attached files' },
] as const;

export function ComposerWindow() {
  return (
    <AppWindow
      title="agiworkforce.com/chat"
      badge="Web"
      label="The AGI composer with a slash menu open"
    >
      <div className="agi-sc-composer-stage">
        <div className="agi-mk-composer agi-sc-composer">
          <div className="agi-mk-composer-row agi-sc-chips">
            <span className="agi-mk-chip">▤ deck-v7.pdf</span>
            <span className="agi-mk-chip">▣ screenshot.png</span>
            <span className="agi-mk-chip">◉ 0:42 dictated</span>
          </div>
          <div className="agi-mk-composer-row">
            <span className="agi-mk-ghost agi-sc-typed">
              /research the EU AI Act deployer duties
              <span className="agi-dev-caret" />
            </span>
            <span className="agi-dev-send">➤</span>
          </div>
          <div className="agi-mk-composer-row agi-mk-composer-foot">
            <span className="agi-mk-seg">
              <span data-on="true">Chat</span>
              <span>AGI Work</span>
            </span>
            <span className="agi-mk-chip agi-mk-chip--model">Auto ▾</span>
            <span className="agi-mk-chip">Search · on</span>
            <span className="agi-mk-composer-meta">
              <span>Enter to send</span>
            </span>
          </div>
        </div>
        <ul className="agi-sc-slash">
          {SLASH_COMMANDS.map((command, index) => (
            <li data-on={index === 0 ? 'true' : undefined} key={command.name}>
              <span className="agi-sc-slash-name">{command.name}</span>
              <span className="agi-sc-slash-hint">{command.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </AppWindow>
  );
}
