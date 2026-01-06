# Comprehensive E2E Test Guide

## Overview

This guide covers the comprehensive end-to-end test suite for AGI Workforce that tests all major features without any errors.

### Test Files Created

1. **`comprehensive-flows.spec.ts`** - Core feature tests (Token tracking, API, Models, Auto Mode, Thinking, Conversation Modes, Error Handling)
2. **`advanced-integration-flows.spec.ts`** - Advanced scenarios (Tool Execution, AGI Goals, Multi-turn Conversations, Budget System)
3. **`chat.spec.ts`** - Original chat tests (still valid)

## Quick Start

### Run All Tests

```bash
cd apps/desktop

# Run all E2E tests
pnpm exec playwright test e2e/

# Run with detailed output
pnpm exec playwright test e2e/ --reporter=verbose

# Run with headed browser (watch mode)
pnpm exec playwright test e2e/ --headed

# Run with UI mode (interactive)
pnpm exec playwright test e2e/ --ui
```

### Run Specific Test Files

```bash
# Comprehensive flows only
pnpm exec playwright test e2e/comprehensive-flows.spec.ts

# Advanced integration only
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts

# Original chat tests only
pnpm exec playwright test e2e/chat.spec.ts

# All tests together
pnpm exec playwright test e2e/comprehensive-flows.spec.ts e2e/advanced-integration-flows.spec.ts e2e/chat.spec.ts
```

### Run Specific Test Suites

```bash
# Token tracking tests
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Token Tracking"

# API integration tests
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "API Integration"

# Model selection tests
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Model Selection"

# Auto mode tests
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Auto Mode"

# Thinking mode tests
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Thinking Mode"

# Conversation modes tests
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Conversation Modes"

# Error handling tests
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Error Handling"

# Tool execution tests
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "Tool Execution"

# AGI goal tests
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "AGI Goal"

# Multi-turn conversation tests
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "Multi-turn"

# Budget system tests
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "Budget"

# Complex workflows
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "Complex Workflow"
```

### Run Single Test

```bash
# Token counter test
pnpm exec playwright test e2e/comprehensive-flows.spec.ts -g "should track and display input tokens"

# Full workflow test
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts -g "should complete end-to-end"
```

## Test Categories

### 1. **Token Tracking & Counting** (`comprehensive-flows.spec.ts`)

Tests token tracking functionality:

- ✅ Display input tokens in token counter
- ✅ Track output tokens after response
- ✅ Display cost information alongside tokens
- ✅ Update token budget alerts when threshold reached

**Run:**

```bash
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Token Tracking"
```

### 2. **API Integration & Responses** (`comprehensive-flows.spec.ts`)

Tests LLM API functionality:

- ✅ Successfully call LLM API and receive response
- ✅ Handle streaming API responses correctly
- ✅ Include token usage in API response metadata

**Run:**

```bash
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "API Integration"
```

### 3. **Model Selection - Individual Models** (`comprehensive-flows.spec.ts`)

Tests model picker functionality:

- ✅ Allow selecting individual LLM models from dropdown
- ✅ Send message with selected individual model
- ✅ Display selected model in message metadata

**Run:**

```bash
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Model Selection"
```

### 4. **Auto Mode - Smart Routing** (`comprehensive-flows.spec.ts`)

Tests automatic model routing:

- ✅ Enable Auto mode by default
- ✅ Route to appropriate model based on Auto strategy
- ✅ Handle multiple Auto modes (Economy, Balanced, Premium)

**Run:**

```bash
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Auto Mode"
```

### 5. **Thinking Mode** (`comprehensive-flows.spec.ts`)

Tests thinking mode functionality:

- ✅ Toggle thinking mode via brain icon
- ✅ Send message with thinking mode enabled
- ✅ Show thinking tokens/cost if thinking was used

**Run:**

```bash
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Thinking Mode"
```

### 6. **Conversation Modes** (`comprehensive-flows.spec.ts`)

Tests safe vs full control modes:

- ✅ Have conversation mode selector
- ✅ Send message in Safe mode without errors
- ✅ Send message in Full Control mode without errors

**Run:**

```bash
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Conversation Modes"
```

### 7. **Error Handling & Recovery** (`comprehensive-flows.spec.ts`)

Tests error scenarios:

- ✅ Handle empty input gracefully
- ✅ Recover from timeout errors
- ✅ Handle rate limiting gracefully
- ✅ Handle invalid model selection without crash
- ✅ Display meaningful error messages to user

**Run:**

```bash
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --grep "Error Handling"
```

### 8. **Tool Execution & Approvals** (`advanced-integration-flows.spec.ts`)

Tests tool execution workflow:

- ✅ Detect when tools are available in response
- ✅ Handle tool execution flow without errors
- ✅ Show tool results in conversation
- ✅ Handle tool rejection gracefully

**Run:**

```bash
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "Tool Execution"
```

### 9. **AGI Goal Detection & Submission** (`advanced-integration-flows.spec.ts`)

Tests AGI workflow:

- ✅ Detect goal-like intent in messages
- ✅ Show AGI submission dialog when appropriate
- ✅ Not submit non-goal messages as AGI goals
- ✅ Handle AGI workflow state correctly

**Run:**

```bash
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "AGI Goal"
```

### 10. **Multi-turn Conversations** (`advanced-integration-flows.spec.ts`)

Tests conversation context preservation:

- ✅ Maintain conversation context across multiple turns
- ✅ Preserve conversation on page refresh
- ✅ Handle conversation switching without errors

**Run:**

```bash
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "Multi-turn"
```

### 11. **Budget & Credit System** (`advanced-integration-flows.spec.ts`)

Tests budget enforcement:

- ✅ Check user has sufficient credits before sending
- ✅ Display current token budget in UI
- ✅ Enforce token limit with clear messaging

**Run:**

```bash
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "Budget"
```

### 12. **Complex Workflow Scenarios** (`advanced-integration-flows.spec.ts`)

Tests real-world scenarios:

- ✅ Handle code generation and display
- ✅ Handle multi-language content without errors
- ✅ Handle image/media prompts gracefully
- ✅ Maintain stability with rapid model switches
- ✅ Complete end-to-end workflow

**Run:**

```bash
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts --grep "Complex Workflow"
```

## Complete Workflow Test

The most comprehensive test that validates everything working together:

```bash
pnpm exec playwright test e2e/comprehensive-flows.spec.ts -g "should complete entire flow: send query and receive answer"
```

or

```bash
pnpm exec playwright test e2e/advanced-integration-flows.spec.ts -g "should complete end-to-end"
```

## Running Tests in Parallel

**Important:** Tests are configured to run serially (one at a time) to avoid interference. For faster runs with multiple machines:

```bash
# Run with parallel workers (use with caution)
pnpm exec playwright test e2e/ --workers=4
```

## Debugging Tests

### View Test Report

```bash
# Run tests and generate HTML report
pnpm exec playwright test e2e/

# View the report
pnpm exec playwright show-report
```

### Run in Debug Mode

```bash
# Debug specific test
pnpm exec playwright test e2e/comprehensive-flows.spec.ts -g "should track and display" --debug

# Opens Playwright Inspector with step-by-step execution
```

### Slow Motion

```bash
# Run with 1 second delay between actions
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --slow-mo=1000
```

### Video & Screenshots on Failure

```bash
# Already configured in playwright.config.ts
# Videos/screenshots are saved to test-results/ on failure

# View latest failures
open test-results/
```

## Test Execution Flow

### Prerequisites

1. **Desktop app running:**

   ```bash
   pnpm dev:desktop
   ```

   (in separate terminal)

2. **Or start fresh with build:**
   ```bash
   pnpm build:desktop
   # Then run the app
   ```

### Test Environment Setup

- Browser: Chromium (default)
- Base URL: `http://localhost:3000` (or configured app URL)
- Viewport: 1920×1080
- Timeout: 30 seconds default (60 seconds for streaming responses)
- Network: Standard with idle wait

### What Each Test Verifies

**Error-Free Execution:**

- No error alerts appear (`[role="alert"], .error-message`)
- No critical failures occur
- UI remains responsive
- Data persists correctly

**Feature Validation:**

- Tokens are tracked and displayed
- Costs are calculated and shown
- Models can be selected and used
- Auto mode works automatically
- Thinking mode toggles work
- Conversation modes apply
- Tools execute when needed
- AGI goals are detected
- Conversations maintain context
- Budget limits are enforced

## Continuous Integration

### GitHub Actions / CI Pipeline

The test suite is designed to run in CI with:

```yaml
- name: Run E2E Tests
  run: |
    cd apps/desktop
    pnpm exec playwright install
    pnpm exec playwright test e2e/comprehensive-flows.spec.ts e2e/advanced-integration-flows.spec.ts
```

### CI Configuration

- **Retries:** 2 (in CI) / 0 (locally)
- **Timeout:** 120 seconds per test
- **Workers:** 1 (serial execution)
- **Artifacts:** test-results/ with videos/screenshots

## Troubleshooting

### Test Hangs or Times Out

```bash
# Run with verbose logging
PWDEBUG=console pnpm exec playwright test e2e/comprehensive-flows.spec.ts

# Or with inspector
pnpm exec playwright test e2e/comprehensive-flows.spec.ts --debug
```

### App Not Responding

1. Verify `http://localhost:3000` is accessible
2. Check if app is running: `pnpm dev:desktop`
3. Try hard refresh: `Ctrl+Shift+R` / `Cmd+Shift+R`

### Flaky Tests

Tests use:

- Proper waits (`waitForLoadState('networkidle')`)
- Conditional checks (`.catch(() => false)`)
- Generous timeouts (30-60 seconds)
- Element visibility checks before interaction

If a test is still flaky, increase timeout:

```typescript
await expect(element).toBeVisible({ timeout: 60000 }); // 60 seconds
```

### False Positives

Some tests check error count with:

```typescript
expect(await errors.count()).toBe(0);
```

This might fail if warning messages appear. To ignore specific warnings:

```typescript
const errors = page.locator('[role="alert"], .error-message').filter({
  hasNotText: /warning|info|offline/i,
});
```

## Test Statistics

**Total Test Cases:** 30+
**Test Coverage:**

- Token Tracking: 4 tests
- API Integration: 3 tests
- Model Selection: 3 tests
- Auto Mode: 3 tests
- Thinking Mode: 3 tests
- Conversation Modes: 2 tests
- Error Handling: 5 tests
- Tool Execution: 4 tests
- AGI Goals: 4 tests
- Multi-turn: 3 tests
- Budget System: 3 tests
- Complex Workflows: 5 tests
- Complete Workflows: 2 tests

**Average Test Duration:** 10-30 seconds each
**Total Suite Duration:** 5-10 minutes (full run)

## Best Practices

1. **Always ensure app is running** before running tests
2. **Run locally first** before pushing to CI
3. **Check test output** for warnings/failures
4. **Use grep** to run specific tests during development
5. **Review test reports** for visual verification
6. **Keep tests independent** - don't depend on other tests' state

## Key Test Assertions

All tests verify NO errors appear by checking:

```typescript
const errors = page.locator('[role="alert"], .error-message, [data-testid="error-message"]');
expect(await errors.count()).toBe(0);
```

This ensures comprehensive error checking across all flows.

## Next Steps

1. Run full test suite: `pnpm exec playwright test e2e/`
2. Fix any failing tests
3. Add more specific tests as needed
4. Integrate with CI/CD pipeline
5. Set up regular test runs (nightly, per-commit)

---

**Last Updated:** 2026-01-05
**Test Framework:** Playwright with TypeScript
**Configuration:** See `playwright.config.ts`
