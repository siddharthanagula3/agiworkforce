/**
 * Tests for apps/extension/src/features/cloud-bridge/.
 *
 * Covers:
 *   - types: InviteCodeError, InviteCodeSource, InviteCodeTab, InviteCodeModalProps shapes
 *   - desktopBridge: getCloudUnlockState, setCloudUnlocked
 *   - waitlistService: redeemInviteCode (success + all 6 InviteCodeError variants), joinWaitlist
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

// ---------------------------------------------------------------------------
// Supabase mock — hoisted so waitlistService's module-level getSupabase() sees it
// ---------------------------------------------------------------------------

const supabaseMock = vi.hoisted(() => {
  const mock = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'anon-123' } } } }),
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'anon-123' } } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({
      data: [{ valid: true, invite_id: 'invite-abc-123' }],
      error: null,
    }),
  };
  return mock;
});

vi.mock('../src/lib/supabase', () => ({
  getSupabase: () => supabaseMock,
  __resetSupabaseClientForTests: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { getCloudUnlockState, setCloudUnlocked } from '../src/features/cloud-bridge/desktopBridge';
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
  // Reset supabase mocks
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'anon-123' } } },
  });
  supabaseMock.rpc.mockResolvedValue({
    data: [{ valid: true, invite_id: 'invite-abc-123' }],
    error: null,
  });
  const fromMock = { insert: vi.fn().mockResolvedValue({ error: null }) };
  supabaseMock.from.mockReturnValue(fromMock);
  vi.clearAllMocks();
  // Reinstall chrome global after clearAllMocks
  (globalThis as Record<string, unknown>).chrome = chromeMock;
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// types — shape checks
// ---------------------------------------------------------------------------

describe('types', () => {
  it('InviteCodeError union covers all 6 codes', () => {
    const codes: InviteCodeError[] = [
      'invalid_code',
      'expired',
      'fully_redeemed',
      'already_redeemed_by_user',
      'anon_signin_failed',
      'rpc_error',
    ];
    expect(codes).toHaveLength(6);
  });

  it('InviteCodeSource includes chrome-relevant sources', () => {
    const sources: InviteCodeSource[] = ['connectors', 'web-search', 'computer-use', 'other'];
    expect(sources).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// desktopBridge
// ---------------------------------------------------------------------------

describe('getCloudUnlockState', () => {
  it('returns unlocked=false when storage is empty', async () => {
    const state = await getCloudUnlockState();
    expect(state.unlocked).toBe(false);
  });

  it('returns unlocked state when agi_cloud_unlocked is set', async () => {
    chromeMock._localStore['agi_cloud_unlocked'] = {
      unlocked: true,
      inviteId: 'test-invite-id',
      unlockedAt: 1716000000000,
    };
    const state = await getCloudUnlockState();
    expect(state.unlocked).toBe(true);
    expect(state.inviteId).toBe('test-invite-id');
  });
});

describe('setCloudUnlocked', () => {
  it('writes unlock state to chrome.storage.local', async () => {
    await setCloudUnlocked('my-invite-id');
    const stored = chromeMock._localStore['agi_cloud_unlocked'] as {
      unlocked: boolean;
      inviteId: string;
    };
    expect(stored.unlocked).toBe(true);
    expect(stored.inviteId).toBe('my-invite-id');
  });
});

// ---------------------------------------------------------------------------
// waitlistService.redeemInviteCode
// ---------------------------------------------------------------------------

describe('waitlistService.redeemInviteCode', () => {
  it('returns success + inviteId on valid redemption', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [{ valid: true, invite_id: 'invite-abc' }],
      error: null,
    });
    const result = await waitlistService.redeemInviteCode('VALIDCODE', 'connectors');
    expect(result.success).toBe(true);
    expect(result.inviteId).toBe('invite-abc');
  });

  it('passes surface=chrome to RPC', async () => {
    await waitlistService.redeemInviteCode('VALIDCODE', 'connectors');
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'validate_and_redeem_invite_code',
      expect.objectContaining({ p_surface: 'chrome' }),
    );
  });

  it('uppercases code before sending', async () => {
    await waitlistService.redeemInviteCode('lowercase', 'connectors');
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'validate_and_redeem_invite_code',
      expect.objectContaining({ p_code: 'LOWERCASE' }),
    );
  });

  it('returns invalid_code error', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [{ valid: false, error: 'invalid_code' }],
      error: null,
    });
    const result = await waitlistService.redeemInviteCode('BADCODE', 'other');
    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_code');
  });

  it('returns expired error', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [{ valid: false, error: 'expired' }],
      error: null,
    });
    const result = await waitlistService.redeemInviteCode('EXPIREDCODE', 'other');
    expect(result.error).toBe('expired');
  });

  it('returns fully_redeemed error', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [{ valid: false, error: 'fully_redeemed' }],
      error: null,
    });
    const result = await waitlistService.redeemInviteCode('FULLCODE', 'other');
    expect(result.error).toBe('fully_redeemed');
  });

  it('returns already_redeemed_by_user error', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [{ valid: false, error: 'already_redeemed_by_user' }],
      error: null,
    });
    const result = await waitlistService.redeemInviteCode('DUPCODE', 'other');
    expect(result.error).toBe('already_redeemed_by_user');
  });

  it('returns anon_signin_failed when anonymous sign-in fails and no existing session', async () => {
    supabaseMock.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    supabaseMock.auth.signInAnonymously.mockResolvedValueOnce({
      data: { session: null },
      error: new Error('auth failed'),
    });
    const result = await waitlistService.redeemInviteCode('ANYCODE', 'other');
    expect(result.success).toBe(false);
    expect(result.error).toBe('anon_signin_failed');
  });

  it('returns rpc_error when RPC transport fails', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error('network error'),
    });
    const result = await waitlistService.redeemInviteCode('ANYCODE', 'other');
    expect(result.success).toBe(false);
    expect(result.error).toBe('rpc_error');
  });

  it('uses existing session without calling signInAnonymously', async () => {
    supabaseMock.auth.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'existing-user' } } },
    });
    await waitlistService.redeemInviteCode('VALIDCODE', 'other');
    expect(supabaseMock.auth.signInAnonymously).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// waitlistService.joinWaitlist
// ---------------------------------------------------------------------------

describe('waitlistService.joinWaitlist', () => {
  it('inserts record and returns success', async () => {
    const fromMock = { insert: vi.fn().mockResolvedValue({ error: null }) };
    supabaseMock.from.mockReturnValueOnce(fromMock);
    const result = await waitlistService.joinWaitlist({ email: 'Test@Example.COM' });
    expect(result.success).toBe(true);
    expect(fromMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com' }),
    );
  });

  it('returns duplicate error on 23505 code', async () => {
    const fromMock = {
      insert: vi.fn().mockResolvedValue({ error: { code: '23505' } }),
    };
    supabaseMock.from.mockReturnValueOnce(fromMock);
    const result = await waitlistService.joinWaitlist({ email: 'dup@example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already on the waitlist/i);
  });

  it('returns generic error on unexpected DB error', async () => {
    const fromMock = {
      insert: vi.fn().mockResolvedValue({ error: { code: '42000', message: 'db error' } }),
    };
    supabaseMock.from.mockReturnValueOnce(fromMock);
    const result = await waitlistService.joinWaitlist({ email: 'foo@example.com' });
    expect(result.success).toBe(false);
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
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [{ valid: true, invite_id: 'inv-xyz' }],
      error: null,
    });
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
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [{ valid: false, error: 'invalid_code' }],
      error: null,
    });
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
    const fromMock = { insert: vi.fn().mockResolvedValue({ error: null }) };
    supabaseMock.from.mockReturnValue(fromMock);

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
