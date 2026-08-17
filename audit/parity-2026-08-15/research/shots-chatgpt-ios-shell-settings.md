# ChatGPT iOS — App Shell & Settings Tree (Screenshot Evidence)

## Provenance & caveats

- All 34 images in this set live in `/Users/siddhartha/Desktop/chatgpt_reference/`, numbered `040`–`078` (with health/voice/work/promo/auth-prefixed files excluded per assignment). No files matching this pattern exist in `/Users/siddhartha/Desktop/references-2` or `/Users/siddhartha/Desktop/claude_reference` — those two directories contain zero `chatgpt-ios-*` files (references-2 only has `chatgpt-ios-health-*`, `chatgpt-ios-voice-*`, `chatgpt-ios-work-*`, all explicitly excluded from this assignment; claude_reference has none at all).
- **Point-in-time captures, exact date unknown.** Status bar clock reads 9:19–9:25 across the set (one continuous capture session), battery 59–60%. The signed-in account shows email `agiautomationllc@gmail.com`, name "Siddhartha Nagula," phone `+16824585291`, subscription "Pro" — this is the researcher's own live account, not a demo/seed account.
- **Signals this build is ahead of general release / experimental:** the model picker shows "GPT‑5.6 Sol" with an intelligence-tier ladder of Instant (5.5) → Medium → High → Extra High → Pro; the General settings screen has a "Pro level: Standard" row under an "Intelligence" section separate from the chat-level picker. Neither of these naming schemes is likely to be current public ChatGPT nomenclature — flag as probably a staff/experimental/beta build and verify against live product before citing as shipped GA behavior. Similarly, "Remote" as a sidebar destination (with a green "connected" status dot) and "Cloud browser," "Lockdown mode," "Work network access," and "Codex" settings embedded in the main ChatGPT app all suggest a more advanced/internal build than the standard consumer App Store release.
- Two screenshots (`059` and `060`) are pixel-identical duplicate captures of the same "Security and login" scroll position — treated as one screen below.
- Two screenshots (`040` and `077`) are near-duplicate captures of the same sidebar drawer, differing only in which panel peeks through behind it — treated as one screen, differences noted.
- Two screenshots (`070` and `071`) show the same billing alert text with a different button set (`OK + Learn more` vs `OK` only) — recorded as two distinct dialog states since the button set genuinely differs.
- Never invent: this assignment's set does **not** include Personalization, Memory (detail screens — only the nav row is visible), Remote control (detail screen — only the nav row is visible), Lockdown mode (detail screen), Security keys & passkeys (detail screen), Active sessions (detail screen), Add family member (detail screen), any onboarding/auth flow, or the Library "Images"/"Documents" filtered tab contents. These are flagged **"not covered by these captures"** in the tree below rather than guessed at.
- Library grid thumbnails (screenshot `045`) show the user's own unrelated product mockups (a separate "agiworkforce" dark-themed app) — this is incidental personal content that happened to be in the user's Library, not ChatGPT-authored UI. Only the surrounding grid/tab/search chrome is treated as evidence.

## Screenshot inventory (34 files reviewed)

| #   | File | Screen                                                                               |
| --- | ---- | ------------------------------------------------------------------------------------ |
| 1   | 040  | Sidebar drawer (Projects panel peeking behind)                                       |
| 2   | 041  | Settings modal — top (profile, Customize ChatGPT, Account, Theme start)              |
| 3   | 042  | Settings modal — mid scroll (Theme, App settings full list)                          |
| 4   | 043  | Settings modal — bottom scroll (App settings tail, Get help, Log out)                |
| 5   | 044  | Library — "Upload once, use anytime" promo bottom sheet over skeleton grid           |
| 6   | 045  | Library — populated 2-column grid, tabs, in-grid search                              |
| 7   | 046  | Projects — list (single project, empty-ish state)                                    |
| 8   | 047  | Projects — "New project" creation modal                                              |
| 9   | 048  | Scheduled — suggested task cards                                                     |
| 10  | 049  | Scheduled — composer attachment picker (Camera/Photos/Files/Plugins)                 |
| 11  | 050  | Plugins — marketplace list (Installed strip, Featured, Productivity)                 |
| 12  | 051  | Plugins — Permissions & Added list (pushed from gear icon)                           |
| 13  | 054  | Settings → Storage                                                                   |
| 14  | 055  | Settings → Data controls (top)                                                       |
| 15  | 056  | Settings → Data controls (scrolled — Export/Delete account)                          |
| 16  | 057  | Settings → Cloud browser                                                             |
| 17  | 059  | Settings → Security and login                                                        |
| 18  | 060  | Settings → Security and login (duplicate capture of 059)                             |
| 19  | 061  | Settings → Safety                                                                    |
| 20  | 062  | Settings → Trusted contact                                                           |
| 21  | 063  | Settings → Parental controls                                                         |
| 22  | 064  | Settings → Voice                                                                     |
| 23  | 065  | Settings → Notifications                                                             |
| 24  | 066  | Settings → General                                                                   |
| 25  | 067  | Settings → Accent color picker (popover)                                             |
| 26  | 068  | Settings → Appearance picker (popover)                                               |
| 27  | 069  | Settings → Account → "Change your email" native alert                                |
| 28  | 070  | Settings → Account → Subscription "external platform" native alert (OK + Learn more) |
| 29  | 071  | Settings → Account → same alert, OK-only variant                                     |
| 30  | 072  | Skills — empty state                                                                 |
| 31  | 073  | Chat — model/intelligence picker popover                                             |
| 32  | 075  | Chat — empty state, quick actions, keyboard open                                     |
| 33  | 077  | Sidebar drawer (quick-actions panel peeking behind)                                  |
| 34  | 078  | Search overlay — empty prompt state                                                  |

---

## Full settings tree / navigation tree (reconstructed)

```
ChatGPT (app shell)
├── Top bar (chat screen): [≡ sidebar] "Chat ⌄" [⟳ new/compare icon]
├── Sidebar drawer (slide-over, ≡ icon)
│   ├── Header: "ChatGPT"  [🔍 search icon → Search overlay]
│   ├── Library
│   ├── Projects
│   ├── Scheduled
│   ├── Plugins
│   ├── Remote  (● green status dot — connected)
│   ├── More (···)                                    [not covered by these captures]
│   ├── — Recents — (recent chat titles, flat list)
│   ├── [floating] "✏️ Chat" pill (new chat)
│   └── [floating] ⚙ gear icon → Settings modal
│
├── Search overlay (🔍 from sidebar header)
│   └── "Search chats, files, and projects" (empty state) + bottom Search field
│
├── Chat screen
│   ├── Empty-state quick actions: Create an image / Write or edit / Look something up
│   ├── Composer: "Ask ChatGPT" + [+] attach, model/tier label (e.g. "5.6 Pro"), mic, voice-mode button
│   └── Model/Intelligence picker (popover from "Chat ⌄")
│       ├── "GPT‑5.6 Sol >" (model family, drills deeper)
│       └── Intelligence: Pro ✓ / Extra High / High / Medium / Instant (5.5)
│
├── Library
│   ├── Tabs: All / Images / Documents
│   ├── "Upload once, use anytime" promo sheet (dismissible, "Learn more" CTA)
│   ├── Grid (2-col) of uploaded/generated files
│   └── In-grid "Search library"
│
├── Projects
│   ├── Tabs: All / Created by you / Shared with you
│   ├── Project list rows (folder icon, name, "N days ago")
│   ├── "Search projects" (bottom pill)
│   └── [+] New project modal
│       ├── "Project Name" input (emoji/icon picker prefix)
│       ├── Category pills: Homework / Writing / Health / Travel (+ more, scrollable)
│       └── "Create project" (disabled until named)
│
├── Scheduled
│   ├── Suggested task cards (dashed border, emoji, title, description, [+] add):
│   │   Daily brief, Email monitor, Weekend long read, Sale monitor, Concert alerts, Weekend ideas
│   └── Composer: "+ Schedule a task" [mic] [↑ submit]
│       └── [+] attachment picker: Camera / Photos / Files / Plugins
│
├── Plugins
│   ├── Marketplace ("Plugins ⌄", ⚙ → Permissions)
│   │   ├── "Search plugins"
│   │   ├── Installed (icon strip, ~9 icons)
│   │   ├── Featured > : Data Analytics, GitHub, Investment Banking, Public Equity Investing, Sales, Google Drive
│   │   └── Productivity > : Notion, Google Calendar, …
│   └── Permissions & Added (pushed via ⚙)
│       ├── Permissions: "Allow low-risk >" (risk-tiered auto-approval)
│       └── Added: Build iOS Apps, Build macOS Apps, Build MCP Apps, Build Web Apps,
│           Codex Browser Recorder, Default templates, Documents, Expo, GitHub,
│           Google Drive, OpenAI Developers, PDF, … (list continues past capture)
│
├── Skills
│   └── Empty state: "You don't have any skills yet" / "Ask ChatGPT Work to create
│       skills for specific, repeatable tasks." + "Search Skills" bar
│
└── Settings (⚙ gear icon, modal from sidebar)
    ├── Profile header: avatar (initials, editable), name, [X close]
    ├── Customize ChatGPT
    │   ├── Personalization >                          [not covered by these captures]
    │   ├── Memory >                                    [not covered by these captures]
    │   └── Plugins >  (→ same Permissions/Added screen as above)
    ├── Account
    │   ├── Email [value] >  → "Change your email" alert (Cancel / Continue to web)
    │   ├── Phone number [value]
    │   ├── Subscription [value: Pro]  → "can't make changes inside this app… visit
    │   │     chatgpt.com/#settings/Billing" alert (OK / Learn more)
    │   └── Restore purchases → same alert, OK-only variant
    ├── Theme
    │   ├── Appearance [System ⌄] → popover: System ✓ / Light / Dark
    │   └── Accent color [● Black ⌄] → popover: Default / Blue / Green / Yellow /
    │         Pink / Orange / Purple / Black ✓
    ├── App settings
    │   ├── General >
    │   │   ├── App language [English >]
    │   │   ├── Auto‑correct spelling [toggle]
    │   │   ├── Haptic feedback [toggle]
    │   │   ├── Intelligence → Pro level [Standard ⌄]
    │   │   ├── Suggestions → Autocomplete [toggle], Trending searches [toggle]
    │   │   └── Automatically use → Web search [toggle] "Search the web for real-time info."
    │   ├── Notifications >
    │   │   └── Codex, Group chats, Marketing, Personalized tips, Projects,
    │   │       Responses, Tasks, Usage — each with its own Push/Email/Both value
    │   ├── Voice >
    │   │   ├── Voice persona carousel (e.g. "Spruce — Calm and affirming", 9 dots)
    │   │   ├── Model [Live ⌄], Intelligence [Instant ⌄]
    │   │   ├── Language [Auto ⌄]
    │   │   └── Start ChatGPT with Voice [toggle], Background conversations [toggle]
    │   ├── Parental controls >
    │   │   └── Family Members → "Add family member >"
    │   ├── Trusted contact >
    │   │   └── crisis-support explainer + "Get started >"
    │   ├── Safety >
    │   │   └── "Reduce sensitive content" [toggle]
    │   ├── Security and login >
    │   │   ├── Log in → Security keys & passkeys [1 >]      [detail not covered]
    │   │   ├── MFA → Authenticator app [Off >], Text messages [On >]
    │   │   ├── Sessions → Active sessions [2 >]              [detail not covered]
    │   │   ├── Advanced security → Lockdown mode >           [detail not covered]
    │   │   └── Codex → Require Face ID [toggle]
    │   ├── Remote control >                                  [not covered by these captures]
    │   ├── Cloud browser >
    │   │   ├── Permissions → Default [Always ask ⌄], + Add site
    │   │   └── Browser data → "Clear all cookies"
    │   ├── Storage >
    │   │   └── "161 MB of 100 GB used" bar; Documents [141 MB >], Images [19 MB >]
    │   └── Data controls >
    │       ├── Improve model for everyone [toggle, ON]
    │       ├── Include audio recordings [toggle, OFF]
    │       ├── Location → Location services [Off], "Allow location access", Work
    │       │     network access [On >]
    │       ├── Chat history → Archived chats [>], Archive all chats, Delete all chats
    │       ├── Export data
    │       └── Delete account
    ├── Get help
    │   ├── Report app issue >                                [not covered by these captures]
    │   ├── Help Center >                                     [not covered by these captures]
    │   └── About >                                           [not covered by these captures]
    └── Log out (red, separate card)
```

---

## Screen-by-screen detail

### Sidebar drawer (040, 077)

Slide-over panel (~80% width) with a translucent scrim over the chat screen, which peeks through on the right edge (Projects list in 040; quick-action rows "Create…/Write…/Look…" plus a floating "Ask…" composer edge in 077).

- Header: "ChatGPT" (bold serif-adjacent sans title), circular 🔍 search button.
- Flat nav rows (icon + label, **no chevrons** — these are direct destinations, not drill-ins): 📚 Library, 📁 Projects, 🕐 Scheduled, @ Plugins, 🖥 Remote (green dot badge = connected/active status), ··· More.
- "Recents" bold section header, then plain-text chat titles with no icons, no timestamps, no swipe affordance visible: "OpenAI Build Week Info," "Qwen API vs Mulerouter," "Goal Statement Refinement," "Claude App Documentation," "AI Client Documentation," "Documentation for LLM Apps," "Voice AI App Research," "Master AI Coding Prompt," "…Billing Econom[ics]" (partly hidden by the floating Chat button), "AI Platform Documentation."
- Floating over the bottom of the drawer (not part of the scroll list): a black pill button "✏️ Chat" (new chat) and a circular ⚙ gear icon (opens the Settings modal).

### Search overlay (078)

Full-screen takeover, not a card/modal — replaces the whole view.

- Empty state centered: large gray 🔍 icon + "Search chats, files, and projects."
- Bottom-anchored search field: "Search" placeholder, 🔍 prefix, circular ✕ clear button beside it.
- Keyboard's return key is a custom blue 🔍 icon rather than the word "Search" — a native `UIReturnKeyType` override, confirming this is a unified index over chats + files + projects in one query.

### Chat empty state (075) and model picker (073)

- Header: "Chat ⌄" (tap target for the model/intelligence popover), hamburger left, a chat-bubble/duplicate icon top right (compare or new-group-chat affordance, not labeled here).
- Quick actions (plain rows, not chips): 🖼 Create an image, ✏️ Write or edit, 🌐 Look something up.
- Composer: "Ask ChatGPT" placeholder, "+" attach button bottom-left; footer shows a compact model/tier label "5.6 Pro," a mic icon, and a filled black circular button with a voice-waveform glyph (enters live voice mode).
- Model popover (073): "GPT‑5.6 Sol >" (model family row, itself drills further — not captured), divider, then an "Intelligence" section: Pro (checked), Extra High, High, Medium, Instant (5.5). This is a two-axis picker — model family is one axis, "intelligence" effort/tier is a separate, independently selectable axis layered under it.

### Library (044, 045)

- Header: "Library," hamburger left, "···" overflow menu right.
- Tabs: All (selected) / Images / Documents.
- Loading/skeleton state (044): 2×2 visible grid of empty gray rounded-square placeholders behind a promo sheet.
- Promo bottom sheet (044): ✕ close top-right; three overlapping file-type icon chips (code `</>`, PDF, image); headline "Upload once, use anytime"; body "Now you can ask ChatGPT about files added to past chats — no need to re-upload."; full-width black "Learn more" button.
- Populated grid (045): 2-column masonry of thumbnails (chat screenshots, generated images, a dark-mode logo pair, a benchmark/thermal-state card, and other user content). A "🔍 Search library" pill appears docked near the bottom of the scrolled grid rather than pinned at the top.

### Projects (046, 047)

- List screen: header "Projects," hamburger left, "+" add button top-right. Tabs: All (selected) / Created by you / Shared with you. Single row observed: folder icon, "o1," "6 days ago." Bottom-docked "🔍 Search projects" pill.
- Creation modal (047): ⚙ icon top-left (project-level settings, not explored), title "New project," ✕ close top-right. Body: "Projects give ChatGPT shared context across chats and files, all in one place." "Project Name" text field with an emoji/icon-picker prefix control. Horizontally scrollable category pills with icon + label: 🎓 Homework, 🖊 Writing, 🩺 Health, ✈️ Tra[vel] (cut off — more pills likely scroll off-screen). Primary button "Create project," rendered in a muted/disabled gray while the name field is empty.

### Scheduled (048, 049)

- Header "Scheduled," hamburger left, a filter/sort icon (stacked horizontal lines, distinct from the hamburger) top-right.
- Suggested task cards: dashed-border rounded rectangles, each with an emoji glyph, bold title, one-line description, and a "+" add button on the right: ☀️ Daily brief, ✉️ Email monitor, 📖 Weekend long read, 🏷 Sale monitor, 🎵 Concert alerts, 🎉 Weekend ideas.
- Composer bar: "+ Schedule a task" placeholder text, mic icon, circular gray "↑" submit button.
- Tapping "+" opens an action sheet (049) with four icon+label rows: Camera, Photos, Files, Plugins — meaning a scheduled task's trigger/context can be seeded with a plugin's output, not just files/photos.

### Plugins (050, 051)

- Marketplace (050): header "Plugins ⌄" (dropdown chevron, function not explored), hamburger left, ⚙ settings top-right (→ 051). "Search plugins" bar. "Installed" section: a horizontal row of ~9 bare icons, no labels (terminal-style ">\_" appears twice, a "?" icon, a blank/placeholder icon, a red camera icon, a blue document icon, a dark up-chevron "Expo" mark, the GitHub Octocat, one more icon cut off at the edge). "Featured >" section (rows with icon, name, one-line description, and either a "+" add button or a "···" overflow menu — overflow implies already-installed): Data Analytics (+), GitHub (···), Investment Banking (+), Public Equity Investing (+), Sales (···), Google Drive (···). "Productivity >" section begins: Notion (+), Google Calendar (+, cut off).
- Permissions screen (051), reached via the ⚙ icon, pushed with a "< Plugins" back chevron (not a new modal): "Permissions" row with value "Allow low-risk >" and explanatory text "Choose when ChatGPT should ask for permission when using plugins." — implying a tiered auto-approval model (at minimum "Always ask" vs "Allow low-risk" vs likely "Allow all," though only one state was observed). "Added" section lists every installed connector as a plain row (icon, name, chevron): Build iOS Apps, Build macOS Apps, Build MCP Apps, Build Web Apps, Codex Browser Recorder, Default templates, Documents, Expo, GitHub, Google Drive, OpenAI Developers, PDF (list is cut off at the bottom, more likely follow).

### Skills (072)

- Header: "Skills ⌄" (dropdown chevron), hamburger left, no visible settings icon on this screen.
- "Search Skills" bar.
- Empty state, centered: bold "You don't have any skills yet," subtext "Ask ChatGPT Work to create skills for specific, repeatable tasks." This ties "Skills" as a concept explicitly to a separate "ChatGPT Work" mode/product, not something authored directly from this screen.

### Settings modal — root (041, 042, 043)

Presented as a modal sheet (✕ close, not "< back") from the sidebar's gear icon.

- Profile header: circular avatar with initials ("SN"), small pencil/edit badge overlapping the avatar's bottom-right, full name below ("Siddhartha Nagula").
- **Customize ChatGPT** section: Personalization >, Memory >, Plugins > (three rows, white card, chevron-only drill-ins).
- **Account** section: Email [email, right-aligned] >, Phone number [phone, right-aligned] (no chevron — not tappable to drill further in these captures, though see 069 which shows Email specifically opens an alert, not a screen), Subscription [Pro] (opens alert, see 070), Restore purchases (opens alert, see 071).
- **Theme** section: Appearance [System, with a compact up/down chevron glyph] (opens popover, see 068), Accent color [● Black, same chevron glyph] (opens popover, see 067).
- **App settings** section (single long white card, 11 rows, all chevron drill-ins): General, Notifications, Voice, Parental controls, Trusted contact, Safety, Security and login, Remote control, Cloud browser, Storage, Data controls.
- **Get help** section: Report app issue >, Help Center >, About > (not opened in this set).
- **Log out** — separate red-text card, visually isolated from everything above it (extra margin, own card) — a deliberate "danger zone" separation pattern.

### Storage (054)

"161 MB of 100 GB used" with a horizontal progress/usage bar (thin gray track, small black leading dot rather than a filled bar — reads as almost-empty). Two rows: Documents [141 MB >], Images [19 MB >]. No manage/clear action visible at this depth.

### Data controls (055, 056)

- "Improve model for everyone" toggle (ON/green) — "Allow your content to be used to improve our models for you and other users. We take steps to protect your privacy. Learn more."
- "Include audio recordings" toggle (OFF) — "Share audio from voice chats to train our models. This improves the quality of voice chats for everyone. Learn more."
- **Location** section: "Location services" row shows "Off" in blue (acts as a value/link), plus a separate blue-text row "Allow location access" inside the same card; explanatory text about local recommendations/news/weather. "Work network access" row: value "On >" — a distinct, separately toggled network-level data permission from device location services.
- **Chat history** section: "Archived chats >", blue "Archive all chats" bulk action, red "Delete all chats" bulk action — bulk actions live as plain rows inside the same card as the drill-in, not as separate buttons.
- Further down (056): "Export data" (plain black text, no chevron, no explicit red danger styling) and "Delete account" (also plain black, **not** red, unlike "Delete all chats") — inconsistent danger-styling between "Delete all chats" (red) and "Delete account" (black) is worth flagging as a UI inconsistency in the source app.

### Cloud browser (057)

- **Permissions**: "Default" row, value "Always ask ⌄" (implies other selectable values not captured); "+ Add site" row for per-site overrides. Explanatory text: "Choose if ChatGPT asks for approval before opening websites. Add sites to override the default."
- **Browser data**: "Clear all cookies" (red). Subtext: "Manage the cloud browser's cookies."
- This confirms a server-hosted/remote browsing capability (a "cloud browser," distinct from the on-device browser) with its own cookie jar and a per-site permission override list, gated by a default "always ask" policy.

### Security and login (059/060 — identical duplicate)

- **Log in**: "Security keys & passkeys" [1 >] — explanatory copy: "Use passkeys or hardware security keys to sign in. These phishing-resistant methods provide stronger protection than passwords."
- **Multi-factor Authentication (MFA)**: "Authenticator app" [Off >], "Text messages" [On >] — explanatory copy about extra security challenge + account recovery.
- **Sessions**: "Active sessions" [2 >] — explanatory copy mentions ability to "remove trusted devices" and "Log out all."
- **Advanced security**: "Lockdown mode >" (no further detail captured — Apple's device-wide Lockdown Mode concept applied at the app/account level, or an app-specific equivalent; ambiguous from this screen alone).
- **Codex** section (embedded inside the main ChatGPT app's security settings, not a separate app): "Require Face ID" toggle (ON) — "Require Face ID or passcode to access Codex on this device." This is strong evidence Codex is a first-class in-app surface of ChatGPT iOS with its own local biometric re-auth gate, not merely a separate linked app.

### Safety (061)

Single toggle: "Reduce sensitive content" (OFF) — "Add extra safeguards around sensitive topics and limit certain types of content in ChatGPT. Learn more." Otherwise an almost entirely empty screen — very low information density for a single control.

### Trusted contact (062)

Explainer-only screen (no toggle) — the only control is "Get started >". Body copy: "Having a trusted contact can make it easier to get support from someone who knows you well." / "In the future, if you discuss suicide with ChatGPT in a way that indicates a serious safety concern, we may automatically notify your trusted contact so they can check in with you. They must be 18 or older to participate." This is a **crisis-detection / self-harm safety feature**: it implies a backend classifier over conversation content that can trigger an automatic outbound notification to a designated third party, plus an age-gate (18+) on who can be nominated as that contact, plus (implicitly) a consent/verification flow for the contact — none of which is visible beyond this entry screen.

### Parental controls (063)

Explainer + single action: "Parents and teens can link accounts, giving parents tools to adjust certain features, set limits, and add safeguards that work for their family." "Family Members" section header, single row "Add family member >" (blue). Implies an account-linking flow (parent↔teen) with feature-limiting and safeguard controls on the parent side — none of the actual limit-setting UI is in this capture set.

### Voice (064)

- Large circular gradient avatar preview representing the selected voice ("Spruce"), subtitle "Calm and affirming," with a 9-dot horizontal page indicator beneath it (first dot filled) — implies a swipeable carousel of 9 named voice personas, each with its own short personality descriptor, browsed directly from this settings screen rather than from a separate picker.
- Card: "Model" [Live ⌄], "Intelligence" [Instant ⌄] — voice mode has its own independent model/intelligence selection, decoupled from the text-chat model picker.
- Card: "Language" [Auto ⌄].
- Card: "Start ChatGPT with Voice" toggle (OFF), "Background conversations" toggle (OFF) — "Keep the conversation going in other apps or while your screen is off. Learn more." (background/continuous voice sessions across app-switch and locked-screen states).

### Notifications (065)

Single card, eight category rows, each showing its current delivery-channel value inline (no separate toggle-per-channel UI visible at this level — tapping presumably drills into a per-category channel picker): Codex → Push; Group chats → Push; Marketing → Push and Email; Personalized tips → Push and Email; Projects → Email; Responses → Push; Tasks → Push; Usage → Push and Email. Note "Codex" again appears as its own notification category distinct from generic chat "Responses," reinforcing that Codex is tracked as a first-class product surface throughout Settings.

### General (066)

- Card: "App language" [English >]; "Auto-correct spelling" toggle (ON); "Haptic feedback" toggle (ON).
- **Intelligence** section: "Pro level" [Standard ⌄] — a second, separate "intelligence" control living in General settings, distinct from both the chat-composer intelligence popover (073) and the Voice screen's own Intelligence row (064). Three independent "intelligence"-labeled settings across the app is a notable naming collision worth flagging.
- **Suggestions** section: "Autocomplete" toggle (ON), "Trending searches" toggle (ON).
- **Automatically use** section: "Web search" toggle (ON) — "Search the web for real-time info."

### Accent color popover (067)

Anchored dropdown/context-menu card (not a full screen — background settings list still visible, dimmed), triggered from the Accent color row. Options, each a colored dot + label: Default (gray), Blue, Green, Yellow, Pink, Orange, Purple, Black (✓ current selection, shown with a leading checkmark rather than a filled/highlighted row).

### Appearance popover (068)

Same anchored-popover pattern as 067, triggered from the Appearance row. Options: System (✓ checked), Light, Dark — a standard three-state theme picker.

### Account alerts (069, 070, 071)

Three native iOS `UIAlertController`-style dialogs (centered rounded card, dimmed full-screen background, no navigation chrome), distinct in kind from both the pushed settings screens and the anchored popovers:

- **069 — "Change your email"**: "To change agiautomationllc@gmail.com, continue to ChatGPT on the web." Buttons: Cancel / Continue. Email changes are explicitly punted to the web — not handled in-app at all.
- **070 — Subscription tap**: "You can't make changes to your subscription inside this app, because you purchased this subscription on another platform." "Please visit chatgpt.com/#settings/Billing in a browser to modify your subscription." Buttons: OK / Learn more.
- **071 — Restore purchases tap**: identical body text to 070, but only a single "OK" button (no "Learn more"). Confirms the app deliberately routes ALL subscription-management actions (viewing plan, changing plan, restoring purchases) away from native iOS in-app purchase management and toward a web billing settings deep link (`chatgpt.com/#settings/Billing`) whenever the underlying purchase originated outside Apple's IAP — worth double-checking against App Store review guidelines if replicating this pattern.

---

## Control inventory table

| Screen              | Control                                                                                                                                    | Type                                  | What it appears to do                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------- |
| Sidebar             | Library / Projects / Scheduled / Plugins / Remote / More                                                                                   | Nav row (icon+label, no chevron)      | Direct navigation to top-level surface                                  |
| Sidebar             | Remote — green dot                                                                                                                         | Status badge                          | Indicates an active/connected remote session                            |
| Sidebar             | Recents list items                                                                                                                         | List row (plain text)                 | Opens a past chat                                                       |
| Sidebar             | "✏️ Chat"                                                                                                                                  | Floating pill button                  | Starts a new chat                                                       |
| Sidebar             | ⚙ gear                                                                                                                                     | Floating icon button                  | Opens Settings modal                                                    |
| Sidebar header      | 🔍                                                                                                                                         | Icon button                           | Opens full-screen Search overlay                                        |
| Search overlay      | Search field                                                                                                                               | Text input                            | Queries chats, files, and projects together                             |
| Search overlay      | ✕                                                                                                                                          | Icon button                           | Clears query                                                            |
| Chat                | "Chat ⌄"                                                                                                                                   | Dropdown/header tap target            | Opens model/intelligence popover                                        |
| Chat                | Create an image / Write or edit / Look something up                                                                                        | Row (icon+label)                      | Prefills composer with a task template                                  |
| Chat                | "+" (composer)                                                                                                                             | Icon button                           | Opens attachment picker                                                 |
| Chat                | Model/tier label ("5.6 Pro")                                                                                                               | Compact status label                  | Shows current model + intelligence tier                                 |
| Chat                | Mic icon                                                                                                                                   | Icon button                           | Voice input                                                             |
| Chat                | Filled circular waveform button                                                                                                            | Icon button                           | Enters live voice mode                                                  |
| Model popover       | "GPT‑5.6 Sol >"                                                                                                                            | Row, drills further                   | Opens deeper model-family picker (not captured)                         |
| Model popover       | Pro / Extra High / High / Medium / Instant (5.5)                                                                                           | Radio list                            | Selects reasoning/"intelligence" tier                                   |
| Library             | All / Images / Documents                                                                                                                   | Segmented tabs                        | Filters grid by file type                                               |
| Library             | "···" overflow                                                                                                                             | Icon button                           | Unknown — not opened                                                    |
| Library             | Promo sheet "Learn more"                                                                                                                   | Primary button                        | Opens explainer for cross-chat file reuse                               |
| Library             | "Search library"                                                                                                                           | Search bar                            | Filters library items                                                   |
| Projects            | "+"                                                                                                                                        | Icon button                           | Opens New Project modal                                                 |
| Projects            | All / Created by you / Shared with you                                                                                                     | Segmented tabs                        | Filters project list by ownership                                       |
| Projects            | "Search projects"                                                                                                                          | Search bar                            | Filters project list                                                    |
| New Project modal   | "Project Name"                                                                                                                             | Text input                            | Names the project                                                       |
| New Project modal   | Emoji/icon prefix on name field                                                                                                            | Icon picker                           | Sets project's icon/emoji                                               |
| New Project modal   | Homework / Writing / Health / Travel…                                                                                                      | Chip/pill selector                    | Applies a project category template                                     |
| New Project modal   | "Create project"                                                                                                                           | Primary button (disabled until named) | Submits new project                                                     |
| Scheduled           | Task suggestion cards                                                                                                                      | Card row, "+" add                     | Adds a prebuilt scheduled task                                          |
| Scheduled           | Filter/sort icon (header)                                                                                                                  | Icon button                           | Unknown — not opened                                                    |
| Scheduled           | "+ Schedule a task" composer                                                                                                               | Text input                            | Free-text new scheduled task                                            |
| Scheduled           | Attachment picker: Camera/Photos/Files/Plugins                                                                                             | Action sheet rows                     | Seeds a scheduled task with media, a file, or a plugin's data           |
| Plugins marketplace | "Search plugins"                                                                                                                           | Search bar                            | Filters plugin catalog                                                  |
| Plugins marketplace | Installed icon strip                                                                                                                       | Icon row (no label)                   | Quick view of installed plugins                                         |
| Plugins marketplace | Featured / Productivity                                                                                                                    | Section, "> see all"                  | Categorized plugin browsing                                             |
| Plugins marketplace | "+" per plugin row                                                                                                                         | Icon button                           | Installs a plugin                                                       |
| Plugins marketplace | "···" per plugin row                                                                                                                       | Icon button                           | Manage an already-installed plugin                                      |
| Plugins marketplace | ⚙ (header)                                                                                                                                 | Icon button                           | Opens Permissions & Added screen                                        |
| Plugins permissions | "Permissions: Allow low-risk >"                                                                                                            | Row, drills further                   | Sets auto-approval risk threshold for plugin actions                    |
| Plugins permissions | Added list rows                                                                                                                            | Row, chevron                          | Opens per-plugin detail/permission (not captured)                       |
| Skills              | "Search Skills"                                                                                                                            | Search bar                            | Filters skills (none present)                                           |
| Settings root       | Avatar + pencil badge                                                                                                                      | Icon button                           | Edit profile photo                                                      |
| Settings root       | Personalization / Memory / Plugins                                                                                                         | Row, chevron                          | Opens each customization sub-screen                                     |
| Settings root       | Email                                                                                                                                      | Row → native alert                    | Prompts to continue changing email on web                               |
| Settings root       | Phone number                                                                                                                               | Row (static)                          | Displays phone number, no chevron                                       |
| Settings root       | Subscription                                                                                                                               | Row → native alert                    | Explains subscription managed on another platform, links to web billing |
| Settings root       | Restore purchases                                                                                                                          | Row → native alert                    | Same billing-redirect alert, OK-only                                    |
| Settings root       | Appearance                                                                                                                                 | Row → popover                         | System/Light/Dark theme picker                                          |
| Settings root       | Accent color                                                                                                                               | Row → popover                         | 8-swatch accent color picker                                            |
| Settings root       | General/Notifications/Voice/Parental controls/Trusted contact/Safety/Security and login/Remote control/Cloud browser/Storage/Data controls | Row, chevron                          | Opens each App settings sub-screen                                      |
| Settings root       | Report app issue/Help Center/About                                                                                                         | Row, chevron                          | Support surfaces (not opened)                                           |
| Settings root       | Log out                                                                                                                                    | Row (red, isolated card)              | Signs the user out                                                      |
| General             | App language                                                                                                                               | Row, chevron                          | Opens language picker (not captured)                                    |
| General             | Auto-correct spelling / Haptic feedback                                                                                                    | Toggle                                | Device/input behavior                                                   |
| General             | Pro level: Standard                                                                                                                        | Row → dropdown                        | Sets a global "intelligence" default tier                               |
| General             | Autocomplete / Trending searches                                                                                                           | Toggle                                | Composer/search suggestion behavior                                     |
| General             | Web search                                                                                                                                 | Toggle                                | Auto-invokes web search for real-time info                              |
| Notifications       | Codex/Group chats/Marketing/Personalized tips/Projects/Responses/Tasks/Usage                                                               | Row, chevron, channel value           | Per-category Push/Email/Both delivery setting                           |
| Voice               | Voice persona carousel (9 dots)                                                                                                            | Swipeable picker                      | Selects among 9 named voice personas                                    |
| Voice               | Model / Intelligence / Language                                                                                                            | Row → dropdown                        | Sets voice-mode model, reasoning tier, and language (or Auto)           |
| Voice               | Start ChatGPT with Voice                                                                                                                   | Toggle                                | App launches directly into voice mode                                   |
| Voice               | Background conversations                                                                                                                   | Toggle                                | Keeps voice session alive off-screen/other apps                         |
| Parental controls   | Add family member                                                                                                                          | Row (blue)                            | Starts account-linking flow                                             |
| Trusted contact     | Get started                                                                                                                                | Row (blue)                            | Starts crisis-contact nomination flow                                   |
| Safety              | Reduce sensitive content                                                                                                                   | Toggle                                | Applies extra content safeguards                                        |
| Security and login  | Security keys & passkeys                                                                                                                   | Row, count badge                      | Manage phishing-resistant sign-in methods                               |
| Security and login  | Authenticator app / Text messages                                                                                                          | Row, On/Off                           | Per-method MFA state                                                    |
| Security and login  | Active sessions                                                                                                                            | Row, count badge                      | Device/session management                                               |
| Security and login  | Lockdown mode                                                                                                                              | Row, chevron                          | Advanced security mode (detail not captured)                            |
| Security and login  | Require Face ID (Codex)                                                                                                                    | Toggle                                | Local biometric gate specifically for Codex access                      |
| Cloud browser       | Default permission                                                                                                                         | Row → dropdown ("Always ask")         | Sets default site-open approval policy for the remote browser           |
| Cloud browser       | Add site                                                                                                                                   | Row                                   | Per-site permission override                                            |
| Cloud browser       | Clear all cookies                                                                                                                          | Row (red)                             | Clears the cloud browser's cookie jar                                   |
| Storage             | Usage bar                                                                                                                                  | Progress indicator                    | Visualizes 161 MB / 100 GB used                                         |
| Storage             | Documents / Images                                                                                                                         | Row, size value, chevron              | Drills into per-type storage detail (not captured)                      |
| Data controls       | Improve model for everyone                                                                                                                 | Toggle                                | Opts content into model training                                        |
| Data controls       | Include audio recordings                                                                                                                   | Toggle                                | Opts voice audio into model training                                    |
| Data controls       | Location services                                                                                                                          | Row (blue value = link)               | Device location permission status/toggle                                |
| Data controls       | Allow location access                                                                                                                      | Row (blue link)                       | Requests OS location permission                                         |
| Data controls       | Work network access                                                                                                                        | Row, On/Off                           | Network-level access control (org/work context)                         |
| Data controls       | Archived chats                                                                                                                             | Row, chevron                          | Views archived chats                                                    |
| Data controls       | Archive all chats / Delete all chats                                                                                                       | Row (blue / red)                      | Bulk chat-history actions                                               |
| Data controls       | Export data                                                                                                                                | Row                                   | Requests a data export                                                  |
| Data controls       | Delete account                                                                                                                             | Row                                   | Initiates account deletion                                              |
| Account (069)       | Cancel / Continue                                                                                                                          | Alert buttons                         | Dismiss, or hand off to web to change email                             |
| Account (070/071)   | OK / Learn more                                                                                                                            | Alert buttons                         | Dismiss, or open subscription-management help                           |

---

## Notable design decisions

- **Three distinct interaction patterns for settings, used deliberately by depth/reversibility**: (1) pushed full-screen views with a "< back" chevron for anything with multiple controls (Storage, Data controls, Security and login, etc.); (2) small anchored popovers for single-choice pickers that don't warrant a full screen (Appearance, Accent color, chat Intelligence tier); (3) native system alerts for anything that hands off to the web or needs a hard interrupt (email change, subscription management). This is a clean escalation of UI weight to match the weight of the decision.
- **Danger-zone isolation is inconsistent.** "Log out" gets its own visually separated red card at the bottom of the root Settings screen, and "Delete all chats" is styled red inline — but "Delete account," arguably the highest-stakes destructive action in the whole tree, is styled as a plain black row with no red emphasis and sits directly under "Export data" with no separation. This reads as a genuine inconsistency rather than an intentional detail.
- **"Intelligence" is used as a label in at least three unrelated places** — the chat composer's model popover (Pro/Extra High/High/Medium/Instant), General settings' "Pro level: Standard," and Voice settings' "Intelligence: Instant" — each apparently independently adjustable. If we ship an analogous reasoning-effort control, a single consistent name and a single source of truth (or explicit, visibly-linked scoping) would avoid this ambiguity.
- **Progressive disclosure via "Featured >" / "Productivity >" section-peek rows** in the Plugins marketplace: only 5–6 items show per category with a ">" to see the full list, keeping the default view scannable while implying deep catalogs behind each category.
- **Suggested/template rows as dashed-border cards** (Scheduled tasks) visually distinguish "things you haven't created yet, tap to add" from real, owned list items — real items presumably render as solid-border cards (not observed in this set since the account had none scheduled).
- **Disabled-state primary buttons communicate required fields inline** — "Create project" renders visibly muted/gray until a name is typed, rather than being hidden or throwing a validation error on submit.
- **The account's identity fields are split into "editable in-app" vs "editable on web only" without a visual cue up front** — Email and Subscription look like normal chevron-free rows next to genuinely-editable rows (Appearance, Accent color) until tapped, at which point they reveal themselves as web-handoff triggers via a modal alert. There is no lock icon, "web only" label, or other affordance distinguishing them in the resting list state.
- **A single settings surface serves two products** (ChatGPT and Codex): Codex gets its own notification category, its own biometric-lock subsection inside Security and login, and appears as a plugin entry ("Codex Browser Recorder") — all without a separate top-level "Codex settings" destination. Codex is folded into the existing categories rather than getting a parallel tree.

## Capabilities visible here that web documentation would not tell you

- **A server-hosted "cloud browser"** with its own cookie jar (clearable independent of the device's Safari/WebKit state), a default site-open approval policy ("Always ask"), and a per-site override list — meaning the agent can browse the web from server-side infrastructure, not just via on-device WebView, and the product exposes a first-class trust/permission surface for it.
- **A trusted-contact crisis-intervention pipeline**: a backend classifier that can detect self-harm/suicide risk signal in conversation content and _automatically_ notify a nominated third party (18+, requiring some contact-linking/verification flow) — this is a proactive outbound-notification system triggered by conversation content analysis, not a passive help-resource link.
- **Parent–teen account linking** with parent-side feature limits and safeguards, implemented as a bidirectional account link rather than a simple content filter toggle.
- **A tiered plugin-permission model** ("Allow low-risk") implying the product internally classifies plugin actions by risk level and offers users a blanket auto-approval threshold rather than only binary always-ask/never-ask.
- **Scheduled tasks can be seeded from a plugin's output**, not just camera/photo/file attachments — visible only in the attachment-picker action sheet, not documented anywhere as a "scheduled task" capability.
- **Voice mode has an entirely separate model/intelligence/language selection from text chat**, decoupled per-surface rather than inheriting the chat-level model choice, and supports "Background conversations" that persist across app-switch and locked-screen states — implying an active audio session capable of running detached from the foreground UI.
- **Subscription purchased via Apple's App Store cannot be modified in-app at all** — every subscription-adjacent action (view/change plan, restore purchases) deep-links to a specific web URL (`chatgpt.com/#settings/Billing`) rather than using `StoreKit`'s native management sheet. This is a concrete, evidenced App Store compliance/monetization pattern worth mirroring or deliberately deviating from with eyes open.
- **A "Work network access" toggle**, separate from device Location Services, suggesting some organization/work-context network-level permission distinct from personal location sharing — the exact mechanism isn't explained on-screen.
- **Codex ships inside the main ChatGPT app** as a settings-integrated surface (own notification category, own Face ID gate) rather than requiring a separate installed app, at least in this build.

---

_Compiled from screenshots only — no web docs, source code, or vendor statements were consulted for this document. Any capability described above is inferred strictly from what is visibly rendered in the captured screens._
