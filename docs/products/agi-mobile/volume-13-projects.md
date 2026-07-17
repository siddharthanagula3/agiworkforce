# AGI Mobile — Volume 13 — Projects

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: Grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md` (canon), and verified against `apps/mobile/src/features/projects/store.ts`, `apps/mobile/stores/projects/cloudProjectStore.ts`, `apps/mobile/stores/projects/projectSyncStateStore.ts`, `apps/mobile/services/cloudSyncEngine.ts`, `apps/mobile/app/(app)/(tabs)/projects.tsx`, `apps/mobile/src/features/projects/components/*`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/stores/chat/chatExecutionStore.ts`, `packages/contracts/types/src/suite-contracts.ts`, and `apps/web/app/api/projects/sync/route.ts`.

## Overview & stance

Projects on AGI Mobile are reusable context containers — a name, a description, custom instructions, and attached source files — that scope a chat so the model carries the project's intent. Mobile exposes **two** of the three trust modes: **Local** (on-device LLM, free) and **Managed Cloud** (public alpha, open to any signed-in user). **Mobile has no BYOK** — there is no provider-key entry anywhere in the projects surface, and nothing in this volume may add one. "Provider Configuration" on mobile means on-device model management, never API keys.

The defining rule is **physical store separation by trust mode**. Local-mode projects live in `useProjectStore` (MMKV namespace `project-store`); Cloud-mode projects live in a completely separate `useCloudProjectStore` (MMKV namespace `projects-store-cloud`) and reach Neon only through the gated delta-sync engine. The two stores must never co-mingle, so a local project id can never leak into a cloud chat and a cloud project is never written to local storage. App mode (`useChatAppModeStore`) selects which store every projects action targets. Local projects, their files, and their instructions stay on-device unless the user performs an explicit reviewed transfer; cloud projects sync Web ↔ Mobile ↔ Desktop.

## Project Creation — ✅ Built

`apps/mobile/app/(app)/(tabs)/projects.tsx` renders the Projects tab and a create modal (Name ≤100, Description ≤500, Custom Instructions ≤5000). On save, `useProjectStore.createProject` (`apps/mobile/src/features/projects/store.ts`) branches on app mode: in **Local** mode it writes a `proj_*`-id record to the persisted MMKV store; in **Cloud** mode it generates a `uuidv7()` id (required by the server's `z.string().uuid()` push validation), upserts into `useCloudProjectStore`, and calls `markProjectForSync(id)`. Requirements: creation must never write the local store while in cloud mode (and vice-versa); cloud ids must be UUIDv7; an empty/whitespace name is rejected at the UI before any store write.

## Rename — ✅ Built

Rename is performed through the same edit modal (long-press a project card → Edit), driving `updateProject(id, { name })` in `store.ts`. The cloud branch reads the existing `CloudProject`, writes the new `name`, bumps `updatedAt` (the last-writer-wins key), and re-marks the project dirty for push; the local branch mutates the MMKV record in place. Requirement: every rename must bump `updatedAt` so LWW reconciliation is deterministic. Gap: there is no inline/quick-rename affordance — rename only exists via the full editor (🟡 nice-to-have, not a correctness gap).

## Delete — ✅ Built

Delete is two-tap confirmed (`Alert.alert`) in `projects.tsx`. Behavior diverges by trust mode and is intentional: **Local** delete hard-removes the record from MMKV immediately and clears `activeProjectId` if it matched. **Cloud** delete writes a **tombstone** (`deletedAt` set) rather than hard-deleting — the row stays in `useCloudProjectStore` until `pushProjects()` receives the server ack, then `hardDeleteCloudProject` removes it (`apps/mobile/services/cloudSyncEngine.ts`). Requirement: cloud projects must never be hard-deleted before the tombstone is acked, or the delete is silently lost on other devices; tombstoning the active project must clear the active id (enforced centrally in `upsertCloudProject`).

## Instructions — project prompts — ✅ Built

A project's `instructions` field is authored in the editor and injected as a leading `role: 'system'` message when that project is active — verified at `apps/mobile/stores/chat/chatExecutionStore.ts` (`if (activeProject?.instructions?.trim()) historyMessages.unshift({ role: 'system', ... })`). Instructions are **additive context**, not a replacement for the base system prompt. The active project is selected from the Projects tab or the in-chat `ProjectSelectorBar`, and applies to both Local and Cloud chats (each from its own store). Requirements: instructions must never silently move a Local chat to Cloud; the active-project banner must show which prompt is in effect; clearing the active project must drop the injected system message on the next turn.

## Files — ✅ Built (local-only); cloud file bytes 🔭 Planned

`ProjectSourcesTab.tsx` lets a user attach files via `expo-document-picker` (`addSource`/`removeSource` in `store.ts`), showing name, size, and added-time. **Source bytes are local-only and intentionally excluded from cloud sync** (per the web contract note in `apps/web/app/api/projects/sync/route.ts`); only project metadata syncs. Cross-device cloud knowledge-file upload exists on Web (`apps/web/app/api/projects/[id]/knowledge-files/route.ts`) but is **not** wired on mobile — so attaching files to a _cloud_ project, and having those bytes appear on Desktop/Web, is 🔭 Planned. Per `apps/mobile/AGENTS.md`, mobile must not become the first heavy compute surface: large PDF/PPTX/DOCX parsing should delegate to Desktop/local host or managed compute, not run on-device.

## Knowledge — 🟡 Partial

Today "knowledge" on mobile means the raw attached source list above (local-mode only). There is **no** retrieval layer: no chunking, embedding, semantic search, or RAG-style grounding of project files into the model context. Citation-backed knowledge retrieval and cloud knowledge-file sync are 🔭 Planned and must, when built, respect the trust boundary (Local knowledge never embedded into a cloud index without explicit transfer). Do not claim retrieval works until a real retrieval path is cited.

## Search — 🔭 Planned

There is no search/filter inside Projects today — the tab renders a flat `FlatList` with no query box (`projects.tsx`). Planned: a name/description filter and, later, cross-project knowledge search. Until built it must be marked Planned, not stubbed with a non-functional input.

## Sharing — shared access — 🔭 Planned

There is no user-to-user project sharing on mobile. The shared `ProjectRecord` contract (`packages/contracts/types/src/suite-contracts.ts`) carries `allowedSurfaces` and `defaultPrivacyMode`, but that is **surface scoping** (which AGI surfaces may open a synced cloud project), not multi-user collaboration. True shared access (invites, roles, org seats) is 🔭 Planned and is an **Enterprise** capability — never a consumer mobile feature, and never a path that exposes a Local project to another user without an explicit reviewed transfer.

## Repository map

- `apps/mobile/app/(app)/(tabs)/projects.tsx` — Projects tab, create/edit/delete modal.
- `apps/mobile/src/features/projects/{store.ts,service.ts,index.ts,README.md}` — local+cloud-routing store; `service.ts#fetchProject` gated by `FEATURES.crossDeviceSync` (currently off).
- `apps/mobile/src/features/projects/components/{ProjectCard,ProjectHeader,ProjectChatsTab,ProjectSourcesTab}.tsx` — cards, detail header, chats tab, sources tab.
- `apps/mobile/stores/projects/{cloudProjectStore.ts,projectSyncStateStore.ts}` — separate cloud store + delta-sync cursor/dirty set.
- `apps/mobile/services/cloudSyncEngine.ts` — `pushProjects`/`pullProjects`/`markProjectForSync`/`isManagedSyncEnabled`.
- `apps/mobile/stores/chat/chatExecutionStore.ts` — project-instructions system-message injection.
- `apps/mobile/lib/v1FeatureFlags.ts` — `projects: true`, `crossDeviceSync: false`, `byokKeys: false`.
- `packages/contracts/types/src/suite-contracts.ts` — `ProjectRecord`. `apps/web/app/api/projects/sync/route.ts` — server delta-sync.

## Competitor notes

ChatGPT and Claude mobile both offer Projects as cloud-only containers (instructions + files + chats) tied to one account. AGI's deliberate divergence: **trust-mode-aware projects** — a fully on-device Local project (free, no account, never synced) sits beside Managed-Cloud projects that delta-sync across Web/Mobile/Desktop, with physical store separation guaranteeing no leak. AGI is multi-provider (model ids come only from `packages/contracts/types/src/models.json`), and **mobile carries no BYOK**, so a project never holds provider keys. Like the competitors, heavy document grounding is cloud/host-backed, not on-device.

## Acceptance / Definition of Done

Production-ready when: create/rename/delete/instructions work in both Local and Cloud modes with zero cross-store leakage; cloud delete is tombstone-then-ack; instructions inject correctly and never re-route trust mode; Files are local-only with bytes excluded from sync; Knowledge/Search/Sharing are honestly labeled Planned in-product (no dead controls).

- [ ] Build/test: `pnpm --filter @agiworkforce/mobile typecheck` and `test` green; `projects.tsx` + both stores covered.
- [ ] Trust: Local↔Cloud store separation asserted; cloud ids are UUIDv7; instructions never silently move a Local chat to Cloud; `remoteChatGate` / `isManagedSyncEnabled` fail closed when Cloud is disabled.
- [ ] Security: no provider-key field anywhere in projects; local source bytes never sent to `/api/projects/sync`; deletes propagate (no silently-lost tombstones).

## Anti-patterns

- Adding any BYOK / provider-key affordance to a project (mobile is Local + Cloud only).
- Writing the local MMKV store while in Cloud mode, or vice-versa — co-mingling the two project stores.
- Hard-deleting a cloud project before the server acks its tombstone.
- Auto-sending a Local project's chats, files, or instructions to Cloud without an explicit reviewed transfer.
- Faking Search/Knowledge/Sharing with non-functional UI, or claiming retrieval/cross-device file sync that no cited path implements.
- Hardcoding or inventing a model id (read `packages/contracts/types/src/models.json`); inventing routes/env/INR prices.
- Referencing Supabase, or any "Plus"/`pro_plus`/"Hobby" tier — the stack is Clerk + Neon + Stripe and the ladder is Free/Basic/Pro/Max/Enterprise.
