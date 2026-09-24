'use client';

import { FileText, Layers } from 'lucide-react';
import { Spinner } from '@agiworkforce/ui';

import {
  useConnectorCapabilities,
  type ConnectorCapabilityCatalog,
} from '@/features/connectors/hooks/use-connector-capabilities';

/**
 * What a connected MCP server offers to READ, as opposed to what it offers to
 * call. A resource is the server's own content and its title and description
 * are the server's text, so nothing here is rendered as markup or as an
 * instruction: it is labelled, quoted data.
 */

type Catalog = ConnectorCapabilityCatalog;
type Resource = Catalog['resources'][number];
type ResourceTemplate = Catalog['resourceTemplates'][number];

export interface McpResourceListProps {
  connectorId: string | null;
  enabled?: boolean;
  onOpenResource?: (uri: string) => void;
}

const rowStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
} as const;

function labelOf(item: { title?: string; name: string }): string {
  const title = item.title?.trim();
  return title && title.length > 0 ? title : item.name;
}

function detailOf(resource: Resource): string {
  const parts = [resource.uri];
  if (resource.mimeType) parts.push(resource.mimeType);
  if (typeof resource.size === 'number') parts.push(`${resource.size} bytes`);
  return parts.join(' · ');
}

function ResourceRow({
  resource,
  onOpenResource,
}: {
  resource: Resource;
  onOpenResource?: (uri: string) => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-1)' }}>
        <FileText size={14} aria-hidden style={{ color: 'var(--text-3)' }} />
        <span className="truncate">{labelOf(resource)}</span>
        {resource.isApp ? (
          <span
            className="shrink-0 rounded-compact px-1.5 py-0.5 text-xs"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-3)' }}
          >
            App
          </span>
        ) : null}
      </span>
      <span className="block truncate text-xs" style={{ color: 'var(--text-3)' }}>
        {detailOf(resource)}
      </span>
      {resource.description ? (
        <span className="block text-xs" style={{ color: 'var(--text-3)' }}>
          {resource.description}
        </span>
      ) : null}
    </>
  );

  if (!onOpenResource) {
    return (
      <li className="flex flex-col gap-0.5 px-3 py-2" style={rowStyle}>
        {body}
      </li>
    );
  }

  return (
    <li style={rowStyle}>
      <button
        type="button"
        className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ minHeight: 44 }}
        onClick={() => onOpenResource(resource.uri)}
      >
        {body}
      </button>
    </li>
  );
}

function TemplateRow({ template }: { template: ResourceTemplate }) {
  return (
    <li className="flex flex-col gap-0.5 px-3 py-2" style={rowStyle}>
      <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-1)' }}>
        <Layers size={14} aria-hidden style={{ color: 'var(--text-3)' }} />
        <span className="truncate">{labelOf(template)}</span>
      </span>
      <span className="block truncate text-xs" style={{ color: 'var(--text-3)' }}>
        {template.uriTemplate}
      </span>
    </li>
  );
}

export function McpResourceList({
  connectorId,
  enabled = true,
  onOpenResource,
}: McpResourceListProps) {
  const { catalog, loading, error, retry } = useConnectorCapabilities(connectorId, enabled);

  if (!connectorId || !enabled) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
        <Spinner size="sm" />
        Asking {connectorId} what it offers…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-start gap-2 px-3 py-2">
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          {error}
        </p>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ minHeight: 32, borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          onClick={retry}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!catalog) return null;

  // Discovery is per capability: a server that timed out listing resources still
  // returns its tools, so an empty list without this reads as "it has none".
  const resourceFailure = catalog.discoveryErrors.find(
    (failure) => failure.capability === 'resources' || failure.capability === 'resourceTemplates',
  );

  if (resourceFailure) {
    return (
      <div className="flex flex-col items-start gap-2 px-3 py-2">
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          {catalog.connectorLabel} did not finish listing what it offers to read, so this list is
          incomplete. Its tools are unaffected.
        </p>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ minHeight: 32, borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          onClick={retry}
        >
          Try again
        </button>
      </div>
    );
  }

  if (catalog.resources.length === 0 && catalog.resourceTemplates.length === 0) {
    return (
      <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
        {catalog.connectorLabel} offers tools but nothing to read.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {catalog.resources.length > 0 ? (
        <section>
          <h4 className="px-3 pb-1.5 text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            From {catalog.connectorLabel}
          </h4>
          <ul
            className="flex flex-col gap-1.5 px-3"
            aria-label={`${catalog.connectorLabel} resources`}
          >
            {catalog.resources.map((resource) => (
              <ResourceRow
                key={resource.uri}
                resource={resource}
                {...(onOpenResource ? { onOpenResource } : {})}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {catalog.resourceTemplates.length > 0 ? (
        <section>
          <h4 className="px-3 pb-1.5 text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            Ask for by name
          </h4>
          <ul
            className="flex flex-col gap-1.5 px-3"
            aria-label={`${catalog.connectorLabel} resource templates`}
          >
            {catalog.resourceTemplates.map((template) => (
              <TemplateRow key={template.uriTemplate} template={template} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
