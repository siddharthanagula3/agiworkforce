import 'server-only';

import { TOOL_CALL_DEADLINE_MS } from '@/lib/deadline-policy';
import { logger } from '@/lib/logger';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import {
  loadUserConnectorToolCatalog,
  makeUserConnectorExecutor,
} from '@/lib/user-connector-tools';
import {
  resolveResearchConnectorPolicy,
  type ResearchConnectorRead,
} from '@/app/api/llm/v1/chat/completions/lib/research-sources';

const SEARCH_TOOL = 'search';
const FETCH_TOOL = 'fetch';
const MAX_QUERIES_PER_CONNECTOR = 3;
const MAX_SOURCES_PER_CONNECTOR = 6;
const MAX_FETCHES_PER_CONNECTOR = 3;
const MAX_SNIPPET_CHARS = 1_200;

const RESULT_ENVELOPE = /<mcp_tool_result\s[^>]*>\n[^\n]*\n([\s\S]*?)\n<\/mcp_tool_result>/g;

function unescapeEnvelopeBody(body: string): string {
  return body.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

function resultRecord(content: string): Record<string, unknown> | null {
  const bodies = [...content.matchAll(RESULT_ENVELOPE)].map((match) =>
    unescapeEnvelopeBody(match[1] ?? ''),
  );
  for (const body of bodies.length > 0 ? bodies : [content]) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

interface ConnectorHit {
  id: string;
  title: string;
  url: string;
  snippet: string;
}

function searchHits(record: Record<string, unknown> | null): ConnectorHit[] {
  const results = record?.['results'];
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const result = entry as Record<string, unknown>;
    const url = text(result['url']);
    if (!isWebUrl(url)) return [];
    return [
      {
        id: text(result['id']),
        title: text(result['title']) || url,
        url,
        snippet: (text(result['text']) || text(result['snippet'])).slice(0, MAX_SNIPPET_CHARS),
      },
    ];
  });
}

export async function readResearchConnectorSources(input: {
  userId: string;
  organizationId: string | null;
  planTier: string | null;
  connectorIds: readonly string[];
  queries: readonly string[];
  isToolDenied: (connectorId: string, toolName: string) => boolean;
  googleUserDataRouted: boolean;
  signal?: AbortSignal;
}): Promise<ResearchConnectorRead[]> {
  const queries = [...new Set(input.queries.map((query) => query.trim()).filter(Boolean))].slice(
    0,
    MAX_QUERIES_PER_CONNECTOR,
  );
  const picked = new Set(input.connectorIds);
  const catalog = await loadUserConnectorToolCatalog(input.userId, {
    customConnectorLimit: getCustomRemoteMcpLimit(input.planTier) ?? undefined,
    planTier: input.planTier,
    organizationId: input.organizationId,
    isToolDenied: input.isToolDenied,
    isConnectorDenied: (connectorId) => !picked.has(connectorId),
    googleUserDataRouted: input.googleUserDataRouted,
  });
  const labels = new Map<string, string>();
  for (const tool of catalog.tools) {
    if (!labels.has(tool.serverId)) labels.set(tool.serverId, tool.serverLabel ?? tool.serverId);
  }
  const policy = resolveResearchConnectorPolicy(input.connectorIds, new Set(labels.keys()));
  const execute = makeUserConnectorExecutor(input.userId, input.organizationId);
  const deadline = AbortSignal.timeout(TOOL_CALL_DEADLINE_MS);
  const options = { signal: input.signal ? AbortSignal.any([input.signal, deadline]) : deadline };

  const readConnector = async (connectorId: string): Promise<ResearchConnectorRead> => {
    const label = labels.get(connectorId) ?? connectorId;
    const offered = new Set(
      catalog.tools.filter((tool) => tool.serverId === connectorId).map((tool) => tool.toolName),
    );
    if (!offered.has(SEARCH_TOOL) || queries.length === 0) {
      return { connectorId, label, outcome: 'unsearchable', sources: [] };
    }
    const hits = new Map<string, ConnectorHit>();
    let answered = 0;
    try {
      for (const query of queries) {
        const result = await execute(connectorId, SEARCH_TOOL, { query }, options);
        if (!result.handled || result.isError) continue;
        answered += 1;
        for (const hit of searchHits(resultRecord(result.content))) {
          if (hits.size >= MAX_SOURCES_PER_CONNECTOR) break;
          if (!hits.has(hit.url)) hits.set(hit.url, hit);
        }
      }
      if (offered.has(FETCH_TOOL)) {
        const fetchable = [...hits.values()]
          .filter((hit) => hit.id)
          .slice(0, MAX_FETCHES_PER_CONNECTOR);
        for (const hit of fetchable) {
          const fetched = await execute(connectorId, FETCH_TOOL, { id: hit.id }, options);
          if (!fetched.handled || fetched.isError) continue;
          const document = resultRecord(fetched.content);
          hit.snippet = text(document?.['text']).slice(0, MAX_SNIPPET_CHARS) || hit.snippet;
          hit.title = text(document?.['title']) || hit.title;
        }
      }
    } catch (error) {
      logger.warn(
        { error, userId: input.userId, connectorId },
        '[research] a connected app stopped answering; the run keeps what it returned',
      );
    }
    if (answered === 0) return { connectorId, label, outcome: 'failed', sources: [] };
    return {
      connectorId,
      label,
      outcome: 'read',
      sources: [...hits.values()].map(({ url, title, snippet }) => ({ url, title, snippet })),
    };
  };

  const reads = await Promise.all(policy.allowed.map(readConnector));
  return [
    ...reads,
    ...policy.refused.map((connectorId) => ({
      connectorId,
      label: connectorId,
      outcome: 'unavailable' as const,
      sources: [],
    })),
  ];
}
