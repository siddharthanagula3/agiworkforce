# Settings Inventory — Domain Audit (§27)

Scope: every setting on every surface (21 web `/settings/*` routes, desktop's
`SettingsPanel.tsx` + `settings-nav.ts`, mobile's ~33 `app/(app)/settings/*`
screens, the VS Code extension's contributed `configuration`, the Chrome
extension's Options page) against the competitor settings trees reconstructed
verbatim in `research/shots-*.md`.

**Method note on gap count.** This domain deliberately files fewer new GAP
rows than its raw finding count. Several things this audit verified
independently turned out to already be tracked in `audit/ui-gaps.csv`
(accent color, passkeys, Cowork settings breadth, notification breadth) — those
are reported below with their existing `GAP-xxx` id rather than re-filed. The
12 JSON entries split roughly 8 new / 4 corroborating-existing.

---

## 1. Full per-surface settings inventory

### 1.1 Web — 21 gated `/settings/*` routes, single modal (`WebSettingsModal.tsx`)

Confirmed live by reading `packages/ui/ui/src/settings-nav.ts` (`SETTINGS_NAV_GROUPS_WEB`)
against every `features/settings/sections/*.tsx` file:

| Nav key                                 | Section component                      | Real content?            | Notes                                                                                                                                                                                                                                                                         |
| --------------------------------------- | -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| general                                 | `GeneralSection.tsx` (748 ln)          | Yes                      | Profile, appearance (System/Light/Dark only), custom commands, keyboard shortcuts dialog. **No accent color, no contrast** — SETTINGS-007.                                                                                                                                    |
| account                                 | `AccountSection.tsx` (776 ln)          | Yes                      | Delete account (real, working), Active sessions table with per-row Revoke (real, Clerk-backed).                                                                                                                                                                               |
| team                                    | `TeamSection.tsx` (1099 ln)            | Yes                      | Largest section in the tree; SSO panel (`team/SSOPanel.tsx`) gated correctly on plan tier.                                                                                                                                                                                    |
| privacy                                 | `PrivacySection.tsx` (886 ln)          | Yes                      | Telemetry toggle, Export data, bulk conversation actions. `locationMetadata`/`improveModelTraining`/`rememberChats` **deliberately absent** — see §4.                                                                                                                         |
| billing                                 | `BillingSection.tsx` (1085 ln)         | Yes                      | Out of this domain's deep-dive scope (separate billing domain territory); confirmed only that the section renders and is nav-reachable.                                                                                                                                       |
| usage                                   | `UsageSection.tsx` (303 ln)            | Yes                      | —                                                                                                                                                                                                                                                                             |
| capabilities                            | `CapabilitiesSection.tsx` (190 ln)     | Partial                  | **Only 3 Memory toggles.** No Artifacts/Code-execution/Network-egress/Tool-access-mode. SETTINGS-006.                                                                                                                                                                         |
| security                                | `SecuritySection.tsx` (193 ln)         | Yes, honest              | TOTP-only, explicitly discloses no passkeys/SMS MFA/trusted-device list (GAP-115). Explicitly discloses **no** trusted-contact crisis monitoring — a considered non-clone, not a gap.                                                                                         |
| safety                                  | `SafetySection.tsx` (156 ln)           | Yes                      | Reduce sensitive content — matches ChatGPT's single-toggle Safety page almost exactly.                                                                                                                                                                                        |
| notifications                           | `NotificationsSection.tsx` (292 ln)    | Yes, honest              | 3 categories, each with a real backend sender; 5 dead toggles were deliberately deleted (GAP-119 tracks the resulting breadth gap).                                                                                                                                           |
| reflect                                 | `ReflectSection.tsx` (331 ln)          | Yes                      | Matches Claude's "Reflect" beta concept.                                                                                                                                                                                                                                      |
| time-focus                              | `TimeFocusSection.tsx` (349 ln)        | Yes                      | No direct benchmark equivalent found in captures — likely a differentiator.                                                                                                                                                                                                   |
| skills                                  | → `/skills` (redirect)                 | Yes                      | Legacy redirect, correct.                                                                                                                                                                                                                                                     |
| connectors                              | via composer + section                 | Yes                      | `WebSettingsModal.tsx:191-203` builds the catalog.                                                                                                                                                                                                                            |
| plugins                                 | via composer + section                 | Yes                      | `/api/plugins` CRUD wired (per `web-route-sweep-findings.md`).                                                                                                                                                                                                                |
| help                                    | `HelpSection.tsx` (121 ln)             | Yes                      | Built specifically because `/help`/`/status`/`/changelog` were previously unreachable from in-product — good fix, see its own header comment.                                                                                                                                 |
| memory                                  | `MemorySection.tsx` (45 ln)            | Yes                      | Real `MemoryEditor` + exclusions; reachable via a chevron from Capabilities, not its own nav row (deliberate IA choice per `settings-nav.ts:276`).                                                                                                                            |
| archived / deleted-chats / shared-links | 3 sections                             | Yes                      | Deliberately excluded from `SETTINGS_NAV_GROUPS_WEB` and linked from Privacy instead (`settings-nav.ts:71-73`).                                                                                                                                                               |
| **voice**                               | `apps/web/app/settings/voice/page.tsx` | Yes, but **unreachable** | Real, honest content ("Managed voice is not available… This page does not show disabled settings the runtime cannot consume"). **Absent from `SETTINGS_NAV_GROUPS_WEB` entirely** — no nav row, no search hit. Its only in-app entry point is a miswired icon (SETTINGS-001). |
| byok                                    | `apps/web/app/settings/byok/page.tsx`  | Yes                      | Standalone page (not a modal section) — honestly states Web has no per-account BYOK, only Desktop/CLI/VS Code do.                                                                                                                                                             |
| sync                                    | `apps/web/app/settings/sync/page.tsx`  | Yes                      | Standalone page, live cross-device sync status.                                                                                                                                                                                                                               |

**21/21 routes resolve to real content** (`web-route-sweep-findings.md` confirms
all return HTTP 200; this audit confirmed the content behind each is
non-stub). The gap is not missing pages — it's (a) one page with no nav path
in, and (b) two sections (Capabilities, General-appearance) that are
materially thinner than their benchmark counterparts.

### 1.2 Desktop — `SettingsPanel.tsx` + `settings-nav.ts`, 20 nav keys, all wired

All 20 `SettingsNavKey` cases in `SettingsPanel.tsx:689-761` resolve to a real
component — no dead `case` branches. Depth varies sharply by tab:

| Nav key                                                                    | Component                                                                           | Depth vs. benchmark                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| general                                                                    | —                                                                                   | Not independently deep-dived this pass                                                                                                                                                                                                                                                |
| appearance                                                                 | `ThemeSettings.tsx` (620+ ln)                                                       | **Exceeds** Codex/Claude: full custom-theme editor, import/export, dyslexic font, UI scale, reduce motion. Missing only a single-purpose accent-color quick-picker (SETTINGS-007).                                                                                                    |
| capabilities                                                               | `CapabilitiesTab` → `ComputerUseSettings` + `ResearchSettings` + `SkillMarketplace` | Computer Use matches Codex's model closely (enable, hide-apps-during-task, denied-apps list, Accessibility/Screen-recording status). **Artifacts/code-exec/network-egress/domain-allowlist toggles are self-documented as unfinished** in the tab's own source comment. SETTINGS-006. |
| agents                                                                     | `AgentsSettings.tsx` (122 ln)                                                       | Max-timeout slider, timeout warnings, auto-approve — real and well-built. **Checkpointing/auto-resume-on-restart is fully modeled in the store with zero UI.** SETTINGS-004.                                                                                                          |
| connections                                                                | `ConnectionsTab` → `MobileCompanionPanel`                                           | Real pairing panel with copy explicitly describing short-lived authenticated codes; not deep-dived for MFA-gating parity with Codex's "Allow connections requires ChatGPT MFA" pattern (Codex's is stricter).                                                                         |
| cowork                                                                     | `CoworkTab` (Dispatch toggle only)                                                  | **Narrower than Claude's 5-control Cowork settings page.** SETTINGS-011 (= GAP-006 slice).                                                                                                                                                                                            |
| agi-code / agi-in-chrome                                                   | —                                                                                   | Desktop-only settings for the CLI/Chrome-bridge surfaces; not deep-dived this pass.                                                                                                                                                                                                   |
| developer                                                                  | `DeveloperTab` → `DotfileSettings` + `AgentExecutionSettings`                       | **Matches Codex's "Open config.toml" escape hatch** — real `~/.agiworkforce/config.toml` read/write. Also hosts approval-timeout-policy, stream-inactivity-timeout, and terminal-sandbox controls (confirmed wired here, not dead — see §3).                                          |
| models-keys, plugins, connectors, memory, notifications, voice, extensions | —                                                                                   | Not individually deep-dived; no dead `case` found in the switch.                                                                                                                                                                                                                      |

### 1.3 Mobile — ~33 screens under `app/(app)/settings/`

Full file listing confirmed (`accent-color`, `account-security`, `app-language`,
`appearance`, `archived-chats`, `auto-approve`, `capabilities`, `cloud-account`,
`cloud-billing`, `cloud-connectors`, `cloud-privacy`, `cloud-usage`,
`data-controls`, `general`, `integrations`, `memory` ×3, `notifications` (+
per-category `[category].tsx`), `parental-controls`, `performance`,
`permissions` (+ `[permission].tsx`), `personalization`, `reflect`,
`safety-security`, `shared-links`, `storage`, `tool-access`, `voice-language`,
`voice`, `workspace`). This is the deepest, most complete settings surface in
the product and was already extensively audited by the mobile-domain inventory
(`inventory/mobile.md §13`), which found genuinely good discipline (the
`location` permission type was **removed** rather than left half-wired, with
an in-code rationale quoted almost verbatim from `CLAUDE.md`'s "finish what
you start" rule). This audit did not find new mobile-specific settings gaps
beyond what `mobile.md` and `ui-gaps.csv` already track (GAP-030, GAP-172,
GAP-176/182/183/184/186/189/193, etc.).

One deliberate, correctly-labeled omission: no "Trusted contact" crisis-escalation
screen (ChatGPT has one; GAP-044 already tracks this as **declined**, not
missing-by-oversight — see §5).

### 1.4 VS Code extension — 20 `agiWorkforce.*` configuration properties

`inventory/extension-vscode.md:176-181` claims 1:1 lock-step between
`SETTINGS_PANEL_SETTING_KEYS`, the Zod schema, and `contributes.configuration`,
enforced by a test that fails on drift. Spot-verified independently: parsed
`apps/extension-vscode/package.json`'s `contributes.configuration.properties`
directly — 20 keys, all plausible and none orphaned-looking (`apiEndpoint`,
`model`, `cliPath`, `composer.followUpBehavior`, `contextLines`,
`telemetryEnabled`, `hoverEnabled`, `codeLensEnabled`, `autoApplyFixes`,
`inlineCompletions.*`, `agent.planMode`, `agent.mode`, `agent.effort`,
`agent.thinking`, `desktopBridge.*`, `telemetryEndpoint`, `currentTier`). This
is the **only settings surface in the product with an automated
schema-drift guard** — see SETTINGS-010's recommendation to generalize this
pattern to web/desktop.

### 1.5 Chrome extension — Options page (`options.ts`, 1,715 lines)

Five sections, confirmed by reading section-title anchors: **Permissions**
(site allowlist + one "Task notifications" checkbox), **Account** (sign-in
state, logout), **Autofill Profile** (job-application autofill fields),
**Computer Use — Cloud Auth** (dev-build-only bearer token), **Keyboard
Shortcuts** (read-only display of live `chrome.commands.getAll()` output —
correct, since an extension cannot edit its own `chrome://extensions/shortcuts`
bindings), **Help**. No master "Enable extension" toggle (not needed — there's
no popup/omnibox surface to gate, per `extension-chrome.md §2`). No per-site
contextual Allow-once/Always/Deny card — a static, manually-managed allowlist
instead (`extension-chrome.md:439`, already flagged there as "AGI gap
(UX/architecture, not security-severity)" and left to the extension domain's
own tracking). Notification granularity is a single flat toggle — SETTINGS-009,
low severity given the extension currently fires only one notification type.

---

## 2. Settings that exist in code but are unreachable from any UI

The audit brief's seed example — `setSendShortcut`, defined
`apps/desktop/src/stores/settingsStore.ts:1252`, zero call sites — turned out
to be one instance of a **much larger pattern**. Full accounting:

| Setter/field                                                  | File:line                                             | Read anywhere?                                      | Called anywhere?                                                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `setSendShortcut`                                             | `settingsStore.ts:1252`                               | Yes (hydration/persist only, `:1515-1518`, `:2336`) | **No**                                                                                                                             |
| `setDefaultProvider`                                          | `settingsStore.ts:921`                                | —                                                   | **No**                                                                                                                             |
| `setTemperature`                                              | `settingsStore.ts:942`                                | —                                                   | **No**                                                                                                                             |
| `setMaxTokens`                                                | `settingsStore.ts:952`                                | —                                                   | **No**                                                                                                                             |
| `setTaskRouting`                                              | `settingsStore.ts:975`                                | —                                                   | **No**                                                                                                                             |
| `setFavoriteModels`                                           | `settingsStore.ts:991`                                | —                                                   | **No**                                                                                                                             |
| `setProviderMode`                                             | `settingsStore.ts:1030`                               | —                                                   | Only from `apps/desktop/archive/features/chat/LocalByokHandoffDialog.tsx` — an **archived** file, not in the active build          |
| `setStartupPosition`                                          | `settingsStore.ts:1192`                               | —                                                   | **No**                                                                                                                             |
| `setDockOnStartup`                                            | `settingsStore.ts:1202`                               | —                                                   | **No**                                                                                                                             |
| `setAutoSaveMemories`                                         | `settingsStore.ts:1301`                               | —                                                   | **No**                                                                                                                             |
| `setChatStorageMode`                                          | `settingsStore.ts:1378`                               | —                                                   | **No**                                                                                                                             |
| `setEnableCheckpointing`                                      | `settingsStore.ts:698`                                | —                                                   | **No**                                                                                                                             |
| `setCheckpointInterval`                                       | `settingsStore.ts:708`                                | —                                                   | **No**                                                                                                                             |
| `setAutoResumeOnRestart`                                      | `settingsStore.ts:719`                                | —                                                   | **No**                                                                                                                             |
| `setFeature`                                                  | `settingsStore.ts:653`                                | —                                                   | **No**                                                                                                                             |
| `apps/web/app/settings/voice/page.tsx`                        | whole page                                            | N/A                                                 | Reachable only via a **miswired** rail icon (SETTINGS-001) + typed URL; absent from `SETTINGS_NAV_GROUPS_WEB` and its search index |
| `toolAccessMode`/`setToolAccessMode`                          | `packages/ui/unified-chat/.../settingsStore.ts:41,55` | **No**                                              | **No**                                                                                                                             |
| `inlineVisualizationsEnabled`/`toggleInlineViz`               | same file:24,51                                       | **No**                                              | **No**                                                                                                                             |
| `notifyCompletions`/`toggleNotifyCompletions`                 | same file:43,57                                       | **No**                                              | **No**                                                                                                                             |
| `notifyAgentUpdates`/`toggleNotifyAgentUpdates`               | same file:44,58                                       | **No**                                              | **No**                                                                                                                             |
| `notifyResearch`/`toggleNotifyResearch`                       | same file:45,59                                       | **No**                                              | **No**                                                                                                                             |
| `memorySearchChats`/`toggleMemorySearchChats`                 | same file:39,60                                       | **No**                                              | **No**                                                                                                                             |
| `memoryGenerateFromHistory`/`toggleMemoryGenerateFromHistory` | same file:40,61                                       | **No**                                              | **No**                                                                                                                             |

That is **15 dead setters in one desktop store** plus **7 dead field/setter
pairs in one shared web+desktop store** plus **one entire unreachable settings
page**. Every one was verified by a repo-wide grep excluding the defining
file and test files, with counter-examples confirmed for sibling fields in
the same files that _do_ have live call sites (proving the grep methodology
isn't just missing an indirection layer).

## 3. Controls with no backend effect (checked, not found — a strength)

This is where the codebase's discipline shows most clearly. Every place this
audit checked for a "decorative toggle that saves but does nothing," the team
had already found it and removed it, with the reasoning left in a code
comment:

- `GeneralSection.tsx:67-83` — `voice` (an OpenAI TTS voice name persisted to
  a namespace nothing read) and `chatFont` (defaulted to `'serif'`, saved on
  every mount, consumed by no stylesheet) were both **deleted**, not
  deprecated-in-place.
- `PrivacySection.tsx:23-32` — `locationMetadata` and `improveModelTraining`
  were removed because "a switch that saves but changes nothing is a dead
  control." `rememberChats` was removed because it "currently promises the
  opposite of what happens" — an even worse failure mode than a no-op, and
  the team correctly treated it as a truth-in-UI issue, not a wiring nitpick.
- `NotificationsSection.tsx:20-38` — five toggles (email security alerts,
  weekly digest, product updates, two mobile-push variants) were removed for
  having no sender; two were **correctly re-added** only once
  `push-notification-service.ts` and `notification-email-service.ts` actually
  shipped.
- `CapabilitiesSection.tsx:169-174` — an "Import memory from other AI
  providers" row (Claude ships this exact feature, `shots-claude-desktop.md:374`)
  was **not added** because "the web import flow is a placeholder... surfacing
  a Start-import control would be a dead/fake control."

No counter-examples were found in this pass. This pattern is real and
consistent enough to call out by name in the recommendation for
SETTINGS-010: it's evidence the team already knows how to avoid this failure
mode when they remember to check — the fix isn't a culture change, it's
automating the check that currently only fires when someone reads the code.

## 4. Benchmark settings we lack

Beyond the individually-filed gaps, reading the full competitor trees against
our own surfaces surfaces a few clean absences worth naming even where no
single gap ID captures them well:

- **A unified cross-surface "Active sessions" table listing iOS/Desktop/Chrome
  as peer rows** — Claude's Account page does this explicitly
  (`shots-claude-desktop.md:318-329`). Our web `AccountSection.tsx` has a real,
  working sessions table (`:497-689`) that appears to already be
  provider-wide via Clerk ("Sessions are reported by your account provider
  across devices") — this is likely already at parity but wasn't
  independently verified to render Desktop/mobile session rows in this pass;
  flagging as **NEEDS_VALIDATION** rather than filing a speculative gap.
- **Two full-price OAuth-device-code flows for CLI-style auth** shown as
  account-security-grade settings in ChatGPT (`Codex CLI — Disconnect`,
  `Enable device code authorization for Codex`, `shots-chatgpt-web-macos.md:2.13`).
  Our equivalent (`AGI Code` desktop nav key, VS Code's `agi-workforce.openSettings`
  command) was not deep-dived for an equivalent disconnect/device-code
  affordance this pass.
- **A settings-search index that treats every control's body copy as a search
  target**, demonstrated concretely in Codex macOS (`shots-codex-macos-settings.md:59`
  — searching "remo" surfaces "Remote control," "Remove," "Reduce motion" from
  three different pages). `settings-nav.ts:196-198` shows AGI already tried to
  fix an equivalent bug once ("AUDIT-FIX PAR-16: settings search filtered on
  visible labels only") by adding a `keywords` array per nav entry — but that
  is section-level, not control-level, granularity. Not filed as a gap
  (P3/differentiation-tier), noted for completeness.

## 5. What NOT to copy

`cross-cutting-and-complaints.md:186` cites a critical review calling
ChatGPT's settings complexity comparable to "Microsoft and Facebook." Reading
the full competitor trees in this pass makes that complaint concrete and
worth taking seriously as a design constraint, not just a nice quote:

- **ChatGPT's "Intelligence" label collision.** The same word means three
  different things in three different places at once — the chat composer's
  model/tier popover, General settings' "Pro level," and Voice settings'
  "Intelligence" dropdown — independently adjustable, per
  `shots-chatgpt-ios-shell-settings.md:425`. AGI's `settings-nav.ts` keyword
  system, if extended carelessly, could reproduce this exact failure by
  letting two different sections both claim "model"/"effort" as a keyword
  without a single source of truth for what the word means. Worth a
  one-line lint rule (no keyword string may appear under two different nav
  keys) rather than a feature to copy.
- **Inconsistent danger-styling.** ChatGPT iOS styles "Delete all chats" red
  but "Delete account" — arguably the more destructive action — as a plain
  black row (`shots-chatgpt-ios-shell-settings.md:424`). AGI's own
  `AccountSection.tsx` "Delete account" flow is real and already
  destructive-styled per the section's own comment ("real, working flow");
  worth a deliberate audit pass to confirm every destructive action in the
  tree (delete account, delete all chats, cancel plan, disconnect
  connectors) uses one consistent red-outline treatment, matching what this
  research found to be ChatGPT web's _actual_ consistent pattern (not iOS's
  inconsistent one) — six-plus destructive buttons on ChatGPT web all share
  identical outline styling (`shots-chatgpt-web-macos.md:717`).
- **Three different widget types for one "effort" concept.** ChatGPT
  represents reasoning effort as a checkmarked dropdown list (macOS), a pair
  of toggles (`Higher intelligence` + `Enable Ultra effort`, web), and an
  unlabeled 5-dot slider (Chrome extension) — three UI metaphors for one
  underlying lever (`shots-chatgpt-web-macos.md:716`). Do not replicate this;
  pick one control shape for reasoning/effort and reuse it everywhere it
  appears.
- **ChatGPT's "Trusted contact" and mobile "Parental controls" crisis/family
  features** imply a backend classifier over conversation content plus a
  contact-verification and consent pipeline — a serious safety/legal
  undertaking, not a settings-page toggle. AGI's `SecuritySection.tsx:174-190`
  and the mobile team's `GAP-044`/`GAP-023` decisions to explicitly decline
  this ("AGI does not monitor conversations to notify another person... no
  automatic safety alerts") rather than fake a lighter-weight version are
  the right call. Do not file a gap recommending AGI build a shadow version
  of this without the same infrastructure (verified contact consent,
  clinical-risk classification, legal review) the real feature requires.
- **Codex's per-action, nonce-bound, fail-closed Chrome-CDP approval model
  is _better_ than a static permission dropdown**, and this repository
  already ships something closer to that (per `extension-chrome.md`,
  cross-referenced against the **Not Planned** `GAP-123`, which correctly
  declines to add category dropdowns because "no runtime consumes" the
  saved policy for history/download/upload tools that don't exist). Do not
  reopen that decision to chase surface-level parity with Codex's dropdown
  UI — the underlying security model here is already stronger.

## 6. Strengths (honest accounting)

- **Systemic settings hygiene.** Four independently-documented instances
  (§3) of dead/misleading toggles being actively found and deleted, with the
  reasoning preserved in code comments rather than silently dropped. This is
  a genuinely rare discipline — none of the captured competitor evidence
  shows equivalent self-correction (if anything, ChatGPT's "Intelligence"
  label collision and inconsistent danger-styling are examples of the
  opposite: accumulated small inconsistencies nobody went back to clean up).
- **Desktop's Appearance/theming system** (`ThemeSettings.tsx`) exceeds every
  competitor screenshot captured: a full custom-theme editor with live
  swatch preview, JSON import/export, plus separate dyslexic-font, UI-scale,
  and reduce-motion controls in one coherent surface. Codex's Appearance page
  is richer on raw token count (accent/background/foreground hex fields,
  contrast slider) but has no equivalent to AGI's create/import/export
  workflow for a fully custom theme.
- **VS Code extension's config-key/schema lock-step test** (`inventory/extension-vscode.md:176-181`)
  is the one place in the product that already automates the exact check
  this audit recommends generalizing in SETTINGS-010. It should be the
  template, not a one-off.
- **Chrome extension's per-action, nonce-bound approval model** for
  computer-use/CDP access is architecturally ahead of a static
  category-dropdown approach — confirmed independently and cross-referenced
  against the existing, correctly-`Not Planned` `GAP-123`.
- **Honest disclosure over fake availability.** `SecuritySection.tsx`,
  `apps/web/app/settings/voice/page.tsx`, and `CapabilitiesSection.tsx`'s
  removed memory-import row all explicitly tell the user what isn't
  available and why, rather than rendering a control that does nothing.
  This is precisely the standard `CLAUDE.md` asks for ("do not invent APIs...
  mark it unknown or add a tracked gap") applied at the UI-copy level, and it
  was found consistently, not as an isolated instance.
- **Mobile's settings tree is the most complete and most disciplined single
  surface in the product** — ~33 real screens, and the one place this audit
  found a settings type actively _removed_ rather than half-wired
  (`settings/permissions/registry.ts`'s deleted `location` stub, quoting
  almost verbatim from this repo's own "finish what you start" rule).

---

## Summary table

| #            | Gap                                                                                                       | Type                   | Severity | Prior art |
| ------------ | --------------------------------------------------------------------------------------------------------- | ---------------------- | -------- | --------- |
| SETTINGS-001 | "Settings" gear icon in collapsed web sidebar routes to Voice sub-page, not the Settings modal            | broken-workflow        | P1       | new       |
| SETTINGS-002 | Desktop model-routing setters (temperature/max-tokens/task-routing/favorites/provider) — 0 call sites     | dead-code              | P2       | new       |
| SETTINGS-003 | Desktop window/session setters + `setSendShortcut` (seed example) — 0 call sites                          | dead-code              | P2       | new       |
| SETTINGS-004 | Agent checkpointing/auto-resume-on-restart fully modeled, zero UI                                         | partial-implementation | P2       | new       |
| SETTINGS-005 | Shared unified-chat store: 7 dead field/setter pairs (tool-access mode, inline viz, 3× notify, 2× memory) | dead-code              | P2       | new       |
| SETTINGS-006 | Web (+ Desktop) Capabilities settings missing Artifacts/Code-exec/Network-egress/Tool-access-mode         | missing-capability     | P2       | new       |
| SETTINGS-007 | No accent color/contrast on web (mobile + desktop have it)                                                | parity-gap             | P2       | GAP-275   |
| SETTINGS-008 | No passkey/WebAuthn or SMS MFA, TOTP-only (honestly disclosed)                                            | security-gap           | P2       | GAP-115   |
| SETTINGS-009 | Chrome extension notification control is a single flat toggle                                             | ux-gap                 | P3       | new       |
| SETTINGS-010 | Recurring "settings panel shipped with no nav entry" authoring pattern (4 historical + 2 new instances)   | architecture-gap       | P2       | new       |
| SETTINGS-011 | Desktop Cowork settings: 1 control vs. Claude's 5                                                         | parity-gap             | P2       | GAP-006   |
| SETTINGS-012 | Web notifications: 3 categories vs. benchmark's 6-8 (deliberately, correctly narrow)                      | parity-gap             | P3       | GAP-119   |

12 entries: 8 newly filed by this pass, 4 corroborating already-tracked rows
with independent source-level verification.
