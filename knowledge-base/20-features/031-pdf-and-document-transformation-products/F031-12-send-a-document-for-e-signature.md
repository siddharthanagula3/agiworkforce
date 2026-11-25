---
id: "F031-12"
type: "feature"
title: "Send a document for e-signature"
aliases: ["Signature-service integration", "Docusign connector", "Send for e-signature", "S31.23"]
area: "31 PDF and document-transformation products"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S31.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:paid", "SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-execution-boundaries", "api:GET /api/connectors/oauth/start", "api:GET /api/connectors/oauth/callback", "file:apps/web/lib/connectors/catalog.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F031-12 Send a document for e-signature

A Docusign connector exists in the web catalog, with a hosted tool server address and consent copy, but connectors are globally 'coming soon' and Docusign is not on the released list, so a person cannot connect it today. Mobile, CLI, VS Code and Chrome have nothing. The owner must also register the app.

Area: [31. PDF and document-transformation products](README.md). Requirement items: [S31.23](../../10-requirements/capabilities/031-pdf-and-document-transformation-products.md#s3123).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a signed-in person connect their Docusign account and have the assistant send documents for signature and work with agreements and workflows, through Docusign's own tool server. The catalog describes it as 'sending envelopes for signature, agreement search, and workflows' (apps/web/features/connectors/data/connectors.ts:917-923).

**Why it exists.** Brief S31.23 requires sending a document for e-signature through a connected signature service (doc: knowledge-base/data/area-briefs/031-pdf-and-document-transformation-products.md). The leading assistants list a Docusign connector (doc: docs/development/connectors-setup.md:661-663).

**Who uses it.** Would be used by people with a Docusign account: sales, legal and HR staff. Nobody can use it yet.

**Problems it solves**

- Leaving the chat to start a signature request by hand.
- Looking up the state of an agreement.

**Use cases**

- Send a contract for signature to a named person.
- List envelopes waiting for signature.
- Look up an agreement's details.

## 2. User experience

**Where to find it**

- Web: connectors page, Docusign entry (apps/web/features/connectors/data/connectors.ts:917). While connectors are coming soon the product shows the label 'Coming soon' (packages/contracts/types/src/connector-release.ts:40-46). Exact visible label for the entry is 'Docusign' per the directory name (apps/web/lib/connectors/directory/sources/first-party.json:500).
- Desktop: the public Desktop shows the hosted web app (doc: AGENTS.md section 5). The desktop's own catalog entry for Docusign is marked comingSoon and filtered out of the live directory (apps/desktop/src/features/connectors/connectorDefinitions.ts:729-741,940).
- Mobile: a cloud-connectors settings screen exists and marks unreleased connectors with the 'Coming soon' label (apps/mobile/src/features/settings/cloud-connectors/index.tsx:162; label from packages/contracts/types/src/connector-release.ts:40-46). Whether the Docusign row shows there depends on the directory returned by the server; not traced.
- CLI, VS Code, Chrome: not available.

**Before you start**

- A paid plan with connectors: the capability list is paid tiers (packages/contracts/types/src/billing-catalog.ts:351).
- A confirmed email on the account (apps/web/lib/services/connector-policy-gate.ts, unconfirmedEmailRefusal).
- Connectors released for this connector: not true now; Docusign is not in the released list (packages/contracts/types/src/connector-release.ts:14-30).
- The owner has registered a Docusign app and set the operator credentials (docs/runbooks/connector-oauth-apps.md:368-377).

**Screens and controls**

- Consent dialog titled 'Connect Docusign?' with a list of permissions and Allow and Deny buttons (apps/web/features/connectors/components/ConnectorConsentDialog.tsx:34-58; title from packages/contracts/cloud-contracts/src/connector-trust-copy.ts:41).
- Access sentence: high-impact class text 'This connector can read and change sensitive data...' (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:52-53; docusign class at line 144).
- Per-tool permission prompts: 'Always allow' on first use of a tool (apps/web/content/support/connectors-and-mcp.md).

**Journey**

1. 1. Open the connectors page on web and choose Docusign (blocked today with a 'Connectors are coming soon.' refusal, apps/web/lib/services/connector-policy-gate.ts:147-153).
2. 2. Read the consent dialog and choose Allow.
3. 3. The app starts sign-in at /api/connectors/oauth/start and the person signs in at Docusign (packages/contracts/cloud-contracts/src/connectors.ts:241-243).
4. 4. Back in the app, ask in chat to send a document for signature.
5. 5. The assistant calls Docusign's tools, for example createEnvelope (apps/web/lib/connectors/directory/sources/first-party.json:499-526); each tool asks for approval on first use.
6. 6. The person sees the reply and checks the envelope in Docusign.

**What the person sees and gets**

- If not connected: the assistant is told to ask the user to connect, with a connect link (apps/web/lib/connectors/connect-required.ts:24-35).
- If the deployment has no OAuth app: 'requires authorization, but this deployment has no OAuth application configured for it, so it cannot be connected here' (apps/web/lib/connectors/connect-required.ts:25-26).
- If coming soon: 'Connectors are coming soon.' (packages/contracts/types/src/connector-release.ts:36).

**Settings**

- Connector permissions per tool (block tools that change data) per DISCOVERED_CONNECTOR_ACCESS_SENTENCE text (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:61-62).
- Workspace connector policy set by an administrator (apps/web/lib/services/connector-policy-gate.ts:101-136).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Catalog entry: operator-configurable OAuth connector with runtime-discovered tools (apps/web/lib/connectors/catalog.ts:105-123,256).
- Hosted tool server address and pre-registered client setting (apps/web/lib/connectors/mcp-endpoints.ts:127-131).
- Directory entry listing 20 tool names including createEnvelope and getEnvelopes (apps/web/lib/connectors/directory/sources/first-party.json:499-526).
- Risk class high-impact and scope list for Docusign (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:144; connector-scopes.ts:217).
- Web settings entry with summary text (apps/web/features/connectors/data/connectors.ts:917-923).
- Enterprise order forms also name Docusign as a signature method outside the product (apps/web/lib/services/enterprise-contracts/types.ts:25); that is billing paperwork, not this feature.

**Incomplete**

- Operator setup: credentials come from environment names CONNECTOR_OAUTH_DOCUSIGN_CLIENT_ID and CONNECTOR_OAUTH_DOCUSIGN_CLIENT_SECRET (apps/web/lib/connectors/oauth-registry.ts:96-107,121-132; doc: docs/development/connectors-setup.md:645). The brief's name 'DOCUSIGN_*' is not what the code reads. Whether they are set in production is unknown.
- The sign-in details (authorization address, token address, scopes) are read from a provider descriptor supplied by the operator in CONNECTOR_OAUTH_PROVIDERS_JSON (apps/web/lib/connectors/oauth-registry.ts:20,137); no Docusign descriptor is checked into code (rg found values only in docs). Whether it is deployed is unknown.
- No signing-specific flow was written: sending relies on Docusign's own tools discovered at run time (apps/web/lib/connectors/catalog.ts:105-123).

**Present but disconnected or switched off**

- Connectors are globally 'coming_soon' (packages/contracts/types/src/connector-release.ts:14) and Docusign is not in the selective list (lines 16-30). Connection is refused with code 'connectors_coming_soon' (apps/web/lib/services/connector-policy-gate.ts:147-153). So the brief's 'partial' for web is narrower than it reads: even with credentials set, release is off.
- Desktop catalog entry has comingSoon: true and is filtered from the live list (apps/desktop/src/features/connectors/connectorDefinitions.ts:738,940; test apps/desktop/src/features/connectors/__tests__/connectorDefinitions.test.ts:8-12).

**Not available**

- Mobile, CLI, VS Code, Chrome: no Docusign entry or flow found (rg in apps/mobile/src and apps/cli/src returned none).
- Signing inside the product (drawing a signature) is not built; signing happens at Docusign.

## 4. Required behaviour

**Established requirements**

- The user can send a document for e-signature through a connected signature service. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S31.23)
- The Docusign setup uses the app's integration key and secret, redirect URL https://agiworkforce.com/api/connectors/oauth/callback, and scope 'signature' (plus two more only if the accounts have those products). (source: docs/runbooks/connector-oauth-apps.md:368-377)
- The Docusign tool server is https://mcp.docusign.com/mcp; the authorization server accepts only the confidential authorization code grant and refuses the whole grant if the account lacks a requested product. (source: docs/development/connectors-setup.md:661-675)
- Connectors are product-gated by release state, plan and workspace policy. (source: apps/web/lib/services/connector-policy-gate.ts:139-200)

**Acceptance criteria**

1. With the credentials set and Docusign released, a paid user on web can connect Docusign and the consent dialog titled 'Connect Docusign?' appears.
2. After connecting, asking the assistant to send a named file for signature creates an envelope visible in the person's Docusign account.
3. Each state-changing Docusign tool asks for approval on first use and can be blocked in tool permissions.
4. With no credentials configured, the page says it cannot be connected here, and the assistant does not retry.
5. Free-plan users and users with unconfirmed email are refused with a clear reason.
6. Disconnecting removes the grant and the assistant is told to ask for reconnection.
7. The same flow works from mobile and desktop or a stated reason is shown.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The model, not product code, builds the envelope request from the tool descriptions, so results depend on the chosen model's tool-use quality [inferred from catalog.ts:105-123 and first-party.json tool list].
- A document in chat must reach Docusign as an attachment argument; how a chat file is passed to createEnvelope was not traced [inferred gap].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Docusign to the released list only after a live end-to-end test with real credentials.
- [proposed] Show on the Docusign row why it is unavailable (not released versus not configured).
- [proposed] Add a confirm-before-send step naming recipients, since sending an envelope cannot be undone (doc: AGENTS.md section 9).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Connector catalog docusign entry | `apps/web/lib/connectors/catalog.ts` | mcpConnector('docusign','oauth2') at line 256; builder at lines 105-123 sets cloud-web surface and operator-enabled state. |
| config | Hosted tool endpoint | `apps/web/lib/connectors/mcp-endpoints.ts` | docusign URL, streamable-http, pre-registered client (lines 127-131). |
| config | Directory source entry | `apps/web/lib/connectors/directory/sources/first-party.json` | Name, description and 20 tool names (lines 499-526). |
| config | Directory categorizer | `apps/web/lib/connectors/directory/categorize.ts` | Puts Docusign in the Legal group (lines 669,1125). |
| config | Web settings catalog | `apps/web/features/connectors/data/connectors.ts` | Web connector list entry with summary and icon (lines 917-923). |
| config | Desktop connector definitions | `apps/desktop/src/features/connectors/connectorDefinitions.ts` | Docusign entry marked comingSoon (lines 729-741); live list excludes it (line 940). |
| config | Connector scopes | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Docusign scope list: signature, adm_store_unified_repo_read, aow_manage (line 217); user-facing sentences at lines 565-569. |
| config | Connector trust copy | `packages/contracts/cloud-contracts/src/connector-trust-copy.ts` | Risk class 'high-impact' (line 144) and display name (line 247); consent copy. |
| config | Release state | `packages/contracts/types/src/connector-release.ts` | Global state 'coming_soon' (line 14), selective list (16-30), connectorReleased (line 52). |
| service | Connector policy gate | `apps/web/lib/services/connector-policy-gate.ts` | Refuses connect when coming soon, email unconfirmed, plan lacks connectors, or workspace policy forbids (lines 139-200). |
| service | Connector capability checks | `apps/web/lib/connectors/connector-capability.ts` | Plan check and kill switch for connectors in a turn (lines 1-60). |
| service | OAuth registry | `apps/web/lib/connectors/oauth-registry.ts` | Reads provider descriptors and credential environment names; a connector without both is not connectable (lines 96-132,198-208). |
| endpoint | OAuth start route | `apps/web/app/api/connectors/oauth/start/route.ts` | Starts the Docusign sign-in (path constant at packages/contracts/cloud-contracts/src/connectors.ts:241). |
| endpoint | OAuth callback route | `apps/web/app/api/connectors/oauth/callback` | Receives the redirect and stores the grant; redirect URL in docs/runbooks/connector-oauth-apps.md:371. |
| endpoint | Connectors list and connect route | `apps/web/app/api/connectors/route.ts` | Lists connectors, applies release and policy checks (imports at lines 1-60). |
| service | Connect-required payload | `apps/web/lib/connectors/connect-required.ts` | Messages when a tool needs authorization or the deployment has no OAuth app (lines 22-38). |
| component | Consent dialog | `apps/web/features/connectors/components/ConnectorConsentDialog.tsx` | 'Connect Docusign?' dialog with Allow and Deny. |
| component | Mobile cloud connectors screen | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Lists server directory and shows the coming soon label for unreleased connectors (line 162). |
| other | Operator runbook | `docs/runbooks/connector-oauth-apps.md` | Steps to register the Docusign app (section 8, lines 368-377). |
| other | Connector setup doc | `docs/development/connectors-setup.md` | Environment names, endpoints and scope rules (lines 645, 661-675). |
| test | Catalog endpoint tests | `apps/web/lib/connectors/__tests__/catalog-endpoints.test.ts` | Checks hosted MCP endpoints are OAuth and risk classes match the shared table (lines 1-40). |
| test | Connector release tests | `apps/web/lib/connectors/__tests__/connector-release.test.ts` | Gate behaviour with release state mocked (header lines 1-30). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the connectors list and chooses Docusign on web (or the hosted web app inside Desktop). | device | apps/web/features/connectors/data/connectors.ts:917 |
| The server checks release state, email confirmation, plan and workspace policy; today the first check refuses. | our servers | apps/web/lib/services/connector-policy-gate.ts:139-200 |
| The server starts OAuth using operator credentials and a provider descriptor, and sends the person to Docusign to sign in. | outside service | apps/web/app/api/connectors/oauth/start/route.ts; apps/web/lib/connectors/oauth-registry.ts:121-132 |
| Docusign returns to the callback; the server exchanges the code and stores the grant. | our servers | apps/web/lib/connectors/finish-authorization.ts; apps/web/lib/connectors/oauth-store.ts (files exist; internals not read) |
| In a chat turn the server offers the connector's tools to the model, calls Docusign's tool server at its address with the stored grant, and returns results. | our servers | apps/web/lib/connectors/mcp-endpoints.ts:127-131; apps/web/lib/connectors/connector-capability.ts:35-60 |
| Docusign creates the envelope and sends the signature request to the recipient. | outside service | Tool createEnvelope listed at apps/web/lib/connectors/directory/sources/first-party.json:499-526 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| OAuth grant (tokens) for the person's Docusign account | server database via the connector OAuth store, encrypted tokens [inferred from apps/web/lib/connectors/oauth-store.ts and mcp-custom-connections.ts:301,352 patterns] | server-side; available wherever the same account signs in [inferred] | removed on disconnect (disconnectConnectorOAuthGrant in apps/web/lib/connectors/oauth-access.ts); retention period unknown |
| Envelope and agreement data | Docusign's own service, outside our systems | not applicable | Docusign's rules; unknown |
| Tool call log | connector call log (apps/web/lib/services/connector-call-log-service.ts imported by apps/web/app/api/connectors/route.ts) | server only | unknown |

**Models and providers.** A chat model chooses and fills the Docusign tool calls. Any provider route that supports tool calls could do so; model choice is by the model catalog (SYS-model-catalog-and-routing). Docusign itself is an outside service reached over a hosted tool server.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account with a confirmed email (apps/web/lib/services/connector-policy-gate.ts:100-125). |
| Permissions | Workspace administrators can restrict connectors by policy (apps/web/lib/services/connector-policy-gate.ts:101-136, 195-200). Each Docusign tool asks for approval on first use (apps/web/content/support/connectors-and-mcp.md). Risk class is high-impact (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:144). |
| Subscription | Connectors are a paid-tier capability (packages/contracts/types/src/billing-catalog.ts:351); a plan lacking it is refused with 'plan_upgrade_required' (apps/web/lib/services/connector-policy-gate.ts:182). Exact plan names are in that file's PAID_TIERS; not copied here. |
| Limits and metering | none found for Docusign specifically; general connector call logging exists (apps/web/lib/services/connector-call-log-service.ts). |
| Feature flags | Global release state 'coming_soon' (packages/contracts/types/src/connector-release.ts:14); kill switch capability canUseConnectors (apps/web/lib/connectors/connector-capability.ts:23-30); operator OAuth environment names CONNECTOR_OAUTH_DOCUSIGN_CLIENT_ID, CONNECTOR_OAUTH_DOCUSIGN_CLIENT_SECRET, CONNECTOR_OAUTH_PROVIDERS_JSON, CONNECTOR_OAUTH_REDIRECT_BASE_URL. |
| Model compatibility | Needs a model route that supports tool calls [inferred]; no Docusign-specific model rule found. |
| Provider restrictions | none found in the code |
| Local mode | Docusign is a cloud connector on the cloud-web surface only (apps/web/lib/connectors/catalog.ts:100,118). It needs our servers and Docusign, so it does not run in Local mode on any app. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connectors coming soon | Connect refused with 'Connectors are coming soon.' | apps/web/lib/services/connector-policy-gate.ts:147-153 |
| No OAuth app configured on the deployment | Tool result tells the model the connector is unavailable and not to retry. | apps/web/lib/connectors/connect-required.ts:25-26 |
| Not connected | Model is told to ask the person to connect, then retry the tool. | apps/web/lib/connectors/connect-required.ts:28-29 |
| Authorization expired or revoked | Model is told to ask for reconnection. | apps/web/lib/connectors/connect-required.ts:30-31 |
| Insufficient scope | Ask to reconnect with the extra permission. | apps/web/lib/connectors/connect-required.ts:32-33 |
| Account lacks a Docusign product the scopes ask for | Docusign refuses the whole grant; documented, so request only needed scopes. | docs/development/connectors-setup.md:671-675 |
| Unconfirmed email, free plan, policy forbids | Refused with codes email_unconfirmed, plan_upgrade_required or policy denial. | apps/web/lib/services/connector-policy-gate.ts:100-125,182 |
| Policy service unreadable | Connection refused with 'Workspace connector policy is unavailable. Try again.' | apps/web/lib/services/connector-policy-gate.ts:93-97 |
| Offline, timeout, cancel mid-send | not traced for Docusign calls | unknown |
| Accessibility of consent dialog | Uses the shared alert dialog component from the UI package | apps/web/features/connectors/components/ConnectorConsentDialog.tsx:3-12 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/catalog-endpoints.test.ts`: Hosted tool endpoints are OAuth in the catalog, settings labels match, risk classes match the shared table.
- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Connector release gate with release state mocked.
- `apps/web/lib/connectors/__tests__/connector-selective-release.test.ts`: Per-connector eligibility for chat turns and the kill switch.
- `apps/web/lib/connectors/__tests__/oauth-registry.test.ts`: OAuth registry (by name; not opened).
- `apps/web/lib/connectors/__tests__/connect-required.test.ts`: Connect-required payload (by name; not opened).
- `apps/desktop/src/features/connectors/__tests__/connectorDefinitions.test.ts`: Coming-soon connectors are not in the desktop live directory (lines 8-12).
- `apps/web/lib/connectors/__tests__/scope-descriptions.completeness.test.ts`: Scope descriptions completeness (by name; not opened).

**Test scenarios**

- **Connect attempt while coming soon**
  1. Sign in on web with a paid plan and confirmed email.
  2. Open connectors and choose Docusign.
  3. Try to connect.
  - Expected: Refusal 'Connectors are coming soon.' (current behaviour).
- **Missing credentials**
  1. With release on in a test build, unset the Docusign credential names.
  2. Ask the assistant to send a file for signature.
  - Expected: The assistant reports Docusign cannot be connected here and does not retry.
- **Happy path with live credentials**
  1. Set credentials and descriptor; release Docusign.
  2. Connect and Allow.
  3. Ask to send a test PDF to a test email for signature.
  4. Check Docusign.
  - Expected: An envelope exists for the test recipient.
- **Free plan refusal**
  1. Sign in on a free account.
  2. Try to connect Docusign.
  - Expected: An upgrade message (plan_upgrade_required).
- **Revoke**
  1. Revoke the app in Docusign.
  2. Ask for an envelope list.
  - Expected: Model is told to ask for reconnection.
- **Desktop and mobile visibility**
  1. Open connectors on desktop and mobile.
  - Expected: Docusign hidden or marked Coming soon, matching the gate.

**Where to look when it fails**

- Server log line '[connector-policy] unavailable at connection time; connection refused' and info logs with the denial code (apps/web/lib/services/connector-policy-gate.ts:86-97).
- Refusal codes: connectors_coming_soon, email_unconfirmed, plan_upgrade_required, connectors_unavailable.
- Connector call log service for tool failures (apps/web/lib/services/connector-call-log-service.ts).
- Deployment environment names to check: CONNECTOR_OAUTH_DOCUSIGN_CLIENT_ID, CONNECTOR_OAUTH_DOCUSIGN_CLIENT_SECRET, CONNECTOR_OAUTH_PROVIDERS_JSON, CONNECTOR_OAUTH_REDIRECT_BASE_URL (names only).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/web/031-pdf-and-document-transformation-products.md)
- Desktop: [70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md](../../70-qa/test-plans/desktop/031-pdf-and-document-transformation-products.md)

## 10. Gaps and dependencies

- **Docusign is not released: global state is coming soon and Docusign is not on the selective list.** Affects: All users on web, desktop (hosted app) and mobile.. Evidence: packages/contracts/types/src/connector-release.ts:14-30; apps/web/lib/services/connector-policy-gate.ts:147-153. Work needed: Owner decision to release, after a live test.
- **Owner has not registered the Docusign app or confirmed credentials and descriptor in production.** Affects: Web and everything using the hosted app.. Evidence: audit/partial/031-pdf-and-document-transformation-products.md S31.23 row; docs/runbooks/connector-oauth-apps.md:368-377. Work needed: Register the app and set CONNECTOR_OAUTH_DOCUSIGN_CLIENT_ID/SECRET and the descriptor.
- **The brief names DOCUSIGN_* environment variables but the code reads CONNECTOR_OAUTH_DOCUSIGN_*.** Affects: Operators and documentation readers.. Evidence: apps/web/lib/connectors/oauth-registry.ts:96-107; docs/development/connectors-setup.md:645. Work needed: Correct the brief and audit text.
- **Desktop catalog entry is comingSoon, so the brief's 'partial' for desktop is not a visible feature.** Affects: Tauri desktop catalog users.. Evidence: apps/desktop/src/features/connectors/connectorDefinitions.ts:738,940. Work needed: Decide whether the desktop catalog is still used; match the web release state.
- **No Docusign-specific test, no live test of an envelope from chat, and no traced path for passing a chat file into createEnvelope.** Affects: Quality of the feature when released.. Evidence: rg for docusign in apps/web tests found only enterprise contract tests, not connector tests.. Work needed: Add an end-to-end test with a Docusign sandbox account.
- **No send-confirmation specific to signing.** Affects: All users once released.. Evidence: Only generic tool approval is documented (apps/web/content/support/connectors-and-mcp.md).. Work needed: Add confirm step naming recipients and that sending cannot be undone.
- **Mobile, CLI, VS Code, Chrome have no path.** Affects: Users of those apps.. Evidence: rg found no Docusign in apps/mobile/src or apps/cli/src.. Work needed: Decide per app; mobile may inherit the server directory.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:paid
- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-execution-boundaries
- api:GET /api/connectors/oauth/start
- api:GET /api/connectors/oauth/callback
- file:apps/web/lib/connectors/catalog.ts

## Unknown

- Whether credentials and the Docusign descriptor are set in production.
- Whether the mobile directory returns a Docusign row and how it shows.
- How a chat-attached file is passed to Docusign's createEnvelope tool.
- Retention of stored grants and the call log.
- Exact plan names inside PAID_TIERS were not copied here.
- Behaviour on timeout or offline during a Docusign tool call.
