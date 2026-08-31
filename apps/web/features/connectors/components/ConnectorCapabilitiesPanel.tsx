'use client';

import { useState } from 'react';
import { AlertTriangle, Boxes, FileText, Loader2, MessageSquareText, Wrench } from 'lucide-react';

import { useConnectorCapabilities } from '../hooks/use-connector-capabilities';
import { publishMcpContextSelection } from '../lib/mcp-context-selection';

function CapabilityGroup({
  title,
  items,
  icon,
  onSelect,
}: {
  title: string;
  items: Array<{ name: string; title?: string }>;
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
        {items.map((item) => (
          <button
            type="button"
            key={`${title}:${item.name}`}
            title={item.name}
            disabled={!onSelect}
            onClick={() => onSelect?.(item)}
            className="max-w-full truncate rounded-md bg-muted px-2 py-1 text-[12px] text-muted-foreground enabled:hover:text-foreground"
          >
            {item.title ?? item.name}
          </button>
        ))}
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
  const [promptArguments, setPromptArguments] = useState<Record<string, string>>({});
  if (!connected) return null;
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/80 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Discovering live MCP capabilities…
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
  return (
    <div className="space-y-2" aria-label="Live MCP capabilities">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
        <span className="rounded-full border border-border px-2 py-0.5">
          {catalog.protocolEra === 'modern' ? 'MCP 2026 stateless' : 'Legacy adapter'}
        </span>
        {catalog.tasksSupported ? (
          <span className="rounded-full border border-border px-2 py-0.5">Tasks</span>
        ) : null}
        {catalog.apps.length > 0 ? (
          <span className="rounded-full border border-border px-2 py-0.5">
            {catalog.apps.length} {catalog.apps.length === 1 ? 'App' : 'Apps'}
          </span>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <CapabilityGroup title="Tools" items={modelTools} icon={<Wrench className="h-3 w-3" />} />
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
              <label key={argument.name} className="block text-[12px] text-muted-foreground">
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
        <p className="text-[12px] text-muted-foreground">
          Select a resource or prompt to attach it to your next chat turn.
        </p>
      ) : null}
      {catalog.discoveryErrors.length > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Some capability groups were unavailable during discovery.
        </p>
      ) : null}
    </div>
  );
}
