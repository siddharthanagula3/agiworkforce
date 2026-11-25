---
id: "F012-02"
type: "feature"
title: "Suggested prompts and recommendations"
aliases: ["Suggested prompts", "Starter prompts", "Recommended skills", "Recommended apps", "Connect your apps", "Connected apps (VS Code)", "Start suggestions"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S12.04", "S12.08", "S12.09"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-memory-projects-and-context", "surface:web", "surface:mobile", "surface:vscode", "surface:desktop", "mode:cloud", "F012-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-02 Suggested prompts and recommendations

Offers things to try on the new-chat screen. Web has a one-off starter prompt from onboarding and a 'Connect your apps (optional)' link. Mobile shows connector chips. VS Code lists up to three projects, skills and connected apps. Web and Desktop have no standing prompt list. CLI and Chrome have none.

Area: [12. New-chat experience](README.md). Requirement items: [S12.04](../../10-requirements/capabilities/012-new-chat-experience.md#s1204), [S12.08](../../10-requirements/capabilities/012-new-chat-experience.md#s1208), [S12.09](../../10-requirements/capabilities/012-new-chat-experience.md#s1209).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives a person a quick way to begin: a prefilled starter prompt (Web, from onboarding), connector suggestions (Web link, Mobile chips), and in VS Code recent projects, enabled skills and connected apps that prefill the composer.

**Why it exists.** Empty screens leave people unsure what to ask. Suggestions teach what the product can do and push useful connections (brief S12.04, S12.08, S12.09). The owner prefers a bare mobile screen, so suggestions there are limited to connectors (doc: docs/decisions/2026-11-10-founder-decisions.md D-2026-11-10-01).

**Who uses it.** New and returning signed-in people; VS Code developers; mobile Cloud users with connectors allowed.

**Problems it solves**

- Blank-page problem.
- Low discovery of connectors and skills.
- Re-finding a recent project from the VS Code start panel.

**Use cases**

- Finish web onboarding, pick a starter prompt and land in /chat with the composer prefilled.
- See 'Connect your apps (optional)' under the web composer and open Settings, Connectors.
- On mobile Cloud, tap a connector chip to open its page, or the close control to hide the card for good.
- In VS Code tap a skill row to prefill 'Use the <skill> skill to '.

## 2. User experience

**Where to find it**

- Web: starter prompt arrives through /chat?starterPrompt=... after the onboarding wizard (apps/web/features/onboarding/components/OnboardingWizard.tsx:91; apps/web/features/chat/pages/WebChatPage.tsx:1322). Connector link: under the empty-state composer (WebChatPage.tsx:6682).
- Mobile: under the greeting on the empty Chat tab, Cloud mode only (ChatEmptyState.tsx:34).
- VS Code: under 'Start a conversation', headings 'Projects', 'Skills', 'Connected apps' (webviewContent.ts:9348-9358).
- Desktop (Electron): same as Web. Tauri desktop has two starter cards: 'Create a file or build a site', 'Research and plan next steps' (apps/desktop/src/features/v3/EmptyChat.tsx:15-27).
- CLI and Chrome: none found.

**Before you start**

- Web connector link: signed in, connectors endpoint loaded, fewer than 3 apps connected, at least one connectable non-device, non-high-impact app, no earlier dismissal, and the account has no conversations (NewChatConnectorSuggestions.tsx:54; WebChatPage.tsx:6682-6684).
- Mobile: Cloud mode, Clerk signed in, connectors flag on, canUseConnectors granted, connector discovery on (ChatEmptyState.tsx:34-40).
- VS Code: signed in to see projects and connectors; connectors also need the canUseConnectors decision to be not denied (ChatStateManager.ts:2468-2471).

**Screens and controls**

- Web link 'Connect your apps (optional)' and a dismiss button labelled 'Hide app suggestions' (packages/ui/i18n/locales/en/common.json:204-208).
- Mobile label 'Connect your apps', chips by connector name labelled 'Set up <name>', a chip 'All connectors', and a dismiss button 'Hide app suggestions'.
- VS Code rows: project name with 'Use in this chat'; skill name with its description; connector name with 'Ask with it'.

**Journey**

1. Open a new chat.
2. Suggestions load in the background.
3. Tap a row or chip.
4. Web link opens Settings > Connectors; mobile chip opens the connector page; VS Code project opens the project, skill or connector rows prefill the composer.
5. Dismiss to hide the card (Web and Mobile remember it).

**What the person sees and gets**

- Prefilled composer text (VS Code skill: 'Use the <name> skill to '; connector: 'Using <name>, ').
- Navigation to a connector page or settings.
- When loading fails nothing is shown and no error appears.

**Settings**

- Mobile: connector discovery setting (cloud settings store).
- Web and Mobile: dismissal flag stored on the device.
- Account capability canUseConnectors.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web onboarding starter prompt hand-off consumed once and stripped from the URL (WebChatPage.tsx:1319-1327).
- Web connector link with hide rules (NewChatConnectorSuggestions.tsx:54-60) and dismissal in browser storage (lines 15-33).
- Mobile connector chips: up to 3, skip connected apps, featured first, hidden once 3 are connected (NewChatConnectorSuggestions.tsx:18-39).
- VS Code start suggestions: limit 3 each, skills must be enabled and consented, connectors must be connected (startSuggestions.ts:9-40).
- Tauri desktop starter cards write an editable draft (EmptyChat.tsx:15-27,89-97).

**Incomplete**

- No standing suggested-prompt list on Web new chat; starters exist only after onboarding.
- Chrome: user-saved prompt shortcuts expand in the composer (side_panel.ts:5853,8799) but nothing is suggested on the empty panel; in-page panel chips act on page text (panel.ts:536), so brief S12.04 'Chrome done' does not match.
- VS Code skill and connector rows only prefill text, no send.

**Present but disconnected or switched off**

- Tauri starter cards are in retained internal code and do not reach the Electron window (doc: AGENTS.md section 5).

**Not available**

- Suggested prompts on Mobile and CLI (brief S12.04).
- Recommended Skills on Web, Mobile, CLI, Chrome (brief S12.08 lists only VS Code).
- Connector recommendations in Chrome; the attach menu Connectors item only opens the web Connectors page (brief S12.09; side_panel.ts:14818).

## 4. Required behaviour

**Established requirements**

- The new-chat screen offers clickable suggested prompts that fill or send a message. (source: brief S12.04)
- The new-chat screen recommends Skills relevant to the user that can be applied to the next message. (source: brief S12.08)
- The new-chat screen recommends apps or connectors worth connecting or using. (source: brief S12.09)
- Mobile new chat shows nothing that explains or suggests beyond greeting and composer. (source: doc: docs/decisions/2026-11-10-founder-decisions.md D-2026-11-10-01)
- Mobile suggestions exclude connected apps, prefer featured ones and stop at three; dismissal persists. (source: apps/mobile/src/features/chat/components/NewChatConnectorSuggestions.tsx:18-66)
- VS Code signed-out users get no projects or connectors. (source: apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts:21)

**Acceptance criteria**

1. Mobile Cloud with connectors allowed and fewer than 3 connected shows up to 3 chips plus 'All connectors'.
2. Tapping the mobile close control hides the card and it stays hidden after restarting the app.
3. Mobile Local mode and signed-out users never see the card.
4. Web link is absent when 3 or more apps are connected.
5. VS Code signed in with enabled skills shows a 'Skills' group of at most 3 rows; tapping one fills the composer.
6. A failed suggestions load shows no card and no error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile conflict: connector chips sit against D-2026-11-10-01 unless the owner treats them as a needed step [inferred].
- A suggested prompt list should respect capability gating so it does not advertise unavailable modes [inferred from doc: docs/decisions/wire-or-cut.md:155].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether Web and Mobile get suggested prompts at all; record it in docs/decisions.
- [proposed] Show a load error or retry for VS Code suggestions instead of silence.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Web NewChatConnectorSuggestions | `apps/web/features/chat/components/NewChat/NewChatConnectorSuggestions.tsx` | Optional 'Connect your apps' link and dismissal. |
| hook | useConnectors (web) | `apps/web/features/connectors/hooks/use-connectors.ts` | Connected and available connector ids (imported by the link). |
| service | Web connector catalog | `apps/web/features/connectors/data/connectors.ts` | CONNECTORS list with category and risk class used to pick connectable apps. |
| screen | WebChatPage starter prompt consumer | `apps/web/features/chat/pages/WebChatPage.tsx` | Reads starterPrompt, prefills the composer, strips the parameter. |
| component | OnboardingWizard | `apps/web/features/onboarding/components/OnboardingWizard.tsx` | Offers starter prompts and routes to /chat?starterPrompt=. |
| component | Mobile NewChatConnectorSuggestions | `apps/mobile/src/features/chat/components/NewChatConnectorSuggestions.tsx` | Loads directory and listings, picks 3, dismissal flag. |
| service | Mobile connectors service | `apps/mobile/services/connectors.ts` | fetchConnectorDirectory and browseConnectorListings used by the card. |
| component | Mobile ChatEmptyState | `apps/mobile/src/features/chat/components/ChatEmptyState.tsx` | Decides whether to show the card (lines 34-40). |
| service | VS Code startSuggestions | `apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts` | Resolves projects, skills and connected apps. |
| service | ChatStateManager pushStartSuggestions | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Posts suggestions to the webview and handles openSuggestedProject. |
| component | VS Code webview suggestion rows | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | syncStartSuggestions renders Projects, Skills, Connected apps. |
| component | Tauri EmptyChat starters | `apps/desktop/src/features/v3/EmptyChat.tsx` | Two starter cards and a scheduled-work card (internal desktop). |
| config | newChat.connectors copy | `packages/ui/i18n/locales/en/common.json` | Labels for the connector card. |
| component | Chrome prompt shortcuts | `apps/extension/src/side_panel.ts` | User-saved shortcuts expanded before send (not a suggestion list). |
| component | Chrome in-page action chips | `apps/extension/src/features/content/in-page-panel/pageActions.ts` | Page-aware chips such as Summarize, Key points, Q&A, Translate. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mobile card requests the connector directory and the listing page in parallel and filters them. | our servers | apps/mobile/src/features/chat/components/NewChatConnectorSuggestions.tsx:22-35 |
| Mobile reads and writes a dismissal flag in the device store. | device | NewChatConnectorSuggestions.tsx:20,61-64 |
| Web link reads connected ids from the connectors hook, decides visibility, stores dismissal in the browser. | device and our servers | NewChatConnectorSuggestions.tsx (web):40-60 |
| VS Code extension host lists projects, skills and connectors, then posts them to the webview. | device and our servers | startSuggestions.ts:12-62; ChatStateManager.ts:2465-2472 |
| Web onboarding hands the chosen prompt to /chat in the query string; the page copies it into the composer and removes it. | device | WebChatPage.tsx:1319-1327 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Mobile dismissal flag 'dismissedNewChatConnectorSuggestions' | store:mmkv (mobile key-value store) | No | Kept until app data is cleared; no reset control found |
| Web dismissal 'agi-new-chat-connector-suggestions-dismissed' | store:browser-localStorage | No | Kept in that browser; read and write errors are tolerated |

**Models and providers.** No model is called to make suggestions; they come from the connector directory, skill list and project list.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in required for Mobile, Web link and VS Code projects and connectors. |
| Permissions | Connectors need the canUseConnectors capability on Mobile (ChatEmptyState.tsx:31) and VS Code (ChatStateManager.ts:2470). |
| Subscription | Capability names only; which plans grant canUseConnectors was not opened (unknown). |
| Limits and metering | Fixed limit of 3 suggestions on Mobile and VS Code; Web and Mobile hide at 3 connected apps. No metering found. |
| Feature flags | Mobile FEATURES.connectors and the connector discovery setting; Web none found. |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code |
| Local mode | Mobile card is hidden outside Cloud mode (ChatEmptyState.tsx:34-35). VS Code skills come from the local CLI adapter (startSuggestions.ts:26-27). Tauri starters are written to the local draft only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading (Mobile) | Nothing shown until suggestions arrive. | NewChatConnectorSuggestions.tsx:46-51,76 |
| Error (Mobile) | List set to empty; card hidden; no message. | NewChatConnectorSuggestions.tsx:46-51 |
| Error (Web) | Link hidden when connectors failed to load. | NewChatConnectorSuggestions.tsx (web):54 |
| Error (VS Code) | Project and connector fetch errors give empty lists. | startSuggestions.ts:24,40 |
| Storage blocked (Web) | Read errors treated as not dismissed; write errors ignored. | NewChatConnectorSuggestions.tsx (web):17-33 |
| Phone width (Web) | On a narrow screen the link sits between greeting and composer so the composer stays last. | WebChatPage.tsx:7650-7653; apps/web/features/chat/pages/__tests__/WebChatPage.emptyStateOrder.test.tsx |
| Offline | not handled in the code beyond the error cases above. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/NewChat/__tests__/NewChatConnectorSuggestions.test.tsx`: Link and dismiss control, hidden when ineligible, dismissed, loading, errored, three connected, none available; opens Settings > Connectors; storage failures.
- `apps/web/features/chat/pages/__tests__/WebChatPage.emptyStateOrder.test.tsx`: Connector link position on phone and wide screens.
- `apps/mobile/__tests__/ChatEmptyStateConnectorDiscovery.test.tsx`: Mobile connector discovery on the empty state (body not opened).
- `apps/extension-vscode/src/__tests__/recentConversations.webview.test.ts`: Recent chats block and a suggested skill staying visible when the recent list refreshes.
- `apps/web/features/onboarding/components/OnboardingWizard.test.tsx`: Wizard behaviour including starter prompt route (body not opened).

**Test scenarios**

- **Mobile suggestions**
  1. Sign in, switch to Cloud, enable discovery.
  2. Open a new chat.
  - Expected: Up to 3 connector chips not already connected, featured first, plus 'All connectors'.
- **Mobile dismissal**
  1. Tap the close control.
  2. Restart the app.
  - Expected: Card does not return.
- **Web link hides at three**
  1. Connect 3 apps.
  2. Open /chat with no conversations.
  - Expected: No link.
- **VS Code skill row**
  1. Sign in; enable a skill.
  2. Open a new chat; tap the skill row.
  - Expected: Composer shows 'Use the <skill> skill to '.
- **Starter prompt**
  1. Finish onboarding choosing a prompt.
  - Expected: /chat opens with the composer prefilled; the URL has no starterPrompt after load.

**Where to look when it fails**

- Mobile: console warnings are not logged for suggestion failures; check network calls to the connector directory.
- Web: localStorage key agi-new-chat-connector-suggestions-dismissed.
- VS Code: pushStartSuggestions in ChatStateManager.ts:2465.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- VS Code: [70-qa/test-plans/vscode/012-new-chat-experience.md](../../70-qa/test-plans/vscode/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **No suggested prompts on Web, Mobile, CLI, Chrome** Affects: All apps except the one-off Web onboarding hand-off. Evidence: No prompt list found in WebChatPage.tsx empty state (7646-7710) or ChatEmptyState.tsx. Work needed: Owner decision, then a shared capability-aware list.
- **Recommended Skills only in VS Code** Affects: Web, Desktop, Mobile, CLI, Chrome. Evidence: startSuggestions.ts:28-37 is the only implementation found. Work needed: Decide scope; reuse the skill list per surface.
- **Brief cites Chrome side_panel.ts lines as suggested prompts but they are attachment chips** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts:10655-10700 builds page-snapshot chips. Work needed: Correct the brief status.
- **Silent failure** Affects: Mobile, Web, VS Code. Evidence: catch blocks return empty (NewChatConnectorSuggestions.tsx:46-51; startSuggestions.ts:24). Work needed: Optional retry or hint; AGENTS.md section 9 forbids silent failures [inferred conflict].
- **Mobile chips versus the 'nothing that suggests' decision** Affects: Mobile. Evidence: docs/decisions/2026-11-10-founder-decisions.md D-2026-11-10-01 vs ChatEmptyState.tsx:34-40. Work needed: Record an owner ruling.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-memory-projects-and-context
- surface:web
- surface:mobile
- surface:vscode
- surface:desktop
- mode:cloud
- F012-03

## Unknown

- Endpoints behind mobile fetchConnectorDirectory and browseConnectorListings (runtime object not opened).
- Which plans grant canUseConnectors.
- Whether Desktop Electron differs from Web for connectors.
- What apps/extension __tests__ cover for chips.
