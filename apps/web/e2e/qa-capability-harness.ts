import type { Page, Request } from '@playwright/test';

export const QA_USER = 'user_3F8wXtZ4rDJ1SZmfO02Lz3BHj2v';

export type QaIdentity = 'primary' | 'secondary';

const QA_SECOND_USER_ID_ENV = 'QA_SECOND_USER_ID';
const QA_SECOND_USER_EMAIL = 'qa4+clerk_test@example.com';

function requireClerkSecret(): string {
  const secret = process.env['CLERK_SECRET_KEY'];
  if (!secret) {
    throw new Error('CLERK_SECRET_KEY missing from process.env (.env.local not loaded)');
  }
  return secret;
}

async function resolveSecondUserId(secret: string): Promise<string> {
  const envId = process.env[QA_SECOND_USER_ID_ENV];
  if (envId) return envId;
  const res = await fetch(
    `https://api.clerk.com/v1/users?${new URLSearchParams({ query: QA_SECOND_USER_EMAIL })}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  if (!res.ok) {
    throw new Error(`clerk user lookup failed: HTTP ${res.status} ${await res.text()}`);
  }
  const users = (await res.json()) as { id: string }[];
  const match = users[0];
  if (!match) {
    throw new Error(
      `no Clerk user found for ${QA_SECOND_USER_EMAIL}; set ${QA_SECOND_USER_ID_ENV}`,
    );
  }
  return match.id;
}

async function resolveIdentityUserId(identity: QaIdentity, secret: string): Promise<string> {
  return identity === 'primary' ? QA_USER : resolveSecondUserId(secret);
}

export async function mintSignInTicketFor(userId: string): Promise<string> {
  const secret = requireClerkSecret();
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    throw new Error(`sign_in_tokens failed: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error('sign_in_tokens returned no token');
  return json.token;
}

export async function mintSignInTicket(): Promise<string> {
  return mintSignInTicketFor(QA_USER);
}

export async function signInWithTicket(page: Page, ticket: string): Promise<void> {
  let signedIn = false;
  let lastError: unknown;
  for (let attempt = 0; attempt < 4 && !signedIn; attempt++) {
    try {
      await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForFunction(
        () => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
        { timeout: 20000 },
      );
      await page.evaluate(async (t) => {
        const clerk = (
          window as unknown as {
            Clerk: {
              client: {
                signIn: { create: (o: unknown) => Promise<{ createdSessionId?: string }> };
              };
              setActive: (o: unknown) => Promise<void>;
            };
          }
        ).Clerk;
        const res = await clerk.client.signIn.create({ strategy: 'ticket', ticket: t });
        if (res.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId });
        }
      }, ticket);
      signedIn = true;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1500);
    }
  }
  if (!signedIn) {
    throw new Error(`Clerk ticket sign-in failed after retries: ${String(lastError)}`);
  }
  await page.waitForTimeout(1500);
}

export async function signIn(page: Page): Promise<void> {
  await signInWithTicket(page, await mintSignInTicket());
}

export async function signInAs(page: Page, identity: QaIdentity): Promise<void> {
  const secret = requireClerkSecret();
  const userId = await resolveIdentityUserId(identity, secret);
  await signInWithTicket(page, await mintSignInTicketFor(userId));
}

export async function resolveIdentityId(identity: QaIdentity): Promise<string> {
  return resolveIdentityUserId(identity, requireClerkSecret());
}

export interface ApiCallResult {
  status: number;
  body: string;
}

/**
 * Managed Cloud chat is an OpenAI-compatible surface: it authenticates with a
 * bearer token, not the Clerk session cookie, and refuses a request that does
 * not name a client surface or carry a CSRF token. A cookie-only call returns
 * 401 `invalid_api_key`, which looks like a capability failure but is really an
 * un-authenticated request.
 */
export async function apiCall(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown; idempotencyKey?: string; maxBytes?: number },
): Promise<ApiCallResult> {
  return page.evaluate(
    async ({ p, i }) => {
      const clerk = (
        window as unknown as { Clerk: { session?: { getToken: () => Promise<string | null> } } }
      ).Clerk;
      const token = await clerk.session?.getToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'x-agi-surface': 'web',
      };
      if (i?.method && i.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        const csrfResponse = await fetch('/api/csrf-token').then((r) => (r.ok ? r.json() : null));
        const csrf = (csrfResponse as { csrfToken?: string } | null)?.csrfToken;
        if (csrf) headers['x-csrf-token'] = csrf;
      }
      if (i?.idempotencyKey) headers['Idempotency-Key'] = i.idempotencyKey;
      const res = await fetch(p, {
        method: i?.method ?? 'GET',
        headers,
        body: i?.body ? JSON.stringify(i.body) : undefined,
      });
      return { status: res.status, body: (await res.text()).slice(0, i?.maxBytes ?? 400_000) };
    },
    { p: path, i: init ?? null },
  );
}

export interface CapturedCompletion {
  url: string;
  requestBody: unknown;
  status: number;
  responseText: string;
}

export interface RuntimeEvidence {
  completions: CapturedCompletion[];
  apiRequests: { method: string; url: string; status: number | null }[];
  consoleErrors: string[];
}

const COMPLETION_PATH = '/api/llm/v1/chat/completions';

export function collectEvidence(page: Page): RuntimeEvidence {
  const evidence: RuntimeEvidence = { completions: [], apiRequests: [], consoleErrors: [] };

  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text());
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const request = response.request();
    evidence.apiRequests.push({
      method: request.method(),
      url: new URL(url).pathname + new URL(url).search,
      status: response.status(),
    });
    if (!url.includes(COMPLETION_PATH)) return;
    let responseText = '';
    try {
      responseText = await response.text();
    } catch {
      responseText = '<<stream body unavailable>>';
    }
    let requestBody: unknown = null;
    try {
      requestBody = JSON.parse(request.postData() ?? 'null');
    } catch {
      requestBody = request.postData();
    }
    evidence.completions.push({
      url: new URL(url).pathname,
      requestBody,
      status: response.status(),
      responseText,
    });
  });

  return evidence;
}

export interface ToolCallRecord {
  name: string;
  argumentsText: string;
}

/**
 * Reconstructs tool calls from an SSE completion body. Streaming deltas split
 * `arguments` across frames, so names and argument fragments are joined by
 * tool-call index before being reported.
 */
export function extractToolCalls(responseText: string): ToolCallRecord[] {
  const byIndex = new Map<number, ToolCallRecord>();
  for (const line of responseText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (!payload || payload === '[DONE]') continue;
    let frame: unknown;
    try {
      frame = JSON.parse(payload);
    } catch {
      continue;
    }
    const choices = (frame as { choices?: unknown[] }).choices;
    if (!Array.isArray(choices)) continue;
    for (const choice of choices) {
      const container = choice as {
        delta?: { tool_calls?: unknown[] };
        message?: { tool_calls?: unknown[] };
      };
      const toolCalls = container.delta?.tool_calls ?? container.message?.tool_calls;
      if (!Array.isArray(toolCalls)) continue;
      for (const [position, rawCall] of toolCalls.entries()) {
        const call = rawCall as {
          index?: number;
          function?: { name?: string; arguments?: string };
        };
        const index = call.index ?? position;
        const existing = byIndex.get(index) ?? { name: '', argumentsText: '' };
        if (call.function?.name) existing.name = call.function.name;
        if (call.function?.arguments) existing.argumentsText += call.function.arguments;
        byIndex.set(index, existing);
      }
    }
  }
  return [...byIndex.values()].filter((call) => call.name.length > 0);
}

export function completionToolCalls(evidence: RuntimeEvidence): ToolCallRecord[] {
  return evidence.completions.flatMap((completion) => extractToolCalls(completion.responseText));
}

export interface RuntimeToolEvent {
  event: string;
  toolName: string | null;
  status: string | null;
  args: unknown;
  raw: Record<string, unknown>;
}

const TOOL_EVENT_KEYS = [
  'x_tool_status',
  'x_tool_result',
  'x_tool_approval_request',
  'x_agent_event',
] as const;

/**
 * The server executes the tool loop itself, so `tool_calls` never reach the
 * client. Invocation evidence arrives instead as the `x_tool_*` SSE frames the
 * loop emits, which carry the tool name and, on `running`, the parsed args.
 */
export function extractRuntimeToolEvents(responseText: string): RuntimeToolEvent[] {
  const events: RuntimeToolEvent[] = [];
  for (const line of responseText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (!payload || payload === '[DONE]') continue;
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    // The `x_*` envelopes ride inside `choices[].delta`, not at frame top
    // level. Reading the top level finds nothing and makes a working
    // invocation look like a silent no-op.
    const choices = Array.isArray(frame['choices']) ? (frame['choices'] as unknown[]) : [];
    const carriers: Record<string, unknown>[] = [frame];
    for (const choice of choices) {
      const delta = (choice as { delta?: unknown; message?: unknown }).delta;
      const message = (choice as { message?: unknown }).message;
      if (delta && typeof delta === 'object') carriers.push(delta as Record<string, unknown>);
      if (message && typeof message === 'object') carriers.push(message as Record<string, unknown>);
    }

    for (const carrier of carriers) {
      for (const key of TOOL_EVENT_KEYS) {
        const value = carrier[key];
        if (value === undefined || value === null) continue;
        const container = value as Record<string, unknown>;
        // `x_agent_event` wraps the payload one level deeper under `event`.
        const nested = (container['event'] ?? container['data'] ?? container) as Record<
          string,
          unknown
        >;
        const toolName =
          pickString(nested, ['name', 'tool', 'tool_name', 'toolName']) ??
          pickString(container, ['name', 'tool', 'tool_name', 'toolName']);
        events.push({
          event: key,
          toolName,
          status:
            pickString(nested, ['status', 'phase', 'type']) ?? pickString(container, ['status']),
          args:
            nested['args'] ?? nested['input'] ?? nested['arguments'] ?? container['args'] ?? null,
          raw: container,
        });
      }
    }
  }
  return events;
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export function runtimeToolEvents(evidence: RuntimeEvidence): RuntimeToolEvent[] {
  return evidence.completions.flatMap((completion) =>
    extractRuntimeToolEvents(completion.responseText),
  );
}

/** Skill loads recorded by the runtime, as `skill(action=load, name=…)` calls. */
export function loadedSkillNames(events: RuntimeToolEvent[]): string[] {
  const names = new Set<string>();
  for (const event of events) {
    if (event.toolName !== 'skill') continue;
    const args = event.args as { action?: string; name?: string } | null;
    if (args?.name && (args.action === undefined || args.action === 'load')) {
      names.add(args.name);
    }
  }
  return [...names];
}

export function invokedToolNames(events: RuntimeToolEvent[]): string[] {
  return [...new Set(events.map((event) => event.toolName).filter((n): n is string => Boolean(n)))];
}

export function offeredTools(evidence: RuntimeEvidence): string[][] {
  return evidence.completions.map((completion) => {
    const tools = (completion.requestBody as { tools?: { function?: { name?: string } }[] } | null)
      ?.tools;
    return Array.isArray(tools) ? tools.map((tool) => tool.function?.name ?? '<unnamed>') : [];
  });
}

export function requestsMatching(evidence: RuntimeEvidence, fragment: string) {
  return evidence.apiRequests.filter((entry) => entry.url.includes(fragment));
}

export function isApiRequest(request: Request, fragment: string): boolean {
  return request.url().includes(fragment);
}
