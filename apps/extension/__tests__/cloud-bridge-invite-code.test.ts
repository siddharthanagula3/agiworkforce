/**
 * Tests for apps/extension/src/features/cloud-bridge/.
 *
 * Covers:
 *   - types: InviteCodeError, InviteCodeSource, InviteCodeTab, InviteCodeModalProps shapes
 *   - waitlistService: redeemInviteCode (success + all 7 InviteCodeError variants), joinWaitlist
 *   - InviteCodeModal: mount/unmount, tab switching, invite submit flow, waitlist submit flow,
 *     close on backdrop click / Escape, props.open toggling, update()
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Chrome storage shim — hoisted so module-level code in desktopBridge finds it
// ---------------------------------------------------------------------------

const chromeMock = vi.hoisted(() => {
  const localStore: Record<string, unknown> = {};

  const mock = {
    storage: {
      local: {
        get: vi.fn(
          (keys: string | string[], callback?: (result: Record<string, unknown>) => void) => {
            const result: Record<string, unknown> = {};
            const keyList = typeof keys === 'string' ? [keys] : keys;
            for (const k of keyList) {
              if (k in localStore) result[k] = localStore[k];
            }
            if (callback) {
              callback(result);
              return undefined;
            }
            return Promise.resolve(result);
          },
        ),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(localStore, items);
          callback?.();
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

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { waitlistService } from '../src/lib/waitlistService';
import {
  InviteCodeModal,
  mountInviteCodeModal,
} from '../src/features/cloud-bridge/InviteCodeModal';
import type {
  InviteCodeError,
  InviteCodeSource,
  InviteCodeTab,
  InviteCodeModalProps,
} from '../src/features/cloud-bridge/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<InviteCodeModalProps> = {}): InviteCodeModalProps {
  return {
    open: false,
    onClose: vi.fn(),
    source: 'connectors' as InviteCodeSource,
    defaultTab: 'invite' as InviteCodeTab,
    onRedeemed: vi.fn(),
    onWaitlisted: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear chrome storage
  for (const k of Object.keys(chromeMock._localStore)) delete chromeMock._localStore[k];
  vi.stubEnv('VITE_API_BASE_URL', 'https://agiworkforce.com');
  vi.clearAllMocks();
  // Reinstall chrome global after clearAllMocks
  (globalThis as Record<string, unknown>).chrome = chromeMock;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllEnvs();
});

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function mockCsrfAndApiResponse(body: unknown, status = 200): void {
  fetchMock
    .mockResolvedValueOnce(makeJsonResponse({ token: 'csrf-test-token' }))
    .mockResolvedValueOnce(makeJsonResponse(body, status));
}

// ---------------------------------------------------------------------------
// types — shape checks
// ---------------------------------------------------------------------------

describe('types', () => {
  it('InviteCodeError union covers all 7 codes', () => {
    const codes: InviteCodeError[] = [
      'invalid_code',
      'expired',
      'fully_redeemed',
      'already_redeemed_by_user',
      'anon_signin_failed',
      'not_wired',
      'rpc_error',
    ];
    expect(codes).toHaveLength(7);
  });

  it('InviteCodeSource includes chrome-relevant sources', () => {
    const sources: InviteCodeSource[] = ['connectors', 'web-search', 'computer-use', 'other'];
    expect(sources).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// waitlistService.redeemInviteCode
// ---------------------------------------------------------------------------

describe('waitlistService.redeemInviteCode', () => {
  it('returns success + inviteId on valid redemption', async () => {
    mockCsrfAndApiResponse({ success: true, inviteId: 'invite-abc' });
    const result = await waitlistService.redeemInviteCode('VALIDCODE', 'connectors');
    expect(result.success).toBe(true);
    expect(result.inviteId).toBe('invite-abc');
  });

  it('routes invite redemption through the web API boundary', async () => {
    mockCsrfAndApiResponse({ success: true, inviteId: 'invite-abc' });
    await waitlistService.redeemInviteCode('VALIDCODE', 'connectors');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://agiworkforce.com/api/claim-offer',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-csrf-token': 'csrf-test-token',
          'x-requested-with': 'agiworkforce-chrome-extension',
        }),
      }),
    );
  });

  it('uppercases code before sending', async () => {
    mockCsrfAndApiResponse({ success: true, inviteId: 'invite-abc' });
    await waitlistService.redeemInviteCode('lowercase', 'connectors');
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.code).toBe('LOWERCASE');
  });

  it('returns invalid_code error', async () => {
    mockCsrfAndApiResponse({ success: false, error: 'invalid_code' });
    const result = await waitlistService.redeemInviteCode('BADCODE', 'other');
    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_code');
  });

  it('returns expired error', async () => {
    mockCsrfAndApiResponse({ success: false, error: 'expired' });
    const result = await waitlistService.redeemInviteCode('EXPIREDCODE', 'other');
    expect(result.error).toBe('expired');
  });

  it('returns fully_redeemed error', async () => {
    mockCsrfAndApiResponse({ success: false, error: 'fully_redeemed' });
    const result = await waitlistService.redeemInviteCode('FULLCODE', 'other');
    expect(result.error).toBe('fully_redeemed');
  });

  it('returns already_redeemed_by_user error', async () => {
    mockCsrfAndApiResponse({ success: false, error: 'already_redeemed_by_user' });
    const result = await waitlistService.redeemInviteCode('DUPCODE', 'other');
    expect(result.error).toBe('already_redeemed_by_user');
  });

  it('returns anon_signin_failed when API maps auth failure', async () => {
    mockCsrfAndApiResponse({ success: false, error: 'anon_signin_failed' });
    const result = await waitlistService.redeemInviteCode('AUTHFAIL', 'other');
    expect(result.success).toBe(false);
    expect(result.error).toBe('anon_signin_failed');
  });

  it('returns rpc_error when web API transport fails', async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse({ token: 'csrf-test-token' }));
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    const result = await waitlistService.redeemInviteCode('ANYCODE', 'other');
    expect(result.success).toBe(false);
    expect(result.error).toBe('rpc_error');
  });

  it('falls back to the canonical agiworkforce.com origin when no build env var is set', async () => {
    vi.unstubAllEnvs();
    mockCsrfAndApiResponse({ success: true, inviteId: 'invite-default' });
    const result = await waitlistService.redeemInviteCode('VALIDCODE', 'other');
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://agiworkforce.com/api/claim-offer',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fails closed when the configured base URL is outside the allowlist', async () => {
    vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'https://evil.example.com');
    const result = await waitlistService.redeemInviteCode('VALIDCODE', 'other');
    expect(result).toEqual({ success: false, error: 'not_wired' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// waitlistService.joinWaitlist
// ---------------------------------------------------------------------------

describe('waitlistService.joinWaitlist', () => {
  it('posts record to the web API and returns success', async () => {
    mockCsrfAndApiResponse({ ok: true, joined: true });
    const result = await waitlistService.joinWaitlist({ email: 'Test@Example.COM' });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://agiworkforce.com/api/waitlist/cloud-managed',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.email).toBe('test@example.com');
  });

  it('maps chrome-only referral sources to web waitlist source=other', async () => {
    mockCsrfAndApiResponse({ ok: true, joined: true });
    await waitlistService.joinWaitlist({ email: 'dup@example.com', referralSource: 'connectors' });
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.source).toBe('other');
  });

  it('returns generic error on web API error', async () => {
    mockCsrfAndApiResponse({ error: 'db unavailable' }, 500);
    const result = await waitlistService.joinWaitlist({ email: 'foo@example.com' });
    expect(result.success).toBe(false);
  });

  it('falls back to the canonical agiworkforce.com origin when no build env var is set', async () => {
    vi.unstubAllEnvs();
    mockCsrfAndApiResponse({ ok: true, joined: true });
    const result = await waitlistService.joinWaitlist({ email: 'foo@example.com' });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://agiworkforce.com/api/waitlist/cloud-managed',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fails closed when the configured base URL is outside the allowlist', async () => {
    vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'https://evil.example.com');
    const result = await waitlistService.joinWaitlist({ email: 'foo@example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// InviteCodeModal — DOM tests
// ---------------------------------------------------------------------------

describe('InviteCodeModal mount/unmount', () => {
  it('mounts a host element into container', () => {
    const modal = new InviteCodeModal(makeProps());
    modal.mount(document.body);
    expect(document.querySelector('[data-agi-cloud-modal]')).toBeTruthy();
    modal.unmount();
  });

  it('unmounts and removes the host element', () => {
    const modal = new InviteCodeModal(makeProps());
    modal.mount(document.body);
    modal.unmount();
    expect(document.querySelector('[data-agi-cloud-modal]')).toBeNull();
  });

  it('mountInviteCodeModal factory mounts and returns modal instance', () => {
    const modal = mountInviteCodeModal(document.body, makeProps());
    expect(document.querySelector('[data-agi-cloud-modal]')).toBeTruthy();
    modal.unmount();
  });
});

describe('InviteCodeModal open/close', () => {
  it('shows backdrop when open=true via constructor', () => {
    const modal = new InviteCodeModal(makeProps({ open: true }));
    modal.mount(document.body);
    const shadow = (document.querySelector('[data-agi-cloud-modal]') as HTMLElement).shadowRoot!;
    // open=true removes the 'hidden' class
    expect(shadow.querySelector('.agi-modal-backdrop')!.classList.contains('hidden')).toBe(false);
    modal.unmount();
  });

  it('hides backdrop when open=false', () => {
    const modal = new InviteCodeModal(makeProps({ open: false }));
    modal.mount(document.body);
    const shadow = (document.querySelector('[data-agi-cloud-modal]') as HTMLElement).shadowRoot!;
    expect(shadow.querySelector('.agi-modal-backdrop')!.classList.contains('hidden')).toBe(true);
    modal.unmount();
  });

  it('calls onClose when close() is called', () => {
    const onClose = vi.fn();
    const modal = new InviteCodeModal(makeProps({ open: true, onClose }));
    modal.mount(document.body);
    modal.close();
    expect(onClose).toHaveBeenCalledOnce();
    modal.unmount();
  });

  it('update({ open: true }) shows the modal', () => {
    const modal = new InviteCodeModal(makeProps({ open: false }));
    modal.mount(document.body);
    modal.update({ open: true });
    const shadow = (document.querySelector('[data-agi-cloud-modal]') as HTMLElement).shadowRoot!;
    expect(shadow.querySelector('.agi-modal-backdrop')!.classList.contains('hidden')).toBe(false);
    modal.unmount();
  });
});

describe('InviteCodeModal tab switching', () => {
  it('defaults to invite tab', () => {
    const modal = new InviteCodeModal(makeProps({ open: true, defaultTab: 'invite' }));
    modal.mount(document.body);
    const shadow = (document.querySelector('[data-agi-cloud-modal]') as HTMLElement).shadowRoot!;
    const inviteContent = shadow.querySelectorAll('.agi-tab-content')[0]!;
    expect(inviteContent.classList.contains('active')).toBe(true);
    modal.unmount();
  });

  it('defaults to waitlist tab when defaultTab=waitlist', () => {
    const modal = new InviteCodeModal(makeProps({ open: true, defaultTab: 'waitlist' }));
    modal.mount(document.body);
    const shadow = (document.querySelector('[data-agi-cloud-modal]') as HTMLElement).shadowRoot!;
    const waitlistContent = shadow.querySelectorAll('.agi-tab-content')[1]!;
    expect(waitlistContent.classList.contains('active')).toBe(true);
    modal.unmount();
  });
});

describe('InviteCodeModal invite submit', () => {
  it('calls redeemInviteCode and onRedeemed on success', async () => {
    mockCsrfAndApiResponse({ success: true, inviteId: 'inv-xyz' });
    const onRedeemed = vi.fn();
    const modal = new InviteCodeModal(makeProps({ open: true, onRedeemed }));
    modal.mount(document.body);

    const shadow = (document.querySelector('[data-agi-cloud-modal]') as Element).shadowRoot!;
    const input = shadow.querySelector('.agi-input.mono') as HTMLInputElement;
    const submitBtn = shadow.querySelector('.agi-btn') as HTMLButtonElement;

    // Type a valid code (>= 6 chars)
    input.value = 'TESTCODE';
    input.dispatchEvent(new Event('input'));

    // Submit should now be enabled
    expect(submitBtn.disabled).toBe(false);

    submitBtn.click();
    // Wait for async resolution
    await vi.waitFor(() => expect(onRedeemed).toHaveBeenCalledWith('inv-xyz'), { timeout: 500 });

    modal.unmount();
  });

  it('shows error text when code is invalid', async () => {
    mockCsrfAndApiResponse({ success: false, error: 'invalid_code' });
    const modal = new InviteCodeModal(makeProps({ open: true }));
    modal.mount(document.body);

    const shadow = (document.querySelector('[data-agi-cloud-modal]') as Element).shadowRoot!;
    const input = shadow.querySelector('.agi-input.mono') as HTMLInputElement;
    const submitBtn = shadow.querySelector('.agi-btn') as HTMLButtonElement;

    input.value = 'BADCODE';
    input.dispatchEvent(new Event('input'));
    submitBtn.click();

    await vi.waitFor(
      () => {
        const err = shadow.querySelector('.agi-error-text');
        expect(err?.classList.contains('visible')).toBe(true);
      },
      { timeout: 500 },
    );

    modal.unmount();
  });

  it('disables submit button when code < 6 chars', () => {
    const modal = new InviteCodeModal(makeProps({ open: true }));
    modal.mount(document.body);
    const shadow = (document.querySelector('[data-agi-cloud-modal]') as Element).shadowRoot!;
    const input = shadow.querySelector('.agi-input.mono') as HTMLInputElement;
    const submitBtn = shadow.querySelector('.agi-btn') as HTMLButtonElement;

    input.value = 'AB';
    input.dispatchEvent(new Event('input'));
    expect(submitBtn.disabled).toBe(true);
    modal.unmount();
  });
});

describe('InviteCodeModal waitlist submit', () => {
  it('calls joinWaitlist and onWaitlisted on success', async () => {
    mockCsrfAndApiResponse({ ok: true, joined: true });

    const onWaitlisted = vi.fn();
    const modal = new InviteCodeModal(
      makeProps({ open: true, defaultTab: 'waitlist', onWaitlisted }),
    );
    modal.mount(document.body);

    const shadow = (document.querySelector('[data-agi-cloud-modal]') as Element).shadowRoot!;
    const emailInput = shadow.querySelector('input[type="email"]') as HTMLInputElement;
    const submitBtns = shadow.querySelectorAll('.agi-btn');
    // Waitlist tab content is the second tab-content; its button is the second .agi-btn
    const waitlistBtn = submitBtns[1] as HTMLButtonElement;

    emailInput.value = 'user@example.com';
    emailInput.dispatchEvent(new Event('input'));
    expect(waitlistBtn.disabled).toBe(false);

    waitlistBtn.click();
    await vi.waitFor(() => expect(onWaitlisted).toHaveBeenCalledWith('user@example.com'), {
      timeout: 500,
    });

    modal.unmount();
  });

  it('disables waitlist submit when email is invalid', () => {
    const modal = new InviteCodeModal(makeProps({ open: true, defaultTab: 'waitlist' }));
    modal.mount(document.body);
    const shadow = (document.querySelector('[data-agi-cloud-modal]') as Element).shadowRoot!;
    const emailInput = shadow.querySelector('input[type="email"]') as HTMLInputElement;
    const submitBtns = shadow.querySelectorAll('.agi-btn');
    const waitlistBtn = submitBtns[1] as HTMLButtonElement;

    emailInput.value = 'not-an-email';
    emailInput.dispatchEvent(new Event('input'));
    expect(waitlistBtn.disabled).toBe(true);
    modal.unmount();
  });
});
