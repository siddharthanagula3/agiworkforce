import {
  getToolDisplayLabel,
  TOOL_APPROVAL_ACTION_LABELS,
  TOOL_STATUS_PRESENTATION,
  type ManagedMemoryCreateRequest,
  type ResearchStep,
} from '@agiworkforce/types';
import {
  artifactInclusionForPolicy,
  deriveArtifacts,
  EXPLICIT_ARTIFACT_DERIVATION_POLICY,
} from '@agiworkforce/artifacts';
import { WRITE_FILE_TOOL } from '@/lib/e2b/execution-tools';
import { AppWindow } from './DeviceMockups';
import './agent-mockup-responsive.css';
import './artifact-mockup-responsive.css';
import './research-mockup-responsive.css';
import './memory-mockup-responsive.css';

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

const AGENT_APPROVAL_EXAMPLE = {
  path: 'report.txt',
  content: 'Notes for the project report.',
};

export function AgentRunWindow() {
  return (
    <AppWindow
      title="agiworkforce.com/chat · approval example"
      badge="Web"
      label="Example Web file-write approval request"
      className="agi-agent-responsive"
    >
      <div className="agi-sc-split" data-cols="3-2">
        <div className="agi-mk-thread agi-sc-pad">
          <p className="agi-sc-note">Example · Web approval request</p>
          <p className="agi-mk-user">Save these notes as report.txt.</p>
          <div className="agi-mk-agi">
            <div className="agi-sc-card">
              <span className="agi-sc-card-head">
                {getToolDisplayLabel(WRITE_FILE_TOOL).displayName}
              </span>
              <pre className="agi-sc-example-code">
                <code>{JSON.stringify(AGENT_APPROVAL_EXAMPLE, null, 2)}</code>
              </pre>
            </div>
            <div className="agi-mk-approval">
              <span className="agi-mk-approval-head">
                {TOOL_STATUS_PRESENTATION['awaiting-approval'].label}
              </span>
              <span className="agi-mk-approval-body">{AGENT_APPROVAL_EXAMPLE.path}</span>
              <span className="agi-mk-actions">
                <span className="agi-mk-btn agi-mk-btn--primary">
                  {TOOL_APPROVAL_ACTION_LABELS.allow}
                </span>
                <span className="agi-mk-btn">{TOOL_APPROVAL_ACTION_LABELS.deny}</span>
              </span>
            </div>
          </div>
        </div>
        <aside className="agi-sc-rail">
          <span className="agi-sc-card-head">Request details</span>
          <dl className="agi-sc-request-details">
            <div>
              <dt>Tool</dt>
              <dd>
                <code>{WRITE_FILE_TOOL}</code>
              </dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>
                <code>{AGENT_APPROVAL_EXAMPLE.path}</code>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{TOOL_STATUS_PRESENTATION['awaiting-approval'].label}</dd>
            </div>
          </dl>
          <p className="agi-sc-note">No file has been written.</p>
          <p className="agi-sc-note">Sandbox tools must be enabled and available.</p>
        </aside>
      </div>
    </AppWindow>
  );
}

const ARTIFACT_EXAMPLE_TEXT = {
  title: 'Project notes',
  body: 'Keep the next steps together.',
};

const [ARTIFACT_EXAMPLE] = deriveArtifacts(
  [
    '```html',
    '<!-- @artifact -->',
    '<!doctype html>',
    '<html lang="en">',
    `<head><title>${ARTIFACT_EXAMPLE_TEXT.title}</title></head>`,
    '<body>',
    `  <h1>${ARTIFACT_EXAMPLE_TEXT.title}</h1>`,
    `  <p>${ARTIFACT_EXAMPLE_TEXT.body}</p>`,
    '</body>',
    '</html>',
    '```',
  ].join('\n'),
  { include: artifactInclusionForPolicy(EXPLICIT_ARTIFACT_DERIVATION_POLICY) },
);

export function ArtifactsWindow() {
  if (!ARTIFACT_EXAMPLE) throw new Error('The HTML illustration must derive an artifact');
  return (
    <AppWindow
      title="agiworkforce.com/chat · artifact example"
      badge="Web"
      label="Example Web HTML artifact preview and source"
      className="agi-artifact-responsive"
    >
      <div className="agi-sc-artifact-heading">
        <p>Example · Web HTML artifact</p>
        <span className="agi-sc-artifact-title">{ARTIFACT_EXAMPLE.title}</span>
      </div>
      <div className="agi-sc-artifact-layout">
        <div className="agi-sc-artifact-source">
          <span className="agi-sc-card-head">Illustration source</span>
          <pre>
            <code>{ARTIFACT_EXAMPLE.content}</code>
          </pre>
        </div>
        <div className="agi-sc-panel">
          <div className="agi-sc-panel-head">
            <span className="agi-sc-tabs">
              <span data-on="true">Preview</span>
              <span>Source</span>
            </span>
            <span className="agi-sc-tabs agi-sc-tabs--versions">
              <span data-on="true">v{ARTIFACT_EXAMPLE.version}/1</span>
            </span>
          </div>
          <div className="agi-sc-artifact-preview">
            <h2 className="agi-sc-doc-title">{ARTIFACT_EXAMPLE_TEXT.title}</h2>
            <p>{ARTIFACT_EXAMPLE_TEXT.body}</p>
          </div>
          <div className="agi-sc-panel-foot">
            <span>Copy</span>
            <span>Download source (.{ARTIFACT_EXAMPLE.language})</span>
            <span>Save to Library</span>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

export const RESEARCH_PLAN_EXAMPLE = [
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

export function ResearchWindow() {
  return (
    <AppWindow
      title="agiworkforce.com/chat · research plan example"
      badge="Web"
      label="Example Web research plan awaiting approval"
      className="agi-research-responsive"
    >
      <div className="agi-sc-research-plan">
        <p className="agi-sc-note">Example · Web research plan</p>
        <p className="agi-mk-user">Compare project planning tools for a small team.</p>
        <div className="agi-sc-card">
          <span className="agi-sc-card-head">Research plan</span>
          <p>Review the plan to start searching</p>
          <p>Edit the steps and choose sources and report options before starting.</p>
          <ol className="agi-sc-research-steps">
            {RESEARCH_PLAN_EXAMPLE.map((step) => (
              <li key={step.id} data-status={step.status}>
                <span>{step.description}</span>
              </li>
            ))}
          </ol>
          <span className="agi-mk-actions">
            <span className="agi-mk-btn agi-mk-btn--primary">Start research</span>
            <span className="agi-mk-btn">Cancel</span>
          </span>
        </div>
      </div>
    </AppWindow>
  );
}

export const MEMORY_DRAFT_REQUEST = {
  content: 'I prefer concise answers.',
  source: 'web',
} as const satisfies ManagedMemoryCreateRequest;

export function MemoryWindow() {
  return (
    <AppWindow
      title="Settings · Memory"
      badge="Web"
      label="Authored example of a current Web memory draft"
      className="agi-memory-responsive"
    >
      <div className="agi-sc-page" data-memory-illustration="draft">
        <div className="agi-sc-page-head">
          <span className="agi-sc-page-title">Memory</span>
          <span className="agi-sc-meta" data-memory-example-label>
            Authored example
          </span>
        </div>
        <span className="agi-sc-meta" data-memory-draft-caption>
          Current draft
        </span>
        <span className="agi-sc-fact-text" data-memory-native-label="field">
          Add a new fact
        </span>
        <div className="agi-sc-fact" data-memory-draft-field>
          <p className="agi-sc-fact-text" data-memory-draft-content>
            {MEMORY_DRAFT_REQUEST.content}
          </p>
        </div>
        <span className="agi-sc-links" data-memory-native-label="action">
          Add
        </span>
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
          <span className="agi-sc-meta">3 threads · 4 files</span>
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
