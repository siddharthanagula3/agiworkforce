# AGI Workforce — Product Roadmap (Now / Next / Later)

_Last updated: March 17, 2026 · v1.1.5_

---

## Status Overview

Across all surfaces: **~85% of core features are shipped**, with 12 items in progress and 15+ items planned. The desktop app is the most mature surface (705K LOC Rust, 24+ LLM providers, 289 Tauri commands). The web app is production-ready. Mobile is beta-ready for companion use. Extensions are functional but need integration hardening.

---

## NOW — Shipping This Sprint (Active Work)

| #   | Item                                          | Theme                 | Status   | Dependencies            |
| --- | --------------------------------------------- | --------------------- | -------- | ----------------------- |
| 1   | **Wire MessagingPanel to Rust backend**       | Core Desktop          | At Risk  | None                    |
| 2   | **Finish Database UI**                        | Core Desktop          | On Track | `remote-databases` flag |
| 3   | **Approval timeout behavior**                 | Core Desktop + Mobile | At Risk  | Signaling server        |
| 4   | **Auth 401 handling in mobile-desktop sync**  | Mobile                | On Track | API Gateway             |
| 5   | **Offline queue sync callbacks**              | Mobile                | On Track | Signaling server        |
| 6   | **Web E2E test coverage to 98%**              | Web & Marketing       | On Track | None                    |
| 7   | **Browser file uploads via Chrome extension** | Extensions            | Blocked  | Chrome CDP bridge       |
| 8   | **Stream end path hardening**                 | Core Desktop          | On Track | None                    |

---

## NEXT — Planned for Next 2-4 Weeks

| #   | Item                                  | Theme        | Notes                                           |
| --- | ------------------------------------- | ------------ | ----------------------------------------------- |
| 9   | **Complete Email Workspace**          | Core Desktop | IMAP backend works; build compose/inbox UI      |
| 10  | **Visual Workflow Builder**           | Core Desktop | Backend engine complete; build drag-drop canvas |
| 11  | **Knowledge Base Browser**            | Core Desktop | RAG backend ready; build browse/search UI       |
| 12  | **Code Workspace**                    | Core Desktop | Monaco editor multi-file editing                |
| 13  | **Push notifications (mobile)**       | Mobile       | Expo notifications configured                   |
| 14  | **Memory sync (mobile ↔ desktop)**    | Mobile       | API gateway sync routes exist                   |
| 15  | **MCP tool proxying via API Gateway** | Integrations | Unlocks mobile MCP access                       |
| 16  | **VS Code inline completion scoring** | Extensions   | Ghost-text provider exists                      |
| 17  | **Team Dashboard UI**                 | Core Desktop | RBAC backend complete                           |
| 18  | **Scheduled tasks (mobile)**          | Mobile       | Desktop scheduler functional                    |
| 19  | **AGI Workforce CLI**                 | NEW SURFACE  | Multi-model Claude Code competitor              |

---

## LATER — Backlog / Future Quarters

| #   | Item                                          | Theme        | Notes                               |
| --- | --------------------------------------------- | ------------ | ----------------------------------- |
| 20  | **Model Comparison View**                     | Core Desktop | Side-by-side output comparison      |
| 21  | **Docking System**                            | Core Desktop | VS Code-style flexible panels       |
| 22  | **Advanced Governance UI**                    | Core Desktop | RBAC editor, audit logs, compliance |
| 23  | **Full offline mode (mobile)**                | Mobile       | Local agent runtime on phone        |
| 24  | **Messaging relay (WhatsApp/Slack/Telegram)** | Mobile       | Desktop backend complete            |
| 25  | **Chrome extension analytics**                | Extensions   | Usage tracking                      |
| 26  | **Signaling server persistent sessions**      | Integrations | Redis/DB for durability             |
| 27  | **API Gateway advanced analytics**            | Integrations | Usage dashboards, cost attribution  |
| 28  | **Marketing site refresh**                    | Web          | Update for new capabilities         |
| 29  | **Plugin/Skill marketplace**                  | Web          | 140+ skills, ratings, discovery     |
| 30  | **WebRTC video/audio calls**                  | Core Desktop | Feature flag ready                  |
| 31  | **Local LLM fine-tuning UI**                  | Core Desktop | llama.cpp integration               |

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
