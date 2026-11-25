---
id: "F058-03"
type: "feature"
title: "Configure a server"
aliases: ["Credential configuration", "Server configuration editor", "Environment variables", "OAuth sign-in for a connector", "Per-project MCP servers", ".mcp.json", "mcp.json", "agi mcp login/logout", "/mcp reconfigure", "Sign-in required", "S58.04", "S58.05", "S58.06", "S58.14"]
area: "58 MCP and interactive extension products"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S58.04", "S58.05", "S58.06", "S58.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "F058-02", "table:user_custom_connectors"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F058-03 Configure a server

Sets how a server is reached and authorized: token or OAuth sign-in on web, desktop and mobile; address, environment and headers in the CLI and VS Code; per-project servers from .mcp.json in the CLI and VS Code. Web has no editor for an existing server and no project scope.

Area: [58. MCP and interactive extension products](README.md). Requirement items: [S58.04](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5804), [S58.05](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5805), [S58.06](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5806), [S58.14](../../10-requirements/capabilities/058-mcp-and-interactive-extension-products.md#s5814).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores a server's credentials safely, starts OAuth sign-in, edits CLI registry entries and loads project-scoped servers only inside their project (apps/web/app/api/connectors/oauth/start/route.ts; apps/cli/src/mcp/mod.rs:2008-2032).

**Why it exists.** Most real MCP servers need a token or OAuth, local servers need environment values, and a team wants a server to load only in one repository. [inferred]

**Who uses it.** Developers and workspace members who connect servers that need authentication. [inferred]

**Problems it solves**

- Token handling without pasting secrets into chat.
- OAuth sign-in and revoke for remote servers.
- Repository-specific servers that should not run elsewhere.

**Use cases**

- Add a remote server with a token on web.
- Complete OAuth sign-in after adding a server that publishes a protected resource.
- agi mcp add --env KEY=VALUE for a stdio server.
- Check .mcp.json into a repo so teammates get the server after approving it.

## 2. User experience

**Where to find it**

- Web: add dialog (token field 'Token is encrypted before storage', OAuth client fields) and a 'Sign-in required' status with a connect button on the list row; Desktop (public) shows the same (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:298,728-760; packages/ui/ui/src/settings-modal/SettingsModal.tsx:732-800).
- Tauri desktop: Settings > Connectors > Tool Management tabs 'Credentials' and 'Configuration' (local servers) and the 'Sign-in required' label on cloud custom rows (apps/desktop/src/features/mcp/MCPWorkspace.tsx:120-146; apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:730).
- Mobile: add sheet field 'Auth token (optional)'; connector detail has 'Reauthorize <name>' and 'Replace the <name> API key' for directory connectors (apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:199; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:968,1001).
- CLI: agi mcp add --env/--header/--force, agi mcp login <name>, agi mcp logout <name>, /mcp reconfigure <name> <spec>; project files .mcp.json or mcp.json in the project folder, plus --mcp-config and --strict-mcp-config (apps/cli/src/lib.rs:2128-2215,402-407; apps/cli/src/repl/registry.rs:1640).
- VS Code: server row with status 'Needs sign-in' runs the login; per-project servers show 'From this workspace'; no credential or environment editing for existing servers (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:853,883-890).

**Before you start**

- Web, mobile: a server added first (F058-02).
- CLI: a registered server; for login a remote server with OAuth.
- Per-project: a .mcp.json or mcp.json file in the project folder and the user approving the server's exact launch (apps/cli/src/mcp/mod.rs:2012-2025).

**Screens and controls**

- Web: token field, OAuth client id and secret fields, sign-in consent step then provider page.
- CLI: terminal prompts and printed outcomes; logout prints whether the provider revoked the grant (apps/cli/src/lib.rs:5359-5400).
- Tauri Credentials tab: 'OAuth Connections' and 'Stored keys' sections, 'No credentials required' empty state (apps/desktop/src/features/mcp/MCPCredentialManager.tsx:389,416,536).

**Journey**

1. Enter a token or OAuth client when adding, or start sign-in later from the list row.
2. Web calls GET /api/connectors/oauth/start?connectorId=custom-<id>&mode=json and opens the provider page after a consent step (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:728-760).
3. Return to the app; the row stops showing 'Sign-in required'.
4. CLI: run agi mcp login <name>; the token is stored in the OS credential store (apps/cli/src/lib.rs:5359-5366).
5. Per-project: start the CLI in the project; approve the server at the startup review; it loads and wins over a global server of the same name.

**What the person sees and gets**

- Web: errors such as 'Use either an access token or OAuth client credentials for a custom connector, not both.' (apps/web/lib/connectors/custom-connector-creation.ts:36-37).
- CLI login: "Authorized MCP server '<name>'. The token is stored in the OS credential store."; logout explains revocation at the provider.
- CLI notice 'MCP: n server(s) not started; this workspace is not trusted. Run /trust grant to start them.' (apps/cli/src/mcp/mod.rs:2142-2152).

**Settings**

- CLI: --mcp-config FILE (repeatable), --strict-mcp-config (apps/cli/src/lib.rs:402-407).
- Web: no per-server settings page beyond credentials found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web stores a bearer token sealed (encrypted) and OAuth client id and secret at add time (apps/web/lib/connectors/custom-connector-creation.ts:96-145).
- Web starts OAuth for a custom connector through the OAuth start route (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:728).
- Web delete revokes the OAuth grant at the vendor when possible and tells the user if access may remain (apps/web/app/api/connectors/custom/route.ts:177-224).
- CLI add replaces an entry with --force and /mcp reconfigure replaces an entry; env and headers are written; file mode 0600 on unix when they exist (apps/cli/src/installs.rs:27-66; apps/cli/src/repl/registry.rs:1640).
- CLI login and logout with the OS credential store and provider revocation (apps/cli/src/lib.rs:5359-5400).
- CLI project config: project servers win over global ones, need user approval, are withheld in an untrusted workspace (apps/cli/src/mcp/mod.rs:2008-2032,2136-2152).
- VS Code lists project-scope servers from the CLI and runs login for 'Needs sign-in' servers (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:853; apps/extension-vscode/src/integrations/localRuntimeClient.ts:2192).
- Tauri desktop: credentials slots, set and delete commands and a config location command for local servers (apps/desktop/src-tauri/src/sys/commands/mcp.rs:1528,1626,1659,1247).

**Incomplete**

- Web and mobile have no way to edit an existing custom connector's address, transport or token; the route file exports only GET, POST and DELETE (apps/web/app/api/connectors/custom/route.ts:226-228). To change it the user deletes and re-adds. [inferred]
- The Tauri Configuration tab only toggles servers and shows command and arguments; it does not edit them (apps/desktop/src/features/mcp/MCPConfigEditor.tsx:100-190).
- VS Code cannot edit credentials or environment of an existing server (only add with replace).

**Present but disconnected or switched off**

- Cloud credentials and sign-in are unreachable while connectors are coming soon (apps/web/lib/connectors/custom-connector-creation.ts:65).

**Not available**

- Per-project scope on web, Desktop (hosted) and mobile (brief; no project concept found in the connector route).
- Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- The user can view and edit an existing server's configuration (URL, transport, arguments); CLI done only. (source: brief S58.04)
- The user can set environment variables for a server; CLI done, VS Code missing. (source: brief S58.05)
- The user can supply a token or OAuth sign-in and it is stored securely; VS Code missing. (source: brief S58.06)
- Servers can be configured per project so they load only in that project; web, desktop, mobile missing. (source: brief S58.14)
- Security fails closed; never commit a secret; validate at trust boundaries. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. After adding with a token, GET /api/connectors/custom never returns the token.
2. A server that publishes a protected resource and has no token is saved as signInRequired.
3. Supplying both a token and an OAuth client is refused.
4. agi mcp login stores the token in the OS credential store and agi mcp logout removes it and reports revocation.
5. A project .mcp.json server does not start until approved and does not load in another folder.
6. A project server with the same name as a global one wins.
7. agi mcp add --force replaces the entry and keeps other entries.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A web edit path (change token or URL) is required by S58.04 for parity; the brief marks only the CLI done. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an edit action on web, mobile and desktop that rotates the token without deleting the connector.
- [proposed] Allow project scope for cloud connectors by binding a connector to a project.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/connectors/custom (credentials in body) | `apps/web/app/api/connectors/custom/route.ts` | Accepts authToken, oauthClientId, oauthClientSecret. |
| service | custom-connector-crypto | `apps/web/lib/custom-connector-crypto.ts` | bearerCredential and sealCustomConnectorCredential. |
| endpoint | GET /api/connectors/oauth/start | `apps/web/app/api/connectors/oauth/start/route.ts` | Begins OAuth, returns authorizeUrl in json mode. |
| endpoint | /api/connectors/oauth/callback and /complete | `apps/web/app/api/connectors/oauth/callback` | Finishes the OAuth flow (directory listing only; contents not read). |
| service | mcp-discovery | `apps/web/lib/connectors/mcp-discovery.ts` | Checks whether a server publishes a protected resource. |
| service | oauth-access | `apps/web/lib/connectors/oauth-access.ts` | Disconnects an OAuth grant and reports vendor revocation. |
| endpoint | POST /api/connectors/[connectorId]/credentials | `apps/web/app/api/connectors/[connectorId]/credentials/route.ts` | Saves an API key for a directory connector. |
| hook | startCustomConnectorSignIn | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Consent step then OAuth window. |
| component | SettingsModal credential fields | `packages/ui/ui/src/settings-modal/SettingsModal.tsx` | Token and OAuth client inputs. |
| service | cloudConnectors (desktop) | `apps/desktop/src/api/cloudConnectors.ts` | Sign-in URL helper and create/delete calls. |
| component | MCPCredentialManager | `apps/desktop/src/features/mcp/MCPCredentialManager.tsx` | Tauri local credentials tab. |
| command | mcp_set_credential / mcp_delete_credential | `apps/desktop/src-tauri/src/sys/commands/mcp.rs` | Tauri credential storage commands. |
| component | ConnectorApiKeySheet | `apps/mobile/src/features/settings/cloud-connectors/ConnectorApiKeySheet.tsx` | Mobile API key entry for directory connectors. |
| command | McpSubcommand::Login/Logout | `apps/cli/src/lib.rs` | OAuth for remote servers in the CLI. |
| service | oauth_store | `apps/cli/src/mcp/oauth_store.rs` | CLI OAuth token storage. |
| service | load_default_mcp_configs | `apps/cli/src/mcp/mod.rs` | Merges project and global configs; project wins. |
| service | consent | `apps/cli/src/mcp/consent.rs` | Project server approval and withholding. |
| service | McpRegistry | `apps/cli/src/mcp/registry.rs` | Registry file read and write. |
| command | /mcp reconfigure | `apps/cli/src/repl/registry.rs` | Replace an entry from a session. |
| service | localRuntimeClient mcp/login | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | VS Code sign-in request to the CLI. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The user submits a token or OAuth client with the add request; the server seals the token before storage. | our servers | apps/web/lib/connectors/custom-connector-creation.ts:96-145 |
| For OAuth, the client asks the start route for an authorize URL after a consent dialog and opens it. | device and our servers | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:728-760 |
| The user signs in at the MCP server's own authorization page. | outside service | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:750 |
| The OAuth callback completes and the grant is stored; later reads show signedIn. | our servers | apps/web/app/api/connectors/custom/route.ts:60-66 (signedIn from grant summaries) |
| CLI: login opens the browser, receives the token and stores it in the OS credential store. | device | apps/cli/src/lib.rs:5359-5366 |
| CLI start-up reads project files, withholds unapproved or untrusted-workspace servers, then merges with global servers. | device | apps/cli/src/mcp/mod.rs:2008-2032 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sealed bearer token and OAuth client secret | table:user_custom_connectors (credential column name seen as credentialEnc in insert input) | yes (cloud) | Removed with the row on delete; OAuth grant revoked best effort |
| OAuth grants | connector OAuth store (apps/web/lib/connectors/oauth-store.ts; table name not traced) | cloud only | unknown |
| CLI env and headers | ~/.agiworkforce/mcp.json (plain JSON, mode 0600 on unix) | no | Removed with the entry |
| CLI OAuth token | OS credential store | no | agi mcp logout |

**Models and providers.** No model is involved. Tokens are used server-side when tools are called and are not shown to the model. [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud credentials need a signed-in account; CLI login does not need an AGI account in the code read (the OAuth is with the MCP server). |
| Permissions | Cloud: workspace policy for custom connectors and host (apps/web/lib/services/connector-policy-gate.ts). CLI: workspace administrator managed rules come first; project policy.toml applies once trusted (apps/cli/src/lib.rs:5333-5336 text). |
| Subscription | Same plan caps as F058-02 apply to cloud servers; CLI local servers have no plan rule found. |
| Limits and metering | Token 4096 chars, OAuth secret 4096, client id 512 (apps/web/lib/connectors/custom-connector-creation.ts:26-30). CLI: server name characters limited; name must not contain '__' (apps/cli/src/mcp/registry.rs:335-348). |
| Feature flags | coming_soon release state; canUseConnectors kill switch. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | CLI, VS Code and Tauri local servers keep credentials on the device. Mobile Local mode has no connector credential screen (Cloud mode required). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| sign-in required | Row shows 'Sign-in required' with a connect action; web connect starts OAuth. | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:298,662 |
| sign-in fails right after add | Row removed and hint shown unless a client id was given. | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1098-1117 |
| consent declined | Sign-in stops quietly. | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:738-739 |
| untrusted workspace | Project servers are not started; notice printed. | apps/cli/src/mcp/mod.rs:2142-2152 |
| server name with '__' | Refused because it separates server and tool in rules. | apps/cli/src/mcp/registry.rs:343-350 |
| revocation not confirmed | CLI logout and web delete tell the user to remove access at the provider. | apps/cli/src/lib.rs:5372-5390; apps/web/app/api/connectors/custom/route.ts:216-223 |
| timeout, offline, cancel | not handled in the code read beyond the error messages. | not found in files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/custom-connector-credential.test.ts`: Credential handling for custom connectors (contents not read).
- `apps/web/app/api/connectors/oauth/start/route.test.ts`: OAuth start route (contents not read).
- `apps/web/app/api/connectors/custom/route.test.ts`: Vendor revocation message on delete (describe at line 288).
- `apps/web/app/api/connectors/[connectorId]/credentials/route.test.ts`: Credential route (contents not read).
- `apps/cli/src/mcp/mod.rs`: 62 unit tests including project config server names and loading (e.g. lines 4022, 4037).
- `apps/cli/src/mcp/consent.rs`: Project server approval (file exists; tests not counted).
- `apps/extension-vscode/src/__tests__/settingsPanelLocalCapabilities.test.ts`: VS Code MCP rows (contents not read).

**Test scenarios**

- **Token never returned**
  1. Add a connector with a token.
  2. GET /api/connectors/custom.
  - Expected: Response has name, url, transport, signedIn; no token.
- **OAuth sign-in**
  1. Add a server that requires OAuth.
  2. Click connect on the row 'Sign-in required'.
  3. Approve at the provider.
  - Expected: Row becomes signed in.
- **Project scope**
  1. Create .mcp.json with a stdio server in a repo.
  2. Start the CLI in the repo; approve it.
  3. Start the CLI elsewhere.
  - Expected: Server loads in the repo only.
- **CLI logout**
  1. agi mcp login <remote>
  2. agi mcp logout <remote>
  - Expected: Message states revoked, not offered, or failed, and the token is removed.
- **Edit by re-add**
  1. agi mcp add x --url <u1>
  2. agi mcp add x --url <u2> --force
  - Expected: Entry x now points to u2.

**Where to look when it fails**

- Message 'MCP: skipped a server in <file>: ...' for a bad config (apps/cli/src/mcp/mod.rs:2989).
- Log 'project MCP servers withheld until approved' (apps/cli/src/mcp/mod.rs:2023).
- Audit events connector_added, connector_removed, connector_setting_changed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/web/058-mcp-and-interactive-extension-products.md)
- Desktop: [70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/desktop/058-mcp-and-interactive-extension-products.md)
- Mobile: [70-qa/test-plans/mobile/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/mobile/058-mcp-and-interactive-extension-products.md)
- CLI: [70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/cli/058-mcp-and-interactive-extension-products.md)
- VS Code: [70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md](../../70-qa/test-plans/vscode/058-mcp-and-interactive-extension-products.md)

## 10. Gaps and dependencies

- **No way to edit an existing cloud server's address or token; delete and re-add is the only path.** Affects: Web, Desktop (hosted), mobile. Evidence: apps/web/app/api/connectors/custom/route.ts:226-228 (GET, POST, DELETE only). Work needed: Add an update route and UI.
- **Web, desktop and mobile have no per-project scope.** Affects: Those apps. Evidence: brief S58.14; no project field in custom route. Work needed: Design a project binding for connectors.
- **Brief says VS Code lacks credentials; the code supports sign-in (login) but not editing of env or token.** Affects: VS Code. Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:853. Work needed: Update brief; decide on env editor.
- **CLI env and headers stored in a plain file, not the OS credential store.** Affects: CLI and VS Code users. Evidence: apps/cli/src/installs.rs:42-64. Work needed: Decide if secrets should go to the credential store.
- **Tauri Configuration tab is a toggle view, not an editor.** Affects: Tauri desktop. Evidence: apps/desktop/src/features/mcp/MCPConfigEditor.tsx:100-190. Work needed: Add editing or rename.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- F058-02
- table:user_custom_connectors

## Unknown

- Table name of OAuth grants and of audit events.
- Whether web has any other edit path for a custom connector (search of the route and adapter found none).
- How Electron desktop opens OAuth windows.
- Contents of most test files listed.
- Whether the VS Code settings panel can set env; found only add and enable switches.
- No docs/product or docs/decisions page was read.
