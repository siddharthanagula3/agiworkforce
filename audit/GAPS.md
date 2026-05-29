# Visual & Architectural Gaps — Claude Reference vs AGI Web

Status: Current
Owner: Platform lead
Last updated: 2026-05-25

> Generated 2026-05-24 from 27 parallel image-vs-code audit batches.
> **Updated 2026-05-25**: Code-level re-verification found most items already resolved by the 90+ Supabase→Clerk+Neon migration commits. Status annotations added below.

---

## Top 10 Architectural Gaps (by impact)

### 1. Triple Artifact Store Problem — [RESOLVED — verified 2026-05-25]

~~Three incompatible artifact stores exist with different schemas and no synchronization.~~

**Actual state**: Four intentional stores serving different surfaces:

- `features/chat/stores/artifacts-store.ts` — canonical web chat store (message-keyed, localStorage, versioning)
- `shared/stores/artifact-store.ts` — backwards-compatibility re-export alias for the above (26 lines)
- `packages/unified-chat/src/stores/artifactStore.ts` — monorepo package store (conversation-keyed, ephemeral)
- `apps/desktop/src/stores/artifactStore.ts` — desktop Tauri store (SQLite backend via IPC)

These are not duplicates. Each serves a different surface with appropriate persistence. The `stores/unified/artifactStore.ts` and `stores/unified/projectStore.ts` have been deleted.

### 2. Clerk-Supabase Auth Split — [FIXED — verified 2026-05-25]

~~Mid-migration state where both auth systems coexist.~~

**Actual state**: Migration complete. All auth uses Clerk:

- Login: Clerk `<SignIn>`
- Settings layout: Clerk `auth()` (layout.tsx line 1)
- Sidebar logout: Clerk `signOut()` (ChatSidebar.tsx line 274)
- Header: Clerk `useUser`/`useClerk` (Header.tsx line 6)
- Chat: Clerk `useAuth()`
- Checkout: Clerk `auth()` (checkout/route.ts line 56)
- OAuth callback: returns 410 Gone (auth/callback/route.ts)
- Dead Supabase auth modules (`supabaseAuth.ts`, `services/auth.ts`, `OAuthProviderButtons.tsx`): deleted

Only legacy Stripe webhook metadata fallbacks (`supabase_user_id`) remain for old charge compatibility.

### 3. Dead V3 Shell Architecture — [NOT DEAD — verified 2026-05-25]

~~The entire v3 feature set is dead code.~~

**Actual state**: `WebShellV3` is live, loaded conditionally via `app/chat/page.tsx`:

```
const UnifiedChatPage = dynamic(() => import('@features/chat/pages/UnifiedChatPage'), ...);
return useUnified ? <UnifiedChatPage /> : <WebChatPage />;
```

`UnifiedChatPage` renders `<WebShellV3>` which includes `WebSidebar` and `WebSearchModalCmdK`. This is a feature-flagged alternative, not dead code. Do NOT delete.

### 4. Dual Project Store Problem — [RESOLVED — verified 2026-05-25]

~~Two project stores with different schemas.~~

**Actual state**: Intentional separation by concern:

- `features/projects/stores/project-store.ts` — re-exports from `@agiworkforce/unified-chat` (canonical shape)
- `features/projects/stores/project-meta-store.ts` — stores web-local metadata not in the canonical shape (e.g., `selectedModelId` per project)

Comment in source: "Stores per-project preferences that are not part of the canonical `@agiworkforce/unified-chat` `Project` shape." The `stores/unified/projectStore.ts` has been deleted.

### 5. Connector System Is Decorative — [PARTIALLY FIXED — verified 2026-05-25]

- ~~CSRF token missing from mutations~~ — **FIXED**: `getCsrfToken` used in both `handleConnect` and `handleDisconnect` (ConnectorsPage.tsx lines 1740-1783), server enforces via `requireCsrfToken` (route.ts lines 94, 170)
- OAuth flow fakes connection — **INTENTIONAL**: documented in `docs/intentional-divergences.md` (D-02). UI gates OAuth connectors behind "Coming Soon" so users cannot reach the fake path.
- ~~Only 32 connectors~~ — **UPDATED**: 72+ connectors now registered
- Custom MCP endpoint — still a gap

### 6. Skills Pipeline Is Disconnected — [PARTIALLY FIXED — verified 2026-05-25]

- ~~`SkillsMenu.tsx` never imported~~ — **FIXED**: imported in `ChatComposerNew.tsx` line 20
- ~~Three disconnected slash command registries~~ — **PARTIALLY FIXED**: canonical `slash-command-registry.ts` exists and is used by `SlashCommandMenu`. Two orphaned hooks (`useSlashCommands.ts`, `useSlashCommandAutocomplete.ts`) with hardcoded lists remain but are unused.
- ~~Skills page uses 55 hardcoded items~~ — **FIXED**: fetches from `/api/skills` (skills/page.tsx line 158)
- **Skill body content never injected into LLM requests** — STILL OPEN. `_skillId` parameter is discarded in `WebChatPage.tsx:395`. The `use-skills-list.ts` `loadBody()` function exists but is never called during message sending.

### 7. Settings Forms Don't Persist — [FIXED — verified 2026-05-25]

~~Form fields have no onChange, no state binding, no persistence.~~

**Actual state**: `settings/general/page.tsx` has `useState<GeneralSettings>`, `updateField` helper with debounced auto-save (lines 58-67), `onChange` handlers on all form elements (lines 311, 333, 357, 390, 490, 508).

### 8. Orphaned Feature Components — [FIXED — verified 2026-05-25]

~~Multiple fully-built components are never imported.~~

**Actual state**: All listed components are imported and used:

- `ConversationListItem` — imported in `ChatSidebar.tsx` line 35, rendered in `SessionItem`
- `FolderManagement` — exported from `Sidebar/index.ts`, used by `FolderContextSelector`
- `ArtifactPreview` — imported in `ArtifactsPanel.tsx` line 7, `GalleryClient.tsx` line 8, `InlineArtifactCards.tsx`
- `SettingsPage.tsx` (orphaned tab-based) — deleted
- `SkillsMenu` — imported in `ChatComposerNew.tsx` line 20

### 9. Hardcoded Dark Mode — [FIXED — verified 2026-05-25]

~~`WebChatPage.tsx:583` hardcodes `className="dark"`.~~

**Actual state**: Root div uses CSS custom properties: `bg-[var(--chat-bg)] text-[var(--chat-text-primary)]`. No `className="dark"` found anywhere in `WebChatPage.tsx`.

### 10. No Plugin Architecture

Claude treats "plugin" as a first-class entity binding skills + connectors with marketplace metadata (name/author/version/downloads). AGI has skills, connectors, and AI employees as three separate systems with no parent concept.

**Impact**: The entire plugin ecosystem (browse, install, configure, per-plugin permissions) cannot be built without this entity.

**Status**: Still open. Deferred to v1.1+.

---

## Visual Gap Categories

### Layout & Structure Gaps

| Claude Reference                                      | AGI Implementation             | Gap                  |
| ----------------------------------------------------- | ------------------------------ | -------------------- |
| Three-pane layout (sidebar + chat + project/artifact) | Two-pane only (sidebar + chat) | No third pane        |
| Master-detail connector view                          | Flat card grid                 | No drill-down        |
| Unified directory modal with 3 tabs                   | 3 separate full pages          | No unified container |
| Customize hub with sidebar nav                        | Scattered routes               | No hub page          |
| Full-page /chats index                                | Sidebar-only chat list         | No dedicated page    |
| Split-pane artifact viewer (preview + code)           | Code-only panel                | No split view        |

### Component Density Gaps

| Claude Reference                               | AGI Implementation                  | Gap                  |
| ---------------------------------------------- | ----------------------------------- | -------------------- |
| Compact inline tool steps with connector lines | Bordered cards, 3-4x vertical space | Too heavy            |
| Full-width artifact reference cards            | 80x60px thumbnails                  | Too small            |
| Inline source citations as name badges         | Numbered circles in footer          | Wrong position       |
| Tab-switch comparison (A/B)                    | Side-by-side grid                   | Wrong layout         |
| Temporal reasoning+tool narrative              | Separate stacked sections           | Loses narrative flow |

### Missing UI Elements

| Element                            | Where Missing                                         | Batch         |
| ---------------------------------- | ----------------------------------------------------- | ------------- |
| Plan badge                         | Sidebar footer, account menu                          | B01, B12      |
| Upgrade prompts / tier-gating      | Model selector, features, settings                    | B02, B07      |
| Loading skeletons                  | Artifact gallery, project return, connector directory | B15, B20, B08 |
| Keyboard shortcut badges           | Account menu, sidebar more                            | B12, B13      |
| Bulk action toolbar                | Chat list, artifact gallery                           | B13, B15      |
| Connector status indicators (real) | Connector cards                                       | B10           |
| Usage progress bars                | Per-model limits                                      | B22           |
| Notification badges                | Sidebar, mode tabs                                    | B11           |
| Search functionality               | Sidebar, directory pages                              | B13, B06      |

### Marketing Page Gaps

| Surface           | Visual Content          | Feature Coverage                      |
| ----------------- | ----------------------- | ------------------------------------- |
| Chrome Extension  | 0 screenshots, 0 demos  | 10-20% of actual features             |
| VS Code Extension | 0 screenshots, 0 demos  | 10-20% of actual features             |
| CLI               | 0 screenshots, 0 demos  | 10-20% of actual features             |
| Mobile            | 0 screenshots, 0 demos  | ~50% of actual features               |
| Download page     | Text-only CLI installer | No integration hub, no platform cards |

---

## Recommended Priority Order — Updated 2026-05-25

Items 1-7 from the original list are now resolved. Remaining priorities:

1. **Wire skill body injection** — skill selection works but body never reaches LLM (Gap #6)
2. **Delete orphaned slash command hooks** — `useSlashCommands.ts` and `useSlashCommandAutocomplete.ts` are unused (Gap #6)
3. **Plugin architecture** — v1.1+ scope (Gap #10)
4. **Custom MCP endpoint** — connector gap still open (Gap #5)

~~1. Auth reconciliation~~ — FIXED (Clerk migration complete)
~~2. Connector CSRF fix~~ — FIXED
~~3. Wire orphaned components~~ — FIXED (all wired)
~~4. Unify artifact stores~~ — RESOLVED (intentional architecture)
~~5. Unify project stores~~ — RESOLVED (intentional separation)
~~6. Settings persistence~~ — FIXED (onChange + debounced auto-save)
~~7. Remove forced dark mode~~ — FIXED (uses CSS custom properties)
