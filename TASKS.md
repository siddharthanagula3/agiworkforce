# AGI Workforce — Tasks

_Single source of truth. Last updated: 2026-03-16 (session 4)_
_Month goal: desktop runtime release-candidate quality + cross-surface shared contracts_

---

## 🔴 Immediate (Release Blockers)

- [x] Fix 3 unhandled Promise rejections in `chat-ai-service.test.ts` ✅ (13/13 tests pass)
- [ ] Resolve Phase 6A critical issue CRIT-001: TypeScript compilation — 216 errors (~4-6 hrs)
- [ ] Resolve Phase 6A critical issue CRIT-002: Missing `SyncManagerState` export (~0.5 hrs)
- [ ] Resolve Phase 6A critical issue CRIT-003: Test mock type mismatches (~1 hr)
- [ ] Resolve Phase 6A critical issue CRIT-004: Session storage function signature errors (~1-2 hrs)
- [ ] Resolve Phase 6A critical issue CRIT-005: HelpTour test failures (~1 hr)
- [ ] Resolve Phase 6A critical issue CRIT-006: CSS runtime error in `motion-dom` (~1-2 hrs)
- [x] Resolve Phase 6A critical issue CRIT-007: Unused imports/variables ✅ (eslint worktree ignore fix)
- [ ] Resolve Phase 6A critical issue CRIT-008: `PerformanceUtils` type access errors (~1 hr)
- [ ] Run full web test suite → verify ≥98% pass rate
- [ ] Fix 8 failing API route integration test files (agent running)

---

## 🟡 This Week — Desktop Runtime Authority

### Wave 5.4 Integration (Session Persistence + Offline Support)

- [x] Wire `OfflineIndicator` into main app layout (`App.tsx`) ✅
- [x] Connect `useSessionPersistence` hook to chat store initialization ✅
- [x] Call `initializeSyncManager()` on app mount; `cleanupSyncManager()` on unmount ✅
- [x] Implement `syncOfflineQueue` callbacks in API layer ✅
- [x] Add `/api/health` endpoint to `apps/web` for connectivity verification ✅ (already existed)
- [ ] Handle auth 401 errors in sync → alert user, stop retries

### Desktop Release Gate — Runtime Authority

- [x] Confirm one canonical frontend send path ✅ (chat_send_message only)
- [x] Confirm one canonical backend chat runtime ✅ (chat/send_message.rs)
- [x] Confirm one canonical reasoning stream path ✅ (ChatStream → ThinkingBlock)
- [x] Confirm one canonical approval path ✅ (MessageApprovals → ApprovalRequestCard)
- [x] Remove any parked duplicate handlers ✅ (none found)
- [x] Register `mcp_server_status` and `mcp_server_list_tools` in `lib.rs` ✅

### Desktop Release Gate — Inline Visibility

- [x] Verify reasoning renders inline ✅
- [x] Verify tool calls render inline in transcript ✅
- [x] Verify approvals render inline ✅
- [ ] Verify approval timeout behavior works without modal-only logic
- [ ] Verify stream end/error paths resolve correct transcript message

### Desktop Release Gate — Browser Automation

- [x] Browser launch commands accept live `browserType` / `headless` payload ✅
- [x] Browser close operations use `browser_close` command ✅
- [x] Browser tab open/close use shared CDP endpoint contract ✅
- [x] `browserAutomation.ts` mirrors live Tauri payloads ✅
- [x] `browser_execute_in_frame` uses same approval gate ✅
- [ ] Browser file uploads use CDP DOM file-input path

---

## 🟢 Next Week — Provider Fidelity + Transcript Trust

- [x] Audit `core/llm/provider_adapter.rs` ✅ (1 bug found and fixed: Google model field)
- [ ] Fix API route test failures → close coverage gap
- [ ] Auth/security test coverage: 82% → 95%
- [ ] Hook test coverage: 81% → 85%
- [ ] E2E tests: offline message queueing workflow
- [x] Tool timeline label/status shaping ✅ (verified canonical)

---

## 📋 Week 3 — Shared Contracts + Cross-Surface Convergence

- [x] Formalize shared conversation contract in `packages/types` ✅ (ConversationId, MessageId, ActionId, MessageKind, MessageStatus)
- [ ] Document runtime activity attribution contract
- [x] Align model catalogs across 3 surfaces ✅ (web providersInOrder synced with desktop)
- [ ] Write convergence path docs for web/mobile/extension/vscode

---

## 🔵 Week 4 — Hardening + Release Gate Alignment

- [x] Run `cargo clippy` clean pass ✅ (0 warnings)
- [x] Run `pnpm typecheck:all` ✅ (0 errors)
- [x] `pnpm build` succeeds ✅ (all 5 surfaces)
- [x] Reconcile `DESKTOP_RELEASE_GATE.md` ✅
- [x] Reconcile `DESKTOP_STABILIZATION_SOURCE_OF_TRUTH.md` ✅
- [ ] Coverage report generated and reviewed
- [ ] E2E smoke tests pass

---

## ✅ Session 4 Highlights

- 354 new commands registered in lib.rs (rust-engineer team agent)
- 44 commands wired via solo agent (workflow, canvas, settings, research, automation stores)
- Frontend-engineer team agent now wiring differentiator features (skills, voice, vision, teams)
- Google adapter modelVersion bug fixed
- Web model catalog synced (10 missing providers added)
- Wave 5.4 fully wired (OfflineIndicator, SyncManager, useSessionPersistence)
- ESLint clean (worktree ignore fix)
- All docs reconciled against live code
