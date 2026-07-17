# AGI Mobile — XcodeBuildMCP QA Playbook · Part 4

**Phases 21–25: Debugging/LLDB · Coverage · Regression · Batch Automation · Performance/Memory · Error States · Failure Recovery · End-of-Run Report**

Status: Active · Owner: Mobile lead · Read the spine first: [`README.md`](./README.md)
Parity bar: ChatGPT iOS + Claude iOS (parity = behavior/workflow only — never copied assets, text, or branding)

> This is the closeout part. By the end of Part 3 the app has been built, launched, navigated, exercised across chat/composer/streaming/tool-calls, and checked for settings/a11y/gestures. **Part 4 is where you (a) attach a real debugger and prove the agentic plumbing under the hood, (b) measure test coverage, (c) re-run the whole thing as a regression suite, (d) automate it into a repeatable smoke macro, (e) stress performance/memory/error-recovery, and (f) assemble the single end-of-run report.**
>
> Part 4 also **closes the 44-tool matrix**: every XcodeBuildMCP tool not exercised in Parts 1–3 is exercised here. The tools that land for the first time in Part 4 are the entire **LLDB group** (`debug_attach_sim`, `debug_detach`, `debug_breakpoint_add`, `debug_breakpoint_remove`, `debug_continue`, `debug_stack`, `debug_variables`, `debug_lldb_command`) and the **coverage group** (`get_coverage_report`, `get_file_coverage`), plus `test_sim`, `session_use_defaults_profile`, and heavy use of `batch`. See the **Tool-Usage Matrix** in Phase 25.

---

## How to read every phase

Each phase below uses the same shape so an autonomous agent can execute it without interpretation:

- **Goal** — what this phase proves.
- **Exact tool sequence** — the XcodeBuildMCP calls in order, with the arguments that matter. Treat tool names as load-bearing.
- **Expected output** — what a passing run looks like.
- **Acceptance criteria** — the binary checks that decide PASS/FAIL.
- **Bug-classification examples** — concrete issues mapped to the README severity ladder (Critical / High / Medium / Low / Cosmetic).
- **Recovery** — what to do when the phase wedges (rebuild, reinstall, reboot sim, re-attach).
- **Checklist** — `- [ ]` boxes the agent ticks as it goes.

Three rules from the spine that dominate Part 4:

1. **Parity = behavior, never pixels.** A parity gap is "Claude iOS keeps the stop button reachable during a long stream and we don't," not "their button is 2px rounder." Never copy their assets, copy, or layout verbatim.
2. **The trust boundary is sacred.** Any Local-mode network egress to our managed cloud (AGI API / gateway / Neon / Clerk / signaling) is an **automatic Critical** — stop the run and report. Part 4 sets a breakpoint specifically to _watch_ this boundary at runtime.
3. **Never fabricate a result.** You may not invent a build hash, a coverage percentage, a deploy status, an FPS number, or a "PASS." If a tool didn't run, or you couldn't reach a device, the cell reads `NOT RUN` with the reason. A fabricated green is itself a Critical reporting defect (the README's "overclaim shipped to users" rule applies to QA output too).

---

# Phase 21 — Debugging / LLDB

**Goal:** Attach a real LLDB session to the running app on the simulator and prove the agentic data-plumbing the UI depends on — the tool-call accumulator, the SSE stream handler, and the Local→Cloud trust gate — by stopping execution at high-value sites, inspecting live state, and stepping. Produce a worked diagnosis of a stuck tool-call card. This is also the phase that handles **any crash** seen earlier in the run: a crash anywhere in Parts 1–3 is escalated here for a stack capture.

### Why these three sites

The three breakpoint targets are chosen because they are the seams where "looks fine" and "is fine" diverge, and where a bug is invisible from screenshots alone:

| Site                  | File                                                                                                 | Why it's high-value                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool-call accumulator | `src/features/chat/utils/toolCallAccumulator.ts` → `accumulateToolCallDelta`                         | Pure parse layer; a stuck/duplicated/never-completing tool card almost always originates in the keying logic here (`nameToKey` / `idToKey` / `indexToKey` / `lastKey`).             |
| Stream handler        | `services/streaming.ts` → `attemptStream` / `processSseLine` / the reconnect loop in `streamChat`    | Where SSE lines are parsed and where the per-attempt timeout, abort, and 3-attempt reconnect/backoff live. A reply that hangs "streaming forever" or a spurious timeout lives here. |
| Trust gate            | `lib/egressGuard.ts` → `guardedFetch` (and `services/remoteChatGate.ts` → `assertRemoteChatAllowed`) | The fail-closed chokepoint. A breakpoint here is the only way to _watch at runtime_ that Local mode never calls `secureFetch` for an our-cloud host.                                |

### Exact tool sequence

Pre-req: the app is installed and the bundle id is known (from Part 1's `get_app_bundle_id`). Run a **Debug** build for usable symbols — a Release build strips/ optimizes and `debug_variables` will show `<optimized out>`.

1. **Launch (or relaunch) the app**, then attach:
   - `launch_app_sim` (bundle id, the booted simulator udid) — or `stop_app_sim` then `launch_app_sim` for a clean process.
   - `debug_attach_sim` (bundle id / pid, simulator udid). Confirm the LLDB session reports "attached" and the process is the AGI Mobile target.
2. **Set the three breakpoints** (symbolic where possible; file:line otherwise):
   - `debug_breakpoint_add` at `accumulateToolCallDelta` (or `toolCallAccumulator.ts` at the `st?.name` lifecycle branch and again at the `x_tool_result` terminal branch).
   - `debug_breakpoint_add` at `attemptStream`'s SSE read loop (`processSseLine`) and at the reconnect `catch` in `streamChat`.
   - `debug_breakpoint_add` at `guardedFetch` in `lib/egressGuard.ts` (the host-classification branch).
3. **Reproduce.** Drive the UI with the standard automation (snapshot → locate → tap):
   - Type a prompt that triggers a tool call (e.g. a question that forces web_search in Cloud mode, or an MCP tool), then `tap` the send control (`chat.composer.send`).
4. **At each stop, inspect:**
   - `debug_stack` — capture the backtrace; confirm the frames match the expected call path.
   - `debug_variables` — read the live locals (see the per-site variable list below).
   - `debug_lldb_command` — ad-hoc expression evaluation for anything `debug_variables` doesn't surface (e.g. `po acc.order`, `p acc.byKey.size`, `po delta`).
   - `debug_continue` — resume to the next stop or to completion.
5. **Tear down cleanly:**
   - `debug_breakpoint_remove` for each breakpoint id.
   - `debug_detach` — the app must keep running normally after detach (a detach that kills the app is itself a finding).

### What to inspect at each site (`debug_variables` / `debug_lldb_command`)

- **Accumulator (`accumulateToolCallDelta`):** `delta` (the incoming `StreamDelta`), `acc.byKey`, `acc.order`, `acc.nameToKey`, `acc.idToKey`, `acc.indexToKey`, `acc.lastKey`, and the local `key`/`t`. Watch a server tool: `x_tool_status` opens a `name:`-keyed entry → arg fragments route by `indexToKey`/`lastKey` → `x_search_results`/`x_code_result` flips status to `completed`. Watch an MCP tool: `tool_calls[{id}]` opens an `id:`-keyed entry → `x_tool_result{tool_call_id}` is terminal.
- **Stream handler (`attemptStream` / `processSseLine`):** the raw `line`, `buffer`, the parsed `choice.delta`, `finish_reason`, and `doneCalled`. In the reconnect path: `attempt`, `lastNetworkError`, and which signal aborted (`signal?.aborted` vs `timeoutController.signal.aborted`).
- **Trust gate (`guardedFetch`):** the request URL/host, the resolved app mode (`useChatAppModeStore.getState().appMode`), and whether `secureFetch` is about to be called. In Local mode for an our-cloud host, execution must reach the `EgressBlockedError` throw and **never** call `secureFetch`.

### Worked example — diagnosing a stuck tool-call card

**Symptom (from Part 2):** a tool-call card renders with the spinner/"running" state and never flips to "completed," even though the assistant's text reply finishes. Screenshots alone can't tell you whether the result arrived and wasn't applied, or never arrived.

**Diagnosis procedure:**

1. `debug_attach_sim`, then `debug_breakpoint_add` at the `x_tool_result` / `x_search_results` terminal branches of `accumulateToolCallDelta`, and a second at `processSseLine` in `services/streaming.ts`.
2. Reproduce the tool call. Observe whether the `processSseLine` breakpoint _fires_ for the result block:
   - **Result line never arrives** → the breakpoint at the terminal branch never hits and `processSseLine` shows no result-bearing delta. Root cause is upstream (server/stream), not the accumulator. Classify per the stream symptom; the card is correctly "running" because the result genuinely never came.
   - **Result line arrives but card stays running** → the terminal breakpoint fires; now read state.
3. At the terminal branch, `debug_variables` / `debug_lldb_command`:
   - `po delta.x_tool_result` (or `x_search_results`) — is `tool_call_id` / `tool_use_id` present?
   - `p acc.idToKey` — does that id resolve to the same key the running entry was created under?
   - `po acc.byKey` — is `status` flipping to `completed`, or is a _second_ entry being created (a fork) so the _original visible_ card is orphaned?
4. **The classic bug this surfaces:** the result's id doesn't match the key the card was created under, so `ensure()` mints a fresh `id:<x>` entry, the original entry never reaches `completed`, and `toolCallList` now returns two entries (one stuck "running", one completed) — or the stuck one renders and the completed one is below the fold. This is the exact failure the accumulator's `nameToKey`/`idToKey` reconciliation is designed to prevent; a breakpoint proves whether reconciliation actually ran.
5. Capture `debug_stack` + the variable dump as the artifact, `debug_breakpoint_remove` + `debug_detach`, and file the issue with the live evidence (not a guess).

### Expected output

- `debug_attach_sim` returns an attached session bound to the AGI Mobile pid.
- Each `debug_breakpoint_add` returns a breakpoint id and resolves to a real address (not "pending / unresolved" — an unresolved breakpoint usually means a Release build or a symbol-name mismatch).
- Breakpoints fire during the reproduction; `debug_stack` shows frames consistent with the table above.
- `debug_variables` / `debug_lldb_command` return concrete live values.
- `debug_detach` leaves the app running.

### Acceptance criteria

- [ ] LLDB attaches to the running app and at least the three target breakpoints resolve.
- [ ] The accumulator breakpoint demonstrates a server tool reaching `completed` and an MCP tool keyed by id (no name-fork duplicate).
- [ ] The stream breakpoint shows SSE lines parsed and `onDone`/`finish_reason` reached on a clean reply; the reconnect `catch` is observed (or deliberately induced — see Phase 25 interrupted-stream).
- [ ] The trust-gate breakpoint confirms Local mode reaches `EgressBlockedError` and does **not** call `secureFetch` for an our-cloud host.
- [ ] All breakpoints removed and the debugger detached cleanly; app still responsive.

### Bug-classification examples

- **Critical:** at the `guardedFetch` breakpoint, in Local mode, execution reaches `secureFetch` for an our-cloud host (`agiworkforce.com`, `api.agiworkforce.com`, `signaling.agiworkforce.com`, a Neon `*.neon.tech`, or a Clerk host). That is a live trust-boundary violation — stop the run, capture `debug_stack`, report as Critical.
- **Critical:** attaching or hitting a breakpoint reproduces a crash with a native stack; capture `debug_stack` and the crashing thread.
- **High:** the accumulator terminal branch fires with a valid `tool_call_id` but the entry never reaches `completed` (the stuck-card root cause) — core tool-call UI is broken.
- **High:** the reconnect loop exhausts `MAX_RECONNECT_ATTEMPTS` and surfaces no `onError` (the assistant message hangs "streaming" forever) — observable at the `streamChat` tail breakpoint.
- **Medium:** a breakpoint won't resolve because the running build is Release/optimized when a Debug build was expected; the run continues but with reduced introspection (note it).
- **Low:** `debug_variables` shows a value as `<optimized out>` for a single local in an otherwise Debug build (note, doesn't block).

### Recovery

- **Breakpoints pending/unresolved:** confirm a Debug build is installed (Release strips symbols). Rebuild Debug via the Part 1 build flow, reinstall, relaunch, re-attach.
- **Attach fails ("could not attach"):** the process may not be running or a stale debugserver is held — `stop_app_sim`, `launch_app_sim`, retry `debug_attach_sim`. If it persists, `boot_sim` fresh.
- **App frozen after a stop:** `debug_continue`; if still wedged, `debug_detach` then `stop_app_sim`/`launch_app_sim`.
- **Detach killed the app:** record it as a finding, then relaunch for subsequent phases.
- **Never** paper over a missed breakpoint by asserting the path "must have run." If it didn't fire, say so.

### Checklist

- [ ] Debug build confirmed installed.
- [ ] `debug_attach_sim` attached to the AGI Mobile pid.
- [ ] `debug_breakpoint_add` set at accumulator, stream handler, and `guardedFetch`.
- [ ] Reproduced a tool call; accumulator breakpoint hit and inspected (`debug_stack` + `debug_variables`).
- [ ] Stream breakpoint hit; SSE parse + done/reconnect path inspected.
- [ ] Trust-gate breakpoint hit; Local mode confirmed fail-closed (no `secureFetch`).
- [ ] Worked stuck-card diagnosis completed and classified.
- [ ] `debug_lldb_command` used at least once for ad-hoc inspection.
- [ ] `debug_continue` resumed execution at each stop.
- [ ] `debug_breakpoint_remove` for every breakpoint; `debug_detach` clean; app still responsive.
- [ ] Any earlier-phase crash escalated here with a captured stack.

---

# Phase 22 — Coverage

**Goal:** Run the in-repo automated test suite on the simulator, produce an overall coverage report, drill into the files this playbook cares most about (chat / tool-call / model / gate), identify the weak files, and set a coverage floor so regressions in test coverage are caught, not discovered.

### What the repo actually has (ground truth)

`apps/mobile` ships **~148 Jest test files** (`__tests__/` plus feature-local `src/features/**/__tests__/`), driven by `jest.config.js` (preset `jest-expo`). The package scripts are `test` (`jest --runInBand --forceExit`), `test:local`, and `test:handles`. **Detox** e2e specs exist under `scripts/screenshots/specs/` but Detox is intentionally **not** in `devDependencies` (per `detox.config.js`: the founder must `pnpm add -D detox@20` on a machine with a simulator before they run). So:

- **Unit/integration coverage** = Jest. This is what `get_coverage_report` / `get_file_coverage` and `test_sim` summarize.
- **e2e on-device** = Detox, gated on a manual install. If Detox isn't installed, that lane reads `NOT RUN — detox not installed` in the report. **Do not fabricate Detox results.**

Note the config deliberately ignores three suites (`healthkit`, `auth-401`, `api-paywall`) and the Detox specs — that exclusion is tracked in `tasks/quality-sweep-2026-05-19/squad-mobile.md`. Coverage numbers must be read with that exclusion in mind (don't report those files as "0% — untested" when they're deliberately out of this pass).

### Exact tool sequence

1. `test_sim` — run the Jest suite (coverage enabled). This is the first time `test_sim` is exercised in the playbook. Confirm the suite executes and the pass/fail tally returns.
2. `get_coverage_report` — overall coverage summary (statements / branches / functions / lines, total and per-directory). Record the four headline percentages verbatim.
3. `get_file_coverage` for the playbook-critical files (run once per file):
   - `src/features/chat/utils/toolCallAccumulator.ts`
   - `services/streaming.ts`
   - `services/remoteChatGate.ts`
   - `lib/egressGuard.ts`
   - `lib/pinning.ts`
   - the chat store (`chatStore` / `chatExecutionStore`) and `MessageContentRenderer` / `InlineToolCall` if surfaced.
4. Cross-reference against the known tests: `tool-call-accumulator.test.ts`, `streaming-timeout.test.ts`, `streaming-completions-fallback.test.ts`, `remoteChatGate.test.ts`, `egress-guard.test.ts`, `secure-fetch.test.ts`, `pinning.test.ts`, `trust-boundary.test.ts`, `chatStore.test.ts`. A critical file with high coverage and a matching test file is a green cell; a critical file with low coverage is a flagged weak file.

### Expected output

- `test_sim` reports N passed / M failed / K skipped with a nonzero suite count (~145 executable after the 3 ignored).
- `get_coverage_report` returns concrete overall percentages.
- `get_file_coverage` returns per-file line/branch coverage for each critical file.
- A ranked "weak files" list (lowest coverage among files this playbook touches).

### Acceptance criteria

- [ ] `test_sim` ran to completion; the pass/fail tally is recorded (not inferred).
- [ ] `get_coverage_report` overall numbers captured verbatim.
- [ ] `get_file_coverage` captured for every critical file listed above.
- [ ] Weak files identified and listed with their numbers.
- [ ] A coverage **floor** is stated (see below) and any file under floor is flagged.

### Setting the coverage floor (policy, not a fabricated number)

Set the floor from what the suite _actually reports today_, then forbid regression below it. Recommended policy:

- **Trust-boundary + tool-call files are load-bearing and must stay high.** Treat `lib/egressGuard.ts`, `services/remoteChatGate.ts`, `lib/pinning.ts`, and `src/features/chat/utils/toolCallAccumulator.ts` as a "critical set" whose line coverage floor is the **higher of 90% or today's measured value**. These four are exactly where a silent regression is a Critical user-facing bug (egress leak, stuck tool card), so they get the strictest floor.
- **Overall floor** = today's measured overall, rounded down to the nearest whole percent. The number itself comes from `get_coverage_report`; the _rule_ is "must not drop below this in a later run."
- **Record the floor in the report** so the next regression run (Phase 23) compares against it. If a later run dips below the critical-set floor, that's a **High** (or **Critical** if it's the egress/pinning files and the dropped lines are the fail-closed branches).

### Bug-classification examples

- **Critical:** `lib/egressGuard.ts` coverage shows the Local-mode _block_ branch (the `EgressBlockedError` path) is uncovered — the single most important fail-closed line has no test. Even with a passing build, an untested egress-block path is a Critical gap.
- **High:** `toolCallAccumulator.ts` reconciliation branches (`nameToKey` reuse, `idToKey` terminal) are uncovered while the file is otherwise green — the stuck-card class can regress undetected.
- **High:** `test_sim` reports failing tests (not just low coverage) — the suite is red; triage before trusting any other Part-4 result.
- **Medium:** a critical file sits 10–20 points under the proposed floor (real gap, but not the fail-closed lines).
- **Low:** a non-critical helper is under floor; note it for backlog.

### Recovery

- **`test_sim` fails to launch:** confirm the simulator is booted (Part 1) and the project builds; a broken build fails the suite for the wrong reason. Rebuild, retry.
- **Suite hangs:** the package uses `--runInBand --forceExit` for a reason (open handles); if it still hangs, the `test:handles` script (`--detectOpenHandles`) surfaces the culprit.
- **Coverage tool returns nothing:** ensure coverage was enabled for the run; re-run `test_sim` with coverage, then `get_coverage_report`.
- If a file genuinely can't be measured, the cell is `NOT RUN — <reason>`, never an invented percentage.

### Checklist

- [ ] `test_sim` executed; pass/fail/skip tally recorded.
- [ ] `get_coverage_report` overall numbers recorded verbatim.
- [ ] `get_file_coverage` recorded for all critical files.
- [ ] Weak-file list produced.
- [ ] Critical-set floor (≥90% / today's value) and overall floor stated in the report.
- [ ] Any file under floor flagged with severity.
- [ ] Detox lane explicitly marked `NOT RUN — detox not installed` if the binary is absent.

---

# Phase 23 — Regression

**Goal:** Re-run the entire playbook (Parts 1–4) headlessly and deterministically, diff screenshots against a stored baseline, triage flakes, and define exactly what to do when a previously-passing screen regresses. The playbook stops being a one-time audit and becomes a **repeatable suite** you can run on every meaningful change.

### Deterministic conditions (make the run reproducible)

Non-determinism is the enemy of regression. Before a regression run, pin everything you can:

1. **Fixed device/sim profile.** Use the same simulator (per `detox.config.js` the canonical device is **iPhone 17 Pro**) at the same OS via the session defaults (Phase 24's `session_use_defaults_profile`). Same device + OS = comparable screenshots.
2. **Fixed model.** Pin the chat model so the _plumbing_ is what's under test, not the model's prose. Read the model id from `packages/contracts/types/src/models.json` (never hardcode/guess a model id). For Local mode, pin the installed local model; for Cloud, pin one model id and one effort setting.
3. **Seeded prompts.** Use a fixed prompt set so the same tool calls fire each run: one plain prompt, one that forces a tool call (web_search/MCP), one long prompt for long-list scroll, one that triggers an artifact. Store them in the run config.
4. **Appearance + type fixed per pass.** Run the visual diff pass twice deliberately (light, then dark) and at default + one larger Dynamic Type — but compare light-vs-light and dark-vs-dark, never across appearances.
5. **Stable clock/state where it matters.** Start from a known state (fresh install or a seeded conversation) so "empty state vs populated" isn't a spurious diff. Reset between runs (`stop_app_sim` + reinstall clean) when a test needs a virgin app.

### Exact tool sequence (headless re-run)

1. **Establish/refresh the baseline** (first run only, or after an intentional UI change you've signed off):
   - Drive every phase's key screens with the standard `snapshot_ui` → locate → act flow.
   - `screenshot` each key screen into a dated **baseline** folder (`baseline/<phase>-<screen>-<appearance>`).
2. **Run the candidate:**
   - Repeat the same scripted drive with the same deterministic conditions.
   - `screenshot` into a **candidate** folder using identical names.
   - Use `batch` (Phase 24) to run same-screen sequences so the candidate run is fast and consistent.
3. **Diff baseline vs candidate** for each screen pair. (XcodeBuildMCP captures the images; the diff is a pixel/structural compare of the matched pair. Where the harness lacks a built-in differ, the comparison is "same name, baseline vs candidate, flag any visible delta.") Pair each image diff with a `snapshot_ui` hierarchy diff so a _structural_ change (a control that disappeared) is caught even when pixels look similar.
4. **Re-run the Jest suite** (`test_sim` + `get_coverage_report`) and compare against the Phase 22 floor.
5. **Classify every delta** as: intended change (update baseline), regression (file issue), or flake (see triage).

### Screenshot baseline diffing — before/after a change

The canonical use: you (or a dev) made a change; prove what moved.

- **Before:** snapshot the affected screens to `baseline/` _prior_ to the change.
- **After:** snapshot the same screens to `candidate/` _after_ the change.
- **Expected diffs:** only the screens the change touched should differ. A diff on an _unrelated_ screen is a regression until proven otherwise.
- **Pair every visual diff with a `snapshot_ui` diff.** A button that became invisible-but-present (wrong color, off-screen) is a structural regression a naive pixel diff in dark mode might miss; the hierarchy diff catches the presence/absence and frame change.

### Flake triage

A diff is a **flake** (not a regression) only if it's _non-deterministic and cosmetic_. Triage:

1. **Re-run the single failing screen 3×** under identical conditions. Consistent diff → real regression. Intermittent → candidate flake.
2. **Common flake sources:** streaming token timing (caught a frame mid-stream — fix with `wait_for_ui` on the _final_ state, not a sleep); blinking caret/cursor; spinner phase; relative timestamps; momentum-scroll resting position; reduce-motion vs animated. Tighten the wait condition so the screenshot is taken at a settled state.
3. **Quarantine, don't ignore.** A genuinely flaky screen is logged as a **Low** "flaky screenshot — needs a deterministic wait," not silently dropped, and not counted as PASS. The fix is a better `wait_for_ui` anchor, not a retry-until-green loop.
4. **Never** mark a flaky check green by re-running until it happens to match. That's a fabricated pass (Critical reporting defect).

### What to do when a previously-passing screen regresses

1. **Confirm it's real:** re-run that screen 3× (above). If consistent, it's a regression.
2. **Localize:** `snapshot_ui` diff to find _which_ element changed (missing/moved/restyled/relabeled). Check the element's `testID` so the issue is precise.
3. **Reproduce manually** in the live app to confirm it's not an automation artifact.
4. **If it's the trust boundary or a core flow** (send/stream/tool-call/model-switch/auth), escalate immediately per severity — these don't wait for the end of the run.
5. **Bisect if you can:** if a change set is known, the before/after baseline pair points at the culprit screen; hand the dev the two images + the `snapshot_ui` diff + repro.
6. **File the issue** with `{id, severity, phase, screen, testID, expected, actual, baseline-shot, candidate-shot, repro, suggested fix}` and add it to the end-of-run table.

### Expected output

- A baseline set and a candidate set of named screenshots per key screen + appearance.
- A per-screen diff verdict: match / intended-change / regression / flake.
- A re-run Jest tally + coverage compared to floor.
- A regression list folded into the issues table.

### Acceptance criteria

- [ ] Deterministic conditions documented for the run (device, OS, model id, prompt seeds, appearance/type).
- [ ] Baseline and candidate screenshot sets captured with identical names.
- [ ] Every key screen has a diff verdict; `snapshot_ui` diff paired with each visual diff.
- [ ] Jest re-run compared to the Phase 22 coverage floor.
- [ ] Every regression filed; every flake quarantined as Low (not hidden, not retried-to-green).

### Bug-classification examples

- **Critical:** a regression where Local mode now shows a cloud/network indicator or a previously-blocked egress now fires (re-verify at the `guardedFetch` breakpoint) — trust-boundary regression.
- **High:** the send button / stop button / tool-call card / model picker regressed (missing, dead, or mis-wired vs baseline).
- **Medium:** a loading/empty/error/disabled state that existed in baseline is gone in candidate; or a parity behavior drifted.
- **Low:** a flaky screenshot needing a better wait anchor; a minor spacing drift confirmed stable.
- **Cosmetic:** sub-pixel/animation-phase differences that are stable and immaterial.

### Recovery

- **Whole candidate run drifts (every screen diffs):** you changed device/OS/appearance/model — re-pin the deterministic conditions and re-baseline.
- **App in a weird state mid-regression:** reset clean — `stop_app_sim`, reinstall (`install_app_sim`), `launch_app_sim` — so the candidate starts from the same state as baseline.
- **Sim itself misbehaving:** `boot_sim` fresh (or erase + boot), reinstall, re-run.
- **Suite red on re-run but baseline was green:** treat as a real regression in code/tests, not a harness issue, until proven otherwise.

### Checklist

- [ ] Deterministic conditions pinned and recorded.
- [ ] Baseline screenshots captured (or confirmed current).
- [ ] Candidate screenshots captured with matching names.
- [ ] Visual + `snapshot_ui` diffs produced per key screen.
- [ ] `test_sim` re-run; coverage compared to floor.
- [ ] Flakes triaged (3× re-run rule) and quarantined as Low.
- [ ] Regressions filed with both shots + repro.
- [ ] No check marked green by retry-until-match.

---

# Phase 24 — Batch Automation + Profiles

**Goal:** Use `batch` to run multi-step same-screen sequences efficiently, use `session_use_defaults_profile` to switch device/sim profiles, and assemble a single **end-to-end smoke macro** — launch → local chat → tool call → model switch → settings — as one repeatable batch. This is what makes the regression suite (Phase 23) fast and the daily smoke cheap.

### `batch` — when and how

`batch` groups multiple UI actions into one call so a same-screen sequence runs without per-step round-trips. Use it for deterministic sequences where you already know the targets; do **not** use it to skip the locate step for elements whose position you haven't confirmed.

**Good `batch` candidates (same screen, known targets):**

- Composer entry: focus `chat.composer.input` → `type_text` a seeded prompt → tap `chat.composer.send`.
- Mode toggle exercise: tap `chat.mode-toggle` → assert `chat.mode-toggle.local` / `.cloud` state.
- Double-tap / long-press sequences (the README notes double-tap is expressed via `batch`).
- Settings sweeps: tap into a settings row, read state, back out — repeated across rows.
- Hardware sequences via `button` / `key_press` / `key_sequence` (Home, lock, rotate, Return) chained where order matters.

**Rule:** every `batch` is preceded by a `snapshot_ui` so the targets are real, and followed by a `wait_for_ui` + `screenshot` so the end state is asserted, not assumed. A `batch` that taps blind coordinates violates the spine's "locate before acting."

### `session_use_defaults_profile` — device/sim profiles

`session_use_defaults_profile` switches the saved session defaults (which simulator/scheme/config subsequent calls use) to a named profile. This is the first time this tool is exercised in the playbook — it complements Part 1's `session_show/set/clear_defaults`.

Use it to run the smoke macro across more than one device class without re-specifying the simulator on every call:

- A **primary** profile (canonical: iPhone 17 Pro, per `detox.config.js`) for the main pass.
- A **secondary** profile (a smaller/older iPhone class, or a different OS) for a cross-device pass — small screens are where safe-area, Dynamic Type, and composer layout regress.
- Optionally an **iPad/large** profile if the app supports it, to catch wide-layout issues.

Sequence: `session_use_defaults_profile <primary>` → run the smoke macro → `session_use_defaults_profile <secondary>` → run the smoke macro again → compare. After switching profiles, confirm the target sim is booted (`list_sims` / `boot_sim`) before driving UI.

### The end-to-end smoke macro (one batch-driven flow)

This is the repeatable "is the app fundamentally alive?" check. It exercises the four pillars in order and is the thing you run first on every build and inside the regression suite.

**Macro steps (each step = snapshot → act-via-`batch` → wait → screenshot):**

1. **Launch:** `launch_app_sim` (or `boot_sim` + `install_app_sim` + `launch_app_sim` from cold). `wait_for_ui` for the chat tab root; `screenshot` `smoke-01-launch`.
2. **Local chat:** confirm `chat.mode-toggle.local` is selected; `batch`: focus `chat.composer.input` → `type_text` a seeded local prompt → tap `chat.composer.send`. `wait_for_ui` for the assistant bubble to finish streaming; `screenshot` `smoke-02-local-reply`. (Local mode here is also a passive trust check — see acceptance.)
3. **Tool call:** send a seeded prompt that triggers a tool call; `wait_for_ui` for the tool-call card to reach `completed`; `screenshot` `smoke-03-toolcall`. (If the tool call requires Cloud, this step explicitly switches to Cloud mode first via `chat.mode-toggle.cloud` and the switch itself is part of the macro.)
4. **Model switch:** open the model picker (`ModelSelectorButton` → `ModelPickerSheet`), select a different model id (read from `models.json`), confirm the new model label renders; `screenshot` `smoke-04-model-switch`.
5. **Settings:** navigate to the account/settings tab, open one representative settings screen, assert it renders with its controls, back out; `screenshot` `smoke-05-settings`.

Wrap the whole macro in `record_sim_video` so a single artifact shows the end-to-end flow. The macro's PASS = all five screenshots captured, each end state asserted via `wait_for_ui`/`snapshot_ui`, no crash, and no Local-mode egress.

### Expected output

- A single named macro run producing `smoke-01`…`smoke-05` screenshots + one video.
- The same macro re-run under a second device profile via `session_use_defaults_profile`.
- Each `batch` step's end state asserted (not assumed).

### Acceptance criteria

- [ ] `batch` used for at least the composer-entry and mode-toggle same-screen sequences, each preceded by `snapshot_ui` and followed by `wait_for_ui` + `screenshot`.
- [ ] `session_use_defaults_profile` switched profiles and the macro ran on ≥2 device classes.
- [ ] The five-step smoke macro completed end-to-end on the primary profile with all artifacts.
- [ ] No step taps blind coordinates; every target came from a `snapshot_ui`.
- [ ] Local-chat step confirmed no egress (passive trust check).

### Bug-classification examples

- **Critical:** the smoke macro's local-chat step triggers network egress to our cloud (catch via the Phase 21 `guardedFetch` breakpoint or a network indicator) — trust violation in the most basic flow.
- **High:** the macro can't complete a pillar — send does nothing, the tool-call card never completes, the model switch doesn't change the active model, or settings won't open.
- **Medium:** the macro completes on the primary profile but a pillar regresses only on the secondary (small-screen) profile (e.g. composer clipped, settings row truncated).
- **Low:** a `batch` step needed an extra `wait_for_ui` to be reliable (timing nit); macro still passes.
- **Cosmetic:** minor layout polish visible only at one profile.

### Recovery

- **`batch` step missed its target:** the screen wasn't settled — insert a `wait_for_ui` before the `batch`, re-`snapshot_ui`, retry. Never retry blind.
- **Profile switch points at an unbooted sim:** `list_sims` → `boot_sim` the profile's device, then re-run.
- **Macro wedges mid-flow:** `stop_app_sim` → `launch_app_sim` to reset to step 1; if the sim is bad, `boot_sim` fresh + `install_app_sim`.
- **Model switch step can't find a second model:** read `models.json` for an installed/available alternate; if only one is available in this build, note it and mark the step `LIMITED` (not failed, not faked).

### Checklist

- [ ] `batch` exercised for composer entry and mode toggle (and one settings sweep).
- [ ] Every `batch` bracketed by `snapshot_ui` (before) and `wait_for_ui` + `screenshot` (after).
- [ ] `session_use_defaults_profile` switched to a secondary device profile.
- [ ] Target sim booted after each profile switch.
- [ ] Smoke macro `smoke-01`…`smoke-05` captured on primary profile.
- [ ] Smoke macro re-run on secondary profile; deltas noted.
- [ ] `record_sim_video` captured the macro end-to-end.
- [ ] Local-chat step confirmed egress-free.

---

# Phase 25 — Performance / Memory + Error States + Failure Recovery + REPORT

This is the final phase. It has four parts: **(A) performance & memory**, **(B) error states & recovery**, **(C) failure-recovery procedures**, and **(D) the end-of-run report** with the 44-tool matrix. Run A–C, then assemble D.

---

## 25A — Performance & Memory

**Goal:** Measure that the app feels like a production AI app under realistic load — fast launch, smooth streaming and scrolling, no jank, no runaway memory over a long conversation, no obvious leaks.

### What to measure and how

- **Cold vs warm launch time.**
  - _Cold:_ `stop_app_sim` (ensure killed) → start `record_sim_video` → `launch_app_sim` → `wait_for_ui` for the first interactive chat frame. The launch duration is the elapsed time to first interactive frame (read from the video timeline / launch timestamps).
  - _Warm:_ background the app (`button` Home), then `launch_app_sim`/foreground → `wait_for_ui`. Warm should be meaningfully faster than cold.
  - Run each 3× and report the range, not a single cherry-picked number.
- **FPS during streaming.** Start `record_sim_video`, send a prompt that produces a long streamed reply, and watch the token-by-token render. Inspect the video for dropped frames / stutter during continuous text growth. The streaming path renders incrementally (`services/streaming.ts` decodes SSE token-by-token); the UI must keep up without locking.
- **FPS during long-list scroll.** Build a long conversation (Phase 23's seeded long prompt set), then `swipe`/`gesture` fast-scroll the `MessageList`. Watch for stutter; confirm the list virtualizes (it uses a virtualized list — `MessageList` / FlashList per the spine). A long list that doesn't virtualize will jank and balloon memory.
- **Animation smoothness / jank detection.** Watch transitions captured during Parts 2–3 (sheet open/close, mode toggle, model picker, navigation) in the videos; flag any frame hitch, late start, or wrong-direction motion. Re-check with reduce-motion on (the OfflineBanner and others honor it).
- **Memory growth over a long conversation.** Attach LLDB (`debug_attach_sim`) and sample memory at three points: fresh chat, after ~20 turns, after ~50 turns + several tool calls + an artifact. Use `debug_lldb_command` for process memory (e.g. an LLDB memory/`image`/`memory region` style query, or read the footprint via the available LLDB facility). The expectation is bounded growth that _recovers_ after navigating away / clearing the conversation — not monotonic climb.
- **Leak hunting via `debug_lldb_command`.** With the debugger attached, repeat a suspected-leaky action (open/close the model sheet 10×; start/cancel a stream 10×; attach/detach a large file 10×) and sample memory before/after each cycle. A step-function that never comes back down is a leak signature — capture `debug_stack` at a representative point and the memory deltas.
- **Battery / CPU notes.** The app has explicit thermal/battery edge cases (`ThermalThrottleModal`, `BatteryLowModal`). Note sustained high CPU during idle (should be ~0 when not streaming) and whether a long inference session would plausibly trip the thermal path. These are observational notes on the simulator (true battery/thermal needs a device), recorded as such — don't fabricate device-only numbers.

### Acceptance criteria

- [ ] Cold and warm launch each measured 3×; ranges recorded; warm < cold.
- [ ] Streaming render inspected for dropped frames; verdict recorded.
- [ ] Long-list scroll inspected; virtualization confirmed; no sustained stutter.
- [ ] Key animations inspected for jank (and re-checked with reduce-motion).
- [ ] Memory sampled at fresh / ~20 / ~50 turns; growth bounded and recovers.
- [ ] At least one leak-hunt cycle (10× repeat) run with before/after memory deltas.
- [ ] CPU-at-idle and thermal/battery observations noted (sim caveats stated).

### Bug-classification examples

- **Critical:** an OOM crash during a long conversation or long-list scroll (capture `debug_stack`); or memory climbs unbounded until the app is killed.
- **High:** streaming visibly drops frames / the UI locks during a long reply; or long-list scroll janks badly enough to be unusable; or a clear leak (memory never recovers across cycles).
- **Medium:** cold launch is sluggish vs a production AI app; a transition stutters on first run; idle CPU is non-trivial when nothing is streaming.
- **Low:** a single animation a touch late/abrupt; warm launch only marginally faster than cold.
- **Cosmetic:** a one-frame hitch that doesn't affect feel.

### Recovery

- **Sim performance is unrepresentative** (host load): close other load, re-measure; state the sim caveat in the report; never present a janky-because-host result as an app defect without confirming.
- **App crashes under load:** escalate to Phase 21 — attach, reproduce, capture the stack — then reinstall clean and continue.
- **Memory tool returns nothing:** re-attach; if `debug_lldb_command` can't read footprint in this configuration, record memory as `NOT MEASURED — tool limitation` rather than guessing.

### Checklist

- [ ] Cold/warm launch measured (3× each) and recorded as ranges.
- [ ] Streaming FPS / jank inspected on video.
- [ ] Long-list scroll + virtualization checked.
- [ ] Animation smoothness checked (default + reduce-motion).
- [ ] Memory sampled at 3 conversation depths.
- [ ] Leak-hunt cycle run with `debug_lldb_command` deltas.
- [ ] CPU/thermal/battery notes recorded with sim caveats.

---

## 25B — Error States & Recovery

**Goal:** Force every failure the app is built to handle and confirm each one shows a **clear state** and a **working recovery** — never a blank screen, a silent hang, or a fabricated success. The app ships a dedicated edge-case layer; this sub-phase exercises it.

### The error surfaces (ground truth)

From `src/features/edge-cases/components/` and `MessageErrorScreen.tsx`, the app has:

- **`MessageErrorScreen`** (full-area, replaces `<MessageList />`): `ModelMissingError` ("Model not installed" → CTA "Choose a model"), `DiskFullError` ("Not enough storage" → "Try again"), `NetworkError` ("Can't connect" → "Try again"). Each has icon + title + body + primary retry + optional dismiss, and `accessibilityRole="alert"`.
- **`OfflineBanner`** (global, top): "You're offline. Local chats still work on this device." — `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"`, auto-dismiss on reconnect, honors reduce-motion.
- **Edge modals:** `FileTooLargeModal` ("File too large … ≤50MB"), `ImageTooLargeModal` ("Image too large … ≤10MB"), `FileUnreadableModal`, `StorageFullModal` ("Not enough space" → "Open Storage Settings"), `BatteryLowModal`, `ThermalThrottleModal`, `ModelLoadingFirstRunModal`, `CloudTeaseModal`.
- **Stream errors / paywall / auth:** `services/streaming.ts` surfaces a timeout as a real `onError` ("The request timed out…"), a 429 paywall as `ApiPaywallError` → `PaywallBottomSheet`, and 3-attempt reconnect with `onReconnecting`. `services/remoteChatGate.ts` gates Cloud with explicit messages ("Sign in to use AGI Cloud chat. Local Mode stays available on this device.").

### Force each state and verify recovery

For each, drive it, `screenshot` the state, confirm the message + recovery affordance, exercise recovery, `screenshot` the recovered state.

1. **Offline (airplane mode).** Toggle the simulator offline (e.g. `xcrun simctl status_bar … data` / disable networking, or via hardware menu). Expect `OfflineBanner` to slide in with the exact copy and `alert` role. **Recovery:** Local chat must still work fully (send a local prompt — it should stream on-device with no egress); banner auto-dismisses on reconnect. _Trust check:_ offline is a strong moment to confirm Local mode is genuinely on-device.
2. **Server error (Cloud).** In Cloud mode, induce a non-2xx (or attach + force the `!response.ok` path). Expect a clear error surfaced via `onError` (not a hung "streaming" bubble). For a 429 paywall payload, expect `PaywallBottomSheet`, not a generic toast. **Recovery:** retry affordance present; retry works when the condition clears.
3. **Interrupted stream.** Start a Cloud reply, then drop the network mid-stream (toggle offline during streaming). Expect the reconnect path (`onReconnecting`, up to `MAX_RECONNECT_ATTEMPTS` with `RECONNECT_DELAYS` backoff). **Recovery:** either it reconnects and finishes, or after exhausting attempts it surfaces a real error (the message must **not** hang "streaming" forever — that exact silent failure is called out in the code as fixed). Verify at the Phase 21 `streamChat` breakpoint if ambiguous.
4. **Oversized file / image.** Attempt to attach a file >50MB and an image >10MB via the add-to-chat sheet (`add-to-chat-sheet`). Expect `FileTooLargeModal` / `ImageTooLargeModal` with the exact copy and a "Got it" dismiss. Try an unreadable type → `FileUnreadableModal`. **Recovery:** dismiss returns to composer with no broken attachment state.
5. **Expired / missing auth.** In Cloud mode with no/expired session, expect the remoteChatGate message ("Sign in to use AGI Cloud chat. Local Mode stays available…") and a sign-in path — **not** a silent drop and **not** a fallback that routes the chat anyway. **Recovery:** signing in restores Cloud; Local stays available throughout.
6. **Model missing / disk full (MessageErrorScreen).** Select a Local model that isn't installed → `ModelMissingError` ("Model not installed" → "Choose a model"). Simulate low storage → `DiskFullError` / `StorageFullModal`. **Recovery:** the CTA routes to the model picker / storage settings; the message-area screen has `accessibilityRole="alert"` so VoiceOver announces it.

### Acceptance criteria

- [ ] Each of the six classes forced; the correct surface appears with its exact copy.
- [ ] Each surface has a working recovery affordance that actually recovers.
- [ ] No failure produces a blank screen, a permanent spinner, or a silent hang.
- [ ] Interrupted stream either reconnects or surfaces a real error (never hangs "streaming").
- [ ] Offline + auth-expired confirm Local stays available and on-device (no covert egress).
- [ ] Alert roles / live regions announce errors to VoiceOver.

### Bug-classification examples

- **Critical:** the auth-expired or offline path _silently routes a Local chat to cloud_, or a Cloud failure falls back to sending without consent — trust violation. Also: any error path that crashes.
- **Critical:** an "available/public" claim shown for a feature whose runtime doesn't actually serve in this failure state (overclaim).
- **High:** an interrupted stream hangs "streaming" forever with no error (the exact regression the reconnect/timeout code guards); or a server error shows nothing; or a recovery CTA is dead.
- **Medium:** the right modal appears but with wrong/missing copy, or the dismiss leaves a broken attachment/compose state; missing alert role so VoiceOver stays silent.
- **Low:** copy nit in an error string; banner animation slightly off (and not reduce-motion-respecting).
- **Cosmetic:** icon/spacing polish in a modal.

### Recovery (of the test harness, when forcing states wedges)

- **Can't toggle network on the sim:** use the alternate method (status-bar override vs full networking toggle); if neither works in this environment, mark the offline/interrupt cases `NOT RUN — sim networking not controllable` rather than faking them.
- **App stuck in an error screen:** use the screen's own recovery; if dead, `stop_app_sim`/`launch_app_sim`.
- **State won't reset between cases:** reinstall clean (`install_app_sim`) so each error case starts fresh.

### Checklist

- [ ] Offline → `OfflineBanner` + Local-still-works + auto-dismiss.
- [ ] Server error → clear `onError` / `PaywallBottomSheet`; retry works.
- [ ] Interrupted stream → reconnect or real error (no infinite "streaming").
- [ ] Oversized file/image/unreadable → correct modal + clean dismiss.
- [ ] Auth expired → gate message + sign-in path; Local stays; no covert routing.
- [ ] Model-missing / disk-full → `MessageErrorScreen` + working CTA + alert role.
- [ ] Every recovery exercised and confirmed.

---

## 25C — Failure-Recovery Procedures (standard playbook)

**Goal:** A fixed, named recovery for each failure class so the agent never improvises or — worse — fakes a pass. When something breaks, apply the matching procedure, and if it can't be recovered, record a concrete blocker with evidence.

### Standard recovery by failure class

| Failure class                               | Symptom                                                                              | Standard recovery (in order)                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stale build / wrong config**              | Old behavior after a change; breakpoints won't resolve; Release where Debug expected | `clean` → `build_sim` (Debug) → `install_app_sim` → `launch_app_sim`. Confirm via `get_sim_app_path` it's the build you think.                                    |
| **Corrupt install / weird persisted state** | App behaves inconsistently, stuck onboarding, ghost data                             | Reinstall clean: `stop_app_sim` → uninstall → `install_app_sim` → `launch_app_sim`. For a true virgin app, erase the sim first.                                   |
| **Simulator wedged**                        | Black screen, unresponsive, sim services hung                                        | `stop_app_sim` → reboot sim (`boot_sim` after shutdown; erase + `boot_sim` if needed) → `open_sim` → reinstall → relaunch.                                        |
| **Debugger stuck / app frozen at a stop**   | Won't continue, attach failed, debugserver held                                      | `debug_continue`; if wedged `debug_detach` → `stop_app_sim`/`launch_app_sim`; re-attach `debug_attach_sim`. Remove stale breakpoints (`debug_breakpoint_remove`). |
| **Automation can't find a target**          | tap misses, element absent                                                           | Re-`snapshot_ui`; `wait_for_ui` for the element; never tap blind. If genuinely absent, that's a finding, not a retry loop.                                        |
| **Test suite red / hangs**                  | `test_sim` fails or never returns                                                    | Rebuild; re-run; use `test:handles` to find open handles; treat persistent failures as real regressions.                                                          |
| **Network can't be controlled**             | Can't force offline/interrupt                                                        | Try the alternate toggle; if impossible here, mark those cases `NOT RUN — <reason>`.                                                                              |
| **Crash (any phase)**                       | App dies                                                                             | Escalate to Phase 21: attach, reproduce, `debug_stack`; then reinstall clean and resume. File Critical.                                                           |

### The non-negotiable rule: never fake a pass

- A step that didn't run is `NOT RUN` with a reason. A step that failed is `FAIL` with evidence. A step you couldn't reach (no device, tool limitation) is `BLOCKED` with the cause. **None of these is PASS.**
- Do not retry-until-green a flaky check and report the lucky run. Do not infer a result from a build succeeding. Do not write a coverage/launch/FPS number you didn't measure.
- A fabricated PASS is itself a **Critical** reporting defect — it's the QA equivalent of the README's "overclaim shipped to users."
- If recovery exhausts the table above and the step still can't run, stop and record a concrete blocker: what you tried, what happened, the artifact, and what's needed to unblock.

### Checklist

- [ ] Each failure encountered mapped to its standard recovery and applied in order.
- [ ] Any unrecoverable failure recorded as a concrete blocker with evidence (not skipped, not faked).
- [ ] No PASS recorded without an executed, evidenced step.

---

## 25D — End-of-Run Report

**Goal:** Assemble the single report the spine asks for: per-phase PASS/FAIL, a classified issues table, coverage summary, the **44-tool usage matrix** confirming every tool was exercised, parity gaps (tool-calling + trust weighted highest), a prioritized fix list, and an artifacts index. Persist everything under a dated run folder.

### Report assembly rules

- **One report, dated run folder.** All screenshots, videos, `snapshot_ui` dumps, LLDB stacks, and coverage output live under `runs/<YYYY-MM-DD-HHMM>/` and are linked from the report by relative path.
- **Every issue gets the full record:** `{id, severity, phase, screen, testID, expected, actual, screenshot, video, repro, suggested fix}`.
- **Weighting:** when ranking parity gaps and the fix list, **tool-calling fidelity and trust-boundary integrity outrank everything else.** A trust leak or a broken tool-call card sits above any cosmetic or even most High UX issues.
- **Two automatic Criticals to scan for explicitly:** (a) any Local-mode egress; (b) any "available/public" claim a feature's runtime doesn't actually serve.
- **Honesty:** `PASS` only for executed+evidenced steps; otherwise `FAIL` / `NOT RUN` / `BLOCKED` with reason. The Detox e2e lane is `NOT RUN — detox not installed` unless the binary was actually installed and run.

### The 44-tool usage matrix

Confirm each tool was exercised somewhere across Parts 1–4. Tools whose **first** use is Part 4 are bolded.

| #   | Tool                             | Group                    | First exercised                     | Status |
| --- | -------------------------------- | ------------------------ | ----------------------------------- | ------ |
| 1   | discover_projs                   | Discovery/config         | Part 1                              | ☐      |
| 2   | list_schemes                     | Discovery/config         | Part 1                              | ☐      |
| 3   | show_build_settings              | Discovery/config         | Part 1                              | ☐      |
| 4   | session_show_defaults            | Discovery/config         | Part 1                              | ☐      |
| 5   | session_set_defaults             | Discovery/config         | Part 1                              | ☐      |
| 6   | session_clear_defaults           | Discovery/config         | Part 1                              | ☐      |
| 7   | **session_use_defaults_profile** | Discovery/config         | **Part 4 (Phase 24)**               | ☐      |
| 8   | build_sim                        | Build/run/test           | Part 1                              | ☐      |
| 9   | build_run_sim                    | Build/run/test           | Part 1                              | ☐      |
| 10  | clean                            | Build/run/test           | Part 1 (+ Phase 25C recovery)       | ☐      |
| 11  | **test_sim**                     | Build/run/test           | **Part 4 (Phase 22)**               | ☐      |
| 12  | get_app_bundle_id                | Build/run/test           | Part 1                              | ☐      |
| 13  | get_sim_app_path                 | Build/run/test           | Part 1 (+ Phase 25C)                | ☐      |
| 14  | **get_coverage_report**          | Coverage                 | **Part 4 (Phase 22)**               | ☐      |
| 15  | **get_file_coverage**            | Coverage                 | **Part 4 (Phase 22)**               | ☐      |
| 16  | list_sims                        | Sim mgmt                 | Part 1 (+ Phase 24)                 | ☐      |
| 17  | boot_sim                         | Sim mgmt                 | Part 1 (+ recovery)                 | ☐      |
| 18  | open_sim                         | Sim mgmt                 | Part 1 (+ recovery)                 | ☐      |
| 19  | install_app_sim                  | Sim mgmt                 | Part 1 (+ recovery)                 | ☐      |
| 20  | launch_app_sim                   | Sim mgmt                 | Part 1 (+ Phases 21/24/25)          | ☐      |
| 21  | stop_app_sim                     | Sim mgmt                 | Part 3 relaunch (+ Phases 21/24/25) | ☐      |
| 22  | screenshot                       | UI automation            | Part 2 (every phase)                | ☐      |
| 23  | snapshot_ui                      | UI automation            | Part 2 (every phase)                | ☐      |
| 24  | tap                              | UI automation            | Part 2                              | ☐      |
| 25  | touch                            | UI automation            | Part 2/3                            | ☐      |
| 26  | long_press                       | UI automation            | Part 2/3                            | ☐      |
| 27  | swipe                            | UI automation            | Part 2/3 (+ Phase 25 scroll)        | ☐      |
| 28  | drag                             | UI automation            | Part 3                              | ☐      |
| 29  | gesture                          | UI automation            | Part 3 (+ Phase 25 scroll)          | ☐      |
| 30  | type_text                        | UI automation            | Part 2 (+ Phase 24 macro)           | ☐      |
| 31  | button                           | UI automation (hardware) | Part 3 (+ Phase 25 launch)          | ☐      |
| 32  | key_press                        | UI automation (hardware) | Part 2/3 (+ Phase 24)               | ☐      |
| 33  | key_sequence                     | UI automation (hardware) | Part 2/3 (+ Phase 24)               | ☐      |
| 34  | wait_for_ui                      | UI automation            | Part 2 (every phase)                | ☐      |
| 35  | record_sim_video                 | UI automation            | Part 2 (+ Phases 24/25)             | ☐      |
| 36  | **debug_attach_sim**             | LLDB                     | **Part 4 (Phase 21/25)**            | ☐      |
| 37  | **debug_detach**                 | LLDB                     | **Part 4 (Phase 21)**               | ☐      |
| 38  | **debug_breakpoint_add**         | LLDB                     | **Part 4 (Phase 21)**               | ☐      |
| 39  | **debug_breakpoint_remove**      | LLDB                     | **Part 4 (Phase 21)**               | ☐      |
| 40  | **debug_continue**               | LLDB                     | **Part 4 (Phase 21)**               | ☐      |
| 41  | **debug_stack**                  | LLDB                     | **Part 4 (Phase 21/25)**            | ☐      |
| 42  | **debug_variables**              | LLDB                     | **Part 4 (Phase 21)**               | ☐      |
| 43  | **debug_lldb_command**           | LLDB                     | **Part 4 (Phase 21/25)**            | ☐      |
| 44  | batch                            | Batch                    | All parts (+ Phase 24 macro)        | ☐      |

> If any cell can't be honestly ticked, the report says so — an unexercised tool is a gap in the run, not something to backfill on paper. (Tools attributed to Parts 1–3 are confirmed by those parts; Part 4 is responsible only for the bolded first-use tools and for re-confirming the matrix is complete.)

### Report template (the agent fills this in)

```markdown
# AGI Mobile — XcodeBuildMCP QA Run Report

Run id: <YYYY-MM-DD-HHMM> Device/OS: <e.g. iPhone 17 Pro / iOS xx.x>
Build: <Debug|Release> <bundle id> <build hash/path from get_sim_app_path>
Model pinned: <model id from packages/contracts/types/src/models.json> Appearance: <light|dark + Dynamic Type>
Operator: autonomous QA agent (XcodeBuildMCP, 44 tools)

## 1. Per-phase result

| Phase | Name                            | Result            | Notes / blocker |
| ----- | ------------------------------- | ----------------- | --------------- |
| 1     | Environment/build/launch        | PASS/FAIL/NOT RUN |                 |
| 2     | Nav/chat/composer/stream/tools  |                   |                 |
| 3     | Settings/rotation/a11y/gestures |                   |                 |
| 21    | Debugging/LLDB                  |                   |                 |
| 22    | Coverage                        |                   |                 |
| 23    | Regression                      |                   |                 |
| 24    | Batch automation + profiles     |                   |                 |
| 25A   | Performance/memory              |                   |                 |
| 25B   | Error states                    |                   |                 |
| 25C   | Failure recovery                |                   |                 |

(Include every phase 1–25; one row each.)

## 2. Issues (classified)

| id      | sev      | phase | screen | testID | expected | actual | shot | video | repro | suggested fix |
| ------- | -------- | ----- | ------ | ------ | -------- | ------ | ---- | ----- | ----- | ------------- |
| AGI-001 | Critical |       |        |        |          |        |      |       |       |               |

(Sort Critical → High → Medium → Low → Cosmetic. Trust + tool-call issues first within a tier.)

## 3. Coverage summary

- Suite: <N passed / M failed / K skipped> (test_sim)
- Overall: stmts <%> · branches <%> · funcs <%> · lines <%> (get_coverage_report)
- Critical-set floor: <≥90% / measured> — files: egressGuard.ts, remoteChatGate.ts, pinning.ts, toolCallAccumulator.ts
- Per-file (get_file_coverage):
  | file | lines% | branches% | under floor? |
  | toolCallAccumulator.ts | | | |
  | services/streaming.ts | | | |
  | services/remoteChatGate.ts | | | |
  | lib/egressGuard.ts | | | |
  | lib/pinning.ts | | | |
  | chatStore | | | |
- Weak files (lowest, this-playbook scope): <list>
- Detox e2e: NOT RUN — detox not installed (unless actually run)

## 4. 44-tool usage matrix

(Paste the matrix above with each Status ticked or marked NOT RUN + reason.)

## 5. Parity gaps vs ChatGPT iOS / Claude iOS (behavior only)

| area                       | ChatGPT/Claude behavior | AGI Mobile behavior | gap severity | weight  |
| -------------------------- | ----------------------- | ------------------- | ------------ | ------- |
| Tool-calling UI            |                         |                     |              | HIGHEST |
| Trust/Local-Cloud boundary |                         |                     |              | HIGHEST |
| Streaming/stop control     |                         |                     |              |         |
| Model switching            |                         |                     |              |         |
| Error/empty/loading states |                         |                     |              |         |

(Tool-calling fidelity + trust integrity weighted above all else. Parity = behavior, never copied assets.)

## 6. Prioritized fix list

1. <Critical: trust/tool-call first>
2. ...
   (Ordered by severity then trust/tool-call weight.)

## 7. Artifacts index

- runs/<id>/screenshots/ (baseline/, candidate/, smoke-01..05, error-states/)
- runs/<id>/videos/ (smoke macro, streaming, scroll)
- runs/<id>/lldb/ (stacks, variable dumps)
- runs/<id>/coverage/ (report + per-file)
- runs/<id>/snapshots/ (snapshot_ui hierarchies)

## 8. Sign-off

Automatic-Critical scan: [ ] no Local-mode egress observed [ ] no unsupported "available/public" claim
Honesty attestation: every PASS is an executed, evidenced step; NOT RUN/BLOCKED cells carry reasons; no result fabricated.
```

### Acceptance criteria (Phase 25 overall)

- [ ] 25A performance/memory measured and recorded (with sim caveats; nothing fabricated).
- [ ] 25B all six error classes forced; each has a clear state + working recovery.
- [ ] 25C every failure mapped to its standard recovery; unrecoverable ones recorded as blockers; no faked PASS.
- [ ] 25D report assembled with all eight sections; 44-tool matrix complete; trust + tool-call weighted highest; artifacts under a dated run folder.
- [ ] Automatic-Critical scan run (egress + overclaim) and attested.

### Bug-classification examples (reporting-level)

- **Critical:** the report records a PASS for a step that didn't actually run, or omits an observed Local-mode egress — a fabricated/incomplete report is itself a Critical defect.
- **High:** the issues table is missing repro steps or artifacts for a Critical/High issue (not actionable).
- **Medium:** parity gaps listed but not weighted (tool-call/trust not surfaced first).
- **Low:** artifacts present but unlinked / inconsistently named.

### Recovery

- **Missing artifact for a cited issue:** re-run that single check to capture the shot/video/stack before finalizing — don't ship an unevidenced Critical.
- **Matrix cell can't be ticked:** mark `NOT RUN — <reason>`; the run is incomplete until exercised, and the report must say so.

### Checklist

- [ ] Dated run folder created; all artifacts filed and linked.
- [ ] Per-phase table (1–25) complete with honest results.
- [ ] Issues table complete with full records, sorted by severity + trust/tool-call weight.
- [ ] Coverage summary with floor and weak files.
- [ ] 44-tool matrix complete (every tool ticked or `NOT RUN`+reason).
- [ ] Parity-gap table weighting tool-calling + trust highest.
- [ ] Prioritized fix list.
- [ ] Automatic-Critical scan attested; honesty attestation signed.

---

## Part 4 exit criteria

Part 4 — and the whole playbook — is complete when:

1. **LLDB proved the plumbing:** the accumulator, stream handler, and trust gate were inspected live; the trust gate is confirmed fail-closed in Local mode; any crash has a captured stack.
2. **Coverage is measured and floored:** real numbers from `test_sim` / `get_coverage_report` / `get_file_coverage`, with the trust + tool-call critical set held to ≥90% (or today's higher value).
3. **The run is repeatable:** deterministic regression conditions, a baseline/candidate diff method, and a one-batch smoke macro that runs across ≥2 device profiles.
4. **Stress + failure are covered:** performance/memory measured, every error state forced with a working recovery, and a standard recovery for every failure class — with the iron rule that **a step is never marked PASS unless it ran and produced evidence.**
5. **The report exists:** one dated report with per-phase results, classified issues, coverage, the complete 44-tool matrix, parity gaps weighting tool-calling + trust highest, a prioritized fix list, and an artifacts index — and an explicit scan for the two automatic Criticals (Local egress, unsupported availability claims).

> Re-run this part on every meaningful change. The first run is an audit; every run after is a regression gate.
