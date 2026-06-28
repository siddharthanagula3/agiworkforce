# AGI Engineering Playbook — Volumes

Status: Canonical (expanded depth of `docs/spec/AGI_CODE_MASTER_SPEC.md`)
Owner: Platform lead
Last updated: 2026-06-28

The master spec (`../AGI_CODE_MASTER_SPEC.md`) is the terse constitution. These volumes are the **full internal engineering playbook** — repository-aware, architecture-aware, competitor-aware, with checklists an autonomous session can execute against. Target depth: ~20,000–40,000 words across 40 volumes, 300–600 checklists total.

## Volume format (every volume follows this)

1. Header: `# Volume NN — <Title>`, status, authority docs.
2. **Philosophy & Cloud/Local stance** — the why, and how Cloud vs Local vs Hybrid changes this domain.
3. **Binding rules** — numbered laws (imperative).
4. **Repository map** — the actual AGI paths this domain owns (`apps/*`, `packages/*`, `crates/*`, `services/*`), grounded in `docs/agent-context/repo-map.json`.
5. **Competitor notes** — what Claude/ChatGPT/Codex do here and AGI's deliberate divergence (cite `docs/strategy/01`, `02`).
6. **Checklists** — multiple `- [ ]` checklists (build, review, security, per-surface) — this is the bulk; aim for 8–20 checklist items per volume.
7. **Definition of Done** — the gate before the domain is "production-ready."
8. **Anti-patterns** — what not to do.

Rules: adapt, never copy proprietary code (study `claude-code` only). Model IDs from `packages/types/src/models.json`. Trust boundaries are absolute. Keep each volume 600–1,200 words.

## Index

| #   | File                                 | Domain                                         |
| --- | ------------------------------------ | ---------------------------------------------- |
| 01  | `01-mission-architecture.md`         | Mission, vision, philosophy, architecture      |
| 02  | `02-repository-map.md`               | Repository map & structure conventions         |
| 03  | `03-modes-and-trust.md`              | Cloud/Local/Hybrid, trust & privacy modes      |
| 04  | `04-tenancy-identity-entitlement.md` | Orgs/teams/workspaces, RBAC, quotas, licensing |
| 05  | `05-applications-surfaces.md`        | All surfaces + future surfaces                 |
| 06  | `06-runtime.md`                      | Cloud/local/hybrid runtime                     |
| 07  | `07-providers.md`                    | Providers & abstraction                        |
| 08  | `08-model-layer.md`                  | Registry, capabilities, routing                |
| 09  | `09-conversation-system.md`          | Conversations, branches, history               |
| 10  | `10-prompt-system.md`                | Prompts, templates, versioning                 |
| 11  | `11-context-system.md`               | Dynamic context assembly                       |
| 12  | `12-memory.md`                       | Memory tiers + lifecycle                       |
| 13  | `13-projects.md`                     | Projects                                       |
| 14  | `14-artifacts.md`                    | Artifacts                                      |
| 15  | `15-files.md`                        | Files & ingestion                              |
| 16  | `16-ai-features.md`                  | Chat, research, voice, vision, gen             |
| 17  | `17-agent-system.md`                 | Single/multi-agent                             |
| 18  | `18-tools.md`                        | Tools                                          |
| 19  | `19-mcp.md`                          | MCP client/server                              |
| 20  | `20-connectors.md`                   | Connectors                                     |
| 21  | `21-skills.md`                       | Skills                                         |
| 22  | `22-plugins.md`                      | Plugins                                        |
| 23  | `23-ui-system.md`                    | UI system                                      |
| 24  | `24-streaming.md`                    | Streaming                                      |
| 25  | `25-storage.md`                      | Cloud/local storage                            |
| 26  | `26-synchronization.md`              | Sync                                           |
| 27  | `27-authentication.md`               | Auth                                           |
| 28  | `28-billing.md`                      | Billing                                        |
| 29  | `29-observability.md`                | Observability                                  |
| 30  | `30-security.md`                     | Security                                       |
| 31  | `31-performance.md`                  | Performance                                    |
| 32  | `32-testing-qa.md`                   | Testing & QA                                   |
| 33  | `33-developer-experience.md`         | DX                                             |
| 34  | `34-competitive-parity.md`           | Claude/ChatGPT RE + parity                     |
| 35  | `35-audit-tech-debt.md`              | Audit & tech debt                              |
| 36  | `36-roadmap-release.md`              | Roadmap & release readiness                    |
| 37  | `37-founder-report.md`               | GTM / fundraising                              |
| 38  | `38-schemas-contracts.md`            | Schemas & contracts                            |
| 39  | `39-output-structure.md`             | Output directory structure                     |
| 40  | `40-governance.md`                   | Governance & session loop                      |
