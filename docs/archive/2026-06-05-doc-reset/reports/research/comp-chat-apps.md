# Competitive Research — Claude + ChatGPT Chat-App Feature Bar (web / desktop / mobile)

Date of research: 2026-05-29
Author: Research analyst (AGI Workforce)
Scope: What Claude (claude.ai web/desktop) and ChatGPT (web/desktop/mobile) ship **today** across chat, projects, artifacts/canvas, memory, connectors/MCP, voice, web search, deep research, image gen/edit, file analysis, scheduled tasks, and custom GPTs/agents. Plus the current UX bar for the default empty-chat composer and settings information architecture (IA).
Method: Official help/docs and official changelogs first (support.claude.com, claude.com/blog, help.openai.com release notes), then reputable secondary sources only to corroborate. Every non-obvious claim has an inline source with a date. Live tools used (WebSearch, WebFetch, firecrawl scrape) — no facts taken from model training memory.

---

## 1. Summary

As of 2026-05-29, both Claude and ChatGPT have converged on the same broad surface: a chat thread with a tool-rich composer, persistent **Projects**, an artifact/canvas-style side panel, **persistent memory**, **connectors built on MCP / an app directory**, **voice**, **web search**, **agentic deep research**, **image generation + editing**, **file upload/analysis with a file library**, **scheduled tasks**, and **custom agents** (Custom GPTs / Claude Skills). The differences are now about depth, defaults, and trust model, not about which features exist.

Two things matter most for AGI Workforce:

1. **The empty-chat composer is now a tools launcher, not a text box.** On both products the default composer exposes: model/reasoning picker, attach/upload, a "tools" menu (web search, research/deep research, study/learn, image, connectors), and a voice entry point. ChatGPT moved the **model selector into the composer** (2026-04-28) and routes large pastes (>5k chars) to attachments automatically (2026-03-25). Claude exposes web search / extended thinking / Research through a **"Search and tools"** menu and a Research toggle in the composer. AGI's composer must match this affordance density to feel current.

2. **Both vendors are leaning into agentic / local-file workflows** — Claude **Cowork** (desktop, reads/writes a user folder, sub-agents) and OpenAI **Codex app** (macOS/Windows command center for parallel coding agents). This is directly in AGI's lane (Desktop Tauri + CLI), and notably Claude Cowork's **local-file + per-task workspace + memory** model is the closest competitive analog to AGI's local-first positioning.

Confidence: **High** for feature existence and for ChatGPT dated changelog facts (official release notes were fully retrievable). **Medium-High** for Claude dated facts (support articles confirm features but some carry only "updated" timestamps; key dates corroborated via claude.com/blog and the support article publish dates). **Medium** for the fine detail of composer layout and settings IA, because docs describe affordances but not full visual IA — marked inline where thin.

---

## 2. Current bar (what the market / best practice requires as of 2026-05-29)

A credible 2026 chat app is expected to ship **all** of the following. This is the minimum bar both leaders now meet.

### 2.1 Chat + composer
- Multi-model / reasoning-effort selection **from inside the composer** (not buried in settings). ChatGPT moved model + thinking-effort into the composer 2026-04-28 [O-modelpicker-composer]; reasoning tiers are **Instant / Thinking / Pro** with an Auto-switch option [O-modelpicker].
- A **tools menu** in the composer (web search, research, image, study/learn, connectors/apps). Claude calls this the **"Search and tools"** menu [C-when-use]; ChatGPT exposes a quick-tools menu in the composer and an Apps directory [O-androidcomposer, O-appdir].
- **Attach up to ~20 files per message**, broad text/code file-type support (ChatGPT raised to 20 from 10 on 2026-02-13) [O-fileuploads].
- **Large paste → attachment** automatically (>5k chars on ChatGPT) to protect the context window [O-largepaste].
- Pinned chats, chat search over history, temporary/incognito chat [O-pinned, C-search-memory].
- Voice entry directly in the composer (sound-wave icon) [C-voice, O-voice].

### 2.2 Persistent structure
- **Projects**: walled workspaces with their own files, instructions, and (now) per-project memory. Both ship this; Claude has per-project memory + RAG, ChatGPT lets you add sources from apps/chats/text [C-memory-blog, O-projects-sources].
- **Memory**: cross-chat persistent memory, **on by default to view/edit**, with pause/reset/incognito and a "what shaped this answer" sources view [C-search-memory, O-memorysources].
- **File Library**: uploaded + generated files saved and reusable across chats; storage quotas by plan [O-filelibrary, O-filelibrary-free].

### 2.3 Knowledge + reasoning tools
- **Web search** as a toggle, all tiers [C-web-search, O-5.5instant].
- **Extended/Deep thinking** with selectable effort [C-when-use, O-modelpicker].
- **Agentic Deep Research**: multi-step, multi-source, cited reports, with a research plan you can edit mid-run and source-scoping to specific sites/apps [C-research, O-deepresearch].

### 2.4 Generation + analysis
- **Image generation + editing** in-chat, with "image with thinking" / prompt editing [O-images2, O-imagesdec, O-editprompts].
- **Artifacts / Canvas / Code blocks**: standalone side-panel content (code, docs, mini-apps, diagrams), versioning, publish/share, and **AI-powered artifacts/apps** that call the model without the user's own API key [C-artifacts, O-canvas, O-codeblocks].
- **File analysis** (PDF, spreadsheets, images, code) with library reuse [C-artifacts, O-filelibrary].

### 2.5 Integrations + automation
- **Connectors / Apps built on MCP** (Anthropic's open standard), browsable in a **directory**, local + remote MCP [C-connectors, O-appdir].
- **Scheduled tasks / automations** (time-based recurring prompts) [O-tasks, O-tasks-pulse].
- **Custom agents**: Custom GPTs + GPT Store (OpenAI) / **Skills + connectors + plugins directory** (Claude) [O-search, C-features-collection].

### 2.6 Agentic / local
- A **local-file agentic mode**: Claude **Cowork** (desktop, read/write a user folder, sub-agents, per-task workspaces with memory) [C-cowork]; OpenAI **Codex app** (macOS 2026-02-02, Windows 2026-03-04, mobile remote 2026-05-14) [O-codexapp, O-codexwin, O-codexmobile].

---

## 3. Version-specific facts (exact versions + dates)

> All dates are from official changelogs/blogs unless tagged "(secondary)". ChatGPT release-notes dates retrieved from help.openai.com release-notes page (live, "Updated 5 hours ago" as of 2026-05-29). Claude dates from claude.com/blog and support.claude.com article timestamps.

### 3.1 Claude (Anthropic)
- **Claude Opus 4.8** — flagship, released **2026-05-28** ("stronger performance across coding, agentic tasks, and professional work") [C-news-opus48].
- **Memory** — launched **2025-09-11** (Team/Enterprise), expanded to Pro/Max **2025-10-23**; **per-project memory**, import/export, incognito chat [C-memory-blog].
- **Memory from chat history** (auto-synthesis, refreshed ~every 24h) + **chat search** — documented in a Claude Help Center article **dated 2026-03-16 (article/update date, NOT a confirmed launch date)**. Memory-from-chat-history is available on **all plans incl. Free**; chat search is **paid plans only** (Pro/Max/Team/Enterprise). Web, Desktop, Mobile [C-search-memory].
- **Research** (agentic, cited, multi-source; auto-enables extended thinking) — paid plans (Pro/Max/Team/Enterprise), **web/desktop/mobile**, documented in a Help Center article **dated 2026-03-16 (article date, not a confirmed launch date)**; integrates Gmail/Calendar/Docs when connected [C-research, C-when-use].
- **Artifacts** — standalone side window for code/docs/HTML/SVG/diagrams/React; sidebar access + **Claude-powered artifacts on ALL plans incl. Free**; MCP integration + persistent storage need paid; publish/share/embed (article updated **2026-03-24**) [C-artifacts].
- **Custom connectors via remote MCP** — beta **2026-04-02**; Free/Pro/Max/Team/Enterprise (Free limited to **1 connector**); available in Claude, Cowork, and Claude Desktop; local MCP via `claude_desktop_config.json` + remote MCP from Anthropic cloud [C-connectors].
- **Claude Cowork** — desktop agentic mode (local read/write, sub-agents, per-task workspaces w/ memory, permission modes, never deletes without consent); **paid plans only; not on web**; Pro/Max can trigger from phone and get results in the same conversation [C-cowork]. (GA across paid plans ~April 2026 per secondary sources [S-aicorner].)
- **Voice mode** — **beta, all plans**, Claude web + Mobile (iOS/Android); start via sound-wave icon in composer; multilingual input in beta [C-voice]. (Originally iOS/Android May 2025, expanding to web/desktop since Aug 2025; ~20 languages by Mar 2026 — secondary [S-voicepost].)
- **Web search** — toggle across all tiers (per support; corroborated as all-tier since May 2025) [C-when-use, S-suprmind].
- **Skills, connectors, plugins** — unified **directory** at claude.ai/directory; Skills are customizable behaviors [C-features-collection].
- **1M context window** — GA for Opus/Sonnet at standard pricing ~2026-03-13 (secondary; not independently confirmed on an official page in this pass) [S-suprmind]. **Mark unverified.**

### 3.2 ChatGPT (OpenAI)
Model lineup / routing:
- **GPT-5.5 Instant** — new **default** model, replaced GPT-5.3 Instant **2026-05-05**; further style update **2026-05-28** [O-5.5instant, O-5.5update].
- **GPT-5.4 Thinking** (2026-03-05), **GPT-5.4 mini** (2026-03-18, fallback), **GPT-5.3 Instant mini** (2026-04-09, fallback) [O-54thinking, O-54mini, O-53mini].
- **Model picker** simplified to **Instant / Thinking / Pro** + Configure (Auto-switch, legacy models, thinking effort) — **2026-03-17**; **model selection moved into the composer 2026-04-28** [O-modelpicker, O-modelpicker-composer].
- Retirements: GPT-4o/4.1/4.1-mini/o4-mini + GPT-5 retired **2026-02-13**; o3 retiring **2026-08-26**, GPT-4.5 retiring **2026-06-27** [O-retire413, O-retire-o3].

Features:
- **Canvas** — collaborative doc/code editor; **being removed from GPT-5.5 Instant/Thinking** (writing/coding now inline via "writing blocks" and "code blocks"); legacy models keep canvas temporarily (**2026-05-28**) [O-5.5update]. **Interactive Code Blocks** added **2026-02-19** [O-codeblocks].
- **Memory** — auto-built; **Memory sources** ("what shaped this answer," editable) rolled out **2026-05-05** (Plus/Pro personalization + Gmail/files); improved past-chat recall **2026-01-15** [O-memorysources, O-memory-jan].
- **Projects** — add sources from apps (Slack/Drive links), from chats, and ad-hoc text — **2026-02-25** [O-projects-sources].
- **File Library + storage management** — Library launched **2026-03-23** (Plus/Pro/Business), expanded to **Free/Go + EEA 2026-05-14** with quotas (Free 500 MB, Go 4 GB, Plus/Business 20 GB, Pro 100 GB) [O-filelibrary, O-filelibrary-free]. Up to **20 files/message** since 2026-02-13 [O-fileuploads].
- **Apps / Connectors directory** — launched **2025-12-18**; **connectors now appear as "apps"**; developers can submit apps; Google Drive connectors **unified 2026-03-25**; Box/Notion/Linear/Dropbox updated **2026-03-27** [O-appdir, O-googledrive, O-appsupdate].
- **Deep Research** — redesigned **2026-02-10** (source-scoping to specific sites + connected apps, editable research plan, mid-run direction, fullscreen report view); legacy deep-research mode removed **2026-03-26** [O-deepresearch, O-deepresearch-legacy].
- **Image generation** — new ChatGPT Images **2025-12-16**; **ChatGPT Images 2.0** (+ "images with thinking") **2026-04-21**, on **all plans**; edit-image-prompts **2026-02-27** [O-imagesdec, O-images2, O-editprompts].
- **Voice** — ongoing updates (2026-01-20, 2026-01-26 search-in-voice, 2026-02-12); **dictation** improved 2026-01-12; **CarPlay** voice 2026-04-02 [O-voice, O-voicesearch, O-dictation, O-carplay].
- **Scheduled Tasks** — automated/recurring prompts; **"Tasks are now in Pulse" 2025-12-17** (Pulse is **Pro-only**); the standalone Tasks feature is Plus/Pro/Team per help article, **limit 10 active tasks** (secondary corroboration) [O-tasks-pulse, S-tasks]. **Plan scope has nuance — see Pitfalls.**
- **Custom GPTs + GPT Store** — user-built configs (system prompt, knowledge, tools) in a marketplace; long-standing, still current [O-search, S-suprmind].
- **Codex app** (agentic coding command center) — **macOS 2026-02-02**, **Windows 2026-03-04**, **mobile remote 2026-05-14**, plugins directory **2026-03-26**, Goal mode GA **2026-05-21** [O-codexapp, O-codexwin, O-codexmobile, O-codexplugins, O-codexgoal].
- New surfaces/spaces: **Health** (2026-01-07, waitlist), **Finances** (2026-05-15, Pro/US, Plaid), **Excel/Sheets sidebar** (2026-05-05), **Apple CarPlay** (2026-04-02) [O-health, O-finances, O-excel, O-carplay].
- Monetization signal: **ads testing** on Free/Go (US 2026-02-09; AU/NZ/CA 2026-04-16); **Pro now has a $100/mo tier** alongside $200 (2026-04-09) [O-ads-us, O-ads-row, O-pro100].

### 3.3 Composer + settings IA (asked explicitly)

**ChatGPT default empty-chat composer (web):**
- Model selector + thinking-effort **in the composer** (2026-04-28) [O-modelpicker-composer].
- Quick-tools menu / **+ menu** for tools (e.g., "Thinking" appears in + menu for Free/Go) and Apps [O-54mini, O-androidcomposer].
- Attach (≤20 files), recent files from composer, large-paste→attachment [O-fileuploads, O-filelibrary, O-largepaste].
- Voice entry; Fast answers toggle (Personalization) [O-voice, O-fastanswers].
- Mobile sidebar simplified 2026-03-26 — Images/Codex/Pulse/Apps moved to a **horizontal bar** above chats/projects [O-mobilesidebar].

**ChatGPT settings IA (paths confirmed in docs):** `Settings > My Plan` (billing), `Settings > Storage` (file storage), `Settings > Data Controls` (location, training, temporary chat), `Settings > Personalization` (Fast answers, base style/tone, warmth/emoji/headers characteristics, memory), `Settings > Account` (age verification/Persona) [O-pro100, O-filelibrary-free, O-location, O-fastanswers, O-characteristics, O-agepredict].

**Claude default empty-chat composer:**
- **"Search and tools"** menu exposes web search / extended thinking / Research toggles [C-when-use, C-research].
- **Research toggle** is a button bottom-left of the composer (white = off, blue = on) [C-research].
- Attach/upload files (PDF/docs/images/spreadsheets/code) [C-artifacts].
- **Voice** via sound-wave icon (web lower-right; mobile next to mic) [C-voice].
- Incognito (ghost icon) [C-search-memory].
- Model selector present (Opus/Sonnet/Haiku family) — exact in-composer placement not fully described in docs (**low confidence on layout detail**).

**Claude settings IA (paths confirmed in docs):** `Settings > Capabilities` (toggle "Search and reference chats," memory on/pause/reset) [C-search-memory]; `Customize > Connectors` (add custom connector / MCP URL) [C-connectors]; memory summaries viewable/editable in Settings [C-memory-blog]. Full top-level settings tree not enumerated in docs — **medium confidence**.

---

## 4. Known pitfalls & gotchas

1. **Aggregator dates are not facts.** Initial web searches returned blogs (suprmind, releasebot, substacks) with confident dates for GPT-5.5, Opus 4.x, and "1M context GA 2026-03-13." Only some were confirmable against official pages. The **1M-context GA date and exact Claude voice language counts remain secondary/unverified** in this pass — do not state them as fact in product copy. [S-suprmind]

2. **"Tasks" plan scope is contradictory across sources.** OpenAI's own release note says **"Tasks are now in Pulse" and "Pulse is only available in ChatGPT Pro"** (2025-12-17), while a separate help article + secondary guides say Tasks works on Plus/Pro/Team with a 10-task cap. The surface may have moved Tasks under Pulse (Pro) since. **Verify live before claiming AGI "matches ChatGPT scheduled tasks on Plus."** [O-tasks-pulse, S-tasks]

3. **Canvas is being deprecated on current models.** As of 2026-05-28 canvas is **gone from GPT-5.5 Instant/Thinking**; writing/coding now render inline as "writing blocks" / "code blocks," with canvas surviving only on legacy models temporarily [O-5.5update]. Building a heavyweight canvas to "match ChatGPT" risks copying a feature OpenAI is actively retiring. The durable pattern is **inline editable blocks + a standalone artifact window**, which both vendors keep.

4. **Connectors ≠ free for all.** ChatGPT positions connectors as **Apps** (all logged-in users, but capability/region/plan-gated); earlier reporting that connectors were "Business/Enterprise only" is outdated [O-appdir, S-suprmind]. Claude allows custom remote-MCP connectors on all plans but **Free is capped at 1 connector** [C-connectors]. Get the gating right per plan.

5. **Memory is two different things.** On Claude, "**memory from chat history**" (auto, all plans incl. Free) is distinct from "**project memory**" (per-project) and from "**chat search**" (paid only). Conflating them produces wrong plan claims [C-search-memory, C-memory-blog].

6. **Voice on desktop is ambiguous.** Claude's voice help article documents **web + mobile**; it does **not** confirm full voice mode in Claude Desktop (it references a separate "quick entry" Mac feature). Don't assume desktop parity [C-voice].

7. **Local vs cloud MCP is a real trust boundary** — exactly AGI's concern. Claude distinguishes **local MCP** (`claude_desktop_config.json`, your device's network) from **remote MCP** (runs from Anthropic's cloud, needs a publicly reachable server) [C-connectors]. AGI's Local/BYOK/Managed boundaries must mirror this distinction explicitly.

8. **Large pastes silently become attachments** in ChatGPT (>5k chars) [O-largepaste]. Users expect this now; a composer that dumps a 50k-char paste inline and blows the context window will feel broken.

9. **Model picker churn is constant.** Both vendors retire/rename models monthly (GPT-4o/o3/GPT-4.5 retirements; new Opus 4.8). This reinforces AGI's locked rule: **never hardcode model IDs — read from `models.json`**.

---

## 5. Implications / gaps for AGI Workforce

Framing: AGI is six surfaces (Web Next16/React19, Desktop Tauri2, Mobile Expo55/RN, CLI Rust, Chrome MV3, VS Code), v1 = **Local + BYOK only**, multi-provider routing, local-first privacy.

### Must-match to be credible at v1 (table-stakes both leaders ship)
- **Tools-rich composer** with in-composer model/reasoning picker, attach (multi-file), a tools menu (web search / research toggle), voice entry, and **large-paste→attachment**. This is the single most visible "is this app current?" signal. (All surfaces; CLI: flag-equivalents.)
- **Artifacts / inline editable code+writing blocks + standalone side panel** with versioning and copy/download. Skip a heavy "canvas" clone — OpenAI is retiring canvas; build the durable inline-block + artifact-window pattern instead [O-5.5update, C-artifacts].
- **Persistent memory** with a visible, editable store and pause/reset/incognito — and a **"sources / what shaped this answer"** view, which both vendors now ship [O-memorysources, C-search-memory]. For AGI this is a **local-first differentiator**: memory can live on-device, which both leaders' cloud memory cannot claim.
- **Projects** with per-project files, instructions, and per-project memory [C-memory-blog, O-projects-sources].
- **File library** (uploaded + generated, reusable, quota-aware) — both now treat files as first-class persistent objects [O-filelibrary, C-artifacts].
- **Web search toggle + agentic Research** (multi-source, cited, editable plan). Research is now expected, not premium-only-on-one-vendor [C-research, O-deepresearch].
- **Connectors via MCP** with a directory and clear local-vs-remote distinction [C-connectors, O-appdir].
- **Voice** entry in the composer (beta acceptable; both ship beta) [C-voice, O-voice].
- **Image generation + editing** in-chat [O-images2].
- **Scheduled tasks** (recurring prompts) [O-tasks-pulse].
- **Custom agents** (analog to Custom GPTs / Skills) — AGI's "140 employees"/skills blueprint maps here [O-search, C-features-collection].

### Where AGI's architecture is an advantage (lean into these)
- **Local-first memory + local MCP**: Claude already splits local vs remote MCP and warns remote runs from its cloud [C-connectors]. AGI's **Local trust boundary** can make on-device memory and local MCP the *default*, not the exception — a genuine privacy story neither leader leads with.
- **Cowork/Codex is the agentic frontier and it's local-file-centric.** Claude Cowork (read/write a user folder, sub-agents, per-task workspaces, never-delete-without-consent) and OpenAI Codex (parallel agents, isolated worktrees) are both **desktop/CLI** plays — AGI's Tauri Desktop + Rust CLI are the right surfaces to compete here, and the permission-gated, never-silent model matches AGI's locked rules [C-cowork, O-codexapp].
- **Multi-provider routing**: both leaders lock you to one model family; AGI's transparent-never-silent routing across providers is a structural differentiator (must keep the visible provider label per AGI locks).

### Gaps / risks to track for AGI
1. **Composer affordance density** is the highest-leverage UI gap. Without in-composer model+tools+voice+attach, AGI's empty-chat screen will read as a generation behind. (Web/Desktop/Mobile.)
2. **Artifacts/blocks** likely the biggest engineering lift to reach parity (sandboxed render, versioning, AI-powered artifacts). Decide v1 scope explicitly.
3. **Research (agentic, cited)** is now expected; partial web-search-only will feel thin against both leaders.
4. **Connector gating + trust labeling** must be precise to honor Local/BYOK/Managed boundaries — do not silently route a Local chat through a remote MCP/connector (matches AGI's locked "never silently route Local→BYOK/cloud" rule).
5. **Mobile parity**: ChatGPT/Claude ship memory, library, voice, research on iOS/Android; AGI's lead surface (Mobile) must hit these, not just chat.
6. **Scheduled tasks** is a sleeper expectation; even a local cron-style recurring prompt would close a visible gap (CLI already has CronCreate-style tooling).
7. **Don't copy retiring patterns**: canvas (being removed), and avoid ads/monetization-coupled UX that both are testing but that clashes with AGI's privacy brand.

### Net assessment
AGI's v1 (Local + BYOK, local-first) can credibly **lead on privacy/local + multi-provider** while it must **match** the table-stakes composer, artifacts/blocks, memory, projects, file library, web search + research, connectors/MCP, voice, image gen, and scheduled tasks. The agentic frontier (Cowork/Codex) is local-file-centric — squarely in AGI's Desktop+CLI strength — and is the best place to differentiate rather than chase cloud-only features.

---

## 6. Sources

Official — Anthropic / Claude:
- [C-news-opus48] "Introducing Claude Opus 4.8" — https://www.anthropic.com/news (anthropic.com newsroom) — 2026-05-28
- [C-memory-blog] "Memory" (Claude memory announcement) — https://claude.com/blog/memory — launch 2025-09-11; Pro/Max 2025-10-23
- [C-search-memory] "Use Claude's chat search and memory to build on previous context" — https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context — Help Center article dated 2026-03-16 (article/update date, not confirmed launch date)
- [C-research] "Using Research on Claude" — https://support.claude.com/en/articles/11088861-using-research-on-claude — Help Center article dated 2026-03-16 (article date, not confirmed launch date)
- [C-when-use] "When should I use web search, extended thinking, and Research?" — https://support.claude.com/en/articles/11095361-when-should-i-use-web-search-extended-thinking-and-research — Help Center article dated 2026-03-16
- [C-artifacts] "What are artifacts and how do I use them?" — https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them — updated 2026-03-24
- [C-cowork] "Get started with Claude Cowork" — https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork — accessed 2026-05-29
- [C-connectors] "Get started with custom connectors using remote MCP" — https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp — beta 2026-04-02
- [C-voice] "Use voice mode" — https://support.claude.com/en/articles/11101966-use-voice-mode — accessed 2026-05-29
- [C-web-search] "Enable and use web search" (Claude support, Features & capabilities collection) — https://support.claude.com/en/collections/18031719-features-and-capabilities — accessed 2026-05-29
- [C-features-collection] "Features and capabilities" (Skills/connectors/plugins directory) — https://support.claude.com/en/collections/18031719-features-and-capabilities — accessed 2026-05-29

Official — OpenAI / ChatGPT (consumer release notes, help.openai.com/en/articles/6825453, accessed 2026-05-29; entry dates as shown):
- [O-5.5update] "GPT-5.5 Instant Update" (+ canvas removal from GPT-5.5) — 2026-05-28
- [O-retire-o3] "Retiring OpenAI o3 and GPT-4.5" — 2026-05-28 (o3 retires 2026-08-26; GPT-4.5 retires 2026-06-27)
- [O-codexgoal] "Codex updates: goal mode GA, browser, locked use" — 2026-05-21
- [O-finances] "Personal finances in ChatGPT" (Pro/US, Plaid) — 2026-05-15
- [O-codexmobile] "Codex remote access from the ChatGPT mobile app" — 2026-05-14
- [O-filelibrary-free] "File library expands to Free and Go users, with storage management" (quotas) — 2026-05-14
- [O-memorysources] "Memory sources and more personalized responses in ChatGPT" — 2026-05-05
- [O-5.5instant] "GPT-5.5 Instant in ChatGPT" (new default) — 2026-05-05
- [O-excel] "ChatGPT for Excel and Google Sheets" — 2026-05-05
- [O-modelpicker-composer] "Easier model selection in ChatGPT" (model selector in composer) — 2026-04-28
- [O-fastanswers] "Fast answers in ChatGPT" — 2026-04-22
- [O-images2] "ChatGPT Images 2.0 in ChatGPT" (+ images with thinking) — 2026-04-21
- [O-ads-row] "Rolling out ads in Australia, New Zealand, and Canada" — 2026-04-16
- [O-53mini] "GPT-5.3 Instant mini in ChatGPT" — 2026-04-09
- [O-pro100] "New Pro plan options" ($100/mo Pro) — 2026-04-09
- [O-carplay] "ChatGPT in Apple CarPlay" — 2026-04-02
- [O-appsupdate] "Updated Box, Notion, Linear, and Dropbox apps" — 2026-03-27
- [O-mobilesidebar] "A simplified sidebar on mobile" + "Location Sharing" + "Plugins in Codex" — 2026-03-26
- [O-deepresearch-legacy] "Legacy deep research mode deprecation notice" — 2026-03-19 (removed 2026-03-26)
- [O-largepaste] "Large pastes are now handled as attachments" — 2026-03-25
- [O-googledrive] "Google Drive app unification" — 2026-03-25
- [O-filelibrary] "File Library in ChatGPT" — 2026-03-23
- [O-54mini] "GPT-5.4 mini in ChatGPT" — 2026-03-18
- [O-modelpicker] "Updates to the model picker in ChatGPT" (Instant/Thinking/Pro + Configure) — 2026-03-17
- [O-codexwin] "Codex app on Windows" — 2026-03-04
- [O-54thinking] "GPT-5.4 Thinking in ChatGPT" — 2026-03-05
- [O-editprompts] "ChatGPT Web and Android updates: Edit image prompts" — 2026-02-27
- [O-projects-sources] "Add sources to your projects from anywhere" — 2026-02-25
- [O-fileuploads] "ChatGPT updates: Better file uploads (≤20 files), copying, long chats" — 2026-02-13
- [O-retire413] "Retiring GPT-4o and other legacy models" — 2026-02-13
- [O-codeblocks] "Interactive Code Blocks in ChatGPT" — 2026-02-19
- [O-voice] "ChatGPT Voice Update" — 2026-02-12
- [O-deepresearch] "Updates to deep research" (source-scoping, editable plan, fullscreen) — 2026-02-10
- [O-ads-us] "Testing ads in ChatGPT (Free, Go)" — 2026-02-09
- [O-codexapp] "Introducing the Codex app" (macOS) — 2026-02-02
- [O-voicesearch] "Improvements to search response quality in Voice" — 2026-01-26
- [O-agepredict] "Rolling out age prediction" — 2026-01-20
- [O-memory-jan] "Improved memory for finding details from past chats (Plus & Pro)" — 2026-01-15
- [O-dictation] "Dictation Updates" — 2026-01-12
- [O-health] "Health in ChatGPT" — 2026-01-07
- [O-characteristics] "New detailed characteristic controls" — 2025-12-19
- [O-appdir] "Introducing the app directory in ChatGPT" (connectors → apps) — 2025-12-18
- [O-pinned] "Pinned chats in ChatGPT" — 2025-12-18
- [O-tasks-pulse] "Tasks are now in Pulse" (Pulse = Pro only) — 2025-12-17
- [O-imagesdec] "ChatGPT Images on Web and Mobile" — 2025-12-16
- [O-canvas] "What is the canvas feature in ChatGPT and how do I use it" — https://help.openai.com/en/articles/8983719 — accessed 2026-05-29
- [O-tasks] "Tasks in ChatGPT" (scheduled tasks help article) — https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt — accessed 2026-05-29
- [O-location] "Location Sharing" (Settings > Data Controls) — release note 2026-03-26
- [O-androidcomposer] "Quick tools in the composer (Android)" — release note 2026-02-13
- [O-search] Custom GPTs / GPT Store — referenced via OpenAI app directory + help center — accessed 2026-05-29

Secondary (corroboration only — treat as unverified where flagged):
- [S-suprmind] "Claude Features 2026 / ChatGPT Features 2026" — https://suprmind.ai/hub/claude/features/ , https://suprmind.ai/hub/chatgpt/features/ — accessed 2026-05-29
- [S-aicorner] "Everything Claude Has Shipped in 2026" — https://www.the-ai-corner.com/p/everything-claude-shipped-2026-complete-guide — accessed 2026-05-29
- [S-voicepost] Claude voice mode language/availability reporting — https://weesperneonflow.ai/en/blog/2026-02-23-claude-ai-voice-mode-2026-features-vs-dedicated-dictation/ — 2026-02-23
- [S-tasks] ChatGPT Tasks plan scope + 10-task limit — https://www.ofzenandcomputing.com/chatgpt-tasks-feature-guide/ — accessed 2026-05-29

---

## 7. Confidence statement

- **High**: ChatGPT dated changelog facts (official release notes fully retrieved live); existence of all 12 surveyed feature areas on both products; composer-affordance direction (in-composer model picker, tools menu, large-paste→attachment, voice).
- **Medium-High**: Claude dated facts (memory launch, research/memory 2026-03-16, connectors 2026-04-02, Opus 4.8 2026-05-28) — confirmed on official support/blog/news pages.
- **Medium**: Full settings IA trees (docs give specific paths, not the complete menu hierarchy); ChatGPT Tasks plan scope (conflicting sources).
- **Low / Unverified**: Claude 1M-context GA date (2026-03-13, secondary only); exact Claude voice language counts; precise in-composer placement of Claude's model selector. These are flagged inline and should be verified live before use in product copy.
