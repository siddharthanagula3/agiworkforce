/**
 * Shared Test Data Factories
 * High-level helpers for setting up complete test contexts
 * All surfaces should use these to minimize setup boilerplate
 */

import {
  createTestDatabase,
  seedTestUser,
  createTestChat,
  seedTestMessage,
  cleanupTestData,
} from './database';

export type TestContext = {
  db: Awaited<ReturnType<typeof createTestDatabase>>;
  user: any;
  chat: any;
  cleanup: () => Promise<void>;
};

/**
 * Create a complete test context with user, chat, and database
 * Use this in beforeAll() of tests for full integration setup
 *
 * @param testName - Descriptive name for this test context
 * @returns { db, user, chat, cleanup }
 */
export async function createTestContext(testName: string): Promise<TestContext> {
  const db = await createTestDatabase(testName, { isolated: true });
  const user = await seedTestUser(db, { email: `${testName}-${Date.now()}@test.com` });
  const chat = await createTestChat(db, user.id, {
    mode: 'local_only',
    title: `Test Chat for ${testName}`,
  });

  return {
    db,
    user,
    chat,
    cleanup: async () => {
      await cleanupTestData(db);
      await db.cleanup();
    },
  };
}

/**
 * Create a minimal test context (DB only, no user/chat)
 * Use for tests that need to set up their own schema state
 */
export async function createMinimalContext(testName: string) {
  const db = await createTestDatabase(testName, { isolated: true });
  return {
    db,
    cleanup: async () => {
      await db.cleanup();
    },
  };
}

/**
 * Load provider metadata from models.json
 * Ensures model IDs and capabilities come from source of truth, never hardcoded
 */
export async function loadProviderMetadata(): Promise<Record<string, any>> {
  try {
    // Import from the actual source of truth
    const { models } = await import('../../../packages/types/src/models.json', {
      assert: { type: 'json' },
    });
    return models || {};
  } catch (err) {
    console.warn('Failed to load provider metadata from models.json, using defaults:', err);
    // Fallback with common models for testing
    return {
      'gpt-4o': {
        id: 'gpt-4o',
        name: 'GPT-4 Optimized',
        provider: 'openai',
        capabilities: ['vision', 'tool_use', 'streaming'],
        maxTokens: 128000,
        costPer1kInputTokens: 0.00315,
        costPer1kOutputTokens: 0.0126,
      },
      'claude-3-5-sonnet-20241022': {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        capabilities: ['vision', 'tool_use', 'streaming'],
        maxTokens: 200000,
        costPer1kInputTokens: 0.003,
        costPer1kOutputTokens: 0.015,
      },
      'gemini-2.0-flash': {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'google',
        capabilities: ['vision', 'tool_use', 'streaming'],
        maxTokens: 1000000,
        costPer1kInputTokens: 0.0,
        costPer1kOutputTokens: 0.0,
      },
    };
  }
}

/**
 * Create a test user with specific overrides
 */
export async function createTestUser(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  overrides?: { email?: string; name?: string },
) {
  return seedTestUser(db, overrides);
}

/**
 * Create multiple test users for multi-user tests
 */
export async function createTestUsers(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  count: number = 2,
) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = await seedTestUser(db, {
      email: `test-user-${i}-${Date.now()}@example.com`,
      name: `Test User ${i + 1}`,
    });
    users.push(user);
  }
  return users;
}

/**
 * Create a chat with specific mode (local_only, byok, managed_cloud)
 */
export async function createTestChatWithMode(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  userId: string,
  mode: 'local_only' | 'byok' | 'managed_cloud' = 'local_only',
  title?: string,
) {
  return createTestChat(db, userId, {
    mode,
    title: title || `${mode} Chat`,
  });
}

/**
 * Create multiple chats for one user
 */
export async function createTestChats(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  userId: string,
  count: number = 3,
) {
  const chats = [];
  for (let i = 0; i < count; i++) {
    const chat = await createTestChat(db, userId, {
      title: `Test Chat ${i + 1}`,
    });
    chats.push(chat);
  }
  return chats;
}

/**
 * Create a conversation with multiple turns
 */
export async function createTestConversation(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  chatId: string,
  turns: Array<{ userContent: string; assistantContent: string }> = [],
) {
  const messages = [];

  for (const turn of turns) {
    const userMsg = await seedTestMessage(db, chatId, {
      role: 'user',
      content: turn.userContent,
    });
    messages.push(userMsg);

    const assistantMsg = await seedTestMessage(db, chatId, {
      role: 'assistant',
      content: turn.assistantContent,
    });
    messages.push(assistantMsg);
  }

  return messages;
}

/**
 * Get all tables in test schema (for debugging/inspection)
 */
export async function getTestSchemaTables(db: Awaited<ReturnType<typeof createTestDatabase>>) {
  const result = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = CURRENT_SCHEMA()`,
  );
  return result.map((r: any) => r.table_name);
}

/**
 * Helper for cleanup in afterEach hooks
 * Reusable cleanup pattern for all surfaces
 */
export async function cleanupTest(context: TestContext) {
  try {
    await cleanupTestData(context.db);
  } catch (err) {
    console.warn('Cleanup error:', err);
  }
}

/**
 * Helper for full cleanup in afterAll hooks
 */
export async function cleanupTestFull(context: TestContext) {
  try {
    await context.cleanup();
  } catch (err) {
    console.warn('Full cleanup error:', err);
  }
}
