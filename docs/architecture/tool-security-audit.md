# Tool Execution Security Audit Report

**Date:** 2026-02-05
**Auditor:** Security Engineer (AI Agent)
**Priority:** CRITICAL
**Status:** VULNERABILITIES IDENTIFIED - REMEDIATION REQUIRED

---

## Executive Summary

The tool execution framework currently has **critical security gaps** that allow chat tools to bypass the established security controls used by AGI executors. This creates a dual-pathway vulnerability where:

1. **Secured pathway** (`core/llm/tool_executor.rs` → AGI executors) - Properly enforced
2. **Unsecured pathway** (`sys/commands/chat/tools.rs`) - BYPASSES security controls

**Risk Rating:** CRITICAL
**Impact:** Unrestricted file system access, unvalidated shell execution
**Exploitability:** HIGH - Direct LLM tool calls bypass all sandboxing

---

## Vulnerability Analysis

### 1. CRIT-001: Unscoped File Write Operations

**Location:** `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:325-352`

**Issue:**

```rust
"file_write" => {
    // MISSING: validate_path() call
    fs::write(path, content)  // Direct write to any path
}
```

**Impact:**

- Chat tools can write to ANY file on the system
- No `allowed_directories` enforcement
- No path traversal protection
- Can overwrite system files, credentials, SSH keys

**Contrast with secured implementation:**

```rust
// file_executor.rs (SECURE)
let canonical_path = Self::validate_new_path(Path::new(path), context, "file_write")?;
// Validates against allowed_directories
// Canonicalizes to prevent path traversal
// Re-validates before write (TOCTOU protection)
```

### 2. CRIT-002: Weak Shell Command Validation

**Location:** `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:388-445`

**Issue:**

```rust
"terminal_execute" => {
    // Only basic string checks
    if command.contains("rm -rf /") || command.contains("sudo rm") {
        return Err(anyhow!("Dangerous command blocked"));
    }
    // Directly spawns shell with sh -c
    Command::new(shell).arg(shell_arg).arg(command)
}
```

**Weaknesses:**

- Only checks 2 dangerous patterns (vs. 60+ in robust validator)
- Trivially bypassed: `rm -rf /*` (not checked)
- No validation against command injection: `$(malicious)`, backticks
- No working directory validation
- Missing TOCTOU protection

**Contrast with secured implementation:**

```rust
// terminal_executor.rs (SECURE)
self.validate_command(command)?;  // 60+ blocked patterns
self.validate_working_directory(dir, context)?;  // Allowed dir check
// Uses command_validator.rs with comprehensive security rules
```

### 3. CRIT-003: Bypassed Confirmation Framework

**Location:** `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs:284-608`

**Issue:**
Chat tools execute directly without safety checks:

```rust
pub async fn execute_chat_tool(tool_name: &str, arguments_json: &str) -> Result<String> {
    match tool_name {
        "file_write" => fs::write(path, content),  // NO CONFIRMATION
        "terminal_execute" => Command::new(shell).spawn(),  // NO APPROVAL
    }
}
```

**Impact:**

- Users never see approval prompts for dangerous operations
- No opportunity to review file writes or shell commands
- Completely bypasses `tool_executor.rs` safety tier system
- Violates principle of "user approval for risky actions"

**Contrast with secured pathway:**

```rust
// tool_executor.rs (SECURE)
if is_dangerous_tool(&tool_call.name) {
    let confirmed = request_tool_confirmation(app_handle, tool_name).await?;
    if !confirmed {
        return Err(anyhow!("User denied approval"));
    }
}
```

### 4. CRIT-004: Inconsistent Security Models

**File Operations Comparison:**

| Security Control            | AGI Executors (`file_executor.rs`) | Chat Tools (`chat/tools.rs`) |
| --------------------------- | ---------------------------------- | ---------------------------- |
| Path canonicalization       | ✅ Yes                             | ❌ No                        |
| `allowed_directories` check | ✅ Yes                             | ❌ No                        |
| TOCTOU protection           | ✅ Yes (re-validate before write)  | ❌ No                        |
| Path traversal defense      | ✅ Yes (resolves `..`, symlinks)   | ❌ No                        |
| Null byte check             | ✅ Yes                             | ❌ No                        |
| Max file size limit         | ✅ Yes (10MB write, 50MB read)     | ❌ No                        |
| User confirmation           | ✅ Yes (destructive ops)           | ❌ No                        |
| Undo tracking               | ✅ Yes (ChangeTracker)             | ❌ No                        |
| Audit logging               | ✅ Yes (file_operation events)     | ❌ No                        |

**Shell Execution Comparison:**

| Security Control          | AGI Executors (`terminal_executor.rs`) | Chat Tools (`chat/tools.rs`) |
| ------------------------- | -------------------------------------- | ---------------------------- |
| Command validation        | ✅ 60+ blocked patterns                | ❌ 2 basic checks            |
| CWD validation            | ✅ Allowed dir enforcement             | ❌ No validation             |
| Timeout enforcement       | ✅ Configurable (max 5min)             | ✅ 30s timeout               |
| Stdout/stderr limits      | ✅ 10MB/1MB                            | ❌ 10000 char truncation     |
| User approval             | ✅ For dangerous tools                 | ❌ No                        |
| Command injection defense | ✅ Yes (blocks $(), backticks)         | ❌ No                        |

---

## Attack Scenarios

### Scenario 1: Exfiltrate SSH Keys via Chat

```json
{
  "tool": "file_read",
  "arguments": {
    "path": "/Users/victim/.ssh/id_rsa"
  }
}
```

**Result:** Private SSH key exfiltrated without any security check.

### Scenario 2: Bypass Command Validator

User asks: "List all Python files"
Chat tool executes:

```bash
find / -name "*.py" 2>/dev/null | xargs cat > /tmp/exfiltrated_code.txt
```

**Chat tool checks:** PASS (doesn't contain `rm -rf /` or `sudo rm`)
**Robust validator:** FAIL (would block `xargs` as suspicious)

### Scenario 3: Modify System Configuration

```json
{
  "tool": "file_write",
  "arguments": {
    "path": "/etc/hosts",
    "content": "127.0.0.1 api.openai.com\n"
  }
}
```

**Result:** Redirects OpenAI API calls to localhost without any warning.

---

## Root Cause Analysis

### Why does this vulnerability exist?

1. **Historical Evolution:**
   - Chat tools were implemented as a quick prototype
   - AGI executors were built later with proper security review
   - No refactoring to unify the two pathways

2. **Architectural Flaw:**

   ```
   LLM Tool Call
        ↓
   ┌────────────────┐
   │ SPLIT DECISION │
   └────────────────┘
         ↙      ↘
    AGI Mode   Chat Mode
    (Secure)   (Insecure)
   ```

3. **Missing Security Review:**
   - `chat/tools.rs` never underwent security audit
   - Assumed chat mode was "safe" because user-initiated
   - Overlooked that LLM can call tools autonomously

---

## Remediation Plan

### Phase 1: Immediate Mitigations (Priority 1)

**1.1 Route ALL Chat Tools Through Secured Executor**

```rust
// BEFORE (INSECURE):
pub async fn execute_chat_tool(tool_name: &str, args: &str) -> Result<String> {
    match tool_name {
        "file_write" => fs::write(path, content),  // UNSAFE
    }
}

// AFTER (SECURE):
pub async fn execute_chat_tool(
    tool_name: &str,
    args: &str,
    app_handle: &AppHandle
) -> Result<String> {
    // Route through secured tool_executor
    let tool_executor = app_handle.state::<ToolExecutor>();
    let tool_call = ToolCall { name: tool_name.into(), arguments: args.into() };
    let result = tool_executor.execute_tool_call(&tool_call).await?;
    Ok(result.data.to_string())
}
```

**1.2 Add Allowed-Directory Enforcement**

```rust
// In chat/tools.rs file operations
let settings_state = app_handle.state::<SettingsState>();
let settings = settings_state.settings.lock().await;
validate_path_in_allowed_directories(path, &settings.allowed_directories)?;
```

**1.3 Integrate Robust Command Validator**

```rust
use crate::sys::security::command_validator::{validate_command, ValidationConfig};

"terminal_execute" => {
    let config = ValidationConfig::oneshot();
    validate_command(command, &config)?;
    // Then execute...
}
```

### Phase 2: Structural Refactoring (Priority 2)

**2.1 Create Unified Tool Execution Service**

```rust
pub struct UnifiedToolExecutor {
    agi_executors: Arc<ExecutorRegistry>,
    policy_engine: Arc<PolicyEngine>,
    tool_guard: Arc<ToolExecutionGuard>,
}

impl UnifiedToolExecutor {
    pub async fn execute(&self, tool_call: &ToolCall, context: &Context) -> Result<ToolResult> {
        // 1. Policy evaluation
        let decision = self.policy_engine.evaluate(&tool_call.to_security_action(), &context)?;

        // 2. User confirmation if required
        if decision.requires_approval() {
            self.request_confirmation(tool_call, decision.risk_level()).await?;
        }

        // 3. Execute through appropriate executor
        self.agi_executors.execute(tool_call, context).await
    }
}
```

**2.2 Deprecate Direct File System Access in Chat Tools**

```rust
// Remove from chat/tools.rs:
- use tokio::fs;  // REMOVE direct filesystem access
- use tokio::process::Command;  // REMOVE direct shell access

// All operations route through executors:
+ use crate::core::agi::executors::{FileExecutor, TerminalExecutor};
```

### Phase 3: Enhanced Security (Priority 3)

**3.1 Implement File Operation Sandboxing**

```rust
pub struct FileOperationSandbox {
    allowed_roots: Vec<PathBuf>,
    blocked_patterns: Vec<Regex>,
    max_file_size: u64,
}
```

**3.2 Add Security Telemetry**

```rust
// Log all tool executions for audit
audit_logger.log_tool_execution(ToolExecutionEvent {
    tool_name: "file_write",
    path: canonical_path,
    user_id: context.user_id,
    approved: true,
    policy_decision: "RequireApproval",
    timestamp: Utc::now(),
});
```

---

## Verification Checklist

After implementing fixes, verify:

- [ ] All file writes require `allowed_directories` validation
- [ ] All shell commands use robust `command_validator`
- [ ] Users receive approval prompts for destructive chat tool operations
- [ ] Chat tools and AGI executors use identical security framework
- [ ] Path traversal attacks blocked in all file operations
- [ ] TOCTOU vulnerabilities mitigated with re-validation
- [ ] No direct `tokio::fs` or `tokio::process::Command` usage in chat tools
- [ ] Security audit logs capture all tool executions
- [ ] Unit tests verify security controls cannot be bypassed

---

## Testing Requirements

### Security Test Cases

**Test 1: Path Traversal Attack**

```rust
#[tokio::test]
async fn test_chat_tool_blocks_path_traversal() {
    let result = execute_chat_tool(
        "file_write",
        r#"{"path": "/allowed/../../etc/passwd", "content": "pwned"}"#,
        &app_handle
    ).await;

    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("outside allowed directories"));
}
```

**Test 2: Command Injection Defense**

```rust
#[tokio::test]
async fn test_chat_tool_blocks_command_injection() {
    let result = execute_chat_tool(
        "terminal_execute",
        r#"{"command": "echo test; rm -rf /"}"#,
        &app_handle
    ).await;

    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("dangerous pattern"));
}
```

**Test 3: Approval Required for Destructive Ops**

```rust
#[tokio::test]
async fn test_chat_tool_requires_approval() {
    let result = execute_chat_tool(
        "file_delete",
        r#"{"path": "/allowed/important.txt"}"#,
        &app_handle
    ).await;

    // Should emit approval request event
    let events = collect_emitted_events(&app_handle).await;
    assert!(events.iter().any(|e| e.event_type == "approval:request"));
}
```

---

## Timeline

| Phase     | Tasks                        | Duration   | Owner         |
| --------- | ---------------------------- | ---------- | ------------- |
| Phase 1   | Immediate mitigations        | 2 days     | Security Team |
| Phase 2   | Structural refactoring       | 3 days     | Backend Team  |
| Phase 3   | Enhanced security            | 2 days     | Security Team |
| Testing   | Comprehensive security tests | 2 days     | QA Team       |
| **Total** |                              | **9 days** |               |

---

## References

- **Secure Implementations:**
  - `apps/desktop/src-tauri/src/core/agi/executors/file_executor.rs`
  - `apps/desktop/src-tauri/src/core/agi/executors/terminal_executor.rs`
  - `apps/desktop/src-tauri/src/sys/security/command_validator.rs`
  - `apps/desktop/src-tauri/src/sys/security/policy/engine.rs`

- **Vulnerable Code:**
  - `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs`

- **Security Standards:**
  - OWASP: Command Injection Prevention
  - OWASP: Path Traversal Defense
  - CWE-22: Improper Limitation of a Pathname to a Restricted Directory
  - CWE-78: OS Command Injection

---

**Next Actions:**

1. Review this audit with security team
2. Prioritize Phase 1 implementation (CRITICAL)
3. Create tickets for Phase 2 & 3
4. Schedule security regression testing
5. Update security documentation

**Sign-off Required:**

- [ ] Security Lead
- [ ] Backend Architect
- [ ] Product Security Manager
