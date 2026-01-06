# Advanced E2E Testing - Usage Guide

## Overview

This guide covers advanced testing features, utilities, and patterns for the comprehensive E2E test suite.

## Test Helpers (`fixtures/test-helpers.ts`)

### Chat Interaction Helpers

```typescript
import { sendChatMessage, getLastAssistantMessage } from './fixtures/test-helpers';

// Send a message and wait for response
const response = await sendChatMessage(page, 'What is AI?', 30000);
expect(response).toBeVisible();

// Get the assistant's last message
const message = await getLastAssistantMessage(page);
console.log('Response:', message);

// Get the user's last message
const userMsg = await getLastUserMessage(page);

// Get total conversation length
const length = await getConversationLength(page);
expect(length).toBeGreaterThan(0);

// Clear chat and start new conversation
await clearChat(page);
```

### Model Selection Helpers

```typescript
import { selectModel, getSelectedModel, isAutoModeEnabled } from './fixtures/test-helpers';

// Select a specific model
await selectModel(page, 'Claude Opus');

// Get currently selected model
const model = await getSelectedModel(page);
console.log('Selected:', model);

// Check if auto mode is enabled
const isAuto = await isAutoModeEnabled(page);

// Toggle thinking mode
await toggleThinkingMode(page, true); // Enable
await toggleThinkingMode(page, false); // Disable

// Set conversation mode
await setConversationMode(page, 'safe');
await setConversationMode(page, 'full-control');
```

### Error Detection & Handling

```typescript
import { hasErrors, getErrorMessage, assertNoErrors, dismissErrors } from './fixtures/test-helpers';

// Check if there are errors (filters warnings by default)
if (await hasErrors(page)) {
  const error = await getErrorMessage(page);
  console.log('Error:', error);
}

// Assert no errors exist
await assertNoErrors(page);

// Get and dismiss errors
await dismissErrors(page);
```

### Token & Cost Tracking

```typescript
import { getTokenCount, getCostDisplay, getBudgetRemaining } from './fixtures/test-helpers';

// Get token count
const tokens = await getTokenCount(page);
if (tokens) {
  console.log('Tokens used:', tokens);
}

// Get cost display
const cost = await getCostDisplay(page);
if (cost) {
  console.log('Cost:', cost);
}

// Get remaining budget
const remaining = await getBudgetRemaining(page);
if (remaining) {
  console.log('Budget remaining:', remaining);
}
```

### Advanced Waits

```typescript
import {
  waitForResponseStreaming,
  waitForCondition,
  waitForNewMessage,
} from './fixtures/test-helpers';

// Wait for streaming to complete
await waitForResponseStreaming(page);

// Wait for custom condition
const messageArrived = await waitForCondition(
  page,
  async () => {
    const msg = page.locator('[data-role="assistant"]');
    return await msg.isVisible();
  },
  5000, // timeout
);

// Wait for new message in conversation
const previousCount = await page.locator('[data-role="assistant"]').count();
// ... send message ...
await waitForNewMessage(page, previousCount);
```

### Tool & AGI Helpers

```typescript
import {
  detectAGIGoal,
  detectToolExecution,
  getToolResults,
  approveToolExecution,
  rejectToolExecution,
} from './fixtures/test-helpers';

// Detect if AGI goal was detected
if (await detectAGIGoal(page)) {
  console.log('AGI goal detected!');
}

// Detect tool execution
if (await detectToolExecution(page)) {
  // Get tool results
  const results = await getToolResults(page);

  // Approve or reject
  await approveToolExecution(page);
  // OR
  await rejectToolExecution(page);
}
```

### Performance Measurement

```typescript
import { measureResponseTime, measureStreamingTime } from './fixtures/test-helpers';

// Measure time for full request-response cycle
const time = await measureResponseTime(page, 'Hello');
console.log('Response time:', time, 'ms');

// Measure time including streaming
const streamTime = await measureStreamingTime(page, 'Long response');
console.log('Streaming time:', streamTime, 'ms');
```

### Batch Operations

```typescript
import { sendMultipleMessages, testMultipleModels } from './fixtures/test-helpers';

// Send multiple messages with delay
const times = await sendMultipleMessages(
  page,
  ['First message', 'Second message', 'Third message'],
  500, // delay between messages
);

console.log('Response times:', times);

// Test multiple models
const results = await testMultipleModels(
  page,
  ['Claude Opus', 'GPT-4', 'Gemini Pro'],
  'Test message',
);

results.forEach((r) => {
  console.log(`${r.model}: ${r.success ? 'PASS' : 'FAIL'} (${r.duration}ms)`);
});
```

## Mock Data (`fixtures/mock-data.ts`)

### Generate Test Data

```typescript
import {
  generateUserMessage,
  generateAssistantResponse,
  generateTokenUsage,
  calculateEstimatedCost,
} from './fixtures/mock-data';

// Generate random user message
const msg = generateUserMessage();

// Generate assistant response for topic
const response = generateAssistantResponse('python function');

// Generate token usage
const usage = generateTokenUsage(50, 200); // input, output length
console.log('Tokens:', usage.totalTokens);

// Calculate cost
const cost = calculateEstimatedCost(100, 200, 'gpt-4');
console.log('Estimated cost:', '$' + cost.toFixed(4));
```

### Generate Conversations

```typescript
import { generateMultiTurnConversation } from './fixtures/mock-data';

// Generate multi-turn conversation
const conversation = generateMultiTurnConversation(5); // 5 turns
conversation.forEach((turn, i) => {
  console.log(`${i}: ${turn.role} - ${turn.content.substring(0, 50)}...`);
});
```

### Work with Models

```typescript
import { getRandomModel, getModelByName, MOCK_MODELS } from './fixtures/mock-data';

// Get random model
const model = getRandomModel();
console.log('Random model:', model.name);

// Get specific model
const gpt4 = getModelByName('GPT-4');

// List all models
MOCK_MODELS.forEach((m) => {
  console.log(`${m.name} (${m.provider}) - $${m.inputCost}/$${m.outputCost}`);
});
```

### Handle Errors & Budgets

```typescript
import { getRandomError, generateBudgetInfo, MOCK_ERRORS } from './fixtures/mock-data';

// Get random error
const error = getRandomError();
console.log('Error:', error.code, error.message);

// Get specific error
const rateLimit = MOCK_ERRORS.find((e) => e.code === 'RATE_LIMIT');

// Generate budget info for plan
const budget = generateBudgetInfo('pro');
console.log('Monthly budget:', '$' + budget.monthlyLimit);
console.log('Usage:', budget.percentageUsed + '%');
```

### Generate AGI Goals

```typescript
import { generateAGIGoal, GOAL_TEMPLATES } from './fixtures/mock-data';

// Generate random goal
const goal = generateAGIGoal();
console.log('Goal:', goal.title);

// Generate from template
const template = GOAL_TEMPLATES[0];
const specificGoal = generateAGIGoal(template);
console.log('Steps:', specificGoal.estimatedSteps);
```

## Advanced Test Patterns

### Pattern 1: Full Feature Test

```typescript
test('complete workflow with helpers', async ({ page }) => {
  // Setup
  await navigateToChat(page);
  await selectModel(page, 'Claude Opus');
  await toggleThinkingMode(page, true);

  // Execute
  const response = await sendChatMessage(page, 'Solve this equation: 2x + 5 = 13');

  // Validate
  expect(response).toBeVisible();
  await assertNoErrors(page);

  const content = await response.textContent();
  expect(content).toContain('x = 4');

  // Check metrics
  const tokens = await getTokenCount(page);
  if (tokens) expect(tokens).toBeGreaterThan(0);

  const cost = await getCostDisplay(page);
  if (cost) expect(cost).toBeTruthy();
});
```

### Pattern 2: Multi-Model Comparison

```typescript
test('compare responses across models', async ({ page }) => {
  const messages = [
    'What is machine learning?',
    'Explain neural networks',
    'How do transformers work?',
  ];

  const results = await testMultipleModels(
    page,
    ['Claude Opus', 'GPT-4', 'Gemini Pro'],
    messages[0],
  );

  const successful = results.filter((r) => r.success);
  expect(successful.length).toBe(3);

  const fastest = results.reduce((a, b) => (a.duration < b.duration ? a : b));
  console.log('Fastest model:', fastest.model);
});
```

### Pattern 3: Performance Benchmarking

```typescript
test('benchmark response times', async ({ page }) => {
  const messages = [
    'Short query',
    'What is artificial intelligence and how does it work in modern applications?',
    'Complex: ' + 'Query '.repeat(50),
  ];

  const times = await sendMultipleMessages(page, messages, 1000);

  times.forEach((time, i) => {
    console.log(`Message ${i + 1}: ${time}ms`);
  });

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  expect(avg).toBeLessThan(60000); // Under 1 minute average
});
```

### Pattern 4: Error Recovery

```typescript
test('handle and recover from errors', async ({ page }) => {
  // Trigger error condition
  await page.context().setOffline(true);

  await sendChatMessage(page, 'This will fail');

  expect(await hasErrors(page)).toBeTruthy();
  const error = await getErrorMessage(page);
  expect(error).toContain('offline');

  // Recover
  await page.context().setOffline(false);
  await dismissErrors(page);

  // Retry successfully
  const response = await sendChatMessage(page, 'This should work');
  expect(response).toBeVisible();
});
```

### Pattern 5: Conversation Flow Validation

```typescript
test('validate multi-turn conversation', async ({ page }) => {
  // Turn 1
  await sendChatMessage(page, 'My name is Alice');
  let length = await getConversationLength(page);
  expect(length).toBe(1);

  // Turn 2
  await sendChatMessage(page, 'What did I say?');
  length = await getConversationLength(page);
  expect(length).toBe(2);

  // Turn 3
  await sendChatMessage(page, 'Remember my name');
  length = await getConversationLength(page);
  expect(length).toBe(3);

  // Validate response quality
  const lastMsg = await getLastAssistantMessage(page);
  expect(lastMsg).toContain('Alice');
});
```

## Running Tests with Helpers

### Using the Test Runner Script

```bash
# Run all tests
./e2e/run-tests.sh

# Run specific suite
./e2e/run-tests.sh --suite comprehensive-flows

# Run in headed mode (see browser)
./e2e/run-tests.sh --headed

# Debug mode with inspector
./e2e/run-tests.sh --debug

# Interactive UI mode
./e2e/run-tests.sh --ui

# Clean and generate report
./e2e/run-tests.sh --clean --report

# Run in parallel (faster)
./e2e/run-tests.sh --parallel
```

### Make Script Executable

```bash
chmod +x apps/desktop/e2e/run-tests.sh
```

## Debugging with Helpers

```typescript
test('debug example', async ({ page }) => {
  // Log page state
  await logPageState(page);

  // Take debug screenshot
  const filename = await takeDebugScreenshot(page, 'after-message');

  // Check errors
  if (await hasErrors(page)) {
    const error = await getErrorMessage(page);
    console.error('Error found:', error);
  }

  // Print token info
  const tokens = await getTokenCount(page);
  const cost = await getCostDisplay(page);
  console.log('Metrics:', { tokens, cost });
});
```

## Best Practices

### ✅ DO

```typescript
// Use helpers for common operations
const response = await sendChatMessage(page, msg);

// Check for errors explicitly
await assertNoErrors(page);

// Use descriptive test names
test('should calculate tokens correctly', ...)

// Handle optional elements gracefully
const budget = await getBudgetRemaining(page);
if (budget) { /* use budget */ }
```

### ❌ DON'T

```typescript
// Don't write long selectors
page.locator('[data-testid="chat-input"]').fill(msg); // Use helper instead

// Don't ignore errors
// Just let errors pass without checking

// Don't use fixed waits
await page.waitForTimeout(5000); // Use waitForCondition instead

// Don't assume elements exist
const result = await element.textContent(); // Check visibility first
```

## Integration with CI/CD

The helpers are designed to work seamlessly with GitHub Actions:

```yaml
- name: Run E2E Tests with Helpers
  run: |
    cd apps/desktop
    ./e2e/run-tests.sh --clean --report
```

## Troubleshooting

**Element Not Found**

- Use `logPageState()` to debug
- Check selectors with `--headed` mode
- Review test with `--debug` flag

**Flaky Tests**

- Increase timeouts for slow networks
- Use `waitForCondition()` instead of fixed waits
- Check for race conditions

**Performance Issues**

- Use `measureResponseTime()` to profile
- Run with `--parallel` for CI
- Check app logs for backend issues

---

For more information, see:

- `TEST_GUIDE.md` - Basic test execution
- `QUICK_REFERENCE.md` - Quick commands
- `COMPREHENSIVE_TEST_SUMMARY.md` - Full coverage
