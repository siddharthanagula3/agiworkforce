---
id: "F041-02"
type: "feature"
title: "Temporary-mode indicator and explainer"
aliases: ["Temporary chat label", "Temporary chat header", "Temporary chat explainer", "Temporary chat banner (mobile)", "Retention note", "TEMPORARY_CHAT_RETENTION_NOTE", "TEMPORARY_CHAT_PRIVACY_EXPLANATION", "Personalized / Unpersonalized label", "S41.02", "S41.03", "S41.19"]
area: "41 Temporary and private experiences"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S41.02", "S41.03", "S41.19"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "surface:desktop", "mode:cloud", "mode:local", "F041-01", "F041-03", "F041-04", "F041-05", "SYS-shared-ui-and-design", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-02 Temporary-mode indicator and explainer

Shows that a chat is temporary and says in plain words what is and is not kept. Web has a header label with a tooltip and an always-visible line under the menu row; mobile has a dismissible banner shown once per app session; Chrome has a notice. CLI and VS Code have no indicator.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.02](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4102), [S41.03](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4103), [S41.19](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4119).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Tells the person that the open chat is temporary and what that means: out of history, search, memory and the Library, with a connector note in the longer text (apps/web/lib/temporary-chat-policy.ts:22-30).

**Why it exists.** A privacy mode only works if the person can see it is on and trust the words. The code comment says every clause of the promise is kept by code and must change with it (apps/web/lib/temporary-chat-policy.ts:12-21). The product requirements say private chats are clearly marked (doc: docs/product/requirements.md:894) and list a temporary/incognito notice as a chat element (doc: docs/product/experience-contract.md:386).

**Who uses it.** Anyone in a temporary chat; also reviewers checking the promise against the behaviour.

**Problems it solves**

- Forgetting that a chat is temporary and expecting to find it later.
- Believing a temporary chat is erased everywhere (connectors keep their own record).
- Not knowing whether files and memory are involved.

**Use cases**

- Web: glance at the header label Temporary chat and hover for the note.
- Web: read the line under the + menu row before turning it on.
- Mobile Cloud: read the banner 'Won't appear in history or use memory, and is normally deleted after 30 days.' and tap Learn more.
- Mobile Local: read 'Won't be saved or use memory, and attachments never leave this device.'

## 2. User experience

**Where to find it**

- Web: chat header. With no messages: eye-off icon, 'Temporary chat' and, from the sm width up, '· Won't be saved to your history and skips memory for this turn.' With messages: eye-off icon and 'Temporary chat' with the note as a hover title; the element has role status (apps/web/features/chat/pages/WebChatPage.tsx:7340-7364; packages/ui/i18n/locales/en/chat.json:249-250).
- Web: under the + menu toggle row, the line 'Stays out of your history, search, memory and Library.' (apps/web/lib/temporary-chat-policy.ts:29-30; ComposerPlusMenu.tsx:504). The row tooltip holds the full note including connectors (ComposerPlusMenu.tsx:502).
- Mobile: banner at the top of an open chat (apps/mobile/app/(app)/chat/[id].tsx:2481, component apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx).
- Mobile: Chat tab pill shows 'Temporary' in purple when on (TemporaryChatToggle.tsx:69).
- Chrome side panel: notice above the composer 'Temporary chat. Stays out of your history, search, memory and Library.' with End temporary chat or Turn off (apps/extension/src/side_panel.ts:8902-8930, 15724-15768).
- Desktop shared header: title shows 'Temporary chat' and the button label 'Temporary chat: this chat won't be saved to history' (packages/ui/unified-chat/src/components/ConversationHeader.tsx:70-71, 114-120).
- Desktop Tauri Cloud chip text: 'New chats stay out of history and are deleted automatically' (apps/desktop/src/features/v3/ComposerContextControls.tsx:131-135).

**Before you start**

- The chat is temporary.
- Web label is hidden while voice mode is active (WebChatPage.tsx:7340).
- Mobile banner shows only the first time temporary is turned on in an app session and only until dismissed (TemporaryChatBanner.tsx:24, 39-49).

**Screens and controls**

- Web header label and tooltip.
- Web + menu line and tooltip.
- Mobile banner with text, an underlined Learn more link, a Personalized switch in Cloud mode, and an X button labelled 'Dismiss temporary chat explainer' (TemporaryChatBanner.tsx:97-111).
- Chrome notice with End temporary chat, Keep chatting and a help link to the temporary-chats article (side_panel.ts:15762-15766).

**Journey**

1. Person turns on temporary mode (F041-01).
2. Web: the header label appears at once and stays while the chat is open.
3. Mobile: the banner appears the first time in this app session; the person may tap Learn more, which opens the Cloud privacy screen, or dismiss it.
4. Person can read the longer note by hovering the label (web) or opening the help article (Chrome).

**What the person sees and gets**

- Mobile Cloud text: "Won't appear in history or use memory, and is normally deleted after 30 days." (TemporaryChatBanner.tsx:12-13)
- Mobile Local text: "Won't be saved or use memory, and attachments never leave this device." (TemporaryChatBanner.tsx:14-15)
- Mobile alert on turning on shows the same text as its body (TemporaryChatToggle.tsx:29).
- Web note text differs by place: header tooltip is the short locale note; the + row tooltip is the long retention note.

**Settings**

- None. The Personalized switch is covered in F041-03.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web header label with role status and tooltip is rendered whenever temporaryChatActive and voice mode is off (WebChatPage.tsx:7340-7364).
- Web menu row line and tooltip (ComposerPlusMenu.tsx:489-505).
- Mobile banner with Cloud and Local texts, Learn more link to /(app)/settings/cloud-privacy, dismiss (TemporaryChatBanner.tsx:12-22, 97-111).
- Chrome notice and menu hint with translated strings (apps/extension/_locales/en/messages.json spTemporaryChatActive, spTemporaryChatExplanation, spTemporaryChatRetention).
- Shared header title and button on desktop Local (ConversationHeader.tsx:70-127).

**Incomplete**

- Mobile: the banner shows once per app session; after dismissal or on a later chat in the same session there is no persistent indicator in the chat except the Chat tab pill. The brief asks for an indicator for as long as the chat is open (TemporaryChatBanner.tsx:24, 44-47).
- Web header text says 'skips memory for this turn' and does not mention files, search, the Library or connectors; only the + row tooltip carries the connector sentence (packages/ui/i18n/locales/en/chat.json:250 versus apps/web/lib/temporary-chat-policy.ts:22-27).
- The mobile Cloud text says deleted after 30 days; the web Privacy text says deleted after 30 days; the support page says the conversation record and attachments are held up to 30 days and ratings are kept (doc: apps/web/content/support/temporary-chats.md). The short texts do not mention the rating exception.
- Narrow widths hide the web retention sentence (hidden below sm) (WebChatPage.tsx:7351).

**Present but disconnected or switched off**

- __resetTemporaryChatBannerForTests is exported only for tests (TemporaryChatBanner.tsx:26-28).

**Not available**

- CLI and VS Code: no temporary-chat indicator because no temporary chat exists there. The CLI has one retention sentence in a privacy text: 'a temporary chat and its attachments are removed after 30 days' (apps/cli/src/claude_parity.rs:465).
- Mobile has no explainer for connectors (see F041-04).

## 4. Required behaviour

**Established requirements**

- While a chat is temporary, a visible indicator says so for as long as the chat is open. (source: Brief S41.02)
- The product explains accurately what is and is not kept, and the explanation matches what happens. (source: Brief S41.03)
- The product explains, in context, what each privacy setting does. (source: Brief S41.19)
- The shared web text says out of history, search, memory and Library, and a connector asks before every call. (source: apps/web/lib/temporary-chat-policy.ts:22-30)
- Temporary/private chats are clearly marked if supported. (source: doc: docs/product/requirements.md:894)

**Acceptance criteria**

1. On web, open a temporary chat with and without messages: the label Temporary chat is visible in both.
2. On web, hover the label: the tooltip text appears.
3. On web, the + menu line under the row reads 'Stays out of your history, search, memory and Library.'
4. On mobile in Cloud mode the banner text equals the Cloud sentence; in Local mode it equals the Local sentence.
5. On mobile, tapping Learn more opens settings/cloud-privacy; tapping the X hides the banner.
6. Every sentence about what is kept matches code: history, search, memory, Library, connector approval (see F041-03 to F041-05).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A persistent indicator that survives dismissal would satisfy the brief better on mobile [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Keep a small permanent mark in the mobile chat header after the banner is dismissed.
- [proposed] Make web header text and menu row tooltip come from one string.
- [proposed] Show the retention note on touch where hover does not exist.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | retention texts | `apps/web/lib/temporary-chat-policy.ts` | TEMPORARY_CHAT_RETENTION_NOTE, TEMPORARY_CHAT_PRIVACY_EXPLANATION, TEMPORARY_CHAT_LABEL. |
| config | web header strings | `packages/ui/i18n/locales/en/chat.json` | header.temporaryChat, temporaryChatRetentionNote, Personalized strings (lines 249-253). |
| screen | WebChatPage header | `apps/web/features/chat/pages/WebChatPage.tsx` | Renders label, tooltip and personalization switch (7340-7380). |
| component | ComposerPlusMenu TemporaryChatRows | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Visible line and tooltip on the menu row. |
| component | TemporaryChatBanner | `apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx` | Mobile explainer, Learn more, dismiss, session-once logic. |
| component | TemporaryChatToggle | `apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx` | Alert with the explainer text; pill label. |
| screen | mobile chat thread | `apps/mobile/app/(app)/chat/[id].tsx` | Mounts the banner (line 2481). |
| screen | cloud-privacy settings | `apps/mobile/src/features/settings/cloud-privacy/index.tsx` | Target of Learn more. |
| component | ConversationHeader | `packages/ui/unified-chat/src/components/ConversationHeader.tsx` | Shared title and button text. |
| component | Chrome notice | `apps/extension/src/side_panel.ts` | sp-temporary-notice element and renderTemporaryChatState. |
| config | Chrome strings | `apps/extension/_locales/en/messages.json` | spTemporaryChat* strings. |
| other | support article | `apps/web/content/support/temporary-chats.md` | Public explanation of what is kept for up to 30 days. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The client reads whether the displayed conversation is temporary (from the conversation record or the armed choice). | device | apps/web/features/chat/pages/WebChatPage.tsx:2210-2212 |
| It renders fixed text from constants and locale files; no network call is made for the indicator. | device | apps/web/features/chat/pages/WebChatPage.tsx:7340-7364; apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx |
| Learn more navigates inside the phone app to the cloud privacy screen. | device | apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:22, 80-88 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Banner shown-once flag | a module variable in memory (hasShownThisSession) | No | Lost when the app process ends (TemporaryChatBanner.tsx:24) |

**Models and providers.** None. The text is static and does not depend on a model or provider. The Cloud and Local sentence is chosen by app mode (apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:75).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None needed to read the text. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local shows the Local sentence 'attachments never leave this device' (TemporaryChatBanner.tsx:14-15). The Personalized switch is hidden in Local mode (TemporaryChatBanner.tsx:89-101 region, conditional on isCloud). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Voice mode active (web) | Header label is hidden | apps/web/features/chat/pages/WebChatPage.tsx:7340 |
| Narrow screen (web) | Only the label shows; the sentence is hidden under the sm breakpoint | apps/web/features/chat/pages/WebChatPage.tsx:7351 |
| Temporary turned off (mobile) | Banner closes | apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:39-43; test TemporaryChatBanner.test.tsx |
| Dismissed or already shown this session (mobile) | Banner does not return until the app restarts | apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:44-47 |
| Screen reader | Mobile banner has role alert and label; web label has role status | apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:63-65; WebChatPage.tsx:7357 |
| Loading, empty, offline | not handled in the code (static text) | no branch found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/TemporaryChatBanner.test.tsx`: Closes when temporary is off; Learn more link opens data-use settings; turn off in place; asks before turning on.
- `apps/web/features/chat/components/Composer/ChatComposerNew.temporaryChat.test.tsx`: States what it costs on screen, not only in a tooltip; keeps long retention note on the row.
- `apps/web/features/chat/pages/__tests__/WebChatPage.headerTitle.test.tsx`: Header title behaviour (file mentions temporary; contents not fully read).

**Test scenarios**

- **Header label**
  1. Turn on temporary on web.
  2. Open the chat with no messages, then send one.
  - Expected: Label Temporary chat is visible before and after sending; hover shows the note.
- **Mobile Cloud banner**
  1. In Cloud mode turn temporary on.
  2. Open a new chat.
  - Expected: Banner with the Cloud sentence, Learn more and a Personalized switch.
- **Mobile Local banner**
  1. Switch to Local mode.
  2. Turn temporary on and open a chat.
  - Expected: Banner with the Local sentence and no Personalized switch.
- **Dismiss and reopen**
  1. Dismiss the banner.
  2. Open another temporary chat in the same session.
  - Expected: Banner is not shown again (known gap).
- **Chrome notice**
  1. Start Temporary chat in the side panel.
  - Expected: Notice text appears with Turn off.

**Where to look when it fails**

- Mobile: hasShownThisSession is module state; restart the app to see the banner again.
- Web: inspect conversation.isTemporary in the chat store.
- Locale: packages/ui/i18n/locales/*/chat.json header keys.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/041-temporary-and-private-experiences.md](../../70-qa/test-plans/web/041-temporary-and-private-experiences.md)
- Desktop: [70-qa/test-plans/desktop/041-temporary-and-private-experiences.md](../../70-qa/test-plans/desktop/041-temporary-and-private-experiences.md)
- Mobile: [70-qa/test-plans/mobile/041-temporary-and-private-experiences.md](../../70-qa/test-plans/mobile/041-temporary-and-private-experiences.md)
- Chrome: [70-qa/test-plans/chrome/041-temporary-and-private-experiences.md](../../70-qa/test-plans/chrome/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **Mobile banner is session-once and dismissible, so the indicator is not on screen for as long as the chat is open.** Affects: Mobile. Evidence: apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:24,44-47. Work needed: Add a persistent mark or re-show per chat.
- **Short header text omits Library, search and connector behaviour.** Affects: Web. Evidence: packages/ui/i18n/locales/en/chat.json:250. Work needed: Use the shared retention note or link to it.
- **Texts do not mention the kept rating or the in-flight record described on the support page.** Affects: All apps. Evidence: apps/web/content/support/temporary-chats.md. Work needed: Align short texts with the support page or add a link.
- **CLI and VS Code have no indicator and no mode.** Affects: CLI, VS Code. Evidence: no match in apps/cli/src, apps/extension-vscode/src. Work needed: Follows F041-01 decision.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- surface:desktop
- mode:cloud
- mode:local
- F041-01
- F041-03
- F041-04
- F041-05
- SYS-shared-ui-and-design
- SYS-security-and-privacy

## Unknown

- Whether desktop Tauri Cloud mode shows any in-chat indicator beyond the chip.
- Whether the mobile Cloud 'normally deleted after 30 days' matches the support page that says some records are kept (partly, see gaps).
- Chrome help article link target: apps/extension helper buildHelpArticleLink('temporary-chats') target not opened.
- Translated strings for all languages were not compared.
