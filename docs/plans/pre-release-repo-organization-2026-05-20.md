# Pre-Release Repo Organization Plan

Status: Active planning
Owner: Founder + platform lead
Last updated: 2026-05-21

## Goal

Make AGI Workforce easy for future engineers, marketing, GTM, support, and release operators to understand before public release.

Because there are no public users, no advertised release date, and no migration promises yet, the repo can still be reorganized aggressively as long as every move is documented, reviewed, and verified. The goal is not cosmetic cleanup. The goal is to reduce future coordination cost and make the product buildable by a real team.

## Current Findings

The core monorepo shape is good:

- `apps/` contains the six product surfaces.
- `packages/` contains shared TypeScript packages.
- `crates/` contains shared Rust crates.
- `services/` contains backend services.
- `supabase/` contains canonical migrations.
- `docs/`, `audit/`, `tasks/`, `reports/`, and `examples/` exist for documentation and evidence.

The problems are mostly pre-release entropy:

- Root has scratch markdown and image artifacts such as `app-after-fill.md`, `claude-design-*.md`, `final-*.png`, `r6-*.md`, and similar files.
- Multiple AI/tool folders exist at root: `.agent`, `.agents`, `.claude`, `.codex`, `.cursor`, `.minimax`, `.opencode`, `.superpowers`, `.remember`, and `.playwright-mcp`.
- Planning and research are split across root docs, `docs/plans`, archived planning docs, `tasks/research`, `audit`, and `reports`.
- There are multiple historical "source of truth" candidates: archived `MASTER_PLAN.md`, `PLAN.md`, `TODO.md`, archived `AGIWORKFORCE_IMPLEMENTATION_LOG.md`, `audit/audit-log.md`, docs PRDs, and memory-derived docs.
- The repo has both layer-first and domain-first application layouts. The existing `docs/plans/domain-first-reorg.md` correctly scopes the Web/Desktop/Mobile feature-folder cleanup, but it does not cover the full repository operating model.
- Marketing/GTM/release materials are mixed into engineering-facing docs. A future non-engineering team should not need to understand Rust crates or CI to find launch copy.

## Non-Negotiables

- Do not combine file moves with behavior changes.
- Do not move tool-required folders like `.claude`, `.codex`, `.cursor`, `.opencode`, or `.agents` until each tool contract is verified.
- Do not rename public package names or app identifiers without a migration plan.
- Keep public brand `AGI`; keep internal repo, package, and crate names `agiworkforce` until a formal brand/package migration is approved.
- Preserve git history with `git mv` where possible.
- Every directory must have a documented purpose, owner role, and "what does not belong here" rule.
- Every cleanup wave must pass the same test/typecheck/build checks that applied before the move.

## Target Top-Level Structure

This is the target meaning of each top-level path.

| Path           | Purpose                                                                    | Owner role                   | Rule                                                                                |
| -------------- | -------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `apps/`        | User-facing surfaces: Web, Desktop, Mobile, CLI, VS Code, Chrome, sandbox. | Surface leads                | One folder per shippable surface. No shared business logic unless surface-specific. |
| `packages/`    | Shared TypeScript libraries used by apps/services.                         | Platform                     | Must be independently typed, tested, and documented.                                |
| `crates/`      | Shared Rust crates used by CLI/Desktop/services.                           | Rust platform                | Crate names stay `agiworkforce-*`; modules use Rust snake_case.                     |
| `services/`    | Server processes and future managed-compute services.                      | Backend/platform             | One deployable service per folder.                                                  |
| `supabase/`    | Canonical database migrations and Supabase config.                         | Data/backend                 | No duplicate app-local migration sources.                                           |
| `docs/`        | Durable product, engineering, launch, security, and ADR docs.              | Docs owner + relevant domain | Current docs only, with archives clearly marked historical.                         |
| `audit/`       | Evidence ledgers, scan outputs, parity research, and source-backed claims. | Security/platform            | Evidence, not strategy.                                                             |
| `tasks/`       | Active execution notes and temporary research work products.               | Task owner                   | Working area, not source of truth. Promote durable output to `docs/` or `audit/`.   |
| `reports/`     | Generated visual/test/research reports intended for inspection.            | QA/design/platform           | Generated or review artifacts, with dates and owners.                               |
| `examples/`    | Sample apps, demos, and reference integrations.                            | Developer experience         | Examples must build or be clearly marked archived.                                  |
| `scripts/`     | Repo automation used by CI or developers.                                  | Platform/release             | Scripts need help text and safe defaults.                                           |
| `dev-scripts/` | One-off local developer helpers.                                           | Platform                     | Promote to `scripts/` only when supported.                                          |
| `.github/`     | CI, issue templates, PR templates, code owners.                            | Release/platform             | CI is the enforcement layer for repo conventions.                                   |
| `_archive/`    | Historical snapshots and removed root clutter.                             | Docs owner                   | Not cited as current unless a current doc explicitly says so.                       |

## Naming Conventions

### Public And Internal Names

- Public product name: `AGI`.
- Internal repo name: `agiworkforce`.
- NPM package scope: `@agiworkforce/*` until a package migration is planned.
- Rust crate prefix: `agiworkforce-*`.
- Environment variables: `AGIWORKFORCE_*` for internal/runtime settings until an env-var migration is planned.
- User-facing copy should say `AGI`, not `AGI Workforce`, unless legal or store metadata requires the longer name.

### Files And Folders

| Area                | Convention                                                                        |
| ------------------- | --------------------------------------------------------------------------------- |
| App/package folders | lowercase kebab-case: `extension-vscode`, `unified-chat`, `browser-tool`.         |
| Feature folders     | lowercase kebab-case: `computer-use`, `generated-files`, `provider-routing`.      |
| React components    | PascalCase file and export names.                                                 |
| Hooks               | `useThing.ts` or `useThing.tsx`.                                                  |
| Tests               | `*.test.ts`, `*.test.tsx`, or Rust module tests near code.                        |
| Docs                | lowercase kebab-case with date prefix when time-sensitive: `2026-05-20-topic.md`. |
| ADRs                | `YYYY-MM-DD-short-decision-name.md`.                                              |
| Rust modules        | snake_case.                                                                       |
| Generated reports   | dated folder under `reports/` or `audit/`, never loose root files.                |

## Documentation Model

### Source Of Truth

- `AGI_WORKFORCE.md`: root entry point for agents and maintainers.
- `PLAN.md`: active product/platform transition plan.
- `TODO.md`: active execution checklist.
- `CHANGELOG.md`: completed slices.
- `docs/README.md`: durable documentation index.
- `docs/decisions/CURRENT_DECISIONS.md`: current locked decisions.
- `audit/anthropic-apps-parity/`: source-backed parity evidence.

### Required Doc Status

Every durable plan or strategy doc should start with:

```md
Status:
Owner:
Last updated:
Supersedes:
Superseded by:
```

### Docs Folder Targets

| Folder                              | Keep                                         | Move out                      |
| ----------------------------------- | -------------------------------------------- | ----------------------------- |
| `docs/decisions/`                   | ADRs and current decision index.             | Long research notes.          |
| `docs/plans/`                       | Active/recent plans with owners and status.  | Scratch execution logs.       |
| `docs/archive/2026-05-20-planning/` | Historical planning specs only.              | Current plans.                |
| `docs/research/`                    | Durable research summaries.                  | Raw notes and prompt dumps.   |
| `docs/launch/`                      | Launch copy, store listings, GTM checklists. | Engineering specs.            |
| `docs/surfaces/`                    | One current guide per surface.               | Old duplicated surface notes. |
| `docs/archive/`                     | Superseded docs.                             | Anything current.             |

## Root Cleanup Plan

### Classify Root Files

| Type                  | Examples                                                                                                                                                                                 | Target                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Current control docs  | `AGI_WORKFORCE.md`, `PLAN.md`, `TODO.md`, `CHANGELOG.md`, `BUILD.md`, `README.md`                                                                                                        | Stay root.                                                                                 |
| Historical plans/logs | `docs/archive/2026-05-14-reverse-engineering-campaign/MASTER_PLAN.md`, `docs/archive/2026-05-14-reverse-engineering-campaign/AGIWORKFORCE_IMPLEMENTATION_LOG.md`, old handoff-like files | Moved out of root; keep historical.                                                        |
| Reference catalogs    | `docs/reference/REFERENCE_INDEX.md`, `docs/reference/REFERENCE_STRUCTURE.md`                                                                                                             | Moved out of root; keep as reference evidence, not current plan.                           |
| Scratch artifacts     | `app-*.md`, `claude-design-*.md`, `final-*.png`, `r6-*.md`                                                                                                                               | Move to `reports/root-scratch-archive/2026-05-20/` or `_archive/2026-05-20-root-scratch/`. |
| Generated/cache files | `.DS_Store`, `.gitignore.tmp`, `libnull.rlib`, screenshots                                                                                                                               | Ignore/delete only after confirming they are not intentionally tracked.                    |
| Tool configs          | `.claude`, `.codex`, `.cursor`, `.opencode`, `.agents`, `.mcp.json`                                                                                                                      | Keep until tool-by-tool contract is documented.                                            |

### Root Keep List

Long term, root should mostly contain:

- `AGI_WORKFORCE.md`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `ONBOARDING.md`
- `BUILD.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `PLAN.md`
- `TODO.md`
- `LICENSE`
- `THIRD_PARTY_LICENSES.md`
- package/workspace/build configs
- deploy configs that must be root-level

Everything else needs a reason to stay.

## Application Layout Plan

The existing `docs/plans/domain-first-reorg.md` remains the detailed sub-plan for Web/Desktop/Mobile feature movement.

Updated order:

1. Root and docs cleanup first.
2. Shared package and naming contract second.
3. Web domain-first cleanup third.
4. Mobile domain-first cleanup fourth.
5. Desktop domain-first cleanup fifth.
6. CLI/Rust module cleanup sixth.
7. Services/cloud split seventh.

Reason: root/docs/package boundaries affect every future engineer. Surface-internal moves are safer after the repo contract is stable.

## Shared Package Boundary Plan

Target package categories:

| Category         | Current/future packages                                                                    | Rule                                                |
| ---------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Contracts        | `packages/types`, future `packages/contracts` if split                                     | Schemas and types only. No runtime network clients. |
| Provider/runtime | `packages/providers`, `packages/llm-normalize`, `packages/llm-runtime`, `packages/routing` | Provider-specific code behind AGI-owned adapters.   |
| UI/product       | `packages/unified-chat`, `packages/design-tokens`, future shared surface UI                | No direct provider calls.                           |
| Local tools      | `packages/browser-tool`, `packages/apply-patch`, `packages/local-llm`, `packages/mcp`      | Must expose privacy and permission metadata.        |
| Data/compliance  | `packages/data-layer`, `packages/compliance`, `packages/stores`                            | Data ownership and audit behavior documented.       |
| Utilities        | `packages/utils`, `packages/runtime`                                                       | Small, dependency-light, non-product-specific.      |

Rules:

- A package should have one reason to exist.
- Cross-surface schemas should live in contracts/types, not in apps.
- Apps should not import another app.
- Services should not import UI packages.
- Packages should not import from `apps/`.
- Deep imports across packages should be replaced with public exports.

## Rust Boundary Plan

Target:

- `apps/cli` remains the terminal product and engine proving ground.
- `apps/desktop/src-tauri` remains Desktop's native host.
- `crates/agiworkforce-protocol` becomes the canonical Rust protocol/types crate.
- `crates/agiworkforce-command-registry` owns CLI/shared command metadata.
- Execution, sandbox, task, plugin, app-server, and protocol crates must expose stable APIs that Desktop and future services can reuse.

Rules:

- Rust crate names use `agiworkforce-*`.
- Rust modules use snake_case.
- Shared protocol changes require tests in both CLI and Desktop/native call sites when both are affected.
- CLI-specific TUI code stays in `apps/cli`; reusable runtime code moves to `crates/`.

## Services And Managed Compute Plan

Future service categories:

- `services/api-gateway`: public API gateway and app backend.
- `services/signaling-server`: realtime/device signaling.
- Future `services/managed-runner`: managed compute runner, private beta only.
- Future `services/billing-ledger`: usage reservation, settlement, refunds, and provider-price accounting if it grows beyond API gateway.

Rules:

- Managed compute code must never be hidden in app code.
- Billing/credits code must have its own ledger and tests before public access.
- Service deployment docs belong in `docs/hosting/` or `docs/architecture/`, not scattered in service READMEs only.

## GTM, Marketing, And Support Layout

Create or normalize:

- `docs/launch/`: launch checklists, launch posts, store listing copy.
- `docs/marketing/`: positioning, website copy, persona notes, competitive messaging.
- `docs/support/`: FAQs, troubleshooting, refund/support policies, onboarding scripts.
- `docs/legal/`: privacy policy drafts, terms drafts, data processing notes, compliance posture.

Rules:

- Marketing docs should not depend on reading engineering plans.
- Support docs should describe user-visible behavior, not implementation internals.
- Legal/compliance drafts must be clearly marked draft until reviewed.

## Ownership Model

Add `CODEOWNERS` after the move plan stabilizes.

Initial owner roles:

- Founder/product: product thesis, public positioning, pricing, launch.
- Platform lead: packages, contracts, repo structure, CI, developer experience.
- CLI lead: `apps/cli`, Rust engine contracts that originate in CLI.
- Desktop lead: `apps/desktop`, local host, Tauri, local compute.
- Mobile lead: `apps/mobile`, mobile storage, local/BYOK onboarding, remote approvals.
- Web lead: `apps/web`, account, projects, app chat sync, billing/waitlist.
- Extension lead: Chrome and VS Code extensions.
- Backend/data lead: `services`, `supabase`, auth, billing, managed compute.
- Security/privacy lead: audit, privacy modes, sandboxing, connector permissions.
- GTM lead: `docs/launch`, `docs/marketing`, public website/store copy.

## CI And Guardrails

Add checks before or during cleanup:

- Root clutter check: fail CI if new loose `.md`, `.png`, `.json`, or generated report files appear at root without allowlist.
- Workspace import boundary check: apps cannot import apps; services cannot import UI packages; packages cannot import apps.
- Package ownership check: every package has `README.md`, `package.json`, tests or a documented exception.
- Docs status check: active plans need status/owner/last-updated.
- Dead-link check for docs after moves.
- `pnpm typecheck:all`, `pnpm lint`, Rust `cargo check --workspace`, and targeted surface tests stay required.

## LLM Operability

Goal: make the repo easy for coding agents to inspect, debug, and repair without rediscovering stale plans or duplicate bug reports.

Locked implementation:

- `AGENTS.md` is the canonical tool-neutral agent entry point.
- `CLAUDE.md` is a Claude-specific mirror and must not duplicate repo maps or command lists.
- `docs/agent-context/` is the durable agent-readable context folder.
- `docs/agent-context/known-flaws.md` is the first stop before an agent reports a bug as new.
- `docs/agent-context/repo-map.json`, `risk-map.json`, `commands.json`, and `doc-status.json` are the machine-readable maps.
- `pnpm check:agent-context`, `pnpm check:repo-organization`, `pnpm check:boundaries`, and `pnpm check:llm-operability` are the enforcement commands.

Rules:

- Tool-specific files such as `CLAUDE.md`, Cursor rules, opencode prompts, or future agent configs must point back to `AGENTS.md`.
- Do not let agent docs become another planning system. They are routing maps, commands, known flaws, and risk boundaries only.
- Every repeated bug class should be recorded in `known-flaws.md` with owner, status, paths, and verification.
- Existing root clutter is classified debt; new root clutter should fail the organization check unless explicitly allowlisted.

## Execution Phases

### Phase 0: Freeze The Contract

- Add this plan.
- Update `PLAN.md`, `TODO.md`, `CHANGELOG.md`, and `docs/README.md`.
- Decide root keep list.
- Mark `docs/plans/domain-first-reorg.md` as nested under this broader plan.
- Add `docs/agent-context/` and root agent-doc contract.

### Phase 1: Inventory And Classification

- Generate root file classification ledger.
- Generate hidden tool-folder classification ledger.
- Generate docs status ledger: current, superseded, archive, scratch.
- Generate package/service/crate ownership ledger.
- Identify files that are tracked accidentally versus intentionally untracked.

### Phase 2: Root Cleanup

- Move scratch markdown/images from root into a dated archive/report folder.
- Remove or ignore generated/cache artifacts after verifying tracked status.
- Move reference catalogs to a durable location or mark them historical.
- Add root clutter CI check.

### Phase 3: Docs Cleanup

- Add status headers to active plans.
- Archive superseded docs.
- Split marketing/GTM/support/legal docs from engineering docs.
- Fix docs links after moves.
- Keep `docs/README.md` as the navigation index.

### Phase 4: Naming And Ownership

- Write naming convention doc.
- Add owner role map for every top-level folder.
- Add `CODEOWNERS`.
- Normalize package README files.
- Add package/service/crate purpose statements.
- Keep agent-facing owner maps synchronized with `docs/agent-context/repo-map.json` and `risk-map.json`.

### Phase 5: Package Boundaries

- Define public exports for each shared package.
- Replace deep imports.
- Add import boundary checks.
- Split contracts only if `packages/types` becomes too broad after audit.

### Phase 6: Surface Domain Reorg

- Execute `docs/plans/domain-first-reorg.md` in the updated order: Web, Mobile, Desktop.
- One domain per PR.
- No behavior changes in move PRs.
- Run full surface checks after each domain.

### Phase 7: Rust And Services Cleanup

- Move reusable CLI runtime pieces into crates only when a second consumer exists.
- Clarify service ownership and deployment docs.
- Keep managed compute isolated behind explicit future service boundaries.

### Phase 8: Team Onboarding

- Rewrite `CONTRIBUTING.md` beyond the current stub.
- Add `ONBOARDING.md` for engineers.
- Add `docs/support/` for support/GTM operators.
- Add PR templates by change type: product, docs, infra, security, refactor, release.

## First 20 Tasks

- [x] Create root file classification ledger.
- [x] Create hidden AI/tool folder ledger.
- [x] Create docs status ledger.
- [x] Create package/service/crate owner ledger.
- [x] Decide `ios/` stays at root as the canonical tracked Xcode-consumed output.
- [x] Decide raw `reference-index/` belongs under `audit/repo-organization/reference-index/`.
- [x] Move root scratch markdown files to a dated archive/report folder.
- [x] Move root scratch image files to a dated report folder.
- [x] Add root clutter allowlist check.
- [x] Add docs status header check.
- [x] Add import-boundary lint.
- [x] Add canonical `docs/agent-context/` folder.
- [x] Add root `AGENTS.md` as the canonical tool-neutral agent entry point.
- [x] Convert `CLAUDE.md` into a Claude-specific mirror.
- [x] Add agent-context, repo-organization, boundary, and combined LLM-operability checks.
- [x] Add or update package READMEs.
- [ ] Add `CODEOWNERS`.
- [x] Expand `CONTRIBUTING.md`.
- [x] Add PR templates.
- [x] Normalize docs plans and planning folders.
- [x] Create `docs/marketing/`.
- [x] Create `docs/support/`.
- [x] Create `docs/legal/`.
- [ ] Start Web domain-first move from the existing sub-plan.

## Definition Of Done

The repo is ready for a hired team when:

- A new engineer can identify where to change Web, Desktop, Mobile, CLI, VS Code, Chrome, backend, shared TypeScript, and shared Rust without asking the founder.
- A marketing/GTM person can find launch, positioning, and support docs without reading engineering internals.
- Root contains only source-of-truth docs and required config.
- Every top-level folder has a documented owner role and purpose.
- Every active plan has status, owner, and last-updated metadata.
- Shared package boundaries are enforced by CI.
- Apps do not import each other.
- Generated reports and scratch artifacts never appear loose at root.
- Domain moves are complete or tracked with clear remaining tasks.
- The current `PLAN.md`, `TODO.md`, `CHANGELOG.md`, and `docs/README.md` agree.
