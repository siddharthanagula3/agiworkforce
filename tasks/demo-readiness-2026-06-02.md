# 10-Day Demo Readiness Plan

Date: 2026-06-02
Owner: AGI Workforce demo release lead
Scope: desktop, web, mobile, CLI, Chrome extension, VSCode extension, API gateway, signaling server.

## Current Baseline

Verified locally on 2026-06-02:

| Surface                        | Command                                                                   | Result                                  |
| ------------------------------ | ------------------------------------------------------------------------- | --------------------------------------- |
| CLI compile                    | `cargo check -p agiworkforce-cli`                                         | PASS                                    |
| CLI tests                      | `cargo test -p agiworkforce-cli --lib`                                    | PASS, 1606 tests                        |
| CLI clippy                     | `cargo clippy -p agiworkforce-cli --lib -- -D warnings -D unsafe-code`    | PASS                                    |
| CLI approval regression        | `cargo test -p agiworkforce-cli --lib approval -- --nocapture`            | PASS, 37 tests                          |
| CLI safety regression          | `cargo test -p agiworkforce-cli --lib safety -- --nocapture`              | PASS, 93 tests                          |
| CLI MCP elicitation regression | `cargo test -p agiworkforce-cli --lib elicitation_overlay -- --nocapture` | PASS, 26 tests                          |
| CLI npm wrapper                | `npm test --prefix apps/cli/npm`                                          | PASS                                    |
| CLI npm packaging              | `npm run --prefix apps/cli/npm package-check`                             | PASS                                    |
| Web typecheck                  | `pnpm --filter @agiworkforce/web typecheck`                               | PASS                                    |
| Web Next build                 | `pnpm --filter @agiworkforce/web build:next-only`                         | PASS                                    |
| Desktop typecheck              | `pnpm --filter @agiworkforce/desktop typecheck`                           | PASS                                    |
| Desktop web build              | `pnpm --filter @agiworkforce/desktop build:web`                           | PASS, existing Vite chunk warnings only |
| Mobile typecheck               | `pnpm --filter @agiworkforce/mobile typecheck`                            | PASS                                    |
| Chrome extension typecheck     | `pnpm --filter @agiworkforce/extension typecheck`                         | PASS                                    |
| Chrome extension build         | `pnpm --filter @agiworkforce/extension build`                             | PASS                                    |
| VSCode extension typecheck     | `pnpm --filter agi-workforce typecheck`                                   | PASS                                    |
| VSCode extension build         | `pnpm --filter agi-workforce build`                                       | PASS                                    |
| Signaling server typecheck     | `pnpm --filter @agiworkforce/signaling-server typecheck`                  | PASS                                    |
| API gateway build              | `pnpm --filter @agiworkforce/api-gateway build`                           | PASS                                    |

## Reference Targets

Use these local references for parity decisions:

| Reference                | Path                             | What to copy conceptually                                                                                             |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Claude Code              | `~/Desktop/claude_reference/src` | Tool metadata depth, permission UX, deferred tool search, MCP prompts/resources, plan and approval experience         |
| Codex CLI                | `~/Desktop/reference/codex-cli`  | Tool registry plan, handler dispatch, mutating/read-only gate, parallel execution, unified exec/apply_patch contracts |
| Gemini/OpenCode/OpenClaw | `~/Desktop/reference`            | Additional TUI, MCP, extension, eval, and public CLI UX checks only after Claude/Codex gaps are closed                |

Do not copy source verbatim. Port behavior and tests using AGI naming, AGI privacy rules, and existing local abstractions.

## Day-by-Day Plan

### Day 1: Stabilize Demo Gates

- Freeze the demo surface list and one primary flow per surface.
- Keep all commands in the baseline table green.
- Fix only demo blockers and high-confidence localized bugs.
- Add a `scripts/demo-smoke.mjs` or equivalent only after the per-surface commands are stable.

### Day 2: CLI Claude/Codex Parity Pass

- Compare AGI CLI `tool_catalog.rs` and `features/exec/tools` against Claude `Tool.ts`/`tools.ts` and Codex `tool_registry_plan`.
- Ensure every built-in tool has: schema, alias set, owner, read-only/mutating class, result cap, deferred-load status, and dispatcher coverage.
- Keep the current passing regressions for duplicate `/`, approval broker FIFO, deny-all, tool_search, and plan-mode mutation blocking.
- Demo flow: `agi --demo --json-events exec -m <primary>,<fallback> "..."`, then `agi session list`, `agi session fork`.

### Day 3: Web Demo

- Verify `apps/web/proxy.ts` remains the only request proxy entry.
- Rehearse `/`, `/chat`, `/pricing`, `/waitlist`, `/api/health`, `/api/waitlist/cloud-managed`.
- Confirm Clerk and Neon production envs in Vercel before the rehearsal.
- Demo flow: signed-in chat landing, waitlist form, pricing page, desktop web bundle under `/chat/` if enabled.

### Day 4: Desktop Demo

- Rehearse local mode, BYOK key setup, Cloud Bridge invite/waitlist modal, model picker, MCP/tools panel, tool approval modal.
- Keep upgrade/pricing CTAs in-app: pricing overview first, Cloud Bridge waitlist/invite modal for paid/cloud actions.
- Demo flow: local chat, BYOK switch, tool approval, cloud waitlist modal, Chrome native messaging health.

### Day 5: Mobile Demo

- Rehearse Expo app on one physical iOS device or simulator plus one Android fallback if available.
- Validate local/BYOK/cloud-waitlist copy matches desktop.
- Demo flow: onboarding, waitlist/invite, session view, local privacy messaging, device link if stable.

### Day 6: Chrome Extension Demo

- Build unpacked extension and load from `apps/extension/dist`.
- Verify side panel, content script, native messaging bridge, and permission copy.
- Demo flow: inspect a web page, send context to desktop, show browser automation request with explicit approval.

### Day 7: VSCode Extension Demo

- Build `apps/extension-vscode/out`.
- Verify activation, workspace trust behavior, chat panel, CLI bridge, code action commands, and diff accept/reject UI.
- Demo flow: explain selection, run AGI chat, apply a small patch through approval.

### Day 8: Cross-Surface Story

- Rehearse one narrative from web signup to desktop local/BYOK, then CLI, Chrome, VSCode, and mobile companion.
- Prepare seeded demo data and fallback scripts for each surface.
- Record short fallback videos for any feature dependent on external auth, device state, or provider quotas.

### Day 9: Hardening

- Run the full command matrix again.
- Run focused security checks for demo paths: secrets scan, auth route smoke, CSP/proxy, desktop IPC command coverage, extension permissions, CLI shell/path validation.
- Fix only blockers or high-risk regressions.

### Day 10: Final Rehearsal

- Run the demo twice end-to-end on the same machine/account used for the live demo.
- Freeze the repo and environment variables after the second clean run.
- Keep a terminal with the command matrix results and fallback clips ready.

## Demo Blocker Definition

A blocker is anything that breaks a primary demo flow, leaks secrets, bypasses approval for destructive actions, crashes the app, prevents build/package output, or sends users to a broken external route when an in-app flow exists.

Non-blockers for the 10-day deadline: broad refactors, cosmetic changes outside demo screens, non-demo feature completeness, non-critical Vite chunk warnings, and parity work that does not affect the demo script.

## Immediate Fixes Already Applied

- Desktop paid/cloud CTAs now stay in-app: `PlansModal` opens the Cloud Bridge invite/waitlist modal instead of navigating to web billing/pricing/waitlist URLs.
- Chat navigation requests for `pricing`, `billing`, and `byok` open the in-app pricing modal instead of routing to account settings.

## Remaining Work Queue

1. Run desktop/web smoke in a browser or Tauri preview if UI time allows.
2. Run a secrets scan before Vercel/env work.
3. Confirm Vercel production envs for Clerk and Neon, then redeploy web.
4. Create a single demo script with exact clicks/commands and fallback clips.
