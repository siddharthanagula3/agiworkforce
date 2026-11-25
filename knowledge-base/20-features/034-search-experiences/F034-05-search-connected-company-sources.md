---
id: "F034-05"
type: "feature"
title: "Search connected company sources"
aliases: ["Connector search", "Search connected apps", "Company sources", "Connectors", "Search your connected work apps", "S34.06", "Cloud connectors"]
area: "34 Search experiences"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S34.06"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "plan:basic", "plan:pro", "plan:max", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F034-05 Search connected company sources

The assistant can call the search tools of apps the user has connected, such as Drive, Gmail or Notion, during a chat. Today the connector release switch is set to 'coming soon' with only 13 named connectors released, and only paid plans can use them, so most of the brief's examples are not live.

Area: [34. Search experiences](README.md). Requirement items: [S34.06](../../10-requirements/capabilities/034-search-experiences.md#s3406).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** On a Cloud chat turn, offers the model the tools of the user's connected apps (for example search_files for Drive or search_threads for Gmail), runs them with the user's saved permission, and reports tools that were cut by the plan.

**Why it exists.** ChatGPT and Claude let people search their work apps from chat; the product competes with them (doc: AGENTS.md section 10).

**Who uses it.** Paid users with work apps connected.

**Problems it solves**

- Copying data from work apps into chat
- Answering from company files and messages

**Use cases**

- Ask 'find the Q3 plan' and have it searched in Notion
- Turn off one connector for a single chat
- Approve a connector action in the CLI

## 2. User experience

**Where to find it**

- Web and Desktop: connectors in settings and the composer's connector controls (apps/web/features/chat/components/Composer/ChatComposerNew.tsx uses connectorToggleId and useConnectors; control labels not read).
- Mobile: Settings, Cloud connectors screen (apps/mobile/src/features/settings/cloud-connectors/index.tsx); empty text 'No connectors connected yet.' (line 411).
- CLI: approval prompt 'Allow connector action '<name>'?' (apps/cli/src/models/managed_approvals.rs:129).
- VS Code: only the start suggestions are gated by the connectors capability (ChatStateManager.ts:2469); no connector screen found.
- Chrome: side panel mentions connectors (apps/extension/src/side_panel.ts has many references); labels not read.

**Before you start**

- Connectors released for that connector id (see current implementation).
- A paid plan: basic, pro, max, max_15x, team, team_premium or enterprise (packages/contracts/types/src/billing-catalog.ts:332-351).
- The connector is connected (OAuth grant) and not denied in the user's permissions.
- A model that accepts tools (apps/web/app/api/llm/v1/chat/completions/route.ts:792).

**Screens and controls**

- Per-chat connector off switch (sent as disabled_connector_ids) (apps/web/lib/hooks/useChatStream.ts:831; apps/mobile/stores/chat/chatExecutionStore.ts:3444).
- Saved allow, ask or deny choice per connector tool.
- CLI approval prompt.

**Journey**

1. Connect an app in settings.
2. Ask a question that needs the app's data.
3. The assistant calls the app's search tool; if the saved choice is 'ask', an approval prompt appears.
4. The answer uses what the tool returned.

**What the person sees and gets**

- Tool call activity in the chat.
- The Cloud turn adds header X-AGI-Connector-Tools-Dropped naming connectors cut by the plan limit (route.ts:930-933); no client was found that reads it.
- Coming-soon text 'Connectors are coming soon.' when not released (packages/contracts/types/src/connector-release.ts:44).

**Settings**

- Connector permissions (allow, ask, deny) saved per user.
- Workspace connector policy may block catalog or custom connectors (apps/web/lib/user-connector-tools.ts:2500-2510).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cloud route builds connector tools only if connectors are released, the plan includes them, the kill switch is open and the model supports tools (apps/web/app/api/llm/v1/chat/completions/route.ts:792-800; apps/web/lib/connectors/connector-capability.ts:44-66).
- Saved allow/ask/deny verdicts load before the catalog is built; denied tools are never offered (route.ts:815-868).
- Per-turn connector opt-out layered on saved permissions (route.ts:838-843).
- Plan tool ceiling: tools over the limit are dropped and listed in a response header (route.ts:844-868, :930-933).
- CLI shows an approval prompt for managed connector actions (apps/cli/src/models/managed_approvals.rs:126-140).
- Google-hosted connectors are withheld from turns that may be used for training unless the turn is routed for Google user data (apps/web/lib/user-connector-tools.ts:2524-2535).

**Incomplete**

- Only 13 connectors are released: airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry, todoist (packages/contracts/types/src/connector-release.ts:16-30). Drive, Gmail and Slack are not in the list.
- Agent turns get no connectors in the coarse path: allowSelective is false when an agent turn is active (route.ts:795-805).

**Present but disconnected or switched off**

- CONNECTOR_RELEASE_STATE is 'coming_soon' (connector-release.ts:14), so connectors are off except the selective list.
- The dropped-tools header has no reader in apps or packages (searched case-insensitively): only route.ts sets it.

**Not available**

- Free plan: connectors need a paid tier (billing-catalog.ts:351).
- Local mode: connector tools are loaded by the Cloud chat route only [inferred].
- VS Code and Chrome: no confirmed connector search UI; the brief says done through the shared Cloud service (doc: area brief S34.06).

## 4. Required behaviour

**Established requirements**

- The assistant can search the user's connected work sources (Drive, Slack, Notion...) during a chat once connected. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.06)
- Connector tools are offered only if released, plan-included, kill switch open and the model uses tools; a chat can turn connectors off for that turn; denied tools are never shown; plan-cut tools are reported to the client; the saved allow/ask/deny choice decides approval. (source: apps/web/app/api/llm/v1/chat/completions/route.ts:792-868, :930-933; apps/web/lib/connectors/connector-capability.ts:44-66)
- Unsupported or incomplete capabilities are hidden or clearly unavailable, never presented as working. (source: doc: docs/decisions/2026-09-15-founder-decisions.md)

**Acceptance criteria**

1. With a paid account and Notion connected, asking for a page by name makes the assistant call a Notion search tool.
2. With a Free account, no connector tools are offered.
3. With Drive connected but not released, no Drive tool is offered and the app shows coming-soon state.
4. Switching a connector off for one chat prevents its tools in that chat only.
5. A tool set to deny is absent from the tool list sent to the model.
6. In the CLI a tool set to ask shows 'Allow connector action ...?' before running.
7. When the plan cuts tools, the response carries the dropped list header.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The client should tell the user when connector tools were dropped, since the server computes it for that purpose [inferred from the code comment at route.ts:926-929].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief to say Drive, Gmail and Slack are not released.
- [proposed] Show a notice in each app when the dropped-tools header arrives.
- [proposed] Verify VS Code and Chrome connector flows before listing them as built.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST chat completions (connector catalog) | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Builds connector tools, permissions, per-turn opt-out and the dropped header (lines 792-933). |
| service | connectorsAllowedForTurn | `apps/web/lib/connectors/connector-capability.ts` | Release, plan and kill-switch gate. |
| config | connector-release | `packages/contracts/types/src/connector-release.ts` | Release state and selective list. |
| config | billing plan capabilities | `packages/contracts/types/src/billing-catalog.ts` | connectors capability allowed for paid tiers (line 351). |
| service | loadUserConnectorToolCatalog | `apps/web/lib/user-connector-tools.ts` | Loads and filters tools from connected apps, enforces plan limit and denies. |
| config | first-party connector directory | `apps/web/lib/connectors/directory/sources/first-party.json` | Names each connector's tools, for example search_files, search_threads, search_events. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends disabled_connector_ids (line 831). |
| component | ChatComposerNew (connectors) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Composer connector toggles. |
| screen | Mobile Cloud connectors | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Connect and manage connectors. |
| store | mobile chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sends disabled_connector_ids (lines 3444, 5214). |
| service | managed approvals | `apps/cli/src/models/managed_approvals.rs` | CLI approval prompt for connector actions. |
| service | VS Code capability gate | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Gates start suggestions on canUseConnectors (line 2469). |
| test | user-connector-tools tests | `apps/web/lib/__tests__/user-connector-tools.test.ts` | Catalog tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app sends the chat request; web and mobile include disabled_connector_ids when the user turned connectors off for the chat. | device | useChatStream.ts:831; chatExecutionStore.ts:3444 |
| The server checks release state, plan, kill switch and model tool support. | our servers | route.ts:792-800; connector-capability.ts:44-66 |
| It loads saved verdicts and the user's active connectors, and builds the tool list without denied tools, within the plan ceiling. | our servers | route.ts:815-868; user-connector-tools.ts:2437-2560 |
| The model calls a tool; the server calls the connected app's service with the user's access token. | outside service | user-connector-tools.ts:2540-2560 |
| If the verdict is ask, the app shows an approval prompt (CLI prompt shown). | device | managed_approvals.rs:126-140 |
| The answer streams back; dropped tool names are in a response header. | our servers | route.ts:930-933 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector OAuth grants | Server database (table name not read) | Server-side | Until disconnected (not read) |
| Allow/ask/deny permissions | Server database (loadTurnToolPermissions) | Server-side | unknown |
| Data returned by the app | Chat message tool results | With the conversation | Follows the chat |

**Models and providers.** The model must support tools (route.ts:792). Connected-app services are outside providers. Google-hosted tools are withheld unless the turn is routed for Google user data.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account with the app connected. |
| Permissions | Saved per tool allow, ask or deny; workspace connector policy; per-chat opt-out. |
| Subscription | Paid tiers only: basic, pro, max, max_15x, team, team_premium, enterprise (billing-catalog.ts:332-351). Free has none. |
| Limits and metering | Plan tool ceiling via resolveConnectorToolLimit and a custom connector limit (user-connector-tools.ts:2437-2450; route.ts:846-850). |
| Feature flags | CONNECTOR_RELEASE_STATE coming_soon plus selective list; kill switch canUseConnectors (connector-capability.ts:31-42). |
| Model compatibility | Models whose registry capability tools is false get no connector tools (route.ts:792-793). |
| Provider restrictions | Per connector; Google-hosted ones need the Google user data routing. |
| Local mode | Not available in Local mode because tools are assembled by the Cloud service [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connectors not released | No tools; message 'Connectors are coming soon.' in connector flows. | connector-release.ts:44; connector-capability.ts:19-21 |
| Plan lacks connectors | No tools offered. | connector-capability.ts:52 |
| Kill switch unreadable | Tools withheld and an error logged. | connector-capability.ts:31-42 |
| Reauthorization needed | A reconnect tool is offered instead. | user-connector-tools.ts:2548-2552 |
| Tools over plan limit | Dropped and named in header. | route.ts:930-933 |
| Offline or timeout | not handled in the code read here. | apps/web/lib/user-connector-tools.ts:2437-2560 (no timeout handling seen in the part read) |
| Denied tool | Never advertised. | route.ts:850-853 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/__tests__/user-connector-tools.test.ts`: Connector tool catalog (contents not read).
- `apps/web/lib/__tests__/user-connector-tools.google-hosted.test.ts`: Google-hosted connector handling.
- `apps/web/app/api/connectors/route.test.ts`: Connectors API route.
- `apps/web/lib/services/scheduled-agent-executor.tools.test.ts`: References connector gate in scheduled runs.
- `apps/web/lib/connectors/__tests__/finish-authorization.policy.test.ts`: Connector authorization policy.

**Test scenarios**

- **Released connector**
  1. Paid test account; connect Notion; ask for a page by name.
  - Expected: A Notion tool call appears and the answer uses it.
- **Unreleased connector**
  1. Same with Drive.
  - Expected: No tool; coming-soon state.
- **Per-chat off**
  1. Turn the connector off for one chat; ask the same question; open another chat.
  - Expected: No call in the first chat; call in the second.
- **Free plan**
  1. Free account asks the same.
  - Expected: No connector tools.
- **CLI approval**
  1. Set a connector tool to ask; run a managed turn.
  - Expected: 'Allow connector action' prompt.
- **Plan cut**
  1. Connect more tools than the plan ceiling.
  - Expected: Header X-AGI-Connector-Tools-Dropped lists the dropped ones.

**Where to look when it fails**

- Log 'Kill-switch gate unreadable; connector tools withheld'.
- Logs '[user-connector] Google-hosted connector withheld from a turn that may train'.
- Response header X-AGI-Connector-Tools-Dropped.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/034-search-experiences.md](../../70-qa/test-plans/web/034-search-experiences.md)
- Desktop: [70-qa/test-plans/desktop/034-search-experiences.md](../../70-qa/test-plans/desktop/034-search-experiences.md)
- Mobile: [70-qa/test-plans/mobile/034-search-experiences.md](../../70-qa/test-plans/mobile/034-search-experiences.md)
- CLI: [70-qa/test-plans/cli/034-search-experiences.md](../../70-qa/test-plans/cli/034-search-experiences.md)

## 10. Gaps and dependencies

- **Release state is coming soon; Drive, Gmail, Slack not released although the brief says done.** Affects: All apps. Evidence: packages/contracts/types/src/connector-release.ts:14-30. Work needed: Release decision by the owner; update the brief.
- **Dropped-tool header has no client reader.** Affects: Web, Mobile, CLI, VS Code, Chrome. Evidence: Only route.ts:930 mentions it. Work needed: Read and show it in each app.
- **Agent turns get no connectors in the coarse path.** Affects: Agent users. Evidence: route.ts:795-805. Work needed: Confirm intent.
- **VS Code and Chrome connector UI not confirmed.** Affects: VS Code and Chrome. Evidence: ChatStateManager.ts:2469 only; managedChatHandler.ts has no connector code. Work needed: Verify and, if absent, mark partial.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- plan:basic
- plan:pro
- plan:max
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation

## Unknown

- Table names for connector grants and saved permissions.
- Control labels for connectors in the Web composer and Chrome side panel.
- Whether VS Code and Chrome show connector actions.
- Which released connectors have search-named tools (only Drive, Gmail, Calendar tool names were read).
- Whether a desktop Tauri build has its own connector flow.
