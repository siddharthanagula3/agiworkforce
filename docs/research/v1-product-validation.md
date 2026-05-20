# AGI Workforce v1 — Product Validation Research

> Use this as a master research prompt. Run it in chunks per audience (see "How to run" at the end). Self-contained — respondents don't need prior knowledge.
>
> Grounded in actual code state as of 2026-05-16: `packages/types/src/billing-catalog.ts` (pricing), `packages/types/src/model-catalog.ts` (TIER_POLICIES + SLOT_REGISTRY), `docs/PRICING.md` (canonical pricing doc), 16 shared packages, 6 shipping surfaces.

---

## How to introduce the survey

> Hi — I'm building **AGI Workforce**, an app that lets you use 10+ AI providers (Claude, ChatGPT, Gemini, Perplexity, DeepSeek, Grok/xAI, Kimi/Moonshot, GLM/Zhipu, Qwen, Mistral, plus local models via Ollama and LM Studio) through one interface. Same conversation continues across desktop, web, mobile, terminal CLI, Chrome extension, and VS Code extension.
>
> I have about 30 decisions to lock before v1 launch. Your answers (anonymous, 8–12 min) directly shape what ships. Honest reactions land best — "I'd never use this" is as useful as "shut up and take my money."
>
> If a question doesn't apply, skip it. If you want to expand, the free-text fields at the end are where the gold is.

---

## §A. About you (1 min — required for cross-tab)

**A1.** Primary role: developer / designer / writer / researcher / analyst / student / founder–operator / product manager / data scientist / other

**A2.** Years using AI tools (any kind): <1 / 1–2 / 2–4 / 4+

**A3.** Country of primary residence: (open) — _used to weight India / China / US/EU specific routing questions_

**A4.** Today, which AI tools do you actively use weekly? (multi-select)

- ChatGPT free / Plus $20 / Pro $200 / Team / Enterprise
- Claude free / Pro $20 / Max $100 or $200 / Team
- Gemini free / Advanced $20
- Perplexity free / Pro $20 / Max $200
- Cursor / Windsurf / Zed Beta
- Claude Code / Codex CLI / Gemini CLI / OpenCode
- GitHub Copilot
- Local LLMs (Ollama / LM Studio / Jan / Msty / Open WebUI)
- Multi-provider clients (OpenRouter / LibreChat / T3 Chat / Poe)
- Voice tools (Wispr Flow / Superhuman AI / Granola)
- Browser AI (Arc / Comet / Dia)
- Image gen (Midjourney / DALL-E / Imagen / SD)
- Video gen (Runway / Pika / Veo / Sora)
- API direct (Anthropic / OpenAI / Google) — no client
- None of the above

**A5.** Approximate total monthly AI spend: $0 / $1–20 / $21–50 / $51–100 / $101–200 / $201–500 / $500+

**A6.** Approximate weekly AI hours: <1 / 1–5 / 6–15 / 16–30 / 30+

**A7.** Hardware: Apple Silicon Mac with 16GB+ RAM / Apple Silicon Mac <16GB / Intel Mac / Windows PC with NVIDIA 12GB+ VRAM / Windows PC weaker / Linux desktop / iPad / mobile only

---

## §B. The core thesis (2 min)

**B1.** "One app, all providers, one bill" — replacing 4–6 AI subscriptions with a single client where you pick the model per message. 1–5 scale: not at all appealing → would switch tomorrow.

**B2.** Pick the closest mental model:

- A unified frontend (like a browser, but for AI providers)
- A specialized vertical tool (coding-only, writing-only, research-only)
- An aggregator with managed cloud cost layer
- A self-hosted/local-first power-user tool
- Doesn't fit any of those

**B3.** Which matters more for your decision? (rank top 3)

- Lowest absolute price
- Latest flagship model access (Opus, GPT-5.5, Gemini Ultra)
- Multi-provider switching mid-conversation
- BYOK (use your own API keys, pay providers direct)
- Fully local (own GPU, zero cloud)
- Cross-device sync (phone ↔ desktop continuity)
- Specific surface coverage (e.g., mobile app, CLI, browser ext)
- Voice-first input
- Computer use / agentic actions
- Privacy & data control

**B4.** **First objection** that comes to mind for this product (free text, 1 sentence — _the highest-value question in the whole survey_)

**B5.** Would you ever pay for AI you can also access by other means? (yes if better UX / only if a specific feature is unavailable elsewhere / no, free tier or BYOK only)

---

## §C. Tier choice — the revenue question (2 min)

Planned tiers (all locked in code, all priced in Stripe):

| Tier           | Monthly     | Yearly (≈ effective $/mo) | What you get                                                                                                                                                                          |
| -------------- | ----------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local-only** | $0          | $0                        | Run your own Ollama / LM Studio. Desktop only. No cloud.                                                                                                                              |
| **BYOK**       | $0          | $0                        | Bring your own API keys for 10+ providers. Optional Supabase for sync.                                                                                                                |
| **Free**       | $0          | $0                        | 100K tokens/mo + 5 msgs/day. One workhorse model only. Funnel tier.                                                                                                                   |
| **Hobby**      | **$10**     | **$59.88 (~$5/mo)**       | 2M tokens/mo, auto-routed to cheap models. **No manual model picker.** Voice 60 min/mo. Images 10/mo. Web search.                                                                     |
| **Pro**        | **$29.99**  | **$299.88 (~$25/mo)**     | 10M tokens/mo, mid-tier flagships (Sonnet 4.6, Gemini Pro, Kimi K2.6, GPT-5.4-mini). Voice 300 min. Unlimited images (debited from tokens). Light computer use. Manual picker.        |
| **Pro+**       | **$49.99**  | **$499.88 (~$42/mo)**     | Pro + true flagships (Opus 4.7 + GPT-5.5 at 15K tokens/day each). Voice 1500 min. 60s/mo video gen (Runway Gen-4). Multi-provider mid-conversation switch. US/EU-only routing toggle. |
| **Max**        | **$299.99** | **$2,999.88 (~$250/mo)**  | 50M tokens. Opus + GPT-5.5 at 1M tokens/mo each. Voice unlimited. 5min/mo video (Runway + Veo-3). Computer use 1K-2.5K actions. Deep Research.                                        |
| **Enterprise** | Contact     | Contact                   | SSO, SCIM, custom retention, audit log, dedicated support                                                                                                                             |

**C1.** Which tier would you actually buy? (Free / Hobby $10 / Pro $29.99 / Pro+ $49.99 / Max $299.99 / Enterprise / BYOK only / Local only / none — wouldn't try)

**C2.** **Pro is $29.99 vs ChatGPT Plus $20 and Claude Pro $20.** Is the +50% premium worth getting all providers in one app?

- Yes, worth it (all-in-one + multi-provider justifies it)
- No, too expensive (would expect <= $20)
- Depends — only if it includes specific providers (which? free text)
- I wouldn't switch from my current tool regardless

**C3.** **Pro+ at $49.99** sits between Pro and Max. Pick the value description that fits your willingness:

- "Worth it for Opus + GPT-5.5 + multi-provider switch alone"
- "Worth it only if voice/video/computer-use are unlimited there"
- "Too narrow a gap from Pro to justify"
- "Wouldn't pay >$30/mo for any AI app"

**C4.** **Max at $299.99** is for power users running long agent workflows + computer use + Deep Research. Is the market for this:

- Real and underserved
- Real but saturated by Claude Max $200 and ChatGPT Pro $200
- Niche, would skip
- Don't know enough to judge

**C5.** **Annual prepay** (Hobby ~50% off, Pro/Pro+/Max ~17% off) — do you prepay annually for software?

- Always when offered (saves money)
- Sometimes (for tools I'm sure I'll keep)
- Never (monthly only — flexibility)

**C6.** **Credit balance + pay-as-you-go** (like Anthropic / OpenAI API top-up) vs **flat subscription** — preference?

- Flat subscription (predictable cost)
- Credits (pay only for what I use)
- Both available (let me choose)
- Hybrid: subscription with overage credits

**C7.** **Overage when you blow the cap** — pick acceptable behavior:

- Hard stop, must upgrade tier to continue
- Silent downgrade to cheaper model (keep chatting, lower quality)
- Notify + let me choose: upgrade / pay overage / downgrade
- Pay-per-token overage at posted rate
- Add credits manually

**C8.** **Refund window** expectation: 7 days no-questions / 14 days / 30 days / pro-rated only / no expectation

**C9.** **Free trial of Pro/Pro+/Max** — would lack of a trial stop you from subscribing? (yes blocks me / would prefer but not blocker / don't care)

**C10.** **Family / multi-account discount** (e.g., 2-seat Pro for $44.99) — would you use it? (yes / no / what about 5-seat?)

---

## §D. Hobby economics — does the $10 tier work? (1 min)

Hobby = $10/mo, 2M tokens/mo, auto-routes to cheap pool: Gemini 3.1 Flash-Lite ($0.25/$1.50 per million in/out tokens), GLM-4.7 ($0.30/$1.20), DeepSeek V4-Flash ($0.14/$0.28), Imagen-4 Fast ($0.02/image), Whisper-1 ($0.006/min). **No manual model picker — auto-routing only.**

**D1.** Is Hobby's "auto-routing only, no manual picker" a fair tradeoff for $10/mo, or a dealbreaker?

- Fair tradeoff — I trust good auto-routing
- Dealbreaker — I want to pick models myself
- Would pay $15–20 for Hobby-with-manual-picker
- Don't trust auto-routing in general

**D2.** Hobby routes to **Chinese-origin providers** (DeepSeek, GLM/Zhipu, Kimi) by default to keep costs down. Comfort level?

- Fine with it (data is just text)
- Fine if disclosed upfront
- Want a US/EU-only toggle (even if pricier)
- Won't use Chinese-routed services at all

**D3.** Hobby's **10 images/month** cap — sufficient or too tight?

- Sufficient (I rarely generate images)
- Too tight — would pay $2–5 more for 50/mo
- Way too tight — image gen is core to my use
- Don't generate images at all

**D4.** Hobby's **60 min/month voice** (Wispr-Flow pattern: push-to-talk hotkey → transcribe → AI rewrite → paste into any text field) — enough?

- Plenty (don't use voice much)
- About right for daily use
- Too low — voice is core, need 300+ min
- Wouldn't use voice

**D5.** **Geo pricing**: India ₹399 GST-inclusive (~$3.97 net) and China ¥35 (~$4.85) for the same Hobby tier. Fair, or should it be the global $10?

- Fair purchasing-power adjustment
- Should be global $10 everywhere
- Should be even cheaper in those markets
- Don't have an opinion

---

## §E. Surface priorities — which to polish first (1 min)

We ship 6 surfaces: **desktop app (Tauri, Mac/Win/Linux)**, **web app (browser)**, **mobile (iOS + Android, Expo)**, **terminal CLI (Rust, Ratatui)**, **Chrome extension (popup + side panel + in-page overlay)**, **VS Code extension (sidebar + @agi chat + inline completions)**.

**E1.** Rank by "I would actually use this" (1 = most likely, 6 = least): desktop / web / mobile / CLI / Chrome ext / VS Code ext

**E2.** If we could only ship 2 surfaces well at launch and the rest as "decent enough," which 2? (multi-select max 2)

**E3.** **Mobile** — is it your primary chat surface, a companion to desktop, or you don't use AI on mobile?

**E4.** **CLI** — would you use a terminal-based AI client?

- Yes, primary (replace Claude Code / Codex / Gemini CLI)
- Yes, secondary
- No, prefer GUI
- I don't use the terminal much

**E5.** **Chrome extension** — what's the killer use case for you?

- Summarize / extract from current page
- Compose emails / messages in any text field (Wispr-Flow style)
- Job application autofill (LinkedIn / Lever / Greenhouse)
- Browser control (AI takes browser actions)
- Side panel chat without leaving the page
- Wouldn't install a Chrome extension

**E6.** **VS Code extension** — preference vs GitHub Copilot / Cursor:

- Would switch if multi-provider available
- Would supplement Copilot
- Cursor has stolen this category, won't switch
- I don't use VS Code

---

## §F. Features — must-have ranking (2 min)

For each, mark: **Must have** / **Nice to have** / **Don't care** / **Wouldn't use**

**F1.** Voice input (push-to-talk hotkey, transcribes + pastes anywhere on your OS)
**F2.** Voice conversation (real-time duplex, like Advanced Voice / Gemini Live)
**F3.** Image generation (Imagen / DALL-E / Stable Diffusion)
**F4.** Image editing (mask, inpaint, vary)
**F5.** Video generation (Runway Gen-4 / Veo-3 — text-to-video)
**F6.** Computer use (AI controls mouse + screen)
**F7.** Browser control (AI controls just the browser, not full screen)
**F8.** Deep Research (agentic multi-source research reports, 5–10 min runs)
**F9.** Plan mode (AI shows plan, you approve before execution)
**F10.** Multi-provider mid-conversation switch (Claude → GPT → Gemini same thread)
**F11.** Projects / workspaces with custom instructions + knowledge files
**F12.** Connectors (Gmail / Drive / Slack / GitHub / Notion / Linear)
**F13.** MCP server support (bring your own tools)
**F14.** Artifact sidebar (HTML / PDF / code preview alongside chat)
**F15.** Local LLM (Ollama / LM Studio on your own GPU)
**F16.** Cross-device sync (start on phone, continue on desktop)
**F17.** Skills marketplace (pre-built workflows you can install)
**F18.** Memory tool (AI remembers facts about you across sessions)
**F19.** Scheduled / recurring tasks (run this prompt every Monday 9am)
**F20.** Background tasks (start a long task, get notified when done)
**F21.** Citations / sources on every factual claim
**F22.** Cost tracking (per conversation, per provider, lifetime)
**F23.** Conversation branching / forking
**F24.** Conversation export (markdown / PDF / shareable link)
**F25.** Temporary chat (incognito mode, not saved to history)

**F26.** **The one feature that would make you switch** from your current tool (free text)

---

## §G. Image generation deep-dive (1 min)

**G1.** How often do you generate images? Daily / weekly / monthly / rarely / never

**G2.** Preferred provider quality (rank top 3): Imagen 4 / DALL-E 3 / Midjourney v7 / Stable Diffusion 3.5 / Flux / Ideogram / Recraft / no preference

**G3.** What matters most? (rank): photorealism / artistic style / text rendering accuracy / speed / cost / consistency across generations / safety (no NSFW false positives)

**G4.** Acceptable wait time per image: <3 sec / 3–10 sec / 10–30 sec / 30+ sec OK for quality

**G5.** **Aspect ratios** you actually need: 1:1 only / + 16:9 / + 9:16 portrait / + 4:5 / + custom

**G6.** Image editing operations you'd use (multi-select): inpaint / outpaint / variations / style transfer / upscale / background remove / face swap / object remove

---

## §H. Video generation deep-dive (1 min)

**H1.** Have you ever paid for video gen? (yes — Runway / Pika / Synthesia / other / no)

**H2.** Realistic use case for AI video? (multi-select)

- Social media content (TikTok / Reels / Shorts)
- Marketing / explainer
- Personal creative experiments
- Storyboarding for film
- Product demos
- No real use case
- Other

**H3.** Pro+ tier ships **60 seconds/month** of video (Runway Gen-4 720p). Realistic for your use, or too tight?

- Sufficient
- Too tight — would pay $20+ more for 5 min on Pro+
- Don't generate video
- Need way more (Max tier 5 min still tight)

**H4.** Preferred quality vs duration tradeoff: short high-quality clips / longer lower-quality / both available

**H5.** **Sora 2 EOL** is September 24, 2026 (OpenAI deprecation). Acceptable that we route to alternatives (Runway Gen-4 + Veo-3) and not Sora?

- Don't care which provider, as long as quality
- Prefer to have Sora explicitly available before EOL
- Wouldn't notice
- Don't use video

---

## §I. Voice deep-dive (1 min)

Two voice paradigms:

- **Wispr-Flow pattern (planned)**: system-wide push-to-talk hotkey → Whisper transcription → AI cleanup → paste into ANY text field on your OS (Gmail, Slack, Notion, IDE, anywhere)
- **Duplex live voice (deferred to v2)**: real-time bidirectional voice conversation, like talking to a person

**I1.** Which voice paradigm would you actually use? (Wispr-Flow / Duplex / both / neither)

**I2.** How important is **system-wide voice input** (works in any app, not just our app)?

- Critical — biggest unlock
- Nice — would use sometimes
- Neutral
- Wouldn't use voice

**I3.** **AI cleanup of transcription** (removes ums, fixes punctuation, adapts tone to app context — email vs Slack vs code comment) — valuable or annoying?

- Valuable — saves edit time
- Want raw transcription only
- Want both modes with a hotkey
- Don't care

**I4.** Voice persona / wake word / always-on listening — required?

- Required (always-on push-to-talk OK, ambient listening NOT OK)
- Nice but not required
- Strongly opposed (privacy)

**I5.** **Hobby's 60 min/month** voice cap — usage forecast:

- Way under (10–20 min)
- About right (30–90 min)
- Over (200+ min — need Pro 300 min)
- Way over (need Max unlimited)

---

## §J. Computer use deep-dive (1.5 min)

Computer use = AI controls your mouse and screen to complete tasks. Pro tier = light (basic file operations). Pro+ = advanced (workflow automation). Max = 1K-2.5K actions/month with full control.

**J1.** Trust level for letting AI control your screen:

- Full trust — let it run autonomously
- Trust with per-action approval (Ask before every click)
- Trust only for narrow scopes (specific apps you allow)
- Trust only in a sandbox / VM
- No trust — wouldn't use

**J2.** Acceptable scope (multi-select):

- Browser only
- Specific allowlisted apps (Slack / Mail / IDE / etc.)
- Full screen access
- Sandbox/VM only
- Won't use

**J3.** Use case that would actually pay off (multi-select):

- Repetitive form-filling
- Cross-app workflows (read Gmail → file Linear ticket)
- Data extraction from non-API'd sites
- Demoing / tutorials / screen recordings
- Job application autofill
- QA / testing
- Not real for me

**J4.** **2.5K actions/month hard cap on Max ($299)** — sufficient or too tight?

- Sufficient
- Too tight — power users will burn through
- Don't know
- Won't use

**J5.** Comfort with **AI seeing private content on screen** during computer use (banking, personal email, IDE secrets)?

- Comfortable if I explicitly approve session
- Only if I can mask regions
- Only in dedicated apps
- Not comfortable

---

## §K. Auto-routing UX — the silent vs visible debate (1 min)

Our auto-router picks the model for you to keep costs low. Current locked spec: **fully silent** (no model badge, no toast, no name shown). Cap behavior: warn 80% / silent downgrade to workhorse at 100% / hard cap 150%.

**K1.** When the app picks a model for you, do you want to see which one?

- Always show (small badge next to each response)
- Show on hover/click (collapsed by default)
- Never show — trust the routing
- Show only for specific responses (when I ask)

**K2.** When you hit 100% of your monthly cap and the app **silently downgrades** to a cheaper model, what should happen?

- Truly silent (current spec) — most users won't notice
- Subtle indicator ("running on workhorse model") in status bar
- Toast notification first time it happens this month
- Modal: "You've hit your cap. Continue at lower quality or upgrade?"
- Hard stop, must upgrade

**K3.** **Confidence in auto-routing** in general — would you trust an AI to pick the right model for each query?

- Yes, if quality holds
- Only for low-stakes queries (chat / search)
- Only with override option
- No, manual always

**K4.** Have you ever used **OpenRouter** or similar router? If yes, did the auto-routing meet expectations? (yes loved / yes mixed / yes hated / no haven't tried)

---

## §L. Performance & latency expectations (1 min)

**L1.** Acceptable wait time for an **instant chat response** (one-shot, no tools): <1 sec to first token / 1–3 sec / 3–8 sec / 8+ sec if quality is high

**L2.** Acceptable wait time for a **complex agentic task** (tools, research): <30 sec / 30 sec–2 min / 2–10 min / longer is fine for great answers

**L3.** **Thinking / reasoning display** preference:

- Show full reasoning chain expanded by default
- Collapsed by default, expand on click
- Don't show at all, just the final answer
- Doesn't matter

**L4.** **Prompt caching across providers** (chat history stays warm even when switching Claude → GPT mid-thread, so you don't get re-billed for context) — matters?

- Matters a lot (saves cost / latency)
- Nice to know
- Don't think about it

**L5.** **Cold start** (app launch time) — acceptable?

- <500 ms (instant)
- 1–2 sec
- 3–5 sec
- Don't care
- I never quit, always running

**L6.** **Memory footprint** — would you balk at:

- 200 MB RAM idle
- 500 MB RAM idle
- 1 GB RAM idle
- 2 GB+ RAM idle
- I don't watch memory

---

## §M. Provider preferences (1 min)

**M1.** Rank top 3 providers you trust most: Anthropic / OpenAI / Google / Meta (Llama) / Mistral / xAI / Perplexity / DeepSeek / Moonshot (Kimi) / Zhipu (GLM) / Qwen (Alibaba) / Cohere / Together / Groq

**M2.** Are you comfortable with **Chinese-origin providers** (DeepSeek, Kimi, GLM, Qwen) processing your data?

- Yes always (data is just text)
- Yes if I'm told first
- Yes if it's text-only / non-sensitive
- No

**M3.** **US/EU-only routing toggle** on Pro+ — adoption?

- Always-on default
- Opt-in toggle (default routes everywhere)
- Don't care

**M4.** **Local LLM on your own GPU** — would you use it?

- Yes for everything (privacy first)
- Yes for sensitive queries only
- Yes for offline scenarios
- No, cloud is fine
- No GPU / underpowered hardware

**M5.** **Provider for image gen** preference (single): Imagen 4 / DALL-E 3 / Stable Diffusion / Flux / Midjourney / no preference

**M6.** **Provider for video gen** preference (single): Runway Gen-4 / Veo-3 / Sora 2 / Pika / Kling / no preference

**M7.** **Provider for voice transcription** preference: Whisper (OpenAI) / Deepgram / AssemblyAI / Google STT / no preference

---

## §N. UX & visual choices (1.5 min)

**N1.** **Empty state when you open a new chat** — pick one:

- **Lean**: greeting + 3–4 prompt chips, lots of whitespace
- **Medium**: greeting + 6–8 categorized quick actions
- **Dense**: launcher-style grid with 10+ actions across categories (Search / Write / Code / Image / Video / Analyze / etc.)

**N2.** **Default theme** at install:

- System (matches OS)
- Light
- Dark
- Surprise me

**N3.** **Theme presets** beyond just light/dark (catppuccin, dracula, nord, tokyo-night, solarized, etc.) — matter to you?

- Yes, themes are part of why I'd use it
- Nice to have but not deciding factor
- Don't care, system defaults fine

**N4.** **Welcome greeting** — pick the one that doesn't make you cringe:

- "What can I help with?"
- "Hi {name}, what can I help with?"
- "Good morning, {name}. What's on your mind?"
- "Ready when you are."
- Write your own

**N5.** **Hero illustration on empty state**:

- Yes, want a brand mascot / illustration
- Yes but abstract gradient only
- No — just an icon-in-circle is fine
- No — distracting

**N6.** **Animation / motion** preference:

- Lively (everything animates in, springy)
- Moderate (entrance fades, no decorative motion)
- Minimal (no animation, instant)
- Don't care

**N7.** **Brand mark** — three proposals (SVG attachments) for the app icon:

- A. Four connected circles in an X-pattern (represents AI workforce of agents, one circle different color = you the orchestrator)
- B. Geometric letter "A" monogram with a crossbar accent
- C. Three stacked offset rectangles (represents a stack of models)
- Which would you rather see in your dock / tab? Why?

---

## §O. Composer & message UX (1 min)

**O1.** **Model picker placement** preference:

- In the composer footer (always visible, click to change)
- In the top bar (chat-wide setting)
- Hidden behind a menu (Advanced mode)
- Don't show — auto picks

**O2.** **Attachment menu** — which sources do you actually need? (multi-select)

- Local file
- Photo
- Screen capture / screenshot
- Camera (mobile)
- Google Drive
- Dropbox / OneDrive / iCloud
- Notion / Linear / GitHub
- URL
- Paste from clipboard

**O3.** **Slash command palette** — would you use it heavily?

- Yes, all the time (power user)
- Sometimes
- Don't know what slash commands do
- Prefer menus

**O4.** **@-mention triggers** (multi-select):

- @file (workspace files)
- @memory (saved facts)
- @skill (installed skills)
- @connector (Gmail / Slack / etc.)
- @person (mention teammates, if Team tier)
- Don't use @-mentions

**O5.** **Per-message actions** preference — visible inline by default, or only on hover/long-press?

- Inline (copy / regenerate / branch / rate buttons always shown)
- On hover (desktop) / long-press (mobile) — cleaner
- Behind a "..." menu only

**O6.** **Streaming** vs full-response preference:

- Always stream (see tokens as they come)
- Wait for full response (less distracting)
- Per-conversation toggle

**O7.** **Markdown rendering** — should code blocks have:

- Syntax highlighting + copy + filename + language label (full chrome)
- Just syntax highlighting + copy
- Plain monospace, no chrome
- Don't care

---

## §P. Artifacts & sidebar (1 min)

**P1.** **Artifact sidebar** (right panel showing HTML / PDF / spreadsheet / code preview while chat continues on left) — value?

- Must have
- Nice to have
- Wouldn't use, prefer inline only

**P2.** **Artifact tabs** — Preview / Source / Data — useful?

- Yes all three
- Just Preview and Source
- Just Preview
- Don't care

**P3.** Artifact types you'd actually use (multi-select):

- HTML (live preview)
- React (live preview)
- SVG
- Markdown
- PDF
- Spreadsheet (CSV / XLSX)
- Mermaid diagram
- Chart (data viz)
- Code (read-only)
- Presentation slides

**P4.** **Artifact toolbar actions** (multi-select required): copy / download / refresh / share / print / version history / fullscreen / open-in-editor

**P5.** **Dark-mode artifact preview** — important for HTML / web previews?

- Yes (matches app theme)
- No (default browser styling fine)
- Don't care

---

## §Q. Onboarding & auth (1 min)

**Q1.** **First-launch experience** preference:

- Quick start (1 screen): "Pick mode → start chatting"
- Guided wizard (3–4 screens): mode selection → provider keys → preferences
- Full personalization (5+ screens): role / use cases / preferred models / theme / sync

**Q2.** **Auth methods** you'd use (multi-select):

- Email + password
- Google OAuth
- Apple OAuth
- GitHub OAuth
- Magic link (email)
- Device flow (CLI / TV-style code)
- API key only (no account)
- SSO (Okta / Azure AD / Google Workspace)
- Passkeys / WebAuthn

**Q3.** **Mode selection** (Local vs Cloud vs BYOK) — where should it appear?

- During onboarding as a clear A/B/C choice
- Hidden in settings (default Cloud, advanced users find Local)
- After signup based on plan
- Don't surface — auto-detect

**Q4.** **Tour / tooltips** for new users — value?

- Yes, want a guided tour
- Just contextual tooltips on first interaction
- Skip, I'll figure it out
- Annoying

---

## §R. Privacy, data handling, training (1 min)

**R1.** **Data retention** preference:

- Keep all chats forever (with manual delete)
- Auto-delete after 30 / 90 / 365 days (configurable)
- Per-conversation control (incognito mode toggle)
- Local-first (never on cloud)

**R2.** **Training opt-out** (provider doesn't train on your data) — required?

- Required (won't use without)
- Nice to have
- Don't care

**R3.** **Data residency** (EU users): is "data stays in EU" a buying factor?

- Required (GDPR sensitive)
- Strongly preferred
- Nice
- Don't care
- Not in EU

**R4.** **Encryption** preference:

- End-to-end (we can't read your chats)
- At-rest only (we can read but encrypted on disk)
- Don't care
- E2E required for medical / legal / financial only

**R5.** **Memory tool** — AI remembers facts across sessions ("my dog's name is Max", "I prefer TypeScript"). Comfort level?

- Yes love it
- Yes with explicit per-fact control (see / edit / delete)
- No, treat each conversation fresh
- Privacy concern

---

## §S. Multi-device sync (30 sec)

**S1.** What should sync across devices? (multi-select)

- Conversations + history
- API keys / BYOK keys
- Custom instructions
- Skills / connectors installed
- Memory / saved facts
- Settings (theme / shortcuts / models)
- Drafts (in-progress messages)
- Artifacts created

**S2.** **Conflict resolution** if you edit on phone while desktop is offline — preference?

- Last write wins (simplest)
- Merge automatically
- Ask user
- Don't care, almost never happens

**S3.** **Offline mode** — must-have features?

- Continue a local-LLM chat
- Queue messages to send when online
- Read past conversations
- Generate from cached responses
- Don't need offline

---

## §T. Notifications & alerts (30 sec)

**T1.** Notifications you'd want enabled by default (multi-select):

- Background task complete
- Scheduled task ran
- Dispatch task (from mobile → desktop) complete
- Computer use action requires approval
- Cap warning at 80%
- New model available
- Security alert (new sign-in)
- None — silent default

**T2.** **Desktop notification format** preference:

- Native OS notification
- In-app toast only
- Both
- Email summary

**T3.** **Mobile push** — when?

- Long task complete on desktop
- Calendar / scheduled task fires
- Dispatch completed
- Never

---

## §U. Failure modes — what would make you cancel (1 min)

**U1.** Rank these "trust killers" — what would actually cause you to churn? (1 = worst)

- App crashes during important task
- Bill larger than expected (overage surprise)
- Response quality worse than ChatGPT for similar query
- Model switched without my consent and answer was worse
- Computer use did something destructive
- Data leaked or exposed
- Performance slow (>10 sec to first token)
- Frequent rate limit hits
- Confusing UI / can't find feature
- Support unresponsive

**U2.** **First-week experience** that would make you keep using it?

- A single "wow" moment (e.g., voice paste, multi-provider switch)
- Fast onboarding and clear value
- Specific feature works flawlessly
- Better than what I'm using now in 1 obvious way
- Other (free text)

**U3.** **Cancellation flow** preference:

- One-click cancel anywhere
- Cancel with reason capture (1 click + dropdown)
- Cancel with retention offer (downgrade vs pause vs cancel)
- Cancel via email only

---

## §V. Distribution & discovery (1 min)

**V1.** Where do you discover new AI tools? (rank top 3)

- X / Twitter
- YouTube reviewers
- Reddit (r/LocalLLaMA, r/ChatGPT, r/ClaudeAI, r/SideProject)
- Hacker News
- Product Hunt
- IndieHackers
- Newsletter (Ben's Bites, TLDR AI, etc.)
- Podcast
- Friend / colleague
- App store / extension store search
- Tech blog
- LinkedIn

**V2.** **Trust signals** when evaluating a new AI app (multi-select):

- Founder presence on X / public proof of work
- Open-source code or transparent architecture
- Specific provider partnerships (Anthropic / OpenAI logos)
- User testimonials with names
- Number of users / downloads
- Press / TechCrunch / Verge mention
- GitHub stars
- Pricing transparency
- Privacy policy clarity

**V3.** **What would make you actually try it** (vs read about it and forget)?

- Free download with no signup
- 1-click install (Mac App Store / Microsoft Store / Chrome Web Store)
- Free trial of paid tier
- Sponsored content I trust
- Hands-on demo video
- A friend says "you have to try this"

**V4.** **Launch venue** preference (where would you most likely see it first)?

- Product Hunt top 5
- HN front page
- X viral thread
- YouTube review by someone you follow
- Featured in Anthropic / OpenAI ecosystem page
- Specific subreddit
- Direct from founder DM (you know them)

---

## §W. Use case ranking (30 sec)

**W1.** Rank by how often you use AI for each: coding / writing / research / analysis / image gen / data work / brainstorming / learning / personal admin / creative / customer support / sales / job search / other

**W2.** **Time of day** you use AI most: morning / midday / evening / late night / continuously

**W3.** **Session length** — typical AI session: <5 min / 5–15 min / 15–60 min / 1+ hr / continuous (always-open app)

---

## §X. Branding & naming (30 sec)

**X1.** Does the name **AGI Workforce** convey "multi-AI productivity app" to you?

- Yes clearly
- Vaguely (sounds like enterprise software)
- Confusing (what does AGI mean to a non-tech user?)
- Sounds like a competitor (which one?)
- Sounds generic

**X2.** **Color palette** — teal `#21808d` + terracotta `#da7756` accent. Reaction?

- Feels professional / friendly
- Feels generic / forgettable
- Wrong vibe for an AI tool
- Don't care about colors

**X3.** **Tagline** — pick the one closest to what you'd find compelling:

- "10+ AI providers. One app."
- "Every AI model, one subscription."
- "Your unified AI workforce."
- "All your AI, all your work, one place."
- Write your own

---

## §Y. Open-ended (3 min — the gold)

**Y1.** **If you tried AGI Workforce for 1 week, what's the single feature that would make you stay vs go back to your current tool?**

**Y2.** **What's the most annoying thing about your current AI stack** (multiple subscriptions, app switching, model limitations, etc.)?

**Y3.** **Describe an AI workflow you wish existed** that no current tool handles well.

**Y4.** **Pricing fairness gut check** — write 1 sentence on whether the $10 Hobby / $29.99 Pro / $49.99 Pro+ / $299.99 Max ladder feels honest or feels like it's missing a tier / has a weird gap.

**Y5.** **One thing I should drop from the plan** to ship faster — what feels like overreach?

**Y6.** **One thing I should add to v1** that isn't on the planned list — what gap do you see?

**Y7.** **Email for early access** (optional, only if you'd genuinely try it)

---

## How to run this (notes for you, not the respondent)

### Audience splits

Run different sections per audience to keep response time tolerable. Suggested splits:

| Audience                                                    | Target n | Sections (priority)                          |
| ----------------------------------------------------------- | -------- | -------------------------------------------- |
| **AI power users** (r/LocalLLaMA, r/ChatGPT, AI-Twitter)    | n≥50     | A, B, C, D, E, F, K, L, M, U, Y              |
| **Indie developers** (HN, IndieHackers, r/SideProject)      | n≥40     | A, B, C, E, F, M, O, V, Y                    |
| **Non-dev knowledge workers** (LinkedIn, Slack communities) | n≥30     | A, B, C, E, F1–F12, G, I, K, N, R, V, Y      |
| **Mobile-first users** (TikTok, Insta)                      | n≥20     | A, B, C1, E3, F1–F5, G, H, I, N, V           |
| **Friends & family control**                                | n≥10     | full (to baseline against AI-Twitter bubble) |

### Highest-leverage sections (cut others before these)

1. **§C (Tier choice)** — revenue thesis; if Hobby/Pro/Pro+ don't validate, model breaks
2. **§E (Surface priorities)** — tells you which 2 surfaces to polish first
3. **§F (Features)** — must-have % per feature tells you v1 scope cuts
4. **§K (Auto-routing visibility)** — affects locked "fully silent" rule
5. **§M (Provider trust)** — China-vendor comfort affects whole Pool A/B/C strategy
6. **§U (Failure modes)** — churn predictors are higher signal than purchase intent
7. **§Y (Open-ended)** — every founder interview confirms this is where real insight lives

### Run venues + estimated cost/time

- **Free, n=80+, 7 days**: Google Form posted to 4 audiences. Aim for 20 per audience.
- **Paid panel, n=20–30, 1 day, ~$200**: UserInterviews.com or Maze.co, filter "uses 2+ AI tools weekly."
- **Twitter polls, n=200+, distributed**: split into 6–8 single-question polls, post one per day for a week.
- **In-person 1:1 interviews, n=5–10, 2 weeks**: highest depth, lowest n. Use sections §B, §U, §Y verbatim.
- **Discord / Slack communities, n=30, ask first**: best for §Y open-ended objections.

### Synthesis output you'll bring back

1. Tier choice distribution (table from §C1)
2. +50% Pro premium acceptance % (§C2)
3. Top-5 must-have features (§F1–F25 "must have" counts)
4. Surface ranking with weighted ranks (§E1)
5. Auto-routing visibility preference distribution (§K1)
6. China-vendor comfort distribution (§M2)
7. Top-5 recurring objections (§B4 + §Y2 themes)
8. Top-5 switch triggers (§F26 + §Y1 themes)
9. Brand mark vote (§N7)
10. Pricing fairness sentiment (§Y4 themes)

When you bring this synthesis back, I'll lock the ~30 decisions in one sitting and we move to building from validated ground, not from gut.

### Architecture decisions riding on specific answers

- **§K1 ≥ 60% "show me the model"** → break the "fully silent" lock; add visible model badge
- **§K2 ≥ 50% want indicator on downgrade** → add status-bar chip when cap ladder hits 100%
- **§M2 < 30% comfortable with Chinese vendors** → default US/EU-routing on for all paid tiers (changes Hobby economics — may need to raise to $12 or cut features)
- **§D1 ≥ 40% Hobby manual-picker is a dealbreaker** → consider Hobby+ at $15 with manual picker, or cut Hobby and start at Pro
- **§E1 ranks mobile #5 or below for indie devs** → re-evaluate mobile-first investment for v1
- **§F4 (image editing) "must have" ≥ 50%** → image editing must land in v1, not v2
- **§F2 (duplex voice) "must have" ≥ 40%** → re-evaluate "Wispr-Flow only at v1" locked decision

### What NOT to read into the data

- Free-tier users saying "I'd pay $X" — purchase intent surveys overstate willingness by 2–3×. Discount by 50% for go/no-go.
- "Must have everything" responses — feature creep validates nothing. Look at which features get must-have AND switch-trigger mentions together.
- Brand-mark vote with n<30 — too noisy to be decisive. Treat as one data point alongside your taste.
