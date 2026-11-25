---
id: "F045-08"
type: "feature"
title: "Keep the original and see earlier versions"
aliases: ["Image versions", "Version pager", "Previous version / Next version", "imageVersions", "Preserve original", "Keep the original", "New version", "S45.28-S45.31"]
area: "45 Image editor"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.28", "S45.29", "S45.30", "S45.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:image_generation_jobs", "api:POST /api/media/image/generate", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "F045-07", "F045-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-08 Keep the original and see earlier versions

When a person revises a generated image, the chat card keeps the earlier picture in a list and shows a pager with 'Previous version' and 'Next version'. The original upload is kept on the message. Before/after slider, a version list view, and undo or redo are not built. Web has the pager; Mobile only reads and shows versions.

Area: [45. Image editor](README.md). Requirement items: [S45.28](../../10-requirements/capabilities/045-image-editor.md#s4528), [S45.29](../../10-requirements/capabilities/045-image-editor.md#s4529), [S45.30](../../10-requirements/capabilities/045-image-editor.md#s4530), [S45.31](../../10-requirements/capabilities/045-image-editor.md#s4531).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Each time a new version of an image is made from an existing card, the previous image URL, prompt, aspect ratio and model are appended to the message's imageVersions, and the card shows 1 / N with arrows (apps/web/features/chat/pages/WebChatPage.tsx:3466-3485; ImageGenerationCard.tsx:1132-1152).

**Why it exists.** The brief wants editing to keep the original next to the result instead of overwriting it (S45.31) and wants earlier versions to be visible and openable (S45.29).

**Who uses it.** People iterating on a generated image on Web, Desktop (hosted web) and Mobile.

**Problems it solves**

- A revision would otherwise replace the picture and lose the earlier one.
- The person cannot compare or return to an earlier take.

**Use cases**

- Ask for a brighter version, dislike it, step back to the earlier one.
- Reframe an image and still open the first picture.
- On the phone, open a chat from the web and page through its versions.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): image card in the chat. Hover shows 'New version' (pencil) and share; below the card is a group 'Image versions' with buttons 'Previous version' and 'Next version' and a label such as '1 / 3' (ImageGenerationCard.tsx:1036,1132-1152).
- Mobile: generated image in a chat shows a toolbar 'Image versions' with 'Previous version' and 'Next version' and the label 'N of M' (apps/mobile/src/features/chat/components/GeneratedImage.tsx:156-196; imageVersions.ts:48).
- CLI, Chrome: not available. VS Code: not applicable.

**Before you start**

- A generated image message with at least one earlier version.
- To make versions on web: the card must offer 'New version' (needs onRegenerate) (ImageGenerationCard.tsx:1034,1318).

**Screens and controls**

- 'New version' button opens the panel 'Revise this image' with aspect ratio menu, optional mask, and a text field 'Describe a change to generate a new version...' (ImageGenerationCard.tsx:603,862).
- Pager buttons, disabled at the ends.
- 'Download' and 'Copy image' act on the version shown (ImageGenerationCard.tsx:948,1058).
- No before/after slider, no undo, no redo.

**Journey**

1. Open a chat that has a generated image.
2. Click 'New version', describe the change, send.
3. A new image replaces the card's main picture; the old one goes into imageVersions.
4. Use 'Previous version' to see the older picture and its prompt; 'Next version' to return to the latest.
5. Revising while an older version is on screen edits that older version (test name: 'edits the version on screen, not the latest one').

**What the person sees and gets**

- Live region announces 'The new version of this image is ready' (ImageGenerationCard.tsx:435).
- Errors from a failed revision show in the panel ('Could not generate a new image. Try again.') (ImageGenerationCard.tsx:437-441).
- The pager label shows the position and total.

**Settings**

- None specific. Aspect ratio and model used per version are stored with it.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web appends the previous image URL, prompt, aspect and model to metadata.imageVersions when a new version finishes (WebChatPage.tsx:3466-3485), then saves the message (persistImageGenerationAssistantMessage, imageGenerationPersistence.ts:96-130).
- Web card computes the version count and shows the older picture, its prompt, aspect and model (ImageGenerationCard.tsx:1284-1320).
- The pager resets to the latest when a new image arrives (ImageGenerationCard.tsx:1236-1239).
- Mobile validates and bounds imageVersions (50 entries, URL 2048 chars) and shows the same pager (apps/mobile/src/features/image/imageVersions.ts:7-45; GeneratedImage.tsx:114-196; MessageBubble.tsx:2542).
- Preserve original on mobile: the source photo of an edit is attached to the user turn (runImageGenerationTurn.ts:253-266).
- Web: the edit panel takes the version on screen as the source of the next edit (ImageGenerationCard.test.tsx:457 name).

**Incomplete**

- Mobile has no code that writes imageVersions; it only reads them (search of apps/mobile found read-only use).
- Web stores versions per message, but the first uploaded source picture of a composer edit is not obviously kept as a message attachment on web; not established (unknown).
- MessageMetadata type in apps/web/features/chat/types/message-metadata.ts does not list imageVersions, while the store type does (web-chat-store.ts:464); effect unknown.

**Present but disconnected or switched off**

- Tauri desktop has no version code; the public desktop shows the web app (doc: AGENTS.md section 5).

**Not available**

- Before/after comparison (S45.28), undo and redo (S45.30), a separate version history list (S45.29 per brief). CLI and Chrome have none.

## 4. Required behaviour

**Established requirements**

- User compares an edited image with its original side by side or with a slider. Missing on web, desktop, mobile, chrome. (source: S45.28 (brief))
- User sees earlier versions of an edited image and can open any of them. Brief status missing on all apps (the pager code exists; the brief predates or differs). (source: S45.29 (brief))
- User undoes and redoes an image edit. Missing. (source: S45.30 (brief))
- Editing keeps the original image available next to the result. Done on web, desktop, mobile. (source: S45.31 (brief))
- An agent never destroys a user's file; code and chats are checkpointed or archived, permanent removal needs an explicit user action. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Generate an image on Web, make a new version: the card shows '2 / 2' and 'Previous version' is enabled.
2. Click 'Previous version': the older picture, prompt and model show.
3. Reload the chat: the versions are still there.
4. Make a revision while viewing the first version: the edit starts from that picture.
5. On Mobile open a chat with imageVersions: the toolbar 'Image versions' shows 'N of M' and both buttons work.
6. Search for a before/after slider, undo or redo control: none exists.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Pager order is oldest first, latest last, because versions are appended and the latest is index total-1 [inferred from ImageGenerationCard.tsx:1284-1288].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A before/after slider using the existing stored version.
- [proposed] Undo and redo that move the pager and the message's current image.
- [proposed] Mobile to write versions when it revises an image.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ImageGenerationCard / ResultCard | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Shows the card, 'New version' button, edit panel, version pager (lines 1036,1132-1152,1284-1320). |
| component | EditPanel | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Revise panel; builds the edit from the image on screen (lines 395-520). |
| screen | WebChatPage regenerate flow | `apps/web/features/chat/pages/WebChatPage.tsx` | Writes imageVersions and persists the message (lines 3420-3540). |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Passes previousVersions to the card (line 3295). |
| store | web-chat-store ImageVersion | `apps/web/shared/stores/web-chat-store.ts` | Defines ImageVersion and metadata.imageVersions (lines 68-73,464). |
| service | imageGenerationPersistence | `apps/web/features/chat/lib/imageGenerationPersistence.ts` | Merges metadata and saves the assistant message to the database. |
| hook | saveMessageToDb (useChatStream) | `apps/web/lib/hooks/useChatStream.ts` | Posts the message with metadata to the server. |
| service | imageVersionsFromMetadata | `apps/mobile/src/features/image/imageVersions.ts` | Reads and bounds versions on mobile. |
| component | GeneratedImage (mobile) | `apps/mobile/src/features/chat/components/GeneratedImage.tsx` | Mobile version toolbar and viewer. |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Reads versions and passes them to the image (lines 1079,2542). |
| service | runImageGenerationTurn (preserve original) | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Attaches the source photo to the turn (lines 253-266). |
| service | hydrateCloudMessage | `apps/mobile/stores/chat/hydrateCloudMessage.ts` | Reads image metadata from Cloud messages (line 98). |
| service | cloudSyncEngine image metadata | `apps/mobile/services/cloudSyncEngine.ts` | Rewrites image metadata when syncing (lines 240-290); how it treats imageVersions is unknown. |
| endpoint | POST /api/media/image/generate | `apps/web/app/api/media/image/generate/route.ts` | Produces each new version. |
| table | image_generation_jobs | `apps/web/lib/server/image-generation-jobs.ts` | Job row for each generated version. |
| test | ImageGenerationCard.test.tsx | `apps/web/features/chat/components/ImageGenerationCard.test.tsx` | Pager and edit-on-screen-version tests. |
| test | GeneratedImageVersions.test.tsx | `apps/mobile/__tests__/GeneratedImageVersions.test.tsx` | Mobile pager and metadata parsing tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens 'New version' on a card and sends a change. | device | ImageGenerationCard.tsx:603-880 |
| Card reads the visible image as base64 and builds an edit (or a text-only revision if the model cannot edit). | device | ImageGenerationCard.tsx:450-466,500-560 |
| Client calls the managed image route; the server creates the job and calls the provider. | our servers | WebChatPage.tsx:3505-3515; generate/route.ts |
| Provider generates the new image. | outside service | image-generation-provider.ts:478-530 |
| Page appends the old image to imageVersions, sets the new imageUrl and saves the message. | device and our servers | WebChatPage.tsx:3466-3485,3519-3530 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| imageVersions list (imageUrl, prompt, aspect, model) | Message metadata in the chat database via saveMessageToDb | Yes through the message record; mobile reads it | Kept with the message; deletion rules unknown |
| Older image files | Managed media storage referenced by URL | By URL | unknown |

**Models and providers.** The model of each version is recorded in the list. A model that cannot edit gets a prompt-only revision with text 'previous prompt. Edit: change', so the earlier picture is not used as input (ImageGenerationCard.tsx:490-497).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for saved chats. |
| Permissions | none found in the code specific to the pager; the revision call uses the same gates as image generation. |
| Subscription | Each new version is a new billable image generation under image_generation (billing-catalog.ts:356). Viewing older versions costs nothing [inferred]. |
| Limits and metering | Mobile caps the list at the last 50 versions (imageVersions.ts:10). Web cap: none found. |
| Feature flags | canUseImages server capability gate on new versions. |
| Model compatibility | Version history works for any model; edit-from-picture needs an edit-capable model. |
| Provider restrictions | Editing from the earlier picture needs the provider route with edit support. |
| Local mode | Pager works on stored messages. Making a new version needs Cloud; there is no Local image path found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No earlier versions | No pager is shown (versionCount > 1 check) | ImageGenerationCard.tsx:1310 |
| Generating a new version | Panel shows generating state; message marked streaming; concurrent save is refused with 'Wait for this image card to finish saving...' | WebChatPage.tsx:3434-3440 |
| Revision fails | Error in panel; card keeps the current image | ImageGenerationCard.tsx:437-441 |
| Temporary chat | Offers 'Keep' to save to Library: 'Saved to your Library. It stays after this chat is gone.' | ImageGenerationCard.tsx:1330-1345 |
| Bad stored version entry (mobile) | Skipped silently | imageVersions.ts:28-34 |
| Image fails to load | Bounded retry and the download action stays | ImageGenerationCard.test.tsx:618 name |
| Accessibility | Groups labelled 'Image versions', buttons labelled, disabled at ends; announcement for new version | ImageGenerationCard.tsx:1133-1152; GeneratedImage.tsx:156-190 |
| Undo/redo, before/after | not handled in the code | searched ImageGenerationCard.tsx and mobile image feature for undo, slider, compare |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Card actions, editing the version on screen, previous version button, download filename, image load failure.
- `apps/mobile/__tests__/GeneratedImageVersions.test.tsx`: Mobile pager and imageVersionsFromMetadata bounds.
- `apps/mobile/__tests__/MessageBubbleMounts.test.tsx`: Mounting a message with imageVersions (line 1327).
- `apps/web/features/chat/pages/__tests__/WebChatPage.image-persistence.test.tsx`: Image message persistence (whether imageVersions is asserted is unconfirmed).
- `apps/web/features/chat/lib/imageGenerationPersistence.test.ts`: Metadata merge and save helpers.

**Test scenarios**

- **Make and page versions**
  1. Generate an image on Web.
  2. Open 'New version', enter a change, send.
  3. Click 'Previous version' then 'Next version'.
  - Expected: Pager shows 1 / 2 then 2 / 2 and the right picture and prompt each time.
- **Reload keeps versions**
  1. After the above, reload the chat.
  - Expected: Pager still shows two versions.
- **Edit older version**
  1. Go to version 1, open 'New version', send a change.
  - Expected: The new image derives from version 1; the list has three entries.
- **Mobile view**
  1. Open the same chat on Mobile.
  - Expected: Toolbar 'Image versions' with 'N of M' appears and steps correctly.
- **Missing features**
  1. Look for before/after, undo and redo controls.
  - Expected: None present (matches the brief).
- **Mobile edit original kept**
  1. Attach a photo, send an edit on Mobile.
  - Expected: The user turn shows the source photo and the result is a separate image.

**Where to look when it fails**

- Toast or message 'Wait for this image card to finish saving before generating a new version.'
- Persistence failure notice from notifyPersistenceFailure (imageGenerationPersistence.ts).
- Chat messages table metadata field (table name not read).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/045-image-editor.md](../../70-qa/test-plans/web/045-image-editor.md)
- Desktop: [70-qa/test-plans/desktop/045-image-editor.md](../../70-qa/test-plans/desktop/045-image-editor.md)
- Mobile: [70-qa/test-plans/mobile/045-image-editor.md](../../70-qa/test-plans/mobile/045-image-editor.md)

## 10. Gaps and dependencies

- **No before/after comparison.** Affects: Web, Desktop, Mobile. Evidence: S45.28 missing in the brief; no slider code found.. Work needed: Design and build a compare view.
- **No undo or redo.** Affects: All apps. Evidence: S45.30 missing.. Work needed: Define state model on top of imageVersions.
- **Mobile never writes versions.** Affects: Mobile. Evidence: No write of imageVersions in apps/mobile.. Work needed: Append previous image on revise or state the rule.
- **Brief says version history missing though a pager exists.** Affects: Documentation. Evidence: S45.29 vs ImageGenerationCard.tsx:1132.. Work needed: Update the brief status to partial.
- **No version-list or grid view; only stepwise paging.** Affects: Web, Mobile. Evidence: Pager only.. Work needed: Optional list view.
- **Web composer upload source not clearly preserved as a message attachment.** Affects: Web, Desktop. Evidence: composer sends base64 and clears state (ChatComposerNew.tsx:3786-3805).. Work needed: Verify and, if absent, store the original.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:image_generation_jobs
- api:POST /api/media/image/generate
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- F045-07
- F045-09

## Unknown

- Whether the server filters or stores unknown metadata keys such as imageVersions (server message route not read).
- How cloudSyncEngine treats imageVersions on mobile upload.
- Whether older version files are deleted with the chat or kept.
- Whether the web composer stores the uploaded original as an attachment.
- Whether mobile has any other path that writes versions (only direct search done).
