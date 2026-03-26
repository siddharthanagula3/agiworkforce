# AGI Workforce — Product Roadmap (Now / Next / Later)

_Last updated: March 20, 2026 · v1.1.6 (Q2 execution close)_

> Planning stack: `VISION.md` explains the product thesis, `docs/MASTER_PROGRAM_PLAN.md` is the canonical all-program plan, and `ROADMAP.md` tracks the active release train.

---

## Status Overview

Across all surfaces: **~92% of core features are shipped** (Q2 execution complete), with 5 items in progress and 12 items planned for Q3+. The desktop app is mature (367K LOC Rust in desktop backend, 1,439 Tauri commands, 24+ LLM providers). The web app is production-ready. Mobile is production-ready for companion use. Extensions are hardened with high parity to competitors.

---

## SHIPPED — Q2 Execution Complete (Waves 1-6)

| Wave   | Items                                                                                                                                                                                                                                            | Status      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Wave 1 | Approval timeout (3 policies), stream watchdog (30s), 8-state agent lifecycle, auth skeleton, pairing (11-state machine), model catalog types                                                                                                    | SHIPPED     |
| Wave 2 | Workflow builder (739 LOC), action timeline (318 LOC), companion UX (3 states), remote control, patch engine, retrieval Phase 1, billing hardening, workforce management, schedule history, CLI improvements (0 warnings)                        | SHIPPED     |
| Wave 3 | Browser replay viewer (422 LOC), operator drill-down (528 LOC), agent execution settings (201 LOC), control-plane dashboard, system status page, export/delete account, session TTL + cleanup, provider health (11 providers), contract docs (4) | SHIPPED     |
| Wave 4 | Security fixes (4 CRITICAL/HIGH, 8 MEDIUM), database tables (4 with RLS), 197 tests (all GREEN), team/device visibility (399 LOC), browser debug tabs (657 LOC), notification priority, push delivery, project-aware chat, schedule NLP          | SHIPPED     |
| Wave 5 | Performance budgets (38 metrics), helpers (measureAsync/Sync), desktop onboarding (5-step), web welcome (5-item), shared components, model catalog API (3 endpoints)                                                                             | SHIPPED     |
| Wave 6 | Surface heartbeat reporting, Chrome extension improvements, support playbook, team policy hooks (in progress)                                                                                                                                    | IN PROGRESS |

---

## NOW — Active Work (Q3 Planning)

| #   | Item                                        | Theme        | Status      | Dependencies        |
| --- | ------------------------------------------- | ------------ | ----------- | ------------------- |
| 1   | **Team policy hooks finalization**          | Core Desktop | In Progress | None                |
| 2   | **MCP proxying through API Gateway**        | Integrations | Ready       | None                |
| 3   | **Cross-surface memory platform coherence** | Platform     | In Progress | None                |
| 4   | **Advanced governance UI**                  | Core Desktop | Planned     | RBAC backend        |
| 5   | **VS Code inline completion scoring**       | Extensions   | In Progress | Ghost-text provider |

---

## NEXT — Q3 Delivery (2-4 weeks)

| #   | Item                                         | Theme        | Notes                                            |
| --- | -------------------------------------------- | ------------ | ------------------------------------------------ |
| 6   | **Complete Email Workspace**                 | Core Desktop | IMAP backend works; build compose/inbox UI       |
| 7   | **Knowledge Base Browser**                   | Core Desktop | RAG backend ready; build browse/search UI        |
| 8   | **Code Workspace**                           | Core Desktop | Monaco editor multi-file editing                 |
| 9   | **Memory sync hardening (mobile ↔ desktop)** | Mobile       | Sync infrastructure exists; productization focus |
| 10  | **MCP tool proxying via API Gateway**        | Integrations | Read-only results first, then writes             |
| 11  | **Advanced governance UI**                   | Core Desktop | RBAC editor, audit logs, compliance              |

---

## LATER — Backlog / Future Quarters (Q3+)

| #   | Item                                          | Theme        | Notes                              |
| --- | --------------------------------------------- | ------------ | ---------------------------------- |
| 12  | **Model Comparison View**                     | Core Desktop | Side-by-side output comparison     |
| 13  | **Docking System**                            | Core Desktop | VS Code-style flexible panels      |
| 14  | **Full offline mode (mobile)**                | Mobile       | Local agent runtime on phone       |
| 15  | **Messaging relay (WhatsApp/Slack/Telegram)** | Mobile       | Desktop backend complete           |
| 16  | **Chrome extension analytics**                | Extensions   | Usage tracking                     |
| 17  | **Signaling server persistent sessions**      | Integrations | Redis/DB for durability            |
| 18  | **API Gateway advanced analytics**            | Integrations | Usage dashboards, cost attribution |
| 19  | **Marketing site refresh**                    | Web          | Update for new capabilities        |
| 20  | **Plugin/Skill marketplace**                  | Web          | 140+ skills, ratings, discovery    |
| 21  | **WebRTC video/audio calls**                  | Core Desktop | Feature flag ready                 |
| 22  | **Local LLM fine-tuning UI**                  | Core Desktop | llama.cpp integration              |

---

## Risks & Dependencies

| Risk                                | Impact                      | Mitigation                             |
| ----------------------------------- | --------------------------- | -------------------------------------- |
| Approval timeout not resolved       | Hung approvals block agents | Default timeout + auto-deny policy     |
| Visual Workflow Builder scope creep | Core differentiator delayed | Ship minimal canvas first, iterate     |
| MCP proxy blocks mobile tool use    | Mobile remains view-only    | Read-only results first, writes second |
| Chrome CDP instability              | File upload unreliable      | Graceful fallback to manual action     |
| Test coverage gap (82% → 98%)       | Regressions in error paths  | Dedicate 1 sprint to test-only work    |

---

## Differentiator Alignment

| Differentiator                            | Roadmap Items                |
| ----------------------------------------- | ---------------------------- |
| Local Desktop Control + Multi-Model + GUI | #9-12, #30-31                |
| Mobile Companion + Live Agent Dashboard   | #3-5, #13-14, #18, #23-24    |
| 140+ Non-Coding AI Skills                 | #29 (marketplace)            |
| Full BYOK + Local LLMs                    | #31 (fine-tuning)            |
| Proprietary Desktop-Native Agent Platform | #10, #17, #20-22             |
| MCP Without Artificial Limits             | #15 (mobile MCP proxy)       |
| AGI Workforce CLI (NEW)                   | #19 (Claude Code competitor) |
