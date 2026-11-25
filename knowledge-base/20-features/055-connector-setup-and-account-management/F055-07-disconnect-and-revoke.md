---
id: "F055-07"
type: "feature"
title: "Disconnect and revoke"
aliases: ["Disconnect", "Revoke permission", "Remove connector", "Disconnect connector", "agi connectors disconnect", "agi mcp logout", "S55.22", "S55.23", "connector_removed audit event"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S55.22", "S55.23"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-shared-ui-and-design", "F055-08", "F055-10", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "table:connector_oauth_grants", "table:connector_tool_permissions", "api:DELETE /api/connectors"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-07 Disconnect and revoke

Disconnect removes a connected app (a connector) so the assistant can no longer use it. On the web service it destroys the stored sign-in, asks the provider to revoke the token, clears tool permissions and warns when the provider did not confirm. Web, Mobile and CLI each have a different confirmation step.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.22](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5522), [S55.23](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5523).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person end a connector. The server soft-revokes the stored grant (the row is marked revoked and both tokens are nulled), asks the provider to revoke the token where the provider offers revocation, clears the saved tool permissions, drops cached connection state and records an audit event (apps/web/lib/connectors/oauth-access.ts:444, apps/web/lib/connectors/oauth-store.ts:770, apps/web/app/api/connectors/route.ts:880).

**Why it exists.** A connected app holds a long-lived token to the person's data. The person must be able to end that access, and ending it should also end it at the provider where possible. The product requirement says revocation prevents later tool use (doc: docs/product/experience-contract.md W14).

**Who uses it.** Any signed-in person on a plan that includes connectors who connected an app on Web, Desktop (Electron shows the hosted web app), Mobile (Cloud mode) or the CLI. Support staff also have a revoke-connector support action (test: apps/web/lib/support/actions/__tests__/revoke-connector.test.ts).

**Problems it solves**

- A token stays valid at the provider after the person stops using the app.
- A person cannot tell whether the provider really revoked access, so the message names where to finish removal.
- Stale tool permissions would silently apply again after reconnecting, so they are cleared and the person is told if that fails.

**Use cases**

- Disconnect Notion from Settings, Connectors on the web because the work account changed.
- Disconnect a connector from the Mobile detail screen after losing a phone.
- Run agi connectors disconnect <id> in a terminal to remove a connector from the account.
- Run agi mcp logout <name> to forget and revoke a local MCP server token on the device.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron, hosted web): Settings, Connectors, open a connected connector, button 'Disconnect' (packages/ui/ui/src/directory/ConnectorDetailView.tsx:323, packages/ui/ui/src/directory/constants.ts:288).
- Mobile: Connectors, open a connected connector, bottom button 'Disconnect' (apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1177-1203).
- CLI: 'agi connectors disconnect <connector>' (apps/cli/src/lib.rs:7392) for account connectors, and 'agi mcp logout <name>' / 'agi mcp remove <name>' for local MCP servers (apps/cli/src/lib.rs:5368, 5384).
- VS Code and Chrome: not available. The brief marks them n/a.

**Before you start**

- Signed in, and the connector is currently connected.
- Mobile: Cloud mode must be active; the screen loads connections only when connectors are on, the person is signed in and Cloud mode is on (ConnectorDetailScreen.tsx:470-480).
- CLI account command: capability and privacy checks pass; Local and own-key modes are refused with a message (apps/cli/src/lib.rs:7378-7385, 2617).

**Screens and controls**

- Web detail header: a 'Disconnect' button next to the Connected state (ConnectorDetailView.tsx:323).
- Web fallback table panel only: a 'Disconnect' button that asks 'Disconnect <name>?' with the text 'The assistant will no longer be able to use <name>. You can connect it again later.' (packages/ui/ui/src/settings-modal/SettingsModal.tsx:1092-1099).
- Mobile: native alert titled 'Disconnect <name>?' with 'Cancel' and 'Disconnect' (destructive), text 'This removes the connection and its saved tool permissions from your AGI Cloud account.' (ConnectorDetailScreen.tsx:670-676).
- CLI: prompt 'Disconnect <id> from your account? Its saved sign-in and tool permissions are removed, and every surface loses it until you connect it again.' with --yes to skip (apps/cli/src/lib.rs:7394-7399).

**Journey**

1. Open the connector's detail page.
2. Press Disconnect.
3. Web live panel: the request is sent at once, with no confirmation dialog (packages/ui/ui/src/directory/DirectoryPanel.tsx:549, test packages/ui/ui/src/directory/__tests__/DirectoryPanel.test.tsx:659-673). Mobile and CLI ask first.
4. The server revokes the grant, asks the provider to revoke, clears permissions and caches.
5. The connector leaves the connected list. If the provider did not confirm, a warning explains where to finish removal.

**What the person sees and gets**

- Web: a warning toast that stays until dismissed when the provider did not confirm (apps/web/features/connectors/hooks/use-connectors.ts:143-148). Text: 'Disconnected here, but <provider> did not confirm that it revoked access, so access may remain until you remove it at <manage link or in your <provider> account settings>.' (apps/web/lib/connectors/oauth-access.ts:476-490).
- Mobile: alert '<name> disconnected' with the notice, then the app returns to the connector list; failure shows 'Could not disconnect' / 'The connector is still connected.' (ConnectorDetailScreen.tsx:686-694).
- CLI: 'Disconnected <id> from your account.' plus the notice; declining prints 'Left <id> connected.' (apps/cli/src/cloud/connectors.rs, apps/cli/src/lib.rs:7400).
- CLI mcp logout prints one of three results: revoked at provider, provider offers no revocation endpoint, or provider did not confirm (apps/cli/src/lib.rs:5372-5382).

**Settings**

- Use in chats switch per connector ('When off, AGI cannot use this connector in any chat.') is a softer alternative to disconnecting (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:89-90).
- No setting changes Disconnect behaviour.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web service DELETE /api/connectors?connectorId= handles OAuth grants, GitHub App installations, directory records and custom connectors, with CSRF, rate limit and workspace access gate (apps/web/app/api/connectors/route.ts:880-897).
- Grant removal is atomic: rows are locked, then marked revoked with both tokens nulled, and only the locked rows are touched (apps/web/lib/connectors/oauth-store.ts:770-810). Pending authorizations are cancelled first (apps/web/lib/connectors/oauth-access.ts:444-452).
- Provider revocation is best effort and never throws: the result is revoked, nothing-to-revoke or not-revoked with reason and an optional manage link (apps/web/lib/connectors/oauth-access.ts:284-296, 343-362); the manage link exists only for discovered MCP grants (oauth-access.ts:313-341).
- Tool permissions are cleared and a failure is reported as a notice (route.ts:862-865); caches are evicted and the audit event connector_removed carries a vendor status (route.ts:915-933).
- GitHub: the App installation is revoked at GitHub first; on failure the connector stays connected and the API answers 502 or 503 (route.ts:935-985).
- Disconnect is not blocked by the connectors release switch: the DELETE handler checks only access and CSRF (route.ts:880-897) [inferred from reading the handler; no assertConnectorsReleased call].
- Mobile: confirmation alert, then the shared client runtime DELETE (packages/client/client-runtime/src/connectors/runtime.ts:342-349; apps/mobile/services/connectors.ts:160).
- CLI: agi connectors disconnect asks first, refuses to proceed non-interactively without --yes, and treats success false as an error (apps/cli/src/lib.rs:2573-2600, apps/cli/src/cloud/connectors.rs).
- CLI agi mcp logout revokes the stored token at the provider with a 30 second limit, then deletes the local token (apps/cli/src/mcp/mod.rs:1331-1375, crates/agiworkforce-mcp/src/oauth/flow.rs:786).

**Incomplete**

- The HTTP result carries only success and an optional vendorNotice string, so a client cannot tell 'revoked' from 'nothing to revoke'; both show no message (apps/web/lib/connectors/oauth-access.ts:476-490, apps/web/features/connectors/hooks/use-connectors.ts:143-148). The brief expects the three outcomes to be reported.
- Web and Desktop Disconnect has no confirmation in the live directory panel, although the fallback panel has one (DirectoryPanel.tsx:549 vs SettingsModal.tsx:1092). AGENTS.md section 9 requires the shared confirm primitive for an action the user cannot undo.
- Mobile uses a native alert instead of the shared useConfirmAction primitive (ConnectorDetailScreen.tsx:670); acceptable on a native surface [inferred], but it is a different primitive.
- agi mcp logout and agi mcp remove run without a confirmation prompt (apps/cli/src/lib.rs:5368-5395).

**Present but disconnected or switched off**

- Internal Tauri desktop build: the connectors store calls the local command mcp_oauth_disconnect, which removes the local MCP server, local tokens and saved key and emits connector:disconnected; the lines read show no call to ask the provider to revoke (apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1521-1612, apps/desktop/src/stores/connectorsStore.ts:58). Tauri is retained internal code, not the public Desktop (AGENTS.md section 5).
- Connectors are released only for 13 listed ids; the global state is coming_soon (packages/contracts/types/src/connector-release.ts:12-27). Disconnect still works for rows that exist.

**Not available**

- VS Code and Chrome: no disconnect control (brief marks n/a).
- Disconnecting a single account of a connector: the store functions accept an account key but no route or screen passes one (apps/web/lib/connectors/oauth-access.ts:444, apps/web/app/api/connectors/route.ts:880).

## 4. Required behaviour

**Established requirements**

- Disconnect removes the stored grant and the connector is no longer available to the assistant. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.22)
- Revoking removes the stored grant and asks the provider to revoke the token. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.23)
- Revocation prevents subsequent tool use, and a revoked connector can be reconnected. (source: doc: docs/product/experience-contract.md W14)
- Revocation, policy changes and account switching must converge on every Cloud surface. (source: doc: docs/product/experience-contract.md line 36-38)
- The connectors settings must include Disconnect/uninstall. (source: doc: docs/product/requirements.md section 16.7)
- An action a user cannot undo asks first, names the consequence, and uses useConfirmAction in @agiworkforce/ui. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Pressing Disconnect on web shows a confirmation that names what stops working before any request is sent.
2. After confirming, GET /api/connectors no longer lists the connector and the next chat turn cannot call its tools.
3. When the provider offers revocation, the grant row has revoked_at set and both token columns null.
4. When the provider does not confirm revocation, the person sees a notice that says where to remove access (manage link or account settings).
5. Saved tool permissions for the connector are gone after disconnect; if clearing fails the person is told.
6. Mobile and CLI ask before disconnecting; CLI without --yes and without a terminal refuses.
7. A GitHub disconnect that cannot revoke the App installation leaves the connector connected and shows the error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The web result should report all three revocation outcomes, not only the failure one [inferred from brief S55.23].
- Disconnect should work when connectors are switched off globally so people can always remove access [inferred from the handler having no release check].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Route the web Disconnect through useConfirmAction in DirectoryPanel, using the wording already used in SettingsModal.
- [proposed] Return the revocation status in the DELETE response and show 'Access revoked at <provider>' on success.
- [proposed] Add a confirmation to agi mcp logout and agi mcp remove, or document why local token removal is exempt.
- [proposed] Call the provider revocation endpoint from the Tauri disconnect path or document that the internal build skips it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ConnectorDetailView | `packages/ui/ui/src/directory/ConnectorDetailView.tsx` | Renders the Disconnect button in the header (line 323) and Reconnect when the grant needs reauthorization. |
| component | DirectoryPanel remove handler | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Line 549: remove calls adapter.uninstall directly with no confirmation. |
| component | SettingsModal ConnectorDetail | `packages/ui/ui/src/settings-modal/SettingsModal.tsx` | Fallback connectors panel whose Disconnect asks for confirmation (line 1092). |
| hook | useDirectoryAdapter uninstall | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Line 1506: routes the connectors section to onDisconnectConnector. |
| hook | useConnectorsSettingsAdapter.disconnectConnector | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Line 998: DELETE call for GitHub, custom and catalog connectors, then shows the vendor notice. |
| hook | announceVendorNotice | `apps/web/features/connectors/hooks/use-connectors.ts` | Line 143: keeps a warning toast until dismissed when the provider did not confirm. |
| endpoint | DELETE /api/connectors | `apps/web/app/api/connectors/route.ts` | Line 880: orchestrates grant removal, provider revocation, permission clearing, cache purge and audit. |
| service | disconnectConnectorOAuthGrant | `apps/web/lib/connectors/oauth-access.ts` | Line 444: capture and revoke locally, then ask providers; also vendorRevocationNotice (476) and revokeAllConnectorTokensAtProviders (411, account erasure). |
| store | captureAndRevokeConnectorOAuthGrants | `apps/web/lib/connectors/oauth-store.ts` | Line 770: locks and soft-revokes grant rows in one transaction. |
| table | connector_oauth_grants | `apps/web/db/neon/0097_connector_oauth_broker.sql` | Settled grants; a revoked row holds no secret (migration comment). |
| table | connector_tool_permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Saved verdicts that disconnect clears. |
| table | github_installations | `apps/web/app/api/connectors/route.ts` | Rows deleted after the GitHub App installation is revoked (line 935 onward). |
| event | connector_removed audit event | `apps/web/app/api/connectors/route.ts` | Recorded with status vendor_revoked, vendor_nothing_to_revoke, vendor_revocation_failed or vendor_offers_no_revocation. |
| screen | ConnectorDetailScreen disconnect | `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx` | Line 666: confirmation alert, disconnect call, notice, navigation back. |
| service | connector runtime disconnect | `packages/client/client-runtime/src/connectors/runtime.ts` | Line 342: local bridge when present, otherwise DELETE; parses the result. |
| service | mobile connectors service | `apps/mobile/services/connectors.ts` | Line 160 disconnectConnector and line 189 deleteCustomConnector. |
| store | desktop connectorsStore | `apps/desktop/src/stores/connectorsStore.ts` | Line 58 and 234: internal Tauri build disconnects through the local MCP host. |
| command | mcp_oauth_disconnect | `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs` | Line 1521: Tauri command that removes local server, tokens and saved key. |
| command | agi connectors disconnect | `apps/cli/src/lib.rs` | Line 7392 handler with confirm_destructive (2573); subcommand defined at 1275. |
| service | CLI cloud connectors client | `apps/cli/src/cloud/connectors.rs` | DisconnectReceipt, disconnect and notice printing. |
| command | agi mcp logout | `apps/cli/src/lib.rs` | Line 5368: prints the three revocation outcomes. |
| service | logout_from_remote_server | `apps/cli/src/mcp/mod.rs` | Line 1331 and revoke_at_provider 1359 with a 30 second limit. |
| service | revoke_token | `crates/agiworkforce-mcp/src/oauth/flow.rs` | Line 786: RFC style revocation request for MCP OAuth tokens. |
| test | connector disconnect tests | `apps/web/app/api/connectors/route.test.ts` | Disconnect, vendor notice and permission-clear cases (lines 708, 730, 1076, 1110). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Disconnect; on web the hook sends DELETE /api/connectors?connectorId=<id> with a CSRF token. | device | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1045-1052 |
| Server checks sign-in, CSRF, rate limit and workspace access. | our servers | apps/web/app/api/connectors/route.ts:880-897 |
| Server cancels pending authorizations, locks and soft-revokes the grant rows (tokens nulled), returning the captured tokens. | our servers | apps/web/lib/connectors/oauth-access.ts:444-461, apps/web/lib/connectors/oauth-store.ts:770-810 |
| Server asks the provider's revocation endpoint to revoke each captured token; a refusal, timeout or missing endpoint is reported, not thrown. | outside service | apps/web/lib/connectors/oauth-access.ts:313-341, 376-400 |
| Server evicts cached connections, purges cached MCP responses, deletes saved tool permissions and writes the audit event. | our servers | apps/web/app/api/connectors/route.ts:915-933 |
| Response {success, vendorNotice?} returns; the client removes the row and shows a persistent warning if a notice came back. | device | apps/web/features/connectors/hooks/use-connectors.ts:143-148 |
| CLI account path: after the prompt, the CLI sends the same DELETE to the service; the MCP path revokes at the provider from the device and deletes the local token. | device and our servers | apps/cli/src/cloud/connectors.rs (disconnect), apps/cli/src/mcp/mod.rs:1331-1349 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| OAuth grant (encrypted access and refresh token, account key and label) | table connector_oauth_grants on the account database | Account level: every Cloud surface reads the same row | Row kept as revoked_at with tokens nulled; a database check forbids a revoked row holding a secret (apps/web/db/neon/0097_connector_oauth_broker.sql comment) |
| Per-tool permission verdicts | table connector_tool_permissions | Account level | Deleted on disconnect; a failure to delete produces a notice (route.ts:862) |
| Audit record connector_removed with vendor revocation status | security audit log | Server only | Retention not established in the files read |
| MCP OAuth token on the CLI | OS credential store (store:keyring) with an owner-only file fallback | No, stays on the device | Deleted by agi mcp logout after the revoke attempt (apps/cli/src/mcp/mod.rs:1334-1342, apps/cli/src/mcp/oauth_store.rs) |

**Models and providers.** No model takes part. The connector provider (for example Notion or Google) is contacted only for token revocation. AI inference providers are not involved. SYS-connectors-plugins-and-skills owns the connector runtime.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required on every path. CLI account commands refuse Local and own-key modes (apps/cli/src/lib.rs:2617 and 7378). |
| Permissions | Rows are scoped to the user through getUserScopedDb; CSRF and workspace access gate apply (route.ts:880-897). An admin-shared organization connector is a separate path not read here. |
| Subscription | The connectors capability is tied to plans basic, pro, max, max_15x, team, team_premium and enterprise (packages/contracts/types/src/billing-catalog.ts:332-351). The DELETE handler reads no plan or release check (route.ts:880-897). |
| Limits and metering | Rate limit bucket on the DELETE route (route.ts:886-887). No usage metering for disconnect found. |
| Feature flags | Global connector release state is coming_soon with 13 ids released (packages/contracts/types/src/connector-release.ts:12-27); the web connect path and tools are gated, disconnect is not. |
| Model compatibility | none found in the code |
| Provider restrictions | Revocation works only where the provider publishes a revocation endpoint; otherwise the notice tells the person to remove access at the provider. |
| Local mode | Mobile loads connections only in Cloud mode (ConnectorDetailScreen.tsx:470-480), so Local mode has no Disconnect here. CLI account commands refuse Local mode. CLI agi mcp logout and remove work on-device in any mode. Internal Tauri build disconnects through the local MCP host without a Cloud call (packages/client/client-runtime/src/connectors/runtime.ts:342-346). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web: row busy while the request runs. Mobile: button shows 'Disconnecting…' and is disabled. | ConnectorDetailScreen.tsx:1177-1203; packages/ui/ui/src/directory/DirectoryPanel.tsx:349-370 |
| Provider did not confirm or has no revocation endpoint | Disconnect still succeeds locally; notice says access may remain and where to remove it. | apps/web/lib/connectors/oauth-access.ts:476-490 |
| Revocation lookup fails | Treated as not revoked with reason failed; the local copy is still destroyed. | apps/web/lib/connectors/oauth-access.ts:376-390 |
| Permissions could not be cleared | Disconnect succeeds with an added notice: reconnecting may reuse them, reset them under Settings, Connections. | apps/web/app/api/connectors/route.ts:862-875 |
| GitHub App cannot be revoked | Nothing is disconnected; 502 retryable or 503 not retryable; critical audit event. | apps/web/app/api/connectors/route.ts:935-985 |
| Request fails | Web throws 'Could not disconnect. Try again.'; Mobile alert 'The connector is still connected.' | useConnectorsSettingsAdapter.tsx:1053-1055; ConnectorDetailScreen.tsx:690-694 |
| Cancel | Mobile Cancel and CLI declined prompt leave the connector connected. Web live panel has no cancel step. | ConnectorDetailScreen.tsx:673; apps/cli/src/lib.rs:7400 |
| Offline | not handled in the code beyond the generic failure message | searched the paths above |
| Account switched while the call runs (mobile) | Results are ignored when the cloud account epoch changed. | ConnectorDetailScreen.tsx:667-699 |
| Non-interactive CLI | Refuses without --yes and prints that nothing was deleted. | apps/cli/src/lib.rs:2584-2600 |
| Accessibility | Mobile button has role and label 'Disconnect <name>' and a disabled state. | ConnectorDetailScreen.tsx:1177-1183 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/route.test.ts`: DELETE: revoke grant, close live handle, clear verdicts; notice when verdicts not cleared; directory record disconnect; notice when vendor could not revoke.
- `apps/web/lib/connectors/__tests__/oauth-access.test.ts`: disconnectConnectorOAuthGrant outcomes: no endpoint, refresh token revoked after local removal, one account only, already disconnected, erasure revocation.
- `apps/web/app/api/github/installations/route.disconnect.test.ts`: GitHub installation disconnect route.
- `packages/ui/ui/src/directory/__tests__/DirectoryPanel.test.tsx`: Disconnect calls uninstall immediately (line 659-673); documents the missing confirmation.
- `apps/mobile/__tests__/ConnectorDetail.test.tsx`: Disconnect stays behind a destructive confirmation; provider notice when revocation was not confirmed (lines 346, 369).
- `apps/cli/src/cloud/connectors.rs`: Rust unit tests in the file: provider warning reaches the message, controls stripped, unconfirmed receipt is an error.
- `apps/desktop/src/stores/__tests__/connectorsStore.test.ts`: Internal desktop store connect flow; disconnect coverage not confirmed.
- `apps/web/lib/support/actions/__tests__/revoke-connector.test.ts`: Support revoke action.

**Test scenarios**

- **Web disconnect with a revocable provider**
  1. Connect a connector whose provider has a revocation endpoint.
  2. Open its detail page and press Disconnect.
  3. Reload Connectors.
  - Expected: Connector is gone; connector_oauth_grants row has revoked_at set and null tokens; no warning toast; connector_removed audit status vendor_revoked.
- **Provider without revocation**
  1. Disconnect a connector whose provider publishes no revocation endpoint.
  - Expected: Disconnect succeeds and a persistent warning names the provider or manage link.
- **Confirmation on web**
  1. Press Disconnect in Settings, Connectors on web and Desktop (Electron).
  - Expected: Required: a dialog naming what stops working. Current code sends the request at once, so this scenario is expected to fail until fixed.
- **Tool use after disconnect**
  1. Disconnect a connector.
  2. Ask the assistant to use it.
  - Expected: Chat shows a connect card (not_connected) and no connector call is made.
- **CLI account disconnect without a terminal**
  1. Run agi connectors disconnect <id> with stdin closed and no --yes.
  - Expected: Nothing is deleted and the warning asks for --yes.
- **CLI mcp logout outcomes**
  1. Run agi mcp logout <name> for a server that offers revocation, one that does not, and one that fails.
  - Expected: Three different messages as printed at lib.rs:5372-5382.

**Where to look when it fails**

- Log lines: '[connector-oauth] the provider did not confirm revocation; access may remain there' and '[connector-oauth] provider-side revocation could not be attempted; revoking locally' (apps/web/lib/connectors/oauth-access.ts).
- Audit event connector_removed with detail.status values vendor_*.
- Table connector_oauth_grants (revoked_at, token columns), connector_tool_permissions, github_installations.
- Error name ConnectorGrantDecryptionError makes a grant read as needing reauthorization.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)
- Mobile: [70-qa/test-plans/mobile/055-connector-setup-and-account-management.md](../../70-qa/test-plans/mobile/055-connector-setup-and-account-management.md)
- CLI: [70-qa/test-plans/cli/055-connector-setup-and-account-management.md](../../70-qa/test-plans/cli/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **Web and Desktop (Electron) Disconnect fires without a confirmation naming the consequence.** Affects: Web and Desktop Electron users. Evidence: packages/ui/ui/src/directory/DirectoryPanel.tsx:549; packages/ui/ui/src/directory/__tests__/DirectoryPanel.test.tsx:659-673; AGENTS.md section 9. Work needed: Wrap remove in useConfirmAction with destructive copy and update the test.
- **The API result cannot distinguish revoked from nothing-to-revoke.** Affects: All clients. Evidence: apps/web/lib/connectors/oauth-access.ts:476-490; DisconnectResponse carries only vendorNotice. Work needed: Add a vendorRevocation field to the response contract and show it.
- **Internal Tauri disconnect does not ask the provider to revoke (in the code read).** Affects: Internal Tauri desktop build. Evidence: apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1521-1612. Work needed: Confirm the intent; add revocation or document that it is local only.
- **agi mcp logout and remove have no confirmation.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:5368-5395. Work needed: Decide whether token removal needs the shared destructive prompt.
- **Brief line citations for CLI (lib.rs:2571, 4254, 1337) and mobile (352, 588) no longer point at disconnect code.** Affects: Documentation. Evidence: apps/cli/src/lib.rs:2573 is confirm_destructive; mobile disconnect is at line 666. Work needed: Refresh the brief citations.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-shared-ui-and-design
- F055-08
- F055-10
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- table:connector_oauth_grants
- table:connector_tool_permissions
- api:DELETE /api/connectors

## Unknown

- Whether the audit log has a retention period (not in files read).
- Whether Desktop Electron has any shell-level override of Disconnect (only hosted web path read).
- How the organization-shared connector is disconnected by a member (apps/web/app/api/settings/organization/shared/connectors path not read).
- Where the 'Use in chats' state is stored (route apps/web/app/api/connectors/account-state/route.ts not read to the table).
- Whether the Tauri store ever shows a confirmation (apps/desktop/src connectors gallery not read).
