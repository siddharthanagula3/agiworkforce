/**
 * PA-4 regression: the extension's managed-cloud surface must present AGI Cloud
 * as PUBLIC ALPHA / open-by-default, not invite/waitlist-only or env-gated.
 *
 * Covers:
 *   (a) cloudAgentClient.callCloud — a 403 from the managed-compute gate no longer
 *       claims the operator must set AGI_MANAGED_COMPUTE_PRIVATE_BETA=1; it reflects
 *       the kill-switch / paid-tier truth.
 *   (b) InviteCodeModal — default copy no longer presents managed cloud as
 *       invite/waitlist-only; it is sign-in-centric public-alpha copy.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// chrome shim — InviteCodeModal touches chrome.storage during mount/redeem.
const chromeMock = vi.hoisted(() => {
  const localStore: Record<string, unknown> = {};
  const mock = {
    storage: {
      local: {
        get: vi.fn((keys: string | string[]) => {
          const result: Record<string, unknown> = {};
          const keyList = typeof keys === 'string' ? [keys] : keys;
          for (const k of keyList) if (k in localStore) result[k] = localStore[k];
          return Promise.resolve(result);
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(localStore, items);
          return Promise.resolve();
        }),
      },
    },
    _localStore: localStore,
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { callCloud } from '../src/features/computer-use/cloudAgentClient';
import { InviteCodeModal } from '../src/features/cloud-bridge/InviteCodeModal';

beforeEach(() => {
  for (const k of Object.keys(chromeMock._localStore)) delete chromeMock._localStore[k];
  vi.clearAllMocks();
  (globalThis as Record<string, unknown>).chrome = chromeMock;
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// (a) cloudAgentClient 403 message — kill-switch / paid-tier truth
// ---------------------------------------------------------------------------

describe('callCloud 403 managed-compute message', () => {
  function mock403(bodyText: string): void {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue(bodyText),
    } as unknown as Response);
  }

  it('does NOT tell the operator to set AGI_MANAGED_COMPUTE_PRIVATE_BETA=1', async () => {
    mock403('public_launch_blocked');
    const err = await callCloud([{ role: 'user', content: 'hi' }], 'tok').catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    // The stale/inverted instruction is gone.
    expect(err.message).not.toMatch(/requires AGI_MANAGED_COMPUTE_PRIVATE_BETA=1/);
    expect(err.message).not.toMatch(/must have it set/i);
  });

  it('frames the 403 as kill-switch gate or missing paid tier (public alpha)', async () => {
    mock403('public_launch_blocked');
    const err = await callCloud([{ role: 'user', content: 'hi' }], 'tok').catch((e) => e as Error);
    expect(err.message).toMatch(/public alpha/i);
    expect(err.message).toMatch(/kill-switch/i);
    expect(err.message).toMatch(/paid/i);
  });

  it('still detects the not_private_beta / managed_compute body markers', async () => {
    mock403('managed_compute_private_beta');
    const err = await callCloud([{ role: 'user', content: 'hi' }], 'tok').catch((e) => e as Error);
    expect(err.message).toMatch(/403/);
    expect(err.message).toMatch(/public alpha/i);
  });
});

// ---------------------------------------------------------------------------
// (b) InviteCodeModal copy — no invite/waitlist-only framing for managed cloud
// ---------------------------------------------------------------------------

describe('InviteCodeModal public-alpha copy', () => {
  function mountAndText(): string {
    const modal = new InviteCodeModal({
      open: true,
      onClose: vi.fn(),
      source: 'computer-use',
      defaultTab: 'invite',
    });
    modal.mount(document.body);
    const shadow = (document.querySelector('[data-agi-cloud-modal]') as HTMLElement).shadowRoot!;
    return shadow.textContent ?? '';
  }

  it('describes cloud as public alpha reached by signing in (no invite/waitlist gate)', () => {
    const text = mountAndText().toLowerCase();
    expect(text).toContain('public alpha');
    expect(text).toContain('sign in');
    // The old gate framing must be gone.
    expect(text).not.toContain('gated for v1');
    expect(text).not.toContain('unlock cloud routing');
    expect(text).not.toContain('join the waitlist');
    expect(text).not.toContain('cloud features are gated');
  });

  it('reframes the redeem flow as an optional promo/invite code, not a cloud gate', () => {
    const text = mountAndText();
    expect(text).toContain('Redeem a code');
    expect(text).toContain('Promo or invite code');
    // No "Unlock cloud" CTA implying cloud is locked behind a code.
    expect(text).not.toContain('Unlock cloud');
  });
});
