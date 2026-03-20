# Mobile Agent Dashboard UX Pattern Guide

> Comprehensive research-backed patterns for monitoring, controlling, and interacting
> with autonomous AI agents from mobile devices. Based on 2026 market analysis of
> GitHub Mobile, Claude Remote, Google Gemini Agent, Mission Control, and industry
> best practices from Smashing Magazine, Apple HIG, and Material Design 3.

---

## Table of Contents

1. [Real-Time Agent Status Display](#1-real-time-agent-status-display)
2. [Approve/Deny Patterns](#2-approvedeny-patterns)
3. [Push Notification Architecture](#3-push-notification-architecture)
4. [Real-Time Streaming UI](#4-real-time-streaming-ui)
5. [Tool Execution Timeline on Small Screens](#5-tool-execution-timeline-on-small-screens)
6. [Background Agent Monitoring](#6-background-agent-monitoring)
7. [QR Code Pairing UX](#7-qr-code-pairing-ux)
8. [Dashboard Layout Patterns](#8-dashboard-layout-patterns)
9. [Haptic Feedback Patterns](#9-haptic-feedback-patterns)
10. [Competitive Reference Implementations](#10-competitive-reference-implementations)
11. [Implementation Recommendations for AGI Workforce](#11-implementation-recommendations)

---

## 1. Real-Time Agent Status Display

### 1.1 State Machine (Industry Standard)

Every agent dashboard must model agents through a finite set of visual states.
The 2026 consensus across GitHub Mobile, Mission Control, and Google Gemini:

| State                | Color           | Icon        | Animation                       | Meaning               |
| -------------------- | --------------- | ----------- | ------------------------------- | --------------------- |
| Idle / Queued        | Gray (#6B7280)  | Clock       | None                            | Waiting to start      |
| Running              | Blue (#3B82F6)  | Pulsing dot | Pulse 0.3-0.8 opacity, 1s cycle | Actively executing    |
| Waiting for Approval | Amber (#F59E0B) | Shield      | Breathing scale 1.0-1.3         | Blocked on human      |
| Completed            | Green (#10B981) | CheckCircle | None (static)                   | Finished successfully |
| Failed               | Red (#EF4444)   | XCircle     | None (static)                   | Error state           |
| Cancelled            | Gray (#9CA3AF)  | SlashCircle | None                            | User-stopped          |

**Pattern**: Use a `PulsingDot` component for running states. The pulsing animation
communicates liveness without being distracting. Reserve static icons for terminal
states (completed, failed, cancelled).

**AGI Workforce implementation** (already correct):

- `AgentStatusBadge.tsx` uses `PulsingDot` for running, static icons for terminal states
- `PairingStatus.tsx` uses pulse animation for "connecting" state
- Color mapping in `AgentCard.tsx` maps to `colors.agentActive/Success/Error/Warning`

### 1.2 Glanceable Status Cards

The card-based layout is the dominant pattern for agent dashboards on mobile in 2026.
Each card should communicate status within 200ms of glancing (the "glanceability" rule).

**Required elements per card (above the fold)**:

1. Status indicator (colored dot or icon) -- top-left or top-right
2. Agent name -- largest text, 13-15pt, semibold
3. Current action (1 line truncated) -- 11-12pt, muted
4. Progress bar -- full width, 4-6px height, rounded
5. Relative timestamp -- bottom-right, 10pt, very muted

**Card size constraints**:

- 2-column grid on phones (< 768pt width)
- 3-column grid on tablets (>= 768pt width)
- Minimum card height: 88pt (fits all 5 elements without scrolling)
- Card padding: 12pt horizontal, 10-12pt vertical
- Inter-card gap: 6-8pt

### 1.3 Progress Visualization

Three tiers of progress display, used contextually:

| Context      | Pattern                            | When                 |
| ------------ | ---------------------------------- | -------------------- |
| Card grid    | Thin bar (4px)                     | Agent list overview  |
| Detail view  | Thick bar (6px) + percentage label | Single agent focus   |
| Notification | Text-only ("Step 3 of 7")          | Lock screen / banner |

**Progress bar colors**: Match agent status color. Use
`backgroundColor: 'rgba(255,255,255,0.08)'` for the track on dark backgrounds.

---

## 2. Approve/Deny Patterns

### 2.1 The Two-Surface Pattern

The 2026 industry standard separates approval into two interaction surfaces:

**Surface 1: Push Notification (fast path)**

- Actionable notification with Approve/Reject inline buttons
- No app launch required -- user long-presses to see actions
- 62% of approvals are handled here (Claude Remote telemetry)
- Must include: tool name, risk level indicator, 1-line description
- Maximum latency: notification must arrive within 2 seconds of request

**Surface 2: Full Modal (detailed path)**

- Bottom sheet modal, slides up from bottom with spring animation
- Shows full context: tool name, description, risk badge, input preview
- Two-step rejection: first tap shows reason input, second confirms
- Haptic feedback on both approve (success) and reject (warning)

### 2.2 Risk-Level Visual Hierarchy

Approvals must be visually differentiated by risk level. Three tiers:

| Risk   | Border Color | Background | Icon        | Haptic                 |
| ------ | ------------ | ---------- | ----------- | ---------------------- |
| Low    | Green/10%    | Green/5%   | ShieldCheck | Light impact           |
| Medium | Amber/30%    | Amber/8%   | Shield      | Medium impact          |
| High   | Red/30%      | Red/8%     | ShieldAlert | Heavy impact + warning |

**Pattern**: High-risk approvals should use a "danger zone" visual treatment --
red-tinted background, larger icon, bolder text, and the approve button should
NOT be green (use neutral/blue instead) to prevent accidental approval.

### 2.3 Approval Queue Management

When multiple approvals stack up:

- Show a count badge on the Agents tab (`Badge label="3" color="red"`)
- Banner at top of agents list: "3 actions need approval" with tap-to-navigate
- Approvals should be orderable by: risk level (high first), then timestamp
- Expired approvals (agent timed out) should show as grayed "Expired" with no actions
- After approval/rejection, animate the card out (FadeOut + slide) and show next

### 2.4 Auto-Approve Toggle

A critical differentiator: let users set per-risk-level auto-approve rules.

```
Auto-approve:
  [ON]  Low-risk actions (read files, search)
  [OFF] Medium-risk actions (write files, API calls)
  [OFF] High-risk actions (delete, system commands)
```

This toggle should be accessible from both the agent detail screen and settings.
Visual: toggle switch with risk-colored accent. When toggled on, show a brief
toast confirming the policy change.

---

## 3. Push Notification Architecture

### 3.1 Notification Categories

Based on Claude Remote and GitHub Mobile patterns, define five notification categories:

| Category          | Priority       | Sound            | Badge    | Actions           |
| ----------------- | -------------- | ---------------- | -------- | ----------------- |
| approval_required | Time-sensitive | Alert tone       | Yes (+1) | Approve, Reject   |
| agent_completed   | Active         | Completion chime | Yes (+1) | View Result       |
| agent_failed      | Active         | Error tone       | Yes (+1) | View Error, Retry |
| agent_progress    | Passive        | None             | No       | (tap to open)     |
| connection_lost   | Active         | Warning tone     | Yes (+1) | Reconnect         |

### 3.2 Notification Content Templates

**Approval Required**:

```
Title: "[Agent Name] needs approval"
Body: "[Tool Name]: [1-line description]"
Actions: [Approve] [Reject]
Category: approval_required (time-sensitive)
```

**Agent Completed**:

```
Title: "[Agent Name] finished"
Body: "Completed [N] steps in [duration]. Tap to review."
Actions: [View Result]
Category: agent_completed
```

**Agent Failed**:

```
Title: "[Agent Name] encountered an error"
Body: "[Error summary, 1 line]"
Actions: [View Error] [Retry]
Category: agent_failed
```

### 3.3 Reliability Engineering

Apple's APNs is "best effort" -- notifications can be dropped. For a developer tool
where missed approval = stalled agent, additional reliability layers are required:

**Server-side state tracking** (from Claude Remote architecture):

1. Every notification gets a unique ID, timestamp, and delivery state
   (pending, sent, acknowledged, expired)
2. When the mobile app receives and displays a notification, it sends an
   acknowledgment back to the desktop companion
3. If no acknowledgment arrives within 30 seconds, the desktop retransmits
4. After 3 failed attempts, fall back to WebSocket in-app alert

**Client-side deduplication**:

- Store last 100 notification IDs in MMKV
- Ignore duplicates (same approval ID)
- Clear stale entries older than 24 hours

### 3.4 iOS Live Activities Integration

GitHub Mobile (Feb 2026) pioneered using iOS Live Activities for agent monitoring:

**Implementation pattern**:

- Start a Live Activity when an agent session begins
- Display on Lock Screen and Dynamic Island: agent name, status, current step
- Update via ActivityKit push notifications (< 4KB payload)
- Live Activity states: In Progress, Completed, Failed, Cancelled
- Tap-through opens the agent detail screen
- Auto-expire after 8 hours (iOS limit)

**Dynamic Island compact view**: Show pulsing dot + agent name (truncated)
**Dynamic Island expanded view**: Status + progress bar + current step text

This is the strongest competitive differentiator available. No competitor currently
combines Live Activities with agent monitoring.

---

## 4. Real-Time Streaming UI

### 4.1 SSE vs WebSocket Selection

For mobile agent dashboards, the hybrid approach is optimal (2026 consensus):

| Channel              | Transport                     | Use Case                            |
| -------------------- | ----------------------------- | ----------------------------------- |
| Agent status updates | WebRTC data channel           | Already paired; low latency         |
| Chat streaming       | SSE (EventSource)             | Unidirectional; auto-reconnect      |
| Approval requests    | WebSocket + push notification | Bidirectional; reliability critical |
| Bulk state sync      | HTTP GET (polling fallback)   | Reconnection recovery               |

### 4.2 React Native Streaming Performance

Key patterns from `react-native-sse` and production streaming apps:

**Buffer-then-flush pattern** (prevents re-render storms):

```typescript
// Buffer incoming tokens in a ref (outside React state)
const bufferRef = useRef<string[]>([]);

// Flush to state once per animation frame
const flush = useCallback(() => {
  if (bufferRef.current.length === 0) return;
  const batch = bufferRef.current.join('');
  bufferRef.current = [];
  setStreamedText((prev) => prev + batch);
}, []);

// Schedule flush on each incoming token
useEffect(() => {
  const frameId = requestAnimationFrame(flush);
  return () => cancelAnimationFrame(frameId);
}, [tokenCount]); // tokenCount increments on each SSE message
```

**Performance targets for mobile streaming**:

- Maximum 16ms per frame (60fps)
- Batch SSE events: flush at most once per rAF cycle
- Use `useRef` for intermediate buffer, `useState` only for display state
- Limit visible streaming text to last ~2000 characters on screen
- Use `FlatList` with `getItemLayout` for tool call lists (avoid dynamic measurement)

### 4.3 Streaming Indicator Design

The pulsing cursor pattern (already implemented in `StreamingIndicator.tsx`) is correct.
Additional streaming indicators for agent context:

| Indicator           | When                    | Visual                        |
| ------------------- | ----------------------- | ----------------------------- |
| Pulsing cursor `\|` | Text is being generated | Amber, 500ms pulse            |
| Typing dots `...`   | Agent is "thinking"     | 3 dots with staggered fade    |
| Spinner             | Tool is executing       | Rotating loader, blue         |
| Progress ring       | Long operation (>5s)    | Circular progress, percentage |

### 4.4 Reconnection UX

When the WebRTC/WebSocket connection drops:

1. **Immediate** (0-2s): Show amber "Reconnecting..." banner at top of screen
2. **Short delay** (2-10s): Add spinner to banner, show attempt count
3. **Extended** (10-30s): Banner turns red, "Connection lost. Retrying..."
4. **Failed** (30s+): Show full-screen overlay with "Reconnect" button + "Go offline" option
5. **Recovery**: Green flash banner "Reconnected", auto-dismiss after 2s, sync missed state

---

## 5. Tool Execution Timeline on Small Screens

### 5.1 Compact Timeline Pattern

Tool execution timelines must adapt aggressively for mobile. The desktop pattern
(full input/output panels) does not work on 375pt screens.

**Three-tier disclosure hierarchy**:

**Tier 1 -- Collapsed (default)**:

```
[StatusIcon] [ToolTypeIcon] tool_name  [Badge: Running]
```

- Single line, 44pt minimum touch target height
- Left border color matches status (3px width)
- Tool type icon (Terminal, FileText, Globe, etc.) for instant recognition
- No input/output visible

**Tier 2 -- Partially expanded (tap)**:

```
[StatusIcon] [ToolTypeIcon] tool_name  [Badge: Completed]
  $ command --flag value                       [2.3s]
```

- Shows command/file path in monospace, truncated to 2 lines
- Shows duration bottom-right
- Still no full input/output

**Tier 3 -- Fully expanded (second tap)**:

```
[StatusIcon] [ToolTypeIcon] tool_name  [Badge: Completed]
  $ command --flag value                       [2.3s]
  INPUT
  ┌─────────────────────────────────────────┐
  │ { "path": "/src/index.ts" }             │
  └─────────────────────────────────────────┘
  OUTPUT
  ┌─────────────────────────────────────────┐
  │ File contents here...                   │
  │ (scrollable, max 200pt height)          │
  └─────────────────────────────────────────┘
```

### 5.2 Tool Icon Mapping

Consistent icon mapping for instant visual recognition (matching Claude Code labels):

| Tool Pattern                   | Icon     | Color            |
| ------------------------------ | -------- | ---------------- |
| bash, shell, terminal, command | Terminal | Green (#10B981)  |
| read_file, file_text           | FileText | Blue (#3B82F6)   |
| write_file, edit, create_file  | Edit3    | Amber (#F59E0B)  |
| web_search, browse, http       | Globe    | Teal (#14B8A6)   |
| code, exec, python             | Code     | Purple (#8B5CF6) |
| delete, remove                 | Trash2   | Red (#EF4444)    |
| (default/unknown)              | Wrench   | Gray (#6B7280)   |

### 5.3 Timeline Scrolling Behavior

- **Auto-scroll**: When agent is running, auto-scroll to latest tool call
- **User override**: If user scrolls up manually, pause auto-scroll
- **Resume indicator**: Show "Jump to latest" floating button when paused
- **Maximum rendered items**: Virtualize with FlashList, keep 50 items in memory
- **Completed agent**: Start at top (so user reads the full timeline)

### 5.4 Grouped Tool Calls

When an agent executes many tools rapidly (common in agentic loops), group them:

```
Step 1: Analyzing codebase                    [completed]
  read_file x3, bash x1                       [4.2s total]

Step 2: Implementing changes                  [running]
  write_file x2, bash x1                      [in progress]
```

This reduces visual noise from 7 individual cards to 2 grouped sections.
Tap to expand shows individual tool calls within each group.

---

## 6. Background Agent Monitoring

### 6.1 The "Leave and Return" Pattern

Mobile users will start an agent task, leave the app, and return later.
This is the defining mobile constraint that desktop apps do not face.

**State preservation requirements**:

1. Agent state persists to MMKV (already done via `agentStore` with zustand persist)
2. On app foreground: request full state sync from desktop via WebRTC
3. If desktop is unreachable: show last-known state with "Last synced: 2m ago" label
4. Stale threshold: after 5 minutes without sync, dim the cards and show warning

### 6.2 Background Fetch Strategy

```
iOS Background Modes:
  - Background Fetch: Poll for agent status every 15-30 minutes (iOS controlled)
  - Push Notifications: For time-sensitive events (approvals, completions, failures)
  - Background Processing: For large state syncs after reconnection

Android Background:
  - WorkManager: Periodic sync every 15 minutes
  - FCM: For all push notifications
  - Foreground Service: Optional persistent notification during active agent session
```

### 6.3 Notification-Driven State Updates

When the app is in the background, notifications carry the state update payload:

```json
{
  "aps": {
    "alert": {
      "title": "Research Agent finished",
      "body": "Completed 12 steps in 3m 24s"
    },
    "badge": 1,
    "content-available": 1
  },
  "agentId": "abc123",
  "status": "completed",
  "progress": 100,
  "stepCount": 12,
  "duration": 204000
}
```

The `content-available: 1` flag triggers a background wake to update local state,
so when the user opens the app, data is already fresh.

### 6.4 Widget Support (Future Enhancement)

iOS WidgetKit / Android Glance widgets for persistent home screen monitoring:

**Small widget (2x2)**:

- Agent count badge: "3 running, 1 needs approval"
- Tap opens agents tab

**Medium widget (4x2)**:

- List of top 3 agents with status dots and progress bars
- "Needs approval" agents pinned to top with red indicator

This is a significant competitive advantage. No AI agent app currently offers
home screen widgets for agent monitoring.

---

## 7. QR Code Pairing UX

### 7.1 The Three-Step Pairing Flow

Based on WhatsApp Web, Telegram Web, and GitHub's mobile-desktop linking:

```
Step 1: SCAN
  Desktop shows QR code in Settings > Mobile Companion
  Mobile app opens camera (full-screen scanner with viewfinder)
  Animated scan line provides visual feedback

Step 2: VERIFY
  After scan: show "Connecting to [Desktop Name]..."
  Connection status: pulsing amber dot
  If WebRTC handshake succeeds: green checkmark animation
  If fails: red X with "Try again" / "Enter code manually"

Step 3: PAIRED
  Success screen with desktop name and connection quality indicator
  "You can now monitor agents from this device"
  Auto-navigate to agents tab after 2 seconds
```

### 7.2 QR Code Display (Desktop Side)

- QR code encodes: `agiw:{pairing_token}` (6-12 alphanumeric characters)
- Token is time-limited (5 minutes), regenerates on expiry
- Show countdown timer below QR: "Expires in 4:23"
- QR size: minimum 200x200px for reliable scanning at arm's length
- Dark background behind QR for contrast
- Include text: "Scan with AGI Workforce mobile app"

### 7.3 Scanner Design (Mobile Side)

Key UX elements (already well-implemented in `QRScanner.tsx`):

1. **Viewfinder**: 70% of screen width, max 280pt, rounded corners
2. **Corner brackets**: Teal-colored corner markers for alignment guidance
3. **Scanning line**: Animated line sweeping top-to-bottom, 2s cycle
4. **Flash toggle**: Top-right, circular button with torch icon
5. **Close button**: Top-left, circular with X icon
6. **Manual entry fallback**: Bottom center, "Enter code manually" link
7. **Overlay dimming**: Black/60% outside viewfinder area

### 7.4 Manual Entry Fallback

For cases where camera is unavailable or QR won't scan:

- Text input: monospace font, center-aligned, letter-spacing: 2
- Format hint: "e.g. agiw:ABC123"
- Auto-capitalize: characters
- Max length: 20 characters
- Validation: alphanumeric only, with `agiw:` prefix optional
- Submit on Enter key or "Connect" button

### 7.5 Reconnection After Pairing

Once paired, the mobile app should:

1. Store the pairing token securely (Keychain/Keystore)
2. Auto-reconnect on app launch without requiring re-scan
3. Show "Reconnecting..." state during WebRTC re-establishment
4. If desktop is offline: show "Desktop appears offline. Waiting..." with retry
5. Allow manual "Forget this desktop" to clear pairing

### 7.6 Multi-Desktop Support (Future)

Pattern: Allow pairing with multiple desktops, switchable via a picker:

```
Connected Desktops:
  [*] Work MacBook Pro (connected)
  [ ] Home iMac (offline)
  [+] Pair new desktop
```

---

## 8. Dashboard Layout Patterns

### 8.1 Information Architecture

The agent dashboard should follow a hub-and-spoke model:

```
Hub: Agents Tab (grid/list of all agents)
  |
  +-- Spoke: Agent Detail (single agent deep-dive)
  |     |-- Overview card (name, model, progress)
  |     |-- Progress section (bar + current step)
  |     |-- Pending approvals (inline approve/reject)
  |     |-- Controls (pause/resume/cancel)
  |     |-- Execution steps (collapsible timeline)
  |     +-- Tool calls (collapsible list)
  |
  +-- Spoke: Approval Queue (all pending approvals)
  |
  +-- Spoke: Agent History (completed/failed agents)
```

### 8.2 Tab Bar Navigation

Bottom tab bar with 4-5 tabs (thumb zone optimized):

| Tab      | Icon          | Badge                                       |
| -------- | ------------- | ------------------------------------------- |
| Chat     | MessageSquare | Unread count                                |
| Agents   | Bot           | Active count (blue) or approval count (red) |
| Projects | FolderKanban  | None                                        |
| Settings | Settings      | Connection dot (colored)                    |

**Badge priority on Agents tab**: If approvals pending, show red badge with count.
Otherwise, show blue badge with active agent count. Never show both simultaneously.

### 8.3 Header Layout

```
┌──────────────────────────────────────────┐
│ Agents                    [3 active]  ✓  │  <- Title + count badge + connection dot
│ ┌──────────────────────────────────────┐ │
│ │ ● Desktop connected to Work MacBook │ │  <- Connection status bar (tappable)
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ ⚠ 2 actions need approval           │ │  <- Approval banner (conditional)
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 8.4 Empty States

Three empty states for the agents tab:

**Not connected**:

```
  [Monitor icon, large, blue/15% bg]
  "Connect your desktop to see agents"
  [Scan QR Code] button (primary)
```

**Connected, no agents**:

```
  [Bot icon, large, blue/15% bg]
  "No active agents"
  "Start a task on your desktop to see it here"
```

**Connected, all completed**:

```
  [CheckCircle icon, large, green/15% bg]
  "All agents finished"
  [Clear completed] button (ghost)
```

### 8.5 Pull-to-Refresh

- Teal-colored refresh indicator
- Sends `request_agents_refresh` via WebRTC to desktop
- 1.5 second minimum display time (prevents jarring flash)
- Only functional when connection status is "connected"
- Shows toast "Not connected" if pulled while disconnected

### 8.6 Responsive Grid

```
Phone Portrait (< 768pt):  2 columns, 6pt gap
Phone Landscape:            3 columns, 8pt gap
Tablet Portrait (>= 768pt): 3 columns, 8pt gap
Tablet Landscape:           4 columns, 10pt gap
```

Use `useWindowDimensions()` to determine layout, not static breakpoints.
FlashList with `numColumns` prop for efficient rendering.

---

## 9. Haptic Feedback Patterns

### 9.1 Haptic Mapping for Agent Actions

Based on Apple HIG and the "semantic haptics" principle (each haptic pattern
should have exactly one meaning throughout the app):

| Action                 | Haptic Type          | Expo API                             |
| ---------------------- | -------------------- | ------------------------------------ |
| Approve action         | Success notification | `Haptics.notificationAsync(Success)` |
| Reject action          | Warning notification | `Haptics.notificationAsync(Warning)` |
| Cancel agent           | Heavy impact         | `Haptics.impactAsync(Heavy)`         |
| Pause/Resume agent     | Medium impact        | `Haptics.impactAsync(Medium)`        |
| QR code scanned        | Light impact         | `Haptics.impactAsync(Light)`         |
| Connection established | Success notification | `Haptics.notificationAsync(Success)` |
| Connection lost        | Error notification   | `Haptics.notificationAsync(Error)`   |
| Pull-to-refresh        | Selection changed    | `Haptics.selectionAsync()`           |
| Toggle auto-approve    | Light impact         | `Haptics.impactAsync(Light)`         |

### 9.2 Haptic Timing Rules

1. **Trigger at state change, not after**: The haptic must fire at the exact moment
   the UI state changes (button press), not after an animation completes.
2. **Never double-fire**: If an action triggers both haptic and visual animation,
   they must be synchronized. Never fire haptic on press AND on completion.
3. **Respect user preference**: Always check `settingsStore.hapticsEnabled` before
   firing. The setting must be a simple toggle in Settings.
4. **Frequency limit**: No more than 3 haptic events per second. If tool calls
   complete rapidly, batch or skip intermediate haptics.

---

## 10. Competitive Reference Implementations

### 10.1 GitHub Mobile -- Live Coding Agent Notifications (Feb 2026)

**What they ship**:

- iOS Live Activities for Copilot coding agent sessions
- States displayed: In Progress, Completed, Failed, Cancelled
- Pull request title and current status on Lock Screen + Dynamic Island
- Tap-through to PR review in-app
- Works for sessions started from desktop, mobile, or CLI

**Lessons for AGI Workforce**:

- Live Activities are the gold standard for agent monitoring on iOS
- Keep the status model simple (4-5 states maximum)
- Tap-through must go directly to the relevant detail screen, not a generic hub

### 10.2 Claude Remote -- Push Notification Approval System

**What they ship**:

- Approval notifications with inline Approve/Reject actions
- 62% of approvals handled without opening the app
- Server-side delivery ledger with acknowledgment protocol
- Retransmission after 30 seconds if no acknowledgment
- Dedicated Mac companion server for notification relay

**Lessons for AGI Workforce**:

- Inline notification actions are critical -- most users never open the app for approvals
- Reliability engineering (acknowledgment + retry) is non-negotiable
- The "notification-only" approval path is the primary UX, not secondary

### 10.3 Google Gemini Agent -- Background Execution with Live View (Feb 2026)

**What they ship**:

- Autonomous multi-step tasks (Uber rides, food delivery, shopping)
- Virtual environment execution -- agent runs apps in a sandboxed window
- "Live view" to watch agent navigate apps in real-time
- Background execution with notification-based progress updates
- Final approval required before submitting orders/confirming actions

**Lessons for AGI Workforce**:

- The "final approval" pattern (agent does everything, human confirms last step)
  builds trust faster than per-step approval
- "Live view" option is powerful -- let users choose between monitoring and ignoring
- Background execution is expected; foreground-only is a dealbreaker

### 10.4 Mission Control -- Open-Source Agent Dashboard

**What they ship**:

- 32-panel dashboard: tasks, agents, skills, logs, tokens, memory, security
- Direct CLI integration with Claude Code session discovery
- GitHub issue sync to task board
- 6 framework adapters (CrewAI, LangGraph, AutoGen, Claude SDK)
- Self-hosted, MIT license, zero telemetry

**Lessons for AGI Workforce**:

- The 32-panel approach is too complex for mobile -- need aggressive prioritization
- Task board metaphor (Kanban) works well for agent orchestration
- Cost tracking per agent/session is a frequently requested feature

### 10.5 Smashing Magazine -- Agentic AI UX Patterns (Feb 2026)

**Key patterns identified**:

1. **Explainable Rationale**: Show the "why" behind agent actions, not just the "what"
2. **Confidence Signal**: Display agent's confidence level alongside its actions
3. **Action Audit Trail**: Every action must be reviewable after the fact (undo/audit)
4. **Escalation Pathway**: Clear path from automated action to human intervention
5. **Agentic Sludge Risk**: Don't make it too easy to approve destructive actions

**Lessons for AGI Workforce**:

- The two-step rejection pattern (tap once to reveal reason input, tap again to confirm)
  prevents accidental rejections -- already implemented in `ApprovalModal.tsx`
- Confidence signals could be added to approval requests (low/medium/high confidence
  badge alongside risk level)
- An audit trail screen showing all past decisions would build trust

---

## 11. Implementation Recommendations

### 11.1 What We Already Have (Strong Foundation)

The current AGI Workforce mobile app already implements many patterns well:

| Component           | File                                     | Assessment                                                      |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| QR Scanner          | `components/companion/QRScanner.tsx`     | Excellent. Viewfinder, scan line, manual entry, flash toggle.   |
| Pairing Status      | `components/companion/PairingStatus.tsx` | Good. Pulsing animation for connecting state.                   |
| Agent Card          | `components/agents/AgentCard.tsx`        | Good. Status color, progress bar, current step, timestamp.      |
| Agent Status Badge  | `components/agents/AgentStatusBadge.tsx` | Good. Pulsing dot for running, static for terminal.             |
| Approval Modal      | `components/shared/ApprovalModal.tsx`    | Excellent. Risk levels, two-step reject, haptics, bottom sheet. |
| Agent Detail        | `app/(app)/agents/[id].tsx`              | Good. Overview, progress, approvals, controls, steps, tools.    |
| Tool Call Card      | `components/chat/ToolCallCard.tsx`       | Good. Icon mapping, expandable I/O, duration display.           |
| Status Step         | `components/chat/StatusStep.tsx`         | Good. Pulsing indicator, progress bar, expandable detail.       |
| Streaming Indicator | `components/chat/StreamingIndicator.tsx` | Good. Pulsing cursor animation.                                 |
| Connection Status   | `components/shared/ConnectionStatus.tsx` | Good. Status bar + minimal dot variant.                         |
| Agent Store         | `stores/agentStore.ts`                   | Good. Persisted to MMKV, WebRTC approval relay.                 |
| Agents Tab          | `app/(app)/(tabs)/agents.tsx`            | Good. Grid, refresh, approval banner, empty state.              |

### 11.2 Priority Gaps to Close

**P0 -- Competitive differentiators (ship first)**:

1. **iOS Live Activities for agent sessions**
   - Start a Live Activity when agent begins, update with progress
   - Show on Lock Screen and Dynamic Island
   - States: In Progress, Completed, Failed, Cancelled
   - This is the single biggest gap vs GitHub Mobile

2. **Push notification approval actions**
   - Register notification categories with Approve/Reject inline actions
   - Handle approval from notification without app launch
   - Implement delivery acknowledgment + retry protocol
   - Target: 60%+ of approvals handled via notification

3. **Background state sync**
   - Use `content-available` silent push for state updates
   - Background fetch for periodic status polling
   - On-foreground full sync with delta resolution

**P1 -- Quality of life (ship second)**:

4. **Reconnection UX**
   - Amber banner -> red banner -> full overlay progression
   - Auto-reconnect with exponential backoff
   - "Last synced: 2m ago" on stale data

5. **Grouped tool calls**
   - Cluster rapid tool calls into step groups
   - "read_file x3, bash x1" summary line
   - Expand to see individual calls

6. **Agent history screen**
   - Past completed/failed agents with timestamps
   - Filterable by status, searchable by name
   - Tap to review full execution timeline

**P2 -- Future enhancements**:

7. **iOS/Android home screen widgets**
   - Small: agent count + approval count
   - Medium: top 3 agents with status and progress

8. **Multi-desktop pairing**
   - Stored desktop list with switch picker
   - Independent agent state per desktop

9. **Cost tracking**
   - Token usage per agent session
   - Cost estimate based on model pricing
   - Running total in agent detail view

10. **Confidence signals on approvals**
    - Agent confidence badge (Low/Medium/High) alongside risk level
    - Rationale text explaining why the agent chose this action

### 11.3 Design Token Reference

Consistent color usage across all agent monitoring surfaces:

```typescript
// Agent status colors (from lib/theme.ts)
agentActive: '#3B82F6'; // Blue -- running state
agentSuccess: '#10B981'; // Green -- completed state
agentError: '#EF4444'; // Red -- failed state
agentWarning: '#F59E0B'; // Amber -- waiting/approval state
agentThinking: '#8B5CF6'; // Purple -- reasoning/thinking

// Surface colors
surfaceBase: '#0A0A0F'; // App background
surfaceElevated: '#1A1A2E'; // Card background
surfaceOverlay: '#16162A'; // Overlay/modal background

// Text hierarchy
textPrimary: '#FFFFFF';
textSecondary: 'rgba(255,255,255,0.6)';
textMuted: 'rgba(255,255,255,0.4)';

// Touch targets (Apple HIG)
minTouchTarget: 44; // points
minSpacing: 8; // points between touch targets
```

### 11.4 Animation Constants

```typescript
// Standard animation durations
FADE_IN: 250; // ms -- content appearing
SLIDE_IN: 300; // ms -- bottom sheets, modals
SPRING_DAMPING: 0.8; // springify() default
STAGGER_DELAY: 80; // ms -- between list item animations

// Pulse animations
PULSE_DURATION: 1000; // ms -- full cycle for running indicators
CURSOR_BLINK: 500; // ms -- streaming cursor cycle
BREATHING: 800; // ms -- connecting state cycle

// Auto-dismiss
TOAST_DURATION: 3000; // ms
SUCCESS_BANNER: 2000; // ms
```

---

## Sources

- [Designing For Agentic AI: Practical UX Patterns For Control, Consent, And Accountability -- Smashing Magazine](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- [Beyond Generative: The Rise Of Agentic AI And User-Centric Design -- Smashing Magazine](https://www.smashingmagazine.com/2026/01/beyond-generative-rise-agentic-ai-user-centric-design/)
- [7 Mobile UX/UI Design Patterns Dominating 2026](https://www.sanjaydey.com/mobile-ux-ui-design-patterns-2026-data-backed/)
- [GitHub Mobile: Track Coding Agent Progress with Live Notifications](https://github.blog/changelog/2026-02-26-github-mobile-track-coding-agent-progress-in-real-time-with-live-notifications/)
- [Push Notifications for AI Coding Workflows -- Claude Remote](https://www.clauderc.com/blog/2026-02-28-push-notifications-for-ai-coding-workflows/)
- [Best iOS Apps for Remote AI Coding Agents 2026 -- Claude Remote](https://clauderc.com/blog/2026-02-28-best-ios-apps-for-remote-ai-coding-agents/)
- [All Features of Happy Coder: Mobile Claude Code Client](https://happy.engineering/docs/features/)
- [Google Gemini Agent: Autonomous Task Execution](https://mlq.ai/news/google-gemini-ai-releases-agentic-features-for-autonomous-task-execution-on-android/)
- [Gemini's Agentic Era -- Multi-Step Tasks on Android](https://www.businesstoday.in/technology/news/story/geminis-agentic-era-is-here-it-can-now-automate-multi-step-tasks-on-android-apps-518098-2026-02-26)
- [Mission Control -- Open-Source Agent Orchestration Dashboard](https://github.com/builderz-labs/mission-control)
- [AI Agent Monitoring Best Practices -- UptimeRobot](https://uptimerobot.com/knowledge-hub/monitoring/ai-agent-monitoring-best-practices-tools-and-metrics/)
- [AI Observability Tools 2026 -- Braintrust](https://www.braintrust.dev/articles/best-ai-observability-tools-2026)
- [Streaming Architecture 2026: SSE vs WebSockets -- JetBI](https://jetbi.com/blog/streaming-architecture-2026-beyond-websockets)
- [Streaming Backends & React: Controlling Re-render Chaos -- SitePoint](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/)
- [Implementing Streaming with EventSource in React Native](https://medium.com/@arpitmalik04/implementing-streaming-data-with-eventsource-in-react-native-b649dd71000e)
- [QR Code Trends 2026](https://qr-verse.com/en/blog/qr-code-trends-2026)
- [Desktop-to-Mobile Handoff: QR Codes in UX](https://dev.to/abdurrahmanhassan/the-desktop-to-mobile-handoff-why-i-stopped-hating-qr-codes-in-my-ux-ohi)
- [QR Code UX Design Considerations -- UXmatters](https://www.uxmatters.com/mt/archives/2023/01/understanding-qr-code-ux-design-considerations.php)
- [iOS Live Activities -- Apple HIG](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- [iOS Live Activities Best Practices -- Pushwoosh](https://www.pushwoosh.com/blog/ios-live-activities/)
- [Android Agentic AI -- Android Developers Blog](https://android-developers.googleblog.com/2026/02/the-intelligent-os-making-ai-agents.html)
- [From Data to Decisions: UX Strategies for Real-Time Dashboards -- Smashing Magazine](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/)
- [Dashboard Design UX Patterns -- Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [PatternFly Dashboard Design Guidelines](https://www.patternfly.org/patterns/dashboard/design-guidelines/)
- [Best Authorization Platforms for AI Agent Permissions 2026 -- WorkOS](https://workos.com/blog/best-authorization-platforms-ai-agent-permissions-2026)
- [Fine-Grained Permissions for AI Applications -- Permit.io](https://www.permit.io/ai-access-control)
- [Haptics UX Design -- Android Open Source Project](https://source.android.com/docs/core/interaction/haptics/haptics-ux-design)
- [2025 Guide to Haptics: Enhancing Mobile UX](https://saropa-contacts.medium.com/2025-guide-to-haptics-enhancing-mobile-ux-with-tactile-feedback-676dd5937774)
- [Mobile App Design Trends 2026 -- UXPilot](https://uxpilot.ai/blogs/mobile-app-design-trends)
