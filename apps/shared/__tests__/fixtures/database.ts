/**
 * Shared Test Database Utilities
 * Provides isolated Neon test schemas for integration testing
 * Each test gets a unique schema to prevent data collision
 */

import { neon } from '@neondatabase/serverless';

const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!NEON_DATABASE_URL) {
  throw new Error('NEON_DATABASE_URL or DATABASE_URL not set in environment');
}

interface TestDatabase {
  query: (sql: string, params?: any[]) => Promise<any[]>;
  cleanup: () => Promise<void>;
  schemaName: string;
}

/**
 * Create an isolated test database schema
 * Each test gets a unique schema name to prevent data collision
 * @param testName - Base name for the schema (sanitized)
 * @param options - { isolated: true/false } - if true, schema is unique per test
 */
export async function createTestDatabase(
  testName: string,
  options?: { isolated: boolean },
): Promise<TestDatabase> {
  const isolated = options?.isolated !== false;
  const sanitized = testName.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const schemaName = isolated
    ? `test_schema_${sanitized}_${Date.now()}_${Math.random().toString(36).substring(7)}`
    : `test_schema_${sanitized}`;

  const client = neon(NEON_DATABASE_URL as string);

  try {
    // Create isolated schema if it doesn't exist
    await client(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

    // Set search_path to test schema for all queries
    return {
      query: async (sql: string, params: any[] = []) => {
        try {
          const result = await client(`SET search_path TO ${schemaName}; ${sql}`, params);
          return Array.isArray(result) ? result : [result];
        } catch (err) {
          console.error(`Query failed in schema ${schemaName}:`, err);
          throw err;
        }
      },
      cleanup: async () => {
        try {
          await client(`DROP SCHEMA ${schemaName} CASCADE`);
        } catch (err) {
          // Schema may already be dropped or not exist - safe to ignore
          console.debug(`Schema cleanup warning for ${schemaName}:`, err);
        }
      },
      schemaName,
    };
  } catch (err) {
    console.error('Failed to create test database:', err);
    throw err;
  }
}

/**
 * Seed a test user
 * @param db - Test database instance
 * @param overrides - Optional email, name overrides
 */
export async function seedTestUser(
  db: TestDatabase,
  overrides?: { email?: string; name?: string },
) {
  const email = overrides?.email || `test-${Date.now()}@example.com`;
  const name = overrides?.name || 'Test User';

  try {
    const result = await db.query(
      `INSERT INTO users (email, name, created_at) VALUES ($1, $2, NOW()) RETURNING *`,
      [email, name],
    );
    return result[0];
  } catch (err) {
    console.error('Failed to seed test user:', err);
    throw err;
  }
}

/**
 * Create a test chat
 * @param db - Test database instance
 * @param userId - User ID that owns the chat
 * @param overrides - Optional mode, title overrides
 */
export async function createTestChat(
  db: TestDatabase,
  userId: string,
  overrides?: { mode?: string; title?: string },
) {
  const mode = overrides?.mode || 'local_only';
  const title = overrides?.title || `Test Chat ${Date.now()}`;

  try {
    const result = await db.query(
      `INSERT INTO chats (user_id, mode, title, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [userId, mode, title],
    );
    return result[0];
  } catch (err) {
    console.error('Failed to create test chat:', err);
    throw err;
  }
}

/**
 * Seed a test message
 * @param db - Test database instance
 * @param chatId - Chat ID to associate with
 * @param overrides - Optional role, content, createdAt overrides
 */
export async function seedTestMessage(
  db: TestDatabase,
  chatId: string,
  overrides?: { role?: string; content?: string; createdAt?: Date },
) {
  const role = overrides?.role || 'user';
  const content = overrides?.content || 'Test message';
  const createdAt = overrides?.createdAt || new Date();

  try {
    const result = await db.query(
      `INSERT INTO messages (chat_id, role, content, created_at) VALUES ($1, $2, $3, $4) RETURNING *`,
      [chatId, role, content, createdAt],
    );
    return result[0];
  } catch (err) {
    console.error('Failed to seed test message:', err);
    throw err;
  }
}

/**
 * Clean up test data (keeps schema, clears tables)
 * Use for afterEach() cleanup
 */
export async function cleanupTestData(db: TestDatabase, tables: string[] = []) {
  if (tables.length === 0) {
    // Safe cleanup - messages and chats only
    tables = ['messages', 'chats'];
  }

  for (const table of tables) {
    try {
      await db.query(`DELETE FROM ${table}`);
    } catch (err) {
      // Table may not exist - safe to ignore
      console.debug(`Cleanup warning for table ${table}:`, err);
    }
  }
}
