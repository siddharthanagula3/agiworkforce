# Claude in Chrome UI reference, October 13, 2026

Status: Dated observed evidence
Owner: Chrome extension product and engineering
Captured: October 13, 2026, 05:13:32–05:17:25 America/Chicago
Source: All 13 screenshots supplied by the user in this task

This is an inventory of the supplied pixels, not a claim that every displayed
feature was exercised. The screenshots show Claude in Chrome in a signed-in
account, dark theme, with **Haiku 5.5 / Medium** selected. They include a loading
state, menus, settings, a limit failure, a later thinking state and an answer.
The extension version, plan, rollout cohort, browser version, exact fonts,
keyboard behavior and underlying implementation are not established by these
images. There are no ChatGPT screenshots in this set.

The original 13 PNGs were preserved without edits in the private task evidence
directory `/tmp/agi-extension-haiku-2026-10-12/claude-reference-2026-10-13/`.
Its `manifest.json` maps each image to the original supplied path, capture time,
dimensions and SHA-256. Every image is 2940 × 1912 physical pixels. Originals
are retained with file mode 0600; the directory is 0700. The screenshots contain
an account email and personal memory context. The email is redacted in this
repository note; the exact original remains in the private PNGs.

## Shared browser context and visual structure

These details are visible across the installation-page screenshots unless a
per-image change is recorded below.

- Chrome is a macOS window with red, gray and green window controls at the upper
  left, a tab-search/down-chevron control, an orange **Claude** tab-group label,
  a Claude sunburst favicon, the active **Claude in Chrome** tab, a close-tab ×
  and a new-tab +. The active grouped tab has an orange outline. A small purple
  dot sits at the extreme upper-right of the captured screen; its cause is not
  established and it is not an extension design requirement.
- The browser toolbar includes Back, disabled-looking Forward, Reload, the
  site-controls icon, the address `claude.ai/chrome/installed`, an install/save
  icon, a bookmark star, the extensions puzzle icon, a side-panel icon, a green
  profile circle marked **S**, and Chrome's vertical three-dot menu. **Ask
  Gemini**, with its multicolor symbol, appears in the upper-right tab strip.
  These are browser controls, not Claude extension controls.
- A Chrome notice above the webpage reads **“Continue where you left off:
  Chrome can restore your tabs every time you restart. To turn this on, go to
  Settings.”** It includes a Chrome logo, an underlined blue Settings link and
  a dismiss ×. This is also browser UI.
- The installation webpage occupies the left majority of the window. The
  native browser side panel occupies the right, separated by a narrow neutral
  gutter. The panel host header shows the orange Claude sunburst and **Claude**
  at left, and pin and close × controls at right.
- The webpage has a dark neutral ground, an orange sunburst plus white serif
  **Claude** wordmark at top-left, a large centered white serif two-line heading
  **“Claude’s in your Chrome”**, and centered secondary text **“Claude won’t work
  perfectly or risk-free on all websites or tasks.”** A white rounded **Try a
  demo** button has dark text.
- Below a thin divider is **“Give Claude a challenge”**, centered in white
  serif type, followed by **“Get familiar with the browser extension before
  surfing the world wide web.”** A large rounded, outlined challenge card is
  partly below the viewport. Its visible text includes **CHALLENGE 1** and the
  clipped start **“Your inbox is full of meeting RSVPs. Can”**. At the card's
  right is an orange rounded square containing an outlined white play triangle.
  Hand-drawn arrow/loop decorations appear alongside it, with positions changing
  between captures. The unseen remainder of the challenge is not transcribed.
- The extension's inner chat surface has rounded upper corners, a near-black
  background and a compact top toolbar with History, New chat and a vertical
  three-dot menu, all aligned right. A thin horizontal divider separates this
  toolbar from the conversation. There is no permanent multisection navigation,
  debug console, manual tool form, bridge URL or token input in the captured chat.
- The composer is anchored near the panel bottom, inset on both sides, with a
  dark gray fill, visible neutral outline, rounded corners and a multiline
  input. In the empty/loading views its placeholder is **“How can I help you
  today?”**. Its lower control row has + on the left, a separate approval-mode
  icon button next to it, **Haiku 5.5** and muted **Medium** near the right,
  followed by a microphone icon at the far right. The model and effort fit on
  one row. No model menu is shown, so its contents cannot be inferred.
- Menus are dark neutral surfaces with thin borders, rounded corners, compact
  rows, left icons where applicable, right chevrons/checkmarks/keyboard hints,
  and separators between related groups. Orange is used for the product mark
  and selected controls/status; blue appears on selected checks, links and task
  dots; red is used for destructive/logout actions.
- Direct pixel samples from image 1 give RGB (21,21,21), `#151515`, on an empty
  installation-page area and RGB (11,11,11), `#0b0b0b`, on an empty inner-panel
  area. Image 6 gives RGB (38,38,36), `#262624`, on the options ground. These are
  sampled pixels, not an extracted semantic token system or a contrast audit.
  Widths, spacing, radii and type sizes must be measured in a rendered AGI UI;
  the screenshot's physical pixels are not browser CSS pixels.

## Image 1: 05:13:32, initial/loading side panel

- The installation page and native panel are both visible.
- History, New chat and More are available in the panel's upper toolbar.
- The conversation area is empty except for a large muted brown/orange Claude
  sunburst centered within the panel. This is an observed loading/empty state;
  the image alone does not distinguish those causes or prove animation.
- The bottom composer remains visible and exposes attachment, approval,
  Haiku 5.5, Medium and microphone controls while the central symbol is shown.
- The challenge card is clipped at the screen bottom, with an arrow decoration
  above its right edge. There is no answer, action plan or progress log yet.

## Image 2: 05:13:43, approval menu

- The approval button beside + is open; its menu is positioned upward from the
  composer, without replacing the chat surface or moving the model selector.
- The three rows, in order, are **Manually approve** with a hand icon,
  **Automatically approve** with a double-triangle icon, and **Skip all
  approvals** with a warning-triangle icon.
- **Automatically approve** has a blue checkmark at its right. The composer
  button shows the corresponding double-triangle symbol.
- The same central Claude symbol remains visible behind the menu.
- The image demonstrates menu labels and the selected mode. It does not prove
  that automatic safety classification, protected-action checks or Skip-mode
  behavior worked on any website.

## Image 3: 05:13:51, attachment/capability menu

- The composer + is open with a menu anchored above it.
- **Upload or add files** appears first, with a paperclip icon and **⌘ U** hint
  at the right. A separator follows it.
- **Skills** has an outlined skill/scroll icon and a right-facing submenu
  chevron. **Connectors** has a connected-squares icon, a warning badge showing
  a triangle and **1**, and a right chevron. **Plugins** has a plug icon and a
  right chevron.
- The + button has a darker selected/pressed background. The approval button,
  Haiku 5.5 / Medium and microphone remain visible.
- No submenu contents, successful file upload, skill execution, connection
  repair or plugin execution are visible. The connector warning's cause is
  unknown. These labels are not permission to add dead AGI controls.

## Image 4: 05:14:09, More menu

- The top-right vertical three-dot menu is open at the upper-right of the chat.
- It contains only **Extension settings** and **Language** in this capture.
  Language has a right-facing submenu chevron; no languages are expanded.
- The menu is compact and does not list individual tool engines, protocol
  settings, account quotas, debug logs or native bridge secrets.
- The central Claude symbol and bottom composer are unchanged.

## Image 5: 05:14:20, recent tasks overlay

- A tall rounded dark-gray overlay appears within the panel, nearly filling
  its height below the toolbar. The heading is **Recent tasks**, with × at the
  upper-right inside the overlay.
- Three visible task rows read **Untitled design**, **Monitor a topic**, and
  **New scheduled task**. Each has a small leading circular status mark:
  Untitled design has a hollow/muted ring; the other two have blue dots.
- Rows are left-aligned with generous vertical spacing. No dates, previews,
  search box, delete buttons or pagination are visible in this state.
- The overlay hides the composer. Its outer border remains visible. The image
  does not establish what the dots mean, whether a task was unread or running,
  or how any task resumes when selected.

## Image 6: 05:14:43, settings / Permissions

- A second tab, **Claude Options**, is selected in the same Claude tab group.
  Its URL is
  `chrome-extension://fcoeoabgfenejglbffodgkkbkcadhcgfn/options.html`.
  The prior Claude in Chrome tab stays open. The native side panel is not
  visible on this options page.
- The Chrome restore-tabs notice remains above the settings content.
- The page uses a warm dark-gray neutral background, large top spacing and a
  centered two-column layout. **Claude in Chrome settings** is a serif heading
  at upper-left. A bordered account pill at upper-right contains a person icon
  and the signed-in email, redacted here as `[account email]`.
- The left navigation contains **Permissions**, **Shortcuts** and **Options**.
  Permissions is selected with a near-black rounded rectangular background
  and light text. A divider separates navigation from a red **Log out** row
  with an exit-arrow icon. The other rows use muted gray text.
- The right column contains vertically stacked large rounded cards with thin
  neutral borders and substantial internal padding.
- The first card is **Notifications**, with **“Get notified when tasks complete
  or need your input”**. Its setting row is **Task completion notifications**,
  followed by **“You’ll receive notifications when tasks finish”**. A blue
  on-state switch with a white knob is aligned at the far right.
- The second card is **Microphone**, with **“Enable microphone access to use
  your browser’s speech-to-text functionality for voice narration during
  workflow recording”**. It has an orange filled **Allow Microphone Access**
  button with white text. No granted state or permission dialog is shown.
- The third card, partly at the bottom, is **Your approved sites**, with
  **“You have allowed Claude to take all actions (browse, click, type) on these
  sites.”** Its empty state is **“No sites have been approved yet”**.
- This image shows user decisions and an empty permission list. It does not
  establish notification delivery, microphone transcription or site-grant
  enforcement. No raw CDP/debugger configuration or API token input is shown.

## Image 7: 05:14:52, settings / Shortcuts

- The same settings header, account pill, browser notice, left navigation and
  Log out row remain. **Shortcuts** is now the selected dark navigation row.
- The URL ends in **`options.html#prompts`**. This is observed routing; it does
  not mean the visible section is named Prompts.
- One main card is headed **Shortcuts** with **“Type / in the chat to use
  shortcuts or run them on schedule”**.
- A white **+ Create shortcut** button with dark text sits at the card's upper
  right. It is a saved-task control, distinct from a keyboard binding.
- The card contains a darker inset empty-state rectangle. In its center is a
  rounded square illustration with three slash-prefixed gray lines, followed
  by **“Create your first shortcut to get started”** across two lines.
- No saved shortcuts, creation form, schedule editor or successful scheduled
  execution are shown.

## Image 8: 05:14:58, settings / Options

- **Options** is selected, and the URL ends in **`options.html#options`**.
- The main card is **Keyboard shortcut**, with **“Configure the keyboard
  shortcut used to open Claude in Chrome.”**
- A row reads **Open side panel**, followed by **Current shortcut: ⌘E** with
  the chord rendered in a small dark keyboard-key capsule.
- An outlined **Configure** button with a keyboard icon is aligned at right.
- No keyboard remapping dialog is open. The screenshot establishes the
  displayed binding for this account/browser, not a universal default.
- The displayed options are deliberately small in scope; saved task shortcuts
  are in the separate Shortcuts section.

## Image 9: 05:15:33, task title and weekly-limit failure

- The installation page and native panel are visible again.
- Below the panel toolbar is a task-title row **Agent capabilities** with a
  downward chevron, on a subtly lighter band.
- The user message **“what can you do?”** appears in a small dark rounded bubble
  aligned to the right. The assistant reply is plain serif prose on the panel
  ground, without an assistant bubble/card:
  **“You’ve hit your weekly limit · resets Oct 14, 6pm (America/Chicago)”**.
- A compact response action row appears beneath it: Copy, Read aloud/speaker,
  Thumbs up and Thumbs down, all muted outline icons.
- A separate bordered notice immediately above the composer reads
  **“Usage limit reached · Resets Oct 14 at 6:00 PM ·”** and includes the blue,
  underlined link **“limits shared with Claude Code”**. A subdued rounded
  **Get more usage** button sits below.
- The composer now says **“Write a message…”**. Its +, approval control,
  Haiku 5.5 / Medium and microphone remain visible.
- Below the composer is centered secondary text **“Claude is AI and can make
  mistakes. Please double-check responses.”**
- The screenshot proves a visible failure/recovery affordance. It does not
  prove plan economics, the account's actual backend balance, which model
  consumed the limit, or that Get more usage changes the balance.

## Image 10: 05:15:50, task-title actions

- The **Agent capabilities** title dropdown is open below the title row,
  overlapping part of the conversation. The weekly-limit notices remain.
- Its rows, in order, are **Schedule** (clock), **Turn into skill**
  (skill/scroll), a separator, **Copy session ID** (copy), a separator,
  **Star** (star, right-side **P** hint), **Rename** (pencil, **R**),
  **Add to project** (box/folder, right chevron), another separator,
  **Archive** (archive box, **A**), and red **Delete** (trash, **D**).
- These are conversation/task actions, separated from global extension
  settings and from the composer capability menu.
- The screenshot does not prove that keyboard hints work, that Star/Archive
  persist, how scheduling or skill conversion works, or what Delete removes
  and whether it asks for confirmation. No destructive action was authorized
  or executed by providing this image.

## Image 11: 05:16:58, thinking and stacked contextual notices

- The task title and user message remain. The assistant area now shows two
  small orange dots and **Thinking** in muted gray. A static screenshot does
  not establish their animation timing.
- The prior hard-limit state has changed to a smaller notice:
  **“You’ve used 75% of your weekly limit”**, with dismiss × and **Get more
  usage**. The reason for the change is not shown; do not infer a purchase,
  reset, plan switch or accounting correction.
- A second bordered notice below it reads **“Automatically approve is on.”**
  and **“Claude runs on its own and pauses if anything looks unsafe. This
  includes using your connectors and Claude in Chrome, unless you turn them
  off. Learn more”**. **using your connectors** and **Learn more** are
  underlined links; there is another dismiss × at the upper-right.
- The two notices are stacked above the composer, with the conversation
  retaining its own scroll area. Their neutral borders are visible and they
  are not large decorative banners.
- A square Stop button appears at the far right of the composer in the
  microphone/send location. The +, approval icon, model and effort remain.
- The mistake disclaimer remains below. This capture does not prove the
  effectiveness of automatic safety review or that Stop cancels a backend run.

## Image 12: 05:17:15, streamed capability answer

- The notices are no longer visible; no cause or dismissal interaction is
  shown. Thinking is replaced by plain, left-aligned serif assistant text.
- The first paragraph says: **“I can work in your current Chrome tab and in a
  cloud workspace, and I can reach other apps through connectors.”**
- The second says: **“In this tab, I can read the page, summarize or extract its
  text, navigate, click, fill in forms, and take screenshots. For anything
  irreversible, like sending a message, submitting a form, or making a
  purchase, I’ll confirm with you first. I won’t enter passwords, payment
  details, or ID numbers, and I won’t get past CAPTCHAs.”**
- The third says: **“In the cloud workspace, I can write and run code, analyze
  data and build charts, create and edit documents, spreadsheets, and slide
  decks, and publish interactive pages you can revisit or share. I can also
  search the web for current information.”**
- The fourth begins: **“I can connect to apps like email, calendar, or project
  trackers if you link them, and I can set up recurring tasks.”** It then
  references personal memory about a solo founder working on AGI Workforce,
  saying it can tailor work to that context. This is observed answer text,
  not proof that this memory is correct or that a connector was invoked.
- The lower lines approach the fixed composer and fade beneath its upper
  overlay. The message area scrolls; the composer stays at the bottom.
- Haiku 5.5 / Medium remains displayed; the microphone is visible again and
  the Stop button is absent in this capture. No tools, forms, websites or
  generated artifacts were actually exercised in this answer screenshot.

## Image 13: 05:17:25, answer after scrolling

- The conversation has moved downward: the opening current-tab/cloud-workspace
  paragraph is above the visible area, while the browser, cloud and connector
  paragraphs remain readable. The task-title row stays at the top.
- The final visible paragraph is **“What would you like to start with? If
  you’re on a page right now, I can look at it and tell you what it offers.”**
- The Copy, Read aloud, Thumbs up and Thumbs down row is visible below the
  completed answer, just above the composer. There is no surrounding assistant
  card, border, numbered capability grid or permanent tool log.
- The composer and the mistake disclaimer remain fixed at the bottom. The
  model and effort remain Haiku 5.5 / Medium.
- This image verifies that the long response is accessible by scrolling and
  that response controls appear at its end. It does not prove that clipboard,
  speech playback, feedback or a follow-up page-reading action succeeded.

## What the screenshots establish and what they leave unknown

| Area                      | Observed evidence                                                                                | Still unknown                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Main interaction          | One native side chat, compact toolbar, fixed composer, plain assistant prose                     | Actual browser-action reliability, accessibility semantics, mobile/responsive behavior      |
| Permissions               | Three-mode menu; Auto selected; contextual Auto disclosure; approved-sites settings              | Effective classifier behavior, protected-action enforcement, organization policy and grants |
| Browser actions           | A model response describes page reading, extraction, navigation, clicking, forms and screenshots | No screenshot in this set executes those actions                                            |
| Cloud workspace           | A response describes code, analysis, files, artifacts and web search                             | No code execution, storage, result or browser/cloud handoff demonstrated                    |
| Account continuity        | Signed-in account pill; Recent tasks; task title and actions                                     | Successful cross-device restore, workspace ownership and authorization                      |
| Skills/connectors/plugins | Composer submenu entries; connector warning badge                                                | Submenu contents, installation, discovery, invocation and error recovery                    |
| Notifications/microphone  | On-state notification toggle and microphone permission button                                    | Delivered notification or recorded/transcribed voice                                        |
| Shortcuts/schedules       | Saved-shortcut empty state, Create shortcut, slash guidance and Schedule action                  | Executable saved task and recurring run                                                     |
| Limits                    | Hard-limit message, reset date/time, upgrade affordance; later 75% notice                        | Account economics or explanation for the changed usage state                                |
| Lifecycle                 | Thinking state; Stop affordance; later answer without Stop                                       | Backend cancellation, interruption/reload recovery and no-late-action guarantees            |
| Task management           | Schedule, skill conversion, session ID, Star, Rename, project, Archive and Delete                | Whether controls are implemented and what confirmation/recovery follows                     |

## AGI comparison and implementation direction

Use AGI's canonical design tokens and account/model contracts; the observed
Claude dark palette and typography do not override the requested neutral light
theme or create a second design system. Keep real platform restrictions,
protected-action approvals, ownership checks and explicit data disclosure.
Do not advertise Auto safety review unless AGI actually performs that review.
The screenshots' answer about purchases is a model claim; current official
permission documentation and AGI's own policy remain separate authorities.

| User-visible area          | AGI source owner                                                                                                    | Direction and validation requirement                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chat, composer and More    | `apps/extension/src/side_panel.ts`                                                                                  | Make ordinary browser requests work from chat; keep internal diagnostics and manual engine controls out of the normal menu; test actual narrow native panel  |
| Activity and cancellation  | `features/side-panel/chat-state.ts`, `bubbles.ts`, `features/cloud-bridge/managedRunControl.ts`                     | Only display terminal activity after observed terminal state; retain partial answer; test live Stop, reopen and stale/unconfirmed cancellation               |
| Models and effort          | Shared model catalog plus `features/cloud-bridge/managedModelPicker.ts`                                             | Use Web-aligned available models; manually pin Haiku 5.5 for QA; fit full controls and test outside-click/keyboard behavior                                  |
| Site access and approval   | `features/options/site-permission-policy.ts`, `features/computer-use/approvalPolicy.ts`, `browserControlConsent.ts` | Keep user decisions and readable grants; background protocols are internal; denial/revocation must stop real actions                                         |
| Settings navigation        | `apps/extension/src/options.ts`                                                                                     | Show one selected section; keep account, permissions, privacy, optional preferences, shortcuts and help accessible; hide developer credentials in production |
| Page reading and actions   | `features/computer-use/agentLoop.ts`, `cdpDriver.ts`, canonical browser tool definitions                            | Verify text/DOM and screenshots against actual page effects, not model assertions; check focus, frames, shadows, native inputs, upload and download          |
| Saved tasks and continuity | Background conversation owner, workflow/schedule services and shared cloud contracts                                | Reuse real contracts; distinguish saved task shortcuts from keyboard bindings; test account/workspace boundary and completed-task restore                    |
| Desktop, CLI and VS Code   | Native bridge/pairing and shared host protocol owners                                                               | Confirm existing transport and authorization before exposing a connection; no raw bridge secrets in the everyday browser flow                                |
| Skills/connectors/plugins  | Existing admitted shared capability owners                                                                          | Expose working, admitted controls only; no decorative or placeholder menu rows                                                                               |
| Usage                      | Shared billing catalog and managed usage service                                                                    | Display current Max 20x name from the owner; show truthful limits, retry/reset guidance and no fabricated allowance                                          |

The current AGI implementation results and unresolved defects belong in the
[Chrome extension audit](../../audit/prior-audits/chrome-extension-public-release-audit.md),
not in this dated competitor evidence record.

## Documentation cross-check

On October 13, 2026, Context7 was used to resolve and query the official
`/websites/learn_chatgpt` documentation and the Claude API documentation at
`/websites/platform_claude_en`. Context7 returned the ChatGPT browser-extension
guide and Claude's client-executed computer-use/tool-result loop. The Claude API
guide explains harness implementation; it is not proof of consumer Chrome UI.
The consumer Claude extension pages were read directly from official support.

- [Claude in Chrome getting started](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): side panel, page interaction, task continuity, Chrome/plan/rollout limits and native-host integration.
- [Claude in Chrome permissions](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide): Manual/Auto/Skip, site grants, protected actions, organization restrictions and prohibited actions.
- [Claude computer-use API](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool): application-owned action execution, screenshots and iterative tool results.
- [ChatGPT browser extension](https://learn.chatgpt.com/docs/chrome-extension): side chat, tab/selection context, desktop connection, site permissions, request-scoped history and browser/platform/rollout limits.

No competitor extension was driven by this agent to create these screenshots;
they are user-supplied observations. The originals and every displayed state
are recorded separately from documented product behavior and inferred design
choices.
