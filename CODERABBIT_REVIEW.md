# CodeRabbit Full Codebase Review

Generated: 2026-03-06
Sources: CodeRabbit CLI (batches 1-2) + GitHub bot (PR #221 inline comments)

---

## Summary

| Source                                   | Files reviewed | Findings                       |
| ---------------------------------------- | -------------- | ------------------------------ |
| CLI Batch 1 (`6961492d`→HEAD, 287 files) | 287            | ~40 potential issues           |
| CLI Batch 2 (`ef871eb8`→HEAD, 251 files) | 251            | ~30 potential issues           |
| GitHub bot — PR #221 inline comments     | 43 inline      | 2 Critical, 16 Major, 12 Minor |

---

## FIXED Issues

### [C1] CSS injection via `style` in SAFE_ATTRIBUTES

- **File**: `apps/extension/src/content.ts:770`
- **Category**: security
- **Severity**: major
- **Description**: `'style'` was included in the `SAFE_ATTRIBUTES` allowlist used by `isSafeAttribute()`. Any code path calling `element.setAttribute('style', untrustedValue)` would allow CSS injection — attackers could use `expression()`, `url()`, pointer-events tricks, or visual spoofing. Verified no call site uses `setAttribute('style', ...)`, so removing it from the allowlist is safe.
- **Fix applied**: Removed `'style'` from `SAFE_ATTRIBUTES` set in `content.ts`.

---

## Already Fixed (in commits after PR #221)

The following CodeRabbit findings from PR #221 were resolved in subsequent commits and are confirmed clean in the current codebase:

### [C2] `running_tasks` slot leak on `execute_task` error

- **File**: `apps/desktop/src-tauri/src/core/agent/autonomous.rs:336`
- **Status**: ALREADY FIXED — lines 426-430, 446-449, 467-472 all `retain()` the slot on error.

### [C3] UTF-8 boundary panic in `collect_log_lines`

- **File**: `apps/desktop/src-tauri/src/sys/commands/feedback.rs:131`
- **Status**: ALREADY FIXED — `is_char_boundary` walk-back is in place.

### [H1] `sanitize_for_prompt` strips newlines/tabs from selected text

- **File**: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:88`
- **Status**: ALREADY FIXED — `sanitize_multiline_for_prompt` added and used for `selected_text`.

### [H2] Angle-bracket injection in browser context XML

- **File**: `apps/desktop/src-tauri/src/sys/commands/chat/mod.rs:1984`
- **Status**: ALREADY FIXED — `escape_xml()` wraps all untrusted fields before injection.

### [H3] Source connection not dropped before DB rename (Windows)

- **File**: `apps/desktop/src-tauri/src/data/db/encryption.rs:167`
- **Status**: ALREADY FIXED — `source` is scoped inside a `{ }` block that ends before the `fs::rename` call.

### [H4] `queue_message` fails from side panel without tabId

- **File**: `apps/extension/src/background.ts:449`
- **Status**: ALREADY FIXED — falls back to `chrome.tabs.query({ active: true })` when `tabId` is absent.

### [H5] Toggle can't remove reactions when message not in `state.messages`

- **File**: `apps/desktop/src/stores/chat/chatStore.ts:1377`
- **Status**: ALREADY FIXED — `shouldAdd` computed from `messageInMessages`; falls back to `messagesByConversation` scan.

### [H6] `App.tsx` optional `syncWithBackend` not guarded

- **File**: `apps/desktop/src/App.tsx:495`
- **Status**: ALREADY FIXED — call site uses `syncWithBackend?.()?.catch(...)` optional chaining.

---

## Requires Human Attention

### [H7] Node 20 runtime for GitHub Actions + unpinned action SHAs

- **File**: `.github/workflows/build-appstore.yml:35-37`
- **Category**: config / supply-chain
- **Description**: Actions are not pinned to immutable commit SHAs; supply-chain risk. File was deleted in current branch so may be moot — confirm intentional.

### [H8] Body size "hard limit" still buffers full payload (DoS)

- **File**: `apps/web/app/api/llm/v1/chat/completions/route.ts:338`
- **Description**: `request.arrayBuffer()` reads the entire body into memory before size check. Use a streaming size limit or Next.js `config.api.bodyParser` size limit instead.

### [H9] Supabase migration — `SECURITY DEFINER` on trigger unnecessarily elevates privileges

- **File**: `apps/web/supabase/migrations/20260223000000_resilience_security_fixes.sql:160`
- **Description**: Trigger function has `SECURITY DEFINER` which bypasses RLS for all rows. Remove unless privilege elevation is explicitly required.

### [H10] Supabase migration — incomplete REVOKE on `export_user_data`

- **File**: `apps/web/supabase/migrations/20260223000000_resilience_security_fixes.sql:70`
- **Description**: `anon` and `PUBLIC` grants are not fully revoked. Add explicit `REVOKE ALL ON FUNCTION export_user_data(UUID) FROM anon, PUBLIC;`.

### [H11] Kill switch has no DB-level enforcement

- **File**: `apps/web/supabase/migrations/20260223000000_resilience_security_fixes.sql:40`
- **Description**: Kill switch checked only in application code; a compromised or bypassed app layer skips it. Add an RLS policy or DB trigger to enforce it at the data layer.

### [H12] Directory sync webhook — idempotency claim prevents retries on failure

- **File**: `apps/web/app/api/webhooks/directory-sync/route.ts:780`
- **Description**: Idempotency key is marked as processed before handler completes; if handler fails mid-way, retries are silently dropped. Mark as processed only after success.

### [M1] `services/signaling-server/Dockerfile` — missing health check / unpinned base image

- **File**: `services/signaling-server/Dockerfile`
- **Description**: No `HEALTHCHECK` instruction; base image not pinned to digest.

### [M2] `workflow_executor.rs` — multiple unhandled error paths in parallel node

- **File**: `apps/desktop/src-tauri/src/core/orchestration/workflow_executor.rs:476-735`
- **Description**: Multiple `potential_issue` findings from CLI review around error propagation in parallel execution nodes.

---

## Final Status

### Verification

- Fixed: 1 issue (`content.ts` CSS injection)
- Already fixed in codebase: 7 previously reported critical/high issues
- Requires human: 6 high + 2 medium issues (DB migrations, DoS vector, supply-chain)

### Recommendation

The codebase is in good shape for the runtime and application layers — all critical Rust safety issues (task slot leak, UTF-8 panic) and injection vectors (XML escape, multiline sanitize) were already addressed in commits after PR #221. The remaining items requiring human attention are infrastructure/DB concerns: Supabase migration privilege escalation, kill-switch enforcement at DB level, and the DoS risk from buffering full LLM payloads. These should be addressed before production scale but do not block a beta release.
