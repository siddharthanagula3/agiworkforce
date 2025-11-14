# Test Utilities - Issues & Fixes Summary

## Quick Overview

| Utility          | Grade | Status           | Usage   | Main Issue                           |
| ---------------- | ----- | ---------------- | ------- | ------------------------------------ |
| MockLLMProvider  | C-    | ✗ Broken         | Partial | TypeScript error + no error handling |
| TestDatabase     | F     | ✗ Non-functional | None    | No SQLite, stub methods only         |
| ScreenshotHelper | B-    | ✓ Mostly Works   | Good    | compareVisual() unimplemented        |
| WaitHelper       | B+    | ✓ Works          | Good    | Silent error catching                |

---

## Critical Issues That Block Testing

### 1. MockLLMProvider TypeScript Error (BLOCKS COMPILATION)

**Location:** `apps/desktop/e2e/utils/mock-llm-provider.ts:124`

**Error:**

```
Type 'MapIterator<[string, string]>' can only be iterated through when using
the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.
```

**Problem Code:**

```typescript
for (const [pattern, response] of this.mockResponses.entries()) {
```

**Fixes:**

**Option A (Recommended):** Update tsconfig.json

```json
{
  "compilerOptions": {
    "downlevelIteration": true
  }
}
```

**Option B:** Rewrite the loop

```typescript
this.mockResponses.forEach((response, pattern) => {
  const regex = new RegExp(pattern, 'i');
  if (regex.test(prompt)) {
    return response;
  }
});
```

---

### 2. TestDatabase Not Implemented (BLOCKS TESTING)

**Location:** `apps/desktop/e2e/utils/test-database.ts`

**Problems:**

- No SQLite database connection
- `seedDatabase()` only creates JSON file, never touches database
- All data methods are stubs (insertConversation, insertGoal, clearAll)
- Never used in any test files

**What's Actually Happening:**

```typescript
// Line 89-90: Only creates JSON file
const seedFilePath = path.join(path.dirname(this.dbPath), 'seed-data.json');
fs.writeFileSync(seedFilePath, JSON.stringify(seedData, null, 2));

// Lines 105-108: Stub method
async insertConversation(conversation: any) {
  console.log('[TestDB] Inserting conversation:', conversation.id);
  // DOES NOTHING
}
```

**Impact:** Any test using this utility will have empty database

**Fix Required:**

1. Install SQLite package: `npm install --save-dev better-sqlite3 @types/better-sqlite3`
2. Implement actual database initialization
3. Create proper schema
4. Implement data insertion methods

**Minimal Implementation:**

```typescript
import Database from 'better-sqlite3';

export class TestDatabase {
  private db: Database.Database | null = null;
  private dbPath: string;

  async initialize() {
    try {
      this.dbPath = path.join(process.cwd(), 'e2e', '.test-data', 'test.db');
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.dbPath)) {
        fs.unlinkSync(this.dbPath);
      }

      this.db = new Database(this.dbPath);
      this.createSchema();
      this.seedDatabase();
    } catch (error) {
      throw new Error(`TestDatabase.initialize() failed: ${error.message}`);
    }
  }

  private createSchema() {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        description TEXT,
        status TEXT,
        created_at INTEGER
      );
    `);
  }

  private seedDatabase() {
    if (!this.db) throw new Error('Database not initialized');

    const seedData = {
      conversations: [{ id: 'conv-1', title: 'Test Conversation 1', created_at: Date.now() }],
      goals: [
        {
          id: 'goal-1',
          description: 'Create a React component',
          status: 'Pending',
          created_at: Date.now(),
        },
      ],
    };

    const insertConvStmt = this.db.prepare(
      'INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)',
    );

    for (const conv of seedData.conversations) {
      insertConvStmt.run(conv.id, conv.title, conv.created_at);
    }
  }

  async insertConversation(conversation: any) {
    if (!this.db) throw new Error('Database not initialized');
    try {
      const stmt = this.db.prepare(
        'INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)',
      );
      stmt.run(conversation.id, conversation.title, conversation.created_at);
    } catch (error) {
      throw new Error(`Failed to insert conversation: ${error.message}`);
    }
  }

  async cleanup() {
    try {
      this.db?.close();
      const dir = path.dirname(this.dbPath);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('[TestDB] Cleanup error:', error);
    }
  }
}
```

---

## Medium Priority Issues

### 3. MockLLMProvider: No Error Handling in setup/teardown

**Location:** `apps/desktop/e2e/utils/mock-llm-provider.ts:12-15, 112-115`

**Problem:**

```typescript
async setup() {
  // Line 14-46: No try-catch around page.route()
  // If route() fails, setup fails silently
  await this.page.route('**/api/chat/completions', (route) => {
    // ...
  });
}

async teardown() {
  // Line 113-114: No try-catch around unroute()
  await this.page.unroute('**/api/chat/completions');
  await this.page.unroute('**/api/chat/stream');
}
```

**Impact:** Test setup failures are hidden

**Fix:**

```typescript
async setup() {
  try {
    await this.page.route('**/api/chat/completions', (route) => {
      try {
        const request = route.request();
        const postData = request.postDataJSON();
        const prompt = postData?.messages?.[0]?.content || '';
        const response = this.getResponseForPrompt(prompt);

        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({...}),
        });
      } catch (error) {
        console.error('[MockLLM] Route handler error:', error);
        route.abort();
      }
    });
  } catch (error) {
    throw new Error(`MockLLMProvider setup failed: ${error.message}`);
  }
}

async teardown() {
  try {
    await this.page.unroute('**/api/chat/completions');
    await this.page.unroute('**/api/chat/stream');
  } catch (error) {
    console.warn('[MockLLM] Teardown warning:', error);
  }
}
```

---

### 4. ScreenshotHelper: compareVisual() Always Returns True

**Location:** `apps/desktop/e2e/utils/screenshot-helper.ts:38-43`

**Problem:**

```typescript
async compareVisual(baseline: string, current: string): Promise<boolean> {
  console.log(`[Visual] Comparing ${baseline} with ${current}`);
  return true;  // ALWAYS RETURNS TRUE!
}
```

**Impact:** Visual regression tests won't catch actual regressions

**Fix (Using pixelmatch):**

```typescript
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

async compareVisual(baseline: string, current: string): Promise<boolean> {
  try {
    const baselineBuffer = fs.readFileSync(baseline);
    const currentBuffer = fs.readFileSync(current);

    const img1 = PNG.sync.read(baselineBuffer);
    const img2 = PNG.sync.read(currentBuffer);

    if (img1.width !== img2.width || img1.height !== img2.height) {
      console.log('[Visual] Image dimensions differ');
      return false;
    }

    const diff = pixelmatch(
      img1.data, img2.data,
      img1.width, img1.height,
      { threshold: 0.1 }
    );

    const totalPixels = img1.width * img1.height;
    const threshold = totalPixels * 0.01; // 1% tolerance

    return diff < threshold;
  } catch (error) {
    console.error('[Visual] Comparison failed:', error);
    return false;
  }
}
```

Add dependencies:

```bash
npm install --save-dev pixelmatch pngjs @types/pngjs
```

---

### 5. ScreenshotHelper: Unsafe cleanup()

**Location:** `apps/desktop/e2e/utils/screenshot-helper.ts:68-85`

**Problem:**

```typescript
async cleanup() {
  const files = fs.readdirSync(this.screenshotsDir);  // No error handling
  const screenshots = files
    .filter((f) => f.endsWith('.png'))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(this.screenshotsDir, f)).mtime.getTime(),  // Can throw
    }));

  if (screenshots.length > 100) {
    const toDelete = screenshots.slice(100);
    for (const screenshot of toDelete) {
      fs.unlinkSync(path.join(this.screenshotsDir, screenshot.name));  // No error handling
    }
  }
}
```

**Fix:**

```typescript
async cleanup() {
  try {
    if (!fs.existsSync(this.screenshotsDir)) {
      return;
    }

    const files = fs.readdirSync(this.screenshotsDir);
    const screenshots = files
      .filter((f) => f.endsWith('.png'))
      .map((f) => {
        try {
          return {
            name: f,
            time: fs.statSync(path.join(this.screenshotsDir, f)).mtime.getTime(),
          };
        } catch (error) {
          console.warn(`Failed to stat file ${f}:`, error);
          return null;
        };
      })
      .filter((s) => s !== null);

    if (screenshots.length > 100) {
      const toDelete = screenshots.slice(100);
      for (const screenshot of toDelete) {
        try {
          fs.unlinkSync(path.join(this.screenshotsDir, screenshot.name));
        } catch (error) {
          console.warn(`Failed to delete screenshot:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[Screenshot] Cleanup failed:', error);
  }
}
```

---

### 6. WaitHelper: Silent Error Catching

**Locations:**

- Line 52-60: `waitForLLMResponse()`
- Line 88-93: `waitForAutomationAction()`

**Problem:**

```typescript
async waitForLLMResponse(timeout: number = 30000) {
  const streamingIndicator = this.page.locator('[data-streaming="true"], .streaming').first();

  try {
    await streamingIndicator.waitFor({ state: 'visible', timeout: 5000 });
    await streamingIndicator.waitFor({ state: 'hidden', timeout });
  } catch {  // SILENT CATCH - no logging!
    // Silently falls back without info
    await this.page.locator('[data-role="assistant"]').last().waitFor({ timeout });
  }
}
```

**Impact:** Tests fail mysteriously without clear error messages

**Fix:**

```typescript
async waitForLLMResponse(timeout: number = 30000) {
  const streamingIndicator = this.page.locator('[data-streaming="true"], .streaming').first();

  try {
    // Try to wait for streaming
    console.log('[Wait] Waiting for streaming indicator...');
    await streamingIndicator.waitFor({ state: 'visible', timeout: 5000 });
    console.log('[Wait] Streaming started, waiting for completion...');
    await streamingIndicator.waitFor({ state: 'hidden', timeout });
    console.log('[Wait] Streaming completed');
    return;
  } catch (error) {
    console.log('[Wait] No streaming indicator found, trying direct response');
  }

  try {
    // Fallback: wait for response message
    await this.page.locator('[data-role="assistant"]').last().waitFor({ timeout });
    console.log('[Wait] Response message received');
  } catch (error) {
    throw new Error(`LLM response not received within ${timeout}ms. Last error: ${error.message}`);
  }
}
```

---

## Low Priority Issues

### 7. TestDatabase: Unsafe cleanup() with rmdirSync

**Location:** `apps/desktop/e2e/utils/test-database.ts:93-103`

**Problem:**

```typescript
async cleanup() {
  const dir = path.dirname(this.dbPath);
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      fs.unlinkSync(path.join(dir, file));  // Can fail
    }
    fs.rmdirSync(dir);  // Fails if not empty
  }
}
```

**Fix:**

```typescript
async cleanup() {
  try {
    const dir = path.dirname(this.dbPath);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('[TestDB] Cleanup error:', error);
  }
}
```

---

## Fixture Usage Issues

### 8. Test Files Don't Use Custom Fixtures

**Problem:** Most test files use `@playwright/test` directly instead of custom fixtures

**Affected Files:**

- `chat.spec.ts` - Should use `mockLLM`, `waitHelper`
- `agi.spec.ts` - Should use `waitHelper`
- `automation.spec.ts` - Should use `screenshot`, `waitHelper`
- `agi-workflow.spec.ts` - Should use `testDb`, `mockLLM`, `waitHelper`
- `settings.spec.ts` - Should use `screenshot`
- `onboarding.spec.ts` - Could use `screenshot`

**Fix:** Change import at top of test files:

```typescript
// FROM:
import { test, expect } from '@playwright/test';

// TO:
import { test, expect } from './fixtures';
```

Then use fixtures in tests:

```typescript
test('should handle chat', async ({ page, waitHelper, mockLLM }) => {
  await mockLLM.setup();
  // ... test code
  await mockLLM.teardown();
});
```

---

## Implementation Checklist

### Immediate (30 minutes)

- [ ] Add `downlevelIteration: true` to tsconfig.json
- [ ] Add error handling to MockLLMProvider.setup()
- [ ] Add error handling to MockLLMProvider.teardown()

### Short Term (2-3 hours)

- [ ] Implement TestDatabase with SQLite
- [ ] Implement ScreenshotHelper.compareVisual()
- [ ] Fix ScreenshotHelper.cleanup() error handling
- [ ] Improve WaitHelper error logging

### Medium Term (1-2 days)

- [ ] Update test files to use custom fixtures
- [ ] Add missing dependency: `better-sqlite3`
- [ ] Add optional dependency: `pixelmatch`

### Nice to Have

- [ ] Add TypeScript strict types (replace `any`)
- [ ] Add JSDoc documentation
- [ ] Add unit tests for utilities

---

## File Locations for Reference

```
apps/desktop/e2e/utils/
├── mock-llm-provider.ts    (151 lines) - Grade: C-
├── screenshot-helper.ts     (86 lines) - Grade: B-
├── test-database.ts        (119 lines) - Grade: F
├── wait-helper.ts          (122 lines) - Grade: B+
└── [Total: 478 lines]

apps/desktop/e2e/
├── fixtures/index.ts       (82 lines) - Uses all 4 utilities
├── chat.spec.ts           (242 lines) - Should use fixtures
├── agi.spec.ts            (170+ lines) - Should use fixtures
├── visual-regression.spec.ts (162 lines) - Good fixture usage
└── ... more spec files
```

---

## Reference: Original Issues Found

### Compilation Errors (1 total)

1. TS2802 in mock-llm-provider.ts:124 - MapIterator iteration

### Runtime Errors (2 high, 6 medium, 2 low)

- High: TestDatabase (non-functional), MockLLMProvider (no error handling)
- Medium: ScreenshotHelper (unsafe cleanup, unimplemented compare), WaitHelper (silent errors)
- Low: Unreachable code, path fragility

### Design Issues (2 total)

- TestDatabase not used in any tests
- Most test files don't use custom fixtures

### Missing Implementations (2 total)

- TestDatabase: Complete SQLite integration
- ScreenshotHelper: Visual comparison logic

---

**Last Updated:** 2025-11-14
**Priority:** HIGH - Compilation blocks testing
**Estimated Fix Time:** 2-4 hours for critical issues
