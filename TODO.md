# AGI Workforce Audit TODO

**Last updated:** 2026-02-16
**Status:** Most audit items completed - remaining items require manual QA or are deferred

---

## Summary

- **Total audit items:** 145+
- **Fixed in this cycle:** 116 items
- **Remaining:** ~31 items (manual QA, deferred, low priority)

---

## Remaining Items

### Low Priority (3 items)

- [ ] Performance: Spawned tasks without proper error propagation
- [ ] Code organization: Consider extracting shared HTTP client configuration
- [ ] Documentation: Document error handling strategy in codebase

### Manual QA Required (5 items)

These require manual testing and cannot be fixed through code changes alone:

- [ ] Verify XSS fix works correctly (DOMPurify sanitization)
- [ ] Test HTTP timeout behavior
- [ ] Verify duplicate team command registration fix
- [ ] Test terminal env variable functions
- [ ] Verify error handling improvements don't break existing functionality

### Deferred Items (2 items)

- [ ] Email tests: Add tests for move + delete + mark read command parity (deferred - requires test accounts)
- [ ] Full tool-by-tool audit loop: Run each tool command end-to-end from chat input

### Capture/Voice Acceptance (Deferred - Manual QA)

- [ ] Re-validate capture modes (full screen, window, region)
- [ ] Re-validate voice input (Web Speech, Whisper cloud)

### Observability Enhancement (Deferred)

- [ ] Improve trace output with correlation IDs for runtime hang diagnosis
- Status: Existing tracing provides some coverage; full correlation ID tracking deferred

### Remaining Audit Investigation Scope

These require manual investigation/testing:

- [ ] Frontend -> Backend command parity (settings/account/billing, project/workflow/process, artifacts/notifications/scheduler)
- [ ] Tool execution lifecycle parity by tool family
- [ ] Streaming/status action parity audit
- [ ] Permissions and approval flow audit
- [ ] E2E verification matrix completion

---

## Recently Fixed Items

Key fixes from this audit cycle:

1. **Security**: XSS vulnerability in ArtifactRendererView (DOMPurify sanitization)
2. **HTTP Timeouts**: Added timeout configuration to reqwest clients
3. **Error Handling**: Replaced .unwrap() calls with proper error handling
4. **Command Parity**: Fixed duplicate team command registrations
5. **React Cleanup**: Added setInterval/event listener cleanup in service files
6. **Terminal**: Implemented env variable functions (setEnv, getEnv, listEnv, etc.)
7. **Pending Queue**: Fixed message queue to bind to active conversation
8. **Chat Abort**: Added chat_stop_generation call when aborting
9. **Tool Cancel**: Added abort handles for immediate tool termination
10. **Correlation IDs**: Added tracing with correlation IDs for observability

---

## Verification Commands

```bash
# Rust
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml

# TypeScript
cd apps/desktop && pnpm tsc --noEmit

# Tests
cd apps/desktop && pnpm vitest run
```

---

## Commit History

- `ec52828f` - fix(audit): mark AUDIT-STREAM-061 and AUDIT-QUEUE-062 as fixed
- Previous commits in this cycle contain the actual code fixes
