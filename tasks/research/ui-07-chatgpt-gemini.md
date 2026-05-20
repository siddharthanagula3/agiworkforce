# UI-07: ChatGPT Desktop and Gemini Web — Pattern Survey

> Research survey for AGI Workforce. Sources: 18 PNGs in `~/Desktop/reference/ui/chatgpt-desktop/` and 13 PNGs in `~/Desktop/reference/ui/gemini-chat/`. All filenames are relative to those folders. Compiled 2026-05-08.

## Headline contrast

ChatGPT Desktop is a **chrome-light, composer-as-everything** app. Almost every action — model, mode, attach, tools, voice — is reached from the single bottom composer pill. Gemini Web is a **multi-pane, content-rich** app where the chat is one of several "surfaces" (Maps split-view, Video templates gallery, NotebookLM, Canvas) and the sidebar is the spine. The two products do not converge on a single chat shape; they're answering different questions about what a chat app is.

---

## 1. New conversation / empty state

### Empty-state composer

**ChatGPT** (`01_app-chrome_full-window-menu-bar-empty-state.png`, `04_empty-state_collapsed-sidebar_5point4-thinking-composer.png`):

- Massive black canvas with **zero content** — no greeting, no chips, no examples. Just the composer pill anchored to the bottom-center, ~80% page width.
- Composer is one rounded pill, two rows: row 1 is the "Ask anything" input (placeholder text, no caret label); row 2 is the controls. Left controls: `+` plus, globe, anchor-with-arrow (Atlas browser tool), App-Store-style "A" (skill / app launcher), then text label "5.4 Thinking" (the model dropdown). Right controls: large hollow circle (voice / live), microphone, and a circular arrow-up send button (greyed when empty).
- Title bar collapses to "ChatGPT 5.4 Thinking >" — clicking the chevron opens the model selector. So in ChatGPT, model is shown in three places at once (title, composer label, dropdown).
- The "Bring ChatGPT" Atlas browser banner (`02_empty-state_collapsed-sidebar_atlas-banner.png`) hovers top-center as a dismissable card — a marketing nag, not a feature.

**Gemini** (`01_home_empty-state-greeting-import-memory-banner.png`):

- Strong **greeting**: sparkle icon + "Hi Siddhartha" line + huge "What should we do today?" headline (24-32 px, light weight). The composer sits right below, **in the middle of the page**, not at the bottom.
- Composer is a darker rounded card; row 1 placeholder "Ask Gemini 3", row 2 has `+` plus, "Tools" chip, and right side has model "Pro" dropdown + microphone. **No send button when empty** — the mic doubles as the empty-state call to action; once you type, it morphs into a send arrow.
- Below the composer, **5 suggestion chips** in two rows: "For you", "Create image", "Create music", "Create video", "Write anything", "Boost my day" — each chip carries a tiny colored emoji-icon (paint, music note, etc.).
- Top-right corner shows a "PRO" badge + avatar circle (green ring with initial). Top-left has hamburger sidebar toggle and a new-chat icon.

### Folder/scope/project picker

- **ChatGPT** (`05_sidebar-expanded_projects-recents-upgrade-button.png`): Projects are sidebar nodes — "ChatGPT" (the default scope), "GPTs" (custom GPT store), then a "New project" button followed by inline project list (claude prompt, Coding, agi Automation LLC, codex). You **enter a project context by clicking the project**, not by selecting it from the composer. Conversations made under that scope land in the project automatically.
- **Gemini** (`03_chat_image-generation-with-thinking-and-sidebar.png`): Sidebar has a "Gems" group (CodeXmind-python, prompt creator for claude) above the "Chats" list. Gems are reusable persona/role prompts, more like custom GPTs than ChatGPT Projects (no shared file pool — see §4 below).

### Suggested prompts on home

- **ChatGPT**: NONE. The empty state is intentionally barren. The bet is that returning users know what they want, and new users follow the chevron in the title bar.
- **Gemini**: 5 chips described above. They double as feature discovery (Create video, Create music) and prompt scaffolds (Write anything, Boost my day).

---

## 2. Composer

### Tool toggles

**ChatGPT** (`13_composer_search-mode-active-trending-queries.png`):

- Three tool icons live on the composer's left: globe (Search), anchor-arrow (Agent / Atlas browse), and App-Store "A" (Skills / Apps). When activated, **the globe and anchor turn solid blue** and gain a text label ("Search", "Agent"). The placeholder text changes to "Search the web". Above the composer, **trending queries** appear as a list with up-trend arrows (no kings protest march 28, David Muir, illinois basketball, Danica Patrick). This is a clear active-state signal.
- Plus menu (`07_composer_attachment-menu-upload-file-photo-screenshot.png`): "Upload file", "Upload photo", "Take screenshot" (with a `>` indicating submenu), "Take photo".
- Screenshot submenu (`08_composer_screenshot-submenu-built-in-display-popout.png`): cascading menu, "Screens" header + "Built-in Retina Display" with the keyboard shortcut `⇧⌘1`. ChatGPT Desktop bridges into macOS-level capture; only viable because Tauri-equivalent / native shell.

**Gemini** (`04_composer_tools-menu-canvas-deep-research-video-music.png`):

- Tools is a single button that opens a card menu. Items: "Create image", "Canvas", "Deep research", "Create video", "Create music" (with a "New" pill badge), "Guided learning". Then a divider "Experimental features" with a "Labs" badge, and "Personal Intelligence" toggle.
- Plus menu (`05_composer_plus-menu-upload-drive-photos-code-notebooklm.png`): "Upload files", "Add from Drive", "Photos", "Import code", "NotebookLM" — Google integrations are first-class. ChatGPT does not have anything equivalent to "Add from Drive" because the OAuth surface area is OpenAI-specific.

### Voice input

**ChatGPT** (`10_composer_voice-recording-active-stop-button.png`, `11_composer_voice-recording-paused-resume-send.png`, `12_composer_voice-upload-recording-prompt.png`):

- Voice recording opens a **floating pill in the top-right corner of the window**, not in the composer. The pill shows a timer (0:02), a red square Stop button, and "Ask before recording others." subtitle (consent reminder).
- Paused state: timer (0:05), `Resume` (white outlined pill) and `Send` (solid blue) buttons side by side.
- After recording you get a "Upload this recording?" modal with Upload / Delete / Cancel — the recording is held privately until you confirm.
- A separate hollow-circle icon in the composer (`9` shape, distinct from the mic) is **Live voice / Realtime mode**, equivalent to ChatGPT's Voice Mode call.

**Gemini** (`01_home_empty-state-greeting-import-memory-banner.png`):

- Single microphone icon on the composer's far right. There is no separate "advanced" voice mode in this Gemini Web view (Live mode lives in the mobile app). Press-to-talk transcribes into the input.

### Multi-line / character count / send

- **ChatGPT** composer keeps a fixed pill height even when empty; auto-grows on multi-line. **No character count** visible. Send arrow is a circular grey button that gains contrast when text is non-empty.
- **Gemini** composer auto-grows similarly; no character count; the mic-or-send icon switches in place. Both apps use Enter to send, Shift+Enter for newline (standard).

### Image generation control

- **ChatGPT**: image gen is implicit from the Tools / model selection. There is no dedicated "Create image" entry; you ask in plain language. Compare with…
- **Gemini**: explicit "Create image" / "Create video" / "Create music" entries in both the Tools menu AND the empty-state suggestion chips. Generation surfaces inline in the chat (e.g., `03_chat_image-generation-with-thinking-and-sidebar.png` shows the generated image at full chat width).

---

## 3. Message rendering

### Avatars vs no avatars

- **ChatGPT** (`17_chat_response-thought-blocks-expanded-tool-use.png`): **No avatars.** The user message is a right-aligned bubble with rounded corners and a slightly lighter background. Assistant message is full-width with a left border and no avatar. The header "Thought for 21s" / "Thought for 9s" replaces the role marker.
- **Gemini** (`08_chat_flights-show-thinking-expanded-reasoning-stages.png`, `03_chat_...`): User messages are right-aligned grey bubbles; assistant messages are prefixed with the **purple sparkle icon** (the Gemini brand glyph). No human avatar on either side.

### Density

- **ChatGPT 17** crams a lot per scroll: tight 14-px line height, headers in a slightly larger weight, sources chips inline. Density is **comfortable-compact** — closer to ChatGPT's web app than to Claude Desktop's airy spacing.
- **Gemini** is more **comfortable**, with generous vertical rhythm between thinking section, "Show thinking" toggle, content blocks, embeds, and footer actions. The right-pane Maps view actually stretches the chat column narrower, which makes the text feel further apart.

### Markdown quality

- **ChatGPT** renders **headings, bold, bulleted lists, inline code, code blocks**. Inline code uses a subtle grey-pill background. The inline citation chip ("Claude API Docs v1") sits inside the prose like a token chip.
- **Gemini** (`08_chat_flights-...`): renders bold subheadings (Defining the Search, Refining the Destination), italics, bullets, paragraphs. Same baseline coverage. Both render LaTeX math in dedicated blocks (not pictured here but visible across other Gemini screenshots in the broader corpus).

### Code blocks

ChatGPT screenshot 17 shows code-style inline grey pills (`PreToolUse`, `PostToolUse`, `.env`) but no fenced-block screenshot is in this slice. Both products ship: copy-button, language label, syntax highlighting (verified from prior research).

### Tables, mermaid, math

Not visible in this slice — both apps support them. Gemini's flights structured card (`07_chat_flights-result-google-flights-structured-card.png`) is the closest thing to a "rich table" — a custom Google Flights component with row-per-result (logo, time, route, stops, duration, price). It is **not markdown** — it's a first-party Google card.

### Citation rendering

- **ChatGPT** (`17_...`): inline citation chip after the relevant sentence, plus a "Sources" footer that opens a list. The thinking-trace popover even shows the search the model ran (`Searching official docs for Claude Code hooks`) with a tiny domain favicon and URL chip (`docs.anthropic.com`). This is the gold standard for show-the-work.
- **Gemini** (`13_chat_youtube-thumbnail-card-with-source-citation.png`): YouTube source rendered as a full thumbnail card with title, channel name, view count, and a YouTube icon — a dedicated card per source rather than an inline chip. More dramatic but takes more vertical space.

### Tool / web-search inline rendering

- **ChatGPT**: tool calls live inside the "Thought for Ns" panel. When expanded, the search query and per-result snippets are visible in a frosted overlay. **Tool steps are visually subordinated to thinking** — they are inside the thinking accordion, not above the answer.
- **Gemini** (`03_chat_image-generation-with-thinking-and-sidebar.png`): "Show thinking" is a separate accordion above the generated content. When expanded (`08_...`) it shows multi-stage reasoning headers in bold (Defining the Search, Refining the Destination, etc.) — more like a structured thinking journal than a tool-call log. Gemini does not surface the actual search query verbatim the way ChatGPT does.

---

## 4. Sidebar / navigation

### Conversation history

**ChatGPT** (`05_sidebar-expanded_...`): Single column, sections from top: search box, "ChatGPT" (root scope), "GPTs", "New project" button, project list (claude prompt, Coding, agi Automation LLC, codex), then a flat list of recent chats (Louisiana Road Trip Itinerary, Best Texas Road Trips, Cities Without Cars, Utah Itinerary Guide, Memory Export Summary, APR and Credit Score, …). **No date grouping is visible** — just reverse-chronological with no Today/Yesterday section headers (compare to Claude Desktop). Bottom: "Upgrade your plan" CTA chip and user popover trigger ("SN Siddhartha Nagula").

**Gemini** (`03_chat_...`): Sections from top: hamburger toggle + new-chat icon, "New chat" button, "My stuff" link, **"Gems" group** (CodeXmind-python, prompt creator for claude), then **"Chats" group** (complete health ai, outlier, Generate an image of a futuristic AI…, AI Desktop Apps Compelling Claude, Generate an image of a futuristic AI d…, Golden Retriever Fetch Video Generation, Video Prompt: Road Trip Navigation A…, Road Trip Navigation Video Generation, Weekend Trip: Nashville vs Gulf Coast, New Orleans After 10 PM). Bottom: gear icon + "Settings & help".

### Search, pinning, folders, project organization

- **ChatGPT**: Search box at top of sidebar. **No pinning visible**. Projects act as folders. **No nested folders.**
- **Gemini**: No search box visible in this slice (search is via global window-level search). **No pinning.** Gems and Chats are the only two organizational primitives. **No nested folders.**

### Model picker location

- **ChatGPT**: Three places — title bar chevron (`ChatGPT 5.4 Thinking >`), composer label ("5.4 Thinking" inline), and the dropdown those open (`09_composer_model-selector-auto-instant-thinking-legacy-temp-chat.png`). Options: Auto / Instant / Thinking / Legacy models (collapsed) / Temporary Chat (toggle). Each option has a one-line description ("Decides how long to think", "Answers right away", "Thinks longer for better answers"). Selected option (Thinking) gets a checkmark.
- **Gemini**: One place — composer's right side, "Pro" / "Fast" / "Thinking" dropdown chip (visible across `01`, `04`, `05`). No description per option in this view; selection is more discreet. The "PRO" pill in the top-right corner is a tier indicator, not a model picker.

### Settings entry point and IA

- **ChatGPT** (`06_profile-popover_email-upgrade-settings-logout.png`): Profile popover with email, "Upgrade your plan", "Settings" (with `⌘,` shortcut), and "Log Out". Settings opens a separate window (not in the slice).
- **Gemini**: Bottom of sidebar — gear icon + "Settings & help" text — which opens an overlay/page (not in this slice). Gemini settings are also reachable via google.com top-bar account chip.

### Account menu

- **ChatGPT**: Avatar circle bottom-left of sidebar opens the popover above. Quiet and minimal.
- **Gemini**: Avatar circle top-right of the chat surface (the colored "S" ring). On Google products this opens the Google account switcher; not specific to Gemini.

---

## 5. Project organization

### ChatGPT Projects (`14_projects_create-modal-name-input-presets.png`, `15_projects_detail-amazon-assesment-chats-tab.png`, `16_projects_detail-hackathon-sources-tab-add-sources.png`)

- **Create modal** is a side panel with a callout: "Projects give ChatGPT shared context across chats and files, all in one place." Below: a "Project Name" input with an emoji-icon picker (smiley face with `+`). Three preset chips: Investing (dollar icon), Homework (graduation cap), Writing (feather pen). Then a primary "Create project" button and a subtle "More options" link in blue.
- **Project detail** (`15_...`): center column has the project icon (folder) + name ("amazon assesment"), then a tab strip: "Chats" (active) / "Sources". Chat list shows title + first-line preview as a two-line card per item (Max Array Correlation: "Did i write anything wrong ? Or is it something else"; Mock Interview Prompt AAP: "Give me a prompt which will act as a mock interviewer for the company and the role Associate Software Developer with 2.5 years of experience for advance auto parts").
- **Sources tab** (`16_...`): empty state with three icons (Slack-like cluster, Drive cloud, generic upload) and "Projects are smarter with connected sources" / "Upload, connect or save sources here" + a primary "Add sources" button.
- Composer at the bottom of the project view shows a **"Search the web"** placeholder + active "Search" chip — projects can be queried via search across their sources.

### Gemini Gems

Not directly screenshotted in this slice; we only see Gems referenced as sidebar entries (CodeXmind-python, prompt creator for claude). The crucial difference:

- **ChatGPT Project = scope (chats + files + instructions)**.
- **Gemini Gem = persona (prompt + tool config), no shared file store**.

The closest equivalent to project files in Gemini is NotebookLM (separate product). This is a meaningful product distinction.

---

## 6. Distinctive features

### ChatGPT-only

1. **Custom GPT store / "GPTs"** — sidebar entry above projects.
2. **Atlas browser integration** — anchor-arrow tool icon in composer; opens a download modal (`03_atlas-browser_download-modal.png`) prompting "Try Atlas — ChatGPT's new browser. Bring ChatGPT with you across the web…". So ChatGPT is leveraging the desktop app to upsell a separate browser product. Risky precedent.
3. **Thought-block popover** showing the actual search queries and tool-result snippets — rare across products.
4. **Compact / mini popout window** (`18_popout-window_compact-mode-empty-state.png`) — a small floating chat bubble window the user can keep on top while doing other work. Window controls show two icons in top-right: pop-out / picture-in-picture and edit (new chat). This is a desktop-native feature; web can't ship it.
5. **Voice recording with separate Upload/Delete confirmation** — recording isn't auto-sent, you confirm. Privacy-thoughtful pattern.
6. **Temporary Chat toggle** in the model picker — a one-shot incognito chat. Excellent UX even if the underlying retention story is messy.
7. **Three-place model surfacing** (title bar / composer label / dropdown). Probably overkill but the title-bar chevron with model name is nice.

### Gemini-only

1. **Map/embed split-pane** (`10_chat_maps-embed-...`, `11_chat_maps-detail-golden-gate-bridge-description.png`) — when content warrants it, the chat compresses left and a full Google Maps loads on the right. This is the "Workspace" pattern. Anthropic Artifacts works similarly but for code/docs; Gemini extends it to first-party Google services.
2. **Structured cards from Google services** — Flights (`07`), Maps, YouTube (`12`, `13`). These render as actual Google product UI inside the chat. ChatGPT can't compete here without Google APIs.
3. **Video generation templates gallery** (`06_video-templates_gallery-...`) — a curated pre-built grid (Outdoors, Metallic, Memo, Glam, Crochet, Cyberpunk, Video Game, Cosmos, Action Hero) for one-click prompt scaffolding. Prompt-as-template is a nice low-friction entry.
4. **"Have Gemini watch the entire video"** CTA (`12_chat_youtube-...`) — a chat-aware turn-key follow-up button beneath an embed. Action chips like this are an underused pattern.
5. **Import memory page** (`02_import-memory_...`) — explicit cross-product migration tool. "Import memories from other AI apps so you can easily switch to Gemini without starting over." Two steps: copy a prompt to your other AI, paste the response, optional zip upload. Clever onboarding for a market-laggard.
6. **Greeting + suggestion chips** as the empty state — strong feature discovery.

### What both ship

- Markdown rendering, code blocks with language labels, copy buttons.
- Thinking-trace accordion ("Show thinking" / "Thought for Ns").
- Inline thumbnail / image rendering.
- Voice input (microphone icon).
- Plus menu for attachments.
- Top-right user avatar with popover.

### Memory surfacing

- **ChatGPT**: not visible in this slice — memory updates surface as a small banner above the assistant message ("Memory updated"). Not screenshotted here but well-known.
- **Gemini**: the "Bring your memories with you" banner top-right (`01_home_...`) is a prominent in-app onboarding card with "Get started" / "Not now" actions. It's import-focused, not "memory updated" notifications mid-chat.

---

## 7. Comparison summary

| Pattern              | ChatGPT                                                    | Gemini                                                 |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Empty-state greeting | None                                                       | Strong ("Hi {name}, What should we do today?")         |
| Suggestion chips     | None                                                       | 5 chips with icons                                     |
| Composer position    | Bottom-anchored                                            | Center (empty), bottom (in chat)                       |
| Tool toggles         | Inline icons in composer (Search/Agent/Skills)             | Single "Tools" button → menu                           |
| Model picker         | Title bar + composer + dropdown (3 places)                 | Composer right-side dropdown only                      |
| Project / scope      | Projects (chats + files + tab UI)                          | Gems (persona prompt only)                             |
| Avatars              | None (text-only)                                           | Sparkle icon for assistant                             |
| Density              | Comfortable-compact                                        | Comfortable                                            |
| Citations            | Inline chip + Sources tab + thinking-popover URL           | Full-card thumbnails (YouTube) or inline blue links    |
| Tool render          | Inside thinking accordion                                  | Separate "Show thinking" with structured stage headers |
| Embeds               | Almost none (text-first)                                   | Maps split-pane, Flights cards, YouTube cards          |
| Voice UX             | Floating top-right pill, pause/resume, upload-confirmation | Single mic in composer                                 |
| Settings entry       | Profile popover (`⌘,`)                                     | Sidebar bottom gear                                    |
| Compact / popout     | Mini desktop popout window                                 | None (web only)                                        |
| New-conversation org | Project as scope                                           | Gem as persona                                         |
| Sidebar grouping     | Projects → Recents                                         | Gems → Chats                                           |
| Date headers         | None visible                                               | None visible                                           |
| Pinning              | Not visible                                                | Not visible                                            |
| Drive integration    | None                                                       | Native (Drive, Photos, NotebookLM)                     |
| Trending suggestions | Yes (search mode trending queries)                         | No                                                     |
| Temporary chat       | Yes (toggle in model picker)                               | No                                                     |
| Custom personas      | GPTs (store + custom)                                      | Gems (custom only)                                     |
| Theme                | Dark only in this slice                                    | Dark only in this slice                                |

---

## 8. Patterns we should ship for AGI Workforce

### From ChatGPT

1. **Composer-as-control-surface.** Keep the composer pill anchored bottom; tool toggles, model selector, and microphone live inside it. This is the dominant pattern across ChatGPT, Claude, and Gemini and we already mostly ship it (`packages/chat`).
2. **Active-tool visual state.** When Search/Agent/Skills are toggled on, change the icon to a solid colored pill with a text label and update the placeholder ("Search the web"). Easy win that makes the active mode unmissable. We currently lack this.
3. **Trending suggestions when in search mode.** Show 3-4 recent or trending queries above the composer when Search is active. Cheap-to-implement, high signal.
4. **Thinking-popover that exposes actual tool calls.** ChatGPT's "Searching official docs for Claude Code hooks" with the URL chip is the most transparent reasoning display in any product. We should match this for our 10+ providers (especially since cross-provider continuity is our differentiator).
5. **Temporary Chat toggle inside the model selector.** One-line addition to our model picker. Huge user trust win.
6. **Project = chats + sources + instructions, with tabs.** Our projects should adopt the Chats / Sources tab pattern. Don't ship a Gem-style persona-only project.

### From Gemini

1. **Greeting + suggestion chips on empty state.** Right now Local mode users hit a blank screen. A 5-chip suggestion strip ("Local LLM chat", "BYOK setup", "Connect provider", "Browse models", "Switch provider mid-chat") would directly demo our differentiator.
2. **Split-pane Workspace for rich content.** When the model returns code, a long doc, or a tool result that benefits from full-width rendering, slide a right-pane in. Compatible with our existing artifacts work.
3. **Action chips after generated content.** "Have Gemini watch the entire video" is a 1-tap follow-up. We can ship "Continue with [other provider]" chips after any response — directly tied to differentiator #3 (cross-provider continuity).
4. **Import memory from other AI apps.** Shipping a "Bring your memories from ChatGPT/Claude/Gemini" wizard is a strong wedge for users who already have history elsewhere. Practical: paste-export-zip from `chat.openai.com/data-export` or the equivalent.
5. **Mic-as-empty-state-CTA.** When the input is empty, the right-side button is the mic; when text is typed, it morphs to send. Removes one cognitive step.

### Patterns we should NOT copy

1. **ChatGPT's barren empty state.** No greeting, no chips, no examples. Works for OpenAI because they have brand pull; for a launch product it's hostile.
2. **ChatGPT's title-bar chevron model selector.** Surfacing the model in three places is overkill. Pick one (composer label) and live with it. We already do.
3. **ChatGPT's Atlas browser nag.** Cross-product upsell modal in the chat surface is a discoverability mistake disguised as growth. Gemini doesn't do this and is calmer for it.
4. **Voice recording in a top-right floating pill** (separate from the composer). The location split is awkward — the user looks down at the composer to think and up to the corner to control recording. Keep the recording state in the composer itself.
5. **Gemini's "PRO" badge top-right.** Persistent tier-status badge in the chrome is anti-feature: it doesn't tell the user anything they don't know and it's a constant upsell pressure point.
6. **Gemini's center-positioned empty composer that snaps to bottom on first message.** Looks slick but the layout shift on first send is jarring. Anchor to bottom from the start; show the greeting _above_ the composer.
7. **ChatGPT's Compact Mini popout** as a v1 feature — high engineering cost, narrow audience. Defer.

---

## 9. Visual polish differences

- **ChatGPT** uses a near-pure-black background (#0e0e0e-ish) with subtle 1-px grey separators. Composer pill has a 1-px lighter inner stroke. Iconography is monoline, geometric. Very Apple-Notes-meets-OpenAI aesthetic.
- **Gemini** uses a slightly warmer dark (#1a1a1a-ish) with bigger radius corners (12-16 px on composer card) and a saturated purple sparkle as the brand glyph. Iconography is rounded, friendlier. The empty-state typography (light weight, large) gives it a Material 3 feel.
- **ChatGPT** uses **blue** as both active (Search/Agent solid pill, Send button blue) and brand color.
- **Gemini** uses **purple/pink gradient** in the sparkle and a softer blue for links. Less monochrome.
- **Density**: ChatGPT 8-10 px gutters between bubbles; Gemini 12-16 px. ChatGPT feels denser even with fewer bytes per message.

---

## 10. Open questions

1. **Markdown corner cases**: Neither slice contains screenshots of complex tables, mermaid diagrams, or LaTeX-heavy responses. We need to capture those — especially how Gemini renders math relative to ChatGPT, since both apps support KaTeX but the wrapping behavior differs at narrow widths.
2. **Pinning and folders**: I see no pinning UI in either. Are pinned chats only in the mobile apps? Worth verifying with the latest web build before deciding whether to ship in `packages/chat`.
3. **Date grouping in sidebar**: ChatGPT and Gemini both show flat reverse-chronological lists with no Today/Yesterday/Last 7 Days headers. Claude Desktop _does_ group. Is this a deliberate ChatGPT/Gemini decision (less visual noise) or a missing feature? Test users to see if they miss it.
4. **Pricing plan exposure**: ChatGPT's "Upgrade your plan" lives in the sidebar bottom and the profile popover; Gemini has a top-right "PRO" badge + an "+ Upgrade" button in the title bar. Which is less annoying? Survey 10 users.
5. **Voice mode parity**: ChatGPT has a hollow circle separate from the mic — that's "Live mode" / advanced voice. Gemini Web doesn't visibly expose this on desktop. Does Gemini's Live mode require the mobile app, or is it accessible through a different entry point?
6. **Custom GPTs / Gems creation flow**: Not pictured here. We should grab the create flows for both — they're directly relevant to our roadmap if we want to ship custom personas.
7. **Memory updated mid-chat**: I didn't see the "Memory updated" banner in any of the 18 ChatGPT screenshots. Need additional captures in a long-running thread to see how it's surfaced.
8. **Multi-modal output**: Gemini ships image, video, music, and Maps natively. ChatGPT relies on DALL-E for image and Sora for video — when those fire, are they inline or in modals? Not visible in this slice.
9. **Cross-conversation context surfacing**: Does ChatGPT's "memory" reach across chats automatically, and is there UI hinting at it? Gemini has the "Bring your memories" import but no in-chat "I remembered X from our conversation last week" affordance visible here.
10. **Error states**: No error / network-offline / rate-limited screenshots in this slice. Worth capturing for design parity later.
11. **Tool result error rendering**: When a search returns 0 results or a tool errors, how is it surfaced? ChatGPT and Gemini both must have failure states; we don't see any in these 31 PNGs.
12. **Animated transitions**: Static screenshots can't tell us how Gemini's split-pane Maps load animates in, or how ChatGPT's thinking accordion expands. Worth capturing video of those transitions before implementing parity.

---

## 11. Filename → finding map (quick reference)

### ChatGPT

- `01_app-chrome_full-window-menu-bar-empty-state.png` — full window with macOS menu bar; composer pill bottom; no greeting.
- `02_empty-state_collapsed-sidebar_atlas-banner.png` — Atlas browser banner top.
- `03_atlas-browser_download-modal.png` — Atlas download upsell modal.
- `04_empty-state_collapsed-sidebar_5point4-thinking-composer.png` — composer detail (5.4 Thinking label).
- `05_sidebar-expanded_projects-recents-upgrade-button.png` — sidebar IA: ChatGPT/GPTs/projects/recents/upgrade.
- `06_profile-popover_email-upgrade-settings-logout.png` — bottom user popover.
- `07_composer_attachment-menu-upload-file-photo-screenshot.png` — plus menu (file/photo/screenshot/photo).
- `08_composer_screenshot-submenu-built-in-display-popout.png` — screenshot submenu with display selector + ⇧⌘1.
- `09_composer_model-selector-auto-instant-thinking-legacy-temp-chat.png` — model dropdown + Temporary Chat toggle.
- `10_composer_voice-recording-active-stop-button.png` — voice pill top-right with timer + Stop.
- `11_composer_voice-recording-paused-resume-send.png` — voice pill paused with Resume/Send.
- `12_composer_voice-upload-recording-prompt.png` — Upload/Delete/Cancel modal.
- `13_composer_search-mode-active-trending-queries.png` — Search mode with trending queries above composer.
- `14_projects_create-modal-name-input-presets.png` — Create project modal with Investing/Homework/Writing presets.
- `15_projects_detail-amazon-assesment-chats-tab.png` — project detail Chats tab with two-line cards.
- `16_projects_detail-hackathon-sources-tab-add-sources.png` — project Sources tab empty state.
- `17_chat_response-thought-blocks-expanded-tool-use.png` — chat with Thought-for-N panels + expanded thinking popover + inline citation chips.
- `18_popout-window_compact-mode-empty-state.png` — compact desktop popout.

### Gemini

- `01_home_empty-state-greeting-import-memory-banner.png` — greeting + 5 suggestion chips + import-memory banner.
- `02_import-memory_copy-prompt-paste-response-zip-upload.png` — cross-product memory import wizard.
- `03_chat_image-generation-with-thinking-and-sidebar.png` — image gen inline + sidebar with Gems/Chats.
- `04_composer_tools-menu-canvas-deep-research-video-music.png` — Tools card menu.
- `05_composer_plus-menu-upload-drive-photos-code-notebooklm.png` — Plus menu with Drive/Photos/Import code/NotebookLM.
- `06_video-templates_gallery-cinematic-glam-cyberpunk.png` — video template gallery.
- `07_chat_flights-result-google-flights-structured-card.png` — Google Flights structured card inline.
- `08_chat_flights-show-thinking-expanded-reasoning-stages.png` — multi-stage reasoning headers in thinking accordion.
- `09_chat_video-generation-road-trip-map-animation.png` — generated video result inline.
- `10_chat_maps-embed-san-francisco-places-listings.png` — Maps split-pane with place cards.
- `11_chat_maps-detail-golden-gate-bridge-description.png` — Maps split-pane with detail description.
- `12_chat_youtube-embed-watch-entire-video-prompt.png` — YouTube embed + "Have Gemini watch entire video" CTA.
- `13_chat_youtube-thumbnail-card-with-source-citation.png` — YouTube source card with channel/views.

---

End of survey.
