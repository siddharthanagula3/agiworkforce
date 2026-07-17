# Volume 13 — Projects

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 13)
Authority: this manual, `docs/current/source-of-truth.md` (Surface Roles, P0 #6/#7), `docs/strategy/02-gap-analysis.md` §2, Vol 4 (tenancy/RBAC), Vol 11/12 (context/memory), `packages/contracts/types/src/suite-contracts.ts`.

## Philosophy & Cloud/Local stance

A project is the container that makes AGI a _workspace_ rather than a chat box: it groups conversations, instructions, files, knowledge, members, memories, settings, model defaults, artifacts, tasks, and agents into one scoped unit. Projects are table-stakes for the retention habit and currently **Partial** in the repo (`docs/strategy/02` §2). The defining constraints are two boundaries: the **project memory boundary** (a project's memory and knowledge stay inside the project) and **shared-project RBAC isolation** (a member sees only what their role permits).

Cloud/Local sets where a project lives and whether it syncs. Web projects are Neon-backed and sync app chats; Desktop projects can hold local files that stay local unless explicitly transferred; Mobile keeps Local projects on-device. Per-project model/provider defaults are a convenience layer — they inherit and can be overridden per chat, **but they never override the trust mode**. A project default cannot silently push a Local chat to BYOK/Managed; that still requires the explicit fork (Vol 9).

## Binding rules

1. **A project is a scoped container.** It owns conversations, instructions, files, knowledge, members, memories, settings, model/provider defaults, artifacts, tasks, and agents — all carrying the project id.
2. **Project memory respects the project boundary.** Memory and knowledge generated in a project stay in that project; they never bleed to other projects or to global scope without an explicit action (Vol 12).
3. **Shared projects isolate by RBAC.** Members see conversations, files, memory, and artifacts only as their role permits; enforce at the data layer (RLS), not just the UI (Vol 4/30).
4. **Per-project defaults inherit, never override trust mode.** Model/provider defaults apply within the active trust boundary; they cannot move a chat across boundaries.
5. **Project instructions are trust-scoped prompt fragments.** They assemble into context only within the project's boundary (Vol 10/11); a Local project's instructions never enter a BYOK/Managed prompt without a fork.
6. **Every record is scope-tagged.** Each project artifact/file/memory/task carries org + workspace + project + owner scope; RLS enforces it server-side.
7. **Knowledge is RAG-backed.** Project knowledge is retrievable (Vol 11) and trust-scoped, not stuffed wholesale into every prompt.
8. **Files in a project follow Vol 15.** Ingestion, scan, and storage-scope rules apply; Local files stay local unless explicitly transferred.
9. **Project agents/tasks run in the project envelope.** Scoped tools/permissions/MCP and the project's trust boundary (Vol 17).
10. **Deletion cascades within scope.** Deleting a project soft-then-hard deletes its conversations, files, memory, and artifacts in scope, honoring Managed retention/deletion (Vol 25/30).

## Repository map

- Web projects: `apps/web/features/projects/` (`components/`, `stores/`, `index.ts`).
- Desktop projects surface: `apps/desktop/src/features/agi-work/` (Projects subpanel) + project-scoped views in `apps/desktop/src/features/chat/` and `artifacts/`.
- Project memory/knowledge: `apps/desktop/src/features/memory/` (scoped), Vol 12.
- Project files: `apps/desktop/src/features/file-upload/`, Vol 15.
- Project artifacts/tasks/agents: `apps/desktop/src/features/{artifacts,background-tasks,agent}/`, Vols 14/17.
- Tenancy/RBAC + scope tags: `packages/contracts/types/src/` contracts, `apps/web/db/neon` (RLS), Vol 4.
- Trust scoping: `packages/contracts/types/src/suite-contracts.ts`.
- Model/provider defaults: `packages/contracts/types/src/models.json`, `packages/contracts/types/src/model-catalog.ts` (`requireProviderDefaultModel`).

## Competitor notes

Per `docs/strategy/01` / `02`: ChatGPT projects group chats, files, sources, instructions, app links, and project memory; Claude projects group chats, files, instructions, and knowledge with per-project memory. AGI's parity target is that full set (source-of-truth Competitive Baseline). AGI's divergence: **per-project trust scoping and provable isolation** — a shared project enforces RBAC at the DB, and a Local project's memory/files/instructions never cross a trust boundary, which incumbents' single-zone model cannot offer. Project model/provider defaults are an AGI-native convenience (multi-provider neutrality) that incumbents lack. Match the workflow; never copy proprietary project UI or naming.

## Checklists

### Build — project container

- [ ] Create/rename/archive/delete a project with org+workspace+owner scope on every record.
- [ ] Project holds conversations, instructions, files, knowledge, members, memories, settings, model/provider defaults, artifacts, tasks, agents.
- [ ] Per-project model/provider defaults resolved from the catalog (`requireProviderDefaultModel`), overridable per chat within the trust boundary.
- [ ] Project instructions assemble as trust-scoped prompt fragments (Vol 10/11).
- [ ] Deletion cascades to in-scope conversations/files/memory/artifacts with soft-then-hard delete.

### Build — knowledge, files, memory

- [ ] Project knowledge is RAG-retrievable and trust-scoped (no wholesale stuffing).
- [ ] Project files follow Vol 15 ingestion/scan/storage-scope rules; Local files stay local.
- [ ] Project memory stays inside the project boundary (Vol 12); no cross-project bleed.

### Build — members & sharing

- [ ] Add/remove members with roles; resolve effective permissions per member.
- [ ] Shared-project access enforced at the data layer (RLS), not just UI.
- [ ] Member-scoped views: a member sees only conversations/files/memory/artifacts their role permits.

### Review & trust

- [ ] Per-project defaults never override trust mode (no path moves a Local chat to BYOK/Managed via project settings).
- [ ] Local project instructions/memory/files never enter a BYOK/Managed request without a fork (trust-boundary test).
- [ ] Cross-project and cross-member isolation tested (no IDOR; RLS verified).
- [ ] Managed project data honors retention/deletion/DSAR (Vol 30).

### Per-surface

- [ ] Web project is Neon-backed; app-chat sync only (`assertSurfaceCanSyncChats`).
- [ ] Desktop project local files stay local unless explicitly transferred.
- [ ] Mobile Local projects stay on-device unless a reviewed transfer (source-of-truth Mobile role).

## Definition of Done

A project groups conversations, instructions, files, knowledge, members, memories, settings, model/provider defaults, artifacts, tasks, and agents — each scope-tagged and RLS-enforced. Project memory and knowledge stay inside the project boundary; shared projects isolate by RBAC at the data layer. Per-project defaults inherit but never override trust mode. Local project context never crosses a trust boundary without a fork (trust-boundary test passes). Deletion cascades in scope and honors Managed retention. Cross-project / cross-member isolation is tested (no IDOR); the project flow is verified end-to-end on the active surface (not build-only).

## Anti-patterns

- Project memory or knowledge bleeding across projects or into global scope.
- Shared-project isolation enforced only in the UI, not at the DB (IDOR risk).
- A per-project default silently moving a Local chat to BYOK/Managed.
- Stuffing all project knowledge into every prompt instead of RAG retrieval.
- Local project files/instructions/memory reaching a BYOK/Managed request without a fork.
- Deleting a project without cascading in-scope data or honoring Managed retention.
- Claiming projects parity from scaffolding while files/memory/RBAC are stubbed (gap analysis §2).
