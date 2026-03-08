# Packages Audit Report

Date: 2026-03-08
Auditor: zone-db agent

## packages/types (@agiworkforce/types)

### Files Audited

| File | Status | Notes |
|------|--------|-------|
| `src/index.ts` | PASS | Re-exports all 7 modules correctly |
| `src/context.ts` | PASS | Full context item discriminated union — complete and well-typed |
| `src/customModel.ts` | PASS | `CustomModelConfig` interface — matches desktop store usage |
| `src/errors.ts` | PASS | `ErrorCode`, `ApiError`, `FriendlyError`, `CodedError` — clean |
| `src/prompt-enhancement.ts` | PASS | Reference-only types, enums with const-object issue (see below) |
| `src/signaling.ts` | PASS | `SignalingEvent`, `SignalingRole`, `SignalingClientOptions` — complete |
| `src/tauri.ts` | PASS | DB types, browser automation types, analytics, workflow types |
| `src/tool-events.ts` | PASS | `ToolEvent` discriminated union — matches Rust `ToolEvent` enum exactly |

### Issues Found

**ISSUE 1 — `prompt-enhancement.ts` uses TypeScript enums**: `UseCase` and `APIProvider` are declared as TypeScript `enum` types. These are reference/documentation-only types as noted in the file comment. However, TypeScript enums generate runtime JavaScript code (a value lookup object), which conflicts with the file's stated purpose as pure types. Additionally, enums cannot be used with `isolatedModules` without care. This is a latent issue if the package is ever bundled with `isolatedModules: true`.

Recommendation: Convert `UseCase` and `APIProvider` to `const` objects with `as const` and derive their types via `(typeof UseCase)[keyof typeof UseCase]` — consistent with how `ErrorCode` is handled in `errors.ts`.

**ISSUE 2 — `SubscriptionStatus` and `PlanTier` in `tauri.ts`**: These types are defined in `tauri.ts` but are billing/subscription domain types — they belong in a dedicated `billing.ts` module or in `errors.ts` for proximity to `ErrorCode`. Currently they are isolated in the Tauri module which is semantically wrong. This is a code organization issue, not a type correctness issue.

**ISSUE 3 — `DOMPurifyConfig` in `tauri.ts`**: The `DOMPurifyConfig` interface is unrelated to Tauri types and should be in a `security.ts` or `dom.ts` module. This is a code organization issue.

**No broken exports detected.** All re-exports in `index.ts` resolve correctly to their source files.

**No type mismatches with desktop or web**: The `ToolEvent` union in `tool-events.ts` matches the Rust `ToolEvent` enum (`serde(tag = "type", rename_all = "snake_case")`). The `AgenticLoopStatus` and `ToolLabelEntry` interfaces match what the frontend `chat/toolStore.ts` expects.

---

## packages/utils (@agiworkforce/utils)

### Files Audited

| File | Status | Notes |
|------|--------|-------|
| `src/index.ts` | PASS | Named re-exports — explicit, avoids namespace pollution |
| `src/async.ts` | PASS | `sleep`, `retry`, `debounce`, `throttle`, `withTimeout` — all correct |
| `src/errors.ts` | PASS | `AppError` class, `createError` factory — properly typed |
| `src/format.ts` | PASS | Date/number/bytes/currency formatters — locale-aware |
| `src/signaling.ts` | PASS | Signaling client utilities |
| `src/validation.ts` | PASS | All validators correct; `checkForInjection` is advisory only |

### Issues Found

**ISSUE 4 — `checkForInjection` SQL pattern false positives**: The SQL injection check in `validation.ts` matches on `SELECT`, `INSERT`, `UPDATE`, `DELETE` as standalone words. These keywords appear in legitimate natural language inputs (e.g., "how do I update my profile?" would trigger this check). The function is marked advisory ("should not be relied upon as the sole security measure") but callers may not read this caveat. The regex uses `\b` word boundaries and `/i` flag, making it prone to false positives on everyday English sentences.

This does not affect database security (parameterized queries in the Rust backend handle injection prevention), but it could cause unexpected behavior in any UI component that uses this check to validate user input.

**ISSUE 5 — `validateApiKey` minimum length of 20 with alphanumeric-only pattern**: The default `pattern = /^[a-zA-Z0-9_-]+$/` and `minLength = 20` is suitable for most API key formats, but Anthropic API keys (`sk-ant-...`) contain hyphens, and OpenAI keys (`sk-...`) are shorter than 20 characters before the secret portion. The function accepts custom options, so callers can override — but the defaults are not universally correct for the providers this app integrates with.

**No broken exports detected.** All named exports in `index.ts` correctly reference their source functions.

**Dependency relationship is correct**: `@agiworkforce/utils` depends on `@agiworkforce/types` via `workspace:*`. The `errors.ts` in utils properly imports `ErrorCode` and types from `@agiworkforce/types` and re-exports them to avoid duplication.

---

## Missing Tables Analysis

The following tables are referenced in `apps/web/` (API routes and components) but are NOT present in any of the 4 Supabase migrations in `supabase/migrations/`. They are assumed to exist from earlier migrations applied directly to the Supabase project (not tracked in this repository).

### Tables Confirmed in Migrations (do not recreate)
- `vibe_sessions` — migration 20260305000001
- `vibe_messages` — migration 20260305000002
- `shared_sessions` — migration 20260307000001
- `github_installations` — migration 20260307000002

### Tables Referenced but Not in supabase/migrations/ (assumed pre-existing)

The following 75+ tables are referenced across the web app but have no migration file in this directory. They are not flagged as "missing" since they likely exist from direct Supabase project setup:

**Core auth/billing (high confidence pre-existing)**:
- `profiles`, `subscriptions`, `token_credits`, `credit_transactions`, `organizations`, `organization_members`, `waitlist`

**Agent/workforce tables**:
- `agent_delegations`, `agent_messages`, `agent_collaborations`, `ai_employees`, `ai_tools`, `hired_employees`, `employee_memories`, `workforce_tasks`, `workforce_executions`, `job_assignments`, `multi_agent_conversations`

**Communication**:
- `web_conversations`, `web_messages`, `messaging_connections`, `notifications`, `message_reactions`, `message_bookmarks`, `bookmarked_messages`

**Scheduling**:
- `scheduled_tasks`, `schedule_runs`

**Devices/auth**:
- `desktop_devices`, `mobile_devices`, `device_authorization_codes`, `api_keys`

**Enterprise/SSO**:
- `sso_connections`, `directory_sync_connections`, `directory_sync_events`

**Content/media**:
- `vibe_files`, `vibe_agent_actions`, `vibe_agent_messages`, `public_artifacts`, `shared_artifacts`, `blog_posts`, `blog_categories`, `resources`, `help_articles`, `support_tickets`, `support_ticket_replies`, `support_categories`, `faq_items`, `faqs`

**Analytics/audit**:
- `analytics_events`, `api_usage`, `audit_logs`, `security_audit_logs`, `user_recent_activity`, `user_dashboard_stats`

**Misc**:
- `beta_invites`, `beta_redemptions`, `releases`, `user_connectors`, `user_memories`, `user_shortcuts`, `email_preferences`, `search_history`, `conversation_tags`, `conversation_metadata`, `conversation_branches`, `conversation_participants`, `chat_folders`, `sync_data`, `social_media_analyses`, `backup_metadata`, `backup_storage`, `cache_entries`, `tool_executions`, `token_transactions`, `user_subscriptions`, `subscription_plans`

**Potentially missing (referenced in code but not obviously in project setup)**:
- `vibe_agent_actions`, `vibe_agent_messages` — VIBE-specific tables that extend vibe_sessions; may need migration files if not yet created
- `workforce_tasks`, `workforce_executions` — workforce orchestration tables; no evidence of prior migration

### Recommendation

Add migration files for `vibe_agent_actions`, `vibe_agent_messages`, `workforce_tasks`, and `workforce_executions` if these features are newly implemented. All other tables are assumed pre-existing from direct project setup.

---

## Cross-Surface Type Consistency

| Type | desktop/src/types | web/types | packages/types | Consistent? |
|------|-------------------|-----------|----------------|-------------|
| ToolEvent | Uses @agiworkforce/types | Uses @agiworkforce/types | Defined here | YES |
| AgenticLoopStatus | Uses @agiworkforce/types | N/A | Defined here | YES |
| ContextItem | Inline local types | N/A | Defined here | PARTIAL — desktop may have local copy |
| SignalingEvent | Uses @agiworkforce/types | Uses @agiworkforce/types | Defined here | YES |
| CustomModelConfig | Uses @agiworkforce/types | N/A | Defined here | YES |
| SubscriptionStatus | Uses @agiworkforce/types | Local types exist | In tauri.ts | WARN — web may duplicate |
| PlanTier | Uses @agiworkforce/types | Local types exist | In tauri.ts | WARN — web may duplicate |

---

## Summary

| Package | Files | Issues Found | Severity |
|---------|-------|--------------|----------|
| @agiworkforce/types | 8 files | 3 issues | Low (code organization + enum pattern) |
| @agiworkforce/utils | 6 files | 2 issues | Low (false positives in advisory-only functions) |

**Total issues**: 5 across both packages. No broken exports. No type mismatches that would cause build failures. No security issues in the packages themselves.

**Missing tables in supabase/migrations/**: 75+ tables referenced but assumed pre-existing. 4 tables (`vibe_agent_actions`, `vibe_agent_messages`, `workforce_tasks`, `workforce_executions`) may need new migration files depending on their implementation status.
