# ChatGPT Chrome UI reference, October 13, 2026

Status: Dated observed evidence
Owner: Chrome extension product and engineering
Captured: October 13, 2026, 05:18:15–05:35:29 America/Chicago
Source: All 11 ChatGPT screenshots and all four subsequent mixed browser-tool screenshots supplied by the user

This inventories the supplied pixels. It does not establish that the displayed
capabilities were exercised. The first batch shows Chrome side chat and separate
ChatGPT desktop settings. The second shows two ChatGPT replies and two Claude
replies beside OpenAI documentation. Tool lists in model replies are **model
self-reports**, not execution traces. The related [13-image Claude reference](claude-chrome-ui-reference-2026-10-13.md)
records the earlier supplied batch; together these notes cover all 28 images.

Original PNGs and SHA-256 manifests are preserved privately in
`/tmp/agi-extension-haiku-2026-10-12/chatgpt-reference-2026-10-13/` and
`/tmp/agi-extension-haiku-2026-10-12/browser-tools-reference-2026-10-13/`.
Each original is 2940 × 1912 physical pixels and has mode 0600. The manifests
retain original paths, capture times, dimensions, image order and hashes.
Personal account identifiers are not reproduced here. Physical screenshot
pixels do not establish CSS dimensions, exact fonts, semantic color tokens,
contrast ratios, focus behavior or accessible names.

## Evidence index and ordering

Image numbers retain attachment order. In particular, first-batch images 10 and
11 were captured before images 8 and 9; attachment order is not a chronology.

| Batch/image | Private preserved filename      | Local capture time | Visible state                                           |
| ----------- | ------------------------------- | ------------------ | ------------------------------------------------------- |
| ChatGPT 01  | `01-chatgpt-chrome-5-18-15.png` | 05:18:15           | Central monochrome logo, no inner chat toolbar/composer |
| ChatGPT 02  | `02-chatgpt-chrome-5-18-25.png` | 05:18:25           | Pin prompt and composer                                 |
| ChatGPT 03  | `03-chatgpt-chrome-5-18-41.png` | 05:18:41           | Action-approval menu                                    |
| ChatGPT 04  | `04-chatgpt-chrome-5-18-52.png` | 05:18:52           | Add/plugin menu                                         |
| ChatGPT 05  | `05-chatgpt-chrome-5-19-06.png` | 05:19:06           | More menu and extension version                         |
| ChatGPT 06  | `06-chatgpt-chrome-5-19-12.png` | 05:19:12           | Multicolor central logo                                 |
| ChatGPT 07  | `07-chatgpt-chrome-5-19-43.png` | 05:19:43           | Desktop Google Chrome settings                          |
| ChatGPT 08  | `08-chatgpt-chrome-5-26-20.png` | 05:26:20           | Capabilities response, upper portion                    |
| ChatGPT 09  | `09-chatgpt-chrome-5-26-28.png` | 05:26:28           | Same response, lower portion                            |
| ChatGPT 10  | `10-chatgpt-chrome-5-20-38.png` | 05:20:38           | Desktop Computer use settings                           |
| ChatGPT 11  | `11-chatgpt-chrome-5-25-54.png` | 05:25:54           | Working/skill activity and Stop                         |
| Tools 01    | `01-browser-tools-5-34-09.png`  | 05:34:09           | ChatGPT browser-tool table                              |
| Tools 02    | `02-browser-tools-5-34-23.png`  | 05:34:23           | ChatGPT tool explanation, lower portion                 |
| Tools 03    | `03-browser-tools-5-35-20.png`  | 05:35:20           | Claude browser-tool reply, upper portion                |
| Tools 04    | `04-browser-tools-5-35-29.png`  | 05:35:29           | Claude browser-tool reply, lower portion                |

## Shared Chrome and side-chat structure

Unless a per-image change is listed, first-batch browser images share these
details. Desktop images 7 and 10 are a different application surface.

- The macOS Chrome window has red, gray and green window controls, tab-search
  chevron, an orange **Claude** tab-group label, active **Claude in Chrome** tab
  with sunburst favicon and orange group outline, tab close × and new-tab +.
  **Ask Gemini**, with a multicolor symbol, is at the tab strip's upper right.
  A small purple dot at the screen's extreme upper right is visible; its cause
  is unknown.
- Chrome's toolbar contains Back, dimmed Forward, Reload, site-controls icon,
  `claude.ai/chrome/installed`, an install/save-looking icon, bookmark star,
  extensions puzzle, side-panel icon, profile circle and three-dot browser menu.
  These are browser controls, rather than controls belonging to either assistant.
- A browser restore-tabs banner spans the webpage: Chrome logo, a message about
  restoring tabs on restart, underlined blue **Settings** link and dismiss ×.
- The left webpage has a near-black background, orange sunburst and white serif
  Claude wordmark; centered two-line **Claude's in your Chrome** heading;
  secondary warning about imperfect or risky website/task behavior; white
  rounded **Try a demo** button; and a divider above **Give Claude a challenge**.
  The latter has introductory copy and a partly clipped rounded challenge card,
  **CHALLENGE 1**, the visible beginning about meeting RSVPs, an orange play
  button and hand-drawn arrow/loop decorations. The clipped text is not completed
  from inference.
- A narrow neutral gutter separates the webpage from the native browser side
  panel. Its host header has the white ChatGPT knot and **ChatGPT** at left,
  pin and close × at right. Inside is a rounded near-black chat surface.
  Once loaded, the inner header shows centered **New chat** with down-chevron
  and a right ellipsis; an existing conversation adds a new-chat/edit icon at
  left and its title in the middle.
- The bottom composer is an inset, rounded dark-gray multiline surface with a
  subtle neutral border. Placeholder: **Do anything**. The lower row contains
  +, orange shield approval icon, **6.1 Sol Medium** with a down-chevron,
  microphone and a circular up-arrow Send control. The empty Send control looks
  muted; pixels alone do not prove its disabled attribute. The model/effort
  menu is not open in any supplied image, so its choices cannot be inferred.
- Menus use dark neutral rounded surfaces, restrained separators, pale primary
  text and gray descriptions. Orange identifies selected full access; blue is
  used for settings toggles and links. ChatGPT's central knot is monochrome in
  several views and rainbow-colored in image 6. Neither still proves animation.
- The captured side chat has no permanent multisection navigation, manual
  browser-action form, tool JSON editor, service URL or token input. Settings
  are reached through a compact More menu. This is a visible information
  hierarchy, not proof that advanced controls are absent elsewhere.

## ChatGPT image 1: initial logo state, 05:18:15

- The ChatGPT host header, pin and close controls are present beside the Claude
  installation page.
- The inner panel contains only a large centered gray knot. No inner title,
  composer, user message, answer or progress line is visible.
- This is a loading/empty-looking capture; the cause and duration are unknown.
  It does not establish that a composer must always be hidden while loading.

## ChatGPT image 2: pin prompt and composer, 05:18:25

- A rounded prompt appears at the panel top with a thin blue glow/border and an
  upward arrow pointing toward the host pin area.
- Its copy is **Press [pin icon] to keep ChatGPT in your bar**, **Access ChatGPT
  from any tab**, and muted **Not now**. The displayed pin symbol is inline.
- The monochrome knot remains central. The composer is now visible with the
  shared placeholder, +, orange shield, model/effort, microphone and muted Send.
- The inner New chat header is not yet shown. A screenshot transition does not
  establish whether pinning, dismissal or background loading produced the change.

## ChatGPT image 3: action-approval menu, 05:18:41

- A menu opens above the orange shield control, aligned inside the composer
  width, with rounded dark-gray fill and neutral outline.
- Header: **How should ChatGPT actions be approved?**; underlined **Learn more**
  is right-aligned.
- **Ask for approval** has an outlined hand icon and gray description about
  always asking to edit external files and use the internet.
- **Full access** has an orange shield icon, orange title/description about
  unrestricted internet and computer-file access, and a right orange checkmark.
  This is the selected visible mode. It is not evidence that every action is
  exempt from all other permissions or organization policy.
- The central logo and composer remain behind the menu. The pin prompt is gone.

## ChatGPT image 4: Add and plugins menu, 05:18:52

- The inner header now shows **New chat** with a down-chevron and right ellipsis.
- The + control is open, with a tall rounded menu extending upward from the
  composer. Its visible rows, in order, are:

| Group/row         | Icon and visible supporting copy/state                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Add               | Muted section label                                                                          |
| Files and folders | Paperclip; highlighted neutral rounded row                                                   |
| Goal              | Circular target-like icon; **Set a goal to keep pursuing**                                   |
| Plan mode         | Lightbulb; **Turn plan mode on**                                                             |
| Plugins           | Muted section label                                                                          |
| Documents         | Blue document icon; **Create and edit documents**                                            |
| PDF               | Red PDF icon; **Read, create, and verify PDFs**                                              |
| Spreadsheets      | Green sheet icon; **Create and edit spreadsheets**                                           |
| Presentations     | Yellow/orange slide icon; **Create and edit presentations**                                  |
| Template Creator  | Dark four-symbol icon; description visibly truncates after **Create or update reusable te…** |
| Browser           | Blue browser/window icon; **Control the in-app browser**; bottom row near menu edge          |

- Muted rows/descriptions are visibly lower contrast than the highlighted file
  row, but no disabled DOM state or plugin installation result is established.
- The menu identifies Browser as the in-app browser; it must not be relabeled
  as the existing Chrome-profile tool merely because it appears in Chrome chat.

## ChatGPT image 5: More menu and version, 05:19:06

- A compact menu is anchored beneath the right ellipsis near the panel top.
- Rows: **App settings** with diagonal external/open arrow; **Chrome computer
  use settings** with the same arrow; muted footer **ChatGPT for Chrome** and
  **v1.26.901.11451**.
- The footer establishes the visible extension version in this capture, not
  the desktop app version. Neither settings link has been exercised in this image.
- The central monochrome knot, New chat header and empty composer remain.

## ChatGPT image 6: multicolor knot, 05:19:12

- The menus are closed; the center knot now has yellow, green, cyan, blue,
  purple, pink and orange segments.
- New chat, ellipsis and the same empty composer remain unchanged visibly.
- There is no working label, tool receipt or answer. A static rainbow logo
  cannot distinguish idle branding, loading or an animation phase.

## ChatGPT image 7: desktop Google Chrome settings, 05:19:43

This is the ChatGPT macOS application, not Chrome's side-panel settings page.

- macOS menu bar: Apple, **ChatGPT**, **File**, **Edit**, **View**, **Window**,
  **Help**; system status icons and **Tue Oct 13 5:19 AM**. The window has red,
  yellow and green controls and dimmed navigation arrows. Purple desktop
  wallpaper and the macOS Dock remain visible around/below it.
- An icon rail shows Home with a blue dot, stacked-page icon, clock/history,
  circular assistant-like icon, ellipsis, divider, branch/network icon and
  four-square grid. A circular account avatar is at bottom; its identity is omitted.
- Settings sidebar: **Settings**, search pill with magnifier and **Search**;
  **Personal** section; **General**, **Notifications**, **Import**, **Profile**
  (external arrow), **Appearance**, **Account**, **Archived chats**, **Parental
  controls**, **Trusted contact**, **Voice**, **Storage**, **Configuration**,
  **Personalization**, **Mini & Pets**, **Keyboard shortcuts**, **Usage & billing**,
  **Data controls**; then **Integrations**, **Plugins**, **Passwords**, with the
  selected Computer use row only partly visible at the bottom. Each row has an
  outlined icon appropriate to its label. Lower unseen items are not inferred.
- Main breadcrumb: **Computer use > Google Chrome**. Large **Google Chrome**
  heading, red-dot **Not installed** badge, muted **Reinstall extension** and
  red-tinted **Remove extension** buttons. They look subdued; enabled behavior
  is not established from the still.
- **Browser permissions** is followed by a rounded outlined two-row card.
  **History** explains asking before browser-history access, with a right
  **Always allow** dropdown. **Use site tools by default** describes discovering
  and calling website tools, including WebMCP, unless a site has different
  permissions; its blue toggle is visibly on.
- **Agent permissions** includes descriptive text about defaults/site exceptions
  and a right **+ Add** button. An outlined table has **Site or pattern**,
  **Browsing**, **Downloads** headings and small horizontal chevrons at its
  upper right, indicating additional sideways content without exposing its rows.
  Both **Default** and **http://localhost:3000** display **Always allow** for
  Browsing and Downloads. The site row has a trash icon. Below: **Only sites
  with custom permissions appear here**.
- **Developer mode** starts another card. Orange shield and **Elevated risk**,
  **Enable full CDP access**, beginning of a description about full Chrome
  DevTools Protocol access in connected Browser…, and blue on-toggle are visible.
  The rest is clipped below the window, so its complete copy is unknown.
- Dock icons include Finder, Launchpad, Mail, Photos, FaceTime, Reminders, Notes,
  two question-mark placeholders, App Store, System Settings, Terminal, a divider,
  ChatGPT with badge **5**, an unidentified dark/teal app, Chrome for Testing,
  Chrome, a blue folder and Trash. These are OS context, not browser permissions.

## ChatGPT image 8: capabilities answer, upper portion, 05:26:20

- Back in Chrome, the inner conversation title is **Explain capabilities** with
  down-chevron; left new-chat/edit icon and right ellipsis. A compact right
  aligned user bubble asks **what can you do?**.
- **Worked for 19s** and a right chevron sit above a divider. This is a completed
  activity disclosure; the still does not show its expanded content.
- The response uses white sans-serif body text, bold phrases, paragraph spacing
  and a two-column table headed **What I can help with** / **Example request**.
  It says it can answer questions and carry out tasks with Chrome, local files
  and session tools. Visible table rows:
  - **Read and explain webpages**: summarize the page, explain a section, extract
    key facts into a table.
  - **Work in Chrome**: navigate to settings/change an option, fill a form,
    collect information from tabs.
  - **Research and compare**: compare three products using current sources and
    recommend one for the requester's needs.
  - **Write and edit**: email rewrite/proposal review/notes-to-report examples
    begin here and continue in image 9.
- A circular downward arrow overlays the lower answer as a scroll-to-bottom
  affordance. The composer stays fixed while answer content scrolls behind it.
- These are examples in the model's answer, not successful browser/file tests.

## ChatGPT image 9: capabilities answer, lower portion, 05:26:28

- The same conversation is scrolled lower; table continuation is visible:
  - **Write and edit**: rewrite email, review proposal, turn notes into a report.
  - **Build and fix software**: build a website, fix a bug, explain code, run tests
    and resolve failures.
  - **Analyze data and create files**: clean a spreadsheet, chart results,
    create a PDF/document/slide deck.
  - **Create visuals**: generate illustration, edit an image, show an interactive
    explanation.
- A blue linked **OpenAI's use-case guide** appears with the OpenAI icon. The
  response qualifies that browser/file capabilities depend on this session's
  tools and external-account work depends on site/connection access.
- A final paragraph invites a plain-language outcome, with the example about
  reading a page and explaining what to do next in bold.
- Copy and combined thumbs feedback icons are beneath the answer. No screenshot
  proves that copying, feedback or the cited link was activated.
- The composer remains empty with +, orange shield, 6.1 Sol Medium, microphone
  and the up-arrow Send button. There is no ongoing Stop control in this image.

## ChatGPT image 10: desktop Computer use settings, 05:20:38

- This desktop capture precedes images 8 and 9 by timestamp. macOS/window/Dock
  boundaries match image 7; the menu-bar time is **5:20 AM**.
- The scrolled Settings sidebar starts at **Account**, then **Archived chats**,
  **Parental controls**, **Trusted contact**, **Voice**, **Storage**,
  **Configuration**, **Personalization**, **Mini & Pets**, **Keyboard shortcuts**,
  **Usage & billing**, **Data controls**. Under **Integrations**: **Plugins**,
  **Passwords**, selected **Computer use**, **Computer history**, **Appshots**,
  **Browser**, **Cloud computer**. A **Coding** heading and only a clipped start
  of the next row appear at the bottom; that unseen row is not named.
- Main heading: **Computer use**; subheading about managing ChatGPT's use of other
  computer applications; **Control** section.
- The first outlined card contains **Any App**, colorful pointer icon, copy about
  controlling computer apps, blue on-toggle; **Google Chrome**, Chrome icon with
  small overlay and red-dot **Browser extension not installed**, with no visible
  toggle; **Microsoft Excel**, Excel icon with overlay, add-in control description
  and blue on-toggle.
- A separate card shows laptop/lock icon, **Locked use**, copy about using the Mac
  when locked, blue **Learn more** link and blue on-toggle.
- **Always-allowed apps** contains an empty outlined card centered on **None yet**.
  An enabled Any App toggle and an empty always-allowed list are separate visible
  states; their interaction is not inferred.

## ChatGPT image 11: working/skill state and Stop, 05:25:54

- The **Explain capabilities** conversation and **what can you do?** bubble are
  present before the final answer captures.
- **Working for 9s** appears above a divider. Visible interim text says it will
  check Codex capability guidance for an accurate session overview.
- A small wrench/tool icon precedes muted **Reading OpenAI Docs skill**. This
  displays the invoked skill's human name rather than a raw tool payload.
- The composer retains its other controls, but Send is replaced by a light
  circular button containing a dark square Stop symbol. It is visible during
  this working state; no cancellation click or outcome is supplied.

## Additional tools batch: shared OpenAI documentation page

All four images keep Chrome's native controls/restore-tabs banner. The active
tab is now **Browser extension | ChatGPT**, with an OpenAI favicon, within the
same orange Claude tab group. URL: `learn.chatgpt.com/docs/chrome-extension`.
The orange group label is browser grouping, not the page's vendor identity.

- The page has a black ground and OpenAI knot at upper left. Main navigation:
  **Home**, selected rounded **Docs**, **Use cases**, **Training**, **Resources**;
  white **Try ChatGPT** with external arrow, moon/theme icon and search icon.
- Secondary navigation: **Overview**, selected/underlined **Features**,
  **Configuration**, **Developers**, **Security**, **Administration**.
- Left navigation visibly lists **Overview**; **Workflows** with **Projects and
  chats**, **Sites**, **Build plugins**, **Visualizations**, **Scheduled tasks**,
  **Long-running work**, **Notifications**, **Pets**, **Codex Micro**; then
  **Capabilities** with **Browser**, **Computer use**, **Voice**, **Plugins**,
  **Sign in with ChatGPT**. Unseen lower entries are not added.
- In images 1/2, main content shows **Browser extension**, subtitle naming Chrome,
  Edge, Brave, Opera and Vivaldi; white **Copy Page** with overlapping-squares icon;
  introductory paragraphs covering existing sessions, side-chat/browser support
  differences, desktop update/rollout, separate **@Browser** and tool choice.
  An orange bordered warning calls page content untrusted context. **Use side
  chat in your browser** begins at the bottom. A floating white **Ask AI** pill is
  at the webpage's lower right. These page controls are not side-chat controls.
- In images 3/4 the main document is scrolled to **Use side chat in your browser**,
  introductory copy, three numbered setup/request steps, macOS keycap display
  **Cmd + Shift + .**, and a paragraph about panel/tab location and recent-chat
  continuity. An embedded blue-backed browser illustration is partly visible.
  It depicts a **Launch dashboard**, `dashboard.example.com`, **Work** profile,
  blue charts for Signups (1.6K), Weekly activation rate (56%), Acquisition mix
  (100%), Feature adoption (48%) and a clipped Activation-by… chart (56%). Its
  miniature ChatGPT panel asks about signups/activation this week, shows
  **Worked for 2s** and a partial answer reporting improved measures. This is an
  illustration within documentation, not a live dashboard or separate tested tab.

## Tools image 1: ChatGPT browser-tool table, 05:34:09

- ChatGPT host header and **Explain capabilities** conversation remain. The user
  bubble asks which extra tools enable browser automation.
- The answer says there are two specific Chrome tools plus supporting tools.
  Table headings: **Tool** / **What it lets me do**.
- **Chrome tab context: getTabContext** is shown with a gray inline-code chip;
  the identifier wraps across lines. The text claims tab/visible-field reading,
  supported YouTube timestamped captions, summarization/explanation/extraction.
- **Browser control: cua_repl** is another code chip; its text claims connecting
  to this Chrome instance, inspecting, navigating, clicking, typing and checking
  resulting state, then composing actions into a website task.
- The start of a paragraph about combining **reading + acting + checking** is
  visible above the fixed composer, with scroll-to-bottom arrow overlaid.
- No browser tool call, console, trace or website mutation appears in this image.

## Tools image 2: ChatGPT explanation and limits, 05:34:23

- The reply is scrolled lower. **reading + acting + checking** is bold, followed
  by an indented quotation with a gray vertical rule: open settings, find
  notifications, disable promotional notifications and verify saving.
- The answer claims it can inspect controls, make changes and check results.
  Supporting bullets: **Web search and page retrieval**; **Local file and command
  tools** for data/reports/spreadsheets/scripts; **Connected app tools, when
  available**, with Google Docs/Sheets examples and a reliability comparison.
- A bold line distinguishes reading a tab from controlling it. The answer says
  selected-tab information is insufficient to inspect page contents and explicitly
  states it has **not inspected or changed the current page during this answer**.
- Copy/feedback icons are partly near the composer edge; the circular down-arrow
  overlays the lower response. The composer and approval/model controls persist.
- The answer's own non-execution qualification agrees with the absence of an
  action trace in the supplied pixels; it does not prove every listed tool exists
  or works in another account/session.

## Tools image 3: Claude browser-tool reply, 05:35:20

- The host panel switches to orange sunburst/**Claude**, with pin and close ×.
  Inside, a top row has History, New chat and vertical ellipsis, followed by a
  divider. Centered conversation title: **Browser automation tools** with chevron.
- A right-aligned rounded user bubble asks the same browser-tool question.
- The white serif answer introduces Claude in Chrome tools and shows bullets:
  - **Read pages**: text or accessibility tree with interactive elements/reference
    IDs.
  - **Find and act on elements**: description-based finding; click, double-click,
    right-click, drag, scroll and type.
  - **Fill forms**: input/dropdown/checkbox values by element reference.
  - **Run JavaScript**: page execution plus console/network reading for debugging.
  - **Batch steps**: multiple actions in one round trip, with navigate/type/Enter/
    screenshot example.
  - **Upload files**: file inputs and animated GIF workflow recording.
  - **Manage tabs** begins near the lower fade/composer edge and continues in image 4.
- A round down-arrow overlays the lower reply. The composer is an outlined dark
  rounded box with **Write a message…**, +, a small approval/action icon in a
  squared control, **Haiku 5.5 Medium**, and microphone. Below it, gray copy asks
  the user to double-check responses because Claude can make mistakes.
- There is no GIF recording, file chooser, JavaScript result or executed batch
  shown. The visible model label is not proof of provider-tool parity with AGI.

## Tools image 4: Claude continuation and action confirmation, 05:35:29

- The same reply is scrolled lower beneath the retained header/title. Its first
  visible fragment is the end of the previous debugging text.
- Batch and upload bullets remain visible. **Manage tabs** now explicitly lists
  list/create/close/resize and qualifies new tabs to an explicit request or a task
  needing two pages.
- A paragraph claims **WebSearch**, **WebFetch**, and a searchable connector
  registry for email/calendar integrations, with a reliability comparison to
  clicking through websites.
- A final paragraph promises confirmation before irreversible examples: messages,
  form submission, purchases and accepting terms. It identifies the current tab
  as a ChatGPT Learn Chrome-extension page and invites a requested action.
- Under the answer: Copy, speaker/read-aloud, thumbs up, thumbs down and **just now**.
  The composer and mistake disclaimer remain fixed at the bottom.
- This is a model's stated policy, not an observed confirmation flow. No terms,
  purchase, message or form were accepted/sent by this screenshot inspection.

## Official guidance and unresolved differences

Official pages were reopened on October 13. Publication dates were not displayed
on the OpenAI pages. The [browser-extension guide](https://learn.chatgpt.com/docs/chrome-extension)
documents existing-profile browser work, tab/selection context, recent-chat
continuity, side-chat/browser availability differences and website permissions.
It describes browser history as request-scoped with no always-allow option,
whereas image 7 visibly offers **History / Always allow**. This is an unresolved
documentation/UI difference, not grounds to assume a universal policy.

Images 7/10 display **Not installed** while other images show ChatGPT side chat.
The images do not establish whether desktop detection, browser profile, app
instance, rollout or timing caused that discrepancy. No cause is selected.
The [local-security guide](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security)
distinguishes browser-extension use from native-app Computer Use and documents
organization restrictions on sites, downloads/uploads, history and full CDP.
Visible Full access does not establish that it overrides those restrictions.

## Code-backed comparison with the current AGI Chrome implementation

The [canonical Chrome audit](../../audit/prior-audits/chrome-extension-public-release-audit.md)
owns live results, gaps and release qualification. The table below maps these
screenshots to current source rather than claiming universal competitor parity.

| Observed reference                                                | Current AGI owner/path                                                                   | Qualification                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compact composer, selected model/effort, Add and More disclosures | `apps/extension/src/side_panel.ts`; shared model catalog/picker                          | Current source keeps normal chat controls compact; root's UI cleanup hides manual Page/computer-use launchers outside development. Reference pixels do not prescribe copying competitor branding, plugin inventory or model choices.                                       |
| Separate global approval and Chrome/site controls                 | `features/computer-use/approvalPolicy.ts`; `src/options.ts`; background authority policy | AGI's Ask default, per-site grant, sensitive-action checks and upload approval have their own enforceable owners. Broad reference Full access is not permission to remove them.                                                                                            |
| Browser-settings sections instead of a full debug form            | `src/options.ts` selected-section renderer                                               | Current source presents Permissions, Account and Shortcuts and collapses technical details. Rendered acceptance belongs to the latest root receipt.                                                                                                                        |
| Human Working/skill title and visible Stop                        | `features/side-panel/bubbles.ts`; `computerUsePanel.ts`; cloud run control               | Progress and Stop must reflect canonical settlement. A tool name or model claim alone cannot establish completion; actual Stop receipts are in the audit.                                                                                                                  |
| File/folder/plugin menu and website uploads                       | `features/computer-use/userFileUpload.ts`; owned cloud attachment contract               | AGI separately approves inspection and website delivery. The competitor plugin menu is session-specific and is not an AGI inventory requirement.                                                                                                                           |
| Browser actions and diagnostics named in replies                  | `features/computer-use/browserToolDefinitions.ts`; native driver; page-watch owners      | Current canonical definitions include click/type/key/hover/scroll/drag/swipe/select/upload/download/DOM/console/network. Their native or DOM event semantics and actual tested limits are recorded separately. Arbitrary page JavaScript is not a generic model tool here. |
| Multi-tab and batch/recording claims                              | `features/browser-tools/taskTabs.ts`; canonical tool definitions; `agentLoop.ts`         | Current source declares task-owned open/switch/close and back/forward/reload paths, with explicit grants and approved transitions. No new live Haiku multi-tab/history coverage is claimed after testing stopped. No supplied screenshot demonstrates recording/batching.  |
| Read/context versus act distinction                               | Page capture, context handoff and browser-run admission                                  | Reading a page does not authorize actions. The fresh natural-page-context code tests and final native runtime check must be stated separately.                                                                                                                             |
| Desktop Any App/Excel/Locked use                                  | Native Desktop domain, not Chrome extension permissions                                  | These screenshots do not authorize a Chrome extension to gain device-wide access or establish AGI Desktop runtime support.                                                                                                                                                 |

Unknown from these images: keyboard/focus navigation, screen-reader output,
high zoom, light theme, cross-account behavior, actual default permission state,
policy-denied actions, successful browser-tool execution, pricing/plan access,
release cohort and desktop/Chrome connection diagnosis. Every visible image was
reviewed; unseen menu rows and cropped copy remain unknown.

The current source review additionally distinguishes Chrome's missing generic
Goal/Plan composer controls from the existing shared goal-handoff/plan-state
owners; shortcut recording from animated GIF export; session plugin discovery
from a fixed product feature list; and recent-chat history from global browser
history. These gaps and their owners are recorded in the canonical audit, not
converted into new private registries. Testing and browser/HTTP operators have
stopped at the user's request. Later source changes carry no new runtime claim.
