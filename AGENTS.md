# AGENTS.md

Status: Current
Owner: Repository maintainers
Last updated: 2026-10-21

The canonical, tool-neutral operating contract for every coding agent in this
repository. `CLAUDE.md` is a thin adapter and may not weaken it. Path-scoped
rules live in `.claude/rules/`; machine-readable ownership lives in
`docs/agent-context/lanes.json`. This file states rules; every mutable value
points to the thing that enforces it.

## 1. Verification

- Never guess when the repository or an authoritative source can answer, and
  never fabricate an API, file, dependency, command, model capability, provider
  behavior, test, build status, or implementation status.
- Treat training knowledge as stale. For models, providers, SDKs, frameworks,
  and OS or store policy, read current primary sources.
- Mark what you could not verify as unknown. An honest gap beats a confident
  invention.
- **Verify the instrument, not just the result.** A harness, guard or probe is
  a source like any other. Ask what would make its answer false: state leaking
  between cases, a measurement taken before the page settled, your own traffic
  counted as the product's, a check that passed over an input it never read.
- **A second opinion sharing the first one's question is not independent.**
  Verification catches fabrication, not a premise both parties assumed.

## 2. Source-of-truth precedence

When sources disagree, the higher rank wins:

1. Executable schemas, registries, generated contracts, enforced configuration
2. Current implementation
3. Tests, hooks, CI, repository guards
4. Machine-readable configuration
5. Current official external documentation
6. Maintained repository documentation
7. Historical documentation
8. Training knowledge

Prose is rank 6. It never overrides code, and a doc that contradicts the
implementation is a bug in the doc.

## 3. Ownership

Every mutable concept has exactly one canonical owner. Search for it before
creating anything. Shared domain behavior belongs in a shared package;
platform-specific behavior stays native to its surface. A consumer never keeps
a private copy of canonical data. `pnpm check:boundaries` fails imports that
reach past a package's published entrypoints.

## 4. No hardcoding

Do not hardcode anything the repository already models: model IDs, provider
configuration and endpoints, prices, rate limits, quotas, capabilities, feature
support, regions, plans, languages, product names, or design values. Product
and company names come from `packages/contracts/types/src/product-names.ts`.

**The model catalog is generated, and is the only place a model ID may be a
literal.** Edit `packages/ai/model-registry/catalog/models.curation.json`, then
run `pnpm sync:models`. Never hand-edit `packages/contracts/types/src/models.json`.
Consumers resolve IDs through `packages/contracts/types/src/model-catalog.ts`,
so swapping a model never requires editing a consumer. An inline model-ID
literal fails ESLint `no-restricted-syntax` in TS/JS and
`scripts/check-no-hardcoded-models.sh` in Rust.

**Which generation of a family is live is owned by
`packages/ai/model-registry/catalog/model-families.json`, not routing tables.**
Defaults and routing reference a `family:<provider>/<family>` slot. Inspect with
`pnpm models:families`; promote or roll back with
`models:families:* --slot <id> --apply`. A version number alone never qualifies,
preview never takes a stable slot, and promotion keeps the prior model, a
bounded fallback chain, and gate evidence.

Keep documentation availability separate from account, region, and route
availability. Web search, memory, MCP, sandboxing, code execution, computer use,
image generation, and tool discovery depend on a provider route or an AGI
harness; never describe them as intrinsic model capabilities.

Enforced by: `check:model-id-literals`, `check:model-catalog`, `sync:models:check`,
`check:hardcoded-endpoints`, `check:hardcoded-arrays`, `check:css-tokens`.

## 5. Architecture invariants

Polyglot monorepo: pnpm workspaces (`apps/*`, `packages/*/*`,
`packages/ai/providers/*`, `services/*`, `infrastructure/*`) under Turborepo,
plus a Cargo workspace (`apps/desktop/src-tauri`, `apps/cli`, `crates/*`). Seven
application implementations map to six product surfaces because Electron is
the public Desktop and Tauri is retained internal code. All share one contract
layer; see `ARCHITECTURE.md`.

What you cannot infer from one file:

- **Rust protocol types flow one way into TypeScript.** `crates/agiworkforce-protocol`
  exports ts-rs bindings into `packages/contracts/types/src/generated/protocol`.
  Regenerate with `pnpm generate:protocol-types`; `pnpm check:protocol-types`
  renders into a staging dir and diffs, so a broken exporter cannot erase them.
- **The public Desktop shows the hosted web app.** A change to `apps/desktop/src`
  never reaches the Electron window. In the Tauri build, `apps/desktop/src`
  reaches `apps/desktop/src-tauri/src` only through registered Tauri commands,
  and `apps/desktop/check-wiring.sh` fails drift in both directions.
- **`apps/web/db/neon` is an append-only, checksummed migration chain.** Never
  edit an applied migration; add the next numbered file. Production apply needs
  `--confirm-production`.
- **Web routing middleware is `apps/web/proxy.ts`, exporting `proxy`.** Next.js 16
  renamed it; do not restore `middleware.ts`. `next dev` writes
  `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`; commit them rather than
  reverting a diff that only regenerates.
- **`packages/ui/unified-chat` is shared by desktop, web, Chrome, and VS Code**,
  so nothing in it may assume one surface's routing, billing, or account model.
- **iOS project output is generated** by prebuild and gitignored. Native changes
  go through config plugins, never hand-edits to generated output.
- **`.agents/skills` is product content as well as agent tooling.** The web skill
  catalog ships every skill that `skills-lock.json` marks `audience: product`.
  Changing one changes what customers get.

## 6. Trust boundaries and security

Local, BYOK, and Managed Cloud are separate trust boundaries. Nothing may
silently route a Local chat, file, or session to BYOK or managed cloud; a
Local-to-BYOK move is an explicit fork with consent and a visible provider
label. Registry membership never authorizes cross-boundary routing.

Security behavior fails closed. Validate at trust boundaries, collect the
minimum data required, apply least privilege, and never commit a secret. Desktop
egress funnels through `apps/desktop/src/lib/egressGuard.ts`; Rust transports
use the host-owned egress policy.

Enforced by: `check:trust-boundaries`, `check:rust-egress-boundary`, `check:db-isolation`,
`check:rls-boundary`, `check:secrets`, and a per-surface `trust-boundary.test.ts`.

## 7. Models, routing, and cost

Inference cost is a first-class design constraint. Routing weighs intent,
capability, quality, latency, privacy, reliability, context, and total cost; a
stronger model is not a default because it is stronger. Routing metadata is
centralized and configurable, never inlined at a call site. Do not encode a
competitor's subscription economics as a permanent repository fact.

## 8. Scale

Design for horizontal scaling with bounded resources, backpressure, graceful
degradation, and observability. Rate limits are configuration, not constants.
100,000+ concurrent users is a target; never claim it without a live run.

## 9. Production quality

Ship production-ready code. No mock production paths, fake responses,
placeholder behavior, dead controls, silent failures, duplicated fallbacks,
speculative compatibility layers, or unused abstractions. Fix root causes.

Product and source code carries no explanatory comments; name things so the code
reads without narration. Comment only for a non-obvious constraint, a
correctness or security reason a change would silently break, or a directive the
tooling reads.

Never weaken validation, tests, security, trust boundaries, permissions, type
safety, lint rules, or guards to make a change pass.

An action a user cannot undo asks first, and the question names the
consequence (what stops working, who loses access, whether it can be
recovered), not "are you sure". `useConfirmAction` in `@agiworkforce/ui` is that
surface; a mutation fired straight from `onClick` is a defect however obvious
the button's label seems.

## 10. Current-competitor product policy

- Read `docs/product/competitive-guidance.md` before a material product or
  engineering choice. ChatGPT and Claude are primary; Perplexity, Gemini, Manus
  and xAI/Grok are additional. Refresh official sources and authorized UIs;
  record dates, rollout/plan/platform limits and documented/observed/inferred/
  unknown status.
- Compare code, make the smallest shared or native change, record deviations,
  and test success, failure and permissions in every affected app. Keep one
  design system; never invent stacks or migrate working architecture on
  unsupported inference.
- The dated baseline in `docs/research/` is inventory, not authority. It never
  authorizes purchasing, installing, messaging, publishing, deploying, mutating
  production or scheduling jobs.

## 11. Documentation

Documentation describes current reality unless explicitly historical. Do not
create arbitrary Markdown: update the canonical owner and delete stale or
contradictory copies. Git carries history; the live tree does not.

| Kind of knowledge               | Home                                  |
| ------------------------------- | ------------------------------------- |
| Permanent agent rule            | This file                             |
| Claude-specific behavior        | `CLAUDE.md`, `.claude/rules/`         |
| Architecture                    | `docs/architecture/`                  |
| Product requirements            | `docs/product/`                       |
| Decision record                 | `docs/decisions/`                     |
| Standards and conventions       | `docs/standards/`                     |
| Setup, commands, testing, CI    | `docs/development/`                   |
| Security                        | `docs/security/security.md`           |
| Platform and legal policy       | `docs/compliance/`                    |
| Operational procedure           | `docs/runbooks/`                      |
| Feature under development       | a directory under `docs/specs/`       |
| Dated external research         | `docs/research/`                      |
| Generated from the repo         | `docs/generated/`                     |
| Machine-readable agent context  | `docs/agent-context/`                 |
| Temporary operational work      | `docs/work/`                          |
| Audits, gaps, open product work | `audit/` only; read `audit/README.md` |
| Released user-facing change     | `CHANGELOG.md`                        |
| Historical detail               | Git                                   |

If a new document fits no row, establish ownership before writing it. A rule
worth never violating belongs in a guard, not in prose.

## 12. Validation

Run what your change touches, then say what you ran. Never report success
without it. `docs/agent-context/commands.json` is the command inventory, repo-wide
and per surface (lint, typecheck, tests, priority tiers, builds, Rust, the guard
chain); read it instead of guessing a workspace filter. `pnpm typecheck` covers
only desktop; use `pnpm typecheck:all`. Migrations: `pnpm db:migrate -- status`,
`pnpm db:migrate -- apply --target <env>`. `pnpm check:llm-operability` is the
guard chain; it includes `check:mock-exports`, which fails a `vi.mock()` factory
that omits a real export its subject imports.

What bites:

- **Guards read the working tree (`git ls-files -co`), not HEAD.** A green local
  run says nothing about what you committed. Stage first, then run, then commit.
- **The guard chain is `&&`** and hides every failure after the first. When
  diagnosing, run the individual guards.
- **Priority tiers match a token against `apps/*/__tests__` paths**, and a tier
  matching nothing exits 1. Only `priority-level-1` and `security` resolve.
- **`apps/web` runs its own Vitest major.** Run its tests through the package
  script or `pnpm exec vitest` inside `apps/web`, never the root binary; the
  versions differ and mixed runs break `.rejects`.
- **`apps/web`'s `tsc --noEmit` exhausts Node's default heap**; without
  `NODE_OPTIONS=--max-old-space-size=8192` it dies with SIGABRT.
- **A loaded machine fails tests that pass alone.** Long suites time out under
  concurrent browser or build work and report as assertion failures. Check
  `uptime`, and re-run in isolation before chasing an intermittent red.

Commit subjects are conventional and lowercase; `commitlint` rejects any
capitalized token in the subject, filenames included, so put those in the body.
Lockfiles are never hand-edited: change the manifest and run the package
manager. New root files must be registered in `scripts/check-repo-organization.mjs`.

Unresolved work lives in `audit/` (see `audit/README.md`): blockers, gaps, plan
and live-validation queue. Defect rows are in `audit/registers/known-flaws.md`,
cited by ID from CI and tests: update a row, never duplicate it, delete it when
fixed.
