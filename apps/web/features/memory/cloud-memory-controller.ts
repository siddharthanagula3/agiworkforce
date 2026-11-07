'use client';

import {
  MANAGED_MEMORY_MAX_PAGE_SIZE,
  parseManagedMemoryItemResponse,
  parseManagedMemoryStrictPageResponse,
  parseManagedMemoryWriteResponse,
  type ManagedMemoryRecord,
  type ManagedMemoryWriteResponse,
} from '@agiworkforce/types';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  ManagedCloudAccountWorkspacesSchema,
  type ManagedCloudAccountWorkspaces,
} from '@agiworkforce/cloud-contracts';
import type { MemoryEditorDataAdapter, MemoryFact } from '@agiworkforce/unified-chat';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { apiErrorMessage } from '@/lib/client/api-error-message';
import {
  subscribeWorkspaceAdmission,
  workspaceOwnerIsCurrent,
  type WorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';

const MEMORY_PATH = '/api/memory';
const MAX_OFFSET = 10_000;
const MAX_PENDING = 32;
const READ_FAILED = 'Could not load your cloud memories.';
const WRITE_UNCERTAIN =
  'The memory change could not be confirmed. Check your saved memories and reload before making another change.';
const uncertainWrites = new Set<string>();
const pendingWrites = new Set<string>();
type Current = () => boolean;
type Parser<T> = (value: unknown) => T | null;

export interface CloudMemorySnapshot {
  facts: MemoryFact[];
  syncStatus: MemoryEditorDataAdapter['syncStatus'];
  revision: number;
  writeBlocked: boolean;
}

export const UNAVAILABLE_MEMORY: CloudMemorySnapshot = {
  facts: [],
  syncStatus: 'unavailable',
  revision: 0,
  writeBlocked: false,
};

export function cloudMemoryScopeKey(data: ManagedCloudAccountWorkspaces): string {
  return JSON.stringify([data.scope, data.activeWorkspaceId, data.activeOrganizationId]);
}

function factFromServer(row: ManagedMemoryRecord): MemoryFact {
  return {
    id: row.id,
    serverId: row.id,
    text: row.content,
    source: row.source ?? undefined,
    category: row.category,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
    sourceConversationId: row.sourceConversationId ?? undefined,
    sourceConversationTitle: row.sourceConversationTitle ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pinned: row.pinned === true,
  };
}

class RejectedMemoryRequest extends Error {}
class UncertainMemoryWrite extends Error {}

function applyWrittenMemory(result: ManagedMemoryWriteResponse, facts: MemoryFact[]): MemoryFact[] {
  const superseded = new Set(result.supersededIds);
  const retained = facts.filter((fact) => !superseded.has(fact.id));
  if (result.supersededBy) return retained;
  return [
    factFromServer(result.memory),
    ...retained.filter((fact) => fact.id !== result.memory.id),
  ];
}

export function createCloudMemoryController(
  owner: WorkspaceOwner,
  input: ManagedCloudAccountWorkspaces,
) {
  const data = ManagedCloudAccountWorkspacesSchema.parse(input);
  const epoch = owner.epoch;
  const scopeKey = cloudMemoryScopeKey(data);
  const key = `${owner.incarnation}:${epoch}:${scopeKey}`;
  const organization = data.activeOrganizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE;
  const writeScope = JSON.stringify([owner.session.userId, organization]);
  let retired = false;
  let snapshot: CloudMemorySnapshot = {
    ...UNAVAILABLE_MEMORY,
    syncStatus: 'idle',
    writeBlocked: uncertainWrites.has(writeScope) || pendingWrites.has(writeScope),
  };
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  let hydration: Promise<void> | null = null;
  let activeMutation = false;
  const listeners = new Set<() => void>();
  const requests = new Set<RequestAuthority>();
  let unsubscribe = () => {};
  const publish = (next: CloudMemorySnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const retire = () => {
    if (retired) return;
    if (activeMutation) uncertainWrites.add(writeScope);
    retired = true;
    unsubscribe();
    for (const request of requests) request.retire();
    requests.clear();
    snapshot = UNAVAILABLE_MEMORY;
    queueMicrotask(() => {
      for (const listener of listeners) listener();
    });
  };
  const isCurrent = () =>
    !retired &&
    owner.phase === 'admitted' &&
    owner.scopeKey === scopeKey &&
    workspaceOwnerIsCurrent(owner, epoch);
  const assertCurrent = () => {
    if (!isCurrent()) {
      retire();
      throw new DOMException('Memory owner changed', 'AbortError');
    }
  };
  assertCurrent();
  unsubscribe = subscribeWorkspaceAdmission(() => {
    if (!isCurrent()) retire();
  });

  function enqueue<T>(
    current: Current,
    operation: (
      authority: RequestAuthority,
      dispatch: {
        didDispatch: () => boolean;
        acknowledge: () => void;
      },
    ) => Promise<T>,
    mutation = false,
  ): Promise<T> {
    try {
      assertCurrent();
      if (!current()) throw new DOMException('Memory view changed', 'AbortError');
      if (pending >= MAX_PENDING)
        throw new Error('Memory is busy. Wait for the current changes to finish.');
    } catch (error) {
      return Promise.reject(error);
    }
    pending += 1;
    const result = tail.then(async () => {
      assertCurrent();
      let dispatched = false;
      const acknowledge = () => {
        if (mutation && dispatched) {
          activeMutation = false;
          pendingWrites.delete(writeScope);
        }
      };
      const authority = createRequestAuthority(
        owner.session,
        () => isCurrent() && current(),
        () => {
          const firstDispatch = !dispatched;
          dispatched = true;
          if (mutation && firstDispatch) {
            activeMutation = true;
            pendingWrites.add(writeScope);
          }
        },
      );
      requests.add(authority);
      try {
        authority.assertCurrent();
        return await operation(authority, { didDispatch: () => dispatched, acknowledge });
      } finally {
        acknowledge();
        requests.delete(authority);
        authority.retire();
      }
    });
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      pending -= 1;
    });
  }

  async function json<T>(
    authority: RequestAuthority,
    path: string,
    init: RequestInit,
    parse: Parser<T>,
  ): Promise<T> {
    authority.assertCurrent();
    if (
      path !== MEMORY_PATH &&
      !path.startsWith(`${MEMORY_PATH}/`) &&
      !path.startsWith(`${MEMORY_PATH}?`)
    ) {
      throw new Error('Invalid memory destination');
    }
    const headers = new Headers(init.headers);
    headers.set(MANAGED_CLOUD_ORGANIZATION_HEADER, organization);
    const response = await authority.fetch(path, { ...init, headers, cache: 'no-store' });
    const body: unknown = await response.json().catch(() => null);
    authority.assertCurrent();
    if (!response.ok) {
      const message = apiErrorMessage(body, READ_FAILED);
      if (response.status >= 400 && response.status < 500) throw new RejectedMemoryRequest(message);
      throw new Error(message);
    }
    const parsed = parse(body);
    if (parsed === null) throw new Error(READ_FAILED);
    return parsed;
  }

  async function load(authority: RequestAuthority): Promise<void> {
    authority.assertCurrent();
    publish({ ...snapshot, syncStatus: 'syncing' });
    try {
      const rows: ManagedMemoryRecord[] = [];
      for (let offset = 0; offset <= MAX_OFFSET; offset += MANAGED_MEMORY_MAX_PAGE_SIZE) {
        const page = await json(
          authority,
          `${MEMORY_PATH}?limit=${MANAGED_MEMORY_MAX_PAGE_SIZE}&offset=${offset}`,
          { method: 'GET', cache: 'no-store' },
          parseManagedMemoryStrictPageResponse,
        );
        rows.push(...page.memories);
        if (!page.hasMore) {
          authority.assertCurrent();
          const facts = rows.map(factFromServer);
          const changed = JSON.stringify(facts) !== JSON.stringify(snapshot.facts);
          publish({
            ...snapshot,
            facts,
            syncStatus: 'synced',
            revision: snapshot.revision + Number(changed),
          });
          return;
        }
        if (page.memories.length === 0) break;
      }
      throw new Error('The complete memory list could not be loaded.');
    } catch (error) {
      if (authority.isCurrent()) publish({ ...snapshot, syncStatus: 'error' });
      throw error;
    }
  }

  function request<T>(
    path: string,
    init: RequestInit,
    parse: Parser<T>,
    options: {
      current: Current;
      mutation?: boolean;
      changesFacts?: boolean | ((result: T) => boolean);
      acknowledgedFacts?: (result: T, facts: MemoryFact[]) => MemoryFact[];
    },
  ): Promise<T> {
    return enqueue(
      options.current,
      async (authority, dispatch) => {
        if (options.mutation && (uncertainWrites.has(writeScope) || pendingWrites.has(writeScope)))
          throw new UncertainMemoryWrite(WRITE_UNCERTAIN);
        let result: T;
        try {
          result = await json(authority, path, init, parse);
          dispatch.acknowledge();
        } catch (error) {
          if (error instanceof RejectedMemoryRequest) dispatch.acknowledge();
          if (
            options.mutation &&
            dispatch.didDispatch() &&
            !(error instanceof RejectedMemoryRequest)
          ) {
            uncertainWrites.add(writeScope);
            if (!authority.isCurrent()) throw error;
            publish({ ...snapshot, writeBlocked: true, revision: snapshot.revision + 1 });
            await load(authority).catch(() => undefined);
            authority.assertCurrent();
            throw new UncertainMemoryWrite(WRITE_UNCERTAIN);
          }
          throw error;
        }
        const changed =
          typeof options.changesFacts === 'function'
            ? options.changesFacts(result)
            : options.changesFacts;
        if (changed) {
          authority.assertCurrent();
          publish({
            ...snapshot,
            facts: options.acknowledgedFacts?.(result, snapshot.facts) ?? snapshot.facts,
            syncStatus: 'syncing',
            revision: snapshot.revision + 1,
          });
          // The write was acknowledged; a failed refresh must not invite resubmitting it.
          await load(authority).catch(() => undefined);
        }
        authority.assertCurrent();
        return result;
      },
      options.mutation,
    );
  }

  const hydrateFromServer = () => {
    if (!hydration) {
      hydration = enqueue(isCurrent, load).finally(() => {
        hydration = null;
      });
    }
    return hydration;
  };

  const write = <T>(
    path: string,
    method: string,
    body: unknown,
    parse: Parser<T>,
    current: Current,
    acknowledgedFacts?: (result: T, facts: MemoryFact[]) => MemoryFact[],
  ) =>
    request(
      path,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      parse,
      { current, mutation: true, changesFacts: true, acknowledgedFacts },
    );

  const adapter = (current: Current): MemoryEditorDataAdapter => ({
    scope: 'cloud',
    facts: snapshot.facts,
    syncStatus: snapshot.syncStatus,
    mutationBlocked: snapshot.writeBlocked,
    isCurrent: () => isCurrent() && current(),
    hydrateFromServer,
    add: async (text, _sourceConversationId) => {
      const result = await write(
        MEMORY_PATH,
        'POST',
        { content: text, source: 'web' },
        parseManagedMemoryWriteResponse,
        current,
        applyWrittenMemory,
      );
      if (result.supersededBy)
        throw new Error('Kept an existing memory instead, because it outranks the new fact.');
      return result.memory;
    },
    update: (id, text) =>
      write(
        `${MEMORY_PATH}/${encodeURIComponent(id)}`,
        'PUT',
        { content: text },
        parseManagedMemoryItemResponse,
        current,
        (result, facts) =>
          facts.map((fact) => (fact.id === id ? factFromServer(result.memory) : fact)),
      ),
    setPinned: (id, pinned) =>
      write(
        `${MEMORY_PATH}/${encodeURIComponent(id)}`,
        'PUT',
        { pinned },
        parseManagedMemoryItemResponse,
        current,
        (result, facts) =>
          facts.map((fact) => (fact.id === id ? factFromServer(result.memory) : fact)),
      ),
    remove: (id) =>
      write(
        `${MEMORY_PATH}/${encodeURIComponent(id)}`,
        'DELETE',
        undefined,
        (body) =>
          body && typeof body === 'object' && 'success' in body && body.success === true
            ? body
            : null,
        current,
        (_result, facts) => facts.filter((fact) => fact.id !== id),
      ),
    clear: () =>
      write(
        MEMORY_PATH,
        'DELETE',
        undefined,
        (body) =>
          body &&
          typeof body === 'object' &&
          'deleted' in body &&
          typeof body.deleted === 'number' &&
          Number.isSafeInteger(body.deleted) &&
          body.deleted >= 0
            ? body
            : null,
        current,
        () => [],
      ),
  });

  return {
    key,
    owner,
    epoch,
    scopeKey,
    isCurrent,
    assertCurrent,
    retire,
    request,
    adapter,
    hydrateFromServer,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => (isCurrent() ? snapshot : UNAVAILABLE_MEMORY),
    addProject: async (text: string, projectId: string, current: Current) => {
      const result = await write(
        MEMORY_PATH,
        'POST',
        { content: text, source: 'web', projectId },
        parseManagedMemoryWriteResponse,
        current,
        applyWrittenMemory,
      );
      if (result.supersededBy)
        throw new Error('Kept an existing memory instead, because it outranks the new fact.');
      return result.memory;
    },
    exportMemories: (current: Current) =>
      enqueue(current, async (authority) => {
        const response = await authority.fetch(`${MEMORY_PATH}/export`, {
          headers: { [MANAGED_CLOUD_ORGANIZATION_HEADER]: organization },
          cache: 'no-store',
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          authority.assertCurrent();
          throw new Error(apiErrorMessage(body, 'Could not export your memories.'));
        }
        const blob = await response.blob();
        authority.assertCurrent();
        return {
          blob,
          filename:
            /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
            'memories.json',
        };
      }),
  };
}

export type CloudMemoryController = ReturnType<typeof createCloudMemoryController>;
