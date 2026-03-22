# Mobile App Restructure — Architecture Plan

> The mobile app already has 33 routes, 13 stores, 25 services, 16 component directories.
> This is a RESTRUCTURE to match `docs/MOBILE_APP_SPEC.md`, not a build from scratch.

## Spec Reference

- **Single source of truth:** `docs/MOBILE_APP_SPEC.md`
- **Competitive analysis:** `memory/claude-mobile-ios-march2026.md`, `memory/perplexity-mobile-march2026.md`, `memory/chatgpt-mobile-march2026.md`, `memory/gemini-mobile-ios-march2026.md`

## Architecture Decisions

### Navigation: Bottom Tabs → Drawer

- Replace `@react-navigation/bottom-tabs` with `@react-navigation/drawer`
- iPhone: `drawerType='front'` (slides over content)
- iPad: `drawerType='permanent'` (always-visible sidebar, width >= 768)
- 6 nav items: Chat, Skills, Projects, Dispatch, Connectors, Settings
- Recents section + user profile card at bottom

### Input Bar: Separate + and Model

- Two distinct tappable buttons: [+] and [Model▾]
- [+] opens "Add to Chat" sheet (hybrid Perplexity + Claude design)
- [Model▾] opens Model selector sheet (Perplexity-style flat list)
- Brain toggle moved INSIDE model selector (per-model, not input bar)

### Model Selector: Flat List

- Auto modes at top: Economy / Balanced / Best (like Perplexity's "Best")
- Flat list below with provider icons (NO section headers by provider)
- Per-model "With thinking" toggle on tap-to-expand
- Flat list is simpler to scan than grouped list

### Agents → Dispatch

- Remove separate Agents dashboard (over-engineered for v1)
- Replace with Dispatch: persistent thread with desktop (like Claude's Dispatch)
- Mobile = remote control for desktop. Code/agents run on desktop, not phone.
- Push notifications when tasks complete (Claude lacks this — our advantage)

### Thinking: Bottom Sheet (Not Accordion)

- Match Claude iOS pattern exactly
- Collapsed: single line "⏱ [preview]... >"
- Expanded: bottom sheet "Thought process" with full scrollable text
- Keeps chat flow clean

### + Menu: Hybrid Design

- Perplexity's clean card row for attachments
- Perplexity's mutually exclusive mode selector (Chat/Research/Create)
- Claude's feature toggles (Web search, Image gen, Health)
- Claude's config links (project, style, tool access, connectors)

## Dependency Graph

```
Wave 1 (parallel):
  Phase A: Navigation ─┐
  Phase C: Model       ├─→ Wave 2
  Phase F: Thinking    ─┘

Wave 2 (parallel, needs nav):
  Phase B: Input Bar ──┐
  Phase D: Dispatch    ├─→ Wave 3
  Phase E: Connectors ─┘

Wave 3 (parallel, needs input bar):
  Phase G: Features ───┐
  Phase H: Settings  ──┴─→ Wave 4

Wave 4 (final):
  Phase I: Onboarding + Polish
```

## File Impact Summary

| Category           | Files Modified | Files Created | Total   |
| ------------------ | -------------- | ------------- | ------- |
| Navigation         | 4              | 2             | 6       |
| Input Bar          | 3              | 1             | 4       |
| Model Selector     | 3              | 0             | 3       |
| Dispatch           | 2              | 2             | 4       |
| Connectors         | 1              | 3             | 4       |
| Thinking/Streaming | 3              | 1             | 4       |
| Features           | 1              | 4             | 5       |
| Settings           | 3              | 3             | 6       |
| Onboarding/Polish  | 3              | 4             | 7       |
| **Total**          | **~23**        | **~20**       | **~43** |

## Shared Package Usage

| Package                 | What to Import                                                           | Why                                  |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `@agiworkforce/types`   | ChatMessage, ModelProvider, AgentConfig, PairingToken, CrossDeviceThread | Type safety across all features      |
| `@agiworkforce/utils`   | SignalingClient, formatDate, retry, debounce, validateEmail              | Network resilience + formatting      |
| `@agiworkforce/api`     | command wrappers (50+ modules)                                           | Auto-routes to API gateway on mobile |
| `@agiworkforce/runtime` | command(), listen(), isCloudWeb                                          | Platform detection + event bus       |

## Key Constraints

1. **No BYOK on mobile** — managed cloud only
2. **No local LLMs** — mobile is a remote control for desktop
3. **No messaging integrations** (WhatsApp/Telegram/Slack) in v1
4. **Agent/code execution happens on DESKTOP** — mobile shows status and outcomes
5. **HealthKit is Beta** — OFF by default, reference HxF Swift app patterns
6. **Desktop must be awake** for Dispatch to work
