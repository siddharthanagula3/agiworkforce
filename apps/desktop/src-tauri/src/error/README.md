# Enhanced Error Handling System

This module implements production-grade error handling for the AGI Workforce desktop application.

## Architecture

### Module Structure

```
error/
├── mod.rs              # Main error types and Result alias
├── categorization.rs   # Error categorization and Categorizable trait
├── retry.rs            # Retry policies and backoff strategies
├── recovery.rs         # Recovery strategies and RecoveryManager
├── commands.rs         # Tauri commands for error management
├── integration.rs      # Integration helpers for executor/tools
└── README.md          # This file
```

## Core Components

### 1. Error Type Hierarchy

**AGIError** - Main error type with variants:
- `ToolError` - Tool-specific errors (browser, API, file, database, etc.)
- `LLMError` - LLM provider errors (rate limit, timeout, context length, etc.)
- `ResourceError` - Resource limit errors (CPU, memory, network, storage)
- `PermissionError` - Permission denied errors
- `TransientError` - Temporary errors that should be retried
- `FatalError` - Permanent errors that cannot be recovered
- `ConfigurationError` - Configuration issues
- `TimeoutError` - Timeout errors
- `PlanningError` - Planning failures

### 2. Error Categorization

The `Categorizable` trait provides:
- `category()` - Determine error category (Transient, Permanent, ResourceLimit, etc.)
- `is_retryable()` - Check if error should be retried
- `suggested_action()` - Get user-friendly suggestion
- `retry_delay_ms()` - Recommended retry delay

**Error Categories:**
- **Transient**: Network blips, timeouts → Retry immediately
- **Permanent**: Invalid input, not found → Don't retry
- **ResourceLimit**: Rate limits, memory limits → Wait and retry
- **Permission**: Access denied → Ask user
- **Configuration**: Missing API keys → Fix settings
- **Unknown**: Uncategorized → Log and fail

### 3. Retry Policies

Pre-configured retry policies for different scenarios:

```rust
RetryPolicy::default()      // 3 attempts, exponential + jitter
RetryPolicy::aggressive()   // 5 attempts, fast exponential
RetryPolicy::conservative() // 2 attempts, fixed delay
RetryPolicy::network()      // 4 attempts, network-optimized
RetryPolicy::llm()          // 4 attempts, handles rate limits
RetryPolicy::browser()      // 5 attempts, UI automation
RetryPolicy::database()     // 5 attempts, DB operations
RetryPolicy::filesystem()   // 3 attempts, file operations
```

**Backoff Strategies:**
- `Fixed(duration)` - Same delay every time
- `Linear(base)` - Increase linearly (base * attempt)
- `Exponential { base, max }` - Exponential increase (base * 2^attempt)
- `ExponentialWithJitter { base, max }` - Exponential with randomness to avoid thundering herd

### 4. Recovery Strategies

The `RecoveryManager` provides automatic recovery for common error scenarios:

**Browser Automation:**
- Element not found → Try semantic selectors, use vision model
- Browser crash → Restart browser
- Timeout → Increase timeout and retry

**LLM Errors:**
- Rate limit → Switch to alternative provider or wait
- Context length → Summarize context
- Model unavailable → Switch to fallback model
- Timeout → Retry with increased timeout

**File System:**
- File not found → Request user for correct path
- Disk full → Request user to free space
- Permission denied → Request elevation

**API Errors:**
- Rate limit → Wait 60 seconds before retry
- Authentication → Request user to check credentials
- Timeout → Retry with backoff

**Resource Limits:**
- Memory limit → Clear caches, reduce workload
- CPU limit → Reduce workload
- Concurrency limit → Wait for resources

**Recovery Actions:**
- `Retry` - Retry the operation
- `Fallback(msg)` - Use alternative approach
- `Skip` - Skip this step and continue
- `Abort` - Stop execution entirely
- `RequestUserInput(msg)` - Ask user for help
- `WaitAndRetry(ms)` - Wait specific time before retry

### 5. Error Context Tracking

Every error creates a detailed context:
- Unique ID (UUID)
- Timestamp
- Error category
- Step name (optional)
- Tool name (optional)
- Input parameters (optional)
- Stacktrace
- Recovery attempts count
- User-friendly message
- Suggested action

### 6. Tauri Commands

Frontend integration via commands:
- `get_error_context(error_id)` - Get detailed error info
- `get_all_error_contexts()` - List all errors
- `retry_failed_step(error_id)` - Retry a failed operation
- `skip_failed_step(error_id)` - Skip and continue
- `abort_execution(error_id)` - Abort execution
- `clear_error_contexts()` - Clear error history
- `get_recovery_suggestion(error_id)` - Get recovery advice

### 7. Error Events

Errors emit `agi:error` events to frontend with:
- Error ID
- Error type and message
- Category and retryability
- User message and suggested action
- Step and tool information
- Recovery attempts
- Timestamp

## Usage Examples

### Basic Retry

```rust
use crate::error::{retry_with_policy, RetryPolicy};

let policy = RetryPolicy::network();
let result = retry_with_policy(&policy, || async {
    make_api_call().await
}).await?;
```

### With Recovery

```rust
use crate::error::{execute_tool_with_recovery, RecoveryManager};

let recovery_manager = RecoveryManager::new();
let result = execute_tool_with_recovery(
    "api_call",
    || async { make_api_call().await },
    &recovery_manager
).await?;
```

### Enhanced Execution Context

```rust
use crate::error::EnhancedExecutionContext;

let ctx = EnhancedExecutionContext::new()
    .with_app_handle(app_handle);

let result = ctx.execute_step_with_recovery(
    "Call weather API",
    "api_call",
    || async { make_api_call().await }
).await?;
```

### Error Context Creation

```rust
use crate::error::ErrorContext;

let context = ErrorContext::new(error)
    .with_step("Execute API call".to_string())
    .with_tool("api_call".to_string())
    .with_input(params_json);
```

### Custom Recovery Strategy

```rust
use crate::error::{RecoveryManager, RecoveryStrategy, RecoveryAction};

let mut manager = RecoveryManager::new();

manager.register_strategy(RecoveryStrategy::new(
    "Custom recovery",
    |e| matches!(e, AGIError::CustomError(_)),
    |e| async move {
        // Custom recovery logic
        Ok(RecoveryAction::Retry)
    }
));
```

## Integration with AGI Executor

The error handling system is designed to integrate seamlessly with the AGI executor:

1. **Wrap tool execution** with `execute_tool_with_recovery()`
2. **Select appropriate retry policy** based on tool type
3. **Create error contexts** for tracking
4. **Emit error events** to frontend
5. **Apply recovery strategies** automatically

See `integration.rs` for helper functions and examples.

## Best Practices

1. **Always use retry policies** for operations that might fail transiently
2. **Select appropriate policy** based on operation type
3. **Create error contexts** with step and tool information
4. **Emit error events** to keep frontend informed
5. **Use recovery manager** for sophisticated error handling
6. **Convert errors early** to AGIError for consistent handling
7. **Log errors** with tracing for debugging
8. **Test recovery strategies** for critical operations
9. **Provide user-friendly messages** in error contexts
10. **Monitor error metrics** for system health

## Testing

The module includes comprehensive tests for:
- Error categorization logic
- Retry policies and backoff strategies
- Recovery manager strategies
- Error context creation and storage
- Integration helpers

Run tests:
```bash
cargo test --package agiworkforce-desktop --lib error
```

## Future Enhancements

Potential improvements:
1. Circuit breaker pattern for failing services
2. Error rate limiting to prevent cascading failures
3. Persistent error history in database
4. Error analytics and reporting
5. Custom recovery strategies per tool
6. Machine learning-based error prediction
7. Automatic fallback provider selection
8. Error-based cost optimization
