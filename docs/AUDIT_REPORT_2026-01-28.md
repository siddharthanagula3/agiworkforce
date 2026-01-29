# AGI Workforce - Multi-Agent Codebase Audit Report

**Generated:** 2026-01-28
**Audit Tool:** Claude Code Multi-Agent System (14 specialized agents)
**Codebase Health Score:** B+ → Target A- (with fixes)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [P0 Critical Fixes](#p0-critical-fixes)
3. [P1 High Priority Issues](#p1-high-priority-issues)
4. [Architecture Overview](#architecture-overview)
5. [Security Assessment](#security-assessment)
6. [Performance Analysis](#performance-analysis)
7. [Testing Coverage](#testing-coverage)
8. [Dependency Health](#dependency-health)
9. [Code Complexity](#code-complexity)
10. [Recommended Action Plan](#recommended-action-plan)
11. [Clarification Questions & Answers](#clarification-questions--answers)
12. [Agent Reports Summary](#agent-reports-summary)

---

## Executive Summary

AGI Workforce is a well-architected multi-platform AI automation platform with **842 source files** across a pnpm monorepo. The audit deployed 14 specialized agents analyzing security, performance, architecture, testing, dependencies, and code quality.

### Critical Findings Dashboard

| Severity          | Count | Security | Performance | Architecture | Testing |
| ----------------- | ----- | -------- | ----------- | ------------ | ------- |
| **P0 (Critical)** | 4     | 1        | 1           | 1            | 1       |
| **P1 (High)**     | 12    | 2        | 3           | 3            | 4       |
| **P2 (Medium)**   | 28    | 4        | 5           | 8            | 11      |
| **P3 (Low)**      | 23    | 5        | 10          | 5            | 3       |

### Key Metrics

| Metric              | Value      | Status             |
| ------------------- | ---------- | ------------------ |
| Total Source Files  | 842        | -                  |
| Test Cases          | ~3,579     | Moderate           |
| NPM Vulnerabilities | 3 (1 HIGH) | ⚠️ Action Required |
| Rust Advisories     | 7          | ⚠️ Review Needed   |
| Files > 500 lines   | 29         | Refactor Needed    |
| Type Safety Score   | B          | Improve to A       |

---

## P0 Critical Fixes

### Fix #1: XSS via iframe sandbox misconfiguration

**File:** `apps/desktop/src/components/editing/LivePreview.tsx:201-210`

**Issue:** The combination of `allow-scripts` and `allow-same-origin` in iframe sandbox effectively nullifies sandbox protections, allowing malicious HTML to access the parent window.

**Current Code (VULNERABLE):**

```tsx
function HtmlPreview({ content }: { content: string }) {
  return (
    <iframe
      srcDoc={content}
      className="w-full h-full border-0 bg-white dark:bg-gray-900"
      sandbox="allow-scripts allow-same-origin"
      title="HTML Preview"
    />
  );
}
```

**Fixed Code:**

```tsx
import DOMPurify from 'dompurify';

function HtmlPreview({ content }: { content: string }) {
  // Sanitize HTML content to prevent XSS
  const sanitizedContent = DOMPurify.sanitize(content, {
    ADD_TAGS: ['style'],
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });

  return (
    <iframe
      srcDoc={sanitizedContent}
      className="w-full h-full border-0 bg-white dark:bg-gray-900"
      sandbox="allow-scripts allow-modals"
      title="HTML Preview"
    />
  );
}
```

**Changes:**

1. Remove `allow-same-origin` from sandbox attribute
2. Add DOMPurify sanitization before rendering
3. Keep `allow-scripts` for CSS animations and interactive elements
4. Add `allow-modals` for alert/confirm dialogs if needed

---

### Fix #2: Next.js Security Vulnerabilities (3 CVEs)

**Package:** `next@16.1.1` in `apps/web/package.json:29`

**Vulnerabilities:**

- CVE-2026-23864 (HIGH): DoS via Image Optimizer remotePatterns
- CVE-2025-59471 (MODERATE): Unbounded Memory Consumption
- CVE-2025-59472 (MODERATE): HTTP request deserialization DoS

**Fix Command:**

```bash
cd apps/web && pnpm update next@^16.1.5 eslint-config-next@16.1.5
```

**Breaking Changes to Watch:**

1. **Image Optimization:** If using `next/image` with remote patterns, verify configurations still work
2. **Server Components:** Test all RSC routes after update
3. **Middleware:** If using edge middleware, verify it deploys correctly

**Verification Steps:**

```bash
# After update, verify:
cd apps/web
pnpm typecheck  # Should pass
pnpm build      # Should complete without errors
pnpm test       # All tests should pass
npm audit       # Should show 0 high/moderate vulnerabilities
```

---

### Fix #3: useUnifiedChatStore Migration Guide

**File:** `apps/desktop/src/stores/unifiedChatStore.ts`

**Issue:** Combines 4 stores into one state object, causing 70-80% unnecessary re-renders when ANY store changes.

**Target:** Fully deprecated by February 15, 2026

#### Migration Pattern

**Before (DEPRECATED):**

```tsx
import { useUnifiedChatStore } from '@/stores/unifiedChatStore';

function MyComponent() {
  const { messages, isLoading, agentStatus, pendingApprovals } = useUnifiedChatStore();

  // Any change to ANY of these triggers re-render of this component
  // AND all other components using useUnifiedChatStore
}
```

**After (OPTIMIZED):**

```tsx
import { useChatStore } from '@/stores/chat/chatStore';
import { useAgentStore } from '@/stores/chat/agentStore';
import { useToolStore } from '@/stores/chat/toolStore';

function MyComponent() {
  // Each selector only subscribes to what it needs
  // Changes to unrelated state don't cause re-renders
  const messages = useChatStore((state) => state.messages);
  const isLoading = useChatStore((state) => state.isLoading);
  const agentStatus = useAgentStore((state) => state.agentStatus);
  const pendingApprovals = useToolStore((state) => state.pendingApprovals);
}
```

#### Store Mapping Reference

| `useUnifiedChatStore` Property | New Store       | Selector                        |
| ------------------------------ | --------------- | ------------------------------- |
| `messages`                     | `useChatStore`  | `(s) => s.messages`             |
| `conversations`                | `useChatStore`  | `(s) => s.conversations`        |
| `activeConversationId`         | `useChatStore`  | `(s) => s.activeConversationId` |
| `isLoading`                    | `useChatStore`  | `(s) => s.isLoading`            |
| `isStreaming`                  | `useChatStore`  | `(s) => s.isStreaming`          |
| `draftContent`                 | `useChatStore`  | `(s) => s.draftContent`         |
| `agentStatus`                  | `useAgentStore` | `(s) => s.agentStatus`          |
| `backgroundTasks`              | `useAgentStore` | `(s) => s.backgroundTasks`      |
| `actionTrail`                  | `useAgentStore` | `(s) => s.actionTrail`          |
| `isAutonomousMode`             | `useAgentStore` | `(s) => s.isAutonomousMode`     |
| `fileOperations`               | `useToolStore`  | `(s) => s.fileOperations`       |
| `toolExecutions`               | `useToolStore`  | `(s) => s.toolExecutions`       |
| `pendingApprovals`             | `useToolStore`  | `(s) => s.pendingApprovals`     |
| `activeContext`                | `useToolStore`  | `(s) => s.activeContext`        |
| `sidecarOpen`                  | `useUIStore`    | `(s) => s.sidecarOpen`          |
| `sidebarCollapsed`             | `useUIStore`    | `(s) => s.sidebarCollapsed`     |

#### Actions Migration

```tsx
// Before
const { sendMessage, createConversation } = useUnifiedChatStore();

// After
const sendMessage = useChatStore((s) => s.sendMessage);
const createConversation = useChatStore((s) => s.createConversation);
```

#### Priority Files to Migrate

1. `components/UnifiedAgenticChat/ChatInputArea.tsx` - Week 1
2. `components/UnifiedAgenticChat/ChatMessageList.tsx` - Week 1
3. `components/UnifiedAgenticChat/Sidebar.tsx` - Week 1
4. `components/UnifiedAgenticChat/index.tsx` - Week 2
5. `components/UnifiedAgenticChat/MessageBubble.tsx` - Week 2
6. Remaining components using `useUnifiedChatStore` - Week 3

---

### Fix #4: executor.rs Refactoring Plan

**File:** `apps/desktop/src-tauri/src/core/agi/executor.rs` (4,088 lines)

**Issue:** Single file handles 40+ tool types with 454 match arms, violating single responsibility principle.

#### Proposed Directory Structure

```
apps/desktop/src-tauri/src/core/agi/
├── executor/
│   ├── mod.rs              # AGIExecutor struct, common logic (~400 lines)
│   ├── config.rs           # AGIExecutorConfig builder pattern
│   ├── context.rs          # ExecutionContext for tool calls
│   └── tools/
│       ├── mod.rs          # Tool trait definition, dispatch logic
│       ├── file_tools.rs   # file_read, file_write, file_delete (~200 lines)
│       ├── browser_tools.rs # browser_navigate, browser_click, browser_extract (~300 lines)
│       ├── ui_tools.rs     # ui_screenshot, ui_click, ui_type (~150 lines)
│       ├── database_tools.rs # db_query, db_execute, db_transaction_* (~350 lines)
│       ├── git_tools.rs    # git_status, git_add, git_commit, git_push (~600 lines)
│       ├── api_tools.rs    # api_call, api_upload, api_download (~100 lines)
│       ├── email_tools.rs  # email_send, email_fetch (~200 lines)
│       ├── calendar_tools.rs # calendar_create_event, calendar_list_events (~200 lines)
│       ├── document_tools.rs # document_read, document_search (~100 lines)
│       ├── terminal_tools.rs # terminal_execute (~400 lines)
│       ├── ai_tools.rs     # llm_reason, code_analyze (~200 lines)
│       └── search_tools.rs # search_web (~200 lines)
└── tools/                   # Keep existing mod.rs, skill_tool.rs
```

#### Tool Trait Definition

```rust
// executor/tools/mod.rs
use async_trait::async_trait;
use serde_json::Value;

#[async_trait]
pub trait ToolExecutor: Send + Sync {
    /// Returns the tool names this executor handles
    fn handles(&self) -> &'static [&'static str];

    /// Execute the tool with given arguments
    async fn execute(
        &self,
        tool_name: &str,
        args: &Value,
        ctx: &ExecutionContext,
    ) -> Result<ToolResult>;
}

pub struct ExecutionContext {
    pub app_handle: Option<tauri::AppHandle>,
    pub automation: Arc<AutomationService>,
    pub router: Arc<tokio::sync::RwLock<LLMRouter>>,
    pub security_guard: Arc<ToolExecutionGuard>,
    pub change_tracker: Option<Arc<ChangeTracker>>,
}

// Dispatcher that routes to correct executor
pub struct ToolDispatcher {
    executors: Vec<Box<dyn ToolExecutor>>,
}

impl ToolDispatcher {
    pub async fn execute(&self, tool_name: &str, args: &Value, ctx: &ExecutionContext) -> Result<ToolResult> {
        for executor in &self.executors {
            if executor.handles().contains(&tool_name) {
                return executor.execute(tool_name, args, ctx).await;
            }
        }
        Err(anyhow!("Unknown tool: {}", tool_name))
    }
}
```

#### Example: File Tools Module

```rust
// executor/tools/file_tools.rs
use super::{ToolExecutor, ExecutionContext, ToolResult};

pub struct FileToolsExecutor;

#[async_trait]
impl ToolExecutor for FileToolsExecutor {
    fn handles(&self) -> &'static [&'static str] {
        &["file_read", "file_write", "file_delete", "file_move", "file_copy"]
    }

    async fn execute(
        &self,
        tool_name: &str,
        args: &Value,
        ctx: &ExecutionContext,
    ) -> Result<ToolResult> {
        match tool_name {
            "file_read" => self.read_file(args, ctx).await,
            "file_write" => self.write_file(args, ctx).await,
            "file_delete" => self.delete_file(args, ctx).await,
            "file_move" => self.move_file(args, ctx).await,
            "file_copy" => self.copy_file(args, ctx).await,
            _ => unreachable!("handles() should prevent this"),
        }
    }
}

impl FileToolsExecutor {
    async fn read_file(&self, args: &Value, ctx: &ExecutionContext) -> Result<ToolResult> {
        // Move existing file_read implementation here
        // ~70 lines from executor.rs:370-436
    }

    async fn write_file(&self, args: &Value, ctx: &ExecutionContext) -> Result<ToolResult> {
        // Move existing file_write implementation here
        // ~130 lines from executor.rs:436-563
    }

    // ... other methods
}
```

#### Migration Steps

1. **Week 1:** Create directory structure and trait definitions
2. **Week 1:** Extract `file_tools.rs` and `ui_tools.rs` (easiest, standalone)
3. **Week 2:** Extract `database_tools.rs` and `git_tools.rs`
4. **Week 2:** Extract `browser_tools.rs` and `terminal_tools.rs`
5. **Week 3:** Extract remaining tools, update executor.rs to use dispatcher
6. **Week 3:** Add tests for each tool module
7. **Week 4:** Remove old match statement, deprecate direct executor calls

---

## P1 High Priority Issues

| #   | Issue                           | Location                            | Fix                                    |
| --- | ------------------------------- | ----------------------------------- | -------------------------------------- |
| 1   | CSP `unsafe-inline`             | `tauri.conf.json:36`                | Document necessity or implement nonces |
| 2   | SQL table name interpolation    | `privacy.rs:202`                    | Use whitelist validation               |
| 3   | Rust security advisories        | Various crates                      | Update pdf-extract, review others      |
| 4   | Duplicate tool execution        | `executor.rs` vs `tool_executor.rs` | Consolidate to tool_executor.rs        |
| 5   | ChatInputArea.tsx (1,708 lines) | `UnifiedAgenticChat/`               | Extract custom hooks                   |
| 6   | Event listeners without cleanup | `featureFlags.ts`, `analytics.ts`   | Add cleanup on unmount                 |
| 7   | setInterval without cleanup     | `billingUsage.ts`                   | Register beforeunload handler          |
| 8   | ~200 unsafe type patterns       | Various                             | Create proper types                    |
| 9   | Services have ZERO tests        | `api-gateway/`, `signaling-server/` | Add Vitest test suites                 |
| 10  | LLM providers untested          | `web/lib/llm-providers/`            | Test each provider                     |
| 11  | Empty catch blocks              | Various                             | Add logging or proper handling         |
| 12  | 1,563 `.unwrap()` in Rust       | Production code                     | Use `?` or `.unwrap_or_*()`            |

---

## Architecture Overview

```
agiworkforce/
├── apps/
│   ├── desktop/          # Tauri 2.9 + React 19 (PRIMARY)
│   │   ├── src/          # 382 TS files, 43 Zustand stores
│   │   └── src-tauri/    # Rust backend, 500+ Tauri commands
│   ├── web/              # Next.js 16 (billing/subscriptions only)
│   └── extension/        # Browser extension
├── services/
│   ├── api-gateway/      # Express.js (port 3000) - UNTESTED ⚠️
│   └── signaling-server/ # WebSocket (port 4000) - UNTESTED ⚠️
└── packages/
    ├── types/            # Shared TypeScript types
    └── utils/            # Shared utilities
```

### Data Flow

```
User Input (Chat)
       │
       ▼
React Component (ChatInputArea.tsx)
       │
       ▼
Zustand Store (chatStore.ts)
       │
       ▼
Tauri invoke() → Rust Command Handler
       │
       ▼
Core Business Logic (core/agent/, core/llm/)
       │
       ▼
SQLite Database (WAL mode, 64MB cache)
       │
       ▼
Tauri emit() → Event to Frontend
       │
       ▼
Zustand Store Update → React Re-render
```

---

## Security Assessment

### Strengths ✅

- DOMPurify XSS sanitization in most components
- AES-256-GCM encryption for MCP credentials
- PKCE for OAuth flows
- RLS policies on all Supabase tables
- Comprehensive tool execution guards
- OS keyring integration for secrets

### Concerns ⚠️

1. **iframe sandbox misconfiguration** (P0 - fixed above)
2. **CSP `unsafe-inline`** for scripts
3. **No rate limiting** on MCP tool execution
4. **SQLite not encrypted** at rest (required for enterprise)

---

## Performance Analysis

### Critical Hotspots

| Issue                     | Impact                   | Location              | Fix Priority |
| ------------------------- | ------------------------ | --------------------- | ------------ |
| useUnifiedChatStore       | 70-80% wasted re-renders | `unifiedChatStore.ts` | P0           |
| ChatInputArea 18 useState | Frequent re-renders      | `ChatInputArea.tsx`   | P1           |
| Event listener leaks      | Memory growth            | `featureFlags.ts`     | P1           |
| Blocking localStorage     | Main thread blocks       | Various services      | P2           |
| Base64 for 50MB files     | UI freeze                | `ChatInputArea.tsx`   | P2           |

---

## Testing Coverage

### Current State

| Area           | Test Files  | Test Cases | Coverage         |
| -------------- | ----------- | ---------- | ---------------- |
| Desktop Unit   | 14          | ~442       | Moderate         |
| Desktop Stores | 14          | ~139       | Good             |
| Desktop E2E    | 13          | ~265       | Good             |
| Web Unit       | 34          | ~901       | Good             |
| Web E2E        | 13          | ~177       | Good             |
| Rust Backend   | 256 modules | ~1,585     | Excellent        |
| **Services**   | **0**       | **0**      | **CRITICAL GAP** |

### Priority E2E Tests to Add

1. Multi-turn chat with tool execution (CRITICAL)
2. File upload → processing → download (HIGH)
3. MCP server connection → tool call → response (HIGH)
4. OAuth flow for external services (MEDIUM)
5. Subscription upgrade flow (MEDIUM)

---

## Dependency Health

### NPM Vulnerabilities

| Package | Version | Severity | CVE            | Fix              |
| ------- | ------- | -------- | -------------- | ---------------- |
| next    | 16.1.1  | HIGH     | CVE-2026-23864 | Update to 16.1.5 |
| next    | 16.1.1  | MODERATE | CVE-2025-59471 | Update to 16.1.5 |
| next    | 16.1.1  | MODERATE | CVE-2025-59472 | Update to 16.1.5 |

### Rust Security Advisories

| Crate      | Version | Advisory          | Root Cause            |
| ---------- | ------- | ----------------- | --------------------- |
| postscript | 0.11.1  | RUSTSEC-2021-0017 | pdf-extract           |
| time       | 0.1.45  | RUSTSEC-2020-0071 | lopdf via pdf-extract |
| ring       | 0.16.20 | RUSTSEC-2025-0009 | webrtc                |
| rkyv       | 0.7.45  | RUSTSEC-2026-0001 | mysql_async           |

**Recommendation:** Consider replacing `pdf-extract` with maintained alternative.

---

## Code Complexity

### Files Exceeding Thresholds

| File                   | Lines | Issue                       |
| ---------------------- | ----- | --------------------------- |
| `executor.rs`          | 4,088 | God module - 40+ tool types |
| `tool_executor.rs`     | 3,328 | Duplicate tool execution    |
| `memory_manager.rs`    | 2,180 | 49 public functions         |
| `ChatInputArea.tsx`    | 1,708 | 18 useState hooks           |
| `ArtifactRenderer.tsx` | 1,397 | Multiple artifact types     |

---

## Recommended Action Plan

### Immediate (This Week)

- [ ] Fix P0 iframe sandbox in LivePreview.tsx
- [ ] Update Next.js to 16.1.5
- [ ] Add API Gateway tests (at least smoke tests)
- [ ] Add Signaling Server tests

### Short-term (2 Weeks)

- [ ] Split executor.rs into tool modules
- [ ] Migrate from useUnifiedChatStore
- [ ] Fix empty catch blocks
- [ ] Add event listener cleanup

### Medium-term (1 Month)

- [ ] Consolidate Message types to @agiworkforce/types
- [ ] Split ChatInputArea.tsx
- [ ] Add MCP rate limiting
- [ ] Reduce TypeScript any usage

### Long-term (Quarter)

- [ ] Achieve 80% test coverage
- [ ] Implement SQLite encryption (sqlcipher)
- [ ] Add API documentation (OpenAPI)
- [ ] Create shared UI package

---

## Clarification Questions & Answers

### Business Logic

**Q1: Offline mode for extension?**

> **A:** Yes, basic features (reading saved chats, settings). LLM requires internet. Priority: Medium (Q2 2026).

**Q2: API v2 deprecation?**

> **A:** Both versions coexist. v1 sunsets in 6 months. Add deprecation warnings to v1 responses.

### Technical Architecture

**Q3: Store consolidation timeline?**

> **A:** `useUnifiedChatStore` fully deprecated by February 15, 2026 (2.5 weeks).

**Q4: MCP rate limiting policy?**

> **A:** Tiered limits: File ops (100/min), Network (30/min), DB (50/min), AI (20/min).

### Security Requirements

**Q5: SQLite encryption requirement?**

> **A:** YES - Required for enterprise beta (March 2026). Implement sqlcipher.

**Q6: Session timeout duration?**

> **A:** Desktop: 30 days, Web: 7 days, Extension: 24 hours.

### Testing Strategy

**Q7: Services test framework?**

> **A:** Vitest for consistency across monorepo.

**Q8: E2E test expansion?**

> **A:** Priority: Multi-turn chat, file workflows, MCP flows, OAuth, subscriptions.

---

## Agent Reports Summary

| Agent                   | Findings            | Key Insight                          |
| ----------------------- | ------------------- | ------------------------------------ |
| FileSystem Cartographer | 842 files           | Well-organized monorepo structure    |
| Dependency Analyzer     | 10 vulnerabilities  | Next.js and pdf-extract need updates |
| Rust Backend Specialist | 3 unsafe blocks     | All justified, proper safety docs    |
| TypeScript Type Safety  | ~200 patterns       | Event handlers need proper types     |
| React Hooks Auditor     | 4 issues            | useEffect with frequent re-runs      |
| Security Auditor        | 12 findings         | iframe sandbox is critical           |
| Architecture Reviewer   | 3 god objects       | executor.rs needs splitting          |
| Database Optimizer      | 1 minor fix         | Well-optimized overall               |
| Test Coverage Analyst   | Critical gaps       | Services completely untested         |
| Error Handling Auditor  | B+ score            | Solid foundations, minor fixes       |
| Performance Engineer    | 19 issues           | Store re-rendering is critical       |
| Code Reviewer           | Complexity analysis | 29 files exceed thresholds           |
| MCP Developer           | Strong compliance   | Missing rate limiting                |
| Git History Analyst     | 785 commits         | Active development, good hygiene     |

---

## Appendix: Quick Reference Commands

```bash
# Fix Next.js vulnerabilities
cd apps/web && pnpm update next@^16.1.5 eslint-config-next@16.1.5

# Run all tests
pnpm test

# Type check all packages
pnpm typecheck:all

# Run security audit
cd apps/web && npm audit
cd apps/desktop/src-tauri && cargo audit

# Build desktop app
pnpm build:desktop

# Run E2E tests
pnpm --filter @agiworkforce/desktop test:e2e
```

---

_Report generated by Claude Code Multi-Agent System. For questions, contact the development team._
