# AGENTS.md

Status: Current
Owner: Repository maintainers
Last updated: 2026-08-29

The canonical, tool-neutral operating contract for every coding agent in this
repository. `CLAUDE.md` is a thin adapter over this file and may not weaken it.
Path-scoped rules live in `.claude/rules/`; machine-readable ownership lives in
`docs/agent-context/lanes.json`.

This file states rules. It does not mirror facts that live in code, the
previous agent-doc corpus was deleted in August 2026 because it did exactly
that and rotted. Every mutable value below is a pointer to the thing that
enforces it.

## 1. Verification

- Never guess when the repository or an authoritative source can answer.
- Never fabricate an API, file, dependency, command, model capability, provider
  behavior, test, build status, or implementation status.
- Treat training knowledge as potentially stale. For models, providers, SDKs,
  frameworks, OS and store policy, use current primary sources.
- Mark what you could not verify as unknown. An honest gap beats a confident
  invention.
- **Verify the instrument, not just the result.** A harness, guard or probe is
  a source like any other. Ask what would make its answer false, state leaking
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
platform-specific behavior stays native to its surface. A consumer must never
keep a private copy of canonical data.

`pnpm check:boundaries` fails imports that reach past a package's published
entrypoints.

## 4. No hardcoding

Do not hardcode anything the repository already models: model IDs, provider
configuration and endpoints, prices, rate limits, quotas, capabilities, feature
support, regions, plans, languages, or design values.

**The model catalog is generated, and is the only place a model ID may be a
literal.** Edit `packages/ai/model-registry/catalog/models.curation.json`, then
run `pnpm sync:models`. Never hand-edit `packages/contracts/types/src/models.json`.
Consumers resolve IDs through `packages/contracts/types/src/model-catalog.ts`.
An inline model-ID literal fails ESLint `no-restricted-syntax` in TS/JS and
`scripts/check-no-hardcoded-models.sh` in Rust. Swapping a model must never
require editing a consumer.

**Which generation of a family is live is owned by
`packages/ai/model-registry/catalog/model-families.json`, not by the routing
tables.** Provider defaults, provider task routing, canonicalization targets,
tier lists, and Auto routing slots reference a family slot (`family:<provider>/<family>`)
that resolves at compile time to that slot's active model. A newer release in an
existing family is a one-record promotion, never a sweep through the routing
tables. `pnpm models:families` evaluates every slot against the promotion gates
(provider availability, family and tier identity, lifecycle, capability
coverage, and cost/context/benchmark regression thresholds);
`pnpm models:families:promote --slot <id> --apply` promotes and verifies, and
`pnpm models:families:rollback --slot <id> --apply` restores the retained
predecessor. A preview model never takes a stable slot, a higher version number
alone never qualifies, and each promotion retains the previous model, a bounded
fallback chain, and its gate evidence.

Keep documentation availability separate from account, region, and route
availability. Do not describe web search, memory, MCP, sandboxing, code
execution, computer use, image generation, or tool discovery as intrinsic model
capabilities when they depend on a provider route or an AGI harness.

Enforced by: `check:model-id-literals`, `check:model-catalog`, `sync:models:check`,
`check:hardcoded-endpoints`, `check:hardcoded-arrays`, `check:css-tokens`.

## 5. Architecture invariants

Polyglot monorepo: pnpm workspaces (`apps/*`, `packages/*/*`,
`packages/ai/providers/*`, `services/*`, `infrastructure/*`) under Turborepo,
plus a Cargo workspace (`apps/desktop/src-tauri`, `apps/cli`, `crates/*`). Six
surfaces sit on one contract layer. See `ARCHITECTURE.md` for the map.

The parts you cannot infer from one file:

- **Rust protocol types flow one way into TypeScript.** `crates/agiworkforce-protocol`
  exports ts-rs bindings into `packages/contracts/types/src/generated/protocol`.
  Regenerate with `pnpm generate:protocol-types`; `pnpm check:protocol-types`
  renders into a staging dir and diffs, so a broken exporter cannot erase them.
- **The desktop is two halves with an enforced seam.** `apps/desktop/src` reaches
  `apps/desktop/src-tauri/src` only through registered Tauri commands.
  `apps/desktop/check-wiring.sh` fails both directions of drift.
- **`apps/web/db/neon` is an append-only, checksummed migration chain.** Never
  edit an applied migration; add the next numbered file. Production apply needs
  `--confirm-production`.
- **Web routing middleware is `apps/web/proxy.ts`, exporting `proxy`.** Next.js 16
  renamed it; do not restore `middleware.ts`. `apps/web/AGENTS.md` and
  `apps/web/CLAUDE.md` are written by `next dev`, commit them rather than
  reverting a diff that only regenerates.
- **`packages/ui/unified-chat` is surface-neutral.** It is shared by desktop, web,
  Chrome, and VS Code; nothing in it may assume one surface's routing, billing,
  or account model.
- **iOS project output is generated.** The mobile iOS project directory is
  gitignored and produced by prebuild. Native changes go through config plugins,
  never hand-edits to generated output.

## 6. Trust boundaries and security

Local, BYOK, and Managed Cloud are separate trust boundaries. Nothing may
silently route a Local chat, file, or session to BYOK or managed cloud; a
Local-to-BYOK move is an explicit fork with consent and a visible provider
label. Registry membership never authorizes cross-boundary routing.

Security behavior fails closed. Validate at trust boundaries, collect the
minimum data required, apply least privilege, and never commit a secret. Desktop
egress funnels through `apps/desktop/src/lib/egressGuard.ts`; Rust transports
must use the host-owned egress policy.

Enforced by: `check:trust-boundaries`, `check:rust-egress-boundary`, `check:db-isolation`,
`check:rls-boundary`, `check:secrets`, and a per-surface `trust-boundary.test.ts`.

## 7. Models, routing, and cost

Inference cost is a first-class design constraint. Routing weighs intent,
capability, quality, latency, privacy, reliability, context, and total cost. A
stronger model is not a default because it is stronger. Routing metadata is
centralized and configurable, never inlined at a call site. Do not encode a
competitor's subscription economics as a permanent repository fact.

## 8. Scale

Design for horizontal scaling with bounded resources, backpressure, graceful
degradation, and observability. Rate limits are configuration, not constants.
100,000+ concurrent users is a capacity target that must be proven by
measurement; never claim it without a live run behind the number.

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
consequence, what stops working, who loses access, whether it can be
recovered, not "are you sure". `useConfirmAction` in `@agiworkforce/ui` is
that surface; a mutation fired straight from `onClick` is a defect regardless
of how obvious the button's label seems.

## 10. Research

Claude, ChatGPT, Gemini and other products are legitimate references. Verify
current behavior before any competitor-sensitive decision, and never copy
branding or proprietary layouts. The same applies to Apple, Google Play,
Microsoft, Chrome Web Store, and VS Code Marketplace policy: check the current
rule, and date the finding. Dated research belongs in `docs/research/`; it does
not silently become architecture.

## 11. Documentation

Documentation describes current reality unless explicitly historical. Do not
create arbitrary Markdown, update the canonical owner instead, and delete stale
or contradictory copies. Git carries history; the live tree does not.

| Kind of knowledge              | Home                            |
| ------------------------------ | ------------------------------- |
| Permanent agent rule           | This file                       |
| Claude-specific behavior       | `CLAUDE.md`, `.claude/rules/`   |
| Architecture                   | `docs/architecture/`            |
| Product requirements           | `docs/product/`                 |
| Decision record                | `docs/decisions/`               |
| Standards and conventions      | `docs/standards/`               |
| Setup, commands, testing, CI   | `docs/development/`             |
| Security                       | `docs/security/`                |
| Platform and legal policy      | `docs/compliance/`              |
| Operational procedure          | `docs/runbooks/`                |
| Feature under development      | a directory under `docs/specs/` |
| Dated external research        | `docs/research/`                |
| Generated from the repo        | `docs/generated/`               |
| Machine-readable agent context | `docs/agent-context/`           |
| Temporary operational work     | `docs/work/`                    |
| Released user-facing change    | `CHANGELOG.md`                  |
| Historical detail              | Git                             |

If a new document does not fit a row, establish ownership before writing it.
Rules worth never violating belong in a guard, not in prose.

## 12. Validation

Run what your change touches, then say what you ran. Never report success
without it.

| Task              | Command                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Lint              | `pnpm lint` (Chrome extension: `pnpm lint:extension`)                                          |
| Typecheck         | `pnpm typecheck:all`, `pnpm typecheck` covers only desktop                                     |
| Test everything   | `pnpm test`                                                                                    |
| Test what changed | `pnpm test:affected`                                                                           |
| One package       | `pnpm --filter @agiworkforce/web test`                                                         |
| Priority tiers    | `pnpm test:l1`, `pnpm test:security`                                                           |
| Build             | `pnpm build` (excludes desktop); `pnpm build:desktop`                                          |
| Rust tests        | `cargo test -p agiworkforce-desktop --lib`, `-p agiworkforce-cli`                              |
| Rust lint         | `cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib -- -D warnings -D unsafe-code` |
| Migrations        | `pnpm db:migrate -- status`, `pnpm db:migrate -- apply --target <env>`                         |
| Guard chain       | `pnpm check:llm-operability`                                                                   |

`docs/agent-context/commands.json` is the machine-readable inventory per
surface, read it instead of guessing a workspace filter.

Four things that bite:

- **Guards read the working tree (`git ls-files -co`), not HEAD.** A green local
  run says nothing about what you committed. Stage first, then run, then commit.
- **The guard chain is `&&`.** It stops at the first failure and hides every
  later one. When diagnosing, run the individual guards, not the chain.
- **Priority tiers match a token against paths under `apps/*/__tests__`.** A tier
  matching nothing now exits 1 rather than reporting success over zero tests.
  Levels 2 to 4 were removed for that reason; `priority-level-1` and `security`
  are the tokens that resolve.
- **`apps/web`'s `tsc --noEmit` exhausts Node's default heap.** Use
  `NODE_OPTIONS=--max-old-space-size=8192` or it dies with SIGABRT.
- **A loaded machine fails tests that pass alone.** Long suites time out under
  concurrent browser or build work and report as assertion failures. Check
  `uptime`, and re-run in isolation before chasing an intermittent red.

Commit subjects are conventional and lowercase; `commitlint` rejects any
capitalized token in the subject, filenames included. Put those in the body.
Lockfiles are never hand-edited, change the manifest and run the package
manager. New root files must be registered in `scripts/check-repo-organization.mjs`.

`docs/agent-context/known-flaws.md` records durable defects. Check it before
reporting a bug as new, and update the existing entry rather than adding a
duplicate.
