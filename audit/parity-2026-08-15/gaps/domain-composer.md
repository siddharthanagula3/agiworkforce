# Domain audit: chat composer

Scope: the input bar on every surface — multiline input, paste/drop/attach,
camera/screenshot, dictation/voice, @-mentions, slash commands, model and
reasoning-effort selection, search/research/agent/code/image/video modes,
send/stop/retry/queue, attachment lifecycle, disabled/offline states, and
keyboard behavior — across web (primary + shared-package secondary), desktop
(Tauri, via `packages/ui/unified-chat`), mobile, and the Chrome extension.
Benchmarked against `research/{chatgpt,claude}-web-desktop.md`,
`research/{chatgpt,claude}-mobile.md`, and the screenshot teardowns.

## Summary

**The "four parallel composer implementations" lead is confirmed, with
precise evidence.** Web's primary chat surface (`/chat`, `/chat/[sessionId]`)
renders a 3,621-line locally-owned `ChatComposerNew.tsx`. Desktop and web's
own secondary `/agi-work`/`/chat/code` routes render a genuinely different,
1,422-line shared-package `ChatInput.tsx` + ~470-line `AttachmentMenu.tsx`.
Mobile is a from-scratch 1,249-line React Native implementation. The Chrome
extension is 10,933 lines of vanilla DOM/TS with a code comment admitting it
"mirrors" the shared package by hand rather than importing it. Each of the
four owns its own paste handler, its own attachment policy, and — for two of
them — a fully independent slash-command menu.

This is not merely an architecture smell: it has already produced measurable
capability drift. Mobile has large-paste-to-attachment conversion and
"attach from Library" reuse that the other three surfaces lack. Web's
primary composer has full image/video generation mode that the shared
package (i.e. Desktop) lacks entirely. Web's own follow-up-message queue is
single-slot while the benchmark and this codebase's underlying architecture
both support more. None of this is P0 — every surface degrades to a working,
if less capable, composer, and the single most heavily audited file in the
whole repo (`ChatComposerNew.tsx`, per its own `AUDIT-FIX` comment trail) is
in genuinely good shape. But the drift is real, verified, and — per the task
brief's framing of the composer as the single most important interface in
the product — worth treating as the top architectural priority in this
audit round.

## Composer control-by-control matrix

Legend: ✅ present & wired · ⚠ present but narrower/partial · ❌ absent ·
n/a not applicable to the platform. Cells backed by direct file reads are
unmarked; cells relying partly on the inventory docs (not independently
re-verified control-by-control in this pass) are marked °.

| Control                               | Web (primary)                                                                           | Shared pkg (Desktop + web-secondary)                                    | Mobile                                                         | Chrome ext                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Multiline input + auto-resize         | ✅                                                                                      | ✅                                                                      | ✅                                                             | ✅ (`autoResizeInput`)                                                                                        |
| Rich/code paste (plain text)          | ✅                                                                                      | ✅                                                                      | ✅                                                             | ✅                                                                                                            |
| **Large-paste→attachment (≥10k ch.)** | **❌ COMPOSER-002**                                                                     | **❌ COMPOSER-002**                                                     | ✅ `LARGE_PASTE_THRESHOLD=10_000`                              | **❌ COMPOSER-002**                                                                                           |
| File/image attach (picker)            | ✅ 10 files / 12 MiB                                                                    | ✅                                                                      | ✅                                                             | ⚠ image-only (GAP-122, prior art)                                                                             |
| Camera capture                        | ✅ `CameraCaptureDialog`                                                                | ✅ `AttachmentMenu`                                                     | ✅ `AddToChatSheet`                                            | ❌                                                                                                            |
| Screenshot capture                    | ✅ `getDisplayMedia`, desktop-cap-gated                                                 | ✅ `AttachmentMenu`                                                     | n/a                                                            | ✅ `chrome.runtime` capture                                                                                   |
| Drag-and-drop                         | ✅ `DragDropOverlay`                                                                    | ✅ `handleDragOver/Drop`                                                | n/a (touch)                                                    | ✅°                                                                                                           |
| **Attach from Library (reuse)**       | **❌ COMPOSER-003**                                                                     | **❌ COMPOSER-003**                                                     | ✅ `AddToChatSheet` "Attach from Library"                      | **❌ COMPOSER-003**                                                                                           |
| Folder/project attach                 | ✅ "Project or folder" picker                                                           | ✅ "Project or folder" picker + "Add to project"                        | ⚠ project only, no folder                                      | ❌                                                                                                            |
| Audio-file attachment                 | ❌ (dictation only)                                                                     | ❌                                                                      | ❌                                                             | ❌                                                                                                            |
| Dictation (speech→text)               | ✅ `VoiceInputButton`                                                                   | ✅ `useVoiceInput`                                                      | ✅ most mature (native STT, on-device option)                  | ✅ `setupVoiceInput`                                                                                          |
| Voice mode (live conversation)        | ❌ honestly labeled unavailable (GAP-121, Done)                                         | ❌                                                                      | ✅ (GAP-192: no text-input fallback while active)              | ❌                                                                                                            |
| Search toggle (explicit web search)   | ✅                                                                                      | ✅ `AttachmentMenu` "Search the web"                                    | ✅                                                             | ⚠° not confirmed as a distinct toggle                                                                         |
| Research mode                         | ✅                                                                                      | ✅ `AttachmentMenu` "Research"                                          | ✅                                                             | ❌ (no dedicated toggle found)                                                                                |
| Agent / Work mode                     | ✅ `workMode` toggle                                                                    | ✅ Chat/AGI-Work scope switch (GAP-064, Done)                           | ✅ gated (`showAgiWork`)                                       | ⚠° present in some form, not fully characterized                                                              |
| Code execution                        | ✅                                                                                      | ✅ `AttachmentMenu` "Run code", capability-gated                        | ✅                                                             | ❌                                                                                                            |
| **Image generation mode**             | ✅ full (`imageMode` + aspect + model)                                                  | **❌ COMPOSER-004** (only a prompt-template `/image` command)           | ✅ full (`mediaMode.ts`)                                       | ❌                                                                                                            |
| **Video generation mode**             | ✅ full                                                                                 | **❌ COMPOSER-004**                                                     | ✅ full (`mediaMode.ts` → `video_generation`)                  | ❌                                                                                                            |
| Style selector (writing tone preset)  | ✅ `StyleSelector.tsx`                                                                  | ✅ `AttachmentMenu` "Use style" (Formal/Casual/Concise/Detailed)        | ✅ via `AddToChatSheet` → `StyleSelector.tsx`                  | ❌                                                                                                            |
| Skills                                | ✅ @-mention driven                                                                     | ✅ `AttachmentMenu` "Skills" + "Record a skill"                         | ✅ (`FEATURES.skills=true`)                                    | ❌                                                                                                            |
| Plugins                               | ✅ settings link-out                                                                    | ❌ no entry in `AttachmentMenu`                                         | ❌ (GAP-190, prior art)                                        | ❌                                                                                                            |
| Connectors                            | ✅ settings link-out                                                                    | ✅ `AttachmentMenu` "Connectors"                                        | ✅ (19/21 providers 501 server-side, honest)                   | ⚠ deferred to web (GAP-122, prior art)                                                                        |
| @-mentions                            | ✅ skills mention                                                                       | ✅°                                                                     | ❌ (uses sheet menu instead, by design)                        | ❌                                                                                                            |
| Slash commands                        | ✅ shared registry (search/think/image/code/browser/terminal/database)                  | ✅ same registry, real handlers for rewind/plan/clear/model/memory/help | ⚠ narrow, own 4-command set (`/image /voice /compare /export`) | ⚠ own 6-command set, page-tool-scoped (summarize/tldr/explain/translate/extract/code), independently authored |
| Model selector                        | ✅ catalog-driven                                                                       | ✅ `ModelSelector.tsx`                                                  | ✅ (GAP-154: missing on Dispatch/Code screens)                 | ✅                                                                                                            |
| Reasoning/effort selector             | ✅ per-model catalog chips                                                              | ✅ effort chips + thinking switch                                       | ⚠ slider, not tappable list (GAP-142, Open)                    | ✅°                                                                                                           |
| Send / Stop                           | ✅                                                                                      | ✅                                                                      | ✅                                                             | ✅                                                                                                            |
| Retry / Regenerate                    | ✅ (message-level)                                                                      | ✅°                                                                     | ✅ (message-level, `MessageBubble.tsx`)                        | ✅°                                                                                                           |
| **Queue message while streaming**     | ⚠ single-slot, cancel-only (COMPOSER-005)                                               | ✅°                                                                     | **❌ COMPOSER-006** (send button = Stop-only)                  | ⚠ persisted queue exists, no user control (GAP-293, prior art)                                                |
| Edit a queued message                 | ❌ (cancel-and-retype only)                                                             | ❌°                                                                     | n/a (no queue)                                                 | ❌ (GAP-293, prior art)                                                                                       |
| Cancel/remove attachment              | ✅                                                                                      | ✅                                                                      | ✅                                                             | ✅                                                                                                            |
| Attachment preview                    | ✅ thumbnails + privacy chip                                                            | ✅                                                                      | ✅                                                             | ✅                                                                                                            |
| Upload progress indicator             | n/a — uploads happen at send time, not attach time, on every surface checked; not a gap | —                                                                       | —                                                              | —                                                                                                             |
| Disabled/error/offline states         | ✅ `composerDisabled`/`trialExhausted`                                                  | ✅                                                                      | ✅ richest — offline retry queue with backoff                  | ✅                                                                                                            |
| Configurable send shortcut            | ❌ hardcoded Enter (+ always-on Cmd/Ctrl+Enter) (COMPOSER-008)                          | ✅ `sendShortcut` prop, persisted (GAP-086, Done)                       | ✅ standard, no override needed                                | ⚠ tooltip claims Cmd+Enter; only plain Enter is wired (COMPOSER-007)                                          |

## Strengths (confirmed, do not rebuild)

| Capability                                                                          | Where                                                                                                                                                                                                 | Evidence                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web's primary composer is the most thoroughly audited file in the domain            | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`                                                                                                                                      | Multiple in-place `AUDIT-FIX CMP-3/10/15/16/27` comments show a real prior "does this control do anything" pass, with the fixes still present and not regressed — confirmed by re-reading each cited line.                                                                                                                            |
| Trust-boundary-aware attachment preview                                             | `apps/web/features/chat/components/Composer/AttachmentPreview.tsx:90-99,124`                                                                                                                          | Each attachment thumbnail can carry a `PrivacyChip` showing the outbound destination ("Local"/"BYOK"/"Managed") before send — a real differentiator neither competitor's research surfaced.                                                                                                                                           |
| Slash-command registry is genuinely shared, not duplicated                          | `packages/ui/unified-chat/src/lib/slashCommands.ts`                                                                                                                                                   | Pure, framework-neutral data + a capability-filter function (`filterSlashCommandsByCapability`) imported by both `ChatComposerNew.tsx` (web) and the shared `ChatInput.tsx` (desktop) — this is the one piece of composer logic that _is_ correctly centralized, and proves the pattern COMPOSER-001's recommendation asks to extend. |
| Honest capability gating, no fake availability                                      | `ComposerFooter.tsx:190-193,399,465` (unprovisioned models render `'coming_soon'`); `AttachmentMenu.tsx:405-417` (Run-code item renders disabled-with-reason rather than omitted-or-silently-failing) | Matches the repo's "no fake availability badges" rule; verified these are live conditionals, not dead branches.                                                                                                                                                                                                                       |
| Mobile has the most complete large-paste and Library-reuse handling in the product  | `apps/mobile/src/features/chat/components/ChatInput.tsx:64-67,435-461`; `AddToChatSheet.tsx:63,213,256-269,439-464`                                                                                   | Both features are absent from web/desktop/extension (COMPOSER-002, COMPOSER-003) — mobile is ahead here, not behind, and its implementation is the right one to port outward.                                                                                                                                                         |
| Reasoning-effort UI is per-model and catalog-driven, never a fixed global set       | `ComposerFooter.tsx:74-129` referencing `docs/research/reasoning-effort-capability-matrix-2026-07-10.md`                                                                                              | Avoids the exact anti-pattern ChatGPT's own surfaces exhibit (see "What not to copy" below) — do not regress this into a single global slider.                                                                                                                                                                                        |
| Desktop's send-shortcut preference is real and persisted                            | `packages/ui/unified-chat/src/components/ChatInput.tsx:924,1266`; tracked `GAP-086` (Done)                                                                                                            | Confirmed via direct read — `sendShortcut === 'mod-enter'` drives both behavior and the visible hint label. Good reference implementation for closing COMPOSER-008 on web.                                                                                                                                                            |
| Web already avoids a documented anti-pattern: no persistent "Cmd+Enter to send" nag | `apps/web/features/chat/components/Composer/ComposerFooter.overflow.test.tsx:24,80-82`                                                                                                                | A test explicitly asserts the persistent hint does NOT render — the founder directive cited in the test comment shows this was a deliberate removal, not an oversight.                                                                                                                                                                |

## Verified gaps

| ID           | Sev | Surface                    | Gap                                                                                                                  | Benchmark / internal bar                                                           |
| ------------ | --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| COMPOSER-001 | P1  | cross-surface              | Four independently-authored composer implementations with no shared behavior layer beyond the slash-command registry | Neither competitor ships four visibly-different input bars across its own surfaces |
| COMPOSER-002 | P1  | web (+ desktop, extension) | Large-paste-to-attachment conversion missing everywhere except mobile                                                | ChatGPT converts >10k-char pastes to a file attachment                             |
| COMPOSER-003 | P2  | web (+ desktop, extension) | "Attach from Library" reuse missing everywhere except mobile                                                         | ChatGPT's "Add from Library"                                                       |
| COMPOSER-004 | P1  | desktop-tauri              | Shared package (Desktop's composer) has no image/video generation mode at all                                        | Web and mobile in this same codebase already have it                               |
| COMPOSER-005 | P2  | web                        | Follow-up queue is single-slot, cancel-only                                                                          | Claude's multi-item, drag-reorderable, per-row-editable queue                      |
| COMPOSER-006 | P2  | mobile                     | No queue-and-flush-after-stream; send button becomes Stop-only mid-response                                          | Web/desktop in this same codebase already have queue-and-flush                     |
| COMPOSER-007 | P3  | extension-chrome           | Send button tooltip claims "Cmd+Enter"; only plain Enter is wired                                                    | Internal — factual UI-copy bug                                                     |
| COMPOSER-008 | P3  | web                        | No user-facing send-shortcut preference (desktop has one)                                                            | ChatGPT's rebindable Send shortcut; this codebase's own desktop surface            |

See `domain-composer.json` for full evidence, file:line citations, and
recommendations per gap — not duplicated here.

## What NOT to copy from the benchmark

1. **Don't collapse reasoning-effort into one inconsistent widget across
   surfaces.** ChatGPT renders the same "effort" concept as a checkmarked
   dropdown list (macOS model picker), a pair of unrelated toggles ("Higher
   intelligence" + "Enable Ultra effort", web Settings), and an unlabeled
   5-stop slider with no numeric or text indicator (Chrome extension
   "Advanced" flyout) — three different widgets for one lever
   (`research/shots-chatgpt-web-macos.md` §4.4). This codebase's own
   catalog-driven, per-model effort chips (`ComposerFooter.tsx:74-129`) are
   already a cleaner design; the one place this product risks the same
   anti-pattern is mobile's raw `Slider` for effort, already tracked as
   `GAP-142` (Open) — worth prioritizing precisely _because_ it's the one
   surface still exposed to this failure mode, not because the benchmark
   does it.
2. **Don't bury a paid, working feature behind an "Experimental" flag with
   no discovery path.** `research/cross-cutting-and-complaints.md` §7/§8
   documents Claude's file-creation upgrade living undiscoverably in
   Settings > Features > Experimental. Nothing in this audit found an
   equivalent buried-flag pattern in the composer specifically — worth
   confirming it stays that way as new composer controls ship, rather than
   defaulting new capability flags to a generic "Experimental" bucket.
3. **Don't ship a composer whose keyboard-shortcut hint disagrees with its
   own keydown handler.** This is exactly the ChatGPT-extension-adjacent
   failure mode this audit found _in this repo_ (COMPOSER-007) — call it
   out here as a general principle: shortcut labels are load-bearing UI
   copy, not decoration, and should be generated from (or tested against)
   the actual binding, not hand-typed independently.
4. **Don't let attach-menu depth substitute for capability.** ChatGPT's
   Chrome-extension attach menu (`research/shots-chatgpt-web-macos.md`
   §3.4) lists six "Plugins" (Documents/PDF/Spreadsheets/Presentations/
   Template Creator/Sites) that are really just prompt-routing shortcuts to
   the same underlying chat turn, not distinct execution paths — a long
   menu can read as more capable than it is. This product's honest
   "Coming soon"/settings-link-out gating pattern (`WebSettingsModal.tsx`,
   `AttachmentMenu.tsx`'s disabled-with-reason `Run code` item) is the
   better instinct; don't trade it away to make the attach menu look
   longer.
5. **Claude's implicit-branch-only message editing is a documented user
   complaint** (`research/claude-web-desktop.md:42` — "no first-class,
   visible branch tree... a known, actively-requested gap") that generated
   a whole category of third-party extensions to work around. This
   codebase's web surface already has a _visible_ `ConversationTitleMenu`
   "Duplicate as branch" action distinct from per-message edit-branching
   (`web-frontend.md` §3.1) — a genuine improvement over the benchmark.
   Do not regress this by copying Claude's invisible-branch pattern when
   porting message-editing behavior to other surfaces.

## Notes on method and confidence

- Every ✅/❌ in the matrix backed by a direct grep or read is unmarked;
  cells marked ° lean partly on volume-of-hits heuristics (e.g. counting
  `grep -c` matches for "reasoning\|effort" in the Chrome extension, which
  returned 146 hits — enough to be confident the control exists, not enough
  alone to characterize its exact UX, so it is not filed as a gap either
  way).
- One methodological correction made mid-audit, left visible here because
  it is instructive: an initial narrow grep against
  `packages/ui/unified-chat/src/components/ChatInput.tsx` alone suggested
  the shared package had no Style selector and no Camera control. Both
  turned out to live in a sibling component, `AttachmentMenu.tsx`, that
  `ChatInput.tsx` renders — re-running the same search across the whole
  `packages/ui/unified-chat/src/` tree found them. COMPOSER-004 (image/video
  generation mode) was re-verified the same way, repo-wide, specifically to
  rule out the same false negative, and held up under that stricter check.
- Attachment MIME allowlist (`packages/contracts/cloud-contracts/src/chat-attachments.ts`)
  has no audio type anywhere (images, PDF, and ~12 text/code types only).
  Not filed as a gap: neither competitor's researched composer treats
  "attach a raw audio file for the model to process" as a distinct,
  advertised control (voice input on both is dictation/live-conversation,
  not audio-file upload), so there is no benchmark bar to measure against.
  Flagging here as a scope note in case product intent differs.
