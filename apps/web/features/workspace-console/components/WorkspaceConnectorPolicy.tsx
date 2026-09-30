'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, PlugZap, X } from 'lucide-react';
import {
  CONNECTOR_POLICY_MCP_HOST_PATTERN,
  CONNECTOR_POLICY_PLUGIN_KEY_PATTERN,
  connectorCategoryToolName,
  normalizeWebDomain,
  type ConnectorToolCategory,
  type ConnectorToolPermissionLevel,
  type WorkspaceConnectorToolRule,
} from '@agiworkforce/cloud-contracts';

import {
  useConnectorPolicy,
  useUpdateConnectorPolicy,
  type ConnectorPolicyLists,
} from '../hooks/use-connector-policy';
import { toUserMessage } from '@/lib/user-error-message';
import { ChipInput, useUnsavedChangesGuard } from '@agiworkforce/ui';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

type Effective = 'available' | 'blocked' | 'not-approved';

function effectiveFor(connectorId: string, lists: ConnectorPolicyLists): Effective {
  const id = connectorId.toLowerCase();
  const has = (list: string[]) => list.some((entry) => entry.trim().toLowerCase() === id);

  if (has(lists.blockedConnectors)) return 'blocked';
  if (has(lists.allowedConnectors)) return 'available';
  if (lists.allowedConnectors.length > 0) return 'not-approved';
  return 'available';
}

function EffectiveChip({ state }: { state: Effective }) {
  const copy: Record<Effective, { text: string; alarming: boolean }> = {
    available: { text: 'Available', alarming: false },
    blocked: { text: 'Blocked', alarming: true },
    'not-approved': { text: 'Not approved', alarming: true },
  };
  const { text, alarming } = copy[state];

  return (
    <span
      className="shrink-0 rounded-sm border px-1.5 py-0.5 text-caption uppercase tracking-[0.08em]"
      style={{
        color: alarming ? 'var(--settings-destructive-text)' : 'var(--text-3)',
        borderColor: alarming ? 'currentColor' : 'var(--settings-border)',
      }}
    >
      {text}
    </span>
  );
}

const inputClass =
  'min-w-0 flex-1 rounded-md border bg-transparent px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const smallButtonClass =
  'rounded-md border px-2.5 py-1 text-caption transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

function withEntry(list: string[], value: string): string[] {
  const lower = value.trim().toLowerCase();
  return list.some((entry) => entry.toLowerCase() === lower) ? list : [...list, lower];
}

function withoutEntry(list: string[], value: string): string[] {
  const lower = value.toLowerCase();
  return list.filter((entry) => entry.toLowerCase() !== lower);
}

function EntryList({
  label,
  entries,
  empty,
  destructive,
  disabled,
  onRemove,
}: {
  label: string;
  entries: string[];
  empty: string;
  destructive?: boolean;
  disabled: boolean;
  onRemove: (entry: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-caption uppercase tracking-[0.08em]" style={{ color: 'var(--text-3)' }}>
        {label}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          {empty}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {entries.map((entry) => (
            <li
              key={entry}
              className="flex items-center gap-1 rounded-sm border py-0.5 ps-2 pe-0.5 text-xs"
              style={{
                borderColor: destructive ? 'currentColor' : 'var(--settings-border)',
                color: destructive ? 'var(--settings-destructive-text)' : 'var(--text-1)',
              }}
            >
              <span className="break-all">{entry}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${entry} from ${label.toLowerCase()}`}
                onClick={() => onRemove(entry)}
                className="rounded-sm p-1 transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <X aria-hidden className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PluginPolicySection({
  draft,
  canEdit,
  onChange,
}: {
  draft: ConnectorPolicyLists;
  canEdit: boolean;
  onChange: (next: ConnectorPolicyLists) => void;
}) {
  const [value, setValue] = useState('');
  const key = value.trim().toLowerCase();
  const valid = CONNECTOR_POLICY_PLUGIN_KEY_PATTERN.test(key);

  const approve = () => {
    onChange({
      ...draft,
      allowedPlugins: withEntry(draft.allowedPlugins, key),
      blockedPlugins: withoutEntry(draft.blockedPlugins, key),
    });
    setValue('');
  };
  const block = () => {
    onChange({
      ...draft,
      blockedPlugins: withEntry(draft.blockedPlugins, key),
      allowedPlugins: withoutEntry(draft.allowedPlugins, key),
    });
    setValue('');
  };

  return (
    <section style={cardStyle} aria-labelledby="plugins-heading">
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="plugins-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Plugins
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Checked when a member installs a plugin, from the directory, a marketplace or an upload.
          Approving any plugin makes the approved list the only plugins members can install.
        </p>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && canEdit) approve();
          }}
        >
          <label htmlFor="plugin-policy-key" className="sr-only">
            Plugin key
          </label>
          <input
            id="plugin-policy-key"
            value={value}
            disabled={!canEdit}
            onChange={(event) => setValue(event.target.value)}
            placeholder="plugin-key"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          />
          <button
            type="submit"
            disabled={!canEdit || !valid}
            className={smallButtonClass}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          >
            <Check aria-hidden className="me-1 inline h-3 w-3" />
            Approve
          </button>
          <button
            type="button"
            disabled={!canEdit || !valid}
            onClick={block}
            className={smallButtonClass}
            style={{
              borderColor: 'var(--settings-border)',
              color: 'var(--settings-destructive-text)',
            }}
          >
            <Ban aria-hidden className="me-1 inline h-3 w-3" />
            Block
          </button>
        </form>
        <EntryList
          label="Approved plugins"
          entries={draft.allowedPlugins}
          empty="None approved, so every plugin that is not blocked can be installed."
          disabled={!canEdit}
          onRemove={(entry) =>
            onChange({ ...draft, allowedPlugins: withoutEntry(draft.allowedPlugins, entry) })
          }
        />
        <EntryList
          label="Blocked plugins"
          entries={draft.blockedPlugins}
          empty="No plugins are blocked."
          destructive
          disabled={!canEdit}
          onRemove={(entry) =>
            onChange({ ...draft, blockedPlugins: withoutEntry(draft.blockedPlugins, entry) })
          }
        />
      </div>
    </section>
  );
}

function McpHostPolicySection({
  draft,
  canEdit,
  onChange,
}: {
  draft: ConnectorPolicyLists;
  canEdit: boolean;
  onChange: (next: ConnectorPolicyLists) => void;
}) {
  return (
    <section style={cardStyle} aria-labelledby="mcp-hosts-heading">
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="mcp-hosts-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          MCP server hosts
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Limits which hosts a custom or shared MCP connector may reach. Checked when the connector
          is added and every time it connects. Use *.example.com to approve every subdomain. With no
          hosts listed, any public host is allowed.
        </p>
      </div>
      <div className="flex flex-col gap-2 px-5 py-4">
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          {draft.allowedMcpHosts.length === 0
            ? 'No host restriction.'
            : 'Connectors may only reach these hosts.'}{' '}
          Press Enter or type a comma to add a host.
        </p>
        <ChipInput
          id="mcp-host-policy"
          values={draft.allowedMcpHosts}
          onChange={(allowedMcpHosts) => onChange({ ...draft, allowedMcpHosts })}
          label="MCP server host"
          listLabel="Approved hosts"
          removeLabel={(entry) => `Remove ${entry} from approved hosts`}
          placeholder="mcp.example.com"
          disabled={!canEdit}
          normalize={(raw) => raw.trim().toLowerCase()}
          validate={(host) =>
            CONNECTOR_POLICY_MCP_HOST_PATTERN.test(host)
              ? null
              : 'Enter a host name, such as mcp.example.com or *.example.com.'
          }
        />
      </div>
    </section>
  );
}

function WebDomainPolicySection({
  draft,
  canEdit,
  onChange,
}: {
  draft: ConnectorPolicyLists;
  canEdit: boolean;
  onChange: (next: ConnectorPolicyLists) => void;
}) {
  const [value, setValue] = useState('');
  const domain = normalizeWebDomain(value);

  const allow = (site: string) => {
    onChange({
      ...draft,
      allowedWebDomains: withEntry(draft.allowedWebDomains, site),
      blockedWebDomains: withoutEntry(draft.blockedWebDomains, site),
    });
    setValue('');
  };
  const block = (site: string) => {
    onChange({
      ...draft,
      blockedWebDomains: withEntry(draft.blockedWebDomains, site),
      allowedWebDomains: withoutEntry(draft.allowedWebDomains, site),
    });
    setValue('');
  };

  return (
    <section style={cardStyle} aria-labelledby="web-domains-heading">
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2
          id="web-domains-heading"
          className="text-sm font-semibold"
          style={{ color: 'var(--text-1)' }}
        >
          Websites
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Limits the sites web search and page fetching read for everyone in this workspace, in
          chat, Research, scheduled tasks and Slack. A site includes its subdomains. Allowing any
          site makes the allowed list the only sites that are read, and a blocked site is never
          read. Voice sessions do not search the web while a site rule is set.
        </p>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (domain && canEdit) allow(domain);
          }}
        >
          <label htmlFor="web-domain-policy-site" className="sr-only">
            Website
          </label>
          <input
            id="web-domain-policy-site"
            value={value}
            disabled={!canEdit}
            onChange={(event) => setValue(event.target.value)}
            placeholder="example.com"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          />
          <button
            type="submit"
            disabled={!canEdit || !domain}
            className={smallButtonClass}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          >
            <Check aria-hidden className="me-1 inline h-3 w-3" />
            Allow site
          </button>
          <button
            type="button"
            disabled={!canEdit || !domain}
            onClick={() => {
              if (domain) block(domain);
            }}
            className={smallButtonClass}
            style={{
              borderColor: 'var(--settings-border)',
              color: 'var(--settings-destructive-text)',
            }}
          >
            <Ban aria-hidden className="me-1 inline h-3 w-3" />
            Block site
          </button>
        </form>
        <EntryList
          label="Allowed sites"
          entries={draft.allowedWebDomains}
          empty="None allowed, so any site that is not blocked can be read."
          disabled={!canEdit}
          onRemove={(entry) =>
            onChange({ ...draft, allowedWebDomains: withoutEntry(draft.allowedWebDomains, entry) })
          }
        />
        <EntryList
          label="Blocked sites"
          entries={draft.blockedWebDomains}
          empty="No sites are blocked."
          destructive
          disabled={!canEdit}
          onRemove={(entry) =>
            onChange({ ...draft, blockedWebDomains: withoutEntry(draft.blockedWebDomains, entry) })
          }
        />
      </div>
    </section>
  );
}

const TOOL_CATEGORY_LABELS: Readonly<Record<ConnectorToolCategory, string>> = {
  read_only: 'Read-only tools',
  write: 'Write tools',
};

const TOOL_RULE_OPTIONS: ReadonlyArray<{
  value: ConnectorToolPermissionLevel | '';
  label: string;
}> = [
  { value: '', label: 'Member decides' },
  { value: 'allow', label: 'Always allow' },
  { value: 'ask', label: 'Needs approval' },
  { value: 'deny', label: 'Blocked' },
];

function toolRuleLevel(
  rules: readonly WorkspaceConnectorToolRule[],
  connectorId: string,
  toolName: string,
): ConnectorToolPermissionLevel | '' {
  const id = connectorId.toLowerCase();
  return (
    rules.find((rule) => rule.connectorId.toLowerCase() === id && rule.toolName === toolName)
      ?.level ?? ''
  );
}

function withToolRule(
  rules: readonly WorkspaceConnectorToolRule[],
  connectorId: string,
  toolName: string,
  level: ConnectorToolPermissionLevel | '',
): WorkspaceConnectorToolRule[] {
  const id = connectorId.toLowerCase();
  const rest = rules.filter(
    (rule) => !(rule.connectorId.toLowerCase() === id && rule.toolName === toolName),
  );
  return level === '' ? rest : [...rest, { connectorId: id, toolName, level }];
}

function ConnectorToolRules({
  connectorId,
  rules,
  disabled,
  onChange,
}: {
  connectorId: string;
  rules: readonly WorkspaceConnectorToolRule[];
  disabled: boolean;
  onChange: (rules: WorkspaceConnectorToolRule[]) => void;
}) {
  const name = connectorId.replace(/[-_]/g, ' ');
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {(Object.keys(TOOL_CATEGORY_LABELS) as ConnectorToolCategory[]).map((category) => {
        const toolName = connectorCategoryToolName(category);
        return (
          <label
            key={category}
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--text-3)' }}
          >
            {TOOL_CATEGORY_LABELS[category]}
            <select
              value={toolRuleLevel(rules, connectorId, toolName)}
              disabled={disabled}
              aria-label={`${TOOL_CATEGORY_LABELS[category]} for ${name}`}
              onChange={(event) =>
                onChange(
                  withToolRule(
                    rules,
                    connectorId,
                    toolName,
                    event.target.value as ConnectorToolPermissionLevel | '',
                  ),
                )
              }
              className="rounded-md border bg-transparent px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 pointer-coarse:min-h-11"
              style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            >
              {TOOL_RULE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

function toggle(list: string[], value: string): string[] {
  const lower = value.toLowerCase();
  return list.some((entry) => entry.toLowerCase() === lower)
    ? list.filter((entry) => entry.toLowerCase() !== lower)
    : [...list, lower];
}

export function WorkspaceConnectorPolicy() {
  const { data, isPending, isError, error, refetch } = useConnectorPolicy();
  const update = useUpdateConnectorPolicy();
  const [draft, setDraft] = useState<ConnectorPolicyLists | null>(null);

  useEffect(() => {
    if (!data) return;
    setDraft({
      allowedConnectors: [...data.policy.allowedConnectors],
      blockedConnectors: [...data.policy.blockedConnectors],
      allowCustomConnectors: data.policy.allowCustomConnectors,
      allowedPlugins: [...data.policy.allowedPlugins],
      blockedPlugins: [...data.policy.blockedPlugins],
      allowedMcpHosts: [...data.policy.allowedMcpHosts],
      allowedWebDomains: [...data.policy.allowedWebDomains],
      blockedWebDomains: [...data.policy.blockedWebDomains],
      toolRules: [...data.policy.toolRules],
    });
  }, [data]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    const sorted = (list: string[]) => [...list].map((s) => s.toLowerCase()).sort();
    const norm = (l: ConnectorPolicyLists) =>
      JSON.stringify({
        a: sorted(l.allowedConnectors),
        b: sorted(l.blockedConnectors),
        c: l.allowCustomConnectors,
        p: sorted(l.allowedPlugins),
        q: sorted(l.blockedPlugins),
        h: sorted(l.allowedMcpHosts),
        w: sorted(l.allowedWebDomains),
        x: sorted(l.blockedWebDomains),
        t: sorted(
          (l.toolRules ?? []).map((rule) => `${rule.connectorId} ${rule.toolName} ${rule.level}`),
        ),
      });
    return norm(data.policy) !== norm(draft);
  }, [data, draft]);

  const { dialog: discardDialog } = useUnsavedChangesGuard({
    dirty: dirty && !update.isPending,
    description:
      'Your changes to the connector policy have not been saved. If you leave now, they will be lost.',
  });

  if (isPending) {
    return (
      <div
        role="status"
        style={{ ...cardStyle, padding: 'var(--space-5)', color: 'var(--text-3)', fontSize: 13 }}
      >
        Loading connector policy…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 'var(--space-5)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load your connector policy
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load the connector policy.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null || !draft) {
    return (
      <div style={{ ...cardStyle, padding: 'var(--space-5)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          Connector governance is not available for this workspace
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          It needs a Team or Enterprise workspace, and an owner or admin role to change.
        </p>
      </div>
    );
  }

  const canEdit = data.canManagePolicy && !update.isPending;
  const restricted =
    draft.allowedConnectors.length +
      draft.blockedConnectors.length +
      draft.allowedPlugins.length +
      draft.blockedPlugins.length +
      draft.allowedMcpHosts.length +
      draft.allowedWebDomains.length +
      draft.blockedWebDomains.length +
      (draft.toolRules?.length ?? 0) >
      0 || !draft.allowCustomConnectors;

  return (
    <div className="flex flex-col gap-6">
      {discardDialog}
      <section style={cardStyle} aria-labelledby="custom-heading">
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
          <h2
            id="custom-heading"
            className="text-sm font-semibold"
            style={{ color: 'var(--text-1)' }}
          >
            Custom connectors
          </h2>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <p className="max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            A custom connector is an arbitrary MCP endpoint a member supplies, which is a different
            risk from a catalog integration this product ships. Switching this off blocks all of
            them, naming one on the approved list below will not override it.
          </p>
          <input
            type="checkbox"
            role="switch"
            aria-label="Allow custom connectors"
            checked={draft.allowCustomConnectors}
            disabled={!canEdit}
            onChange={(event) =>
              setDraft({ ...draft, allowCustomConnectors: event.target.checked })
            }
            style={{ width: 16, height: 16, marginTop: 'var(--space-1)', flexShrink: 0 }}
          />
        </div>
      </section>

      <McpHostPolicySection draft={draft} canEdit={canEdit} onChange={setDraft} />

      <WebDomainPolicySection draft={draft} canEdit={canEdit} onChange={setDraft} />

      <PluginPolicySection draft={draft} canEdit={canEdit} onChange={setDraft} />

      <section style={cardStyle} aria-labelledby="connectors-heading">
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
          <h2
            id="connectors-heading"
            className="text-sm font-semibold"
            style={{ color: 'var(--text-1)' }}
          >
            Catalog connectors
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            The badge shows what a member will actually get after every rule resolves. Approving
            none leaves them all available, restriction is something you state. For each connector,
            choose whether its read-only and write tools always run, need approval each time or are
            blocked, for everyone in the workspace. A member can make a tool stricter for
            themselves, never looser.
          </p>
        </div>

        {data.catalog.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <PlugZap aria-hidden className="h-5 w-5" style={{ color: 'var(--text-3)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
              No catalog connectors are configured
            </p>
            <p className="max-w-sm text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
              This deployment has no operator-mapped connectors, so there is nothing to approve or
              block here yet. The custom-connector switch above still applies.
            </p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
            {data.catalog.map((connectorId) => {
              const state = effectiveFor(connectorId, draft);
              const explicitlyAllowed = draft.allowedConnectors.some(
                (c) => c.toLowerCase() === connectorId.toLowerCase(),
              );
              const explicitlyBlocked = draft.blockedConnectors.some(
                (c) => c.toLowerCase() === connectorId.toLowerCase(),
              );
              return (
                <li
                  key={connectorId}
                  className="flex flex-col gap-2 px-5 py-3"
                  style={{ borderColor: 'var(--settings-border)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm" style={{ color: 'var(--text-1)' }}>
                      {connectorId.replace(/[-_]/g, ' ')}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <EffectiveChip state={state} />
                      <button
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={explicitlyAllowed}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            allowedConnectors: toggle(draft.allowedConnectors, connectorId),
                            blockedConnectors: draft.blockedConnectors.filter(
                              (c) => c.toLowerCase() !== connectorId.toLowerCase(),
                            ),
                          })
                        }
                        className="rounded-md border px-2.5 py-1 text-caption transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        style={{
                          borderColor: explicitlyAllowed
                            ? 'currentColor'
                            : 'var(--settings-border)',
                          color: explicitlyAllowed ? 'var(--text-1)' : 'var(--text-3)',
                        }}
                      >
                        <Check aria-hidden className="me-1 inline h-3 w-3" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={explicitlyBlocked}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            blockedConnectors: toggle(draft.blockedConnectors, connectorId),
                            allowedConnectors: draft.allowedConnectors.filter(
                              (c) => c.toLowerCase() !== connectorId.toLowerCase(),
                            ),
                          })
                        }
                        className="rounded-md border px-2.5 py-1 text-caption transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        style={{
                          borderColor: explicitlyBlocked
                            ? 'currentColor'
                            : 'var(--settings-border)',
                          color: explicitlyBlocked
                            ? 'var(--settings-destructive-text)'
                            : 'var(--text-3)',
                        }}
                      >
                        <Ban aria-hidden className="me-1 inline h-3 w-3" />
                        Block
                      </button>
                    </div>
                  </div>
                  {state === 'available' ? (
                    <ConnectorToolRules
                      connectorId={connectorId}
                      rules={draft.toolRules ?? []}
                      disabled={!canEdit}
                      onChange={(toolRules) => setDraft({ ...draft, toolRules })}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
          style={{ borderColor: 'var(--settings-border)' }}
        >
          <p className="max-w-xl text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            {restricted
              ? 'Applied where the tool catalog is assembled, the one path chat, scheduled tasks, and cloud agent runs all share, and when a plugin is installed. A blocked connector is never offered to the model, so it cannot be called from any of them.'
              : 'No restriction is in force. Members may use any integration and install any plugin, including custom endpoints.'}
          </p>
          <div className="flex items-center gap-3">
            {update.isError ? (
              <span className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
                {toUserMessage(update.error, 'Could not update connector policy. Try again.')}
              </span>
            ) : null}
            <button
              type="button"
              disabled={!canEdit || !dirty}
              onClick={() => update.mutate(draft)}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {update.isPending ? 'Saving…' : 'Save policy'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
