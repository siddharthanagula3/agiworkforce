---
id: "COMP-apps-and-install"
type: "competitor-trace"
title: "Apps, install and updates"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Apps, install and updates: competitors to requirements

Claude and ChatGPT both ship desktop, phone, web and browser-extension apps plus separate coding tools, with OS hooks such as global shortcuts, widgets and deep links. AGI has a Mac-only signed desktop installer with auto-update, a Mac-only desktop shell, a script-installed CLI, store-ready phone and extension builds, and many OS hooks. Largest gaps: Windows and Linux desktop, update channels, managed-fleet controls, package-manager installs, Apple Intelligence, CarPlay, reading other apps. No item is seen working by a person.

**How the products divide this topic.** Claude (chat product) and Claude Code (coding tool) are documented on different sites. support.claude.com covers Claude Desktop, mobile apps, Claude in Chrome and the iOS and Android system hooks. code.claude.com covers the Claude Code CLI, its VS Code extension and JetBrains plugin, deep links and computer use from the terminal. They meet in the Claude Desktop app, which hosts Chat, Cowork and a Code tab, in claude:// links that open Code sessions, in the /mobile QR command, and in the Chrome extension that Claude Code and Desktop both use. ChatGPT and Codex are merged on desktop: learn.chatgpt.com says the new ChatGPT desktop app hosts Chat, Work and Codex (macOS and Windows, with a Linux preview), and the older Codex app moves into it. Codex CLI and the Codex IDE extension remain separate coding tools. Plan limits that matter: Claude Code and Cowork on Desktop need a paid plan; the Stable/Latest channel needs Desktop 4.29.0 or newer and is not on Linux, Store or IT-managed installs; Mac and Windows MSIX/PKG deployment pages are for Team and Enterprise; Windows ChatGPT app pages list Plus, Team, Edu, Enterprise; enterprise update controls are Enterprise and Edu; several iOS and Android items are All plans but Team and Enterprise lose location. Linux apps from both leaders are beta or preview. Review date for all competitor evidence: 2026-11-22. Catalogue rows are summaries; where a row is not shown, has is unknown. The project ledger (area briefs) and comparison CSVs disagree in places; code wins (AGENTS.md section 2) and each disagreement is flagged below.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-apps-and-install-01](#cap-apps-and-install-01) | Desktop app for macOS, Windows and Linux | yes | yes | partly built | code inspected only |
| [CAP-apps-and-install-02](#cap-apps-and-install-02) | Signed installer and public download page | yes | yes | partly built | code inspected only |
| [CAP-apps-and-install-03](#cap-apps-and-install-03) | Desktop automatic update and Check for Updates | yes | yes | partly built | code inspected only |
| [CAP-apps-and-install-04](#cap-apps-and-install-04) | Release channel choice (stable or latest) | yes | unknown | not built | not verified |
| [CAP-apps-and-install-05](#cap-apps-and-install-05) | Managed deployment and admin update control | yes | yes | not built | not verified |
| [CAP-apps-and-install-06](#cap-apps-and-install-06) | Desktop deployment: unified app migration and previous-version coexistence | partly | yes | unknown | not verified |
| [CAP-apps-and-install-07](#cap-apps-and-install-07) | Phone apps from the app stores | yes | yes | partly built | not verified |
| [CAP-apps-and-install-08](#cap-apps-and-install-08) | Phone app update and what is new | yes | unknown | built | code inspected only |
| [CAP-apps-and-install-09](#cap-apps-and-install-09) | Managed enterprise phone app | yes | yes | not built | not verified |
| [CAP-apps-and-install-10](#cap-apps-and-install-10) | Command-line install paths | yes | yes | partly built | code inspected only |
| [CAP-apps-and-install-11](#cap-apps-and-install-11) | Command-line update, pinning and disabling | yes | partly | partly built | code inspected only |
| [CAP-apps-and-install-12](#cap-apps-and-install-12) | VS Code extension install and editor coverage | yes | yes | partly built | not verified |
| [CAP-apps-and-install-13](#cap-apps-and-install-13) | Browser extension install and store updates | yes | yes | partly built | not verified |
| [CAP-apps-and-install-14](#cap-apps-and-install-14) | Web app access and installable web app | unknown | yes | partly built | code inspected only |
| [CAP-apps-and-install-15](#cap-apps-and-install-15) | Global shortcut quick chat | yes | yes | built | code inspected only |
| [CAP-apps-and-install-16](#cap-apps-and-install-16) | Menu bar, tray and dock presence | unknown | yes | built | code inspected only |
| [CAP-apps-and-install-17](#cap-apps-and-install-17) | Screenshot and window sharing to chat | yes | yes | partly built | code inspected only |
| [CAP-apps-and-install-18](#cap-apps-and-install-18) | Reading context from the app in front | unknown | yes | not built | not verified |
| [CAP-apps-and-install-19](#cap-apps-and-install-19) | Computer use and its OS permissions | yes | yes | partly built | code inspected only |
| [CAP-apps-and-install-20](#cap-apps-and-install-20) | Deep links | yes | yes | partly built | code inspected only |
| [CAP-apps-and-install-21](#cap-apps-and-install-21) | iPhone widgets, Lock Screen control and Action button | yes | yes | built | code inspected only |
| [CAP-apps-and-install-22](#cap-apps-and-install-22) | Android widget, icon shortcuts and default assistant | yes | unknown | partly built | code inspected only |
| [CAP-apps-and-install-23](#cap-apps-and-install-23) | Siri, Shortcuts, Spotlight and Apple Intelligence | yes | yes | partly built | code inspected only |
| [CAP-apps-and-install-24](#cap-apps-and-install-24) | Phone system apps: calendar, reminders, location, messages | yes | partly | partly built | code inspected only |
| [CAP-apps-and-install-25](#cap-apps-and-install-25) | Share-sheet intake | partly | partly | built | code inspected only |
| [CAP-apps-and-install-26](#cap-apps-and-install-26) | Car and in-car voice | unknown | yes | not built | not verified |
| [CAP-apps-and-install-27](#cap-apps-and-install-27) | Office and workspace add-ins | yes | yes | not built | not verified |
| [CAP-apps-and-install-28](#cap-apps-and-install-28) | Launch at login and background behaviour | unknown | partly | partly built | code inspected only |
| [CAP-apps-and-install-29](#cap-apps-and-install-29) | Hardware controls and macropads | unknown | yes | partly built | not verified |
| [CAP-apps-and-install-30](#cap-apps-and-install-30) | Local model install and storage on the device | unknown | unknown | partly built | code inspected only |

## CAP-apps-and-install-01 Desktop app for macOS, Windows and Linux

A downloadable desktop app on each major operating system, with a stated minimum OS and CPU support.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Desktop app; Code tab and Cowork inside it are Claude Code and Cowork): yes**
  - [https://support.claude.com/en/articles/10065433-install-claude-desktop](https://support.claude.com/en/articles/10065433-install-claude-desktop): Desktop apps for macOS 13+, Windows 10+ and Linux (beta; Ubuntu 22.04+/Debian 12+, x64 or arm64). Chat is on every plan; Claude Code and Cowork need a paid plan. Linux has no computer use or dictation. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **ChatGPT (desktop app that also hosts Work and Codex): yes**
  - [https://learn.chatgpt.com/docs/linux/linux-app.md](https://learn.chatgpt.com/docs/linux/linux-app.md): Preview app for Ubuntu 24.04 and 26.04, Debian 13, Fedora 43 and 44 and current Arch, on x64 and ARM64, signed in with ChatGPT; no Computer Use yet. Apps: desktop.
  - [https://learn.chatgpt.com/docs/whats-new.md](https://learn.chatgpt.com/docs/whats-new.md): The macOS/Windows ChatGPT desktop app hosts Chat, Work and Codex; available on every plan including Free. Plans: all plans. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md section 12 (Desktop role) for the app itself). Offer the desktop app on macOS and Windows with a stated minimum OS, and decide in writing whether Linux is in or out. Product requirements already name Desktop as one of six apps and the public Desktop as Electron.

**With different models, providers and the one subscription.** The installer carries no model choice. The app must show the same model picker and one AGI Subscription entitlement on every OS. Local mode (free local inference) must work or be shown as unavailable per OS, never silently routed to cloud.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop: Mac builds only (arm64 and x64). Windows and Linux builds are missing (comparison D114, D112). The retained Tauri tree can build Linux and Windows but is internal, not the public Desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S70.01
- Comparison list ids: D112, D114
- Code: `apps/desktop/electron-builder.yml:70 (only a mac: block)`; `docs/product/competitive-guidance.md:71 (retained Tauri can build macOS and Linux)`

**Gap.** No Windows or Linux build of the public Electron Desktop. No written decision on Linux.

**Acceptance criteria**

1. The download page lists one working installer for each supported OS and CPU, and says which are not available yet.
2. Install on a clean machine of each supported OS, launch, sign in or use Local mode, and send one message.
3. The minimum OS version is stated on the page and the app refuses or explains on an older OS.

**Verification: code inspected only.** Comparison rows D112/D114 are code readings; I confirmed only the mac: block in electron-builder.yml. No person has run an installer (web scorecard covers browser only).

## CAP-apps-and-install-02 Signed installer and public download page

A signed, notarized installer reachable from an official page that shows what is available per platform.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://claude.com/product/overview](https://claude.com/product/overview): Download Claude for macOS offered from the product page. Apps: web,desktop.
  - [https://support.claude.com/en/articles/10065433-install-claude-desktop](https://support.claude.com/en/articles/10065433-install-claude-desktop): Install guide per operating system. Plans: all plans. Apps: desktop.
- **ChatGPT: yes**
  - [https://openai.com/chatgpt/download/](https://openai.com/chatgpt/download/): ChatGPT desktop app with Work and Codex, mobile apps and a Chrome extension are offered from one download page. Apps: desktop,ios,android.

**AGI requirement** (stated requirement; source: docs/product/definition.md (Desktop has no published installer yet; the release API and verified asset are the availability authority)). One public download page lists every app, its availability per platform and the verified installer. Availability authority is the release API and a verified asset, not a passing signing workflow.

**With different models, providers and the one subscription.** Page and installer are model-neutral. Free download with no payment; sign-in is a separate step. Local mode must be usable after install without a paid plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: download page exists and shows availability per platform. Desktop: signed, notarized Mac DMG and ZIP built by a release workflow; the website route answers 503 for non-Mac. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D114
- Code: `apps/web/app/download/page.tsx`; `apps/desktop/electron-builder.yml:70-87`; `docs/product/definition.md:464 (no published installer yet)`

**Gap.** Whether a released, downloadable Mac asset exists is not shown in the sources. Non-Mac platforms show unavailable.

**Acceptance criteria**

1. Open /download signed out; each row shows available or coming soon and matches the release API.
2. Download the Mac installer, verify the signature and notarization with the OS tools, and install.
3. A platform with no verified asset shows no download button.

**Verification: code inspected only.** Page and builder config exist; no live run by a person recorded.

## CAP-apps-and-install-03 Desktop automatic update and Check for Updates

The desktop app finds, downloads and applies new versions itself and offers a manual check.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10065433-install-claude-desktop](https://support.claude.com/en/articles/10065433-install-claude-desktop): Mac has Claude > Check for Updates and Windows has Help > Check for Updates to apply a new channel immediately. Apps: desktop.
  - [https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows](https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows): Desktop self-updates unless disableAutoUpdates=1; admins choose MDM or in-app updater as single update owner. Plans: Team, Enterprise. Apps: desktop.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/enterprise/windows-deployment.md](https://learn.chatgpt.com/docs/enterprise/windows-deployment.md): The app checks for updates by default; uninstall keeps local chats and settings unless uninstall_codex_home is set. Plans: Enterprise, Business. Apps: desktop.
  - [https://help.openai.com/en/articles/9982051-using-the-chatgpt-windows-app](https://help.openai.com/en/articles/9982051-using-the-chatgpt-windows-app): Windows app listed with a check for updates control in settings (release notes row). Plans: Plus, Team, Edu, Enterprise. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 15.2 (staged updater manifest, schema compatibility, rollback or previous-version support)). The desktop app updates itself in the background, tells the user when a restart applies it, offers Check for Updates in the menu, and keeps a previous version for rollback.

**With different models, providers and the one subscription.** Updater talks to our release feed, not a model provider. In Local mode the update check is an outside call and must go through the egress guard and be switchable off; the app must keep working offline on the installed version.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop: Mac checks at launch and every 24 hours, downloads in background, prompts restart; Check for Updates is in app menu, Help and tray. No Windows updater because no Windows build. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S70.26
- Comparison list ids: D115
- Code: `apps/desktop/electron/desktopAutoUpdate.ts:10 (24-hour interval)`; `apps/desktop/electron/desktopAutoUpdate.ts:17-19 (supported only when packaged and darwin)`; `apps/desktop/electron/appMenu.ts:136`

**Gap.** Mac only. Rollback and previous-version support not shown in code reading.

**Acceptance criteria**

1. With an older build installed and a newer release published, the app downloads it and shows a restart prompt within 24 hours.
2. Check for Updates reports up to date or applies the new version.
3. Offline, the app starts and works on the installed version without an error loop.

**Verification: code inspected only.** I read desktopAutoUpdate.ts lines 10-40. No live update run recorded.

## CAP-apps-and-install-04 Release channel choice (stable or latest)

A setting that lets users pick faster, less tested builds or the slower stable build.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Desktop); Claude Code CLI has its own latest/stable channel: yes**
  - [https://support.claude.com/en/articles/10065433-install-claude-desktop](https://support.claude.com/en/articles/10065433-install-claude-desktop): Settings > Desktop app: Stable (default) or Latest (about daily builds). Not on Linux, Microsoft Store installs or IT-managed machines. Choosing Stable does not downgrade. Plans: All plans. Apps: desktop.
  - [https://code.claude.com/docs/en/setup.md](https://code.claude.com/docs/en/setup.md): autoUpdatesChannel picks latest or a roughly one-week-old stable build. Apps: cli.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (Claude only)). Offer a stable default and an opt-in faster channel on desktop, CLI and VS Code where the build system allows it, with a clear note that switching back does not downgrade.

**With different models, providers and the one subscription.** Channel is independent of model and plan. A new model route may arrive on the faster channel first; show that in the UI rather than hiding the model.

**Current implementation, as this trace read it on 2026-11-24: not built.** Desktop: one channel, no setting (S70.27 missing). CLI: one stable feed. VS Code: release workflow only, pre-release channel not shown. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S70.27
- Comparison list ids: C397, D116, VP67
- Code: `apps/desktop/electron/desktopCloudUpdate.ts:9 (single channel, per comparison D116)`; `apps/cli/src/update_check.rs:5 (prereleases ignored)`

**Gap.** No channel setting on any app.

**Acceptance criteria**

1. Settings shows Stable and Latest; picking Latest then checking for updates offers a newer build when one exists.
2. Picking Stable again keeps the installed build and says so.
3. The setting is hidden or explained on installs that cannot use it.

**Verification: not verified.** Absence taken from ledger and comparison rows.

## CAP-apps-and-install-05 Managed deployment and admin update control

IT teams push the app by MDM or packages, turn off self-update, and set minimum or pinned versions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Desktop); Claude Code CLI for version floor and ceiling: yes**
  - [https://support.claude.com/en/articles/12611117-deploy-claude-desktop-for-macos](https://support.claude.com/en/articles/12611117-deploy-claude-desktop-for-macos): Admins deploy a universal PKG or DMG through MDM such as Jamf, Kandji or Intune; installs auto-update; shared machines should disable auto-update and use MDM. Plans: Team, Enterprise. Apps: desktop.
  - [https://code.claude.com/docs/en/settings-reference.md](https://code.claude.com/docs/en/settings-reference.md): Managed requiredMinimumVersion makes Claude Code exit at startup when older; claude update, install and doctor still work for recovery. Plans: Team, Enterprise. Apps: cli.
- **ChatGPT (desktop); Codex for requirements.toml: yes**
  - [https://learn.chatgpt.com/docs/enterprise/manage-app-updates.md](https://learn.chatgpt.com/docs/enterprise/manage-app-updates.md): Admins set in_app_updates=false in requirements.toml of a managed policy so the desktop app stops self-updating; deploy approved versions via MDM or Intune. Plans: Enterprise, Edu. Apps: desktop.
  - [https://learn.chatgpt.com/docs/enterprise/windows-deployment.md](https://learn.chatgpt.com/docs/enterprise/windows-deployment.md): Windows deploy via Intune and Microsoft Store, offline MSIX (x64 and Arm64) and SCCM. Plans: Enterprise, Business. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). Enterprise admins can deploy the desktop app by MDM, turn off in-app updates, set a minimum version and read a published list of hosts the app needs.

**With different models, providers and the one subscription.** Policy applies per workspace under the one subscription system. A policy must not change which models or providers a user may choose; it only controls the app version. Local mode must still run on a pinned version.

**Current implementation, as this trace read it on 2026-11-24: not built.** Desktop: only DMG and ZIP are built; updater always runs on Mac; no managed preferences read; no minimum version check. CLI: a managed settings file exists but cannot hold a version limit. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C391, D109, D111, D113, D117, D118
- Code: `apps/desktop/electron/desktopAutoUpdate.ts:14`; `apps/desktop/electron/runtime/developerSessionService.ts:131 (only the local CLI runtime version gate)`

**Gap.** No MSIX or PKG, no managed update switch, no minimum version, no hosts list.

**Acceptance criteria**

1. A workspace policy can turn off in-app updates and the app then shows a Managed row and does not self-update.
2. An app older than the minimum version blocks use with a message and a way to update.
3. A public page lists network hosts and the signing identity.

**Verification: not verified.** From comparison rows only.

## CAP-apps-and-install-06 Desktop deployment: unified app migration and previous-version coexistence

When the vendor merges products into one desktop app, existing users are moved without losing data and the old app can stay.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork and Claude chat merged into one app per a help page): partly**
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one) (this address is not in the saved catalogue; treat as unverified): Cowork and chat are one experience with folder access in Claude Desktop (title and catalogue row ch05:44 only; detail not opened). Apps: desktop.
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/20001276-moving-to-the-new-chatgpt-desktop-app](https://help.openai.com/en/articles/20001276-moving-to-the-new-chatgpt-desktop-app): On macOS and Windows the Codex app updates into the new ChatGPT desktop app; existing chats and projects are kept. The previous app can stay as ChatGPT Classic with no forced migration and still gets fixes and security patches. Plans: Paid plans. Apps: desktop.

**AGI requirement** (proposed; source: competitor parity (ChatGPT)). If AGI ever replaces the Tauri or older desktop build with the Electron one, existing users keep chats and projects and the old build keeps getting security fixes for a stated period.

**With different models, providers and the one subscription.** Account, entitlements and usage ledger carry over unchanged. Local-mode chats on the device must migrate or stay readable; none may move to cloud.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Not examined: no migration path between the retained Tauri build and Electron Desktop is shown in the sources. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `docs/product/definition.md:457 (Tauri is retained internal code, not a second public Desktop)`

**Gap.** Not applicable until a public desktop release replaces something; no plan found.

**Acceptance criteria**

1. Install the new app over an old profile; chats and projects appear.
2. A removed app leaves local data on disk unless the user chooses to delete it, and says so.

**Verification: not verified.** No source.

## CAP-apps-and-install-07 Phone apps from the app stores

Native iPhone and Android apps installed from the App Store and Google Play, with stated minimum OS and country availability.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9266462-install-claude-for-ios](https://support.claude.com/en/articles/9266462-install-claude-for-ios): Standard Claude app plus a managed Claude for Intune version; both need iOS or iPadOS 18.0 or newer; uninstalling does not cancel a subscription. Plans: Enterprise (Intune). Apps: ios.
  - [https://support.claude.com/en/articles/9612887-install-claude-for-android](https://support.claude.com/en/articles/9612887-install-claude-for-android): Install from Play Store on Android 8.0 Oreo or newer; uninstalling does not cancel a subscription. Apps: android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8142208-using-the-chatgpt-mobile-app-classic-experience](https://help.openai.com/en/articles/8142208-using-the-chatgpt-mobile-app-classic-experience): Downloaded from the App Store or Google Play; also on Apple Vision Pro. One account and subscription work on all devices. Apps: ios,android.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): All individual plans can use ChatGPT on web, iPhone and Android. Plans: Free, Go, Plus, Pro. Apps: web,ios,android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 2.3 and 10.14 (public iOS release, fresh install reaches Local chat); docs/decisions founder decisions (mobile v1 free, no in-app purchase)). Mobile v1 is a public iOS app on the App Store (and an Android build) with free Local chat after install. One account and one entitlement work across devices. Stated minimum OS and supported countries are on the store page.

**With different models, providers and the one subscription.** Local mode runs a downloaded on-device model with no payment; sign-in is separate. Cloud sends stay gated behind sign-in and the one AGI Subscription. Mobile BYOK is not a v1 path.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: build and store listing draft exist; no live listing (release state says Coming soon). Android minSdk 26 (Android 8.0). iOS main-app floor unverified (extensions target iOS 17). Listing offers all territories except a stated list. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S71.31
- Comparison list ids: M158, MP80, MP81, MP82
- Code: `apps/mobile/app.config.js:348 (minSdkVersion)`; `apps/mobile/store-listing/LISTING-METADATA-IOS.json:34 (age rating 18+)`; `docs/product/definition.md (Mobile is not published)`

**Gap.** Not published. iOS minimum version not confirmed.

**Acceptance criteria**

1. The App Store listing is live and installs on a supported iPhone.
2. Fresh install with no account reaches Local chat, or shows a download-a-model prompt.
3. On an unsupported OS or country the store or app says why.

**Verification: not verified.** No person-seen result in the sources.

## CAP-apps-and-install-08 Phone app update and what is new

Users update through the store and see what changed; some apps also update code over the air.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11825384-how-to-update-claude-for-ios](https://support.claude.com/en/articles/11825384-how-to-update-claude-for-ios): Update manually from App Store pending updates; Intune-managed Enterprise installs are updated by IT. Plans: Enterprise (Intune). Apps: ios.
  - [https://support.claude.com/en/articles/11825394-how-to-update-claude-for-android](https://support.claude.com/en/articles/11825394-how-to-update-claude-for-android): Update manually from Play Store > Manage apps & device > Updates available. Apps: android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 15.2 (store release plus Expo update only for changes permitted by platform policy)). Store updates for native changes, with over-the-air updates only where store policy permits, and a notice after update that opens release notes. Show the app version in About.

**With different models, providers and the one subscription.** A model or provider change must come from the server catalog, never a store update. Local model files already downloaded survive an update.

**Current implementation, as this trace read it on 2026-11-24: built.** Mobile: expo-updates is configured; a toast after update opens release notes; About shows version, build and platform. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/mobile/app.config.js:419`; `apps/mobile/app.config.js:455 (expo-updates plugin)`; `apps/mobile/src/features/release-state/releaseUpdateNotice.ts`

**Gap.** none known

**Acceptance criteria**

1. After an update, the app shows an updated notice once and opens release notes.
2. About shows version and build matching the store.
3. A downloaded local model is still present after update.

**Verification: code inspected only.** Config lines found in app.config.js; not run.

## CAP-apps-and-install-09 Managed enterprise phone app

A separate mobile build or configuration that IT can distribute and control through a device-management tool.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9266462-install-claude-for-ios](https://support.claude.com/en/articles/9266462-install-claude-for-ios): A managed Claude for Intune iOS app for Enterprise. Plans: Enterprise. Apps: ios.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): ChatGPT for Intune iOS app (release note row oh01:243). Plans: Enterprise. Apps: ios.

**AGI requirement** (proposed; source: competitor parity). Decide whether a managed phone build is needed for enterprise customers; if so it follows the same entitlements and Local/Cloud boundaries.

**With different models, providers and the one subscription.** Managed build must not change provider routing or silently enable cloud; admin policy lives in the same subscription and workspace console.

**Current implementation, as this trace read it on 2026-11-24: not built.** Mobile: no managed or Intune build. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M159
- Code: `searched: Intune, MSAL in apps/mobile (per comparison M159)` (not found)

**Gap.** No managed build.

**Acceptance criteria**

1. If built: an admin pushes the app by MDM and policy applies on first launch.

**Verification: not verified.** Absence from comparison row.

## CAP-apps-and-install-10 Command-line install paths

Installing the terminal coding agent by script, native installer or package manager on each OS.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/setup.md](https://code.claude.com/docs/en/setup.md): Native installer (curl, PowerShell, CMD), Homebrew casks, WinGet, apt/dnf/apk repositories and npm (Node 22+). Apps: cli.
  - [https://code.claude.com/docs/en/troubleshoot-install.md](https://code.claude.com/docs/en/troubleshoot-install.md): System requirements macOS 13+, 64-bit Windows, 4 GB RAM; region restriction on installer; corporate proxy and CA support. Apps: cli.
- **Codex (CLI): yes**
  - [https://learn.chatgpt.com/docs/codex/cli.md](https://learn.chatgpt.com/docs/codex/cli.md): Install via a curl script on macOS/Linux, a PowerShell script on Windows, npm global package, or Homebrew cask; updating reruns the same command. Apps: cli.

**AGI requirement** (inferred; source: competitor parity; docs/product/experience-contract.md section 15.2 (signed binaries and package releases)). The CLI installs by one signed command on macOS, Linux and Windows, with the install command shown on the public page. Package-manager channels are a product choice.

**With different models, providers and the one subscription.** The binary supports Local, BYOK and Managed modes; install must not pick a provider. Release archives are signed and checked before install.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI: install.sh (macOS, Linux, Git Bash/WSL) with signed checksums and --version; six archives (macOS, Linux, Windows; x64 and arm64). No PowerShell or WinGet, Homebrew not offered, no npm, no apt/dnf, musl refused, no uninstall command. Site still marks the CLI Coming soon. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S72.35
- Comparison list ids: C387, C388, C389, C390, C392, C394, C400, CP258
- Code: `apps/web/public/install.sh:1-35`; `apps/web/public/install.sh:112 (musl refusal)`; `.github/workflows/release-cli.yml:185-220`

**Gap.** Native Windows installer, package managers, uninstall, public install page.

**Acceptance criteria**

1. On a clean machine for each supported OS, the documented command installs and agi --version prints.
2. Tampering with the archive makes the installer stop with a signature error.
3. An unsupported platform gets a clear message, not a partial install.

**Verification: code inspected only.** install.sh exists at the cited path; ledger marks S72.35 partial. Not run.

## CAP-apps-and-install-11 Command-line update, pinning and disabling

Background update checks, an on-demand update command, a way to install a given version and a way to switch updates off.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/setup.md](https://code.claude.com/docs/en/setup.md): Native installs check at startup, download in the background and apply on next start; claude update applies at once; DISABLE_AUTOUPDATER stops background checks while DISABLE_UPDATES blocks every path. Apps: cli.
- **Codex (CLI): partly**
  - [https://learn.chatgpt.com/docs/codex/cli.md](https://learn.chatgpt.com/docs/codex/cli.md): Updating reruns the same install command (no background update described in this row). Apps: cli.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 15.2 (CLI signed releases and self-update policy)). The CLI checks for updates, shows a notice, installs on request after signature check, and has a switch to turn the check off.

**With different models, providers and the one subscription.** The update check is an outside call and must be off in a strict Local setup. A blocked check must not stop local inference.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI: start-up check prints a notice; agi update --check and --install verify then replace the binary; AGIWORKFORCE_NO_UPDATE_CHECK switches the check off. No silent background install, no pin or admin floor, package-manager-owned installs only get a hint. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S72.35
- Comparison list ids: C391, C395, CP256
- Code: `apps/cli/src/update_check.rs:32,132`; `apps/cli/src/update_check.rs:267-290`; `apps/cli/src/lib.rs:6516`

**Gap.** No silent background apply and no version pin.

**Acceptance criteria**

1. agi update --check reports a newer release when one exists.
2. agi update --install replaces the binary only after verification and a bad signature aborts.
3. With the no-check variable set, no network call is made at start.

**Verification: code inspected only.** update_check.rs present; not run.

## CAP-apps-and-install-12 VS Code extension install and editor coverage

Installing the coding agent as an editor extension from a marketplace, and which editors it supports.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/vs-code.md](https://code.claude.com/docs/en/vs-code.md): Native chat panel for VS Code 1.94+, also installable in Cursor, Devin Desktop and Kiro via Open VSX; extension version equals the bundled Claude Code version. Plans: Pro, Max, Ultra, Team, Enterprise, Console. Apps: ide.
  - [https://code.claude.com/docs/en/troubleshoot-install.md](https://code.claude.com/docs/en/troubleshoot-install.md): The extension ships its own CLI copy and does not put claude on PATH. Apps: ide.
- **Codex (IDE extension): yes**
  - [https://learn.chatgpt.com/docs/codex/ide.md](https://learn.chatgpt.com/docs/codex/ide.md): VS Code and compatible editors use the Codex extension; Xcode and JetBrains provide their own Codex integrations. Apps: ide.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 15.2 (VS Code marketplace prerelease and stable channels, minimum CLI protocol version)). The VS Code extension installs from the Marketplace and Open VSX and states its minimum editor version and whether it needs a separate CLI.

**With different models, providers and the one subscription.** The extension is a presentation layer over the shared CLI app-server; model, provider and entitlement come from that runtime and the one subscription, not from the extension.

**Current implementation, as this trace read it on 2026-11-24: partly built.** VS Code: needs VS Code 1.100+; needs the AGI CLI installed first (a walkthrough step runs the install script); Marketplace publish job exists but extension is a 0.0.1 preview; Open VSX job runs only when a variable is set; no JetBrains or Xcode. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: V63, V65, VP64, VP65, VP66, VP67
- Code: `apps/extension-vscode/src/integrations/cliInstaller.ts:5-50`; `.github/workflows/release-vscode-extension.yml:232-249`; `apps/extension-vscode/package.json:17`

**Gap.** Separate CLI install required; no live listing proven; no pre-release channel.

**Acceptance criteria**

1. Install from the Marketplace in a fresh VS Code profile and open the chat.
2. If the CLI is missing, the walkthrough installs it or says exactly what to do.
3. A VS Code below the minimum version shows a clear incompatibility, not a broken panel.

**Verification: not verified.** Comparison readings only.

## CAP-apps-and-install-13 Browser extension install and store updates

A browser extension installed from the browser store (or pushed by admins) that updates itself and works in named browsers.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude in Chrome); Claude Code connects to it: yes**
  - [https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): A Chrome-only extension lets Claude read, click, type, navigate and fill forms; available on paid plans in the side panel, Cowork and Claude Code. Plans: Pro, Max, Ultra, Team, Enterprise (beta). Apps: web.
  - [https://support.claude.com/en/articles/13065128-claude-in-chrome-admin-controls](https://support.claude.com/en/articles/13065128-claude-in-chrome-admin-controls): Users install from Chrome Web Store, or admins push via Google Workspace admin console or MDM. Plans: Team, Enterprise. Apps: web.
- **ChatGPT (desktop app browser extension): yes**
  - [https://learn.chatgpt.com/docs/chrome-extension.md](https://learn.chatgpt.com/docs/chrome-extension.md): Extension for Chrome, Edge, Brave, Opera and Vivaldi lets ChatGPT read and act in regular browser tabs from the desktop app. Apps: desktop.
  - [https://openai.com/chatgpt/download/](https://openai.com/chatgpt/download/): A downloadable Chrome extension is offered alongside the desktop app. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md section 15.2 (Chrome: Manifest V3 store release, storage migration, host compatibility)). The Chrome extension is listed in the Chrome Web Store, updates through it, states its minimum Chrome version, and says which other Chromium browsers work. It signs in on its own and pairs with Desktop optionally.

**With different models, providers and the one subscription.** Chrome is cloud-only: no Local inference in the extension. Model choice and quota come from the one AGI Subscription. Pairing with Desktop is explicit and the extension must show whether a task runs in the browser, on Desktop or on our servers.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome: Manifest V3 side-panel extension needing Chrome 132+; store release workflow exists; no live store listing proven; Edge by manual runbook; version shown in More menu; sets up without Desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S74.24, S74.27
- Comparison list ids: X20, X21, XP33, XP34
- Code: `apps/extension/manifest.json:87`; `docs/product/competitive-guidance.md:73`; `apps/extension/src/side_panel.ts:11618`

**Gap.** Not in the store; no update notice (S74.24 missing); no browser-differences note (S74.27 missing).

**Acceptance criteria**

1. Install from the store and the side panel opens after pinning.
2. A new version arrives without user action and the version in the menu changes.
3. In an unsupported browser the extension or page says which features differ.

**Verification: not verified.** Docs say publication was never proven.

## CAP-apps-and-install-14 Web app access and installable web app

Using the product in a browser on every plan, with a clear message for unsupported browsers and, where offered, installing the site as a standalone app.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): All individual plans can use ChatGPT on web, iPhone and Android. Plans: Free, Go, Plus, Pro. Apps: web,ios,android.

**AGI requirement** (inferred; source: competitor parity (web access); installable web app is not stated by either leader in the catalogue). The web app works in current browsers on every plan, explains an unsupported browser, and can be installed as a standalone app if the owner chooses.

**With different models, providers and the one subscription.** Same entitlements as every app. Web has no on-device inference, so Local mode is shown as a desktop and phone feature. The offline page must not imply cloud answers are available offline.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: unsupported-browser explanation exists (S69.19 done). A web manifest with standalone display and icons exists, yet the ledger marks installable web app (S69.14) and offline fallback (S69.15) not applicable. No service worker found other than for web push. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S69.13, S69.14, S69.15, S69.19
- Comparison list ids: none matched
- Code: `apps/web/app/manifest.ts:1-30`; `apps/web/app/layout.tsx:154`; `apps/web/features/notifications/lib/web-push-client.ts`

**Gap.** Ledger and code disagree on installability; no decision on offering a PWA.

**Acceptance criteria**

1. In a supported browser the install prompt appears or the decision to omit it is documented.
2. An old browser shows the explanation page, not a blank screen.

**Verification: code inspected only.** I read manifest.ts. Web scorecards cover chat flows only, not install.

## CAP-apps-and-install-15 Global shortcut quick chat

A system-wide shortcut opens a small chat box over any app.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Desktop, macOS): yes**
  - [https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac](https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac): Global shortcut opens a text box from any app; macOS 12+, app must be running; needs Screen recording, Accessibility and optionally Speech recognition permissions. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **ChatGPT (desktop): yes**
  - [https://help.openai.com/en/articles/9295241-how-to-launch-the-chat-bar](https://help.openai.com/en/articles/9295241-how-to-launch-the-chat-bar): Global shortcut (default Option+Space, changeable) or menu bar icon opens a draggable Chat Bar to ask, attach files, take a screenshot or photo. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). A configurable system-wide shortcut opens a quick composer over any app, reports shortcut conflicts, and works with the same model picker and limits as the main chat.

**With different models, providers and the one subscription.** Quick Ask uses the same mode and model as the main app; in Local mode the text stays on device. Usage counts in the one subscription ledger.

**Current implementation, as this trace read it on 2026-11-24: built.** Desktop: Quick Ask floating panel from a global shortcut, configurable; Mac and other OS shortcuts per ledger. Windows Alt+Space style companion not applicable because no Windows build. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S109.05, S70.05, S70.06, S70.07
- Comparison list ids: none matched
- Code: `apps/desktop/electron/quickAsk.ts:11-17`; `apps/desktop/electron/shortcuts.ts:84`; `apps/web/app/quick-ask/page.tsx:3`

**Gap.** none known on Mac; unverified elsewhere.

**Acceptance criteria**

1. Press the shortcut in another app; the composer opens and focus is in the text box.
2. Change the shortcut; a conflicting key is reported.
3. Send a prompt; the answer appears in the app and counts in usage.

**Verification: code inspected only.** Ledger says done; files exist; not run by a person.

## CAP-apps-and-install-16 Menu bar, tray and dock presence

An icon in the menu bar or tray and a dock menu with quick actions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (desktop): yes**
  - [https://help.openai.com/en/articles/9295241-how-to-launch-the-chat-bar](https://help.openai.com/en/articles/9295241-how-to-launch-the-chat-bar): The menu bar icon opens the Chat Bar. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (desktop settings include menu bar and run on startup)). A menu-bar or tray icon offers open, new chat, quick ask, screenshot, voice and quit, and can be turned off. It lists running agents with a stop control.

**With different models, providers and the one subscription.** Icon actions use the current mode and model. Stop All must stop local and cloud runs alike.

**Current implementation, as this trace read it on 2026-11-24: built.** Desktop: tray with Menu bar switch (on by default), running sessions and Stop All, dock menu with New Chat, New Window and Quick Ask. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S109.03, S70.03, S70.04
- Comparison list ids: none matched
- Code: `apps/desktop/electron/tray.ts:93`; `apps/desktop/electron/tray.ts:128-163`; `apps/desktop/electron/appMenu.ts:612-627`

**Gap.** none known

**Acceptance criteria**

1. Turn the menu bar switch off; the icon disappears and returns when on.
2. Start an agent run; the tray lists it and Stop All ends it.
3. Right-click the dock icon; New Chat opens a chat.

**Verification: code inspected only.** Ledger done; not run.

## CAP-apps-and-install-17 Screenshot and window sharing to chat

A shortcut or menu action sends a screenshot or the front app window into a chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Desktop quick entry): yes**
  - [https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac](https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac): Quick entry screenshot capture and share application window (catalogue rows ch02:131, ch02:132). Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **ChatGPT (desktop, Appshots): yes**
  - [https://learn.chatgpt.com/docs/appshots.md](https://learn.chatgpt.com/docs/appshots.md): Appshots send the frontmost app window to chat; hotkey is both Command keys on Mac or both Alt on Windows (catalogue rows cl01:111, cl01:112). Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). The user can send a screenshot or one chosen window to a chat, sees it as an attachment before sending, and an admin can switch window sharing off.

**With different models, providers and the one subscription.** The image goes only to the chosen model route; if the model cannot read images, say so before sending. In Local mode it stays on device. OS screen-recording permission is requested with an explanation.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop: Screenshot to Chat captures the display; Window to Chat works on Mac only; no admin switch for window sharing. Chrome: capture-page shortcut sends a screenshot to a paired Desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S109.09, S109.10, S70.19
- Comparison list ids: D95, DP100, DP97
- Code: `apps/desktop/electron/screenshot.ts:63-175`; `packages/contracts/local-runtime/src/host-bridge.ts:70`

**Gap.** Window capture Mac only; no admin switch.

**Acceptance criteria**

1. Use the shortcut; the capture appears as an attachment.
2. Without screen-recording permission the app explains and opens System Settings.
3. An admin switch off removes the window shortcut.

**Verification: code inspected only.** Ledger done for capture; comparison marks window share partial.

## CAP-apps-and-install-18 Reading context from the app in front

The assistant reads text from a supported coding, terminal or notes app and sends it with a message.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (macOS app, Work with Apps): yes**
  - [https://help.openai.com/en/articles/10119604-work-with-apps-on-macos](https://help.openai.com/en/articles/10119604-work-with-apps-on-macos): Reads content from supported coding, terminal and note apps and includes it with a message, with a banner showing what is attached; sends last 200 terminal lines or the selection plus nearby text. Apps: desktop.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). If offered, the user sees which app and which text is attached, can remove it, and grants the OS accessibility permission knowingly.

**With different models, providers and the one subscription.** Attached text goes to whichever model the user chose; in Local mode only to the local model. The banner must name the provider route.

**Current implementation, as this trace read it on 2026-11-24: not built.** Desktop: nothing reads text from another app; only a window screenshot can be sent. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S70.18
- Comparison list ids: D105
- Code: `searched: workWithApps, frontmostApp, axSelectedText (per comparison D105)` (not found)

**Gap.** Not built.

**Acceptance criteria**

1. If built: with a notes app in front, the banner shows the app and the text; removing it sends none.

**Verification: not verified.** Absence taken from ledger.

## CAP-apps-and-install-19 Computer use and its OS permissions

The assistant controls the screen with the user's approval, needing Screen Recording and Accessibility on Mac.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Desktop, Cowork) and Claude Code CLI (separate preview): yes**
  - [https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork-and-claude-code](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork-and-claude-code) (this address is not in the saved catalogue; treat as unverified): Computer use in Cowork and Claude Code; background mode on macOS 15+ and a Full control option (catalogue rows ch03:112, ch03:113). Plans: Pro, Max, Ultra (beta Team). Apps: desktop.
  - [https://code.claude.com/docs/en/computer-use.md](https://code.claude.com/docs/en/computer-use.md): CLI computer use is a preview on Pro, Max, Ultra, not Team or Enterprise; per-session app approval; unavailable with third-party providers. Plans: Pro, Max, Ultra. Apps: cli.
- **ChatGPT (desktop): yes**
  - [https://learn.chatgpt.com/docs/computer-use.md](https://learn.chatgpt.com/docs/computer-use.md): Computer Use in the desktop app; macOS needs Screen Recording and Accessibility; runs in background on macOS and foreground on Windows; locked use continues after the Mac locks. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (desktop settings include computer use, allowed apps, accessibility, screen recording)). Computer use asks for each OS permission with an explanation, lists allowed and refused apps, shows when it is acting, and always has Stop and Take over.

**With different models, providers and the one subscription.** Needs a model that can read screenshots; if the chosen model cannot, the app says so and offers a capable model. Screenshots leave the device only to the chosen route, and Local mode must say whether the local model can do it. Usage counts in the one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop (Mac): computer use with Take over and Stop, permission status screen, allowed and refused app lists, tray stop. Missing: background mode, Locked Use, @Computer mention, admin per-app list. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S70.21, S70.31
- Comparison list ids: D102, D106, D93, DP99
- Code: `apps/desktop/electron/runtime/computerUseService.ts`; `apps/desktop/electron/runtime/systemPermissions.ts:21-47`

**Gap.** No background mode, no locked use, no admin per-app list.

**Acceptance criteria**

1. Without Screen Recording the app shows the missing permission and opens System Settings.
2. A refused app is not controlled.
3. Stop ends the run at once and returns the mouse.

**Verification: code inspected only.** Ledger done; not run by a person.

## CAP-apps-and-install-20 Deep links

A custom link scheme opens the app on a chat, project, settings page or a new chat with a prefilled prompt.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (claude:// for Desktop and mobile); Claude Code (claude-cli://, vscode:// URI): yes**
  - [https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link): URL scheme launches the app if closed and opens a new chat (prefilled q up to about 14,000 characters), an existing chat or project. Apps: desktop.
  - [https://code.claude.com/docs/en/deep-links.md](https://code.claude.com/docs/en/deep-links.md): claude-cli:// links open Claude Code with a prefilled prompt; shows a safety banner; handler registered on first interactive use; disableDeepLinkRegistration turns it off. Apps: cli.
  - [https://support.claude.com/en/articles/14898120-open-the-claude-mobile-app-with-a-link](https://support.claude.com/en/articles/14898120-open-the-claude-mobile-app-with-a-link): claude://code opens Code sessions in mobile apps; https links work as universal links. Apps: ios,android.
- **ChatGPT desktop with Codex (codex:// links): yes**
  - [https://learn.chatgpt.com/docs/reference/commands.md](https://learn.chatgpt.com/docs/reference/commands.md): codex:// deep links for chats, plugin-backed chats, Settings pages, Skills and Scheduled (catalogue rows cl06:223 to cl06:226). Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md and ledger S70.30 (links open the app on the right screen)). Links open the right screen from a cold start and from notifications; a link that carries a prompt shows it for review and never sends it by itself; admins can stop link registration.

**With different models, providers and the one subscription.** A link never changes mode: a link cannot move a Local chat to Cloud or BYOK. It opens in the current mode and signed-in account.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop: agiworkforce-cloud:// links open chats, projects, settings from cold start. No prefilled new-chat link (D94), no links to Skills or new schedule (DP102), no admin off switch (D96). CLI: no link scheme. VS Code: handoff links work; no prefilled-prompt link. Mobile: notification links work. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S70.30, S71.13
- Comparison list ids: C374, C376, D94, D96, DP102, VP60
- Code: `packages/contracts/local-runtime/src/host-bridge.ts:3-47`; `apps/desktop/electron/main.ts:2553`; `apps/mobile/services/notifications.ts:318`

**Gap.** No prefilled-prompt links, no admin switch, no CLI links.

**Acceptance criteria**

1. A link opens the named chat when the app is closed.
2. A link with a prompt fills the composer and does not send.
3. A link cannot start a cloud send from a Local chat.

**Verification: code inspected only.** Ledger done for S70.30; not run.

## CAP-apps-and-install-21 iPhone widgets, Lock Screen control and Action button

Home Screen widgets, a Lock Screen or Control Center control and an Action-button shortcut that open the phone app or start a task.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (iOS): yes**
  - [https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios): iOS 18+ widget with buttons to start a new chat, open dictation or take a photo; usage counts toward limits. Apps: ios.
  - [https://support.claude.com/en/articles/10302511-access-claude-for-ios-on-your-lock-screen-control-center-and-action-button](https://support.claude.com/en/articles/10302511-access-claude-for-ios-on-your-lock-screen-control-center-and-action-button): Open Claude control for the Lock Screen and Control Center; the Action button can launch it. Apps: ios.
- **ChatGPT (iOS): yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Feb 2025: ChatGPT as Safari default search and a home-screen widget (catalogue row oh08:369). Apps: ios.

**AGI requirement** (inferred; source: competitor parity). Phone widgets and system controls open the app or start a new chat, camera or voice; a widget never shows chat content on a locked screen unless the user allowed it.

**With different models, providers and the one subscription.** A widget starts a chat in the user's current mode. In Local mode the chat uses the on-device model. A started chat counts in the one subscription.

**Current implementation, as this trace read it on 2026-11-24: built.** Mobile: iPhone widget (small and medium) with New chat, Camera, Voice; one Open control for Lock Screen, Control Center and Action Button. Ledger S71.20 and S71.21 say missing; the code exists, so the ledger is stale. No Live Activity. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S109.01, S109.02, S71.20, S71.21, S71.22
- Comparison list ids: M147, MP76
- Code: `apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:85-98`; `apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:90`

**Gap.** No Live Activity; no Analyze Photo control. Ledger rows need correcting.

**Acceptance criteria**

1. Add the widget; each button opens the right screen.
2. Add the Lock Screen control on iOS 18 and open the app.
3. Widget buttons work with no network in Local mode.

**Verification: code inspected only.** Swift file exists at cited path; not seen on a device.

## CAP-apps-and-install-22 Android widget, icon shortcuts and default assistant

An Android home widget, long-press app shortcuts, a selected-text menu entry and an optional default-assistant role.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Android): yes**
  - [https://support.claude.com/en/articles/10534883-use-the-claude-widget-on-android](https://support.claude.com/en/articles/10534883-use-the-claude-widget-on-android): Resizable widget on Android 8.0+ with buttons for new chat, camera capture and voice dictation; usage counts toward limits. Apps: android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity (widget); default assistant not documented by either leader in the catalogue). Android has a widget and icon shortcuts; a default-assistant role is optional.

**With different models, providers and the one subscription.** Assist gesture or widget starts a chat in the current mode; microphone permission is asked with an explanation.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: widget with New chat, Camera, Voice; long-press icon shortcuts; Process text menu entry. No default-assistant role and no Quick Settings tile (S71.24 missing). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S71.20, S71.24
- Comparison list ids: none matched
- Code: `apps/mobile/native/android/widget/AGIQuickActionsWidget.kt`; `apps/mobile/native/android/shortcuts/agi_shortcuts.xml:4`; `apps/mobile/app.config.js:300`

**Gap.** No assistant role or tile; ledger S71.20 stale.

**Acceptance criteria**

1. Add the widget; Voice opens dictation and asks for the microphone once.
2. Long-press the icon; New chat opens a chat.
3. Select text in another app; Process text offers AGI.

**Verification: code inspected only.** Files exist; not run on a device.

## CAP-apps-and-install-23 Siri, Shortcuts, Spotlight and Apple Intelligence

Using the assistant through the iPhone system: Shortcuts actions, Siri phrases, Spotlight and Apple Intelligence hand-off.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (iOS): yes**
  - [https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios): On iOS 18+ users can ask Claude from Spotlight, Siri, the Share menu or any intent-aware app without opening the app; the Ask intent uses the default model and counts toward usage. Apps: ios.
- **ChatGPT (iOS, macOS): yes**
  - [https://help.openai.com/en/articles/10269382-setting-up-chatgpt-with-apple-intelligence](https://help.openai.com/en/articles/10269382-setting-up-chatgpt-with-apple-intelligence): Ask Siri to use ChatGPT, use Compose in Writing Tools, or Visual Intelligence; works without an account or with a free or paid account. Plans: None, Free, paid. Apps: ios,desktop.

**AGI requirement** (inferred; source: competitor parity). Shortcuts and Siri actions run a chat and count in usage. Apple Intelligence integration is a product choice.

**With different models, providers and the one subscription.** An intent that runs without opening the app must use the user's default mode and model, and must refuse to send to Cloud when Local is selected and no local model is ready.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: eight App Shortcuts (Ask, Summarize, Analyze Image, Transcribe, Translate, Scan and more); Ask runs without opening the app. No Writing Tools or Visual Intelligence, no Apple Intelligence extension. Desktop: no Siri integration. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S109.13, S71.23
- Comparison list ids: D98, M143, M153, MP74
- Code: `apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift:13-27`; `apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:6-11`

**Gap.** No Apple Intelligence integration. Ledger S71.23 says not applicable but shortcuts exist.

**Acceptance criteria**

1. Say Ask AGI to Siri; an answer returns without opening the app.
2. In Local mode with no model downloaded the intent says so rather than using Cloud.
3. Each shortcut appears in the Shortcuts app.

**Verification: code inspected only.** Swift intents exist; not run.

## CAP-apps-and-install-24 Phone system apps: calendar, reminders, location, messages

The assistant reads or creates calendar events and reminders, drafts messages, and uses location, with permission prompts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (iOS and Android): yes**
  - [https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps](https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps): Drafts texts and emails, reads the calendar and creates events, creates reminders, finds nearby places on a map; Team and Enterprise lack location; cannot read messages or contacts. Plans: All plans. Apps: ios.
  - [https://support.claude.com/en/articles/11869629-use-claude-with-android-apps](https://support.claude.com/en/articles/11869629-use-claude-with-android-apps): Android drafts messages, reads the calendar, sets alarms and timers; reminders exist only on iOS. Plans: All plans. Apps: android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Device location sharing with a separate precise-location toggle (catalogue row oh08:284). Plans: Free, Go, Plus, Pro. Apps: web,ios,android.

**AGI requirement** (inferred; source: competitor parity (Claude)). Each phone tool asks for the OS permission when first used, shows what will be written before it is written, and keeps data on the device unless the user sends it.

**With different models, providers and the one subscription.** Calendar or reminder content read by a tool is sent to the model only on a Cloud or BYOK turn and the label says which. In Local mode it goes to the on-device model only. Needs a model with tool use; say so when the chosen model cannot.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: Cloud chat can read the calendar or add a confirmed event, and add a confirmed reminder on iPhone. No message drafting, alarms, location, contacts or health data. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M141, M142, M148, M149, M150, MP75
- Code: apps/mobile/src/features/integrations/services/phoneDeviceStore (not found) (not found)

**Gap.** Message drafting, alarms, location and Maps, health data.

**Acceptance criteria**

1. Ask to add an event; a permission prompt and a confirmation appear before it is created.
2. Deny the permission; the app explains and does nothing.
3. In Local mode the tool is shown as unavailable or runs on device only.

**Verification: code inspected only.** Comparison rows only; the path in current.evidence is a prefix from the comparison row and I did not open it.

## CAP-apps-and-install-25 Share-sheet intake

Sharing text, links, images or files from another app opens the assistant with that content.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (iOS): partly**
  - [https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios](https://support.claude.com/en/articles/10263469-use-claude-app-intents-shortcuts-and-widgets-on-ios): The Ask intent can be used from the Share menu on iOS 18+. Apps: ios.
- **ChatGPT (dot companion): partly**
  - [https://learn.chatgpt.com/docs/dots/channels.md](https://learn.chatgpt.com/docs/dots/channels.md): Share photos or content to your dot via the iOS share sheet (catalogue row cl02:125). Apps: ios.

**AGI requirement** (inferred; source: competitor parity). Sharing from any app opens a preview that starts a chat with the shared item.

**With different models, providers and the one subscription.** The shared item goes only to the chosen model route; the preview shows the mode. In Local mode it stays on device.

**Current implementation, as this trace read it on 2026-11-24: built.** Mobile: iOS share extension and Android SEND targets for text, links, images, PDFs. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S71.09
- Comparison list ids: none matched
- Code: `apps/mobile/app.config.js:166`; `apps/mobile/native/ios/AGIShareExtension/ShareViewController.swift`

**Gap.** none known

**Acceptance criteria**

1. Share a link from Safari; AGI opens with a preview and a Start chat button.
2. Share a PDF; it attaches and the model can read it or says it cannot.

**Verification: code inspected only.** Ledger done; not run.

## CAP-apps-and-install-26 Car and in-car voice

Voice chat inside the car system (CarPlay or Android Auto).

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (iOS): yes**
  - [https://help.openai.com/en/articles/20001153-using-chatgpt-in-carplay](https://help.openai.com/en/articles/20001153-using-chatgpt-in-carplay): Voice-first ChatGPT in CarPlay on supported iPhones with iOS 26.4 or later: start a new voice chat, start one inside a project, or resume a recent chat. Plans: All plans. Apps: ios.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Not required today. If built, voice-only, minimal driver distraction, no screen content.

**With different models, providers and the one subscription.** Needs a voice-capable model route; Local mode would need local speech; say so.

**Current implementation, as this trace read it on 2026-11-24: not built.** Mobile: no CarPlay or Android Auto; ledger S109.14 says not applicable. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S109.14
- Comparison list ids: M145
- Code: `searched: CarPlay, CPTemplate in apps/mobile (per comparison M145)` (not found)

**Gap.** Not built by design or not decided.

**Acceptance criteria**

1. If built: start a voice chat from the car display with no typing.

**Verification: not verified.** Absence only.

## CAP-apps-and-install-27 Office and workspace add-ins

Installing the assistant inside another vendor's product such as Word or Google Docs.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16951679-use-claude-in-google-docs-sheets-and-slides](https://support.claude.com/en/articles/16951679-use-claude-in-google-docs-sheets-and-slides): Install from Workspace Marketplace yourself, or a super admin installs for everyone or allowlists the app; Chrome, Edge, Safari supported, not Firefox. Apps: other.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001526-chatgpt-for-word](https://help.openai.com/en/articles/20001526-chatgpt-for-word): Sidebar from Microsoft Marketplace to draft, summarize and revise; works on the open document only; separate from chat history, memory and skills. Plans: Free, Plus, Pro, Business, Enterprise, Edu. Apps: other.

**AGI requirement** (proposed; source: competitor parity). Not a stated requirement. Decide whether add-ins belong in the six-app scope.

**With different models, providers and the one subscription.** An add-in would be a cloud surface under the one subscription; no Local mode; the document text goes to the chosen route and the add-in must say so.

**Current implementation, as this trace read it on 2026-11-24: not built.** None of the six apps ships an Office or Workspace add-in; not examined in the comparison rows I read. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Outside current six-app scope.

**Acceptance criteria**

1. If built: install from the vendor marketplace and use it on the open document.

**Verification: not verified.** No source.

## CAP-apps-and-install-28 Launch at login and background behaviour

The desktop app can start at login, keep running in the background, stay awake for long tasks and react to sleep and lock.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (desktop): partly**
  - [https://learn.chatgpt.com/docs/computer-use.md](https://learn.chatgpt.com/docs/computer-use.md): Locked Use continues Computer Use after the Mac locks (a lock-state behaviour; no launch-at-login row in the catalogue). Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (desktop settings include run on startup and keep computer awake)). The user can start the app at login, see and control background activity, and long tasks survive sleep or pause with a clear message.

**With different models, providers and the one subscription.** Background work in Local mode must not send data out; background cloud work must show it is on our servers.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop: launch at login and background controls done; sleep, wake and lock handling missing (S70.32). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S70.24, S70.25, S70.32
- Comparison list ids: DP101
- Code: `apps/desktop/electron/quitGuard.ts`

**Gap.** No sleep, wake or lock handling; quit confirmation covers less than the row asks.

**Acceptance criteria**

1. Turn on start at login; reboot; the app starts hidden or visible as set.
2. Lock the screen during a task; the app pauses or continues as documented and says which.

**Verification: code inspected only.** Ledger rows only.

## CAP-apps-and-install-29 Hardware controls and macropads

A physical keyboard, button or macropad that triggers assistant actions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT desktop with Codex (Codex Micro keyboard): yes**
  - [https://learn.chatgpt.com/docs/features/codex-micro.md](https://learn.chatgpt.com/docs/features/codex-micro.md): Codex Micro keyboard with the ChatGPT desktop app: USB-C or Bluetooth, agent keys with status lights, push-to-talk microphone key (catalogue rows cl05:144 to cl05:153). Apps: desktop.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). No requirement. Hardware keys are an owner choice.

**With different models, providers and the one subscription.** Keys would trigger the same actions as shortcuts; no model dependence.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: iPhone Action Button works through the Open control; Desktop: no hardware keyboard support. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S109.11
- Comparison list ids: D101
- Code: `apps/mobile/native/ios/AGIWidgets/AGIWidgets.swift:98`

**Gap.** Desktop hardware not built; decision pending.

**Acceptance criteria**

1. If built: pairing shows the device and a key press runs the mapped action.

**Verification: not verified.** No source.

## CAP-apps-and-install-30 Local model install and storage on the device

Downloading, sizing, loading and deleting on-device models, with hardware readiness shown. AGI has this; the leaders' catalogue rows show no equivalent.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md (M-ONB-003, M-MODEL-002; fresh install with no local model shows setup guidance)). Free local inference on mobile and desktop: the app shows installed, downloadable, unavailable and runtime-offline states, lets the user download, pause, delete and load models, and shows device readiness. Fresh install with no model shows setup guidance.

**With different models, providers and the one subscription.** Runs without payment and, per owner decisions, sign-in is a separate matter. No Local prompt or file may be silently sent to BYOK or Managed Cloud (AGENTS.md section 6). Models come from the generated catalog, not from literals in the app.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile: download manager, storage manager, hardware panel, load and unload, runtime health done. Desktop: local model management marked not applicable (S70.23), though the desktop runtime has local-model code. CLI and VS Code: no model manager. No hybrid local-to-cloud approval flow (S109.23, S109.24 missing). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S109.18, S109.19, S109.20, S109.21, S109.22, S109.23, S109.24, S70.23, S71.28, S71.30
- Comparison list ids: none matched
- Code: `apps/mobile/app/(app)/settings/storage.tsx:136`; `apps/mobile/app/(app)/settings/performance.tsx:422`; `apps/mobile/app/(app)/(tabs)/chat.tsx:793`

**Gap.** Desktop local model management and explicit cloud-escalation approval are missing.

**Acceptance criteria**

1. On a fresh phone install with no model, the app offers a download and then answers a prompt offline.
2. Delete a model; storage use drops and the model shows downloadable.
3. A Local chat never sends a message to Cloud without a visible consent step.

**Verification: code inspected only.** Ledger done for mobile; not run by a person.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether the public Desktop ships for Windows and Linux, and in what order; today only Mac builds.
- Whether to offer a Stable/Latest channel (only Claude documents it) on desktop, CLI and VS Code.
- Whether to match enterprise fleet controls (MSIX, PKG, MDM keys, minimum version, in-app update switch) both leaders document for paid enterprise plans.
- Whether to build Apple Intelligence integration, CarPlay or Android Auto, and a hardware keyboard (each documented by ChatGPT only).
- Whether to read text from the front app (ChatGPT Work with Apps) and whether Claude-style background computer use is wanted.
- Whether to offer an installable web app and offline fallback; the manifest exists but the ledger marks both not applicable.
- Whether the CLI is offered through Homebrew, WinGet, apt, dnf and npm as the leaders do, or only by the signed script.
- Whether a managed Intune-style phone build and Office or Workspace add-ins are in scope.
- Whether the Android default-assistant role and Quick Settings tile are wanted.
- Whether the update check, an outside call, is allowed by default in a strict Local setup.

## Could not establish

- Whether any installer, store listing, Chrome Web Store page or CLI release is publicly live today: sources say not published, and I did not check release APIs or run anything.
- No person-seen result covers install, update or OS integration: the web scorecard and defect list cover browser chat flows only.
- The ledger and code disagree on phone widgets (S71.20, S71.21 say missing; Swift and Kotlin widget files exist), on Siri and shortcuts (S71.23) and on installable web (S69.14); I did not run any app to settle them.
- Claude Desktop Windows installer details beyond the MSIX deploy page were not opened; several catalogue rows (Quick entry screenshot, Appshots hotkeys, codex:// deep links, Codex Micro) were taken from the row text without opening the saved page.
- Whether Claude has global shortcut, menu bar, launch-at-login or default-assistant behaviour beyond Mac quick entry: the catalogue shows no row, so has is unknown.
- Minimum iOS version of the AGI phone app is unverified.
- I did not open code for the phone-system tools path; it is quoted from the comparison row.
- Whether the retained Tauri build is expected to be migrated to Electron for existing users: no source.
