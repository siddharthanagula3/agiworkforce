import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequestMe } = vi.hoisted(() => ({ mockRequestMe: vi.fn() }));

vi.mock('@shared/services/me-request', () => ({
  requestMe: (...args: unknown[]) => mockRequestMe(...args),
}));

import { useBillingStore } from '../web-auth-store';

const ME = {
  id: 'user_1',
  email: null,
  name: 'Person',
  avatar_url: null,
  created_at: null,
  updated_at: 0,
  plan: { tier: 'pro', display_name: 'Pro', status: 'active', current_period_end: null },
  feature_flags: { advanced_model_access: true },
  routing_preferences: {},
};

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('web auth store attachment limits', () => {
  beforeEach(() => {
    mockRequestMe.mockReset();
    useBillingStore.getState()._reset();
  });

  it('keeps the attachment limits the server published', async () => {
    mockRequestMe.mockResolvedValue(
      answer({
        ...ME,
        attachment_limits: {
          max_file_bytes: 2_000,
          max_image_bytes: 1_000,
          max_message_bytes: 8_000,
          max_files_per_message: 7,
        },
      }),
    );

    await useBillingStore.getState().refreshUser();

    expect(useBillingStore.getState().attachmentLimits).toEqual({
      maxFileBytes: 2_000,
      maxImageBytes: 1_000,
      maxMessageBytes: 8_000,
      maxFilesPerMessage: 7,
    });
  });

  it('holds no limits when the server published none or a malformed block', async () => {
    mockRequestMe.mockResolvedValue(answer({ ...ME, attachment_limits: { max_file_bytes: 'x' } }));

    await useBillingStore.getState().refreshUser();

    expect(useBillingStore.getState().attachmentLimits).toBeNull();
  });

  it('drops the published limits when the session ends', async () => {
    mockRequestMe.mockResolvedValueOnce(
      answer({
        ...ME,
        attachment_limits: {
          max_file_bytes: 2_000,
          max_image_bytes: 1_000,
          max_message_bytes: 8_000,
          max_files_per_message: 7,
        },
      }),
    );
    await useBillingStore.getState().refreshUser();
    mockRequestMe.mockResolvedValueOnce(answer({ error: 'Unauthorized' }, 401));

    await useBillingStore.getState().refreshUser();

    expect(useBillingStore.getState().attachmentLimits).toBeNull();
  });

  it('keeps the large file offer, the storage left and the inline budget', async () => {
    mockRequestMe.mockResolvedValue(
      answer({
        ...ME,
        attachment_limits: {
          max_file_bytes: 524_288_000,
          max_image_bytes: 20_971_520,
          max_message_bytes: 327_155_712,
          max_files_per_message: 20,
          large_files_available: true,
          storage_remaining_bytes: 327_155_712,
          inline_message_bytes: 26_214_400,
        },
      }),
    );

    await useBillingStore.getState().refreshUser();

    expect(useBillingStore.getState().attachmentLimits).toEqual({
      maxFileBytes: 524_288_000,
      maxImageBytes: 20_971_520,
      maxMessageBytes: 327_155_712,
      maxFilesPerMessage: 20,
      largeFilesAvailable: true,
      storageRemainingBytes: 327_155_712,
      inlineMessageBytes: 26_214_400,
    });
  });

  it('keeps the limits of today for an offer that leaves out the inline budget', async () => {
    mockRequestMe.mockResolvedValue(
      answer({
        ...ME,
        attachment_limits: {
          max_file_bytes: 524_288_000,
          max_image_bytes: 20_971_520,
          max_message_bytes: 2_147_483_648,
          max_files_per_message: 20,
          large_files_available: true,
          storage_remaining_bytes: null,
        },
      }),
    );

    await useBillingStore.getState().refreshUser();

    expect(useBillingStore.getState().attachmentLimits).toBeNull();
  });

  it('forgets an offer when the next answer does not carry it', async () => {
    mockRequestMe.mockResolvedValueOnce(
      answer({
        ...ME,
        attachment_limits: {
          max_file_bytes: 524_288_000,
          max_image_bytes: 20_971_520,
          max_message_bytes: 2_147_483_648,
          max_files_per_message: 20,
          large_files_available: true,
          storage_remaining_bytes: null,
          inline_message_bytes: 26_214_400,
        },
      }),
    );
    await useBillingStore.getState().refreshUser();
    mockRequestMe.mockResolvedValueOnce(
      answer({
        ...ME,
        attachment_limits: {
          max_file_bytes: 26_214_400,
          max_image_bytes: 20_971_520,
          max_message_bytes: 26_214_400,
          max_files_per_message: 10,
        },
      }),
    );

    await useBillingStore.getState().refreshUser();

    expect(useBillingStore.getState().attachmentLimits?.largeFilesAvailable).toBeUndefined();
  });
});
