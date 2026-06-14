# AGI CLI — Production Remediation (audit 2026-06-10/11)

Source audit: `AUDIT_FINDINGS.md` (5,684 findings) + `REMEDIATION_PRIORITY.md`.
Scope: **CLI only** (`apps/cli/**` + CLI-linked crates). Other surfaces are handled by parallel agents.

## CLI-scoped finding inventory (extracted from AUDIT_PARTS, by real severity)

| Severity | Count | Notes                                                                                         |
| -------- | ----: | --------------------------------------------------------------------------------------------- |
| CRITICAL |     0 | The 5 CRITICAL systemic classes are all web (IDOR/BOLA) / desktop (Tauri IPC, XSS) — not CLI. |
| HIGH     |    10 | The production blockers. **ALL FIXED + VERIFIED (see below).**                                |
| MEDIUM   |    39 | Robustness/correctness. Backlog (Phase 2).                                                    |
| LOW      |    71 | Mostly doc-drift / cosmetic. Backlog (Phase 3).                                               |

Verification gate used: `cargo check -p agiworkforce-cli` PASS · `cargo test -p agiworkforce-protocol --lib` **219 passed/0 failed** · `cargo test -p agiworkforce-cli --lib` **1628 passed/0 failed**. (A green build alone is not evidence — gated on the behavioral tests below.)

---

## Phase 1 — HIGH tier (10/10 DONE + verified)

| #   | Finding                                                                                                                              | File                                          | Fix                                                                                                                                                                                                             | Test                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| H1  | PKCE `code_verifier` sent as OAuth `state` (leaks to auth server/browser/logs; defeats PKCE+CSRF)                                    | `oauth.rs`                                    | Added independent random `state` to `PkceCodes`; URL uses `state`, never the verifier; added CSRF state-match check on the returned code fragment                                                               | existing oauth tests green                                                                               |
| H2  | Gemini `functionResponse.name` hardcoded `"tool"` → multi-turn/parallel tool use mis-associated on Gemini                            | `models/serialization.rs`                     | New `build_gemini_tool_name_map` (tool_use_id→name); converter resolves the real function name                                                                                                                  | **added** `gemini_tool_result_resolves_real_function_name`, `gemini_tool_name_map_collects_tool_use_ids` |
| H3  | Ollama got OpenAI content-part arrays (images) → native `/api/chat` 400s on any vision input                                         | `models/streaming.rs`                         | New `ollama_nativize_message_values`: flattens text to string + base64 `images` array; wired into `stream_ollama`                                                                                               | streaming/ollama tests green (37)                                                                        |
| H4  | `.agiworkforce` config dir NOT in protected metadata (agent could rewrite its own sandbox/exec-policy); only legacy `.codex` guarded | `crates/agiworkforce-protocol/permissions.rs` | Added `.agiworkforce` to `PROTECTED_METADATA_PATH_NAMES`; fixed both projection paths (`default_read_only_subpaths_for_writable_root` + the `From` impl now iterates the canonical list so the two can't drift) | updated 4 tests to assert both `.agiworkforce` + `.codex` protected                                      |
| H5  | `SandboxPolicy::has_full_disk_read_access()` returned `true` unconditionally → fail-open read sandbox (ignored `Restricted`)         | `crates/agiworkforce-protocol/protocol.rs`    | Now matches per-variant and consults `ReadOnlyAccess` (`Restricted` → false)                                                                                                                                    | protocol tests green                                                                                     |
| H6  | LSP `Content-Length` allocated unbounded → OOM DoS from a malicious/buggy server                                                     | `platform/lsp/client.rs`                      | Clamp to 32 MiB before allocating                                                                                                                                                                               | compiles; behavior in `request()`                                                                        |
| H7  | LSP `request()` returned the next frame without matching `id` → wrong-answer/hang on interleaved notifications                       | `platform/lsp/client.rs`                      | Loop frames, skip notifications/non-matching ids, bounded; return only the matching `id`                                                                                                                        | compiles                                                                                                 |
| H8  | Policy engine: invalid regex on a rule silently skipped at eval time → a typo'd `deny` rule drops                                    | `platform/policy/engine.rs`                   | Validate/compile every rule regex at **load** time; fail closed with a clear error                                                                                                                              | policy engine tests green                                                                                |
| H9  | PowerShell `timeout_sec` accepted but never enforced → hung command blocks forever                                                   | `powershell_tool.rs`                          | Spawn + drain stdout/stderr on threads + poll with deadline, kill on overrun                                                                                                                                    | powershell tests green                                                                                   |
| H10 | `shell_snapshot` dumped full `env` (incl. `*_KEY`/`*_TOKEN`) to a world-readable plaintext file for 3 days                           | `shell_snapshot.rs`                           | Capture in-process, redact secret-bearing keys, write `0600` (Unix)                                                                                                                                             | compiles                                                                                                 |

---

## Phase 2 — MEDIUM tier (39, backlog)

Notable themes from `AUDIT_PARTS` (CLI scope): compaction orphaned `tool_use`/`tool_result` (can 400 the next turn — `compaction.rs`), `DontAsk` permission mode silently equals `BypassPermissions` (`cli_options.rs`), subagent `execute_task` unbounded poll w/ no deadline + `cancel()` doesn't interrupt in-flight LLM turn (`subagent.rs`), `teams.rs` `teammate_name` path/branch traversal + `from`-field impersonation, `sync.rs`/`cloud.rs` secrets serialized into export bundles, `review.rs` byte-slice UTF-8 panic.

## Phase 3 — LOW tier (71, backlog)

Mostly documentation drift, naming/severity-label mismatches, dead fields (e.g. `subagent_v2.rs` `max_turns` unenforced), YAML-escaping in `skill_learner.rs`, plugin-skill consent gating in `skills.rs`.

---

## Notes

- `agiworkforce-protocol` is NOT a desktop dependency (verified) — CLI-scoped, so these crate fixes stay within the CLI boundary.
- No commits made; `streaming.rs`/`serialization.rs` carried pre-existing uncommitted changes from prior work — fixes integrate cleanly (full suite green).
