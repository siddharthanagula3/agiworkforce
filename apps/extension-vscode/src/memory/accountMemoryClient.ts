import {
  MemorySyncPullResponseSchema,
  MemorySyncPushResponseSchema,
  MemorySyncRejectionSchema,
  type MemorySyncPushItem,
  type MemoryWireDelta,
} from '@agiworkforce/cloud-contracts';
import { selectNextCursor } from '@agiworkforce/sync';
import { z } from 'zod';
import { platformRequestHeaders } from '../platform/platformHeaders';

export const MEMORY_SYNC_PATH = '/api/memory/sync';
export const MEMORY_PATH = '/api/memory';
export const WORKSPACES_PATH = '/api/settings/workspaces';
export const MEMORY_SYNC_PROTOCOL_VERSION = 2;
export const MEMORY_SOURCE = 'vscode';
export const INITIAL_CURSOR = '0';

/** A response that does not match the contract is a bad gateway, not a client error. */
const CONTRACT_VIOLATION_STATUS = 502;

const PushResponseSchema = MemorySyncPushResponseSchema.extend({
  rejected: z.array(MemorySyncRejectionSchema).optional().default([]),
});

const WorkspaceListSchema = z.object({
  workspaces: z.array(z.object({ id: z.string(), name: z.string() })),
  activeWorkspaceId: z.string().nullable(),
  activeOrganizationId: z.string().nullable(),
});

export interface MemoryScope {
  organizationId: string | null;
  workspaceName: string | null;
}

export type MemoryPullResponse = z.infer<typeof MemorySyncPullResponseSchema>;
export type MemoryPushResponse = z.infer<typeof PushResponseSchema>;
export type MemoryDelta = MemoryWireDelta;
export type MemoryPushItem = MemorySyncPushItem;

export class AccountMemoryHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AccountMemoryHttpError';
  }
}

export class AccountMemoryUnauthorizedError extends AccountMemoryHttpError {
  constructor() {
    super('Your AGI Cloud session expired or was revoked. Sign in again to continue.', 401);
    this.name = 'AccountMemoryUnauthorizedError';
  }
}

export type MemoryFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface AccountMemoryClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string | undefined>;
  fetchImpl?: MemoryFetch;
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = body['error'];
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
  if (raw !== null && typeof raw === 'object') {
    const message = (raw as Record<string, unknown>)['message'];
    if (typeof message === 'string' && message.trim() !== '') return message.trim();
  }
  const message = body['message'];
  if (typeof message === 'string' && message.trim() !== '') return message.trim();
  return `AGI Cloud rejected the memory request (HTTP ${response.status}).`;
}

export interface AccountMemoryClient {
  pull(since: string): Promise<MemoryPullResponse>;
  pullAll(since: string): Promise<MemoryPullResponse>;
  push(memories: MemoryPushItem[]): Promise<MemoryPushResponse>;
  deleteAll(): Promise<void>;
  readScope(): Promise<MemoryScope>;
}

export function createAccountMemoryClient(config: AccountMemoryClientConfig): AccountMemoryClient {
  const baseUrl = config.baseUrl.replace(/\/+$/u, '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const token = await config.getAuthToken();
    if (token === undefined || token === '') throw new AccountMemoryUnauthorizedError();

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...platformRequestHeaders(),
        },
      });
    } catch (error) {
      throw new AccountMemoryHttpError(
        `Could not reach your AGI Cloud account: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }

    if (response.status === 401) throw new AccountMemoryUnauthorizedError();
    if (!response.ok) {
      throw new AccountMemoryHttpError(await readErrorMessage(response), response.status);
    }
    return response.json().catch(() => undefined);
  }

  async function pull(since: string): Promise<MemoryPullResponse> {
    const body = await request(`${MEMORY_SYNC_PATH}?since=${encodeURIComponent(since)}`, {
      method: 'GET',
    });
    const parsed = MemorySyncPullResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AccountMemoryHttpError(
        'AGI Cloud returned an unreadable memory response.',
        CONTRACT_VIOLATION_STATUS,
      );
    }
    return parsed.data;
  }

  return {
    pull,

    async pullAll(since) {
      let cursor = since;
      const memories: MemoryDelta[] = [];
      for (;;) {
        const page = await pull(cursor);
        memories.push(...page.memories);
        const next = selectNextCursor(cursor, page.cursor);
        const advanced = next !== cursor;
        cursor = next;
        if (!page.hasMore || !advanced) return { memories, cursor, hasMore: false };
      }
    },

    async push(memories) {
      const body = await request(MEMORY_SYNC_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: MEMORY_SYNC_PROTOCOL_VERSION,
          memories,
        }),
      });
      const parsed = PushResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new AccountMemoryHttpError(
          'AGI Cloud returned an unreadable memory response.',
          CONTRACT_VIOLATION_STATUS,
        );
      }
      return parsed.data;
    },

    async deleteAll() {
      await request(MEMORY_PATH, { method: 'DELETE' });
    },

    async readScope() {
      const parsed = WorkspaceListSchema.safeParse(
        await request(WORKSPACES_PATH, { method: 'GET' }),
      );
      if (!parsed.success) {
        throw new AccountMemoryHttpError(
          'AGI Cloud returned an unreadable workspace response.',
          CONTRACT_VIOLATION_STATUS,
        );
      }
      const { workspaces, activeWorkspaceId, activeOrganizationId } = parsed.data;
      return {
        organizationId: activeOrganizationId,
        workspaceName:
          activeOrganizationId === null
            ? null
            : (workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? null),
      };
    },
  };
}
