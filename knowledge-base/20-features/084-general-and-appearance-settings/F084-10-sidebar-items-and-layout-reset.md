---
id: "F084-10"
type: "feature"
title: "Sidebar items and layout reset"
aliases: ["Sidebar items", "Hide sidebar items", "hiddenNavIds", "left rail", "Layout reset", "Sidebar collapse", "S84.23", "S84.24"]
area: "84 General and appearance settings"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S84.23", "S84.24"]
depends_on: ["surface:web", "surface:desktop", "file:apps/web/shared/components/layout/app-nav-items.ts", "store:agiworkforce-web-settings", "store:agi-ui-store", "table:user_settings", "api:PUT /api/settings/preferences", "SYS-shared-ui-and-design", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-10 Sidebar items and layout reset

On web and Desktop, General settings has 'Sidebar items': buttons that show or hide nine left-rail destinations (Chat cannot be hidden); the choice syncs to the account when signed in. The brief's 'collapsed by default', 'auto-hide' and 'reset layout' do not exist as controls. Mobile has no such setting.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.23](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8423), [S84.24](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8424).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person remove destinations they do not use (Projects, Library, Sites, Health, Study, Scheduled, Live artifacts, Agents, Admin) from the left rail. Sidebar collapsed state is remembered but is not a settings choice.

**Why it exists.** A shorter rail is easier to use for people who do not need every area. The brief's S84.23 asks for sidebar behaviour; S84.24 asks for a way to put the layout back to defaults.

**Who uses it.** Web and Desktop people who use only part of the product.

**Problems it solves**

- A cluttered navigation rail
- Features the person never uses taking space

**Use cases**

- A person who only chats hides Projects, Library, Sites, Health and Study.
- A person hides Admin on a personal account.
- A person returns a hidden item by pressing its name again.

## 2. User experience

**Where to find it**

- Web: Settings, General, row 'Sidebar items' with hint 'Hide anything you do not use from the left rail.' (apps/web/features/settings/sections/GeneralSection.tsx:297, 540-581).
- Desktop (Electron): the same Settings modal.
- Mobile: not offered. The phone side panel keeps its own fold state in the settings store (sidePanelMoreOpen, sidePanelProjectsFolded) with no settings row found (apps/mobile/stores/settingsStore.ts:162-163).

**Before you start**

- None to change locally; sign-in to sync to the account.

**Screens and controls**

- A group labelled 'Sidebar items' of switch-style buttons, one per hideable destination, labelled with the destination name, highlighted when visible (GeneralSection.tsx:552-578).
- Chat is not in the list.

**Journey**

1. Open Settings, then General.
2. Find Sidebar items.
3. Press an item's name to hide it; the left rail updates; press again to show it.
4. On another device, after sign-in, the same items are hidden.

**What the person sees and gets**

- The rail changes at once.
- The button shows visible (highlighted ring) or hidden (plain).
- If account sync fails, a sync status message appears (CloudSettingsSync.tsx:107-117).

**Settings**

- hiddenNavIds (web settings store)
- sidebarCollapsed (agi-ui-store, not a settings row)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The list is built from the rail's own destinations that are marked hideable; Chat is excluded at the source (GeneralSection.tsx:545-549; apps/web/shared/components/layout/app-nav-items.ts:77-80).
- Hidden ids are removed from the rail by buildAppNavItems, only for destinations marked hideable (app-nav-items.ts:229; apps/web/features/chat/pages/WebChatPage.tsx:6992-7006).
- hiddenNavIds is part of the account 'appearance' namespace and syncs both ways when signed in (CloudSettingsSync.tsx:79, 110; appearance-namespace.ts hiddenNavIds).
- Older stored data without the key is tolerated (GeneralSection.tsx:541-543).

**Incomplete**

- The list shows all nine hideable destinations, including ones the account may not be able to see (Admin only appears in the rail for workspace admins, WebChatPage.tsx:7001-7006 passes isWorkspaceAdmin) [inferred that the list is not filtered by availability, since GeneralSection filters only on hideable].

**Present but disconnected or switched off**

- useUIStore.reset exists but is a sign-out clean-up only; it is not wired to any visible control (apps/web/shared/stores/layout-store.ts:52-58, 82-100).

**Not available**

- Collapsed by default and auto-hide settings (no code found).
- Reset layout or panel sizes control on web and Desktop.
- Sidebar items on mobile, CLI, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- The user can configure sidebar behaviour (which items show, collapsed by default, auto-hide). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.23)
- The user can reset panel sizes and layout to defaults. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.24)
- Chat can never be hidden, so the person cannot lose the way back to conversations. (source: apps/web/features/settings/sections/GeneralSection.tsx:545-548 (comment) and app-nav-items.ts:77-80)
- Hidden items are saved on the device and, when signed in, to the account. (source: apps/web/features/settings/components/CloudSettingsSync.tsx:79, 110)

**Acceptance criteria**

1. Web: pressing an item name hides it from the left rail at once; pressing again restores it.
2. Web: Chat is not offered in the list and is always in the rail.
3. Reload: hidden items stay hidden.
4. Signed in on two browsers: hiding on one hides on the other after sync.
5. Sign-out and sign-in as someone else does not apply the previous person's hidden items [inferred; unverified].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A person who hides everything hideable still reaches Chat and Settings [inferred from Chat being non-hideable].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Reset layout' action that clears hiddenNavIds and sidebar collapse, using useConfirmAction.
- [proposed] Show only items the account can actually see.
- [proposed] Decide whether 'collapsed by default' and 'auto-hide' are wanted; if not, correct S84.23.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SidebarItemsRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Buttons that call setNavItemVisible (line 540). |
| config | APP_NAV_DESTINATIONS and buildAppNavItems | `apps/web/shared/components/layout/app-nav-items.ts` | Defines destinations, the hideable flag and filtering by hidden ids. |
| store | useSettingsStore.hiddenNavIds | `apps/web/shared/stores/web-settings-store.ts` | Holds and edits hidden ids (lines 62, 162-169). |
| component | WebChatPage navigation | `apps/web/features/chat/pages/WebChatPage.tsx` | Passes hiddenNavIds into the rail builder (line 6992-7006). |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Syncs hiddenNavIds. |
| service | appearance-namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | Maps hiddenNavIds in the stored namespace. |
| endpoint | /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores the namespace. |
| store | useUIStore | `apps/web/shared/stores/layout-store.ts` | Sidebar collapse and task dock; reset is sign-out only; persisted as agi-ui-store. |
| config | WebSettingsModal general pane | `apps/web/features/settings/components/WebSettingsModal.tsx` | Hosts GeneralSection (line 262). |
| store | mobile settingsStore side panel flags | `apps/mobile/stores/settingsStore.ts` | sidePanelMoreOpen and sidePanelProjectsFolded (lines 162-163); no settings row. |
| test | GeneralSection test | `apps/web/features/settings/sections/GeneralSection.test.tsx` | Covers the General pane. |
| test | CloudSettingsSync test | `apps/web/features/settings/components/__tests__/CloudSettingsSync.test.tsx` | Covers hiddenNavIds sync. |
| test | layout-store test | `apps/web/shared/stores/layout-store.test.ts` | Layout store behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses an item; setNavItemVisible adds or removes its id. | device | web-settings-store.ts:162-169; GeneralSection.tsx:560 |
| WebChatPage rebuilds the rail without hidden hideable items. | device | WebChatPage.tsx:6992-7006; app-nav-items.ts:229 |
| Store persists to localStorage. | device | web-settings-store.ts:216-219 |
| When signed in, CloudSettingsSync writes changed fields to the appearance namespace after 400 ms; on sign-in it reads the namespace and applies fields not changed locally in the meantime. | device and our servers | CloudSettingsSync.tsx:190-262 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| hiddenNavIds | localStorage 'agiworkforce-web-settings'; account table user_settings namespace appearance | Yes when signed in | Kept until changed. |
| sidebarCollapsed | localStorage 'agi-ui-store' | No | Reset on sign-out (store reset), per layout-store.ts comment. |

**Models and providers.** None.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not needed locally; needed to sync. |
| Permissions | none found in the code |
| Subscription | No plan limit was seen. Some destinations are gated elsewhere by capability or admin role, which is separate from hiding. |
| Limits and metering | none found in the code |
| Feature flags | Destination availability uses disabledFeatures, health space availability and admin role when the rail is built (WebChatPage.tsx:7001-7006); hiding is separate. |
| Model compatibility | Not model dependent. |
| Provider restrictions | None. |
| Local mode | Works with no server; only the account sync needs sign-in. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Persisted store without hiddenNavIds | Treated as empty list. | GeneralSection.tsx:541-543 |
| Unknown hidden id from account | Ignored because filtering only removes matching hideable destinations. | app-nav-items.ts:229 [inferred] |
| Sync read fails | Nothing written until a read succeeds. | CloudSettingsSync.tsx:219-226 |
| Change made while sign-in read is in flight | Local change wins for that field. | CloudSettingsSync.tsx:121-135, 190-200 (fieldsUnchangedSince) |
| Accessibility | Buttons use role switch with aria-checked and a group label; larger touch targets on narrow screens. | GeneralSection.tsx:552-565 |
| Mobile | Not handled in the code (no setting). | Searched apps/mobile/src/features/settings |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/GeneralSection.test.tsx`: General pane including sidebar items (file references hiddenNavIds).
- `apps/web/features/settings/components/__tests__/CloudSettingsSync.test.tsx`: Account sync including hiddenNavIds.
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: Namespace mapping.
- `apps/web/shared/stores/layout-store.test.ts`: Layout store.
- `apps/web/features/settings/components/__tests__/WebSettingsSearchFields.test.tsx`: Settings search fields mention sidebar items.

**Test scenarios**

- **Hide and show**
  1. Open Settings, General, Sidebar items.
  2. Press 'Library'.
  3. Look at the rail.
  4. Press 'Library' again.
  - Expected: Library leaves the rail, then returns.
- **Chat protected**
  1. Open Sidebar items and look for Chat.
  - Expected: Chat is not listed; the rail still has Chat.
- **Account sync**
  1. Signed in: hide Study.
  2. Wait one second.
  3. Open a second browser signed in as the same person.
  - Expected: Study is hidden there too.
- **Reload**
  1. Hide an item, reload.
  - Expected: Still hidden.
- **Layout reset**
  1. Search the settings for a reset layout control.
  - Expected: None found (known gap).

**Where to look when it fails**

- Sync status message 'Your settings did not reach your account.' or 'Your settings could not be synced.'
- Table user_settings, namespace appearance, field hiddenNavIds.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **No layout reset control.** Affects: Web and Desktop. Evidence: layout-store.ts:52-58 (sign-out only). Work needed: Add a confirmed action; define what 'layout' includes.
- **Collapsed by default and auto-hide are not implemented.** Affects: Web and Desktop. Evidence: No code found. Work needed: Decide if needed; update the brief.
- **Sidebar items not on mobile.** Affects: Mobile. Evidence: Brief S84.23 'mobile missing'. Work needed: Decide scope.
- **List may include items the person cannot see.** Affects: Web and Desktop non-admins. Evidence: GeneralSection.tsx:549 vs WebChatPage.tsx:7001. Work needed: Filter by availability.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- file:apps/web/shared/components/layout/app-nav-items.ts
- store:agiworkforce-web-settings
- store:agi-ui-store
- table:user_settings
- api:PUT /api/settings/preferences
- SYS-shared-ui-and-design
- SYS-sync-and-continuity

## Unknown

- Whether the settings list hides destinations the account cannot use (not traced beyond GeneralSection).
- Whether panel sizes exist anywhere that a reset would apply to (no panel size store found in the layout store).
- Whether sign-out clears hiddenNavIds.
- No test was run here.
