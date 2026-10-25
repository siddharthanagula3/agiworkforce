import { beforeAll, describe, expect, it, vi } from 'vitest';
import catalog from '../_locales/en/messages.json';

beforeAll(() => {
  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: (key: string) =>
        (catalog as Record<string, { message: string }>)[key]?.message ?? '',
      getUILanguage: () => 'en',
    },
    runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: {}, session: {}, onChanged: { addListener: vi.fn() } },
  });
});

const ID = '44444444-4444-4444-8444-444444444444';

function cloudMessage(metadata: Record<string, unknown>) {
  return {
    id: ID,
    conversationId: '55555555-5555-4555-8555-555555555555',
    role: 'assistant' as const,
    content: 'Partial answer',
    createdAt: '2026-10-25T10:00:00.000Z',
    metadata: { runtime: 'managed-cloud', ...metadata },
  };
}

describe('a failed turn in account history', () => {
  it('saves the error text with the failure', async () => {
    const { buildExtensionCloudMessageMetadata } =
      await import('../src/features/cloud-bridge/conversationSyncClient');
    expect(
      buildExtensionCloudMessageMetadata({
        localConversationId: 'conv-1',
        runtime: 'managed-cloud',
        error: true,
        errorText: 'AGI Cloud is unavailable.',
      }),
    ).toMatchObject({ error: true, errorText: 'AGI Cloud is unavailable.' });
    expect(
      buildExtensionCloudMessageMetadata({
        localConversationId: 'conv-1',
        runtime: 'managed-cloud',
        errorText: 'stale',
      }),
    ).not.toHaveProperty('errorText');
  });

  it('restores the failure and its text when the chat is pulled back', async () => {
    const { projectPublicHistoryMessage } =
      await import('../src/features/cloud-bridge/conversationHistoryPull');
    expect(
      projectPublicHistoryMessage(
        cloudMessage({ error: true, errorText: 'AGI Cloud is unavailable.' }) as never,
      ),
    ).toMatchObject({ error: true, errorText: 'AGI Cloud is unavailable.' });
    expect(projectPublicHistoryMessage(cloudMessage({ error: true }) as never)).toMatchObject({
      error: true,
      errorText: catalog.spStoredReplyFailed.message,
    });
    expect(projectPublicHistoryMessage(cloudMessage({}) as never)).not.toHaveProperty('error');
  });

  it('syncs a turn again when it fails after it was saved', async () => {
    const { cloudMessageSyncFingerprint } =
      await import('../src/features/background/conversation-history');
    const answered = { role: 'assistant' as const, content: 'Partial', timestamp: 1 };
    const failed = { ...answered, error: true, errorText: 'AGI Cloud is unavailable.' };
    expect(cloudMessageSyncFingerprint(failed)).not.toBe(cloudMessageSyncFingerprint(answered));
    expect(cloudMessageSyncFingerprint({ ...failed, errorText: 'Stopped.' })).not.toBe(
      cloudMessageSyncFingerprint(failed),
    );
  });
});
