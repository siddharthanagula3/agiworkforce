---
id: "F055-06"
type: "feature"
title: "Connection health, test and reconnect"
aliases: ["Connection health", "Connector health", "Test connection", "Reconnect", "Reauthorize", "Needs reconnecting", "Not responding", "Connector health dashboard", "S55.18", "S55.20", "S55.21"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S55.18", "S55.20", "S55.21"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "F055-03", "F055-05", "SYS-connectors-plugins-and-skills", "SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "table:connector_call_events", "table:connector_oauth_grants"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-06 Connection health, test and reconnect

Shows whether each connection works (connected, needs reconnecting, not responding) and lets the person re-run sign-in with Reconnect. Health comes from the account's own recent calls; the server does not probe on its own. A true on-demand Test exists only through the key form and the live tools list; Mobile intentionally has no test button.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.18](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5518), [S55.20](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5520), [S55.21](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5521).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Marks each connected row with a state: connected, needs-reauthorization or not-responding, and offers a call-based Connector health panel with Responding, Degraded, Not responding or Not called yet. Reconnect restarts authorization. (apps/web/app/api/connectors/route.ts:338-358; apps/web/lib/connectors/health.ts:77-140)

**Why it exists.** Connections expire or the provider fails; a person must see that and fix it without guessing. Brief S55.18, S55.20, S55.21 require health, reconnect and a test (doc: area brief). Decision D-2026-09-28-24 says reconnecting does not resume the turn (doc: docs/decisions/2026-09-27-founder-decisions.md:353-359).

**Who uses it.** Any person with connected apps; support staff reading the call log.

**Problems it solves**

- Silent breakage: expired grants and failing providers show a warning label. (useConnectorsSettingsAdapter.tsx:690-706)
- Hammering a failing provider: calls pause with exponential back-off after failures. (apps/web/lib/connectors/health.ts:74-80)
- Missed expiry: a notification 'Reconnect <name>' is recorded when a grant is dropped. (apps/web/lib/connectors/oauth-access.ts:39-52)

**Use cases**

- Row shows 'Needs reconnecting'; person presses Reconnect.
- Person opens Connector health to see failures and latency.
- A chat tool call returns a reconnect card; person reconnects then asks again.
- CLI user sees 'needs reconnecting: open <url>'.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Connectors; row button 'Reconnect' (packages/ui/ui/src/settings-modal/SettingsModal.tsx:232-244); detail primary button 'Reconnect' (ConnectorDetailView.tsx:304-307); panel 'Connector health' with Refresh (ConnectorHealthDashboard.tsx:20-27).
- Mobile: connector detail, card 'Connection health' with 'Check again', banner 'Not responding', button 'Reauthorize' (ConnectorTrustSections.tsx; ConnectorDetailScreen.tsx:808-995).
- CLI: `agi connectors` prints state per connector (cloud/connectors.rs:176-215); REPL `/mcp info <server>` reports responding or not responding (registry.rs:1686-1710).
- VS Code: tree item description 'Connected', 'Needs reauthorization' or 'Not responding'; command Code: Refresh Connectors (connectorPresentation.ts:8-26; package.json:728-731).
- Chrome: not covered.

**Before you start**

- A connected connector.
- Reconnect needs the same prerequisites as Connect (F055-03).

**Screens and controls**

- Web row warning label (reauthorization or not-responding copy), Reconnect button.
- Reconnect notice 'X needs reconnecting. Its tools stop until you do; its settings are kept.' (constants.ts:263-265).
- Health panel rows: state label, summary '<n> calls, <k> failed, typically <time>', pause sentence, Refresh and Retry.
- Capabilities panel on the detail page acts as a live check of the server's tools.
- API key form 'Test and replace' for a key connector.

**Journey**

1. Open Settings, Connectors; look at the status beside each connector.
2. If it says needs reconnecting, press Reconnect.
3. Allow in the consent dialog and sign in at the provider (F055-03 flow).
4. Return; the row returns to Connected.
5. Open 'Connector health' and press Refresh to reread recent calls.

**What the person sees and gets**

- State labels Responding, Degraded, Not responding, Not called yet; explanation 'Measured from this account's own recent calls...' (connector-trust-copy.ts:152-163).
- 'No connector has been called in the last hour, so there is nothing to measure.' (ConnectorHealthDashboard.tsx:22).
- Pause sentences 'Paused after N failures in a row...' (connector-trust-copy.ts:174-182).
- Chat card headline 'Reconnect <name>' (ConnectorConnectCard.tsx:15-23).
- CLI notice 'X needs reconnecting before <tool> can run. Open <url> to reconnect it, then ask again...' (cloud/connectors.rs:26-34).

**Settings**

- Settings and per-tool permissions are kept on reconnect according to the on-screen copy; see gaps for what the code shows.
- Tool approvals default and Block rules are enforced server side (consent point two).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Row health: needs-reauthorization when no refresh token and access token expired; not-responding from recent failures; custom rows use the same. (oauth-store.ts:574-580; apps/web/app/api/connectors/route.ts:338-358)
- Call-based health with states, p50 and p95 latency, back-off circuit; window one hour, not-responding after 3 failures in a row within 30 minutes, degraded above 25 percent failures. (health.ts:25-36,100-125; connector-call-log-service.ts:37-38)
- GET /api/connectors/health returns per-connector summaries, filterable by connectorId. (apps/web/app/api/connectors/health/route.ts:17-34)
- Reconnect button on Web rows and detail runs the connect flow again, with consent. (SettingsModal.tsx:232-244; ConnectorDetailView.tsx:264-266,304-307)
- Failed refresh drops the grant and records a Reconnect notification once per day per connector. (oauth-access.ts:215,229,267,39-52)
- Mobile health card and Reauthorize button. (ConnectorDetailScreen.tsx:957-995)
- CLI reconnect notice from tool results. (cloud/connectors.rs:57-83)

**Incomplete**

- The brief asks for a live check of Reconnect on web and Electron; no record of one exists. (area brief S55.20 Unfinished)
- No active probe: health is measured only from calls, so a never-called connector shows Not called yet. (health.ts:20-24)
- After a dropped grant the connector no longer lists as connected, so the person sees Connect, not Reconnect; whether per-tool settings survive was not traced. (oauth-store.ts:595-603,715-760)
- CLI health compare uses the text 'healthy' but the server sends 'connected', 'not-responding' or 'needs-reauthorization', so a healthy row prints 'connected since <date>, connected'. [inferred from cloud/connectors.rs:201-205 and packages/contracts/types/src/connector-vocabulary.ts:4-11]

**Present but disconnected or switched off**

- Reconnect needs a released connector; unreleased ones refuse at the gate. (connector-policy-gate.ts:146-153)

**Not available**

- Mobile has no Test connection button by decision. (doc: docs/decisions/2026-09-27-founder-decisions.md:441-446)
- VS Code: no reconnect or test; 'Connecting and disconnecting happen in the browser' (connectorPresentation.ts:68-69).
- Chrome: not covered.
- Automatic resume of the interrupted chat turn after reconnect is declined. (founder decisions:353-359)

## 4. Required behaviour

**Established requirements**

- Each connector shows whether it is healthy, needs reauthorization or is not responding. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.18)
- An expired or revoked connection offers Reconnect that re-runs authorization. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.20)
- The user can run an on-demand check and see the result. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.21)
- Web and Electron: Reconnect shows beside Disconnect, re-runs OAuth, settings and tool permissions persist, chat shows the agi_reconnect card (live check pending). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.20)
- The chat card offers Reconnect and Retry; there is no automatic resume of the turn. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:353-359)
- Phone apps get no connection test button. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:441-446)

**Acceptance criteria**

1. A grant with expired token and no refresh token shows Needs reconnecting and a Reconnect button on Web and Desktop.
2. Pressing Reconnect shows the consent dialog and then the provider sign-in; after return the row shows Connected.
3. After three failed calls in a row within 30 minutes the Connector health panel shows Not responding with a pause sentence.
4. With no calls in an hour the panel shows 'Not called yet' or the empty message.
5. A tool call on an expired grant makes the chat show a 'Reconnect <name>' card; after reconnecting and asking again the tool runs.
6. `agi connectors` shows 'needs reconnecting: open <url>' for an expired grant.
7. On Mobile an expired OAuth grant shows a Reauthorize button that opens authorization.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Reconnect keeps settings only while the grant row still exists; after a drop the row is revoked, so the claim needs a live check.
- [inferred] The health pause is a server back-off; a person cannot clear it other than by waiting or a success.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Test button on Web that makes a harmless call and records it in the log.
- [proposed] Fix the CLI health string match to the server's vocabulary.
- [proposed] Keep a dropped grant visible as Needs reconnecting instead of removing it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:GET /api/connectors | `apps/web/app/api/connectors/route.ts` | Row health, needsReauthorization, pending authorizations. |
| endpoint | api:GET /api/connectors/health | `apps/web/app/api/connectors/health/route.ts` | Call-based health summaries. |
| service | connector health | `apps/web/lib/connectors/health.ts` | Windows, thresholds, back-off, state derivation. |
| service | connector call log | `apps/web/lib/services/connector-call-log-service.ts` | Records and reads calls; failure streak and recency constants. |
| table | table:connector_call_events | `apps/web/lib/services/connector-call-log-service.ts` | Call events behind health. |
| service | oauth-access | `apps/web/lib/connectors/oauth-access.ts` | Refresh, drop grant, notify reconnect. |
| service | oauth-store | `apps/web/lib/connectors/oauth-store.ts` | needsReauthorization derivation and revoke. |
| service | resolveConnectorHealth | `packages/client/client-runtime/src/connectors/policy.ts` | Shared mapping to connected, needs-reauthorization, not-responding. |
| component | ConnectorHealthDashboard (Web) | `apps/web/features/connectors/components/ConnectorHealthDashboard.tsx` | Connector health panel. |
| component | SettingsModal reconnect button | `packages/ui/ui/src/settings-modal/SettingsModal.tsx` | Row Reconnect control. |
| component | ConnectorDetailView | `packages/ui/ui/src/directory/ConnectorDetailView.tsx` | Reconnect primary action and notice. |
| hook | useConnectorsSettingsAdapter | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Warning labels and connect re-run. |
| component | ConnectorConnectCard | `packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx` | Chat card to connect or reconnect. |
| service | connect-required | `apps/web/lib/connectors/connect-required.ts` | Tool result text telling the model to ask for reconnect. |
| component | ConnectorHealthCard (Mobile) | `apps/mobile/src/features/settings/cloud-connectors/ConnectorTrustSections.tsx` | Mobile health card with Check again. |
| screen | ConnectorDetailScreen | `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx` | Reauthorize and not-responding banners. |
| service | CLI connectors client | `apps/cli/src/cloud/connectors.rs` | List with state, reconnect notice. |
| command | /mcp info | `apps/cli/src/repl/registry.rs` | Responding check of a registered MCP server. |
| service | VS Code presentation | `apps/extension-vscode/src/features/connectors/connectorPresentation.ts` | Health faces and labels. |
| component | ConnectorCapabilitiesPanel | `apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx` | Live capability discovery as a check. |
| service | notification service | `apps/web/lib/services/notification-service.ts` | Stores the Reconnect notification. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Every connector tool call writes an outcome (ok, failed, blocked) with duration to the call log. | our servers | apps/web/lib/connectors/health.ts:1-24; connector-call-log-service.ts:56 |
| GET /api/connectors reads grants and the failed-call set, then sets health per row. | our servers | apps/web/app/api/connectors/route.ts:330-358 |
| Client turns needs-reauthorization or not-responding into warning rows with Reconnect. | device | useConnectorsSettingsAdapter.tsx:690-706 |
| Before a tool call our server resolves the access token; near expiry it refreshes at the provider under a lock. | our servers | oauth-access.ts:84-130,160-175 |
| If refresh is impossible or rejected, the grant is revoked and a Reconnect notification is stored; the tool result tells the chat to ask for reconnect. | our servers | oauth-access.ts:215,229,267,39-52; connect-required.ts:38-42 |
| Reconnect on the client reruns connect: consent, oauth/start, provider, callback. | device and our servers | useConnectorsSettingsAdapter.tsx:757-870 |
| Health panel reads /api/connectors/health and shows state and latency. | device and our servers | ConnectorHealthDashboard.tsx:68-83 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector call events (connector, outcome, duration, time) | table connector_call_events | Server | Health reads the last hour (health.ts); table retention unknown |
| Reconnect notification | notifications store via recordNotification, deduped per connector per day | Server | unknown |
| Grant state (revoked_at, tokens nulled) | table connector_oauth_grants | Server | Token fields erased on drop (oauth-store.ts:729-736) |

**Models and providers.** No language model decides health. The chat model only receives the tool result text asking the person to reconnect. (connect-required.ts:38-42)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; health and accounts are per user (getUserScopedDb in health/route.ts:21). |
| Permissions | Personal; no admin role. |
| Subscription | Same connectors capability; a plan-locked person still sees connected rows and can disconnect (connectors-directory.ts:961-966); reconnect on a plan-locked account is refused by the gate (connector-policy-gate.ts:180-195). |
| Limits and metering | Outbound limit 60 calls per 60 s per connector and back-off from 2 s up to 5 min (health.ts:28-32). Health route uses bucket chat-conversation. |
| Feature flags | Release constant; kill-switch canUseConnectors. |
| Model compatibility | none found in the code. |
| Provider restrictions | Reconnect for a header-key connector sends the person to the key form instead of OAuth (oauth/start/route.ts:96-103,223-240). |
| Local mode | Cloud health only; no local health. Mobile Local mode hides the screen. CLI `/mcp info` checks a locally registered server in the current session. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Health panel 'Reading connector health'; Mobile 'Checking...'. | ConnectorHealthDashboard.tsx:21; ConnectorTrustSections.tsx |
| Empty | No calls in last hour message; Mobile 'Not called in the last hour.' | ConnectorHealthDashboard.tsx:22 |
| Error | 'Connector health could not be read.' with Retry; Mobile same sentence. | ConnectorHealthDashboard.tsx:21-23 |
| Needs reauthorization | Warning label and Reconnect; tools stop. | useConnectorsSettingsAdapter.tsx:690-706; constants.ts:263-265 |
| Not responding | Warning label; Mobile banner with 'Check again' that reloads data, not a probe. | ConnectorDetailScreen.tsx:808-855 |
| Refresh transient failure | Status unreachable; reconnecting is not asked; no drop. | oauth-access.ts:149-165,236-250 |
| Undecryptable grant | Ask to reconnect. | oauth-access.ts:100-110 |
| Cancel reconnect | Deny in dialog or provider denial leaves the state unchanged. | useConnectorsSettingsAdapter.tsx:812-813; finish-authorization.ts:88-91 |
| Electron return | List reloads on window focus. | open-connector-authorization.ts:44 |
| Offline | Not handled in the code beyond generic fetch errors. | searched health components |
| Accessibility | Reconnect button has aria-label 'Reconnect <name>' and aria-busy; Mobile Reauthorize has accessibilityState. | SettingsModal.tsx:232-238; ConnectorDetailScreen.tsx:965-970 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/health.test.ts`: Health derivation (by file name).
- `apps/web/app/api/connectors/health/route.test.ts`: Health route (by file name).
- `apps/web/lib/services/__tests__/connector-call-log-service.test.ts`: Call log service (by file name).
- `apps/web/lib/connectors/__tests__/oauth-access.test.ts`: Token refresh and reauthorization outcomes (by file name).
- `apps/web/app/api/connectors/oauth/start/route.credential-reconnect.test.ts`: Reconnect of a key connector (by file name).
- `packages/ui/unified-chat/src/components/__tests__/ConnectorConnectCard.test.tsx`: Chat connect card (by file name).
- `packages/ui/ui/src/directory/__tests__/ConnectorDetailView.test.tsx`: Detail view incl. primary actions (by file name).
- `apps/mobile/__tests__/ConnectorOauthReauthorize.test.tsx`: Mobile reauthorize (by file name).
- `apps/mobile/src/features/settings/cloud-connectors/__tests__/ConnectorTrustSections.test.tsx`: Mobile health card (by file name).
- `apps/extension-vscode/src/__tests__/connectorsView.test.ts`: VS Code health faces (by file name).
- `apps/cli/src/cloud/connectors.rs`: Rust unit tests inside the file; those read cover disconnect receipt text only, not health or reconnect rendering.

**Test scenarios**

- **Reconnect expired grant on Web**
  1. Use an OAuth connector whose access token expired with no refresh token.
  2. Open Settings, Connectors.
  3. Press Reconnect, Allow, sign in.
  - Expected: Row shows Needs reconnecting first; after return it shows Connected; check that per-tool permissions still exist.
- **Dropped grant**
  1. Make the provider reject the refresh token.
  2. Trigger a tool call.
  - Expected: Chat shows Reconnect card; a Reconnect notification is stored; the row no longer shows connected (verify).
- **Not responding**
  1. Make a connector fail three calls in a row.
  - Expected: Health panel shows Not responding and a pause sentence; row shows warning.
- **Electron reconnect**
  1. In Desktop press Reconnect, finish in the browser, return.
  - Expected: Toast first; list reloads on focus.
- **CLI list**
  1. Run agi connectors with an expired grant and a healthy grant.
  - Expected: Expired shows 'needs reconnecting: open <url>'; check how the healthy line reads.
- **Mobile Reauthorize**
  1. Open an expired OAuth connector on Mobile.
  2. Press Reauthorize.
  - Expected: Authorization opens; after return state refreshes.

**Where to look when it fails**

- Log '[connector-oauth] stored grant could not be decrypted...' and '[connector-oauth] a concurrent refresh held the grant too long'.
- Table connector_call_events for the last hour; table connector_oauth_grants revoked_at and access_token_expires_at.
- Notification titled 'Reconnect <name>'.
- Result parameter status=reauthorize on return URL.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)
- Mobile: [70-qa/test-plans/mobile/055-connector-setup-and-account-management.md](../../70-qa/test-plans/mobile/055-connector-setup-and-account-management.md)
- CLI: [70-qa/test-plans/cli/055-connector-setup-and-account-management.md](../../70-qa/test-plans/cli/055-connector-setup-and-account-management.md)
- VS Code: [70-qa/test-plans/vscode/055-connector-setup-and-account-management.md](../../70-qa/test-plans/vscode/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **No live check of Reconnect on Web and Electron is recorded.** Affects: Web, Desktop. Evidence: area brief S55.20 unfinished note. Work needed: Run the Reconnect scenario with a real expired grant and record it.
- **After a dropped grant the connector disappears from the connected list so Reconnect may not show; settings persistence unproven.** Affects: Web, Desktop, Mobile. Evidence: oauth-store.ts:595-603,715-760; oauth-access.ts:215-267. Work needed: Trace tool permission rows on revoke; consider keeping a needs-reconnect row.
- **No on-demand Test on Web or VS Code; health is passive.** Affects: Web, Desktop, VS Code. Evidence: health.ts:20-24. Work needed: Add a test call or document the substitute (capabilities panel, key form).
- **CLI health text mismatch ('healthy' vs server 'connected').** Affects: CLI. Evidence: cloud/connectors.rs:201-205; connector-vocabulary.ts:4-11. Work needed: Match the server vocabulary and add a test.
- **Mobile Check again re-reads data, it does not probe; mobile test is declined by decision.** Affects: Mobile. Evidence: ConnectorTrustSections.tsx; founder decisions:441-446. Work needed: None, or rename the button.
- **VS Code cannot reconnect.** Affects: VS Code. Evidence: connectorPresentation.ts:68-69. Work needed: Add a command that opens the web reconnect page.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- F055-03
- F055-05
- SYS-connectors-plugins-and-skills
- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- table:connector_call_events
- table:connector_oauth_grants

## Unknown

- Whether per-tool permissions and settings survive a dropped grant.
- Retention of connector_call_events and notifications.
- Exact text of CONNECTOR_REAUTHORIZATION_COPY and CONNECTOR_NOT_RESPONDING_COPY (constants not opened).
- Whether the chat card named agi_reconnect in the brief is the same as the card read here (files containing agi_reconnect were matched by search only).
- Whether Chrome extension offers any reconnect path.
- Test contents; files were listed, not opened or run.
