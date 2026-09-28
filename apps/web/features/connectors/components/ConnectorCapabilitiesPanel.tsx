'use client';

import { useState } from 'react';
import { AlertTriangle, Boxes, FileText, MessageSquareText, Wrench } from 'lucide-react';

import type { ConnectorCapabilityCatalog } from '@agiworkforce/cloud-contracts';
import { Spinner, translateUiPlural } from '@agiworkforce/ui';

import { useConnectorCapabilities } from '../hooks/use-connector-capabilities';
import { publishMcpContextSelection } from '../lib/mcp-context-selection';

const CAPABILITY_DISCOVERY_COPY = 'Discovering live MCP capabilities…';

const NO_TOOL_DESCRIPTION_COPY = 'The server gives no description for this tool.';
const NO_TOOL_PARAMETERS_COPY = 'This tool takes no parameters.';

function itemHint(item: { name: string; title?: string; description?: string }): string {
  return item.description ?? item.title ?? item.name;
}
const NO_CAPABILITIES_COPY =
  'This connector answered but offers no tools, resources or prompts yet. Nothing from it can be used in a conversation until it publishes some.';
const PARTIAL_DISCOVERY_PREFIX = 'Unavailable during discovery:';
const LEGACY_HANDSHAKE_COPY =
  'This server does not answer the stateless discovery request, so it is connected with the older initialize handshake. Everything it offers still works.';
const SSE_TRANSPORT_COPY =
  'This server uses the deprecated HTTP+SSE transport. It keeps working, but the server should move to Streamable HTTP.';
const TRANSPORT_LABELS: Record<NonNullable<ConnectorCapabilityCatalog['transport']>, string> = {
  stdio: 'Local process',
  sse: 'HTTP+SSE',
  'streamable-http': 'Streamable HTTP',
};
const REJECTION_COPY: Record<
  ConnectorCapabilityCatalog['rejectedTools'][number]['reason'],
  string
> = {
  'non-canonical-name': 'its name is not one a model can call',
  'invalid-input-schema': 'its input schema was refused',
};

function protocolLabel(catalog: ConnectorCapabilityCatalog): string {
  if (catalog.protocolVersion) return `MCP ${catalog.protocolVersion}`;
  return catalog.protocolEra === 'modern' ? 'MCP stateless' : 'MCP initialize handshake';
}

function CompatibilityDetails({ catalog }: { catalog: ConnectorCapabilityCatalog }) {
  const notices = [
    ...(catalog.protocolEra === 'legacy' ? [LEGACY_HANDSHAKE_COPY] : []),
    ...(catalog.transport === 'sse' ? [SSE_TRANSPORT_COPY] : []),
    ...catalog.rejectedTools.map(
      (tool) =>
        `${tool.toolName ? `Tool ${tool.toolName}` : 'A tool'} is not offered: ${
          REJECTION_COPY[tool.reason]
        }${tool.detail ? ` (${tool.detail})` : ''}.`,
    ),
  ];
  return (
    <section className="rounded-lg border border-border/80 p-3" aria-label="Compatibility">
      <h4 className="text-xs font-semibold text-foreground">Compatibility</h4>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
        <dt className="text-muted-foreground">Protocol</dt>
        <dd className="text-foreground">{protocolLabel(catalog)}</dd>
        {catalog.supportedVersions.length > 0 ? (
          <>
            <dt className="text-muted-foreground">Server supports</dt>
            <dd className="text-foreground">{catalog.supportedVersions.join(', ')}</dd>
          </>
        ) : null}
        {catalog.transport ? (
          <>
            <dt className="text-muted-foreground">Transport</dt>
            <dd className="text-foreground">{TRANSPORT_LABELS[catalog.transport]}</dd>
          </>
        ) : null}
        {catalog.serverInfo ? (
          <>
            <dt className="text-muted-foreground">Server</dt>
            <dd className="break-all text-foreground">
              {catalog.serverInfo.name} {catalog.serverInfo.version}
            </dd>
          </>
        ) : null}
      </dl>
      {notices.length > 0 ? (
        <ul className="mt-2 space-y-1 text-caption text-muted-foreground">
          {notices.map((notice, index) => (
            <li key={`${index}:${notice}`} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{notice}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CapabilityGroup({
  title,
  items,
  icon,
  onSelect,
}: {
  title: string;
  items: Array<{ name: string; title?: string; description?: string }>;
  icon: React.ReactNode;
  onSelect?: (item: { name: string; title?: string }) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg border border-border/80 p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        {icon}
        {title} <span className="font-normal text-muted-foreground">({items.length})</span>
      </h4>
      <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {items.map((item) =>
          onSelect ? (
            <button
              type="button"
              key={`${title}:${item.name}`}
              title={itemHint(item)}
              onClick={() => onSelect(item)}
              className="max-w-full truncate rounded-md bg-muted px-2 py-1 text-caption text-muted-foreground hover:text-foreground"
            >
              {item.name}
            </button>
          ) : (
            <span
              key={`${title}:${item.name}`}
              title={itemHint(item)}
              className="max-w-full truncate rounded-md bg-muted px-2 py-1 text-caption text-muted-foreground"
            >
              {item.name}
            </span>
          ),
        )}
      </div>
    </section>
  );
}

export function ConnectorCapabilitiesPanel({
  connectorRef,
  connected,
}: {
  connectorRef: string;
  connected: boolean;
}) {
  const { catalog, loading, error, retry } = useConnectorCapabilities(connectorRef, connected);
  const [pendingPromptName, setPendingPromptName] = useState<string | null>(null);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [promptArguments, setPromptArguments] = useState<Record<string, string>>({});
  if (!connected) return null;
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/80 px-3 py-3 text-xs text-muted-foreground">
        <Spinner size="sm" className="h-3.5 w-3.5" aria-label={CAPABILITY_DISCOVERY_COPY} />
        {CAPABILITY_DISCOVERY_COPY}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-border/80 px-3 py-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Live capabilities could not be loaded.
        </p>
        <button
          type="button"
          className="mt-2 font-medium text-foreground underline"
          onClick={retry}
        >
          Retry discovery
        </button>
      </div>
    );
  }
  if (!catalog) return null;

  const modelTools = catalog.tools.filter((tool) => tool.visibility !== 'app');
  const selectedTool = modelTools.find((tool) => tool.name === selectedToolName) ?? null;
  const nothingPublished =
    modelTools.length === 0 &&
    catalog.resources.length === 0 &&
    catalog.resourceTemplates.length === 0 &&
    catalog.prompts.length === 0 &&
    catalog.apps.length === 0;
  return (
    <div className="space-y-2" aria-label="Live MCP capabilities">
      <div className="flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
        <span className="rounded-full border border-border px-2 py-0.5">
          {protocolLabel(catalog)}
        </span>
        {catalog.tasksSupported ? (
          <span className="rounded-full border border-border px-2 py-0.5">Tasks</span>
        ) : null}
        {catalog.apps.length > 0 ? (
          <span className="rounded-full border border-border px-2 py-0.5">
            {translateUiPlural('settings', 'counts.connectorApps', catalog.apps.length, {
              one: '{{count}} App',
              other: '{{count}} Apps',
            })}
          </span>
        ) : null}
      </div>
      {nothingPublished ? (
        <p className="rounded-lg border border-border/80 px-3 py-3 text-xs text-muted-foreground">
          {NO_CAPABILITIES_COPY}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <CapabilityGroup
          title="Tools"
          items={modelTools}
          icon={<Wrench className="h-3 w-3" />}
          onSelect={(item) =>
            setSelectedToolName((current) => (current === item.name ? null : item.name))
          }
        />
        <CapabilityGroup
          title="Resources"
          items={catalog.resources}
          icon={<FileText className="h-3 w-3" />}
          onSelect={(item) => {
            const resource = catalog.resources.find((candidate) => candidate.name === item.name);
            if (resource) {
              publishMcpContextSelection({
                resources: [
                  {
                    connectorId: catalog.connectorId,
                    uri: resource.uri,
                    name: resource.title ?? resource.name,
                  },
                ],
              });
            }
          }}
        />
        <CapabilityGroup
          title="Templates"
          items={catalog.resourceTemplates}
          icon={<Boxes className="h-3 w-3" />}
        />
        <CapabilityGroup
          title="Prompts"
          items={catalog.prompts}
          icon={<MessageSquareText className="h-3 w-3" />}
          onSelect={(item) =>
            (() => {
              const prompt = catalog.prompts.find((candidate) => candidate.name === item.name);
              if (!prompt) return;
              if (prompt.arguments.length === 0) {
                publishMcpContextSelection({
                  prompt: { connectorId: catalog.connectorId, name: item.name },
                });
                return;
              }
              setPromptArguments({});
              setPendingPromptName(prompt.name);
            })()
          }
        />
      </div>
      {selectedTool ? (
        <section
          className="space-y-2 rounded-lg border border-border/80 p-3"
          aria-label={`Tool ${selectedTool.name}`}
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="break-all font-mono text-xs font-semibold text-foreground">
              {selectedTool.name}
            </h4>
            <button
              type="button"
              onClick={() => setSelectedToolName(null)}
              className="shrink-0 text-caption font-medium text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedTool.description ?? selectedTool.title ?? NO_TOOL_DESCRIPTION_COPY}
          </p>
          {selectedTool.parameters.length > 0 ? (
            <ul className="space-y-1">
              {selectedTool.parameters.map((parameter) => (
                <li key={parameter.name} className="text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">{parameter.name}</span>
                  {parameter.type ? ` (${parameter.type})` : ''}
                  {parameter.required ? ', required' : ', optional'}
                  {parameter.description ? `: ${parameter.description}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{NO_TOOL_PARAMETERS_COPY}</p>
          )}
        </section>
      ) : null}
      {pendingPromptName ? (
        <form
          className="space-y-2 rounded-lg border border-border/80 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            publishMcpContextSelection({
              prompt: {
                connectorId: catalog.connectorId,
                name: pendingPromptName,
                arguments: promptArguments,
              },
            });
            setPendingPromptName(null);
          }}
        >
          <p className="text-xs font-semibold text-foreground">Prompt arguments</p>
          {catalog.prompts
            .find((prompt) => prompt.name === pendingPromptName)
            ?.arguments.map((argument) => (
              <label key={argument.name} className="block text-caption text-muted-foreground">
                {argument.name}
                <input
                  required={argument.required === true}
                  value={promptArguments[argument.name] ?? ''}
                  onChange={(event) =>
                    setPromptArguments((current) => ({
                      ...current,
                      [argument.name]: event.target.value,
                    }))
                  }
                  className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                />
              </label>
            ))}
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground"
            >
              Use prompt
            </button>
            <button
              type="button"
              className="px-2.5 py-1.5 text-xs text-muted-foreground"
              onClick={() => setPendingPromptName(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {catalog.resources.length > 0 || catalog.prompts.length > 0 ? (
        <p className="text-caption text-muted-foreground">
          Select a resource or prompt to attach it to your next chat turn.
        </p>
      ) : null}
      <CompatibilityDetails catalog={catalog} />
      {catalog.discoveryErrors.length > 0 ? (
        <p className="text-caption text-muted-foreground">
          {PARTIAL_DISCOVERY_PREFIX}{' '}
          {[...new Set(catalog.discoveryErrors.map((entry) => entry.capability))].join(', ')}.
          <button
            type="button"
            onClick={retry}
            className="ms-1 inline-flex min-h-6 items-center font-medium underline"
          >
            Retry discovery
          </button>
        </p>
      ) : null}
    </div>
  );
}
