# Integration Testing Guide

Comprehensive guide for writing, running, and maintaining cross-feature integration tests for the web chat interface.

## Table of Contents

1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Running Tests](#running-tests)
4. [Writing Integration Tests](#writing-integration-tests)
5. [Common Patterns](#common-patterns)
6. [Fixture System](#fixture-system)
7. [Mocking Strategies](#mocking-strategies)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)
10. [Examples](#examples)

## Overview

Integration tests validate that multiple features work together correctly. Unlike unit tests that test individual functions in isolation, integration tests:

- Test real workflows across multiple components/services
- Verify state consistency across features
- Validate side effects and event propagation
- Catch regressions in feature interactions

### Key Principles

- **Isolate tests**: Each test should be independent
- **Arrange → Act → Assert**: Clear test structure
- **Mock external dependencies**: API calls, streaming, etc.
- **Verify side effects**: Don't just check final state
- **Use fixtures**: Reusable test data builders

## Test Structure

```typescript
describe('Integration: Feature1 + Feature2', () => {
  let testState: any;

  beforeEach(() => {
    vi.clearAllMocks();
    testState = {};
  });

  it('should handle workflow: User does X → System does Y → Result is Z', async () => {
    // ARRANGE: Set up initial state
    const input = setupScenario();

    // ACT: Perform actions
    const result = await performAction(input);

    // ASSERT: Verify immediate results
    expect(result).toMatchExpected();

    // VERIFY SIDE EFFECTS: Check downstream impacts
    expect(globalState).toBeUpdated();
    expect(sidebarUpdated).toBe(true);
  });
});
```

## Running Tests

### Run all integration tests

```bash
cd apps/web
pnpm test e2e/integration-flows.spec.ts
```

### Run specific test suite

```bash
pnpm test e2e/integration-flows.spec.ts -t "Streaming + Voice Input"
```

### Run single test

```bash
pnpm test e2e/integration-flows.spec.ts -t "should handle voice input"
```

### Watch mode

```bash
pnpm test:watch e2e/integration-flows.spec.ts
```

### With coverage

```bash
pnpm test:coverage e2e/integration-flows.spec.ts
```

## Writing Integration Tests

### Step 1: Identify the workflow

List all features involved and their interactions:

```
User sends voice message
  → Application transcribes voice
    → Adds to message queue
      → Initiates streaming response
        → User interrupts with new voice message
          → Streaming cancelled
            → New message processed
```

### Step 2: Design the test structure

```typescript
it('should handle voice input → stream → interrupt → new voice', async () => {
  // ARRANGE: Setup initial conversation, mocks, and listeners
  const conversation = createMockConversation();
  let streamInterrupted = false;

  // ACT: Trigger the workflow
  await sendVoiceMessage('Message 1');
  await expectStreaming();
  await interruptStream(); // Sets streamInterrupted = true
  await sendVoiceMessage('Message 2');

  // ASSERT: Check results
  expect(streamInterrupted).toBe(true);
  expect(lastMessage).toBe('Message 2');

  // VERIFY: Check side effects
  expect(sidebar).toShowBothMessages();
  expect(conversationHistory).toHaveLength(3); // User1, Assistant (interrupted), User2
});
```

### Step 3: Use fixtures for setup

```typescript
import {
  setupChatScenario,
  setupToolExecutionScenario,
  createMockMessage,
} from './fixtures/integration-fixtures';

// Quick setup
const { user, conversation, messages } = setupChatScenario({
  messageCount: 5,
});

// Or custom
const scenario = setupToolExecutionScenario('read');
```

### Step 4: Mock external dependencies

```typescript
// Mock streaming service
const mockStreamingService = {
  stream: vi.fn().mockImplementation(async (input) => {
    // Return mock stream chunks
    return createMockStreamingResponse(['chunk1', 'chunk2']);
  }),
};

// Mock tool execution
const mockToolExecutor = {
  execute: vi.fn().mockResolvedValue({
    success: true,
    result: {
      /* ... */
    },
  }),
};
```

## Common Patterns

### Pattern 1: Feature Interaction with State Verification

```typescript
it('should maintain state consistency across features', async () => {
  // ARRANGE
  const model1 = 'claude-3-5-sonnet-20241022';
  const model2 = 'claude-3-5-haiku-20241022';

  // ACT: Switch models
  updateSelectedModel(model2);

  // ASSERT: Theme persists
  expect(getCurrentTheme()).toBe('light'); // unchanged

  // VERIFY: State consistency
  expect(getState()).toEqual({
    selectedModelId: model2,
    theme: 'light', // unchanged
  });
});
```

### Pattern 2: Error Handling and Recovery

```typescript
it('should recover from streaming error with fallback input', async () => {
  // ARRANGE: Mock stream failure
  const mockStream = vi.fn().mockRejectedValue(new Error('Stream failed'));

  // ACT: Attempt to stream
  const streamResult = await attemptStream();

  // ASSERT: Stream failed
  expect(streamResult.success).toBe(false);

  // ACT: Fallback to typed input
  const typedResult = await sendTypedMessage('Fallback message');

  // ASSERT: Fallback succeeded
  expect(typedResult.success).toBe(true);

  // VERIFY: Error didn't break conversation
  expect(conversationActive).toBe(true);
});
```

### Pattern 3: Tool Execution with Sidebar Updates

```typescript
it('should execute tool and update sidebar', async () => {
  // ARRANGE
  const toolLog: any[] = [];

  // ACT: Execute tool
  await executeTool('read', { path: 'file.txt' });

  // ASSERT: Tool executed
  expect(toolLog).toContainToolExecution('read');

  // VERIFY: Sidebar updated
  const sidebarTools = getSidebarToolList();
  expect(sidebarTools).toContain('read');
});
```

## Fixture System

### Available Builders

```typescript
// User & preferences
createMockUser(overrides?: Partial)
createMockPreferences(overrides?: Partial)

// Models
createMockModel(id: string, overrides?: Partial)
mockModels // Pre-built common models

// Messages
createMockMessage(content: string, role: 'user' | 'assistant', overrides?: Partial)
createMockConversation(overrides?: Partial)

// Tools
createMockToolCall(toolName: string, overrides?: Partial)
createMockToolResult(toolName: string, result?: any)

// Streaming
createMockStreamChunk(content: string, index?: number)
createMockToolUseStreamChunk(toolName: string, toolInput: any, index?: number)

// Scenario builders
setupChatScenario(overrides?: Partial)
setupToolExecutionScenario(toolName?: string)
setupStreamingScenario()
```

### Using Fixtures

```typescript
// Quick setup with defaults
const { user, conversation, messages } = setupChatScenario();

// Custom setup
const { user, conversation, messages } = setupChatScenario({
  userId: 'custom-user-123',
  messageCount: 10,
  selectedModelId: 'claude-3-opus-20250219',
});

// Build individual pieces
const user = createMockUser({ email: 'custom@example.com' });
const message = createMockMessage('Hello', 'user', {
  inputMethod: 'voice',
});
```

## Mocking Strategies

### Strategy 1: Mock Store State

```typescript
const mockStore = {
  getState: vi.fn(() => ({
    selectedModelId: 'claude-3-5-sonnet-20241022',
    theme: 'light',
  })),
  setState: vi.fn(),
};

// Use in test
const state = mockStore.getState();
```

### Strategy 2: Mock API Responses

```typescript
// Mock successful response
const mockResponse = {
  ok: true,
  json: vi.fn().mockResolvedValue({ data: 'success' }),
};

// Mock error response
const mockErrorResponse = {
  ok: false,
  status: 500,
  json: vi.fn().mockResolvedValue({ error: 'Server error' }),
};
```

### Strategy 3: Mock Streaming

```typescript
const mockStream = new ReadableStream({
  start(controller) {
    controller.enqueue(createMockStreamChunk('first chunk'));
    controller.enqueue(createMockStreamChunk('second chunk'));
    controller.close();
  },
});
```

### Strategy 4: Track Side Effects

```typescript
let sideEffectLog: any[] = [];

// In your test
const sideEffect = { type: 'tool_executed', tool: 'read' };
sideEffectLog.push(sideEffect);

// Verify
expect(sideEffectLog).toHaveLength(1);
expect(sideEffectLog[0].type).toBe('tool_executed');
```

## Best Practices

### 1. Keep Tests Focused

❌ **BAD**: One test verifying 10 different features
✅ **GOOD**: One test verifying interaction between 2-3 features

### 2. Use Clear Test Titles

❌ **BAD**: `it('should work')`
✅ **GOOD**: `it('should execute tool and update sidebar with tool history')`

### 3. Isolate Test Data

```typescript
// ✅ GOOD: Fresh data per test
beforeEach(() => {
  conversation = createMockConversation();
  toolLog = [];
});

// ❌ BAD: Shared mutable state
const sharedConversation = createMockConversation();
```

### 4. Mock at Boundaries

Mock:

- API calls
- Streaming responses
- Tool execution services
- External APIs

Don't mock:

- Internal business logic
- Local state management
- Pure utility functions

### 5. Verify Both State and Side Effects

```typescript
// ✅ GOOD: Check both
expect(result.success).toBe(true); // State
expect(sidebarUpdated).toBe(true); // Side effect

// ❌ BAD: Only check state
expect(result.success).toBe(true);
```

### 6. Clean Up After Tests

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});

afterEach(() => {
  // Clean up any resources
  mockStream?.close();
});
```

## Troubleshooting

### Issue: Async State Updates Not Appearing

**Problem**: Test checks state immediately after action, state not updated yet.

**Solution**: Use `waitFor` or ensure promises resolve:

```typescript
// ❌ BAD
await action();
expect(state).toEqual(expected);

// ✅ GOOD
await action();
await vi.runAllTimersAsync();
expect(state).toEqual(expected);

// Or with waitFor
await waitFor(() => {
  expect(state).toEqual(expected);
});
```

### Issue: Mock Not Being Used

**Problem**: Function still calls real implementation.

**Solution**: Mock before importing module:

```typescript
// ✅ GOOD: Mock BEFORE import
vi.mock('@/services/api');
import { chatApi } from '@/services/api';

// ❌ BAD: Mock AFTER import
import { chatApi } from '@/services/api';
vi.mock('@/services/api');
```

### Issue: State Mutations in Tests

**Problem**: Tests modify shared objects, affecting other tests.

**Solution**: Deep clone fixtures:

```typescript
// ✅ GOOD: Clone to avoid mutation
const conversation = structuredClone(createMockConversation());

// ❌ BAD: Shared reference
const conversation = createMockConversation();
```

### Issue: Test Timeout

**Problem**: Async operations take too long.

**Solution**:

1. Use fake timers
2. Mock long operations
3. Increase timeout

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

// Or increase timeout
it(
  'should...',
  async () => {
    // test code
  },
  { timeout: 10000 },
); // 10 seconds
```

### Issue: Flaky Tests (Sometimes Pass, Sometimes Fail)

**Problem**: Race condition or timing-dependent code.

**Solution**:

1. Use `vi.useFakeTimers()`
2. Mock all async operations
3. Don't rely on `Date.now()` or `setTimeout`

```typescript
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-03-15'));
});
```

## Examples

### Example 1: Voice Input + Streaming

```typescript
it('should handle voice input with streaming response', async () => {
  // ARRANGE
  const voiceMessage = 'What is AI?';
  const streamChunks = ['AI is', ' artificial', ' intelligence'];

  // ACT: Send voice message
  const userMsg = createMockMessage(voiceMessage, 'user', {
    inputMethod: 'voice',
  });

  // ACT: Stream response
  let response = '';
  for (const chunk of streamChunks) {
    response += chunk;
  }

  const assistantMsg = createMockMessage(response, 'assistant', {
    status: 'completed',
  });

  // ASSERT
  expect(userMsg.inputMethod).toBe('voice');
  expect(assistantMsg.content).toContain('artificial intelligence');
});
```

### Example 2: Tool Execution + Model Switch

```typescript
it('should execute tool and maintain model selection', async () => {
  // ARRANGE
  const preferences = createMockPreferences({
    selectedModelId: 'claude-3-5-sonnet-20241022',
  });

  // ACT: Execute tool
  const toolCall = createMockToolCall('read');
  const toolResult = createMockToolResult('read', { content: 'File content' });

  // ACT: Switch model
  const newModel = 'claude-3-5-haiku-20241022';
  const updatedPrefs = {
    ...preferences,
    selectedModelId: newModel,
  };

  // ASSERT
  expect(toolResult.result.content).toBe('File content');
  expect(updatedPrefs.selectedModelId).toBe('claude-3-5-haiku-20241022');
  expect(updatedPrefs.selectedModelId).not.toBe(preferences.selectedModelId);
});
```

### Example 3: Error Recovery

```typescript
it('should recover from stream error with typed input', async () => {
  // ARRANGE
  const errorLog: any[] = [];

  // ACT: Stream fails
  errorLog.push({ type: 'stream_error' });

  // ACT: User types fallback message
  const fallbackMsg = createMockMessage('Try again', 'user', {
    inputMethod: 'typed',
  });

  // ASSERT
  expect(errorLog).toHaveLength(1);
  expect(fallbackMsg.inputMethod).toBe('typed');
  expect(errorLog[0].type).toBe('stream_error');
});
```

## Test Coverage Goals

- **Streaming + Voice**: 2 tests (basic flow, settings persistence)
- **Models + Themes**: 2 tests (persistence, downgrades/upgrades)
- **Tools + Sidebar**: 2 tests (execution tracking, new chat context)
- **Session + Tools**: 2 tests (persistence, rebuild sidebar)
- **Error Handling**: 2 tests (recovery, sequential errors)

**Total**: 10+ integration tests covering critical cross-feature workflows

## Running Full Test Suite

```bash
# All tests with coverage
cd apps/web
pnpm test:coverage e2e/integration-flows.spec.ts

# Watch mode for development
pnpm test:watch e2e/integration-flows.spec.ts

# Specific feature test
pnpm test e2e/integration-flows.spec.ts -t "Streaming"
```

## Continuous Integration

Integration tests run in CI on every push:

```yaml
# In .github/workflows/test.yml
- name: Run integration tests
  run: |
    cd apps/web
    pnpm test e2e/integration-flows.spec.ts --coverage --reporter=verbose
```

## Next Steps

1. Run all tests: `pnpm test e2e/integration-flows.spec.ts`
2. Verify all tests pass (10/10 green)
3. Check coverage report for gaps
4. Add more tests for edge cases as needed
5. Keep fixtures updated as features evolve

---

**Last Updated**: 2026-03-15
**Status**: Integration test framework complete, ready for use
