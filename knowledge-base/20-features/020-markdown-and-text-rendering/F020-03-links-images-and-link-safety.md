---
id: "F020-03"
type: "feature"
title: "Links, images and link safety"
aliases: ["Links, images and link safety", "Links", "Autolinks", "Sanitized embedded markup", "Safe external links", "S20.12", "S20.13", "S20.24", "S20.25", "Load image", "ImageTrust"]
area: "20 Markdown and text rendering"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S20.12", "S20.13", "S20.24", "S20.25"]
depends_on: ["SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "file:packages/ui/unified-chat/src/components/markdown/markdownImageSources.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F020-03 Links, images and link safety

Turns [text](address) and bare web addresses into links, blocks raw scripts and unsafe link types, and holds images from other sites until the reader clicks Load image. Web, mobile and Chrome keep that image rule. VS Code removes images. The CLI shows link addresses in brackets and does not link bare addresses.

Area: [20. Markdown and text rendering](README.md). Requirement items: [S20.12](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2012), [S20.13](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2013), [S20.24](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2024), [S20.25](../../10-requirements/capabilities/020-markdown-and-text-rendering.md#s2025).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 4) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Draws links the reader can follow, removes anything that could run code, and stops a reply from silently fetching images from other hosts.

**Why it exists.** A model reply can contain hostile links, HTML or images that call an attacker's server. The brief requires sanitised markup and safe link handling (doc: knowledge-base/data/area-briefs/020-markdown-and-text-rendering.md S20.12, S20.13, S20.24, S20.25). AGENTS.md section 6 requires security to fail closed.

**Who uses it.** Every reader of answers with links or images; security reviewers.

**Problems it solves**

- Script or javascript links in a reply cannot run.
- A remote image cannot track the reader before they agree.
- Bare URLs become tappable (not CLI).
- Failed images show a readable notice with Retry.

**Use cases**

- Click a source link in a web answer and it opens in a new tab.
- Tap a link on mobile and it opens in the in-app browser.
- See 'Image from example.com' with a Load image button.
- A hostile HTML snippet shows as harmless text or is removed.

## 2. User experience

**Where to find it**

- Web and Desktop (Tauri): links and images inside messages (MarkdownContent.tsx:150-258, 345-390).
- Mobile: links in text (MarkdownInline.tsx:111-150) and images via MarkdownImage.tsx.
- CLI: link text with its address in brackets (markdown_renderer.rs:265-284).
- VS Code: links in the sidebar chat (render.ts:227-231).
- Chrome: side panel bubble links and image links (markdown.ts:150-215).

**Before you start**

- A reply containing a link, bare address, raw HTML or image.

**Screens and controls**

- Web: external links show a small arrow icon and open in a new tab; in-page '#' links stay on the page (MarkdownContent.tsx:371-387).
- Web: 'Load image' button with label 'Load image from <host>', notice 'Image from <host>' (MarkdownContent.tsx:117-148).
- Web: 'Retry' button (up to 2 retries) and 'Download image' link when an image fails; text 'Image failed to load' (MarkdownContent.tsx:66-115, 174-181).
- Web: loaded images open in a new tab, titled 'Open image in a new tab' (MarkdownContent.tsx:240-257).
- Mobile: long-press a link for 'Open', 'Copy Link', 'Share Link' (MarkdownInline.tsx:111-146); images show 'Load image' and 'Retry' (MarkdownImage.tsx:110-130). mailto, sms, tel and geo links ask 'Open in Mail?' and similar first (externalUrls.ts:47-52; MarkdownInline.tsx:99-108).
- Chrome: 'Load image' button and failed-image Retry and Download (markdown.ts:470-606; locale keys spImageLoad, spImageRetry, spImageDownload).

**Journey**

1. The reply contains a link or an image.
2. The renderer checks the scheme and host.
3. A safe link is drawn; an unsafe one is shown as plain text.
4. A cross-site image shows a notice; the reader clicks Load image; the image loads and the choice is remembered for that address until the app session ends.

**What the person sees and gets**

- Underlined link text; arrow icon for external links on web.
- Notice text for blocked or failed images.
- Mobile alert 'Could not open link' when nothing can open it (MarkdownInline.tsx:79-83).

**Settings**

- No setting found. Hosts may pre-trust image addresses through trustedImageUrls (MarkdownContent.tsx:830, 895-898).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: link component returns plain children when href is missing or starts with two slashes (MarkdownContent.tsx:362-364); external links get target _blank and rel noopener noreferrer (378); '#' links stay in the same tab (371, 378). Tracking parameters are stripped from the address (367).
- Web sanitiser: allow-list schema (markdownSanitizeSchema.ts:7-36); javascript and data hrefs are stripped by the sanitiser, leaving an anchor with no href which the link component then renders as text (MarkdownContent.tsx:359-364).
- Web images: cross-origin http(s) images need approval; data and blob images load directly; relative images count as same-origin (markdownImageSources.ts:39-54; MarkdownContent.tsx:186-194). Approved addresses are kept in a module-level Set for the session (MarkdownContent.tsx:189). Images use referrerPolicy no-referrer when cross-origin (216).
- Bare addresses: web relies on remark-gfm autolinks [inferred from remarkGfm in remarkPlugins.ts:71]. VS Code and Chrome turn linkify on (render.ts:16-21; markdown.ts:141-146). Mobile has autolinkHref (apps/mobile/src/features/chat/utils/markdownInlineSyntax.ts:392).
- VS Code: html false, URI allow-list http, https and mailto, links forced to open outside with noopener (render.ts:16-21, 101, 227-231).
- Chrome: validateLink is overridden, then a core rule rewrites non-allowed hrefs to '#' and adds target and rel (markdown.ts:148-172); sanitiser keeps http, https, mailto and fragments (134); images become links with a consent step (201-215, 470-606).
- Mobile: only http and https open in the in-app browser, mailto, sms, tel, geo ask first, everything else is blocked (externalUrls.ts:33-45; answerLinks.ts:51-65; sourceDisplay.ts:24-32). Product links to the app's own domain route inside the app (answerLinks.ts:51-58).
- User messages: web passes literalHtml so HTML in user text shows as text (MarkdownContent.tsx:56-66, 944).

**Incomplete**

- CLI: no Options for bare-address linking in the parser (markdown_renderer.rs:147-150), so bare addresses appear as plain text [inferred]. Brief marks it unverified.
- CLI draws images by their alt text only; no Image tag arm exists in the match (markdown_renderer.rs:206-433) [inferred].

**Present but disconnected or switched off**

- nothing found

**Not available**

- VS Code: images are removed entirely (render.ts:82-99 forbids img; test sanitizer.webview.test.ts:130-145). Alt text is not shown [inferred]; there is no Load image control.
- CLI: no clickable links; address printed after the text as ' (url)' when it differs from the text (markdown_renderer.rs:273-283).
- Desktop and mobile 'open outside the app': mobile opens an in-app browser, not the system browser (sourceDisplay.ts:29); how Tauri desktop opens links is not read.

## 4. Required behaviour

**Established requirements**

- [text](url) renders as a link the reader can see and follow. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.12)
- A bare URL (https or www) becomes a clickable link. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.13)
- Raw HTML or script in model output is sanitised or shown inertly; nothing executes. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.24)
- External links open outside the app with safe attributes; javascript and data schemes are refused. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S20.25)
- Security behaviour fails closed; validate at trust boundaries; collect minimum data. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A javascript: link in a reply is never clickable on web, mobile, VS Code or Chrome.
2. A '//evil.example' link on web shows as plain text.
3. An external link on web has target _blank and rel noopener noreferrer; a '#section' link has no target.
4. A cross-site image does not request the network until Load image is clicked (test MarkdownImage.test.tsx:39).
5. A data: image loads without a prompt.
6. A failed image shows 'Image failed to load' with Retry for at most two retries.
7. A script tag in assistant text creates no script element on web.
8. A bare https address becomes a link on web, VS Code, Chrome and mobile.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI should display the full address next to link text since it cannot click [inferred from markdown_renderer.rs:273-283].
- Approval of an image should be remembered only for the running session [inferred from the in-memory Set].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make CLI bare addresses visible as links (underlined) or document the choice.
- [proposed] Show alt text in VS Code where an image was removed.
- [proposed] Decide whether mobile should use the system browser to match the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MarkdownLink | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Link safety rules, tracking-param strip, new-tab attributes (345-390). |
| component | MarkdownImage / BlockedImage / UnavailableImage | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Consent, load, retry, failure notice (66-258). |
| service | markdownImageSource | `packages/ui/unified-chat/src/components/markdown/markdownImageSources.ts` | Classifies a source as embedded, same-origin or cross-origin; trusted keys; readable alt (39-84). |
| store | ImageTrust | `packages/ui/unified-chat/src/components/markdown/ImageTrust.tsx` | Context and in-memory set of approved image keys (imported at MarkdownContent.tsx:59). |
| config | MARKDOWN_SANITIZE_SCHEMA | `packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.ts` | HTML allow-list; src protocols data and blob added (7-36). |
| config | LITERAL_HTML_REMARK_PLUGINS | `packages/ui/unified-chat/src/components/markdown/remarkPlugins.ts` | Turns HTML nodes into text (56-66, 79-82). |
| service | citationMarkers | `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | stripTrackingParams and citation link logic used by links (imported at MarkdownContent.tsx:45-52). |
| component | AssistantLink | `apps/mobile/src/features/chat/components/MarkdownInline.tsx` | Mobile link press, long-press menu, system-intent prompt (90-150). |
| service | resolveAnswerLink | `apps/mobile/src/features/chat/utils/answerLinks.ts` | Decides web, system, route or plain for a link (51-65). |
| service | classifyExternalLink | `apps/mobile/src/features/chat/utils/externalUrls.ts` | Allows http and https; mailto, sms, tel, geo as system intents; blocks the rest (33-45). |
| component | MarkdownImage (mobile) | `apps/mobile/src/features/chat/components/MarkdownImage.tsx` | Load image, Retry, notice (110-130). |
| service | VS Code PURIFY_CONFIG | `apps/extension-vscode/src/webview/render.ts` | Forbids img, svg, iframe, style, script; allows http, https, mailto (81-105). |
| service | Chrome sanitizeHtml and link rule | `apps/extension/src/features/side-panel/markdown.ts` | DOMPurify allow-list, link rewrite, image to link (47-215). |
| service | CLI link and text sanitising | `apps/cli/src/tui/markdown_renderer.rs` | Link suffix (265-284); control characters stripped before parse (146). |
| component | Web MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Passes trustedImageUrls and literalHtml (2884-2906). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Raw reply text is parsed; HTML is sanitised against an allow-list (web) or removed (VS Code, Chrome). | device | MarkdownContent.tsx:819-823; render.ts:216-219; markdown.ts:607-612 |
| Each link is checked; unsafe ones are drawn as plain text. | device | MarkdownContent.tsx:362-364; externalUrls.ts:33-45 |
| A cross-site image waits for the reader; after approval the browser or app fetches the image from that host. | outside service | MarkdownContent.tsx:186-194, 210-223 (the host named in the address receives the request) |
| Clicking a link hands the address to the browser (web new tab, mobile in-app browser). | device | MarkdownContent.tsx:378; sourceDisplay.ts:29 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approved image keys | Module-level in-memory Set on web (MarkdownContent.tsx:189); a separate Set on mobile (MarkdownImage.tsx:20) | No | Lost when the page or app session ends |

**Models and providers.** No model or provider call. Provider-agnostic. An approved image request goes to whatever host the model named, not to a provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | No device permission. Opening a phone, SMS, mail or maps link on mobile asks first (MarkdownInline.tsx:99-108). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. Image retries are limited to 2 (MarkdownContent.tsx:66). System links over 2048 characters are blocked on mobile (externalUrls.ts:7, 38). |
| Feature flags | none found in the code. |
| Model compatibility | Any model. |
| Provider restrictions | none found in the code. |
| Local mode | Rendering works offline. Remote images and links need a network. Approval is still required in Local mode; the check does not depend on mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Image blocked | Notice 'Image from <host>' and a Load image button; the button is hidden when the image sits inside a link. | MarkdownContent.tsx:117-148, 193 |
| Image loading | Pulsing placeholder box. | MarkdownContent.tsx:202-207 |
| Image error | Notice with alt text, Retry (twice max), Download image link. | MarkdownContent.tsx:169-184 |
| Empty or unparsable image source | Nothing for empty src; 'Image failed to load' notice for an unparsable one. | MarkdownContent.tsx:167-168 |
| Link cannot open (mobile) | Alert 'Could not open link'. | MarkdownInline.tsx:79-83 |
| Link inside a link | Nested image inside a link has no Load button and does not open a second tab. | MarkdownContent.tsx:153, 196 |
| Offline | Image shows the failed state; other handling not read. | MarkdownContent.tsx:218 |
| Accessibility | Image notice has labelled button 'Load image from <host>'; image link has an 'Open image in a new tab' label; focus moves to the image link after approval. | MarkdownContent.tsx:140, 161-165, 249-253 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/MarkdownImage.test.tsx`: No fetch for an attacker image until Load image is clicked; per-host labels; trusted images show no button (lines 39-100).
- `packages/ui/unified-chat/src/components/markdown/markdownSanitizeSchema.test.ts`: Sanitiser schema (name only).
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Underline kept while executable attributes stripped, angle-bracket placeholders as text, hostile markup shown literally, footnote id prefix (lines 239-345).
- `packages/ui/unified-chat/src/components/markdown/__tests__/markdownImageAlt.test.ts`: Readable image alt text.
- `apps/extension-vscode/src/__tests__/sanitizer.webview.test.ts`: command: and javascript: links stripped, allow-listed schemes kept, links open outside with no opener, raw HTML escaped, images dropped (lines 26-190).
- `apps/extension/__tests__/side-panel-markdown-live.test.ts`: Href percent-encoding, attribute injection, javascript routed to '#'.
- `apps/extension/__tests__/security-fixes.test.ts`: Chrome security fixes (name only).

**Test scenarios**

- **Unsafe link**
  1. Reply with [x](javascript:alert(1)).
  2. Click x on web, mobile, VS Code, Chrome.
  - Expected: Not a working link; nothing runs.
- **Protocol-relative link**
  1. Reply with [x](//example.com).
  - Expected: Web shows plain text x.
- **Cross-site image**
  1. Reply with ![a](https://img.example/a.png).
  2. Watch network traffic.
  3. Click Load image.
  - Expected: No request before the click; request after; image shown.
- **Failed image**
  1. Use an address that returns an error.
  2. Click Retry twice.
  - Expected: Failure notice; Retry disappears after two attempts.
- **CLI link**
  1. Reply with [site](https://example.com) and a bare https address.
  - Expected: Text then ' (https://example.com)' for the first; plain text for the bare address.
- **Raw HTML**
  1. Reply with <script>alert(1)</script> and <img src=x onerror=alert(1)>.
  - Expected: No script runs on any app; VS Code and Chrome show escaped text.

**Where to look when it fails**

- Web: browser network panel for image requests; console for blocked content.
- Mobile: alert 'Could not open link'.
- Chrome and VS Code: inspect the DOM for stripped hrefs ('#').

**Hands-on test plans**

- Web: [70-qa/test-plans/web/020-markdown-and-text-rendering.md](../../70-qa/test-plans/web/020-markdown-and-text-rendering.md)
- Desktop: [70-qa/test-plans/desktop/020-markdown-and-text-rendering.md](../../70-qa/test-plans/desktop/020-markdown-and-text-rendering.md)
- Mobile: [70-qa/test-plans/mobile/020-markdown-and-text-rendering.md](../../70-qa/test-plans/mobile/020-markdown-and-text-rendering.md)
- CLI: [70-qa/test-plans/cli/020-markdown-and-text-rendering.md](../../70-qa/test-plans/cli/020-markdown-and-text-rendering.md)
- VS Code: [70-qa/test-plans/vscode/020-markdown-and-text-rendering.md](../../70-qa/test-plans/vscode/020-markdown-and-text-rendering.md)
- Chrome: [70-qa/test-plans/chrome/020-markdown-and-text-rendering.md](../../70-qa/test-plans/chrome/020-markdown-and-text-rendering.md)

## 10. Gaps and dependencies

- **CLI does not link bare addresses and shows images as alt text only.** Affects: CLI users. Evidence: markdown_renderer.rs:147-150, 206-433. Work needed: Confirm behaviour by running the renderer test; decide product rule.
- **VS Code removes images with no placeholder.** Affects: VS Code users. Evidence: render.ts:82-99; sanitizer.webview.test.ts:130-145. Work needed: Show alt text or a notice.
- **Brief says links open outside the app; mobile uses an in-app browser.** Affects: Mobile users. Evidence: sourceDisplay.ts:29. Work needed: Confirm intended behaviour.
- **No test found for the web link component rules (protocol-relative, fragment, new tab).** Affects: Web, Desktop. Evidence: No matching test title found in packages/ui/unified-chat markdown tests. Work needed: Add render tests for MarkdownLink.

**Depends on**

- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- file:packages/ui/unified-chat/src/components/markdown/markdownImageSources.ts

## Unknown

- How the Tauri desktop opens external links.
- Whether the CLI parser links bare addresses (no run allowed).
- Mobile link tests: contents not read.
- Whether protocol-relative links are blocked outside web.
- Where mobile bare-address detection stops (autolinkHref only cited by name).
