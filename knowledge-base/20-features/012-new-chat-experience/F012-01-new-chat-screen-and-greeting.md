---
id: "F012-01"
type: "feature"
title: "New chat screen and greeting"
aliases: ["Empty chat", "New chat canvas", "Home greeting", "Branded greeting", "GreetingBanner", "ChatEmptyState", "Start screen (CLI)", "sp-empty-greeting (Chrome)", "Start a conversation (VS Code)"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (2 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S12.01", "S12.02", "S12.03"]
depends_on: ["SYS-authentication-and-identity", "SYS-shared-ui-and-design", "SYS-memory-projects-and-context", "SYS-execution-boundaries", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "file:packages/platform/utils/src/greeting.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-01 New chat screen and greeting

The screen a person sees when a new chat opens: no messages, a ready composer and, on Web, Mobile, Desktop and the signed-in Chrome panel, a time-of-day greeting that uses the person's first name when one is known and not opted out. CLI shows a welcome panel instead. VS Code shows a neutral heading.

Area: [12. New-chat experience](README.md). Requirement items: [S12.01](../../10-requirements/capabilities/012-new-chat-experience.md#s1201), [S12.02](../../10-requirements/capabilities/012-new-chat-experience.md#s1202), [S12.03](../../10-requirements/capabilities/012-new-chat-experience.md#s1203).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (2 of 3) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows an empty conversation with a ready composer. On Web, Desktop (hosted web), Mobile and the signed-in Chrome side panel it adds a greeting that changes with the time of day and may include the person's first name. CLI shows a start panel with version, model, mode and folder. VS Code shows 'Start a conversation'.

**Why it exists.** A new chat needs a calm, obvious starting point. A short personal greeting makes the product feel owned by the person, and a neutral fallback protects people who do not want their name shown (doc: AGENTS.md section 6 on minimum data; brief S12.01-S12.03).

**Who uses it.** Every signed-in person starting a chat on any of the six apps; signed-out Chrome users see the mark only.

**Problems it solves**

- The person knows the app is ready and where to type.
- A name appears only when it is known and allowed; clearing the preferred name removes it.
- Organisation members see which workspace a new chat will belong to (Web).

**Use cases**

- Open the web chat page and read 'Good morning, <first name>' above a composer whose placeholder reads 'How can I help you today?'.
- Clear the preferred name in settings and see the neutral greeting on the next new chat.
- Open the CLI and read the model, access mode, folder and recent sessions before typing.
- Open the mobile Chat tab in Local mode and see a greeting built only from local personalization settings.

## 2. User experience

**Where to find it**

- Web: /chat new chat page, empty state of the chat (apps/web/app/chat/page.tsx:12; apps/web/features/chat/pages/WebChatPage.tsx:7646).
- Desktop (public Electron app): same web page, because the window loads the hosted app origin plus the new-chat route (apps/desktop/electron/main.ts:1065).
- Mobile: Chat tab empty state (apps/mobile/src/features/chat/components/ChatEmptyState.tsx:59).
- CLI: start panel shown while there are no messages: 'Welcome to AGI' (apps/cli/src/tui/tui_app.rs:2773).
- VS Code: sidebar chat empty state 'Start a conversation' / 'Ask about your code or describe a change.' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:172).
- Chrome: side panel empty state greeting, shown when signed in (apps/extension/src/side_panel.ts:5867).

**Before you start**

- Name in the greeting needs a signed-in account with a known name.
- Web waits for nothing before painting; the name can appear after the account loads [inferred from useGreeting.ts:68 and GreetingBanner.tsx:14 not using nameResolved].

**Screens and controls**

- Web: greeting headline, optional line 'Workspace: <name>' for organisation accounts, composer with placeholder 'How can I help you today?'.
- Web Work mode swaps the headline for the Work home headline (GreetingBanner.tsx:15).
- Mobile: headline at title size; under it the line 'How can I help you?' only when no name is known (ChatEmptyState.tsx:139-154); optional 'Pair your desktop?' banner with a dismiss control when the companion feature is on (ChatEmptyState.tsx:19,53).
- CLI: lines Welcome to AGI vX, Model, access-mode chip, Folder, Recent activity, What's new, key hints (tui_app.rs:2773-2860).
- Chrome: heading in the empty state; the brand mark is hidden while the greeting shows (side_panel.ts:5867-5877).

**Journey**

1. Open a new chat on the app.
2. The app shows an empty conversation and a composer that is ready to type in.
3. The greeting picks a time band from the device clock and a wording variant from the day of the month (packages/platform/utils/src/greeting.ts:88).
4. If a first name is known and not opted out, it is added to the greeting.
5. The person types in the composer; the greeting disappears once messages exist.

**What the person sees and gets**

- A one-line greeting such as 'Good morning, Ada' or 'Good morning'.
- Web composer placeholder 'How can I help you today?' (packages/ui/i18n/locales/en/chat.json:60).
- Mobile helper line 'How can I help you?' when no name is shown.

**Settings**

- Web: general settings preferred name; an empty value opts out of the name (apps/web/features/chat/components/GreetingBanner/useNameOptedOut.ts:11-14).
- Mobile: personalization nickname, full name and a name-opted-out flag, separately for Local and Cloud settings (apps/mobile/src/features/chat/hooks/useGreetingName.ts:48-71; apps/mobile/services/cloudSettingsMapping.ts:228).
- Chrome: reads the same opt-out through the account summary (apps/extension/src/features/cloud-bridge/capabilityDocument.ts:76).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web greeting with time bands, name from preferred name then account name, and neutral fallback (apps/web/features/chat/components/GreetingBanner/useGreeting.ts:34-70).
- Web opt-out: a cleared preferred name hides the name (useNameOptedOut.ts:11-14,24) and a live save event updates it.
- Web workspace line for organisation accounts (NewChatWorkspace.tsx:14-22).
- Mobile greeting from nickname, full name or Clerk name, with placeholder names and handles rejected (useGreetingName.ts:14-23,64-71).
- Mobile mapping from the web preferred-name setting to nickname and opt-out flag (cloudSettingsMapping.ts:228).
- Chrome signed-in greeting with opt-out (side_panel.ts:5867-5877; capabilityDocument.ts:76) - the brief calls this unfinished, the code says otherwise.
- CLI start panel (tui_app.rs:2773-2860) and VS Code neutral heading (webviewContent.ts:172).
- Desktop (Electron) shows the hosted web page (main.ts:1065-1066).

**Incomplete**

- Web: the no-flash rule is not wired to the new-chat greeting. useGreeting returns nameResolved (useGreeting.ts:68) but GreetingBanner reads only headline (GreetingBanner.tsx:14); the only consumer found is the Code page (apps/web/features/code/CloudCodePage.tsx:461).
- Web: useNameOptedOut starts false (useNameOptedOut.ts:18), so a named greeting can show briefly for an opted-out person until the stored preference loads [inferred].
- CLI: no greeting by name; VS Code: no time-of-day greeting (tui_app.rs:2773; webviewContent.ts:172).

**Present but disconnected or switched off**

- Tauri desktop code (apps/desktop/src/features/v3/EmptyChat.tsx) greets with user?.name and has no opt-out check in that file; AGENTS.md section 5 says that code never reaches the Electron window and is retained internal code (doc: AGENTS.md).

**Not available**

- Greeting by name on CLI and VS Code.
- Greeting for signed-out Chrome users: the mark only (side_panel.ts:5871-5876).
- Decision record 2026-11-13 lists 'a greeting with the user's name on the home screen' under Not built for the mobile parity pass, yet Mobile code greets by name (doc: docs/decisions/2026-11-13-founder-decisions.md; apps/mobile/src/features/chat/components/ChatEmptyState.tsx:29,59). Which one governs is unknown.

## 4. Required behaviour

**Established requirements**

- Opening a new chat shows an empty conversation area with a ready composer. (source: brief S12.01)
- The new-chat screen greets the signed-in user by preferred name when known. (source: brief S12.02)
- When personalization is off or no name is known the greeting is neutral and shows no personal details. (source: brief S12.03)
- Chrome: add a greeting to the empty side panel (brief marks it unfinished). (source: brief S12.03 Unfinished)
- A mobile empty chat shows the logo symbol, the greeting and the composer, and nothing that explains or suggests, except a Local model download prompt and the workspace line. (source: doc: docs/decisions/2026-11-10-founder-decisions.md (D-2026-11-10-01))
- Failure to read the stored preference leaves the name opt-out off. (source: apps/web/features/chat/components/GreetingBanner/useNameOptedOut.ts:26)

**Acceptance criteria**

1. With a preferred name 'Ada' saved, the web new chat greeting contains 'Ada'.
2. After clearing the preferred name in web general settings, the web greeting has no name, without a reload.
3. With no name known, the mobile screen shows the neutral greeting and the line 'How can I help you?'.
4. In mobile Local mode, only local nickname or full name is used; Clerk and server profile names are not (useGreetingName.ts:71).
5. Signed-in Chrome side panel shows a greeting and hides the mark; signed-out shows the mark and no greeting.
6. Greeting wording follows the time band: 5:00 gives an early-morning variant, 13:00 an afternoon variant, 22:00 an evening/night variant.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The named greeting should never show for an opted-out person, even briefly [inferred from AGENTS.md section 6 on collecting the minimum].
- Web should hold the greeting until the account has loaded, as the unused nameResolved field intends [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make GreetingBanner use nameResolved (or an opted-out loading state) so the headline never changes after first paint.
- [proposed] Add the opt-out check to the retained Tauri EmptyChat or delete that path.
- [proposed] Settle the 2026-11-13 decision versus Mobile code and record the answer in docs/decisions.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | WebChatRoot | `apps/web/features/chat/components/WebChatRoot.tsx` | Mounts the web chat page and applies new-chat deep links. |
| screen | Web /chat route | `apps/web/app/chat/page.tsx` | Server page; passes initial Work mode when the request path is the Work path. |
| screen | WebChatPage empty state | `apps/web/features/chat/pages/WebChatPage.tsx` | Renders GreetingBanner and the empty-state composer when the chat has no messages. |
| component | GreetingBanner | `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx` | Shows the headline and optional workspace line. |
| hook | useGreeting | `apps/web/features/chat/components/GreetingBanner/useGreeting.ts` | Chooses name, time band and wording, including a localized branch. |
| hook | useNameOptedOut | `apps/web/features/chat/components/GreetingBanner/useNameOptedOut.ts` | Reads the stored general preferences and listens for saves to detect a cleared preferred name. |
| component | NewChatWorkspace | `apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx` | Shows 'Workspace: <name>' for organisation accounts. |
| service | greeting helpers | `packages/platform/utils/src/greeting.ts` | Time bands, wording variants, first-name cleaning, resolveGreetingHeadline shared by Web, Mobile, Chrome and Tauri. |
| component | BrandedGreeting | `packages/ui/unified-chat/src/components/BrandedGreeting.tsx` | Shared greeting component taking a headline or a user name. |
| config | chat placeholder text | `packages/ui/i18n/locales/en/chat.json` | placeholderEmpty = 'How can I help you today?'. |
| component | ChatEmptyState (mobile) | `apps/mobile/src/features/chat/components/ChatEmptyState.tsx` | Mobile greeting, helper line, pairing banner. |
| hook | useGreetingName (mobile) | `apps/mobile/src/features/chat/hooks/useGreetingName.ts` | Picks the display name by mode and opt-out. |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps web general preferences to mobile nickname and nameOptedOut. |
| screen | CLI start view | `apps/cli/src/tui/tui_app.rs` | Start panel with version, model, mode, folder, recent sessions (render_chat, StartPanel). |
| component | VS Code empty state | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | 'Start a conversation' heading and copy. |
| component | Chrome renderEmptyGreeting | `apps/extension/src/side_panel.ts` | Fills the side-panel greeting for signed-in users. |
| service | Chrome account summary | `apps/extension/src/features/cloud-bridge/capabilityDocument.ts` | Supplies greetingName, null when the opt-out is set. |
| component | Tauri EmptyChat | `apps/desktop/src/features/v3/EmptyChat.tsx` | Retained internal desktop empty state with greeting and starters. |
| config | Electron window URL | `apps/desktop/electron/main.ts` | windowUrlFor loads the hosted origin plus the new-chat route. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web page loads in the browser or Electron window; the Electron window loads the hosted app origin. | device | apps/desktop/electron/main.ts:1065-1066 |
| Greeting hook computes time band from the device clock and picks wording by day of month. | device | apps/web/features/chat/components/GreetingBanner/useGreeting.ts:42-47 |
| Account name comes from the signed-in account state held by the web app (the account endpoint is behind the stores; exact endpoint not opened). | our servers | apps/web/features/chat/components/GreetingBanner/useGreeting.ts:29-39 |
| Opt-out check reads the stored 'general' preference namespace and listens for a save event. | device and our servers | apps/web/features/chat/components/GreetingBanner/useNameOptedOut.ts:20-34 |
| Mobile builds the name from local or cloud personalization stores, loading a cloud profile only in Cloud mode with a signed-in account. | device and our servers | apps/mobile/src/features/chat/hooks/useGreetingName.ts:48-71 |
| CLI reads the three latest sessions for the current folder from the local session store on a background thread. | device | apps/cli/src/tui/tui_app.rs:2247-2300 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Preferred name and opt-out | Account preferences on our servers (web general namespace); mobile settings stores on device | Web and Mobile cloud settings map to each other (cloudSettingsMapping.ts:228); exact endpoint unknown | unknown |

**Models and providers.** None. The greeting is built from code, not from a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Name needs a signed-in account. Web and Mobile Local mode can still show a locally saved nickname (useGreetingName.ts:71). Chrome greets only when signed in (side_panel.ts:5871). |
| Permissions | none found in the code |
| Subscription | none found in the code; the greeting is not gated by a plan. |
| Limits and metering | none found in the code |
| Feature flags | Mobile pairing banner depends on the companion feature flag (ChatEmptyState.tsx:44). |
| Model compatibility | not applicable; no model is used. |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local mode greets from local nickname or full name only and never calls the cloud profile (useGreetingName.ts:48-71). CLI Local shows the 'on-device & private' chip (tui_app.rs:2761). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Account still loading (web) | Greeting renders without a name first and may add the name once loaded; nameResolved exists but the banner does not use it. | useGreeting.ts:68; GreetingBanner.tsx:14 |
| Preference read fails (web) | Error is swallowed; opt-out stays off, so the name can show. | useNameOptedOut.ts:26 |
| Non-English language (web) | Localized greeting strings with a named variant, default English text as fallback. | useGreeting.ts:50-60 |
| Placeholder or handle-like name (mobile) | Name 'user' and names equal to the email prefix or username are dropped. | useGreetingName.ts:14-23 |
| Organisation account in personal scope (web) | Line shows 'Workspace: Personal'. | NewChatWorkspace.tsx:22 |
| Signed out (Chrome) | Greeting hidden; mark shown. | side_panel.ts:5871-5876 |
| Offline, retry, timeout | not handled in the code for the greeting itself. | not found in the files read |
| Accessibility | Mobile greeting uses reduced-motion aware fade; no extra labels found for the greeting text. | ChatEmptyState.tsx:60-100 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/GreetingBanner/useGreeting.test.ts`: Time-band boundaries and use of the canonical account preferred name on first render.
- `apps/web/features/chat/components/__tests__/GreetingBanner.agiWork.test.tsx`: Work-mode headline in the banner (name suggests it; body not opened).
- `packages/platform/utils/src/__tests__/greeting.test.ts`: Band grouping, variant rotation, named template, first-token and length rules, control-character stripping.
- `apps/mobile/src/features/chat/hooks/__tests__/useGreetingName.test.tsx`: Mobile name selection (body not opened).
- `apps/desktop/src/features/v3/__tests__/Gap195205255EmptyChat.test.tsx`: Tauri EmptyChat (body not opened).

**Test scenarios**

- **Named greeting on web**
  1. Sign in with an account whose preferred name is Ada.
  2. Open /chat.
  3. Read the headline.
  - Expected: Headline matches the current time band and ends with ', Ada'.
- **Opt out**
  1. Open general settings and clear the preferred name; save.
  2. Return to /chat new chat.
  - Expected: Headline has no name; no reload needed.
- **Flash check**
  1. Sign in; throttle the network.
  2. Hard reload /chat and watch the headline.
  - Expected: Record whether the headline changes after first paint; the code suggests it can.
- **Mobile Local mode**
  1. Switch Chat to Local.
  2. Set nickname in local personalization.
  3. Open a new chat.
  - Expected: Greeting uses the nickname; no cloud profile request.
- **Chrome signed in and out**
  1. Open the side panel signed out.
  2. Sign in.
  - Expected: Mark first, then a greeting with the mark hidden.

**Where to look when it fails**

- Web: browser console for failed preference fetch (swallowed silently, so look at network).
- Mobile: useCloudProfileStore load state.
- CLI: no recent rows means the session store read returned empty or failed (tui_app.rs:2289-2300).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)
- VS Code: [70-qa/test-plans/vscode/012-new-chat-experience.md](../../70-qa/test-plans/vscode/012-new-chat-experience.md)
- Chrome: [70-qa/test-plans/chrome/012-new-chat-experience.md](../../70-qa/test-plans/chrome/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **No-flash rule not applied on the web new-chat screen** Affects: Web and Desktop (Electron). Evidence: useGreeting.ts:68 returns nameResolved; GreetingBanner.tsx:14 ignores it; only CloudCodePage.tsx:461 uses it. Work needed: Use nameResolved and an opted-out loading state in GreetingBanner, with a test.
- **Opt-out could flash a name** Affects: Web, Desktop. Evidence: useNameOptedOut.ts:18 starts false. Work needed: Treat unknown as hidden until the preference loads.
- **No name greeting on CLI and no time greeting on VS Code** Affects: CLI, VS Code. Evidence: tui_app.rs:2773; webviewContent.ts:172. Work needed: Decide whether these surfaces should greet and add it, or record the deviation.
- **Brief and decisions disagree with code** Affects: Mobile, Chrome. Evidence: 2026-11-13 decision says mobile name greeting not built; ChatEmptyState.tsx:59 builds one; brief says Chrome greeting missing; side_panel.ts:5867 exists. Work needed: Update the brief and decision text; many brief line numbers are stale.
- **Retained Tauri empty state has no opt-out** Affects: Internal Tauri desktop. Evidence: apps/desktop/src/features/v3/EmptyChat.tsx passes user?.name. Work needed: Apply the shared opt-out or remove the surface.

**Depends on**

- SYS-authentication-and-identity
- SYS-shared-ui-and-design
- SYS-memory-projects-and-context
- SYS-execution-boundaries
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- file:packages/platform/utils/src/greeting.ts

## Unknown

- Exact account endpoint behind the web preferred name and the preference save endpoint (not opened).
- Whether the Tauri EmptyChat is reachable in any shipped build.
- Which of the 2026-11-13 decision and the mobile code reflects the owner's current wish.
- Whether VS Code ever greets by name (only webviewContent.ts:172 read).
- Retention of the preferred name server-side.
