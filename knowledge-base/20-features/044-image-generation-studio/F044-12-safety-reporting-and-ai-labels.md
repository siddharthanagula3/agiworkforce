---
id: "F044-12"
type: "feature"
title: "Safety, reporting and AI labels"
aliases: ["Safety, reporting and AI labels", "Content/provenance labeling", "Report this response", "Report this image", "AI-generated claim", "x-agi-ai-provenance", "content_reports", "output moderation"]
area: "44 Image-generation studio"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.35", "S44.36"]
depends_on: ["SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-observability-and-operations", "SYS-data-model-and-migrations", "SYS-execution-boundaries", "F044-09", "F044-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-12 Safety, reporting and AI labels

Every generated image is checked before it is stored or charged. Web marks each file with a machine-readable AI-generated claim. People can report a response on Web or an image on Mobile. The CLI writes its own label into file metadata and prints a visible AI-generated line. Web and Mobile show no visible AI label.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.35](../../10-requirements/capabilities/044-image-generation-studio.md#s4435), [S44.36](../../10-requirements/capabilities/044-image-generation-studio.md#s4436).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Screens generated images against a hash blocklist and a classifier, refuses unsafe ones, embeds an AI-generated claim in the image bytes, serves that claim in headers, and takes user reports into a trust and safety table.

**Why it exists.** Generated images can be harmful and can be mistaken for photographs. The product needs a safety floor before delivery and a trace that says the file is synthetic. The brief asks for AI labelling visibly and in machine-readable provenance. (doc: area brief 044, S44.35, S44.36)

**Who uses it.** Every person who generates images; trust and safety reviewers; anyone who later receives the file.

**Problems it solves**

- Unsafe output reaching the person or being stored or billed.
- Images passing as real photos with no marker.
- No path to tell the company about a bad image.

**Use cases**

- A prompt produces a blocked output; the person sees a content policy message and is not charged.
- A downloaded image carries embedded metadata saying it is AI-generated.
- On Mobile the person opens an image and taps 'Report this image'.
- In the CLI the printed summary says the file is labelled as AI-generated.

## 2. User experience

**Where to find it**

- Web chat message menu: 'Report this response' (shown on assistant messages). (apps/web/features/chat/components/messages/MessageBubble.tsx:4062-4073)
- Mobile image viewer header 'Report this image'; Library item menu 'Report'; chat message action 'Report…'. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:653; apps/mobile/src/features/library/index.tsx:646; apps/mobile/src/features/chat/components/MessageBubble.tsx:1718)
- Desktop: the same Web menu in the hosted app. (apps/desktop/electron/main.ts:1065-1067)
- CLI: the one-line summary after each image. (apps/cli/src/cloud/image.rs:236-262)

**Before you start**

- Web report needs a signed-in session and CSRF token. (apps/web/features/chat/components/messages/MessageBubble.tsx:1170-1180)
- Mobile report sheet offers categories including Harmful or dangerous, Inaccurate or misleading, Offensive or hateful, Misinformation. (apps/mobile/src/features/chat/components/ReportFlagButton.tsx:42-47)

**Screens and controls**

- Web menu item shows 'Reporting…' then 'Reported' and disables itself. (apps/web/features/chat/components/messages/MessageBubble.tsx:4062-4073)
- Mobile report sheet titled 'Report this image' with category choices and an optional note. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:802-806)
- Refusal message shown in the card when moderation blocks output (text from the server's refusal field). (apps/web/app/api/media/image/lib/managed-image-generation.ts:889-900)

**Journey**

1. 1. Prompt is checked on the server before any billing.
2. 2. The provider returns candidate images.
3. 3. Each candidate is hashed and classified; a block ends the attempt, records the provider cost as undelivered and releases the person.
4. 4. Allowed images receive an AI-generated claim embedded in their bytes, then are stored.
5. 5. Later, the person can press Report; the report is saved with the message and, on Mobile, the image reference.

**What the person sees and gets**

- Report success toast 'Reported. Thank you: our trust and safety team will review it.' (apps/web/features/chat/components/messages/MessageBubble.tsx:1189)
- Report failure toast 'Could not send the report. Please try again.'
- Moderation failure: HTTP 422 with code content_policy_violation. (apps/web/app/api/media/image/lib/managed-image-generation.ts:889-900)
- CLI summary ends 'Labelled as AI-generated in the file metadata.' or names files it could not label. (apps/cli/src/cloud/image.rs:236-262)

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Output moderation: SHA-256 hash denylist then a classifier; either blocks. (apps/web/lib/moderation/output-moderation.ts:84-112)
- A blocked candidate is never stored, delivered or charged to the person; the provider cost is booked as undelivered and the job closes non-retryable. (apps/web/app/api/media/image/lib/image-job-executor.ts:413-428,727-748)
- Prompt moderation runs before reservation, plus upload hash and structure checks for edit sources. (apps/web/app/api/media/image/lib/managed-image-generation.ts:279-305,590-640)
- Each delivered image gets a claim built from provider, model, time and content hash and written into the bytes; if marking fails the image is not delivered. (apps/web/app/api/media/image/lib/image-job-executor.ts:392-410,755-790; apps/web/lib/server/generated-media-provenance.ts:35-39)
- The claim is stored on the asset row metadata and sent as response headers on generate, status and file serve. (apps/web/app/api/media/image/lib/image-job-executor.ts:502; apps/web/app/api/media/image/status/route.ts:97-111; apps/web/app/api/files/[id]/route.ts:248-251)
- Web report posts to /api/content-report which shares the mobile intake handler and inserts into content_reports with an idempotency key. (apps/web/app/api/content-report/route.ts:1-14; apps/web/app/api/mobile/content-report/route.ts:34-110)
- Mobile report includes the image asset reference. (apps/web/app/api/mobile/content-report/route.ts:41-48; apps/mobile/__tests__/LibraryReport.test.tsx)
- CLI writes an XMP packet with digital source type 'trainedAlgorithmicMedia' into PNG, JPEG and WebP and prints a visible AI-generated line. (apps/cli/src/cloud/image_provenance.rs:6-31,81-92; apps/cli/src/cloud/image.rs:236-262)

**Incomplete**

- The Web report sends no asset and always the category 'harmful', with at most 500 characters of message text, so a report on an image message does not identify the picture. (apps/web/features/chat/components/messages/MessageBubble.tsx:1176-1184)
- The claim's signature field is null (unsigned). (apps/cli/src/cloud/image_provenance.rs:31)
- CLI cannot label formats other than PNG, JPEG and WebP and says so. (apps/cli/src/cloud/image_provenance.rs:81-92)
- Content moderation is only as good as the denylist and classifier; coverage was not assessed.

**Present but disconnected or switched off**

- Provider-side safety output reason 'output_provider_safety' exists in the type but no code path was traced. (apps/web/lib/moderation/output-moderation.ts:22)

**Not available**

- Visible 'AI-generated' label in the Web, Desktop or Mobile interface: only 'Generating with <model>' and 'Generated with <model>' captions exist and they name the model, not the AI origin. (apps/web/features/chat/components/ImageGenerationCard.tsx:231,1160; apps/mobile/src/features/image/imageSettingsCaption.ts:7)
- CLI report action: none found.
- Chrome extension: none found.

## 4. Required behaviour

**Established requirements**

- User reports a generated image as harmful or wrong to trust and safety. (source: S44.35)
- Generated images are labelled as AI-generated, visibly and in machine-readable provenance. (source: S44.36)
- A refused candidate is never stored, delivered or charged for. (source: code comment at apps/web/app/api/media/image/lib/image-job-executor.ts:410-413, backed by S44.36 and doc: docs/product/experience-contract.md row W12)

**Acceptance criteria**

1. A candidate whose hash is on the denylist is not stored, no media_assets row exists, the person gets content_policy_violation and the reservation is released.
2. A delivered image's bytes contain the AI claim and /api/files/<id> returns the AI-generated headers.
3. If the claim cannot be written the image is not delivered.
4. Pressing Report on a Web assistant message shows 'Reported' and creates one content_reports row even if pressed twice.
5. Reporting an image from the Mobile viewer stores the asset reference.
6. The CLI summary line states the AI origin and whether the file was labelled.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A visible label on Web and Mobile is required by the brief and likely by the legal references the product follows (the code names an Article 50 test). [inferred from apps/mobile/__tests__/article-50-provenance-claims.test.ts and apps/web/lib/compliance/ai-act.ts]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a small 'AI-generated' mark to the card caption and Mobile viewer caption.
- [proposed] Send the asset and an image category from the Web report.
- [proposed] Add a report action to the CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | moderateGeneratedMedia | `apps/web/lib/moderation/output-moderation.ts` | Hash denylist and classifier for generated media. |
| service | screenGeneratedImages / markResolvedImages / persistGeneratedImages | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Order of screening, marking, storing, settling. |
| service | generateManagedImage (prompt and upload moderation) | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Prompt rules, upload hash and structure checks before billing. |
| service | markGeneratedImage | `apps/web/lib/server/generated-media-provenance.ts` | Embeds the claim into image bytes or throws. |
| service | buildAiGeneratedProvenance / aiGeneratedHeaders | `apps/web/lib/compliance/ai-act.ts` | Builds the claim and the response headers. |
| config | embedImageProvenance (compliance package) | packages/compliance (not found) (not found) | Shared embed logic used by the web marker (package folder named in the import). |
| endpoint | GET /api/files/{id} | `apps/web/app/api/files/[id]/route.ts` | Serves bytes with the AI headers. |
| endpoint | POST /api/content-report | `apps/web/app/api/content-report/route.ts` | Alias of the mobile intake handler. |
| endpoint | POST /api/mobile/content-report | `apps/web/app/api/mobile/content-report/route.ts` | Validates and inserts the report. |
| table | content_reports | `apps/web/app/api/mobile/content-report/route.ts` | Stores reports with reportId idempotency, category, excerpt, note, asset, subject. |
| component | Web MessageBubble report | `apps/web/features/chat/components/messages/MessageBubble.tsx` | 'Report this response' action. |
| component | Mobile ReportFlagButton / ReportSheet | `apps/mobile/src/features/chat/components/ReportFlagButton.tsx` | Category sheet and delivery. |
| service | contentReport (mobile) | `apps/mobile/services/contentReport.ts` | Sends reports to the intake path with an offline copy. |
| service | image_provenance.rs | `apps/cli/src/cloud/image_provenance.rs` | CLI XMP claim for PNG, JPEG and WebP. |
| service | ImageGeneration::summary | `apps/cli/src/cloud/image.rs` | Visible AI-generated summary line. |
| table | image_generation_jobs | `apps/web/db/neon/0226_durable_image_generation_jobs.sql` | Failed moderation closes the job with public_error. |
| test | article-50-provenance-claims | `apps/mobile/__tests__/article-50-provenance-claims.test.ts` | Mobile claim tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server moderates the prompt and any uploaded edit source before reserving usage. | our servers | apps/web/app/api/media/image/lib/managed-image-generation.ts:279-305,527-640 |
| Provider generates candidates. | outside service | apps/web/app/api/media/image/lib/image-job-executor.ts:640-660 |
| Server screens each candidate by hash and classifier; a block records undelivered provider cost and closes the job non-retryable. | our servers | apps/web/app/api/media/image/lib/image-job-executor.ts:727-748; apps/web/lib/moderation/output-moderation.ts:84-112 |
| Server builds a claim per image with a content hash, embeds it in the bytes, stores the file and the claim in asset metadata. | our servers | apps/web/app/api/media/image/lib/image-job-executor.ts:750-790 |
| Client sends a report to the intake route; server inserts a row keyed by the client report id. | device and our servers | apps/web/features/chat/components/messages/MessageBubble.tsx:1170-1195; apps/web/app/api/mobile/content-report/route.ts:95-110 |
| CLI saves the downloaded bytes, adds an XMP claim (server header claim, else response claim, else a local claim) and prints the summary. | device | apps/cli/src/cloud/image.rs:1250-1275 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| AI-generated claim (provider, model, time, content hash, signature field null) | Inside the image bytes and in media_assets.metadata.aiAct | Travels with the file | With the asset. |
| Content report (message id, conversation id, category, excerpt, note, asset, subject) | table content_reports | Server only | Retention not read; user_id nullable so anonymous reports are accepted. (apps/web/app/api/mobile/content-report/route.ts:14) |
| On-device copy of a report (Mobile) | device storage via contentReport service | Sent when online | Not traced. |

**Models and providers.** The claim names provider and model. Moderation does not depend on the generating model; it checks bytes and prompt. (apps/web/lib/moderation/output-moderation.ts:84-112)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reports can be filed by a signed-in user; anonymous reports are accepted by the route. (apps/web/app/api/mobile/content-report/route.ts:14) |
| Permissions | none found in the code beyond sign-in on the Web UI action |
| Subscription | Safety checks apply to every plan; there is no plan switch for moderation. (apps/web/app/api/media/image/lib/image-job-executor.ts:727-748) [none found in the code for a plan rule] |
| Limits and metering | Blocked output is not charged to the person; the provider cost is recorded as undelivered. (apps/web/app/api/media/image/lib/image-job-executor.ts:113-135) |
| Feature flags | Environment: production fails closed when storage is missing, so no unmarked inline image is delivered there. (apps/web/app/api/media/image/lib/managed-image-generation.ts:506-520) |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | No on-device image generation exists in these apps, so no Local mode labelling or moderation path was found. The CLI refuses non-Managed sessions. (apps/cli/src/cloud/client.rs:361-371) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Blocked output | HTTP 422 content_policy_violation with the refusal text; job closed, not retryable. | apps/web/app/api/media/image/lib/managed-image-generation.ts:889-900 |
| Claim cannot be written | The image is not delivered and the attempt fails as a persistence problem, retryable and not charged. | apps/web/app/api/media/image/lib/image-job-executor.ts:766-795; apps/web/lib/server/generated-media-provenance.ts:35-39 |
| Report sent twice | Idempotent on the client report id; the menu item disables after sending. | apps/web/app/api/mobile/content-report/__tests__/route.test.ts test 'is idempotent on the client report id' |
| Report network failure | Toast and the control resets so the person can try again; Mobile keeps an on-device copy. | apps/web/features/chat/components/messages/MessageBubble.tsx:1190-1194; apps/mobile/src/features/chat/components/ReportFlagButton.tsx:1-20 header comment |
| Unlabellable format (CLI) | File saved unlabelled and the summary says so. | apps/cli/src/cloud/image.rs:244-252 |
| Upload of an uploaded photo in edit | Hash denylist and structure check refuse it before billing. | apps/web/app/api/media/image/lib/managed-image-generation.ts:590-640 |
| Chrome | not handled in the code | apps/extension/src searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/ai-act-image-provenance.test.ts`: Claim returned per image, written into stored and inline bytes, bound to bytes, headers set, undeliverable if unmarkable, staging rollback.
- `apps/web/lib/server/generated-media-provenance.test.ts`: Claim written without changing pixels; refuses unmarkable image; video cases.
- `apps/web/lib/moderation/__tests__/output-moderation.test.ts`: Output moderation (titles not read).
- `apps/web/lib/moderation/__tests__/hash-denylist.test.ts`: Hash denylist (titles not read).
- `apps/web/app/api/mobile/content-report/__tests__/route.test.ts`: Report insert, idempotency, anonymous report, asset, subject, validation.
- `apps/mobile/__tests__/LibraryReport.test.tsx`: Report a generated image with asset reference; no Report on uploads.
- `apps/mobile/__tests__/MessageBubbleReport.test.tsx`: Mobile message report (titles not read).
- `apps/mobile/__tests__/article-50-provenance-claims.test.ts`: Mobile provenance claims (titles not read).
- `apps/mobile/__tests__/coverage-wave2-content-report.test.ts`: Content report service (titles not read).

**Test scenarios**

- **Claim in the file**
  1. Generate an image on Web.
  2. Download it.
  3. Inspect the file metadata for the AI claim.
  - Expected: A machine-readable AI-generated claim naming provider and model is present; file response headers include the AI-generated flag.
- **Blocked output**
  1. In a test environment add a known test hash to the denylist or use the classifier test double.
  2. Generate.
  - Expected: 422 content_policy_violation; no asset row; usage not charged; job failed and not retryable.
- **Web report**
  1. Open the message menu on an image answer.
  2. Choose 'Report this response'.
  - Expected: Toast 'Reported...'; one content_reports row; note that it has no asset and category harmful.
- **Mobile image report**
  1. Open the viewer, tap 'Report this image', choose a category.
  - Expected: Row has the asset reference; sheet confirms delivery or says it was kept on the device.
- **CLI label**
  1. agi image 'a red bicycle'
  2. Read the printed summary and inspect the file's metadata.
  - Expected: Summary starts 'AI-generated with <model> (<provider>)' and ends 'Labelled as AI-generated in the file metadata.'
- **Visible label check**
  1. Look for the words 'AI-generated' on a Web image card and on the Mobile viewer.
  - Expected: Not present today; this is the known gap.

**Where to look when it fails**

- Log 'Generated image persistence failed...' and event recordMediaSafety decision blocked with reason output_hash_denylist or output_classifier.
- Table content_reports; table media_assets.metadata.aiAct.
- Headers carrying the AI-generated flag and serialised claim.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/044-image-generation-studio.md](../../70-qa/test-plans/web/044-image-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/044-image-generation-studio.md](../../70-qa/test-plans/desktop/044-image-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/044-image-generation-studio.md](../../70-qa/test-plans/mobile/044-image-generation-studio.md)
- CLI: [70-qa/test-plans/cli/044-image-generation-studio.md](../../70-qa/test-plans/cli/044-image-generation-studio.md)

## 10. Gaps and dependencies

- **No visible 'AI-generated' label in the Web, Desktop or Mobile UI.** Affects: Web, Desktop, Mobile. Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:1160; apps/mobile/src/features/image/imageSettingsCaption.ts:7. Work needed: Add a visible mark to the card and viewer; the brief marks these apps done for the machine-readable part only.
- **Web report does not identify the image and fixes the category to harmful.** Affects: Web, Desktop. Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:1176-1184. Work needed: Send the asset reference and let the person pick a category, as Mobile does.
- **Claim is unsigned.** Affects: All apps. Evidence: apps/cli/src/cloud/image_provenance.rs:31. Work needed: Decide whether signing is required; verify what the web claim carries (not opened).
- **CLI has no report action.** Affects: CLI. Evidence: no report command found in apps/cli/src/lib.rs. Work needed: Add a report command that posts to the same intake.
- **Chrome extension has no safety or label code for images.** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts. Work needed: Check the server-side chat tool path with the chrome surface and add the controls.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-observability-and-operations
- SYS-data-model-and-migrations
- SYS-execution-boundaries
- F044-09
- F044-11

## Unknown

- Contents of the output moderation and hash denylist tests (titles not read).
- What the classifier is and its coverage (classifyGeneratedImage not opened).
- Whether the web claim is signed; only the CLI local claim was seen with a null signature.
- Retention period for content_reports.
- Whether the Chrome extension chat tool path shows any label or report control.
