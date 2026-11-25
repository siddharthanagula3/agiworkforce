---
id: "F088-07"
type: "feature"
title: "Release and model-retirement notices, and migration help"
aliases: ["What's new notice", "ReleaseNotice", "Release notes", "Retired model notice", "UnavailableModelNotice", "Leaving <date> badge", "Model retirement warning", "Import memory from other AI providers", "agi migrate", "agi ecosystem", "Feature-migration assistant (S88.15)", "Release-update education (S88.13)", "Model-retirement notice (S88.14)"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S88.13", "S88.14", "S88.15"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-memory-projects-and-context", "SYS-observability-and-operations", "SYS-execution-boundaries", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "file:apps/web/shared/components/ReleaseNotice.tsx", "api:POST /api/memory/import", "table:user_memories"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-07 Release and model-retirement notices, and migration help

Three small helpers for change. After an update, the product says what is new and links to release notes. A model that is about to retire, or has retired, is flagged in the picker and in old chats. Web can import memory from another assistant after a preview; the CLI can copy Claude Code settings.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.13](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8813), [S88.14](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8814), [S88.15](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8815).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not stated on this page | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Tells people what changed in a release (web banner, mobile toast, CLI start screen and notice, desktop menu item), warns before a model they use is retired and says what the chat uses instead, and helps move data from another product: pasted memory on web, Claude Code settings in the CLI. (apps/web/shared/components/ProductNotices.tsx:8; apps/mobile/src/features/release-state/releaseUpdateNotice.ts:19; apps/web/features/chat/components/UnavailableModelNotice.tsx:11; apps/cli/src/lib.rs:960)

**Why it exists.** The brief requires users to learn what changed after an update (S88.13), to be warned before a model is retired and told its replacement (S88.14), and to be helped to move data in with a preview (S88.15). A model vanishing under a saved chat, or a silent update, would surprise people. [inferred]

**Who uses it.** Every signed-in user of web, desktop (which shows the hosted web app), mobile and CLI; people who switch from ChatGPT, Claude, Gemini or Copilot and want their memory; Claude Code users moving to the AGI CLI. (apps/web/features/settings/components/ImportMemoryDialog.tsx:34; apps/cli/src/lib.rs:549)

**Problems it solves**

- People did not know a release changed anything.
- A saved chat pointed at a model that no longer exists and the model changed without telling them.
- A new user had to retype what the old assistant knew about them.
- A CLI user had to rebuild MCP servers, instructions, skills and hooks by hand.

**Use cases**

- Web: after a new changelog entry, a banner reads "What's new: <headline>" with a "Read more" link. (apps/web/shared/components/ReleaseNotice.tsx:53)
- Web: opening an old chat whose model is gone shows "<old name> is no longer available" and says new messages use another model. (apps/web/features/chat/components/UnavailableModelNotice.tsx:26)
- Web: Settings, Memory, "Import memory from other AI providers", paste a reply, review, save. (apps/web/features/settings/sections/MemorySection.tsx:445)
- CLI: run the migrate command with the dry-run flag to see what Claude Code settings would be copied. (apps/cli/src/lib.rs:960)

## 2. User experience

**Where to find it**

- Web and Desktop window: product notice stack at the top of every app page; the release banner is one card in it. (apps/web/app/AppRuntimeMounts.tsx:28; apps/web/shared/components/ProductNotices.tsx:8)
- Web and Desktop window: model picker row shows "Leaving <date>" inside the 30-day window. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:353)
- Web and Desktop window: retired-model card above the composer of the affected chat. (apps/web/features/chat/pages/WebChatPage.tsx:1870)
- Web and Desktop window: Settings, Memory, button text "Import memory from other AI providers". (apps/web/features/settings/sections/MemorySection.tsx:445)
- Web: /changelog and /release-notes/<slug> pages. (apps/web/lib/changelog-entries.ts:111)
- Desktop: application menu item "What's New" opens the changelog page in the external browser. (apps/desktop/electron/appMenu.ts:550; apps/desktop/electron/main.ts:2267)
- Mobile: a toast "AGI Mobile updated to <version>." with a "What's new" action that opens web /release-notes in the in-app browser. (apps/mobile/src/features/release-state/releaseUpdateNotice.ts:19-34)
- Mobile: model picker row shows "Retires <date>" within 30 days; the chat screen shows a retired-model notice with "Choose a model" and "Dismiss". (apps/mobile/src/features/model-picker/components/ModelRow.tsx:85; apps/mobile/app/(app)/chat/[id].tsx:1362)
- CLI: start screen shows a one-line What's new for the running build; a notice with release-notes lines appears once per version; the model picker detail line says "deprecated, leaves <date>". (apps/cli/src/tui/tui_app.rs:2365; apps/cli/src/update_check.rs:90; apps/cli/src/tui/widgets/model_picker.rs:463)
- CLI: commands migrate (with a dry-run flag) and ecosystem scan, import, show. (apps/cli/src/lib.rs:960; apps/cli/src/lib.rs:2116)
- VS Code and Chrome extension: nothing found for release notice, retirement notice or migration. The Chrome search covered only apps/extension-vscode; the apps/extension folder was not searched for these. (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)

**Before you start**

- Web release banner and retired-model card: none beyond running the web app; state is kept in the browser. (apps/web/shared/components/ReleaseNotice.tsx:10)
- Web memory import: a signed-in account with Cloud memory, since the dialog only renders when a cloud memory controller exists. (apps/web/features/settings/components/ImportMemoryDialog.tsx:79-84)
- CLI release notice: privacy mode must not be Local, the startup check setting must be on, and the no-update-check environment variable must not be set. (apps/cli/src/update_check.rs:125-133)

**Screens and controls**

- Release card: text "What's new: <headline>", button "Read more", dismiss control. (apps/web/shared/components/ReleaseNotice.tsx:51-65)
- Retired-model card: title "<name> is no longer available", body "This chat was saved with it, so new messages will use <name>. Pick a different model below to override.", button with accessible name "Dismiss retired model notice". (apps/web/features/chat/components/UnavailableModelNotice.tsx:26-36)
- Import dialog title "Import memory from other AI providers"; "Copy prompt"; Source dropdown (ChatGPT, Claude, Gemini, Copilot, Other); "Paste memories" box; "Upload file" button (.txt, .json); preview step with per-item selection; done step. (apps/web/features/settings/components/ImportMemoryDialog.tsx:333-420)

**Journey**

1. Web release: open the app after a new changelog entry exists; the banner appears; click "Read more" (marks seen, opens the release page) or dismiss. (apps/web/shared/components/ReleaseNotice.tsx:31-65)
2. Web retirement: open a chat whose saved model is no longer selectable; the card names both models; the composer model is set to the substitute; dismiss or pick another model. (apps/web/features/chat/pages/WebChatPage.tsx:2123)
3. Web import: copy the prompt, paste it into the other assistant, paste its reply (or upload a file), choose the source, preview the list with duplicates flagged, deselect items, save. (apps/web/features/settings/components/ImportMemoryDialog.tsx:37; apps/web/app/api/memory/import/route.ts:55-171)
4. CLI migrate: run migrate with the dry-run flag, read the report, run again without the flag to copy. (apps/cli/src/lib.rs:7170-7177; apps/cli/src/ecosystem.rs:660)

**What the person sees and gets**

- Web import commit returns counts: inserted, skipped duplicates, blocked, excluded, plus the saved memories. (apps/web/app/api/memory/import/route.ts:134-170)
- CLI migrate prints a report headed "Claude Code migration dry run" in dry-run mode. (apps/cli/src/ecosystem.rs:660-664)
- Mobile toast shows only the version, not what changed; the detail is on the web page. (apps/mobile/src/features/release-state/releaseUpdateNotice.ts:17-18)

**Settings**

- CLI config field updates.check_on_startup and environment variable AGIWORKFORCE_NO_UPDATE_CHECK switch the release check off. (apps/cli/src/update_check.rs:32; apps/cli/src/update_check.rs:125-133)
- Web banner state key agi-last-seen-release in browser storage. (apps/web/shared/components/ReleaseNotice.tsx:10)
- Mobile last-seen version key agi-last-seen-app-version. (apps/mobile/src/features/release-state/releaseUpdateNotice.ts:9)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web release banner is mounted in the product notice stack from the app runtime mounts and links to /release-notes/<slug>. (apps/web/shared/components/ProductNotices.tsx:8-14; apps/web/app/AppRuntimeMounts.tsx:28)
- Web picker warns when a model's deprecation date is within 30 days (constant at line 320, check at lines 323-337) and shows "Leaving <date>" as the row guidance. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:320-353)
- Web store only carries a deprecation date that is still in the future. (apps/web/shared/stores/model-store.ts:58; apps/web/features/chat/components/Composer/ComposerFooter.tsx:312-316)
- Web chat page computes the substitution when a chat's saved model is not selectable and shows the card. (apps/web/shared/stores/model-store.ts:284-298; apps/web/features/chat/pages/WebChatPage.tsx:2123)
- Web model catalogue cards say "Retiring <date>" or "Retired <date>". (apps/web/features/models/lib/model-presentation.ts:43-54)
- Web memory import has a dry-run preview and a commit step, both on POST /api/memory/import, with CSRF check and rate limit. (apps/web/app/api/memory/import/route.ts:173-189)
- Mobile release toast, 30-day retirement label and retired-model notice exist and are mounted. (apps/mobile/app/(app)/_layout.tsx:13; apps/mobile/src/features/model-picker/components/ModelRow.tsx:85; apps/mobile/app/(app)/chat/[id].tsx:1362-1365)
- Mobile retired-model notice names the catalog replacement when one is recorded. (apps/mobile/src/features/model-picker/retirement.ts:30-42)
- CLI fetches the latest release from the web API once at start, tells the user of an available update, or shows unseen release notes once per version. (apps/cli/src/update_check.rs:26; apps/cli/src/update_check.rs:135-157)
- CLI migrate copies Claude Code MCP servers, instructions, commands, skills, agents, hooks and settings, and supports dry run. (apps/cli/src/ecosystem.rs:561-660; apps/cli/src/lib.rs:960-967)
- Desktop menu item "What's New" opens the changelog. (apps/desktop/electron/appMenu.ts:550)

**Incomplete**

- Web substitution uses the default selectable model, not a catalog-recorded replacement, so the card says "new messages will use <default>". Mobile uses the recorded replacement. (apps/web/shared/stores/model-store.ts:266-270; apps/mobile/src/features/model-picker/retirement.ts:30-42)
- CLI ecosystem import writes MCP servers with no preview (dry_run passed as false); only migrate has a dry run. (apps/cli/src/lib.rs:7116-7123; apps/cli/src/lib.rs:960-967)
- CLI picker shows the deprecation date whenever it exists, with no 30-day window. (apps/cli/src/tui/widgets/model_picker.rs:462-464)
- Mobile toast does not say what changed. (apps/mobile/src/features/release-state/releaseUpdateNotice.ts:17-18)

**Present but disconnected or switched off**

- CLI release check is off in Local privacy mode, when updates.check_on_startup is false, or when AGIWORKFORCE_NO_UPDATE_CHECK is set. (apps/cli/src/update_check.rs:125-133)
- Web release banner records the latest release as seen on a first visit and shows nothing. (apps/web/shared/components/ReleaseNotice.tsx:35-38)

**Not available**

- Release notice, retirement notice and migration helper: not found on VS Code (searched apps/extension-vscode). (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)
- Chrome extension: not established; the apps/extension folder was not searched for these. unknown
- Mobile import or migration helper: none established in this review. unknown
- Import from anything but pasted text or a file (no account-to-account move, no chat history import). (apps/web/app/api/memory/import/route.ts:55-75)

## 4. Required behaviour

**Established requirements**

- After an update users learn what changed from inside the product. (source: S88.13 brief Should line)
- Users are warned before a model they use is retired and told what replaces it when it is. (source: S88.14 brief Should line)
- An assistant helps users move data and settings from another product or a replaced feature, with a preview before changes. (source: S88.15 brief Should line)
- The picker warns 30 days before a scheduled retirement. (source: apps/web/features/chat/components/Composer/ComposerFooter.tsx:320)
- Release and retirement notices must be checked for every app, and a bug found on one surface is searched on the others. (source: doc: docs/product/requirements.md (release notes and changelog updated at line 1688); owner memory bug-sweep rule)

**Acceptance criteria**

1. With a changelog entry newer than the stored last-seen date, the web banner shows its headline and "Read more" opens /release-notes/<slug> and clears the banner.
2. A model whose deprecation date is 10 days away shows "Leaving <date>" in the web picker; one 60 days away shows nothing.
3. Opening a chat whose saved model is not selectable shows the card with both names, sets the composer to the substitute, and "Dismiss retired model notice" hides it.
4. Pasting memory text and choosing preview writes nothing; only the commit step saves, and duplicates of existing memories are flagged.
5. agi migrate with the dry-run flag changes no file and prints a dry-run report.
6. The CLI shows no release check traffic in Local privacy mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The web substitute should be the catalog's recorded replacement when one exists, as on mobile. [inferred]
- Every app that lets people pick a model should warn inside the 30-day window. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the web card use the recorded replacement, then the default.
- [proposed] Give ecosystem import a dry-run flag and a preview like migrate.
- [proposed] Add a one-line summary to the mobile toast.
- [proposed] Add a test for the web release banner.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ProductNotices | `apps/web/shared/components/ProductNotices.tsx` | Notice stack that holds the release banner. |
| component | ReleaseNotice | `apps/web/shared/components/ReleaseNotice.tsx` | Shows the newest unseen release and records it as seen. |
| config | RELEASES | `apps/web/lib/changelog-entries.ts` | Release entries (date, headline, body) and releasePath. |
| component | UnavailableModelNotice | `apps/web/features/chat/components/UnavailableModelNotice.tsx` | Retired-model card. |
| store | model-store resolve and describe substitution | `apps/web/shared/stores/model-store.ts` | Decides the substitute model and builds the notice data. |
| component | ComposerFooter deprecation warning | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | 30-day Leaving label in the picker. |
| service | retirementLabel | `apps/web/features/models/lib/model-presentation.ts` | Retiring or Retired date text on catalogue cards. |
| component | ImportMemoryDialog | `apps/web/features/settings/components/ImportMemoryDialog.tsx` | Compose, preview and done steps of the memory import. |
| endpoint | POST /api/memory/import | `apps/web/app/api/memory/import/route.ts` | Dry-run preview and commit of imported memories. |
| command | agi migrate and agi ecosystem | `apps/cli/src/lib.rs` | CLI commands for migration and ecosystem scan and import. |
| service | ecosystem migration | `apps/cli/src/ecosystem.rs` | migrate_claude_code, report formatting and copy helpers. |
| service | update_check | `apps/cli/src/update_check.rs` | Release fetch, update verdict, unseen release notes, startup check gate. |
| component | CLI start screen What's new | `apps/cli/src/tui/tui_app.rs` | One-line summary for the running build. |
| component | CLI model picker detail | `apps/cli/src/tui/widgets/model_picker.rs` | Shows deprecated, leaves <date>. |
| hook | useReleaseUpdateNotice | `apps/mobile/src/features/release-state/releaseUpdateNotice.ts` | Mobile update toast. |
| service | mobile retirement helpers | `apps/mobile/src/features/model-picker/retirement.ts` | Retires <date> label and retired-model notice text. |
| component | mobile ModelRow | `apps/mobile/src/features/model-picker/components/ModelRow.tsx` | Shows the retirement label in the picker. |
| command | openWhatsNew | `apps/desktop/electron/main.ts` | Opens /changelog from the desktop menu. |
| endpoint | GET /api/releases/cli/latest | `apps/web/app/api/releases/cli/latest` | Release data the CLI reads. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the banner component reads the last-seen date from browser storage, compares it with the newest release entry bundled in the web build, and shows the card if newer. | device | apps/web/shared/components/ReleaseNotice.tsx:31-40 |
| Web: the picker decides the Leaving label from the model's deprecation date and the current clock. | device | apps/web/features/chat/components/Composer/ComposerFooter.tsx:323-337 |
| Web: opening a chat compares its saved model with the selectable catalog and builds the substitution. | device | apps/web/features/chat/pages/WebChatPage.tsx:2123; apps/web/shared/stores/model-store.ts:284-298 |
| Web import: dry-run parses the text on our server, flags duplicates against the user's live memories, writes nothing. | our servers | apps/web/app/api/memory/import/route.ts:55-90 |
| Web import: commit filters excluded subjects, applies memory write policy, then inserts and reports counts. | our servers | apps/web/app/api/memory/import/route.ts:107-171 |
| Web import: the user sends the prompt to the other assistant and pastes the answer; that step is outside our product. | outside service | apps/web/features/settings/components/ImportMemoryDialog.tsx:37-40 |
| Mobile: compares the stored version with the app version on start and shows a toast; the What's new action opens a web page. | device | apps/mobile/src/features/release-state/releaseUpdateNotice.ts:19-34 |
| CLI: background task fetches the latest release from our servers, stores it in memory, and either pushes an update notice or the unseen notes and writes release-notes-seen. | device and our servers | apps/cli/src/update_check.rs:135-157; apps/cli/src/update_check.rs:90-109 |
| CLI migrate reads files under the home Claude folder and writes into the AGI config folder. | device | apps/cli/src/ecosystem.rs:561-600 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Last-seen release date | Browser localStorage key agi-last-seen-release (apps/web/shared/components/ReleaseNotice.tsx:10) | No; per browser | Until site data is cleared |
| Mobile last-seen app version | Device storage key agi-last-seen-app-version (apps/mobile/src/features/release-state/releaseUpdateNotice.ts:9) | No | Until app data is cleared |
| CLI release-notes-seen file holding a version | CLI config directory (apps/cli/src/update_check.rs:63; apps/cli/src/update_check.rs:96-107) | No | Overwritten each new version |
| Imported memories with a source value for the chosen assistant | Table user_memories (apps/web/app/api/memory/import/route.ts:44-48) | Cloud account data | Under memory settings and the account deletion path; exact retention unknown |
| Dry-run preview text | Request memory only; not stored (apps/web/app/api/memory/import/route.ts:55-90) | No | Discarded after the response |

**Models and providers.** The notices read the model catalog (deprecation dates, retired records, replacedBy) that SYS-model-catalog-and-routing owns. No model call is made. The import only parses pasted text; the other assistant is used by the person outside our product. (apps/web/shared/stores/model-store.ts:58; packages/contracts/types/src/model-catalog.ts:1481)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web release banner and retired-model card need no sign-in check in their own code. Memory import needs an account because it uses a user-scoped database. (apps/web/app/api/memory/import/route.ts:76; apps/web/shared/components/ReleaseNotice.tsx:28-40) |
| Permissions | Import is user-scoped and writes into the active workspace the user is in; dedupe reads only that workspace. (apps/web/app/api/memory/import/route.ts:42-52) |
| Subscription | none found in the code for the notices or the import route. |
| Limits and metering | Import uses the chat-conversation rate limit bucket and a maximum item count per commit (MAX_IMPORT_ITEMS). No usage metering found. (apps/web/app/api/memory/import/route.ts:107-120; apps/web/app/api/memory/import/route.ts:176-177) |
| Feature flags | CLI: updates.check_on_startup and AGIWORKFORCE_NO_UPDATE_CHECK. Web and mobile: none found. (apps/cli/src/update_check.rs:32) |
| Model compatibility | Retirement notices depend on catalog fields on each model (deprecation date, retired record). Models with no date show no warning. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:324) |
| Provider restrictions | none found in the code. |
| Local mode | CLI: the release check does not run when the privacy mode is Local. (apps/cli/src/update_check.rs:125-128) Mobile: the toast and retirement labels use only on-device data plus a link that needs network [inferred]. Web import needs the Cloud account; there is no Local import. (apps/web/features/settings/components/ImportMemoryDialog.tsx:79-84) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| First web visit | Latest release is marked seen and no banner appears. | apps/web/shared/components/ReleaseNotice.tsx:35-38 |
| Browser storage blocked | Reads return null and writes are skipped silently. | apps/web/shared/components/ReleaseNotice.tsx:12-26 |
| Model date already passed | The picker drops the model; no Leaving label. | apps/web/features/chat/components/Composer/ComposerFooter.tsx:312-316; apps/web/features/chat/components/Composer/ComposerFooter.tsx:327 |
| Unparseable date | No warning is shown. | apps/web/features/chat/components/Composer/ComposerFooter.tsx:325-326 |
| Import preview or commit fails | Dialog keeps previewError and commitError state and the user can retry; Escape and outside click are blocked while committing. | apps/web/features/settings/components/ImportMemoryDialog.tsx:110-125; apps/web/features/settings/components/ImportMemoryDialog.tsx:325-330 |
| Import too large or empty | Server returns a validation error; the item cap also applies on commit. | apps/web/app/api/memory/import/route.ts:55-75; apps/web/app/api/memory/import/route.ts:107-120 |
| Mobile first install | No toast because there is no previous version. | apps/mobile/src/features/release-state/releaseUpdateNotice.ts:15-18 |
| CLI release fetch fails | The task returns silently; no notice. | apps/cli/src/update_check.rs:139-142 |
| CLI running version not equal to published | What's new line is only shown for the running build's own version. | apps/cli/src/tui/tui_app.rs:2372-2376 |
| Accessibility | Retired card has role status, aria-live polite and a labelled dismiss button. | apps/web/features/chat/components/UnavailableModelNotice.tsx:16-17 |
| Offline or reconnect on web | not handled in the code for the release banner; it uses only bundled data. | apps/web/shared/components/ReleaseNotice.tsx:28-40 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/stores/model-store.deprecation-warning.test.ts`: Future deprecation date reaches the model; past date drops it.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.deprecation-warning.test.tsx`: No badge, badge inside window, no badge outside window.
- `apps/web/features/chat/pages/__tests__/WebChatPage.retired-model.test.tsx`: Notice appears for a retired saved model and stays quiet for a selectable one.
- `apps/web/features/models/__tests__/ModelCard.retirement.test.tsx`: retirementLabel text.
- `apps/web/app/api/memory/import/__tests__/route.test.ts`: Duplicate flagging, dry run writes nothing, commit counts, workspace expiry, validation errors.
- `apps/web/features/settings/components/__tests__/ImportMemoryDialog.prompt.test.tsx`: Prompt copy behaviour of the dialog.
- `apps/web/features/settings/components/__tests__/ImportMemoryDialog.deselect.test.tsx`: Deselecting items in the preview.
- `apps/web/features/settings/components/__tests__/ImportMemoryDialog.excluded.test.tsx`: Excluded items in the import dialog.
- `apps/web/shared/components/__tests__/ProductNoticeHost.test.tsx`: Notice band placement (not the release card itself).
- `apps/mobile/src/features/model-picker/__tests__/retirement.test.ts`: 30-day window and retired-chat notice text.
- `apps/mobile/src/features/release-state/__tests__/release-update-notice.test.ts`: Mobile update notice logic.
- `apps/cli/src/ecosystem.rs`: Inline tests at lines 1859 and 1917 for migrate import and dry run writes nothing.
- `apps/cli/src/tui/tui_app.rs`: Inline test near line 13498 for the one-line What's new.
- `apps/web/app/api/releases/__tests__/cli-release-route.test.ts`: CLI release route.

**Test scenarios**

- **Web release banner**
  1. Clear the agi-last-seen-release key
  2. Load the app once
  3. Set the key to a date older than the newest entry
  4. Reload
  - Expected: First load shows nothing; second shows "What's new" with Read more, which opens the release page and hides the card.
- **Picker warning window**
  1. Use a catalog model with a deprecation date 10 days away
  2. Open the web model picker
  - Expected: Row guidance reads Leaving plus the date; a date 45 days away shows none.
- **Retired chat**
  1. Open a chat saved with a model removed from the selectable list
  2. Click Dismiss retired model notice
  - Expected: Card names both models, composer uses the substitute, dismiss hides it.
- **Memory import preview**
  1. Open Settings, Memory, Import memory from other AI providers
  2. Paste three lines, one duplicate
  3. Preview
  4. Deselect one
  5. Save
  - Expected: Nothing saved before Save; duplicate flagged; saved counts match.
- **CLI migrate dry run**
  1. Create a home .claude folder with an MCP file
  2. Run migrate with the dry-run flag
  3. Check the AGI config folder
  - Expected: Report lists what would be copied; no file changed.
- **CLI Local mode**
  1. Start the CLI in Local privacy mode
  2. Watch network
  - Expected: No release fetch happens.

**Where to look when it fails**

- Web: browser storage keys agi-last-seen-release; data-testid unavailable-model-notice with data-requested-model and data-resolved-model attributes. (apps/web/features/chat/components/UnavailableModelNotice.tsx:18-20)
- Server: logger error text "Failed to import memories". (apps/web/app/api/memory/import/route.ts:150-152)
- CLI: tracing debug line "[update_check] could not record the release notes as seen". (apps/cli/src/update_check.rs:104-106)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)
- Mobile: [70-qa/test-plans/mobile/088-support-trust-and-policy-product.md](../../70-qa/test-plans/mobile/088-support-trust-and-policy-product.md)
- CLI: [70-qa/test-plans/cli/088-support-trust-and-policy-product.md](../../70-qa/test-plans/cli/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **Web retired-chat card names the default model, not the recorded replacement.** Affects: Web and the Desktop window. Evidence: apps/web/shared/stores/model-store.ts:266-270 versus apps/mobile/src/features/model-picker/retirement.ts:30-42. Work needed: Resolve to the catalog replacement before the default and keep the card text.
- **The brief marks mobile release and retirement notices as missing, but code exists and is mounted.** Affects: Knowledge base accuracy. Evidence: apps/mobile/app/(app)/_layout.tsx:13; apps/mobile/app/(app)/chat/[id].tsx:1362. Work needed: Correct the brief status; verify on a device.
- **CLI ecosystem import has no preview.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:7116-7123. Work needed: Add dry-run and a preview before writing, as migrate has.
- **CLI model picker has no 30-day window, and the brief cites lines that do not show this logic.** Affects: CLI users. Evidence: apps/cli/src/tui/widgets/model_picker.rs:462-464. Work needed: Decide whether to match the 30-day rule.
- **Release banner has no test and new users never see a banner.** Affects: Web. Evidence: No test file contains agi-last-seen-release (search of apps and packages). Work needed: Add a component test for first visit, unseen and dismiss.
- **No release notice, retirement notice or migration on VS Code; Chrome unestablished.** Affects: VS Code, Chrome extension. Evidence: doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md. Work needed: Decide surface scope, then build or mark n/a.
- **Import covers memory text only; no settings or chat-history move for web.** Affects: Users switching from another assistant. Evidence: apps/web/app/api/memory/import/route.ts:55-75. Work needed: Product decision on what else to import.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-memory-projects-and-context
- SYS-observability-and-operations
- SYS-execution-boundaries
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- file:apps/web/shared/components/ReleaseNotice.tsx
- api:POST /api/memory/import
- table:user_memories

## Unknown

- Whether any catalog model has a deprecation date in the future today (the catalog has dated entries, their dates were not compared with the current day).
- Whether VS Code or the Chrome extension have any release or retirement notice outside the files searched.
- Retention of imported memories beyond the general memory rules.
- Whether the CLI warns when a resumed session's model was retired.
- Exact Desktop window behaviour of the web banner (inferred from the hosted web app).
