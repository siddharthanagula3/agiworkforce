---
id: "F028-12"
type: "feature"
title: "Shared apps: fork and viewer sign-in"
aliases: ["Save a copy to my chats", "Fork shared creation", "Viewer sign-in for connected apps", "AI permission", "Connected apps", "S28.31", "S28.32"]
area: "28 Code Canvas and application preview"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S28.31", "S28.32"]
depends_on: ["surface:web", "mode:cloud", "SYS-authentication-and-identity", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "F028-07", "F028-10", "api:POST /api/chat/conversations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-12 Shared apps: fork and viewer sign-in

On web, a viewer can press 'Save a copy to my chats' on a shared app to get their own editable copy in a new chat. A viewer's own connected accounts can be used by a shared app after they allow it, but connectors are switched off today (coming soon). Other apps have neither.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.31](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2831), [S28.32](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2832).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Copy: creates a new chat and saves the shared artifact's source as an assistant message, then opens the chat (apps/web/features/chat/lib/copy-shared-artifact.ts:35-112; apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:144-211). Viewer connected apps: the app asks to use the viewer's own connected apps; the viewer allows tool by tool; calls run with the viewer's connections, not the publisher's (apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx; apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:55-84).

**Why it exists.** So a viewer can keep working on someone else's creation, and so a shared app that reads connected apps reads the viewer's own accounts, never the publisher's (brief S28.31, S28.32).

**Who uses it.** Viewers of a published app, signed in or not.

**Problems it solves**

- Starting from someone else's app without retyping it.
- Letting a shared app act on the viewer's data only with the viewer's consent.

**Use cases**

- Open a shared calculator and press 'Save a copy to my chats' to adapt it.
- Open a shared inbox tool, allow it to read your connected mail (when connectors are released).

## 2. User experience

**Where to find it**

- Web only: header of the published page at /shared-artifact/<token>: button 'Save a copy to my chats' (while working 'Copying…') (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:221-231).
- Connected apps: panel 'AI permission' with 'Allow' and "Don't allow" and, after allowing, a 'Connected apps' button (ArtifactConnectorConsent.tsx:57,133,140; PublishedArtifactView.tsx:291-319).
- Desktop, Mobile, CLI, VS Code, Chrome: none; published apps open in the browser (doc: docs/product/surface-feature-matrix.md:402-410).

**Before you start**

- Copy: sign in (signed out, the button sends you to sign in and back: PublishedArtifactView.tsx:147-150).
- Connected apps: connectors released (they are not), a plan with the artifact_connectors capability, the app published with connectors for workspace or invited audience, and the viewer's connections set up in Settings, Connectors (apps/web/lib/services/artifact-connector-gate.ts:14-31; apps/web/app/api/artifacts/runtime/artifact-completion.ts:262-269).

**Screens and controls**

- 'Save a copy to my chats' button; error line under the title; the permission panel with a per-tool list.

**Journey**

1. Copy: 1. Open the link. 2. Press 'Save a copy to my chats'. 3. Sign in if asked. 4. A new chat is created, the source is saved as a message, and you land in /chat/<id> with the artifact opened for editing.
2. Connected apps: 1. The app asks for connected apps. 2. The panel lists the viewer's connections and tools. 3. The viewer allows or declines. 4. If allowed and available, the call runs on the viewer's accounts.

**What the person sees and gets**

- Copy error: 'This copy could not be confirmed. Check your chats before trying again.' or 'A chat was created, but saving this copy could not be confirmed. Check your chats before trying again.' (PublishedArtifactView.tsx:184-194).
- Connector refusals: 'Connectors are coming soon.'; 'This app uses <names>. Connect them in Settings, Connectors, and let their tools run without asking, to use this part of the app.' (packages/contracts/types/src/connector-release.ts:37; artifact-completion.ts:264-268).

**Settings**

- Settings, Connectors (viewer's connections); consent is remembered per browser, user, link and code version (usePublishedArtifactRuntime.ts:42-80,148-153).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Copy to chats: creates a conversation, bulk-saves the message, checks the saved message matches, derives the artifact id, adds the artifact to the store and navigates (copy-shared-artifact.ts:35-112; PublishedArtifactView.tsx:172-183).
- Sign-in redirect and return path for the copy (PublishedArtifactView.tsx:147-150,178-179).
- Consent panel and per-tool choices, stored per revision (usePublishedArtifactRuntime.ts:188-300).
- Connector description route and gate chain for the viewer (apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:37-87).

**Incomplete**

- The copy is a new chat message holding the code, not a linked fork: no link back to the source or to its storage or connector settings was found (copy-shared-artifact.ts:61-112) [inferred].
- The viewer connects accounts in Settings, not from inside the shared app; no in-app OAuth flow was found (artifact-completion.ts:264-268) [inferred].

**Present but disconnected or switched off**

- Connected apps for published apps: refused everywhere with 'Connectors are coming soon.' because the release state is coming_soon (packages/contracts/types/src/connector-release.ts:14,46-48; apps/web/lib/services/artifact-connector-gate.ts:14-20; apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:61-68).
- Connector apps cannot be shared publicly: they need a workspace or invited audience (apps/web/lib/services/published-artifact-service.ts:109-110).

**Not available**

- Copy and viewer connected-account flows on Desktop, Mobile, CLI, VS Code and Chrome: none (doc: docs/product/surface-feature-matrix.md:402-410).
- The brief marks both items missing on every app including web; code shows web copy exists and a viewer-account consent flow exists but is switched off.

## 4. Required behaviour

**Established requirements**

- From someone else's shared creation, the user can make their own copy to keep editing (brief: missing on all apps). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.31)
- A viewer of a shared app can authenticate their own accounts for the app's connected services (brief: missing on all apps). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.32)
- A published app uses the viewer's connections, not the publisher's; shared storage is refused for connector apps when the viewer is not the owner. (source: apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:92-104)
- Local, own-key and Cloud are separate trust boundaries; nothing moves between them silently. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Signed in, open a public shared html app and press 'Save a copy to my chats': a new chat opens with the code and the artifact.
2. Signed out, the same press goes to sign-in and returns to the link.
3. A failed save shows the 'could not be confirmed' message and does not claim success.
4. With connectors unreleased, an app asking for connected apps gets 'Connectors are coming soon.'
5. A publisher's connected apps are never used for a viewer's calls (the viewer's user id is used for every gate and plan).
6. A connector app set to public is refused when the audience is changed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- S28.32 is partly built on web (viewer consent and the viewer's own connections) but off by release state [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the copy keep a link to its source and offer an upgrade when the source republishes.
- [proposed] Let a viewer start a connection from the consent panel instead of sending them to Settings.
- [proposed] Decide whether native apps host shared apps or deep-link to the web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | copySharedArtifactToChat | `apps/web/features/chat/lib/copy-shared-artifact.ts` | Creates the chat, saves the message, returns the new artifact |
| component | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Copy button, sign-in redirect, consent panel, connectors buttons |
| component | ArtifactConnectorConsent | `apps/web/app/shared-artifact/[token]/ArtifactConnectorConsent.tsx` | Allow or decline, per-tool choices |
| hook | usePublishedArtifactRuntime | `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts` | Consent storage, host, sign-in state |
| endpoint | POST connectors | `apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts` | Lists the viewer's connections and tools for the app |
| service | artifactConnectorsGateResponse | `apps/web/lib/services/artifact-connector-gate.ts` | Release state, plan capability and workspace gate |
| config | connector-release | `packages/contracts/types/src/connector-release.ts` | CONNECTOR_RELEASE_STATE coming_soon and selective release list |
| service | artifact-runtime-service connectors | `apps/web/lib/services/artifact-runtime-service.ts` | describeArtifactConnectors and buildArtifactConnectorPlan on the viewer's account |
| service | respondToArtifactCompletion | `apps/web/app/api/artifacts/runtime/artifact-completion.ts` | Connector gates inside completion |
| endpoint | POST complete | `apps/web/app/api/artifacts/runtime/[token]/complete/route.ts` | connectors_not_declared check |
| endpoint | POST storage | `apps/web/app/api/artifacts/runtime/[token]/storage/route.ts` | Blocks shared writes for connector apps |
| store | artifacts-store | `apps/web/features/chat/stores/artifacts-store.ts` | upsertArtifact for the copied artifact; forkArtifact is a separate in-chat duplicate |
| table | published_artifact_viewers | `apps/web/db/neon/0395_published_artifact_audience_revocation.sql` | Invited viewers who may run an app (referenced at the invited branch, lines 96-108) |
| test | copy-shared-artifact test | `apps/web/features/chat/lib/copy-shared-artifact.test.ts` | Copy flow |
| test | PublishedArtifactView test | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.test.tsx` | Published page |
| test | connectors route test | `apps/web/app/api/artifacts/runtime/[token]/connectors/__tests__/route.test.ts` | Connectors route |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The viewer presses 'Save a copy to my chats'; the page checks sign-in and builds a request authority tied to the session. | device | apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:144-171 |
| The page posts to create a conversation, then posts one assistant message with the code fenced. | our servers | apps/web/features/chat/lib/copy-shared-artifact.ts:46-78 |
| The page verifies the saved message equals what was sent, adds the artifact to the local store and opens the chat. | device | copy-shared-artifact.ts:80-112; PublishedArtifactView.tsx:180-183 |
| For connectors: the page lists the viewer's connections through the connectors route. | our servers | apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:55-84 |
| A completion that names connectors is refused while connectors are unreleased; otherwise it runs a tool loop with the viewer's connections. | our servers | apps/web/app/api/artifacts/runtime/artifact-completion.ts:121-123,246-269 |
| Tool calls reach the viewer's connected services. | outside service | apps/web/lib/services/artifact-runtime-service.ts:529-620 (runArtifactToolLoop) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The copied conversation and message | The viewer's chats on our servers (web_conversations and messages) | Yes, as any Cloud chat | Normal chat retention and deletion rules; not read here |
| Consent and allowed tools | Browser localStorage | No | Per user, link and code digest |
| Viewer's connector tokens | Account connector storage, read only for the viewer | Server only | unknown from the files read |

**Models and providers.** The copy involves no model. A connector run uses a managed route that supports function calling, and keeps Google user data off models that may train (apps/web/lib/services/artifact-runtime-service.ts:299-330; artifact-completion.ts:205-210).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Copy needs a signed-in account (PublishedArtifactView.tsx:147-150). Connected apps need a signed-in viewer. |
| Permissions | Only artifacts the viewer may read can be copied by the page; org and invited audiences require sign-in (apps/web/app/shared-artifact/[token]/page.tsx:35-40). A viewer can use connected apps only on an app published with connectors (connectors_not_declared) and not on public shares (artifact-completion.ts:124-134). |
| Subscription | Connected apps in published apps need a plan with the artifact_connectors capability; which plans: unknown (apps/web/lib/services/artifact-connector-gate.ts:22-31). Copying: no plan check found. |
| Limits and metering | Connector runs reserve and record usage on the viewer like other app AI (apps/web/lib/services/artifact-runtime-service.ts:629-765). Up to 10 connectors per call (packages/contracts/cloud-contracts/src/artifact-runtime.ts:4). |
| Feature flags | CONNECTOR_RELEASE_STATE is coming_soon (packages/contracts/types/src/connector-release.ts:14); AGI_ARTIFACT_AI_ENABLED also gates the AI call (apps/web/lib/server/artifact-ai-switch.ts:5-8). |
| Model compatibility | Connector runs need a model with function calling (apps/web/lib/services/artifact-runtime-service.ts:299-310). |
| Provider restrictions | none named in these files. |
| Local mode | Not available. The copy lands in a Cloud chat (apps/web/features/chat/lib/copy-shared-artifact.ts:46-78), and connector use is managed-only (artifact-completion.ts:136-148). No Local route found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out | Copy goes to sign-in and returns to the link | PublishedArtifactView.tsx:147-150 |
| Session or page changes mid-copy | The operation is dropped through the request authority | PublishedArtifactView.tsx:155-169 |
| Chat created but message not confirmed | Message tells the person to check their chats before retrying | PublishedArtifactView.tsx:184-190; copy-shared-artifact.ts:79 |
| Connectors unreleased | 403 connectors_coming_soon | artifact-completion.ts:121-123 |
| App not published with connectors | 403 connectors_not_declared for non-owners | apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:58-70 |
| Connectors not connected or tools need approval | 409 connectors_not_ready with a Settings pointer | artifact-completion.ts:262-269 |
| Offline or retry | not handled in the code beyond error messages | PublishedArtifactView.tsx:196-203 |
| Accessibility | Copy error uses role alert; the Copy button is disabled while loading | PublishedArtifactView.tsx:224,233-237 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/copy-shared-artifact.test.ts`: Copy to chat flow; titles not read
- `apps/web/app/shared-artifact/[token]/PublishedArtifactView.test.tsx`: Published page including the copy button; titles not read
- `apps/web/app/api/artifacts/runtime/[token]/connectors/__tests__/route.test.ts`: Connectors route; titles not read
- `apps/web/app/api/artifacts/runtime/[token]/complete/__tests__/route.test.ts`: Includes 'refuses a viewer’s connected apps before any gate or billing'
- `apps/web/lib/services/__tests__/artifact-runtime-service.connectors.test.ts`: Connector plan; titles not read
- `apps/web/app/chat/live-artifacts/__tests__/useLiveArtifactRuntime.test.tsx`: Owner-preview runtime hook; titles not read

**Test scenarios**

- **Copy while signed in**
  1. Open a public html app link.
  2. Press 'Save a copy to my chats'.
  - Expected: A new chat opens containing the code and the artifact panel.
- **Copy signed out**
  1. Open the link in a private window.
  2. Press the button.
  - Expected: Redirect to sign-in; after sign-in you return to the link.
- **Copy failure**
  1. Block the message save call in dev tools.
  2. Press the button.
  - Expected: The 'could not be confirmed' text shows; no success.
- **Connectors off**
  1. Open a published app whose script calls agi.complete with a connector name.
  - Expected: The call rejects with 'Connectors are coming soon.'
- **Other apps**
  1. Look for a copy or viewer-sign-in action on Mobile, CLI, VS Code and Chrome.
  - Expected: None exists.

**Where to look when it fails**

- Error codes connectors_coming_soon, connectors_not_declared, connectors_not_on_public_share, connectors_unavailable, connectors_not_ready, plan_upgrade_required (artifact-completion.ts; artifact-connector-gate.ts:22-31).
- Console behaviour for copy: none logged beyond the user-facing message.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/web/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **The brief says fork (S28.31) is missing on every app; the web has 'Save a copy to my chats'.** Affects: Documentation and web users. Evidence: apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:221-231. Work needed: Update the brief; decide whether a linked fork is wanted.
- **The brief says viewer sign-in for connected apps (S28.32) is missing; web has a viewer-consent flow that uses the viewer's own connections, but connectors are not released.** Affects: Web viewers. Evidence: packages/contracts/types/src/connector-release.ts:14; apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:55-84. Work needed: Release connectors; add an in-app connect step.
- **No copy or consent flow on Desktop, Mobile, CLI, VS Code, Chrome.** Affects: Those users. Evidence: doc: docs/product/surface-feature-matrix.md:402-410. Work needed: Decide hosting versus deep link.
- **Copy keeps no link to the source and carries no storage or connector bindings.** Affects: People who copy an app that uses saved data or connectors. Evidence: apps/web/features/chat/lib/copy-shared-artifact.ts:61-112. Work needed: Define what a fork carries and implement it.
- Not built on: Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- mode:cloud
- SYS-authentication-and-identity
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- F028-07
- F028-10
- api:POST /api/chat/conversations

## Unknown

- Which plans carry the artifact_connectors capability.
- What the copy tests assert beyond their file names.
- Whether the copied chat inherits the source app's storage or connector declarations (no code found that does).
- How the viewer's connector tokens are retained and deleted.
- Whether a product decision exists for forking on native apps.
