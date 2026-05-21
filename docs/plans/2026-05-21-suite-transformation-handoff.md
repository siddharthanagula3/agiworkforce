# 2026-05-21 — Application-suite transformation handoff

Status: Current
Owner: Next session lead
Last updated: 2026-05-21 (extended through round 7)
Branch: `fix/extension-typecheck-and-c02-sync-2026-05-20`
Head pushed: `faa457419`

## Round 7 additions (after `b1c2bb428`)

After the round-6 boundary, an additional autonomous loop shipped 6 commits closing two top-10 P0 gaps end-to-end at the shared-package level:

- `fe22c59cb` `feat(unified-chat): artifact panel live preview for html and react` — extracted `lib/artifact-sandbox.ts` (shared CSP envelope), wired `ArtifactPanel`'s HTML preview to a sandboxed iframe with `allow-scripts allow-modals` + run/stop control, delegated React artifacts to `ReactPreview`, refactored `ArtifactRenderer.HtmlArtifact` to consume the same helper. Round-2 P0 #9 live-preview quadrant.
- `b0578ce9f` `feat(vscode-ext): composer drag-drop and paste-image wire` — new `attachFiles` webview→host protocol with zod-validated payloads (≤10 MB / ≤8 files / `data:` URLs only, path-separator rejection), webview drag/drop/paste handlers with attachment chips, host writes to `globalStorageUri/.attachments/<timestamp>` and routes through `agi-workforce.addToContext`. Round-2 P0 #3 vscode-ext side.
- `8fec8a0b5` `feat(extension): composer drag-drop and paste-image attachments` — chrome side panel image-only drag-drop + paste handler, single `acceptIncomingComposerFiles` helper with same 10 MB / 8-attachment caps. Round-2 P0 #3 chrome-ext side.
- `d1d8bbc2f` `feat(unified-chat): artifact panel edit-in-place` — `onSaveEdit` prop on `ArtifactPanel`, Edit/Save/Discard toolbar, draft buffer auto-clears on artifact swap. Round-2 P0 #9 final quadrant.
- `8b183c60a` `docs(control-files): record round 7 autonomous suite-transformation slices` — CHANGELOG + TODO entries.
- `faa457419` `feat(unified-chat): shared generated-file card for compute-session outputs` — new `GeneratedFileCard` consumes `GeneratedFilePresentation` (already exposed by `@agiworkforce/types`) with status badge / metadata / privacy chips / preview thumbnail / action callbacks; opens the path to close the "Add Web/Mobile/Desktop generated-file UI" TODO.

22 new regression tests across `ArtifactPanel.live-preview.test.tsx`, `webviewAttachFiles.test.ts`, `sidePanelComposerDragDrop.test.ts`, and `GeneratedFileCard.test.tsx`. Repo guardrails (`pnpm check:llm-operability`, repo typecheck, lint) clean on every commit. Branch pushed (`3dcc4933b..faa457419`).

### Round 7 — known consumer-adoption gap

The round-2 audit estimates for P0 #9 (Artifacts: 186h) and the new generated-file TODO included **host consumer adoption**, not only the shared primitive. Round 7 closed the shared-package work; host adoption remains open:

| Shared primitive shipped this round     | Host consumers using it |
| --------------------------------------- | ----------------------- |
| `ArtifactPanel` live preview            | none yet                |
| `ArtifactPanel` edit-in-place           | none yet                |
| `GeneratedFileCard`                     | none yet                |
| VS Code webview drag-drop / paste       | ✅ shipped to users     |
| Chrome ext side-panel drag-drop / paste | ✅ shipped to users     |

The two drag-drop wires are real user-facing changes. The three artifact primitives are exported and tested but not yet mounted in Web/Desktop/Mobile, both of which carry their own pre-existing artifact UIs (`apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` and `apps/desktop/src/features/artifacts/ArtifactPanel.tsx`). Next session has three honest paths:

1. **Wedge the shared `ArtifactPanel` into Web's chat shell** as the panel wrapper while keeping `ArtifactPreview` as the body. Adapter ~30 LOC (web's `ArtifactData` already carries `type`; only `version` defaults to 1). Trade-off: the host then has two artifact panels, which doubles maintenance until one consolidates.
2. **Drop `GeneratedFileCard` into Web's `ArtifactPreview` header** as the compute-session summary block (replaces the inline status + privacy chip pair the file already renders inline). Smaller blast radius than option 1.
3. **Reconcile**: keep the shared primitives available as the canonical path for future surfaces (chrome ext sidebar artifact viewer, mobile artifact details), and migrate Web/Desktop opportunistically when they next touch their viewers.

Whichever path the next session picks, record it in this handoff before writing code so the trade-off is durable.

## Previous session head (round 6)

The state below describes the round-6 boundary at `b1c2bb428`. Everything above is round-7 additions.

## Round 5 + 6 additions (after 5630924d7)

After the user explicitly authorized continuous autonomous work past the round-4 boundary, the session shipped six more atomic commits closing further gaps:

- `34f33169e` `feat(web): /projects route mounting shared ProjectGallery` — top-level Projects hub on web, mounting the unified-chat ProjectGallery and deep-linking selection into `/chat?project=<id>`.
- `3c9f57d48` `feat(types): runtime guard for cross-surface chat-sync rule` — `assertSurfaceCanSyncChats` in `@agiworkforce/types/suite-contracts` that throws on any developer-session surface (cli/vscode/chrome) reaching synced-app chat code. Codifies the goal's hard sync rule as runtime enforcement, not just typing.
- `1b8617b13` `test(types): cover assert-surface-can-sync-chats runtime guard` — locks the runtime guard behavior so the contract cannot regress.
- `b1c2bb428` `feat(unified-chat): artifact publish copies portable snapshot` — closes the no-op `handlePublish` on `ArtifactPanel`. Serializes the artifact into a self-contained markdown snapshot, copies to clipboard with the existing copied-state feedback, falls back to a download in insecure contexts.

Session totals at HEAD `b1c2bb428`: **24 commits, ~165h shipped of the ~3,778h audit budget (~4.4%)**, all verification green every commit (typecheck/lint/tests/guardrails), branch pushed.

## Mission (from the active goal)

Transform AGI Workforce into a production-grade Claude/OpenAI-style application suite across Web, Desktop, Mobile, CLI, VS Code, and Chrome. Preserve the AGI differentiators: Local Mode with local LLMs, Local Mode with BYOK, Cloud Managed waitlist, privacy-controlled handoff, multi-provider routing, local-first Desktop/Mobile behavior. Chat sync stays Web/Desktop/Mobile only; CLI, VS Code, Chrome keep separate developer-session histories.

The total remaining parity budget per `audit/anthropic-apps-parity/team-2026-05-21/EXEC-SUMMARY-r2.md` is **~3,778 engineering hours**; this session shipped roughly **~110 hours of those across all six surfaces** (the original ~50h slice plus an extended slice covering Web Settings depth, two architecture decision docs, and the shared Projects gallery primitive).

## What shipped this session (9 commits, all on the branch and pushed)

All commits passed lint-staged + Husky pre-commit (`structure-conventions`, `agent-context`) and pre-push (`check:llm-operability`).

| SHA         | Subject                                                                    | Surface(s)                   | Audit reference                                                  |
| ----------- | -------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `f6d6eeac8` | `fix(mobile): unblock v1 local-only blank screen after session-expired`    | mobile                       | Operational fix for the previous agent's physical-iPhone session |
| `a84fae8a3` | `feat(unified-chat): alias shadcn tokens to canonical chat palette`        | shared package → 6 consumers | EXEC-SUMMARY-r2 P0 #2 (alias path)                               |
| `669f342e5` | `feat(unified-chat): composer drag-drop + paste-image + thumbnail strip`   | shared package → 6 consumers | EXEC-SUMMARY-r2 P0 #3 (shared part)                              |
| `aa3edc0e2` | `feat(extension): site allowlist management ui in popup`                   | chrome ext                   | EXEC-SUMMARY-r2 P0 #5                                            |
| `84a7cb417` | `feat(types,unified-chat): attachment validation + signed-upload contract` | types + shared package       | EXEC-SUMMARY-r2 P0 #4                                            |
| `385623d6b` | `feat(unified-chat): settings shell + memory editor primitives`            | shared package → 4 consumers | EXEC-SUMMARY-r2 P0 #6 + P0 #8                                    |
| `9ca923385` | `feat(web): /settings/memory page using shared MemoryEditor`               | web                          | EXEC-SUMMARY-r2 P0 #8 (web consumer wire)                        |
| `a6d4fe04d` | `feat(desktop): memory tab in settings dialog using shared editor`         | desktop                      | EXEC-SUMMARY-r2 P0 #8 (desktop consumer wire)                    |
| `58938d12d` | `feat(vscode-ext): memory quickpick command for local facts`               | vscode ext                   | EXEC-SUMMARY-r2 P0 #8 (vscode consumer wire)                     |

Surface direct-touch coverage this session:

- **Web** ✓ `/settings/memory` page + nav link
- **Desktop** ✓ Memory tab in settings dialog + Brain icon in left nav
- **Mobile** ✓ blank-screen launch fix (P0 boot bug); existing 320-LOC `app/(app)/settings/memory.tsx` already covers the editor pattern
- **CLI** ✓ existing `/memory` (hierarchy memory) preserved unchanged
- **VS Code extension** ✓ `agi-workforce.memory` QuickPick command (add/list/clear)
- **Chrome extension** ✓ Site allowlist popup section (P0 #5) + sharpens the misleading `background.ts` error string

## Verification status (final, this session)

| Check            | Command                                                                                                                  | Result                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Rust workspace   | `cargo check -p agiworkforce-cli`                                                                                        | ✓ exit 0                 |
| Repo typecheck   | `pnpm typecheck:all`                                                                                                     | ✓ exit 0                 |
| Repo lint        | `pnpm lint`                                                                                                              | ✓ exit 0                 |
| Affected tests   | `pnpm --filter types --filter unified-chat --filter extension --filter web --filter agi-workforce --filter desktop test` | ✓ exit 0                 |
| Repo guardrails  | `pnpm check:llm-operability`                                                                                             | ✓ exit 0                 |
| Pre-commit hooks | structure-conventions + agent-context (every commit)                                                                     | ✓ all green              |
| Pre-push hook    | `pnpm check:llm-operability` + diff checks                                                                               | ✓ exit 0                 |
| Branch push      | `git push` to `github.com:siddharthanagula3/agiworkforce.git`                                                            | ✓ `2c17e1256..58938d12d` |

Not yet run (deferred to next session — see Known blockers):

- Mobile physical-device validation (requires user-side rebuild + observation; the previous agent's session-expired blocker is fixed in `f6d6eeac8` and the user needs to run `expo run:ios --configuration Release --device "Siddhartha iPhone 13 Pro Max" --no-bundler` to load the patched bundle)
- Browser/desktop screenshots (Playwright not run this session; left for the next slice when one of the visual-parity P0s actually lands a new screen)
- Web/Desktop/Mobile chat-sync smoke (no chat-runtime changes this session; sync semantics unchanged)

## Outstanding parity scope from EXEC-SUMMARY-r2

| #   | Gap                                                                                               | Surfaces                       | Hours r2                              | Status                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mobile StoreKit IAP wire                                                                          | mobile                         | 24                                    | open — App Store submission blocker                                                                                                                                                                                                             |
| 2   | Token-system unification alias path                                                               | shared                         | 3                                     | ✅ shipped (`a84fae8a3`)                                                                                                                                                                                                                        |
| 3   | Composer drag-drop + paste-image + thumbnail                                                      | shared (multi)                 | 8 shared + 14 chrome + 17 vscode = 39 | ✅ shared part shipped (`669f342e5`); chrome-ext + vscode-ext wires open                                                                                                                                                                        |
| 4   | Web Attachments signed uploads + MIME accept (P0)                                                 | web                            | 12                                    | ✅ validation + contract shipped (`84a7cb417`); signed-upload server side open                                                                                                                                                                  |
| 5   | Chrome ext Allowlist UI (P0)                                                                      | chrome ext                     | 8                                     | ✅ shipped (`aa3edc0e2`)                                                                                                                                                                                                                        |
| 6   | Shared Settings shell                                                                             | shared (6 consumers)           | 40                                    | ✅ scaffold shipped (`385623d6b`); host consumers can adopt incrementally                                                                                                                                                                       |
| 7   | Web Settings depth (Profile / Connections / Privacy / Memory / Notifications + theme persistence) | web                            | 36                                    | ⚠ partial — Memory page shipped (`9ca923385`); Profile editor / Connections / Privacy / Notifications + `next-themes` persistence still open                                                                                                    |
| 8   | Memory editor surface                                                                             | shared + web + vscode + chrome | 72                                    | ✅ shared + web + desktop + vscode + (mobile pre-existed) shipped; chrome-ext side-panel wire deferred (popup got allowlist instead)                                                                                                            |
| 9   | Artifacts versioning + live preview + publish + edit-in-place                                     | shared + web + desktop         | 186                                   | open — biggest single shared gap                                                                                                                                                                                                                |
| 10  | CLI slash-command palette (~63 unique core)                                                       | cli                            | ~406                                  | open — existing `/memory` left untouched; the rest of `/init`, `/permissions`, `/mcp`, `/agents`, `/skills`, `/plugin`, `/plan`, `/tasks`, `/context`, `/rewind`, `/branch`, `/clear`, `/compact`, `/recap` still need v1-relevant subset wires |

Hours shipped this session: roughly **~125h** out of **3,778h** total (~3.3%). The biggest remaining hours sit in CLI palette (~280h), Artifacts overhaul (186h), Mobile StoreKit (24h), composer drag-drop wires for vscode-ext (~17h, chrome-ext attachment-wire now closed), and the in-flight Web Settings depth (Profile theme-persistence still uses localStorage — wire `next-themes` when a major theme refactor lands).

## Extended round 2 additions (after the first handoff at b49192bbe)

- **Web settings depth — 4 new pages.** `/settings/profile` (display name + avatar gradient placeholder, localStorage-persisted), `/settings/connections` (OAuth connector list in waitlist state per Cloud Managed contract), `/settings/privacy` (3 toggles: rememberChats, telemetry, managed-only training opt-in), `/settings/notifications` (4 prefs with managed-only flags). Layout nav extended from 5 → 9 entries. Cloud-Managed-only items render `disabled` + waitlist callout.
- **`packages/unified-chat` Projects primitives.** `ProjectCard` (star toggle, conversation count, relative-updated timestamp) + `ProjectGallery` (searchable list/grid with starred-first sort, inline "+ New project" form, empty state, host-overridable `onCreate`). Backed by the existing `useProjectStore`.
- **2 architecture decisions locked.** `docs/decisions/2026-05-21-unified-chat-as-suite-spine.md` (rationale for `packages/unified-chat` being the cross-surface spine) and `docs/decisions/2026-05-21-signed-upload-contract-pre-managed.md` (rationale for landing `SignedUploadRequest` / `SignedUploadResponse` before Cloud Managed ships).
- **8 strict-mode (noUncheckedIndexedAccess) regressions fixed** in earlier commits — the incremental tsbuildinfo cache had hidden them until ProjectGallery's new exports invalidated it. ChatInput attachment loops + thumbnail loop + SettingsShell activeId memo all now guard `undefined` array reads.

## Extended round 3 additions (after b81cc377d)

- **Chrome ext attachments now actually reach the model.** Commit `38034fedb` closes the round-2 P0 #3 correctness bug. Both `CHAT_MESSAGE` send sites in `apps/extension/src/side_panel.ts` previously cleared `pendingAttachments.length = 0` _before_ constructing the wire payload, so paste-image and file-picker attachments rendered an attachment preview but were silently dropped on send. The fix:
  - `ChatMessageMessage` in `apps/extension/src/types.ts` gains a typed `attachments?: string[]` field (alongside the previously-untyped `extendedThinking?: boolean`).
  - Both send sites snapshot `pendingAttachments.slice()` _before_ clearing and forward the snapshot as `attachments: snapshot.length > 0 ? snapshot : undefined`.
  - `background.handleChatMessage` destructures `attachments` and, when present, appends a nonce-fenced `<attachments_<nonce>>...</attachments_<nonce>>` annotation to the user content (mirroring the existing pageContext fence pattern) so the model is at least aware the attachments exist. Full multi-modal provider-stream wire-up (Anthropic image blocks, OpenAI image_url parts) remains a follow-up.

## Recommended next-session priorities (in order)

1. **Mobile StoreKit IAP wire** (24h, P0 #1) — App Store submission blocker; touches `apps/mobile/src/features/paywall/components/ProPlusPaywall.tsx:78-84` (current `openExternalUrl(PRICING_URL)` redirect). Replace with `@expo/store-kit` or `react-native-iap`; wire restore-purchase + receipt validation. Existing Restore + Manage rows live at `apps/mobile/app/(app)/usage.tsx:500-507` so only the IAP call itself is new.
2. **Web Settings depth** (~30h remaining of 36h) — Profile editor (avatar/name) + Connections + Privacy/Data Controls + Notifications + `next-themes` theme persistence. Match Claude desktop settings IA. Wire to existing Supabase auth + the new shared `useMemoryStore` for memory.
3. **Artifacts versioning + live preview + publish** (~92h on shared; ~30h on web on top) — biggest cross-surface item still open. Add version stepper toolbar to `packages/unified-chat/src/components/ArtifactPanel.tsx`, enable sandboxed `allow-scripts` iframe for live React/HTML preview, wire `handlePublish` to a share-link service in `packages/services` (new), add inline editor mode.
4. **CLI palette breadth** (~280h for the v1-relevant subset) — focus on `/init`, `/permissions`, `/mcp`, `/agents`, `/skills`, `/plugin`, `/plan`, `/tasks`, `/context`+`/rewind`, `/branch`, `/clear`, `/compact`, `/recap`. Most heavy lift is `/agents` (~50h), `/skills` (~40h), `/plugin` (~40h), `/mcp` (~40h).
5. **Shared Projects component** (referenced in EXEC-SUMMARY-r2 §"Recommendations" as the highest-leverage shared-package investment) — closes the Projects gap across web + desktop + mobile + 2 extensions simultaneously. ~32h.
6. **Composer drag-drop wires for chrome-ext + vscode-ext** (~14h + ~17h) — finish the work started in `669f342e5`. The shared primitive lives in `packages/unified-chat`; consumer-side wire makes drag-drop / paste-image work across all surfaces. Chrome ext has a correctness bug: `pendingAttachments` never forwarded in `CHAT_MESSAGE` (per round-1 src-5 report).

## Architecture decisions implicit in this session's commits

Two design choices warrant noting in `docs/decisions/` before they ossify (deferred this session — recommend writing them in the next):

1. **Shared package as the spine.** `packages/unified-chat` is the single source for chat composer, settings shell, memory editor, attachment validation, and the shadcn token alias surface. Every consumer (web, desktop, chrome ext, vscode ext) inherits behavior from one place. Surface-specific overrides are opt-in via props (e.g. `SettingsShell sections={...}`). This pattern should be applied to the next shared primitives (Projects, Artifacts version stepper, Memory editor cloud-sync layer when Cloud Managed opens).
2. **`SignedUploadRequest` / `SignedUploadResponse` defined before Cloud Managed.** The contract lives in `packages/types/src/chat.ts` so consumer surfaces can compile against it pre-Cloud Managed. v1 attachments stay inline; the signed-upload path activates when the waitlist opens. Keeps the eventual flip a wire-up, not a redesign.

Both decisions belong in `docs/decisions/2026-05-21-*.md` files matching the existing pattern (e.g. the `2026-05-09-*` series). Suggested filenames:

- `docs/decisions/2026-05-21-unified-chat-as-suite-spine.md`
- `docs/decisions/2026-05-21-signed-upload-contract-pre-managed.md`

## Known blockers and gotchas

- **Mobile physical-device retest pending.** The user must rebuild on their machine with `APP_ENV=development EXPO_PUBLIC_APP_ENV=development EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS=1 AGI_IOS_DEVELOPMENT_TEAM=D2PR62RLT4 EXPO_IOS_DEVELOPMENT_TEAM=D2PR62RLT4 pnpm --dir apps/mobile exec expo run:ios --configuration Release --device "Siddhartha iPhone 13 Pro Max" --no-bundler` to validate the v1-blank-screen fix (`f6d6eeac8`). Expected: Face ID → directly to `(app)` shell with no Session-Expired alert.
- **Commitlint `subject-case=lower`** — Commits with uppercase tokens in the subject (e.g. "MemoryEditor", "UI") get rejected. Use lowercase throughout the subject line; capitalize freely in body and trailers.
- **Pre-push runs `pnpm check:llm-operability`** which is ~12 sub-checks; budget ~15-25s per push.
- **`packages/unified-chat` typecheck takes ~12s; tests another ~8s.** The package is now wider — adding more components will keep growing this.
- **CLI `/memory` already exists** (workspace memory hierarchy). Do NOT add a parallel `/memory` for cross-conversation facts under the same name — pick a different command name (e.g. `/memfact` or `/remember`) if a CLI-side fact store is needed. The audit's MemoryEditor primitive in `packages/unified-chat` covers the cross-conversation-fact case for non-CLI surfaces.
- **VS Code parity test** at `apps/extension-vscode/src/__tests__/commandParity.test.ts` asserts every `contributes.commands[].command` in `package.json` has a runtime handler. New commands must be registered in either `commandSetup.ts` or the `REGISTRY_COMMANDS` in `core/commands.ts`.

## Commands you'll need next session

```bash
# Orient
cat docs/plans/2026-05-21-suite-transformation-handoff.md  # this file
cat audit/anthropic-apps-parity/team-2026-05-21/EXEC-SUMMARY-r2.md
git log --oneline 2c17e1256..HEAD  # this session's commits
git status

# Per-surface dev loop
pnpm --filter @agiworkforce/web dev
pnpm --filter @agiworkforce/desktop dev
pnpm --filter @agiworkforce/mobile dev
cargo run -p agiworkforce-cli --bin agi

# Verification (after a slice)
pnpm typecheck:all
pnpm lint
pnpm --filter @agiworkforce/<pkg> test
pnpm check:llm-operability
cargo check --workspace

# Push
git push
```

## Files to read first in the next session

1. `audit/anthropic-apps-parity/team-2026-05-21/EXEC-SUMMARY-r2.md` — the parity scoreboard.
2. `audit/anthropic-apps-parity/team-2026-05-21/SYNTHESIS-r2.md` — the row-by-row gap matrix.
3. `packages/unified-chat/src/index.ts` — new exports landed this session.
4. `packages/unified-chat/src/components/SettingsShell.tsx` + `MemoryEditor.tsx` — pattern to mirror for next shared primitives.
5. `packages/types/src/chat.ts` — attachment-validation contract added this session; pattern for the next typed cross-surface contract.

End of handoff.
