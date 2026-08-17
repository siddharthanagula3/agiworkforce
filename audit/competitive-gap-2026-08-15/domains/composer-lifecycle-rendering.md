# Composer, chat lifecycle & message rendering

### 2026-08-15

Benchmarked against 30 live-observed claims from ChatGPT, Claude, Gemini and Manus
(2026-08-15 research pass). Scope: `apps/web/features/chat/components` (Composer,
MessageBubble, markdown renderer) and `packages/ui/unified-chat`. Cross-referenced
against the same-day exhaustive audit at `audit/parity-2026-08-15/` (168 filed gaps,
mainly `domain-composer.json/md` and `domain-rendering.json/md`).

## Method note

This pass reuses the prior audit's architecture findings (COMPOSER-001..008,
RENDERING-001..012) rather than re-deriving them, and instead traces the 30
specific behavioral claims against web's _primary_ composer/renderer
(`ChatComposerNew.tsx`, `MessageBubble.tsx`, the shared `MarkdownContent.tsx`)
since that is what this domain's benchmark set actually exercised (browser
front-ends, not desktop/mobile/extension). Where a claim overlaps a prior
`RENDERING-*`/`COMPOSER-*` finding, that is cited explicitly. Nine of the 30
claims produced no new gap (web already meets or beats the benchmark) and are
recorded under Strengths, not filed as findings.

## Summary

Web's primary composer and message-action row are more mature than either the
prior audit's `domain-composer.md` matrix suggested when read against this
narrower, live-observed benchmark set: state-differentiated placeholders,
a 3-state send/stop button, catalog-driven effort chips with 7 named levels,
a grouped `+` menu, and a response-action row with copy/thumbs-up-and-down/
regenerate/read-aloud/branch are all real, wired, and — on several axes (effort
chip count, honest capability gating, a visible branch switcher Claude itself
lacks) — ahead of the benchmark. The gaps that do exist are narrow and mostly
single-control: no per-message timestamp anywhere in web's action row (while
the Chrome extension's weaker action row inexplicably _does_ show one), no
second-stage LLM-cleaned conversation title (the truncated placeholder is
permanent), a fully-built but completely unwired inline message-edit
component sitting dead next to a working-but-different compose-and-resend
flow, and one one-line CSS regression that makes the shared code-block copy
button hover-gated despite sitting inside an always-visible header bar. None
of these are P0/P1; all are cheap, concrete, and worth fixing in a single
pass.

## Claim-by-claim findings

### composer-01 — state/surface-specific placeholder text: MATCHES (strength)

`ChatComposerNew.tsx` is reused across every surface with the identical
mechanism the claim describes. i18n strings: `chat:placeholderEmpty` =
"How can I help you today?" (`packages/ui/i18n/locales/en/chat.json:60`,
literally matches Claude's exact copy) for the empty/home state,
`chat:placeholder` = "Message AGI..." (`:2`) for an active conversation, plus
a project-scoped override (`New chat in ${project.name}`,
`apps/web/app/chat/projects/[id]/page.tsx:545`). Internally the same
component further overrides the placeholder by turn/mode state — mid-turn
"Reply — sends when the current response finishes", image mode "Describe or
edit an image", video mode "Describe the video you want"
(`ChatComposerNew.tsx:2258-2266`). This is a stronger implementation of the
claimed pattern than any single one of the three benchmarked products
(4 internal states + 3 external caller-supplied variants, one component).

### composer-02 — 3-state send/stop button: MATCHES (strength)

`SendButton.tsx` (`Composer/SendButton.tsx:1-114`) implements exactly
send/stop/queue with distinct icon+color per state (ArrowUp/ terra-cotta,
Square/red, Clock/terra-cotta) plus a 4th `isSending` spinner sub-state.
`sendButtonMode` derives `'stop'` while `isTurnActive`
(`ChatComposerNew.tsx:1950`), and clicking it calls `handleStop` →
`onStop()` (`:1498-1499`), which actually aborts the stream — verified this
is a real, not decorative, control. Voice input is a separate always-visible
button (`VoiceInputButton`, `:3283`) rather than being fused into the
send-glyph's idle state the way ChatGPT does; this is a cosmetic difference,
not a functional gap.

### composer-03 — named effort levels: MATCHES AND EXCEEDS. Inline deprecation notice: NEW GAP (P2)

`EFFORT_LABEL` (`packages/contracts/types/src/design-system/effort.ts:6-14`)
names 7 levels (None/Minimal/Low/Medium/High/xHigh/Max) — more than ChatGPT's
3 (Instant/Medium/High) — and `effortChipsFor()`
(`ComposerFooter.tsx:110-111`) renders only the catalog-declared subset a
given model actually supports, avoiding a documented ChatGPT/Chrome-extension
anti-pattern (three inconsistent effort widgets across surfaces — see prior
audit's "What NOT to copy" #1 in `domain-composer.md`).

The inline-deprecation-notice half of the claim is a real, verified gap.
`model-store.ts`'s `isCurrentModel()` (`apps/web/shared/stores/model-store.ts:88-105`)
reads the catalog's `deprecation_date` field and _filters out_ any model
whose retirement date has already passed — but a model with a **future**
`deprecation_date` is treated as fully current with zero UI signal. Grepped
`ModelRow` (`ComposerFooter.tsx:362-450`) and the whole file for
`deprecat`/`retir`/`Leaving`/`sunset` — the only hit is the code comment
describing the filter itself; nothing renders a "Leaving on <date>" badge
anywhere in the picker. `packages/contracts/types/src/models.json` currently
has zero entries with a non-null future `deprecation_date`, so this gap is
latent rather than actively user-visible today — but the mechanism as built
(silent removal at the deadline, no advance warning) structurally precludes
ever showing ChatGPT's inline warning; it would need a new code path, not
just data. Classified NEW: the prior audit's `domain-models.md` records
`isCurrentModel()`'s past-date filtering as a _strength_ ("claude.ai
parity"), which is correct as far as it goes, but did not evaluate the
separate future-dated-warning behavior this claim benchmarks.

### composer-04 — Model + Effort as separate one-click chips: DIFFERENT_BY_DESIGN, not a gap

`ComposerFooter.tsx:779-816` renders ONE combined chip
(`{model.name} {EFFORT_LABEL[effectiveEffort]}`) rather than Claude's two
separate chips. Opening it (1 click) reveals both the effort control (at the
top, `:850-889`) and the model list in the same popover — so changing the
model is 2 total clicks (open + pick), matching Claude's economy and beating
ChatGPT's 4-click nested path (effort pill → Advanced → Model submenu →
pick). Changing effort is a slider interaction inside the same popover, also
roughly 2 actions. This is a legitimate different design (one combined
control showing both values at a glance) that achieves comparable-or-better
click economy to Claude's two-chip pattern; not filed as a gap.

### composer-05 — `+` menu grouped into labeled sections: MATCHES (strength)

`ChatComposerNew.tsx` has real dividers separating groups: file/screenshot/
folder actions, then a divider (`:2711-2712`), then Skills + Connectors, then
another divider (`:2802-2803`), then Research/web-search/Run-code toggles —
structurally the same grouping Claude's `+` menu uses, in contrast to
ChatGPT's flat undifferentiated list.

### composer-06 — composer-native custom MCP connector registration: PARTIAL (P3)

The composer's `+` menu "Connectors" entry (`ChatComposerNew.tsx:2735-2775`)
is a **settings-modal link-out** (`openSettings('connectors')`, `:2750`), not
an in-composer "Add custom connector" flow — the in-code comment explains
this is deliberate ("An inline connect toggle here would imply a mid-chat
capability that does not exist"). Custom MCP registration genuinely exists in
the product (`apps/web/features/connectors/pages/ConnectorsPage.tsx`,
`ToolPermissionsPanel.tsx`), just one navigation hop outside the chat
context, unlike Claude's composer-native submenu. Real but narrow; the
capability is not missing, only its composer-adjacency is.

### composer-07 — submission lifecycle (relocation + sidebar entry + spinner): LIKELY MATCHES, not independently re-verified end-to-end

`WebChatPage.tsx` has two distinct composer render branches — a centered
"empty state: greeting banner + centered composer" block (`:4228-4244`) and a
bottom-anchored active-conversation block (`:4313+`) — and a dedicated
`ChatLoadingState.tsx` pending indicator (`aria-label="Loading conversation
history"`). This structurally supports the claimed relocation + pending-state
behavior. Not independently confirmed via a live browser session that the
sidebar entry appears _before_ the response completes (would require
watching the conversation-list websocket/query timing); marking this
evidence as structural, not behavioral-observed.

### composer-08 — two-stage async title generation: CONFIRMED MISSING (NEW, P2)

`apps/web/app/api/chat/conversations/[id]/messages/route.ts:115-133`
("Auto-title conversation from first user message") sets the conversation
title to `content.slice(0, 50) + '...'` (`:124`) on the first user message
and never touches it again — grepped the whole `apps/web` tree for
`generateTitle`/`titleGeneration`/`smartTitle`/`autoGenerateTitle` and found
zero results anywhere. There is no second stage: the raw truncated prompt is
the permanent sidebar title, unlike ChatGPT's instant-placeholder-then-clean-
LLM-title two-step. Not in the prior audit (grepped `GapMatrix.md` and all
`gaps/*.md` for "title generat"/"auto-title"/"two-stage" — one unrelated hit
in `domain-memory.md`). This is a real, permanent product-quality defect
(every conversation title is forever a raw prompt fragment, often ending
mid-word with "…") rather than a missing nicety.

### composer-09 — baseline action row: MATCHES AND EXCEEDS (strength)

`MessageBubble.tsx` renders Copy (`:1766-1783`), Read Aloud (`:1812-1833`),
both ThumbsUp and ThumbsDown always visible side-by-side (`:1838-1916`,
matching Claude/Gemini's symmetric pattern, not ChatGPT's default-hidden-
thumbs-up), and Regenerate (`:1917+`). Confirmed the assistant action row is
`opacity-100` unconditionally while the user-row is hover-gated
(`:1748-1762`, comment: "claude.ai parity... Do not invert this").

### composer-10 — per-message read-aloud icon: MATCHES (strength)

Present exactly as claimed: `Volume2`/`Square` icon in the per-message action
row (`MessageBubble.tsx:1812-1833`), gated on `isReadAloudSupported &&
onReadAloud`, not a separate global voice-mode entry point.

### composer-11 — per-message timestamp in the action row: CONFIRMED MISSING (NEW, P2)

`message.timestamp` exists as data (used only for streaming-order/memo
comparisons, e.g. `:2215`) but is **never rendered as visible text anywhere**
in `MessageBubble.tsx` — confirmed by grepping the file for
`toLocaleTimeString`/`toLocaleDateString`/`format(message.timestamp`/
`dayjs`/`date-fns`: zero hits. The "Slim badge row" comment
(`:1053`) explicitly documents the omission: "only rendered when a marker is
present (**no name/timestamp**)". Notably the Chrome extension's otherwise
much weaker action row _does_ show one (`apps/extension/src/features/
side-panel/bubbles.ts:241-243,704-705`: `sp-timestamp` span via
`formatTime(msg.timestamp)`) — so this is an internal inconsistency as well
as a benchmark gap against ChatGPT/Claude. Not in the prior audit (grepped
`GapMatrix.md`/`gaps/*.md` for "timestamp": zero relevant hits).

### composer-12 — branch-to-new-conversation via more-options menu: MATCHES (strength, and beats Claude)

`MessageBubble.tsx:1977-1981` — "Branch conversation" `DropdownMenuItem`
inside the "..." more menu, alongside Edit/Report, exactly matching
ChatGPT's per-response-menu branching pattern. The prior audit's
`RENDERING-009` independently confirms this is real and wired, and notes
Claude's own branching is _fully invisible_ (an open GitHub issue) — this
codebase already beats that bar.

### composer-13 — always-visible per-response fork icon w/ reassurance copy: MISSING (Manus-specific, P3)

Branch is menu-gated (composer-12 above), not an always-visible icon under
every response, and there is no reassurance copy anywhere in
`MessageBubble.tsx` resembling Manus's "Your original task stays unchanged."
Single-product Manus differentiator; not table-stakes. Low priority — the
current menu-gated version is a reasonable design choice, just less
discoverable than Manus's.

### composer-14 — inline in-place editing of a sent message: PARTIAL / BUILT_NOT_WIRED dead component (NEW, P2)

Web's "Edit" action does **not** turn the message bubble into an inline
textarea. `handleEditMessage` (`WebChatPage.tsx:3401-3433`) instead stashes a
rollback plan and **prefills the composer** at the bottom of the screen with
the old content (`setComposerPrefill(msg.content)`, `:3423`) — the original
message stays visible in the transcript until resubmission, at which point
the message and everything after it is deleted and replaced. Functionally
similar outcome to ChatGPT's edit-and-resend, but a materially different (and
less discoverable — the edit surface is not where you clicked Edit)
interaction pattern.

Separately, and more concretely: `EditableMessage.tsx`
(`apps/web/features/chat/components/messages/EditableMessage.tsx`, 172
lines) is a **fully-built** inline-edit component — auto-resizing textarea
pre-filled with content, Save/Cancel buttons, Escape-to-cancel — with a
doc-comment stating it was "Ported from desktop EditableMessage with
web-appropriate styling." It is exported from the barrel
(`messages/index.ts:6`) but grepped the entire `apps/web` tree and found
**zero import sites** anywhere outside its own definition and the barrel
re-export. This is a textbook BUILT_NOT_WIRED case per this audit's own
methodology: a real inline-edit UI was built and never connected to the
actual "Edit" action, which instead does something else entirely. Not in the
prior audit (grepped for "EditableMessage"/"inline edit": zero hits in
`GapMatrix.md`/`gaps/*.md`).

### composer-15 — inline non-modal tool-call progress rows: MATCHES (strength)

`ToolTimeline.tsx` renders live inline status text ("Running: {phrase}",
"Tool calls queued", collapsed/expanded rows) directly in the transcript
(`:774-923`), not gated behind a modal.

### composer-16 — Activity side panel (favicon log, elapsed timer, narration, source count): PARTIAL (P3)

Stronger than expected but incomplete against the specific claim.
`ResearchActivity.tsx` (inline header above the message, not a side panel)
has a live elapsed clock anchored to server time (`formatElapsed`,
`:39-44,133-147`) and aggregate search/source counts (`:158-180`).
`ResearchPanel.tsx` genuinely is a right-hand sliding panel
("`animate-in slide-in-from-right`", `:232`) with per-source favicon +
domain + title + snippet chips (`SourceRow`, `:27-98`), opened via a header
toggle. What's missing relative to the claim: no first-person italic
narration of the model's own search strategy anywhere (grepped both files
for "narrat"/"italic": zero hits), no "Worked for Ns — Done" status phrasing
(we show "Research complete" + a raw elapsed time instead — functionally
similar, different copy), and the source list is the _cited-sources_ list
rather than confirmed to be a full chronological per-site-visited log.
Overall much closer to the benchmark than the file layout alone would
suggest; the gap is real but narrow.

### composer-17 — inline citation pills (favicon + domain, mid-sentence): CONFIRMS_PRIOR (RENDERING-008)

`InlineSourceTags.tsx:17-54` renders a numbered circular badge (not a
favicon) + title/hostname in a trailing `flex-wrap` row _after_ the whole
message body, not claim-adjacent mid-sentence. Directly confirms the prior
audit's `RENDERING-008` finding, which is the correct home for this gap; not
re-filed as a separate row, only cross-referenced.

### composer-18 — end-of-answer source-card carousel with hero images: RELATED TO RENDERING-008, distinct manifestation (P3)

Neither `InlineSourceTags.tsx` nor `ResearchPanel.tsx` produces a horizontal,
end-of-answer carousel with OpenGraph-style hero images — `ResearchPanel.tsx`
is a toggle-triggered side panel with small favicons, not inline hero-image
cards at the end of the response. It does share ChatGPT's "opens in a new
tab" behavior (`SourceRow`'s `<a target="_blank">`, `:52-55`). Filed as a
distinct, narrower gap alongside RENDERING-008 rather than duplicating it,
since the missing element (hero imagery, carousel placement) is specific to
this claim.

### composer-19 — floating scroll-to-bottom button: MATCHES (strength)

`ChatMessageList.tsx:252-268,1538-1539` — real `ScrollToBottomButton`,
appears when scrolled up, calls `requestScrollToBottom`.

### composer-20 — in-chat Python "Run" button opening a two-pane editor+console panel: CONFIRMED MISSING (NEW, P3)

The shared code-block renderer (`packages/ui/unified-chat/src/components/
markdown/MarkdownContent.tsx:24-70`, `CodeBlock`) offers only a Copy button
in its header bar — no "Run" affordance on any language, Python included.
`CodeExecutionBlock.tsx` is a different mechanism: it renders the _result_ of
a code-execution tool call the model itself already initiated as part of an
agentic turn (an existing "Run code" toggle, tracked as present in the prior
audit's composer matrix), not a user-clickable Run button on an arbitrary
Python fence emitted in plain chat. Single-product ChatGPT differentiator;
real, not previously filed under this framing.

### composer-21 — fresh sandbox provisioning per run: UNVERIFIED, out of frontend scope

This is a backend/infra implementation detail (whether execution reuses a
warm interpreter or provisions fresh) that cannot be confirmed from
`apps/web/features/chat/components`. Not filed as a finding; flagging as
explicitly unverified rather than guessing.

### composer-22 — persistent (non-hover-gated) code-block copy icon: CONFIRMED REGRESSION (NEW, P2)

The shared `CodeBlock` component (`MarkdownContent.tsx:44-62`) does have an
always-visible header bar (`.code-block-header-bar`, unconditionally
displayed per `apps/web/app/globals.css:1004-1007`, with the language label
always visible) — but the Copy **button** inside it carries `opacity-0
transition-opacity group-hover:opacity-100 group-focus-within:opacity-100`
(`MarkdownContent.tsx:52`), i.e. it is hover/focus-gated exactly like
Claude's weaker pattern, not "at all times" like ChatGPT/Gemini's. This is a
real, verified, one-line-fix regression: the persistent chrome exists, but
the one interactive control inside it is invisible until hover, which
defeats the purpose of a persistent header bar. Not in the prior audit
(RENDERING gaps focus on which actions _exist_, not their default-visibility
state).

### composer-23 — per-code-block download icon: MISSING (Gemini-specific, P3)

No download affordance anywhere in `CodeBlock` (`MarkdownContent.tsx:44-70`)
— Copy only. Single-product Gemini differentiator; low priority.

### composer-24 — GFM checklist → real checkbox UI: LIKELY MATCHES (not visually re-verified)

`remark-gfm` is wired (`MarkdownContent.tsx:3`) and the sanitize schema
(`markdownSanitizeSchema.ts:18-49`) extends `defaultSchema` (GitHub's
hast-util-sanitize default, which allow-lists `<input type=checkbox
checked disabled>` specifically for GFM task lists) without narrowing it.
No custom `li`/`input` override exists that would suppress this. High
confidence this renders correctly based on pipeline configuration; not
independently confirmed via a rendered screenshot.

### composer-25 — horizontal rule renders as a visible divider: LIKELY MATCHES (not visually re-verified)

No `hr` override in `markdownComponents` and no `hr`-suppressing CSS rule
found in `globals.css`; react-markdown's default `<hr>` element render
applies. High confidence, same caveat as composer-24.

### composer-26 — long-table truncation behind a manual expand: DIFFERENT_BY_DESIGN, not a gap

`MarkdownContent.tsx:196-200` wraps tables in a horizontal-scroll container
but never truncates rows — a long table always renders in full. This is a
Gemini-specific behavior we deliberately don't replicate; arguably better
(no hidden content) rather than worse. Not filed as a gap.

### composer-27 — Enter-to-send (Shift+Enter newline): MATCHES (strength)

`ChatComposerNew.tsx:1909-1914` — comment explicitly: "Plain Enter sends;
Shift+Enter inserts a newline (the ChatGPT/Claude chat convention...)".

### composer-28 — LaTeX rendering (inline + block): MATCHES (strength)

`remark-math` + `rehype-katex` + `katex/dist/katex.min.css` wired end-to-end
(`MarkdownContent.tsx:4,7,17`), same pipeline for web+desktop.

### composer-29 — nested bullet list uniform glyph: MATCHES (neutral — this is just default browser/Tailwind list-style behavior, common to all three benchmarked products; not a differentiator either way)

### composer-30 — native in-composer screenshot capture: MATCHES (strength)

Confirmed present on web (`CameraCaptureDialog` via `getDisplayMedia`,
desktop-capability-gated), the shared package (`AttachmentMenu.tsx`), and
the extension — per the prior audit's `domain-composer.md` control matrix,
independently re-confirmed here by reading the `canTakeScreenshotCap` branch
in `ChatComposerNew.tsx:2610-2629` ("Take a screenshot" button, distinct from
the separate always-present "Take a photo" webcam button at `:2632-2648`).

## Strengths (confirmed, do not rebuild)

- State-differentiated composer placeholder text matching Claude's exact
  empty-state copy, plus 3 additional internal states no benchmarked product
  was observed combining in one component (`ChatComposerNew.tsx:2258-2266`,
  `packages/ui/i18n/locales/en/chat.json:2,60`).
- A real, wired 3(+1)-state send/stop/queue button, not a decorative icon
  swap (`Composer/SendButton.tsx`, `ChatComposerNew.tsx:1950,1498-1499`).
- 7 named, catalog-driven reasoning-effort levels vs. ChatGPT's 3
  (`packages/contracts/types/src/design-system/effort.ts:6-14`).
- Both thumbs-up and thumbs-down always visible by default in the response
  action row, matching Claude/Gemini's symmetric pattern rather than
  ChatGPT's asymmetric default (`MessageBubble.tsx:1838-1916`).
- A visible per-response branch/fork action via the "..." more menu,
  something Claude's own product does not have at all per the prior audit's
  cross-reference to an open Anthropic GitHub issue (`MessageBubble.tsx:1977-1981`,
  prior `RENDERING-009`).
- A real right-hand research/sources panel with favicon+domain+snippet
  source cards and a live elapsed timer, functionally close to ChatGPT's
  Activity panel despite a different file/trigger structure
  (`ResearchPanel.tsx`, `ResearchActivity.tsx`).

## notWorthCopying (do not blindly clone)

- **ChatGPT's asymmetric thumbs-down-only default action row.** Ours (and
  Claude/Gemini's) symmetric always-visible up+down is more honest UI and
  should not be "fixed" toward ChatGPT's pattern.
- **Gemini's long-table truncation-behind-expand.** Hiding table rows by
  default trades completeness for a shorter default view; our full-render
  behavior is defensible and shouldn't be replaced just because a competitor
  does otherwise.
- **ChatGPT's model-picker submenu depth (effort pill → Advanced → Model
  row, 3 levels).** Our combined single-chip design (composer-04) already
  beats this; do not regress toward deeper nesting when adding features to
  the model/effort picker.
- **Silently hiding a model the instant its `deprecation_date` arrives, with
  zero advance warning.** This is composer-03's actual gap: the fix is not
  "copy ChatGPT's picker," it's "add an advance-warning state to the
  design we already have" — do not solve this by importing a whole new
  picker UI when the existing `ModelRow` + catalog `deprecation_date` field
  already carry everything needed.

## Confidence notes / things not independently re-verified

- composer-07 (submission lifecycle) and composer-24/composer-25 (checklist
  UI, `<hr>` rendering) are marked "likely matches" based on pipeline/config
  tracing rather than a literal rendered screenshot or live browser session;
  flagged explicitly rather than asserted as fully confirmed.
- composer-21 (fresh sandbox per run) is out of this domain's frontend scope
  and left unverified rather than guessed at.
- composer-16's "chronological log of every site queried" vs. "cited sources
  only" distinction was not fully resolved — `ResearchPanel.tsx`'s source
  list could be either depending on what the backend research pipeline
  populates it with; flagged as a partial-confidence gap, not a hard MISSING.
