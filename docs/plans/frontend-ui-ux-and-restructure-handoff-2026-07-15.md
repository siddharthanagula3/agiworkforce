# AGI Workforce restructure and frontend UI/UX handoff

**Status:** Active, incomplete  
**Handoff timestamp:** 2026-07-15T13:49:12Z  
**Workspace:** `/Users/siddhartha/Desktop/agiworkforce`  
**Owner:** Root Codex agent  
**Reason:** Continue the same long-running production restructure in a new session without repeating the repository audit.

## 1. Persisted goal

Transform AGI Workforce into a production-grade, agent-native, multi-provider application platform across Web, Desktop, Mobile, CLI, VS Code, and Chrome. Establish explicit Local/BYOK/Managed Cloud trust boundaries, canonical shared ownership, a single generated model registry, policy-driven routing, provider-aware streaming/tool contracts, and a repository structure maintainable by humans and coding agents for 10–20 years. Restructure incrementally with regression tests and evidence. Do not claim completion until current repository evidence proves every required surface and end-to-end flow.

The user explicitly rejected demo-first shortcuts and partial completion. The current instruction is to focus on frontend UI/UX while preserving the larger restructure goal.

## 2. Non-negotiable product decisions

- Public brand: `AGI`; formal platform name: `AGI Workforce`.
- Web is Managed Cloud only.
- Desktop has Local and Managed Cloud modes in one application. Do not create separate desktop applications.
- Mobile has Local and Managed Cloud modes. Mobile has no BYOK.
- Desktop Local includes BYOK. CLI includes BYOK. VS Code may expose BYOK only if the extension host/security model supports it honestly.
- Local data never syncs automatically.
- Local to Cloud/BYOK is an explicit fork or continuation with context selection, secret scan, payload preview, consent, and visible provider/provenance labeling.
- Web, Mobile, and Desktop share Managed Cloud chats/projects/memory/settings where the product contract allows it.
- CLI and VS Code share local developer sessions/workspaces. They are not normal consumer chat-sync clients.
- Chrome has separate browser/task conversations and must not silently join consumer chat history.
- Managed artifact/code sandbox belongs to Web/Desktop/Mobile Managed Cloud flows, not CLI/VS Code/Chrome by default.
- Managed Cloud is public alpha and open to signed-in users. It is not a private-beta/waitlist launch gate. The old env is an incident kill switch only.
- Capability honesty is mandatory: hide an action when no real handler exists; do not ship enabled no-op controls, fake success toasts, fabricated metrics, or invented availability.
- Source code wins over documentation. Verify fast-moving model/API/product facts from current official docs or live provider APIs.

Read root `AGENTS.md` and the nearest scoped `AGENTS.md` before editing.

## 3. Repository state and safety

- The worktree is extremely dirty (roughly 1,500 changed/untracked paths during this goal) because of user work and concurrent coding agents.
- Do not reset, checkout, discard, stage, or commit broad changes.
- Preserve unrelated edits. Use `apply_patch` for file changes.
- Do not recreate removed `audit/`, `reports/`, or `docs/archive/` directories.
- Do not combine file moves with behavior changes.
- Package manifests, lockfile, and structural-doc ownership were released after M5, but inspect current diffs before touching them.
- The temporary rendered-audit script was deleted. Its output remains at `/tmp/agi-web-frontend-ux-audit.json`; screenshots remain under `/tmp/agi-web-*.png` for as long as the OS keeps them.

## 4. Research and competitor context already established

Durable research:

- `docs/research/competitor-capability-session-architecture-2026-07-15.md`

Important verification rules:

- Officially verified competitor capabilities may inform architecture.
- Social/X/Reddit claims that are not supported by official docs remain quarantined as signals, not implementation facts.
- Claude Remote Control uses `claude remote-control`, `claude --remote-control`/`--rc`, or `/remote-control`/`/rc`; bare `claude rc` is not the confirmed canonical command.
- Claude Remote Control, Cowork cross-surface availability, live artifacts scope, fullscreen TUI, and current Claude model roster were checked against official/current sources.
- OpenAI GPT-5.6 family/current model facts and current OpenAI app/API facts were checked against official/current sources and live probes where applicable.

Previously generated external architecture reviews may still exist:

- `/private/tmp/architecture-review-20260714T205657Z.html`
- `/private/tmp/agi-architecture-candidates.html`
- `/private/tmp/agi-mode-and-vscode-architecture-2026-07-14.html`
- `/private/var/folders/9_/_g0m61810s75b_9vrd6hg_6r0000gn/T/agi-language-architecture-VhfOcG5P/agi-language-architecture-review-2026-07-14.html`
- `/private/var/folders/9_/_g0m61810s75b_9vrd6hg_6r0000gn/T/architecture-review-20260714-143806.html`
- `/private/tmp/agiworkforce-architecture-plan-2026-07-14/index.html`
- `/private/tmp/agi-comprehensive-architecture-review-2026-07-14.html`

These are context only. Re-verify decisions against current code.

## 5. Completed structural ownership waves

### M4: Artifacts and Sync

The mechanical restructuring agent completed canonical ownership for `@agiworkforce/artifacts` and `@agiworkforce/sync`, migrated Web/Desktop/Mobile consumers/facades, and verified package and surface suites. Reported evidence included 180 package tests plus Web/Desktop/Mobile checks, typechecks, Cargo/install checks, and guards.

### M5: Trust boundaries, routing cache, search, and Services facade

Completed end to end:

- Added canonical `@agiworkforce/trust-boundaries` for egress policy.
- Moved model-switch cache policy into `@agiworkforce/routing`.
- Added canonical `@agiworkforce/search` for registry-derived web-search harness queries.
- Reduced `@agiworkforce/services` to an implementation-free compatibility facade with identity tests.
- Migrated Web/Desktop/Mobile imports, manifests, aliases, Jest mapping, and lockfile.
- Added `scripts/check-service-domain-ownership.mjs` and wired ownership checks into repository guardrails.
- Updated ownership/repo/risk/commands/lanes maps, CODEOWNERS, architecture/plan references, known flaws, and CHANGELOG.

Reported verification:

- 292 owner/facade tests.
- 79 consumer seam tests.
- Owner lint/typechecks.
- Frozen install across 50 projects.
- `pnpm check:llm-operability` green.
- Diff hygiene and ownership guard green.

Only reported global structural failure: `cargo fmt --all -- --check` in unrelated concurrent CLI/Desktop/model-registry Rust files.

## 6. Completed model registry and picker work

The current-model agent completed current roster, generation, routing, and live picker alignment.

Current officially/live-verified primary roster includes:

- OpenAI: GPT-5.6 Sol, Terra, Luna.
- Anthropic: Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5.

Implemented:

- Registry and generated TypeScript/Rust output updates.
- Defaults, presets, aliases, auto-routing, pricing/cache metadata, Sonnet promotional/post-promotional pricing metadata.
- Legacy served models retained for compatibility but hidden from current pickers/Auto.
- Unified Web/Desktop picker derives reasoning/defaults/Auto profiles/availability/provider counts from the catalog.
- Mobile exposes current compatible models and enforces mandatory reasoning where required.
- Free-trial default derives from catalog tier policy.
- Model-tier tests derive samples from the registry instead of hardcoded IDs.

Reported verification:

- Unified Chat: 47 files / 649 tests, typecheck green.
- Mobile picker: 4 suites / 79 tests, Mobile typecheck green.
- Web picker: 4 files / 22 tests green.
- Free-trial/model tiers: 2 files / 37 tests green.
- Targeted ESLint and diff checks green.

Outstanding provider/model issues discovered by this lane:

1. `packages/providers/anthropic/src/stream.ts` maps Anthropic `refusal` stop reason incorrectly; preserve an explicit refusal/fallback outcome.
2. `services/api-gateway/src/services/managedUsageBilling.ts` and `apps/web/lib/services/llm-cost-calculator.ts` were reported as not consuming `post_promo_prices`; confirm and fix post-2026-08-31 Sonnet pricing before billing use.
3. OpenAI Responses-native hosted tools are not fully wired through the harness; the registry currently avoids falsely claiming them.
4. Anthropic catalog commentary about `/v1/models` may be stale.
5. Fable 5 retention/no-ZDR constraints need explicit enterprise/routing policy enforcement.
6. A provider-stream refund test is stale: production uses `settleCreditsDurably`, while the test still mocks/asserts two `deductCredits` calls. Fix the test/contract after confirming the production settlement path.

## 7. Completed Web schedules lane

The schedules agent replaced the orphan UI with a canonical authenticated `/schedules` manager:

- List/create/edit/pause/resume/delete/manual run/run history.
- Pagination/retry and retained loaded data on later-page failures.
- Timezone/DST-safe validation.
- Loading/error/empty/disabled/success states.
- Caller idempotency keys.
- Runtime response validation and CSRF.
- Registry-derived Auto/manual model options; no hardcoded schedule model IDs.
- Authenticated/noindex/proxy/robots protection.
- Production and V3 sidebar wiring.
- Removed obsolete schedule-notification UI and duplicated Zustand schedule store.

Reported verification:

- 16 files / 136 scheduling-navigation tests green.
- Web typecheck, lint, and Next.js 16 production build green.
- Route `/schedules` emitted.
- Repository organization/boundary/service/LLM-failure guards green.
- Existing build warning: missing Stripe environment variables.

Deployment prerequisites remain: apply/probe current Neon migrations in a disposable database, configure `CRON_SECRET`, deploy the cron, and validate live provider credentials/billing.

## 8. Frontend UI/UX fixes completed in the root lane

### Shared composer and agent controls

Files include:

- `packages/unified-chat/src/components/ChatInput.tsx`
- `packages/unified-chat/src/components/AttachmentMenu.tsx`
- `packages/unified-chat/src/components/AgentControl.tsx`
- `packages/unified-chat/src/components/ChatInterface.tsx`
- `packages/unified-chat/src/hooks/useChat.ts`
- `packages/unified-chat/src/lib/writingStyle.ts`
- `packages/unified-chat/src/index.ts`
- associated tests under `packages/unified-chat/src/components/__tests__` and `hooks/__tests__`

Implemented:

- Attachment-only turns no longer enable Send and then silently no-op. They submit the trusted prompt `Please analyze the attached file(s).` without injecting untrusted filenames into the instruction channel.
- Conversation drafts are owned per conversation; a regression test proves a draft does not bleed into a new chat.
- Live agent default is `ask`.
- Selecting `bypass` now requires a destructive confirmation dialog before state changes.
- Writing-style controls are no longer local/dead. Formal/casual/concise/detailed styles propagate to runtime `systemPrompt` through a closed union and trusted mapping.
- Fake `Add to project`, Google Drive, and GitHub attachment rows are hidden unless a host supplies a real picker/assignment callback.
- Research selection clears when runtime capability disappears.
- Web-search toggle uses real store/runtime state.
- Reply placeholder uses `Reply…`.
- Attachment thumbnails have explicit dimensions.
- Send button transitions use explicit properties instead of `transition-all`.

### Shared media/artifact actions

Files:

- `packages/unified-chat/src/components/ImageGenCard.tsx`
- `packages/unified-chat/src/components/DownloadCard.tsx`
- `packages/unified-chat/src/components/MessageBubble.tsx`
- `packages/unified-chat/src/components/__tests__/MediaActionHonesty.test.tsx`

Implemented:

- Copy/Download image actions render only when the host supplies real handlers.
- Removed redundant/dead More/Save-as menu.
- Generated image has intrinsic dimensions.
- Artifact cards are non-interactive when no action exists.
- Artifact preview and download are separate named buttons, eliminating nested interactive semantics.
- MessageBubble no longer supplies a no-op preview closure when `onArtifactClick` is absent.

### Desktop live UI

Files:

- `apps/desktop/src/features/v3/DesktopShellV3.tsx`
- `apps/desktop/src/features/v3/Sidebar.tsx`
- `apps/desktop/src/features/v3/LocalCloudToggle.tsx`
- `apps/desktop/src/features/v3/AgiWorkScheduled.tsx`
- `apps/desktop/src/i18n/locales/en/v3.json`
- Desktop V3 tests

Implemented:

- Removed live Dispatch navigation because its settings were component-local, reset on navigation, and were not wired to the dispatch service.
- Removed fake Keep-this-Mac-awake preference; it wrote localStorage that native power code never read.
- Scheduled task switches now have task/action-specific accessible names and visible focus rings.
- Scheduled task deletion requires destructive confirmation.
- Delete action becomes visible on keyboard focus, not hover only.
- Collapsed Local/Cloud control is named by the action (`Switch to Cloud/Local`), not the current state.
- Collapsed account control has an accessible name.
- Key sidebar controls gained explicit focus-visible treatment.

Dead source still remains and must be handled separately from behavior changes:

- `apps/desktop/src/features/v3/AgiWorkHome.tsx`
- `apps/desktop/src/features/v3/CodeModeHome.tsx`
- `apps/desktop/src/features/v3/AgiWorkDispatch.tsx`
- These remain exported from `apps/desktop/src/features/v3/index.ts` but have no live production consumer.
- `CodeModeHome` still contains a dead Start button and stale/fabricated UI; do not re-enable it. Remove it in a mechanical dead-code change or replace it only with a real developer-session surface.

### Mobile UI

Files include:

- `apps/mobile/src/features/chat/components/MessageBubble.tsx`
- `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx`
- lint-warning test files
- `apps/mobile/app/(app)/settings/shared-links.tsx`
- `apps/mobile/src/features/settings/data-controls/index.tsx`
- `apps/mobile/__tests__/shared-links-honesty.test.tsx`

Implemented:

- Fixed hook dependency omissions around recycled message/tool state. This prevents callbacks from closing over stale modal, reaction, export, image, edit, and tool-detail setters.
- Mobile lint is now zero-warning.
- Removed Shared Links waitlist/invitation CTA because the feature has no implementation proving early access.
- Removed Shared Links from Data Controls navigation until it is real.
- Direct deep-link screen remains an honest unavailable informational state.
- Corrected `Exporting...` to `Exporting…`.

Note: `cloudUnlocked` is currently used as a poorly named mirror of signed-in Cloud entitlement. Code comments say public-alpha sign-in is the gate. Do not mistake every use for a private waitlist gate, but plan a future mechanical rename to an auth/entitlement name.

### Web project settings

Files:

- `apps/web/features/projects/components/ProjectSettingsDialog.tsx`
- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.delete.test.tsx`

Implemented:

- Removed the enabled no-op emoji button; the icon is decorative until a picker exists.
- Added the missing dialog description for assistive technologies.
- Existing real server-backed project deletion tests remain green.

## 9. Frontend verification completed

Root-lane checks:

- Unified Chat focused composer/media tests: 12 tests green.
- Unified Chat lint and typecheck green.
- Desktop V3 focused tests: 13 tests green.
- Desktop lint and typecheck green.
- Mobile Shared Links test green.
- Mobile full lint and typecheck green.
- Web Project Settings tests: 3 green; targeted ESLint green.

Agent checkpoints additionally reported the larger model/schedules/structural suites listed above.

## 10. Rendered Web audit and immediate P0 defect

The rendered audit used the repository's Node Playwright 1.58.2 because the `webapp-testing` skill's required Python Playwright package was absent from both system and bundled Python.

Routes checked at 1440×960 and 390×844:

- `/`
- `/login`
- `/signup`
- `/projects`
- `/schedules`

Observed:

- No unnamed buttons on the checked pages.
- No document-level horizontal overflow.
- `/schedules` correctly redirects signed-out users to `/login?redirectTo=%2Fschedules`.
- The only console errors were Next development HMR WebSocket handshake errors caused by the local driver/server combination; no page exceptions or failed HTTP responses were captured.

### P0: `WebAppShell` destroys mobile secondary surfaces

At 390px, `/projects` renders the full approximately 260px desktop sidebar beside the main page. The main content is reduced to a narrow clipped strip. `overflow-hidden` prevents a scrollbar, so scroll-width checks look green while the actual UI is unusable.

Evidence screenshot (temporary):

- `/tmp/agi-web-mobile-projects.png`

Owner:

- `apps/web/components/layout/WebAppShell.tsx`

Shared sidebar:

- `@agiworkforce/ui` `Sidebar`

Affected routes using this shell:

- `/projects`
- `/projects/[id]`
- `/library`
- `/schedules`

The chat page has its own narrow-viewport collapse logic in `apps/web/features/chat/pages/WebChatPage.tsx`; `WebAppShell` does not.

Required fix in the next session:

1. Add a failing responsive test for `WebAppShell` using `matchMedia('(max-width: 768px)')`.
2. On small screens, do not leave a persistent 240/260px sidebar beside content.
3. Prefer a real modal drawer/overlay with backdrop, Escape/close handling, focus management, `aria-expanded`, and a visible `Open navigation` control.
4. Add a compact mobile app header so the open control does not obscure route headings.
5. Close the drawer after navigation.
6. Preserve the desktop persistent/collapsible sidebar.
7. Re-run rendered checks at 320, 390, 768, and desktop widths for every affected route.

Do not settle for auto-collapsing to a permanent 64px rail unless visual testing proves it is usable; a drawer is the preferred mobile pattern.

## 11. Remaining architecture and frontend debt

Highest priority after the mobile Web shell:

1. Finish Chrome and VS Code live UI/UX audit (agent lane was still active at handoff; see Section 12).
2. Run human-like Desktop and Mobile rendered/device checks. No Expo-specific callable plugin was available in this session; do not claim simulator/device coverage from static tests.
3. Run signed-in Web checks for chat, project create/edit/delete, schedules CRUD/manual run/history, model picker, tools, attachments, and settings. Current rendered pass was mostly signed-out/dev-session smoke coverage.
4. Consolidate the dead alternate agent-mode system:
   - Live system: `ask | auto | plan | bypass` in `agentControlStore`/`AgentControl`.
   - Dead exported system: `safe | plan | build | autopilot` in `packages/unified-chat/src/stores/agentModeStore.ts` and `components/AgentModeSwitcher.tsx`.
   - Desktop also has `apps/desktop/src/features/chat/AgentModeSwitcher.tsx`.
   - Remove/consolidate mechanically with import/reachability proof; do not silently change live semantics.
5. Reconcile stale rows in `docs/agent-context/known-flaws.md` only after verifying the implementation. Several rows still describe already-fixed Web search, safe agent default, draft reset, and Retry behavior.
6. Continue accessibility audit: dialog descriptions, icon labels, focus visibility, mobile touch targets, reduced-motion handling, and semantic menus.
7. Add explicit dimensions to remaining plain `<img>` previews such as `GeneratedFileCard` where layout permits.
8. Remove remaining fake/unreachable Desktop V3 exports in a behavior-free cleanup.
9. Verify billing/refund/post-promotion logic before public paid traffic.
10. Apply/probe migrations and deployment secrets before calling schedules production-ready.

## 12. Parallel-agent status at handoff

Completed:

- `mechanical_m4_artifacts_sync`: M4/M5 structural ownership waves complete.
- `current_model_roster_ga`: current roster, generation, routing, picker, free-trial/tier tests complete.
- `web_schedules_end_to_end`: schedules backend/UI/route complete.

Completed at a deliberate handoff checkpoint:

- `extension_frontend_ux`: Chrome and VS Code frontend lane stopped after reporting exact edits and checks.

Chrome paths:

- `apps/extension/src/features/side-panel/chat-state.ts`
- `apps/extension/src/side_panel.ts`
- `apps/extension/__tests__/side-panel-chat-state.test.ts`
- `apps/extension/__tests__/side-panel-a11y.test.ts`

Chrome fixes:

- Image attachment-only send now creates an honest one/many image prompt.
- Added semantic roles, accessible names, expanded/selected/live states, focus-visible behavior, Escape/return-focus drawer behavior, and explicit image dimensions.
- Converted clickable model/attachment/prompt rows to native buttons.
- Send button announces Send versus Stop.
- `Act without asking` requires confirmation; persistence failure reverts the visible toggle.

Chrome verification: chat-state 8/8; combined accessibility/chat-state 11/11; extension typecheck green.

VS Code paths:

- `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`
- `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts`
- `apps/extension-vscode/src/__tests__/webviewContent.webview.test.ts`
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`

VS Code fixes:

- File attachment-only send no longer silently no-ops.
- Attachment chips clear only after `runtime.startTurn` succeeds; failed starts retain pending context.
- Added semantic/accessibility states for messages, typing, tool disclosures, plus menu, usage close, and send controls.
- Renamed misleading `Add context` control to `Change agent mode` because it opens the agent-mode picker.

VS Code verification at checkpoint: ChatStateManager 11/11; structural webview suite was 13/13 before the final regression assertion; typecheck green.

Intentional RED checkpoint to fix first:

- `apps/extension-vscode/src/__tests__/webviewContent.webview.test.ts:180`
- Current result: 12 passed, 1 failed.
- `fallbackModelGroups()` promotes disabled `<option>` models into clickable fallback buttons when host model groups are absent.
- Required production change: inside the fallback options loop, add `if (options[i].disabled) continue;`, then rerun:

```bash
pnpm --filter agi-workforce test:webview -- src/__tests__/webviewContent.webview.test.ts
```

Additional unresolved VS Code defect: attachment-chip X removes only the visual chip, not the host-side pending file, so the file may still be sent. Add an ID-based `removePendingAttachment` host protocol or remove the X control until deletion is real. No full extension lint/build/full-suite run was completed after the final edits.

## 13. Recommended resume order

1. Read root `AGENTS.md`, this handoff, `docs/current/source-of-truth.md`, and `docs/agent-context/known-flaws.md`.
2. Inspect `git status` and the extension paths listed above. Do not re-run broad discovery before reading completed evidence.
3. Make the one-line VS Code disabled-option guard and turn the intentional RED regression green.
4. Fix `WebAppShell` responsive navigation with TDD and rendered screenshots.
5. Run Web unusual-behavior loop on affected routes: render, inspect, click primary/secondary controls, watch console/network, test keyboard and mobile widths.
6. Fix the VS Code attachment-chip/host-state deletion contract, then run extension/VS Code lint, typecheck, focused tests, and full suites.
7. Continue Desktop/Mobile rendered checks, then shared UI accessibility and dead-control audit.
8. Address provider refusal, post-promo billing, refund test, retention policy, and deployment prerequisites.
9. Run smallest tests first, then surface lint/typecheck/tests/build and repository guardrails.
10. Update known flaws and CHANGELOG only with source-backed outcomes.

Useful commands:

```bash
pnpm --filter @agiworkforce/unified-chat test
pnpm --filter @agiworkforce/unified-chat lint
pnpm --filter @agiworkforce/unified-chat typecheck
pnpm --filter @agiworkforce/desktop lint
pnpm --filter @agiworkforce/desktop typecheck
pnpm --filter @agiworkforce/mobile lint
pnpm --filter @agiworkforce/mobile typecheck
pnpm --filter @agiworkforce/web lint
pnpm --filter @agiworkforce/web typecheck
pnpm --filter @agiworkforce/web build
pnpm check:llm-operability
cargo check --workspace
cargo fmt --all -- --check
git diff --check
```

## 14. Completion warning

The overall goal is not complete. Do not mark it complete based on current green builds. The repository has substantially better ownership, registry, schedules, and frontend honesty, but it still lacks full six-surface rendered validation, the Web mobile shell is currently broken, extension work is pending, provider/billing policy gaps remain, and live deployment prerequisites are unverified.
