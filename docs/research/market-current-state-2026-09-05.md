# Market current state: chat, coding agents, gateways, free inference, enterprise

Status: Current
Owner: Fable (architect)
Last updated: 2026-09-05

## Method and grading

Grades: Observed (a page fetched today by this pass), Documented (official
technical or API docs fetched today), Inference (derived from a secondary
source or prior knowledge because the primary page could not be fetched),
Speculation (forward looking, not verifiable today). Model version names and
ids are omitted from prose; only product names (ChatGPT, Claude, Gemini) and
plan names (Free, Plus, Pro, Max, Team, Business, Enterprise, and so on) are
used. This session's WebSearch budget was exhausted, so every claim below
came from WebFetch on a named URL or from the lead's own live walkthrough of
chatgpt.com and claude.ai captured today.

**Access gap.** `openai.com` and `help.openai.com` returned HTTP 403 to every
fetch attempt (pricing, business, codex, release notes), and a public reader
proxy used as a fallback returned HTTP 401. `perplexity.ai` also returned 403
and timed out. Every OpenAI or Perplexity specific number below is graded
Inference for that reason, not because the claim is doubted.

## ChatGPT

| Claim                                                                                                                                                                                         | Grade                            | Source URL                            | Fetched    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------- | ---------- |
| Free plan exists with restricted usage; Plus has cost $20/month since a 2023 launch; Pro launched at $200/month in December 2024; a Go plan launched in India at a lower price in August 2025 | Inference (Wikipedia, secondary) | https://en.wikipedia.org/wiki/ChatGPT | 2026-09-05 |
| Deep research took 3 to 30 minutes per report at its February 2025 launch; current limits not verified                                                                                        | Inference (Wikipedia, dated)     | https://en.wikipedia.org/wiki/ChatGPT | 2026-09-05 |
| Codex CLI works with a ChatGPT Plus, Pro, Business, Edu, or Enterprise plan, or with an API key; ships as an open source CLI with IDE and desktop integrations                                | Documented                       | https://github.com/openai/codex       | 2026-09-05 |
| Business and Enterprise plan features, current message limits, and image/video generation limits could not be fetched this session                                                            | Inference                        | https://openai.com/business/ (403)    | 2026-09-05 |

## Claude

| Claim                                                                                                                                                                                                                                                                                                                                                                                                                                              | Grade      | Source URL                                                                      | Fetched    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- | ---------- |
| Free plan includes web search, memory, file creation with code execution, skills, and connectors                                                                                                                                                                                                                                                                                                                                                   | Observed   | https://claude.com/pricing                                                      | 2026-09-05 |
| Pro is $17/month billed annually or $20/month monthly, with at least 5x the usage of Free per five hour session; includes Claude Code, unlimited projects, Cowork, memory, skills, connectors                                                                                                                                                                                                                                                      | Observed   | https://claude.com/pricing                                                      | 2026-09-05 |
| Max starts at $100/month with a choice of 5x or 20x the usage of Pro, higher output limits, Claude Code, Cowork, projects, and early access to new features                                                                                                                                                                                                                                                                                        | Observed   | https://claude.com/pricing                                                      | 2026-09-05 |
| Team Standard seat is $20/month annual or $25/month monthly; Premium seat is $100/month annual or $125/month monthly with 5x Standard usage                                                                                                                                                                                                                                                                                                        | Observed   | https://claude.com/pricing                                                      | 2026-09-05 |
| Enterprise lists $20/seat plus usage at API rates, with spend controls, role based access, SCIM, audit logs, and a compliance API                                                                                                                                                                                                                                                                                                                  | Observed   | https://claude.com/pricing                                                      | 2026-09-05 |
| Enterprise also lists SSO/SAML, SOC 2, ISO 27001, GDPR, CCPA, a HIPAA ready offering, OpenTelemetry audit logging, and includes Claude Chat, Cowork, Code, connectors, and a security scanning product                                                                                                                                                                                                                                             | Observed   | https://claude.com/enterprise                                                   | 2026-09-05 |
| Usage runs two concurrent windows, a five hour session and a weekly cap, with a separate weekly reset schedule for the top reasoning tier versus other tiers; paid plans can view both as progress bars in Settings, and Pro/Max/Team/seat based Enterprise can enable purchasable extra usage credits                                                                                                                                             | Documented | https://support.claude.com/en/articles/9797557-usage-limit-best-practices       | 2026-09-05 |
| Usage based Enterprise has no fixed window and is billed on consumption instead                                                                                                                                                                                                                                                                                                                                                                    | Documented | https://support.claude.com/en/articles/9797557-usage-limit-best-practices       | 2026-09-05 |
| Claude Code is included on Pro, Max, Team premium seats, and Enterprise; Console (API) accounts pay standard token rates; recent additions include parallel multi agent workflows, a session-management agent view, and scheduled or event triggered routines, alongside computer use                                                                                                                                                              | Observed   | https://claude.com/product/claude-code                                          | 2026-09-05 |
| Cowork is an unattended, multi step task agent available on Pro, Max, Team, and Enterprise; it splits large jobs into parallel chunks, shows every step and tool call, and targets broad business workflows rather than only code                                                                                                                                                                                                                  | Observed   | https://claude.com/cowork                                                       | 2026-09-05 |
| Prompt cache reads cost 10% of the base input token price (2.5% on the newest top tier model); a 5 minute cache write carries a 25% premium over base input price, a 1 hour cache write a 100% premium; cache lifetime counts from request start, including generation time                                                                                                                                                                        | Documented | https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching       | 2026-09-05 |
| The Message Batches API cuts cost by 50% versus synchronous calls, with most batches finishing in under an hour                                                                                                                                                                                                                                                                                                                                    | Documented | https://platform.claude.com/docs/en/build-with-claude/batch-processing          | 2026-09-05 |
| Computer use ships as a toolset (screenshot, click, type, scroll, key, zoom, and more) run in an agent loop; it is generally available on the Claude API and Google Cloud Vertex AI with the current tool version, and still beta with an older tool version on AWS Bedrock and Microsoft Foundry; it supports batching several actions into one turn and includes automatic prompt injection classifiers that can force a human confirmation step | Documented | https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool | 2026-09-05 |

## Gemini and Google AI plans

| Claim                                                                                                                                                                                                                                                                                                                          | Grade      | Source URL                                    | Fetched    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------- | ---------- |
| Free plan ($0) includes a fast general model with varying access to a higher tier model, image generation and editing, Deep Research, a live conversational mode, a canvas workspace, custom personas, and 15 GB of cloud storage                                                                                              | Observed   | https://gemini.google/subscriptions/          | 2026-09-05 |
| AI Plus is $4.99/month with 2x Free's usage limits, video generation, a daily digest feature, 200 monthly video-credits, a notebook tool with audio overviews, early integration into mail/docs/browser, and 400 GB storage                                                                                                    | Observed   | https://gemini.google/subscriptions/          | 2026-09-05 |
| AI Pro is $19.99/month with 4x Free's usage limits, full access to the higher tier model and Deep Research, 1,000 monthly video-credits, a coding agent with higher limits, entry level access to an agentic dev environment, and 5 TB storage                                                                                 | Observed   | https://gemini.google/subscriptions/          | 2026-09-05 |
| AI Ultra is $99.99/month (5x Pro's limits) or $199.99/month (20x Pro's limits), with first access to advanced features, 10,000 to 25,000 monthly video-credits, the coding agent's highest limits, and 20 TB or more of storage                                                                                                | Observed   | https://gemini.google/subscriptions/          | 2026-09-05 |
| The Gemini API free tier uses prompts to improve Google's products by default; the paid tier's default is that content is not used to improve models; context caching and a 50% Batch API discount are paid-tier only                                                                                                          | Documented | https://ai.google.dev/gemini-api/docs/pricing | 2026-09-05 |
| Gemini is bundled starting at Google Workspace Business Standard, $14/user/month annual; higher Workspace tiers include more Gemini capability; enterprise data is stated as not used for model training or ads, with DLP, information rights management, client side encryption, and residency/sovereignty controls available | Observed   | https://workspace.google.com/solutions/ai/    | 2026-09-05 |

## Coding agents

| Claim                                                                                                                                                                                                                                                                                                                                                                                             | Grade    | Source URL                                | Fetched    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------- | ---------- |
| Cursor: Hobby is free with limited agent requests; Pro and Pro+ are $20/month with Pro+ giving 3x Pro's agent limit; Ultra is $20/month base with 20x Pro's agent limit; Teams Standard and Premium are $40/user/month, Premium giving 5x Standard's agent limit and SSO; Enterprise is custom with pooled usage and SCIM. Every plan includes a fixed amount of model usage, then meters overage | Observed | https://cursor.com/pricing                | 2026-09-05 |
| GitHub Copilot: Free is $0 with 2,000 completions and 50 chat requests/month; Pro is $10/month/user with a $15 monthly credit allotment; Pro+ is $39/month/user with a $70 allotment and audit logs; Max is $100/month/user with a $200 allotment and priority access; Business and Enterprise are custom with policy controls, IP indemnity, and codebase indexing on Enterprise                 | Observed | https://github.com/features/copilot/plans | 2026-09-05 |
| Claude Code and Codex plan inclusion: see Claude and ChatGPT sections above                                                                                                                                                                                                                                                                                                                       | n/a      | n/a                                       | 2026-09-05 |

## Gateways

| Claim                                                                                                                                                                                                                                                                                                                                                  | Grade      | Source URL                                    | Fetched    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------- | ---------- |
| OpenRouter auto-selects a cost effective route per request, offers a "latest" alias that tracks the newest flagship model without a redeploy, handles cross-provider fallback automatically, lists free rate-limited models, and is a drop in replacement for the OpenAI SDK; the fetched page did not state its caching or zero retention terms       | Documented | https://openrouter.ai/docs/quickstart         | 2026-09-05 |
| Vercel AI Gateway gives one API key across hundreds of models, retries automatically to another provider on failure, applies no markup on token price including with a customer's own provider keys, monitors spend, supports embeddings, and offers an explicit control to disallow prompt training                                                   | Documented | https://vercel.com/docs/ai-gateway            | 2026-09-05 |
| Cloudflare AI Gateway is available on every Cloudflare plan; it caches responses to cut cost and latency, supports configurable retry and model fallback on error, and adds rate limiting and logging; the fetched page did not specify a zero retention or no-log option                                                                              | Documented | https://developers.cloudflare.com/ai-gateway/ | 2026-09-05 |
| Portkey: an open source self-hosted tier is free; a hosted Developer tier is free forever (10k logs/month, 3 day retention, 1 day cache); Production is $49/month (100k logged requests, $9 per extra 100k, semantic caching with unlimited TTL); Enterprise is custom (10M+ logs, custom retention, SSO, private cloud/VPC hosting, SOC 2/GDPR/HIPAA) | Observed   | https://portkey.ai/pricing                    | 2026-09-05 |
| LiteLLM's core library (100+ providers behind one interface) is open source and free; a paid enterprise tier adds SSO/SAML, audit logs, spend tracking, and guardrails; built in retry, fallback, and load balancing are in the open source core, and the self-hosted proxy adds per-key/team/user budgets with centralized caching                    | Documented | https://docs.litellm.ai/docs/                 | 2026-09-05 |

## Free and discounted inference

| Claim                                                                                                                                                                                                                                                                            | Grade      | Source URL                                | Fetched    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------- | ---------- |
| Groq's free tier caps most text models near 30 requests/minute and 1,000/day, with 8K tokens/minute and 200K tokens/day; speech-to-text is capped near 7,200 audio seconds/hour; a paid Developer plan raises these; the fetched page did not state a commercial-use restriction | Documented | https://console.groq.com/docs/rate-limits | 2026-09-05 |
| Gemini API and Anthropic caching/batch terms: see Gemini and Claude sections above                                                                                                                                                                                               | n/a        | n/a                                       | 2026-09-05 |
| Ollama's local inference is free indefinitely with no telemetry of local prompts; a paid Pro cloud tier is $20/month including $60 of cloud usage capped at $300/month; local and cloud inference for open models are both offered from the same client                          | Observed   | https://ollama.com/                       | 2026-09-05 |
| Other open-model hosts (Together AI, Fireworks, and similar) were not fetched this session; their current pricing and terms are unverified here                                                                                                                                  | Inference  | none                                      | 2026-09-05 |

## Enterprise AI platforms

| Claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Grade    | Source URL                                                                             | Fetched                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- | ---------------------------------- |
| Claude Enterprise and ChatGPT Enterprise/Business: see sections above; ChatGPT Enterprise/Business admin detail could not be fetched this session                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | n/a      | n/a                                                                                    | 2026-09-05                         |
| Microsoft 365 Copilot has three tiers: Copilot Chat (Basic), included with eligible Microsoft 365 licenses, web-data grounded only unless content is pasted or uploaded; Microsoft 365 Copilot (Basic), standard in-app access to the office apps without automatic organizational-data grounding; Microsoft 365 Copilot (Premium), an add-on license with priority access, automatic grounding in organizational data and an internal "Work IQ" reasoning layer, a unified search experience, SharePoint content-exposure controls, a data-loss-prevention and labeling layer, custom agent creation, and access to a "Cowork" style cross-app task agent billed on usage | Observed | https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-overview | 2026-09-05 (page dated 2026-09-02) |
| Model selection in Copilot is presented as Auto plus two named modes, a fast mode for routine questions and a slower reasoning mode for complex ones; Microsoft states these update as new models become available and discloses that a third party model vendor is available as a subprocessor in some licensed experiences                                                                                                                                                                                                                                                                                                                                               | Observed | https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-overview | 2026-09-05                         |
| EU traffic is kept inside an EU data boundary; worldwide traffic can route to other regions including the EU when capacity requires it. Admin governance runs through a control system covering agent creation, web-search grounding, image generation, and Copilot access removal, plus a scoped AI Administrator role                                                                                                                                                                                                                                                                                                                                                    | Observed | https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-overview | 2026-09-05                         |
| Google Workspace with Gemini: see Gemini section above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | n/a      | n/a                                                                                    | 2026-09-05                         |

## Product UX, from a live walkthrough of chatgpt.com and claude.ai

Source for this section: the lead's live walkthrough capture of 2026-09-05,
held outside the repository. Grade: Observed (a person drove both live
products today; no URL applies to an internal capture).

- **Model choice.** ChatGPT exposes a single "Thinking effort" control as a
  slider in a popover with a lock icon, implying it gates by plan; the model
  itself is not separately named in the composer. Claude's composer carries a
  model button that opens a short list of models with one line taglines, an
  effort row defaulted to Off, and a "more models" expander.
- **Usage communication.** Both products put usage inside Settings. ChatGPT
  shows five hour and weekly limit bars with reset countdowns plus a
  separate Analytics page with 7 and 30 day toggles. Claude shows session and
  weekly bars with resets, a "boost" notice, and a toggle for purchasing
  extra usage credits.
- **Fallback behavior.** Neither product's own settings or in-conversation
  copy, as captured in the walkthrough, states what model it silently falls
  back to when a preferred one is unavailable; this remains unverified from
  the UI alone.
- **Cross-device continuity.** Not directly evidenced in this walkthrough;
  Claude's Cowork settings expose "trusted devices" and an "only on your
  computer" preference, which implies device-scoped behavior for that
  feature specifically, but general chat-history continuity across devices
  was not tested.
- **Tools and modes relative to models.** ChatGPT's Chat/Work segmented
  control changes the entire home shell: headline copy, composer
  placeholder, and the suggestion pills underneath, and Work adds a visible
  pill row for projects, files, and connected apps. Claude's Chat/Cowork
  control instead lives inside the composer alone and leaves the rest of the
  shell (sidebar, header) unchanged; Cowork sessions add an autonomy label
  ("Auto") and a right side dock for progress, outputs, and context.

## Computer use, desktop, and dictation

| Claim                                                                                                                                                                                                                                                                                                                                                                                                                    | Grade                                                                                  | Source URL                                                                     | Fetched    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| OSWorld evaluates agents on 369 (361 excluding a known-bad subset) real desktop tasks across three operating systems, scored by 134 execution-based checking functions, comparing screenshot-only, accessibility-tree, and combined input modes                                                                                                                                                                          | Documented                                                                             | http://osworld-v1.xlang.ai/                                                    | 2026-09-05 |
| The benchmark's original published baseline reported humans completing over 72% of tasks against a best-model figure near 12%; the live leaderboard's current standings did not render in this session's fetch (client-side loading), so any specific present-day top score is unverified here                                                                                                                           | Inference (methodology documented, current standings unverified)                       | http://osworld-v1.xlang.ai/                                                    | 2026-09-05 |
| Anthropic's computer use tool: see Claude section above                                                                                                                                                                                                                                                                                                                                                                  | n/a                                                                                    | n/a                                                                            | 2026-09-05 |
| Wispr Flow produces a cleaned final transcript rather than a literal one, dropping false starts and filler words, applies context aware formatting such as lists and email structure, learns a personal dictionary of names and jargon, and inserts into any text field system-wide without per-app plugins; the fetched page did not state a macOS-specific global shortcut or the accessibility permission it requires | Observed (page fetched; the shortcut/permission detail is simply absent from the page) | https://wisprflow.ai/                                                          | 2026-09-05 |
| A macOS system-wide single-key or hotkey listener is normally built on a global event monitor or a lower-level event tap, both of which require the user to grant Input Monitoring, and often Accessibility, permission in System Settings; without that grant such a listener fails without a visible error to the user                                                                                                 | Inference (Apple's own reference page did not return usable content this session)      | https://developer.apple.com/documentation/appkit/nsevent/specialkey            | 2026-09-05 |
| ChatGPT and Claude desktop apps: ChatGPT's Work mode surfaces an explicit "Open desktop app" link; Claude's settings expose Cowork specific device controls ("only on your computer," a preferred browser selector, trusted devices) and a separate Chrome extension permission panel                                                                                                                                    | Observed (lead's walkthrough)                                                          | the lead's live walkthrough capture of 2026-09-05, held outside the repository | 2026-09-05 |

## Implications for AGI Workforce

- Both leading chat products now bundle what used to be premium-only
  capability into their first paid tier. Claude Pro, at $17 to $20 a month,
  already includes a coding agent, unlimited projects, and an unattended
  work agent. Source: claude.com/pricing and claude.com/product/claude-code,
  fetched today.
- Anthropic's usage system runs two concurrent windows (a five hour session
  and a weekly cap), with the weekly cap split differently for its top
  reasoning tier than for the rest, and it exposes a purchasable top-up
  directly to the user. Source: support.claude.com, fetched today.
- Coding-agent subscriptions have converged on a dollar-denominated included
  credit allotment plus metered overage, rather than a flat request count.
  Both Cursor and GitHub Copilot use this shape at every paid tier. Source:
  cursor.com/pricing and github.com/features/copilot/plans, fetched today.
- Every gateway checked (OpenRouter, Vercel AI Gateway, Cloudflare AI
  Gateway, Portkey, LiteLLM) treats automatic cross-provider fallback and
  retry as a baseline feature available on its free or lowest tier, not a
  premium add-on. Source: each vendor's own docs, fetched today.
- Anthropic's prompt caching and batch discounts are large and specific:
  cache reads at 10% of input price, batch jobs at 50% off with sub-hour
  turnaround. The same figures could not be reconfirmed for OpenAI this
  session because openai.com and help.openai.com blocked every fetch
  attempt; that gap should be closed on the next research pass rather than
  assumed to match Anthropic's numbers.
- Free tiers on both the Gemini API and Groq explicitly withhold the
  cost-saving features (prompt caching, and for Gemini, an opt-out from
  using content to improve the model) from unpaid usage, reserving them for
  paid tiers. Source: ai.google.dev and console.groq.com, fetched today.
- Enterprise seat pricing across vendors is closer together than the sticker
  prices suggest once usage is added: Claude Enterprise lists $20 per seat
  plus consumption at API rates, Google Workspace's Gemini-inclusive tier
  starts at $14 per user per month, and Microsoft's premium Copilot layer
  sits on top of a Microsoft 365 seat with its cross-app task agent billed
  separately on usage. Source: each vendor's own page, fetched today.
- The two leading products differ structurally, not just cosmetically, in
  how they present an autonomous "do the work" mode next to plain chat.
  ChatGPT's toggle changes the whole home shell; Claude's toggle is a small
  composer control that leaves the shell untouched. This is an observed
  structural fact from today's walkthrough, not a preference judgment.
  See docs/research/claude-ai-ui-reference-2026-09-03.md and
  docs/research/leader-ui-reference-2026-09-04.md for the earlier UI passes
  this extends.
- Anthropic's computer use tool is generally available only on Anthropic's
  own API and on Google Cloud Vertex AI; the identical capability is still
  beta, on an older tool version, on AWS Bedrock and Microsoft Foundry. That
  is a documented, current platform-parity gap, not a rumor. Source:
  platform.claude.com, fetched today.
- OSWorld's own leaderboard page did not render a current score in this
  session's fetch; any "current OSWorld score" cited elsewhere in this
  repository should be treated as unverified until re-fetched with a tool
  that executes the page's client-side rendering.
- A material share of the ChatGPT-side facts this brief was asked to cover
  (Business/Enterprise admin detail, current usage-window sizes, deep
  research limits, image and video generation limits) could not be
  independently verified this session. openai.com and help.openai.com
  returned HTTP 403 to every attempt, and a public reader-proxy fallback
  returned HTTP 401. This is a standing research gap to close next, not a
  claim about OpenAI's actual limits.
