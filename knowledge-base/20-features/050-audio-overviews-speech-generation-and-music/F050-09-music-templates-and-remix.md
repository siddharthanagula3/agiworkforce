---
id: "F050-09"
type: "feature"
title: "Music templates and remix"
aliases: ["Music templates", "Remix starters", "S50.24", "S50.25"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.24", "S50.25"]
depends_on: ["F050-07", "F050-10", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "SYS-api-and-contracts", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "7 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-09 Music templates and remix

Music templates and remix would offer ready starting points for a track and let a person create a variation of an existing track. Nothing exists on any app; it needs music generation and stored tracks first.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.24](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5024), [S50.25](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5025).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would show template starting points (S50.24) and let the person vary an existing track (S50.25). Not built.

**Why it exists.** Brief Should lines S50.24 and S50.25. Templates lower the blank-page problem; remix reuses prior work.

**Who uses it.** Nobody yet. Intended: casual users who do not know how to describe music.

**Problems it solves**

- Blank-page problem for non-musicians.
- Iterating on a track without starting again.

**Use cases**

- Pick a 'lo-fi study' template and adjust tempo.
- Remix yesterday's track to be slower.
- Start from a birthday-song template.

## 2. User experience

**Where to find it**

- Web: not present.
- Desktop: not present.
- Mobile: not present.
- CLI: not present.
- VS Code extension: not present.
- Chrome extension: not present.

**Before you start**

- Music generation (F050-07) and a stored track (F050-10); neither exists.

**Screens and controls**

- None exist for music. A Remix control exists only for saved images in the Library (web, shared UI, mobile).

**Journey**

1. Not available. [proposed] 1. Open music. 2. Pick a template or an existing track. 3. Adjust. 4. Generate.

**What the person sees and gets**

- None.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- No music template or music remix code exists. A Remix action does exist for saved images on web and mobile (Cloud mode only on mobile), and it is the nearest pattern to reuse. Web: stageLibraryItemForImageRemix throws 'Only an image can be remixed.' (apps/web/features/library/lib/library-chat-handoff.ts:70-77), wired at apps/web/features/library/components/LibraryView.tsx:230. Shared UI shows Remix only when isImageItem(item) (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833). Mobile: apps/mobile/src/features/library/index.tsx:545-560 and 629-630.

**Incomplete**

- A skill marketplace on desktop carries 'music' as a search keyword for creative skills (apps/desktop/src/stores/skillMarketplaceStore.ts:104). It is not a music template feature.
- Music is reserved in shared contracts: the model type (packages/contracts/types/src/model-catalog.ts:239) and the artifact type (packages/contracts/types/src/conversation.ts:89). The desktop router already routes a 'music' category (apps/desktop/src-tauri/src/core/llm/llm_router.rs:633,930; apps/desktop/src/constants/llm.ts:44) and the web classifier detects music intent (apps/web/lib/services/conversation-classification-service.ts:153). No music model or provider is wired.
- The ElevenLabs connector is coming soon on desktop (apps/desktop/src/features/connectors/connectorDefinitions.ts:870-881, comingSoon: true) but live as an api-key connector on web (apps/web/lib/connectors/catalog.ts:206); the two apps differ.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Music templates and music remix on all six apps and the API (brief: S50.24, S50.25 missing).

## 4. Required behaviour

**Established requirements**

- Music templates are offered as starting points. (source: S50.24 brief)
- Remix starters let the user vary an existing track. (source: S50.25 brief)

**Acceptance criteria**

1. A template list is shown and picking one prefills the music request.
2. Remix starts from a chosen existing track and produces a new track, leaving the original unchanged.
3. The original track remains playable and downloadable after a remix.
4. Templates are read from shared data so every app shows the same list.
5. A remix of a deleted or missing track shows a clear message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Remix needs the source audio or its settings to be kept [inferred].
- Templates are content, not code, so they should live in shared configuration [inferred from AGENTS.md section 4].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Remix could reuse the prior prompt and settings rather than the audio, to keep cost down.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | MODEL_TYPES | `packages/contracts/types/src/model-catalog.ts` | Reserved 'music' type (line 239). |
| config | ArtifactType | `packages/contracts/types/src/conversation.ts` | Reserved 'music' artifact type (line 89); a remix source would be such an artifact. |
| store | skillMarketplaceStore | `apps/desktop/src/stores/skillMarketplaceStore.ts` | Keyword 'music' in creative category (line 104). |
| config | audit missing list | `audit/missing/050-audio-overviews-speech-generation-and-music.md` | Open rows S50.24, S50.25. |
| config | area brief | `knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md` | Should lines. |
| config | desktop chat artifact types | `apps/desktop/src/types/chat.ts` | Copy of artifact type list (line 15). |
| service | persistedCloudMessage | `apps/desktop/src/runtime/persistedCloudMessage.ts` | Persists artifact kinds including 'music' (line 136). |
| service | TauriRuntime | `apps/desktop/src/runtime/TauriRuntime.ts` | Artifact kind list including 'music' (line 286). |
| config | web connector catalog | `apps/web/lib/connectors/catalog.ts` | ElevenLabs api-key connector (line 206), live on web; not a template source. |
| config | desktop connector definitions | `apps/desktop/src/features/connectors/connectorDefinitions.ts` | ElevenLabs coming-soon entry mentioning music (lines 870-881, comingSoon: true); differs from web, where it is live. |
| other | library image remix handoff (web) | `apps/web/features/library/lib/library-chat-handoff.ts` | stageLibraryItemForImageRemix (lines 70-90) reads the library file and stages the composer; image only. Wired at apps/web/features/library/components/LibraryView.tsx:230. Nearest pattern for a music remix. |
| component | shared LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shows Remix only for image items (lines 294, 1833). |
| screen | mobile library | `apps/mobile/src/features/library/index.tsx` | Image Remix, Cloud mode only (lines 545-560, 629-630). |
| service | desktop llm router | `apps/desktop/src-tauri/src/core/llm/llm_router.rs` | Accepts a 'music' routing category (lines 633, 930); no music provider wired. Also apps/desktop/src/constants/llm.ts:44. |
| service | conversation classification | `apps/web/lib/services/conversation-classification-service.ts` | Detects music intent (line 153). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No music template or remix flow exists, so nothing runs and no location applies (the runs_on value is a schema placeholder only). For comparison, the existing image Remix runs on the device: it reads the library file and stages the composer, with no server call at that step. | device | No template or remix route found by search; image Remix: apps/web/features/library/lib/library-chat-handoff.ts:75-90. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No templates or remix sources stored. | none found in the code | not applicable | not applicable |

**Models and providers.** No model or provider. Unknown. A 'music' model category is reserved in the model catalog and the desktop router, but no music model or provider is configured for it.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Unknown; needs a music model that accepts a source track. A 'music' model category is reserved in the model catalog (model-catalog.ts:239) and the desktop router (llm_router.rs:633,930), but no music model is configured for it. |
| Provider restrictions | Unknown. No music provider is configured. |
| Local mode | No local music templates or remix exist in the code. The existing image Remix on mobile is Cloud mode only (shows only when appMode === 'cloud' && asset.kind === 'image', apps/mobile/src/features/library/index.tsx:629-630); a music remix would likely need the same gating. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code because the feature does not exist | No code found. |
| Remix of a track the person no longer has | not handled in the code | No remix code found. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **No template list**
  1. Open each app and look for music templates.
  - Expected: None today.
- **Template prefill**
  1. After build, pick a template.
  - Expected: The request is prefilled and editable.
- **Remix keeps original**
  1. After build, remix a track then play both.
  - Expected: Both play; original unchanged.
- **Remix missing source**
  1. Delete the source then try to remix.
  - Expected: A clear error, no charge.

**Where to look when it fails**

- Check audit/missing/050-*.md for open rows.
- Search for template data files after any build.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No templates** Affects: All six apps. Evidence: Brief S50.24 missing. Work needed: Define template data in shared config and a picker per app.
- **No remix** Affects: All six apps and API. Evidence: Brief S50.25 missing. Work needed: Store tracks, add a vary action and a provider route that supports it.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F050-07
- F050-10
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- SYS-api-and-contracts
- surface:web
- surface:mobile

## Unknown

- Template content and count.
- Whether remix uses audio or settings.
- Which provider supports variation.

## Second reader's check

A second reader checked 11 statements of this page against the code: 7 correct, 4 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Working in the code: Nothing. No template or remix code found." The code shows: A Remix action exists, for images only. Web: apps/web/features/library/lib/library-chat-handoff.ts:70-77 (stageLibraryItemForImageRemix throws 'Only an image can be remixed.'), wired at apps/web/features/library/components/LibraryView.tsx:230. Shared UI: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833 shows Remix only when isImageItem(item). Mobile: apps/mobile/src/features/library/index.tsx:545-560 and 629-630 (image assets, Cloud mode only). (library-chat-handoff.ts:75-77; LibraryView.tsx:1833; mobile library/index.tsx:629). **Corrected:** No music template or music remix code exists. A Remix action does exist for saved images on web and mobile (Cloud mode only on mobile), and it is the nearest pattern to reuse. Say 'no music remix', not 'no remix code'.
- **Partly wrong (section 6):** "Execution table lists the flow 'Runs on: our servers' with 'No template or remix route found by search.'" The code shows: No music route exists, so a 'runs on' value is invented. The existing image Remix runs on the device: it reads the library file and stages the composer (library-chat-handoff.ts:75-90), and no server call is made at that step. (apps/web/features/library/lib/library-chat-handoff.ts:75-90). **Corrected:** Runs on: nothing (no flow exists). Do not name a location.
- **Partly wrong (section 7):** "Local mode: No local templates or remix exist in the code. Subscription, account and limits: none found." The code shows: The page omits that the image Remix is hidden outside Cloud mode on mobile: it shows only when appMode === 'cloud' && asset.kind === 'image'. The 'none found' rows are right for music. (apps/mobile/src/features/library/index.tsx:629-630). **Corrected:** Local mode: no music templates or remix. The existing image Remix on mobile is Cloud mode only, and a music remix would likely need the same gating.
- **Partly wrong (section 7):** "Model compatibility: needs a music model that accepts a source track. Provider restrictions: Unknown." The code shows: The 'music' model type is reserved, and the desktop router accepts a 'music' category: llm_router.rs:633 and 930 map 'music' with image-gen, video-gen, tts and stt. This is a routing category only, and no music provider is wired. The page's Unknown is fair, but it should cite the reserved routing category. (apps/desktop/src-tauri/src/core/llm/llm_router.rs:633,930; apps/desktop/src/constants/llm.ts:44). **Corrected:** A 'music' model category is reserved in the model catalog and the desktop router, but no music model or provider is configured for it.

**Facts the page missed**

- Image Remix exists in the Library on web (apps/web/features/library/lib/library-chat-handoff.ts:75-90; LibraryView.tsx:230), the shared UI (packages/ui/unified-chat/src/components/library/LibraryView.tsx:294,1833, image items only) and mobile (apps/mobile/src/features/library/index.tsx:545,629-630, Cloud mode and image only). It is the existing pattern a music remix would extend, and the page says no remix code exists.
- Music is already in the shared contracts: the model type at packages/contracts/types/src/model-catalog.ts:239 and the artifact type at conversation.ts:89. The desktop router already routes a 'music' category (apps/desktop/src-tauri/src/core/llm/llm_router.rs:930) and the web classifier detects music intent (apps/web/lib/services/conversation-classification-service.ts:153). The page does not mention the router or classifier hooks.
- The ElevenLabs connector is coming soon on desktop (connectorDefinitions.ts:870-881, comingSoon: true) but live as an api-key connector on web (apps/web/lib/connectors/catalog.ts:206). The page does not say the two apps differ.
