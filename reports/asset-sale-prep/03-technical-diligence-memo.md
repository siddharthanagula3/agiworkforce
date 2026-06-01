# Technical Diligence Memo

Status: Draft
Owner: Founder
Created: 2026-05-31

## Scope

This memo summarizes the technical state of AGI Workforce for buyer diligence. It is based on local repo inspection and commands run on 2026-05-31.

## Repository Overview

AGI Workforce is a proprietary monorepo for a multi-surface AI application suite.

Primary surfaces:

- `apps/mobile` - Expo / React Native mobile app.
- `apps/web` - Next.js web app.
- `apps/desktop` - Tauri v2 / React desktop app.
- `apps/cli` - Rust CLI developer agent.
- `apps/extension` - Chrome MV3 extension.
- `apps/extension-vscode` - VS Code extension.
- `apps/sandbox` - cross-origin artifact renderer.

Shared layers:

- `packages` - shared TypeScript contracts, providers, routing, runtime, UI/runtime services.
- `crates` - Rust protocol, command registry, sandbox, plugin/runtime utilities.
- `services` - API gateway, signaling, and future managed-compute paths.
- `docs/current` - current product and architecture source of truth.
- `audit` / `reports` - evidence and generated reports.

## Repo Scale

Observed locally:

- `git ls-files`: 7,025 tracked files.
- `git ls-files | xargs wc -l`: about 721,776 tracked lines.
- App/package/crate/service/iOS paths: about 142,591 tracked lines.
- Docs/audit/tasks paths: about 377,079 tracked lines.
- Git commits: 4,594+ shown in GitHub screenshot; local `git rev-list --count HEAD` returned 4,594 during prior inspection.

## Current Verification

Commands run on 2026-05-31:

```bash
pnpm check:llm-operability
pnpm typecheck:all
cargo check --workspace
pnpm test
```

Results:

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm check:llm-operability` | Passed | Agent context, repo organization, boundaries, service layer, generated artifacts, CI guardrails, hooks, model catalog, and related checks passed. |
| `pnpm typecheck:all` | Passed | Workspace TypeScript typecheck passed across apps, packages, services, providers. |
| `cargo check --workspace` | Passed | Rust workspace compiled in dev profile. |
| `pnpm test` | Failed | Mobile app had 4 failed suites / 33 failed tests; many packages and extension suites passed before the mobile failure stopped recursive execution. |

## Known Test Failures

The `pnpm test` failure currently clusters in Mobile:

- `__tests__/drawer-content.test.tsx`
  - Drawer rendering failure around `Search` icon / `react-native-css-interop` / `displayName`.
- `__tests__/chatStore.test.ts`
  - Local LLM path did not call `mockMarkInstalledModelUsed` with selected local model.
- `__tests__/dispatch-e2e-smoke.test.ts`
  - `sendTask` did not emit or queue expected `dispatch_task` control messages in test setup.
- `__tests__/dispatch-store.test.tsx`
  - `sendTask` did not call `sendControl` / `queueControl` as expected in test setup.

Recommended remediation before buyer source access:

1. Fix mobile drawer test harness or component import issue.
2. Decide whether local model usage tracking is required behavior; fix store or update test if product semantics changed.
3. Repair dispatch/control-message behavior or retire from Mobile v1 if intentionally gated.
4. Re-run `pnpm test` and capture a clean verification log.

## Strengths For Diligence

- Strong repo guardrails and source-of-truth docs.
- Clear product trust-boundary rules.
- Canonical model catalog policy.
- Clear separation between Local, BYOK, and Managed Cloud.
- Multi-surface code already exists.
- Shared TypeScript and Rust contracts exist.
- Proprietary license and third-party license disclosure exist.
- Current docs honestly mark partial/gated areas instead of overclaiming full parity.

## Technical Risks

- No production user or revenue evidence yet.
- Some current docs and launch handoffs may overstate prior status relative to current test result; keep latest verification as controlling.
- Mobile is the active release surface and still has test failures.
- Managed cloud must remain gated until commercial, abuse, billing, retention, deletion, and provider-term controls are proven.
- Competitive-reference archives must be separated from sale assets and not represented as owned product IP.
- AI-assisted development requires clear provenance disclosure.

## Recommended Buyer Demo Path

Prepare three videos before outreach:

1. Mobile local-first flow: onboarding, local model selection/download state, local chat, cloud waitlist gate.
2. Desktop/web flow: chat shell, model picker, artifact preview, settings/trust labels.
3. Developer flow: CLI or VS Code extension showing workspace-scoped assistance, local/BYOK boundary, hooks/skills/MCP direction.

## Recommended Closing Deliverables

- Clean source export or repo transfer.
- Build instructions.
- Verification log.
- IP provenance and license disclosure.
- Known risks schedule.
- Transition support plan.
- Asset schedule for domains, packages, app accounts, and releases.
