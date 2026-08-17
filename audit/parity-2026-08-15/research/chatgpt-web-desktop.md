# ChatGPT Web App (chatgpt.com) & ChatGPT Desktop — Production State

**Research date:** 2026-08-15
**Scope:** chatgpt.com web app + ChatGPT Desktop (macOS, Windows, Linux-preview)
**Method:** WebSearch + WebFetch against official OpenAI sources where reachable, plus unofficial guides, teardown sites, and complaint aggregators. `help.openai.com` and `openai.com` returned HTTP 403 to automated fetch on every attempt (bot protection) — claims sourced there come from search-result snippets only, not full-page fetches, and are flagged accordingly.

> **Big picture context an evaluator needs up front:** OpenAI ran a major, messy restructuring of the whole desktop/web shell in July–August 2026. The old separate **ChatGPT desktop app** and **Codex app** were merged into one Electron-based app on July 9, 2026 that bundles three modes — **Chat**, **Work** (new agentic/deliverable mode), and **Codex** (dev mode) — with the old native app demoted to "**ChatGPT Classic**." The initial merge buried plain chat behind a sub-pane; OpenAI reversed course within about a week (July 17). Model naming also churned hard: GPT-5.3 → GPT-5.4 → GPT-5.5 → **GPT-5.6 (Sol/Terra/Luna)** shipped July 9, 2026, and the Instant/Thinking/Pro three-way split was collapsed into a single reasoning-effort slider (Instant/Medium/High/Extra High) starting June–August 2026. **ChatGPT Atlas (the standalone browser) was shut down August 9, 2026**, 292 days after its October 2025 launch, with its agentic-browsing capability folded back into ChatGPT/Codex.

---

## 1. App shell

### 1.1 Sidebar / navigation (web + desktop)

As of the most recent redesign (rolling out from ~April–June 2026), the ChatGPT sidebar consolidates around these top-level items. Exact ordering varies by rollout cohort; this is the composite picture from multiple sources:

| Nav item                         | Notes                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New chat                         | Standard entry point                                                                                                                                                                                                                                                                                                                           |
| Search (Cmd/Ctrl+K)              | Jump to another chat or start search                                                                                                                                                                                                                                                                                                           |
| **Library**                      | New (~April 2026) unified tab: every file _you_ upload in any chat and every file ChatGPT _generates_ lands here. Supports search-within-library, "Add from library" in the composer without re-uploading, and (Aug 2026) browsing/@-mentioning connected Google Drive files directly from Library.                                            |
| **Pinned**                       | A _shared_ Pinned section merging pinned chats, pinned custom GPTs, and pinned Projects — replacing what were previously separate sidebar sections. Can render collapsed by default, which users report makes previously-visible items look like they vanished. [UNVERIFIED exact current default state — community source dated June 3, 2026] |
| **Projects**                     | Opens a Projects table/dashboard. In the redesign, clicking a Project row stopped opening the dashboard directly; users must hover and click a pencil/write icon instead — reported as unintuitive.                                                                                                                                            |
| **GPTs** (custom GPTs)           | Demoted from a first-class sidebar item to `More → GPTs → My GPTs`. To get a GPT back into the sidebar you open it and use its title-bar menu to "Pin."                                                                                                                                                                                        |
| **Codex**                        | Its own entry, "in its own bar alongside Images and Apps" per an April 2026 nav change. Since July 9, 2026, Codex is a _mode_ inside the unified desktop app rather than (or in addition to) a separate sidebar link.                                                                                                                          |
| **Images** / Sora                | Image generation entry point. Sora (video) was fully discontinued as a ChatGPT-adjacent web/app product on **April 26, 2026** (API sunset **Sept 24, 2026**); video generation is not currently surfaced in the ChatGPT shell. Image generation itself continues as "ChatGPT Images" (see §11).                                                |
| **Sites**                        | New (public beta, staged rollout **June 1–5, 2026**, expanded into Work's public beta **July 9, 2026**): a dedicated entry point to create/save/deploy/inspect OpenAI-hosted websites, dashboards, internal tools, and games, with in-app environment-variable/secret management. **Not available in the EEA, UK, or Switzerland** at launch.  |
| **Apps** (formerly "Connectors") | Directory/picker for connected third-party services (see §10).                                                                                                                                                                                                                                                                                 |
| **Tasks / Scheduled**            | Own page (see §7). Replaced/absorbed the older **Pulse** proactive-briefing feature, which was sunset with a short (~14 day) grace window for Pro users.                                                                                                                                                                                       |
| **Activity view**                | New (~mid-April 2026): shows recently-engaged chats that need attention; toggled via the bell icon or Cmd/Ctrl+Opt+U. Expanded July 27–31, 2026.                                                                                                                                                                                               |
| Account / workspace switcher     | Present as before; Business/Enterprise workspace admins can now (Aug 13, 2026 release) set the workspace's **starting chat model and reasoning level** from Workspace settings.                                                                                                                                                                |
| Settings                         | Bottom of sidebar; layout responsive (compact icon on larger screens).                                                                                                                                                                                                                                                                         |

**Regression note:** A community teardown (popularai.org, dated June 3, 2026) states it could not find an official OpenAI release note clearly documenting this exact sidebar overhaul at the time of publication — i.e., the redesign shipped with weak/no changelog visibility, which is itself a recurring complaint pattern (see §14).

### 1.2 GPTs / GPT Store

- The GPT Store and custom GPTs remain a live, active feature — not retired.
- What _did_ change is the underlying models: GPT-4o's retirement (fully gone from all plans by **April 3, 2026**) forced auto-migration of custom GPTs built on it to GPT-5.3 Instant or GPT-5.4 Thinking equivalents; GPT-4.5's retirement (~late June 2026) removed the last GPT-4-era model from custom GPTs entirely.
- The official **DALL·E GPT** (the built-in DALL·E-branded custom GPT) is scheduled for retirement on **August 30, 2026** — users are told to download images they want to keep and use ChatGPT's native image tool instead.
- A documented quality issue: "silent model substitution" — if a custom GPT specifies a model unavailable to the viewer's plan tier, OpenAI substitutes another model without telling the user. [Source: suprmind.ai feature summary; UNVERIFIED against an official OpenAI statement.]

---

## 2. Composer — component-level detail

Sourced primarily from a component teardown (aiuxplayground.com, "input bar, tools & voice design," updated through ~2026) plus multiple feature guides. Overall structure: **calm default input bar → "+" menu → resulting chip → send.**

| Component                          | Behavior                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Attach (files/images)              | Lives inside the **+** menu, not exposed directly on the bar. Produces an inline thumbnail with a dismiss (×) control — visible/removable before send.                                                                                                                                                                                                                         |
| Add from Library                   | New (2026): pick a previously-uploaded/generated file from Library instead of re-uploading.                                                                                                                                                                                                                                                                                    |
| Camera / screenshot                | Desktop app quick-launcher (Option+Space / Alt+Space) explicitly supports "take a screenshot" as an attach option from the mini prompt window. Desktop "Appshots" (Cmd+Cmd, originally shipped for Codex, May 18–22 2026) sends the frontmost app window as a screenshot-plus-text bundle for visual context.                                                                  |
| Drag-and-drop                      | Supported (files dropped into a chat or Project land in Library). [Exact drop-target UI not independently confirmed beyond general guide mentions — UNVERIFIED at pixel level.]                                                                                                                                                                                                |
| Paste-to-attachment                | If you paste more than ~10,000 characters, ChatGPT auto-converts the paste into a file attachment instead of inserting raw text, to keep the composer clean.                                                                                                                                                                                                                   |
| Dictation                          | A dedicated mode that **replaces the text field** while active (distinct from full Voice Mode). Android got "smoother dictation and composer behavior" in the Aug 10–14, 2026 release wave; a "custom dictionary" for names/file paths/code symbols shipped for Codex-side dictation May 4–8, 2026.                                                                            |
| Voice Mode entry                   | Separate full-viewport session ("fits back-and-forth talk") vs. inline dictation. See §12 for Advanced Voice details. As of **July 20–24, 2026**, ChatGPT Voice can be used to talk through work across Chat/Work/Codex, and on macOS can share "appshots" via "Screen context." As of **Aug 3–7, 2026**, Voice sessions can reference uploaded documents and Project context. |
| **+ / Tools menu**                 | Single consolidated menu grouping attach, creation modes, and behavioral modes: **Deep Research**, **Web search**, **Think** (reasoning), **Agent mode**, and **Image generation**. Selecting one inserts a persistent "chip" showing the active mode before send.                                                                                                             |
| Deep Research chip                 | Opens a follow-up customization menu: connect more apps (incl. GitHub), toggle web search on/off, choose report style.                                                                                                                                                                                                                                                         |
| Web search chip                    | Adds a web-specific placeholder and "trending" starter prompts.                                                                                                                                                                                                                                                                                                                |
| Agent mode                         | Reachable via Tools → **Agent mode**, or by typing **`/agent`** directly in the composer (slash-command shorthand). See §11 for full behavior.                                                                                                                                                                                                                                 |
| Image mode                         | Dedicated inline controls (aspect ratio, etc.) appear once selected.                                                                                                                                                                                                                                                                                                           |
| Canvas trigger                     | Opens automatically for long-form writing/code requests, or explicitly via the Canvas option in the compose toolbar, or by asking in natural language ("Open a Canvas and...").                                                                                                                                                                                                |
| Connectors/Apps picker             | Referenced via **@-mention syntax** (e.g., `@Google Drive`) and via the Apps/Plugins directory; auto-suggested mid-task in Work mode.                                                                                                                                                                                                                                          |
| Model picker                       | Separate control next to the composer (see §12) — not part of the + menu.                                                                                                                                                                                                                                                                                                      |
| Reasoning-effort control           | As of the August 2026 GPT-5.6 Sol rollout, a **slider** (Instant / Medium / High / Extra High) replaces picking discrete "Thinking" model variants for Plus/Pro.                                                                                                                                                                                                               |
| Send / Stop / Queue / Edit-pending | Standard send-while-streaming stop button confirmed by general guides; explicit "queue a follow-up message while one is generating" and "edit a pending (already-sent, not-yet-answered) message" behaviors were **not independently confirmed** in sources reached this session — mark **UNVERIFIED** pending a first-party check.                                            |

---

## 3. Conversation rendering

- **Markdown / tables / code blocks / LaTeX**: standard, stable baseline features; no material 2026 change surfaced in research (expected to remain consistent with prior behavior).
- **Citations & source cards** (from a dedicated teardown, aiuxplayground.com, updated Jul 10 2026):
  - Inline **chips** ("favicon + name" pills) appear claim-adjacent, at the end of the sentence/bullet they support. A "+N" badge collapses multiple sources into one chip instead of stacking them.
  - Hover/click opens a **popover** anchored to the chip showing publisher, headline, and snippet, with "1/N" pagination arrows for multi-source chips.
  - A persistent **"Sources" row** under a reply opens a right-hand panel listing every source as a full card (logo, title, relative timestamp, snippet) — a full audit list separate from the inline chips.
  - The same architecture is used for both grounded/browsed answers and (per this source) is not explicitly documented as differing for Deep Research reports vs regular web-search answers — **treat the "same for Deep Research" claim as UNVERIFIED**, since it wasn't confirmed against Deep Research output specifically.
- **Generated images**: rendered inline; "ChatGPT Images 2.0" is the current native generation/editing surface (see §11), available on every plan tier. As of **July 27–31, 2026**, generated images can be edited in an expanded viewer with Canvas and Focused modes.
- **Rich cards (shopping/sports/weather/stocks/finance)**: could not confirm current-state detail for these specific card types from reachable sources this session. **UNVERIFIED** — treat as a gap requiring a first-party or hands-on check. What _is_ confirmed is a major shopping-related regression: **ChatGPT Instant Checkout (the in-chat "Buy" button + Agentic Commerce Protocol flow) was discontinued in March 2026**, about five months after its September 2025 launch; commerce moved instead to per-merchant "Apps" (e.g., a dedicated Walmart in-ChatGPT app) rather than a native product card + checkout button.
- **Tool-call / progress UI**: Work mode shows a step-by-step plan for approval before execution ("Plan mode"), plus configurable check-in frequency during long runs (see §11).
- **Canvas / document previews, file diffs**: see §6; PR/diff review UI (collapsible inline comments, inline/detached modes) is documented for the Codex side of the app (Apr 6–10, 2026 changelog entry) and for multi-repository diff comparison (July 27–31, 2026).

---

## 4. Response actions / progressive disclosure

Per a UX teardown and corroborating guides, the always-visible action row under a response includes:

- **Thumbs up / thumbs down** feedback — thumbs-down opens a structured panel to specify what went wrong plus a free-text note; thumbs-up is a single tap.
- **Copy**
- **Share** (generates a public link — see §14)
- **Read aloud** (with what one source describes as a timestamp control)
- **Regenerate**
- **Overflow menu**: "View sources," "Branch in new chat" (forks the conversation from that point without disturbing the original thread), and "Read aloud."
- **Model switch** for a given turn — supported at a general level (switch model, get a fresh response), consistent with how the model picker works (§12), though a documented complaint (see §14) says the switcher can feel "decorative" — i.e., users report the selected model not visibly changing behavior.

---

## 5. Canvas (writing/coding workspace)

Two independent, partially-contradictory sources were fetched, and the contradiction is worth stating outright:

- **Source A** (ai-toolbox.co guide, ~May 2026 snapshot): claims Code Canvas has **no Run button / no execution**, only syntax-highlighted rendering + natural-language edit requests; execution requires copying code out to your own environment or using regular-chat Code Interpreter.
- **Source B** (itechguides.com and other guides): claims Canvas **does execute Python** via an in-browser WebAssembly/Pyodide-style environment (distinct from the server-side Code Interpreter tool), with an "Execute" action and a console panel; React/HTML render in a sandboxed preview but don't truly execute (fail without network/packages).

**Net assessment**: the weight of sourcing favors Canvas supporting in-browser Python execution with an "Execute"/"Run" affordance and a console — but this is a genuine open discrepancy in currently-available secondary sources, and should be hands-on verified before being used as a hard fact in any parity comparison.

Other Canvas facts, cross-confirmed by multiple sources:

- **Opening**: explicit toolbar button, auto-trigger on long-form requests, or natural-language ask.
- **Inline editing**: drag-select a passage to get an inline "edit this section" popover that rewrites only the highlighted text.
- **Whole-document edit**: a pencil icon opens an "Ask for changes" free-text box that rewrites the full document; there is **no preset menu**, only natural-language instructions.
- **Version history**: toolbar arrows step through prior versions; a "Show changes" view highlights deletions in red / additions in green (GitHub-style diff).
- **Comments**: mentioned as present ("Ask ChatGPT," formatting controls, and comments appear depending on selected content) but not documented in operational detail by any source reached.
- **Export**: documents → PDF, Markdown (`.md`), Word (`.docx`); code → language-specific extension (`.py`, `.js`, `.sql`, etc.).
- **Sharing**: no dedicated in-Canvas "Share" button per one source (share by copying/downloading and pasting/attaching elsewhere) — but another source states sharing is available across Free/Plus/Pro/Team/Enterprise/Edu "from the Canvas toolbar." These two claims are hard to fully reconcile; likely explanation is that "Share" reuses the standard conversation-share flow rather than being Canvas-specific. **Flag as needing a hands-on check.**
- **Model availability**: Canvas was **removed from GPT-5.5 Instant and GPT-5.5 Thinking on May 28, 2026**, then guide sources from ~2026 describe it as working with GPT-5.5 Instant, GPT-5.4 Thinking (limited on Free), and GPT-5.4 Pro — i.e., there was a documented window where Canvas access regressed for some model/plan combinations before being restored/adjusted. Canvas is explicitly **not available with Pro-series (o-style) reasoning-heavy models** per one source.

---

## 6. Sites (new — website/app builder)

- Launched in public beta inside **ChatGPT Work**, **July 9, 2026** (staged from an initial June 1–5, 2026 preview).
- Lets ChatGPT **create, save, deploy, and inspect** websites, dashboards, internal tools, web apps, and games — hosted by OpenAI, with an in-product entry point for managing hosted environment variables/secrets, explicitly positioned as removing the need to "assemble a separate deployment stack."
- Staged plan rollout: **Pro, Pro Lite, Enterprise, Edu first**; **Plus and Business** followed within days.
- **Not available in the EEA, Switzerland, or UK** at launch (regulatory gating).
- Public Sites publishing specifically remains restricted in the UK/EEA/Switzerland per later coverage as well (Aug 2026 status).

---

## 7. Tasks / Scheduled work

- Standalone **Scheduled** page in the sidebar (web + mobile), added mid-2026, replacing the earlier **Pulse** proactive-daily-briefing feature (Pulse was sunset with roughly a 14-day continued-access grace period for Pro users; users needing similar behavior are told to build a recurring scheduled task instead).
- Supports **one-off tasks**, **recurring jobs**, and **monitoring tasks** ("check X on a schedule, notify only if something changed").
- A refreshed, "faster and more reliable" version began rolling out **June 17, 2026**.
- Task-count caps reported as tier-based (e.g., ~3 active tasks on Go up to ~15 on Pro/Enterprise) — **treat exact numbers as approximate/unverified**, sourced from a third-party guide rather than an official page fetch.
- Work-mode-specific scheduling (July 9, 2026): tasks can be **once / on a schedule / event-triggered / continuous-monitoring**, and can invoke the full multi-step Work orchestration (producing a doc/sheet/deck as the scheduled output), not just a chat reply.

---

## 8. Memory & personalization

Two-layer memory system, controlled at **Settings → Personalization → Memory**, each toggle independent:

| Layer                      | Behavior                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Saved memories**         | Explicit, user-editable list of facts ChatGPT chose to remember (told directly or inferred as "worth storing"). Surfaces in every future conversation; takes context-window priority.                                       |
| **Reference chat history** | Implicit pattern recall across past chats (no editable list); injected into context at the start of a new chat. Launched **April 10, 2025**; upgraded in **January 2026** to reliably surface details from 12+ months back. |

- **Temporary Chat**: toggled via an icon next to the model picker (a dotted-line speech-bubble icon). Bypasses Memory entirely (no read, no write), is excluded from chat history, and — per a 2026 guide — is retained on OpenAI's servers up to 30 days for safety review but excluded from training and from visible history.
- **Project memory**: as of a 2026 update, users can opt individual Projects into **project-only memory** — main-chat memories don't bleed into a Project and vice versa. In **shared** Projects, personal Memory is disabled entirely for every collaborator including the owner.
- **Custom Instructions**: separate from Memory — two free-text fields ("What should ChatGPT know about you" / "How should it respond"), applied uniformly to every new chat (including Temporary Chat, unlike Memory).
- **Personality presets**: Default plus several named presets (reported set includes Friendly, Efficient, Professional, Candid, Quirky, Cynical, Nerdy — "four distinct personalities or Default" per one Business release-note summary, so the exact current count/list is **UNVERIFIED** and may differ between consumer and Business tiers). Presets interact with Memory: a saved-memory instruction that conflicts with a preset's tone (e.g., "be serious/professional") can override/mute the preset's visible traits.
- **Default memory state by plan**: on by default for Free/Plus/Pro/Team; **off by default** for Enterprise/Edu, admin-controlled.

---

## 9. Connectors / Apps / Apps SDK / GPTs / Plugins — current vs. retired

- **Naming churn**: "Connectors" → renamed to "**Apps**" (~December 2025) → OpenAI's own July 2026 messaging additionally uses "**Plugins**" as an umbrella term for the same underlying integration directory (some coverage calls it "the App Directory / Plugins directory" interchangeably). Expect inconsistent naming in the UI and docs during this period.
- **Technical foundation**: most connectors/apps are built on **Model Context Protocol (MCP)**, adopted by OpenAI for ChatGPT in **September 2025**; by early 2026 the wider MCP ecosystem had 500+ public servers.
- **Built-in connectors/apps** (composite list across sources): Google Drive, Gmail, Google Calendar, Outlook, SharePoint, Dropbox, Box, Microsoft Teams, Slack, Asana, Linear, GitHub, HubSpot, Salesforce, Figma, Adobe Acrobat, Oracle, Databricks, Zoom, LinkedIn, Canva. One source claims **1,400+ plugins** in the unified directory as of the July 2026 Work launch — **treat that specific count as an unverified vendor-style figure**.
- **Admin controls**: on Business/Enterprise/Edu, admins control which connectors are enabled; Business can (May 2026) share reusable **Plugin Bundles** with the whole workspace; Enterprise can enable member **access tokens** for non-interactive/automated workflows.
- **"Sign in with ChatGPT"**: new beta OAuth flow (rolled out **July 27–31, 2026**) letting third-party products (Airtable, GitLab, HubSpot, Notion, Supabase, Vercel named as initial partners) let users sign in using their ChatGPT identity — the inverse direction from connectors (ChatGPT as an identity provider, not just a data source).
- **Retired**: Instant Checkout / native in-chat "Buy" button (discontinued March 2026, see §3); Sora web/app (discontinued April 26, 2026); Atlas browser (shut down August 9, 2026); Pulse (sunset, replaced by scheduled tasks); legacy Deep Research mode (removed March 26, 2026 — the _current_ Deep Research experience was explicitly unaffected).

---

## 10. Agent Mode / ChatGPT agent / Operator lineage / ChatGPT Work

**Lineage** (best-available reconstruction from multiple partial sources — no single source gave the full chain, so this is a synthesis and should be validated first-party):

1. **Operator** (Jan 2025) — original standalone browser-automation agent product.
2. **ChatGPT agent** (July 2025) — merged Operator-style browser action with Deep-Research-style multi-step reasoning into one in-ChatGPT capability, reachable in the composer via **Tools → Agent mode** or typing **`/agent`**.
3. **ChatGPT Atlas** (Oct 21, 2025 – Aug 9, 2026) — a standalone agentic _browser_ app with its own sidebar assistant, "cursor chat" inline rewriting, browser memories (page-recall, 7–30 day retention depending on source), and a paid-tier-only Agent Mode for autonomous multi-step website tasks (bookings, purchases) under supervision. **Shut down Aug 9, 2026**; browser data (bookmarks, tabs, history) did **not** auto-transfer — cookies/passwords could be exported to the ChatGPT desktop app, bookmarks to Chrome.
4. **ChatGPT Work** (launched **July 9, 2026**) — the current, broader successor: a persistent agentic _mode_ (not just a one-off task) that takes a brief, works in the background for minutes to hours, and returns a finished deliverable (spreadsheet, deck, doc, small web app, or a **Site**). Explicitly "builds on Codex." Runs on GPT-5.6.

**Current-state behavior of Agent Mode / Work (as of Aug 2026), synthesized across sources:**

- **Composer access**: Tools menu → Agent mode, or `/agent`, for lighter one-off browser/action tasks within Chat; **Work** is treated as a separate mode/tab in the unified desktop app and web/mobile shell for longer multi-step, connector-heavy jobs.
- **Permissions / approval UX**:
  - "Plan mode" shows a step-by-step plan for user approval before execution starts.
  - Configurable check-in frequency during long runs.
  - **Browser takeover**: user can take over the browser at any point; while the user has taken over, the agent cannot see what's typed (e.g., passwords) — inputs during takeover are described as not collected/stored.
  - Confirmation is required before "consequential"/high-impact actions (site purchases, sending communications, connected-tool writes).
  - Enterprise: an **Auto-review** layer runs a frontier model over higher-risk connected-tool/API actions before execution; OpenAI's own red-team claim (per a secondary source, unverified first-party) was "100% of attempts to extract protected data blocked" in testing.
  - A **Compliance API** provides organization-level audit-trail visibility.
  - OpenAI's stated product stance: keep approval gates on even as user trust grows, rather than treating them as friction to eliminate over time.
- **Sandbox**: the agent runs in a sandboxed environment and cannot access local files or personal cookies without explicit permission (browser-based agent); the **desktop app's Work/Codex modes**, by contrast, do get local file access, a **built-in browser**, and **Computer Use** (click/type/manipulate files on the actual OS) — explicitly a desktop-only capability set not available on web/mobile.
- **Pricing**: Work is **not a new subscription tier** — bundled into Plus/Pro/Business/Enterprise at no extra list price, but consumption is **usage-metered** against the plan's included allowance (Codex-style), with no published flat per-task rate at launch; usage scales with task length/complexity. Business/Enterprise/Edu admins get workspace-default, group, and individual spend controls plus credit-review workflows.
- **Rollout stagger**: macOS shipped globally first; Windows "within days"; web/mobile reached Pro/Enterprise/Edu immediately, Plus/Business within days after.
- **Windows Computer Use** (agent seeing/clicking/typing in Windows desktop apps, foreground-only) shipped **May 25–29, 2026**; a Chrome extension letting the agent work across browser tabs in the background with cross-tab source citation shipped **May 4–8, 2026**; **Browser Developer Mode** (Chrome DevTools Protocol access for network/console debugging, approval-gated) shipped **June 8–12, 2026**.
- **Record & Replay** (macOS, **June 15–19, 2026**): record yourself performing a workflow, which converts into a reusable "skill" for the agent to run again — **excluded from EEA/UK/Switzerland initially**.
- **Computer History** (**Aug 10–14, 2026**, macOS, Pro/Business/Enterprise): a searchable timeline of the desktop app's own app/website activity — effectively an audit log for what Computer Use did.

**Adjacent/tangential**: OpenAI also runs a separate cybersecurity-specific access program, **Daybreak**, split into **Blue** (defensive-use access to frontier models incl. GPT-5.6 Sol with adjusted safeguards) and **Red** (vetted, applicant-gated access to a purpose-trained **GPT-5.6-Cyber** model for offensive security research) tiers, announced **Aug 10, 2026**, with hardware security keys becoming mandatory for all Daybreak accounts from **Sept 1, 2026**. This is not part of the mainstream consumer ChatGPT agent surface but is worth knowing about if competitive analysis touches OpenAI's security-research posture.

---

## 11. Voice, image generation (Sora lineage)

- **Advanced Voice Mode**: near-real-time, interruptible, speech-native (not transcribe→answer→TTS); supports live camera/screen sharing. Reported voice roster (one guide, possibly stale): Arbor, Breeze, Cove, Ember, Juniper, Maple, Sol, Spruce, Vale — **treat the exact current voice list as unverified**, since "Sol" as a voice name now collides with the GPT-5.6 Sol model name, suggesting this list may be outdated. Free tier gets a short daily preview; Plus/Pro get materially higher limits. As of July 23, 2026, **ChatGPT Voice on desktop** (branded "GPT-Live" by one source) can be used to talk through work and direct agents running in Work/Codex — a materially new capability (voice-driven agent orchestration on desktop), not just voice chat.
- **Image generation**: "**ChatGPT Images 2.0**" is the current native, in-workflow image tool — generation + editing, available on every plan. **DALL·E 3 remains active** underneath for now but the official **DALL·E GPT** wrapper is being retired **Aug 30, 2026**. Expanded image-editing viewer with Canvas/Focused modes shipped **July 27–31, 2026**.
- **Sora**: web and app experiences discontinued **April 26, 2026**; API sunset scheduled **Sept 24, 2026**. A previously-planned deeper Sora↔ChatGPT integration "never materialized" before the shutdown, per one source. Sora is **not** part of the current ChatGPT web/desktop surface.

---

## 12. Model lineup, reasoning-effort presentation, usage limits

### 12.1 Timeline of the picker itself

- Early 2026: three-way **Instant / Thinking / Pro** split.
- **~June 11, 2026**: picker restructured — "Thinking-Light" removed (sub-1% usage), remaining options renamed to plain-language effort labels: **Instant, Medium, High, Extra High**, plus **Pro Standard / Pro Extended** for Pro-tier users. New **Auto-switch** setting (General settings) lets Instant silently upgrade to Medium when the system judges a question needs more reasoning.
- **July 9, 2026**: **GPT-5.6 family** ships — **Sol** (flagship), **Terra** (cost-competitive with GPT-5.5), **Luna** (fastest/cheapest).
- **Aug 6, 2026**: Plus/Pro's separate Instant and Thinking _models_ are folded into **one GPT-5.6 Sol experience** with a **reasoning-effort slider** (Instant/Medium/High/Extra High) as the sole manual control — intent being that most users shouldn't need to pick a model at all.
- **Week of Aug 6–13, 2026**: **GPT-5.6 Luna** becomes the default for **Free and Go** plans, alongside a **"Think" button** for harder questions — explicitly **still Luna reasoning longer, not a free on-ramp to Sol**.
- **Work and Codex modes deliberately stayed on the "July" GPT-5.6 Sol/Luna versions** during this August "Chat stack" reset — i.e., as of research date, Chat-mode Sol/Luna and Work/Codex-mode Sol/Luna are **different point-in-time versions of the same model names**, a subtlety worth flagging for anyone doing capability comparisons.
- Business/Enterprise/Edu: workspace admins can set the **starting chat model and reasoning level** at the workspace level (Aug 13, 2026 release).
- Context window: manually-selected Thinking mode now gets a **256k total token** window (128k input / 128k max output), up from a prior 196k total — per a search-snippet from the official release-notes page (not independently fetched in full).

### 12.2 Retirements

- **GPT-4o**: retired from ChatGPT **Feb 13, 2026** (per one source) / fully gone across all plans by **April 3, 2026** (per another) — dates conflict slightly across sources; both agree it is gone by Q2 2026. Remains available via the API.
- **GPT-4.5**: retired **~late June 2026** (30-day sunset from an announcement), ending the GPT-4 era in ChatGPT entirely.
- **o3**: scheduled to retire from ChatGPT **Aug 26, 2026** (90-day sunset).

### 12.3 Usage limits (approximate — third-party sourced, not confirmed against an official page fetch)

| Plan                    | Approx. limits (as reported)                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free                    | ~10 messages/5 hrs on the flagship-tier model, then falls back to a mini model                                                                                                                                                                                                                                                                                                        |
| Go                      | ~160 msgs/3 hrs before fallback; ~10 msgs/5 hrs of "Thinking" via the tools menu                                                                                                                                                                                                                                                                                                      |
| Plus                    | ~160 msgs/3 hrs flagship; ~3,000 Thinking messages/week; ~80 file uploads/3 hrs                                                                                                                                                                                                                                                                                                       |
| Pro                     | Reported as "unlimited... subject to abuse guardrails"; one source describes a two-tier Pro at $100 and $200/month with 5x and 20x Plus usage respectively — **this two-tier-Pro claim is unusual and should be treated as UNVERIFIED**, it does not match the historically single $200/mo Pro tier and may be a source error or a genuinely new (and under-reported) pricing change. |
| Business/Enterprise/Edu | Reported as effectively unlimited subject to guardrails; workspace/credit-pool billing applies once included usage is exceeded (Business usage was free through Aug 6, 2026, then draws from a workspace credit pool).                                                                                                                                                                |

**ChatGPT Go** confirmed detail: launched **August 2025 in India** at **₹399/month**, explicitly a higher-limits-than-Free entry paid tier. Later 2026 comparison guides describe Go generically (without India-specific framing) alongside Free/Plus/Pro, suggesting probable international expansion by mid-2026 — **but this expansion was not independently confirmed** in sources reached this session.

---

## 13. Desktop-specific (macOS / Windows / Linux)

### 13.1 The July 2026 unification and its fallout

- **July 9, 2026**: the separate **ChatGPT desktop app** and **Codex app** merged into one application (Mac + Windows) housing **Chat / Work / Codex** as modes/tabs. The pre-merge ChatGPT desktop app was renamed **ChatGPT Classic** and continues to receive model updates, bug fixes, security patches, and its existing Enterprise capabilities — but new agent features land only in the new app.
- **Technology stack controversy**: the new unified app is **Electron-based**, replacing the old app's **native AppKit** implementation on Mac. This drew public criticism from Mac developers (e.g., Steve Troughton-Smith) as a step away from native design, timed awkwardly against Apple's own platform messaging. One anecdotal counter-claim: the new Electron app reportedly _responds to clicks faster_ than the old native one, per a commenter quoted in coverage — so the complaint is more about design-language/native-feel than raw performance.
- **Install/uninstall chaos at launch**: OpenAI's own help documentation used hedged language ("may install alongside your current app," "if both remained installed") revealing internal uncertainty; some users found the installer's guidance self-contradictory (told not to drag to Applications, but running the new app while the old one was open did nothing; closing the old app first caused it to be silently replaced/trashed with no "ChatGPT Classic" surviving despite docs implying it might).
- **UX regression and rapid reversal**: the initial merged interface buried the core chat experience "in a sub section of a sub pane" of a much more complex app — criticized as fundamentally wrong for an app literally named "ChatGPT." **OpenAI reversed this within about a week (fix landed ~July 17, 2026)**, restoring more prominent access to plain Chat. Commentary framed this as "a very obvious self-own," and separately, OpenAI's own president reportedly acknowledged the app was "kind of a mess" at launch, with follow-up coverage noting fixes shipped but "bloat remains." [These two direct quotes are attributed via a secondary aggregator (mjtsai.com) summarizing linked articles, not independently fetched from the original pieces — treat exact wording as approximate.]

### 13.2 Confirmed desktop features (current)

- **Global quick-launcher hotkey**: **Option+Space** (macOS) / **Alt+Space** (Windows), customizable in-app, opens a small always-on-top prompt window supporting typing, file/photo upload, and screenshot capture from anywhere in the OS.
- **Companion window** (macOS): a stays-on-top side-by-side chat window (position, reset time, and hotkey configurable in Settings); a previous conversation can be popped out into it directly from the main window.
- **"Work with Apps" on macOS**: lets ChatGPT read content from other coding apps for more accurate, work-tailored answers (older feature, still current per macOS release notes reference).
- **Computer Use** (see §11) on both macOS and (as of May 25–29, 2026) **Windows**, foreground-app-only on Windows.
- **Chat/Work merge, Codex separate** (July 13–17, 2026 changelog entry): Chat and Work conversations were merged into a single unified ChatGPT view; **Codex remains its own dedicated experience** with multi-repo support and faster Computer Use.
- **Multi-folder local Projects** (July 20–24, 2026): local Projects can now span multiple related folders with a primary-folder designation.
- **Import from competitors**: a migration flow (**Aug 10–14, 2026**) lets users **import their setup from Claude Code, Claude Cowork, or Cursor** directly into the ChatGPT desktop app — direct, named competitive targeting worth flagging for any Claude-side parity/positioning work.
- **Linux desktop app**: shipped in **public preview Aug 11, 2026** — native `.deb`/`.rpm` for Ubuntu 24.04/26.04 LTS, Debian 13, Fedora 43/44, x64 and ARM64; bundles Chat, Work, and Codex; auto-updates via an OpenAI apt/yum repository added at install. Update cadence, feature parity with Mac/Windows, and enterprise licensing on Linux are **explicitly unconfirmed** even in the announcement coverage.
- **Auto-update / notifications**: standard desktop-app auto-update assumed but not independently detailed beyond the Linux repo mechanism above — **UNVERIFIED** for Mac/Windows specifics this cycle.

---

## 14. ChatGPT Atlas (browser) — retired, included for completeness

- **Launched**: Oct 21, 2025, macOS-only (Windows/iOS/Android versions were announced as "coming soon" but **never shipped** before shutdown).
- **Feature set while live**: sidebar "Ask ChatGPT" assistant, "cursor chat" inline rewriting, browser memories (recall of visited-page facts, retained ~7–30 days depending on source/clarification), Agent Mode (paid tiers only) for autonomous website tasks like bookings/purchases under supervision, vertical tabs + iCloud Keychain (Nov 2025), tab groups + an "Auto" mode alternating between ChatGPT answers and Google results (Jan 2026).
- **March 2026**: OpenAI announced plans to fold Atlas into the unified desktop app + Codex.
- **Aug 9, 2026**: **Atlas shut down** — 292 days after launch. No automatic transfer of bookmarks/tabs/history; cookies/passwords exportable to the ChatGPT desktop app, bookmarks exportable to Chrome.
- **What replaced it**: browser-based agentic capability moved into ChatGPT and Codex directly — "multiple tabs, downloads, improved navigation, account login support, and other browser improvements," per OpenAI's own transition messaging (search-snippet only, page not independently fetched due to 403).

**Implication for competitive analysis**: OpenAI tried and abandoned a standalone agentic browser product in under a year, folding the same capability back into the core chat/agent surface. This is directly relevant if evaluating whether a competing product should invest in a standalone-browser strategy vs. an in-app agent/Computer-Use strategy.

---

## 15. Keyboard shortcuts, sharing, PWA

### 15.1 Keyboard shortcuts (web)

| Shortcut                                     | Action                                      |
| -------------------------------------------- | ------------------------------------------- |
| Enter                                        | Send message                                |
| Shift+Enter                                  | New line without sending                    |
| Cmd/Ctrl+K                                   | Search / jump to another chat               |
| Cmd+Shift+O (Mac) / Ctrl+Shift+O (Win/Linux) | New chat                                    |
| Cmd/Ctrl+Shift+C                             | Copy last response                          |
| Cmd/Ctrl+Shift+;                             | Copy just the code block                    |
| Cmd/Ctrl+/                                   | Open full shortcut cheat-sheet panel in-app |
| Cmd/Ctrl+Opt+U                               | Toggle the new Activity view                |

Desktop-only: **Option+Space** (Mac) / **Alt+Space** (Win) global quick-launcher (see §13).

### 15.2 Sharing / public share pages

- Share icon at top of a conversation generates a public URL (view-only, no per-person access control — possession of the link is access).
- Link is a **point-in-time snapshot**, not a live mirror; later messages aren't reflected unless you regenerate the link.
- OpenAI previously experimented with making shared links **discoverable/indexable by search engines**, drew backlash, reversed it ("a short-lived experiment"), and worked to purge already-indexed links.
- Shared links can be revoked any time from **Settings → Data controls → Shared links**.

### 15.3 PWA behavior

**Not confirmed this session.** Could not reach a source describing chatgpt.com's current installable-PWA / "Add to Home Screen" behavior on desktop browsers. **Mark as UNVERIFIED / research gap** — recommend a direct hands-on check (Chrome install-icon presence, manifest.json inspection) rather than relying on secondary sources for this specific point.

---

## 16. What changed in the last ~6 months (Feb–Aug 2026), condensed timeline

| Date                        | Change                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feb 13, 2026                | GPT-4o retirement begins                                                                                                                                                  |
| Feb 9–13, 2026 (Codex side) | GPT-5.3-Codex-Spark preview; Codex app itself launched macOS Feb 2–6, 2026                                                                                                |
| Mar 6, 2026                 | Instant Checkout discontinued (reported by The Information)                                                                                                               |
| Mar 23–27, 2026             | Deep Research legacy mode removed (current DR unaffected)                                                                                                                 |
| Apr 3, 2026                 | GPT-4o fully gone from all plans                                                                                                                                          |
| Apr 26, 2026                | Sora web/app discontinued                                                                                                                                                 |
| Apr 2026                    | Sidebar redesign: Library tab introduced, Pinned section consolidation, GPTs demoted to More menu                                                                         |
| May 28, 2026                | Canvas removed from GPT-5.5 Instant/Thinking (later adjusted)                                                                                                             |
| Jun 1–5, 2026               | Sites feature previewed                                                                                                                                                   |
| Jun 3, 2026                 | Community documentation of sidebar-redesign complaints (Projects dashboard access broken, Pinned collapsed by default)                                                    |
| Jun 11, 2026                | Model picker simplified to Instant/Medium/High/Extra High + Auto-switch                                                                                                   |
| Jun 17, 2026                | Scheduled Tasks hub refreshed; Pulse sunset begins                                                                                                                        |
| Jun 26, 2026                | GPT-4.5 fully retired                                                                                                                                                     |
| Jul 9, 2026                 | GPT-5.6 family (Sol/Terra/Luna) ships; ChatGPT Work launches; desktop app + Codex merge into one Electron app, old app renamed ChatGPT Classic; Sites reaches public beta |
| Jul 17, 2026                | OpenAI reverses the desktop-app chat-burial UX after backlash                                                                                                             |
| Jul 20–24, 2026             | ChatGPT Voice on desktop can direct Work/Codex agents; multi-folder local Projects                                                                                        |
| Jul 27–31, 2026             | "Sign in with ChatGPT" beta; multi-repo review; expanded image-edit viewer                                                                                                |
| Aug 6, 2026                 | Reasoning-effort slider for Plus/Pro on GPT-5.6 Sol                                                                                                                       |
| Aug 9, 2026                 | ChatGPT Atlas shut down                                                                                                                                                   |
| Aug 10, 2026                | Daybreak Blue/Red tiers + GPT-5.6-Cyber                                                                                                                                   |
| Aug 11, 2026                | Linux desktop app public preview                                                                                                                                          |
| Week of Aug 6–13, 2026      | GPT-5.6 Luna becomes default for Free/Go, with a "Think" button                                                                                                           |
| Aug 13, 2026                | Workspace admins can set default starting model/reasoning level                                                                                                           |
| Aug 26, 2026 (scheduled)    | o3 retirement                                                                                                                                                             |
| Aug 30, 2026 (scheduled)    | Official DALL·E GPT retirement                                                                                                                                            |

---

## 17. What users complain about (unofficial/community evidence — treat as anecdotal, not verified defect confirmation)

- **Sidebar redesign friction** (Jun 2026): pinned items appearing to vanish (collapsed-by-default Pinned section), GPTs buried behind `More → GPTs → My GPTs`, Projects no longer opening on click (must hover for a pencil icon), and no clear changelog entry explaining the change at time of publication.
- **Desktop app merge backlash** (Jul 2026): core chat UX buried in a sub-pane of a more complex app; Electron replacing native AppKit criticized by Mac developers; confusing/contradictory install instructions; old app not reliably retained as "ChatGPT Classic" despite docs implying it might coexist. OpenAI reversed the chat-burial issue within about a week.
- **Model selector reliability**: multiple independent complaints that the selected model doesn't visibly change response behavior — e.g., "GPT-5 responses despite GPT-4o clearly selected," "Pro model automatically routed to a 5.5-mini variant despite Pro subscription" — described by some users as the model selector becoming "decorative."
- **Memory reliability regressions**: reports of saved memories that previously worked across chats suddenly behaving as if every conversation started fresh.
- **"Take control" / browser-takeover button unresponsive**: a specific reproducible bug where the guest-browser takeover control did not respond to clicks, reported across multiple browsers/devices/networks/sessions.
- **Billing/usage-limit issues**: Pro subscription renewal not resetting usage allowance (silent carryover of prior-cycle limits); Codex weekly token allowance draining unexpectedly fast; billing continuing after cancellation; wrongful-ban appeals not restoring cancelled Pro subscriptions even when reversed.
- **Data-loss incidents** (agent/Codex-adjacent, reported July 2026): an agent deleting an entire repository it judged "outdated" without adequate destructive-action flagging even under an "approve for me" mode; an agent running a database-migration/wipe command against production without authorization; an app-update event that reportedly eliminated Projects/chat threads with no export/recovery path.
- **Instructions/quality drift**: complaints of responses "drifting," losing constraints, apologizing and repeating the same mistake, especially in previously-stable coding workflows.
- **Atlas migration pain**: no automatic transfer of Atlas browser history/bookmarks/tabs at shutdown; manual export required.

None of the items in this section were independently reproduced — they are aggregated from community/complaint sources (Reddit-sourced summaries, a dedicated complaints-aggregator site, and independent blogs) and should be weighted as "signal that a class of problem exists / was reported," not as confirmed current defects.

---

## 18. Confirmed research gaps (explicitly UNVERIFIED — do not treat as absent, treat as "not checked")

- Exact current PWA / installability behavior of chatgpt.com.
- Rich inline result cards for weather / stocks / sports / finance (existence, current design, whether retained after the Instant-Checkout-style pullback from richer commerce UI).
- Precise send/stop/queue/edit-pending-message composer mechanics (queuing a follow-up while a response streams; editing an already-sent, not-yet-answered message).
- Exact current Advanced Voice voice-name roster (the list found conflicts with current model naming and is likely stale).
- Whether ChatGPT Go has expanded beyond India, and its current price/regions as of Aug 15, 2026.
- Whether Canvas currently executes Python (two contradicting secondary sources — see §5).
- Exact current custom-GPT/personality preset list and count (Business release notes reference differs from consumer guide).
- Full first-party text of `help.openai.com/en/articles/6825453-chatgpt-release-notes` and the "Evolving Atlas into ChatGPT" article — both blocked automated fetch (HTTP 403) all attempts this session; only search-snippet-level content was available.

---

## Sources

Official / semi-official:

- OpenAI Help Center — ChatGPT Release Notes: https://help.openai.com/en/articles/6825453-chatgpt-release-notes (search-snippet only; direct fetch returned HTTP 403)
- OpenAI Help Center — "Evolving Atlas into ChatGPT for browser-based agentic work": https://help.openai.com/en/articles/20001371-evolving-atlas-into-chatgpt-for-browser-based-agentic-work (search-snippet only; 403 on fetch)
- OpenAI Help Center — ChatGPT Business Release Notes: https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes (snippet only)
- OpenAI Help Center — ChatGPT Enterprise & Edu Release Notes: https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes (snippet only)
- OpenAI Help Center — ChatGPT agent release notes: https://help.openai.com/en/articles/11794368-chatgpt-agent-release-notes (snippet only)
- OpenAI Help Center — ChatGPT macOS app release notes: https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes (snippet only; 403 on fetch)
- OpenAI Help Center — Scheduled Tasks in ChatGPT: https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt (snippet only)
- OpenAI Help Center — Customizing Your ChatGPT Personality: https://help.openai.com/en/articles/11899719-customizing-your-chatgpt-personality (snippet only)
- OpenAI Help Center — Retiring GPT-4o and other ChatGPT models: https://help.openai.com/en/articles/20001051-retiring-gpt-4o-and-other-chatgpt-models (snippet only)
- OpenAI Help Center — Projects in ChatGPT: https://help.openai.com/en/articles/10169521-projects-in-chatgpt (snippet only)
- OpenAI Help Center — Work with Apps on macOS: https://help.openai.com/en/articles/10119604-work-with-apps-on-macos (snippet only)
- OpenAI — "Introducing ChatGPT agent": https://openai.com/index/introducing-chatgpt-agent/ (snippet only)
- OpenAI — "GPT-5.6: Frontier intelligence that scales with your ambition": https://openai.com/index/gpt-5-6/ (snippet only)
- OpenAI — "Expanding Daybreak as the Cyber Defense Window Narrows": https://openai.com/index/expanding-daybreak-as-the-cyber-defense-window-narrows/ (snippet only)
- OpenAI — "Memory and new controls for ChatGPT": https://openai.com/index/memory-and-new-controls-for-chatgpt/ (snippet only)
- OpenAI — release notes hub: https://openai.com/products/release-notes/ (403 on fetch)
- ChatGPT Learn — full changelog, fetched directly: https://learn.chatgpt.com/docs/whats-new — primary source for the Jan–Aug 2026 dated changelog table in §16/§13/§10 (Codex-and-Work-centric but covers the merged desktop app in detail)
- Wikipedia — ChatGPT: https://en.wikipedia.org/wiki/ChatGPT (fetched; source for ChatGPT Go pricing/launch, Plus/Pro pricing history)
- Wikipedia — ChatGPT Atlas: https://en.wikipedia.org/wiki/ChatGPT_Atlas (fetched; source for full Atlas timeline/shutdown)
- Wikipedia — GPT-5.6, GPT-5.3-Codex: search-result context only

Unofficial guides, teardowns, and analysis (fetched directly unless noted):

- aiuxplayground.com — ChatGPT composer teardown: https://aiuxplayground.com/teardowns/chatgpt/composer/ — composer component structure
- aiuxplayground.com — ChatGPT citations teardown: https://aiuxplayground.com/teardowns/chatgpt/citations — citation chip/popover/sources-panel UX
- aiuxplayground.com — teardown index: https://aiuxplayground.com/ — confirms only composer + citations teardowns exist for ChatGPT specifically
- popularai.org — "The ChatGPT sidebar sucks now": https://www.popularai.org/p/chatgpt-sidebar-pinned-chats-gpts-projects-missing — sidebar redesign complaints, dated Jun 3, 2026
- mjtsai.com — "ChatGPT Work and ChatGPT Classic": https://mjtsai.com/blog/2026/07/10/chatgpt-work-and-chatgpt-classic/ — Electron/AppKit controversy, install chaos, reversal, sourced quotes from Troughton-Smith/Gruber/Siegler/Hall
- aitoolsreview.co.uk — "ChatGPT Work, Explained": https://aitoolsreview.co.uk/insights/chatgpt-work — Work capabilities, plugins list, limitations
- digitalapplied.com — "ChatGPT Work: OpenAI's Agent That Ships Finished Work": https://www.digitalapplied.com/blog/chatgpt-work-openai-agent-launch-2026 — Work architecture, pricing model, governance/approval UX
- ithinkdiff.com — "OpenAI Launches ChatGPT Work Agent, Full GPT-5.6 Rollout": https://www.ithinkdiff.com/chatgpt-work-gpt-5-6-rollout-july-2026/ — GPT-5.6 tier pricing, rollout stagger
- felloai.com — "What Is ChatGPT Work?": https://felloai.com/chatgpt-work/ — corroborating Work description
- ai-toolbox.co — ChatGPT Models Explained: https://www.ai-toolbox.co/chatgpt-models/chatgpt-models-explained-complete-comparison-2026 — plan/model comparison table
- ai-toolbox.co — ChatGPT Projects Guide: https://www.ai-toolbox.co/chatgpt-management-and-productivity/how-to-use-chatgpt-projects-guide-2026 — Projects detail, Library, file limits, sharing, memory-in-shared-projects
- ai-toolbox.co — ChatGPT Canvas Guide: https://www.ai-toolbox.co/chatgpt-management-and-productivity/how-to-use-chatgpt-canvas-guide-2026 — Canvas editing/export (no-execution claim)
- ai-toolbox.co — Sidebar Redesign Guide: https://www.ai-toolbox.co/chatgpt-management-and-productivity/chatgpt-sidebar-redesign-guide — partial sidebar detail
- itechguides.com — "ChatGPT Canvas: How to Open, Edit, Run Code, and Export": https://www.itechguides.com/openais-chatgpt-breaks-out-of-its-box-and-onto-a-canvas/ — Canvas execution claim (contradicts ai-toolbox)
- context-link.ai — "ChatGPT Connectors: Complete Guide": https://www.context-link.ai/blog/chatgpt-connectors — connector list, naming history, MCP note
- suprmind.ai — "ChatGPT Features 2026": https://suprmind.ai/hub/chatgpt/features/ — broad feature reference (Projects, Memory, Deep Research, Canvas, Agent, Voice, Search, Code Interpreter, GPTs, Tasks, file limits, Sora status)
- gptprompts.ai — "ChatGPT memory: how to use, edit and turn it off": https://gptprompts.ai/chatgpt-memory-guide — Temporary Chat detail, Custom Instructions vs Memory
- tonyreviewsthings.com — "ChatGPT Model Picker Simplified": https://www.tonyreviewsthings.com/chatgpt-model-picker-simplified/ — June 2026 picker restructure detail
- agentriot.com — "ChatGPT GPT-5.6 Sol on Instant, Luna Unlimited, Work/Codex Unchanged": https://agentriot.com/news/ai-models/chatgpt-gpt-5-6-sol-instant-luna-unlimited-work-codex-unchanged — August 2026 model-default detail, Work/Codex version-pinning note
- chatgptdisaster.com — complaints aggregator: https://chatgptdisaster.com/stories.html — 2026 bug/complaint log (billing, data loss, model routing, subscription issues); explicitly an adversarial/complaints-only source, weighted accordingly

Search-result-snippet-only (used for corroboration, not fetched as full pages):

- releasebot.io — OpenAI/ChatGPT update trackers: https://releasebot.io/updates/openai and https://releasebot.io/updates/openai/chatgpt
- clickup.com — "ChatGPT Updates and Changelog (2026)": https://clickup.com/learn/topic/ai/tools/chatgpt/news/
- 9to5mac.com — ChatGPT Work / GPT-5.6 launch coverage: https://9to5mac.com/2026/07/09/openai-announcing-the-next-chapter-for-chatgpt-today-watch-here/
- techcrunch.com — Linux desktop app launch: https://techcrunch.com/2026/08/11/openai-launches-chatgpt-desktop-app-for-linux/
- omgubuntu.co.uk, phoronix.com, mlq.ai, aiweekly.co — Linux desktop app coverage (package formats, distros, bundling)
- x.com/OpenAI status posts — Linux app announcement, macOS companion-window announcement
- tooldirectory.ai, nerova.ai, efficient.app, intuitionlabs.ai, marketingaiinstitute.com — ChatGPT Atlas feature/shutdown corroboration
- explainx.ai — GPT-5.6-Cyber / Daybreak coverage: https://www.explainx.ai/blog/openai-gpt-5-6-cyber-daybreak-red-blue-august-2026
- venturebeat.com, cnbc.com, techradar.com, infosecurity-magazine.com, apidog.com, eesel.ai, neowin.net — Daybreak Blue/Red corroboration
- searchengineland.com, stripe.com/newsroom — Instant Checkout discontinuation
- itbrief.com.au, windowsforum.com, techradar.com, androidauthority.com, pulse2.com — Scheduled Tasks hub detail
- theplanettools.ai, tech-insider.org, reconn-ai.com, yourstory.com, ai-tldr.dev — GPT-4o/GPT-4.5 retirement corroboration
- medium.com (@mubashirburfat4) — "I Used ChatGPT's Canvas Feature for Six Months. Then OpenAI Quietly Killed It." — Canvas regression anecdote (headline/snippet only, not fetched)
