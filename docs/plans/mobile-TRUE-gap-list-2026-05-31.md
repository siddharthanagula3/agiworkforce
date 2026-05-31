# Mobile TRUE Gap List (verified vs actual code, 2026-05-31)

Verified 81 items: ALREADY-BUILT 67 · PARTIAL 8 · REAL-GAP 6 · WRONG-CLAIM 0.
Source: workflow w2mtl50bv. The parity spec massively over-reported; ~83% of claimed gaps are working code.

## REAL GAPS (build these)

### Thinking Effort dropdown (Standard / Advanced / Ultra) _[model-picker, effort=medium]_

- spec claim: Status: ❌ Missing
- evidence: rg found 0 matches for 'Standard.*Advanced.*Ultra' across apps/mobile. ModelPickerSheet.tsx lines 357-403 show only a boolean toggle for Extended Thinking, no dropdown. store.ts has no effort-level enum or state field. service.ts:17 ModelTier is type='balanced'|'economy'|'premium' (device tiers, not thinking effort levels)
- **gap / to-do: Missing Thinking Effort dropdown selector (if thinking enabled). Create new component ThinkingEffortSelector or extend ModelRow expanded section at ModelPickerSheet.tsx:186-212 in ModelRow to include Picker/Dropdown choosing 'Standard'/'Advanced'/'Ultra'. Enum needed in store.ts or service.ts. State: thinkingEffort: 'standard'|'advanced'|'ultra' in ModelState**

### Model & Thinking nested sub-screen _[settings, effort=medium]_

- spec claim: P0 Model & Thinking sub-screen with LOCAL MODELS radio selector (Llama, Phi, Gemma), CLOUD MODELS radio selector (Claude Opus, GPT-5, Gemini), THINKING MODE toggle + Thinking Effort dropdown (Standard/Advanced/Ultra)
- evidence: Spec section 2, rows 4a–4c claims this exists. GREP SEARCH: `rg 'Model.*Thinking|thinking-mode|thinking-effort|Thinking.*Effort' /Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/settings/ /Users/siddhartha/Desktop/agiworkforce/apps/mobile/app/\(app\)/settings/` returns 0 matches for a dedicated screen. Main settings index line 190 references 'Model & Thinking' but no navigation onPress is defined — it's a placeholder status row. Model selection lives at `/(app)/models` (separate from settings), not under settings/model-thinking.
- **gap / to-do: The Model & Thinking nested sub-screen does not exist as a standalone settings route. Model selection is accessed via Settings > Local LLMs (which pushes to /(app)/models) or Settings > Capabilities > Local LLMs. Thinking controls (toggle, effort dropdown) are NOT present anywhere in the codebase — thinking is always off for local models in v1 (local-first design). This is BY DESIGN per LOCAL MODE spec, but the spec cell at row 4 (line 190) is a WRONG CLAIM: it should mark this as 'locked' or 'waitlist' not 'HYBRID'. Target file: would be `src/features/settings/model-thinking/index.tsx` if it existed.**

### Profile sub-screen _[settings, effort=high]_

- spec claim: P0 Profile sub-screen with Full Name, Nickname, Update Profile button, Personal Preferences text area, Save Preferences button, Delete Account link (red)
- evidence: Spec row 1 (line 187) claims Profile exists. GREP: `rg 'Profile|Delete.*Account' /Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/settings/ /Users/siddhartha/Desktop/agiworkforce/apps/mobile/app/\(app\)/settings/` returns 0 matches. No Profile screen exists. Main settings.tsx index.tsx has NO profile row in the Account section.
- **gap / to-do: Profile screen (edit name, avatar, bio, delete account) does not exist in Mobile v1. This is intentional: local-first mode has no cloud account in v1. Profile management is cloud-only and gated. Target file would be: `src/features/settings/profile/index.tsx`. Note: Personalization covers some overlap (custom instructions, preferences, style) but is not Profile.**

### Billing & Subscription sub-screen _[settings, effort=high]_

- spec claim: P0 Billing & Subscription sub-screen with tier badge (Max), upgrade CTA, subscription status, order history
- evidence: Spec row 2 (line 188) claims Billing exists. GREP: `rg 'Billing|Subscription|upgrade|tier|plan' /Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/settings/ /Users/siddhartha/Desktop/agiworkforce/apps/mobile/app/\(app\)/settings/ | grep -v Waitlist` returns 0 matches for a dedicated Billing screen.
- **gap / to-do: Billing & Subscription screen does not exist in Mobile v1. This is Cloud-only and not applicable to local-first mode. Target file would be: `src/features/settings/billing/index.tsx`. The spec claims this is P0 HYBRID, but it's actually Cloud-only and gated to waitlist.**

### Usage & Limits sub-screen _[settings, effort=high]_

- spec claim: P0 Usage & Limits sub-screen with token quota, image generation quota, API calls quota display per plan
- evidence: Spec row 3 (line 189) claims Usage exists. GREP: `rg 'Usage|quota|limit|token.*quota' /Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/settings/` returns 0 matches.
- **gap / to-do: Usage & Limits screen does not exist in Mobile v1. This is Cloud-only and applies only to cloud models + billing plans. Target file would be: `src/features/settings/usage/index.tsx`. Not applicable to local-mode v1.**

### Skeleton loaders / loading skeletons (message list) _[message-actions-states, effort=medium]_

- spec claim: Skeleton loaders (message list), full error screens (network error, model missing, disk full) — MISSING (P1)
- evidence: rg found 0 matches for 'Skeleton|SkeletonLoader' across apps/mobile/src. Chat[id].tsx line 83 tracks isLoadingMessages but does not render skeleton UI. MessageList.tsx has no loading skeleton. Spec explicitly lists (line 1003) 'Skeleton loaders (message list), full error screens (network error, model missing, disk full), empty state microcopy' as P1 gap with Low-Medium effort.
- **gap / to-do: Add MessageSkeleton component (avatar + 2 placeholder lines) rendered when isLoadingMessages=true. Wire to MessageList as fallback before first message. Create ErrorScreen components for ModelMissing, DiskFull, NetworkError states. Add to edge-cases/components.**

## PARTIAL (finish these)

### Effort Level Control (UI) _[thinking, effort=low]_

- spec claim: P0 'Missing' — 'Settings > Model & Thinking > effort dropdown not wired'
- evidence: AddToChatSheet.tsx lines 84, 135, 216-221 define EFFORT_LEVELS and handleEffortChange. Lines 572-613 render effort selector: 'supportsEffort && <View>...<Text>Effort</Text>{EFFORT_LEVELS.map(level => <Pressable onPress={() => handleEffortChange(level)}>)}'. agentControlStore.ts lines 107-120 implement setEffort(conversationId, effort) that stores to byConversation. Code quotes: 'const storeSetEffort = useAgentControlStore((s) => s.setEffort)' at line 135; 'storeSetEffort(effectiveConversationId, level)' at line 219.
- **gap / to-do: Effort selected in UI (AddToChatSheet) and persisted to store (agentControlStore) but is NEVER passed to the API call. streamChat at chatExecutionStore.ts line 579 sends only {model, messages, stream, thinking} without effort field. streaming.ts attemptStream (line 69) accepts only body with {model, messages, stream, thinking?} — no effort parameter. Effort must be added to the API body payload.**

### Thinking for Non-Claude Models _[thinking, effort=low]_

- spec claim: P1 'Partial' — 'Other models (Llama, Gemma) don't support thinking display. Add feature flag: only show thinking chip if model has thinking output'
- evidence: ThinkingChip.tsx and MessageBubble.tsx (line 95, 334) check 'hasReasoning = isAssistant && message.reasoning !== undefined' — generic check, not model-specific. Both local models (Llama, Gemma) via parseLocalThinking at line 111-152 and cloud models via delta.reasoning can populate message.reasoning. No feature flag or provider-specific guard exists. Code: 'const hasReasoning = isAssistant && message.reasoning !== undefined' at line 95 renders chip for any model with reasoning output.
- **gap / to-do: No feature flag gating thinking display by model capability. Local models (Llama, Gemma) may not have thinking support but will still show an empty or irrelevant thinking chip if reasoning field is set. Recommend: add provider-aware flag or check model.supportsThinking before rendering chip. Safe for now since local models won't populate reasoning unless they emit <think> tags.**

### Model Card (Local) with CPU icon, name, provider badge, size, tokens/sec, radio button, selectable _[model-picker, effort=low]_

- spec claim: Status: ❌ Missing
- evidence: ModelRow.tsx:28-215 renders full model card: CPU icon at line 114-115 (Cpu size=16 if isLocal), name at 122-128, description at 130-133, detailLabel showing size/runtime/vision/tools at 135-137. Radio state via isSelected check line 164 with Check icon. Badges at 141-166 show 'Ready'/'Download'/'Downloading %'/'Retry'/'Soon'/'Locked' status. Missing: tokens/sec not shown in detailLabel (only shows 'llama.rn', size, capabilities)
- **gap / to-do: tokens/sec display missing from detailLabel generation in service.ts:249-254. Add to detailForLocalModel() function and ModelDef interface.**

### IMAGE GENERATION UI (TEXT-TO-IMAGE SCREEN) _[images-artifacts, effort=high]_

- spec claim: P1 'image generation screen' — spec claims route exists but UI incomplete; model selector + generate button missing
- evidence: /Users/siddhartha/Desktop/agiworkforce/apps/mobile/app/(app)/image.tsx line 1–167: screen has header, picker buttons (Photo Library, Camera), but is designed for image-with-question (vision analysis), NOT text-to-image generation. No text prompt input, no style picker, no model selector, no generate button visible. Line 89–90: when image selected, renders ImageWithQuestion (vision flow), not image generation flow.
- **gap / to-do: Text-to-image generation UI completely missing. Spec expects: TextInput (prompt), bottom sheet style picker, model selector (DALL-E/Stable Diffusion), generate button, progress indicator, result display. Would go in /Users/siddhartha/Desktop/agiworkforce/apps/mobile/app/(app)/image.tsx as separate branch or new screen route /(app)/image-gen.**

### Main Settings screen section structure (Account / Capabilities / Device / Privacy / Advanced / About) _[settings, effort=none]_

- spec claim: P0 settings landing with 8 sections: ACCOUNT, CAPABILITIES, DEVICE, PRIVACY, ADVANCED, APP + section headers + dividers
- evidence: /Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/settings/index.tsx line 463–701: sections array defines 7 groups: Mode, Keys, Local AI (≈ CAPABILITIES), Connections, Voice, Preferences, Privacy, About. Rendering: lines 827–836 use SectionList with renderSectionHeader, section dividers at line 810.
- **gap / to-do: ACCOUNT section is partially present: only Local Mode + Local LLMs + Cloud Managed (no Profile, Billing, Usage rows as specified). The spec expects 3 ACCOUNT rows; actual has 0 cloud account rows (by design: local-first v1 mode). Spec's CAPABILITIES section ≈ actual 'Local AI' section. DEVICE ≈ actual Preferences + Voice. Correct structure is present but ACCOUNT sub-rows (Profile, Billing, Usage) are missing.**

### Error state (offline queue + paywall sheet) _[message-actions-states, effort=low]_

- spec claim: Red banner: 'Unable to send. Retry?' with retry button — PARTIAL (P0)
- evidence: Chat[id].tsx lines 79, 94, 154–159: Paywall error wired via useChatStore. Lines 183–190: Offline message handling with enqueueOfflineMessage. offlineQueue service (line 42) manages retry. However: spec expects RED BANNER with explicit 'Unable to send. Retry?' text. Current: implicit queued badge on message (MessageBubble.tsx lines 286–302 shows yellow 'queued' badge) + paywall bottom sheet modal. Missing: explicit 'send failed' error toast per spec design.
- **gap / to-do: Add explicit error toast/banner (Toast component) for send failures with retry CTA. Currently only handles offline queue silently via queued badge. Error toasts for network/validation failures not visible in chat screen.**

### Citation chips / sources list (references) _[message-actions-states, effort=none]_

- spec claim: Citation List — 'Sources:' label, list of URLs/sources (expandable disclosure), each source is link — MISSING (P1)
- evidence: MessageBubble.tsx lines 419–434: CitationChip + CollapsibleSources components implemented. Lines 422–427: Render up to 3 citations as chips; lines 431–433: 4+ citations in collapsible card. CitationChip (import line 29) and CollapsibleSources (import line 30) present. However: spec expects per-message citation list as a distinct UI element (table 437, line 446). Current impl renders inline above artifact section. Implementation matches intent but not exact spec layout.
- **gap / to-do: none**

### HISTORY search in sidebar (spec P2 claimed PARTIAL) _[projects-agents-history, effort=low]_

- spec claim: Search Chat History | Chat list exists; full-text search not wired
- evidence: SearchBar component exists at /Users/siddhartha/Desktop/agiworkforce/apps/mobile/src/features/sidebar/components/SearchBar.tsx:1-66 with TextInput, placeholder 'Search conversations...', clear button. ConversationList.tsx:80-245 accepts searchQuery + searchResults props and filters/renders results with snippets (line 121-151). BUT DrawerContent.tsx (sidebar shown in drawer) line 1-525 does NOT use SearchBar—only renders ConversationList without search state. No useState(searchQuery) in DrawerContent.
- **gap / to-do: PRECISE GAP: SearchBar component is built but NOT CONNECTED to DrawerContent. Need to add useState(searchQuery) in DrawerContent, pass to ConversationList, integrate search handler. Target: DrawerContent.tsx around line 443-483 (Recents section).**

## WRONG CLAIMS (spec mischaracterized)

_(none)_

## ALREADY BUILT (do NOT touch) — names only

- Thinking Display (Chip + Modal Sheet) _[thinking]_
- Reasoning Tag Parsing (Local Models) _[thinking]_
- Reasoning Streaming (Cloud Models) _[thinking]_
- Thinking Duration Tracking _[thinking]_
- Attachment Preview Bar _[composer-attach]_
- Chat Empty State with Greeting _[composer-attach]_
- Suggestion Chips (Task-based) _[composer-attach]_
- Sheet Header (Title 'Models' + X dismiss button) _[model-picker]_
- Search Input to filter models by name/provider _[model-picker]_
- Section headers 'LOCAL MODELS' / 'CLOUD MODELS' with descriptions _[model-picker]_
- Model Card (Cloud) with cloud icon, name, provider badge, tier badge (Pro+), radio button, locked state _[model-picker]_
- Download status badges (Ready/Download/Downloading %/Retry/Soon/Locked) _[model-picker]_
- Favorite toggle (long-press star icon on model card) _[model-picker]_
- Auto-Mode cards (Best/Lite/Vision) as selectable options _[model-picker]_
- Extended Thinking toggle ('Enable Extended Thinking') _[model-picker]_
- Scrollable content with sections for local/cloud/thinking _[model-picker]_
- Tap model → select + dismiss sheet; persist settings _[model-picker]_
- Voice full-screen conversation modal _[voice]_
- Waveform visualization (real-time audio input animation) _[voice]_
- Transcription display (real-time STT output) _[voice]_
- Push-to-talk / tap-to-record button _[voice]_
- End-call / close button _[voice]_
- STT (Speech-to-Text) input wiring _[voice]_
- TTS (Text-to-Speech) output playback _[voice]_
- Mute / microphone toggle control _[voice]_
- Voice button integration in chat composer _[voice]_
- ARTIFACTS GALLERY _[images-artifacts]_
- ARTIFACTS DETAIL & PREVIEW _[images-artifacts]_
- IMAGE UPLOAD & DISPLAY IN CHAT _[images-artifacts]_
- ATTACHMENTS PREVIEW BAR _[images-artifacts]_
- GENERATED IMAGE DISPLAY (CHAT INLINE) _[images-artifacts]_
- Settings Main Screen (Landing/Index) _[settings]_
- Capabilities sub-screen _[settings]_
- Permissions sub-screen _[settings]_
- Memory sub-screen _[settings]_
- Storage sub-screen _[settings]_
- Performance sub-screen _[settings]_
- Auto-Approve sub-screen _[settings]_
- Notifications sub-screen _[settings]_
- Personalization sub-screen _[settings]_
- Shared Links sub-screen _[settings]_
- Memory Import sub-screen _[settings]_
- Integrations/Connectors sub-screen _[settings]_
- Voice & Language sub-screen _[settings]_
- Appearance toggle (Dark/Light/System) _[settings]_
- Haptic Feedback toggle _[settings]_
- Privacy Policy & Terms of Service links _[settings]_
- Thinking Indicator Chip (display & expand) _[message-actions-states]_
- Message Edit action _[message-actions-states]_
- Message Copy action _[message-actions-states]_
- Message Delete action _[message-actions-states]_
- Message Retry/Regenerate action _[message-actions-states]_
- Message Export action _[message-actions-states]_
- Message Reaction feedback (helpful/unhelpful) _[message-actions-states]_
- Chat Empty State (greeting + suggestion chips) _[message-actions-states]_
- Loading state (spinner during message streaming) _[message-actions-states]_
- Message attachment preview bar (horizontal scroll) _[message-actions-states]_
- Offline banner / status indicator _[message-actions-states]_
- PROJECTS gallery + list (spec P1 claimed MISSING) _[projects-agents-history]_
- PROJECTS detail + edit modal (spec P1 claimed MISSING) _[projects-agents-history]_
- PROJECTS create/edit actions (spec P1 claimed MISSING) _[projects-agents-history]_
- AGENTS detail screen (spec P1 claimed MISSING gallery UI) _[projects-agents-history]_
- SKILLS category browser (spec P1 claimed MISSING gallery UI) _[projects-agents-history]_
- HISTORY conversation grouping (spec claimed implicit in P2) _[projects-agents-history]_
- THINKING display chip (spec P0 claimed MISSING—KEY OVERSTATED CLAIM) _[projects-agents-history]_
- THINKING effort dropdown (spec P0 claimed MISSING) _[projects-agents-history]_
- MESSAGE actions (copy/edit/regenerate/delete) (spec P1 claimed PARTIAL) _[projects-agents-history]_
