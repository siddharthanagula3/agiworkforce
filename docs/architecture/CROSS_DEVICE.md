# Cross-Device Architecture

_Updated: 2026-03-19 | Wave 5 Feature_

## Overview

Cross-device enables persistent conversation threads that span desktop and mobile, with real-time execution streaming. A user can:

1. Start a task on desktop
2. Monitor it live on mobile via a dashboard showing real-time agent actions
3. Approve/deny tool calls from the mobile app
4. Resume on desktop with full context preserved

The system uses a **signaling server** to coordinate WebRTC data channels between surfaces, with cloud-backed persistent storage for threads and messages.

## Core Concepts

### Cross-Device Thread
A persistent conversation that synchronizes across all paired devices.

```typescript
interface CrossDeviceThread {
  id: string;                    // Cloud-backed thread ID
  userId: string;                // User who owns thread
  title: string;                 // User-assigned title
  deviceIds: string[];           // Paired devices with access
  status: 'active' | 'archived'; // Thread lifecycle
  createdAt: ISO8601;
  lastMessageAt: ISO8601;
  messages: CrossDeviceMessage[];
}
```

### Cross-Device Message
A message within a thread, tagged with device origin and attachments.

```typescript
interface CrossDeviceMessage {
  id: string;
  threadId: string;
  deviceId: string;              // Device that originated this message
  role: 'user' | 'assistant';
  content: string;
  timestamp: ISO8601;
  attachments?: CrossDeviceAttachment[];
}
```

### Device Pairing
QR-code-initiated link between desktop and mobile.

```typescript
interface DevicePairing {
  pairingId: string;             // Temporary pairing session ID
  initiatorDeviceId: string;     // Device showing QR code
  responderDeviceId: string;     // Device scanning QR code
  qrCode: string;                // Base64-encoded QR image
  expiresAt: ISO8601;            // QR valid for 10 minutes
  status: 'pending' | 'confirmed' | 'expired';
}
```

### Execution Stream Event
Real-time update streamed from agent execution on desktop to mobile dashboard.

```typescript
interface ExecutionStreamEvent {
  agentId: string;
  type: 'agent_started' | 'tool_called' | 'tool_result' | 'agent_complete' | 'approval_needed';
  timestamp: ISO8601;
  data: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    toolResult?: unknown;
    approvalRequired?: boolean;
    approvalDeadlineSeconds?: number;
  };
}
```

## Architecture

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Signaling Server | `services/signaling-server/` | WebRTC signaling + message relay |
| Desktop cross-device store | `apps/desktop/src/stores/crossDeviceStore.ts` | Desktop thread state + sync |
| Mobile cross-device store | `apps/mobile/stores/crossDeviceStore.ts` | Mobile thread state + sync |
| Realtime service | `apps/web/features/chat/services/realtime-collaboration.ts` | Cloud subscription + conflict resolution |
| Thread sync service | Cloud backend | Persist threads, manage device subscriptions |

### Data Flow: Desktop → Mobile

```
Desktop Agent Execution
    ↓ (ExecutionStreamEvent)
Tauri event → Desktop store updates local state
    ↓ (WebRTC data channel)
Signaling server forwards to mobile peer
    ↓
Mobile receives ExecutionStreamEvent
    ↓
Mobile store updates dashboard
    ↓
Mobile UI reflects real-time action (tool name, status, result)
```

### Data Flow: Mobile Approval → Desktop

```
Mobile user taps "Approve"
    ↓ (ExecutionStreamEvent with approval)
Mobile WebRTC sends to signaling server
    ↓
Signaling server relays to desktop
    ↓
Desktop receives approval event
    ↓
Agent loop continues (tool call approved)
    ↓
Tool executes, result streamed back to mobile
```

### Persistent Thread Sync

```
Desktop creates new thread
    ↓
Thread ID allocated by cloud
    ↓
Desktop posts message → cloud backend
    ↓
Cloud notifies all paired devices
    ↓
Each device fetches thread update (optimistic + eventual consistency)
    ↓
All devices now show same thread with same messages
```

## Device Pairing Flow

### QR Code Exchange

1. **User initiates pairing on desktop**
   - Desktop generates `DevicePairing` object
   - Server generates QR code (contains signing key + device ID)
   - QR displayed to user

2. **User scans QR on mobile**
   - Mobile extracts pairing ID + device credentials from QR
   - Mobile connects to signaling server with credentials

3. **Signaling server confirms pairing**
   - Server verifies QR credentials
   - Server establishes WebRTC data channel between desktop and mobile
   - Both devices exchange device IDs for future communication

4. **Pairing completes**
   - Devices are now "paired"
   - Future cross-device threads include both in `deviceIds`
   - Either device can initiate new threads visible on both

### Pairing Management

```typescript
interface PairedDevice {
  deviceId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'web';
  signingPublicKey: string;      // For verifying device's messages
  lastSeenAt: ISO8601;
  isPrimary: boolean;
}
```

## Real-Time Synchronization

### WebRTC Data Channel

- **Channel name**: `cross-device-{userId}`
- **Message format**: JSON-serialized `ExecutionStreamEvent` or `CrossDeviceMessage`
- **Retry**: 3 exponential backoff retries on send failure
- **Fallback**: HTTP polling if WebRTC unavailable

### Cloud Sync

- **Persistence layer**: Supabase PostgreSQL with real-time subscriptions
- **Optimistic updates**: Desktop/mobile update UI immediately, then sync to cloud
- **Conflict resolution**: Last-write-wins for messages; merge strategies for agent state
- **Offline mode**: Messages queued locally, synced when connection restored

## Mobile Dashboard

The mobile companion app shows live execution on desktop:

| Feature | Implementation |
|---------|-----------------|
| Agent status | Real-time execution stream with current tool |
| Tool timeline | Scrollable log of all tool calls + results |
| Approval UI | Modal overlay with tool details + Approve/Deny buttons |
| Chat view | Message history in chronological order |
| Agent selector | Quick switch between multiple running agents |

## Security Considerations

1. **Device authentication**: Pairing tokens signed with device private key
2. **Message integrity**: Each message signed and verified before processing
3. **Channel encryption**: WebRTC DTLS encrypts all data channel traffic
4. **Authorization**: Only paired devices can see each other's threads
5. **Timeout protection**: Pairing tokens expire after 10 minutes
6. **Rate limiting**: Cloud API rate-limits per user to prevent DoS

## Dispatch Defense

Prevents rogue agents from executing without user awareness:

1. **Approval gates**: Dangerous agents require mobile approval
2. **Execution timeouts**: Long-running agents auto-cancel after deadline
3. **Resource limits**: Memory/CPU quotas per agent
4. **Audit logging**: All cross-device events logged to user account
5. **Device allowlisting**: User can restrict execution to specific paired devices

## Future Enhancements

- **Web surface support**: Web app as third pairing surface
- **Shared workspaces**: Multiple users collaborate on same thread
- **Agent market**: Browse/install community agents on mobile
- **Offline continuity**: Work offline, auto-sync when reconnected
- **Cross-device handoff**: Seamless task transfer between desktop and mobile
- **Scheduling**: Schedule desktop agents to run at specific times
