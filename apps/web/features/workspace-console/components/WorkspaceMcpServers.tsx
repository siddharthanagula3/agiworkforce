'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Server } from 'lucide-react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { getAuthToken } from '@shared/lib/get-auth-token';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export interface WorkspaceMcpServer {
  id: string;
  shortId: string;
  connectorId: string;
  name: string;
  description: string | null;
  url: string;
  transport: string;
  published: boolean;
  publishedAt: string | null;
  retiredAt: string | null;
}

export interface WorkspaceMcpServersResult {
  organizationId: string;
  canManage: boolean;
  servers: WorkspaceMcpServer[];
  revision: number;
}

export const WORKSPACE_MCP_SERVERS_QUERY_KEY = ['workspace', 'mcp-servers'] as const;

const ENDPOINT = '/api/settings/organization/mcp';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

const controlStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: '5px 8px',
} as const;

const secondaryButtonClass =
  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

const primaryButtonClass =
  'rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

async function readApiError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    const raw = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    if (!raw.trim()) return fallback;
    return toUserMessage(Object.assign(new Error(raw), { status: res.status }), fallback);
  } catch {
    return fallback;
  }
}

async function send<T>(method: string, body: unknown): Promise<T> {
  const token = await getAuthToken();
  if (!token) throw new Error('User not authenticated');
  const res = await fetch(ENDPOINT, {
    method,
    headers: await addCsrfHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as T;
}

export function useWorkspaceMcpServers(): UseQueryResult<WorkspaceMcpServersResult | null, Error> {
  return useQuery<WorkspaceMcpServersResult | null, Error>({
    queryKey: WORKSPACE_MCP_SERVERS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAuthToken();
      if (!token) throw new Error('User not authenticated');
      const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error(await readApiError(res));
      return (await res.json()) as WorkspaceMcpServersResult;
    },
    staleTime: 30 * 1000,
    meta: { errorMessage: 'Failed to load this workspace’s MCP servers' },
  });
}

function useServerMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_MCP_SERVERS_QUERY_KEY });
    },
  });
}

interface PublishInput {
  name: string;
  url: string;
  description?: string;
}

export function usePublishWorkspaceMcpServer() {
  return useServerMutation((input: PublishInput) =>
    send<{ server: WorkspaceMcpServer }>('POST', input),
  );
}

export function useChangeWorkspaceMcpServer() {
  return useServerMutation((input: { serverId: string; published?: boolean; retired?: boolean }) =>
    send<WorkspaceMcpServersResult>('PATCH', input),
  );
}

function stateLabel(server: WorkspaceMcpServer): string {
  if (server.retiredAt) return 'Retired';
  return server.published ? 'Published to everyone' : 'Draft, not yet published';
}

/**
 * Publishing is the whole point of this panel: a member does not accept, install
 * or configure anything, so the list has to say plainly which servers every
 * member already has.
 */
export function WorkspaceMcpServers() {
  const { data, isPending, isError, error, refetch } = useWorkspaceMcpServers();
  const publish = usePublishWorkspaceMcpServer();
  const change = useChangeWorkspaceMcpServer();
  const { confirm, dialog } = useConfirmAction();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');

  if (isPending) {
    return (
      <div
        className="flex items-center gap-2"
        style={{ ...cardStyle, padding: 20, color: 'var(--text-3)', fontSize: 13 }}
      >
        <Spinner size="sm" />
        Loading workspace MCP servers…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load this workspace’s MCP servers
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load the published MCP servers.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className={`mt-3 ${secondaryButtonClass}`}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null) return null;

  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  const canPublish =
    data.canManage &&
    trimmedName.length > 0 &&
    trimmedUrl.startsWith('https://') &&
    !publish.isPending;

  const submit = () => {
    publish.mutate(
      {
        name: trimmedName,
        url: trimmedUrl,
        ...(description.trim() ? { description: description.trim() } : {}),
      },
      {
        onSuccess: () => {
          setName('');
          setUrl('');
          setDescription('');
        },
      },
    );
  };

  const askToRetire = (server: WorkspaceMcpServer) => {
    confirm({
      title: `Retire ${server.name}?`,
      description:
        'Every member loses this server and its tools at once, and any prompt or saved permission that named it stops working. Retiring cannot be undone: publish the server again to restore it, which gives it a new id.',
      confirmLabel: 'Retire for everyone',
      cancelLabel: 'Keep it published',
      destructive: true,
      onConfirm: () =>
        new Promise<void>((resolve) => {
          change.mutate({ serverId: server.id, retired: true }, { onSettled: () => resolve() });
        }),
    });
  };

  return (
    <div style={cardStyle}>
      {dialog}
      <div className="flex items-start gap-3 px-5 py-4">
        <Server size={16} aria-hidden style={{ color: 'var(--text-3)', marginTop: 2 }} />
        <div>
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
            Workspace MCP servers
          </h3>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            A published server appears in every member’s connector list without them adding it.
            Members never see or hold its credentials.
          </p>
        </div>
      </div>

      <ul className="flex flex-col" aria-label="Published MCP servers">
        {data.servers.length === 0 ? (
          <li
            className="border-t px-5 py-4 text-xs"
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-3)' }}
          >
            This workspace has not published an MCP server yet.
          </li>
        ) : (
          data.servers.map((server) => (
            <li
              key={server.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
              style={{ borderColor: 'var(--settings-border)' }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                  {server.name}
                </p>
                <p className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
                  {server.url}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
                  {stateLabel(server)}
                </p>
              </div>
              {data.canManage && !server.retiredAt ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                    disabled={change.isPending}
                    onClick={() =>
                      change.mutate({ serverId: server.id, published: !server.published })
                    }
                  >
                    {server.published ? 'Unpublish' : 'Publish to everyone'}
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                    disabled={change.isPending}
                    onClick={() => askToRetire(server)}
                  >
                    Retire
                  </button>
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {data.canManage ? (
        <div
          className="flex flex-col gap-2 border-t px-5 py-4"
          style={{ borderColor: 'var(--settings-border)' }}
        >
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--text-1)' }}
            htmlFor="workspace-mcp-name"
          >
            Add a server
          </label>
          <input
            id="workspace-mcp-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name members will see"
            style={controlStyle}
          />
          <input
            id="workspace-mcp-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://mcp.example.com"
            aria-label="Server URL"
            style={controlStyle}
          />
          <input
            id="workspace-mcp-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What it is for (optional)"
            aria-label="Description"
            style={controlStyle}
          />
          {publish.isError ? (
            <p
              className="text-xs"
              style={{ color: 'var(--settings-destructive-text)' }}
              role="alert"
            >
              {toUserMessage(publish.error, 'That server could not be published.')}
            </p>
          ) : null}
          <div>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={!canPublish}
              onClick={submit}
            >
              {publish.isPending ? 'Checking the server…' : 'Publish'}
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            The server is contacted once before it is published, so a workspace never hands its
            members an endpoint that only ever errors.
          </p>
        </div>
      ) : null}
    </div>
  );
}
