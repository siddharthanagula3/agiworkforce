import { describe, expect, it } from 'vitest';
import {
  MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH,
  MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
  MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH,
  ManagedCloudChatMessageLimitsWireSchema,
  managedCloudChatLatestMessageMaxChars,
  managedCloudChatMessageLimitsWire,
} from '../conversations';

describe('managed chat message limits', () => {
  it('lets the newest message of a completion turn reach the stored message cap', () => {
    expect(MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH).toBe(
      MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH,
    );
    expect(MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH).toBeGreaterThan(
      MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
    );
  });

  it('announces the raised cap in a shape the schema accepts', () => {
    const wire = managedCloudChatMessageLimitsWire();
    expect(ManagedCloudChatMessageLimitsWireSchema.parse(wire)).toStrictEqual({
      latest_message_max_chars: MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH,
    });
    expect(managedCloudChatLatestMessageMaxChars(wire)).toBe(
      MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH,
    );
  });

  it('keeps the old cap when a server announces nothing', () => {
    expect(managedCloudChatLatestMessageMaxChars(undefined)).toBe(
      MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
    );
    expect(managedCloudChatLatestMessageMaxChars(null)).toBe(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH);
  });

  it('never goes past what this build can store', () => {
    expect(
      managedCloudChatLatestMessageMaxChars({
        latest_message_max_chars: MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH * 2,
      }),
    ).toBe(MANAGED_CLOUD_CHAT_MAX_LATEST_MESSAGE_LENGTH);
  });

  it('refuses a malformed announcement', () => {
    expect(
      ManagedCloudChatMessageLimitsWireSchema.safeParse({ latest_message_max_chars: 0 }).success,
    ).toBe(false);
    expect(ManagedCloudChatMessageLimitsWireSchema.safeParse({}).success).toBe(false);
  });
});
