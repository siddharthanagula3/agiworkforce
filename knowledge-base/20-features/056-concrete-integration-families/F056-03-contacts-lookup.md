---
id: "F056-03"
type: "feature"
title: "Contacts lookup"
aliases: ["Contacts lookup", "Google Contacts connector", "People API connector", "search_contacts", "search_directory_people", "S56.12"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S56.12"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "F056-01", "mode:cloud", "surface:web", "surface:mobile", "surface:desktop", "surface:cli", "surface:vscode", "surface:chrome", "table:connector_oauth_grants"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-03 Contacts lookup

Lets the assistant look up a person's email or details in the user's Google Contacts and workplace directory. Lookup is read-only and its three tools are declared reads, so they run without asking under the read-only policies. It is not released, so no app can use it yet.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.12](../../10-requirements/capabilities/056-concrete-integration-families.md#s5612).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers three read tools from Google's People server: get_user_profile, search_contacts, search_directory_people. [code] (apps/web/lib/connectors/directory/sources/first-party.json:69-72; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:746-768)

**Why it exists.** ChatGPT's Google Contacts connector does the same, and the assistant needs a recipient's address before drafting or inviting. [doc: docs/development/connectors-setup.md]

**Who uses it.** Paid-plan users who connect Google and ask for a person's address.

**Problems it solves**

- Finding a recipient's email without leaving chat
- Choosing between people with the same name

**Use cases**

- Find the email for a named colleague
- Draft a message to a person found in contacts
- Look up a directory entry before an invite

## 2. User experience

**Where to find it**

- Web: Settings 'Connectors' and /connectors.
- Desktop: the same hosted web app. [doc: AGENTS.md section 5]
- Mobile: Settings 'Connectors'; the brief says 'done' with a pointer to index.tsx:44, but that line is only an import, not a contacts entry. [code] (apps/mobile/src/features/settings/cloud-connectors/index.tsx:44)
- CLI and VS Code: account connector list only. [code] (apps/cli/src/cloud/connectors.rs:176; apps/extension-vscode/src/features/connectors/connectorsTree.ts)
- Chrome: 'Connectors' attach menu item. [code] (side_panel.ts:14811)

**Before you start**

- Signed-in, paid plan, Cloud mode.
- google-contacts released (not today) and configured with CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_ID and _CLIENT_SECRET. [doc: docs/development/connectors-setup.md]
- People API and People MCP API enabled in the Google project. [doc: docs/development/connectors-setup.md]

**Screens and controls**

- Connect button, consent screen, chat step row, approval prompt only if the policy asks.

**Journey**

1. Connect Google Contacts.
2. Ask 'find the email for Priya Rao'.
3. Assistant calls search_contacts; the step shows in the timeline.
4. If several match, the assistant should ask which one [proposed behaviour; not enforced by code].
5. Use the address in a draft (F056-01).

**What the person sees and gets**

- Step sentence; names and emails in the answer.

**Settings**

- Approval policy. [code] (tool-approval-policy.ts:45-75)
- Per-chat connector switch. [code] (route.ts:826-830)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Three tools declared as reads of private data that return untrusted content, with no egress path, so they run without asking under 'Run read-only actions without asking' and 'Skip approvals'. [code] (tool-metadata.ts:746-768; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:1083-1100; doc: docs/development/connectors-setup.md)
- Scope ceiling admits contacts.readonly and directory.readonly; the contacts write scope is not admitted. [code] (connector-scopes.ts:50-53)

**Incomplete**

- Under 'Ask before every action' every call still asks. [code] (packages/contracts/types/src/tool-approval-policy.ts:45-52)
- Contacts tools are not marked readsPrivateData, which the trifecta rule uses; whether that matters is unknown. [code] (tool-metadata.ts:746-768) [inferred]

**Present but disconnected or switched off**

- google-contacts is not in the released list; every gate refuses it. [code] (connector-release.ts:14-30; user-connector-tools.ts:2492)
- Needs descriptor and client pair; Google's People MCP is a Developer Preview. [doc: docs/development/connectors-setup.md]

**Not available**

- CLI and VS Code: brief says missing; code gives them no contacts tool of their own, but they use the same account tool list. [inferred]
- Mobile 'done' in the brief is not supported by the cited line. [code] (index.tsx:44)
- Local and own-key modes; free plan.

## 4. Required behaviour

**Established requirements**

- The assistant can look up people in the user's address book to find a recipient's email or details. (source: S56.12)
- Google Contacts is read-only, using contacts.readonly and directory.readonly. (source: doc: docs/development/connectors-setup.md)
- The three tools are declared reads and run under the read-only and autonomous approval policies without asking. (source: doc: docs/development/connectors-setup.md)

**Acceptance criteria**

1. After release and connect, 'find the email for X' returns the right address from the user's contacts.
2. No write tool for contacts exists in the tool list.
3. Under 'Run read-only actions without asking' no approval prompt appears for search_contacts.
4. If there is no match the assistant says so and does not invent an address.
5. On an expired grant a Reconnect card appears.
6. On a training-capable model the tool is withheld.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Asking which person when several match is model behaviour, not enforced. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that a chat with Contacts and Gmail drafts shows the recipient before send.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Directory entry | `apps/web/lib/connectors/directory/sources/first-party.json` | People MCP url and three tools. |
| config | Scope ceiling | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | contacts.readonly and directory.readonly only. |
| config | Tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Declares three reads. |
| config | Catalog | `apps/web/lib/connectors/catalog.ts` | google-contacts record. |
| config | Release gate | `packages/contracts/types/src/connector-release.ts` | Not released. |
| service | Tool catalog builder | `apps/web/lib/user-connector-tools.ts` | Builds People tool defs for a connected grant. |
| service | Google data rules | `apps/web/lib/connectors/google-user-data.ts` | Contacts is a Google user data connector. |
| service | OAuth registry | `apps/web/lib/connectors/oauth-registry.ts` | Reads descriptor and credential env names. |
| screen | Mobile Connectors screen | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile list. |
| command | CLI connectors | `apps/cli/src/cloud/connectors.rs` | Account connector list. |
| component | VS Code tree | `apps/extension-vscode/src/features/connectors/connectorsTree.ts` | Account connector list. |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Connectors menu item. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks in chat; the turn goes to our servers. | device | route.ts:792-800 |
| Server checks release, plan, kill switch; Contacts tools offered only for a connected, released grant on a no-training turn. | our servers | user-connector-tools.ts:2536-2565 |
| Gate allows reads under read-only or autonomous policy. | our servers | tool-metadata.ts:1083-1100 |
| Our server calls Google's People MCP server with the token; Google answers. | outside service | first-party.json:69-72 |
| Result returns to the model and the person. | our servers | user-connector-tools.ts:2766-2830 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Contacts grant | table:connector_oauth_grants | Account-wide | Deleted on disconnect |
| Looked-up names and emails | Chat transcript, marked as Google data | Chat sync | Memory does not keep facts drawn from Google data. [code] (google-user-data.ts:61-63) |

**Models and providers.** Tool-capable model on a no-training provider. [code] (google-user-data.ts:41-49)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | contacts.readonly, directory.readonly. [code] (connector-scopes.ts:50-53) |
| Subscription | Paid plans only. [code] (billing-catalog.ts:332-351) |
| Limits and metering | none found in the code. |
| Feature flags | Release state, kill switch, workspace policy, per-chat switch. |
| Model compatibility | Tool support required; no-training provider. |
| Provider restrictions | Google data only to no-training providers. |
| Local mode | Not offered in Local or own-key sessions. [code] (apps/cli/src/claude_parity.rs:2775-2779) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not released | Refused with 'Connectors are coming soon.' | user-connector-tools.ts:2766-2768 |
| No match | Depends on Google's tool answer and the model; not handled in the code. | not found |
| Expired authorization | Reconnect tool offered in place of real tools. | user-connector-tools.ts:2551-2556 |
| Tool returns untrusted text | Declared as accepting untrusted content, which feeds the injection escalation rule. | tool-metadata.ts:754-760; tool-call-gate.ts:112-130 |
| Offline, timeout, retry | not handled in the code beyond a failed tool result. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/google-user-data.test.ts`: Contacts counts as a Google connector.
- `apps/web/lib/connectors/__tests__/oauth-registry.scope-allowlist.test.ts`: Scope ceiling applied to descriptors.
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.contract.test.ts`: Metadata contract.
- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Release gates.

**Test scenarios**

- **Lookup**
  1. Connect a test Google account with known contacts.
  2. Ask for a contact's email.
  - Expected: Correct address returned; no write tools offered.
- **Ambiguous name**
  1. Ask for a name shared by two contacts.
  - Expected: Both are shown or the assistant asks which one.
- **No match**
  1. Ask for a name not in contacts.
  - Expected: The assistant says nothing was found and asks for the exact name.
- **Policy check**
  1. Set 'Ask before every action' then 'Run read-only actions without asking'; repeat a lookup.
  - Expected: Prompt appears in the first, not in the second.
- **Mobile entry**
  1. Open mobile Settings, Connectors, search 'contacts'.
  - Expected: Row appears with 'Coming soon' while unreleased.

**Where to look when it fails**

- Log '[user-connector] Google-hosted connector withheld...'.
- connector_call_events table.
- '[connector-oauth]' registry log lines.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **Not released.** Affects: All apps. Evidence: connector-release.ts:14-30. Work needed: Owner release decision.
- **Brief cites mobile index.tsx:44 as listing Contacts; that line is an import.** Affects: Mobile status 'done'. Evidence: apps/mobile/src/features/settings/cloud-connectors/index.tsx:44. Work needed: Correct brief; verify mobile row appears.
- **People MCP is a Developer Preview and may not be usable in public apps.** Affects: All. Evidence: docs/development/connectors-setup.md. Work needed: Owner checks preview eligibility.
- **No evidence of descriptor and client in production, and no live run.** Affects: All. Evidence: none found. Work needed: Setup and recorded run.
- **CLI and VS Code brief 'missing' unverified against shared server tool list.** Affects: CLI, VS Code. Evidence: claude_parity.rs:2772-2774. Work needed: Re-audit.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- F056-01
- mode:cloud
- surface:web
- surface:mobile
- surface:desktop
- surface:cli
- surface:vscode
- surface:chrome
- table:connector_oauth_grants

## Unknown

- Whether the People MCP server is reachable for the production Google project.
- Whether production has the contacts descriptor and credentials.
- Whether the chat asks 'which person' when several match.
- Mobile row for contacts: not seen in code, depends on the server directory snapshot.
- CLI and VS Code actual behaviour.
