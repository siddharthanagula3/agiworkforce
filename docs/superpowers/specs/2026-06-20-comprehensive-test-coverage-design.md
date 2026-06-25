# Comprehensive Test Coverage Design for All 6 Applications

**Date:** 2026-06-20  
**Status:** Design  
**Owner:** Platform lead + surface engineers  
**Timeline:** Aggressive (complete week of 2026-06-20)  
**Approach:** Parallel-by-priority with integration-focused real services

---

## Executive Summary

This design creates **270-340 new production-ready tests** across 6 applications (CLI, Desktop, Web, Mobile, Chrome Extension, VS Code Extension) using **parallel-by-priority execution**. Tests are **integration-focused** (real database, real services, minimal mocks) to catch bugs that mock-heavy tests miss. Tests validate **security boundaries** (Local/BYOK/Managed Cloud), **architectural integrity** (no cross-app imports), and **deployment safety** (backward compatibility, migration support).

**Key Commitments:**

- ✅ All 6 applications tested simultaneously
- ✅ Security as Priority Level 1 (trust boundaries, auth, provider routing)
- ✅ Production-grade (no fake tests, no stubs in critical paths)
- ✅ Real database (Neon test schema), real services, mocked only external APIs
- ✅ Aggressive timeline (Priority Levels 1-2 by end of week, Levels 3-4 following week)

---

## Part 1: Priority Levels & Test Distribution

### **Priority Level 1: Core Features + Security (Week 1, Days 1-3)**

**Scope:** Message handling, chat flows, error states, trust boundaries, auth  
**Approach:** Integration tests with real DB, real auth service, real provider router  
**Test Count Target:** 140 new tests

| App              | Message Handling | Error States | Chat Flows | Security | Subtotal |
| ---------------- | ---------------- | ------------ | ---------- | -------- | -------- |
| CLI              | 8                | 6            | 5          | 4        | **23**   |
| Desktop          | 18               | 16           | 12         | 10       | **56**   |
| Web              | 20               | 18           | 14         | 12       | **64**   |
| Mobile           | 15               | 12           | 10         | 8        | **45**   |
| Extension        | 6                | 5            | 4          | 3        | **18**   |
| Extension-VSCode | 5                | 4            | 3          | 3        | **15**   |
| **TOTAL**        | **72**           | **61**       | **48**     | **40**   | **140**  |

**Priority Level 1 Test Categories:**

1. **Message Handling** (72 tests)
   - Text messages, tool calls, artifacts, thinking blocks
   - Streaming partial messages, cancellation, retry
   - Multi-turn conversations, context management
   - Message validation, format compliance

2. **Error States** (61 tests)
   - Network failures (timeout, disconnect, rate limit)
   - Auth expiry (token refresh, session invalidation)
   - Provider failures (API errors, unavailable model)
   - Malformed inputs (invalid JSON, missing fields)
   - Recovery flows (automatic retry, manual retry, graceful degradation)

3. **Chat Flows** (48 tests)
   - User composes → sends → receives response (happy path)
   - Multi-message conversation with tool calls
   - Abort/cancel mid-generation
   - Switch models mid-conversation
   - Chat history loading and pagination

4. **Security/Trust Boundaries** (40 tests)
   - Local chat cannot silently route to BYOK
   - BYOK to Managed Cloud requires explicit fork with secret scan
   - User data isolation (own chats only, org data walls)
   - Provider metadata used (no hardcoded model IDs)
   - Auth token validated on every request

---

### **Priority Level 2: Architecture + Streaming (Week 1, Days 3-5)**

**Scope:** Streaming/real-time, provider routing, auth/authz, boundary enforcement  
**Test Count Target:** 85 new tests

| App              | Streaming | Provider Routing | Auth/Authz | Architecture | Subtotal |
| ---------------- | --------- | ---------------- | ---------- | ------------ | -------- |
| CLI              | 4         | 6                | 5          | 6            | **21**   |
| Desktop          | 10        | 12               | 10         | 10           | **42**   |
| Web              | 12        | 14               | 12         | 10           | **48**   |
| Mobile           | 6         | 8                | 6          | 4            | **24**   |
| Extension        | 2         | 3                | 3          | 2            | **10**   |
| Extension-VSCode | 2         | 3                | 3          | 2            | **10**   |
| **TOTAL**        | **36**    | **46**           | **39**     | **34**       | **155**  |

**Priority Level 2 Test Categories:**

1. **Streaming & Real-time** (36 tests)
   - WebSocket connections, heartbeat/ping-pong
   - Partial message arrival (chunked responses)
   - Cancellation during stream, graceful close
   - Reconnection after network loss
   - Token/cost tracking during streaming

2. **Provider Routing & Fallback** (46 tests)
   - Model selection from metadata (not hardcoded)
   - Provider unavailable → fallback to next provider
   - Cost estimation before routing
   - Multi-provider routing logic
   - OpenAI vs Anthropic vs Gemini request/response format translation

3. **Auth & Authorization** (39 tests)
   - Token expiry triggers re-auth
   - Permission checks (can user access this chat?)
   - Org/tenant isolation (can't cross-access)
   - API key rotation (old key no longer works)
   - Session revocation (sign out everywhere)

4. **Architectural Boundaries** (34 tests)
   - No cross-app imports (pnpm check:boundaries)
   - API contract validation (Desktop↔Extension messaging format)
   - Feature flag gating (new feature visible only to enabled users)
   - Backward compatibility (v1 client works with v2 server)

---

### **Priority Level 3: IPC/Bridge + State (Following Week, Days 1-2)**

**Scope:** IPC communication, state management, tool execution, native messaging  
**Test Count Target:** 70 new tests

| App              | IPC/Bridge | State Management | Tool Execution | Native Messaging | Subtotal |
| ---------------- | ---------- | ---------------- | -------------- | ---------------- | -------- |
| CLI              | 5          | 6                | 8              | 0                | **19**   |
| Desktop          | 8          | 10               | 12             | 6                | **36**   |
| Web              | 6          | 8                | 4              | 0                | **18**   |
| Mobile           | 4          | 6                | 2              | 0                | **12**   |
| Extension        | 2          | 3                | 0              | 8                | **13**   |
| Extension-VSCode | 2          | 3                | 0              | 0                | **5**    |
| **TOTAL**        | **27**     | **36**           | **26**         | **14**           | **103**  |

---

### **Priority Level 4: Advanced Features (Following Week, Days 3-5)**

**Scope:** Artifacts, performance, settings, feature parity  
**Test Count Target:** 75 new tests

| App              | Artifacts/Files | Performance | Settings | Parity | Subtotal |
| ---------------- | --------------- | ----------- | -------- | ------ | -------- |
| CLI              | 2               | 4           | 4        | 2      | **12**   |
| Desktop          | 12              | 10          | 8        | 6      | **36**   |
| Web              | 14              | 12          | 10       | 6      | **42**   |
| Mobile           | 8               | 6           | 6        | 4      | **24**   |
| Extension        | 2               | 2           | 0        | 2      | **6**    |
| Extension-VSCode | 2               | 2           | 2        | 2      | **8**    |
| **TOTAL**        | **40**          | **36**      | **30**   | **22** | **128**  |

---

## Part 2: Week-by-Week Timeline

### **Week of 2026-06-20 (Aggressive Priority Levels 1-2)**

| Day          | Phase       | Focus                                                           | Apps  | Tests      |
| ------------ | ----------- | --------------------------------------------------------------- | ----- | ---------- |
| **Mon 6/20** | L1 Setup    | Create test DB, fixtures, base integration patterns             | All 6 | 0 (infra)  |
| **Tue 6/21** | L1 Security | Message handling + error states (real auth, privacy boundaries) | All 6 | ~70        |
| **Wed 6/22** | L1 Complete | Chat flows + final security tests                               | All 6 | ~70        |
| **Thu 6/23** | L2 Stream   | Streaming, provider routing, auth/authz tests                   | All 6 | ~80        |
| **Fri 6/24** | L2 Polish   | Boundary enforcement, backward compatibility, fix flakes        | All 6 | ~75        |
| **Sat 6/25** | Review      | Run full test suite, report blockers, prepare L3                | All 6 | 0 (review) |

**Week 1 Target: 315 tests (Levels 1-2 fully complete)**

### **Week of 2026-06-27 (Priority Levels 3-4)**

| Day          | Phase       | Focus                                                 | Apps                    | Tests      |
| ------------ | ----------- | ----------------------------------------------------- | ----------------------- | ---------- |
| **Mon 6/27** | L3 IPC      | IPC/bridge auth, state management, tool execution     | All 6                   | ~50        |
| **Tue 6/28** | L3 Native   | Native messaging, tool path traversal, safety tests   | Extension, Desktop, CLI | ~30        |
| **Wed 6/29** | L4 Files    | Artifact generation, file upload, error handling      | All 6                   | ~40        |
| **Thu 6/30** | L4 Perf     | Performance tests, concurrent chats, memory leaks     | All 6                   | ~35        |
| **Fri 7/01** | L4 Complete | Settings, feature parity, final validation            | All 6                   | ~25        |
| **Sat 7/02** | Coverage    | Achieve 80%+ coverage, merge all PRs, prepare release | All 6                   | 0 (review) |

**Week 2 Target: 180 tests (Levels 3-4, complete 495 total)**

---

## Part 3: Test Organization & File Structure

### **Folder Organization (Consistent Across All Apps)**

```
apps/{cli,desktop,web,mobile,extension,extension-vscode}/
  __tests__/
    priority-level-1/
      security/
        privacy-boundary.test.{ts,tsx}      # Local/BYOK/Cloud isolation
        auth-and-authz.test.{ts,tsx}        # Token, permissions, org isolation
        provider-routing.test.{ts,tsx}      # No hardcoded model IDs
        data-isolation.test.{ts,tsx}        # BOLA/IDOR prevention
      message-handling/
        text-messages.test.{ts,tsx}
        tool-calls.test.{ts,tsx}
        artifacts.test.{ts,tsx}
        thinking-blocks.test.{ts,tsx}
        streaming.test.{ts,tsx}             # Partial messages, cancellation
      error-states/
        network-failures.test.{ts,tsx}      # Timeout, disconnect, rate limit
        auth-expiry.test.{ts,tsx}           # Token refresh, session invalidation
        provider-failures.test.{ts,tsx}     # API errors, unavailable model
        malformed-input.test.{ts,tsx}       # Invalid JSON, missing fields
        recovery.test.{ts,tsx}              # Retry, graceful degradation
      chat-flows/
        single-turn.test.{ts,tsx}
        multi-turn.test.{ts,tsx}
        tool-calling.test.{ts,tsx}
        abort-cancel.test.{ts,tsx}
        model-switching.test.{ts,tsx}

    priority-level-2/
      architecture/
        boundary-checks.test.{ts,tsx}       # No cross-app imports
        contract-validation.test.{ts,tsx}   # API contract match
        migration-safety.test.{ts,tsx}      # DB rollback-safe
        feature-flags.test.{ts,tsx}         # Gradual rollout, kill switch
      streaming-and-realtime/
        websocket.test.{ts,tsx}
        partial-messages.test.{ts,tsx}
        cancellation.test.{ts,tsx}
        reconnection.test.{ts,tsx}
      provider-routing/
        metadata-driven.test.{ts,tsx}
        fallback-logic.test.{ts,tsx}
        cost-tracking.test.{ts,tsx}
      auth-and-authz/
        token-expiry.test.{ts,tsx}
        permission-checks.test.{ts,tsx}
        org-isolation.test.{ts,tsx}
        session-revocation.test.{ts,tsx}

    priority-level-3/
      state-management/
        persistence.test.{ts,tsx}
        sync.test.{ts,tsx}
        cache-invalidation.test.{ts,tsx}
      ipc-bridge/
        desktop-extension.test.{ts,tsx}
        web-mobile.test.{ts,tsx}
        api-contracts.test.{ts,tsx}
      tool-execution/
        path-traversal.test.{ts,tsx}
        shell-injection.test.{ts,tsx}
        approval-enforcement.test.{ts,tsx}
      native-messaging/
        chrome-desktop-auth.test.{ts,tsx}
        version-compatibility.test.{ts,tsx}
        downgrade-safety.test.{ts,tsx}

    priority-level-4/
      artifacts-files/
        upload.test.{ts,tsx}
        generation.test.{ts,tsx}
        display.test.{ts,tsx}
        errors.test.{ts,tsx}
      performance/
        concurrent-chats.test.{ts,tsx}
        memory-leaks.test.{ts,tsx}
        load-limits.test.{ts,tsx}
      settings/
        user-preferences.test.{ts,tsx}
        provider-settings.test.{ts,tsx}
        model-selection.test.{ts,tsx}
      feature-parity/
        desktop-web.test.{ts,tsx}
        mobile-desktop.test.{ts,tsx}
        cli-desktop.test.{ts,tsx}

  fixtures/                                 # Shared test data factories
    user.factory.ts                        # Create test users
    chat.factory.ts                        # Create test chats
    message.factory.ts                     # Create test messages
    provider-metadata.factory.ts           # Load model capabilities
```

---

## Part 4: Integration Test Patterns & Setup

### **Real Services Pattern (Not Mock-Heavy)**

```typescript
// apps/web/__tests__/priority-level-1/message-handling/text-messages.test.ts

import { describe, test, expect, beforeAll, afterEach } from 'vitest';
import { createTestDatabase, seedTestUser, createTestChat } from '../../fixtures';
import { ChatService } from '../../../lib/chat-service';
import { AuthService } from '../../../lib/auth-service';
import { ProviderRouter } from '../../../lib/provider-router';

describe('Message Handling - Text Messages', () => {
  let db, chatService, user, chat;

  beforeAll(async () => {
    // 1. Real Neon test database (test_schema)
    db = await createTestDatabase('test_schema_messages_1');

    // 2. Real auth service (test tokens)
    const authService = new AuthService(db);
    user = await seedTestUser(db, { email: 'test@example.com' });
    const token = await authService.issueTestToken(user.id, { expiresIn: '1h' });

    // 3. Real provider router (loads metadata from models.json)
    const providerRouter = new ProviderRouter();
    await providerRouter.loadModelMetadata(); // From packages/types/src/models.json

    // 4. Real chat service
    chatService = new ChatService(db, authService, providerRouter);

    // 5. Create test chat
    chat = await createTestChat(db, { userId: user.id, mode: 'local_only' });
  });

  afterEach(async () => {
    // Clean up test data (NOT the schema)
    await db.query('DELETE FROM messages WHERE chat_id = ?', [chat.id]);
  });

  test('sends text message and receives response', async () => {
    // MOCK ONLY the external API (OpenAI), NOT the chat service
    const mockOpenAI = vi.spyOn(openaiClient, 'createCompletion').mockResolvedValueOnce({
      choices: [{ message: { content: 'Response from mocked OpenAI' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });

    // Real service call
    const result = await chatService.sendMessage({
      chatId: chat.id,
      userId: user.id,
      content: 'Hello, what is 2+2?',
      model: 'gpt-4o', // From metadata, not hardcoded
    });

    // Verify
    expect(result.success).toBe(true);
    expect(result.message.content).toBe('Response from mocked OpenAI');
    expect(mockOpenAI).toHaveBeenCalledTimes(1);

    // Verify stored in DB
    const stored = await db.query(
      'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1',
      [chat.id],
    );
    expect(stored[0].content).toBe('Response from mocked OpenAI');
  });

  test('PRIVACY-BOUNDARY: rejects BYOK key in Local-only chat', async () => {
    expect(() => {
      chatService.sendMessage({
        chatId: chat.id,
        userId: user.id,
        content: 'message',
        byokApiKey: 'sk-...', // Local chat cannot use BYOK
      });
    }).toThrow(/LocalChatsCannotUseBYOK|LocalToByokForkRequired/);
  });
});
```

### **Test Database Setup (Neon)**

```typescript
// apps/web/__tests__/fixtures/database.ts

import { neon } from '@neondatabase/serverless';

export async function createTestDatabase(schemaName) {
  const db = neon(process.env.DATABASE_URL);

  // Create isolated test schema
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);

  // Run migrations into test schema
  const migrations = await loadMigrations('apps/web/db/neon');
  for (const migration of migrations) {
    await db.query(`SET search_path TO ${schemaName}; ${migration.sql}`);
  }

  return {
    query: (sql, params) => db(sql, params, { schema: schemaName }),
    cleanup: () => db.query(`DROP SCHEMA ${schemaName} CASCADE`),
  };
}

export async function seedTestUser(db, { email, name }) {
  const result = await db.query(`INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *`, [
    email,
    name || 'Test User',
  ]);
  return result[0];
}

export async function createTestChat(db, { userId, mode = 'local_only' }) {
  const result = await db.query(`INSERT INTO chats (user_id, mode) VALUES ($1, $2) RETURNING *`, [
    userId,
    mode,
  ]);
  return result[0];
}
```

### **External API Mocking Strategy**

```typescript
// Apps should mock ONLY external APIs:
// ✅ Mock: OpenAI, Anthropic, Gemini API calls (external)
// ✅ Mock: Stripe webhook calls (external)
// ✅ Mock: Image generation services (external)
// ✅ Mock: Web search results (external)
// ❌ Don't mock: Chat service, auth service, DB, provider router
// ❌ Don't mock: Message validation, tool parsing, streaming logic

// apps/web/__tests__/fixtures/mocks.ts

import { vi } from 'vitest';

export function mockOpenAIClient() {
  return vi.mock('@openai/sdk', () => ({
    default: class OpenAI {
      chat = { completions: { create: vi.fn() } };
      images = { generate: vi.fn() };
    },
  }));
}

export function mockStripeWebhook() {
  return vi.mock('stripe', () => ({
    default: class Stripe {
      webhooks = { constructEvent: vi.fn() };
    },
  }));
}

export function setupDefaultMocks() {
  // Each test file calls this in beforeEach()
  vi.clearAllMocks();
}
```

---

## Part 5: Security Test Checklist (Required Per App)

Every priority-level-1 security test must verify:

- ✅ **Privacy Boundaries**: Local/BYOK/Cloud isolation, no silent routing
- ✅ **Authentication**: Token expiry, session invalidation, forced re-auth
- ✅ **Authorization**: User can only access own data, org isolation
- ✅ **Provider Routing**: Model IDs from metadata (not hardcoded)
- ✅ **Input Validation**: Request bodies, API responses, LLM outputs validated
- ✅ **IPC/Bridge Auth**: Messages authenticated, no downgrade
- ✅ **Error Handling**: No swallowed exceptions, timeouts/retries enforced
- ✅ **Secrets**: No PII/API keys in logs, sanitized test data
- ✅ **Tool Execution**: Path traversal checks, shell injection prevention
- ✅ **Billing**: Idempotent charge operations, refund-safe

---

## Part 6: Deployment Safety Checklist

Tests must verify:

- ✅ **No Cross-App Imports**: `pnpm check:boundaries` passes
- ✅ **API Contracts**: Desktop↔Extension, Web↔Mobile messages match
- ✅ **DB Migrations**: Old client connects to new server, rollback-safe
- ✅ **Feature Flags**: Gradual rollout works, kill switch disables feature
- ✅ **Backward Compatibility**: v1 client can chat with v2 server
- ✅ **Breaking Changes**: Detected and documented before merge
- ✅ **Model ID Updates**: Old model IDs still work or have fallback

---

## Part 7: Test Naming Conventions

All tests must follow this pattern for discoverability:

```
describe('[PRIORITY_LEVEL] [AREA] - [FEATURE]', () => {
  test('[SECURITY|ERROR|HAPPY_PATH] [Specific behavior]', async () => {})
})

// Examples:
describe('L1 Security - Privacy Boundaries', () => {
  test('SECURITY: Local chat rejects BYOK key', async () => {})
  test('SECURITY: BYOK to Cloud requires explicit fork', async () => {})
})

describe('L1 Error States - Network', () => {
  test('ERROR: Timeout triggers retry with exponential backoff', async () => {})
  test('HAPPY_PATH: Retry succeeds after transient failure', async () => {})
})
```

---

## Part 8: CI/CD Integration

### **GitHub Actions Strategy**

```yaml
# .github/workflows/test-l1-l2.yml (Blocking - runs on every PR)
- name: Run Priority Level 1-2 Tests
  run: pnpm test:l1:l2
  timeout-minutes: 30

# .github/workflows/test-l3-l4.yml (Gating - runs before merge)
- name: Run Priority Level 3-4 Tests
  run: pnpm test:l3:l4
  timeout-minutes: 45

# .github/workflows/test-coverage.yml (Reporting)
- name: Generate Coverage Report
  run: pnpm test:coverage
  threshold: 80% # Fail if < 80% coverage
```

### **Package.json Scripts**

> ⚠️ **Superseded — do not copy.** The single-root `vitest run --include=…`
> approach below does not work in this monorepo: vitest 4 removed the
> `--include` CLI flag (hard crash), and a config-less root run cannot resolve
> per-app `@/` aliases or run mobile's jest tests. The shipped implementation
> fans out per app via `scripts/run-priority-tier.mjs` (each app's own `test`
> script). See the script header for the full rationale.

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:l1": "vitest run --include='**/**/priority-level-1/**'",
  "test:l2": "vitest run --include='**/**/priority-level-2/**'",
  "test:l1:l2": "vitest run --include='**/**/priority-level-{1,2}/**'",
  "test:l3": "vitest run --include='**/**/priority-level-3/**'",
  "test:l4": "vitest run --include='**/**/priority-level-4/**'",
  "test:coverage": "vitest run --coverage --coverage.threshold.lines=80",
  "test:security": "vitest run --include='**/**/security/**'",
  "test:ci": "pnpm test:l1:l2 && pnpm test:coverage"
}
```

---

## Part 9: Success Metrics

### **Coverage Targets**

| App              | L1 Tests | L2 Tests | L3 Tests | L4 Tests | Total   | Coverage % |
| ---------------- | -------- | -------- | -------- | -------- | ------- | ---------- |
| CLI              | 23       | 21       | 19       | 12       | 75      | 70%+       |
| Desktop          | 56       | 42       | 36       | 36       | 170     | 75%+       |
| Web              | 64       | 48       | 18       | 42       | 172     | 80%+       |
| Mobile           | 45       | 24       | 12       | 24       | 105     | 75%+       |
| Extension        | 18       | 10       | 13       | 6        | 47      | 70%+       |
| Extension-VSCode | 15       | 10       | 5        | 8        | 38      | 70%+       |
| **TOTAL**        | **140**  | **155**  | **103**  | **128**  | **495** | **75%+**   |

### **Quality Metrics**

- ✅ **Execution Time**: L1-L2 < 30 min, L3-L4 < 45 min (parallel across 6 apps)
- ✅ **Flakiness**: < 1% of tests flake on re-run
- ✅ **Coverage**: Lines 75%+, branches 70%+, functions 80%+
- ✅ **Security Tests Pass**: All trust-boundary tests green
- ✅ **Boundary Enforcement**: `pnpm check:boundaries` passes
- ✅ **No Fake Tests**: Zero `expect(true).toBe(true)`, zero stubs in production paths

### **Risk Metrics**

- 🚩 **Known Flaws Covered**: All rows in known-flaws.md have tests
- 🚩 **Risk-Map Paths Tested**: All high-risk paths have security/integration tests
- 🚩 **LLM Failure Prevention**: Zero hallucinated APIs, zero phantom imports

---

## Part 10: Risk Mitigation

### **Potential Blockers & Mitigations**

| Risk                                    | Likelihood | Impact                       | Mitigation                                                     |
| --------------------------------------- | ---------- | ---------------------------- | -------------------------------------------------------------- |
| Test DB schema sync (stale migrations)  | High       | PR blocks if migrations fail | Pre-sync schema Monday 6/20, pin migration version             |
| External API rate limits (mocks fail)   | Medium     | Tests timeout                | Use VCR cassettes to replay recorded responses, not live calls |
| Cross-app contract mismatch             | Medium     | IPC tests flake              | Desktop↔Extension contract tests run in isolation first        |
| Auth token expiry in long-running tests | Low        | Random flakes                | Use long-lived test tokens (24h), refresh mid-test             |
| Mock leakage (mock in L1, real in L2)   | Medium     | False confidence             | Code review all mocks, single mock definition per API          |
| DB isolation (test data collision)      | Low        | Flaky tests                  | Each test gets unique schema, auto cleanup after               |

---

## Part 11: Implementation Handoff

**Dispatcher Assignment:**

- **Desktop Engineer** → CLI + Desktop (apps/cli, apps/desktop)
- **Web Engineer** → Web (apps/web)
- **Mobile Engineer** → Mobile (apps/mobile)
- **Chrome Ext Engineer** → Chrome Extension (apps/extension)
- **VS Code Ext Engineer** → VS Code Extension (apps/extension-vscode)
- **Supervisor** → Coordination, parallel execution, merge strategy

**Start Date:** Monday 2026-06-20  
**L1-L2 Target:** Friday 2026-06-24  
**L3-L4 Target:** Friday 2026-07-01

---

## Appendix: Example Test (Full Implementation)

See `docs/superpowers/specs/2026-06-20-comprehensive-test-coverage-examples.md` for complete working examples of:

- Privacy boundary tests
- Error state recovery
- Provider routing with metadata
- IPC/bridge authentication
- Tool execution safety
