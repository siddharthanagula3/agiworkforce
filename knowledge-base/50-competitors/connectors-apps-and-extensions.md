---
id: "COMP-connectors-apps-and-extensions"
type: "competitor-trace"
title: "Connectors, apps, plugins and skills"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Connectors, apps, plugins and skills: competitors to requirements

Claude and ChatGPT both document a connector directory, custom MCP connectors, per-action approvals, skills, plugins and admin controls. ChatGPT has retired custom GPTs in favour of plugins. AGI has most pieces on Web and Desktop, but outside connectors are gated "Coming soon" except 13 named ones. Gaps: custom assistants, multi-account (owner chose one account), tunnels, add-ins, mobile plugins. A person has seen only the Free upgrade path work.

**How the products divide this topic.** Claude (chat product, support.claude.com): connectors directory, custom remote MCP connectors, Google and Microsoft 365 connectors, interactive connectors, skills, plugins, org marketplaces. Claude Code (code.claude.com) is the separate coding tool: MCP via claude mcp add and .mcp.json with local, project and user scopes, /plugin, SKILL.md, managed MCP. It connects to the chat product by one-way sync of account skills, plugins and connectors (v2.1.273 and later, signed-in account only). ChatGPT (help.openai.com, chatgpt.com/pricing): apps now called plugins in Settings > Plugins, permission levels, custom MCP, skills, plugin directory, custom GPTs being retired (11 Dec 2026). Codex (learn.chatgpt.com) is the separate coding tool: skills in .agents/skills, app-server apps and marketplaces; it shares the plugin directory with ChatGPT. Plan limits: ChatGPT custom MCP with writes is web-only for Business and Enterprise/Edu; Pro is read/fetch only; Free and Go cannot create plugins or use plugin extensions; Claude Free gets one custom connector; skill sharing, org marketplaces and scanning are Team/Enterprise. ChatGPT skills plan scope differs between pricing page (all individual plans) and the skills help page (Business/Enterprise/Edu/Healthcare). Catalogue rows are from 2026-11-22 pages; review date 2026-11-22.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-connectors-apps-and-extensions-01](#cap-connectors-apps-and-extensions-01) | Connector directory with search, categories and detail | yes | yes | partly built | seen failing by a person |
| [CAP-connectors-apps-and-extensions-02](#cap-connectors-apps-and-extensions-02) | Plan, release and admin gating of connectors | partly | yes | partly built | seen working by a person |
| [CAP-connectors-apps-and-extensions-03](#cap-connectors-apps-and-extensions-03) | Connect an outside app with the user's own sign-in | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-04](#cap-connectors-apps-and-extensions-04) | Google Workspace connectors | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-05](#cap-connectors-apps-and-extensions-05) | Microsoft 365 connectors | yes | yes | partly built | code inspected only |
| [CAP-connectors-apps-and-extensions-06](#cap-connectors-apps-and-extensions-06) | GitHub and developer-tool connectors | yes | yes | partly built | seen failing by a person |
| [CAP-connectors-apps-and-extensions-07](#cap-connectors-apps-and-extensions-07) | Custom connectors through a remote MCP server | yes | partly | partly built | not verified |
| [CAP-connectors-apps-and-extensions-08](#cap-connectors-apps-and-extensions-08) | Custom connector sign-in choices | yes | partly | partly built | code inspected only |
| [CAP-connectors-apps-and-extensions-09](#cap-connectors-apps-and-extensions-09) | Reach private-network MCP servers | partly | yes | not built | not verified |
| [CAP-connectors-apps-and-extensions-10](#cap-connectors-apps-and-extensions-10) | Per-chat connector toggles and tool access mode | yes | partly | built | code inspected only |
| [CAP-connectors-apps-and-extensions-11](#cap-connectors-apps-and-extensions-11) | Approval and per-tool permission for connector actions | yes | yes | partly built | code inspected only |
| [CAP-connectors-apps-and-extensions-12](#cap-connectors-apps-and-extensions-12) | Admin controls over connectors and MCP servers | yes | yes | partly built | code inspected only |
| [CAP-connectors-apps-and-extensions-13](#cap-connectors-apps-and-extensions-13) | More than one account per connector | unknown | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-14](#cap-connectors-apps-and-extensions-14) | Interactive connector apps inside chat | yes | yes | partly built | code inspected only |
| [CAP-connectors-apps-and-extensions-15](#cap-connectors-apps-and-extensions-15) | @ mention and proactive suggestion of connected apps | yes | yes | partly built | code inspected only |
| [CAP-connectors-apps-and-extensions-16](#cap-connectors-apps-and-extensions-16) | Connected apps inside other features | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-17](#cap-connectors-apps-and-extensions-17) | Local MCP servers and desktop extensions | yes | partly | partly built | not verified |
| [CAP-connectors-apps-and-extensions-18](#cap-connectors-apps-and-extensions-18) | Skills: create, upload, enable and delete | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-19](#cap-connectors-apps-and-extensions-19) | Skill invocation: by name and automatic | yes | yes | built | code inspected only |
| [CAP-connectors-apps-and-extensions-20](#cap-connectors-apps-and-extensions-20) | Create a skill from a conversation, recording or template | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-21](#cap-connectors-apps-and-extensions-21) | Share and publish skills to teammates | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-22](#cap-connectors-apps-and-extensions-22) | Security scan of skills and plugins | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-23](#cap-connectors-apps-and-extensions-23) | Plugins: bundles of skills, connectors and commands | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-24](#cap-connectors-apps-and-extensions-24) | Plugin marketplaces and admin distribution | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-25](#cap-connectors-apps-and-extensions-25) | Build a plugin by conversation | yes | yes | built | not verified |
| [CAP-connectors-apps-and-extensions-26](#cap-connectors-apps-and-extensions-26) | Coding-tool MCP, plugin and skill configuration (CLI, VS Code) | yes | yes | partly built | code inspected only |
| [CAP-connectors-apps-and-extensions-27](#cap-connectors-apps-and-extensions-27) | Account sync of skills, plugins and connectors into the coding tool | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-28](#cap-connectors-apps-and-extensions-28) | Custom assistants (custom GPTs) and migration to plugins | unknown | partly | partly built | not verified |
| [CAP-connectors-apps-and-extensions-29](#cap-connectors-apps-and-extensions-29) | Partner and role plugin packs | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-30](#cap-connectors-apps-and-extensions-30) | Publisher submission and directory safety policy | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-31](#cap-connectors-apps-and-extensions-31) | Connect the assistant inside other apps (add-ins, Slack, Teams) | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-32](#cap-connectors-apps-and-extensions-32) | Health and bank account connections | yes | yes | partly built | not verified |
| [CAP-connectors-apps-and-extensions-33](#cap-connectors-apps-and-extensions-33) | Developer mode and Apps SDK for building connectors | partly | yes | partly built | not verified |

## CAP-connectors-apps-and-extensions-01 Connector directory with search, categories and detail

A browsable list of outside apps a user can connect, with details, state and tools.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities): Browse connectors from the plus menu or Customize > Connectors; mobile install in beta Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001256-plugins-in-chatgpt](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt): Sidebar Plugins page with Popular, New and Noteworthy, Public, Your workspace, Personal, Installed views Plans: All plans. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 16.7 (Directory, Search, Categories, Connected list, Details)). A signed-in user can browse, search and filter connectors, open a detail page showing publisher, operations and read or write scope, and see why one is unavailable (plan, admin, release state).

**With different models, providers and the one subscription.** Directory is model independent. Availability follows the one AGI Subscription entitlement (billing-catalog connectors paid tiers). In Local mode the directory may be browsed but connecting is blocked with a stated reason, because tokens live in the cloud.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile have it; CLI and Chrome have none (CLI uses MCP); VS Code has a cloud connectors list. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S55.01, S55.02, S55.03, S55.04, S55.05, S98.01
- Comparison list ids: MP66, WP165
- Code: `apps/web/features/directory/services/connectors-directory.ts:367`; `apps/web/app/api/connectors/directory/route.ts:115`; `apps/mobile/src/features/settings/cloud-connectors/index.tsx:44`; `apps/web/lib/connectors/catalog.ts:152`

**Gap.** Comparison marks web Partial. Persistent 'directory is still being indexed' banner and empty Connected tab text seen in the browser (6-defects). Add menu has one item that repeats Browse.

**Acceptance criteria**

1. Open Settings > Connectors: search 'notion' returns Notion and the list filters to it
2. Open one entry: publisher, operations and read or write scope are shown
3. Connected tab with nothing connected says nothing is connected, not 'Nothing matches these filters'
4. Search while offline shows an offline message

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv W-17: Empty Connected tab wording, offline search silent, permanent indexing banner

## CAP-connectors-apps-and-extensions-02 Plan, release and admin gating of connectors

Which connectors a person can use depends on plan, release state and admin approval, and the directory says which.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10166901-use-google-workspace-connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors): All plans, but Team/Enterprise owner must enable first Plans: All plans; owner enables on Team/Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001497-troubleshooting-plugins-and-apps-in-chatgpt](https://help.openai.com/en/articles/20001497-troubleshooting-plugins-and-apps-in-chatgpt): Directory shows statuses like Not available on your plan, Admin approval required, Requires workspace setup, Desktop only (row oh06:44 in catalogue; page listed under help.openai.com plugins troubleshooting) Plans: Varies by plan, region, workspace. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (owner decision 2026-10-22: connectors paid plans only; CONNECTOR_RELEASE_STATE) and memory note Free usage = Upgrade only). Every unavailable connector shows the exact reason. Free sees one Upgrade path with no meters. Connectors stay Coming soon until the release state is released, except the named released ids.

**With different models, providers and the one subscription.** Gate is read from the AGI Subscription entitlement, never from the model or provider. Same decision on every app. Local mode unaffected by plan because no connector call happens.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web gates: Free sees plan message; paid sees 74 of 87 connectors 'Coming soon' and 13 'Needs setup'. Mobile and Desktop share the contract. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S98.01
- Comparison list ids: WP180
- Code: `packages/contracts/types/src/connector-release.ts:14`; `packages/contracts/types/src/connector-release.ts:16`; `packages/contracts/types/src/billing-catalog.ts:351`

**Gap.** Release state is coming_soon, so only 13 ids can connect. Comparison WP180 lacks admin-approval and desktop-only messages. Notion detail leaks an environment variable name to the user.

**Acceptance criteria**

1. Free: + > Connectors > Browse shows 'Your plan does not include Connectors' and one Upgrade button
2. Paid: a coming-soon connector is disabled and says why
3. Notion detail never shows a server variable name
4. Free chat asking for Drive says connectors need a paid plan

**Verification: seen working by a person.** scorecards/web.csv W-17 free: Free upgrade path correct (partial overall); W-17 subscribed: blocked, no connect reachable; defect: env var name leak and Free chat reply does not name the plan

## CAP-connectors-apps-and-extensions-03 Connect an outside app with the user's own sign-in

A user authorizes a service with OAuth or a key and the assistant only reaches what that person can reach.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities): Connectors inherit the signed-in person's permissions Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): Install plugin or connect app through provider authorization flow in Settings > Plugins Plans: Varies by plan, region, workspace. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 16.7 (OAuth/custom auth, Disconnect/uninstall) and experience-contract.md (remote connection stays with the Cloud account)). Connect starts the real provider consent flow, stores the grant server-side, shows granted scopes and health, and supports reconnect, disconnect and revoke.

**With different models, providers and the one subscription.** Grant is per account, not per model. Calls count against the AGI Subscription. Local mode never receives or uses the token; a move to Cloud is an explicit fork.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, CLI done in code for the 13 released connectors; others coming soon. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S55.07, S55.08, S55.09, S55.17, S55.18, S55.20, S55.22, S55.23, S98.03, S98.04, S98.05, S98.06
- Comparison list ids: W211, W212, WP164
- Code: `apps/web/app/api/connectors/oauth/start/route.ts:261`; `apps/web/app/api/connectors/oauth/callback/route.ts:153`; `apps/mobile/services/connectors.ts:69`; `apps/web/lib/connectors/catalog.ts:152`

**Gap.** Gmail, Drive, Calendar, Microsoft 365 and GitHub are gated or unconfigured (GitHub App missing on the test machine). Reconnect shown as partial on web and desktop. Owner-signed vendor items pending.

**Acceptance criteria**

1. Connect Notion: provider consent page opens and the returned grant shows as Connected
2. Decline consent: connector stays not connected with a plain message
3. Disconnect: later chat cannot read the service
4. Expired grant shows Reconnect next to Disconnect

**Verification: not verified.** W-17 subscribed blocked before any outside sign-in; W-18 blocked (no GitHub App). Code inspected only.

## CAP-connectors-apps-and-extensions-04 Google Workspace connectors

Gmail, Calendar and Drive connected for search, drafting and actions with citations.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10166901-use-google-workspace-connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors): Search, draft and act on Gmail, Calendar, Drive; send, share, move asks approval outside Auto mode Plans: All plans. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): Google apps need every permission approved; Docs, Sheets, Slides actions come through the Google Drive app (rows oh06:35, oh02:138) Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-08 (Gmail send, reply and forward after approval every time)). Gmail, Calendar and Drive connect read and write, with an approval every time for send, share, move or delete.

**With different models, providers and the one subscription.** Works with any model that can call tools; calls metered under the one subscription. Not available in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Code exists for web, desktop and mobile; connectors are Coming soon on every plan. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S56.01, S56.03, S56.04, S56.07, S56.09, S56.13, S56.16
- Comparison list ids: W211
- Code: `packages/contracts/types/src/connector-release.ts:16`; `apps/web/lib/connectors/catalog.ts:152`

**Gap.** Not released. Ledger email and calendar rows are partial on web, desktop and mobile.

**Acceptance criteria**

1. Ask for the latest mail from a named sender: answer cites the message
2. Ask to send a mail: an approval card appears and nothing sends until Allow
3. Turn the Gmail connector off for one chat: it is not used

**Verification: not verified.** W-17 subscribed: Google apps locked Coming soon

## CAP-connectors-apps-and-extensions-05 Microsoft 365 connectors

Outlook, OneDrive, SharePoint and Teams connected with the user's own permissions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12542951-set-up-the-microsoft-365-connector](https://support.claude.com/en/articles/12542951-set-up-the-microsoft-365-connector): Search work data with each user's permissions; read-only by default; writes ask to confirm Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): SharePoint, Teams, Outlook apps; guest connection by tenant ID (rows oh02:199, oh03:34, oh06:45) Plans: Varies. Apps: web.

**AGI requirement** (inferred; source: competitor parity; D-2026-09-28-08 builds connectors the leaders ship). Connect Microsoft 365 with admin-controlled read and write tools, confirmation for sends, and a stated limit on file types.

**With different models, providers and the one subscription.** Model independent; metered under the subscription; unavailable in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has Graph client and Teams actions; Outlook shared mailboxes, personal accounts, guest tenant, OneNote, transcripts missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S56.01, S56.07, S56.17, S56.21
- Comparison list ids: W212, W215, W218, W226, W227, W242, WP187
- Code: `apps/web/lib/connectors/microsoft-graph.ts:512`; `apps/web/lib/connectors/microsoft-graph.ts:643`

**Gap.** Gated Coming soon; many sub-features missing per comparison.

**Acceptance criteria**

1. Connect a work account: Outlook search returns a known mail
2. Ask to post to Teams: approval card first
3. Unsupported file type (OneNote) gives a plain explanation

**Verification: code inspected only.** No person has connected Microsoft 365

## CAP-connectors-apps-and-extensions-06 GitHub and developer-tool connectors

Repository, issue and ticket tools connected to chat or coding sessions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10167454-use-the-github-integration](https://support.claude.com/en/articles/10167454-use-the-github-integration): Add from GitHub picks files for context; private repos need the Claude GitHub App Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt): GitHub connector with live read-only repo access, no synced index Apps: web.

**AGI requirement** (inferred; source: competitor parity). GitHub and issue-tracker connectors let the assistant read repositories and tickets, and write only after approval.

**With different models, providers and the one subscription.** Any model with tool calling; metered under subscription; code-surface sessions follow the host developer domain, not the cloud connector.

**Current implementation, as this trace read it on 2026-11-24: partly built.** 13 selectively released connectors (Notion, Linear, Jira and others) show Needs setup; GitHub App not configured on the tested deployment. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S56.25, S56.26, S56.31, S56.32, S56.33
- Comparison list ids: W210, W230, W258, WP164
- Code: `packages/contracts/types/src/connector-release.ts:14`; `apps/web/features/code/code-surface.ts:31`

**Gap.** GitHub Enterprise host, GitLab, repo sync into projects missing; OAuth redirect setup missing on test deployment.

**Acceptance criteria**

1. Pick a repo in the picker and ask about a file
2. A write (create issue) waits for approval
3. Disconnect removes repo access

**Verification: seen failing by a person.** W-18 subscribed blocked: 'GitHub is not configured. This deployment has no GitHub App'; setup limit, not tested against a real repo

## CAP-connectors-apps-and-extensions-07 Custom connectors through a remote MCP server

A user or admin adds their own MCP server by URL and the assistant can use its tools.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): Customize > Connectors > Add > Custom; Free limited to one; reached from Anthropic cloud on port 443 Plans: All plans (Free: one). Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt): Plugins > Add custom MCP server; full write support web-only for Business and Enterprise/Edu; Pro read/fetch only; not on mobile Plans: Pro (read), Business, Enterprise, Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md (owner decision 2026-10-22: custom MCP servers come with paid plans) and requirements.md 16.7 MCP servers). Paid users add a remote MCP server by URL with optional credentials; the count is capped by plan; discovered tools are reviewed before use; a failing server shows its reason.

**With different models, providers and the one subscription.** Plan caps in billing-catalog customMcpServers. Tool calls are routed per model through one MCP client, so any provider with tool calling works. Custom remote servers are Cloud-boundary; Local mode cannot call them without an explicit fork.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, CLI add remote servers; VS Code and Chrome do not. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S58.01, S58.03, S58.06, S58.07, S58.08, S58.12, S98.12
- Comparison list ids: W208, W233
- Code: `apps/web/app/api/connectors/custom/route.ts:108`; `apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx`; `packages/contracts/types/src/billing-catalog.ts:526`; `crates/agiworkforce-mcp/src/client.rs:286`

**Gap.** Comparison marks web Missing for custom connector flow in the released product; edit means remove and re-add (owner decision). VS Code add-server missing.

**Acceptance criteria**

1. Add a public HTTPS MCP URL: tools are listed and a test call works
2. Add beyond the plan cap: refused with the cap named
3. Remove the server: its tools vanish from the next chat
4. Unreachable URL shows a clear failure

**Verification: not verified.** No scorecard or defect covers custom MCP add

## CAP-connectors-apps-and-extensions-08 Custom connector sign-in choices

Choice of OAuth client identity, dynamic registration, fixed headers or no sign-in for a custom server.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): Sign in now, when needed or no sign in; published identity, automatic registration or own client; fixed headers Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt): Custom MCP form asks for endpoint and authentication plus a risk acknowledgement Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity; definition.md says secrets stay in the OS credential store on host surfaces). Custom servers support OAuth with metadata discovery or dynamic registration, fixed header keys, and no-auth, with secrets stored in the credential store.

**With different models, providers and the one subscription.** Independent of model. Credentials never go to a model provider.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop reports same (MCP sign-in by client metadata or registration); web comparison Missing for the choice screen. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S55.09, S58.06
- Comparison list ids: W233
- Code: `apps/web/lib/connectors/mcp-discovery.ts:53`; `crates/agiworkforce-mcp/src/oauth/flow.rs:432`

**Gap.** No sign-in-timing choice (now, when needed, none) in the web form.

**Acceptance criteria**

1. Add a server that requires OAuth: sign in completes
2. Add a server that needs an API key header: key stored hidden, never shown again
3. Server needing no sign-in connects without a prompt

**Verification: code inspected only.** comparison rows W233 and desktop row from code reading

## CAP-connectors-apps-and-extensions-09 Reach private-network MCP servers

A tunnel or allowed address range so a cloud assistant can reach a server not on the public internet.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): Server must be public on HTTPS 443 or allowlist Anthropic IP ranges; local desktop servers are separate Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt): Secure MCP Tunnel for private servers without public exposure Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 6 explicit execution boundaries). A private-network server is reachable only through a tunnel or published IP list, and the screen says which machine the data leaves.

**With different models, providers and the one subscription.** Tunnel traffic is the tool call, model independent. Local mode keeps servers on the device and does not use the tunnel.

**Current implementation, as this trace read it on 2026-11-24: not built.** Ledger S58.16 and S98.15 missing on web, desktop, mobile; CLI done for local servers. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S55.32, S58.16, S98.15
- Comparison list ids: W247
- Code: `searched: mcp tunnel, secure tunnel in apps/web/lib/connectors (comparison W247)` (not found)

**Gap.** No tunnel or published egress range feature.

**Acceptance criteria**

1. Admin sets up a tunnel to an internal server and a test call succeeds
2. Without it the screen explains the server must be public or use the tunnel

**Verification: not verified.** Code reading only

## CAP-connectors-apps-and-extensions-10 Per-chat connector toggles and tool access mode

Switch each connector on or off for one chat, and choose whether tools load all at once or on demand.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities): Plus > Connectors toggles per conversation; Tool access Auto or On demand, suggested for ten or more Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): Invoke apps with @ or the plus menu; selection is per message (row oh03:43) Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 16.6 (Tool access mode, Load tools when needed)). Each connector can be switched off for one chat, and a tool access setting limits context cost when many are connected.

**With different models, providers and the one subscription.** Loading mode applies to any model; smaller context models should default to on demand. No effect in Local mode with no connectors.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, Mobile, CLI, VS Code have it; Desktop shares the web UI. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S53.17, S57.28, S57.29
- Comparison list ids: none matched
- Code: `apps/web/features/settings/sections/CapabilitiesSection.tsx:26`; `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1420`; `apps/mobile/src/features/settings/capabilities/index.tsx:396`

**Gap.** none known

**Acceptance criteria**

1. Turn a connector off in + > Connectors: next answer cannot use it
2. Set On demand: with ten connectors, a request loads only the needed one
3. Setting is the same on web and mobile

**Verification: code inspected only.** Comparison rows say Same; no scorecard

## CAP-connectors-apps-and-extensions-11 Approval and per-tool permission for connector actions

The assistant asks before it sends, books, buys or changes things, and users can set allow, ask or block per tool.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities): Always ask before using a connector tool; confirm before booking or buying (row ch04:86) Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt](https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt): Levels Always ask, Allow read, Allow low-risk, Allow all; approval card Deny, Allow once, Allow low-risk, Always allow; per account override Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 9.7 (External connector writes need approval) and 16.7 (Per-tool permissions)). External connector writes always ask first; per-tool allow, ask or block; the approval card names the action and the connected account.

**With different models, providers and the one subscription.** Policy is enforced server-side, so a prompt injected into any model cannot skip it. Same approval contract on every app. Local actions follow device approvals.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop built; Mobile partial; per-account override missing on web and mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S55.27, S57.27, S57.31
- Comparison list ids: M131, MP61, MP63, MP65, W245, WP162, WP173
- Code: `apps/web/features/connectors/components/ToolPermissionsPanel.tsx:83`; `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx:60`; `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:35`; `packages/contracts/types/src/tool-approval-policy.ts:61`

**Gap.** No 'allow all for one plugin' on web, no per-account override with reset, mobile approval card partial.

**Acceptance criteria**

1. Ask to send a mail: card shows Deny, Allow once, Allow for this chat, Always allow
2. Set a tool to Block: assistant says it cannot use it
3. Mobile shows the same card

**Verification: code inspected only.** No scorecard on approvals for connectors

## CAP-connectors-apps-and-extensions-12 Admin controls over connectors and MCP servers

Org admins allow or block connectors, set per-role tool permissions, and manage shared connections.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13930458-set-up-role-based-permissions-on-enterprise-plans](https://support.claude.com/en/articles/13930458-set-up-role-based-permissions-on-enterprise-plans): Per-role tool permissions and individual or managed authorization per connector Plans: Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/15537633-auto-connect-your-organization-s-apps-to-claude](https://support.claude.com/en/articles/15537633-auto-connect-your-organization-s-apps-to-claude): About 21 connectors provision through enterprise-managed auth Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps): Admins enable apps by role, choose allowed actions, refresh custom MCP tool lists Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md 16.7 (Admin/policy controls where applicable)). Admins can allow and block connectors and MCP servers, set read-only or custom actions per role, and let members use an admin-held connection without holding the credential.

**With different models, providers and the one subscription.** Policy sits in the shared server, applies to every model and provider. Team and Enterprise entitlements from the one subscription decide who sees it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web workspace console built; Desktop shares it; CLI admin allow and deny partial; Mobile N/A. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S55.11, S58.15, S98.01
- Comparison list ids: C294, CP186, VP52, W264, WP163, WP172, WP174
- Code: `apps/web/lib/services/connector-policy-service.ts:24`; `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx`; `apps/cli/src/cloud/workspace_policy.rs:414`

**Gap.** Comparison marks admin-provided MCP servers in CLI and workspace connection W264 missing; no approval-request flow by member (owner declined).

**Acceptance criteria**

1. Admin blocks a connector: member sees 'Admin approval required'
2. Admin sets Jira to search only: create is refused
3. Member uses an admin-held connection without signing in

**Verification: code inspected only.** Comparison rows; no scorecard

## CAP-connectors-apps-and-extensions-13 More than one account per connector

Connecting several accounts of one app (for example two Slack workspaces) and choosing which is used.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12525822-using-slack-in-chatgpt](https://help.openai.com/en/articles/12525822-using-slack-in-chatgpt): Settings > Plugins > Slack > Connect another account authorizes additional workspaces (catalogue row oh03:26) Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Multiple connected identities)). Where a provider supports it, a user can connect several accounts, see which is selected, and revoke each; experience contract requires convergence across Cloud surfaces.

**With different models, providers and the one subscription.** Account choice is a connector matter, independent of model. Cloud only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Platform multi-account selection done; account summary exists on web; mobile partial; ledger rows say not applicable by owner decision of 2026-09-27 (one account per connector). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S55.12, S55.15, S55.16, S98.11
- Comparison list ids: MP70, WP188
- Code: `apps/web/lib/connectors/accounts.ts:2`; `apps/web/features/connectors/components/ConnectorAccountSummary.tsx:27`; `docs/decisions/2026-09-27-founder-decisions.md:90`

**Gap.** Owner decision (one account per connector) conflicts with experience-contract.md and with ChatGPT documentation; per-task account choice missing everywhere.

**Acceptance criteria**

1. Connect a second account: both listed with names
2. Pick the account for one message
3. Disconnect one: the other still works

**Verification: not verified.** Not tested by a person

## CAP-connectors-apps-and-extensions-14 Interactive connector apps inside chat

A connector returns a live panel (board, chart, design view) shown inline, in a side panel or full screen.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude): Inline card, side panel or full screen with chat input still open; sandboxed iframe Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12515353-building-with-the-apps-sdk](https://help.openai.com/en/articles/12515353-building-with-the-apps-sdk): Apps SDK on MCP defines app logic and UI inside ChatGPT (catalogue row oh03:22) Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). A tool result that ships an MCP App renders in a sandbox with host-to-widget state, widget-to-host actions and viewer-specific authorization.

**With different models, providers and the one subscription.** Rendering is host side, independent of model. Widgets obey the same approvals and metering. Not in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop built; Mobile has interactive cards per comparison but ledger says missing; VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S58.17, S58.18, S58.19, S58.20, S58.21, S58.22, S58.23, S98.16
- Comparison list ids: W243, WP167, WP184
- Code: `apps/web/features/chat/components/messages/cards/McpAppCard.tsx:301`; `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1105`

**Gap.** Side panel and sidebar pinning missing; ledger and comparison disagree on mobile.

**Acceptance criteria**

1. A connector returning an app shows a card in chat
2. Expand to full screen with the composer still usable
3. A widget action asks approval

**Verification: code inspected only.** Code and comparison only

## CAP-connectors-apps-and-extensions-15 @ mention and proactive suggestion of connected apps

Pick an app or plugin with @, or have the assistant offer a connected app when relevant.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/14730684-how-claude-suggests-connected-apps](https://support.claude.com/en/articles/14730684-how-claude-suggests-connected-apps): Claude brings up a connected app unprompted when context fits Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): Mention an app or plugin with @ or from the plus menu Apps: web.

**AGI requirement** (inferred; source: competitor parity). @ lists apps, skills and connectors; the assistant may propose a connected app but never uses it without the user's connection and approvals.

**With different models, providers and the one subscription.** Suggestion logic is host-side so it works with any model. Never promotes a Local chat to Cloud connectors.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web @ built; suggestions partial on web and mobile; Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S53.17
- Comparison list ids: MP64, W257, WP197, X18
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2898`; `apps/web/features/chat/components/NewChat/NewChatConnectorSuggestions.tsx:36`

**Gap.** Suggestion cards for plugins missing.

**Acceptance criteria**

1. Type @ and pick Notion: the message uses it
2. A fitting request surfaces an offer for a connected app

**Verification: code inspected only.** Comparison only

## CAP-connectors-apps-and-extensions-16 Connected apps inside other features

Deep research, scheduled tasks, artifacts, projects and sites can read connected apps.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Artifacts read and write Asana, Calendar, Slack, custom connectors after per-tool approval; each person connects own apps Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): Apps can serve as deep research sources; conversations can subscribe to app updates (rows oh02:113, oh02:116) Apps: web.

**AGI requirement** (inferred; source: competitor parity; billing-catalog artifact_connectors feature). Connectors reach research, schedules and published apps only through the viewer's own connection with the same approvals; a schedule names which connectors it may use.

**With different models, providers and the one subscription.** Unattended runs need a model with tool calling and metering under the subscription; no use in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Deep research and project defaults partial; artifact connectors and schedule choice missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W225, W228, WP175, WP178, WP196
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2812`; `apps/web/features/projects/lib/project-chat-defaults.ts:4`

**Gap.** Scheduled-task connector choice and artifact connectors missing.

**Acceptance criteria**

1. Deep research cites a connected Drive file
2. A schedule lists the connectors it may use
3. A published app asks each visitor to connect their own account

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-17 Local MCP servers and desktop extensions

Servers that run on the user's computer and reach local files and tools, installed as packages.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop): Extensions directory one-click install; custom .mcpb file; secrets in OS keychain Apps: desktop.
  - [https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors): Desktop extensions run locally and exist only in Desktop and Claude Code Apps: desktop, cli.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github](https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github): Plugins that declare MCP servers are labelled Desktop only and cannot run on web Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Desktop connectors do not become Cloud credentials; installable extensions require provenance, scanning, removal)). Desktop-hosted local extensions and files stay with the trusted host; installable extensions need provenance, permission review, scanning, update and removal; secrets stay in the OS credential store.

**With different models, providers and the one subscription.** Local servers work with Local, BYOK and Managed models, but a Local chat to cloud model is an explicit fork. Free local inference on desktop must not require the server to call outside services.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI done (add local server, env vars); public Electron desktop reports no local MCP and uses hosted connectors; mobile none; .mcpb missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S58.02, S58.05, S58.14
- Comparison list ids: C304, C331, D88, DP93, DP94
- Code: `apps/cli/src/mcp/mod.rs`; `crates/agiworkforce-mcp/src/config.rs:124`; `docs/product/surface-feature-matrix.md MCP row (desktop absent)`

**Gap.** Desktop extension directory and .mcpb install missing; whether VS Code dials servers itself is unverified.

**Acceptance criteria**

1. Install a local server on desktop: its tool is usable and its path is shown
2. Remove it: files access stops
3. Its secret is not in plain text on disk

**Verification: not verified.** Code and matrix only

## CAP-connectors-apps-and-extensions-18 Skills: create, upload, enable and delete

Reusable instruction folders (SKILL.md with scripts and files) a user manages and the model loads when relevant.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12512180-use-skills-in-claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude): Customize > Skills: upload ZIP, toggles, download, delete with confirmation; needs code execution Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001066-skills-in-chatgpt](https://help.openai.com/en/articles/20001066-skills-in-chatgpt): Plugins > Skills tab: Installed, Created by me, Shared with me; create by chat, editor or upload Plans: Business, Enterprise, Edu, Healthcare (pricing page says all individual plans). Apps: web.
  - [https://learn.chatgpt.com/docs/build-skills.md](https://learn.chatgpt.com/docs/build-skills.md): SKILL.md folders in desktop, CLI and IDE (Codex), open agent skills standard Apps: desktop, cli, ide.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (removed files go to Trash first) and docs/product/experience-contract.md (Install, scan, approve, update, export, disable, remove)). A user creates, uploads, previews, enables, disables, downloads and deletes skills in the Agent Skills format, on every plan with a cloud chat entitlement; deletion goes to a recoverable state.

**With different models, providers and the one subscription.** Skills are text and files, so they work with any model; scripts need a code runner and are metered under the subscription. In Local mode instruction-only skills run on the device; script skills only with local code execution.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile (create and list), CLI built; VS Code partial; Chrome none; skills trash missing in CLI. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S53.01, S53.02, S53.03, S53.07, S53.10, S53.11, S53.14, S53.20, S53.21, S53.22
- Comparison list ids: W236, W263, WP169, WP181
- Code: `apps/web/lib/services/user-skill-authoring.ts:11`; `apps/web/app/api/skills/skill-upload-rules.ts:4`; `apps/cli/src/skills.rs:1031`; `apps/mobile/src/features/skills/service.ts:51`

**Gap.** Edit-with-assistant, intro video, bundled script run and live reload missing; mobile upload missing; skill input parameters, tests, versions and cost estimate all missing in ledger.

**Acceptance criteria**

1. Upload a valid skill ZIP: it lists and can be toggled
2. A ZIP with a mismatched folder name shows the reason
3. Delete asks first and the skill can be restored
4. Skill works with two different models

**Verification: not verified.** No skills defect or scorecard row; code only

## CAP-connectors-apps-and-extensions-19 Skill invocation: by name and automatic

A user picks a skill with / or @, or the assistant loads one whose description matches.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/best-practices.md](https://code.claude.com/docs/en/best-practices.md): Skills in .claude/skills/<name>/SKILL.md; only name and description in context until needed; user-invoked only option Apps: cli.
  - [https://support.claude.com/en/articles/12512176-what-are-skills](https://support.claude.com/en/articles/12512176-what-are-skills): Claude loads skills through progressive disclosure when relevant (chat) Plans: All plans. Apps: web, desktop.
- **ChatGPT and Codex: yes**
  - [https://learn.chatgpt.com/docs/build-skills.md](https://learn.chatgpt.com/docs/build-skills.md): @ in ChatGPT, $ or /skills in Codex; implicit invocation by description, can be disabled Apps: web, desktop, cli, ide.

**AGI requirement** (inferred; source: competitor parity). Explicit pick and automatic matching both work, with a setting to make a skill manual-only and a limit on how much context the skill list uses.

**With different models, providers and the one subscription.** Matching is host-side on the skill description so any model works; list budget shrinks for small context models.

**Current implementation, as this trace read it on 2026-11-24: built.** Manual: Web, Desktop, Mobile, CLI, VS Code, API; automatic on every app including Chrome; context budget missing in CLI. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S53.08, S53.17, S53.18
- Comparison list ids: C291, CP244
- Code: `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:172`; `apps/web/app/api/llm/v1/chat/completions/lib/skill-offer.ts:1`; `apps/cli/src/skills.rs:12`

**Gap.** Skill list context budget missing in CLI; Chrome manual invocation missing.

**Acceptance criteria**

1. Type / then a skill name: the answer follows the skill
2. Without naming it, a matching request loads the skill
3. Manual-only skill is not auto loaded

**Verification: code inspected only.** Ledger done for S53.17 and S53.18

## CAP-connectors-apps-and-extensions-20 Create a skill from a conversation, recording or template

Make a skill by chatting with a skill creator, saving a finished reply, or recording a demonstration.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12512198-how-to-create-custom-skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills): Record screen, clicks and voice in Cowork on Mac; proposal card Save, Update or Dismiss; video and audio not kept Plans: Pro, Max, Ultra, Team. Apps: desktop.
- **ChatGPT and Codex: yes**
  - [https://learn.chatgpt.com/docs/build-skills.md](https://learn.chatgpt.com/docs/build-skills.md): @skill-creator, or Record and Replay to draft a skill from a demonstration Apps: web, desktop, cli.

**AGI requirement** (inferred; source: competitor parity). Skills can be authored by assistant, saved from a reply or recorded from a task, with consent and permission prompts before any recording and a reviewed preview before saving.

**With different models, providers and the one subscription.** Drafting uses the chosen model and is metered; recording is on-device and never sent without consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and CLI built (/save-skill, /create-skill); desktop recorder partial; mobile and VS Code missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S53.27, S53.28, S53.29, S53.30
- Comparison list ids: DP92
- Code: `apps/web/features/skill-recorder/components/SkillRecorder.tsx`; `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:149`

**Gap.** Screen-and-voice flow and replay configuration missing per ledger; desktop recorder partial.

**Acceptance criteria**

1. Save a finished reply as a skill and see a preview before saving
2. Recording asks for screen permission first
3. Skill created works on a second model

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-21 Share and publish skills to teammates

Skills shared with named people or groups, or published to an organization as available, default or required.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12512180-use-skills-in-claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude): Share with people or groups, publish to org as Available, Installed by default or Required, with optional review Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/build-plugins.md](https://learn.chatgpt.com/docs/build-plugins.md): New plugins private by default, share needs Share plugins permission, directory listing needs Publish permission Plans: Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity; commercial.md Team entitlements). Skills are private by default; sharing and org publishing follow Team or Enterprise controls and can be turned off by an admin.

**With different models, providers and the one subscription.** Seats and org plan decide who can share; Local personal skills never leave the device unless exported.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial (workspace share route); organization skills missing in ledger on every app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S53.05, S53.25
- Comparison list ids: WP171, WP193, WP194
- Code: `apps/web/app/api/skills/[name]/workspace/route.ts:31`; `packages/contracts/types/src/enterprise/workspace-controls.ts:3`

**Gap.** No Personal, Shared with you, Organization sections fully; no review states.

**Acceptance criteria**

1. Share a skill with one teammate: it shows view-only
2. Admin switch off creation: new upload refused
3. Revoke: teammate loses the skill

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-22 Security scan of skills and plugins

Uploaded skills and plugins are scanned and blocked or flagged before they run.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/15927065-get-started-with-skill-and-plugin-scanning](https://support.claude.com/en/articles/15927065-get-started-with-skill-and-plugin-scanning): Pass, warn or fail scan on upload in about 1-2 minutes; fail blocks Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001066-skills-in-chatgpt](https://help.openai.com/en/articles/20001066-skills-in-chatgpt): Uploads are scanned and may be marked Needs Review or Blocked Plans: Business, Enterprise, Edu, Healthcare. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md and experience-contract.md (installable extensions require scanning)). Every skill and plugin is scanned before enable, with a visible result and the reason it was blocked.

**With different models, providers and the one subscription.** Scan is model independent and runs for all plans.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web scans uploaded skills and has a plugin scan route; Desktop shares; CLI and others missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S54.32, S98.28
- Comparison list ids: WP192
- Code: `apps/web/lib/services/user-skill-service.ts:87`; `apps/web/app/api/plugins/[id]/scan/route.ts:25`

**Gap.** Comparison marks plugin scan partial.

**Acceptance criteria**

1. Upload a skill with a hidden script: blocked with a reason
2. Clean skill passes and enables

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-23 Plugins: bundles of skills, connectors and commands

A package that installs skills, connections, agents and commands together.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13837440-use-plugins-in-claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude): Plugins bundle skills, connectors and sub-agents; hooks and sub-agents run only in Cowork and Code Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, cli.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/plugins.md](https://learn.chatgpt.com/docs/plugins.md): One plugin directory serves Chat, Work and Codex; IDE extension does not support plugins Apps: web, desktop, ios, android, cli.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Plugins can be used on every plan; creating and sharing not on Free Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Plugin migration: install, scan, approve, update, export, disable, remove)). Plugins are AGI-owned workflow packages that install, configure, enable, update, pin, export and remove, with a visible permission and compatibility summary.

**With different models, providers and the one subscription.** Components work with any model; surfaces that cannot run a component say so. Local mode loads only components that need no outside call.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, CLI built; Mobile has a plugin UI (comparison) but the matrix says absent; VS Code partial; Chrome none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S54.02, S54.12, S54.13, S54.14, S54.15, S54.16, S54.17, S54.19, S54.21, S54.22, S54.24, S54.25, S54.26, S54.29, S54.33, S98.17, S98.18, S98.19, S98.20
- Comparison list ids: CP193, DP91, VP56, X17
- Code: `apps/web/features/plugins/server/directory/install.ts:155`; `apps/web/lib/services/plugin-lifecycle.ts`; `apps/cli/src/features/plugins/plugins.rs`; `apps/mobile/src/features/plugins/PluginsScreen.tsx:76`

**Gap.** Conflict: surface-feature-matrix says mobile plugins absent (canUsePlugins false) while comparison cites mobile plugin screens. Chrome and VS Code install missing; many CLI author tools missing.

**Acceptance criteria**

1. Install a plugin: its skills and connectors appear
2. Disable and uninstall remove them
3. Plugin that cannot run on a surface is labelled
4. Pinned version stays until updated

**Verification: not verified.** No scorecard

## CAP-connectors-apps-and-extensions-24 Plugin marketplaces and admin distribution

Directories and private catalogues, from GitHub or other repositories, with org assignment.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization](https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization): Owners create marketplaces, sync from GitHub or GitLab, upload ZIPs under 200 MB Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github](https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github): Import marketplace catalogue from GitHub, daily sync, Sync now, last working version kept Plans: Business, Enterprise, Edu. Apps: web.
  - [https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan): Admins set plugins Available or Installed per role (catalogue row oh02:58) Plans: Business, Enterprise, Edu. Apps: web, desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity; definition.md Team and Enterprise controls). Admins add marketplaces and set each plugin as required, installed by default, available or hidden; changes reach every surface.

**With different models, providers and the one subscription.** Org policy under the Team or Enterprise subscription, same on every app.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and Desktop built; GitHub marketplace partial; GitLab missing; CLI partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S54.05, S54.06, S54.07, S54.30, S98.25, S98.27
- Comparison list ids: CP212, VP49, W259, WP170, WP172
- Code: `apps/web/features/workspace-console/components/WorkspacePlugins.tsx:34`; `apps/web/app/api/plugins/organization/route.ts:13`; `apps/web/features/directory/hooks/useDirectoryAdapter.ts:1544`

**Gap.** GitLab sync, installation approval request, featured and recommended plugins missing.

**Acceptance criteria**

1. Admin adds a GitHub marketplace: plugins list
2. Mark one Required: a member cannot uninstall it
3. Hide one: members do not see it

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-25 Build a plugin by conversation

An assistant helps write and edit a plugin from a description, with reference files.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13837440-use-plugins-in-claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude): Plugin library and a Create plugin flow; Customize an installed plugin in Cowork Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/build-plugins.md](https://learn.chatgpt.com/docs/build-plugins.md): Mention Plugin Creator in Chat or Work; edit by conversation; creator and admins can edit Plans: Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity). A user can ask the assistant to draft a plugin, see a preview card, then install or share it.

**With different models, providers and the one subscription.** Uses the user's chosen model, metered under subscription.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and Desktop built; mobile and CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S54.27, S54.35
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/PluginDraftCard.tsx`; `apps/web/features/plugins/server/directory/customize.ts:41`

**Gap.** none known

**Acceptance criteria**

1. Ask to build a plugin: a draft card appears
2. Install it: its skill loads in a new chat

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-26 Coding-tool MCP, plugin and skill configuration (CLI, VS Code)

In the terminal and editor, MCP servers, plugins and skills are added by file or command with scopes and approval.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/mcp-quickstart.md](https://code.claude.com/docs/en/mcp-quickstart.md): MCP scopes local, project, user; project writes .mcp.json shared with the team Apps: cli.
  - [https://code.claude.com/docs/en/managed-mcp.md](https://code.claude.com/docs/en/managed-mcp.md): Managed settings supply org MCP servers users cannot remove Apps: cli.
  - [https://code.claude.com/docs/en/plugins/install.md](https://code.claude.com/docs/en/plugins/install.md): /plugin shows contents, scope and token cost before install Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Server status, OAuth login, plugin marketplaces and import of other agents' config Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: docs/product/definition.md (developer extension discovery is folder-aware; CLI and VS Code show same inventory)). CLI and VS Code show the same discovered MCP, skill and plugin inventory for a trusted workspace, project servers need approval before they start, and secrets stay in the credential store.

**With different models, providers and the one subscription.** Developer domain is separate from Cloud; works with Local, BYOK and Managed models; sessions metered under one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI has MCP, plugins and skills with many partial items; VS Code manages servers and skills via CLI runtime; whether editor dials servers is unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S58.01, S58.02, S58.04, S58.05, S58.14, S98.21, S98.22, S98.23, S98.24
- Comparison list ids: C292, C346, CP144, CP189, V49, V51, VP51, VP54
- Code: `apps/cli/src/mcp/consent.rs`; `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:631`; `apps/cli/src/skills.rs:12`

**Gap.** CLI missing: add from JSON, scoped plugin sessions, deny lists, MCP output limits, plugin authoring commands; VS Code missing install scopes and options dialog.

**Acceptance criteria**

1. Add a project server: it asks approval before first start
2. CLI and VS Code list the same skills
3. Plugin details show what it adds

**Verification: code inspected only.** Comparison cites cli and vscode rows; MCP module reachability unverified in matrix

## CAP-connectors-apps-and-extensions-27 Account sync of skills, plugins and connectors into the coding tool

Skills and plugins made in the chat product appear in the coding tool under the same account.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/12512180-use-skills-in-claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude): Claude Code signed in with same account lists synced skills; one-way, about every 10 minutes Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **ChatGPT and Codex: yes**
  - [https://learn.chatgpt.com/docs/plugins.md](https://learn.chatgpt.com/docs/plugins.md): One plugin directory serves ChatGPT Chat and Work and Codex Apps: web, desktop, ios, android, cli.

**AGI requirement** (stated requirement; source: docs/product/definition.md (two continuity domains; Desktop is the explicit bridge, no implicit merge)). Cloud-account skills and plugins may appear in the developer domain only by explicit, visible sync; host tools and credentials do not move to the Cloud.

**With different models, providers and the one subscription.** Sync follows the one account; Local items never sync.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI has account skill sync (same) and plugins partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: CP194, CP198, CP199
- Code: `apps/cli/src/skills.rs`

**Gap.** Account connectors inside CLI partial; disable switch missing.

**Acceptance criteria**

1. Create a skill on web: it lists in CLI after sync
2. Sync can be turned off

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-28 Custom assistants (custom GPTs) and migration to plugins

A user builds a named assistant with instructions, files, tools and sharing; ChatGPT is retiring its version in favour of plugins.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/8554397-creating-and-editing-gpts](https://help.openai.com/en/articles/8554397-creating-and-editing-gpts): Free, Go, Plus, Pro cannot create new GPTs; retirement 11 Dec 2026 Plans: All plans. Apps: web.
  - [https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq](https://help.openai.com/en/articles/20001519-custom-gpt-retirement-and-migration-faq): Migration turns instructions into a skill and knowledge files into reference files; custom actions and model do not transfer Plans: All plans. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/definition.md and experience-contract.md (Custom GPT/GPT Store compatibility is migration input, not the target)). Reusable assistants are plugins and skills, not a GPT store; Custom GPTs are a migration source only.

**With different models, providers and the one subscription.** An assistant stores a model preference but must run on any permitted model; sharing needs Team or Enterprise.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has custom agents with draft, publish and visibility; CLI has agents; ledger S52 says missing on web, desktop and mobile, which conflicts with code. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S52.01, S52.02, S52.10, S52.31, S52.33
- Comparison list ids: WP176, WP198
- Code: `apps/web/features/agents/components/AgentPublishPanel.tsx:19`; `apps/web/app/api/custom-agents/route.ts`; `apps/cli/src/agents.rs:726`

**Gap.** Guided builder, preview pane, starters, versions, public listing and migration are missing; migration row marked N/A.

**Acceptance criteria**

1. Create an agent with name and instructions and chat with it
2. Publish to specific people: they can chat; others cannot
3. Edit it and run on a different model

**Verification: not verified.** No person has tried the agents page

## CAP-connectors-apps-and-extensions-29 Partner and role plugin packs

Curated plugins for sales, finance, legal, health, data and similar roles, from vendors and partners.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16952184-set-up-salesforce-in-claude-for-your-organization](https://support.claude.com/en/articles/16952184-set-up-salesforce-in-claude-for-your-organization): Salesforce plugin with 37 sales skills; each CRM change proposed for review Plans: All paid plans (Salesforce-approved orgs). Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001256-plugins-in-chatgpt](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt): Plugins bundle skills, apps, templates and extensions; OpenAI Verified label (row oh04:137) Plans: All plans. Apps: web, desktop, ios, android.

**AGI requirement** (proposed; source: competitor parity; unresolved which partners). Role packs are skills plus connectors built from licensed, pinned content, and appear in the directory with publisher identity.

**With different models, providers and the one subscription.** Packs work on any model; third-party data feeds may need separate licence.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Partial on web via .agents skills marked product (data analysis, legal); health, finance and Salesforce plugin missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S56.28, S56.29, S56.46, S56.47
- Comparison list ids: DP91, W237, W239, W248, WP177, WP186
- Code: `skills-lock.json audience product`; `apps/web/lib/connectors/catalog.ts:195`

**Gap.** Role packs for sales, finance, healthcare missing.

**Acceptance criteria**

1. Directory lists a role pack with publisher
2. Its connector needs approval before any write

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-30 Publisher submission and directory safety policy

Third parties submit MCP servers, skills and plugins and follow safety rules before they are listed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy): Rules on privacy, tool descriptions and unsupported categories; OAuth 2.0, tool annotations required
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12515353-building-with-the-apps-sdk](https://help.openai.com/en/articles/12515353-building-with-the-apps-sdk): Submit to the app directory, featured placement for higher quality (row oh03:22) Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (proposed; source: competitor parity; publisher identity is checked in the owner's review (decision 2026-09-27)). A submission flow checks tool annotations, OAuth, privacy link and test account, and admins can moderate, delist and report entries.

**With different models, providers and the one subscription.** Policy independent of model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has plugin submission service and admin moderation page. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S54.36, S54.37, S54.38, S98.26
- Comparison list ids: WP179, WP195
- Code: `apps/web/lib/services/plugin-submission-service.ts:21`; `apps/web/features/admin/pages/PluginModerationPage.tsx`

**Gap.** No report-plugin or publisher analytics; no public policy text.

**Acceptance criteria**

1. Submit a plugin and track review status
2. Delisted plugin disappears from the directory

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-31 Connect the assistant inside other apps (add-ins, Slack, Teams)

The assistant lives in Office, Google Workspace, Slack or Teams and uses connectors and skills there.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16951679-use-claude-in-google-docs-sheets-and-slides](https://support.claude.com/en/articles/16951679-use-claude-in-google-docs-sheets-and-slides): Sidebar in Docs, Sheets, Slides with connectors and model picker Apps: other.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001063-chatgpt-for-excel-and-google-sheets](https://help.openai.com/en/articles/20001063-chatgpt-for-excel-and-google-sheets): Sidebar add-in with Skills and apps Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: other.

**AGI requirement** (proposed; source: competitor parity; not among the six AGI apps). Add-ins and chat-app assistants are separate surfaces that must use the same entitlement and connector approvals.

**With different models, providers and the one subscription.** Would meter under the same subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Slack assistant built on web; Teams, Office, Workspace add-ins missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W213, W214, W238, W241, WP183
- Code: `apps/web/features/slack/components/SlackChannelPolicies.tsx:23`; `apps/web/lib/slack/slack-tasks.ts:18`

**Gap.** Office and Workspace add-ins, Teams, Meet missing.

**Acceptance criteria**

1. Slack mention answers using the channel's allowed tools

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-32 Health and bank account connections

Opt-in read-only connections to health records and bank accounts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/18185620-use-personal-finance-in-claude](https://support.claude.com/en/articles/18185620-use-personal-finance-in-claude): Link banks via Plaid, read-only; US only; not in scheduled tasks Plans: Pro, Max, Ultra (US). Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001497-troubleshooting-plugins-and-apps-in-chatgpt](https://help.openai.com/en/articles/20001497-troubleshooting-plugins-and-apps-in-chatgpt): Finances via Plaid (US) and health sources are separate connections (catalogue rows oh04:109, oh03:92) Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-08). Health and bank connections are opt-in, read-only, United States only, never saved to memory, and stay off until the owner signs the vendor agreement and a lawyer clears the rules.

**With different models, providers and the one subscription.** Data must not reach models outside the user's chosen route; blocked in Local mode and never used for training.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has health space and finance dashboard in code; mobile health missing and bank linking flag off. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S56.46, S56.47
- Comparison list ids: M105, M106, M127, W216, WP166
- Code: `apps/web/lib/services/health-space-service.ts:27`; `apps/mobile/lib/v1FeatureFlags.ts:35`

**Gap.** Awaiting owner vendor agreement and legal check.

**Acceptance criteria**

1. Connection is off until enabled
2. Disconnect removes tokens and stored data

**Verification: not verified.** Not tested

## CAP-connectors-apps-and-extensions-33 Developer mode and Apps SDK for building connectors

A beta mode and SDK for building and testing custom connectors and apps.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop): Extension Developer setting installs a .mcpb file; logs in Developer settings Apps: desktop.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Developer mode beta for advanced connector use Plans: Plus, Pro. Apps: web.

**AGI requirement** (proposed; source: competitor parity). A developer can try an unlisted connector and see schema and call logs without publishing it.

**With different models, providers and the one subscription.** Plan-gated by entitlement; model independent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has connector call log and health dashboard (better); no developer mode. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S58.26, S58.27, S58.28
- Comparison list ids: W235
- Code: `apps/web/features/connectors/components/ConnectorCallLog.tsx:31`

**Gap.** No developer-mode flow or debugging console.

**Acceptance criteria**

1. Unlisted server shows tool schema and each call

**Verification: not verified.** Not tested

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Multiple accounts per connector: owner decision of 2026-09-27 says one account; experience-contract.md requires multiple identities and ChatGPT documents it. Which stands?
- Whether to build the ChatGPT-only extras (Secure MCP Tunnel, developer mode, Sites hosting MCP plugins, app templates, Company Knowledge) or the Claude-only extras (desktop .mcpb extensions, skill recording, GitLab marketplace, Salesforce plugin).
- Whether any connector beyond the 13 named should be released before the release state changes to released, and which plans get which connectors on 2027-01-01 when subscription sales may start.
- Whether custom assistants stay as agents, become plugins only, or both, given ChatGPT retires custom GPTs on 11 Dec 2026.
- Whether skills are open to Free (billing catalog) given ChatGPT documents conflicting plan scope, and whether Free gets one custom connector as Claude does while the owner rule is paid only.
- Whether Office, Google Workspace, Teams and WhatsApp add-ins belong in scope as AGI surfaces.
- Whether Local mode may call cloud connectors through an explicit fork with visible provider label, or never.
- Whether mobile plugins are in v1: the surface matrix says absent, comparison cites screens.

## Could not establish

- No person-run test of skills, plugins, custom MCP, interactive connectors, admin controls or custom agents: only W-17 (Free and Basic) and W-18 scorecards touch connectors.
- Whether the ledger status 'done' matches the shipped build; ledger and comparison disagree on custom assistants (web) and mobile plugins and interactive cards.
- Several competitor catalogue rows carry urls that do not match their topic (for example oh02:58 cites a Codex plan article); I cited the url given and marked the row id.
- Claude custom assistant, multi-account and ChatGPT Free-plan skills scope: the catalogue gives no clear evidence; marked unknown or conflicting.
- Whether the CLI and VS Code reach the MCP module in the built product (matrix says unverified).
- What each AGI plan's customMcpServers cap is, per tier name (values read but not mapped).
- Local-mode behaviour of connectors on mobile and desktop was not checked in code.
