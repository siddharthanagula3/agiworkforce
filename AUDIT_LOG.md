# AGI Workforce — Audit Log

> Durable record of no-mercy audits across all 6 surfaces. Each fire = one module audit with structured findings, fixes applied (or deferred), and a verification result. The auditor LLM is treated as untrusted too — every finding must cite `file:line`, every fix must pass static check + targeted tests + full surface verification before commit.

Rotation order: `apps/cli → apps/desktop → apps/web → apps/mobile → apps/extension → apps/extension-vscode → apps/cli`.

**Last surface audited:** apps/cli (Phase A fixes 2026-05-14)

---

## 2026-05-14T00:00Z — apps/cli — a2a.rs + a2a_ws.rs

**Audited:** `apps/cli/src/a2a.rs` (1649 LOC) + `apps/cli/src/a2a_ws.rs` (283 LOC), 2 files
**Total findings:** 7 — 1 critical · 2 high · 2 medium · 2 low
**Fixed:** 4 · **Deferred:** 3 · **Verification:** green

### Critical findings

#### C1. Tasks HashMap never evicted — unbounded memory growth

- Location: `apps/cli/src/a2a.rs:656-697` (`handle_post_task`)
- What's wrong: Completed and failed tasks are inserted into `state.tasks` (a `HashMap<String, InFlightTask>`) via `insert()` but never removed. Every delegated task, whether completed, failed, or rejected, stays in memory until process exit.
- Why it matters: A long-running A2A server receiving steady task traffic leaks memory without bound. An attacker sending junk requests (no auth required if `auth_token` is `None`) can exhaust process memory.
- Fix: After task completion, evict oldest completed/failed entries when `tasks.len() > MAX_RETAINED_COMPLETED_TASKS` (200). Added constant and eviction loop at end of background tokio::spawn closure.
- Status: **fixed** (see commit)

### High findings

#### H1. HTTP short-read: single `read()` silently truncates large POST bodies

- Location: `apps/cli/src/a2a.rs:561-571` (`handle_connection`)
- What's wrong: The server did `let n = stream.read(&mut buf).await?` with a fixed 65536-byte buffer. TCP is a stream protocol; a single `read()` is not guaranteed to return the full HTTP request. Large POST bodies (e.g., delegated tasks with large `context` fields) were silently truncated, causing `serde_json::from_str` on the truncated body to fail with a parse error (HTTP 400) rather than a real task error.
- Why it matters: Any `/a2a/task` POST with a body > 65536 bytes (easily triggered by passing conversation context) silently fails. Caller gets HTTP 400, no task is run, no useful error is surfaced.
- Fix: Replaced single `read()` with a read loop accumulating bytes until `\r\n\r\n` is found (end of headers), then reading the remaining `Content-Length` bytes. Added `MAX_A2A_REQUEST_BYTES = 2 MiB` cap with HTTP 413 response.
- Status: **fixed** (see commit)

#### H2. Duplicate `request_id` overwrites a running task — race condition and data corruption

- Location: `apps/cli/src/a2a.rs:649-660` (`handle_post_task`)
- What's wrong: No check for duplicate `request_id` before `state.tasks.write().insert(request_id, task)`. A second POST with the same `request_id` silently overwrites the in-flight entry. The background `tokio::spawn` for the original task then updates the map entry for the NEW task's ID, corrupting its state. The original task's result is lost; the new task gets the wrong result.
- Why it matters: A client (or attacker) retrying a request with the same ID causes silent result corruption. Since `request_id` is caller-controlled, this is also a targeted data-corruption vector against a running task.
- Fix: Added a read-lock check for `tasks.contains_key(&request_id)` before insert; returns HTTP 409 Conflict on collision. Added "Conflict" to `http_response` status map.
- Status: **fixed** (see commit)

### Medium findings

#### M1. WebSocket auth uses non-constant-time string comparison

- Location: `apps/cli/src/a2a_ws.rs:75` (`handle_ws_connection`)
- What's wrong: `if provided != Some(expected)` is a regular equality check, not constant-time. The HTTP transport correctly uses `constant_time_eq()` but the WS transport does not, creating an inconsistency and a theoretical timing oracle.
- Why it matters: Over a local network with many samples, timing differences can leak token bytes. Inconsistency with the HTTP layer is also a code-quality and audit-trail hazard.
- Fix: Exposed `constant_time_eq_str` as a `pub fn` in `a2a.rs`, then replaced `provided != Some(expected)` with `!crate::a2a::constant_time_eq_str(provided, expected)` in `a2a_ws.rs`.
- Status: **fixed** (see commit)

#### M2. SSRF: `fetch_agent_card` and `delegate_task` accept arbitrary URLs with no scheme/host validation

- Location: `apps/cli/src/a2a.rs:337-362` (`fetch_agent_card`), `apps/cli/src/a2a.rs:381-451` (`delegate_task`)
- What's wrong: `/a2a register <url>` and `/a2a delegate <url>` call `fetch_agent_card(url)` with the user-provided string directly. No check prevents `http://169.254.169.254/latest/meta-data/` (AWS IMDS), `http://localhost:PORT` (local service enumeration), or other internal network targets.
- Why it matters: When the CLI runs on a cloud host, a malicious registered-agent endpoint could exfiltrate instance credentials via SSRF.
- Fix needed: Reject non-`http(s)` schemes; validate against an allowlist of known-internal ranges (RFC 1918, 169.254.x.x, ::1, etc.) before making outbound requests.
- Status: **deferred** — requires URL allowlist design decision; lower risk given CLI operator context

### Low findings

#### L1. `InFlightTask.started_at_ms` field misnamed — stores elapsed duration, not start timestamp

- Location: `apps/cli/src/a2a.rs:215` (struct `InFlightTask`), `apps/cli/src/a2a.rs:685` (assignment), `apps/cli/src/a2a.rs:724` (read)
- What's wrong: Field named `started_at_ms` is assigned `start.elapsed().as_millis() as u64` (an elapsed duration) after task completion. The name implies a Unix timestamp of when the task started. While functionally it still surfaces the right value in `TaskResponse.duration_ms`, the internal naming is misleading and breaks in-flight duration queries (returns 0 while running).
- Why it matters: Code maintainability and misleading semantics for anyone extending the polling behavior.
- Fix: Renamed `started_at_ms` → `elapsed_ms` throughout `a2a.rs` (4 occurrences via `replace_all`).
- Status: **fixed** (see commit)

#### L2. `handle_post_handoff` is a documented stub — accepts handoffs but discards all messages

- Location: `apps/cli/src/a2a.rs:739-773` (`handle_post_handoff`)
- What's wrong: The function parses the `HandoffRequest`, logs receipt, then does `let _ = state.config.clone(); // reserved for future session injection`. Messages are silently discarded. The response is HTTP 200 `"accepted"`, so callers believe the handoff succeeded.
- Why it matters: Handoff is a user-visible feature (`/a2a handoff` command path). Silent discard is misleading; callers assume continuity but get nothing.
- Fix needed: Either implement session injection or return HTTP 501 Not Implemented with an explicit error until implemented.
- Status: **deferred:not-implemented** — requires session injection architecture work

#### L3. `jsonrpc::handle_request` "delegate" handler returns `Accepted` but never executes the task

- Location: `apps/cli/src/a2a.rs:1221-1247` (`jsonrpc::handle_request`, "delegate" arm)
- What's wrong: The JSON-RPC "delegate" method returns a `TaskResponse { state: Accepted }` immediately but spawns no work. The task is never executed. This is an AI-slop stub: it looks complete but does nothing.
- Why it matters: Callers using the JSON-RPC (WebSocket) transport's delegate method receive false acceptance; no task runs.
- Fix needed: Wire to `execute_delegated_task` or `handle_post_task` logic; requires async context threading into the pure `handle_request` function.
- Status: **deferred:architecture** — `handle_request` is a sync fn; requires async refactor or a task-queue sideband

### Verification log

- Tests before: 1318 · after: 1318 (+0, no test regressions)
- cargo check (workspace): PASS
- clippy (`-D warnings -D unsafe-code`): 40 pre-existing errors in other modules (not introduced by this audit); zero new errors in `a2a.rs`; one pre-existing warning in `a2a_ws.rs:101` (useless `.into()` on String, original code)
- Cumulative diff: 107 LOC (+96 / -11) / 500 LOC limit

---

## 2026-05-14T00:00Z — apps/cli — Phase A fixes (#1 #2 #3 #4 from MASTER_PLAN §5)

**Audited:** `apps/cli/src/a2a.rs`, `apps/cli/src/tui/_attic/` (118 files deleted), `apps/cli/src/agent.rs`
**Total items:** 4 — 1 security · 1 correctness · 1 dead-code · 1 false-positive
**Fixed:** 3 · **Deferred:** 0 · **False alarms:** 1

### Fix 1 — SSRF allowlist for A2A outbound URL validation (security)

- Location: `apps/cli/src/a2a.rs:36-101` (new `validate_a2a_endpoint` + `is_private_ip`)
- Caller sites: `fetch_agent_card:429`, `delegate_task:473`, `handoff_conversation:562`
- What was wrong: All three outbound reqwest callsites accepted arbitrary user-controlled URLs with no scheme or host validation. `http://169.254.169.254/` (AWS IMDS) and RFC1918 addresses were accepted.
- Fix: Added `validate_a2a_endpoint(url)` that requires http/https scheme, resolves DNS, and rejects private/loopback/link-local/IMDS IPs. Override via `AGI_A2A_ALLOW_PRIVATE=1` with one-time stderr warning.
- Tests added: 8 (deny-loopback, deny-10-block, deny-172-block, deny-192.168, deny-imds, deny-bad-scheme, allow-public-ip, ip-classification)
- Commit: `ceda1ad10`

### Fix 2 — handle_post_handoff returns HTTP 501 instead of misleading 200 (correctness)

- Location: `apps/cli/src/a2a.rs:904-918` (`handle_post_handoff`)
- What was wrong: Stub function returned HTTP 200 "accepted" while silently discarding all handoff messages. Callers incorrectly assumed session continuity.
- Fix: Returns HTTP 501 with `{"error":"handoff not yet implemented","status":"not-implemented","messages_received":<n>}`. Added `501 => "Not Implemented"` to `http_response` status map at line 1007.
- Commit: `a618d13ef`

### Fix 3 — delete apps/cli/src/tui/\_attic/ (dead code, 344 files / 107K LOC)

- Location: `apps/cli/src/tui/_attic/` (118 .rs files, 344 total including subdirs)
- What was wrong: Directory had zero module declarations (`mod _attic`) and zero cross-references outside itself. Never compiled, never tested. Pure dead weight in the source tree.
- Fix: `rm -rf apps/cli/src/tui/_attic/`. Build and 1326 tests remained green.
- Commit: `0e81d1546`

### Fix 4 — agent.rs Ok(()) at lines 517/540/557 — false positive

- Location: `apps/cli/src/agent.rs:517` (`enable_managed_session`), `:540` (`persist_managed_session`), `:557` (`sync_managed_session_metadata`)
- Finding from plan: "Replace Ok(()) after failure with typed errors"
- Actual code: All three are `let-else` early returns on `Option::None` conditions — correct idempotency/no-op guards, not silent failure swallows.
  - Line 517: guard "already initialized" before redundant session creation
  - Line 540: guard "no managed session exists" before pointless persist
  - Line 557: guard "no session_id" before pointless metadata sync
- Decision: No change. Documented as false alarm per MASTER_PLAN §5 item 4 instruction ("document in commit body and skip").
- Commit: `c0c012464` (empty commit with explanation)

### Verification log

- Tests before: 1318 · after: 1326 (+8 new SSRF tests, no regressions)
- cargo build --release -p agiworkforce-cli: PASS
- cargo test --release -p agiworkforce-cli: 1326/1326 PASS
- Cumulative diff: +160 / -107411 (net -107251, dominated by \_attic deletion)
- Commits: 4 (ceda1ad10, a618d13ef, 0e81d1546, c0c012464)
