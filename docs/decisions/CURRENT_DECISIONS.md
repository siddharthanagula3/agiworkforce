# Current Decisions

Status: Current
Owner: Founder + platform lead
Last reviewed: 2026-05-21
Last updated: 2026-05-21

This is the conflict-resolution index for current product and architecture decisions. It is intentionally shorter than the archived PRD corpus.

## Decision Sources

Current sources of truth:

- `docs/current/product-suite.md` - product thesis, surfaces, trust modes, and sync boundary.
- `docs/current/technical-architecture.md` - monorepo shape, runtime boundaries, provider strategy, generated files, and enterprise control plane.
- `docs/current/commercial-and-launch.md` - Local/BYOK/Managed launch posture, waitlist, payment, and enterprise gates.
- `docs/current/agent-and-repo-operability.md` - repo/docs/agent workflow rules.
- `PLAN.md` - active transition plan.
- `TODO.md` - active execution queue.
- `AGI_WORKFORCE.md` - broad platform snapshot and entry point.

Archived source material:

- `docs/archive/2026-05-21-docs-consolidation/` contains the former top-level PRD, mobile PRD, appendices, vision, roadmap, pricing, architecture, hosting, scaling, performance, ownership, handoff, and strategy docs.
- Archived docs can be mined for detail, but they do not override `docs/current/`, `PLAN.md`, `TODO.md`, or this file.

## Locked Decisions

1. AGI Workforce is an OpenAI/Anthropic-style application suite, not just a chat app or CLI. The differentiation is local-first privacy, explicit BYOK, multi-provider routing, and privacy-controlled managed compute across Web, Desktop, Mobile, CLI, VS Code, and Chrome.
   Evidence: `docs/current/product-suite.md`, `docs/decisions/2026-05-20-openai-anthropic-application-suite-thesis.md`, `audit/anthropic-apps-parity/application-suite-thesis-2026-05-20.md`.

2. Public brand is AGI. The formal platform name is AGI Workforce. Repo paths, package names, crates, database identifiers, and internal identifiers stay `agiworkforce`.
   Evidence: `AGI_WORKFORCE.md`, `README.md`, `docs/engineering/naming-conventions.md`, `memory/locks/brand-agi-2026-05-15.md`.

3. The six-surface product boundary is Web, Desktop, Mobile, CLI, VS Code, and Chrome.
   Evidence: `docs/current/product-suite.md`, `docs/surfaces/*.md`, `PLAN.md`.

4. Normal synced app chat is only for Web, Mobile, and Desktop. CLI, VS Code, and Chrome stay local/workspace/task scoped unless the user explicitly hands off selected, redacted context into a synced app chat.
   Evidence: `docs/current/product-suite.md`, `PLAN.md`, `TODO.md`.

5. Mobile v1 should ship as Local + explicit BYOK, not broad AGI-managed cloud. Managed Cloud / AGI Compute Credits / subscriptions remain waitlist or private beta until ledgering, payment rails, fraud, refund, chargeback, and provider-term risk are designed and verified.
   Evidence: `docs/current/commercial-and-launch.md`, `docs/current/product-suite.md`, `docs/enterprise/profit-first-enterprise-readiness.md`.

6. Local to BYOK is a fork, not a silent transfer or mode flip. The original Local thread remains local forever. The required flow is context selection, secret redaction, payload preview, provider label, and explicit consent.
   Evidence: `docs/current/product-suite.md`, `PLAN.md`, `TODO.md`.

7. SDKs are adapters, not architecture. AGI owns runtime schemas, event streams, privacy modes, provider routing, tool contracts, usage accounting, artifact manifests, and generated-file metadata.
   Evidence: `docs/current/technical-architecture.md`, `audit/anthropic-apps-parity/sdk-strategy-2026-05-20.md`.

8. Vercel AI Gateway and other managed proxy paths are never default for Local or strict BYOK. They can only be used behind explicit Managed labeling and consent.
   Evidence: `docs/current/technical-architecture.md`, `docs/current/commercial-and-launch.md`.

9. Do not hardcode model IDs or provider capabilities. Use the shared model catalogs and provider metadata.
   Evidence: `packages/types/src/models.json`, `AGI_WORKFORCE.md`, `memory/locks/rule-models-json-canonical.md`.

10. Auto-routing must be explicit and explainable; silent model substitution is a rejected anti-pattern.
    Evidence: `docs/current/product-suite.md`, `memory/locks/auto-routing-decision-2026-05-16.md`.

11. One chat layout across six surfaces remains a non-regression rule.
    Evidence: `docs/current/product-suite.md`, `docs/design/design-spec-2026-05-15.md`, `docs/surfaces/*.md`.

12. `@agiworkforce/llm-normalize` is the canonical app-level cross-provider contract.
    Evidence: `AGI_WORKFORCE.md`, `packages/llm-normalize/`, `docs/current/technical-architecture.md`.

13. Enterprise managed compute requires organization policy, audit logs, support workflow, usage ledger, provider cost snapshots, managed-credit controls, and release-fix traceability before public claims.
    Evidence: `docs/current/commercial-and-launch.md`, `docs/enterprise/control-plane.md`, `packages/types/src/enterprise/`, `supabase/migrations/20260521100000_enterprise_control_plane_foundation.sql`.

14. Current docs live in `docs/current/`; historical docs live in `docs/archive`. If they conflict, current docs win.
    Evidence: `docs/current/README.md`, `docs/current/agent-and-repo-operability.md`.

15. The primary CLI command is `agi`. `agiworkforce` remains a compatibility alias, not the preferred user-facing command. User docs and command examples should prefer `agi`; packages, crates, release archives, repo URLs, and existing `~/.agiworkforce` state paths keep `agiworkforce` unless a separate migration plan is approved.
    Evidence: `docs/engineering/naming-conventions.md`, `apps/cli/Cargo.toml`, `apps/cli/npm/package.json`, `scripts/install.sh`.

16. Repo naming follows the locked engineering convention: root `PLAN.md` for strategy, `TODO.md` for active work, `CHANGELOG.md` for completed work, current docs in `docs/current`, plans in `docs/plans`, evidence in `audit`, generated reports in `reports`, and historical material in `docs/archive`.
    Evidence: `docs/engineering/naming-conventions.md`, `docs/current/agent-and-repo-operability.md`, `scripts/check-structure-conventions.mjs`.

## Outdated Or Historical

- Former top-level PRD, mobile PRD, appendices, vision, roadmap, pricing, architecture, hosting, scaling, performance, ownership, handoff, and strategy docs are archived under `docs/archive/2026-05-21-docs-consolidation/`.
- `memory/locks/byok-first-launch-2026-05-16.md`, `subscription-tiers-2026-05-15.md`, and `pricing-billing-decisions-2026-05-16.md` remain platform-pricing evidence, but they do not make AGI-managed cloud or credits part of mobile v1.
- `memory/locks/auto-routing-spec-2026-05-07.md` is superseded on silent routing by `memory/locks/auto-routing-decision-2026-05-16.md`.
- `docs/archive/**`, `tasks/**`, and generated audit reports are evidence unless a current doc explicitly promotes a conclusion.

## Conflict Rule

If a current doc conflicts with code, verify code behavior first, then update the doc and decision index in the same change. If archived material conflicts with current docs, do not patch the archive; update current docs only when the current decision itself changes.
