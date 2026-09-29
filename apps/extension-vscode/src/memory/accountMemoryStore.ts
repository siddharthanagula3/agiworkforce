import * as vscode from 'vscode';
import { classifyMemoryCategory, normalizeMemoryKey } from '@agiworkforce/agent-core';
import {
  applyMemoryDeltas,
  mapMemoryWireDelta,
  selectNextCursor,
  type SyncMemoryRecord,
} from '@agiworkforce/sync';
import { getAccountToken, getAccountAuthState, getCloudWebOrigin } from '../utils/api';
import {
  AccountMemoryUnauthorizedError,
  createAccountMemoryClient,
  INITIAL_CURSOR,
  MEMORY_SOURCE,
  type AccountMemoryClient,
  type MemoryDelta,
  type MemoryPushItem,
  type MemoryPushResponse,
  type MemoryScope,
} from './accountMemoryClient';
import { loadLegacyWorkspaceFacts, type MemoryFact } from './memoryStore';

export const ACCOUNT_MEMORY_CACHE_KEY = 'agiWorkforce.accountMemory';
export const ACCOUNT_MEMORY_CURSOR_KEY = 'agiWorkforce.accountMemoryCursor';
export const ACCOUNT_MEMORY_OWNER_KEY = 'agiWorkforce.accountMemoryOwner';
export const ACCOUNT_MEMORY_SCOPE_KEY = 'agiWorkforce.accountMemoryScope';
export const ACCOUNT_MEMORY_VERSIONS_KEY = 'agiWorkforce.accountMemoryVersions';
export const ACCOUNT_MEMORY_UNSCOPED_KEY = 'agiWorkforce.accountMemoryUnscoped';
export const WORKSPACE_MEMORY_ADOPTED_KEY = 'agiWorkforce.workspaceMemoryAdopted';

export type AccountMemoryStatus = 'ready' | 'signed-out' | 'unreachable';

export interface AccountMemoryState {
  status: AccountMemoryStatus;
  facts: MemoryFact[];
  /** Why the account could not be read, when `status` is not `ready`. */
  detail?: string;
}

export interface AccountMemoryWriteResult {
  applied: boolean;
  /** What the account refused, in the words the user should see. */
  refusals: string[];
}

type Storage = vscode.Memento & { setKeysForSync?(keys: readonly string[]): void };

interface CachedVersions {
  [id: string]: string;
}

const PINNED_IMPORTANCE = 9;

function toFact(record: SyncMemoryRecord): MemoryFact {
  return {
    id: record.id,
    text: record.content,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    category: classifyMemoryCategory(record.content),
    importance: record.pinned ? PINNED_IMPORTANCE : 5,
    ...(record.origin ? { source: record.origin } : {}),
    ...(record.sourceConversationTitle
      ? { sourceConversationTitle: record.sourceConversationTitle }
      : {}),
  };
}

function toRecord(fact: MemoryFact, serverVersion: string | undefined): SyncMemoryRecord {
  return {
    id: fact.id,
    content: fact.text,
    category: null,
    source: 'web',
    pinned: (fact.importance ?? 0) >= PINNED_IMPORTANCE,
    isDeleted: false,
    createdAt: fact.createdAt,
    updatedAt: fact.updatedAt ?? fact.createdAt,
    ...(serverVersion === undefined ? {} : { serverVersion }),
    origin: fact.source ?? null,
    sourceConversationTitle: fact.sourceConversationTitle ?? null,
  };
}

function sortFacts(facts: MemoryFact[]): MemoryFact[] {
  return [...facts].sort((a, b) =>
    (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
  );
}

/**
 * The account's memory, shared with the web app, the CLI and mobile.
 *
 * The extension's storage is a cache of it and nothing more: a fact added here
 * exists because the account accepted it, and one the account refused is never
 * shown as saved.
 */
export class AccountMemoryStore {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly storage: Storage,
    private readonly secrets: vscode.SecretStorage,
    private readonly workspaceState: vscode.Memento,
    private readonly client: AccountMemoryClient = createAccountMemoryClient({
      baseUrl: getCloudWebOrigin(),
      getAuthToken: () => getAccountToken(secrets),
    }),
  ) {}

  dispose(): void {
    this.changed.dispose();
  }

  scope(): MemoryScope | undefined {
    return this.storage.get<MemoryScope>(ACCOUNT_MEMORY_SCOPE_KEY);
  }

  /** The cached account memory, with no network call. */
  cachedFacts(): MemoryFact[] {
    const stored = this.storage.get<unknown>(ACCOUNT_MEMORY_CACHE_KEY);
    if (!Array.isArray(stored)) return [];
    return sortFacts(
      stored.filter(
        (value): value is MemoryFact =>
          value !== null &&
          typeof value === 'object' &&
          typeof (value as MemoryFact).id === 'string' &&
          typeof (value as MemoryFact).text === 'string',
      ),
    );
  }

  turnFacts(): MemoryFact[] {
    if (this.scope() === undefined || this.storage.get<boolean>(ACCOUNT_MEMORY_UNSCOPED_KEY)) {
      return [];
    }
    return this.cachedFacts();
  }

  async signedOut(): Promise<boolean> {
    return (await getAccountAuthState(this.secrets)).status !== 'signed-in';
  }

  /** Pull the account's memory into the cache and return what it holds. */
  async refresh(): Promise<AccountMemoryState> {
    if (await this.signedOut()) {
      return {
        status: 'signed-out',
        facts: [],
        detail: 'Sign in to AGI Cloud to use the memory your account shares across clients.',
      };
    }

    try {
      await this.discardAnotherAccountsCache();
      await this.discardAnotherWorkspacesCache(await this.client.readScope());
      const cursor = this.storage.get<string>(ACCOUNT_MEMORY_CURSOR_KEY) ?? INITIAL_CURSOR;
      const page = await this.client.pullAll(cursor);
      if (this.storage.get<boolean>(ACCOUNT_MEMORY_UNSCOPED_KEY)) {
        await this.storage.update(ACCOUNT_MEMORY_CACHE_KEY, []);
        await this.storage.update(ACCOUNT_MEMORY_VERSIONS_KEY, {});
      }
      await this.applyDeltas(page.memories);
      await this.storage.update(ACCOUNT_MEMORY_UNSCOPED_KEY, false);
      await this.storage.update(ACCOUNT_MEMORY_CURSOR_KEY, selectNextCursor(cursor, page.cursor));
      await this.adoptWorkspaceFacts();
      this.changed.fire();
      return { status: 'ready', facts: this.cachedFacts() };
    } catch (error) {
      if (error instanceof AccountMemoryUnauthorizedError) {
        return { status: 'signed-out', facts: [], detail: error.message };
      }
      return {
        status: 'unreachable',
        facts: this.cachedFacts(),
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async add(text: string): Promise<AccountMemoryWriteResult> {
    const content = text.trim();
    const item: MemoryPushItem = {
      id: randomId(),
      content,
      category: classifyMemoryCategory(content),
      source: MEMORY_SOURCE,
      baseVersion: INITIAL_CURSOR,
    };
    return this.write([item], () => {});
  }

  async update(id: string, text: string): Promise<AccountMemoryWriteResult> {
    const existing = this.cachedFacts().find((fact) => fact.id === id);
    if (existing === undefined)
      return { applied: false, refusals: ['That memory is not in your account.'] };
    const content = text.trim();
    const item: MemoryPushItem = {
      id,
      content,
      category: classifyMemoryCategory(content),
      source: MEMORY_SOURCE,
      baseVersion: this.baseVersion(id),
    };
    return this.write([item], () => {});
  }

  async remove(id: string): Promise<AccountMemoryWriteResult> {
    const existing = this.cachedFacts().find((fact) => fact.id === id);
    if (existing === undefined)
      return { applied: false, refusals: ['That memory is not in your account.'] };
    const item: MemoryPushItem = {
      id,
      content: existing.text,
      source: MEMORY_SOURCE,
      baseVersion: this.baseVersion(id),
      isDeleted: true,
    };
    return this.write([item], () => {});
  }

  async clear(): Promise<AccountMemoryWriteResult> {
    try {
      await this.client.deleteAll();
    } catch (error) {
      return { applied: false, refusals: [error instanceof Error ? error.message : String(error)] };
    }
    await this.refresh();
    return { applied: true, refusals: [] };
  }

  contains(text: string): boolean {
    const key = normalizeMemoryKey(text);
    return this.cachedFacts().some((fact) => normalizeMemoryKey(fact.text) === key);
  }

  private baseVersion(id: string): string {
    const versions = this.storage.get<CachedVersions>(ACCOUNT_MEMORY_VERSIONS_KEY) ?? {};
    return versions[id] ?? INITIAL_CURSOR;
  }

  private async write(
    items: MemoryPushItem[],
    onApplied: () => void,
  ): Promise<AccountMemoryWriteResult> {
    if (await this.signedOut()) {
      return {
        applied: false,
        refusals: ['Sign in to AGI Cloud to change the memory your account shares across clients.'],
      };
    }
    let response: MemoryPushResponse;
    try {
      response = await this.client.push(items);
    } catch (error) {
      if (error instanceof AccountMemoryUnauthorizedError) {
        return { applied: false, refusals: [error.message] };
      }
      return {
        applied: false,
        refusals: [
          `Your account did not record this: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }

    await this.recordVersions(response);
    const refusals = describeRefusals(items, response);
    if (refusals.length === 0) {
      await this.applyLocalWrites(items);
      onApplied();
    }
    this.changed.fire();
    return { applied: refusals.length === 0, refusals };
  }

  private async recordVersions(response: MemoryPushResponse): Promise<void> {
    const versions = { ...(this.storage.get<CachedVersions>(ACCOUNT_MEMORY_VERSIONS_KEY) ?? {}) };
    for (const row of response.applied) versions[row.id] = row.server_version;
    for (const conflict of response.conflicts) {
      if (conflict.current !== null) versions[conflict.id] = conflict.current.server_version;
    }
    await this.storage.update(ACCOUNT_MEMORY_VERSIONS_KEY, versions);
  }

  private async applyLocalWrites(items: MemoryPushItem[]): Promise<void> {
    const now = new Date().toISOString();
    const byId = new Map(this.cachedFacts().map((fact) => [fact.id, fact]));
    for (const item of items) {
      if (item.isDeleted === true) {
        byId.delete(item.id);
        continue;
      }
      byId.set(item.id, {
        id: item.id,
        text: item.content,
        createdAt: byId.get(item.id)?.createdAt ?? now,
        updatedAt: now,
        category: classifyMemoryCategory(item.content),
        importance: byId.get(item.id)?.importance ?? 5,
      });
    }
    await this.storage.update(ACCOUNT_MEMORY_CACHE_KEY, sortFacts([...byId.values()]));
  }

  private async applyDeltas(deltas: MemoryDelta[]): Promise<void> {
    const versions = { ...(this.storage.get<CachedVersions>(ACCOUNT_MEMORY_VERSIONS_KEY) ?? {}) };
    const records = applyMemoryDeltas(
      this.cachedFacts().map((fact) => toRecord(fact, versions[fact.id])),
      deltas.map(mapMemoryWireDelta),
    );
    for (const delta of deltas) versions[delta.id] = delta.server_version;
    await this.storage.update(ACCOUNT_MEMORY_CACHE_KEY, sortFacts(records.map(toFact)));
    await this.storage.update(ACCOUNT_MEMORY_VERSIONS_KEY, versions);
  }

  /**
   * A cache belonging to a different account describes rows this one cannot
   * see, so it is dropped rather than merged when the signed-in account changes.
   */
  private async discardAnotherAccountsCache(): Promise<void> {
    const owner = await currentOwner(this.secrets);
    if (owner === undefined) return;
    const recorded = this.storage.get<string>(ACCOUNT_MEMORY_OWNER_KEY);
    if (recorded === owner) return;
    // A cache written before this key existed has no recorded owner. It is
    // adopted rather than thrown away: discarding it would blank the view of a
    // user who only upgraded the extension.
    if (recorded !== undefined) {
      await this.storage.update(ACCOUNT_MEMORY_CACHE_KEY, []);
      await this.storage.update(ACCOUNT_MEMORY_VERSIONS_KEY, {});
      await this.storage.update(ACCOUNT_MEMORY_CURSOR_KEY, INITIAL_CURSOR);
    }
    await this.storage.update(ACCOUNT_MEMORY_OWNER_KEY, owner);
  }

  private async discardAnotherWorkspacesCache(scope: MemoryScope): Promise<void> {
    const recorded = this.scope();
    if (recorded === undefined && this.cachedFacts().length > 0) {
      await this.storage.update(ACCOUNT_MEMORY_UNSCOPED_KEY, true);
      await this.storage.update(ACCOUNT_MEMORY_CURSOR_KEY, INITIAL_CURSOR);
    } else if (recorded !== undefined && recorded.organizationId !== scope.organizationId) {
      await this.storage.update(ACCOUNT_MEMORY_CACHE_KEY, []);
      await this.storage.update(ACCOUNT_MEMORY_VERSIONS_KEY, {});
      await this.storage.update(ACCOUNT_MEMORY_CURSOR_KEY, INITIAL_CURSOR);
    }
    await this.storage.update(ACCOUNT_MEMORY_SCOPE_KEY, scope);
  }

  /**
   * Facts written before memory became an account feature live in this
   * workspace's state. They are pushed to the account once, so signing in
   * promotes them instead of hiding them.
   */
  private async adoptWorkspaceFacts(): Promise<void> {
    if (this.workspaceState.get<boolean>(WORKSPACE_MEMORY_ADOPTED_KEY) === true) return;
    const legacy = loadLegacyWorkspaceFacts(this.workspaceState).filter(
      (fact) => fact.text.trim() !== '',
    );
    const unseen = legacy.filter((fact) => !this.contains(fact.text));
    if (unseen.length === 0) {
      await this.workspaceState.update(WORKSPACE_MEMORY_ADOPTED_KEY, true);
      return;
    }
    const items = unseen.map<MemoryPushItem>((fact) => ({
      id: randomId(),
      content: fact.text.trim(),
      category: classifyMemoryCategory(fact.text),
      source: MEMORY_SOURCE,
      baseVersion: INITIAL_CURSOR,
    }));
    const response = await this.client.push(items);
    await this.recordVersions(response);
    await this.applyLocalWrites(
      items.filter((item) => response.applied.some((row) => row.id === item.id)),
    );
    await this.workspaceState.update(WORKSPACE_MEMORY_ADOPTED_KEY, true);
  }
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

async function currentOwner(secrets: vscode.SecretStorage): Promise<string | undefined> {
  const token = await getAccountToken(secrets);
  if (token === undefined || token === '') return undefined;
  return jwtSubject(token);
}

/**
 * The `sub` claim of the account token, used only as the identity the local
 * cache belongs to. A wrong value costs a re-sync and authorizes nothing.
 */
export function jwtSubject(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (payload === undefined) return undefined;
  try {
    const json = Buffer.from(payload.replace(/-/gu, '+').replace(/_/gu, '/'), 'base64').toString(
      'utf8',
    );
    const claims = JSON.parse(json) as Record<string, unknown>;
    const subject = claims['sub'];
    return typeof subject === 'string' && subject.trim() !== '' ? subject : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What the account refused, per pushed memory. An empty result means every
 * memory in the batch was stored.
 */
export function describeRefusals(
  items: readonly MemoryPushItem[],
  response: MemoryPushResponse,
): string[] {
  return items
    .filter((item) => !response.applied.some((row) => row.id === item.id))
    .map((item) => {
      const preview = item.content.slice(0, 60);
      const rejected = response.rejected.find((row) => row.id === item.id);
      if (rejected !== undefined) {
        if (rejected.message) return `"${preview}": ${rejected.message}`;
        return rejected.term !== undefined && rejected.term !== null
          ? `"${preview}" was refused by your account's memory policy (${rejected.term}).`
          : `"${preview}" was refused by your account's memory policy.`;
      }
      return `"${preview}" was not stored: another client changed it first, and its account copy wins.`;
    });
}

let instance: AccountMemoryStore | undefined;

export function setAccountMemoryStore(store: AccountMemoryStore | undefined): void {
  instance = store;
}

/**
 * The account memory store, or `undefined` before activation has wired it. A
 * caller that gets `undefined` has no memory to send, which is the truth rather
 * than a stale workspace copy.
 */
export function getAccountMemoryStore(): AccountMemoryStore | undefined {
  return instance;
}
