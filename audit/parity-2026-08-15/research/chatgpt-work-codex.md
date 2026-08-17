# ChatGPT for Work / Business / Enterprise + OpenAI Codex — Production State

Research date: **2026-08-15**. All claims are sourced; anything not directly confirmed by a fetched/quoted source is marked **UNVERIFIED**. Model IDs and dates below are as reported by third-party/official sources at research time — they are competitor facts being recorded for parity research, not values to hardcode into this repo's own model registry.

---

## 1. Product line overview (as of 2026-08-15)

| Product                  | What it is                                                                                                                                                                   | Plans                                                                                                                                                                               | Notes                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT Free/Go/Plus/Pro | Consumer tiers                                                                                                                                                               | —                                                                                                                                                                                   | Baseline for feature comparison only                                                                                                                                                                                                                                                                                                                |
| **ChatGPT Business**     | Renamed from "ChatGPT Team" (Aug 2025); SMB/team tier, $25/user/mo annual or $30/mo monthly                                                                                  | Standard + new **Premium** seat ($125/user/mo, or $100/mo annual) launched **Aug 10, 2026** giving 5x usage of standard Business seats, explicitly framed as a pre-IPO revenue move | [Hung-Yi Chen guide](https://www.hungyichen.com/en/insights/chatgpt-enterprise-guide), [Yahoo Finance/premium pricing](https://finance.yahoo.com/technology/article/openai-announces-premium-business-pricing-as-it-seeks-to-increase-revenue-ahead-of-ipo-184654495.html)                                                                          |
| **ChatGPT Enterprise**   | Top tier: SSO/SCIM, EKM, data residency, compliance API, Global Admin Console                                                                                                | Custom/contact-sales pricing (not published)                                                                                                                                        | [OpenAI Help — What is ChatGPT Enterprise](https://help.openai.com/en/articles/8265053-what-is-chatgpt-enterprise)                                                                                                                                                                                                                                  |
| **ChatGPT Edu**          | Education variant, shares most Enterprise admin surface                                                                                                                      | —                                                                                                                                                                                   | Release notes shared with Enterprise (see §3)                                                                                                                                                                                                                                                                                                       |
| **ChatGPT Work**         | New (launched **July 9, 2026**) outcome-taking agent bundled into Plus/Pro/Business/Enterprise at no extra list price; not on Free/Go                                        | Bundled                                                                                                                                                                             | [Bloomberg](https://www.bloomberg.com/news/articles/2026-07-09/openai-unveils-chatgpt-work-agent-to-field-tasks-for-hours), [BNN Bloomberg](https://www.bnnbloomberg.ca/business/artificial-intelligence/2026/07/09/openai-launches-chatgpt-work/), [digitalapplied.com](https://www.digitalapplied.com/blog/chatgpt-work-openai-agent-launch-2026) |
| **Codex**                | Coding/agent product family: CLI, cloud (chatgpt.com/codex), desktop app (now merged into ChatGPT desktop), IDE extensions (VS Code/Cursor/Windsurf/Xcode), JetBrains plugin | Included on Free through Enterprise, usage-metered; standalone Codex seat available                                                                                                 | See §4-§8                                                                                                                                                                                                                                                                                                                                           |
| **ChatGPT Atlas**        | Standalone AI browser (launched Oct 2025)                                                                                                                                    | —                                                                                                                                                                                   | **Being sunset** — see §9                                                                                                                                                                                                                                                                                                                           |

---

## 2. ChatGPT Work (new, July 2026)

- Launched **July 9, 2026**, powered by the newly-shipped **GPT-5.6** model family. Rollout order: Pro, Enterprise, Edu got it first on web/mobile same day; Plus and Business followed within days; macOS desktop got it for all plans (including Free) on day one, Windows desktop trailed by a few days. [BNN Bloomberg](https://www.bnnbloomberg.ca/business/artificial-intelligence/2026/07/09/openai-launches-chatgpt-work/), [digitalapplied.com](https://www.digitalapplied.com/blog/chatgpt-work-openai-agent-launch-2026)
- Positioning: takes an _outcome_ (not a chat turn), gathers context across connected apps/files/workflows, breaks the goal into steps, and stays with the project for hours, delivering finished documents, spreadsheets, slide decks, reports, or small web apps. [Bloomberg](https://www.bloomberg.com/news/articles/2026-07-09/openai-unveils-chatgpt-work-agent-to-field-tasks-for-hours)
- Governance features: a **Plan mode** requiring step-by-step approval before execution, and configurable check-ins during a run. [digitalapplied.com](https://www.digitalapplied.com/blog/chatgpt-work-openai-agent-launch-2026)
- Connects to a **Plugins directory** — Slack, Gmail, Google Drive, Salesforce and "dozens more" — can run on a schedule. [digitalapplied.com](https://www.digitalapplied.com/blog/chatgpt-work-openai-agent-launch-2026)
- Pricing/limits: **usage-metered like Codex**, not flat per-seat inclusion beyond the base plan — no published per-task credit rates as of launch, which the source flags as a budgeting risk ("early enthusiastic adoption could exhaust monthly allowances quickly"). **UNVERIFIED**: exact credit-consumption rates. [digitalapplied.com](https://www.digitalapplied.com/blog/chatgpt-work-openai-agent-launch-2026)
- Directly competes with Anthropic's Claude Cowork and Microsoft Copilot Cowork — explicitly framed that way in coverage. [BNN Bloomberg](https://www.bnnbloomberg.ca/business/artificial-intelligence/2026/07/09/openai-launches-chatgpt-work/)
- Note: this is functionally distinct from the older "ChatGPT Agent" / "Operator" surface and from "Workspace agents" (§3) — OpenAI now has at least three overlapping agentic surfaces (ChatGPT Work, Workspace agents, Codex-as-general-agent). This overlap is itself a discoverability/positioning problem for their customers — worth watching for confusion in the field.

---

## 3. ChatGPT Business/Enterprise/Edu — admin, identity, governance

### 3.1 Global Admin Console (admin.openai.com)

Introduced in 2026 as a tenant-level control plane sitting above individual ChatGPT workspaces and API-platform organizations. [OpenAI Help — Global Admin Console](https://help.openai.com/en/articles/12289294-global-admin-console) (fetched via mirror), [IntuitionLabs](https://intuitionlabs.ai/articles/chatgpt-enterprise-admin-controls-security)

- **Tenant** = top-level org container: multiple ChatGPT workspaces + API orgs + verified domains + SSO connections + Tenant Admins, all under one identity umbrella.
- **Roles**: Global Admins (full tenant control — domains, SSO, add/remove other Global Admins, rename tenant); Workspace admins/owners (scoped to their workspace); Analytics viewers (view/export analytics only, Enterprise/Edu); Members (no console access).
- **Tabs**: Overview (tenant component map) · Access (domains, SSO required/optional/off, external "Sign in with ChatGPT" app access) · People (tenant-wide user search/promotion) · Analytics (adoption, usage, credit consumption, Codex-specific views, 90-day–12-month history depending on category) · Billing (Enterprise/Edu only — plan, seats, credit balances, invoices) · Agents (workspace agent inventory: Agent ID, activity, connected apps, schedules, performance).
- Adding/removing a workspace or org from a tenant still requires contacting OpenAI support — not self-service. [mirror of Global Admin Console article]

### 3.2 SSO / SCIM / IdP

- SSO via SAML/OIDC; domain must be DNS-verified before SSO can be turned on; three enforcement states: Required / Optional / Off, settable per workspace for ChatGPT (not for API Platform). [IntuitionLabs](https://intuitionlabs.ai/articles/chatgpt-enterprise-admin-controls-security)
- SCIM provisioning supports Okta, Entra ID/Azure AD, Google Workspace, OneLogin; syncs group membership every ~30–40 minutes per one source; **Enterprise and Custom plans only** (not Business). [OpenAI Academy — SCIM](https://academy.openai.com/public/clubs/admins-6o6xf/resources/scim), [SCIM Integration FAQ](https://help.openai.com/en/articles/10011769-scim-integration-faq), [IntuitionLabs](https://intuitionlabs.ai/articles/chatgpt-enterprise-admin-controls-security)
- IP allowlisting available for ChatGPT web access (not API). [IntuitionLabs](https://intuitionlabs.ai/articles/chatgpt-enterprise-admin-controls-security)

### 3.3 Roles & permissions

- Custom roles + Groups with granular per-feature toggles: agent mode, Canvas code execution, Codex access, internet access, custom GPT create/edit/share, memory, web search, app/connector access. Role inheritance is **additive** across group memberships. [IntuitionLabs](https://intuitionlabs.ai/articles/chatgpt-enterprise-admin-controls-security)
- Workspace has a default role applied to anyone without a custom role assignment. [WebSearch summary of role docs]
- Admins can disable the "view workspace members and groups" permission org-wide or per-role — side effect: affected members then **cannot share GPTs/Projects/Chats** because they can't pick recipients. This is a real, documented UX trap (turning on a privacy control silently breaks sharing). [OpenAI Help search summary]
- **May 28, 2026**: role-based _publishing_ permissions added for Workspace agents specifically. [ChatGPT Business release notes, fetched via mirror]

### 3.4 Apps / connectors ("connectors" renamed "apps" Dec 17, 2025)

- Business/Enterprise/Edu: apps and connectors are **disabled by default**; admin enables per-app in Workspace Settings → Apps, with per-action RBAC (allow-all / read-only / custom) as of **Apr 20, 2026** simplification. [WebSearch summary]
- Supported apps span Slack, Google Drive/Docs/Sheets/Slides (unified under one "Google Drive" app as of **Mar 25, 2026**), Microsoft Outlook (email + shared mailbox/calendar, **Apr 8, 2026**), SharePoint, Teams, Box, Notion, Linear, Dropbox, GitHub Enterprise, Snowflake, Databricks (app **templates** added **May 28, 2026**), Salesforce, Atlassian, and custom **MCP connectors**.
- **Write actions** for Microsoft/Google apps shipped **Mar 13, 2026**, off by default (draft emails, create docs/sheets, set up meetings).
- **Aug 2026 (reported)**: OpenAI is **retiring individual-user sync** for connected apps in Enterprise/Edu, shifting orgs toward admin-managed sync and plugin-based access; existing user-authorized sync connections get disabled in favor of admin-managed equivalents. This is a real regression/breaking-change risk for end users who set up personal connectors — flagged but **could not independently corroborate exact date/scope beyond one search-engine synthesis; treat as UNVERIFIED pending a primary-source read.**
- Google Workspace admin-managed setup requires uploading a Google service-account JSON key + specifying the admin account inside the ChatGPT admin console; admin then chooses synced files and user access. [OpenAI Help — Google Workspace Admin-Managed Setup](https://help.openai.com/en/articles/10929079-google-workspace-admin-managed-setup)
- Slack **connector actions** (join channel, create reminder, upload file, update profile) shipped **Jun 19, 2026**.

### 3.5 Company Knowledge

Business/Enterprise/Edu only. [OpenAI Help — Company Knowledge](https://help.openai.com/en/articles/12628342-company-knowledge-in-chatgpt-business-enterprise-and-edu) (fetched via mirror)

- Selected from the composer (or tools menu mid-chat); user picks which eligible apps to include; answers come back with **citations/links** to source docs.
- Requires the underlying app to expose **File Search** (search + fetch actions) — this explicitly includes **custom MCP connectors** that implement search/fetch, not just OpenAI-blessed apps.
- Enterprise/Edu: admin must enable eligible apps in Workspace Settings and can pre-enroll users; Business: apps enabled by default.
- Respects existing per-user permissions in the source system — no privilege escalation via the assistant.
- **Platform gap**: Company Knowledge is **web-only** — not available on the ChatGPT desktop apps (Windows/macOS) or mobile (iOS/Android) as of research date. This is a concrete, checkable parity gap.

### 3.6 Projects & shared GPTs

- Project **sharing** is available to Business/Enterprise/Edu, and was extended to Free/Go/Plus/Pro globally too. Hard cap: **100 members per shared project**, regardless of invite mechanism (email, group email, workspace link). [WebSearch summary of Projects help article]
- **Mar 27, 2026**: Projects can now pull in sources from apps (Slack channels, Drive files), existing chats, and ad-hoc text — building toward a "living knowledge base" per project.
- GPT sharing/visibility is workspace-governed; admins review, transfer, or delete workspace GPTs; admins can disable apps within workspace-created GPTs org-wide.

### 3.7 Usage analytics, spend controls, billing

- **Jun 18, 2026**: major analytics/spend-control release. Global Admin Console gets unified credit-consumption tracking **across both ChatGPT and Codex**, broken down by user/product/model. Admins can set default workspace credit limits, team/BU-specific caps, per-user overrides, and approve employee requests for more credit. A **Cost API** lets orgs pipe spend data into their own BI/finance systems. [enterprisedna.co](https://enterprisedna.co/resources/news/openai-chatgpt-enterprise-spend-controls-analytics-june-2026/), [OpenAI announcement](https://openai.com/index/chatgpt-enterprise-spend-controls/) (title/existence confirmed via search index; full body returned 403/blocked on direct fetch — content corroborated via enterprisedna.co secondary summary)
- **Mar 12, 2026**: "Workspace analytics" replaced "User analytics" — adds benchmark comparisons and impact surveys.
- **Apr 16, 2026**: Business workspace analytics refresh — headline metrics, member-level usage table, flexible date ranges, Codex visibility, filtering.
- Employees themselves get visibility into their own credit consumption vs. budget and can request more with a note.

### 3.8 Compliance, audit logs, retention

- **Compliance Logs Platform**: immutable, time-windowed JSONL exports of conversations/GPT activity via an Enterprise Compliance API; retained **30 days** on OpenAI's side by default — orgs that need longer retention must continuously pull and store the logs themselves. [WebSearch summary of Compliance Platform article]
- Separate **API-Platform audit logging** (org-level config changes) is **disabled by default** and, once enabled, **cannot be disabled again without contacting OpenAI** — a one-way switch worth flagging to any admin evaluating this. [WebSearch summary]
- Workspace admins configure conversation/memory retention windows; deleted conversations are purged from OpenAI systems within **30 days** unless legal hold applies. [WebSearch summary]
- **Enterprise Key Management (EKM)**: bring-your-own-key via AWS/Azure/Google Cloud KMS so OpenAI cannot decrypt content without customer permission. [IntuitionLabs](https://intuitionlabs.ai/articles/chatgpt-enterprise-admin-controls-security)
- **Data residency**: choice of ~10 global regions for storage (Enterprise/Edu). [IntuitionLabs](https://intuitionlabs.ai/articles/chatgpt-enterprise-admin-controls-security); Japan region added for apps-with-sync **Apr 22, 2026**.
- There is a documented **Compliance API vs. User/Workspace Analytics** distinction (they serve different audiences/retention models) — OpenAI publishes a help article specifically to disambiguate the two, which itself signals this is a recurring point of admin confusion. [help.openai.com article exists — title/URL confirmed, full body blocked by 403 on fetch, so treat detailed content as **UNVERIFIED** beyond the title/premise.]

### 3.9 Other notable 2026 Enterprise/Business release-note items (chronological, last 6 months)

Sourced from OpenAI's own release-notes pages (fetched via a third-party mirror of help.openai.com after direct fetch was blocked with HTTP 403 — see Sources; cross-checked against the Business release-notes page which agrees on overlapping dates):

| Date          | Item                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-02-25    | Projects: add sources from apps/chats/text (Business notes)                                                                                                                    |
| 2026-03-04    | Codex app released for Windows                                                                                                                                                 |
| 2026-03-06    | "Skills" beta for Teams — turn a proven workflow into a reusable instruction set                                                                                               |
| 2026-03-11    | GPT-5.1 models retired, conversations auto-migrated                                                                                                                            |
| 2026-03-11    | Microsoft app OAuth scopes updated, now require Entra admin approval                                                                                                           |
| 2026-03-17    | Model picker simplified to Instant / Thinking / Pro tiers                                                                                                                      |
| 2026-03-18    | GPT-5.4 mini added as a reasoning fallback for rate-limited users                                                                                                              |
| 2026-03-19/26 | Legacy Deep Research mode deprecated and removed                                                                                                                               |
| 2026-03-25    | Google Drive app unification (Docs/Sheets/Slides merged)                                                                                                                       |
| 2026-03-26    | Plugins directory launches inside Codex                                                                                                                                        |
| 2026-03-27    | Box/Notion/Linear/Dropbox apps get write capabilities                                                                                                                          |
| 2026-04-02    | New Codex **seat type**: flexible, credit-based pricing, separate from ChatGPT seats                                                                                           |
| 2026-04-08    | Outlook shared-mailbox/shared-calendar actions                                                                                                                                 |
| 2026-04-09    | GPT-5.3 Instant mini released as fallback                                                                                                                                      |
| 2026-04-09    | SCIM group discoverability controls added to sharing flows                                                                                                                     |
| 2026-04-20    | Simplified app action permission model (allow-all/read-only/custom)                                                                                                            |
| 2026-04-22    | Workspace Agents rolling out to Business/Enterprise                                                                                                                            |
| 2026-04-30    | SharePoint sync moved from delegated to application OAuth scopes                                                                                                               |
| 2026-05-05/06 | ChatGPT for Excel + Google Sheets GA globally (Business/Enterprise/Edu/K-12)                                                                                                   |
| 2026-05-06    | Model picker gets inline "thinking effort" control; Analytics + Agents tabs added to Global Admin Console                                                                      |
| 2026-05-07    | Workspace agents extended to Enterprise Key Management orgs                                                                                                                    |
| 2026-05-14    | Codex remote access from ChatGPT mobile app; non-interactive access tokens                                                                                                     |
| 2026-05-21    | Codex "Goal mode" GA; Appshots; locked computer use; plugin sharing; Codex analytics in Global Admin Console                                                                   |
| 2026-05-22    | Workspace agents GA (Business/Enterprise/Edu); free period through Jul 6, 2026 then credit-metered                                                                             |
| 2026-05-28    | Workspace agents get GPT-5.5, reasoning-effort controls, role-based publishing; app templates for GitHub Enterprise/Snowflake/Databricks                                       |
| 2026-05-29    | Codex Remote Control GA (QR device pairing); DigitalOcean Droplet workspace plugin                                                                                             |
| 2026-06-02    | "ChatGPT Sites" preview — Codex can build/deploy small internal full-stack web apps with hosted URLs                                                                           |
| 2026-06-11    | Library feature (reusable file hub) for Enterprise/Edu/Healthcare; Codex gets Windows Computer Use + browser Developer mode; global admin console external-app-access controls |
| 2026-06-17    | Data export for ChatGPT Edu workspaces                                                                                                                                         |
| 2026-06-18    | Global Admin Console credit limits by workspace/group/user + billing analytics; Codex "Record & Replay" (macOS)                                                                |
| 2026-06-19    | Slack connector actions                                                                                                                                                        |
| 2026-06-25    | Memory summary/review feature, two-week Enterprise early access before default-on                                                                                              |
| 2026-07-09    | ChatGPT Work launches; Codex merges into the ChatGPT desktop app (macOS/Windows)                                                                                               |
| 2026-07-31    | Record & Replay expanded to EU/UK/Switzerland                                                                                                                                  |
| 2026-08-11    | ChatGPT desktop preview for Linux (Ubuntu/Debian/Fedora)                                                                                                                       |
| 2026-08-13    | "Computer History" (opt-in activity memory) for macOS, Pro/Business/Enterprise                                                                                                 |

Sources: [ChatGPT Enterprise & Edu Release Notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes) and [ChatGPT Business Release Notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes) (both blocked by 403 on direct fetch; content retrieved via the `ai-native-engineer/openai-mirror` GitHub mirror of these help-center pages — treat as a secondary reproduction of primary OpenAI text, not the live page itself, since it could lag the live article).

**Discoverability note**: this is a _lot_ of surface shipping in six months, largely landing as small help-center bullet points, not headline blog posts. Several genuinely significant changes (write-actions-by-default-off, the one-way audit-log toggle, the app-sync individual→admin-managed migration) are the kind of thing an admin would only find by reading release notes line-by-line — consistent with a general pattern of high shipping velocity outpacing change communication.

---

## 4. Codex — surface map

Codex is no longer "just" a coding CLI — by mid-2026 it has become OpenAI's general agent runtime, sharing infrastructure with Computer Use, browser automation, and (as of July 9, 2026) merging into the ChatGPT desktop app itself. [Wikipedia — OpenAI Codex (AI agent)](<https://en.wikipedia.org/wiki/OpenAI_Codex_(AI_agent)>), [Codex CLI 0.144.0 notes above]

| Surface                             | Status                                                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Codex CLI** (terminal)            | Actively developed, weekly-ish point releases (0.144–0.147 across Jul-Aug 2026). Open source, Apache-2.0, 106k GitHub stars / 16.1k forks. [github.com/openai/codex](https://github.com/openai/codex) |
| **Codex cloud** (chatgpt.com/codex) | Cloud sandboxed agent, isolated containers, no internet during task execution except pre-approved repo/deps                                                                                           |
| **Codex desktop app**               | macOS-native launched ~Feb 2026 → Windows Mar 4, 2026 → **merged into ChatGPT desktop app** Jul 9, 2026 → Linux preview (Ubuntu/Debian/Fedora) Aug 11, 2026                                           |
| **IDE extension**                   | VS Code and VS Code-compatible forks (Cursor, Windsurf), plus Xcode 26.3 native integration                                                                                                           |
| **JetBrains plugin**                | Native in JetBrains AI Assistant chat since **2026.3 wave, announced Jan 22, 2026**: IntelliJ IDEA, PyCharm, WebStorm, Rider, etc.                                                                    |
| **Mobile**                          | Remote Control (view/steer a running host session) — preview May 14, 2026 → **GA May 29, 2026** on iOS/Android, via authenticated QR pairing                                                          |
| **Slack / Linear / GitHub**         | Cloud tasks can be dispatched from a Slack thread, Linear issue, or GitHub issue/PR comment                                                                                                           |

---

## 5. Codex — models, reasoning effort, deprecations

Per [Codex model docs](https://learn.chatgpt.com/docs/models) (redirected from developers.openai.com/codex/models):

- Current flagship family is **GPT-5.6**, shipped **Jul 9, 2026** in three named variants:
  - **GPT-5.6 Sol** — flagship for complex coding, computer use, research, cybersecurity; available on every surface.
  - **GPT-5.6 Terra** — everyday/balanced, positioned as GPT-5.5-competitive at lower cost.
  - **GPT-5.6 Luna** — fastest/cheapest tier.
  - **GPT-5.3 Codex Spark** — text-only, low-latency research preview for real-time coding iteration, **ChatGPT Pro only**, reportedly running on Cerebras hardware (~15x faster) per earlier Feb 2026 launch coverage.
- Reasoning effort levels exposed: **Low/Light, Medium (default), High/Extra-High, Max**, and an **Ultra** tier that fans out to sub-agents for parallel work.
- **Deprecations**: GPT-5.1 retired Mar 11, 2026 (auto-migrated). GPT-5.4 and GPT-5.4-mini retire from **ChatGPT-authenticated** Codex sessions on **Aug 31, 2026** (still usable via raw API-key sessions) — recommended replacements are 5.6-terra and 5.6-luna respectively. GPT-5.2 / GPT-5.3-codex already deprecated for ChatGPT sign-in users. [Codex changelog, fetched via learn.chatgpt.com/docs/changelog]
- **GPT-5.6 "Sol" usage-efficiency controversy**: OpenAI announced Jul 29, 2026 that unspecified efficiency work should make usage "last around 18% longer" under typical Sol use, with some users seeing bigger gains and "the long tail of power users" still under-served. A community-filed GitHub issue (#36053, filed Jul 30, 2026, no OpenAI reply as of fetch) asks for the actual math: p50/p90/p99 distributions, rollout dates, per-request quota attribution — i.e., a complaint that the 18% figure is a marketing average, not a verifiable/reproducible metric. [github.com/openai/codex/issues/36053](https://github.com/openai/codex/issues/36053)

---

## 6. Codex CLI — approval/sandbox modes, config, MCP, AGENTS.md

### 6.1 Approval + sandbox model (two independent axes)

- `approval_policy`: `on-request` | `untrusted` | `never` | a granular object. [multiple docs, cross-corroborated]
- `sandbox_mode`: `read-only` | `workspace-write` | `danger-full-access`.
  - Read-only: commands can read but not write anywhere, including `/tmp`.
  - Workspace-write: the default "useful middle ground" — Codex can edit/test/format inside the project, asks permission to step outside it or touch the network.
  - Danger-full-access: no sandbox at all; documented as intended only for environments that already have an external sandbox around Codex.
- `--ask-for-approval never` disables all prompts and composes with any sandbox mode — i.e., a "YOLO"/full-auto mode exists and is documented, community guides explicitly frame it as the Claude-Code-"dangerously-skip-permissions" equivalent.
- **Aug 4-5, 2026 (v0.146.1)**: OpenAI shipped "safer automatic-review defaults for cyber-capable models" specifically, plus terminal-side clarification of permission changes — i.e., they tightened the default posture for security-capable model variants after presumably identifying risk there.
- **Jul 9, 2026 (v0.144.0)**: added a "write" app-approval mode specifically for read-only actions.

### 6.2 MCP support

- Config lives in `~/.codex/config.toml` (global) or a project-scoped `.codex/config.toml` — **shared across the ChatGPT desktop app, Codex CLI, and the IDE extension**, so one MCP setup propagates everywhere. [developers.openai.com/codex/mcp, cross-corroborated by multiple third-party guides]
- Top-level key is `mcp_servers` (snake_case, not `mcpServers`).
- Supports local STDIO servers and remote Streamable HTTP servers (with OAuth, bearer-token-from-env, or custom headers).
- Project-scoped MCP config is **ignored entirely for untrusted projects** — you must explicitly set `trust_level = "trusted"` in the project config for it to load. This is a real gotcha: a new contributor cloning a repo with a committed `.codex/config.toml` won't get its MCP servers until they trust the project.
- **Aug 7, 2026 (v0.147.0)**: bumped to MCP protocol version **2026-07-28**, adding paginated tool/resource discovery.
- **Jul 9, 2026**: interactive MCP authentication no longer requires an experimental flag (i.e., it graduated from experimental).

### 6.3 AGENTS.md

- Standard convention: plain Markdown, no required headings, injected into model context as "durable guidance" (instructional, not enforced). [github.com/openai/codex/blob/main/docs/agents_md.md](https://github.com/openai/codex/blob/main/docs/agents_md.md), [agents.md](https://agents.md/)
- Codex specifically implements a **hierarchical discovery** model: global → project-root → current-directory, with more-local files taking precedence — useful for monorepos wanting package-specific rules in nested directories, with an "override" variant for subdirectories that need wholesale-different conventions.
- Originally an OpenAI/Codex-pushed format; by 2026 it's been handed to the **Agentic AI Foundation** (a Linux Foundation-directed fund) for neutral multi-vendor governance — same spec, wider adoption (Codex, Amp, Google's Jules, Cursor, Factory all consume it).
- **Jun 11, 2026**: ChatGPT Business shipped a `/init` command specifically to generate an AGENTS.md scaffold for a repo.

### 6.4 Worktrees, parallel tasks, projects

- A **worktree** = an isolated git-worktree checkout sharing repo history but its own folder/branch/Codex session — the mechanism for running independent parallel agents on one repo without collisions. [openai.com/index/introducing-the-codex-app](https://openai.com/index/introducing-the-codex-app/), corroborated by multiple third-party guides
- Desktop app organizes agents into **projects → threads**, letting a user switch tasks without losing context.
- **Jul 23, 2026**: local **multi-folder projects** — a single Codex project can now span multiple related folders, with one designated primary folder for git operations.
- **Rate limits**: OpenAI doubled Codex rate limits across Plus/Pro/Business/Enterprise/Edu at one point in 2026 (exact date not pinned down in sources gathered — **UNVERIFIED** date), applying uniformly across app/CLI/IDE/cloud.
- Official usage-limits documentation is thin on specifics: it confirms usage "counts toward your agentic usage limit," varies by task size, and differs by plan, but explicitly punts numeric limits to a separate pricing page rather than stating them in the help article itself. [help.openai.com/en/articles/11369540, fetched via mirror]
- **Codex-specific seat type**: since **Apr 2, 2026**, orgs can buy Codex access as a flexible, credit-based seat independent of a full ChatGPT seat (and standard ChatGPT seat price dropped $5/mo as this decoupled).

### 6.5 Diff review, PR creation, code review

- Cloud tasks return a **reviewable diff**; can be merged locally or a PR can be created **directly from the cloud result** without pulling first — useful for tasks dispatched from Slack/GitHub issues. [developers.openai.com/codex/integrations/github](https://developers.openai.com/codex/integrations/github), corroborated by third-party walkthroughs
- **GitHub Actions "Codex Code Review"**: on repeat pushes to a PR, the action _resumes_ the prior review thread (caches an isolated Codex home, restores it, and scopes the new prompt to just the delta since the last-reviewed SHA) rather than re-reviewing the whole diff from scratch — genuine session-resume behavior at the CI level. [GitHub Marketplace listing](https://github.com/marketplace/actions/codex-code-review-actor)
- **Jul 9, 2026**: "GitHub PR Chat" added for reviewing pull requests conversationally.
- **Jul 30, 2026 (desktop 26.727)**: **multi-repository** diff review capability added — a single review session can span more than one repo.
- **Best-of-N**: `codex cloud exec --env ENV_ID --attempts 3 "..."` runs N independent attempts and returns the best one. [Verdent/Composio guides, cross-corroborated]
- IDE extension: in-editor diff review "beside your code," accept/request-changes inline, git checkpoints created before edits, and a documented workflow of "start locally, hand off the bigger task to Codex web, keep chat continuity while reviewing results." [learn.chatgpt.com/docs/codex/ide]

### 6.6 Local ↔ cloud handoff

- The stated design pattern across docs: iterate small edits locally in IDE/CLI, then **delegate** larger tasks to Codex cloud, with the same chat/thread continuity used to review what comes back — i.e., handoff is a first-class, documented workflow rather than a one-way export.
- **Aug 11, 2026**: Codex added an `/import` command and desktop-app import flow to **pull in setup from Claude Code, Claude Cowork, and Cursor** — explicit, named cross-competitor migration tooling, with "automatic sync capabilities" claimed. Notable that OpenAI is naming Anthropic and Cursor products directly in its own onboarding.

### 6.7 Notifications, remote control

- **May 14, 2026**: Codex remote access ships in the ChatGPT mobile app (preview) + non-interactive access tokens for scripts/schedulers ("trusted, non-interactive local workflows").
- **May 29, 2026**: **Remote Control GA** — authenticated one-to-one QR pairing between a mobile device and a host Mac, so a user can "stay connected to Codex work running on a host Mac" from iOS/Android, including continuing Windows-hosted workflows from mobile once Windows Computer Use landed (Jun 11, 2026).
- **UNVERIFIED**: granular push-notification settings (e.g., per-task-complete alerts, digest vs. instant) — not found in sources gathered; likely exists given Remote Control's premise but not documented in what was fetched.

### 6.8 Codex Security (formerly "Aardvark")

- Launched as a **research preview in March 2026**, for ChatGPT Pro/Enterprise/Business/Edu. [OpenAI — Codex Security research preview](https://openai.com/index/codex-security-now-in-research-preview/), [cybersecuritynews.com](https://cybersecuritynews.com/openai-launches-codex-security/)
- Pipeline: builds a natural-language model of how the target app works → hypothesizes vulnerabilities → **sandbox-tests exploits to rule out false positives** → ranks by severity/impact → proposes concrete patches with plain-language rationale.
- Also shipped a standalone **open-sourced Codex Security CLI**. [cybersecuritynews.com — CLI open-source](https://cybersecuritynews.com/openai-open-sources-codex-security-cli/)
- Related: **"Daybreak"** access tiers (Daybreak Blue = vulnerability discovery, Daybreak Red = authorized pen-testing) introduced **Aug 10, 2026**, gated behind a "Trusted Access" approval process — i.e., OpenAI is now explicitly gating offensive-security use of its own agent behind a vetting step.

---

## 7. Community complaints and regressions (Codex)

Pulled from GitHub issues on `openai/codex` and secondary aggregation of Reddit/community sentiment (direct Reddit fetch not available in this session; relying on a curated third-party compilation plus GitHub primary sources):

- **Usage/quota unpredictability is the dominant complaint theme** across mid-2026:
  - #26150 (Jun 3, 2026): monthly usage dropped from 80% to 0% after a small prompt.
  - #19607 (Apr 25, 2026): Plus-plan user hit "usage limit," told to upgrade or wait 3 days.
  - #30349 (Jun 27, 2026): CLI + desktop both reported "usage limit" while the account's own Plus dashboard showed quota remaining — client/server usage-state mismatch.
  - #26689 (Jun 5, 2026): "out of Codex messages" immediately post-update.
  - #26306 (Jun 4, 2026): 20.5M tokens burned in 2-3 hours of light work vs. 4.6M for a full prior day of heavy work — strongly suggests a burn-rate regression, not normal variance.
  - #31770 (Jul 9, 2026): Pro user hit rate limit after only ~3M tokens, far below expectation.
  - #36053 (Jul 30, 2026): open, unanswered as of fetch — request for OpenAI to publish real usage-metric distributions instead of a single "18% longer" marketing average after the Jul 29 Sol efficiency claim.
  - This pattern — opaque, plan-inconsistent, occasionally spiking token consumption with no per-request attribution — is the single most concrete, evidence-backed weakness found in this research pass. [github.com/openai/codex issues, individually cited above]
- **UX/workflow complaints** (lower-confidence, from a secondary aggregation site rather than primary Reddit fetch — treat as **weakly sourced**): inability to interrupt an in-flight Codex run once started (though parallel fire-and-forget agents are possible); users asking whether repo code uploaded to Codex cloud is used for training, saying they couldn't find a clear answer in the PR/task flow itself; Codex silently stripping "useless" comments as a side effect of a task, surprising users; complaints that Codex's syntax generation is stronger than its underlying logic/reasoning on harder problems. [chatgptdisaster.com compilation](https://chatgptdisaster.com/0623-reddit-user-testimonials-openai-codex-chatgpt-coding-raves-rage-real-quotes.html) — **this source is an aggregator, not primary Reddit; corroborate independently before citing as fact.**

---

## 8. Codex desktop-app consolidation (major structural change)

- **Jul 9, 2026**: Codex was **merged into the ChatGPT desktop app** (macOS/Windows) rather than remaining a standalone app — same release day as GPT-5.6/ChatGPT Work. [Wikipedia timeline](<https://en.wikipedia.org/wiki/OpenAI_Codex_(AI_agent)>), [releasebot.io Codex updates](https://releasebot.io/updates/openai/codex)
- Bundled alongside this: direct Markdown/code editing with inline annotations, GitHub PR Chat, and continued desktop feature velocity (browser history search, multi-repo review, image/Canvas editing view, Activity sidebar — Jul 30, 2026 build 26.727).
- **Aug 11, 2026**: Linux desktop preview (Ubuntu/Debian/Fedora, x64/ARM64) — Codex/ChatGPT desktop now targets all three major desktop OSes.
- Net effect: "Codex" as a brand now denotes both the coding agent and a chunk of the general ChatGPT desktop experience (Computer Use, browser automation, Voice, Activity/Computer History). The product boundary between "ChatGPT desktop app" and "Codex" is blurry by design as of Aug 2026 — worth flagging explicitly as a positioning/discoverability issue for anyone trying to describe "what Codex is" to a customer.

---

## 9. ChatGPT Atlas — being sunset

- Atlas (standalone AI browser) launched **Oct 2025**; as of **Jul 9, 2026** TechCrunch reports OpenAI is **sunsetting the standalone browser after less than a year**. [TechCrunch](https://techcrunch.com/2026/07/09/openai-is-shutting-down-atlas-but-its-ai-browser-ambitions-are-still-growing/)
- Replacement path is two-pronged, not one product:
  1. A new **ChatGPT Chrome extension** that reads the context of the page you're viewing, lets you ask questions or summarize.
  2. A **more robust ChatGPT desktop app browser surface** that can browse sites, log into accounts, download files, and interact with pages directly (i.e., agentic browsing folded into the desktop app rather than a separate browser).
- Stated rationale, per OpenAI: "the browser is a feature, not the destination" — echoes the earlier decision to shutter Sora (Mar 2026) after leadership pushed to cut "side quests."
- Prior to the shutdown decision, Atlas had been actively developed: vertical tabs (Nov 2025), then **Tab Groups** (Jan 2026) as a headline feature, continuous Agent Mode improvements. Agent Mode let it autonomously act on sites (e.g., grocery shopping) "under user supervision," gated to paid plans.
- **No exact shutdown date found** in sources gathered — TechCrunch's coverage describes the decision and direction but not a hard EOL date. **UNVERIFIED**: exact Atlas sunset date/whether it has already fully happened by 2026-08-15 or is still winding down.

---

## 10. Office / Google Workspace productivity integrations

| Integration                                             | Status                                                                                                                                                                                                                                                                                                                                                                                            | Source                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **ChatGPT for Excel** (+ Google Sheets)                 | **GA globally May 5-6, 2026**, powered by GPT-5.5 at GA (beta had used GPT-5.4); free preview through Jun 2, 2026, then credit-metered; sidebar for financial modeling, scenario analysis, data extraction/cleanup, natural-language spreadsheet edits. Available to Business/Enterprise/Edu/K-12 **and** consumer Free/Go/Plus/Pro.                                                              | [openai.com/index/chatgpt-for-excel](https://openai.com/index/chatgpt-for-excel/), release notes above                    |
| **ChatGPT for PowerPoint**                              | Official add-in, ~May 2026: drafts/edits real slides from a side panel, writes into native placeholders/shapes using template styles, rewrites titles, trims text, suggests chart placement.                                                                                                                                                                                                      | [usecarly.com PowerPoint integration](https://www.usecarly.com/blog/chatgpt-powerpoint-integration/)                      |
| **ChatGPT for Word**                                    | Official pane via AppSource, **requires Business/Enterprise account** (blockable by IT). Manual/prompt-driven only — **no event-based automation**: cannot trigger off document arrival, cannot email the result, cannot chain into calendar/CRM. Operates on selected text, not whole-document batch actions. This is a real, sourced capability gap vs. an "autonomous document agent" framing. | [usecarly.com Word integration](https://www.usecarly.com/blog/chatgpt-word-integration/)                                  |
| **ChatGPT for Intune**                                  | iOS/iPadOS app released **May 6, 2026** with Microsoft App Protection Policy support — an MDM-compliance integration, not a productivity feature per se.                                                                                                                                                                                                                                          | ChatGPT Enterprise release notes                                                                                          |
| **Google Workspace** (Gmail, Calendar, Drive, Contacts) | Beta, **off by default** for Enterprise/Edu; admin-managed setup via Google service-account key upload; write actions (draft email, create doc/sheet, schedule meeting) shipped **Mar 13, 2026**, off by default.                                                                                                                                                                                 | [Google Workspace Admin-Managed Setup](https://help.openai.com/en/articles/10929079-google-workspace-admin-managed-setup) |
| **ChatGPT Sites**                                       | Preview, **Jun 2, 2026** — ask Codex to build/deploy small full-stack JS/TS internal web apps with a hosted URL, workspace-internal access only.                                                                                                                                                                                                                                                  | ChatGPT Business release notes                                                                                            |

---

## 11. What's new in the last ~6 months (Feb–Aug 2026) — condensed

- ChatGPT Work launched as a third overlapping agent surface (alongside Workspace agents and Codex-as-general-agent).
- GPT-5.6 family (Sol/Terra/Luna) replaced GPT-5.4/5.5 as flagship, with an unresolved community dispute over real-world usage-efficiency claims.
- Codex absorbed Computer Use, browser automation, Voice, and general desktop-agent duties, then was structurally merged into the ChatGPT desktop app (Jul 9).
- Global Admin Console matured: tenant model, Analytics/Agents/Billing tabs, unified ChatGPT+Codex spend tracking, Cost API, per-group/user credit limits (culminating Jun 18).
- Apps/connectors ecosystem expanded fast (Slack actions, Outlook shared mailbox, unified Google Drive, write-actions-by-default-off, enterprise app templates) — but is reportedly consolidating from individual-user sync toward admin-managed-only sync in Aug 2026 (UNVERIFIED specifics).
- Company Knowledge shipped as the cross-app "ask your org's data" feature — web-only, no desktop/mobile support yet.
- Workspace Agents (distinct product from "ChatGPT Work") went GA May 22, 2026, with its own free-then-metered billing transition (Jul 6, 2026 cutover).
- Codex Security (ex-Aardvark) moved from research preview (Mar 2026) toward tiered, approval-gated offensive-security access (Daybreak Blue/Red, Aug 10, 2026).
- ChatGPT Atlas — the standalone browser bet — was reversed; capabilities redistributed into a Chrome extension and the desktop app (announced Jul 9, 2026, no confirmed hard shutdown date found).
- JetBrains support went from nonexistent to native (Jan 22, 2026), initially free-during-promo then credit-metered.
- Office suite coverage completed: Excel (GA May), PowerPoint (~May), Word (Business/Enterprise-gated pane) — Word notably still manual-only, no automation triggers.

## 12. What recently regressed / is fragile

- **Codex usage/quota metering**: multiple independently-filed GitHub issues over Apr–Jul 2026 describe erratic burn rates, client/server quota-state mismatches, and quota resets that don't match dashboard state. OpenAI's own Jul 29 "18% longer" fix announcement was itself immediately challenged for lacking verifiable per-request data (issue #36053, unanswered as of fetch).
- **App-sync individual→admin-managed migration** (Aug 2026, reported) risks breaking existing user-level connector setups in Enterprise/Edu — could not fully verify scope/date from primary sources; flagged as a likely near-term admin-facing disruption.
- **Atlas discontinuation**: a shipped, actively-updated consumer product (Tab Groups shipped Jan 2026) reversed within roughly 9 months of launch — a genuine strategy reversal, not a rumor.
- **One-way audit-log toggle**: enabling API-Platform audit logging cannot be turned back off without contacting OpenAI — an operational trap for an admin who enables it to test.
- **Sharing/visibility permission interaction bug-by-design**: disabling "view workspace members and groups" silently removes the ability to share GPTs/Projects/Chats, because recipient-picking depends on that same visibility.

---

## Sources

| URL                                                                                                                                                | What it supported                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes                                                                  | Enterprise/Edu release-notes chronology §3.9 (fetched via GitHub mirror after direct 403)          |
| https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes                                                                        | Business release-notes chronology §2, §3.9, §6.4, §10 (fetched via GitHub mirror after direct 403) |
| https://help.openai.com/en/articles/12289294-global-admin-console                                                                                  | Global Admin Console structure §3.1 (fetched via GitHub mirror)                                    |
| https://help.openai.com/en/articles/12628342-company-knowledge-in-chatgpt-business-enterprise-and-edu                                              | Company Knowledge §3.5 (fetched via GitHub mirror)                                                 |
| https://help.openai.com/en/articles/8265053-what-is-chatgpt-enterprise                                                                             | Enterprise feature list §3, §3.9 header (fetched via GitHub mirror)                                |
| https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan                                                                    | Codex usage-limit documentation gaps §6.4 (fetched via GitHub mirror)                              |
| https://learn.chatgpt.com/docs/changelog                                                                                                           | Codex CLI/cloud changelog Feb-Aug 2026 §6.1-6.7                                                    |
| https://learn.chatgpt.com/docs/models                                                                                                              | Codex model list, reasoning effort tiers, deprecations §5                                          |
| https://learn.chatgpt.com/docs/codex/ide                                                                                                           | IDE extension features §6.5                                                                        |
| https://intuitionlabs.ai/articles/chatgpt-enterprise-admin-controls-security                                                                       | Admin console detail: SSO, SCIM, RBAC, retention, EKM §3.2-3.3, §3.8                               |
| https://enterprisedna.co/resources/news/openai-chatgpt-enterprise-spend-controls-analytics-june-2026/                                              | Jun 18, 2026 spend-controls/Cost API detail §3.7                                                   |
| https://openai.com/index/chatgpt-enterprise-spend-controls/                                                                                        | Referenced/title-confirmed; body blocked (403) §3.7                                                |
| https://www.hungyichen.com/en/insights/chatgpt-enterprise-guide                                                                                    | Business pricing baseline §1                                                                       |
| https://finance.yahoo.com/technology/article/openai-announces-premium-business-pricing-as-it-seeks-to-increase-revenue-ahead-of-ipo-184654495.html | Business Premium seat pricing/date §1                                                              |
| https://www.bloomberg.com/news/articles/2026-07-09/openai-unveils-chatgpt-work-agent-to-field-tasks-for-hours                                      | ChatGPT Work launch overview §2                                                                    |
| https://www.bnnbloomberg.ca/business/artificial-intelligence/2026/07/09/openai-launches-chatgpt-work/                                              | ChatGPT Work launch details, model, rollout order §2 (direct fetch)                                |
| https://www.digitalapplied.com/blog/chatgpt-work-openai-agent-launch-2026                                                                          | ChatGPT Work capabilities, pricing structure, criticisms §2 (direct fetch)                         |
| https://techcrunch.com/2026/07/09/openai-is-shutting-down-atlas-but-its-ai-browser-ambitions-are-still-growing/                                    | Atlas sunset decision, replacement plan, rationale §9 (direct fetch)                               |
| https://en.wikipedia.org/wiki/ChatGPT_Atlas                                                                                                        | Atlas feature timeline pre-shutdown §9                                                             |
| https://en.wikipedia.org/wiki/OpenAI_Codex_(AI_agent)                                                                                              | Codex full timeline 2025-2026, model/IDE milestones §4, §8 (direct fetch)                          |
| https://github.com/openai/codex                                                                                                                    | Codex CLI README: platforms, install, license, stars §4 (direct fetch)                             |
| https://github.com/openai/codex/issues/36053                                                                                                       | Sol usage-efficiency dispute, unanswered as of fetch §5, §7 (direct fetch)                         |
| https://github.com/openai/codex/issues/26150, /19607, /30349, /26689, /26306, /31770                                                               | Codex usage-limit/quota complaint pattern §7                                                       |
| https://chatgptdisaster.com/0623-reddit-user-testimonials-openai-codex-chatgpt-coding-raves-rage-real-quotes.html                                  | Secondary Reddit-sentiment aggregation §7 (weak source, flagged)                                   |
| https://openai.com/index/introducing-the-codex-app/                                                                                                | Worktrees, parallel-agent projects §6.4                                                            |
| https://developers.openai.com/codex/integrations/github                                                                                            | Cloud task → PR creation, diff review flow §6.5                                                    |
| https://github.com/marketplace/actions/codex-code-review-actor                                                                                     | GitHub Action session-resume-on-push behavior §6.5                                                 |
| https://developers.openai.com/codex/mcp (→ resolves under learn.chatgpt.com)                                                                       | MCP config format, trust model §6.2                                                                |
| https://github.com/openai/codex/blob/main/docs/agents_md.md                                                                                        | AGENTS.md spec/hierarchy in Codex §6.3                                                             |
| https://agents.md/                                                                                                                                 | AGENTS.md standard, Agentic AI Foundation governance §6.3                                          |
| https://blog.jetbrains.com/ai/2026/01/codex-in-jetbrains-ides/                                                                                     | JetBrains Codex integration announcement, IDEs, pricing, auth options §4 (direct fetch)            |
| https://releasebot.io/updates/openai/codex                                                                                                         | Jun-Aug 2026 Codex point-release detail §6, §8 (direct fetch)                                      |
| https://openai.com/index/codex-security-now-in-research-preview/                                                                                   | Codex Security launch, mechanism §6.8                                                              |
| https://cybersecuritynews.com/openai-launches-codex-security/ ; /openai-open-sources-codex-security-cli/                                           | Codex Security details, open-sourced CLI §6.8                                                      |
| https://openai.com/index/chatgpt-for-excel/                                                                                                        | ChatGPT for Excel GA details §10                                                                   |
| https://www.usecarly.com/blog/chatgpt-word-integration/                                                                                            | Word integration capability/limitation detail §10 (direct fetch)                                   |
| https://www.usecarly.com/blog/chatgpt-powerpoint-integration/                                                                                      | PowerPoint integration detail §10                                                                  |
| https://help.openai.com/en/articles/10929079-google-workspace-admin-managed-setup                                                                  | Google Workspace admin-managed connector setup §3.4, §10                                           |
| https://academy.openai.com/public/clubs/admins-6o6xf/resources/scim ; https://help.openai.com/en/articles/10011769-scim-integration-faq            | SCIM provider support, Enterprise-only scoping §3.2                                                |

### Sourcing caveats

- `help.openai.com` blocked direct WebFetch with HTTP 403 for essentially every article tried in this session; most help-center content above was retrieved through a third-party GitHub mirror (`ai-native-engineer/openai-mirror`) of those same pages. That mirror could lag or diverge from the live article — treat help-center-sourced content as **secondary reproduction**, not a live-page read, and re-verify before using in a customer-facing comparison.
- `r.jina.ai` reader proxy required auth (401) in this session and could not be used as a 403 workaround for a couple of pages (Compliance API vs. Analytics article, full Enterprise spend-controls blog post) — those two items are marked accordingly above.
- WebSearch quota was exhausted mid-session (200/200 calls used); remaining research relied on WebFetch against URLs already surfaced. Some intended queries (Codex notification granularity, exact Atlas EOL date, exact Aug-2026 app-sync migration date/scope) were not completed and are explicitly marked UNVERIFIED rather than guessed.
