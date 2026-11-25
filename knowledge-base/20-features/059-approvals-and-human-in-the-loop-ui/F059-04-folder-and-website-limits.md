---
id: "F059-04"
type: "feature"
title: "Folder and website limits"
aliases: ["Per-folder permission (S59.05)", "Per-domain permission (S59.06)", "Folder grant", "Workspace root", "Website rules", "Allowed and blocked web domains", "domain: rule", "Workspace trust consent"]
area: "59 Approvals and human-in-the-loop UI"
available_on: ["web", "desktop", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "partial", mobile: "missing", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S59.05", "S59.06"]
depends_on: ["SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-execution-boundaries", "SYS-local-inference", "surface:desktop", "surface:cli", "surface:vscode", "surface:chrome", "store:permissions.toml", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F059-04 Folder and website limits

Limits where the agent may act. On Desktop and CLI the person grants folders. On Web a workspace admin lists sites web search and fetch may read. The CLI has domain: rules and asks before fetching unknown or private hosts. Chrome has an approved sites list. Mobile has neither.

Area: [59. Approvals and human-in-the-loop UI](README.md). Requirement items: [S59.05](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5905), [S59.06](../../10-requirements/capabilities/059-approvals-and-human-in-the-loop-ui.md#s5906).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps file and web access inside what the person or workspace allowed (apps/desktop/electron/runtime/pathGuard.ts:108; apps/web/lib/url-fetch/url-fetch-tool.ts:552).

**Why it exists.** Agents that read files or fetch pages could reach private data or internal networks; requirements call for approval on new or sensitive domains and for file and network operations outside safe defaults (doc: docs/product/requirements.md section 9.7).

**Who uses it.** Desktop and CLI developers, workspace admins, browser-task users.

**Problems it solves**

- File access outside a granted folder.
- Reading blocked websites.
- Fetching internal addresses or cloud metadata services.

**Use cases**

- Desktop: pick a project folder; revoke it later.
- Admin: allow only a short list of sites for web search in a workspace.
- CLI: add domain:docs.example.com to always allow fetches there.
- Chrome: approve a site once for a task or always.

## 2. User experience

**Where to find it**

- Desktop (Electron, hosted web app inside): folder commands workspace_pick_root, workspace_list_roots, workspace_revoke_root (apps/desktop/electron/runtime/dispatcher.ts:2312-2321); the attach dialog 'browses a folder the user has already approved' (apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:100). The dialog is not the grant.
- Web admin: workspace connector policy section titled 'Websites' with 'Allow site' and a block action (apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:326-369).
- CLI: rule prefix 'domain:' in permissions.toml; approval overlay for 'web_fetch' (apps/cli/src/permissions.rs:55, apps/cli/src/features/exec/tools/mod.rs:1515).
- VS Code: VS Code workspace trust decides whether a folder is forwarded to the CLI (apps/extension-vscode/src/features/permissions/workspaceConsent.ts:20).
- Chrome: Options approved sites with 'Remove <origin>' and the side panel site grant card 'Allow for this task' / 'Always allow on this site' / 'Decline' (apps/extension/src/options.ts:1452, apps/extension/src/features/side-panel/bubbles.ts:1420).

**Before you start**

- Desktop app for folder grants; a workspace (organization) for website rules; the CLI for domain rules.

**Screens and controls**

- Native folder picker (pickRoot) and Electron per-capability prompts scoped to a workspace folder (dispatcher.ts:2312, :669-760).
- Websites field with domain normalisation (WorkspaceConnectorPolicy.tsx:306).

**Journey**

1. Desktop: 1. Choose a folder; 2. the app lists it as a root; 3. later file or shell actions ask under that folder; 4. press revoke to remove the root, which first stops work in it.
2. Web admin: 1. open workspace console; 2. type a site; 3. Allow site or block; 4. the next chat turn in that workspace obeys it.
3. CLI: 1. agent asks to fetch a host; 2. person answers; 3. 'Always allow' is offered only if the host rule is acceptable.

**What the person sees and gets**

- Blocked fetch returns '<host> is outside the sites this chat may read.' (url-fetch-tool.ts:552).
- CLI summary 'The agent wants to fetch <host>, which is on this computer, its private network or a cloud metadata service.' (mod.rs:1523).
- Desktop: a root that is no longer approved gives 'That workspace is no longer approved. Choose the folder again.' (dispatcher.ts:632).

**Settings**

- Workspace policy fields allowedWebDomains and blockedWebDomains (connector-policy-service.ts:83-92).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop (Electron): roots are granted, listed and revoked; revoking stops work in the folder first; capability grants are scoped to the folder (dispatcher.ts:2312-2321, :1249-1254, permissionManager.ts:197).
- Desktop path checks: paths are resolved within the root and protected writes checked (pathGuard.ts:108, :179).
- Web: a workspace's allowed and blocked domains reach the fetch and search tools; a blocked host is refused and search results are filtered (connector-policy-service.ts:83-92, request-processor.ts:5259, url-fetch-tool.ts:550-553, apps/web/lib/web-search/web-search-tool.ts:458).
- CLI: web_fetch asks unless a domain rule names the host; internal targets get a special warning; open-ended allow rules are refused (permissions.rs:55, :158, mod.rs:1515-1540).

**Incomplete**

- Website rules apply only when a workspace (organization id) exists: personal accounts get no rules (connector-policy-service.ts:87).
- Desktop partial per brief: the retained Tauri build (internal) attaches the provider's hosted web_search with no domain lists (apps/desktop/src-tauri/src/core/llm/server_tools.rs:8-47; no 'allowed_domains' string in that file). The public Desktop is Electron showing the web app (AGENTS.md section 5), so whether this gap applies to the public Desktop is unknown.
- VS Code folder control is VS Code's own workspace trust; no per-folder revoke inside the extension was found (workspaceConsent.ts:20-48).

**Present but disconnected or switched off**

- Brief code references capabilityManagement.ts:985/1013 for VS Code are about hooks, not folders (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:970-1010).

**Not available**

- Mobile: no folder or site rules found; brief says missing for sites and does not list folders.

## 4. Required behaviour

**Established requirements**

- The agent can touch only folders the user granted, and the user grants or revokes each folder. (source: S59.05)
- The user can allow or block specific websites the agent may act on or fetch, and it is enforced. (source: S59.06)
- Desktop cloud chats are bound by workspace site rules; local and own-key desktop turns with hosted search are not (known gap). (source: S59.06 Unfinished)
- Browser actions on new or sensitive domains and file, shell and network operations outside safe defaults need approval. (source: doc: docs/product/requirements.md section 9.7)

**Acceptance criteria**

1. A file tool targeting a path outside every granted folder is refused.
2. Revoking a folder stops later access and asks again after re-granting.
3. A blocked site is refused by fetch and absent from search results.
4. The CLI asks before fetching a private-network address and does not offer an open-ended allow.
5. With an allow list set, a host not on it is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Website rules should also apply to personal accounts [inferred from connector-policy-service.ts:87 returning null without a workspace].
- Local and own-key desktop search should carry the same rules [inferred from S59.06 note].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A per-user site list for accounts without a workspace.
- [proposed] Withhold hosted search on local turns or pass the lists to the provider.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | workspace_pick_root / workspace_list_roots / workspace_revoke_root | `apps/desktop/electron/runtime/dispatcher.ts` | Folder grant commands (lines 2312-2321). |
| service | grantRoot / revokeRoot | `apps/desktop/electron/runtime/workspaceStore.ts` | Stores approved roots (lines 191, 233). |
| service | resolveWithinRoot / assertWritable | `apps/desktop/electron/runtime/pathGuard.ts` | Keeps paths inside the root (lines 108, 194). |
| service | revokeScope | `apps/desktop/electron/runtime/permissionManager.ts` | Takes back grants recorded against a folder (line 197). |
| component | LocalFolderAttachDialog | `apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx` | Browses an already approved folder to attach a file. |
| component | WorkspaceConnectorPolicy | `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx` | Admin UI for allowed and blocked websites (line 326). |
| service | readWorkspaceWebDomainPolicy | `apps/web/lib/services/connector-policy-service.ts` | Reads allow and deny lists for a workspace (line 83). |
| service | executeUrlFetch | `apps/web/lib/url-fetch/url-fetch-tool.ts` | Refuses a host outside the policy (line 552). |
| service | web search tool | `apps/web/lib/web-search/web-search-tool.ts` | Filters result urls by policy (line 458). |
| service | request-processor domain policy | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads the workspace policy into the turn (line 5259). |
| store | permissions.toml domain rules | `apps/cli/src/permissions.rs` | domain: prefix, website_allow_error, names_domain (lines 55, 158, 571). |
| service | web_fetch approval request | `apps/cli/src/features/exec/tools/mod.rs` | Builds the fetch approval and private-address warning (line 1515). |
| service | WorkspaceConsentStore | `apps/extension-vscode/src/features/permissions/workspaceConsent.ts` | Records and forwards folder trust time (line 20). |
| store | site allowlist and blocklist | `apps/extension/src/features/options/site-allowlist.ts` | Chrome approved sites; removeApprovedSiteHostPermission (line 99). |
| component | site grant card | `apps/extension/src/features/side-panel/bubbles.ts` | Once, always, decline for a site (line 1420). |
| other | hosted web_search server tool | `apps/desktop/src-tauri/src/core/llm/server_tools.rs` | Tauri (internal) hosted search with no domain lists (line 19). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Electron main resolves the folder id to an approved root; unknown root is refused. | device | dispatcher.ts:632 |
| Path is resolved inside the root; protected writes are checked. | device | pathGuard.ts:108-194 |
| Per-capability prompt asks for the folder scope unless already decided. | device | permissionManager.ts:334 |
| Cloud turn loads the workspace web domain policy and hands it to fetch and search tools. | our servers | request-processor.ts:5259, url-fetch-tool.ts:550 |
| CLI evaluates domain rules and asks on a miss. | device | mod.rs:1515-1527 |
| The fetch itself reaches the outside website. | outside service | url-fetch-tool.ts:560 guardedFetch |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approved folder roots | Electron workspace store (file name not read) | No | Until revoked |
| Workspace allowed and blocked domains | Workspace connector policy (organization policy storage, table name unknown) | Yes, per workspace | Until edited |
| CLI domain rules | permissions.toml | No | Until edited |
| Chrome approved sites | chrome.storage.local key agi_site_allowlist and a blocklist | Local to the browser profile | Until removed |

**Models and providers.** Provider hosted search tools are the open part: Tauri sends the hosted tool without lists (server_tools.rs:19). On Cloud the server tools apply the lists. Provider choice is not an input to the rules.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Folder grants need none. Website rules need a workspace and an admin (WorkspaceConnectorPolicy.tsx 'canEdit'). |
| Permissions | Only workspace admins edit site rules (canEdit gate in WorkspaceConnectorPolicy.tsx:345-364). The person grants folders in a native dialog. |
| Subscription | none found in the code for folder or site rules. Workspace console availability by plan: unknown. |
| Limits and metering | none found in the code; URL length limit exists in fetch (url-fetch-tool.ts, MAX_URL_LENGTH). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | Hosted search from a provider does not read workspace lists in the Tauri build (server_tools.rs). |
| Local mode | Folder grants and CLI rules work fully on the device. Website rules do not exist for Local or own-key desktop turns: they are server rules for Managed Cloud turns. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Folder removed or moved | 'That workspace is no longer approved. Choose the folder again.' | dispatcher.ts:632 |
| Revoke while work runs | Work in the folder is stopped first. | dispatcher.ts:2318 |
| Allow list set, host not on it | Fetch refused. | url-fetch-tool.ts:552 |
| Private or metadata address in CLI | Asks with a warning; rules for such hosts and for '*' are tried in tests and treated as rejected [inferred]. | mod.rs:1523, permissions.rs:1586-1588 |
| Untrusted VS Code folder | Nothing is forwarded and the CLI refuses it. | workspaceConsent.ts:14-18 |
| No workspace | No website rules. | connector-policy-service.ts:87 |
| Offline / reconnect | not handled in the code read. | not handled in the code (no offline branch found in the files above) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/agent-permissions/__tests__/connector-claims.test.ts`: Claims on the public permission reference page; content not read.
- `apps/desktop/electron/__tests__/permissionPolicy.test.ts`: Electron permission policy; cases not read.
- `apps/desktop/electron/__tests__/permissionCore.test.ts`: A grant on one workspace does not leak to another.
- `apps/cli/src/permissions.rs`: Inline tests for domain rules (for example lines 954, 1586-1588).
- `apps/extension/__tests__/site-allowlist-host-permission.test.ts`: Chrome allowlist and host permission; cases not read.
- `apps/extension/__tests__/site-permission-policy.test.ts`: Options default site permission states and modes.

**Test scenarios**

- **Folder boundary**
  1. Grant folder A in Desktop
  2. Ask the agent to read a file in folder B
  - Expected: Refused or prompted, not read silently.
- **Revoke folder**
  1. Revoke folder A
  2. Ask for a file in A
  - Expected: Asked again or refused; running work in A was stopped.
- **Blocked site**
  1. Add example.org to Websites block
  2. Ask web search or fetch for it in that workspace
  - Expected: Refused, absent from results.
- **CLI private host**
  1. Ask the CLI to fetch http://169.254.169.254
  - Expected: Approval with the private-network warning.

**Where to look when it fails**

- Error code url_not_allowed from fetch.
- Electron event permission-changed (dispatcher.ts:1259).
- CLI permissions.toml read errors name 'Failed to read permissions.toml'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/web/059-approvals-and-human-in-the-loop-ui.md)
- Desktop: [70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/desktop/059-approvals-and-human-in-the-loop-ui.md)
- CLI: [70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/cli/059-approvals-and-human-in-the-loop-ui.md)
- VS Code: [70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/vscode/059-approvals-and-human-in-the-loop-ui.md)
- Chrome: [70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md](../../70-qa/test-plans/chrome/059-approvals-and-human-in-the-loop-ui.md)

## 10. Gaps and dependencies

- **Site rules need a workspace; personal accounts have none.** Affects: Web and Desktop individual users. Evidence: connector-policy-service.ts:87. Work needed: Decide a personal site list or document the limit.
- **Tauri hosted search ignores workspace lists; applicability to the public Electron Desktop unknown.** Affects: Desktop local and own-key turns. Evidence: server_tools.rs:8-47. Work needed: Trace Electron own-key search and either pass lists or withhold hosted search.
- **Mobile has no folder or site rules.** Affects: Mobile. Evidence: brief S59.06 missing. Work needed: Decide whether Mobile needs them (cloud rules already apply on server turns).
- **VS Code folder grant is VS Code trust only; no in-app revoke.** Affects: VS Code. Evidence: workspaceConsent.ts:20-48. Work needed: Confirm and document or add a control.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-execution-boundaries
- SYS-local-inference
- surface:desktop
- surface:cli
- surface:vscode
- surface:chrome
- store:permissions.toml
- mode:local

## Unknown

- Where Electron stores approved roots (file not read).
- Whether Electron own-key turns attach provider hosted search and apply site rules.
- VS Code domain behaviour beyond CLI rules.
- PUT endpoint apps/web/app/api/settings/organization/connector-policy/route.ts was named by the brief but not opened.
- Table that holds the workspace connector policy.
