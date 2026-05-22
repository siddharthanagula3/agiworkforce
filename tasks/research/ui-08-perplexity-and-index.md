# UI Research 08 — Perplexity (web + Computer + Comet) + INDEX.md Meta-Orientation

**Scope.** All 26 numbered PNGs in `~/Desktop/reference/ui/perplexity/` plus 4 PNGs in `~/Desktop/reference/ui/perplexity/perplexity-comet-browser-assistant/`, plus the entire `~/Desktop/reference/ui/INDEX.md`. Findings cite filenames; pixel-level details only. This agent is also the meta-orientation reporter for the other 17 research teammates.

---

## 1. INDEX.md Summary (READ FIRST — for all teammates)

`INDEX.md` is 312 lines, dated implicitly to the screenshot capture window (most files Mar 28 18:08–18:14 PT, Perplexity #25–#26 Mar 29, Comet folder Mar 28 18:16–18:17). It is the single canonical map of the `~/Desktop/reference/ui/` reference corpus.

### 1.1 Per-folder summaries (line numbers from INDEX.md)

| Folder                                                      | Files      | INDEX.md framing                                                                                                                                                                                | Key teammate use                                         |
| ----------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `chatgpt-desktop/` (L26-46)                                 | 18         | "ChatGPT macOS desktop app. Useful for: Desktop app shell, composer patterns, popout/mini windows, projects, voice recording."                                                                  | Composer patterns, voice UI, popout window.              |
| `claude/claude-desktop/` (L50-91)                           | 39         | "Anthropic Claude desktop & web app shell. **Look at this first — most directly aligned with target product.**"                                                                                 | The North Star — settings IA, connectors, profile flows. |
| `claude/claude-chat-artifacts-and-tools/` (L95-124)         | 27         | "Inline tool-use rendering, artifact viewer, reasoning blocks. Directly relevant to chat UX."                                                                                                   | Artifact sidebar, thinking blocks, A/B response compare. |
| `claude/claude-chrome-extension/` (L128-137)                | 7          | "Sidebar Chrome extension UX. Use for: building your own Chrome extension surface."                                                                                                             | Quick-mode modal, ask-vs-act permissions.                |
| `claude/claude-vscode-extension/` (L141-152)                | 9          | "VSCode marketplace extension. Use for: building your own VSCode extension surface."                                                                                                            | Modes dropdown, effort slider, sessions history.         |
| `claude/claude-connectors-directory/` (L156-160)            | 19         | "Sequential scroll states of Claude's Connectors directory modal. Use for: building your own connectors gallery."                                                                               | Each PNG = one scroll position; ~14 connectors per page. |
| `claude-code/` (L163-170)                                   | 5          | "Claude Code CLI authentication & onboarding flow."                                                                                                                                             | Bypass-permissions, theme selector, OAuth fallback.      |
| `codex-cli/` (L174-191)                                     | 15         | "OpenAI Codex CLI: auth flow, slash commands, model & reasoning selectors."                                                                                                                     | Slash command paginated UI, reasoning level UI.          |
| `codex-desktop/` (L195-218)                                 | 21         | "OpenAI Codex desktop app. Strong reference for: composer + status chips, granular settings, commit/PR flow."                                                                                   | Worktrees, MCP toggles, approval policy, popout.         |
| `gemini-chat/` (L222-237)                                   | 13         | "Gemini web chat. Use for: rich inline content (Maps, Flights, YouTube), thinking-trace UX."                                                                                                    | Inline structured cards, reasoning stages.               |
| `gemini-cli/` (L241-259)                                    | 16         | "Google Gemini CLI: auth flow, slash commands, deep settings panels."                                                                                                                           | YOLO mode, folder trust, sandboxing.                     |
| `perplexity/` (L263-291)                                    | 26 + 1 sub | "Perplexity web app + Perplexity Computer (agentic). Strong reference for: connectors gallery, skills library, settings IA, scheduled searches, shopping/travel verticals, enterprise pricing." | THIS report.                                             |
| `perplexity/perplexity-comet-browser-assistant/` (L295-301) | 4          | "Comet browser sidebar assistant. Use for: building your own Chrome-extension assistant overlay."                                                                                               | THIS report.                                             |

### 1.2 INDEX.md author notes worth flagging for teammates

- **Naming convention** (L5): `NN_<view-or-context>_<key-feature-or-subview>.png` — sequence-numbered, kebab-case parts joined by underscores. Numbering is **user-flow ordered**: auth → home → composer → chat → settings → admin/pricing (L307). So screenshot `01` is _almost always_ the empty/auth state, `>20` is settings/admin.
- **Build target → folders matrix** (L11-22): "Building this surface, look at these folders" is provided as a header table. Notable: **mobile** is not given its own folder; the mapping says to look at `codex-desktop/21` and `chatgpt-desktop/18` (compact / mini popout windows) plus general chat layouts. **There are no native iOS/Android screenshots in the corpus** — teammates building mobile surfaces should NOT expect dedicated mobile assets in this directory.
- **"Look at this first"** directive on `claude/claude-desktop/` (L51): the author flags Claude Desktop as the most directly aligned reference. Other teammates may already know this; calling it out here for any who skipped INDEX.
- **Connectors directory** (L156-160) is unusual — 19 sequential scroll states of a single modal, used as a "what does a complete connectors gallery look like at scale" reference. Other competitor folders give 1 frame per concept; this one gives 19 frames of one concept.
- **Total** (L311): ~202 reference screenshots across 12 folders. All `.png`.

### 1.3 Filesystem cross-check vs INDEX.md (verified `ls`)

| INDEX claim                                                                     | Filesystem reality                              | Status                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------- |
| `chatgpt-desktop/ (18 files)`                                                   | 18 PNGs                                         | match                                 |
| `claude/claude-desktop/ (39 files)`                                             | (not directly enumerated; subdir under claude/) | claude/ has 5 subdirs as INDEX claims |
| `claude/claude-chat-artifacts-and-tools/ (27 files)`                            | subdir present                                  | match (count not re-verified)         |
| `claude/claude-chrome-extension/ (7 files)`                                     | subdir present                                  | match                                 |
| `claude/claude-vscode-extension/ (9 files)`                                     | subdir present                                  | match                                 |
| `claude/claude-connectors-directory/ (19 files)`                                | subdir present                                  | match                                 |
| `claude-code/ (5 files)`                                                        | 5 PNGs                                          | match                                 |
| `codex-cli/ (15 files)`                                                         | 15 PNGs                                         | match                                 |
| `codex-desktop/ (21 files)`                                                     | 21 PNGs                                         | match                                 |
| `gemini-chat/ (13 files)`                                                       | 13 PNGs                                         | match                                 |
| `gemini-cli/ (16 files)`                                                        | 16 PNGs                                         | match                                 |
| `perplexity/ (26 files)`                                                        | 26 numbered PNGs + 1 subfolder + .DS_Store      | match                                 |
| `perplexity/perplexity-comet-browser-assistant/ (4 files)`                      | 4 PNGs + .DS_Store                              | match                                 |
| Mobile section (L15) refers ONLY to `codex-desktop/21` and `chatgpt-desktop/18` | confirmed; no `mobile/` folder exists in corpus | match — but worth flagging            |

**Verdict:** INDEX.md is accurate. **No referenced files are missing**. The only "phantom" worth calling out is the mobile section: there is no `mobile/` folder, by design, and INDEX.md is explicit about that. Teammates assigned mobile research must either (a) pull screenshots from outside this corpus, or (b) work from compact-mode references in desktop folders.

### 1.4 Meta-observations the author embeds (worth telling other teammates)

1. **Numbering enforces a story.** Screenshot 01 is empty-state, last numbers are admin/pricing. Read every folder in numeric order to see the user flow.
2. **Filename suffixes are descriptive.** You can often skip reading a screenshot and infer content from the slug — e.g. `09_composer_voice-recording-active-stop-button.png` tells you the composer state without opening the file. Treat slugs as captions.
3. **The connectors-directory folder is a _single_ modal scroll-paginated 19 times.** Don't treat each PNG as a different screen.
4. **Claude Desktop is positioned as the gold standard** — bias toward replicating its IA before borrowing from others.
5. **No mobile, no settings-only-mobile, no in-product onboarding wizards.** If a teammate is researching onboarding wizards (4-step flow etc.), this corpus doesn't have them — the closest reference is `claude-code/02` (CLI first-run login).
6. **Perplexity's `perplexity/` has TWO modes layered:** the regular browser product AND "Perplexity Computer" (agentic) at `perplexity.ai/Perplexity Computer`. Files 04–07 are Computer; the rest are the browser product. This split is not always obvious from filenames alone.

---

## 2. Perplexity Search-First UX

### 2.1 Home / new-query screen (Q5)

**File `01_browser_empty-tab-search-sidebar-recent-chats.png`** shows the canonical empty new-tab home in the Perplexity Comet browser app. The chrome stack is unique — Perplexity ships its own Chromium-based browser, so the macOS title bar reads "New Tab" and the URL bar is replaced by a Perplexity-branded omnibox showing `Ask anything or navigate...` with a flower-mark logo at left. Top-right has a row of icons: link, asterisk, puzzle (extensions), three-line list, vertical bars, and an `Assistant` toggle button. Just below the address bar is a centered green privacy badge: `55.1K ads and trackers blocked`.

**Sidebar (left, ~120px wide, dark grey):** ten items in this order — `Search` (active), `Computer`, `+ New thread`, `History`, `Discover`, `Spaces`, `Finance`, `... More`, then a `Recent` section listing 13+ thread titles ("skilljar anthropic", "vapi", "openai models", "claude articals", "llm models benchmarks t…", "wispr flow", etc.) which are truncated with ellipsis at the right edge.

**Composer:** centered card on a dark background, narrow (about 40% viewport width) — placeholder `Ask anything...`, plus button at left, model pill at right reading `Claude Sonnet 4.6`, mic icon, and a circular send button. **No suggestions, no greeting, no model picker prominence — the composer is monastic.** The whole bottom of the screen has just two small pill buttons: `Try Assistant` and `Customize`. The user avatar (initial "S") and a bell with a blue dot sit at the very bottom-left.

This is the cleanest empty-state in the corpus. ChatGPT (`chatgpt-desktop/04`) shows composer icon row and "ChatGPT 5.4 Thinking" under a logo; Gemini (`gemini-chat/01`) has a greeting and import-memory banner; Perplexity has neither. The product trusts the user knows what to do.

### 2.2 Pro home variant (Q5 cont.)

**File `26_pro-home_perplexity-pro-composer-more-submenu-apps-step-browser.png`** shows the Pro variant. Differences from `01`:

- A wordmark `perplexity pro` in lowercase serif/light-weight is centered above the composer.
- Sidebar adds `Discover`, `Spaces`, `Finance` (same as 01) but composer placeholder reads `Type @ for connectors and sources` — a deliberate hint that `@` is the connector trigger.
- Top-right adds `Scheduled v` button, `0 | Add credits` chip, browser/window icon — same Computer-mode shell.
- Composer plus-menu is open showing `Create files and apps` highlighted at top, plus standard `Upload files or images / Add files from cloud / Connectors and sources / Computer / Deep research / Model council [Max]` (Model council is locked to Max tier — small lock icon).
- A flyout off "More >" shows `Create files and apps ✓ / Learn step by step / Control browser` — **three "Apps" are framed as composer modes, not navigation**.
- Below the composer: `Show suggestions` text plus three cards labeled `Federal Workforce…`, `Diff Eq Lectu…`, `[scrolls right]` — these look like template prompts.

Compared to `04_computer_empty-state-orchestrator-model-selector.png`, both have a templated card row but Computer mode adds `Organize my life`, `Help me learn`, `Monit…` chips and `Shuffle` / `View all` link. So Pro home and Computer share the same suggestion row component but with different content.

### 2.3 Search modes (Q6)

Modes are surfaced in **three places**, none of which is a top-level toolbar:

1. **Composer plus menu** (`02_browser_composer-plus-menu-files-cloud-connectors-deep-research.png`) lists modes inline as menu items: `Upload files or images / Add files from cloud > / Connectors and sources > / Computer / Deep research / Model council [Max] / More >`. Modes mix sources + skills + research types.
2. **Composer model selector** (`03_browser_composer-model-selector-best-sonar-gpt-gemini-claude.png`) — clicking the model pill opens a vertical list: `Best (Selects the best available model) / Sonar / GPT-5.4 / Gemini 3.1 Pro / Claude Sonnet 4.6 / Thinking [toggle, on] / Claude Opus 4.6 [Max, lock] / Nemotron 3 Super`. Note **`Thinking` is a toggle inside the model menu, not a separate mode** — this is unusual.
3. **Slash shortcuts** (`16_settings_shortcut-create-modal-name-instructions-mode-model.png`, `17_settings_shortcuts-list-custom-trigger-commands.png`) — user-defined shortcuts each carry a Mode (e.g. `Search`) and a Model pinned to that shortcut. Triggered with `/name`.

**There is no "Pro / Auto / Reasoning / Deep Research / Labs" toolbar like the public Perplexity web app.** This corpus is a newer-iteration UI where the modes have been folded into the plus menu. Worth confirming with a fresh capture; the screenshots are dated Mar 28–29.

### 2.4 Search submission / streaming (Q7)

**Not directly captured** — the corpus has zero in-flight search screens. The closest is `25_chat_comparison-table-perplexity-vs-others.png` which is a finished response showing a markdown table answering "what can perplexity can d…" (note: full query truncated by the tab title). The response includes:

- Top sub-header `So instead of "one model does everything," Perplexity tries to be an orchestrator over many specialized models.`
- A rendered three-column table: `Use case | What Perplexity does | Rough equivalent elsewhere`. Rows: Chat & reasoning, Coding, Web search answers, Long-form research, File analysis, Browser-use assistant, Multi-model hub, Developer APIs.
- A follow-up section header `What's relatively unique to Perplexity` with one bullet visible: `Multi-agentic "answer engine" — It's designed from day one to sit on top of acros…`
- Composer at bottom with placeholder `Ask a follow-up...` and `Claude Sonnet 4.6 Thinking` pinned model.

So we know: (a) responses render rich markdown tables natively, (b) follow-up composer placeholder explicitly says `Ask a follow-up...` not `Ask anything...`, (c) the model carried over from request 1 to follow-up. **No streaming UI or progress indicator captured.**

---

## 3. Sources & Citations

### 3.1 Source rendering (Q8-Q10)

**Limited evidence in the corpus.** The chat screenshot `25` does not show inline source pills, sidebar sources, or footnote sources — only a markdown table. The Comet `04_youtube-floating-panel...` screenshot shows actions like `Summarise this video`, `Extract key takeaways`, `Scroll to the next interesting moment` — these are **page-context tools**, not sources.

**Inferred from settings:** `06_computer_connectors-sources-submenu-web-gmail-trivago.png` is the most explicit "sources" UI. The submenu shows checkable rows: `Web` (checked), `Trivago`, `ICD-10 Codes`, `GoDaddy`, `Gmail with Calendar`, `Blockscout`, `Social` — plus `Search sources` field at top. Sources are **toggled on/off per-task** as a multi-select. This is unique among AI products: most competitors auto-pick; Perplexity gives you a pre-flight source allowlist.

**Source quality indicators:** none captured. Settings `21_settings_pro-perks` shows partner brands but those are perks, not sources.

**Open gap:** the corpus does not include a chat response with citations rendered. Public Perplexity is famous for inline numbered citation pills `[1][2]`, sidebar source cards with favicons, and "Related" follow-ups — none of that is captured here. Other teammates investigating citations should NOT cite this corpus as evidence; they need fresh captures.

### 3.2 Site preview / detail view (Q9)

Not captured. No source-detail modal, no website thumbnail, no AI summary inline. **Genuine gap in the reference set.**

### 3.3 Source quality (Q10)

`24_enterprise_upgrade-pro-vs-max-pricing.png` mentions **`Premium source citations from PitchBook, Statista and more`** as a Pro feature, indicating Perplexity does ship a tiered-source feature, but no UI screenshot of it. Worth borrowing the concept (premium-source toggle for paid tiers) without copying UI we don't have.

---

## 4. Spaces / Collections

### 4.1 Spaces concept (Q11-Q13)

**Sidebar shows `Spaces` as a top-level item** (`01_browser_..., 26_pro-home_...`) but **no Space detail screenshot is in the corpus**. We can only infer:

- Spaces sit alongside `Discover`, `Finance`, `History`, `New thread` in the left rail.
- Position (between `Discover` and `Finance`) suggests it's not a per-thread concept — it's collections-level.
- No creation flow, no member roster, no Space-scoped composer is captured.

**Inferred contrast with claude-desktop projects:** `claude/claude-desktop/03_projects-gallery-view.png` (per INDEX) shows a projects gallery for Claude. Perplexity Spaces are not screenshotted in this corpus, so any direct comparison must wait for fresh captures.

**Genuine gap.** Teammates building a Spaces equivalent for AGI Workforce should not rely on this corpus.

---

## 5. Computer Use (Perplexity Computer + Comet)

### 5.1 Perplexity Computer (web-app agentic mode) (Q14-Q16)

**File `04_computer_empty-state-orchestrator-model-selector.png`** is the canonical Computer empty state:

- URL is `perplexity.ai / Perplexity Computer` (note the space-separated subpath).
- Sidebar swaps the regular nav for **`Search / Computer (active) / + New task / Tasks / Files / Connectors / Skills / Use cases`** — eight items, none named "thread" — Computer talks in `tasks`, not threads.
- Centered headline: `Computer works for you.`
- Composer placeholder: `What should we work on next?`
- Plus button shows: `Upload files or images / Add files from cloud > / Connectors and sources > / Use skills > / Select orchestrator model >`. Last one is unique to Computer mode.
- Orchestrator selector flyout shows `Claude Opus 4.6 (Powerful model for complex tasks) ✓ / GPT-5.4 [New] (Newest model for complex tasks) / Claude Sonnet 4.6 (Great for most everyday tasks. Uses fewer credits.)`. Each option has a one-liner rationale — worth borrowing.
- Top-right adds a `Scheduled v` button and `0 | Add credits` chip, indicating Computer is credits-metered separately.
- Below composer: three example task cards — `Federal Workforce…` (App), `Diff Eq Lectu…` (Presentation), and a third partially visible. Below: `View all` and `Shuffle` links.

**`05_computer_use-skills-submenu-create-manage.png`** — flyout off `Use skills >` shows `Search skills` field, then `create-skill (Create or modify Agent Skills. Use when the user wants to create a new …)` and `Manage skills →` link. Skills are first-class composer items.

**`06_computer_connectors-sources-submenu-web-gmail-trivago.png`** — the same flyout style, listing toggleable sources.

**`07_computer_add-files-from-cloud-submenu.png`** — flyout: `Google Drive`, `OneDrive`, `Sharepoint`, `Dropbox`, `Box`, each with arrow indicating per-cloud picker. **Visible bottom-right**: a tiny floating thumbnail showing what looks like a sidebar/picture-in-picture of a remote browser running — this is the **agentic browser preview** while you're still composing! That's a notable detail.

**`02_comet_sidebar-plus-menu-upload-cloud-screenshot-browser-control.png`** in the Comet folder: explicit `Control browser — Automate web tasks for you` menu item. So the Comet sidebar **IS** the per-action approval surface for browser-driving tasks. **No per-action approval prompt screenshot is in the corpus** — we don't see "Allow Computer to click Submit?" dialogs. This is a gap.

### 5.2 Computer-use status indicators (Q16)

The `Scheduled v` button at top-right (visible in `04`, `05`, `06`, `07`, `26`) is the closest thing to a status indicator — it's a queue/schedule pill. Plus the credits chip `0 | Add credits` flags when Computer mode runs out.

**Bottom-right floating thumbnail** in `07` is the most distinctive Computer-mode element — it appears to be a live browser preview docked into the page. Worth borrowing for AGI Workforce's computer-use surface.

---

## 6. Threading & Follow-Ups

### 6.1 Follow-up composer (Q17)

**File `25_chat_comparison-table-perplexity-vs-others.png`** is our only in-thread shot. The follow-up composer at the bottom has placeholder `Ask a follow-up...` (not `Ask anything...`) and the **same model pill (Claude Sonnet 4.6 Thinking) is preserved across turns**. Mic + voice + send buttons are present.

**No "people also ask" panel, no related-questions chip strip is visible.** Public Perplexity is famous for these — the reference set didn't capture them. Possible reasons: (a) UI iteration removed them, (b) screenshot was taken before they rendered. **Treat as a gap.**

### 6.2 Conversation threading (Q18)

The `History` left-rail item plus the visible `Recent` section listing flat thread names ("skilljar anthropic", "vapi", "openai models"…) — all flat, none nested, no branch markers. **Threading is linear, not tree-like, in this UI.** No visible branch-rerun, no fork, no checkpoint feature.

### 6.3 Related questions (Q19)

Not captured. Gap.

---

## 7. Distinctive Features

### 7.1 Skills library (Q20-Q22)

**File `09_skills_library-marketing-data-legal-sales-cx.png`** is one of the strongest captures in the entire corpus. It shows a full-screen `Skills` page on `perplexity.ai/Perplexity Computer` with:

- Top description: `Extend what Computer can do with reusable capabilities and actions. Computer applies skills automatically when needed. Learn more`
- Tabs: `All`, `My skills`, `Example skills`. `+ Create skill` button at right.
- Search bar centered: `Search skills`.
- Grid of 9+ skill cards visible: `create-skill`, `marketing-competitive-analysis`, `data-exploration`, `legal-contract-review`, `legal-compliance`, `sales-call-prep`, `sales-draft-outreach`, `cx-ticket-triage`, `marketing-performance-analytics`, `finance-audit-support`. Each card has a single-line description ("Profile and explore datasets to understand their shape, quality, and patterns before analysis…", etc.) and a vertical dots menu.
- Cards are dark grey on a darker background, no thumbnails — info-dense, list-y but in a 2-column grid.

This **Skills concept is one of Perplexity's bigger borrows**: discoverable, categorized, user-creatable, automatically applied. Compare with Claude's Skills (per `claude/claude-desktop/22`) which is a similar idea but Anthropic's UI is single-skill-detail rather than gallery.

### 7.2 Connectors gallery (Q20)

**File `08_connectors_grid-gmail-drive-notion-github-slack-jira.png`** — full-screen `Connectors` page. Hero text: `Connect your apps and services so Computer can access and act on your data.` Filter pills: `All / Connected / Available`. Right side: `All categories v`, `+ Custom connector` (powerful — user-defined connectors are a tier-1 feature).

Grid of 18+ connectors visible, each card is dark-grey rectangle with: square logo, name, one-line description ("Get in-depth answers from your Google Drive content"). Visible: Gmail with Calendar (✓ checkmark = connected), Google Drive, OneDrive, Sharepoint, Dropbox, Box, Notion, Outlook, Linear, GitHub, Asana, Slack, Jira, Confluence, Microsoft Teams, HubSpot, Monday.com, Supabase, plus more below the fold.

Compared with Claude's connector gallery (per INDEX `claude/claude-connectors-directory/01-19`), Perplexity's is **single-page grid + custom connector**. Claude's is paginated 19 scroll-states for 14 conn/page. Perplexity's `+ Custom connector` is the differentiator — no Claude equivalent in the directory screenshots.

### 7.3 Discover / Library tabs (Q22)

`Discover` is a left-rail item but has no detail screenshot. `History` is also there. `Finance` is a separate top-level item — and `14_settings_personalization-memory-watchlists-finance.png` shows a `Watchlists` settings section under Personalization with a `Finance` row marked `Set your watchlist for daily updates and summaries`. So Finance is a vertical mini-app inside Perplexity, not just a category.

`22_settings_shopping-empty-state-instant-buy.png` and `23_settings_travel-no-upcoming-reservations-tabs.png` show **Shopping** and **Travel** as full settings/transactions verticals — `Shopping` has an "Instant Buy" feature ("Take the complexity and frustration out of online shopping."); `Travel` has tabs `Current and upcoming / Past / Canceled`. These are NOT chat features — they're sister-app verticals in the Perplexity ecosystem. Worth knowing they exist; not necessarily worth borrowing for AGI Workforce.

### 7.4 Pro Perks (worth flagging) (Q24)

`21_settings_pro-perks-partner-discounts-headspace-oura-viator.png` shows Perplexity Pro members get partner discounts: `Samsung $50 off Galaxy Watch8`, `Perplexity Travel 10% off`, `Headspace 6 free months`, `Oura $50 off`, `Function Health $50 off`, `Viator 12% off travel experiences`, `GoodRx 4 months Gold`, `Caliber 25% off coaching`, `Eight Sleep up to $400 off`, `Thumbtack up to $275 off`. Each row has a `View` button. **This is unique among AI products** — Perplexity has positioned itself as a consumer subscription with affiliate perks. AGI Workforce should NOT borrow this directly (B2C-only and brand-specific) but the _concept_ of paid-tier perks beyond raw model access is worth a 5-minute discussion.

### 7.5 Scheduled searches & price alerts (Q24)

**File `18_settings_notifications-scheduled-search-presets-price-alerts.png`** — `Notifications` settings has a `Create a Scheduled Search` composer (placeholder: `Send me a daily summary of AI news every morning`) PLUS six preset cards: `News Digest`, `Market Forecast`, `Tech Insights`, `Science Explorer`, `Sports Roundup`, `Entertainment Weekly`. Each has 2-line description. Below: `Scheduled Searches` list — one shows `Paused / What are today's most important and widely-discussed news stories? Focus on: Ti… / Daily 12:00 PM`. Then `Price Alerts` section with `+ New Alert` button.

This is **a feature few AI products ship**: persistent recurring queries that email/notify you with fresh results. Borrow-worthy for AGI Workforce, but cost-aware (each scheduled search costs credits).

### 7.6 Shortcuts (slash commands) (Q24)

`16_settings_shortcut-create-modal-name-instructions-mode-model.png` and `17_settings_shortcuts-list-custom-trigger-commands.png` show user-defined slash shortcuts. Modal fields: `Shortcut name` (`/gpt-5.4`), `Instructions` (free-form), `Advanced` collapsible with `Mode` (Search) + `Model` (GPT-5.4 Thinking) + `Sources` (Web), and a validation message `Shortcut name can only contain letters, numb…`. List view shows `/claude-4-6-sonnet`, `/teach-me-comet`, `/trending-on-social`, `/evaluate-this-deal`, `/prep-next-meeting` — each a "saved query template with prefilled config."

**This is borrow-worthy.** AGI Workforce already has slash commands at the CLI level. Bringing user-saved slash shortcuts into the desktop/web composer would give power users a way to reuse setups.

### 7.7 Comet browser (Chrome-extension parallel) (Q24)

The `perplexity-comet-browser-assistant/` subfolder shows the **floating sidebar overlay** in Comet browser. Files:

- **01:** Empty assistant sidebar — minimal, `Assistant` heading, owl-like Comet logo, `New Tab` source badge, composer with `Type / for search modes and shortcuts`. Top toolbar has 6 icons + `X Assistant` close.
- **02:** Plus menu open: `Upload files or images (Files attached to threads are retained for 7 days)`, `Add files from cloud >`, `Screenshot`, `Control browser (Automate web tasks for you)`. The 7-day retention hint inline is unusually specific — worth borrowing as a UX pattern.
- **03:** Model selector — `Best (Selects the best available model)`, `Sonar (Perplexity's latest model)`, `GPT-5.4 (OpenAI's latest model)`, `Gemini 3.1 Pro (Google's latest model)`, `Claude Sonnet 4.6 (Anthropic's fast model)`, `Thinking [toggle on]`. **Claude is described as "fast model"** — interesting framing. Each option has a vendor-positioning blurb. Pinned model below: `Claude Sonnet 4.6 Thinking`.
- **04:** YouTube floating panel — embedded INSIDE the YouTube video page. Three suggested actions appear as a floating dock: `Summarise this video`, `Extract key takeaways`, `Scroll to the next interesting moment`. The third one is page-action driving (auto-scrolling the YouTube progress bar) — that's distinctive.

**Borrow-worthy:** the per-page action chips ("Summarise this video", "Extract key takeaways", etc.) auto-tailored to the current page. AGI Workforce extension could surface page-typed actions instead of a generic "ask anything" composer.

### 7.8 Mobile / iPad? (Q23)

**Not in scope.** No mobile screenshots in this corpus. INDEX.md (L15) explicitly redirects mobile work to compact-mode desktop screenshots.

---

## 8. Pricing & Comparison

### 8.1 Enterprise pricing (Q24)

`24_enterprise_upgrade-pro-vs-max-pricing.png` — two-card comparison: `enterprise pro $34/seat each month [Most popular]` vs `enterprise max $271/seat each month`. Both have `Billed annually Save 17%` toggle. Pro features: `Guaranteed no training on your data / Automate complex tasks with access to Perplexity Computer / Access to the latest AI models, post-trained for higher accuracy / Search across the web, files and apps / Premium source citations from PitchBook, Statista and more / Manage user permissions and integrate with SSO / SOC 2 Type II, HIPAA, GDPR, PCI DSS compliance / Dedicated Enterprise support`. Max adds: `Automate complex tasks with monthly credits for Perplexity Computer / Get the best answers with the most advanced AI reasoning models / Run deep investigations at any scale / Work with massive datasets and files / Compare responses across multiple AI models / Priority access to new features / Premium security features including SCIM, audit logs, and data retention settings`.

The `Compare responses across multiple AI models` line in Max is the closest framing to AGI Workforce's tagline ("10+ Providers in one UI"). **Note Perplexity is positioning multi-model compare as Enterprise Max only** — at Pro tier it's hidden. AGI Workforce's "free + BYOK" stance is **a meaningful pricing-differentiation play** vs Perplexity.

### 8.2 Comparison table (Q24)

`25_chat_comparison-table-perplexity-vs-others.png` is **a meta-screenshot** — Perplexity's own answer to "what can perplexity do" rendered as a table comparing itself to ChatGPT, Claude, Gemini. Notable rows:

- `Multi-model hub: One UI that lets you pick or auto-route across multiple vendors' models. Manually switching between vendors' models.`

This is Perplexity _acknowledging_ that multi-model is a thing, but framing themselves as the only one with "auto-route." **AGI Workforce's defense:** we ship it without locking it behind Enterprise Max.

---

## 9. What looks bad / clunky to avoid (Q25)

1. **Composer plus-menu mixes everything.** Sources, modes, files, skills, and "More" all live in one menu. By the time you have `Upload files / Cloud / Connectors / Computer / Deep research / Model council / More`, that's 7+ things. AGI Workforce should split: **files** (paperclip), **modes/skills** (separate trigger), **model** (model pill).
2. **Model selector buries `Thinking` as a toggle inside the dropdown.** This is non-obvious — a user who wants thinking-mode has to open the model pill, find the toggle, flip it. Make thinking a first-class keyboard shortcut + visible chip.
3. **No visible streaming UI** in any captured screen. Whether by accident of capture or by design, the corpus shows the product as "click → wait → answer renders" with no visible progress between. AGI Workforce should ship a streaming experience that's visually narrated (e.g. "Searching the web…", "Reading 4 sources…").
4. **Verticals (Shopping, Travel, Finance, Pro Perks) are visible in settings/sidebar but don't tie into chat.** A user might wonder why their Travel reservations aren't surfaced in answers. AGI Workforce should NOT clone these verticals — they bloat IA without clear value to a workforce-AI use case.
5. **Empty state for travel** (`23`) is bare — `No upcoming reservations` plus a tabs row that feels too important for an empty state. Either tabs go away when empty, or empty state has a CTA.
6. **The sidebar gets cluttered fast.** Computer mode swaps `Search / Computer / Discover / Spaces / Finance / More` for `Search / Computer / + New task / Tasks / Files / Connectors / Skills / Use cases`. **Two completely different navigation models** depending on which mode you're in. AGI Workforce should pick one nav and stick with it.
7. **`Recent` section in the sidebar truncates aggressively** ("llm models benchmarks t…"). At ~120px wide, even 4-word titles get clipped. AGI Workforce should either widen, hover-expand, or auto-rename for sidebar display.

---

## 10. Specific patterns worth borrowing for AGI Workforce

1. **Orchestrator model selector** with one-line capability blurbs (`Claude Opus 4.6 - Powerful model for complex tasks / GPT-5.4 - Newest model for complex tasks / Claude Sonnet 4.6 - Great for most everyday tasks. Uses fewer credits.`). Borrow the "uses fewer credits" framing — it makes cost-tier transparent.
2. **Sources as toggleable pre-flight allowlist** (`06_computer_connectors-sources-submenu-web-gmail-trivago.png`). Users opt into which connectors get queried. AGI Workforce can do this per-conversation as a sidecar checklist.
3. **`+ Custom connector` button** in the connectors grid. AGI Workforce should ship MCP-server connectors as user-creatable from day one, not just curated.
4. **Skills library as a discoverable gallery + `+ Create skill`** (`09_skills_library...`). One-line descriptions, auto-applied at runtime.
5. **User-defined slash shortcuts** with prefilled mode + model + sources (`16`, `17`).
6. **Scheduled searches & price alerts** (`18`) — recurring queries as a first-class scheduling primitive.
7. **Per-page action chips in Comet** (`04_comet_youtube...`) — auto-tailor browser-extension actions to current site type (YouTube → summarize/extract; LinkedIn → autofill; etc.).
8. **Inline file-retention hint** ("Files attached to threads are retained for 7 days") visible in the plus menu (`02_comet_sidebar-plus-menu...`). Tiny but clear. Borrow for AGI Workforce's file uploads.
9. **Composer placeholder doubles as a hint** — `Type @ for connectors and sources` (`26`) teaches the trigger. Better than tooltips.
10. **Thread-list "Recent" section** in sidebar with chronological ordering and clip-truncation (`01`). Simple, scannable.

---

## 11. Open Questions

1. **Where are the streaming UI captures?** No screenshot of "answer mid-stream" — does Perplexity show searching/reading sub-states, or jump straight to text? Need fresh capture to confirm.
2. **What does an answer with citations actually look like?** No inline `[1][2]` pills, no end-of-answer source list, no source-detail modal in this corpus. Public-Perplexity-famous patterns are missing — was this captured pre-citation-render, or has the UI changed?
3. **What does a Space look like inside?** Spaces is in the sidebar but no detail view. Does it have files, members, instructions, scoped chat? Compare-and-contrast with Claude Projects requires another capture.
4. **What's the Computer-mode per-action approval prompt?** "Allow Computer to click Submit on this form?" — nothing captured. If absent, that's a safety concern; if present, we need the screenshot to design our equivalent.
5. **Is "Thinking" a per-model toggle or a global one?** It appears inside the model menu (`03`) — but does flipping `Thinking` change the model name pill from `Claude Sonnet 4.6` to `Claude Sonnet 4.6 Thinking` (visible in `25`)? The captures suggest yes, but we should confirm semantics.
6. **What's `Model council [Max]`?** Locked feature in the plus menu (`02`, `26`) — likely a multi-model-compare-in-parallel feature. Need fresh capture from a Max account to design our equivalent (this is what AGI Workforce's "10+ Providers" is most directly competing with).
7. **What's the `Best` orchestrator model?** Listed at top of model selectors (`03`, `comet/03`). Does it route per-query? Per-thread? Confirm the routing logic before borrowing.
8. **Are Discover / Finance / Spaces full-screen tabs or modals?** Sidebar items but no detail captures. Could be either.
9. **What's the per-credit cost of Computer tasks?** `0 | Add credits` chip is ubiquitous in Computer mode. Pricing details would inform AGI Workforce's credit-tier design.
10. **Do user shortcuts (`/gpt-5.4`) override the active-model pill, or do they prefill the composer with the model preset?** Modal `16` shows model is editable inside the shortcut, but runtime behavior unclear.
11. **Why did `New thread` (sidebar, `01`) become `+ New task` in Computer mode (`04`)?** Same surface, different verb. Is this just brand naming, or do tasks have lifecycle (queued/running/done) that threads don't?
12. **Is there a mobile / iPad app?** None captured. Could be intentional (Perplexity is browser-first) or just absent from this corpus.
13. **What's the `Assistant` button at top-right (`01`, `02`, `26`)?** Same word as the Comet sidebar header. Is it the same product as the Comet sidebar, just toggleable from any tab?
14. **Why does the comparison table (`25`) live inside a chat answer instead of being a marketing page?** Self-referential — Perplexity literally asked itself "what can you do" and rendered the answer. Worth confirming this is not a contrived debug capture.

---

## 12. Citation index

All claims in this report cite filenames within `~/Desktop/reference/ui/perplexity/` (or `perplexity/perplexity-comet-browser-assistant/` for the 4 Comet shots) or `INDEX.md` line numbers. Any teammates wanting to verify a specific claim should re-open the cited file and inspect the same region.

End of report.
