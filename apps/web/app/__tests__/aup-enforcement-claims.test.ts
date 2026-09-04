import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { DEFAULT_TOOL_APPROVAL_POLICY } from '@shared/types/toolApprovalPolicy';
import { policyAutoApprovesTool } from '../api/llm/v1/chat/completions/lib/tool-approval-policy';
import { classifyToolLoopInputs } from '../api/llm/v1/chat/completions/lib/tool-loop-routing';
import { rateLimitConfigs } from '@/lib/rate-limit';

const APP_DIR = path.resolve(__dirname, '..');
const read = (relative: string) => readFileSync(path.join(APP_DIR, relative), 'utf8');

const AUP = read('acceptable-use/page.tsx');
const AGENT_PERMISSIONS = read('agent-permissions/page.tsx');
const TOOL_LOOP = read('api/llm/v1/chat/completions/lib/tool-loop.ts');
const APPROVE_ROUTE = read('api/llm/v1/chat/completions/approve/route.ts');

function toolCallGateSource(): string {
  const start = TOOL_LOOP.indexOf('function resolveToolCallGate');
  expect(
    start,
    'tool-loop.ts must still resolve tool calls through resolveToolCallGate',
  ).toBeGreaterThan(-1);
  const end = TOOL_LOOP.indexOf('\n  }', TOOL_LOOP.indexOf('auto_approval_mode', start));
  return TOOL_LOOP.slice(start, end);
}

describe('Q-1 · "Every connector and MCP tool requires approval by default"', () => {
  it('is the sentence actually published on /acceptable-use', () => {
    expect(AUP).toContain('Every connector and MCP tool requires approval by default.');
  });

  it('holds because any MCP tool in the turn forces manual approval mode', () => {
    const withMcp = classifyToolLoopInputs(
      [{ qualifiedName: 'gmail__send_email' } as never],
      undefined,
    );
    expect(withMcp.approvalMode).toBe('manual');
  });

  it('holds because the account default policy auto-approves nothing', () => {
    expect(DEFAULT_TOOL_APPROVAL_POLICY).toBe('ask_every_time');
    for (const name of ['gmail__list_messages', 'notion__search', 'slack__post_message']) {
      expect(policyAutoApprovesTool(DEFAULT_TOOL_APPROVAL_POLICY, name)).toBe(false);
    }
  });

  it('exempts exactly the built-ins the same sentence names, and nothing else', () => {
    expect(AUP).toContain('Built-in web search, page fetch, and sandbox tools do not');
    const builtInsOnly = classifyToolLoopInputs(
      [],
      [{ function: { name: 'web_search' } }, { function: { name: 'fetch_url' } }],
    );
    expect(builtInsOnly.approvalMode).toBe('auto');
  });
});

describe('Q-2 · "A Block is absolute" and does not hide the tool', () => {
  it('is published on both pages', () => {
    expect(AUP).toContain('A tool you block is refused on the server before it runs.');
    expect(AGENT_PERMISSIONS).toContain('it does not hide the tool from the');
  });

  it('is the first branch of the gate, so nothing downstream can reverse it', () => {
    const gate = toolCallGateSource();
    const denyAt = gate.indexOf('blocked_by_user_permission');
    const allowAt = gate.indexOf("'always_allow'");
    const autoAt = gate.indexOf("'auto_approval_mode'");
    expect(denyAt).toBeGreaterThan(-1);
    expect(denyAt).toBeLessThan(allowAt);
    expect(denyAt).toBeLessThan(autoAt);
  });

  it('is re-checked when an approval is resumed, not only during the stream', () => {
    expect(APPROVE_ROUTE).toContain('connectorPermissions.isDenied');
  });

  it('leaves the blocked tool in the list handed to the model', () => {
    expect(TOOL_LOOP).toContain('const openAiTools: unknown[] = mcpTools.map(toOpenAiToolDef);');
    expect(toolCallGateSource()).not.toContain('mcpTools');
  });
});

describe('Q-3 · a saved "ask" verdict outranks automatic mode', () => {
  it('is published on /agent-permissions', () => {
    expect(AGENT_PERMISSIONS).toContain('verdict outranks automatic mode');
  });

  it('is decided before the approval mode is consulted', () => {
    const gate = toolCallGateSource();
    const savedAskAt = gate.indexOf("saved === 'ask'");
    const modeAt = gate.indexOf("approvalMode === 'manual'");
    expect(savedAskAt).toBeGreaterThan(-1);
    expect(modeAt).toBeGreaterThan(-1);
    expect(savedAskAt).toBeLessThan(modeAt);
  });
});

describe('Q-6 · the published rate limits are the enforced ones', () => {
  it('publishes the per-user chat ceiling the limiter configures', () => {
    expect(AUP).toContain('30 requests per minute at the time of writing');
    expect(rateLimitConfigs['llm-completion']).toMatchObject({
      limit: 30,
      window: '1 m',
      failClosed: true,
    });
  });

  it('publishes the per-IP ceiling the limiter configures', () => {
    expect(AUP).toContain('1,500 requests per minute at the time of writing');
    expect(rateLimitConfigs['llm-completion-ip']).toMatchObject({
      limit: 1500,
      window: '1 m',
      failClosed: true,
    });
  });

  it('publishes the conversation-operation ceiling the limiter configures', () => {
    expect(AUP).toContain('limited to 60 per minute per user');
    expect(rateLimitConfigs['chat-conversation']).toMatchObject({ limit: 60, window: '1 m' });
  });
});

const EXTENSION_ROOT = path.resolve(APP_DIR, '..', '..', 'extension');
const readExtension = (relative: string) =>
  readFileSync(path.join(EXTENSION_ROOT, relative), 'utf8');
const readWeb = (relative: string) => readFileSync(path.resolve(APP_DIR, '..', relative), 'utf8');
const AUP_PROSE = AUP.replace(/\s+/g, ' ');

describe('Q-7 · the sandbox description matches what the runtime provisions', () => {
  const RUNTIME = readWeb('lib/e2b/runtime.ts');
  const EGRESS_HOSTS = readWeb('lib/e2b/egress-hosts.ts');

  it('names the three outbound network policies the runtime actually implements', () => {
    expect(AUP).toContain('<code>none</code>');
    expect(AUP).toContain('<code>trusted</code>');
    expect(AUP).toContain('<code>full</code>');
    expect(RUNTIME).toContain("networkAccess === 'full'");
    expect(RUNTIME).toContain("networkAccess === 'trusted'");
    expect(RUNTIME).toContain('allowInternetAccess: false');
  });

  it('claims a bounded lifetime and a per-plan allowance because the runtime enforces both', () => {
    expect(AUP_PROSE).toContain('bounded lifetime and a per-plan concurrency allowance');
    expect(RUNTIME).toContain('timeoutMs: sandboxTimeoutMs');
    expect(RUNTIME).toContain('plan grants no managed sandbox lifetime; refusing (fail-closed)');
  });

  it('describes trusted as a fixed allowlist with everything else denied, as the runtime builds it', () => {
    expect(AUP_PROSE).toContain(
      'a fixed allowlist of package and source hosts, everything else denied',
    );
    expect(RUNTIME).toContain("if (networkAccess === 'trusted') {");
    expect(RUNTIME).toContain('for (const host of TRUSTED_CODE_HOSTS) hosts.add(host);');
    expect(RUNTIME).toContain('denyOut: [ALL_OUTBOUND_TRAFFIC]');
  });

  it('claims a per-session extra host allowlist because extraHosts is validated and applied', () => {
    expect(AUP_PROSE).toContain('add up to ten of your own hostnames to that allowlist');
    expect(EGRESS_HOSTS).toContain('export const MAX_EXTRA_EGRESS_HOSTS = 10;');
    expect(RUNTIME).toContain('for (const host of extraHosts ?? []) hosts.add(host);');
  });

  it('claims the provider-credential proxy stays reachable under none because it is always allowed', () => {
    expect(AUP_PROSE).toContain(
      'provider-credential proxy stays reachable at every setting, including',
    );
    expect(RUNTIME).toContain('const proxyHost = providerProxyHost();');
    expect(RUNTIME).toContain('if (proxyHost) hosts.add(proxyHost);');
  });
});

describe('Q-8 · the Chrome debugger sentence matches the extension permissions and gates', () => {
  const MANIFEST = JSON.parse(readExtension('manifest.json')) as { permissions: string[] };
  const BACKGROUND = readExtension('src/background.ts');

  it('claims debugger control because the extension requests that permission', () => {
    expect(MANIFEST.permissions).toContain('debugger');
    expect(readExtension('src/features/computer-use/cdpDriver.ts')).toContain(
      'chrome.debugger.attach',
    );
  });

  it('does not let the allowlist alone read as the grant, because a second consent gates the run', () => {
    expect(BACKGROUND).toContain('is not on the site allowlist');
    expect(BACKGROUND).toContain('hasBrowserControlConsent(cuOrigin)');
    expect(AUP_PROSE).toContain('separately grant browser control to');
    expect(AUP_PROSE).not.toMatch(/debugger on sites you add to your allowlist\./);
  });
});

describe('Q-10 · cancellation stops the renewal and keeps access to the period end', () => {
  const REFUND_POLICY = read('refund-policy/page.tsx');
  const WEBHOOK_HANDLERS = read('api/stripe-webhook/lib/handlers.ts');
  const WEBHOOK_DB = read('api/stripe-webhook/lib/db.ts');

  it('publishes the sentence the webhook behaviour has to back', () => {
    expect(REFUND_POLICY).toContain(
      'Cancellation stops the next renewal and access continues through the paid term.',
    );
  });

  it('holds because a pending cancellation is mirrored without touching the plan or status', () => {
    expect(WEBHOOK_HANDLERS).toContain("case 'customer.subscription.updated'");
    expect(WEBHOOK_DB).toContain('cancelAtPeriodEnd = subscription.cancel_at_period_end');
    expect(WEBHOOK_DB).toContain('cancel_at_period_end: cancelAtPeriodEnd');
  });

  it('holds because the plan only drops to free when Stripe deletes the subscription at term end', () => {
    expect(WEBHOOK_HANDLERS).toContain("case 'customer.subscription.deleted'");
    expect(WEBHOOK_HANDLERS).toContain(
      "update subscriptions set status = 'canceled', plan_tier = 'free', canceled_at = $1 where stripe_subscription_id = $2",
    );
  });
});
