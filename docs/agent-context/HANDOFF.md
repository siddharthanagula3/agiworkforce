# Handoff — AGI Workforce audit remediation

You are taking over an in-progress remediation. Read this whole file before touching code.

## 1. Mission

Complete the execution plan at `/Users/siddhartha/Downloads/AGI_WORKFORCE_AUDIT_REMEDIATION_LOOP.md`.
A working copy lives in the repo as `AuditRemediationLedger.md` — **the ledger is the stop gate**, so
an unmarked ledger entry is an open finding no matter how much code was written.

Measure progress with the repo's own gate, never by eye:

```bash
node scripts/check-audit-progress.mjs
# → "519 of 535 tasks in AuditRemediationLedger.md are still open (16 closed)"
```

**Current: 519 open / 16 closed (~3%), 243 task IDs across 9 phases.**

## 2. State as of handoff

|               |                                                           |
| ------------- | --------------------------------------------------------- |
| Repo          | `/Users/siddhartha/Desktop/agiworkforce`                  |
| Branch        | `fix/codeql-high-severity-batch-1`                        |
| HEAD          | `ce2cb86d8`                                               |
| `origin/main` | `0eca4e935`                                               |
| Unpushed      | 7 commits on the branch                                   |
| Production    | **healthy** — `/api/me` returns 401 (was 500 for ~2 days) |

The branch and `main` had diverged in both directions and were merged at `ce2cb86d8`. The branch now
carries everything. **Push it or merge it to main before starting new work**, or you will re-create
the same divergence.

## 3. Founder decisions — NOT recoverable from the repo

Recorded 2026-08-09. These set scope and override any default you would otherwise choose.

1. **Phase 4: case-by-case per family.** Do not blanket-downgrade. Bring the founder each capability
   family with evidence and let them choose `SHIP | PRIVATE_PREVIEW | PLANNED | NOT_SUPPORTED`.
   The evidence already exists — see §4.
2. **SHIP all three media families end-to-end**: PP-18 image generation/editing, PP-19 video/audio
   generation, PP-20 voice and live translation.
3. **Build the FULL compliance set**: legal hold, retention, residency, DLP, eDiscovery, CMEK/BYOK
   encryption, IP allowlists. Currently **zero migrations** back any of it.
4. **All release proof, including the load suite**: load/stress/soak baseline, clean-machine install
   test, upgrade-from-previous-version test, mobile store release automation.
5. **ChatGPT parity snapshot, ordered by release risk** (founder decision, 2026-08-09): use the
   official ChatGPT product state from 2026-07-09 through 2026-08-09 as the competitive floor.
   First make Max 15x image/video generation work end to end on Web, Mobile, and both Desktop
   shells. Next prove the tool loop, artifact rendering, and web search on Web/Mobile/Desktop.
   Then make skills, plugins, and connectors work on Web, Mobile, Desktop, CLI, and VS Code. This
   supersedes the earlier decision that Mobile plugins are permanently represented only by the
   Connectors surface; the three capability classes now need explicit, working Mobile outcomes.
6. **Rendered Web acceptance is mandatory** (founder decision, 2026-08-09): a mocked route test or
   provider-unit test does not close a Web capability. For image and video, enter a real prompt in
   the shipping chat composer, open Create image/video, select the cheapest live Google model proven
   by the current catalog and official provider documentation, submit, wait for the terminal result,
   render it, reload, reopen it from Library, and verify authorized download plus failure/retry states.
   Apply the same click-through standard to skills, plugins, and connectors. Add popular open-source
   skills/plugins only after current popularity, compatible license, provenance, permissions, and
   install/update/removal behavior are verified; pin the reviewed source/version. Record exact
   founder-only steps for credentials, billing, OAuth consent, marketplace publication, signing, or
   production configuration that an agent cannot perform.

Earlier decisions still in force: merge without waiting for CI when production is broken; triage
security findings before making a gate blocking; build the enterprise identity subset.

## 4. The single most valuable artifact

`docs/agent-context/phase4-capability-audit.md` — 38 capability families, 194KB, produced read-only
by 10 agents. Per family: what the UI **claims** (file:line), what is actually reachable **from a
real entry point**, the precise gap, what a user hits **today**, and cost **both ways**.

**15 of 38 are `ALREADY_HONEST` — the ledger box is stale and there is nothing to fix.** That is a
~40% false-positive rate on the phase holding 168 of the 519 open criteria. Do not re-derive this;
it cost 1.7M tokens.

Verdicts: 15 ALREADY_HONEST · 12 NOT_SUPPORTED · 9 SHIP · 2 PRIVATE_PREVIEW.
Downgrade cost is `hours` for **every** family. Ship cost: hours(7), days(16), weeks(14), months(1).

Real defects it found (not the ones the audit predicted):

- **PP-25** managed-cloud user who exhausts their period budget hits a broken path
- **PP-19** Max 15x / Enterprise "Create video" — user waits, nothing lands
- **PP-28** header claims "AGI Desktop · Released · v1.2.0" — false availability claim
- **PP-29** API key with "Run inference" scope does not behave as scoped
- **PP-09 / PP-23 / PP-32** dead controls: mobile "Add sources" closes doing nothing; desktop
  notification switches change nothing

## 5. Traps that cost real time — do not rediscover these

1. **`cmd | tail` reports tail's exit status, not the command's.** This hid a FAILING secret scan and
   I committed on top of it. It bit three separate times. Redirect to a file and check the exit code.
2. **A guard passing locally proves nothing.** `check-agent-context.mjs` did an unguarded
   `readdirSync('.agents/skills')`; `.agents/` is entirely untracked, so it threw ENOENT on every
   clean checkout and killed the first link of a 40-guard `&&` chain — while passing locally where
   those files exist on disk. **Verify against a fresh clone or the CI log.**
3. **Agents over-claim.** Across two waves, ~65% of repairs came back `sound=false` from adversarial
   verification. The common failures: **inert code** (a symbol with no production consumer — one wave
   produced 45 such findings) and **false reachability** (an agent cited `App.tsx:998` as a model
   picker `onChange` when it is a plain store call). Always re-trace a claimed call path yourself.
4. **A test that passes without the fix proves nothing.** Make every regression test discriminate:
   revert the fix, watch it FAIL with real output, restore, watch it PASS.
5. **Migration ordering is global.** Never let two agents write migrations concurrently. Give a
   schema cluster one owner (that is why CRIT-010/012/013 went to a single agent).
6. **Write-set collisions.** Parallel agents must have disjoint write sets. I derived one write set
   from a verifier's _reachability trace_ instead of the task's actual `filesChanged`, and the agent
   correctly wrote outside it.
7. **The audit artifacts have a known false-positive rate.** The plan's own preamble says so; §4
   measures it at ~40% for Phase 4. Treat the ledger as a **triage queue**, not a bug list.
8. **A doc sweep deleted four load-bearing files** (`7214d0c70`) — a `pyproject.toml` readme, a file
   a test reads, and both `.agents` READMEs. Selecting docs by staleness metadata cannot see that a
   build manifest, a test, or a shell script depends on one.
9. **Never drop a guard to settle a merge.** The `check:llm-operability` chain conflicts on every
   merge. Take the **union** (currently 40 guards).

## 6. Open threads, with evidence

| Thread                            | State                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CRIT-016 false safety claim**   | `get_model_capabilities` (`apps/desktop/src-tauri/src/sys/commands/llm.rs`) takes a renderer-supplied `base_url` with **no validation**. The egress guard now covers four entry points and not this fifth, but the surrounding text reads as though it covers the class. **Fix or narrow the claim.**                                     |
| **VS Code E2E**                   | 8 pass / 1 fails: `native @agi turn returned an error: "Language model unavailable"`. Only remaining E2E failure that may be a real regression.                                                                                                                                                                                           |
| **Client-boundary guard**         | Written and proven to catch the bug that broke every marketing page, parked at `scratchpad/check-client-boundaries.mjs` (not in the repo). It reports **63 latent cases** in `packages/ui/unified-chat` — components calling hooks with no `'use client'`. Needs a scoping decision: enforce fatal-only and ratchet, or fix all 63 first. |
| **18 Semgrep supply-chain items** | Real, all package-manager hardening (dependabot cooldowns, pnpm/npm minimum release age, trust policy). Deliberately not landed because they change **install** behaviour and production was down. Safe to land now. Once zero, add `--error` to the Semgrep step to make it blocking.                                                    |
| **Wave 1 + 2 residue**            | ~37 task IDs touched; most `sound=false` verdicts were over-claiming rather than broken code, but each needs its claim narrowed or its gap closed. Verifier reports are in the workflow journals under `.claude/projects/**/subagents/workflows/`.                                                                                        |

## 7. Commands that matter

```bash
node scripts/check-audit-progress.mjs      # the stop gate — 519 open / 16 closed
pnpm check:llm-operability                 # 40 guards, chained with && (first failure hides the rest)
node scripts/check-secrets.mjs             # redirect to a file; do NOT pipe to tail
node apps/desktop/scripts/check-wiring.mjs # MUST run from repo root, not apps/desktop
pnpm --filter @agiworkforce/web build      # ~3 min; catches server/client boundary breaks
```

Deploy is gated on CI success **and** on `scripts/production-deploy-baseline.mjs`, which now measures
scope from the commit each surface **last actually shipped from** (not `HEAD^`). Before this fix, a
change landing while CI was red was stranded forever — that is what kept an outage fix unshipped for
two days.

## 8. Working method that produced results

Waves of parallel agents, each repair followed by an **adversarial verifier** told to refute it and
to default to unsound when uncertain. That verification step is what caught the inert code, the false
reachability proofs, and a false-green `verifyPassed`. It is not optional overhead — it is the only
reason the wave output is trustworthy at all.

Checkpoint each wave as a commit that states honestly what is unverified. Do not mark ledger
checkboxes from an agent's report; verify the acceptance criterion yourself first.

The plan's own rule, which governs everything: **"Do not declare completion because code was written,
a test was added, the issue was already documented, or a UI was hidden. Stop only when the Final Stop
Gate passes."**
