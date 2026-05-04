# Wave 2 — Desktop v1.0 Plan

> 4 weeks. Ships signed Tauri desktop app matching Claude Desktop minimalism. Runs in parallel with Wave 1's first week (CLI v1.0 launch).

## Goal

Tag `v-desktop-1.0.0` and ship signed installers (DMG, EXE, AppImage) at `agiworkforce.com/download` with auto-update via Tauri updater.

## Pre-requisites (block start)

- [x] CLI v1.0 launched (Wave 1 done) — desktop pitches "powered by AGI Workforce CLI engine"
- [x] Apple Developer Team ID present (already have: `D2PR62RLT4` per tauri.conf.json)
- [ ] ~~Windows EV cert acquired~~ **DEFERRED to v1.1 (Q3 2026)** — 2026-05-04 decision: defer the $249/yr Sectigo/SSL.com EV cert + 1-3 day procurement clock; Windows users use the web app or CLI for v1.0; `/download` page updated to "Windows: Coming Q3 2026"
- [ ] Privacy counsel sign-off scheduled (FIX-008)

## Week 1 — Chat consolidation + dir triage

### Task 1.1 — Migrate apps/web UnifiedAgenticChat (141 files) → packages/chat

**Why**: Vision drift. Web has its own 141-file chat monolith. packages/chat has the canonical 23-component chat surface that desktop already uses.

**Steps**:

1. Map every component in `apps/web/components/UnifiedAgenticChat/` to its equivalent in `packages/chat/src/components/`. Anything missing from packages/chat → port the rich version up.
2. Update `apps/web/app/chat/page.tsx` (or wherever the chat surface lives) to import `ChatInterface` from `@agiworkforce/chat`.
3. Wire web-runtime adapters: hostBridge for cloud-mode storage (Supabase), model adapter for `/api/llm/v1/chat/completions`.
4. Delete `apps/web/components/UnifiedAgenticChat/` directory.
5. Verify: `pnpm --filter web typecheck`, `pnpm --filter web build`, manual test of `/chat` page.

**Estimated diff**: -19,200 LOC (the monolith) + ~500 LOC (web adapters) = net -18,700 LOC.

**Critical files**:

- `apps/web/components/UnifiedAgenticChat/` (delete)
- `apps/web/app/chat/page.tsx` (rewire)
- `apps/web/lib/web-host-bridge.ts` (NEW — adapter)
- `packages/chat/src/components/` (extend if needed)

### Task 1.2 — Triage 84 component dirs in apps/desktop/src/components/

**Why**: Vision says "5-7 sidebar items, ONE chat layout" but current desktop has 84 component subdirs.

**Triage rules**:

- **Keep as overlay** (Cmd+K, Cmd+Shift+K, Alt-double-tap pattern): Settings, Search, CommandPalette, QuickQuery, Voice, Onboarding, ModeSelectionDialog, Auth — ~10 dirs
- **Fold into chat as inline tool result** (per VISION.md): Terminal, Canvas, DynamicCanvas, Database, Git, Images, Browser, Documents, Memory, Planning, Research, Code, Editor, ToolCalling, ComputerUse — ~15 dirs become tool-result renderers
- **Delete or move to artifact panel**: Calendar, Email, Messaging, Teams, Marketplace, SkillMarketplace, Productivity, ROIDashboard, Analytics, Governance, Outcomes, Realtime, ScreenCapture, Mobile, Beta, Workflows, Schedules, Scheduler, Reminders, BackgroundTasks, Schedules, Connectors — ~30 dirs (many are dead views)
- **Keep as chrome**: Layout, ErrorHandling, Errors, Notifications, StatusBanner, OfflineIndicator, ui (Radix primitives) — ~7 dirs
- **Keep as core chat surface**: ChatInterface (from packages/chat), FloatingChat, Overlay/VisualizationLayer — 3 dirs

**Target**: 84 → ~25 active dirs (35-40 to delete, ~15 to fold into chat tool-result renderers).

**Estimated diff**: -15,000 LOC (deletes) + 2,000 LOC (tool-result renderer factories) = net -13,000 LOC.

## Week 2 — IPC pruning + Claude Desktop UI matching

### Task 2.1 — Replace hand-listed `generate_handler!` with proc-macro inventory (FIX-023)

**Why**: 1,469 IPC commands in 132 files, hand-listed in lib.rs. 26 silently dead, 169 never invoked, 20 frontend invokes nonexistent. Easy to drift.

**Steps**:

1. Add `inventory` crate dep
2. Replace `#[tauri::command]` with custom attr that auto-registers via inventory
3. `apps/desktop/src-tauri/src/lib.rs` collects from inventory at startup (no hand list)
4. Wire `apps/desktop/check-wiring.sh` into `.github/workflows/ci.yml` as a CI guard step (script already exists in repo)
5. Add Vite plugin: scans `invoke('...')` literals in `apps/desktop/src/` against the registry, fails build for unknowns

**Result**: Adding a `#[tauri::command]` without a frontend call site emits a warning. Frontend `invoke('foo')` to a nonexistent command fails build. Drift detection automatic.

### Task 2.2 — Pixel-close Claude Desktop UI

**Reference**: `~/Desktop/reference/ui/claude ui/claude Desktop ui/` (30 numbered screenshots).

**Mapping**:

- Screenshot 01 (empty state) → apps/desktop/src/App.tsx empty-state JSX
- Screenshot 02 (sidebar expanded) → apps/desktop/src/components/Layout/Sidebar.tsx — replace current sidebar with 5-7 icons matching Claude
- Screenshot 03-04 (projects gallery + detail) → apps/desktop/src/components/Projects/ — verify or build
- Screenshot 05 (three-pane project view) → apps/desktop/src/components/Layout/ThreePane.tsx — NEW
- Screenshot 06 (chats history) → apps/desktop/src/components/ChatHistory/ — verify
- Screenshot 07-19 (settings tabs) → apps/desktop/src/components/Settings/SettingsPanel.tsx — restructure to match 8 categories: General / Account / Privacy / Billing / Capabilities / Connectors / Claude Code / Desktop app
- Screenshot 20 (profile popover) → apps/desktop/src/components/Layout/UserProfile.tsx — restyle
- Screenshot 21 (Customize page) → apps/desktop/src/components/Customize/ — NEW (Skills + Connectors moved here per Anthropic 2026 reorg)
- Screenshot 22 (skill detail) → apps/desktop/src/components/Skills/SkillDetail.tsx
- Screenshot 23-30 (connector permission UIs) → apps/desktop/src/components/Connectors/ — restructure

**Color extraction**: dark gray bg (#1a1a1a-ish), orange accent (★ icon), Claude's typography.

**Acceptance**: A user can't tell from screenshots whether they're using Claude Desktop or AGI Workforce Desktop empty state, sidebar, settings panel, project view.

## Week 3 — Windows code signing + privacy

### Task 3.1 — Windows EV cert (FIX-010) **DEFERRED to v1.1 (Q3 2026)**

**2026-05-04 decision**: defer Windows installer to v1.1. v1.0 ships macOS (signed) + Linux (AppImage). Windows users use the web app at `agiworkforce.com/chat` or install the CLI. Reasoning:

- $249-400/yr ongoing cost (Sectigo, DigiCert, SSL.com EV)
- 1-3 day acquisition clock with D-U-N-S in hand (5-10 days without)
- Microsoft Store alternative ($19 one-time) kills Computer Use via sandbox restrictions — not viable
- YC application timeline favors shipping macOS + web + CLI over waiting for cert

When v1.1 sprint kicks off in Q3 2026:

1. Acquire EV Code Signing certificate (recommend SSL.com EV ~$249/yr, cloud HSM included; alternative: Sectigo via AWS-KMS)
2. Add GitHub secrets: `WINDOWS_CERTIFICATE` (base64-encoded PFX or KMS keypair config), `WINDOWS_CERTIFICATE_PASSWORD`
3. Update `apps/desktop/src-tauri/tauri.conf.json` `bundle.windows`: add `certificateThumbprint` (or use AzureSignTool wrapper)
4. Wire signing in `.github/workflows/release-desktop.yml` near the tauri-action step
5. **Refuse to ship unsigned**: fail Windows job if `WINDOWS_CERTIFICATE` secret is missing
6. Verify: `signtool verify /pa <installer>.exe` returns "Successfully verified" + clean SmartScreen on fresh Windows 11
7. Re-enable Windows download buttons in `apps/web/app/download/page.tsx` + `components/DownloadSection.tsx` + `components/DirectDownloadButtons.tsx` (currently marked "Coming Q3 2026")

### Task 3.2 — Privacy Policy rewrite (FIX-008)

**Required by**: Counsel sign-off + Stripe / Apple / Google all require accurate privacy disclosures.

**Content** (rewrite `apps/web/app/privacy/page.tsx`):

1. List all 25 BYOK providers explicitly, with what data is sent to each
2. Disclose Sentry by name + opt-out path (already wired)
3. Disclose Google Tag Manager by name + opt-out path (already wired)
4. Add GDPR/CCPA data-subject rights with concrete steps (point at `privacy_export_data` / `privacy_delete_account` IPC commands)
5. State Supabase region (us-east-2) explicitly
6. Remove "managed proxy only" / "no logging" / "local-first" language

**Add regression test**: `apps/web/__tests__/privacy-claims.spec.ts` asserts the published policy contains "Sentry", "Google Tag Manager", and lists ≥20 provider names.

### Task 3.3 — GDPR Settings → Data section (FIX-041)

`apps/desktop/src/components/Settings/Privacy/`:

- "Export my data" button → calls `privacy_export_data` IPC, downloads JSON
- "Delete my account" button → double-confirm + 7-day grace
- "Sentry telemetry" toggle (already exists, expose it)
- "Google Analytics" toggle (web-only)

## Week 4 — Polish + tag

### Task 4.1 — Regression tests

- Playwright e2e tests now actually fail when features are removed (currently they pass via `await locator.isVisible({timeout}).catch(() => false)` pattern — see FIX-019)
- Replace 17 spec files' silent-pass pattern with `await expect(locator).toBeVisible(...)` (throws on absence)
- Auth race fix (FIX-037) verified

### Task 4.2 — Signed release pipeline end-to-end

```bash
git tag v-desktop-1.0.0
git push origin v-desktop-1.0.0
# release-desktop.yml runs:
#   1. macOS signed bundles (universal, aarch64, x86_64)
#   2. Windows signed installer (with FIX-010 cert)
#   3. Linux AppImage
#   4. Tauri auto-update manifest signed with minisign key
gh run watch
```

Verify each artifact:

- macOS: `spctl --assess --type exec AGI-Workforce.app` returns "accepted"
- Windows: `signtool verify /pa AGI-Workforce-Setup.exe` returns "Successfully verified"
- Linux: AppImage runs on fresh Ubuntu 22.04
- Auto-update: install old version, run app, see update prompt, install update successfully

### Task 4.3 — Post-tag

- Update `agiworkforce.com/download` to point at v-desktop-1.0.0 release
- Update `AGI_WORKFORCE.md` Wave 2 status to "SHIPPED"
- Update `docs/ROADMAP.md` Wave 2 section
- Tweet thread (write at launch — desktop UX video helps)

## Out of scope (deferred to v1.1+)

- Mac App Store + Microsoft Store (sandboxing rework)
- Linux computer-use (AT-SPI/libei integration — currently gated per FIX-025)
- Real Google Cloud Batch integration (currently stub per FIX-028)
- EU data residency

## Risk register

| Risk                                                                     | Mitigation                                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Web UnifiedAgenticChat → packages/chat migration breaks something subtle | Stage in feature branch, run full e2e suite, manual test of every interaction pattern, behind feature flag for first week |
| 84 → 25 dir triage deletes a feature someone uses                        | Audit access patterns in user_events table (Supabase), gate deletions on zero-usage check                                 |
| Windows EV cert acquisition takes longer than expected                   | Start procurement in Wave 1 Week 1; some EV certs need 5-10 day verification                                              |
| Privacy counsel sign-off delays launch                                   | Schedule counsel review for Week 3, send draft Week 1                                                                     |
| Auto-updater minisign key compromise                                     | Already configured — verify key rotation procedure documented                                                             |

## Success criteria

- [ ] `agiworkforce.com/download` serves signed installers for macOS (universal/arm64/x64) + Linux x64. Windows shows "Coming Q3 2026" with link to web app + CLI install.
- [ ] Empty state + sidebar + settings panel pass "indistinguishable from Claude Desktop" test (5/5 colleagues say "looks like Claude")
- [ ] `pnpm --filter desktop exec playwright test` all pass
- [x] `apps/web/components/UnifiedAgenticChat/` directory deleted (verified 2026-05-03 audit; live web chat lives in `apps/web/features/chat/`)
- [ ] `apps/desktop/src/components/` count: ≤25 dirs (down from 84)
- [ ] Tauri auto-update works v0.x.x → v1.0.0 on macOS + Linux (Windows deferred to v1.1)
- [ ] AUDIT_REPORT P0/P1 status: 14/14 + 25/25 closed (no exceptions)
- [ ] Privacy Policy contains: Sentry, GTM, ≥9 provider names, GDPR rights, us-east-2 disclosure ✅ (commit `c924e4f6`)
