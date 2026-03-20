# Mobile Product & Technical Specification

## 1. Mission

The mobile app should be the AGI Workforce companion: fast, always available, mobile-native, and optimized for chat, voice, approvals, notifications, and lightweight control while the user is away from desktop.

## 2. Users and jobs-to-be-done

### Primary users

- existing AGI Workforce users away from their computer
- users who want fast mobile chat and voice access
- users who need to monitor agents, schedules, and approvals on the go

### Jobs-to-be-done

- continue conversations from another surface
- talk to the system by voice or text
- review running agents and approve actions
- stay aware through push notifications and background sync
- capture or share mobile-native context into AGI Workforce

## 3. Scope and feature ownership

### Mobile owns

- mobile chat UX
- voice-first interaction
- mobile-native notifications and background refresh
- companion pairing and mobile visibility into desktop state
- lightweight approvals and remote control

### Mobile does not own

- the primary local execution engine
- large-scale local automation
- heavy desktop tooling UX
- full IDE or file-editing workflows

## 4. Feature set

### Core navigation and surfaces

- bottom-tab navigation
- home tab
- chat tab and full conversation screen
- projects tab
- agents tab and agent detail views
- settings tab
- supporting stack screens for companion, schedules, messaging, profile, and feedback

### Chat features

- conversation list
- new chat creation
- model selection
- attachments and uploads
- search and tags
- full chat conversation screens
- cross-surface sync with hosted state

### Agent and companion features

- live agent grid
- pending approvals
- desktop connection status
- manual refresh of agent state
- QR/deep-link pairing into companion flows

### Mobile-native features

- voice conversation
- camera and image capture
- push notifications
- background fetch
- deep links and share intents
- biometric gate

### Productivity features

- schedules
- messaging
- file creation and sharing
- optional device integrations such as health/calendar where appropriate

## 5. Competitive benchmark lens

Mobile AI is no longer a nice-to-have companion — it is the primary surface for 110M mobile-only AI users in the US alone, and the mobile AI app market is projected to reach $435.9B by 2034. Every major competitor now treats mobile as a first-class agent platform, not a chat wrapper. AGI Workforce mobile must close parity gaps while defending its unique differentiators.

### Claude Dispatch (PRIMARY THREAT)

Launched March 17, 2026 as a research preview for Max subscribers (Pro coming soon). Dispatch introduces persistent cross-device conversation threads between Claude mobile and Claude Desktop via QR code pairing. Users send tasks from their phone, and the desktop executes them with full file access, connectors, and sandbox capabilities. This directly competes with our QR pairing differentiator.

Current limitations work in our favor: MacStories reports approximately 50% reliability, it requires the Mac to be awake with Claude Desktop open, it is restricted to Cowork-enabled accounts, and it offers only a single conversation thread — not a multi-agent control plane.

Our response: AGI Workforce companion is production-grade with a full agent dashboard, multi-agent monitoring, approval workflows, push notifications, and schedule management. Dispatch is a single conversation thread; we offer a full agent control plane with real-time execution streaming. However, if Anthropic hardens Dispatch reliability from 50% to 90%+, our differentiation narrows significantly. Dispatch defense is the top mobile priority.

- Claude Dispatch: `https://support.claude.com/en/articles/13947068-assign-tasks-to-claude-from-anywhere-in-cowork`

### ChatGPT Mobile (900M WAU)

ChatGPT remains the volume leader with 900 million weekly active users. Recent capabilities that set the pace for mobile AI:

- ChatGPT Agent: autonomous web browsing, form filling, and booking actions executed on behalf of the user.
- Instant Checkout via Agentic Commerce Protocol + Stripe: users can buy from Etsy, Shopify, and other merchants directly inside ChatGPT without leaving the app.
- ChatGPT Go tier at $8/mo across 171 countries, undercutting the market and establishing a low-cost global entry point.
- Projects as living knowledge bases that span web, iOS, and Android, reinforcing cross-surface continuity for long-running workspaces.
- Advanced Voice Mode with real-time camera and video input — voice and vision are default capabilities, not optional add-ons.
- GPT-5.4 with 1M context window backing all mobile interactions.
- Ads on Free and Go tiers, signaling a consumer-scale monetization strategy AGI Workforce does not need to follow but must account for in pricing positioning.

AGI mobile should preserve cross-surface continuity for projects and conversations, treat voice and camera as first-class capabilities, and surface tasks and notifications cleanly without pretending the phone is the best place to manage everything.

- Download ChatGPT: `https://chatgpt.com/download`

### Gemini Mobile (replacing Google Assistant)

Gemini is not just a chat app — it is becoming the default system-level AI on Android, replacing Google Assistant across the Galaxy S26 and Pixel 10 lines.

- Screen Automation: Gemini autonomously operates third-party apps (DoorDash, Uber, Starbucks, Instacart) in a "secure virtual window" where the user retains checkout control. This is the most aggressive mobile agent capability shipping today.
- Personal Intelligence: connects Gmail, Photos, YouTube, and other Google services to provide proactive, personalized assistance — free for all users as of March 17, 2026.
- Scam detection on calls and texts, leveraging on-device models for real-time protection.
- Deep Think reasoning mode for complex multi-step problems.
- Galaxy S26 pre-installation gives Gemini massive distribution without requiring users to seek it out.

AGI mobile cannot match Google’s system-level integration, but it can compete on multi-model flexibility, agent depth, and privacy (BYOK + local LLMs).

- Gemini blog: `https://blog.google/products-and-products/products/gemini/gemini-drop-february-2026/`

### Perplexity Mobile

Perplexity is expanding from search into a full mobile AI platform:

- Comet browser launched free on iOS (March 18, 2026), combining AI-native browsing with agentic capabilities.
- Voice mode for conversational search and task execution.
- Agentic commerce: ordering, booking, and comparing products within the AI browser.
- Model Council: runs 3 models simultaneously for higher-quality answers.
- Perplexity Computer: orchestrates up to 19 models for complex tasks.
- Memory Engine achieving 95% recall across conversations.
- Samsung Galaxy S26 pre-installed ("Hey Perplexity"), giving Perplexity the same distribution advantage as Gemini.

AGI mobile’s multi-model routing (9+ providers) is architecturally similar to Model Council/Perplexity Computer, but we must make this advantage visible and usable on the mobile surface.

- Perplexity Comet: `https://www.perplexity.ai/comet`

### Other notable competitors

- DeepSeek: 131.5M MAU, free, 1M context window — a significant value competitor in markets where price sensitivity dominates.
- Microsoft Copilot: voice integration in Outlook mobile, positioning AI as an enterprise productivity layer rather than a standalone app.

### Implications for AGI Workforce mobile

The competitive landscape demands that AGI mobile stop being a lightweight companion and start being a genuine agent control plane. Voice, vision, and cross-device orchestration are table stakes. Commerce and on-device AI are the next battlegrounds. Our multi-model routing, full agent dashboard, and approval workflows remain genuine differentiators — but only if they work reliably and feel native on mobile.

## 6. End-to-end flows

### Flow A: login and enter the app

1. Root layout initializes encrypted MMKV and auth state.
2. If the user is not authenticated, they are routed to auth.
3. If onboarding is incomplete, they are routed to onboarding.
4. On authenticated entry, the app starts realtime sync, background fetch, and notification listeners.
5. User lands in the authenticated stack and tabs.

### Flow B: create and continue a chat

1. User enters text or voice input in the chat tab.
2. A conversation is created if needed.
3. The selected model is used for the request.
4. Messages stream and persist locally.
5. Realtime subscriptions keep conversations and messages in sync with other surfaces.

### Flow C: review agents and approvals

1. User opens Agents tab.
2. Agent cards load from companion/connection state.
3. Pending approvals surface prominently.
4. User opens a specific agent or returns to desktop context through pairing/connection flows.

### Flow D: pair from a deep link or shared context

1. App receives a deep link or share intent.
2. Routing layer extracts pairing code or shared content.
3. App navigates directly into the right workflow.
4. Chat or companion state is created automatically where possible.

## 7. UI, look, and layout

### Visual model

Mobile should feel like a focused dark-mode companion with strong contrast, clean spacing, and thumb-friendly interaction targets.

### Layout model

- bottom tabs for frequent destinations
- stacked drill-down flows on top of tabs
- bottom sheets for auxiliary choices such as model selection or sidebars
- full-screen overlays for voice or other immersive interactions

### Look and feel rules

- prioritize fast reachability and one-handed use
- minimize dense desktop-style sidebars
- prefer cards, sheets, and simple headers
- loading and error states should be calm and explicit

## 8. UI components

### Key components visible in the codebase

- `ChatInput`
- `ConversationList`
- `SearchBar`
- `TagFilter`
- `ModelPickerSheet`
- `VoiceConversationScreen`
- `SidebarContent`
- `AgentCard`
- `ConnectionStatusBar`
- shared UI primitives under `components/ui`

### Component rules

- input surfaces should always make send/model/voice actions obvious
- lists should use virtualization for scale
- approval and status cards must be scannable at a glance
- sheets and overlays should never hide critical navigation state

## 9. Frontend architecture

### Runtime

- Expo Router
- React Native
- NativeWind/styles
- Zustand stores
- encrypted MMKV persistence

### Frontend responsibilities

- route users through auth/onboarding/app stacks
- render chat, agent, schedule, and settings surfaces
- manage bottom sheets, overlays, and native navigation
- coordinate local cache and optimistic state

### Frontend structure

- `apps/mobile/app/*`
- `apps/mobile/components/*`
- `apps/mobile/hooks/*`
- `apps/mobile/stores/*`

## 10. Backend/runtime architecture

### Backend responsibilities for mobile

- authenticated API access to hosted AGI endpoints
- Supabase auth and realtime
- background sync
- companion transport to desktop
- offline queue and retry support

### Key modules

- `apps/mobile/services/api.ts`
- `apps/mobile/services/realtime.ts`
- `apps/mobile/services/conversationSync.ts`
- `apps/mobile/services/companion.ts`
- `apps/mobile/services/offlineQueue.ts`

### Runtime rule

Heavy execution should remain hosted or desktop-backed. Mobile should orchestrate and observe, not become the heavyweight executor.

## 11. LM architecture

### Model behavior

- mobile should expose a clear model picker
- selected model should persist predictably
- most inference should run through hosted APIs or paired desktop capabilities
- on-device inference should not become a hidden dependency

### Context behavior

- current conversation and recent messages are primary context
- attachments, captured media, and shared text should flow in naturally
- mobile should preserve continuity with cross-surface chat state

### Voice behavior

- speech-to-text and TTS should feel instant enough for mobile usage
- voice mode should be a first-class interaction, not a demo feature

## 12. API architecture

### API rules

- all requests should carry auth automatically
- 401 handling should attempt refresh once, then fail clearly
- uploads should use multipart and avoid brittle client-set headers
- timeouts must exist for mobile networks

### Primary API patterns visible in the codebase

- authenticated JSON requests
- upload API
- conversation tagging
- realtime subscriptions for conversations and messages

## 13. Tool architecture

### Mobile tools should focus on mobile strengths

- voice
- camera/photo capture
- notifications
- background fetch
- file share/import/export
- schedules and reminders
- messaging
- pairing and remote approvals

### Tool rules

- tools must justify their presence on a phone
- no tool should assume a desktop-sized interaction model
- device permissions must be explicit and reversible

## 14. Data, state, and sync

### Required state

- auth session
- chat conversations and messages
- selected model
- connection and pairing state
- agent and approval state
- schedules, settings, and notifications

### Sync rules

- use realtime where immediate continuity matters
- use background sync for eventual consistency
- preserve useful local state during transient network failures

## 15. Security and privacy

- encrypted local storage
- biometric gate for sensitive access
- refresh-token handling without breaking companion pairing unnecessarily
- device permissions must be scoped and transparent
- uploads and notifications should avoid leaking sensitive content by default

## 16. Performance and reliability

- app startup should front-load auth and routing only
- chat and agent lists should remain smooth with virtualization
- mobile network and background constraints must be treated as default conditions
- degraded behavior should be graceful when realtime or companion links are down

## 17. Observability, testing, and release gates

### Testing expectations

- auth and storage tests
- chat store tests
- conversation grouping/search tests
- smoke tests for navigation
- notification and background behavior validation

### Release gates

- auth and onboarding are stable
- chat create/send/open flows work
- realtime sync works
- pairing and deep links work
- push notifications and background fetch do not regress app stability

## 18. Definition of done

Mobile is in the right state when:

- it is the best AGI Workforce surface for on-the-go use
- cross-surface continuity feels natural
- approvals and notifications are dependable
- voice and capture feel genuinely useful
- it stays companion-first instead of chasing desktop parity

## 19. Canonical implementation anchors

- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/(app)/_layout.tsx`
- `apps/mobile/app/(app)/(tabs)/chat.tsx`
- `apps/mobile/app/(app)/(tabs)/agents.tsx`
- `apps/mobile/services/api.ts`
- `apps/mobile/services/realtime.ts`

## 20. Screen inventory

### Root and lifecycle screens

- auth stack
- onboarding
- authenticated app stack

### Main tab screens

- home
- chat
- projects
- agents
- settings

### Secondary stack screens

- conversation detail
- agent detail
- companion
- profile
- schedules
- integrations
- memory settings
- messaging
- feedback
- camera and widget setup where applicable

## 21. Component and service inventory

### Component inventory

- chat input and conversation list
- search and tag filter
- model picker sheet
- voice conversation overlay
- sidebar content
- agent cards
- connection status surfaces
- shared UI primitives

### Service inventory

- authenticated API client
- realtime sync
- conversation sync
- notifications
- background fetch
- voice and TTS
- model catalog
- schedules and messaging
- device integrations

## 22. API and tool inventory

### API inventory

- authenticated GET/POST/PUT/DELETE flows
- file upload
- conversation tagging
- Supabase realtime channels
- auth refresh flow

### Tool inventory

- voice capture and playback
- camera and file import/export
- notifications
- background tasks
- deep links and share intents
- companion pairing

## 23. Phased roadmap

### Phase 1: Dispatch defense

The immediate priority is hardening our cross-device story before Claude Dispatch matures past its current 50% reliability.

- harden QR pairing reliability to 99%+ success rate (currently our strongest differentiator, must be unassailable)
- add persistent cross-device conversation threads — send a task from any device, pick it up on any other
- expand agent dashboard to show file results, task outputs, and execution artifacts from desktop
- add real-time execution streaming so users can watch what the agent is doing on desktop from their phone
- tighten offline queue with exponential backoff and eventual consistency via background sync
- improve reconnection clarity when desktop goes to sleep or network drops

### Phase 2: on-device AI integration

On-device inference is the next competitive moat — privacy, speed, and offline capability.

- integrate Apple Foundation Models on iOS 26+ (approximately 3B parameter on-device model, Swift-native, works offline, no app size increase)
- integrate Gemini Nano on Android via AICore system service and ML Kit GenAI APIs (summarization, proofreading, rewriting, image description)
- evaluate React Native ExecuTorch for cross-platform on-device inference (Qwen 3, Llama 3.2, Whisper, CLIP)
- target 80% of routine inference running locally, 90% cost reduction vs cloud for qualifying tasks
- offline AI capabilities: basic chat, summarization, and voice transcription without network

### Phase 3: mobile commerce and actions

Follow ChatGPT and Gemini into mobile-native task execution beyond monitoring.

- agentic commerce patterns: research, compare, and purchase with appropriate safety confirmations (never auto-confirm purchases)
- app automation inspired by Gemini Screen Automation — mobile-native task execution for common apps
- mobile-specific commerce patterns distinct from desktop commerce (thumb-friendly approval flows, quick-glance comparison cards)
- integrate with existing approval workflow infrastructure for purchase confirmations

### Phase 4: proactive intelligence

Move from reactive chat to anticipatory assistance.

- Personal Intelligence patterns: integrate with user-authorized data sources (email, calendar, photos) for context-aware suggestions
- push-based insights: surface relevant notifications without requiring explicit user queries
- anticipatory assistance: predict user needs based on time, location, and behavioral patterns
- schedule-aware agent triggering: agents that activate based on calendar events, location changes, or time-of-day patterns

## 24. Gap analysis

### vs Claude Dispatch

Dispatch offers persistent cross-device threads with a simple QR pairing flow. We counter with a full agent dashboard, multi-agent monitoring, approval workflows, push notifications, and schedule management — a full agent control plane vs their single conversation thread. However, their QR pairing is simpler (fewer steps, less configuration). **THREAT**: if Dispatch reliability improves from its current approximately 50% to 90%+, our main cross-device differentiator narrows considerably. Their simplicity becomes an advantage when reliability is no longer the bottleneck. We must ensure our richer feature set justifies the additional complexity.

### vs ChatGPT

- Commerce and checkout: ChatGPT has Instant Checkout via Agentic Commerce Protocol + Stripe. We have no mobile commerce capability.
- Scale: 900M WAU creates network effects and data advantages we cannot match directly. Compete on depth and flexibility instead.
- Projects as workspaces: ChatGPT Projects span all surfaces with living knowledge bases. Our cross-surface project continuity is lighter than ideal.
- Advanced Voice with real-time vision: ChatGPT's voice mode accepts live camera and video input. Our voice mode is audio-only.
- Go tier at $8/mo: undercuts the market globally across 171 countries. Our pricing must account for this low-cost entry point.

### vs Gemini

- Screen Automation: Gemini autonomously operates third-party apps (DoorDash, Uber, Starbucks) in a secure virtual window. We have no equivalent mobile app automation.
- Personal Intelligence: deep Google ecosystem integration (Gmail, Photos, YouTube) provides contextual awareness we cannot replicate without explicit user-authorized integrations.
- Scam detection: on-device real-time call and text protection. Not in our scope but raises user expectations for mobile AI safety.
- Galaxy S26 pre-installation: massive distribution advantage. We must earn every install through product quality and word of mouth.

### vs Perplexity

- Multi-model orchestration: Perplexity Computer orchestrates 19 models. Our 9+ provider routing is architecturally comparable but not yet exposed as a visible mobile feature.
- Comet browser: free AI-native browser on iOS. We have no mobile browsing surface.
- Voice mode and agentic commerce: Perplexity combines voice, search, and commerce in a single flow. Our voice mode is isolated from agent actions.
- Galaxy S26 pre-installation: same distribution advantage as Gemini.

## 25. Feature acceptance criteria

| Feature | Acceptance criteria |
| --- | --- |
| Auth and onboarding | App initializes encrypted storage correctly, routes unauthenticated users to auth, routes new users through onboarding, and reaches the app shell without dead ends. |
| Chat experience | User can browse conversations, create a new conversation, send text or attachments, open full chat detail, and keep cross-surface state in sync. |
| Model selection | User can inspect and change the active model from mobile-appropriate UI, and the selection affects subsequent requests predictably. |
| Voice mode | Voice entry is easy to discover, starts quickly, and supports a reliable send/respond loop. |
| Agent monitoring | Agents tab shows active state, pending approvals, and connection state in a way that is useful at a glance. |
| Companion pairing | Deep links, QR pairing, and companion entry flows route users into the correct screen and preserve connection state cleanly. |
| Notifications and background sync | Push notifications and background fetch wake the user appropriately without destabilizing the app or duplicating state. |
| Offline and degraded behavior | Temporary network failures degrade gracefully; auth refresh, sync, and realtime failures surface clearly without forcing app reinstall-level recovery. |
| Device-native capabilities | Camera/share/deep link/device interactions work behind explicit permissions and feel purposeful rather than bolted on. |
| Cross-device orchestration | User can send a task from phone, desktop executes it, and results stream back to mobile in real-time with greater than 95% reliability. Persistent cross-device threads maintain state across sessions and network interruptions. |
| On-device AI | App can run local inference using Apple Foundation Models on iOS and ExecuTorch on both platforms for privacy-sensitive tasks and offline scenarios. Fallback to cloud is seamless when local model cannot handle the request. |
| Mobile commerce | User can initiate agentic commerce actions (research, compare, purchase) from mobile with appropriate safety confirmations. Purchases are never auto-confirmed; user always controls the final action. |
| Push-based proactive insights | App proactively surfaces relevant notifications based on connected data sources without requiring explicit user queries. Notifications are actionable, dismissible, and respect user-configured frequency limits. |

## 26. Screen-by-screen implementation checklist

### Root layout and lifecycle

- initialize encrypted MMKV before store rehydration
- initialize auth, push, realtime, and background sync in safe order
- route correctly between auth, onboarding, and app shells

### Onboarding and auth

- login/signup path is stable
- onboarding completion is persisted
- expired-session flows are understandable and recoverable

### Tabs shell

- bottom tabs are thumb-friendly
- tab switching is fast and preserves local state where useful
- headers remain minimal and consistent

### Chat screens

- conversation list loads and refreshes correctly
- search and tag filtering work without jank
- chat composer exposes send, model, and voice actions clearly
- detail conversation screen feels focused and stable for long transcripts

### Agents and companion screens

- agent cards render status clearly
- pending approvals surface high in the layout
- desktop connection state is always visible when relevant
- pairing code/deep-link entry paths work end to end

### Settings, schedules, messaging

- settings sections are grouped logically
- schedules and messaging are reachable without deep navigation confusion
- memory and integrations settings are clearly separated

### Notifications and background behavior

- cold-start notification flow navigates correctly
- share intents create or route to the right chat
- Android back handling does not feel broken or surprising

## 27. On-device AI

On-device inference is shifting from experimental to expected. Competitors are shipping local models as default capabilities, and users increasingly expect offline AI, faster responses, and stronger privacy guarantees. AGI Workforce mobile must integrate on-device AI as a first-class runtime alongside cloud inference.

### Apple Foundation Models (iOS 26+)

Apple's Foundation Models framework provides an approximately 3B parameter on-device model that is Swift-native, works offline, and adds no increase to app download size (the model ships with the OS). Key integration points:

- `@Generable` macro for structured output generation from Swift types
- Tool calling support for on-device agent capabilities
- Streaming text generation with guided decoding
- No network required — full offline capability for qualifying tasks
- Privacy by design: inference data never leaves the device

AGI Workforce should use Apple Foundation Models for privacy-sensitive tasks (summarizing personal documents, drafting messages with personal context) and as a fallback when network is unavailable.

### Gemini Nano on Android

Google's AICore system service provides Gemini Nano as a platform-level capability on supported Android devices. ML Kit GenAI APIs expose:

- Summarization: condense long text on-device
- Proofreading: grammar and style corrections without cloud roundtrip
- Rewriting: tone and style adjustment locally
- Image description: on-device vision for accessibility and context
- Speech recognition: local transcription for voice input

AGI Workforce should use Gemini Nano via ML Kit for the same privacy-sensitive and offline scenarios as Apple Foundation Models, maintaining platform parity.

### React Native ExecuTorch

ExecuTorch provides a declarative API for cross-platform on-device inference within React Native, supporting:

- Qwen 3 and Llama 3.2 for text generation
- Whisper for speech-to-text
- CLIP for image understanding
- Consistent API across iOS and Android

This is the primary path for models that are not platform-provided (Apple Foundation Models or Gemini Nano), allowing AGI Workforce to run custom or open-source models on-device.

### Additional on-device options

- React Native AI (`@react-native-ai`): integrates MLC LLM Engine for on-device inference with a higher-level API
- Hermes V1 WebAssembly support: enables Rust/C/C++ compiled to WASM within React Native for custom AI inference pipelines

### Hardware landscape

Modern mobile NPUs are capable of meaningful inference workloads:

- Qualcomm Snapdragon X Elite: 75-85 TOPS, sufficient for 3-7B parameter models at interactive speeds
- Apple M5 neural accelerator: 4x speedup over previous generation, enabling larger context windows on-device

### Privacy and cost narrative

The target architecture routes 80% of routine inference locally (summarization, proofreading, simple Q&A, voice transcription) while reserving cloud for complex reasoning, large context, and multi-model orchestration. This yields approximately 90% cost reduction vs cloud for qualifying tasks while strengthening the privacy story: user data stays on-device for the majority of interactions.

## 28. Mobile commerce and actions

Mobile is the primary shopping surface for 110M mobile-only AI users in the US. Competitors are aggressively integrating commerce into their mobile AI experiences, and AGI Workforce must follow — carefully.

### Competitive landscape

**Gemini Screen Automation**: The most aggressive pattern shipping today. Gemini autonomously operates third-party apps (DoorDash, Uber, Starbucks, Instacart) in a "secure virtual window" where the AI controls the app but the user retains checkout control. The user sees what the agent is doing and must confirm the final purchase. This is app automation, not API integration — Gemini interacts with the app UI the same way a human would.

**ChatGPT Instant Checkout**: Uses the Agentic Commerce Protocol + Stripe to enable purchases from Etsy, Shopify, and other merchants directly inside ChatGPT. The transaction happens within the AI interface, not by switching to a merchant app. This is API-level commerce integration.

**Perplexity agentic commerce**: Combines search, comparison, and purchasing within the Comet browser. Users can research products, compare options across merchants, and complete purchases without leaving the AI experience. Voice-initiated commerce flows are supported.

### AGI Workforce approach

AGI Workforce should pursue commerce capabilities that align with our agent-first architecture:

- **Research and comparison agents**: agents that research products, compare prices, read reviews, and present structured recommendations on mobile
- **Approval-gated purchases**: leverage existing approval workflow infrastructure for purchase confirmations — the user always controls the final action
- **Desktop-mobile handoff for complex transactions**: research on mobile, execute on desktop where the full agent toolkit is available
- **Never auto-confirm purchases**: this is a non-negotiable safety rule, consistent across all surfaces

### Mobile-specific commerce patterns

Mobile commerce differs from desktop commerce in important ways:

- Thumb-friendly approval flows with clear accept/reject targets
- Quick-glance comparison cards optimized for small screens
- Push notification for price alerts and deal expiration
- Voice-initiated commerce ("find me the best price on...") flowing into visual comparison results
- Location-aware commerce suggestions when relevant and user-authorized

### Safety principles

- Purchases require explicit user confirmation at every step
- Financial information is handled through secure payment providers, never stored locally
- Agent actions are logged and auditable
- Users can set spending limits and category restrictions
- All commerce actions respect the existing ToolGuard safety framework

## 29. Cross-device orchestration

Cross-device orchestration is the defining capability that separates AGI Workforce from single-surface AI apps. Claude Dispatch has validated the market for this pattern — our job is to execute it better.

### Claude Dispatch analysis

Dispatch (launched March 17, 2026) establishes the pattern: QR code pairing between mobile and desktop, persistent conversation thread across devices, tasks sent from phone and executed on desktop with file access and sandbox capabilities.

Current Dispatch limitations:

- Approximately 50% reliability (MacStories report)
- Mac must be awake with Claude Desktop open
- Restricted to Cowork-enabled accounts (Max tier, Pro coming)
- Single conversation thread, not multi-agent
- No agent dashboard, no approval workflows, no push notifications
- No real-time execution streaming

These limitations define our window of opportunity. As Dispatch matures, the reliability gap will close. Our advantage must be in depth, not just reliability.

### AGI Workforce approach

Our cross-device orchestration is built on a production-grade companion architecture with WebRTC transport:

- **Full agent dashboard**: not just a conversation thread — a control plane showing all active agents, their status, resource usage, and outputs
- **Multi-agent monitoring**: watch multiple agents executing simultaneously on desktop, each with its own status card on mobile
- **Approval workflows**: approve or deny sensitive actions from mobile push notifications without opening the app (actionable notifications)
- **Push notifications**: real-time alerts for agent completions, errors, approval requests, and schedule triggers
- **Schedule management**: create, edit, and monitor scheduled agent runs from mobile
- **Execution artifact viewing**: see files created, code written, and task outputs directly on mobile

### Persistent cross-device threads

Beyond Dispatch's single conversation thread, AGI Workforce supports:

- Send a task from any device (mobile, desktop, web), execution happens on the most capable available surface (usually desktop)
- Results sync everywhere — completion artifacts, conversation history, and agent state are available on all surfaces
- Thread persistence across network interruptions, device sleep, and app restarts
- Multiple concurrent cross-device threads, each tied to different agents or projects

### Real-time execution streaming

Users can watch what the agent is doing on desktop from their phone:

- Live tool call timeline showing each action as it happens
- File change previews as the agent creates or modifies files
- Terminal output streaming for command execution
- Screenshot/screen capture streaming for visual tasks
- Progress indicators for long-running operations

### Offline resilience

Mobile is inherently an unreliable network environment. Cross-device orchestration must handle this gracefully:

- Offline queue with exponential backoff for tasks submitted while disconnected
- Eventual consistency via background sync when connectivity returns
- Clear status indicators showing connection state (connected, reconnecting, offline/queued)
- Tasks queued offline execute automatically when the desktop comes back online

### Pairing methods: trade-offs

| Method | Convenience | Security | Implementation complexity |
| --- | --- | --- | --- |
| QR code scan | High (camera-based, no typing) | High (visual verification, short-lived token) | Medium |
| Deep link | Medium (requires desktop browser step) | Medium (URL can be intercepted) | Low |
| Session code | Low (manual entry) | High (user-verified, short-lived) | Low |

AGI Workforce supports all three methods. QR pairing is the default and recommended flow, matching user expectations set by Claude Dispatch while offering a richer post-pairing experience.
