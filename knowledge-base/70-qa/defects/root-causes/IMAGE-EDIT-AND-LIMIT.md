---
id: "DOC-70-qa-defects-root-causes-image-edit-and-limit"
type: "root-cause"
title: "IMAGE-EDIT-AND-LIMIT: design"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# IMAGE-EDIT-AND-LIMIT: design

Paths are under the clean tree ~/.cache/agi-audit/worktrees/gap-read-main unless noted. I re-read the code the skeptics cited; both corrections hold (ChatMessageList.tsx lives in features/chat/components/messages/; setAccountUsageBlock is never called with a block from the image path).

## 1. What the person sees today / should see

Today, A (Premium, default image model (model name)): the tile says "This model cannot edit an existing image" (apps/web/features/chat/components/ImageGenerationCard.tsx:836). They type "Make only the circle red" and still get a "new version". It is a text-only regeneration with the prompt `<old prompt>. Edit: <text>` (ImageGenerationCard.tsx:502-511), so the square and circle move and the yellow turns orange. The card looks like it edits and does not.

Today, B (50/50 credits): they send an image prompt. The server answers 429 and the chat shows their message with nothing under it: no card, no toast, no text. The usage banner seen later comes from the usage summary after a reload, not from this failure. An extra chat titled with the prompt stays in Recents.

Should see, A: "Make only the circle red" edits the real picture and the square stays put. If the current model cannot edit, the card edits with the edit-capable model and says so in one line ("Edited with GPT Image ..."). If no edit-capable model is available, the card hides the change box and offers only "New version", labelled as a fresh picture, not an edit.

Should see, B: the same banner the text chat shows above the composer: "You have used your 50 credits for this 5-hour window", the reset time, and the Upgrade or top-up button. It appears right after the failed send, with no reload. Sending again after the reset or an upgrade clears it.

## 2. Causes

- A1 Default image model cannot edit: product defect. IMAGE_MODEL_DEFAULT = IMAGE_MODELS[0] (features/chat/lib/imageGenerationOptions.ts:46), composer state at features/chat/components/Composer/ChatComposerNew.tsx:1239. It is the first catalog entry, not chosen for edit support. Leave it (cost and quality choice, see Owner).
- A2 Card does a text-only regeneration on a non-edit model: product defect. handleDescribeEdit skips the edit path when !supportsEdit (ImageGenerationCard.tsx:505-511). The composer already switches to an edit-capable model (ChatComposerNew.tsx:1367-1370, 1454-1465); the card has no such step.
- A3 Server only edits on the openai image API: MANAGED_MEDIA_IMAGE_EDIT_APIS = ['openai'] (packages/contracts/cloud-contracts/src/managed-media.ts:68-75); a source image to any other model is refused with 422 before credits are reserved (apps/web/app/api/media/image/lib/managed-image-generation.ts:683-700). Provider or model limit as the product ships it. I did not check whether the Gemini image API could edit through our integration: unknown.
- B1 Silent failure: product defect. applyImageError (features/chat/pages/WebChatPage.tsx:3055-3100) stores content '' plus metadata.paywall. ChatMessageList.tsx:773 returns null for account-wide blocks because "stated once, on the composer" (comment :765-772). The text path raises it with setAccountUsageBlock(paywall) (apps/web/lib/hooks/useChatStream.ts:6264) and deletes the empty row (:6270-6277). The image path never does (only other call sites: useChatStream.ts:5051 clears, WebChatPage.tsx:2190 clears). Not caused by the test machine; any plan hits it.
- B2 Stale usage figure: product defect. The summary refreshes only when a text stream ends (WebChatPage.tsx:2302-2303). An image turn never triggers it.
- B3 Reset time lost on image refusals: product defect. The server sends `resets_at` (apps/web/lib/services/managed-usage-request-service.ts:117); the client reads `reset_at` (apps/web/lib/hooks/useMediaGeneration.ts:289-296, 322-326).
- B4 Hitting 50/50: test-machine setup (the account's allowance). The refusal is correct (logs/server.log:41047, :41542).
- B5 Orphan chat: by design for text and image (conversation and user message are saved before the request, WebChatPage.tsx:3314-3350). With B1 fixed, the chat has a reason to exist and a visible banner. No change.

## 3. Change

Smallest set; all in apps/web, none touches packages/ui. Paths are under apps/web.

1. features/chat/pages/WebChatPage.tsx, applyImageError (:3060-3100). It serves three callers: the new-image turn (:3214), the edit/retry path (:3565) and the persist step. Split by whether the row already holds a picture.
   - Read `previous = readMessageMetadata(conversationId, msgId)` once. `holdsPicture = Boolean(previous?.imageUrl)`.
   - Account-wide block (isAccountWideUsageBlock(paywall)): always call `setAccountUsageBlock(paywall)` and `void refreshManagedUsageSummary()`.
   - If `holdsPicture` (an edit, variation or retry of a finished picture): do NOT store `paywall` on the row. Keep the row's content and imageUrl/imageVersions untouched, keep `retryAt` and `jobId`, and let the rejection reach the open revision panel as it does today (:3565 comment). The composer banner states the limit; the picture stays visible, also after reload (nothing paywall-shaped is persisted).
   - If not `holdsPicture` (a new-image turn, or a retry of a row that never produced a picture): keep today's stored row with `paywall`, content ''. ChatMessageList renders null for it (:773) because the composer states the block. The persist step at :3224-3236 still needs the row.
   - Non-account-wide paywalls (per-turn, freeCapacity, suggestStandardModel) keep today's behaviour on both paths.
   - Add `refreshManagedUsageSummary` to the callback deps.
2. Same file, finalMetadata (:3459 region): add `paywall: undefined` to the merged patch. Today it spreads previousMetadata and never clears paywall, so a retry of a refused new-image row that then succeeds would keep a paywall on a finished picture. Clear the block on an accepted image send: in executeNewImageGenerationTurn onGenerated and the revision success path, call `setAccountUsageBlock(null)` and `void refreshManagedUsageSummary()`. This also fixes B2 for successes.
3. lib/hooks/useMediaGeneration.ts:289-296 and :322-326: read `resets_at` first, then `reset_at`. Add `resets_at?: unknown` to ImageApiErrorDetail. Confirm by grep which routes still send `reset_at` before dropping it. Low value alone: resolveMediaPaywallSlot already falls back to quotaResetAt(code, usage) (features/chat/lib/mediaPaywallRecovery.ts:172), so the reset time shows whenever the summary is loaded; this is a correctness fix for a missing summary.
4. One edit-model rule, shared with the composer (replaces the earlier hook-only rule). The admission list has no plan or promotional data: state is only operational (`enabled`, `provider_not_configured`, ... packages/contracts/cloud-contracts/src/managed-media.ts:232-237), and plan gating lives in the composer's availableImageModels (ChatComposerNew.tsx:1317-1332: canUseImageGeneration, imageOfferLimited, promotional entries). So:
   - features/chat/lib/imageGenerationOptions.ts: add a pure `selectEditCapableImageModel(models, admissionFor)`: first model with `source !== 'promotional'` and `admissionFor(model.id)?.supports_edit === true`. The composer's inline find (ChatComposerNew.tsx:1367-1370) and the requestedCanEdit test (:1454-1460) call it. No second rule anywhere.
   - New features/chat/stores/image-edit-model.ts: a tiny non-persisted store `{ modelId: string | null, set }`. The composer sets it from its `editCapableImageModel?.id` in an effect and clears it on unmount. The card reads it. If the composer is not mounted or not settled, the value is null and the card says so honestly.
   - ChatComposerNew.tsx is edited in the live checkout only at lines 44, 68, 1005, 5516-5521, 5875, 6948 (git diff HEAD -U0); my lines (about 1367 and 1454, plus one effect) do not overlap.
5. features/chat/components/ImageGenerationCard.tsx:
   - `const editModelId = supportsEdit ? modelId : storedEditModelId; const canEdit = Boolean(editModelId)`.
   - handleDescribeEdit (:502-540): when canEdit, always take the edit path (buildEdit, then runRevision with modelId: editModelId). Drop the text-only branch.
   - Hint at :836: when !supportsEdit and canEdit, "Edits use <label>" (label from the catalog, no literal names), shown BEFORE submit. When !canEdit, "This model cannot edit an existing image. Describe a new picture instead.", placeholder and aria label stay "Describe a change to generate a new version..." (:859-880), the text-only path stays, labelled as a new picture. Variation and mask controls use canEdit.
   - Version 2/2 must show the model actually used: finalMetadata records `generatedImage?.model ?? requestedModel` (WebChatPage.tsx:3465 region); runRevision (:424-470) passes modelId. Add a test.
6. Keep the server 422 for a source image on a non-edit model (managed-image-generation.ts:683-700) as the last backstop. The card's canEdit never replaces it. No other server, catalog or default-model change. A switched edit on a model the plan cannot use would get a server paywall; item 1 keeps the picture visible in that case.

## 4. Regression check

- Pure: a 429 body with `error.resets_at` yields MediaGenerationApiError.resetAt (useMediaGeneration tests). Pure: selectEditCapableImageModel skips promotional and non-edit models.
- WebChatPage.image-persistence.test.tsx:
  - new-image turn, 429 rolling_five_hour_limit_reached: accountUsageBlock set; row stored with paywall.
  - edit of a row that has imageUrl and two versions, 429 account-wide: accountUsageBlock set; row keeps imageUrl and imageVersions; metadata has no paywall; the persisted message has no paywall; ChatMessageList still renders the picture.
  - retry of a refused new-image row, then success: paywall gone from final metadata; picture renders; block cleared.
  - a successful image send clears the block.
- ImageGenerationCard.test.tsx: non-edit model plus a store edit model calls onRegenerate with modelId = edit model and an `edit` payload, never an `Edit:` text prompt; the hint names the model before submit; with no edit model, the "new picture" wording; version 2/2 shows the edit model.
- Run apps/web tests through its own package script (AGENTS.md section 12).

## 5. Person-style check (rebuilt local compiled build, seeded Premium account)

A. Seeded Premium user. New chat, + > Create image, default model. Send "A yellow square and a white circle on a white background". When the picture shows, open the tile's edit control; the hint names the edit model. Type "Make only the circle red. Keep the yellow square and white background exactly the same." and press Enter. Must see: loading, then version 2/2 with the same layout and only the circle red, and the version label naming the edit model. Compare with version 1 using the arrows. Reload: versions and model label persist. Denied case: seed so no edit-capable model is available to the composer (promotional-only, or plan without it); the box says it cannot edit and the action reads as a new picture.
B. Seeded account at 50/50. + > Create image, send "a red kite". Within a few seconds, with no reload: the composer banner "You have used your 50 credits...", reset time, Upgrade or top-up; click it and confirm the right dialog opens. Switch to another chat: the banner stays (it is in the store). After a reload the store block is gone (it is not persisted: shared/stores/web-chat-store.ts partialize does not carry it, and nothing rehydrates it), so the person sees the prompt with no row (ChatMessageList.tsx:773) plus whatever the usage-summary warning shows (WebChatPage.tsx:1847-1857); record exactly what it says at 100%, I did not verify its text or whether it has the Upgrade button. The text path has the same gap after reload (its empty row is deleted at useChatStream.ts:6270-6277, the block is not persisted), so this is not an image-only regression. Reset or top up, send again: banner clears and an image arrives.
C. Edit at the limit: with a finished picture on screen and the account at its limit, submit an edit. Must see: the banner raised, the original picture still there, still there after reload, and after a top-up a later edit succeeds and shows version 2/2.
D. Free account: Upgrade only, no meters (owner rule).

## 6. Compatibility and rollback

Server contracts unchanged. The new hook field is additive. The stored failed message keeps the same metadata, so old chats render as before. Revert is a plain git revert of the four files. The `resets_at` read falls back to `reset_at`, so old and new bodies both work.

## 7. Owner

Decisions, none blocking the code fix:
1. Whether the Create-image default should be an edit-capable model. Facts: default is catalog order (the Gemini model); only openai-API models can edit. Recommendation: keep the default, since the card now switches to an edit model on demand with a visible label.
2. Whether to add Gemini image editing to the provider integration. Unknown if the provider supports it with our setup; needs a provider docs check and an edit-capable route. Recommendation: not for this release.
3. Edits on a different model may cost differently; confirm that is acceptable. Recommendation: yes, shown in the hint.

## 8. Overlap

Re-run on 2026-11-24 after the review.
- web-lane worktree: `git diff --stat` for WebChatPage.tsx, ImageGenerationCard.tsx, ChatMessageList.tsx, ChatComposerNew.tsx, useMediaGeneration.ts, use-media-model-availability.ts and shared/stores/web-chat-store.ts is empty. No conflict. (The 69 changed files there are other defects.)
- Live checkout ~/Desktop/agiworkforce: unpushed commit 52530d34f9 touches WebChatPage.tsx near :322, :6883-6917 and :7317 only; my edits are at :3060, :3459, :3565 and the deps. ChatComposerNew.tsx has uncommitted hunks at lines 44, 68, 1005, 5516-5521, 5875 and 6948; mine are at about 1367, 1454 and one new effect. The other files are unchanged there.
- Rebase on origin/main before editing and edit only the named lines.

## 9. Review response

Blocker 1 (hiding a finished picture): right. applyImageError is shared with the revision path (WebChatPage.tsx:3565); imageGenerationFailureMetadata spreads previous metadata and adds paywall (imageGenerationPersistence.ts:52-61, merge at :36); ChatMessageList.tsx:773 returns null for the whole message on an account-wide paywall. This hides the picture today too, and my first design would have kept it. Corrected in 3.1: a row that already has imageUrl never stores an account-wide paywall; the block goes to the composer and the picture stays. Also right that finalMetadata (:3459 region) never clears paywall; corrected in 3.2. I did not add a hide-or-delete for the picture row; only new-image turns keep the stored empty row.

Blocker 2 (reload banner cannot pass): right. accountUsageBlock is set only at useChatStream.ts:6264 (plus the image path I add), cleared at useChatStream.ts:5051 and WebChatPage.tsx:2190, and is not in web-chat-store.ts partialize. Nothing rehydrates it. The acceptance step is rewritten (5.B): the block is live-session state; after reload the person sees what the usage-summary warning shows, which I mark as unverified. The text path has the same gap, stated plainly. I chose not to add derive-from-summary or render-stored-row-as-card here, because the first would add a second banner source next to usageWarning (WebChatPage.tsx:1857) and the second reintroduces the repeated card that ChatMessageList.tsx:765-772 removed. That is an owner call if the reload view must show the Upgrade button.

Blocker 3 (edit model rule): right. Admission state is operational only (managed-media.ts:232-237), no plan or promotional data; the composer filters by plan and excludes promotional (ChatComposerNew.tsx:1317-1332, :1360-1370, :1455-1460). Corrected in 3.4: one pure helper used by the composer, and the composer publishes its result to a small store the card reads, so the card never picks a model the composer would not.

Suggestions: B3 partly moot, noted in 3.3 and the grep is still required. Hint names the model before submit and a test covers version 2/2 (3.5, section 4). The 422 backstop stays (3.6). Overlap checks re-run (section 8).
