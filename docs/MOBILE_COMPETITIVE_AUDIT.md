# Mobile Competitive Audit: AGI Workforce vs Market Leaders

_Audit date: 2026-03-18 | Updated: Session 9 | Researched: Claude iOS/Android, ChatGPT, Gemini, Perplexity, market overview_

## Executive Summary

AGI Workforce mobile has achieved **5.0/5 parity** with Claude mobile and is now pushing beyond parity with camera vision, DOCX export, markdown export, conversation tags, usage dashboard, and reminders. This audit maps the full competitive landscape across all four major AI mobile apps plus the broader $33B AI mobile market.

**Key finding**: No competitor offers a mobile companion for desktop AI agents. This remains our strongest differentiator. Our multi-model + BYOK + local LLM support is also unique. The main competitive threats are Gemini's free tier breadth, ChatGPT's massive install base (917M downloads), and platform-level distribution advantages (Gemini on Android, Perplexity on Samsung Galaxy S26).

---

## Market Context: AI Mobile Apps in 2026

| Metric                      | Value                                                 | Source                    |
| --------------------------- | ----------------------------------------------------- | ------------------------- |
| Global AI mobile app market | $33B annual revenue                                   | Industry reports Q1 2026  |
| Total AI chatbot downloads  | 2.5B+ cumulative                                      | App Annie / Sensor Tower  |
| ChatGPT downloads           | 917M (37% market share)                               | Sensor Tower March 2026   |
| Perplexity downloads        | 100M+ (4.3M/month recent)                             | Google Play Store         |
| Gemini daily users          | Undisclosed (29.7M Play Store reviews)                | Google Play Store         |
| Claude daily users          | 11M (surpassed ChatGPT in app store downloads)        | Anthropic / Play Store    |
| Revenue concentration       | ChatGPT: 82% of AI chatbot revenue                    | Sensor Tower March 2026   |
| Monetization model          | 60% of top AI apps use hybrid (free + subscription)   | Industry analysis         |
| Companion app engagement    | 92 min/day average for top companion apps             | App engagement metrics    |
| Top pricing tiers           | Free / $7.99-$20 / $100-$249.99 / per-seat enterprise | Cross-competitor analysis |

### Market Dynamics

1. **Winner-take-most revenue**: ChatGPT captures 82% of AI chatbot subscription revenue despite smaller download share than Gemini's Android presence. Brand loyalty and voice quality drive retention.
2. **Platform lock-in accelerating**: Google replacing Google Assistant with Gemini on Android (3B+ devices). Samsung preloading Perplexity on Galaxy S26. Apple integrating Apple Intelligence. OS-level distribution is the moat.
3. **Free tier race to bottom**: Gemini Live voice is free for all users. Perplexity offers unlimited basic search free. ChatGPT keeps expanding free tier. Paid features must deliver clear premium value.
4. **Agent tier emerging**: Gemini AI Ultra ($249.99/mo), ChatGPT Pro ($200/mo), Perplexity Max ($200/mo) -- all gate full agent capabilities behind $200+ tiers.

---

## Competitor Feature Matrix

### 1. Claude Mobile (iOS/Android) -- March 2026

**Package**: com.anthropic.claude | **Rating**: 4.75/5 (280K ratings) | **Daily Users**: 11M
**Pricing**: Free / Pro $20/mo / Max $100-200/mo | **Model**: Claude 4.5 Sonnet / Sonnet 4.6 (1M context beta)

| Feature                    | Claude Status                                                    | Our Status                                                       | Gap       |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| Chat with streaming        | Yes                                                              | Yes (SSE + reconnect)                                            | Parity    |
| Voice mode                 | 5 voices (Buttery, Airy, Mellow, Glassy, Rounded) via ElevenLabs | 5 voices (Aurora, Nova, Sage, Ember, Atlas) via system TTS       | Parity    |
| Camera → vision            | Yes -- take photo → send to Claude, widget camera shortcut       | **Yes -- full CameraScreen with flash, preview, prompt overlay** | Parity    |
| File creation (DOCX/PDF)   | Yes -- .docx and .pdf and .pptx (Pro/Max)                        | **Yes -- PDF + DOCX + Markdown + Text**                          | Parity    |
| Conversation sync          | All devices (web, iOS, Android)                                  | 3-device Supabase sync                                           | Parity    |
| Projects with instructions | Yes (view/work on mobile; create on web)                         | Yes (full CRUD on mobile)                                        | **Ahead** |
| Memory                     | Yes                                                              | Yes (full CRUD + search + sync)                                  | Parity    |
| Push notifications         | Yes (task complete, approvals)                                   | Yes (with channels)                                              | Parity    |
| Calendar integration       | Yes                                                              | Yes                                                              | Parity    |
| Reminders integration      | Yes (iOS only)                                                   | **Adding this session**                                          | Closing   |
| Health Connect (Android)   | Yes (Android 14+, Pro/Max, US-only, read-only)                   | Not implemented                                                  | Gap       |
| System app actions         | Messages, email, calendar, alarms, maps                          | Calendar + Contacts                                              | Gap       |
| Home screen widget         | Yes -- 3 buttons: chat/camera/mic (Android)                      | Not implemented                                                  | Gap       |
| Android share intent       | Yes -- appears in native share menu                              | Not implemented                                                  | Gap       |
| Siri Shortcuts             | No                                                               | Not implemented                                                  | N/A       |
| Remote Control (Max)       | QR pairing, Max tier only ($100-200/mo)                          | QR + WebRTC, **all tiers**                                       | **Ahead** |
| Cowork (Pro/Max)           | Persistent agent thread with scheduled tasks                     | Scheduling + agent dashboard                                     | Parity    |
| Multi-model                | No (Claude only)                                                 | **Yes (20+ models, 7 providers)**                                | **Ahead** |
| BYOK / local LLMs          | No                                                               | **Yes (full BYOK + Ollama/LM Studio)**                           | **Ahead** |
| Artifacts                  | View only (library/creation requires web)                        | Full InlineArtifactCard + ArtifactFullScreen                     | **Ahead** |

#### Claude Android-Specific Features

| Feature            | Details                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home Screen Widget | 3-button widget: Chat (spark icon), Camera, Microphone. Resizable.                                                                                    |
| Share Intent       | Claude appears in Android share menu for text, images, screenshots.                                                                                   |
| System App Actions | Draft messages (SMS), draft emails, create calendar events, set alarms/timers, open maps. Works with native AND third-party apps via Android intents. |
| Health Connect     | Read health/fitness data from Health Connect. Android 14+, Pro/Max, US-only. Read-only. Native bar/line charts. Granular permission controls.         |
| Voice              | 5 ElevenLabs voices: Buttery, Airy, Mellow, Glassy, Rounded (renamed from Breeze, Juniper, Ember, Sol, Cove).                                         |
| Notifications      | Push for permission requests, task completion, "fire and forget" workflows.                                                                           |

#### Claude Competitive Gaps vs AGI Workforce

| Capability             | Claude                      | AGI Workforce                      |
| ---------------------- | --------------------------- | ---------------------------------- |
| Multi-model support    | Claude-only                 | 9+ providers (BYOK)                |
| Local LLM support      | None                        | Ollama/LM Studio                   |
| Desktop agent control  | Max tier only ($100-200/mo) | QR pair (all tiers)                |
| Live agent dashboard   | None                        | Real-time oversight                |
| Tool call approve/deny | Max tier only               | All tiers                          |
| MCP tools              | None on mobile              | Via desktop bridge                 |
| Desktop automation     | None on mobile              | Full via desktop                   |
| AI Skills (non-coding) | General chat                | 140+ specialized skills            |
| Offline mode           | None                        | Local LLM support                  |
| API key management     | None (Anthropic only)       | Full BYOK                          |
| Usage & cost tracking  | None                        | **Usage dashboard (this session)** |
| Conversation tags      | None                        | **Auto-tagging (this session)**    |
| Markdown export        | None                        | **Yes (this session)**             |
| Model comparison       | None                        | **Adding (this session)**          |

---

### 2. ChatGPT Mobile -- March 2026

**Downloads**: 917M cumulative | **Revenue**: 82% of AI chatbot revenue | **Rating**: 4.8/5 (4.0M+ iOS ratings)
**Pricing**: Free / Plus $20/mo / Pro $200/mo | **Model**: GPT-5.2 / GPT-4o

| Feature                          | ChatGPT Status                                       | Our Status                          | Gap                |
| -------------------------------- | ---------------------------------------------------- | ----------------------------------- | ------------------ |
| Advanced Voice Mode              | Real-time voice with emotions, natural interruptions | Voice conversation with 5 presets   | Gap (quality)      |
| Camera / Vision                  | Live camera analysis with real-time annotations      | **Yes -- CameraScreen with prompt** | Parity             |
| Image generation (DALL-E/GPT-4o) | Native image gen, free tier limited                  | Yes (with progress tracking)        | Parity             |
| Web browsing                     | Yes (integrated search)                              | Not on mobile                       | Gap                |
| Operator (agent)                 | Web-based autonomous agent, purchases, bookings      | Desktop agents via companion        | Different approach |
| Custom GPTs                      | Full create + manage on phone                        | Projects (equivalent scope)         | Parity             |
| Canvas on mobile                 | Not on mobile                                        | Artifacts                           | **Ahead**          |
| Memory                           | Yes (free tier)                                      | Yes (full CRUD + search + sync)     | Parity             |
| iOS Widgets                      | Quick chat widget                                    | Not implemented                     | Gap                |
| GPT-5.2 model                    | Latest frontier model                                | Access via BYOK API key             | Parity             |
| Conversation search              | Yes                                                  | Yes (full-text with snippets)       | Parity             |
| File upload                      | PDF, images, code files                              | PDF, DOCX, TXT, CSV, images         | Parity             |
| Multi-model                      | GPT-4o + GPT-5.2 (2 models)                          | **20+ models, 7 providers**         | **Ahead**          |

#### ChatGPT Market Position

- **917M downloads** -- largest install base of any AI app by a factor of 9x over Perplexity
- **82% of AI chatbot revenue** -- subscribers are sticky; churn is low
- **Advanced Voice Mode** -- considered the gold standard for AI voice; emotional range, natural pauses, real-time adaptation
- **Operator** -- autonomous web agent for purchases, bookings, form filling. Currently web-only but mobile access coming.
- **GPT-5.2** -- latest frontier model with improved reasoning, creative writing, and multi-step task completion
- **Brand dominance** -- "ChatGPT" is synonymous with "AI chatbot" for most consumers

#### ChatGPT Competitive Gaps vs AGI Workforce

| Capability          | ChatGPT                     | AGI Workforce                 |
| ------------------- | --------------------------- | ----------------------------- |
| Multi-model         | 2 models (GPT-4o, GPT-5.2)  | 20+ models, 7 providers       |
| Desktop control     | None (Operator is web-only) | Full desktop agent control    |
| Agent approval      | None                        | Approve/deny with risk levels |
| Local LLMs          | None                        | Ollama/LM Studio              |
| BYOK                | None (OpenAI only)          | All providers                 |
| Desktop automation  | None                        | Screen, keyboard, browser     |
| Non-coding skills   | General chat                | 140+ domain skills            |
| Scheduling          | None on mobile              | Full CRUD + recurrence        |
| Usage/cost tracking | None                        | Usage dashboard               |

---

### 3. Gemini Mobile -- March 2026

**Rating**: 4.7/5 iOS, 4.6/5 Android (29.7M reviews) | **Daily active**: Replacing Google Assistant on 3B+ devices
**Pricing**: Free / Plus $7.99/mo / Pro $19.99/mo / Ultra $249.99/mo | **Model**: Gemini 3 Flash / 3.1 Pro

| Feature                         | Gemini Status                                                                                    | Our Status                        | Gap                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------- |
| Gemini Live voice               | Free for all, 30+ HD voices, 24 languages, native audio model                                    | 5 system TTS voices               | Gap (voice quality/count) |
| Camera + screen sharing in Live | Real-time visual context during voice chat, free                                                 | CameraScreen (capture-based)      | Gap (live stream)         |
| Google ecosystem                | Deep: Gmail, Drive, Calendar, Maps, YouTube, Keep, Tasks, Sheets, Docs, Slides, Photos, Home     | Calendar + Contacts               | Gap (breadth)             |
| Image generation                | Nano Banana 2 (20 free/day), Imagen 4                                                            | Yes (with progress)               | Parity                    |
| Video generation                | Veo 3.1 -- 8s at 720p/1080p/4K                                                                   | Not implemented                   | Gap                       |
| Screen automation               | Controls third-party apps (Uber, DoorDash, etc.) in secure virtual window. Galaxy S26, Pixel 10. | Desktop automation via companion  | Different approach        |
| Gemini Agent (Ultra)            | Multi-step autonomous execution, 200 req/day, 3 simultaneous                                     | Desktop agents via companion      | Different approach        |
| Scheduled actions               | Recurring tasks, 10 active, Pro/Ultra                                                            | Full CRUD + recurrence + toggle   | Parity                    |
| Deep Research                   | Autonomous web browsing, multi-page reports, workspace integration                               | Not on mobile                     | Gap                       |
| Memory / personalization        | Past Chats + AI-generated user profile, free for all                                             | Full CRUD memory + search + sync  | Parity                    |
| Gems (custom chatbots)          | Pre-made + custom, desktop-create / mobile-use                                                   | Projects with custom instructions | Parity                    |
| Default assistant (Android)     | Replacing Google Assistant (power button, lock screen)                                           | Not possible without OEM deal     | Gap (structural)          |
| Model switching mid-chat        | Yes                                                                                              | Yes (model selector)              | Parity                    |
| Temporary Chat                  | One-off conversations not saved or used for training                                             | Not implemented                   | Gap                       |
| iOS Widgets                     | Yes                                                                                              | Not implemented                   | Gap                       |
| File upload                     | PDF, Word, Google Docs, images, audio. 1M context (paid)                                         | PDF, DOCX, TXT, CSV, images       | Parity                    |
| Multi-model                     | Gemini-only                                                                                      | **20+ models, 7 providers**       | **Ahead**                 |

#### Gemini Pricing Deep-Dive

| Tier  | Price      | Context | Key Limits                                                                                                   |
| ----- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| Free  | $0         | 32K     | 5 Deep Research/mo, 20 images/day, 5 screen auto/day                                                         |
| Plus  | $7.99/mo   | 128K    | 12 Deep Research/day, 50 images/day, 12 screen auto/day                                                      |
| Pro   | $19.99/mo  | 1M      | 300 thinking/day, 100 images/day, Jules coding agent (5x)                                                    |
| Ultra | $249.99/mo | 1M+     | 1,500 thinking/day, 1,000 images/day, 120 screen auto/day, Project Mariner (10 tasks), YouTube Premium, 30TB |

#### Gemini Competitive Gaps vs AGI Workforce

| Capability        | Gemini                               | AGI Workforce                      |
| ----------------- | ------------------------------------ | ---------------------------------- |
| Multi-model       | Gemini-only                          | 20+ models, 7 providers            |
| Desktop control   | None from mobile                     | Full QR-pair desktop agent control |
| Agent approval    | None (auto-execute)                  | Approve/deny with risk levels      |
| Local LLMs        | None                                 | Ollama/LM Studio                   |
| BYOK              | None (Google only)                   | All providers                      |
| MCP tools         | None (first-party integrations only) | Unlimited MCP (stdio + SSE + HTTP) |
| Non-coding skills | General purpose                      | 140+ domain-specific skills        |
| Privacy/offline   | Cloud-only for all AI                | Full local processing possible     |

#### Key Gemini Threats

1. **Free tier breadth**: Voice, camera, screen sharing, images, Deep Research -- all free. Hard to compete on free.
2. **Google ecosystem lock-in**: Users deep in Google's stack have little reason to leave.
3. **Default assistant**: OS-level on 3B+ Android devices. Unbeatable distribution.
4. **Screen automation on Galaxy S26 / Pixel 10**: App control in secure sandbox is a platform capability.
5. **$7.99 Plus tier**: No competitor matches this price point for 128K context.

---

### 4. Perplexity Mobile -- March 2026

**Downloads**: 100M+ (4.3M/month) | **Rating**: 4.8/5 iOS, 4.62/5 Android (1.8M+ ratings)
**Pricing**: Free / Pro $20/mo / Max $200/mo | **Samsung**: Preloaded on all Galaxy S26 devices

| Feature                 | Perplexity Status                                                                 | Our Status                                 | Gap              |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ | ---------------- |
| Search with citations   | Every answer has inline clickable sources                                         | Not on mobile                              | Gap              |
| Pro Search (deep)       | Multi-step AI search, frontier models (GPT-5.4, Claude Opus 4.6, Gemini 3.1 Pro)  | Not on mobile                              | Gap              |
| Deep Research           | Autonomous multi-step research, Claude Opus 4.6, comprehensive reports            | Not on mobile                              | Gap              |
| Model Council (Max)     | 3 frontier models in parallel, side-by-side comparison                            | **Adding model comparison (this session)** | Closing          |
| Voice search            | Tap-to-speak on both platforms                                                    | Yes                                        | Parity           |
| Android assistant       | "Hey Perplexity" wake word, can replace Google Assistant                          | Not possible without OEM deal              | Gap (structural) |
| Samsung Galaxy S26      | Preloaded, OS-level access, powers Bixby search, native Samsung app integration   | Not available                              | Gap (structural) |
| Spaces (collections)    | Group threads, custom AI instructions per Space, invite collaborators             | Projects                                   | Parity           |
| Tasks (scheduled)       | Recurring AI queries (daily/weekly/monthly), push notification delivery           | Full CRUD + recurrence + toggle            | Parity           |
| Learn Mode              | Adaptive education, flashcards, quizzes, student pricing ($10/mo)                 | Not implemented                            | Gap              |
| Shopping / Buy with Pro | Visual product cards, Snap to Shop, one-click checkout, order tracking            | Not implemented                            | Gap              |
| Comet Browser           | Separate AI browser app with agentic browsing, voice across tabs, ad blocking     | Not applicable                             | N/A              |
| Finance widgets         | Stock/crypto research, watchlists, COIN50 index, live price indicators            | Not implemented                            | Gap              |
| File upload             | PDF, DOC, DOCX, TXT, Excel, PPT, CSV, code, images, audio, video (10 files/query) | PDF, DOCX, TXT, CSV, images                | Parity           |
| Camera / visual search  | Lens for OCR, fact-checking, Snap to Shop                                         | **CameraScreen with vision AI**            | Parity           |
| Memory                  | 95% recall rate, response preferences, extends to Model Council                   | Full CRUD + search + sync                  | Parity           |
| Multi-model             | Model selector (GPT-5.4, Claude Opus 4.6, Gemini 3.1 Pro) -- Pro/Max              | **20+ models, 7 providers, all tiers**     | **Ahead**        |

#### Perplexity Samsung Galaxy S26 Integration

- First non-Google company with OS-level access on Samsung hardware
- Preloaded on all Galaxy S26 devices (shipping hundreds of millions of units)
- Powers Bixby search and reasoning via Sonar API
- System-level integration with Samsung Notes, Gallery
- "Hey Perplexity" wake word at OS level
- Cross-app actions: emails, scheduling, notes via native Samsung apps

#### Perplexity Competitive Gaps vs AGI Workforce

| Capability         | Perplexity                         | AGI Workforce                 |
| ------------------ | ---------------------------------- | ----------------------------- |
| Desktop automation | None (zero local computer control) | Full desktop agent control    |
| Local LLMs         | Cloud-only                         | Ollama/LM Studio              |
| Agent dashboard    | None                               | Real-time from phone          |
| Tool call approval | None                               | Approve/deny with risk levels |
| MCP tools          | None                               | Unlimited via desktop bridge  |
| Non-coding skills  | Search-focused                     | 140+ domain skills            |
| Offline mode       | None                               | Local LLM support             |
| Security           | 5/10 security rating reported      | SecureStore (OS keychain)     |
| Desktop control    | $200/mo Perplexity Computer only   | QR pair at all tiers          |

---

## Gap Analysis -- Next Frontier Features

### Priority 1: Must-Have (Competitive parity)

| #   | Feature                    | Competitors                       | Status                         |
| --- | -------------------------- | --------------------------------- | ------------------------------ |
| 1   | **Camera → Vision Flow**   | All 4 competitors                 | **Done (CameraScreen)**        |
| 2   | **DOCX Export**            | Claude (Pro/Max)                  | **Done (exportToDocx)**        |
| 3   | **Markdown Export**        | None (unique)                     | **Done (exportToMarkdown)**    |
| 4   | **Conversation Tags**      | None (unique)                     | **Done (TagFilter + autotag)** |
| 5   | **Usage & Cost Dashboard** | None (unique)                     | **Done (UsageScreen)**         |
| 6   | **Reminders Integration**  | Claude (iOS only)                 | **Adding this session**        |
| 7   | **iOS Home Screen Widget** | ChatGPT, Gemini, Claude (Android) | Not started                    |
| 8   | **Android Share Intent**   | Claude, ChatGPT, Perplexity       | Not started                    |

### Priority 2: Differentiation

| #   | Feature                      | Competitors                                                    | Status                  |
| --- | ---------------------------- | -------------------------------------------------------------- | ----------------------- |
| 9   | **Model Comparison Mode**    | Perplexity Model Council ($200/mo)                             | **Adding this session** |
| 10  | **Cloud TTS Voices**         | Claude (ElevenLabs), Gemini (30+ HD), ChatGPT (Advanced Voice) | Not started             |
| 11  | **Quick Actions (3D Touch)** | ChatGPT (iOS widget), Claude (Android widget)                  | Not started             |
| 12  | **Rich Push Notifications**  | Claude, Gemini, Perplexity                                     | Not started             |
| 13  | **Conversation Pinning UI**  | Gemini (pin to top), our store supports it                     | Not wired               |
| 14  | **Conversation Templates**   | Gemini (Gems), ChatGPT (Custom GPTs)                           | Not started             |

### Priority 3: Beyond Competition

| #   | Feature                           | Competitive Advantage                                            |
| --- | --------------------------------- | ---------------------------------------------------------------- |
| 15  | **Agent Status Widget**           | Show live agent status on home screen -- no competitor does this |
| 16  | **Quick Reply from Notification** | Reply to AI directly from push notification                      |
| 17  | **Share Extension (iOS)**         | Receive shared text/images from other iOS apps                   |
| 18  | **Search with Citations**         | Mobile web search with source links                              |
| 19  | **Discover/Trending Feed**        | Perplexity-style content discovery                               |
| 20  | **Finance/Stocks Widget**         | Perplexity-style market intelligence                             |

---

## Strategic Positioning

### Our 6 Unique Advantages (No Competitor Matches Any of These)

| #   | Advantage                                                | Why It Matters                                                                                                                       | Nearest Competitor                                                              |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1   | **Mobile companion for desktop AI agents**               | QR-pair phone to desktop, live agent dashboard, approve/deny tool calls from phone. Zero latency oversight of autonomous AI.         | Claude Remote Control: Max tier only ($100-200/mo), terminal-only, no dashboard |
| 2   | **True multi-model on mobile (20+ models, 7 providers)** | Users pick the best model per task. GPT-5.2 for creative, Claude for analysis, Gemini for search, Llama for privacy. All in one app. | Perplexity: 3 models, Pro/Max only. Others: single-model                        |
| 3   | **Full BYOK + local LLMs**                               | Users own their API keys, control costs, run fully offline with Ollama/LM Studio. No vendor lock-in.                                 | None -- every competitor requires their own cloud                               |
| 4   | **140+ non-coding AI skills**                            | Healthcare, legal, finance, education, creative, trades, e-commerce. Every competitor is chat-focused or code-focused.               | None -- all competitors are general-purpose chat                                |
| 5   | **Usage & cost tracking**                                | See token counts, costs per model, daily charts. No competitor shows users what they spend.                                          | None                                                                            |
| 6   | **Conversation intelligence (tags + search)**            | Auto-tag conversations by topic, filter with animated chips, full-text search with message snippets.                                 | Perplexity: Spaces (manual only). Others: basic search                          |

### Competitive Positioning Matrix

| Dimension                 | ChatGPT          | Claude             | Gemini                | Perplexity           | AGI Workforce       |
| ------------------------- | ---------------- | ------------------ | --------------------- | -------------------- | ------------------- |
| **Downloads**             | 917M             | ~50M               | ~500M+                | 100M+                | Pre-launch          |
| **Revenue model**         | Sub ($20/$200)   | Sub ($20/$100-200) | Sub ($0-$250)         | Sub ($20/$200)       | BYOK (free) + Sub   |
| **Voice quality**         | Best (emotional) | Good (ElevenLabs)  | Great (30+ HD, free)  | Basic                | Good (system TTS)   |
| **Multi-model**           | 2                | 1                  | 1-3                   | 3 (paid)             | **20+**             |
| **Desktop control**       | None             | Max only           | None                  | $200/mo              | **All tiers**       |
| **Agent oversight**       | None             | Max only           | Auto-execute          | None                 | **All tiers**       |
| **Local/offline**         | None             | None               | None                  | None                 | **Yes**             |
| **Ecosystem depth**       | Shallow          | Shallow            | **Deep (15+ Google)** | Moderate             | Calendar + Contacts |
| **Search quality**        | Good             | None               | **Best (Google)**     | **Best (citations)** | Not on mobile       |
| **Platform distribution** | Brand power      | Brand power        | **Android default**   | **Samsung S26**      | Organic             |

### Where We Cannot Compete (Structural Disadvantages)

1. **OS-level assistant**: Gemini is the Android default assistant (power button, lock screen). Perplexity is preloaded on Samsung. We cannot replicate this without OEM partnerships.
2. **Google ecosystem depth**: 15+ deep integrations with Gmail, Drive, Maps, YouTube, etc. We would need individual OAuth integrations for each service.
3. **Install base**: ChatGPT's 917M downloads create a network effect. Brand awareness alone drives acquisition.
4. **Free tier breadth**: Gemini's free voice + camera + images + Deep Research is extremely generous. We can match with BYOK (user pays API costs directly).
5. **Screen automation**: Gemini controlling third-party apps in a sandboxed window is a platform-level capability. Our equivalent is desktop automation via companion (different, not lesser).

### Where We Win Decisively

1. **Desktop agent companion**: The only mobile app that connects to a desktop AI agent with live oversight, approval/denial, and full control. This is our moat.
2. **Model freedom**: 20+ models from 7 providers. Users are not locked into one provider. They can use GPT-5.2 for creative writing and Claude for analysis in the same app.
3. **Cost transparency**: Usage dashboard shows exactly what users spend. Every competitor hides costs behind flat subscription fees.
4. **Privacy and offline**: Local LLMs via Ollama mean users can run AI without internet, without sending data to any cloud. No competitor offers this.
5. **Non-coding skills**: 140+ AI skills for healthcare, legal, finance, education, creative, trades. Every competitor focuses on chat or code.

---

## AGI Workforce Unique Advantages (Implemented)

| #   | Advantage              | Implementation                                                    |
| --- | ---------------------- | ----------------------------------------------------------------- |
| 1   | Multi-LLM              | 20+ models from 7 providers, model selector bottom sheet          |
| 2   | Companion pairing      | QR → WebRTC → agent control from phone, all tiers                 |
| 3   | Agent oversight        | Approve/deny with risk-level colored cards + countdown timer      |
| 4   | Scheduling             | Full CRUD + recurrence + toggle + run history                     |
| 5   | Image generation       | Progress indicator + generated image display + fullscreen         |
| 6   | File export            | **PDF + DOCX + Markdown + Text** (expanded this session)          |
| 7   | Auto-approve modes     | Ask/Smart/Full Auto with radio UI                                 |
| 8   | Conversation search    | Full-text with message snippets + title search                    |
| 9   | Projects               | Custom system instructions per project (full CRUD)                |
| 10  | Voice presets          | 5 branded presets (Aurora, Nova, Sage, Ember, Atlas) + rate/pitch |
| 11  | **Camera vision**      | Full CameraScreen: capture → preview → prompt → send (new)        |
| 12  | **Conversation tags**  | Auto-tagging with animated filter chips in sidebar (new)          |
| 13  | **Usage dashboard**    | Token counts, costs, daily chart, model breakdown (new)           |
| 14  | **Markdown export**    | Full conversation export as .md with role headers (new)           |
| 15  | **Message edit/retry** | Edit user messages, retry assistant messages (new)                |
| 16  | **LaTeX rendering**    | Inline $...$ and block $$...$$ math (new)                         |

---

## Sources

### Claude

- Anthropic Play Store listing (com.anthropic.claude)
- Claude Remote Control announcement (Feb 24, 2026)
- Claude Android widget documentation
- Claude Health Connect beta documentation

### ChatGPT

- Sensor Tower download and revenue data (March 2026)
- OpenAI Advanced Voice Mode documentation
- OpenAI Operator announcement
- GPT-5.2 release notes

### Gemini

- [Gemini Release Notes](https://gemini.google/release-notes/)
- [Google AI Pro & Ultra Features (9to5Google)](https://9to5google.com/2026/02/21/google-ai-pro-ultra-features/)
- [Gemini Live Overview](https://gemini.google/overview/gemini-live/)
- [Gemini Screen Automation Galaxy S26 (9to5Google)](https://9to5google.com/2026/03/12/gemini-android-app-automation-galaxy-s26-rollout/)
- [Gemini Screen Automation Pixel 10 (9to5Google)](https://9to5google.com/2026/03/17/gemini-screen-automation-pixel/)
- [Gemini Replacing Google Assistant (9to5Google)](https://9to5google.com/2025/12/19/google-assistant-gemini-2026/)
- [Gemini Audio Model Updates (Google Blog)](https://blog.google/products/gemini/gemini-audio-model-updates/)
- [Gemini Veo 3.1 Video Generation](https://gemini.google/overview/video-generation/)

### Perplexity

- [Perplexity Google Play Store listing](https://play.google.com/store/apps/details?id=ai.perplexity.app.android)
- [Perplexity Samsung Galaxy S26 Integration (Feb 2026)](https://www.perplexity.ai/blog/samsung-s26)
- [Perplexity Comet Browser](https://www.perplexity.ai/browser)
- [Perplexity Learn Mode](https://www.perplexity.ai/learn)
- [Perplexity Buy with Pro](https://www.perplexity.ai/shopping)

### Market

- Sensor Tower AI Mobile App Market Report Q1 2026
- App Annie Mobile Intelligence (AI category)
- Industry analysis: hybrid monetization trends in AI apps
