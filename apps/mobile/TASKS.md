# Mobile App Restructure — Task Assignments

> Granular task breakdown with agent ownership and complexity ratings.
> Each task is independently executable by a sub-agent.

## Legend

- **Complexity:** S (small, <30min), M (medium, 30-60min), L (large, 1-2hr), XL (2+ hr)
- **Status:** ⬜ Pending, 🔄 In Progress, ✅ Done, ❌ Blocked

---

## Wave 1: Foundation (Parallel)

### Nav Agent — Phase A: Navigation Restructure

| #   | Task                                                            | Complexity | Status | Files                                          |
| --- | --------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------- |
| A1  | Replace bottom tabs with drawer navigator                       | L          | ⬜     | `app/(app)/_layout.tsx`                        |
| A2  | Create DrawerContent component (6 items + recents + profile)    | L          | ⬜     | `components/sidebar/DrawerContent.tsx`         |
| A3  | Implement adaptive drawerType (front/permanent by screen width) | M          | ⬜     | `app/(app)/_layout.tsx`                        |
| A4  | Create Dispatch route placeholder                               | S          | ⬜     | `app/(app)/dispatch/index.tsx`                 |
| A5  | Create Connectors route placeholder                             | S          | ⬜     | `app/(app)/connectors/index.tsx`               |
| A6  | Remove old tab-based layout files                               | M          | ⬜     | `app/(app)/(tabs)/_layout.tsx`, `(tabs)/*.tsx` |
| A7  | Update all internal navigation links/redirects                  | M          | ⬜     | Multiple route files                           |

### Model Agent — Phase C: Model Selector Rework

| #   | Task                                               | Complexity | Status | Files                                          |
| --- | -------------------------------------------------- | ---------- | ------ | ---------------------------------------------- |
| C1  | Rework ModelPickerSheet to flat list layout        | L          | ⬜     | `components/model-picker/ModelPickerSheet.tsx` |
| C2  | Add auto mode cards at top (Economy/Balanced/Best) | M          | ⬜     | `components/model-picker/ModelPickerSheet.tsx` |
| C3  | Add per-model thinking toggle (expand on tap)      | M          | ⬜     | `components/model-picker/ModelPickerSheet.tsx` |
| C4  | Update modelStore for per-model thinking state     | S          | ⬜     | `stores/modelStore.ts`                         |
| C5  | Verify model catalog completeness (9+ providers)   | S          | ⬜     | `lib/models.ts`                                |

### Chat Agent — Phase F: Thinking UI + Streaming

| #   | Task                                                   | Complexity | Status | Files                                           |
| --- | ------------------------------------------------------ | ---------- | ------ | ----------------------------------------------- |
| F1  | Create ThinkingBottomSheet component                   | L          | ⬜     | `components/chat/ThinkingBottomSheet.tsx` (NEW) |
| F2  | Add collapsed thinking line in MessageBubble           | M          | ⬜     | `components/chat/MessageBubble.tsx`             |
| F3  | Replace StreamingIndicator with teal sparkle animation | M          | ⬜     | `components/chat/StreamingIndicator.tsx`        |
| F4  | Simplify chat header to minimal (back + menu only)     | S          | ⬜     | `app/(app)/chat/[id].tsx`                       |

---

## Wave 2: Core Features (Depends on Wave 1)

### Chat Agent — Phase B: Input Bar + Add to Chat

| #   | Task                                                   | Complexity | Status | Files                                      |
| --- | ------------------------------------------------------ | ---------- | ------ | ------------------------------------------ |
| B1  | Restructure ChatInput layout: [+][Model▾][🔗][🎙][➤]   | L          | ⬜     | `components/chat/ChatInput.tsx`            |
| B2  | Create AddToChatSheet with all sections                | XL         | ⬜     | `components/chat/AddToChatSheet.tsx` (NEW) |
| B3  | Wire mode selector (Chat/Research/Create) to chatStore | M          | ⬜     | `stores/chatStore.ts`                      |
| B4  | Wire feature toggles (web search, image gen, health)   | M          | ⬜     | `stores/chatStore.ts`                      |
| B5  | Update streaming state (Reply to [Model] + stop)       | S          | ⬜     | `components/chat/ChatInput.tsx`            |

### Dispatch Agent — Phase D: Dispatch Page

| #   | Task                                                   | Complexity | Status | Files                                           |
| --- | ------------------------------------------------------ | ---------- | ------ | ----------------------------------------------- |
| D1  | Build Dispatch page with persistent thread UI          | XL         | ⬜     | `app/(app)/dispatch/index.tsx`                  |
| D2  | Desktop connection status header (🟢/🔴 + device name) | M          | ⬜     | `components/companion/DispatchHeader.tsx` (NEW) |
| D3  | Task result cards ([Preview] [Open on Mac])            | M          | ⬜     | `components/companion/TaskResultCard.tsx` (NEW) |
| D4  | Desktop offline state UI                               | S          | ⬜     | `app/(app)/dispatch/index.tsx`                  |
| D5  | Wire WebRTC DataChannel for task messages              | L          | ⬜     | `stores/connectionStore.ts`                     |
| D6  | Remove old AgentDashboard (keep approval modal)        | M          | ⬜     | `components/agents/`, `app/(app)/agents/`       |

### Connectors Agent — Phase E: Connectors Page

| #   | Task                                                                        | Complexity | Status | Files                                            |
| --- | --------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------ |
| E1  | Create ConnectorsList component with categorized toggles                    | L          | ⬜     | `components/connectors/ConnectorsList.tsx` (NEW) |
| E2  | Create ConnectorItem component (icon + name + description + toggle/connect) | M          | ⬜     | `components/connectors/ConnectorItem.tsx` (NEW)  |
| E3  | Wire to integrationStore for connected/available states                     | M          | ⬜     | `stores/integrationStore.ts`                     |
| E4  | Create Connectors page with category headers                                | M          | ⬜     | `app/(app)/connectors/index.tsx`                 |
| E5  | Link from AddToChatSheet "Manage Connectors"                                | S          | ⬜     | `components/chat/AddToChatSheet.tsx`             |

---

## Wave 3: Extended Features (Depends on Wave 2)

### Features Agent — Phase G: Add to Chat Features

| #   | Task                                            | Complexity | Status | Files                                                |
| --- | ----------------------------------------------- | ---------- | ------ | ---------------------------------------------------- |
| G1  | Create StyleSelector bottom sheet               | M          | ⬜     | `components/chat/StyleSelector.tsx` (NEW)            |
| G2  | Create ToolAccessSelector bottom sheet          | M          | ⬜     | `components/chat/ToolAccessSelector.tsx` (NEW)       |
| G3  | Add to project selector in AddToChatSheet       | M          | ⬜     | `components/chat/AddToChatSheet.tsx`                 |
| G4  | HealthKit integration (Beta toggle + data read) | L          | ⬜     | `services/healthkit.ts` (NEW), `lib/health.ts` (NEW) |
| G5  | CollapsibleSources component for web citations  | M          | ⬜     | `components/chat/CollapsibleSources.tsx` (NEW)       |

### Settings Agent — Phase H: Settings & Personalization

| #   | Task                                                  | Complexity | Status | Files                                          |
| --- | ----------------------------------------------------- | ---------- | ------ | ---------------------------------------------- |
| H1  | Restructure Settings page to 5 groups, 18 items       | L          | ⬜     | `app/(app)/settings/index.tsx`                 |
| H2  | Create Personalization sub-page with sliders          | L          | ⬜     | `app/(app)/settings/personalization.tsx` (NEW) |
| H3  | Update Usage page with progress bars + countdown      | M          | ⬜     | `app/(app)/usage.tsx`                          |
| H4  | Create Capabilities toggles page                      | M          | ⬜     | `app/(app)/settings/capabilities.tsx` (NEW)    |
| H5  | Add Auto-Approve selector page                        | S          | ⬜     | `app/(app)/settings/auto-approve.tsx` (NEW)    |
| H6  | Update settingsStore with slider state + capabilities | M          | ⬜     | `stores/settingsStore.ts`                      |

---

## Wave 4: Polish (Depends on All Above)

### Chat Agent — Phase I: Onboarding + Polish

| #   | Task                                                      | Complexity | Status | Files                                                |
| --- | --------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------- |
| I1  | Rework onboarding to 3 screens                            | L          | ⬜     | `app/onboarding.tsx`, `components/onboarding/` (NEW) |
| I2  | First launch: empty chat + greeting + pairing banner      | M          | ⬜     | `app/(app)/chat.tsx` or equivalent                   |
| I3  | SwipeReply component (swipe right to quote-reply)         | M          | ⬜     | `components/chat/SwipeReply.tsx` (NEW)               |
| I4  | MessageReaction component (double-tap 👍/👎)              | M          | ⬜     | `components/chat/MessageReaction.tsx` (NEW)          |
| I5  | Haptic feedback audit (all interactive elements)          | M          | ⬜     | Multiple component files                             |
| I6  | iPad adaptive layout testing + fixes                      | M          | ⬜     | `app/(app)/_layout.tsx`                              |
| I7  | Offline mode verification (MMKV caching)                  | S          | ⬜     | `lib/mmkv.ts`, `stores/*.ts`                         |
| I8  | Conversation grouping verification (Pinned + date groups) | S          | ⬜     | `components/sidebar/`                                |
| I9  | Voice mode verification (tap/long-press)                  | S          | ⬜     | `components/voice/`                                  |

---

## Summary

| Wave      | Phases       | Tasks        | Agents            | Can Parallelize |
| --------- | ------------ | ------------ | ----------------- | --------------- |
| 1         | A, C, F      | 16           | 3 agents parallel | ✅ Yes          |
| 2         | B, D, E      | 16           | 3 agents parallel | ✅ Yes          |
| 3         | G, H         | 11           | 2 agents parallel | ✅ Yes          |
| 4         | I            | 9            | 1 agent           | Sequential      |
| **Total** | **9 phases** | **52 tasks** | **7 agents**      | **4 waves**     |

## Agent Team

| Agent Name           | Specialization                                 | Tasks               |
| -------------------- | ---------------------------------------------- | ------------------- |
| **nav-agent**        | Navigation, routing, drawer                    | A1-A7               |
| **model-agent**      | Model selector, catalog                        | C1-C5               |
| **chat-agent**       | Input bar, streaming, messages, thinking       | F1-F4, B1-B5, I1-I9 |
| **dispatch-agent**   | Desktop companion, WebRTC, persistent thread   | D1-D6               |
| **connectors-agent** | Connectors page, OAuth, integrations           | E1-E5               |
| **features-agent**   | Style, tool access, health, citations          | G1-G5               |
| **settings-agent**   | Settings, personalization, usage, capabilities | H1-H6               |
