---
id: "F058-10"
type: "feature"
title: "Developer debugging console"
aliases: ["Extension debugging console", "MCP traffic inspector", "Developer debugging console", "S58.26"]
area: "58 MCP and interactive extension products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S58.26"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "SYS-connectors-plugins-and-skills", "SYS-observability-and-operations", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-10 Developer debugging console

A console where a server developer could watch MCP traffic while debugging. It does not exist on any app. No code for it was found, and a founder decision explicitly keeps an MCP traffic inspector out of the CLI. Related but different: per-server call history on web, mobile, CLI and VS Code.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.26](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5826).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing today. The required feature would show MCP messages for a server so its author can debug it.

**Why it exists.** The brief lists 'Extension developers get a console to watch MCP traffic and debug their server' as a requirement (S58.26).

**Who uses it.** Developers who build MCP servers or extensions.

**Problems it solves**

- Would shorten debugging of a server that fails to connect or returns bad results.

**Use cases**

- A developer connects a local server and wants to see each request and reply.
- A developer wants to see why a tool call failed.

## 2. User experience

**Where to find it**

- Not available on web, desktop, mobile, VS Code or Chrome (brief S58.26).
- CLI: not offered by decision (doc: docs/decisions/2026-09-27-founder-decisions.md, list of CLI exclusions including 'an MCP traffic inspector' and cell S58.26).

**Before you start**

- not applicable

**Screens and controls**

- none found in the code

**Journey**

1. not applicable

**What the person sees and gets**

- Related, different features: connector call log API (apps/web/app/api/connectors/calls/route.ts:25) and server health and logs (S58.12).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- none found

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- No MCP traffic console on any app. A search of apps, packages and docs for inspector, debug console or traffic next to MCP found no code (only the CLI exclusion in the founder decisions).
- Web has a per-user connector call log at apps/web/app/api/connectors/calls/route.ts and a tool permissions panel; these show call history, not live protocol traffic (brief S58.12).

## 4. Required behaviour

**Established requirements**

- Extension developers get a console to watch MCP traffic and debug their server (missing on all apps). (source: S58.26)
- The CLI does not add an MCP traffic inspector, because the leaders' terminals offer none. (source: docs/decisions/2026-09-27-founder-decisions.md (CLI exclusion list))

**Acceptance criteria**

1. Not testable today: no feature exists.
2. If built: a developer sees each request and reply for one server in order, with errors, without exposing credentials.
3. If built: only the owner of the connection can see its traffic.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Any console must hide credentials and tokens [inferred from AGENTS.md section 6].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start with web: extend the connector call log with request and reply bodies for the owner, with secrets redacted.
- [proposed] Record a decision per app (web, desktop, mobile, VS Code, Chrome) as the CLI already has one.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | Connector call log (related) | `apps/web/app/api/connectors/calls/route.ts` | Lists recent connector calls for the user; closest existing feature. |
| component | ToolPermissionsPanel (related) | `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Shows call history in the brief for S58.12. |
| component | mcpServerDetails (related) | `apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts` | VS Code server details for health and logs (S58.12). |
| command | CLI MCP registry commands (related) | `apps/cli/src/repl/registry.rs` | Server list, status and tools for the CLI (S58.12). |
| other | Founder decision | `docs/decisions/2026-09-27-founder-decisions.md` | Says the CLI adds no MCP traffic inspector. |
| other | Area brief | `knowledge-base/data/area-briefs/058-mcp-and-interactive-extension-products.md` | Lists S58.26 as missing on all apps. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. | device | no code found for S58.26 in apps, packages or docs searches |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| none | none | none | none |

**Models and providers.** No model or provider involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | none found in the code; a future console for local servers would be device-only [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Any | not handled in the code: the feature does not exist | searches described above |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm absence on web**
  1. Open Settings, connectors and a server's detail on web.
  2. Look for a traffic or debug console.
  - Expected: None present; only call history and capabilities.
- **Confirm absence in the Chrome extension**
  1. Open the extension side panel and settings.
  - Expected: No MCP console.
- **Confirm CLI exclusion**
  1. Run the CLI's MCP commands.
  - Expected: No traffic inspector command.

**Where to look when it fails**

- Search the repository for new MCP inspector code before assuming absence persists.
- Existing call history: /api/connectors/calls.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The whole feature is missing.** Affects: Server developers on web, desktop, mobile, VS Code and Chrome.. Evidence: S58.26 in the brief; no code found. Work needed: Product decision per app, then design: scope, redaction, owner-only access, retention.
- **No decision records exist for apps other than the CLI.** Affects: Planning.. Evidence: docs/decisions/2026-09-27-founder-decisions.md covers the CLI only. Work needed: Record keep or cut decisions.
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- SYS-connectors-plugins-and-skills
- SYS-observability-and-operations
- SYS-security-and-privacy

## Unknown

- Whether any console exists in code outside the paths searched (apps, packages, docs).
- Whether the owner wants the console on any app besides the CLI exclusion.
- What the VS Code mcpServerDetails log view contains (not opened).
