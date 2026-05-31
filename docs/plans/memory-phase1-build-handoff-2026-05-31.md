# Memory "Learns About You" Phase-1 — Build Handoff (ready to execute)

Status: READY TO BUILD (recon done, not yet coded)
Owner: founder + platform
Last updated: 2026-05-31

## Why this handoff exists

Phase-A mobile hardening is DONE and green (HEAD=origin/main `31c72bfbf`, mobile typecheck 0, 102 targeted tests
pass). The next deliverable is Track 3 — the memory "learns about you" Phase-1 slice (the retention wedge +
switching-cost moat the business research flagged as central). I completed recon for it, then **paused before
editing because the session's file-read display layer began returning corrupted content** (Read tool + bash output
both garbled — e.g. a phantom `const localMessages2 = undefined`, duplicated interfaces, a literal "display glitch"
line). Files on disk are intact (typecheck 0); the corruption is in what gets shown back. Editing the
prompt-injection path blind, in a flaky env, after two red-main slips today, is the wrong risk — so this captures
the verified recon so the build is a clean, fast execution next session.

## Verified recon (ground-truth via sed/grep, NOT the corrupted Read tool)

- **Personalization interface** (`apps/mobile/stores/settingsStore.ts:10-19`): 8 fields — `fullName, nickname,
occupation, instructions` (strings) + `warmth, enthusiasm, headersLists, emoji` (0-100 numbers; default 50).
  ⚠️ The interface is NOT exported — Phase-1 must `export interface Personalization`.
  Confirmed collected + persisted (MMKV) but **NEVER injected into any prompt** (only read by ChatEmptyState for
  the greeting nickname) → this is the real gap.
- **Injection point** (`apps/mobile/stores/chat/chatExecutionStore.ts:405-416`): a try/catch retrieves top-5
  memory facts via `retrieveMemoryContext(content, 5)` and `unshift`es a single `role:'system'` memBlock for BOTH
  paths. This is where persona injection is added.
- **Local base-prompt bug to fix while here** (`chatExecutionStore.ts:65-69`, single caller at `:467`):
  `ensureLocalSystemPrompt` only prepends `DEFAULT_LOCAL_SYSTEM_PROMPT` ("You are AGI…") IF no system message
  exists. Because memory (and soon persona) inject a system message, the local base identity prompt is currently
  DROPPED whenever memory/persona is present. Fix: always lead local messages with the base prompt (guard against
  duplicate), so order = [base, persona, memory, project, …turns].
- **MemoryFact** (`apps/mobile/storage/types.ts`): `{ id, fact, source_conversation_id: string|null, pinned, created_at }`.
- **Migration mechanism** (`apps/mobile/storage/migrations.ts`): clean, versioned, forward-only, transactional,
  via `PRAGMA user_version`. Only v1 exists (`memory_facts(id, fact, source_conversation_id, pinned, created_at)`).
  Append-only — never edit a shipped migration.
- **Reuse**: `contextBudgeter.computeContextBudget/estimateTokens` (`src/features/memory/services/contextBudgeter.ts`);
  `retrieveMemoryContext` (`src/features/memory/store.ts`, already does embedding→text→pinned fallback +
  relevance gate); existing tests dir `apps/mobile/__tests__/` (memory-relevance-gate, coverage-wave2-memory-import).
- **Export + delete already cover memory** (`services/dsarExport.ts`: collectMemoryFacts + wipeAllLocalData) — only
  extend once NEW columns exist.

## Phase-1 scope (DECIDED — honest, tight)

SHIP the two pieces that deliver real felt value with zero SQLite risk. **DEFER the v3 schema columns**
(trust_score, source_origin, deleted_at) to Phase-2 — nothing in Phase-1 reads them, so adding them now is dead
speculative schema (YAGNI). Phase-2 (after-chat fact extraction + trust + soft-delete) adds the migration when it
actually needs it.

**Deliverable 1 — `renderPersonalizationBlock(p: Personalization): string`** (pure fn; new service
`src/features/memory/services/personalization.ts` + a unit test). Translates sliders/fields → instruction lines,
emitting a line only when meaningfully set (name; occupation; warmth/enthusiasm only when ≥75 or ≤25;
headersLists/emoji same; instructions verbatim). Returns `''` when nothing set (so no empty block is injected).

**Deliverable 2 — `buildPersonalContextBlocks({personalization, memories}): {role:'system';content:string}[]`**
(pure composable; service). Returns ordered blocks: persona (if non-empty) then memory (k≤5). NAME NOTE: call it
`buildPersonalContextBlocks` (NOT `buildLocalSystemContext`) — it applies to both paths, so a "local"-implying name
would be inaccurate. Per code-structure skill: explicit params, structured return, no store access.

**Deliverable 3 — wire into `sendMessage`** (the action owns the "when"): read `useSettingsStore.getState().
personalization` + the retrieved memories, call `buildPersonalContextBlocks`, unshift the blocks (memory first then
persona so final order is [persona, memory, …]); keep the existing try/catch ("memory must never block a turn").
ALSO fix `ensureLocalSystemPrompt` to always lead with the base prompt.

**Verification:** `pnpm --filter @agiworkforce/mobile typecheck` (READ the result BEFORE commit — husky does NOT
typecheck) + add a `renderPersonalizationBlock` unit test + run memory tests. Then an adversarial verify workflow
(pattern: `wp6fhyr4i`).

## Hard process rules (cost two red-main slips today)

1. After ANY edit, next action is `tsc --noEmit` and READ it before `git add`. Never batch edit→commit in one turn.
2. commitlint subject must be ALL lowercase (camelCase identifiers in the subject fail).
3. Verify file PATHS exist before trusting subagent file:line (phantom `sidebar/DrawerContent` this session).
4. If the read-display layer is corrupting content, use `sed`/`grep` for ground truth; Edit's exact-match is a
   safety net (a wrong old_string fails rather than corrupting).

## What needs the FOUNDER (not autonomously doable)

- **Store submission (Phase B)** — Apple/Google credentials, signing, a real device, the irreversible "ship to the
  world" decision. Do NOT auto-submit.
- **Device UX testing** — physical device; founder does hands-on.
- **Cactus adoption** (post-launch Gemma-4+audio) — gated on a LICENSE REVIEW (core repo LICENSE is custom/
  NOASSERTION, not the npm MIT) + an iOS hands-on spike.
- **Marketing motion** — founder IS the channel (build-in-public, posting); see `agi-marketing-kit-2026-05-31.md`.
- **B2B/prosumer privacy tier** — the real $1B vector; research/scoping when consumer traction exists.
