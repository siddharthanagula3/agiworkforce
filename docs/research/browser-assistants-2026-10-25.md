# Browser AI assistants: capability comparison

Status: Current research snapshot
Owner: Product research
Verified: 2026-10-25
Coverage: Perplexity Comet and Comet Assistant, Claude in Chrome (with its Claude Code and Claude Desktop links), Gemini in Chrome, and the ChatGPT browser extension with ChatGPT desktop browser tools and Codex browser use. Microsoft Copilot in Edge is noted where it changes the picture. Vendor pages read on 2026-10-25 unless a row says otherwise.

This extends `competitor-surfaces-2026-10-24.md` (sections "Chrome" and per-product continuity) and the observed
`claude-chrome-ui-reference-2026-10-13.md` and `chatgpt-chrome-ui-reference-2026-10-13.md`. It records what each
product does and how it connects, and makes no recommendation. Product choices follow
`docs/product/competitive-guidance.md`: reopen the cited page before acting on any single claim, because vendors change weekly.
Feature lists name no model versions.

## How to read this

Evidence labels, applied per claim or per row:

- **D (Documented):** an official vendor page, read on 2026-10-25, URL given.
- **O (Observed):** seen in the supplied 2026-10-13 screenshots (the two UI reference files). Not exercised by this research.
- **I (Indirect):** press, store listing, search snippet of an official page, or a page whose official text could not be fetched.
- **U (Unknown):** nothing found. Not proof the capability is absent.

Matrix cells use Yes, Preview, No or Unknown, followed by a label. "Preview" covers vendor-declared preview, experimental or
limited rollout. "Limited" in a plan note means the vendor's own table says Limited.

Instrument note: the fetch tool returned summaries of each page produced by a small model, not raw HTML. Quoted phrases below
are from those summaries. Where a summary contradicted another source, the conflict is listed in section 5 rather than resolved.
No product was driven by this research; nothing here is a live test.

## 1. Capability matrix

Columns: **Comet** = Perplexity Comet browser and Comet Assistant. **Claude** = Claude in Chrome extension. **Gemini** = Gemini in Chrome (built into Chrome, no extension).
**ChatGPT** = ChatGPT browser extension used with the ChatGPT desktop app (Codex uses the same extension; see section 2.4).

| Capability                                | Comet                                   | Claude                                          | Gemini                                         | ChatGPT                                              |
| ----------------------------------------- | --------------------------------------- | ----------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Side panel chat beside the page           | Yes (D)                                 | Yes (D)                                         | Yes (D)                                        | Yes (D), not in Opera                                |
| Reads the current page                    | Yes (D)                                 | Yes (D)                                         | Yes (D)                                        | Yes (D)                                              |
| Multi-tab context                         | Yes (D), `@` a tab                      | Yes (D), tab group                              | Yes (D), up to 10 tabs, `@` a tab              | Yes (D), mention open tabs                           |
| Selected text as context                  | Yes (D), inline assistant               | Unknown                                         | No, "Select Content" listed as coming soon (D) | Yes (D)                                              |
| Summarise or ask about the page           | Yes (D)                                 | Yes (D)                                         | Yes (D)                                        | Yes (D)                                              |
| Video transcript Q&A                      | Unknown                                 | Unknown                                         | Yes (D), also audio and video already played   | Yes (D), YouTube when captions exist                 |
| Click, type, navigate, fill forms         | Yes (D)                                 | Yes (D)                                         | Preview (D), auto browse                       | Yes (D), plan table says Limited                     |
| Multi-step autonomous tasks               | Yes (D)                                 | Yes (D)                                         | Preview (D)                                    | Yes (D)                                              |
| Runs in background without taking the tab | Yes (D), parallel errands               | Yes (D), while Chrome stays open                | Yes (D), task tab, or remote cloud browser     | Yes (D)                                              |
| Scheduled or recurring tasks              | Yes, Max Background Assistants (I)      | Yes (D), daily to annually                      | Unknown in Chrome                              | Yes through Work, not the extension (D)              |
| Take over and hand back                   | Unknown (pause only, D)                 | Yes (D), pauses at login and CAPTCHA via Code   | Yes (D), Take over task and Give back task     | Unknown for the extension; Stop seen (O)             |
| Per-site permission grants by the user    | Yes (D)                                 | Yes (D), allow once or always for the site      | Unknown                                        | Yes (D), once, this site, all sites, decline         |
| Selectable approval modes                 | Yes (D), admin: always allow or consent | Yes (D), Manual, Auto, Skip                     | No (per-task confirmation only, D)             | Yes (O), Ask for approval or Full access             |
| Confirmation before sensitive actions     | Yes (D)                                 | Yes (D)                                         | Yes (D)                                        | Yes (D), submit, purchase, permissions, delete       |
| Prompt-injection defences documented      | Yes (D), classifiers and confirmation   | Yes (D), two classifiers                        | Yes (D), critic model and origin sets          | Unknown beyond "page content is untrusted" (D)       |
| Blocked site categories                   | Unknown                                 | Yes (D), adult and pirated content              | Unknown                                        | Unknown (user and admin lists only)                  |
| Memory                                    | Yes (D), account memory                 | Unknown for the extension                       | Preview (I), Personal Intelligence             | Yes (D), follows the Memories setting                |
| Connectors or plugins                     | Yes (D), Gmail and Calendar             | Yes (D), connectors, skills, plugins            | Yes (D), Connected Apps                        | Yes (D, O), plugins menu                             |
| File upload through the assistant         | Unknown                                 | Yes (D), images; files via Claude Code to 10 MB | Unknown in Gemini in Chrome                    | Yes (D), asks first; file URL access needed          |
| Screenshots as input or output            | Unknown                                 | Yes (D)                                         | Unknown                                        | Yes (D), screenshots enter chat context              |
| Voice                                     | Yes (D), Voice Mode                     | Yes (O), composer microphone                    | Yes (D), Live, 18+                             | Yes (O), composer microphone                         |
| Keyboard shortcut to open                 | Yes (D)                                 | Yes (O), configurable                           | Yes (D)                                        | Yes (D)                                              |
| Saved prompts or shortcuts                | Yes (D), `/` shortcuts                  | Yes (D), `/` shortcuts, schedulable             | Yes (D, I), Skills                             | Unknown for the extension                            |
| Omnibox entry                             | Yes (D), search bar takes `/` and asks  | Unknown                                         | No, iOS omnibox "starting soon" (D)            | Unknown                                              |
| Right-click context menu                  | Unknown                                 | Unknown                                         | Unknown                                        | Yes (D), Ask ChatGPT                                 |
| Writing help in text fields               | Yes (D), Inline Assistant               | Unknown                                         | Unknown                                        | Unknown                                              |
| Shopping and booking flows                | Yes (D)                                 | Conflicting (D), see section 5                  | Preview (D), cart, booking, commerce protocol  | Yes (D), purchases need confirmation                 |
| Console, network and DOM for debugging    | Unknown                                 | Yes (D)                                         | Unknown                                        | Yes (D), developer mode CDP                          |
| Workflow recording                        | Unknown                                 | Yes (D), classic side panel only                | Unknown                                        | Unknown                                              |
| Admin allowlist and blocklist             | Yes (D), per-domain modes               | Yes (D), Team and Enterprise                    | Yes (D), policy URL lists                      | Yes (D), allowlist, blocklist, `requirements.toml`   |
| Mobile app of the same assistant          | Yes (D), iOS and Android                | No (D), extension is desktop Chrome only        | Yes (D, I), iOS and Android                    | No for the extension                                 |
| Works in browsers other than the vendor's | Comet is its own browser                | Chrome only; Code also Edge and others (D)      | Chrome only                                    | Chrome, Edge, Brave, Vivaldi; Opera control only (D) |
| Free-plan access                          | Yes, limited credits (I)                | No (D)                                          | Chat yes, auto browse no (D)                   | Not listed for Free or Go (D)                        |

## 2. Per-product detail

### 2.1 Perplexity Comet and Comet Assistant

Comet is Perplexity's own Chromium browser; the assistant is part of the browser. No official standalone Comet Assistant extension for Chrome was found.
A separate official extension that lets Perplexity Computer use a desktop browser exists (below).

Sources read 2026-10-25:

- https://www.perplexity.ai/comet (platforms, assistant examples)
- https://www.perplexity.ai/help-center/en/articles/11172798-getting-started-with-comet.md
- https://www.perplexity.ai/help-center/comet/en/articles/11734688-assistant-panel.md
- https://www.perplexity.ai/help-center/comet/en/articles/13533742-inline-assistant.md
- https://www.perplexity.ai/help-center/comet/en/articles/13860420-voice-mode.md
- https://www.perplexity.ai/help-center/comet/en/articles/12658438-comet-memory.md
- https://www.perplexity.ai/help-center/comet/en/articles/12658082-control-what-comet-assistant-can-use.md
- https://www.perplexity.ai/help-center/en/articles/11897890-comet-shortcuts.md
- https://www.perplexity.ai/help-center/en/articles/13531023-managing-comet-assistant-permissions.md
- https://www.perplexity.ai/help-center/en/articles/12781449-comet-for-enterprise.md and https://www.perplexity.ai/help-center/en/articles/13015495-comet-for-enterprise
- https://www.perplexity.ai/help-center/en/articles/13529668-comet-policies-and-controls.md
- https://www.perplexity.ai/hub/blog/the-new-comet-assistant (2025-11-06)
- https://www.perplexity.ai/hub/blog/mitigating-prompt-injection-in-comet (2025-10-22)
- https://www.perplexity.ai/hub/blog/how-we-built-security-into-computer (2026-05-13)
- https://www.perplexity.ai/changelog/automations-inline-visualizations-and-gpt-6-1-sol (2026-10-05)
- https://www.perplexity.ai/changelog/role-based-access-controls-api-credentials-and-brain-for-max (2026-07-27)
- https://www.perplexity.ai/help-center/en/articles/19800006-work-with-browsers-and-apps
- https://www.perplexity.ai/changelog (index; entries 2026-03-13, 2026-03-27, 2026-04-17, 2026-05-11)

Capabilities:

- **Assistant panel (D):** runs beside the page; reads the current tab (visible text, headlines, metadata) on each request; pulls other tabs with `@`; summarises several tabs ("Summarize my last five tabs"); drafts replies, translates; acts on websites; "run as many errands in parallel as you want" while you keep browsing. Open with Opt+A (Mac) or Alt+A (Windows) (D, https://www.perplexity.ai/help-center/comet/en/articles/11642841-key-settings-to-get-you-going.md).
- **Ask and Summarize buttons, Personal Search over browsing history, natural-language tab commands, Gmail connector for email and calendar queries, built-in ad block, most Chrome extensions (D).**
- **Inline Assistant (D):** on selected text, summarise, fact-check, define, translate or ask; in input fields, rephrase, translate, free-form edit, "Help me draft", thread replies on some sites. Not in Incognito, may fail on special editors such as Google Docs. The page says it is "currently available in the Comet browser extension" (wording unclear). Changelog 2026-03-13 describes a floating panel on selection (I, index summary).
- **Voice Mode (D):** Option+Shift+V on Mac, Alt+Shift+V on Windows; ask about on-screen content, navigate by voice, context kept across tabs; 36 languages and 10 voice styles in settings.
- **Shortcuts (D):** type `/` in the search bar or assistant; create with prompt, search mode, model and source; combine several; no scheduling and no keyboard-key shortcuts described on that page.
- **Computer inside the assistant (D):** changelog 2026-07-27, "Computer is now available directly inside the Comet Assistant" for research and multi-step handoff; plan not named on the entry.
- **Memory (D):** Comet uses the Perplexity account's memory (searches, saved memories); agent actions such as browsing a site or completing a task are not stored; shared across signed-in devices; can be turned off and reviewed.
- **Shopping and delegation (D):** the Comet page lists buying products, managing inboxes, ordering groceries, planning trips; the assistant "can be paused".
- **Perplexity Computer link (D):** the 2026-10-05 changelog adds a browser extension for Computer for Chromium browsers (Chrome, Edge, Brave), "Available in Perplexity for Mac 26.38.0 and later"; the connected browser is chosen in Settings > Connectors and "Comet remains the default when installed". Changelog 2026-05-11 says Personal Computer connects local files, apps and the Comet browser to Computer.

Permissions and safety:

- **Consent (D):** the 2025-11-06 launch post says Comet asks before working through the browser and applies the choice to the whole task. Connectors "always ask for approval first" (D). Users can list sites Comet must not use for AI actions or context, and can block history access; Incognito stops history indexing (D).
- **Admin per-domain modes (D):** Browser Control, Read Only, No Access; domain rules override global rules; global choice of always allow or ask-each-time. Defaults not stated.
- **Prompt injection (D, dated 2025-10-22):** classifier on every retrieved content batch before action; external content marked untrusted; sensitive actions (sending messages, calendar changes, final orders) paused for confirmation "regardless of whether our systems detect suspicious activity"; user notified when an injection is blocked. The 2026-05-13 Computer post (D) adds a Firecracker microVM sandbox per Computer task and classifier-triggered safe stop; it describes no human approval step for Computer.
- **Independent disputes (I):** Brave and LayerX reported injection weaknesses in 2025; a 2026 retest was not found.
- **Passwords (D):** "Comet never has access to your passwords or payment data"; data stays on device by default.

Plans and access:

- Platforms (D): Mac, Windows, iOS, Android (iOS launch to all users 2026-03-27 per changelog index, I). Extensions are not supported on iOS (press, per prior file).
- The Comet page FAQ lists "Is Comet free?" with no answer (D). A June 2026 pricing explainer (I, https://www.eesel.ai/blog/perplexity-comet-pricing, last edited 2026-06-09) says Free gets sidebar Q&A, summaries, shortcuts, voice and a small credit allowance for agent tasks; Pro $20 per month includes Comet Plus; Max $200 per month adds Background Assistants; Enterprise Pro and Max add MDM and audit logs. Treat as unverified against Perplexity's own pricing page.
- Enterprise (D): MDM install on macOS and Windows, 500+ Chromium policies, agent restrictions (website restrictions, action approvals), audit logs for 50 or more Enterprise Pro seats or one Enterprise Max seat, SOC 2 Type II and GDPR with a Perplexity Enterprise account, no training on data.
- Default search must stay Perplexity for agentic features (D, Key Settings article).

### 2.2 Claude in Chrome (with Claude Code and Claude Desktop)

Sources read 2026-10-25:

- https://support.claude.com/en/articles/12012173-getting-started-with-claude-in-chrome (page says "Updated yesterday")
- https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely
- https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide
- https://support.claude.com/en/articles/13065128-claude-in-chrome-admin-controls (search snippet only, I)
- https://claude.com/claude-in-chrome and https://claude.com/pricing
- https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn
- https://code.claude.com/docs/en/chrome
- https://support.claude.com/en/articles/16607400-use-the-built-in-browser-in-claude-cowork
- https://claude.com/docs/third-party/claude-desktop/browser
- https://support.claude.com/en/articles/12138966-release-notes (no 2026 Chrome entry in the August to October range)

Capabilities (D unless stated):

- Reads pages, clicks, types, navigates, fills forms from a side panel; sees screenshots of active tabs; image upload and screenshots of screen regions.
- **Two side-panel experiences:** the Cowork-session panel (Max and Team; Pro as rollout reaches it; Enterprise when an owner enables it) with saved sessions that sync across web, Desktop and Mobile, plus skills, plugins and connectors; and the classic panel (plan then "Approve plan" or "Make changes"; workflow recording only here). "Switch back to classic" is in the three-dot menu.
- Multi-tab work by dragging tabs into Claude's tab group; background workflows while Chrome stays open; optional notifications.
- Scheduled tasks (daily, weekly, monthly, annually) from the clock icon; saved shortcuts invoked with `/`, editable and schedulable.
- Built-in knowledge of Slack, Google Calendar, Gmail, Google Docs and GitHub; contextual prompt suggestions.
- 1Password sign-in requests approved by biometrics, beta on macOS; Claude does not see the password or one-time code.
- Console logs, network requests and DOM state for debugging, mainly through Claude Code.
- Observed (O): approval menu (Manually approve, Automatically approve, Skip all approvals), composer + menu with Upload or add files, Skills, Connectors, Plugins; Recent tasks overlay; task actions including Schedule and Turn into skill; settings pages Permissions, Shortcuts, Options (open-panel shortcut shown as Command+E); microphone control; weekly usage-limit notices that mention limits shared with Claude Code.

Permissions and safety (D):

- Default in the Cowork panel is Automatically approve: Claude reviews each action for safety and pauses when needed. Manual asks before each action. Skip disables checks. The mode persists across sessions.
- Site prompt "New permissions required": Allow this action, Always allow actions on this site, Decline. Even with always allow, Claude asks before downloads, entering potentially sensitive information, and granting authorisations. Approved sites and permission history are in extension settings.
- Blocked in any mode, per the permissions guide: purchases and financial transactions, creating accounts, sensitive card or ID data, downloads from untrusted sources, permanent deletions, investment advice or trades, modifying system files, completing instructions found in emails or web content.
- Safety article: a content classifier screens incoming content and an action classifier checks each action before it runs; reinforcement-learning training and human red teaming; adult and known pirated sites blocked; financial sites ask permission; Anthropic states "the risk is not zero". Prohibited activities include bypassing CAPTCHAs and scraping facial images. The product page and Web Store call it safeguarded but advise against banking, health and credentials.
- Extension permissions listed on the getting-started page: sidePanel, storage, scripting, debugger (clicks, typing, screenshots), tabGroups, tabs, alarms, notifications, system.display, webNavigation, declarativeNetRequestWithHostAccess, offscreen, nativeMessaging, downloads, unlimitedStorage.
- Anthropic keeps basic safety-check logs for the site safety list: account ID, IP address, timestamp, OS and Chrome version; no URL or page content (D, desktop 3P browser page).

Plans and access:

- Paid plans only: Pro, Max, Team, Enterprise (D, support page, product page; pricing page comparison tables mark Free "No", Pro "Yes", Max "Yes", Team "Yes", Enterprise "Yes").
- Google Chrome only on desktop; "not supported on other Chromium-based web browsers or mobile devices" (D). Claude Code also supports Edge, and sets up detection for Brave, Arc, Vivaldi and Opera (D). Not supported in WSL (D).
- Chrome Web Store (read 2026-10-25): version 1.0.102, updated 2026-10-21, 20,000,000 users, 3.6 of 5 from 1.9K ratings (I).
- Enterprise: owner must enable Claude in Chrome and Cowork in the cloud, otherwise the classic panel is used (D). HIPAA-enabled organisations: off by default, not covered by the BAA (D). Zero data retention not supported (D, snippet of the admin article, I). Usage limits: no separate Chrome limit; one pool across web, desktop, mobile and Claude Code (D, pricing FAQ).
- Admin (D): organisation-wide switch, site allowlist and blocklist (also govern the Cowork built-in browser), managed deployment through Chrome management tools, `forceLoginOrgUUID` policy, `isLocalDevMcpEnabled` to disable the Desktop handoff.

Built-in browser in Cowork (D): separate from the extension; a pane in Claude Desktop (macOS, Windows, Linux beta), Pro and Max by default, Team and Enterprise unless an owner disables it; asks per site, blocks high-risk sites, imports cookies from Chrome, Edge or Firefox on request. Users already on Claude in Chrome keep it as the preferred browser; the setting is Settings > Cowork > Preferred browser.

### 2.3 Gemini in Chrome

Sources read 2026-10-25:

- https://support.google.com/chrome/answer/16283624 (Gemini in Chrome help)
- https://support.google.com/chrome/answer/16821166 (auto browse help)
- https://support.google.com/chrome/a/answer/16291696 (admin help)
- https://www.google.com/chrome/ai-innovations/ and https://gemini.google/overview/gemini-in-chrome/
- https://blog.google/products-and-platforms/products/chrome/gemini-3-auto-browse/ (2026-01-28)
- https://blog.google/security/architecting-security-for-agentic/ (2025-12-08)
- https://gemini.google/release-notes/ (no Chrome entry in the July to October range seen; the page was read only to character 100000 of about 160000)
- Press (I): https://techcrunch.com/2026/04/14/google-adds-ai-skills-to-chrome-to-help-you-save-favorite-workflows/, https://9to5google.com/2026/08/18/gemini-chrome-android-us/, https://9to5google.com/2026/07/30/gemini-spark-chrome-auto-browse/

Capabilities (D unless stated):

- **Ask Gemini** in the toolbar opens a side panel (pop out or dock); current tab by default, up to 10 tabs shared, `@` adds a tab; summarise, explain, quiz, compare, recommend, modify recipes, draft Gmail messages, look up past photos; questions about audio and video already played ("Media understanding" on by default); Live voice chat; Calendar events and YouTube summaries.
- Image editing in the panel with the Nano Banana image model (D, Google blog; Android also per 9to5Google, I). Connected Apps (Gmail, Calendar, YouTube, Maps, Google Shopping, Google Flights, D, blog 2026-01-28). Personal Intelligence "in the coming months" at that date (D); the Android tools menu toggle for it is reported by 9to5Google 2026-08-18 (I).
- **Skills in Chrome:** the ai-innovations page lists saving and reusing prompts with one click (D, no availability). Launch details are press only (I, TechCrunch 2026-04-14): save a prompt from chat history, run with `/` or the plus button on the current page and selected tabs, desktop, signed in, English (US) at launch, confirmation before sending email or adding events.
- **Select Content** (ask about a selected image, paragraph or product) is listed as "Coming soon" (D, ai-innovations).
- Settings (D): Settings > AI innovations > Gemini in Chrome; icon placement, Mac menu bar or Windows tray icon, keyboard shortcuts, precise location, microphone, share current tab by default, Let Gemini browse for you. Not in Incognito. Chrome sign-in required.

Auto browse (D, help page 2026-10-25 read, labelled experimental by Google):

- Start from Ask Gemini, review the plan, click Start Task. A tab shows an auto browse icon; a browser notification appears when a step needs the user. Runs on local Chrome or a remote cloud browser (the page says remote is used on mobile and may be used if the desktop is off).
- Confirmation before: starting, sending communications, modifying data, submitting forms, scheduling events, sensitive financial or health sites. First use per device asks permission to connect auto browse to Gemini.
- Take over any time ("Take over task"), then "Resume" or "Give back task"; Gemini may ask the user to finish transactions, accept terms or create accounts.
- With permission it can use Google Password Manager and Sign in with Google; Google says passwords are not shared with Gemini. Sites are managed under "Sites Gemini can sign you in to".
- Stop from the panel or by closing the task tab. The page says the user is "responsible for Gemini's actions during a task, including mistakes".
- Commerce: Google describes an open commerce protocol co-developed with Shopify, Etsy, Wayfair and Target (D, blog 2026-01-28).

Security architecture (D, blog 2025-12-08): a User Alignment Critic reviews each planned action seeing only action metadata; Agent Origin Sets limit which origins the agent may read or act on; confirmations before sensitive sites, Password Manager sign-in and consequential actions; a prompt-injection classifier on each page; automated red teaming. Google states it cannot catch everything.

Plans and access:

- Gemini in Chrome (D): 13 or older (or local age), latest Chrome, Windows, Mac, Chromebook Plus (iOS "Page tools"; Android varies); "rolling out to users over time", select regions and supported languages, 18 or older for Live and auto browse; work or school accounts need admin enablement; under 18 cannot use Live or auto browse. The chat features list no subscription requirement on the help page.
- Auto browse (D): US only, 18 or older, English device language, personal account, Google AI Pro or Ultra, Safe Browsing set to Enhanced or Standard; limits of up to 20 requests per day on Pro and up to 200 on Ultra; "only available on desktop"; not on iPhone or iPad; not in Live chats.
- Android (I): 9to5Google 2026-08-18 reports Gemini in Chrome for all US Android users and auto browse for Pro and Ultra there. This contradicts the help page's "only available on desktop"; see section 5.
- Gemini Spark (I, 9to5Google 2026-07-30): Google's cloud personal agent can now drive desktop Chrome through auto browse with the user's permission, using logged-in accounts and saved passwords; US first, Pro subscribers; Chrome Enterprise help also lists a `GeminiSparkSettings` policy (D).
- Admin (D): access needs both the Gemini app setting and Chrome's `GeminiSettings` policy; auto browse is off by default for managed users, enabled with `GeminiActOnWebSettings` on listed Workspace editions, with `GeminiActOnWebAllowedForURLs` and `GeminiActOnWebBlockedForURLs`; prompts, tab context and responses are not used to train models for managed users.

### 2.4 ChatGPT browser extension, desktop browser and Codex

Sources read 2026-10-25:

- https://learn.chatgpt.com/docs/chrome-extension
- https://learn.chatgpt.com/docs/browser
- https://learn.chatgpt.com/docs/computer-use
- https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security.md
- https://learn.chatgpt.com/docs/get-started-with-work.md
- https://learn.chatgpt.com/docs/pricing.md
- https://learn.chatgpt.com/docs/whats-new (read to character 100000 of about 102800)
- https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg
- Atlas shutdown: https://help.openai.com/articles/20001371 returned HTTP 403; used https://9to5mac.com/2026/08/04/openai-explains-what-will-happen-when-chatgpt-atlas-shuts-down-this-weekend/ and a search snippet of the help article (I)

ChatGPT Atlas, OpenAI's standalone Mac browser with an agent mode, was scheduled to stop working on 2026-08-09; OpenAI points users to the ChatGPT desktop app's built-in browser and the Chrome extension (I). The 9to5Mac article does not use the term "agent mode". A community forum thread reports control stopped early after an update (I). There is no current ChatGPT browser product other than the extension and desktop tools.

Extension capabilities (D unless stated):

- **Side chat** in Chrome, Edge, Brave and Vivaldi from the toolbar or Extensions menu; the panel stays with the tab where it opened; chats started there appear in the ChatGPT app and recent app chats open in side chat. Opera has no side chat; its tasks start in the desktop app.
- Mention open tabs; bring selected text; right-click **Ask ChatGPT**; YouTube timestamped transcript Q&A when captions exist.
- Control tabs in the background "without taking over" the session (Web Store listing and 2026-05-04 What's New entry); research on authenticated sites; enter data into record systems; file expenses, bulk downloads, test websites, organise tabs (competitor-surfaces examples, D).
- **Site tools** through the built-in browser (WebMCP) in What's New 2026-08-24; unavailable in Enterprise or Edu workspaces. The desktop settings screenshot shows "Use site tools by default" (O).
- Developer mode: controlled Chrome DevTools Protocol access in the built-in browser and Chrome, off by default, explicit approval per site, marked Elevated risk, admin-disableable (D).
- Observed in the extension (O): action-approval menu (Ask for approval, Full access), + menu with Files and folders, Goal, Plan mode, plugins (Documents, PDF, Spreadsheets, Presentations, Browser), More menu with "Chrome computer use settings" and a version footer, microphone, Stop button during work, pin prompt.
- Desktop built-in browser (D): separate profile and sign-ins, split view, annotation comments on page elements, Adjust style feedback, download controls, history search with an ask-each-time prompt, no automated file uploads.
- Cloud browser in ChatGPT Work (D): separate cloud computer, scheduled and long-running work with the laptop closed, credentials entered through a secure form not visible to the model, a review model checks sign-in requests for phishing; sign-in not available for Enterprise or Edu.

Permissions and safety (D):

- Asks per new site by host: Allow once, Allow for this site, Allow for all sites (Elevated Risk), Decline; allowlist and blocklist under Settings > Computer Use > Manage.
- Browser history use asks each time with no always-allow, Elevated Risk.
- Confirmation before submitting data, purchases, permission changes or deletions.
- Page content, selected text and transcripts are treated as untrusted context. No injection classifier or critic is described on the pages read.
- Chrome install prompt may include page debugger access, read and change all sites, history, bookmarks, downloads, "native app communication" and tab groups.
- OpenAI stores browser activity only when it becomes chat context (page text, screenshots, tool calls, summaries). For the extension, "OpenAI does not store a separate complete record of Chrome actions".
- Managed policy keys (D): `features.browser_use`, `features.browser_use_external` (disables the extension path), `features.in_app_browser`, `features.computer_use`, `browser_use_full_cdp_access`. The Computer Use path through a browser is not covered by Browser Use site policies (D).

Plans and access:

- The pricing page (D) marks "Use ChatGPT with Chrome (browser control)", "Computer Use" and "Computer Use in the browser" as **Limited** for Plus, Pro, Business and Enterprise, region-limited, and does not list Free or Go. Built-in browser previews and comments, and Browser in ChatGPT Web: Available. Cloud browsing: all paid plans except Free and Go (D, browser page); Enterprise admins must enable it.
- The extension docs name no plan and say availability depends on rollout and workspace settings. June 2026 What's New: Computer Use and the Chrome extension began rolling out to the EEA, UK and Switzerland.
- Chrome Web Store (read 2026-10-25): version 1.26.1020.11845, updated 2026-10-22, 7,000,000 users, 2.1 of 5 from 1.1K ratings (I).
- Codex (D, browser page): the built-in browser and Chrome use work in the desktop app via `@Browser` and `@Chrome`; "not available in Codex CLI or the Codex IDE extension". Browser tools are used in ChatGPT Work and Codex chats of the one desktop app.

### 2.5 Microsoft Copilot in Edge (brief)

Edge is a browser with Copilot built in, not an extension. It changes the picture in three ways. Sources: https://blogs.windows.com/msedgedev/2026/05/13/new-updates-to-edge-across-desktop-and-mobile/ and https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-local-browser (ms.date 2026-09-23), both D.

- **Consumer Copilot in Edge (D, 2026-05-13):** multi-tab reasoning, browsing history and long-term memory with permission, Vision and Voice, Journeys, writing assistant (US only), quizzes, podcasts from tabs; Copilot Mode retired. **Browse with Copilot** (agentic, formerly Copilot Actions) is US only for Microsoft 365 Premium with usage limits.
- **Cowork browser use (D, 2026-09-23):** runs tasks in a hidden tab of the user's own Edge with their sign-ins; approval cards for sensitive actions; user takes over at CAPTCHA, credentials, MFA and locked accounts; inherits Conditional Access, web filtering and Purview DLP; disabled until a tenant admin enables it; Edge 152 or later; works only from Cowork on the web, not the desktop app or mobile.
- No official Copilot extension for Chrome was confirmed (prior file, D).

## 3. Plans and access summary

| Item                | Comet                                                | Claude in Chrome                                             | Gemini in Chrome                                            | ChatGPT extension                                          |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Free plan           | Browser and assistant usable; credit-limited (I)     | No (D)                                                       | Chat yes in supported regions; auto browse no (D)           | Not listed for Free or Go (D)                              |
| Paid tiers named    | Pro, Max, Enterprise Pro, Enterprise Max (I)         | Pro, Max, Team, Enterprise (D)                               | Google AI Pro and Ultra for auto browse (D)                 | Plus, Pro, Business, Enterprise, all "Limited" (D)         |
| Agent limits        | Credits by plan; numbers not on a Perplexity page    | One shared usage pool; no Chrome-specific cap (D)            | 20 per day Pro, 200 per day Ultra (D)                       | Plan allowance; region-limited (D)                         |
| Regions             | Not stated                                           | Not stated                                                   | US only for auto browse; select regions for chat (D)        | Region-limited; EEA, UK, Switzerland added June 2026 (D)   |
| Preview or GA       | Assistant launched to all users 2025-11-06 (D)       | "Now generally available" banner (D)                         | Auto browse experimental or preview (D)                     | Rolling out by workspace; plan table says Limited (D)      |
| Platforms           | Mac, Windows, iOS, Android (D)                       | Chrome on desktop (D)                                        | Chrome desktop, Chromebook Plus, iOS, Android US (D, I)     | Chrome, Edge, Brave, Vivaldi, Opera control (D)            |
| Enterprise controls | MDM, 500+ policies, per-domain modes, audit logs (D) | Org switch, allow and blocklists, org pinning, HIPAA off (D) | Admin console plus policies; auto browse off by default (D) | `requirements.toml` feature flags, site and CDP policy (D) |

## 4. Account, desktop, CLI and IDE connections

| Product          | Sign-in model                                                  | Pairs with                                                             | Mechanism                                                | Sync                                                                                     |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Comet            | Perplexity account in the browser                              | Perplexity for Mac (Computer); Comet is the default browser for it (D) | The extension for Computer: mechanism not documented (U) | Memory shared across devices on the account (D); chat history sync not documented (U)    |
| Claude in Chrome | Extension signs in to the claude.ai account (D)                | Claude Desktop, Claude Code CLI and VS Code extension (D)              | See below                                                | Cowork-session panel history saved and synced across Chrome, Desktop, web and Mobile (D) |
| Gemini in Chrome | Chrome's own Google sign-in (D); personal or Workspace account | The Gemini app account, Connected Apps, Gemini Spark (D, I)            | Built into Chrome; no extension or native host           | Recent chats in the panel; Gemini Apps Activity can be reviewed and deleted (D)          |
| ChatGPT          | Same ChatGPT account in the desktop app and the extension (D)  | ChatGPT desktop app (required), Codex in that app (D)                  | See below                                                | Side-chat chats appear in the ChatGPT app and recent app chats open in side chat (D)     |

**Claude, how the extension reaches Claude Code and Claude Desktop (D, code.claude.com/docs/en/chrome and the Claude support pages):**

- Claude Code starts with `claude --chrome`, or `/chrome` to check status, reconnect, choose a browser and set **Enabled by default**; in VS Code, `@browser` or the same default switch. Needs extension 1.0.36 or later and a direct claude.ai login (Pro, Max, Team, Enterprise); API keys, long-lived tokens and third-party providers keep it off.
- First enable writes a **native messaging host** manifest, `com.anthropic.claude_code_browser_extension.json`, into the browser's `NativeMessagingHosts` folder (macOS, Linux; Windows registry); Chrome reads it on startup. Edge and other Chromium browsers read their own folders.
- Troubleshooting also names `bridge.claudeusercontent.com`, so a cloud relay is part of the connection; the extension and Claude Code must be signed in to the same claude.ai account **and organisation** or tools return "Browser extension is not connected". Windows uses a named pipe.
- A repository cannot enable it: a project's `CLAUDE_CODE_ENABLE_CFC` setting is ignored.
- Site permissions are inherited from the extension; in Claude Code auto mode, the classifier's approval skips the extension's per-site check unless a permission rule denies the site.
- Claude Code uploads local files up to 10 MB in total, refuses credential-named files, records GIFs, saves screenshots, pauses at login and CAPTCHA, and groups opened tabs under a session tab group.
- Claude Desktop: a **Claude in Chrome connector** under Settings > Customize > Connectors, off by default per conversation; local tasks need the Desktop app open and connected. In Desktop 3P deployments the extension connects automatically when signed in with the same work account and "Allow local MCP servers" is on.
- The getting-started page lists the `nativeMessaging` extension permission as for Desktop and Claude Code "once we enable that capability", while the Claude Code page describes the native host as working today (conflict, section 5).

**ChatGPT, how the extension reaches the desktop app and Codex (D):**

- Setup is from the desktop app: Settings > Computer Use, choose the browser, Install opens the store, then the browser shows "Manage". Then `@` the browser in a **ChatGPT Work or Codex chat** in the desktop app. Opera uses the app for tasks.
- The Chrome install prompt lists "native app communication" (D). The channel between the extension and the app beyond that is not documented (U); Computer Use docs show Chrome reporting "Connected to browser extension for additional control".
- One account signs in across the desktop app, the extension and Codex (prior file D). Codex CLI and the IDE extension cannot use the browser tools (D).
- Cross-device: eligible Work tasks continue across desktop, web and mobile with sync on (D).

**Perplexity (D):** the extension for Computer needs Perplexity for Mac 26.38.0 or later (changelog 2026-10-05) and the help article "Work with Browsers and Apps" states Comet is Mac only with no extension, so the two Perplexity pages disagree on how the desktop app reaches a browser.

**Gemini (D):** no desktop app or CLI link for the assistant itself. Antigravity browser tools via a `/browser` command appear in the prior file as unconfirmed.

## 5. What could not be verified

Conflicts between sources:

- Claude purchases: the permissions guide lists purchases and financial transactions as blocked in every mode; the product page says "purchases and financial actions wait for user approval". Which wording is current is unknown.
- Claude `nativeMessaging`: the getting-started page says the capability is not yet enabled; the Claude Code page documents a working native host. Both are D.
- Gemini auto browse on Android: the help page 16821166 says desktop only; 9to5Google (2026-08-18) reports Android auto browse. The same help page mentions a remote browser on mobile. Google's own ai-innovations page contradicts itself on Android and iOS.
- Gemini auto browse for Workspace: the admin help page says off by default for managed users, with policies for listed editions; April 2026 press said available to eligible US Workspace users. The admin page is the higher rank source.
- Perplexity: "Work with Browsers and Apps" says Comet is Mac only; the Comet page says Mac, Windows, iOS and Android. The Computer extension is on the changelog but not in that article.
- Web Store counts moved in one day: Claude 19 million to 20 million users, ChatGPT 1.9 to 2.1 rating (prior file against this read). Rounded display, not a change in the product.

Not found or not read:

- Comet: Free-plan agent allowance and Pro or Max assistant quotas from a Perplexity page (only a third-party explainer); whether chat history syncs; selected-text and screenshot behaviour in the assistant panel; the exact text of the permissions article (the fetched summary cited a different article URL, so treat the per-domain modes as D with a caveat); any Comet Assistant approval defaults; whether Android and iOS assistants match desktop.
- Claude: whether the extension uses memory (the screenshots show a model answer that mentions memory, a self-report); selected-text, omnibox and context-menu behaviour; prompt-injection numbers (the safety page quotes a benchmark figure tied to a model version, not recorded here); the admin-controls article read only as a search snippet; whether Claude Desktop reaches the extension through native messaging or the cloud relay when not in 3P mode.
- Gemini: exact limits for chat features; whether Gemini in Chrome supports file upload, screenshots, per-site user grants, or text-field writing help (Chrome's separate writing features were not read); whether Skills has expanded beyond the desktop English (US) launch; Personal Intelligence status in Chrome on desktop; the Gemini release notes were read only to character 100000 of about 160000.
- ChatGPT: the Atlas help article (HTTP 403); the extension's own permission list (Web Store page showed none); prompt-injection defences; take-over and hand-back for the extension; scheduled tasks in the extension itself; saved prompts or skills in side chat; the exact keyboard shortcut (the docs text is truncated); the channel between the extension and desktop app; plan eligibility beyond the pricing page's "Limited".
- Edge: only two Microsoft pages were read; Edge 152 policy name and Browse with Copilot usage limits are unverified.
- Everything under "O" came from 2026-10-13 screenshots of one account; versions and rollout cohorts there may differ from today (the ChatGPT extension showed version 1.26.901.11451 then, 1.26.1020.11845 on the store now).
- No product was driven for this research, so no claim here is tested behaviour. Account-specific availability (plan, region, rollout cohort, admin policy) cannot be inferred from vendor pages.
