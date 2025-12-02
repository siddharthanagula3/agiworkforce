# Changelog

All notable changes to AGI Workforce Desktop App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.0] - 2024-12-02

### 🔒 Security Fixes

#### Critical Security Vulnerabilities Resolved
- **Code Injection in Browser Recorder** (`apps/desktop/src/components/Browser/BrowserRecorder.tsx`)
  - Fixed code injection vulnerability in generated test code
  - Added `escapeForCode()` function to sanitize all user input in generated code
  - Prevents arbitrary code execution via malicious selector/value inputs

- **IPC Race Condition** (`apps/desktop/src/utils/ipc.ts`)
  - Fixed critical race condition in rate limiter allowing bypass under concurrent load
  - Implemented async locking mechanism using `rateLimitLocks` Map
  - Prevents DoS attacks by ensuring atomic check-increment operations

- **Payload Validation Bypass** (`apps/desktop/src/utils/ipc.ts`)
  - Fixed payload validation returning 0 on serialization errors
  - Changed `byteLength()` to throw instead of returning 0
  - Prevents circular references from bypassing 256KB payload limit

- **JWT Token Hardcoding** (`apps/desktop/src/services/auth.ts`)
  - Fixed hardcoded user role to "Viewer" bypassing authentication
  - Implemented proper JWT decoding to extract role from token
  - Added token expiry validation

### 🐛 Bug Fixes

#### Data Corruption

- **Array Splicing Bug** (`apps/desktop/src/stores/editingStore.ts`)
  - Fixed file edits applying at wrong line numbers causing data corruption
  - Properly sorted additions and tracked index adjustments during array splicing
  - Deletions now applied in reverse order before insertions

- **Toast Delay Misconfiguration** (`apps/desktop/src/hooks/useToast.ts`)
  - Fixed toast removal delay set to 278 hours (1,000,000ms)
  - Changed `TOAST_REMOVE_DELAY` from 1000000 to 1000 (1 second)

#### Memory Leaks

- **Event Listener Leaks** (Multiple files)
  - `apps/desktop/src/services/auth.ts`: Added cleanup for inactivity listeners
  - `apps/desktop/src/services/performance.ts`: Added `cleanup()` method for observers and listeners
  - Fixed proper cleanup of window event listeners on unmount

- **Timer Memory Leaks** (Multiple files)
  - `apps/desktop/src/stores/errorStore.ts`: Added `dismissTimers` Map for tracking auto-dismiss timeouts
  - `apps/desktop/src/stores/unifiedChatStore.ts`: Added `fadeTimers` Map for tracking fade timeouts
  - `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/CodeCanvas.tsx`: Return cleanup function for setTimeout
  - `apps/desktop/src/components/ui/PromptDialog.tsx`: Added timeout cleanup in useEffect

- **PerformanceObserver Leaks** (`apps/desktop/src/services/performance.ts`)
  - Added observers array tracking and disconnect on cleanup
  - Prevents memory leaks from unclosed PerformanceObserver instances

#### Race Conditions

- **App.tsx Timeout Race Condition** (`apps/desktop/src/App.tsx`)
  - Fixed race condition with timeout cleanup in onboarding status check
  - Proper timeout ID initialization and cleanup in both success and error paths

- **Tool Execution Silent Failures** (`apps/desktop/src-tauri/src/commands/chat.rs`)
  - **CRITICAL**: Fixed tool calls being silently ignored when ToolExecutor fails to initialize
  - Added comprehensive error handling in both streaming and non-streaming paths
  - Now saves error messages to conversation and returns clear errors to user
  - Previously caused broken conversations where AI thought tools executed but they didn't

#### Type Safety

- **Timer Type Mismatch** (`apps/desktop/src/services/analytics.ts`)
  - Changed `flushTimer` type from `number` to `ReturnType<typeof setInterval>`
  - Prevents potential runtime errors from incorrect timer type

- **Unsafe localStorage Usage** (`apps/desktop/src/services/errorTracking.ts`)
  - Replaced direct localStorage calls with `safeGetJSON`/`safeSetJSON` wrappers
  - Added proper error handling for localStorage failures

#### Other Fixes

- **Unhandled Promise Rejections** (Multiple files)
  - `apps/desktop/src/components/MCP/MCPConnectionStatus.tsx`: Added `.catch()` handlers
  - `apps/desktop/src/services/featureFlags.ts`: Added error handler for interval
  - `apps/desktop/src/hooks/useWindowManager.ts`: Added `void` keyword for async calls

- **Logic Errors**
  - `apps/desktop/src/components/Code/FileTree.tsx`: Removed unreachable disposed check
  - Fixed various dead code paths and incorrect conditionals

- **WebSocket Reconnection** (`apps/desktop/src/services/websocketClient.ts`)
  - Capped reconnection delay at 30 seconds to prevent unbounded exponential backoff

### ✨ Enhancements

#### IPC Layer Improvements (`apps/desktop/src/utils/ipc.ts`)

- **Timeout Protection**
  - Added configurable timeouts per command type
  - Default 30s timeout for all operations
  - Prevents indefinitely hanging operations

- **Retry Logic with Exponential Backoff**
  - Automatic retry for transient failures (TIMEOUT, NETWORK_ERROR, SERVICE_UNAVAILABLE)
  - Exponential backoff: 1s, 2s, 4s delays
  - Only retries safe operations (auth refresh, settings, analytics, health checks)
  - Detailed logging in dev mode

- **Type Validation Utilities**
  - Exported `validateResponse()` function for runtime type checking
  - Exported `TypeGuards` utilities: `isObject`, `isString`, `hasProperty`, etc.
  - Prevents runtime errors from malformed backend responses

- **Command Validation**
  - Added validation for empty/invalid command names
  - Prevents command injection attacks

#### Tool Execution

- **Enhanced Logging** (`apps/desktop/src-tauri/src/commands/chat.rs`)
  - Added comprehensive logging for tool execution flow
  - Log tool executor initialization failures
  - Log when tools are requested but unavailable

### 🛠️ Technical Improvements

- **Safe Mutex Migration** (`apps/desktop/src/utils/localStorage.ts`)
  - Created safe localStorage utilities with error handling
  - Prevents crashes from localStorage quota exceeded or disabled

- **Code Quality**
  - Removed unsafe `as any` type casts where possible
  - Added proper error types and error codes
  - Improved error messages with actionable steps

### 📝 Documentation

- Added comprehensive root README.md with download/installation instructions
- Added MIT LICENSE file
- Created CHANGELOG.md to track changes
- Added security documentation

### 🔧 Build & Release

- Configured Tauri bundle settings for Windows, macOS, and Linux
- Set up proper app icons and metadata
- Configured CSP (Content Security Policy) for security

---

## [4.0.0] - Previous Releases

See git history for changes prior to comprehensive bug fix session.

---

## Summary Statistics

### Bug Fixes in v5.0.0
- **Total Bugs Fixed**: 30+
- **Critical Security Fixes**: 4
- **Memory Leaks Fixed**: 7
- **Race Conditions Fixed**: 3
- **Data Corruption Fixes**: 2
- **Type Safety Improvements**: 5+

### Files Modified
- `apps/desktop/src/services/auth.ts`
- `apps/desktop/src/services/analytics.ts`
- `apps/desktop/src/services/websocketClient.ts`
- `apps/desktop/src/services/performance.ts`
- `apps/desktop/src/services/errorTracking.ts`
- `apps/desktop/src/services/featureFlags.ts`
- `apps/desktop/src/stores/errorStore.ts`
- `apps/desktop/src/stores/unifiedChatStore.ts`
- `apps/desktop/src/stores/editingStore.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/hooks/useToast.ts`
- `apps/desktop/src/hooks/useWindowManager.ts`
- `apps/desktop/src/components/Browser/BrowserRecorder.tsx`
- `apps/desktop/src/components/MCP/MCPConnectionStatus.tsx`
- `apps/desktop/src/components/Code/FileTree.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/CodeCanvas.tsx`
- `apps/desktop/src/components/ui/PromptDialog.tsx`
- `apps/desktop/src/utils/ipc.ts`
- `apps/desktop/src/utils/localStorage.ts`
- `apps/desktop/src-tauri/src/commands/chat.rs`

---

For more details on any change, see the commit history at:
https://github.com/yourusername/agiworkforce-desktop-app/commits/main
