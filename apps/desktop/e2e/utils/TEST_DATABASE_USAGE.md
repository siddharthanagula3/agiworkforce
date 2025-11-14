# TestDatabase Usage Guide

## Overview

The `TestDatabase` class provides a real SQLite database for E2E testing, replacing the previous stub implementation. It creates an actual database with proper schema matching the main application and seeds it with test data.

## Features

- **Real SQLite Database**: Uses `better-sqlite3` for synchronous, high-performance database operations
- **Application Schema**: Implements the exact same schema as the main application
- **Automatic Initialization**: Creates tables, indexes, and seeds test data on startup
- **Type-Safe**: Fully typed TypeScript implementation
- **Error Handling**: Comprehensive error handling with detailed error messages
- **Cleanup**: Automatic database connection closing and file cleanup
- **Transaction Support**: Uses `better-sqlite3`'s prepared statements for safety

## Installation

The `better-sqlite3` package is already installed as a dev dependency:

```bash
pnpm add --filter @agiworkforce/desktop --save-dev better-sqlite3 @types/better-sqlite3
```

## Quick Start

### Using via Fixtures (Recommended)

```typescript
import { test, expect } from './fixtures';

test('should work with database', async ({ testDb, page }) => {
  // Database is automatically initialized and ready to use

  // Get initial conversations
  const conversations = await testDb.getConversations();
  expect(conversations.length).toBeGreaterThan(0);

  // Insert new conversation
  const convId = await testDb.insertConversation({
    title: 'New Test Conversation',
  });

  // Insert messages
  const msgId = await testDb.insertMessage({
    conversation_id: convId,
    role: 'user',
    content: 'Hello test!',
  });

  // Verify data
  const messages = await testDb.getMessages(convId);
  expect(messages.length).toBe(1);
  expect(messages[0].content).toBe('Hello test!');

  // Clear all data for test isolation
  await testDb.clearAll();

  // Database is automatically cleaned up after test
});
```

### Direct Usage (if not using fixtures)

```typescript
import { TestDatabase } from '../utils/test-database';

async function setupTest() {
  const db = new TestDatabase();

  try {
    // Initialize database
    await db.initialize();

    // Use database
    const conversations = await db.getConversations();

    // Your test code here
  } finally {
    // Always cleanup
    await db.cleanup();
  }
}
```

## Available Methods

### Initialization

#### `initialize(): Promise<void>`

Creates the database, schema, and seeds with test data.

```typescript
const db = new TestDatabase();
await db.initialize(); // Creates .test-data/test.db
```

#### `cleanup(): Promise<void>`

Closes the database connection and removes test files.

```typescript
await db.cleanup();
```

### Data Insertion

#### `insertConversation(conversation): Promise<number>`

Insert a new conversation.

```typescript
const convId = await testDb.insertConversation({
  title: 'My Test Conversation',
  created_at: '2025-01-15T10:30:00Z', // Optional
  updated_at: '2025-01-15T10:30:00Z', // Optional
});
// Returns: 3 (the new conversation ID)
```

#### `insertMessage(message): Promise<number>`

Insert a message into a conversation.

```typescript
const msgId = await testDb.insertMessage({
  conversation_id: 1,
  role: 'user', // 'user' | 'assistant' | 'system'
  content: 'What is AGI?',
  tokens: 4, // Optional
  cost: 0.0001, // Optional
  provider: 'openai', // Optional
  model: 'gpt-4', // Optional
});
// Returns: 5 (the new message ID)
```

#### `insertGoal(goal): Promise<number>`

Insert a goal (stored as automation history).

```typescript
const goalId = await testDb.insertGoal({
  description: 'Automate email processing',
  status: 'Pending', // or 'InProgress', 'Completed'
  task_type: 'browser_automation', // Optional
});
// Returns: 2 (the new goal ID)
```

### Data Querying

#### `getConversations(): Promise<Conversation[]>`

Get all conversations ordered by creation date.

```typescript
const conversations = await testDb.getConversations();
// Returns: [
//   { id: 1, title: 'Test Conversation 1', created_at: '...' },
//   { id: 2, title: 'Test Conversation 2', created_at: '...' }
// ]
```

#### `getMessages(conversationId): Promise<Message[]>`

Get all messages in a conversation.

```typescript
const messages = await testDb.getMessages(1);
// Returns: [
//   { id: 1, conversation_id: 1, role: 'user', content: 'Hello', created_at: '...' },
//   { id: 2, conversation_id: 1, role: 'assistant', content: 'Hi there!', created_at: '...' }
// ]
```

#### `getSetting(key): Promise<string | null>`

Get a setting by key.

```typescript
const theme = await testDb.getSetting('theme');
// Returns: 'dark' or null if not found
```

### Data Cleanup

#### `clearAll(): Promise<void>`

Delete all data from all tables (useful for test isolation).

```typescript
await testDb.clearAll();
```

## Initial Test Data

When initialized, the database is seeded with:

### Conversations

- 'Test Conversation 1'
- 'Test Conversation 2'

### Messages

- 2 messages in each conversation (user + assistant)
- With realistic tokens and cost data

### Settings

- `theme: 'dark'`
- `language: 'en'`
- `autonomousMode: 'false'`
- `autoApproval: 'false'`
- Provider settings for OpenAI and Ollama

### Automation History

- 3 sample automation tasks (Windows, Browser, File)

## Database Schema

The database includes these tables:

| Table                | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `conversations`      | Chat sessions                            |
| `messages`           | Messages within conversations            |
| `settings`           | Application settings (key-value)         |
| `automation_history` | Task execution history                   |
| `overlay_events`     | UI overlay events (clicks, typing, etc.) |
| `captures`           | Screen captures with OCR data            |
| `calendar_accounts`  | Calendar provider integrations           |

## Error Handling

All methods include error handling with descriptive messages:

```typescript
try {
  await testDb.insertConversation({ title: 'Test' });
} catch (error) {
  console.error('Database error:', error.message);
  // Error example: "Database not initialized"
  // Error example: "Failed to insert conversation: UNIQUE constraint failed"
}
```

## Best Practices

### 1. Always Use Try-Finally for Cleanup

```typescript
const db = new TestDatabase();
try {
  await db.initialize();
  // Use database
} finally {
  await db.cleanup();
}
```

### 2. Use Fixtures for Automatic Cleanup

```typescript
import { test } from './fixtures';

test('my test', async ({ testDb }) => {
  // Database is auto-initialized and cleaned up
});
```

### 3. Isolate Tests with clearAll()

```typescript
test('should isolate data', async ({ testDb }) => {
  await testDb.clearAll(); // Clear seeded data

  // Now test with only your data
  const convId = await testDb.insertConversation({ title: 'Test' });
  // ...
});
```

### 4. Use Descriptive Titles

```typescript
await testDb.insertConversation({
  title: 'Regression: Chat interface performance test',
});
```

### 5. Verify Data Before Assertions

```typescript
const conversations = await testDb.getConversations();
expect(conversations).toHaveLength(3); // 2 seeded + 1 added
```

## Performance Notes

- `better-sqlite3` uses synchronous operations for simplicity
- Database uses WAL (Write-Ahead Logging) for better concurrency
- Indexes are created for frequently queried columns
- Foreign key constraints are enabled for data integrity

## Location

- **File**: `apps/desktop/e2e/utils/test-database.ts`
- **Test Data**: `apps/desktop/e2e/.test-data/test.db` (created at runtime)
- **Fixtures**: `apps/desktop/e2e/fixtures/index.ts`

## Integration with Existing Tests

To use the TestDatabase in existing tests:

```typescript
// FROM:
import { test, expect } from '@playwright/test';

// TO:
import { test, expect } from './fixtures';

// Then use testDb fixture:
test('my test', async ({ testDb, page }) => {
  // ...
});
```

## Troubleshooting

### Database already exists

The implementation automatically removes old test databases on initialization. You can manually clean with:

```bash
rm -rf apps/desktop/e2e/.test-data
```

### Foreign key constraint error

This happens when deleting a parent record with child records. Use `clearAll()` to clear all tables in the correct order:

```typescript
await testDb.clearAll();
```

### Database locked

If you see "database is locked", ensure you're calling `cleanup()`:

```typescript
await db.cleanup();
```

## See Also

- [Fixtures Guide](./fixtures/index.ts)
- [Test Utilities Summary](../../UTILITY_ISSUES_SUMMARY.md)
- [Main Application Database](../../src-tauri/src/db/migrations.rs)
