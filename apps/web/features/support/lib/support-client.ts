
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  SUPPORT_HISTORY_LIMIT,
  UNAVAILABLE_PRESENCE,
  type SupportAccountContextView,
  type SupportAccountFact,
  type SupportActionOutcome,
  type SupportAvailableAction,
  type SupportHandoffView,
  type SupportPresenceView,
  type SupportProposeResult,
  type SupportReplyView,
  type SupportSurface,
  type SupportTurn,
} from './contract';
import { makeAbstention, normalizeAnswer, normalizeCitations } from './normalize-answer';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export interface AskSupportInput {
  message: string;
  surface: SupportSurface;
  turns: SupportTurn[];
  signal?: AbortSignal;
}

function buildHistory(turns: SupportTurn[]): { role: 'user' | 'assistant'; content: string }[] {
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      history.push({ role: 'user', content: turn.text });
    } else if (turn.reply.kind === 'answer') {
      history.push({ role: 'assistant', content: turn.reply.text });
    }
  }
  return history.slice(-SUPPORT_HISTORY_LIMIT);
}

export async function askSupport(input: AskSupportInput): Promise<SupportReplyView> {
  let response: Response;
  try {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const init: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: input.message,
        surface: input.surface,
        history: buildHistory(input.turns),
      }),
    };
    if (input.signal) init.signal = input.signal;
    response = await fetch('/api/support/ask', init);
  } catch {
    return makeAbstention('transport_error');
  }

  if (response.status === 404 || response.status === 501) {
    return makeAbstention('not_available');
  }
  if (response.status === 429) {
    return makeAbstention('transport_error', {
      text: "You've asked a lot of questions in a short time. Give it a minute, or send this to a person.",
    });
  }
  if (!response.ok) {
    return makeAbstention('transport_error');
  }

  return normalizeAnswer(await readJson(response));
}

export async function fetchPresence(signal?: AbortSignal): Promise<SupportPresenceView> {
  let response: Response;
  try {
    const init: RequestInit = { method: 'GET', headers: { Accept: 'application/json' } };
    if (signal) init.signal = signal;
    response = await fetch('/api/support/handoff/availability', init);
  } catch {
    return UNAVAILABLE_PRESENCE;
  }
  if (!response.ok) return UNAVAILABLE_PRESENCE;

  const body = await readJson(response);
  if (!isRecord(body)) return UNAVAILABLE_PRESENCE;

  const fallbackRaw = isRecord(body['fallback']) ? body['fallback'] : {};
  const address = str(fallbackRaw['address']) ?? '';
  const configured = fallbackRaw['configured'] === true && address.length > 0;

  return {
    live: body['live'] === true,
    headline: str(body['headline']) ?? UNAVAILABLE_PRESENCE.headline,
    detail: str(body['detail']) ?? UNAVAILABLE_PRESENCE.detail,
    fallback: {
      address,
      expectedReply: str(fallbackRaw['expectedReply']) ?? '',
      configured,
    },
    waitTimeoutSeconds: num(body['waitTimeoutSeconds'], UNAVAILABLE_PRESENCE.waitTimeoutSeconds),
    pollIntervalMs: Math.max(
      1000,
      num(body['pollIntervalMs'], UNAVAILABLE_PRESENCE.pollIntervalMs),
    ),
  };
}

const ACCOUNT_FACT_LABELS: Readonly<Record<string, string>> = {
  plan_tier: 'Plan',
  effective_plan_tier: 'Effective plan',
  subscription_status: 'Subscription status',
  usage_percentage: 'Usage this period',
  session_usage_percentage: 'Session usage',
  weekly_usage_percentage: 'Weekly usage',
  usage_reset_at: 'Usage resets',
  has_usage_remaining: 'Usage remaining',
  active_api_key_count: 'Active API keys',
  email_verification_state: 'Email verification',
};

const PERCENTAGE_KEYS = new Set([
  'usage_percentage',
  'session_usage_percentage',
  'weekly_usage_percentage',
  'flagship_weekly_usage_percentage',
]);

function formatFactValue(key: string, value: unknown): string | null {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return PERCENTAGE_KEYS.has(key) ? `${String(Math.round(value))}%` : String(value);
  }
  return str(value);
}

export function toDisplayFacts(facts: unknown): SupportAccountFact[] {
  if (!isRecord(facts)) return [];
  const out: SupportAccountFact[] = [];
  for (const [key, label] of Object.entries(ACCOUNT_FACT_LABELS)) {
    if (!(key in facts)) continue;
    const value = formatFactValue(key, facts[key]);
    if (value === null) continue;
    out.push({ label, value });
  }
  return out;
}

export async function fetchAccountContext(
  signal?: AbortSignal,
): Promise<SupportAccountContextView> {
  let response: Response;
  try {
    const init: RequestInit = { method: 'GET', headers: { Accept: 'application/json' } };
    if (signal) init.signal = signal;
    response = await fetch('/api/support/account/context', init);
  } catch {
    return { signedIn: false };
  }
  if (!response.ok) return { signedIn: false };

  const body = await readJson(response);
  if (!isRecord(body)) return { signedIn: false };

  const facts = toDisplayFacts(body['facts']);
  const context = isRecord(body['context']) ? body['context'] : {};
  const plan = isRecord(context['plan']) ? context['plan'] : {};
  const planLabel = str(plan['displayName']) ?? str(plan['tier']);

  return { signedIn: true, planLabel, facts };
}

export async function fetchAvailableActions(
  signal?: AbortSignal,
): Promise<SupportAvailableAction[]> {
  let response: Response;
  try {
    const init: RequestInit = { method: 'GET', headers: { Accept: 'application/json' } };
    if (signal) init.signal = signal;
    response = await fetch('/api/support/actions/available', init);
  } catch {
    return [];
  }
  if (!response.ok) return [];

  const body = await readJson(response);
  if (!isRecord(body) || !Array.isArray(body['actions'])) return [];

  const out: SupportAvailableAction[] = [];
  for (const entry of body['actions']) {
    if (!isRecord(entry)) continue;
    if (entry['available'] === false) continue;
    const id = str(entry['id']);
    const title = str(entry['title']);
    if (!id || !title) continue;
    out.push({ id, title });
  }
  return out;
}

function normalizeEffects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    const text = str(entry);
    if (text) out.push(text);
  }
  return out;
}

export async function proposeAction(
  actionId: string,
  surface: SupportSurface,
): Promise<SupportProposeResult> {
  let response: Response;
  try {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    response = await fetch('/api/support/actions/propose', {
      method: 'POST',
      headers,
      body: JSON.stringify({ actionId, surface: surface === 'app' ? 'web' : 'marketing' }),
    });
  } catch {
    return { kind: 'error', message: 'I could not reach the support service just now.' };
  }

  const body = await readJson(response);

  if (response.ok && isRecord(body)) {
    const proposalRaw = isRecord(body['proposal']) ? body['proposal'] : null;
    const token = str(body['confirmationToken']);
    const proposalId = proposalRaw ? str(proposalRaw['id']) : null;
    const resolvedActionId = proposalRaw ? str(proposalRaw['actionId']) : null;
    const summary = proposalRaw ? str(proposalRaw['summary']) : null;
    const title = proposalRaw ? str(proposalRaw['title']) : null;

    if (!proposalRaw || !token || !proposalId || !resolvedActionId || !summary || !title) {
      return { kind: 'error', message: 'I could not prepare that safely, so I stopped.' };
    }

    return {
      kind: 'proposal',
      proposal: {
        proposalId,
        actionId: resolvedActionId,
        title,
        summary,
        effects: normalizeEffects(proposalRaw['effects']),
        reversible: proposalRaw['reversible'] === true,
        expiresAt: str(proposalRaw['expiresAt']),
        confirmationToken: token,
      },
    };
  }

  const code = isRecord(body) ? str(body['code']) : null;

  if (code === 'SUPPORT_ACTION_EXCLUDED') {
    const controlRaw = isRecord(body) && isRecord(body['control']) ? body['control'] : null;
    const label = controlRaw ? str(controlRaw['label']) : null;
    const href = controlRaw ? str(controlRaw['href']) : null;
    return {
      kind: 'refused',
      refusal: {
        actionId,
        explanation:
          (isRecord(body) ? (str(body['explain']) ?? str(body['message'])) : null) ??
          'That change is permanent, so I will not make it for you.',
        control: label && href && href.startsWith('/') ? { label, href } : null,
      },
    };
  }

  if (response.status === 409 || code === 'SUPPORT_ACTION_UNAVAILABLE') {
    const reason = isRecord(body) ? str(body['reason']) : null;
    return { kind: 'unavailable', message: reason ?? 'That is not available on your account.' };
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: 'unavailable', message: 'You need to be signed in for me to do that.' };
  }

  return { kind: 'error', message: 'I could not prepare that action.' };
}

export async function confirmAction(
  proposalId: string,
  confirmationToken: string,
): Promise<SupportActionOutcome> {
  let response: Response;
  try {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    response = await fetch('/api/support/actions/confirm', {
      method: 'POST',
      headers,
      body: JSON.stringify({ proposalId, confirmationToken }),
    });
  } catch {
    return { kind: 'failed', message: 'I could not reach the support service, so nothing ran.' };
  }

  const body = await readJson(response);

  if (response.status === 410) {
    return {
      kind: 'denied',
      message:
        'That confirmation expired or was already used. Ask me again and I will set up a new one.',
    };
  }
  if (response.status === 429) {
    return {
      kind: 'denied',
      message: 'That has been done too many times recently. Try again later.',
    };
  }
  if (!response.ok || !isRecord(body)) {
    const message = isRecord(body) ? str(body['message']) : null;
    return { kind: 'failed', message: message ?? 'That did not go through, so nothing changed.' };
  }

  const result = isRecord(body['result']) ? body['result'] : null;
  const message = (result ? str(result['message']) : null) ?? str(body['message']) ?? 'Done.';

  if (result && result['kind'] === 'handoff') {
    const request = isRecord(result['request']) ? result['request'] : null;
    const path = request ? str(request['path']) : null;
    const method = request ? str(request['method']) : null;
    if (path && path.startsWith('/api/') && !path.startsWith('//')) {
      if (method === 'GET') {
        return { kind: 'ok', message, followUp: { mode: 'link', label: 'Open it', href: path } };
      }
      if (method === 'POST') {
        return { kind: 'ok', message, followUp: { mode: 'post', label: 'Open it', path } };
      }
    }
    return { kind: 'ok', message, followUp: null };
  }

  if (result && result['kind'] === 'secret_once') {
    const fullKey = str(result['fullKey']);
    if (fullKey) {
      return {
        kind: 'ok',
        message,
        followUp: null,
        secret: { label: 'Your new API key — copy it now, it is not shown again', value: fullKey },
      };
    }
  }

  return { kind: 'ok', message, followUp: null };
}

export async function runPostFollowUp(path: string): Promise<{ url: string } | { error: string }> {
  if (!path.startsWith('/api/') || path.startsWith('//')) {
    return { error: 'That link was not valid, so I did not follow it.' };
  }
  try {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch(path, { method: 'POST', headers, body: '{}' });
    const body = await readJson(response);
    if (!response.ok || !isRecord(body))
      return { error: 'That did not open. Try it from Settings.' };
    const url = str(body['url']);
    if (!url) return { error: 'That did not open. Try it from Settings.' };
    return { url };
  } catch {
    return { error: 'That did not open. Try it from Settings.' };
  }
}

export interface HandoffAttemptedActionWire {
  action: string;
  outcome: 'succeeded' | 'failed' | 'refused' | 'confirmation_pending';
  detail?: string;
  at: string;
}

export interface CreateHandoffInput {
  surface: SupportSurface;
  reason: 'user_requested' | 'hard_abstain' | 'low_confidence' | 'no_citation' | 'action_refused';
  summary: string;
  turns: SupportTurn[];
  attemptedActions?: HandoffAttemptedActionWire[];
  contactEmail?: string;
  pagePath?: string;
}

export function buildHandoffCitations(turns: SupportTurn[]): { title: string; url: string }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string }[] = [];
  for (const turn of turns) {
    if (turn.role !== 'assistant') continue;
    for (const citation of turn.reply.citations) {
      if (seen.has(citation.url)) continue;
      seen.add(citation.url);
      out.push({ title: citation.title, url: citation.url });
      if (out.length >= 20) return out;
    }
  }
  return out;
}

export function buildAttemptedActions(
  flows: Record<string, { phase: string; actionId?: string } & Record<string, unknown>>,
): HandoffAttemptedActionWire[] {
  const at = new Date().toISOString();
  const out: HandoffAttemptedActionWire[] = [];

  for (const flow of Object.values(flows)) {
    const action = typeof flow.actionId === 'string' ? flow.actionId : 'unknown_action';

    if (flow.phase === 'done') {
      const outcome = flow['outcome'] as SupportActionOutcome | undefined;
      if (!outcome) continue;
      if (outcome.kind === 'ok') {
        out.push({
          action,
          outcome: 'succeeded',
          detail: outcome.secret
            ? 'Completed. Result withheld: it contained a credential.'
            : outcome.message,
          at,
        });
      } else {
        out.push({
          action,
          outcome: outcome.kind === 'denied' ? 'refused' : 'failed',
          detail: outcome.message,
          at,
        });
      }
      continue;
    }

    if (flow.phase === 'refused') {
      const refusal = flow['refusal'] as { explanation?: string } | undefined;
      const entry: HandoffAttemptedActionWire = { action, outcome: 'refused', at };
      if (refusal?.explanation) entry.detail = refusal.explanation;
      out.push(entry);
      continue;
    }

    if (flow.phase === 'blocked') {
      const message = flow['message'];
      const entry: HandoffAttemptedActionWire = { action, outcome: 'failed', at };
      if (typeof message === 'string') entry.detail = message;
      out.push(entry);
      continue;
    }

    out.push({
      action,
      outcome: 'confirmation_pending',
      detail: 'Offered to the user; not confirmed.',
      at,
    });
  }

  return out;
}

export function buildHandoffTranscript(
  turns: SupportTurn[],
): { role: 'user' | 'assistant'; content: string; at: string }[] {
  const at = new Date().toISOString();
  return turns.map((turn) =>
    turn.role === 'user'
      ? { role: 'user' as const, content: turn.text, at }
      : { role: 'assistant' as const, content: turn.reply.text, at },
  );
}

function handoffFailure(message: string): SupportHandoffView {
  return { kind: 'failed', message };
}

export async function createHandoff(input: CreateHandoffInput): Promise<SupportHandoffView> {
  let response: Response;
  try {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const payload: Record<string, unknown> = {
      surface: input.surface === 'app' ? 'web-app' : 'marketing',
      reason: input.reason,
      summary: input.summary,
      transcript: buildHandoffTranscript(input.turns),
      citations: buildHandoffCitations(input.turns),
    };
    if (input.attemptedActions && input.attemptedActions.length > 0) {
      payload['attemptedActions'] = input.attemptedActions;
    }
    if (input.contactEmail) payload['contactEmail'] = input.contactEmail;
    if (input.pagePath) payload['pagePath'] = input.pagePath;
    response = await fetch('/api/support/handoff', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    return handoffFailure('I could not reach the support service just now.');
  }

  if (response.status === 404 || response.status === 501) {
    return handoffFailure('Handoff is not switched on for this site yet.');
  }

  const body = await readJson(response);
  if (!response.ok || !isRecord(body)) {
    return handoffFailure('I could not pass this on. Please email the team directly.');
  }

  return normalizeHandoffCreate(body);
}

export function normalizeHandoffCreate(body: Record<string, unknown>): SupportHandoffView {
  const mode = body['mode'];
  const headline = str(body['headline']);
  const detail = str(body['detail']);

  if (mode === 'live') {
    const sessionId = str(body['sessionId']);
    const referenceId = str(body['referenceId']);
    const waitExpiresAt = str(body['waitExpiresAt']);
    if (!sessionId || !referenceId || !waitExpiresAt) {
      return handoffFailure('I could not start a chat safely, so I did not leave you waiting.');
    }
    return {
      kind: 'waiting',
      sessionId,
      referenceId,
      waitExpiresAt,
      pollIntervalMs: Math.max(1000, num(body['pollIntervalMs'], 3000)),
      headline: headline ?? 'Waiting for someone to pick up.',
      detail: detail ?? "If nobody picks up shortly, I'll email this to the support team instead.",
    };
  }

  if (mode === 'email') {
    return {
      kind: 'emailed',
      referenceId: str(body['referenceId']) ?? '',
      emailedTo: str(body['emailedTo']) ?? '',
      expectedReply: str(body['expectedReply']) ?? '',
      headline: headline ?? 'Sent to the support team.',
      detail: detail ?? 'They have the whole conversation, so you will not have to repeat it.',
    };
  }

  if (mode === 'unavailable') {
    const mailtoHref = str(body['mailtoHref']);
    return {
      kind: 'undeliverable',
      referenceId: str(body['referenceId']),
      headline: headline ?? 'I could not send this.',
      detail: detail ?? 'Email is not set up on this deployment, so nothing was sent.',
      mailtoHref: mailtoHref && mailtoHref.startsWith('mailto:') ? mailtoHref : null,
    };
  }

  return handoffFailure('I could not pass this on.');
}

export async function fetchHandoffStatus(sessionId: string): Promise<SupportHandoffView | null> {
  let response: Response;
  try {
    response = await fetch(`/api/support/handoff/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const body = await readJson(response);
  if (!isRecord(body)) return null;

  const status = str(body['status']);
  const referenceId = str(body['referenceId']) ?? '';
  const headline = str(body['headline']);
  const detail = str(body['detail']);
  const pollIntervalMs = Math.max(1000, num(body['pollIntervalMs'], 3000));

  if (status === 'waiting') {
    const waitExpiresAt = str(body['waitExpiresAt']);
    if (!waitExpiresAt) {
      return handoffFailure('The chat request lost its timeout, so I stopped waiting on it.');
    }
    return {
      kind: 'waiting',
      sessionId,
      referenceId,
      waitExpiresAt,
      pollIntervalMs,
      headline: headline ?? 'Waiting for someone to pick up.',
      detail: detail ?? "If nobody picks up shortly, I'll email this to the support team.",
    };
  }

  if (status === 'connected') {
    return {
      kind: 'connected',
      sessionId,
      referenceId,
      agentDisplayName: str(body['agentDisplayName']),
      pollIntervalMs,
      headline: headline ?? 'Someone has joined.',
      detail: detail ?? 'They can see the conversation so far.',
    };
  }

  if (status === 'emailed' || status === 'timed_out_emailed') {
    return {
      kind: 'emailed',
      referenceId,
      emailedTo: str(body['emailedTo']) ?? '',
      expectedReply: str(body['expectedReply']) ?? '',
      headline: headline ?? 'Nobody picked up, so I emailed the support team.',
      detail: detail ?? 'They have the whole conversation.',
    };
  }

  if (status === 'undeliverable') {
    return {
      kind: 'undeliverable',
      referenceId,
      headline: headline ?? 'I could not send this.',
      detail: detail ?? 'Nothing was sent.',
      mailtoHref: null,
    };
  }

  if (status === 'closed' || status === 'cancelled') {
    return {
      kind: 'closed',
      referenceId,
      headline: headline ?? 'This conversation is closed.',
      detail: detail ?? '',
    };
  }

  return null;
}

/** Re-exported so tests and components share one citation normalizer. */
export { normalizeCitations };
