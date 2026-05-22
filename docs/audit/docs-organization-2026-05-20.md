# Documentation Organization Audit - 2026-05-20

## Scope Reviewed

- `docs/`: 142 files total.
- Markdown docs in `docs/`: 113.
- Non-Markdown docs/assets in `docs/`: 29.
- Post-cleanup `docs/`: 141 files total, 113 Markdown, 28 non-Markdown docs/assets.
- Claude Code project memory: 73 Markdown files.
- Claude memory lock files: 18.
- MCP memory graph: read on 2026-05-20; useful for older desktop/runtime context, not the latest product locks.

## Memory Location

The active Claude Code project memory is:

`/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/`

The repo also contains a small historical stub:

`.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/audit-2026-05-06.md`

There is no repo-root `memory/` directory, so links like `memory/byok-first-pivot-2026-05-16.md` are stale.

## Current Buckets

Canonical entry points:

- `AGI_WORKFORCE.md`
- `README.md`
- `BUILD.md`
- `docs/README.md`
- `docs/PRD.md`
- `docs/decisions/CURRENT_DECISIONS.md`

Product:

- `docs/PRD.md`
- `docs/PRD-MOBILE.md`
- `docs/PRD-APPENDIX-A-DATA-MODELS.md`
- `docs/PRD-APPENDIX-B-API-CONTRACTS.md`
- `docs/PRD-APPENDIX-C-MONOREPO-LAYOUT.md`
- `docs/PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md`
- `docs/PRD-RESOLUTIONS-AND-AUDIT.md`
- `docs/PRICING.md`
- `docs/ROADMAP.md`
- `docs/VISION.md`
- `docs/research/v1-product-validation.md`

Architecture and operations:

- `docs/ARCHITECTURE.md`
- `docs/architecture/foundation-2026.md`
- `docs/architecture/worker-protocol.md`
- `docs/HOSTING.md`
- `docs/SCALING.md`
- `docs/PERFORMANCE.md`
- `docs/OWNERSHIP.md`
- `docs/cli-binary-size-2026-05-15.md`
- `docs/cli/COMMAND_SURFACE.md`

Surface docs:

- `docs/surfaces/chrome-extension.md`
- `docs/surfaces/cli.md`
- `docs/surfaces/desktop.md`
- `docs/surfaces/mobile.md`
- `docs/surfaces/vscode-extension.md`
- `docs/surfaces/web.md`

Design:

- `docs/design/design-spec-2026-05-15.md`
- `docs/design/mobile-claude-design-prompt-r2-2026-05-18.md`
- `docs/design/mobile-screen-design-prompt-2026-05-18.md`
- `docs/design/mobile-wireframes-2026-05-18/README.md`
- `docs/design/mobile-wireframes-2026-05-18/chats/chat1.md`
- `docs/design/pitch-deck-prompt-2026-05-17.md`
- `docs/design/pitch-deck-verified-numbers-2026-05-17.md`
- `docs/design/brand-mark-proposals/*.svg`
- `docs/design/brand-mark-proposals/preview.html`
- `docs/design/mobile-wireframes-2026-05-18/project/*`

Security and audit:

- `docs/audit/AUDIT_2026-05-03.md`
- `docs/audit/AUDIT_REPORT_2026-05-01.md`
- `docs/audit/FIX_QUEUE.md`
- `docs/audit/desktop-audit-2026-05-20.md`
- `docs/audit/docs-organization-2026-05-20.md`
- `docs/security/REVIEW.md`
- `docs/security/auth-role-service-role-body-checks.md`
- `docs/security/findings-chrome-ext.md`
- `docs/security/findings-cli.md`
- `docs/security/findings-desktop.md`
- `docs/security/findings-mobile.md`
- `docs/security/findings-supply-chain.md`
- `docs/security/findings-vscode-ext.md`
- `docs/security/findings-web.md`
- `docs/security/red-team-2026-05-04.md`
- `docs/security/review-architecture.md`
- `docs/security/review-performance.md`

Launch and listings:

- `docs/launch/HINDI-LAUNCH-CHECKLIST.md`
- `docs/launch/hobby-tier-checklist.md`
- `docs/launch/r-localllama.md`
- `docs/launch/show-hn.md`
- `docs/launch/twitter.md`
- `docs/launch/wave-3-playbook.md`
- `docs/launch/wave-3-r-localllama.md`
- `docs/launch/wave-3-show-hn.md`
- `docs/launch/wave-3-twitter.md`
- `docs/launch/store-listings/app-store.md`
- `docs/launch/store-listings/chrome-web-store.md`
- `docs/launch/store-listings/google-play.md`
- `docs/launch/store-listings/vs-code-marketplace.md`

Planning and historical implementation plans:

- `docs/planning/cli-modernization-spec.md`
- `docs/plans/domain-first-reorg.md`
- `docs/plans/six-surface-system-design-2026-05-20.md`
- `docs/superpowers/plans/2026-05-01-cli-reference-port.md`
- `docs/superpowers/plans/2026-05-05-phase1-design-system-foundation.md`
- `docs/superpowers/specs/2026-05-01-cli-reference-port-design.md`
- `docs/superpowers/specs/2026-05-05-ui-audit/*.md`

Archive:

- `docs/archive/2026-05-02-master-remediation.md`
- `docs/archive/2026-05-02-sprint1-vault-rewire.md`
- `docs/archive/2026-05-14-exploration-ledger-phase1.md`
- `docs/archive/2026-05-14-rust-reverse-engineering-plan-v1.2.md`
- `docs/archive/2026-05-14-wave2-desktop-v1.md`
- `docs/archive/2026-05-14-wave3-mobile-extensions-web.md`
- `docs/archive/2026-05-16-pre-v3/*.md`
- `docs/archive/2026-05-18-exploration-report.md`
- `docs/archive/2026-05-18-wave-0-complete.md`

Historical but still in root pending confirmation:

- `docs/BILLION_DOLLAR_PLAYBOOK.md`
- `docs/HANDOFF.md`

## Deleted As Safe Cleanup

- `docs/archive/2026-05-02-master-remediation-repo.md` - byte-identical duplicate of `docs/archive/2026-05-02-master-remediation.md`.
- `docs/archive/2026-05-02-sprint1-vault-rewire-repo.md` - byte-identical duplicate of `docs/archive/2026-05-02-sprint1-vault-rewire.md`.
- `docs/.DS_Store` - generated macOS metadata, not documentation.

## Archived From Root

- `docs/EXPLORATION-REPORT-2026-05-18.md` -> `docs/archive/2026-05-18-exploration-report.md`.
- `docs/WAVE-0-COMPLETE-2026-05-18.md` -> `docs/archive/2026-05-18-wave-0-complete.md`.

## Remaining Risks

1. Mobile-v1 docs still contain older dual-mode Cloud/BYOK passages even though founder clarification now defines Local and BYOK as separate trust boundaries and keeps AGI-managed cloud credits waitlisted.
2. Several current docs cite `memory/*.md`, but that directory is not in the repo.
3. Some historical docs still discuss the old `docs/DESIGN.md` path, but the current design spec lives at `docs/design/design-spec-2026-05-15.md`.
4. `docs/HANDOFF.md` is cited as current, but the file content is a 2026-05-03 Wave 1 CLI handoff.
5. `docs/BILLION_DOLLAR_PLAYBOOK.md` is cited by PRD and onboarding, but it predates the mobile-v1 Local/BYOK trust-boundary clarification and should be treated as historical strategy.

## Recommended Next Step

Do a focused mobile-doc pass next: amend `docs/PRD-MOBILE.md`, `docs/surfaces/mobile.md`, mobile onboarding/pricing copy, and app-store launch docs so mobile v1 is consistently Local + explicit BYOK, with Local -> BYOK implemented as a fork and Managed Cloud / AGI Compute Credits waitlisted. Leave platform-level Local + BYOK posture intact unless the PRD is formally amended.
