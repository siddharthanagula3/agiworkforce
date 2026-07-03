# Desktop Production QA Checklist

Status: Current
Owner: Platform lead
Last updated: 2026-07-03

This is the master, durable tracking artifact for the "test → fix → verify end-to-end (frontend + backend + shared runtime) → next" loop on apps/desktop, driving toward public alpha. It supersedes ad-hoc QA notes for this pass. Do not re-derive this list from scratch in a future session — read this file first, find the first `Not Started` or `In Progress` section, and continue from there.

Source: full 38-category checklist provided by the founder (2026-07-03), covering every surface of a production desktop AI chat app. Cross-reference `docs/current/parity-implementation-matrix.md` (product-requirement view) and `docs/agent-context/known-flaws.md` (bug ledger) — this file is the QA-process view; findings from working through it get logged to `known-flaws.md`, not duplicated here.

## Status legend

- `Not Started` — no verification done this pass
- `In Progress` — actively being verified/fixed
- `Verified` — driven end-to-end (real UI interaction, not just typecheck/build), frontend+backend+shared-runtime confirmed working, any bugs found fixed and re-verified
- `Verified w/ Known Issues` — driven end-to-end, real gaps found and logged to known-flaws.md with a decision request, not silently accepted

## Priority order for this push (public alpha)

Rationale: a user cannot use the product at all if tier-1 is broken; tiers 2-4 matter increasingly less for an initial alpha vs. a mature release. Work top to bottom unless a specific section is explicitly requested out of order.

### Tier 1 — Core loop (blocks alpha entirely if broken)

| #   | Section                          | Status                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Application Lifecycle            | Not Started              | First launch, cold/warm start, session/window restoration, crash recovery covered partially (WorkerGuard/telemetry fixed); auto-update/rollback/version-check/maintenance-mode/deep-links not yet audited                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6   | Chat                             | Verified w/ Known Issues | Composer send/receive fixed (`DESKTOP-CHAT-SILENT-FAIL-01`). All 11 conversation actions driven end-to-end via real native WebDriver: Stop, Copy, Rename, Delete, Archive Verified working (Rename/Archive had silent-no-persist bugs, fixed — `DESKTOP-CHAT-CONVO-ACTIONS-PERSIST-01`). Continue generation, Retry, Regenerate, Edit (message), Delete (message), Branch, Share, Export are Open — decision needed: the live surface (`packages/unified-chat`) only implements ~2 of these (Copy works, Retry button is wired to nothing); full working implementations exist for the rest but are orphaned dead code in three different desktop-only trees — see `DESKTOP-CHAT-CONVO-ACTIONS-ORPHANED-01`.                                                                                                                                                                                                                                               |
| 7   | AI Response Rendering            | Not Started              | Markdown/code/tables/math/citations/incremental streaming renderer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2   | Authentication                   | Not Started              | Sign-in providers, session/token refresh, multi-account                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 22  | Provider Management (Local Mode) | Verified w/ Known Issues | LM Studio + llama.cpp support added (commit `95b15e61b`). Separately verified BYOK/OpenRouter end-to-end by source trace: OpenRouter's own wiring was already correct, but found and fixed two Critical bugs in the shared BYOK machinery — onboarding's key-paste flow never actually registered ANY of the 6 auto-detected BYOK providers with the LLM router (wrote to an unrelated secrets store), and no BYOK provider survived an app restart (only local runtimes were re-registered on launch). Also added live OpenRouter model-catalog listing (`llm_list_openrouter_models`, mirrors the LM Studio/llama.cpp `/v1/models` pattern) and OpenRouter's attribution headers. See `DESKTOP-BYOK-OPENROUTER-VERIFY-01`. Still open (unrelated, pre-existing): `DESKTOP-BYOK-PROVIDER-UI-COVERAGE-01` (18 of 27 curated providers have no Settings key-entry UI). Not verified: live send with a real OpenRouter key (none available in this sandbox). |
| 23  | Local Models                     | In Progress              | Same effort as #22                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 19  | Settings                         | Partial                  | `DESK-SETTINGS-IA-01` (known-flaws) has prior progress; AgentMode/SafetyPolicies gaps found this session                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Tier 2 — Differentiating features (must work for the product's actual value prop)

| #   | Section             | Status      | Notes                                                                                                                                                                                                         |
| --- | ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24  | MCP                 | Not Started | ~24K lines hand-rolled, see `DESKTOP-CLI-HARNESS-FRAGMENTATION-01` + `BUILD_VS_BUY_OSS_ADOPTION.md`                                                                                                           |
| 25  | Tool Calling        | Partial     | Verification-loop + guardrail layers audited (`DESKTOP-AGI-LOOP-VERIFICATION-01`, `DESKTOP-AGENTMODE-GUARDRAIL-SURFACE-01`); tool executors (file system/terminal/git/browser/HTTP) not individually verified |
| 20  | Cloud Mode          | Not Started | `DESK-CLOUD-DCL2-LIVE-VERIFY-01` — seam built, headless-only verified                                                                                                                                         |
| 21  | Local Mode          | Partial     | Trust-boundary routing verified as part of chat bug fix; workspace/local storage/offline mode not yet audited                                                                                                 |
| 13  | Projects            | Not Started |                                                                                                                                                                                                               |
| 14  | Memory              | Not Started |                                                                                                                                                                                                               |
| 8   | File Management     | Not Started |                                                                                                                                                                                                               |
| 9   | Document Processing | Not Started |                                                                                                                                                                                                               |
| 26  | Workspace           | Not Started |                                                                                                                                                                                                               |
| 27  | Terminal            | Not Started |                                                                                                                                                                                                               |
| 28  | Git                 | Not Started |                                                                                                                                                                                                               |

### Tier 3 — Full feature surface

| #   | Section                 | Status      |
| --- | ----------------------- | ----------- |
| 3   | Window Management       | Not Started |
| 4   | Navigation              | Not Started |
| 5   | Home                    | Not Started |
| 10  | Image Generation        | Not Started |
| 11  | Voice                   | Not Started |
| 12  | Search                  | Not Started |
| 15  | Native Desktop Features | Not Started |
| 16  | Keyboard Shortcuts      | Not Started |
| 17  | Clipboard               | Not Started |
| 18  | Notifications           | Not Started |
| 29  | Browser Features        | Not Started |

### Tier 4 — Platform quality (needed before wide release, not blocking initial alpha)

| #   | Section                      | Status                                                                                                                  |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 30  | Performance                  | Not Started                                                                                                             |
| 31  | Security                     | Partial — trust-boundary/egress gaps found this session, see known-flaws                                                |
| 32  | Accessibility                | Not Started                                                                                                             |
| 33  | Localization                 | Not Started                                                                                                             |
| 34  | Analytics                    | Not Started                                                                                                             |
| 35  | Error Handling               | Partial — silent-failure class fixed this session (`DESKTOP-CHAT-SILENT-FAIL-01`), not systematically audited elsewhere |
| 36  | Cross-Platform Compatibility | Not Started — dev/test machine is macOS; Windows/Linux need separate verification environments                          |
| 37  | UI Components                | Not Started                                                                                                             |
| 38  | Regression Testing           | Ongoing by construction (Playwright/WebDriver suites re-run after each fix this session)                                |

## Working method (established this session, keep using it)

1. Drive the real feature end-to-end — native WebDriver session (`apps/desktop/wdio/`) for native-window-only behavior, Playwright (`apps/desktop/e2e/`) for browser-reachable UI, real backend (Ollama running locally, real Tauri IPC) — not just typecheck/build.
2. When something's broken: find the true root cause (frontend/backend/shared-runtime), fix at the correct layer, don't paper over with a workaround.
3. Verify the fix empirically (rerun the same repro), not just "it compiles."
4. Run regression checks on adjacent tests before calling it done.
5. Log real findings to `docs/agent-context/known-flaws.md` with file:line evidence; log decisions-needed (not mechanical fixes) as `Open — decision needed`, don't silently fix or silently skip.
6. Update this file's status column as sections complete.
7. Never leave `test.skip`/fake assertions/dead code as "done" — either fix, delete with justification, or log as an explicit open item.
