---
id: "F110-03"
type: "feature"
title: "Research outputs: audio overview and interactive page"
aliases: ["Research to audio overview", "Research to interactive page", "Interactive web page artifact", "Publish artifact", "Published artifact", "S110.04", "S110.05"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S110.04", "S110.05"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-voice-and-media", "table:published_artifacts", "api:POST /api/artifacts/publish", "F110-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-03 Research outputs: audio overview and interactive page

Two planned outputs of a finished research report. The audio overview does not exist anywhere in the code. The interactive page has no one-step button: the assistant builds an HTML artifact when asked, the panel previews it in a sandbox, and the Publish control makes a public or workspace link.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.04](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11004), [S110.05](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11005).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Audio overview: would turn a report into spoken single or multi voice audio; no code found. Interactive page: the assistant writes an HTML or React artifact with charts and controls, the Artifacts panel runs it in a sandboxed frame, and Publish makes a link (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1221-1262; apps/web/lib/services/published-artifact-service.ts:61-69).

**Why it exists.** Competing assistants offer audio summaries and shareable interactive pages built from research. This lets a report be listened to or explored.

**Who uses it.** Researchers and presenters who want to share a result; people who want a page not a document.

**Problems it solves**

- A long report is hard to share as chat text
- Static answers cannot offer controls or charts
- Sharing a page needs hosting

**Use cases**

- After Deep Research, ask for an interactive page with charts, open it in the panel, press Publish and copy the link
- Publish for workspace members only
- Open a published link in a browser without an account (public audience)

## 2. User experience

**Where to find it**

- Web (and Desktop, hosted web app [inferred]): ask in chat; artifact opens in the Artifacts panel; 'Publish' in the More menu or header (ArtifactPreview.tsx:2308, 2929); published link bar below (ArtifactPreview.tsx:3007-3027); Settings section for published artifacts (apps/web/features/settings/sections/PublishedArtifactsSection.tsx)
- Mobile: full-screen viewer can publish html, svg, mermaid, react, code and markdown artifacts, after the alert 'Publish to a public link?', and only in AGI Cloud mode (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:257-300)
- Audio overview: nowhere

**Before you start**

- Signed in with a cloud account for Publish
- A stored artifact of kind html, react, svg, mermaid, markdown, text or code (published-artifact-service.ts:61-69; publishArtifactClient.ts:22-45)
- A tool-capable chat model so the assistant can write the page [inferred]

**Screens and controls**

- Artifacts panel preview and source tabs
- 'Publish' / 'Publishing…' button
- Audience control (public or organization) in the panel (ArtifactPreview.tsx:237-239)
- Published link bar with copy

**Journey**

1. 1. Run a research turn and read the report.
2. 2. Ask in chat for an interactive page built from it. Wording such as 'interactive page' or 'as a web page' makes the request count as a request for an artifact (apps/web/features/chat/lib/visual-intent.ts:100-125, 175-177).
3. 3. The assistant writes an HTML artifact; it opens in the panel and runs inside a sandboxed frame.
4. 4. Press 'Publish'. The page uploads and a link is copied: 'Published · link copied to clipboard' (ArtifactPreview.tsx:1243).
5. 5. Open the link; change audience or republish for a new version (F110 item S110.28).

**What the person sees and gets**

- Toast 'Published · link copied to clipboard' or 'Published. Copy the link from the bar below.'
- Toast 'Exported to a local file' when the local publisher is used (ArtifactPreview.tsx:1249-1252)
- Refusal reason toast plus source copied to the clipboard when publishing is not possible (ArtifactPreview.tsx:1254-1261)
- Message 'Artifacts of type "..." cannot be published to a public page yet. Download or copy it instead.' (publishArtifactClient.ts:48-54)

**Settings**

- Audience: public or organization (published-artifact-service.ts:81-97)
- Settings section 'Published artifacts' to list and manage

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Visual intent classification routes interactive and diagram requests to the artifact system, not image generation (visual-intent.ts:210-235; WebChatPage.tsx:4429, 4574)
- Publish of html, react, svg, mermaid, markdown, text, code with a 1,000,000 character cap; scripted kinds must render in a cross-origin sandbox (published-artifact-service.ts:49-62, 103-109)
- Publish route with CSRF check and rate limit 'share-create' (apps/web/app/api/artifacts/publish/route.ts:43-47)
- Mobile publish of the same kinds (ArtifactFullScreen.tsx:257-272)

**Incomplete**

- No one-step 'convert this report into an interactive page' control or tool was found. The brief marks the item web done, desktop done; I could not confirm a one-step flow. The brief's research-plan.ts:97 reference holds research resume helpers, not conversion; visual-intent.ts:104 holds signal phrases.
- Deck artifacts ('presentation') are not publishable kinds (publishArtifactClient.ts:22-45)

**Present but disconnected or switched off**

- Mobile publish is blocked in Local mode with the alert 'Switch to AGI Cloud to publish' (ArtifactFullScreen.tsx:299-301)
- Connector-using artifacts cannot be published publicly (published-artifact-service.ts:103-109 message)

**Not available**

- Audio overview on every app: a search of apps and packages for 'audio overview', 'podcast' found only unrelated files (content report and connector category code)
- CLI, VS Code, Chrome: no publish or interactive page flow found

## 4. Required behaviour

**Established requirements**

- A finished research report can be turned into a spoken audio overview (single or multi voice) that plays in the product. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.04)
- A finished research report can be converted in one step into an interactive page (charts, navigation, controls) the user can open and publish. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.05)
- The interactive page is an artifact kind that can be published, scripted kinds render in a sandbox. (source: apps/web/lib/services/published-artifact-service.ts:61-69, 103-109)
- Published pages have no expiry and views are not counted. (source: apps/web/lib/services/published-artifact-service.ts:40-48 (header comment))

**Acceptance criteria**

1. After a research answer, asking for an interactive page produces an HTML artifact in the panel.
2. The preview runs scripts only inside the sandboxed frame.
3. Publish returns a link and the link opens the page without the app.
4. Choosing organization audience closes the anonymous page.
5. A deck artifact shows the refusal text about not being publishable.
6. On mobile in Local mode Publish shows 'Switch to AGI Cloud to publish'.
7. No audio overview control is shown anywhere until built.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- One step should mean a button or one request with no retyping of the report [inferred from S110.05]
- Audio overview needs speech synthesis and a player [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Make an interactive page' action on a finished research report
- [proposed] Build audio overview on the existing speech endpoint apps/web/app/api/voice/speech/route.ts after a decision on plan and cost

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | visual-intent | `apps/web/features/chat/lib/visual-intent.ts` | Detects interactive or artifact destination from the prompt |
| service | structuredVisualArtifact | `apps/web/features/chat/components/artifacts/structuredVisualArtifact.ts` | Uses the intent decision for structured visuals |
| component | WebChatPage send routing | `apps/web/features/chat/pages/WebChatPage.tsx` | Keeps artifact requests out of image generation (lines 4429, 4574) |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Sandboxed preview, Publish, link bar, audience control |
| service | publishArtifactClient | `apps/web/features/chat/components/artifacts/publishArtifactClient.ts` | Maps artifact to publish kind and calls the publish API |
| endpoint | POST publish | `apps/web/app/api/artifacts/publish/route.ts` | Creates a published artifact (CSRF, rate limit) |
| endpoint | published token routes | `apps/web/app/api/artifacts/publish/[token]/versions/route.ts` | Version list and update of a published artifact |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Kinds, limits, visibility, storage in published_artifacts |
| table | published_artifacts | `apps/web/db/neon/0095_published_artifacts.sql` | Table of published pages (named in service header) |
| component | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Settings list of published pages |
| service | chat system prompt capability text | `apps/web/lib/prompts/chat-system-prompt.ts` | Tells the model it can build interactive pages that open in the Artifacts panel (line 331-333) |
| component | ArtifactFullScreen (mobile) | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | publishableKindFor and confirmPublish alert |
| service | artifactPublishing (mobile) | `apps/mobile/src/features/chat/services/artifactPublishing.ts` | Local mode publish prompt (line 357) |
| endpoint | speech endpoint | `apps/web/app/api/voice/speech/route.ts` | Existing text to speech route; not used for audio overview [inferred] |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The prompt is classified; interactive wording sends the turn to the chat/artifact path. | device | apps/web/features/chat/pages/WebChatPage.tsx:4429, 4574; visual-intent.ts:210-235 |
| The chat model writes the HTML artifact in its reply; the client derives the artifact. | our servers | apps/web/lib/prompts/chat-system-prompt.ts:331-333; packages/platform/artifacts/src/artifact-derivation.ts:505-520 |
| The panel renders the HTML in a null-origin sandbox frame. | device | ArtifactPreview.tsx comment near line 1190 about sandbox; apps/web/lib/services/published-artifact-service.ts:99-109 requiresSandboxedRender |
| Publish sends artifact id, title, kind and content to the publish endpoint. | device and our servers | publishArtifactClient.ts:62-90; app/api/artifacts/publish/route.ts:43-47 |
| The server stores the page in published_artifacts and returns a share URL. | our servers | published-artifact-service.ts:433-443 |
| A viewer opens the link; scripted kinds render in the cross-origin sandbox frame. | device and our servers | published-artifact-service.ts:99-109; infrastructure/sandbox/index.html (brief S110.17) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published page content and metadata | Table published_artifacts | Server data | No expiry; lives until the publisher revokes it (published-artifact-service.ts:40-45) |
| Local artifact copy | Browser store agi-artifacts-store | See F110-01 | 200 artifact cap |

**Models and providers.** The chat model writes the page; any tool-less model can emit an artifact block [inferred]. Audio overview would need a speech provider; none is wired. Publishing uses no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Publish needs a signed-in account (route has per-user ownership; mobile alert says upload to AGI Cloud). |
| Permissions | Audience public (token is the read grant) or organization (members with a grant row) (published-artifact-service.ts:81-97). Connector-using artifacts cannot be public. |
| Subscription | No plan rule found for publishing in the code read. The 'artifact_connectors' capability applies to connector artifacts (billing-catalog.ts:322, 357). Deep Research needs a Pro tier or higher (billing-catalog.ts:355). |
| Limits and metering | Content up to 1,000,000 characters; per-user cap equals the list page max (published-artifact-service.ts:49-57); rate limit named 'share-create' (route.ts:46). Usage metering: none found. |
| Feature flags | none found in the code for publish; audio overview has none. |
| Model compatibility | No model-specific rule found for publishing. Research itself needs a research-capable model (request-processor.ts research fallback near 4375). |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode cannot publish (artifactPublishing.ts:357). Desktop local publish result 'Exported to a local file' exists in the client (ArtifactPreview.tsx:1249-1252); which app produces it: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Publish pending | Button reads 'Publishing…' and is disabled | ArtifactPreview.tsx:2308-2312 |
| Publish refused by type | Error 'cannot be published to a public page yet' | publishArtifactClient.ts:48-54 |
| Receipt invalid | Error 'Publication could not be confirmed...' | publishArtifactClient.ts:78-87 |
| Clipboard blocked | Success message tells the person to copy from the bar | ArtifactPreview.tsx:1245 |
| Scripted page | Rendered only in the cross-origin sandbox frame | published-artifact-service.ts:99-109 |
| Offline, retry, cancel | not handled in the code I read beyond the pending guard | ArtifactPreview.tsx:1221-1231 |
| Accessibility | Mobile confirm uses a native Alert; web Publish has a text label | ArtifactFullScreen.tsx:285-296 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.publish.test.tsx`: Publish control in the preview (by file name) [inferred]
- `apps/web/features/chat/components/artifacts/publishArtifactClient.publish.test.ts`: Publish client request (by file name) [inferred]
- `apps/web/lib/services/published-artifact-service.test.ts`: Publish service (by file name) [inferred]
- `apps/web/lib/services/__tests__/published-artifact-service.visibility.test.ts`: Audience rules (by file name) [inferred]
- `apps/web/lib/services/__tests__/published-artifact-service.connectors.test.ts`: Connector artifacts not public (by file name) [inferred]
- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish route (by file name) [inferred]
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.publish.test.tsx`: Mobile publish (by file name) [inferred]

**Test scenarios**

- **Interactive page from a report**
  1. Run research on a topic
  2. Ask 'turn this into an interactive web page with a chart'
  3. Open the artifact
  - Expected: An HTML artifact renders with the chart and controls in the sandbox.
- **Publish and open**
  1. Press Publish
  2. Open the copied link in a private window
  - Expected: The page loads with no sign-in for public audience.
- **Organization audience**
  1. Switch audience to organization
  2. Open the link signed out
  - Expected: Page is not readable anonymously.
- **Not publishable**
  1. Try to publish a deck artifact
  - Expected: Refusal message about the type.
- **Audio overview absent**
  1. Look for an audio overview control on a research report on every app
  - Expected: None exists.
- **Phone local mode**
  1. In Local mode open an HTML artifact and tap publish
  - Expected: Alert 'Switch to AGI Cloud to publish'.

**Where to look when it fails**

- Table published_artifacts
- Rate limit key share-create
- Class names PublishedArtifactValidationError and PublishedArtifactConnectorShareError (published-artifact-service.ts)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **Audio overview does not exist** Affects: All six apps. Evidence: No code; brief S110.04 missing everywhere. Work needed: Product decision, then build speech overview, player and plan rules
- **No one-step research to interactive page** Affects: Web, Desktop. Evidence: No conversion control found; brief says done. Work needed: Add the action or correct the brief
- **Mobile can publish artifacts but cannot create the page from research in one step; brief says mobile missing** Affects: Mobile. Evidence: ArtifactFullScreen.tsx:257-272. Work needed: Update brief status to partial for publish
- **Brief citations stale: research-plan.ts:97 and visual-intent.ts:104** Affects: Documentation. Evidence: research-plan.ts:97 and visual-intent.ts:100-125 read. Work needed: Correct the references
- **Empty, waiting, failure states and plan limits not established** Affects: All. Evidence: Not found. Work needed: Define and test
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-voice-and-media
- table:published_artifacts
- api:POST /api/artifacts/publish
- F110-01

## Unknown

- Whether any audio overview work exists outside the folders searched
- Whether a research report is itself an artifact the Publish control can take
- How a report reaches an HTML page in one step on web today
- Plan or quota rules for publishing
- Which app produces the 'Exported to a local file' result
- Behaviour of the page when offline
