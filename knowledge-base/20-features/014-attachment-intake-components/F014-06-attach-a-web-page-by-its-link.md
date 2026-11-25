---
id: "F014-06"
type: "feature"
title: "Attach a web page by its link"
aliases: ["URL attachment (S14.08)", "/attach <url> (CLI)", "Web page (VS Code plus menu)", "Add a web page by link (Chrome side panel)", "Link item (Chrome)"]
area: "14 Attachment intake components"
available_on: ["cli", "vscode", "chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S14.08"]
depends_on: ["SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "api:POST /api/page-context/read", "file:apps/cli/src/features/exec/tools/web/mod.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-06 Attach a web page by its link

Lets a person give a web address; the page is read once and its text added to the conversation. CLI uses /attach with a link, VS Code uses the plus menu item 'Web page', and the Chrome side panel uses 'Add a web page by link'. Each app has its own reader, size cap and rules.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.08](../../10-requirements/capabilities/014-attachment-intake-components.md#s1408).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Fetches a page, turns HTML into plain text and adds it as context. CLI: runs the web fetch tool and pushes the text as a user message (apps/cli/src/repl/mod.rs:937-968). VS Code: fetches from the extension with a 15 second timeout and 2 MiB cap (apps/extension-vscode/src/data/composerContext.ts:250-310). Chrome: asks our server to read the page (apps/extension/src/features/cloud-bridge/pageContextClient.ts:18-58; apps/web/app/api/page-context/read/route.ts:19-40).

**Why it exists.** Brief item S14.08: attach a web page by URL so its content is context (doc: knowledge-base/data/area-briefs/014-attachment-intake-components.md).

**Who uses it.** CLI, VS Code and Chrome users who want the assistant to read a documentation page or article.

**Problems it solves**

- Copying page text by hand.
- Reading the page without giving it your browser sign-in (Chrome note spLinkAccountRead).
- Treating fetched text as untrusted: CLI marks it as page content, not instructions (repl/mod.rs:963).

**Use cases**

- CLI: /attach https://example.com/docs to ask about a doc page.
- VS Code: Web page item to paste an API reference link.
- Chrome: paste a link to a public article and ask for a summary.

## 2. User experience

**Where to find it**

- CLI: '/attach <url>' ('Fetch a web page and add its text to the conversation') (tui_app.rs:5486; 6219-6221).
- VS Code: plus menu item 'Web page' (webviewContent.ts:3245), detail 'Read a page by its link and attach its text' (composerContext.ts resolveContextMenuState).
- Chrome: '+' menu item 'Add a web page by link' (locale spLinkItem; side_panel.ts:14838), then a form with a link box, 'Add' and cancel.

**Before you start**

- CLI: not in Local privacy mode; link must be http or https.
- VS Code: none found beyond an http or https link.
- Chrome: signed-in Cloud account; site not blocked by the user (side_panel.ts:6606).

**Screens and controls**

- CLI: system message with result.
- VS Code: input box 'Attach a web page' with placeholder 'https://' (composerContext.ts:272-285).
- Chrome: link form with note 'Reads a public page through your account, without your browser's sign-in.'

**Journey**

1. Give the link.
2. The page is read once.
3. A confirmation appears (CLI: 'Attached <url> (N characters) to the conversation.'; Chrome: a page chip).
4. Ask a question; the text is already in context.

**What the person sees and gets**

- CLI failure: 'Could not attach <url>: <reason>' (tui_app.rs:7708-7715).
- VS Code failure: error message '<product>: <url> could not be read, <reason>.' (composerContext.ts:307).
- VS Code validation text: 'Use an http or https link.' and 'Paste a full link, starting with https://'.
- Chrome: 'Reading the page…', 'Enter a link that starts with https:// or http://.', '<site> could not be reached. Check the link and try again.', plus server refusal texts.

**Settings**

- Workspace site rules can refuse a site in the CLI (web/mod.rs:560-565 area).
- Chrome user-blocked sites (side_panel.ts:6606).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI: /attach accepts http and https; fetch blocks other schemes, loopback, private and metadata addresses, pins DNS per hop, follows up to 5 redirects, 30 s per hop, 2 MiB body cap; HTML tags stripped; output marked untrusted (features/exec/tools/web/mod.rs:39-70,118-126,536-600).
- CLI: Local privacy mode refuses the tool: 'web_fetch is unavailable in Local privacy mode' (features/exec/tools/mod.rs:724-735) [inferred to apply because attach_url_context calls the tool executor, repl/mod.rs:955].
- VS Code: input validation, fetch with redirect follow and 15 s timeout, body cap 2 MiB, HTML to text, truncated text (composerContext.ts:250-310).
- Chrome: validated link, user-blocked check, POST to the page read route with sign-in token, response parsed against a schema (side_panel.ts:6601-6640,14892-14930; pageContextClient.ts:18-58).
- Server route: CSRF check, two rate limits (30 per minute, 500 per day, fail closed), URL fetch guard with 1.5 MiB response, 20,000 content characters, 5 redirects, content types html, plain text, xhtml (route.ts:19-40; rate-limit.ts:272-282; url-fetch-tool.ts:42-46; page-context.ts:5-9).

**Incomplete**

- CLI page text is added as a conversation message, with no chip and no way to remove it (repl/mod.rs:960-966); /attach list and remove deal only with staged images and documents (tui_app.rs:6226-6245).
- VS Code reads non-HTML bodies raw without a content-type check (composerContext.ts:296-298).
- VS Code fetch has no private-address guard in this function (composerContext.ts:272-310).

**Present but disconnected or switched off**

- CLI refuses in Local privacy mode by design.

**Not available**

- Web, desktop and phone: no URL attach (brief: n/a).

## 4. Required behaviour

**Established requirements**

- The user can attach a web page by its URL so its content is used as context (S14.08): done on CLI, VS Code, Chrome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S14.08)
- Local means no hidden API or cloud call; network context must not leave the device in Local privacy mode. (source: apps/cli/src/features/exec/tools/mod.rs:718-722)
- Execution boundaries are explicit: a server read of a page runs on our servers. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. CLI: /attach https://<public page> reports the character count and the next answer can use the text.
2. CLI: /attach with a localhost or private address is refused with 'URL blocked for security'.
3. CLI in Local privacy mode: /attach <url> fails with the Local mode message.
4. VS Code: a link starting ftp:// is rejected by the input box.
5. VS Code: a 404 page shows the could-not-be-read message with the HTTP status.
6. Chrome: a link to a PDF or image shows the not-text message; a public HTML page adds a chip.
7. Chrome: after the daily page-read limit a clear limit message appears.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The three apps should treat the same page the same way; today caps differ (2 MiB CLI and VS Code, 1.5 MiB / 20,000 characters Chrome server) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a private-address guard and content-type check to the VS Code reader.
- [proposed] Show the CLI attachment as a removable chip.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | /attach url branch | `apps/cli/src/tui/tui_app.rs` | Parses the link and runs RunAttachUrl (6215-6221, 7703-7715). |
| service | attach_url_context | `apps/cli/src/repl/mod.rs` | Runs web_fetch and adds the text as a user message. |
| service | execute_web_fetch | `apps/cli/src/features/exec/tools/web/mod.rs` | URL validation, pinned hops, caps, HTML strip, untrusted wrapper. |
| service | Local privacy gate | `apps/cli/src/features/exec/tools/mod.rs` | Refuses web_fetch in Local privacy mode (line 724). |
| service | webPage | `apps/extension-vscode/src/data/composerContext.ts` | VS Code input box, fetch, HTML to text, truncation. |
| service | attachContext | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Builds and pushes the context attachment (line 4054). |
| component | VS Code plus menu Web page | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Menu item data-context-kind url. |
| component | Chrome link form | `apps/extension/src/side_panel.ts` | Link item, form, submit handler (14832-14930). |
| service | readLinkedPage | `apps/extension/src/side_panel.ts` | Blocked-site check, server read, sanitise, bound (6601). |
| service | readChromeLinkedPage | `apps/extension/src/features/cloud-bridge/pageContextClient.ts` | POSTs to the page read route with the account token. |
| endpoint | POST /api/page-context/read | `apps/web/app/api/page-context/read/route.ts` | Server page reader with CSRF and rate limits. |
| service | executeUrlFetch | `apps/web/lib/url-fetch/url-fetch-tool.ts` | Guarded fetch, size caps, redirects. |
| schema | page-context contract | `packages/contracts/cloud-contracts/src/page-context.ts` | Request and response schemas, path, allowed content types. |
| config | Rate limits page-read | `apps/web/lib/rate-limit.ts` | 'page-read' and 'page-read-account-day' settings. |
| config | Locale strings | `apps/extension/_locales/en/messages.json` | spLinkItem, spLinkAccountRead, spLinkInvalid, spLinkReading, spLinkUnreachable. |
| test | page-read route test | `apps/web/app/api/page-context/read/__tests__/route.test.ts` | Auth, CSRF, rate limit, bounded URL, typed refusal. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI: link checked for http or https, then the fetch tool runs on the person's computer and contacts the website directly. | outside service | tui_app.rs:6219; web/mod.rs:536-600 |
| CLI: page text is added to the session; it goes to the model provider with the next turn. | device | repl/mod.rs:960-966 |
| VS Code: the extension host fetches the page directly from the website. | outside service | composerContext.ts:290-296 |
| VS Code: text becomes a pending context attachment sent with the next message. | device | ChatStateManager.ts:4054-4075 |
| Chrome: panel posts the link and account token to our page read route. | our servers | pageContextClient.ts:32-45 |
| Server checks CSRF and rate limits, fetches the page with the guarded fetcher and returns text. | our servers | route.ts:19-40 |
| The website serves the page to our server. | outside service | url-fetch-tool.ts:42-46 |
| Panel sanitises and bounds the text and attaches a page chip. | device | side_panel.ts:6620-6635 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Page text | CLI session messages; VS Code pending attachment; Chrome page capture in the composer | CLI sync is opt-in (claude_parity.rs:462); others follow the conversation | CLI: stays in the session until it ends; Chrome and VS Code: until sent or removed |
| Server request counters | rate limiter store | n/a | window based (1 minute and 1 day) |

**Models and providers.** Reading is not a model call. In Chrome the server reader is our own route. The page text then goes to whichever model handles the turn; CLI marks it untrusted. Search or fetch tools in Local privacy are refused (tools/mod.rs:724).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI and VS Code: none found. Chrome: signed-in Cloud account with the same owner as the chat (pageContextClient.ts:26-31). |
| Permissions | None found for CLI and VS Code. Chrome: the account token; CSRF header X-Requested-With. |
| Subscription | Page-read allowances are configuration (30 per minute, 500 per day per user) and not tied to a plan in the code read (rate-limit.ts:272-282). Plan entitlements for the Chrome link item: unknown. |
| Limits and metering | CLI: 2 MiB per hop, 5 redirects, 30 s per hop. VS Code: 2 MiB, 15 s. Chrome server: 1.5 MiB response, 20,000 characters, 5 redirects. Daily account count enforced server side with fail-closed. |
| Feature flags | none found in the code; CLI site rules from workspace administrators can refuse sites (web/mod.rs:553-566). |
| Model compatibility | Any text model; none required. |
| Provider restrictions | none found in the code. |
| Local mode | CLI: refused in Local privacy mode with an instruction to create a BYOK or Managed continuation (tools/mod.rs:724-735). VS Code: unknown. Chrome: no local mode found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not http or https | CLI: URL blocked; VS Code: input box error; Chrome: invalid link message. | web/mod.rs:45-47; composerContext.ts:278-285; locale spLinkInvalid |
| Bad status | VS Code: 'the page answered HTTP <status>'; CLI: failure string; Chrome: 'The page could not be read (<status>). Try again.' | composerContext.ts:297; pageContextClient.ts:50 |
| Timeout | VS Code aborts at 15 s; CLI 30 s per hop; Chrome request abort is cancelable by closing the form. | composerContext.ts:250,294; web/mod.rs:119; side_panel.ts:14860-14868 |
| Empty page text | Chrome returns an empty-context reason. | side_panel.ts:6626-6627 |
| Not text (PDF, image) | Chrome 'link not text' message; CLI and VS Code: not handled in the code. | side_panel.ts:6612-6616 |
| Daily limit reached | Chrome says what the limit is in the server's words. | apps/extension/__tests__/page-context-client.test.ts:78 |
| Account changes | Chrome refuses: 'The signed-in account changed. Add the link again.' | pageContextClient.ts:29-30 |
| Offline | Chrome shows the unreachable message; CLI and VS Code show the failure reason. | side_panel.ts:6636-6640 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/page-context/read/__tests__/route.test.ts`: guarded reader with abort signal, daily allowance, unauthenticated, CSRF, rate limit, extra input, URL bound, typed refusal
- `apps/extension/__tests__/page-context-client.test.ts`: first-party route, never another account, cancellation, invalid response, daily limit wording, retry advice
- `apps/extension-vscode/src/__tests__/composerContext.webPage.test.ts`: hostile page, scripts and styles dropped, block tags, entities, unclosed script
- `apps/extension-vscode/src/__tests__/composerContext.test.ts`: context attachments (title only read)
- `apps/cli/src/features/exec/tools/web/mod.rs`: unit tests: blocked internal addresses (lines 834-900), body cap (815-829)

**Test scenarios**

- **CLI public page**
  1. Run /attach https://example.com.
  2. Ask what the page says.
  - Expected: Message with character count; answer uses the text.
- **CLI Local mode**
  1. Start a Local privacy session.
  2. Run /attach https://example.com.
  - Expected: Local privacy refusal text.
- **CLI internal address**
  1. Run /attach http://127.0.0.1/.
  - Expected: 'URL blocked for security'.
- **VS Code 404**
  1. Plus menu, Web page, enter a link that returns 404.
  - Expected: Error message with HTTP 404.
- **Chrome link**
  1. Sign in.
  2. Choose Add a web page by link.
  3. Enter a public article link.
  - Expected: Reading message, then a page chip.
- **Chrome limit**
  1. Exceed the per-minute page-read limit.
  - Expected: A limit message from the server.

**Where to look when it fails**

- CLI: 'Could not attach <url>: ...'.
- VS Code: error toast with product name.
- Chrome: link error line (id sp-link-error).
- Server: rate limit names page-read and page-read-account-day; typed refusal in the route response.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/014-attachment-intake-components.md](../../70-qa/test-plans/cli/014-attachment-intake-components.md)
- VS Code: [70-qa/test-plans/vscode/014-attachment-intake-components.md](../../70-qa/test-plans/vscode/014-attachment-intake-components.md)
- Chrome: [70-qa/test-plans/chrome/014-attachment-intake-components.md](../../70-qa/test-plans/chrome/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **VS Code reader has no private-address guard or content-type check** Affects: VS Code. Evidence: composerContext.ts:272-310. Work needed: Reuse the CLI or server guard.
- **CLI attached page cannot be listed or removed** Affects: CLI. Evidence: repl/mod.rs:960-966; tui_app.rs:6226-6245. Work needed: Stage as a chip.
- **Caps and rules differ across the three apps** Affects: CLI, VS Code, Chrome. Evidence: web/mod.rs:126; composerContext.ts:251; url-fetch-tool.ts:42-44. Work needed: Decide one rule set.
- **No URL attach on web, desktop, phone** Affects: Web, desktop, phone. Evidence: brief n/a. Work needed: Product decision.

**Depends on**

- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- api:POST /api/page-context/read
- file:apps/cli/src/features/exec/tools/web/mod.rs

## Unknown

- Whether VS Code web page attach is blocked in an untrusted workspace (attachContext start only read).
- Whether any plan entitlement gates the Chrome link item beyond sign-in.
- Whether the CLI daemon or app-server paths expose the same link attach.
- Whether Local privacy refusal appears for the CLI attach path in practice (reasoned from the shared tool gate; no test found for attach_url_context).
