# System Automation Architecture

## Overview

This document outlines the comprehensive system automation capabilities for the AGI Workforce application, enabling Claude to interact with the user's computer system safely and securely.

## Architecture Layers

### 1. Security & Permission Layer (Bottom)
- **Permission System**: Fine-grained control over what operations are allowed
- **Audit Logging**: Complete traceability of all automation actions
- **Command Validation**: Whitelist/blacklist with pattern matching
- **Sandboxing**: Isolated execution environments for dangerous operations
- **Rate Limiting**: Prevent abuse and runaway operations

### 2. Core Automation Layer (Middle)
- **Command Executor**: Safe shell command execution with timeout and resource limits
- **File Operations**: CRUD operations with permission checks and path validation
- **Application Control**: Launch, terminate, and manage applications
- **Clipboard Manager**: Read/write clipboard with history tracking
- **Process Manager**: Monitor and control running processes

### 3. API & Command Layer (Upper)
- **Tauri Commands**: Bridge between Rust backend and TypeScript frontend
- **REST-like Interface**: Consistent API patterns for all operations
- **Event System**: Real-time notifications for operation status
- **Error Handling**: Comprehensive error types with recovery suggestions

### 4. Frontend Layer (Top)
- **Permission Dialog**: User approval for sensitive operations
- **Automation History**: View past operations with filtering and search
- **Settings Panel**: Configure automation preferences and restrictions
- **Visual Feedback**: Loading states, progress indicators, and notifications

## Security Model

### Permission Types

1. **FILE_READ**: Read files and directories
2. **FILE_WRITE**: Write and modify files
3. **FILE_DELETE**: Delete files and directories
4. **FILE_EXECUTE**: Execute files
5. **COMMAND_EXECUTE**: Execute shell commands
6. **APP_LAUNCH**: Launch applications
7. **APP_TERMINATE**: Terminate applications
8. **CLIPBOARD_READ**: Read clipboard contents
9. **CLIPBOARD_WRITE**: Write to clipboard
10. **PROCESS_LIST**: List running processes
11. **PROCESS_TERMINATE**: Terminate processes
12. **NETWORK_REQUEST**: Make network requests (future)

### Permission States

- **ALLOWED**: Always allowed without prompting
- **PROMPT**: Require user confirmation each time
- **PROMPT_ONCE**: Ask once, then remember decision
- **DENIED**: Always denied

### Security Measures

1. **Path Validation**
   - Prevent directory traversal (../)
   - Block system directories (C:\Windows, /etc, /System)
   - Validate absolute paths
   - Check path existence and permissions

2. **Command Whitelisting**
   - Safe commands: ls, dir, cat, echo, pwd, git (read-only)
   - Moderate risk: mv, cp, mkdir, rm (with confirmation)
   - High risk: curl, wget, ssh, sudo (explicit permission)
   - Blocked: format, dd, rm -rf / (always denied)

3. **Resource Limits**
   - Max execution time: 30 seconds (configurable)
   - Max output size: 10 MB
   - Max concurrent operations: 5
   - Rate limiting: 10 operations per minute

4. **Sandboxing**
   - Limited environment variables
   - Restricted network access
   - No privileged operations
   - Isolated working directory

5. **Audit Trail**
   - Every operation logged with timestamp
   - User approval recorded
   - Command arguments and results stored
   - Failed operations tracked

## Database Schema

### Permissions Table
```sql
CREATE TABLE permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    permission_type TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('allowed', 'prompt', 'prompt_once', 'denied')),
    pattern TEXT, -- Optional pattern for fine-grained control
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Audit Log Table
```sql
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL,
    operation_details TEXT NOT NULL, -- JSON
    permission_type TEXT NOT NULL,
    approved INTEGER NOT NULL CHECK(approved IN (0, 1)),
    success INTEGER NOT NULL CHECK(success IN (0, 1)),
    error_message TEXT,
    duration_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Command History Table
```sql
CREATE TABLE command_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL,
    args TEXT, -- JSON array
    working_dir TEXT NOT NULL,
    exit_code INTEGER,
    stdout TEXT,
    stderr TEXT,
    duration_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints (Tauri Commands)

### Command Execution
```typescript
// Execute a shell command with user approval
automation_execute_command(command: string, args?: string[], options?: ExecuteOptions): Promise<ExecuteResult>

// Get command execution history
automation_get_command_history(limit?: number, offset?: number): Promise<CommandHistory[]>
```

### File Operations
```typescript
// Read file with permission check
automation_read_file(path: string): Promise<string>

// Write file with permission check
automation_write_file(path: string, content: string): Promise<void>

// Delete file/directory with permission check
automation_delete_path(path: string): Promise<void>

// Copy file/directory
automation_copy_path(source: string, destination: string): Promise<void>

// Move file/directory
automation_move_path(source: string, destination: string): Promise<void>

// Create directory
automation_create_directory(path: string): Promise<void>

// List directory contents
automation_list_directory(path: string): Promise<FileInfo[]>
```

### Application Control
```typescript
// Launch application
automation_launch_app(app_path: string, args?: string[]): Promise<number> // Returns PID

// Terminate application by PID
automation_terminate_app(pid: number): Promise<void>

// List running applications
automation_list_apps(): Promise<AppInfo[]>

// Check if application is running
automation_is_app_running(app_name: string): Promise<boolean>
```

### Clipboard Operations
```typescript
// Read clipboard text
automation_read_clipboard(): Promise<string>

// Write clipboard text
automation_write_clipboard(text: string): Promise<void>

// Get clipboard history
automation_get_clipboard_history(limit?: number): Promise<ClipboardEntry[]>
```

### Permission Management
```typescript
// Get permission state
automation_get_permission(type: PermissionType): Promise<PermissionState>

// Set permission state
automation_set_permission(type: PermissionType, state: PermissionState): Promise<void>

// Request permission (shows dialog if needed)
automation_request_permission(type: PermissionType, reason: string): Promise<boolean>

// Get all permissions
automation_get_all_permissions(): Promise<Permission[]>

// Reset all permissions
automation_reset_permissions(): Promise<void>
```

### Audit & History
```typescript
// Get audit log
automation_get_audit_log(filters?: AuditFilters): Promise<AuditEntry[]>

// Get automation statistics
automation_get_statistics(): Promise<AutomationStats>

// Clear old audit logs
automation_clear_audit_log(before_date: string): Promise<number> // Returns deleted count
```

## Frontend Components

### 1. PermissionDialog Component
- Shows when permission is required
- Displays operation details and risk level
- Options: Allow Once, Always Allow, Deny
- "Remember my choice" checkbox
- Visual warning for high-risk operations

### 2. AutomationHistoryViewer Component
- Tabular view of past operations
- Filters: date range, operation type, success/failure
- Search by command or file path
- Expandable rows showing full details
- Export to CSV functionality

### 3. AutomationSettings Component
- Toggle automation on/off
- Configure permission defaults
- Set resource limits (timeout, max output size)
- Manage whitelisted/blacklisted commands
- Clear history and audit logs
- Enable/disable audit logging

### 4. OperationFeedback Component
- Toast notifications for operation completion
- Progress bar for long-running operations
- Animated icon showing operation type
- Dismissable success/error messages

### 5. PermissionManager Component
- Grid view of all permission types
- Quick toggle for each permission
- Visual indicators for permission state
- Reset to defaults button
- Import/export permission profiles

## Cross-Platform Considerations

### Windows (Primary Support)
- Use Windows API for process management
- PowerShell for complex commands
- Windows-specific path handling (backslashes)
- Registry access (future enhancement)

### macOS (Secondary Support)
- Use `launchctl` for app management
- AppleScript for advanced automation (future)
- Unix shell commands
- macOS permission system integration

### Linux (Tertiary Support)
- systemd for service management
- X11/Wayland for window management
- Standard Unix tools
- Desktop-specific integrations (GNOME, KDE)

### Platform Abstraction
```rust
trait PlatformAutomation {
    fn execute_command(&self, cmd: &str, args: &[&str]) -> Result<Output>;
    fn launch_app(&self, app: &str) -> Result<u32>;
    fn terminate_process(&self, pid: u32) -> Result<()>;
    fn list_processes(&self) -> Result<Vec<ProcessInfo>>;
}
```

## Error Handling Strategy

### Error Types
1. **PermissionDenied**: Operation not allowed by user
2. **PathNotFound**: File or directory doesn't exist
3. **PathAccessDenied**: Insufficient OS-level permissions
4. **CommandNotFound**: Command not in PATH
5. **CommandTimeout**: Operation exceeded time limit
6. **CommandFailed**: Command exited with non-zero code
7. **InvalidArgument**: Malformed input parameters
8. **RateLimitExceeded**: Too many operations in short time
9. **ResourceLimitExceeded**: Output too large or resource exhausted
10. **SystemError**: Unexpected OS-level error

### Error Recovery
- Provide actionable error messages
- Suggest fixes (e.g., "Grant file permission in settings")
- Offer retry with modified parameters
- Log errors for debugging
- Graceful degradation when possible

## Implementation Phases

### Phase 1: Foundation (Current)
- Database schema and migrations
- Permission system implementation
- Basic command execution with validation
- Audit logging infrastructure

### Phase 2: Core Features
- File operations with safety checks
- Application launcher and control
- Clipboard operations
- Frontend permission dialog

### Phase 3: User Interface
- Automation history viewer
- Settings panel
- Visual feedback components
- Permission manager

### Phase 4: Advanced Features
- Command templates and shortcuts
- Macro recording and playback
- Automation workflows
- Scheduled tasks

### Phase 5: Platform Expansion
- Full macOS support
- Linux support
- Cross-platform testing
- Platform-specific optimizations

## Testing Strategy

### Unit Tests
- Permission validation logic
- Command sanitization
- Path validation
- Rate limiting

### Integration Tests
- Database operations
- Command execution end-to-end
- File operations with real filesystem
- Permission flows

### Security Tests
- Directory traversal attempts
- Command injection attempts
- Path validation edge cases
- Resource limit enforcement

### User Acceptance Tests
- Permission dialog workflow
- History viewer functionality
- Settings persistence
- Error message clarity

## Performance Considerations

1. **Command Execution**: Use async/await to prevent blocking
2. **Audit Logging**: Batch writes to database
3. **History Viewer**: Pagination and virtual scrolling
4. **Permission Checks**: Cache frequently accessed permissions
5. **Process Listing**: Debounce and cache results

## Privacy & Data Retention

1. **Audit Logs**: Retain for 90 days by default (configurable)
2. **Command History**: Retain for 30 days by default
3. **Clipboard History**: Retain for 7 days, respect sensitive data
4. **PII Handling**: Mask sensitive information in logs
5. **Export Controls**: User can export their automation data

## Future Enhancements

1. **AI-Powered Safety**: Use LLM to analyze command safety
2. **Workflow Engine**: Chain multiple automation operations
3. **Remote Execution**: Execute commands on remote machines
4. **Container Integration**: Docker/Podman support
5. **Cloud Storage**: Sync automation history across devices
6. **Browser Automation**: Enhanced browser control via Playwright
7. **GUI Automation**: Record and replay GUI interactions
8. **Natural Language**: "Create a folder named 'projects'" -> automated execution

## References

- [Tauri Security Best Practices](https://tauri.app/v1/guides/security/best-practices)
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Windows Security APIs](https://docs.microsoft.com/en-us/windows/security/)
- [Principle of Least Privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege)
