import { describe, expect, it } from 'vitest';
import pages from '../__fixtures__/cloud-history-pages.golden.json';
import {
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationResponseSchema,
} from '../conversations';

describe('native Cloud history wire fixtures', () => {
  it('matches the canonical list and detail contracts', () => {
    const list = ManagedCloudConversationListResponseSchema.parse(pages.list);
    const detail = ManagedCloudConversationResponseSchema.parse(pages.read);
    expect(list.conversations[0]?.title).toBeNull();
    expect(detail.conversation.id).toBe(list.conversations[0]?.id);
    expect(detail.messages[0]?.content).toBe('你好 🦀');
  });
});
