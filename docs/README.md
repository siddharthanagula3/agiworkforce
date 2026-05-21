# AGI Documentation Index

Status: Current
Owner: Docs/platform
Last organized: 2026-05-20.
Last updated: 2026-05-21

This directory is for durable repo documentation. Generated files, build artifacts, personal memory, and one-off transcripts should not live here unless they are explicitly archived.

## Read First

1. [`../AGI_WORKFORCE.md`](../AGI_WORKFORCE.md) - root entry point for agents and maintainers.
2. [`../PLAN.md`](../PLAN.md) - active Anthropic Applications parity transition plan.
3. [`../TODO.md`](../TODO.md) - active transition checklist.
4. [`../BUILD.md`](../BUILD.md) - toolchain, build, test, and release commands.
5. [`agent-context/`](./agent-context/) - canonical LLM-operability maps, known flaws, risk areas, and commands for coding agents.
6. [`engineering/`](./engineering/) - internal engineering workflow, PR, review, and agent-native development rules.
7. [`plans/pre-release-repo-organization-2026-05-20.md`](./plans/pre-release-repo-organization-2026-05-20.md) - pre-release repo organization, naming, ownership, and team-onboarding plan.
8. [`../audit/anthropic-apps-parity/`](../audit/anthropic-apps-parity/) - source-backed parity evidence, including competitive baseline, SDK strategy, and compute/artifact research.
9. [`PRD.md`](./PRD.md) - repo product spec.
10. [`decisions/CURRENT_DECISIONS.md`](./decisions/CURRENT_DECISIONS.md) - latest decision index and mobile-v1 launch clarification.
11. [`surfaces/`](./surfaces/) - one operational guide per shipping surface.

## Current Product Specs

| File                                                                                                         | Purpose                                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [`PRD.md`](./PRD.md)                                                                                         | Platform product spec. Contains current repo-level requirements, risks, success metrics, and locked decisions. |
| [`PRD-MOBILE.md`](./PRD-MOBILE.md)                                                                           | Mobile-specific PRD. Supersedes platform PRD on mobile-only implementation details.                            |
| [`PRD-APPENDIX-A-DATA-MODELS.md`](./PRD-APPENDIX-A-DATA-MODELS.md)                                           | Supabase, SQLite, billing, dispatch, waitlist, and model-policy data contracts.                                |
| [`PRD-APPENDIX-B-API-CONTRACTS.md`](./PRD-APPENDIX-B-API-CONTRACTS.md)                                       | Web API, Tauri command, mobile dispatch, and consent-copy contracts.                                           |
| [`PRD-APPENDIX-C-MONOREPO-LAYOUT.md`](./PRD-APPENDIX-C-MONOREPO-LAYOUT.md)                                   | Repo layout, ownership, env vars, build commands, and CI contracts.                                            |
| [`PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md`](./PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md) | Scaling, observability, privacy, EU AI Act, and compliance planning.                                           |
| [`PRD-RESOLUTIONS-AND-AUDIT.md`](./PRD-RESOLUTIONS-AND-AUDIT.md)                                             | Prior PRD conflict audit and Delete / Update / Retain classification.                                          |
| [`VISION.md`](./VISION.md)                                                                                   | Durable product vision.                                                                                        |
| [`ROADMAP.md`](./ROADMAP.md)                                                                                 | Wave and launch timeline.                                                                                      |
| [`PRICING.md`](./PRICING.md)                                                                                 | Tier matrix and pricing/billing posture.                                                                       |

## Current Engineering References

| File                                                                                                         | Purpose                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)                                                                       | Cross-surface system map.                                                          |
| [`architecture/foundation-2026.md`](./architecture/foundation-2026.md)                                       | Accepted Foundation Sprint architecture.                                           |
| [`architecture/worker-protocol.md`](./architecture/worker-protocol.md)                                       | Worker direction-inversion protocol.                                               |
| [`engineering/agent-native-development.md`](./engineering/agent-native-development.md)                       | Human/agent task splitting, worktree/session isolation, and verification workflow. |
| [`engineering/parallel-agent-playbook.md`](./engineering/parallel-agent-playbook.md)                         | Lane-based workflow for running 15+ coding agents without overlapping writes.      |
| [`engineering/autonomous-software-company-roadmap.md`](./engineering/autonomous-software-company-roadmap.md) | Feedback-to-patch, support automation, and release automation roadmap.             |
| [`HOSTING.md`](./HOSTING.md)                                                                                 | Web/service hosting, domains, and deployment options.                              |
| [`SCALING.md`](./SCALING.md)                                                                                 | Supabase-to-Neon and provider-swap playbooks.                                      |
| [`PERFORMANCE.md`](./PERFORMANCE.md)                                                                         | Performance, caching, provider failover, and traffic notes.                        |
| [`OWNERSHIP.md`](./OWNERSHIP.md)                                                                             | High-risk ownership boundaries.                                                    |
| [`cli/COMMAND_SURFACE.md`](./cli/COMMAND_SURFACE.md)                                                         | CLI process, slash command, and TUI command inventory.                             |
| [`api/openapi.yaml`](./api/openapi.yaml)                                                                     | OpenAPI reference.                                                                 |
| [`api/AGI_Workforce.postman_collection.json`](./api/AGI_Workforce.postman_collection.json)                   | Postman collection.                                                                |

## Surface Guides

- [`surfaces/desktop.md`](./surfaces/desktop.md)
- [`surfaces/web.md`](./surfaces/web.md)
- [`surfaces/mobile.md`](./surfaces/mobile.md)
- [`surfaces/cli.md`](./surfaces/cli.md)
- [`surfaces/chrome-extension.md`](./surfaces/chrome-extension.md)
- [`surfaces/vscode-extension.md`](./surfaces/vscode-extension.md)

## Design

| File                                                                                                           | Purpose                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`design/design-spec-2026-05-15.md`](./design/design-spec-2026-05-15.md)                                       | Current design spec. Replaces old `docs/DESIGN.md` links.                          |
| [`design/mobile-screen-design-prompt-2026-05-18.md`](./design/mobile-screen-design-prompt-2026-05-18.md)       | Mobile v1 design prompt, updated for local-first/managed-cloud-waitlist direction. |
| [`design/mobile-claude-design-prompt-r2-2026-05-18.md`](./design/mobile-claude-design-prompt-r2-2026-05-18.md) | Round 2 mobile Claude Design prompt.                                               |
| [`design/mobile-wireframes-2026-05-18/`](./design/mobile-wireframes-2026-05-18/)                               | Mobile wireframe bundle and prototype files.                                       |
| [`design/brand-mark-proposals/`](./design/brand-mark-proposals/)                                               | Brand mark options A/B/C. Founder decision still pending.                          |

## Security And Audit

| Folder                     | Purpose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| [`audit/`](./audit/)       | General codebase audits, fix queues, desktop audit, and docs organization audit. |
| [`security/`](./security/) | Threat models, red-team reports, and per-surface security findings.              |

## Launch, Research, And Plans

| Folder                           | Purpose                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| [`launch/`](./launch/)           | Launch copy, channel drafts, store listings, and operator checklists.  |
| [`research/`](./research/)       | Repo-level product validation research and delegated research prompts. |
| [`marketing/`](./marketing/)     | Marketing, positioning, launch, GTM, and growth operator workspace.    |
| [`support/`](./support/)         | Support operations, customer feedback intake, and support automation.  |
| [`legal/`](./legal/)             | Legal/compliance operating docs and review queues.                     |
| [`plans/`](./plans/)             | Active or recent plans.                                                |
| [`decisions/`](./decisions/)     | ADRs and current decision index.                                       |
| [`superpowers/`](./superpowers/) | Historical superpowers plans/specs and UI audit corpus.                |

## Archive

[`archive/`](./archive/) contains superseded plans and snapshots. Treat archived files as historical evidence only. Do not cite them as current unless a current doc explicitly says to.

## Mobile-V1 Clarification

The 2026-05-20 docs audit found one important scoped clarification:

- Platform docs say v1 includes Local + BYOK free with paid tiers waitlisted to 2026-08-01.
- Founder clarification narrowed the 2026-05-18 local-first/cloud-waitlist locks to mobile v1 first.
- Mobile v1 is Local + explicit BYOK. Managed Cloud / AGI Compute Credits stay waitlisted or private beta.
- Mobile-specific docs still need a focused rewrite so Local -> BYOK is consistently an explicit fork with context selection, secret scan, payload preview, and visible provider labeling.

See [`decisions/CURRENT_DECISIONS.md`](./decisions/CURRENT_DECISIONS.md) before editing mobile launch, pricing, onboarding, or PRD docs.
