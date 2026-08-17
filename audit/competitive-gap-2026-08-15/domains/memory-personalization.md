# Memory & Personalization — Competitive Gap Audit

**Date: 2026-08-15**

Benchmarked against live-observed ChatGPT, Claude, and Gemini behavior (20 claims; Manus had no
memory-domain claims in this batch). Cross-referenced against the same-day prior audit at
`audit/parity-2026-08-15/gaps/domain-memory.json` (10 filed gaps, MEMORY-001..010).

## Method note

Web is the surface with the most memory surface area (Capabilities toggle → Memory settings →
project dialogs → Reflect recap), so most claims were verified there, with Desktop and Mobile
pulled in wherever the prior audit or a claim specifically implicated them. Every claim below was
traced from UI control → store/hook → API route → persistence, not just "a component exists."

---

## Claim-by-claim findings

### memory-01 — Baseline chat-history memory toggle with manage/delete (tableStakes, ALL_PRODUCTS)

**PRESENT — a genuine strength.** Fully wired end to end:

- Toggle: `apps/web/features/settings/sections/CapabilitiesSection.tsx:127-138` — a `Switch`
  bound to `settings.memory`, persisted via `savePreferenceNamespace('capabilities', …)`
  (line 63) and read at send time by `apps/web/lib/runtime/memory-capability.ts`
  (`isMemoryCapabilityEnabled()`).
- Manage surface: `SettingsSectionLink section="memory"` at `CapabilitiesSection.tsx:163-168`
  routes to `apps/web/features/settings/sections/MemorySection.tsx`, which mounts
  `MemoryEditor` (`packages/ui/unified-chat/src/components/MemoryEditor.tsx`) — full add/edit
  ("Edit memory" via clicking a fact), and per-row delete (`Trash2` button, line 267-275), plus a
  "Forget everything" bulk-delete (line 292-300).
- Nav wiring confirmed real, not orphaned: `packages/ui/ui/src/settings-nav.ts:175`
  (`{ key: 'memory', label: 'Memory', icon: Brain }`) is inside `SETTINGS_NAV_GROUPS_WEB`, and
  `apps/web/features/settings/components/WebSettingsModal.tsx:809` maps `memory` →
  `<MemorySection />`.
- Backend is real, not a stub: `apps/web/app/api/memory/route.ts` (GET/POST against
  `user_memories`), `apps/web/app/api/memory/[id]/route.ts` (PUT/DELETE).

No gap filed. This meets or slightly exceeds the benchmark bar (we additionally split memory into
account-wide vs. local-device scope with visible sync-status copy — see `syncStatusLabel()` in
`MemoryEditor.tsx:306-336` — which none of ChatGPT/Claude/Gemini's toggle language does).

### memory-02 — Narrative prose under topical headers, not a flat list (MAJORITY: ChatGPT, Claude)

**PARTIAL.** Web is a flat, unheaded list: `MemoryEditor.tsx:215-283` renders `facts.map(...)` as
plain `<li>` rows with only a relative-date caption — no section headers, no synthesized prose.
Mobile is closer but still not narrative prose: `apps/mobile/app/(app)/settings/memory-summary.tsx`
groups facts under labeled headers ("Pinned" / "Learned from chats" / "Added by you" — see
`SUMMARY_SECTION_META` in `apps/mobile/src/features/memory/services/consolidation.ts:110-121`),
but each entry under a header is still rendered as a discrete, unedited fact line
(`memory-summary.tsx:130-144`), not a multi-paragraph narrative synthesized by a model the way
ChatGPT's "Overview"/"Engineering Preferences" prose or Claude's "Work context" paragraphs are.
The grouping key is _provenance_ (pinned vs. learned vs. manual), not _topic_.

Classification: **CONFIRMS_PRIOR** (extends `MEMORY-006`, which flagged the missing
search/pin/summary affordances on Web but did not specifically call out prose-vs-list framing;
this pass adds that the _mobile_ summary screen — which MEMORY-006 cited as the reference
implementation Web should copy — is itself not prose-structured either, so copying it verbatim
would not close this specific gap).

### memory-03 — In-place conversational editing via chat-style input (SINGLE_PRODUCT: ChatGPT)

**MISSING.** `MemoryEditor.tsx` only offers a discrete-row edit path (click a fact →
inline `<textarea>` → Save/Cancel, lines 224-249) and a separate "Add a new fact" textarea
(lines 166-196). No free-text "Ask or update" instruction box exists anywhere in the memory UI on
any surface (grepped `Ask or update`, `chat-style`, conversational edit patterns — no hits). New
finding, not in prior audit.

### memory-04 — Explicit "Legacy" labeling on a coexisting old memory model (MAJORITY: ChatGPT, Claude)

**Not applicable / DIFFERENT_BY_DESIGN — deliberately not filed as a gap.** We do not have two
memory generations running side by side, so there is nothing to label as legacy. `CapabilitiesSection.tsx`
exposes exactly one memory system (fact list + two sub-toggles). This is the _opposite_ problem
from the benchmark: ChatGPT and Claude are carrying migration debt from an older memory
architecture and are transparently labeling it. We should not manufacture a second memory system
just to have something to call "Legacy" — see **notWorthCopying**.

### memory-05 — Disclosed memory-to-search-provider data flow (SINGLE_PRODUCT: ChatGPT)

**MISSING.** No disclosure string resembling "may use Memory to personalize queries to search
providers" exists anywhere in `apps/web/features/settings/` (grepped `search provider`, `bing`,
`personalize.*quer`, `outbound.*search` — zero hits). Whether our web-search tool call is in fact
personalized by memory server-side was not verified either way in this pass (out of scope of a
settings-copy check) — the finding is specifically about the _absence of disclosure_, not a claim
about undisclosed behavior. New finding.

### memory-06 — Separate audio/recording-transcript memory corpus (SINGLE_PRODUCT: ChatGPT)

**MISSING.** No "Record mode" / recording-transcript memory corpus exists on any surface. Mobile's
voice feature (`apps/mobile/src/features/voice/`) is dictation-to-text input only, not a
recording/transcript archive with its own recall toggle (grepped `record mode`,
`recording transcript`, `audio.*memory` across mobile — no hits beyond dictation/TTS code). New
finding, low priority — this is a genuinely different product feature (ambient recording), not a
memory-settings gap per se.

### memory-07 — Full unredacted memory shown with no re-auth gate (SINGLE_PRODUCT: ChatGPT)

**Not filed as a gap — we match the benchmark.** Clicking "View and manage memory" opens
`MemorySection` directly with no re-auth/PIN/confirm interstitial, same as ChatGPT. Since this is
already normal settings-page auth (an authenticated session), and every benchmarked product
behaves the same way, this is neither a strength nor a gap — it's industry-standard (and arguably
risky) practice we already match. See **notWorthCopying** — this is explicitly not a pattern to
harden away from without product direction, but also not one to imitate further.

### memory-08 — Single branded personalization hub (SINGLE_PRODUCT: Gemini)

**MISSING — and our fragmentation is worse than the two other majority products.** Memory,
Capabilities (which owns the memory toggle), Reflect, Connectors, and custom Instructions (in
General) are five _separate_ top-level settings nav entries with no grouping relationship:
`packages/ui/ui/src/settings-nav.ts:143-145` (`capabilities`), `:175` (`memory`), `:161`
(`connectors`), `:297` (`reflect`) are all flat sibling entries in `SETTINGS_NAV_GROUPS_WEB`
(lines 279-303), each rendered as its own icon+label row with no parent grouping. New finding,
single-product differentiator, so scoped as polish not urgent — but worth tracking since our
settings surface is measurably more scattered than even ChatGPT/Claude's two-section split.

### memory-09 — "Daily Brief" gated by/framed as part of the personalization layer (SINGLE_PRODUCT: Gemini)

**MISSING — but a different, retrospective analog exists.** `apps/web/features/settings/sections/ReflectSection.tsx`
is a genuine feature and IS memory-gated (a 409 `memory_required` response renders "Memory is off
... Turn on Memory and Generate from past chats to create a recap," lines 147-161, linking to
Capabilities). But Reflect is a **backward-looking usage recap** ("Past 30 days," conversation
counts, peak hours — lines 100-255), not Gemini's **forward-looking** day-ahead schedule/tasks
brief. These are different capabilities that happen to share the memory-gating pattern. New
finding; not a claim that Reflect is broken, just that Gemini's specific "what's ahead today"
framing has no analog.

### memory-10 — In-product disclosure that memory doesn't cover voice/Live mode (SINGLE_PRODUCT: Gemini)

**Not cleanly applicable, marked MISSING with caveat.** We did not find an AGI Workforce surface
equivalent to Gemini's full-duplex "Live" voice conversation mode — mobile's voice feature
(`apps/mobile/src/features/voice/`) is dictation input into the same text chat, not a separate
voice-first surface with its own memory question. Because the prerequisite surface doesn't clearly
exist, there is no settings copy to disclose scope for. Recorded as MISSING rather than
DIFFERENT_BY_DESIGN because if/when a Live-style voice surface ships, this disclosure gap would
become real immediately and should be planned for at that time.

### memory-11 — Distinct "Connected Apps" personalization layer (SINGLE_PRODUCT: Gemini)

**MISSING.** No control anywhere lets a user opt connector/integration data into
recommendations/personalization as a concern separate from chat memory (grepped `personaliz`
across every settings section file — zero non-trivial hits; `connectors` settings section handles
connection/auth only, not personalization). New finding.

### memory-12 — First-party import of memory from a competing AI product (MAJORITY: Claude, Gemini)

**MISSING on Web/Desktop, PRESENT on Mobile — confirms and extends prior audit.**
`apps/mobile/src/features/memory/services/memoryImport.ts` is a real, working, on-device parser
for ChatGPT/Claude/Gemini export JSON with format auto-detection and a preview-before-commit flow,
reachable from `apps/mobile/app/(app)/settings/memory-import.tsx`. Web explicitly and knowingly
lacks it: `apps/web/features/settings/sections/CapabilitiesSection.tsx:169-174` — "The 'Import
memory from other AI providers' row was removed: the web import flow is a placeholder (no working
provider import endpoint)." **CONFIRMS_PRIOR** (`MEMORY-003`, P2). The prior audit's evidence is
unchanged as of this pass — no import UI or endpoint has been added to Web or Desktop.

### memory-13 — Live cross-chat memory isolation test (MAJORITY, tableStakes: ChatGPT, Claude)

**MISSING/BROKEN — the most significant finding in this domain.** Two distinct problems, both
already filed by the prior audit and both still current:

1. **Web has no project-scoped memory concept at all**, so there is nothing to isolate. This is
   _honestly disclosed_, not a dead control:
   `apps/web/features/projects/components/ProjectSettingsDialog.tsx:229-251` — a code comment
   documents that a decorative scope `<select>` was removed, and the current copy reads "This
   project can access memories from outside chats, and vice versa." Confirmed at the DB layer:
   `user_memories` (migration `0010_memory.sql`) has no project column, and
   `managed-memory-context-service.ts` selects purely by `user_id`. This is honest, but it still
   means AGI Workforce would visibly fail the live isolation test both products passed: a phrase
   written inside a Web project chat becomes available to every other chat and vice versa, by
   design.
2. **Desktop is worse: an actively misleading, broken workflow**, not just an absent one. The
   Project Settings → Memory tab (`apps/desktop/src/features/chat/ProjectSettingsDialog.tsx:1268-1291`)
   mounts `MemoryManager` with framing copy that says memories "help AGI remember important
   details about your project" — but `MemoryManager` (`apps/desktop/src/features/memory/MemoryManager.tsx:32,117`)
   reads from `useMemoryStore()`, the flat **global**, device-wide memory store, with no
   `projectFolder`/`projectId` filter anywhere. A genuinely project-scoped pipeline already exists
   in the Rust backend (`memory_handler.rs`, `ProjectMemoryManager`) and is what the chat runtime
   actually injects at send time — but the TypeScript UI never calls it. A user who adds a
   "project memory" from inside a project's settings dialog on Desktop is silently writing to
   every other project's and every non-project chat's memory. This is a live trust-boundary
   violation, not a missing feature.

Classification: **CONFIRMS_PRIOR** (`MEMORY-001` for the Desktop bug, `MEMORY-004` for the Web
architecture gap — both re-verified as still current against today's `git log`, which shows only
unrelated billing commits since). Severity kept at P1 per the existing filing rather than escalated
to P0, though the Desktop half of this (case 2) is arguably a data-boundary violation in the P0
rubric's own language; flagging that judgment call explicitly rather than silently inflating.

### memory-14 — Memory scope decided at project-creation time via a mode selector (SINGLE_PRODUCT: ChatGPT)

**MISSING**, same root cause as memory-13: since no project-memory scoping exists on Web at all,
there is nothing for a creation-time selector to configure. Confirmed
`apps/web/features/chat/components/dialogs/CreateProjectDialog.tsx` has no memory-mode field.
**CONFIRMS_PRIOR** (same root cause as `MEMORY-004`; this is a new specific angle — the _creation
flow_ UX — that the prior audit did not call out, since it focused on the settings-dialog dead
control rather than the creation modal).

### memory-15 — Persistent 4-card project rail: Instructions / Memory / Context / Scheduled (SINGLE_PRODUCT: Claude)

**MISSING.** Web's Project Settings dialog has "Instructions" (a real, working textarea,
`ProjectSettingsDialog.tsx:208-227`) and "Files" (`KnowledgeFilesPanel`, line 261) as genuinely
separate, independently-editable sections — but "Memory" is static, non-interactive copy (lines
244-251, quoted under memory-13 above), and there is no "Scheduled" card or equivalent at the
project level at all (grepped `scheduled.*task`, `project.*schedul` across
`apps/web/features/projects` — zero hits). New finding — closest existing structure (Instructions

- Files as separate cards) shows the pattern is already half-adopted; Memory and Scheduled are the
  two missing cards.

### memory-16 — Workspace memory with disclosed numeric ceiling, default-on (SINGLE_PRODUCT: Gemini)

**MISSING.** No UI copy discloses a numeric cap on sources/files per project (grepped `up to`,
`maximum of`, `cap of`, `300 sources` in `KnowledgeFilesPanel.tsx` — zero hits), and the only
disclosed limit in the codebase is a per-file byte-size ceiling
(`project-knowledge-upload-boundary.test.ts` asserts a `MAX_FILE_BYTES`-shaped constant is _not_
leaked into UI strings — i.e., even the byte cap is deliberately not surfaced in copy). There is no
evidence of any per-project source-_count_ ceiling existing at all, disclosed or not. New finding.

### memory-17 — Model narrates its own memory-retrieval reasoning inline (SINGLE_PRODUCT: Claude)

**MISSING / unverified.** No thinking-step label resembling "Retrieving context from previous
conversation" was found in the reasoning-trace rendering path
(`apps/web/features/chat/components/ThinkingBlock.tsx`,
`apps/web/features/chat/components/messages/MessageBubble.tsx`) or in the server-side memory
enrichment code (`request-processor.ts` around `enrichManagedMemoryContext`, line 972). This is a
static-analysis finding, not a live-conversation test — I did not run an actual memory-dependent
prompt against the running dev server to observe live model output, so I am flagging this as
unverified-by-live-test rather than a confirmed absence of the underlying model behavior (the base
model itself may narrate this if prompted to, independent of any UI/backend scaffolding). New
finding.

### memory-18 — Independent per-capability auto-invoke toggles adjacent to memory (SINGLE_PRODUCT: ChatGPT)

**MISSING.** `CapabilitiesSection.tsx` (full file read) has exactly three toggles, all under the
"Memory" heading — no analog to ChatGPT's Advanced section (Web search / Canvas / Voice / Library
search / Connector search, each independently switchable). Grepped `auto.*invoke`, `autoInvoke`,
`auto.*web.*search` across settings — zero hits. New finding.

### memory-19 — Separate toggles for "search/reference past chats" vs. "generate memory summary" (SINGLE_PRODUCT: Claude)

**MISSING — bundled into one dimension, and the underlying capability is itself absent.**
`CapabilitiesSection.tsx:140-149` has a "Generate from past chats" toggle, but its description
("Use conversation history to generate better responses") and its `disabled={!settings.memory}`
gating show it is a sub-toggle _of_ the fact-generation system, not an independent "may the model
search/reference raw past chats" control the way Claude's `Search and reference chats` toggle is.
This matches the prior audit's finding that the underlying RAG-style past-chat search doesn't
exist in the production send path at all (`MEMORY-002`: `WebChatRuntime.ts` and the live
`request-processor.ts` path only ever inject the curated `MemoryFact` list, never search other
conversations). **CONFIRMS_PRIOR** (`MEMORY-002`). This pass adds the specific UI-control framing
angle (one bundled toggle vs. two independent ones) that the prior filing didn't emphasize.

### memory-20 — Custom instructions kept structurally distinct from auto-generated memory (tableStakes, ALL_PRODUCTS)

**PRESENT — a strength.** `apps/web/features/settings/sections/GeneralSection.tsx:368-391` has an
"Instructions for AGI" textarea ("AGI will keep these in mind across chats... tailor tone, format,
and explanations") that is a wholly separate control, in a separate settings section
(`general`, not `memory`), from the auto-generated `MemoryEditor` facts in `MemorySection.tsx`
(`memory` section). This mirrors Gemini's "Instructions for Gemini" card living beside, not inside,
its Memory card. No gap.

---

## Strengths (at or ahead of the benchmark)

- **memory-01 / memory-20**: both table-stakes claims are genuinely, fully wired — toggle,
  manage/delete UI, and a separate custom-instructions field, all reachable through real nav
  entries with backing API routes. This is not "a component exists" — verified request→persistence
  round trip via `apps/web/app/api/memory/route.ts` and `.../[id]/route.ts`.
- **Sync-status transparency** (`MemoryEditor.tsx:306-336`): explicit per-state copy
  distinguishing "Saved on this device only" / "Synced to your account" / sync errors — none of
  the three benchmarked products' documented UI copy calls out sync-failure states this explicitly.
- **Server-enforced exclusion list** (`MemoryExclusions.tsx` + `managed-memory-context-service.ts`):
  "Never remember" terms are filtered _before_ a candidate memory is ever written, not just hidden
  client-side after the fact — a stronger privacy guarantee than a UI-only filter would give.
- **Honest absence over decorative controls**: the removed project-memory-scope `<select>`
  (`ProjectSettingsDialog.tsx:229-243`) and the removed "Import memory" row
  (`CapabilitiesSection.tsx:169-174`) are both cases where the team caught and removed a
  dead/misleading control rather than shipping it — this is good practice, even though the
  underlying capability gap (memory-12, memory-13/14) remains real and is filed above.

## notWorthCopying

- **memory-04 (dual "Legacy" + current memory systems)**: this is ChatGPT/Claude's migration debt,
  not a feature. Deliberately maintaining two overlapping memory generations to have something to
  label "Legacy" would be strictly worse UX than our single clean system. Do not clone.
- **memory-07 (no re-auth gate before showing full sensitive memory)**: matching this is not a
  goal — we already match it, and it is arguably a shared industry weak point (sensitive
  employer/identity/project info surfaced on one click with no PIN/step-up). Worth a future
  security/privacy review independent of competitive parity, not something to replicate further.
- **memory-06 (ambient recording-transcript memory)** is a large new surface (recording capture +
  consent + storage + a second memory corpus) for a single-product ChatGPT feature the source
  research itself flags as UNVERIFIED (no located capture entry point). Not worth building against
  unverified competitor evidence.

## Gaps not filed (explicitly out of scope of this domain pass)

- The underlying RAG-style "search my other past chats" capability (root cause behind memory-19)
  is already filed by the prior audit as `MEMORY-002` at P1 — this pass does not re-file it,
  only the narrower UI-control-structure angle (memory-19 above).
- Semantic (embedding-based) memory search vs. ILIKE substring search (`MEMORY-005` in prior
  audit) is unrelated to any of this batch's 20 claims and was not re-verified here.
