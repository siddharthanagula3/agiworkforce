# R25 V6 — Random commit audit (8 of 54 commits, R18-R22)

Status: Final
Owner: Lane V6 auditor (r25-verification)
Last updated: 2026-05-22

Random-sample failure-mode audit of 8 commits drawn from the R18-R22 window
(`e5421d92a..HEAD` at the time the sample was drawn, HEAD = `2ee09d98f`).
Lane V6 of R25 verification (team task #6). Investigative — no fixes here.

## Methodology

- Candidate set: `git log --oneline --no-merges e5421d92a..HEAD` (54 commits).
  Note: the V6 task description estimated ~140 commits across R18-R22; the
  actual count in the range is 54. The smaller number does not change the
  sampling rate (8/54 ≈ 15%) or the audit conclusions.
- Sample drawn with `awk 'BEGIN{srand(20260522)} {print rand() "\t" $0}'`
  piped from the candidate set, then `sort | head -8`. Seed: `20260522`.
  Recorded at `/tmp/r25-v6-sample.txt` for reproducibility.
- Failure modes audited (from V6 task brief):
  - Mode 11 — hallucinated contracts (model IDs, API shapes, type signatures)
  - Mode 12 — semantic drift (commit message vs actual contents)
  - Mode 13 — security false positives (BYOK, auth, sync — security-adjacent)
  - Mode 14 — edge cases (zero, null, error paths missing)
  - Mode 15 — test-overfit (tests that don't exercise reality)
  - Mode 16 — operational fragility (orphan code, dead modules, broken wiring)
  - Mode 17 — maintenance debt (commit hygiene, scope creep, cross-surface bleed)
- For Rust commits: confirmed module declaration in the crate root via
  `grep -rn "^mod\|^pub mod" apps/cli/src/lib.rs`, ran `cargo build --release`,
  and used `nm` on the built binary to check for symbols.
- For TS/TSX commits: confirmed import wiring from production entry points.
- For security-adjacent commits: looked for negative tests (denial / refusal /
  failure paths).

## Sampled commits

```
d7e8e4191 docs(visual-verification): r21 baseline similarity reports for all 6 surfaces
2ee09d98f feat(cli): add reasoning output tokens and cached field to cost hud
35e056536 feat(desktop): artifact thumbnail cards + pasted-content badge in chat
8c5827f47 feat(web): add stream_options include_usage and reasoning token extraction to openai/openrouter
ed8832ac4 fix(web): remove bogus cache_control from openai adapter, read cached_tokens from usage
6a618e503 feat(web): add reasoning token tracking and otel attributes to cost-tracker
b2002dd2a test(desktop): repair round-19 test regressions
ccf767a90 feat(types): add paid openrouter model catalog entries
```

## Commit findings

### `2ee09d98f` feat(cli): add reasoning output tokens and cached field to cost hud

- Surface: cli (Rust)
- Mode 11 (hallucinated contracts): PASS — `CompletionResult.reasoning_output_tokens` and `AgentSession.total_reasoning_tokens` are added to LIVE files (`apps/cli/src/models/mod.rs`, `apps/cli/src/agent/mod.rs`) that the crate actually compiles.
- Mode 12 (semantic drift): PARTIAL FAIL — the commit message accurately describes that the StatusLineItem additions are orphaned ("orphaned path; kept for future integration") — so the developer self-disclosed the problem. But shipping known-orphan code in a `feat()` commit is itself drift between intent and effect (production gains nothing).
- Mode 13 (security false positives): N/A
- Mode 14 (edge cases): PASS — `if total_reasoning_tokens > 0` gates rendering; zero case handled.
- Mode 15 (test-overfit): N/A
- Mode 16 (operational fragility): **FAIL (critical)** — 250 lines added to `apps/cli/src/tui/bottom_pane/status_line_setup.rs` (+234) and `apps/cli/src/tui/chatwidget/status_surfaces.rs` (+16) are not compiled. **Wider finding:** the entire `apps/cli/src/tui/` subtree is mostly orphan. `apps/cli/src/tui/mod.rs` declares only 8 submodules (color, cost_hud, icons, shimmer, terminal_palette, markdown_renderer, tui_app, widgets) while the directory contains ~60 files and 10+ subdirectories. `chatwidget/` does not even have a `mod.rs`. `cargo build --release` succeeds; `nm` on the binary returns no matches for `status_line_setup`, `CachedInputTokens`, or `ReasoningOutputTokens`. Imports inside the orphan files use `crate::bottom_pane::...` (not `crate::tui::bottom_pane::...`), strongly suggesting paste-from-upstream-Codex without rewriting the module paths. The CLI's live ratatui implementation is the single `tui_app.rs` file.
- Mode 17 (maintenance debt): FAIL — every additional R18-R22 commit touching `apps/cli/src/tui/{bottom_pane,chatwidget}/` adds more never-compiled code, growing the cleanup cost and giving the false impression of CLI progress.
- Severity: **3 (critical)**. Surfaced to team-lead@r25-verification before commit per V6 task spec. V1 (cli salvage) covers the narrow 250-line case but the broader subtree needs a triage decision in R26.

### `d7e8e4191` docs(visual-verification): r21 baseline similarity reports for all 6 surfaces

- Surface: mobile + docs (cross-surface)
- Mode 11 (hallucinated contracts): PASS — `usePermissionsStore` is imported correctly from `@/stores/permissionsStore`; `registry.ts` imports `expo-camera`, `expo-image-picker`, `expo-notifications`, `expo-contacts` (all packages present in mobile workspace dependencies).
- Mode 12 (semantic drift): **FAIL (major)** — commit subject says `docs(visual-verification): r21 baseline similarity reports for all 6 surfaces`. 11 of 17 files changed and 2,360 of 2,812 LOC added are NEW mobile permissions FEATURE code (PermissionsScreen, registry, types, detail, permissionsStore, route wrappers, snapshot tests). Only 6 of 17 files (~453 LOC) are actual docs. This is a `feat(mobile): permissions screen` smuggled under a `docs()` commit message.
- Mode 13 (security false positives): PASS — `permissionsStore` writes to MMKV via `mmkvStorage`, and `registry.ts` correctly notes that `expo-location` is intentionally unwired (commented as "feature gap, surfaced via OS Settings"). No false security guarantees.
- Mode 14 (edge cases): PARTIAL — `osStatusToLevel` handles `undetermined` / `denied` / `granted` mapping but no test exercises the user_intent vs lastObservedStatus divergence path.
- Mode 15 (test-overfit): WARN — only 2 snapshot tests (`renders 6 rows undetermined`, `renders location 4-level`). No tests that exercise actual `expo-camera.requestCameraPermissionsAsync()` or simulate `denied` post-grant. Snapshot tests reproduce UI but not behavior.
- Mode 16 (operational fragility): PASS — route wrappers re-export from features path; settings menu wires new route via `push('/(app)/settings/permissions')`.
- Mode 17 (maintenance debt): **FAIL (major)** — the mislabeled commit will make future `git log --grep="permissions"` or `git blame` searches for the feature surface return zero matches against the user-facing commit subject. Bisect on a regression in the permissions feature will skip this commit.
- Severity: **2 (major)** — commit hygiene + bisect/blame impact across the mobile permissions feature.

### `ccf767a90` feat(types): add paid openrouter model catalog entries

- Surface: types (shared catalog)
- Mode 11 (hallucinated contracts): **FAIL (major)** — adds `anthropic/claude-opus-4` (no patch suffix). The rest of the codebase already uses `anthropic/claude-opus-4-6` (e.g., `apps/web/lib/llm-providers/__tests__/cache-retention.test.ts:58`, `openrouter-cache.test.ts:21,55,78,151,162,196`). Per CLAUDE.md, current Claude family is "Opus 4.X" with concrete IDs Opus 4.6 and Opus 4.7. `anthropic/claude-opus-4` is either an OpenRouter-side alias (unverified) or a hallucinated convention drift. The same concern applies to `openai/gpt-4o` (a 2024 model — the rest of the catalog targets gpt-5.x). V2 lane is the canonical verification; this audit cross-references its outcome.
- Mode 12 (semantic drift): PASS — subject accurately describes the change.
- Mode 13 (security false positives): N/A
- Mode 14 (edge cases): N/A — no logic change.
- Mode 15 (test-overfit): N/A — no tests in this commit (data-only).
- Mode 16 (operational fragility): WARN — pricing fields (`inputCost: 15.0`, `outputCost: 75.0` for claude-opus-4) are unverified against any provider doc included in the commit. If the model ID is wrong AND a user picks it, the BYOK request will 404 at OpenRouter, but the cost-tracker will quote billing as if the request succeeded.
- Mode 17 (maintenance debt): FAIL — adding model entries without a verification reference (e.g., a link to the OpenRouter model list snapshot date) means future maintainers cannot tell whether these IDs were ever real or were guessed.
- Severity: **2 (major)** — feeds into mode 11 (rule-models-json-canonical lock says models.json is authoritative, so incorrect entries propagate to every surface).

### `8c5827f47` feat(web): add stream_options include_usage and reasoning token extraction to openai/openrouter

- Surface: web (TS provider layer)
- Mode 11 (hallucinated contracts): PASS — `stream_options: { include_usage: true }` is a documented OpenAI Chat Completions parameter. `completion_tokens_details.reasoning_tokens` and `output_tokens_details.reasoning_tokens` are the documented field paths for Chat Completions and Responses API respectively (comments cite the source).
- Mode 12 (semantic drift): PASS — subject matches contents.
- Mode 13 (security false positives): N/A
- Mode 14 (edge cases): PASS — `??` chaining surfaces `0` correctly; absent fields produce `undefined`.
- Mode 15 (test-overfit): WARN — this commit ships no tests, but the test ladder lands in `da318dce2` two commits later. Acceptable per ladder convention but not self-contained.
- Mode 16 (operational fragility): PASS — `streamRequest` returns raw body; downstream parsing lands in `44fb0919f` (`stream-transform.ts`). Verified by `grep` that `stream-transform.ts` does parse `completion_tokens_details.reasoning_tokens`.
- Mode 17 (maintenance debt): PASS — incremental, well-scoped.
- Severity: **0 (clean)**.

### `ed8832ac4` fix(web): remove bogus cache_control from openai adapter, read cached_tokens from usage

- Surface: web (TS provider layer)
- Mode 11 (hallucinated contracts): PASS — fix REMOVES a previously-hallucinated `cache_control: { type: 'ephemeral' }` marker that OpenAI silently ignores (the marker is Anthropic-specific). New code reads `prompt_tokens_details.cached_tokens` from the OpenAI usage payload — correct per OpenAI prompt-caching docs.
- Mode 12 (semantic drift): PASS.
- Mode 13 (security false positives): N/A
- Mode 14 (edge cases): WARN — test case `returns undefined cachedInputTokens when cached_tokens is 0` has a contradictory body (`expect(result.cachedInputTokens).toBe(0)`). Behavior is correct (`??` chain surfaces `0`); test name should be renamed. Non-blocking.
- Mode 15 (test-overfit): WARN — this commit is itself evidence that the PRIOR cache implementation was test-overfit: tests passed because they never inspected the outbound request body to confirm `cache_control` was being sent, and the OpenAI API silently dropped the unknown field. The new tests fix that (each test now parses `mockFetch.mock.calls[0][1].body`). This is a positive correction.
- Mode 16 (operational fragility): PASS — 5 unit tests, mocked fetch (acceptable for adapter-shape testing).
- Mode 17 (maintenance debt): PASS — comment explains the OpenAI-vs-Anthropic difference for future maintainers.
- Severity: **1 (minor)** — test-name/body contradiction only.

### `6a618e503` feat(web): add reasoning token tracking and otel attributes to cost-tracker

- Surface: web (TS billing/observability)
- Mode 11 (hallucinated contracts): PASS — OTEL attributes use standard `gen_ai.*` semantic conventions and `codex.usage.*` vendor namespace (cited in comment); plain `Record` return avoids opentelemetry package dependency.
- Mode 12 (semantic drift): PASS.
- Mode 13 (security false positives): N/A
- Mode 14 (edge cases): WARN — `total_tokens` calculation in `toOtelAttributes()` includes `inputTokens + outputTokens + reasoningOutputTokens + cacheCreationInputTokens` but EXCLUDES `cacheReadInputTokens`. Comment says "sum of all categories for cost attribution" but this is arguably a bug or arguably intentional (cache-read is a discounted re-read of input, already counted). Worth a follow-up sentence in cost-tracker.ts.
- Mode 15 (test-overfit): WARN — no test in this commit; test coverage arrives in `da318dce2`.
- Mode 16 (operational fragility): PASS.
- Mode 17 (maintenance debt): PASS — comment explicitly cites codex-cli source for the rate convention.
- Severity: **1 (minor)** — cacheReadInputTokens omission from `total_tokens` warrants a one-line clarifying comment or a fix.

### `b2002dd2a` test(desktop): repair round-19 test regressions

- Surface: desktop (TS tests)
- Mode 11 (hallucinated contracts): PASS — new selector mocks (`selectConversations`, `selectActiveConversationId`) match selector names that `RelevantChatsList` actually uses.
- Mode 12 (semantic drift): PASS.
- Mode 13 (security false positives): N/A
- Mode 14 (edge cases): PASS — `vi.useRealTimers()` in `afterEach()` correctly prevents bleed between tests.
- Mode 15 (test-overfit): WARN — these are component-level vitest unit tests with mocked stores. No integration test exercises the real Zustand store / Tauri IPC path. Acceptable in the repo's broader desktop test policy but worth noting.
- Mode 16 (operational fragility): PASS — fixes a real regression (1751/1752 pass, per commit body).
- Mode 17 (maintenance debt): PASS — `afterEach` cleanup pattern adopted; localized scope.
- Severity: **0 (clean)**.

### `35e056536` feat(desktop): artifact thumbnail cards + pasted-content badge in chat

- Surface: desktop (TSX feature)
- Mode 11 (hallucinated contracts): PASS — `useArtifactStore` exposes `setActiveArtifact` + `openPanel` (verified). `message.artifacts` and `message.metadata` types align with `apps/desktop/src/types/chat`.
- Mode 12 (semantic drift): PASS — subject matches contents.
- Mode 13 (security false positives): WARN — `ArtifactThumbnailCard` renders an `iframe` preview for `html/react/svg` artifact kinds. The commit body acknowledges "trust-boundary chips preserved via existing privacy logic" but the iframe content origin is not visibly sandboxed in the diff. Worth a sandbox-attribute check (`sandbox="allow-scripts"`?). Local trust source (no remote fetch) is the saving grace.
- Mode 14 (edge cases): PASS — empty-state, overflow `+N` card, undefined `metadata` all covered by 16 vitest tests.
- Mode 15 (test-overfit): WARN — mocks `useArtifactStore` with no real-store integration test. Acceptable for unit-level scope.
- Mode 16 (operational fragility): PASS — wired into `MessageBubble.tsx`; both new components imported and used.
- Mode 17 (maintenance debt): PASS — components colocated with `MessageBubble/` directory convention.
- Severity: **1 (minor)** — iframe sandbox attribute worth a future audit; everything else clean.

## Summary

Severity histogram (8 commits sampled):

| Severity     | Count | Commits                               |
| ------------ | ----- | ------------------------------------- |
| 3 (critical) | 1     | `2ee09d98f`                           |
| 2 (major)    | 2     | `d7e8e4191`, `ccf767a90`              |
| 1 (minor)    | 3     | `ed8832ac4`, `6a618e503`, `35e056536` |
| 0 (clean)    | 2     | `8c5827f47`, `b2002dd2a`              |

Hit rate of significant problems in the random sample: 3 of 8 = 37.5% have severity ≥ 2. Extrapolated to the 54-commit window, ≈ 20 commits in R18-R22 likely carry similar issues.

### Top 3 issues by severity

1. **CLI tui orphan tree (severity 3, critical)** — `apps/cli/src/tui/mod.rs` declares 8 of ~60 files; the rest (`bottom_pane/`, `chatwidget/`, `app.rs`, `app_event.rs`, `pager_overlay.rs`, `notifications/`, `public_widgets/`, `render/`, `status/`, `streaming/`, etc.) is never compiled. R18-R22 commits adding to this subtree give a false impression of CLI feature progress. Live implementation is the single `tui_app.rs`.
2. **Commit-message semantic drift on mobile permissions (severity 2, major)** — `d7e8e4191` ships ~2,360 LOC of mobile permissions feature code under a `docs(visual-verification): ...` subject. Future bisect/blame on the permissions feature will not surface this commit.
3. **Possible hallucinated model IDs in models.json (severity 2, major)** — `ccf767a90` adds `anthropic/claude-opus-4` while the rest of the codebase uses `anthropic/claude-opus-4-6`. Per the locked rule `models.json is canonical`, an incorrect entry here propagates to every surface that reads it. V2 lane handles full verification.

### R26 remediation recommendations

1. **CLI: triage the orphan `apps/cli/src/tui/` subtree as a whole.** V1's narrow 2-directory fix is insufficient. Decide: delete (lose ≈30K LOC of paste-from-Codex code that has never compiled), OR convert (declare modules, fix `crate::bottom_pane::` to `crate::tui::bottom_pane::`, resolve hundreds of resulting compile errors). Recommendation: delete, then re-introduce as needed when each feature is actually wired into `tui_app.rs`.
2. **Add a pre-commit hook that warns when commit subject prefix (`feat()`, `docs()`, `test()`, `fix()`) does not match the dominant file-class in the diff.** Specifically catches `d7e8e4191`-style misclassification (`docs()` subject + > 50% of LOC under `apps/*/src/features/`).
3. **Add a CI check that every new `.rs` file under `apps/cli/src/` has a corresponding `mod`/`pub mod` declaration reachable from `lib.rs`.** Same idea for new `.ts`/`.tsx` files under `apps/web/lib` and `apps/desktop/src`: require at least one import-graph path from the production entry point. This prevents future 2ee09d98f-style orphan landings.
4. **Re-audit all R18-R22 commits that touched `apps/cli/src/tui/` outside the 8 known-live modules** to determine the full scope of orphan code accumulated, before deciding (1).
5. **Verify every model ID in `packages/types/src/models.json` against the latest provider catalog** as part of R26 (extends V2). Add a `released` field validator and a `source_doc_date` field so future audits can date the entry.
6. **For each `iframe`-rendering component in chat surfaces** (start with `ArtifactThumbnailCard`), add an explicit `sandbox` attribute audit and document the trust-boundary policy.
7. **Add a one-line clarifying comment** to `apps/web/lib/cost-tracker.ts` `toOtelAttributes()` explaining whether `cacheReadInputTokens` is intentionally excluded from `codex.usage.total_tokens` (or fix the omission).
8. **Rename the contradictory test case name** in `apps/web/lib/llm-providers/__tests__/openai-cache.test.ts` (`returns undefined cachedInputTokens when cached_tokens is 0` → `surfaces 0 cachedInputTokens when cached_tokens is 0`).

## Audit-tool gaps observed (for future audits)

- Random sample at 8/54 = 15% rate caught one critical issue, two major issues, three minor — consistent with what would be expected if ≈ 25-40% of commits in this window carry mode-11/12/16 issues. A 100% audit is likely worth the cost given the elevated rate.
- The orphan-tree problem is invisible to `cargo build` (the orphan code isn't compiled) and to typecheck (it doesn't reach the type system). A dedicated module-graph reachability check is the right instrument; CI does not currently run one.
- The semantic-drift problem (commit subject vs contents) is invisible to commitlint (it only validates Conventional Commit shape, not subject-vs-payload alignment).
