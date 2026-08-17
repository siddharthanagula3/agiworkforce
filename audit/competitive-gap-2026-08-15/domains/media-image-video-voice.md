# Image, Video & Voice Generation — Competitive Gap Audit

**Date:** 2026-08-15
**Surfaces inspected:** Web (`apps/web`) chat composer, `ImageGenerationCard`, `VideoGenerationPlaceholder` / video result block, video-generation composer controls, sidebar nav, `/chat/library`. Desktop/Mobile media-gen findings are inherited by reference from the prior same-day audit (`audit/parity-2026-08-15/gaps/domain-voice-media.json`) rather than re-verified here — this pass adds new Web-surface findings and Gemini/ChatGPT-specific behavior the prior pass, which benchmarked mainly against ChatGPT and Claude, could not have checked.

## Method note

Per the task brief, every claim was traced UI state → client options type → request contract → network body → server handler, not just "does a component with this name exist." Two findings below (the silent attachment drop, and the stuck generic conversation title) were found this way — they are not in the 22 benchmark claims verbatim but surfaced directly from tracing the exact code paths the claims pointed at.

---

## Claim-by-claim findings

### media-01 — Descriptive generation-progress state (ChatGPT, not table-stakes)

**PARTIAL.** We do have a real progress label with live elapsed time and a dot-grid texture (visually similar to ChatGPT's placeholder), but two things diverge from the claim:

- The label ("Generating image" / "Waiting for the image provider · Xs elapsed") is genuine and honest (no fake progress stages — see the code comment explaining why rotating pseudo-stages like "Painting details" were deliberately rejected), but it is not the specific, model-flavored copy ChatGPT uses.
- Neither the image nor video placeholder is pre-sized to the requested aspect ratio. `GeneratingCard()` in `apps/web/features/chat/components/ImageGenerationCard.tsx:139-178` takes no props and is always `h-[280px] w-full max-w-[420px]` regardless of the aspect ratio the user picked. `VideoGenerationPlaceholder` (`apps/web/features/chat/components/messages/VideoGenerationPlaceholder.tsx:50`) is hardcoded to Tailwind's `aspect-video` (16:9) and has no `aspectRatio` prop at all — a user generating a 9:16 "Story" video sees a 16:9 placeholder box for the full 1-3 minute wait, then a portrait video snaps in.

Severity kept at P3: this is real but cosmetic, and the claim itself is not table-stakes.

### media-02 — Multi-candidate generation rail (ChatGPT, STRONGLY_INFERRED, not table-stakes)

**MISSING.** We only ever generate and render a single deterministic image per request (`ImageGenerationCard`'s only states are Generating → single Result). No multi-thumbnail rail, no candidate picker. The benchmark's own confidence on this claim is Medium and it wasn't even confirmed to survive to a persistent chooser on ChatGPT's side, so this is a low-priority, real gap (P3).

### media-03 — On-image hover controls (ChatGPT, table-stakes)

**PRESENT — matches the pattern.** `ResultCard` (`ImageGenerationCard.tsx:627-769`) renders exactly this: hovering the completed image reveals overlay controls painted on the image itself — a "New version" pill bottom-left (`:687-695`) and a circular Share button bottom-right (`:698-705`), over a gradient scrim, in addition to a standard action bar below (Copy, More→Download/Share) at `:712-767`. This is a genuine strength; counted under Strengths below, not filed as a gap.

### media-04 — Dedicated full-page image editor (ChatGPT, table-stakes)

**PARTIAL / DIFFERENT_BY_DESIGN.** Clicking "New version" opens `EditPanel`, which the component's own top-of-file comment says explicitly "mirrors ArtifactsPanel layout" (`ImageGenerationCard.tsx:11-12`). Concretely: on viewports ≥ `sm` (640px) it is a right-side panel — `sm:relative sm:inset-auto sm:z-auto sm:w-full md:w-1/2 lg:w-[480px]` (`:454-460`) — not the full-view takeover the claim describes. Below the `sm` breakpoint it genuinely is `fixed inset-y-0 right-0 w-full`, i.e. a real full-screen takeover on phone-width viewports, so mobile-width parity with ChatGPT's pattern is closer than desktop-width parity. The panel's title (`:473`, `{titleText} image`) is a plain 36-character slice of the user's raw prompt, not a separately model-generated descriptive title like ChatGPT's "Classic Blue Hurricane Lantern Icon" example. This is a deliberate, consistent design choice (reusing our existing Artifacts-panel idiom) rather than a broken feature, but it does not match the claim on wide viewports. Filed as a gap (P2) because table-stakes claims on the desktop-primary surface deserve real consideration, not because anything is unusable.

### media-05 — One-click aspect-ratio reformat presets (ChatGPT, not table-stakes)

**PRESENT — we exceed the claim.** `EditPanel`'s aspect-ratio dropdown (`ImageGenerationCard.tsx:478-517`, options sourced from `apps/web/features/chat/lib/imageGenerationOptions.ts:52-64`) offers up to 12 named presets per model (Square 1:1, Portrait 2:3/3:4/4:5, Story 9:16, Tall 9:21, Landscape 3:2/4:3/5:4, Widescreen 16:9, Ultrawide 21:9 — filtered per-provider by `IMAGE_PICKER_RATIOS_BY_API`), each one-click, each triggering a real regeneration via `onRegenerate`. This is more presets than ChatGPT's 5, correctly scoped per model/provider so a picker never offers a ratio the adapter can't execute. The one thing missing versus the claim is the per-option preview-shape icon (ours are text-only rows); this is cosmetic and not worth filing as its own gap. Counted as a strength.

### media-06 — Pinned-comment-to-edit annotation entry point (ChatGPT, not table-stakes)

**MISSING.** Grepped `comment|annotat|pin` across `ImageGenerationCard.tsx` — zero relevant hits. No click-a-point annotation tool exists anywhere in our editor. Filed (P3).

### media-07 — In-place natural-language edit composer (ChatGPT, table-stakes)

**PRESENT.** `EditPanel`'s bottom "Describe a change to generate a new version..." field (`ImageGenerationCard.tsx:579-609`) is visually and functionally separate from the main chat composer, updates the same image object in the panel via `onImageUpdated`, and is honestly labeled: the panel's own copy states "Describing a change generates a new image from the updated description. The image above is not modified" (`:565-568`) rather than falsely implying pixel-level editing. Counted as a strength — see the honesty note under Strengths.

### media-08 — Limited post-generation image overflow menu (ChatGPT, not table-stakes)

**Not applicable to us.** This claim describes a _limitation_ of ChatGPT's own "···" menu (only Like/Dislike, no copy/open-in-new-tab). Our equivalent "More" menu (`ImageGenerationCard.tsx:739-764`) offers Download and Share directly, and Copy lives one click away in the action bar — we already exceed what this claim describes. No gap filed; see `notWorthCopying`.

### media-09 — Object/background removal tool (ChatGPT, STRONGLY_INFERRED, low confidence, not table-stakes)

**MISSING.** `EditPanel`'s toolbar (`:462-538`) has only Aspect ratio / Share / Download — no removal/eraser tool. This traces to the same root cause as the prior audit's `VOICE-MEDIA-008` (region/mask editing not wired): the server already accepts `operation`/`source_image`/`mask_image` (`packages/contracts/cloud-contracts/src/managed-media.ts:81-121`), but "no web client sends those fields yet" per `ImageGenerationCard.tsx`'s own top-of-file comment (`:18-20`). Filed as `CONFIRMS_PRIOR` (P3, since even the benchmark's own confidence in ChatGPT having this is Low-Medium and untested).

### media-10 — First-party image-model-name disclosure (Gemini)

**PRESENT — we meet or exceed it.** The image-mode composer footer shows a real, clickable model picker sourced from the model catalog (`ChatComposerNew.tsx:3143-3207`, backed by `IMAGE_MODELS` in `imageGenerationOptions.ts:29-45`, itself filtered to only executable/live/non-deprecated catalog entries per CLAUDE.md's model-registry rule). This is a functioning multi-model picker with real names, not just a passive modal-header mention the way Gemini discloses "Nano Banana 2." Strength.

### media-11 — Explicit template/freeform/refine entry menu (Gemini, STRONGLY_INFERRED)

**MISSING.** "Create image" (`ChatComposerNew.tsx:2426-2511`) is a single mode toggle into one freeform composer; there is no template-start vs. freeform-start vs. refine-start choice presented as a menu. Filed (P3, Gemini-only).

### media-12 — Dedicated top-level Images/Videos nav destinations (Gemini)

**PARTIAL.** `WebSidebar.tsx`'s nav items are Projects / Live artifacts / Dispatch / Schedules / Customize — no "Images" or "Videos" entries. Image/video generation is reachable only as sub-items inside the composer's "+" attach menu (`ChatComposerNew.tsx:2426`, `:2515`). There is a related but different surface: `/chat/library` (`apps/web/app/chat/library/page.tsx`), reachable from `WebAppShell.tsx:274-275`, which browses "generated images, code-interpreter outputs, documents" (per its own doc comment) after the fact — but it's a browse-existing-assets page, not a dedicated per-media-type generation composer the way Gemini's Images/Videos modals are. Filed (P3, Gemini-only).

### media-13 — Image-to-video via composer attachment (Gemini, table-stakes per claim)

**MISSING at the schema level, and the client-side attempt at the closest thing silently loses data — see the standalone finding below.** `ManagedMediaVideoGenerationRequestSchema` (`packages/contracts/cloud-contracts/src/managed-media.ts:167-186`) has no `source_image` (or any reference-image) field — this directly reconfirms the prior audit's `VOICE-MEDIA-010`, still open. Filed as `CONFIRMS_PRIOR` (priorAuditRef `VOICE-MEDIA-010`).

### media-14 — Video composer: aspect-ratio, model picker, mic dictation (Gemini, table-stakes)

**PRESENT — we meet the claim.** All three are real and wired:

- Named model picker: `ChatComposerNew.tsx:3211-3276`, sourced from the catalog (`availableVideoModels`), and the picked `videoModelId` is genuinely sent in the request (`:1659-1666`).
- Aspect-ratio control: `:3014-3058`, options come from the model's published `videoGeneration.outputSizes` so a model that only offers landscape shows one entry "rather than a lie" (per the code's own comment) — this is more honest than a static, possibly-fake list.
- Resolution/quality control with duration constraints surfaced inline: `:3060-3111`.
- Mic dictation: the composer's mic button is explicitly "capability-neutral" and shared across all modes including video mode (`:3278`, comment).
  Strength.

### media-15 — Template-gallery on-ramp for video generation (Gemini)

**MISSING.** Grepped "template" across the composer and media components — the only hits are unrelated custom slash-command templates. No landing page or starter-template gallery exists for video (or image) generation; the only on-ramp is the composer mode toggle. Filed (P3, Gemini-only).

### media-16 — First-party video-engine-name disclosure (Gemini, STRONGLY_INFERRED)

**PRESENT.** The video model picker (`ChatComposerNew.tsx:3211-3276`) discloses the real catalog model name for whichever video model is configured — functionally stronger than Gemini's passing subhead mention, since ours is an actual selectable, catalog-sourced control. Strength.

### media-17 — End-to-end video lifecycle with completion state and player chrome (Gemini, table-stakes)

**PRESENT, one control short.** In-flight: `VideoGenerationPlaceholder` gives a genuine (non-generic, per its own comment explaining why the previous version was a silent grey box) label + elapsed counter. Completion: `MessageBubble.tsx:1586` shows the exact copy "Your video is ready!" over a native `<video controls>` element with a poster thumbnail (`:1588-1596`), which gives play/pause, volume/mute, and a scrub bar with timestamp for free via the browser's native chrome. A Download button is overlaid top-right on hover (`:1601-1614`). What's missing versus the claim: there is no explicit **Share** button for a finished video (images get one via `ShareModal`; video does not). Filed (P3 — the core lifecycle is solid, this is one missing button, not a broken workflow).

### media-18 — Correct video-duration readout (Gemini's own reproducible bug)

**Not applicable as a gap for us; likely already correct by construction.** We use a standard `<video controls preload="metadata">` element rather than Gemini's custom-built player chrome, so the duration readout is the browser's native implementation, not something our code computes or could get stuck at "0:00/0:00" the way Gemini's custom player did. Not independently runtime-verified against a real served video file in this pass (that would require playing an actual generated clip in a browser), so treat as "very likely fine by construction," not proven. No gap filed.

### media-19 — Visible video frames during playback (Gemini, low confidence, likely a tooling artifact)

**Not applicable.** The claim itself flags this as probably a screenshot-tooling limitation, not a confirmed product defect, and there is no comparable static-code signal to check on our side. Not filed.

### media-20 — Data-store-specific deletion disclosure (Gemini)

**PARTIAL — generic copy.** Our delete confirmation (`apps/web/features/chat/components/Sidebar/ConversationListItem.tsx:320-323`) reads "Delete conversation? This will permanently delete "{title}" and all its messages." — it does not name a specific backing data store, and it does not explicitly state that generated media (images/videos) tied to the conversation is included in the deletion, leaving that ambiguous to the user. Filed (P3; noting the compliance-adjacent angle in Notes below since the active branch is `compliance/dpdp`).

### media-21 — Auto-titled conversation from a generation prompt (Gemini) — **new bug found while verifying this claim**

**PRESENT_WORSE — genuinely broken, not just "different."** Regular text chat auto-titles correctly: `WebChatPage.tsx:3132-3145` renames a conversation from its default "New Chat" title to a 60-character slice of the first user message once the second message arrives — but only if `convo.title === 'New Chat'`. Both media-generation entry points bypass this by construction: `handleGenerateImage` creates a fresh conversation with the literal title `'Image generation'` (`WebChatPage.tsx:1798-1802`) and `handleGenerateVideo` creates one with `'Video generation'` (`:2316-2320`). Neither string is `'New Chat'`, so the auto-title effect's own guard permanently skips them — every image- or video-generation conversation keeps the generic label forever, even after real content exists. This is worse than "we don't match Gemini's prompt-derived title" — it's an internal inconsistency our own text-chat flow doesn't have, and it matches CLAUDE.md's explicit warning about "stale... labels" as a bug to fix immediately when reproducible. Filed as a real gap (P2, not just cosmetic — it degrades sidebar scannability for every media-gen conversation a user ever starts).

### media-22 — Iterative in-place refinement (ChatGPT + Gemini majority convergence, table-stakes)

**PRESENT — matches the majority pattern.** Both the "Describe a change" composer (`ImageGenerationCard.tsx:579-609`, media-07) and the aspect-ratio regenerate control (`:478-517`, media-05) update the same image object in place inside the panel rather than requiring a fresh top-level prompt. The one nuance worth flagging: `handleDescribeEdit` builds cumulative prompts by string-concatenation — `${currentPrompt}. Edit: ${text}` (`:407`) — so many iterative edits in one session grow an ever-longer prompt string rather than a bounded edit history; this is a minor scaling concern, not a broken feature, and not filed as its own gap. Strength overall.

---

## Standalone finding: image/video generation silently discards staged attachments

Not a direct restatement of any single claim, but found while tracing media-13's "image-to-video" claim through the actual request-building code, and it is a real, reproducible, silent-failure bug in its own right:

- The composer's "+" menu's "Add photos & files" item (`ChatComposerNew.tsx:2413-2424`) is available unconditionally — it is not hidden or disabled by `imageMode`/`videoMode`.
- Toggling into image or video mode (`setImageMode`/`setVideoMode`, `:524-531`) does not clear any staged attachments, and `AttachmentPreview` keeps rendering them (`:2077-2082`) — so a user who attaches a reference photo and then switches into image or video generation mode sees no warning that anything has changed.
- But the actual send handlers for both modes build their request from prompt + generation options only — `attachments` is never referenced in the `sendImageMode` branch (`:1601-1627`) or the `videoMode` branch (`:1632-1669`).
- `clearComposerState()` (`:943-1030`, `clearAttachments()` at `:948`) then wipes the staged attachment on send, with no error, no toast, no indication the file was never part of the request.
- The one existing warning mechanism, `hasAttachmentConflict` (`:691`), only checks whether the _selected text model_ can read images — it has no awareness of `imageMode`/`videoMode` at all, so it never fires here.

Net effect: a user who stages a photo intending it as a visual reference for an image or video generation gets it silently discarded with zero feedback, every time, on every existing build. This compounds the schema-level gap (media-13/`VOICE-MEDIA-010`: there is nowhere to even send a reference image server-side for video) with a client-side UX defect that exists independently of that schema gap for image mode too. Filed as its own gap at P1 — silent, unindicated loss of explicit user input matches this audit's own P0/P1 "data loss" framing closely enough that it should not sit at P3 alongside the cosmetic gaps above.

---

## Strengths (we are at or ahead of the benchmark)

1. **Model disclosure via a real, functioning picker, not a passive label** — both image (`ChatComposerNew.tsx:3143-3207`) and video (`:3211-3276`) modes let the user see and choose the real, catalog-sourced backing model, sourced correctly per CLAUDE.md's model-registry rule (`imageGenerationOptions.ts:29-45`). This exceeds Gemini's media-10/media-16 disclosure, which is a passive one-line mention with no user choice.
2. **Aspect-ratio preset breadth** — up to 12 named, per-provider-filtered presets for image regeneration (`imageGenerationOptions.ts:52-64`) versus ChatGPT's 5 (media-05).
3. **On-image hover controls** genuinely match the claim's pattern (media-03): overlay Edit/Share affordances directly on the image, not buried in a menu.
4. **Honest capability labeling as a deliberate, repeated pattern** — `ImageGenerationCard.tsx`'s own top-of-file comment and in-panel copy explicitly disclose that "New version"/"Describe a change" regenerate rather than pixel-edit, rather than calling the control "Edit" and quietly under-delivering. The video-mode composer comment (`ChatComposerNew.tsx:3115-3130`) documents a real prior bug (a stale text-model label showing during video mode) and the fix. This pattern is exactly what CLAUDE.md's failure-prevention rules ask for, and it shows up multiple times in this one file family — worth recognizing explicitly, not just implicitly.
5. **Honest, non-generic in-progress copy** for both image and video generation, with a code comment on the video placeholder explicitly documenting why an earlier version's label was accessibility-only and had to be fixed — this is a real regression the team already caught and fixed once.
6. **Video generation is fully wired end-to-end on Web** — model, aspect ratio, resolution, and duration all flow from UI state through `onGenerateVideo` into the real request (`ChatComposerNew.tsx:1659-1666`, `WebChatPage.tsx:2298-2632`), unlike the prior same-day audit's Desktop findings (`VOICE-MEDIA-001`), which found video generation entirely unreachable on the Tauri shell. This pass did not re-verify Desktop; the point stands specifically for Web.

## Not worth copying

- **ChatGPT's overflow-menu restriction (media-08)** — limiting the "···" menu to only Like/Dislike with no copy/open-in-new-tab is a _limitation_, not a feature. We already do better by surfacing Download and Share directly. Do not narrow our menu to match this.
- **A passive model-name mention buried in a modal subhead (Gemini's "Create with Omni," media-16)** — naming a model in passing prose is strictly weaker than a real picker the user can act on. We already have the stronger version (a functioning picker); do not regress to a text-only disclosure.
- **Gemini's broken duration readout (media-18)** is obviously not something to copy; noted only to confirm we are not at risk of the same bug by construction (native `<video>` element vs. Gemini's custom player).

## Notes that didn't fit the structured schema

- **Production video-generation availability caveat (context, not a new finding):** `docs/agent-context/known-flaws.md:33-88` (`WEB-VIDEO-PRIVATE-BUCKET-UNSET`) documents that as of 2026-08-12, managed video generation's storage config was fixed in code/env but explicitly "awaiting the next production deploy to take effect," with the remaining step being a post-deploy confirmation via `GET /api/media/availability`. This audit did not re-check production deploy status — it is already tracked in known-flaws.md and is an infra/deploy-state question, not a code-capability gap, so it is not re-filed here. Flagging it because if unconfirmed, video generation could still be `UNAVAILABLE` in production regardless of how complete the client code is.
- **Compliance angle on media-20:** the current branch is `compliance/dpdp`. The generic delete-confirmation copy not naming what happens to generated media assets is a plausible small compliance-hygiene item (clarity of what "delete" actually deletes) beyond pure competitive parity — flagged at P3 here since that's what the evidence directly supports, but worth a second look from whoever owns DPDP-adjacent work if the underlying data-deletion completeness itself (not just the confirmation copy) hasn't been separately verified.
- **Mobile and Desktop were not re-verified in this pass.** The prior same-day audit's `domain-voice-media.json` already covers Desktop's unwired image/video generation (`VOICE-MEDIA-001`), Mobile's video-URL absolutization bug (`VOICE-MEDIA-002`), and both surfaces' voice/dictation gaps (`VOICE-MEDIA-004`, `VOICE-MEDIA-005`, `VOICE-MEDIA-007`) in detail this pass did not attempt to redo. Nothing in this pass contradicts those findings; where this pass's Web-specific evidence is relevant to the same underlying claim (media-09/media-13), it is cross-referenced above rather than duplicated.
