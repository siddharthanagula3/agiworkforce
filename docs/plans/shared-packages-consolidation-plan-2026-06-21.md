# Shared-Packages Consolidation Plan: One Website, Reused for Desktop + Mobile

Status: PLAN (for surface engineers) — awaiting founder go-ahead to execute Step 1.
Owner: this session (synthesized via the `shared-packages-consolidation-plan` ultracode
workflow, 7 agents). Last updated: 2026-06-21.

Mandate ([[feedback-shared-packages-mandate]]): build the website in shared packages, reuse
for desktop + mobile; web == desktop minus desktop-only extras; one subscription → one
shared cloud state; Local/BYOK stays on-device (locked trust boundary).

All paths verified against the repo. The artifact-cloud-sync mechanism is specified in
`artifact-cloud-sync-design-2026-06-21.md` (P5) and is referenced, not redesigned, here.

---

## 1. Current state — shared foundation vs per-surface forks

A rich shared foundation **exists** and is actively consumed by web + desktop:

- `packages/unified-chat/src/components/` — DOM chat UI: `ChatStream`, `MessageBubble`,
  `ArtifactPanel`, `ArtifactRenderer`, `ArtifactsSidebar`, `InlineToolCall`, `ToolCallCard`,
  `SettingsShell`, `SettingsModal`, ~93 components total.
- `packages/unified-chat/src/stores/` — 17 zustand stores (`artifactStore`, `chatStore`, …).
- `packages/stores/src/` — platform-agnostic `createChatStore` factory (transport injected
  via `ChatStorePort`) — **the proven cross-surface pattern**.
- `packages/types`, `packages/services` (has `artifacts.ts`), `packages/data-layer`,
  `packages/design-tokens`, `packages/runtime` (has the shared `createOfflineSyncManager`).

**But every surface also forked:**

| Surface     | Reality                                                                                                                                                                                        | Forks |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **Web**     | Renders via its OWN `WebChatPage → ChatMessageList → MessageBubble`, NOT shared `ChatStream`. Only ~4 shared imports. 132 web chat components vs 93 shared (+43%). 0 shared settings sections. | ~15   |
| **Desktop** | Uses unified-chat as a foundation but layers ~45 forks + ~50 desktop-only on top. 25 direct reuse.                                                                                             | ~45   |
| **Mobile**  | Fully separate (RN). Forked the chat store (`apps/mobile/stores/chat/*`) instead of `createChatStore`; forked artifact derivation. Consumes only types/utils/design-tokens/local-llm.          | logic |

**Named forks → shared twins (the consolidation targets):**

| Concern                   | Web fork                                                       | Desktop fork                                   | Shared twin (canonical)                                                       |
| ------------------------- | -------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Artifact store            | `apps/web/features/chat/stores/artifacts-store.ts` (479 lines) | desktop Tauri-SQLite store                     | `unified-chat/.../artifactStore.ts` (135) — **move to `packages/stores`**     |
| Artifact panel            | `apps/web/.../artifacts/ArtifactsPanel.tsx`                    | `apps/desktop/.../artifacts/ArtifactPanel.tsx` | `unified-chat/.../ArtifactPanel.tsx`                                          |
| Artifact derivation       | `apps/web/.../utils/artifact-detector.ts`                      | (materializes from stream)                     | mobile `apps/mobile/.../artifacts/store.ts` — **triple fork, no shared home** |
| Tool-call card / timeline | web `ToolCallCard`/`ToolTimeline`                              | desktop twins                                  | `unified-chat` `ToolCallCard`/`ToolTimeline`                                  |
| Message bubble            | `apps/web/.../messages/MessageBubble.tsx`                      | desktop twin                                   | `unified-chat/.../MessageBubble.tsx`                                          |
| Settings                  | 7 web-only sections                                            | desktop settings                               | `unified-chat/.../SettingsShell.tsx` + `packages/ui` `SETTINGS_NAV`           |
| Chat store                | (web wires own)                                                | (desktop wires own)                            | mobile forked vs shared `createChatStore`                                     |

**Root cause:** the artifact persistence conflict (web/mobile derive artifacts from message
content [view-only]; desktop is first-class + editable) is a _symptom_ of these forks. One
shared artifact model dissolves it (§5).

---

## 2. Target architecture

- **Website = the canonical consumer** of the shared packages. Web stops owning a private
  rendering surface and re-points `WebChatPage` onto shared components one at a time.
- **Desktop = shared baseline + desktop-only extras** attached as **slot props / pluggable
  adapters**, never forks. Legitimate superset (keep): `FolderSelector` (Tauri dialog),
  `LocalCloudToggle` + `appModeStore` (Local/BYOK on-device LLM), `Breadcrumb`,
  `DynamicSidecar`/`ExecutionSidecar`, `features/canvas/`, Tauri IPC (~58 handlers), Tauri
  file search, `LocalByokHandoffDialog`.
- **Mobile = shared data/logic layer + RN-native views.** Imports the platform-agnostic
  stores/types/derivation/sync; keeps its own RN `.tsx` views. Does NOT import `unified-chat`
  (DOM-only).

---

## 3. The DOM-vs-RN sharing boundary (the key structural fix)

web + desktop are React-DOM (share actual components); mobile is RN (shares logic only).
So the shared artifact _model/store/derivation/sync_ that ALL THREE consume **cannot live in
`unified-chat`** (DOM-only). Today `artifactStore.ts` lives in `unified-chat/src/stores/` —
**that is the bug.** Target layout:

| Layer      | Package                      | Consumers     | Holds                                                                                                                                                                                                                                   |
| ---------- | ---------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Components | `@agiworkforce/unified-chat` | web + desktop | DOM views: `ArtifactPanel`, `ChatStream`, `MessageBubble`, `ToolCallCard`, `SettingsShell`, …                                                                                                                                           |
| Types      | `@agiworkforce/types`        | all 3         | `SharedArtifact`, `ArtifactType`, `ArtifactDelta` (new, P5 §3)                                                                                                                                                                          |
| Store      | `@agiworkforce/stores`       | all 3         | **NEW** `createArtifactStore` factory (move+merge from unified-chat, absorbing web's 479-line persistence/versioning), mirroring `createChatStore`                                                                                      |
| Derivation | `@agiworkforce/services`     | all 3         | `extractCodeBlocks`, `titleFromCodeBlock`, `accentColorForKind`, `formatAgeLabel`, `derived_id` — extract the triple fork into `packages/services/src/artifacts.ts` (already holds publish/trust `PublishableArtifact`/`PublishResult`) |
| Sync       | `@agiworkforce/runtime`      | all 3         | artifact sync via the existing `createOfflineSyncManager` (same machinery web+desktop share for P2 chat sync)                                                                                                                           |

**Rule:** unified-chat keeps DOM views ONLY. Everything mobile must also consume goes into
stores/services/types/runtime. Web+desktop import the DOM component AND the logic; mobile
imports only the logic and renders its own RN view from the same store/derivation.

---

## 4. Consolidation sequence (prioritized, independently shippable)

Each step keeps the live web path working — web's `WebChatPage → ChatMessageList →
MessageBubble` is re-pointed to a shared component **one at a time**, never a wholesale swap.

### Step 1 — Single shared artifact model (the divergence cause; do FIRST)

- **1a. Derivation → `@agiworkforce/services`.** Collapse web `artifact-detector.ts` +
  mobile `store.ts` derivation fns into `packages/services/src/artifacts.ts` + the P5
  `derived_id` computation. Mobile's derivation is most complete → promote it, parameterize
  theme colors. Re-export from services; delete the local copies. (No DB, no UI change.)
- **1b. Store → `@agiworkforce/stores`.** New `createArtifactStore(options)` factory
  (storage adapter injected), absorbing web's richer 479-line store (web wins, don't lose
  features). Desktop's Tauri-SQLite becomes an adapter; mobile uses an MMKV/SQLite adapter.
- **1c. Panel → shared `ArtifactPanel`.** Collapse web `ArtifactsPanel` + desktop
  `ArtifactPanel` onto `unified-chat/ArtifactPanel`, promoting desktop's version-history +
  inline-edit, web's share button + desktop's shell-open as slots. Mobile renders
  `ArtifactFullScreen` (RN) off the same store + derivation.

### Step 2 — Chat thread + tool-call rendering

- **2a.** Collapse web/desktop `ToolCallCard` + `ToolTimeline` onto the shared twins (web is
  already a thin wrapper → delete wrapper, import shared).
- **2b.** Collapse `MessageBubble` onto shared; desktop extras (execution store, TTS,
  reactions) become hooks/slots; re-point `ChatMessageList` to render shared `MessageBubble`.
- **2c.** Mobile drops `apps/mobile/stores/chat/*`, consumes `createChatStore` with an Expo
  transport port.

### Step 3 — Settings screens

Collapse web's 7 `features/settings/sections/` onto `unified-chat/SettingsShell` +
`packages/ui` `SETTINGS_NAV`. `MemorySection` already uses shared `MemoryEditor` (proof).
Settings store → `@agiworkforce/stores`. Mobile renders RN settings off the same nav + store.
Inventory (from reference matrix): Profile/Account, Billing, Usage, Capabilities,
Privacy/Permissions, Memory, Appearance, Connectors, Notifications.

---

## 5. One shared artifact model dissolves the persistence conflict + uniform sync

Once Step 1 lands, derived (web/mobile) and first-class-editable (desktop) become the SAME
entity — one `SharedArtifact`, one `createArtifactStore`, one derivation computing the same
`derived_id = uuidv5(NS, conversationId:messageId:ordinal)` everywhere (P5 §4). Render set on
every surface = `(locally derived) ⊕ (pulled cloud), merged by id, cloud wins`.

Uniform cloud-sync = **P2 machinery applied to a third entity** (reuse, don't rebuild): the
shared `createOfflineSyncManager` gets an artifact delta; additive migration `0039` reuses
`0038`'s `cloud_sync_version_seq` + trigger and `0037`'s RLS; ONE cursor spans
conversations+messages+artifacts; extend `/api/chat/sync` (not a new route). Cloud table
holds ONLY non-re-derivable (edited + from-scratch) artifacts.

**Trust boundary (LOCKED):** Managed-Cloud only; Local/BYOK never sync; `user_id` server-side
from JWT; RLS `WITH CHECK`; managed-mode gate on every push/pull. The gate lives in the sync
layer (runtime), NOT the shared store.

---

## 6. Feature coverage gaps the website must cover (grounded in reference matrix + Claude docs)

| Claude feature                             | Website today                  | Gap                                                          |
| ------------------------------------------ | ------------------------------ | ------------------------------------------------------------ |
| Artifacts (inline + split-view)            | Forked/view-only               | Step 1 makes it first-class                                  |
| Code execution / file creation             | Partial; **out of scope here** | E2B path (separate; blocked, see e2b doc)                    |
| **Connectors (directory + integrations)**  | **Gap**                        | Largest Tier-1 gap; matrix shows web-max has it              |
| Projects                                   | Present (shared cards)         | project↔conversation cross-link not shared                   |
| Memory                                     | Present                        | `MemorySection` + shared `MemoryEditor`                      |
| Skills                                     | Partial                        | browse/customize UI not confirmed on web                     |
| Web search                                 | Present (web-only panel)       | matrix-aligned                                               |
| **Shared links (chat + artifact publish)** | **Gap**                        | services has `PublishResult` ready; web doesn't wire publish |
| Usage / limits                             | Present                        | `UsageSection`, `BudgetTracker`                              |

Correctly desktop/IDE-only (stay out of website): filesystem tool, MCP server mgmt, dev
terminal, folder-select, Local/BYOK.

---

## 7. Risks + verification per surface

- **Never break the live web path:** re-point one component per step; each independently
  revertible; web smoke after each.
- **DOM leak into RN:** keep all mobile-shared logic in stores/services/types/runtime;
  `pnpm check:boundaries` flags a `unified-chat` import from mobile.
- **Feature loss:** absorb web's richer store DOWNWARD into the shared factory, don't collapse
  up to the thin one.
- **Sync coupling:** migration `0039` is founder-gated (P5); Step 1 ships WITHOUT sync; sync
  layers on after.
- **Per-surface gates after each step:** shared `pnpm --filter @agiworkforce/{stores,services}
test` + `unified-chat typecheck`; web typecheck + artifacts/MessageBubble/ToolTimeline
  tests + smoke; desktop typecheck + Tauri adapter + slots mount; mobile typecheck + RN views
  off shared store + no DOM import leak; repo `check:boundaries`/`check:service-layer`/
  `check:llm-failures`/`check:agent-context`.

**Keystone:** Step 1 (derivation → services, store → stores, panel → unified-chat) unblocks
P5 and is where the divergence lives. Steps 2 + 3 follow independently.
