import {
  getToolDisplayLabel,
  interactionMode,
  TOOL_APPROVAL_ACTION_LABELS,
  TOOL_STATUS_PRESENTATION,
  type AdminPolicy,
  type ManagedMemoryCreateRequest,
  type ResearchStep,
} from '@agiworkforce/types';
import {
  artifactInclusionForPolicy,
  deriveArtifacts,
  EXPLICIT_ARTIFACT_DERIVATION_POLICY,
} from '@agiworkforce/artifacts';
import { ArrowUp, FileText, Image as ImageIcon, Mic } from 'lucide-react';
import { WRITE_FILE_TOOL } from '@/lib/e2b/execution-tools';
import { AppWindow } from './DeviceMockups';
import './agent-mockup-responsive.css';
import './artifact-mockup-responsive.css';
import './research-mockup-responsive.css';
import './memory-mockup-responsive.css';
import './project-mockup-responsive.css';
import './console-mockup-responsive.css';
import './composer-mockup-responsive.css';

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

export const PROJECT_SETTINGS_DRAFT_EXAMPLE = {
  name: 'Investor deck',
  instructions:
    'Keep answers concise. Ask for sources before stating metrics. Do not invent customer names.',
} as const;

export function ProjectWindow() {
  return (
    <AppWindow
      title="Project settings"
      badge="Web"
      label="Authored example of a current Web project settings draft"
      className="agi-project-responsive"
    >
      <div className="agi-sc-page" data-project-illustration="draft">
        <div className="agi-sc-page-head">
          <span className="agi-sc-page-title">Project settings</span>
          <span className="agi-sc-meta" data-project-example-label>
            Authored example
          </span>
        </div>
        <span className="agi-sc-meta" data-project-draft-caption>
          Current draft
        </span>
        <div className="agi-sc-card">
          <span className="agi-sc-card-head" data-project-native-label="name">
            Project name
          </span>
          <p className="agi-sc-instructions" data-project-draft-value="name">
            {PROJECT_SETTINGS_DRAFT_EXAMPLE.name}
          </p>
        </div>
        <div className="agi-sc-card">
          <span className="agi-sc-card-head" data-project-native-label="instructions">
            Instructions
          </span>
          <p className="agi-sc-instructions" data-project-draft-value="instructions">
            {PROJECT_SETTINGS_DRAFT_EXAMPLE.instructions}
          </p>
        </div>
        <span className="agi-mk-actions">
          <span className="agi-mk-btn agi-mk-btn--primary" data-project-native-label="action">
            Save
          </span>
        </span>
        <p className="agi-sc-note" data-project-draft-status>
          No changes have been saved.
        </p>
      </div>
    </AppWindow>
  );
}

const CONSOLE_MEMBERS = [
  { name: 'A. Okafor', role: 'Owner', email: 'a.okafor@example.com', status: 'active' },
  { name: 'J. Lindqvist', role: 'Admin', email: 'j.lindqvist@example.com', status: 'active' },
  { name: 'M. Ferreira', role: 'Member', email: 'm.ferreira@example.com', status: 'active' },
  { name: 'R. Nakamura', role: 'Member', email: 'r.nakamura@example.com', status: 'active' },
  { name: 'S. Adeyemi', role: 'Viewer', email: 's.adeyemi@example.com', status: 'active' },
] as const;

const CONSOLE_POLICY_DRAFT: Pick<
  AdminPolicy,
  | 'allowedPrivacyModes'
  | 'externalSharingEnabled'
  | 'auditExportEnabled'
  | 'chatSyncSurfaces'
  | 'retentionEnforced'
> = {
  allowedPrivacyModes: ['local', 'byok', 'managed'],
  externalSharingEnabled: false,
  auditExportEnabled: false,
  chatSyncSurfaces: ['web', 'desktop'],
  retentionEnforced: false,
};

const CONSOLE_AUDIT = [
  { time: 'Example', actor: 'example-owner', action: 'admin_policy_changed', outcome: 'success' },
  { time: 'Example', actor: 'system', action: 'scim_user_provisioned', outcome: 'success' },
  { time: 'Example', actor: 'example-admin', action: 'data_exported', outcome: 'denied' },
  { time: 'Example', actor: 'example-owner', action: 'admin_policy_changed', outcome: 'failure' },
] as const;

export function ConsoleWindow({
  view = 'members',
}: {
  view?: 'members' | 'policy' | 'audit' | 'usage';
}) {
  return (
    <AppWindow
      title="agiworkforce.com/workspace"
      badge="Console"
      label="The AGI workspace console"
      className="agi-console-responsive"
    >
      <p className="agi-sc-note agi-console-example">
        Authored example. This illustration is not connected to a workspace.
      </p>
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
              <span className="agi-sc-meta">Example members</span>
            </div>
            <div className="agi-mk-table agi-sc-table" data-cols="4">
              <span className="agi-mk-table-h">Name</span>
              <span className="agi-mk-table-h">Role</span>
              <span className="agi-mk-table-h">Email</span>
              <span className="agi-mk-table-h">Status</span>
              {CONSOLE_MEMBERS.map((member) => (
                <span className="agi-sc-row" key={member.name}>
                  <span>{member.name}</span>
                  <span>{member.role}</span>
                  <span>{member.email}</span>
                  <span>{member.status}</span>
                </span>
              ))}
            </div>
            <p className="agi-mk-receipt">
              Sample names and addresses. No member has been invited or changed.
            </p>
          </div>
        ) : null}
        {view === 'policy' ? (
          <div className="agi-sc-page">
            <div className="agi-sc-page-head">
              <span className="agi-sc-page-title">Policy</span>
              <span className="agi-sc-meta">Unsaved example</span>
            </div>
            <ul className="agi-sc-perms">
              <Perm
                label="Local"
                state={
                  CONSOLE_POLICY_DRAFT.allowedPrivacyModes.includes('local') ? 'allowed' : 'denied'
                }
              />
              <Perm
                label="Your own keys"
                state={
                  CONSOLE_POLICY_DRAFT.allowedPrivacyModes.includes('byok') ? 'allowed' : 'denied'
                }
              />
              <Perm
                label="Managed Cloud"
                state={
                  CONSOLE_POLICY_DRAFT.allowedPrivacyModes.includes('managed')
                    ? 'allowed'
                    : 'denied'
                }
              />
              <Perm
                label="Public sharing"
                state={CONSOLE_POLICY_DRAFT.externalSharingEnabled ? 'allowed' : 'denied'}
              />
              <Perm
                label="Audit export"
                state={CONSOLE_POLICY_DRAFT.auditExportEnabled ? 'allowed' : 'denied'}
              />
              <Perm
                label="Mobile sync"
                state={
                  CONSOLE_POLICY_DRAFT.chatSyncSurfaces.includes('mobile') ? 'allowed' : 'denied'
                }
              />
            </ul>
            <div className="agi-sc-card">
              <span className="agi-sc-card-head">Enforce retention</span>
              <p className="agi-sc-instructions">
                Enforce retention is {CONSOLE_POLICY_DRAFT.retentionEnforced ? 'on' : 'off'} in this
                unsaved example. No policy has been saved.
              </p>
            </div>
          </div>
        ) : null}
        {view === 'usage' ? (
          <div className="agi-sc-page">
            <div className="agi-sc-page-head">
              <span className="agi-sc-page-title">Usage</span>
              <span className="agi-sc-meta">Example layout</span>
            </div>
            <ul className="agi-sc-usage">
              <li>
                <span className="agi-sc-usage-row">
                  <span>Local</span>
                  <span className="agi-sc-meta">No usage data loaded</span>
                </span>
                <span className="agi-sc-bar" data-fill="0" />
              </li>
              <li>
                <span className="agi-sc-usage-row">
                  <span>Your own keys</span>
                  <span className="agi-sc-meta">No usage data loaded</span>
                </span>
                <span className="agi-sc-bar" data-fill="0" />
              </li>
              <li>
                <span className="agi-sc-usage-row">
                  <span>Managed Cloud</span>
                  <span className="agi-sc-meta">No usage data loaded</span>
                </span>
                <span className="agi-sc-bar" data-fill="0" />
              </li>
            </ul>
            <div className="agi-sc-card">
              <span className="agi-sc-card-head">Monthly spend limit</span>
              <p className="agi-sc-instructions">
                No usage or billing data is loaded in this illustration.
              </p>
            </div>
            <div className="agi-sc-panel-foot">
              <span>By member</span>
              <span>By model</span>
            </div>
          </div>
        ) : null}
        {view === 'audit' ? (
          <div className="agi-sc-page">
            <div className="agi-sc-page-head">
              <span className="agi-sc-page-title">Audit</span>
              <span className="agi-sc-meta">Example event rows</span>
            </div>
            <div className="agi-mk-table agi-sc-table" data-cols="4">
              <span className="agi-mk-table-h">When</span>
              <span className="agi-mk-table-h">Actor</span>
              <span className="agi-mk-table-h">Action</span>
              <span className="agi-mk-table-h">Outcome</span>
              {CONSOLE_AUDIT.map((event) => (
                <span className="agi-sc-row" key={event.actor + event.action + event.outcome}>
                  <span>{event.time}</span>
                  <span>{event.actor}</span>
                  <span className="agi-sc-mono">{event.action}</span>
                  <span data-outcome={event.outcome}>{event.outcome}</span>
                </span>
              ))}
            </div>
            <div className="agi-sc-panel-foot">
              <span>Export JSONL</span>
              <span>Filter by action</span>
              <span>Filter by outcome</span>
            </div>
            <p className="agi-sc-note">Illustrative events. No export or stream is running.</p>
          </div>
        ) : null}
      </div>
    </AppWindow>
  );
}

const COMPOSER_SEARCH_EXAMPLE = interactionMode('search');

export function ComposerWindow() {
  return (
    <AppWindow
      title="agiworkforce.com/chat"
      badge="Web"
      label="The AGI composer with a slash menu open"
      className="agi-composer-responsive"
    >
      <div className="agi-sc-composer-stage">
        <p className="agi-sc-note" data-composer-example="draft">
          Example · Web composer draft
        </p>
        <div className="agi-mk-composer agi-sc-composer">
          <div className="agi-mk-composer-row agi-sc-chips">
            <span className="agi-mk-chip" data-composer-attachment>
              <FileText className="agi-composer-icon" aria-hidden="true" focusable="false" />
              <span>deck-v7.pdf</span>
            </span>
            <span className="agi-mk-chip" data-composer-attachment>
              <ImageIcon className="agi-composer-icon" aria-hidden="true" focusable="false" />
              <span>screenshot.png</span>
            </span>
          </div>
          <div className="agi-mk-composer-row">
            <span className="agi-mk-ghost agi-sc-typed">
              <code>{COMPOSER_SEARCH_EXAMPLE.selector.label}</code>
            </span>
          </div>
          <div className="agi-mk-composer-row agi-mk-composer-foot">
            <span className="agi-mk-seg">
              <span data-on="true">{interactionMode('chat').selector.label}</span>
            </span>
            <span className="agi-sc-composer-tools">
              <span className="agi-sc-icon-control">
                <Mic className="agi-composer-icon" aria-hidden="true" focusable="false" />
              </span>
              <span className="agi-dev-send">
                <ArrowUp className="agi-composer-icon" aria-hidden="true" focusable="false" />
              </span>
            </span>
          </div>
        </div>
        <ul className="agi-sc-slash">
          <li data-on="true">
            <code className="agi-sc-slash-name">{COMPOSER_SEARCH_EXAMPLE.selector.label}</code>
            <p className="agi-sc-slash-hint" data-composer-command-description>
              {COMPOSER_SEARCH_EXAMPLE.description}
            </p>
          </li>
        </ul>
        <p className="agi-sc-note" data-composer-availability>
          Search availability depends on the selected model, tools and account. No message has been
          sent.
        </p>
      </div>
    </AppWindow>
  );
}
