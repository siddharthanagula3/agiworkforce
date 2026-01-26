# Backend Examples & Common Scenarios

Practical examples and code snippets for common backend operations in AGI Workforce.

## Table of Contents

- [Authentication Examples](#authentication-examples)
- [Device Management](#device-management)
- [Cross-Device Sync](#cross-device-sync)
- [Credit Management](#credit-management)
- [WebSocket Communication](#websocket-communication)
- [WebRTC Pairing](#webrtc-pairing)
- [Error Handling Patterns](#error-handling-patterns)
- [Testing Examples](#testing-examples)

---

## Authentication Examples

### User Registration and Login

**Complete Authentication Flow:**

```typescript
// 1. Register a new user
async function registerUser(email: string, password: string) {
  const response = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Registration failed');
  }

  const { token, user } = await response.json();

  // Store token in secure storage
  localStorage.setItem('jwt_token', token);

  return { token, user };
}

// 2. Login existing user
async function loginUser(email: string, password: string) {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Login failed');
  }

  const { token, user } = await response.json();
  localStorage.setItem('jwt_token', token);

  return { token, user };
}

// 3. Verify token validity
async function verifyToken(token: string) {
  const response = await fetch('http://localhost:3000/api/auth/verify', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    // Token invalid or expired, need to re-authenticate
    localStorage.removeItem('jwt_token');
    return null;
  }

  const { userId, email } = await response.json();
  return { userId, email };
}

// 4. Create authenticated fetch wrapper
function createAuthFetch(token: string) {
  return async function authFetch(url: string, options: RequestInit = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle token expiration
    if (response.status === 403) {
      localStorage.removeItem('jwt_token');
      throw new Error('Token expired, please login again');
    }

    return response;
  };
}

// Usage
const token = localStorage.getItem('jwt_token')!;
const authFetch = createAuthFetch(token);

const response = await authFetch('http://localhost:3000/api/desktop', {
  method: 'GET',
});
```

---

### Token Refresh Strategy

```typescript
class AuthManager {
  private token: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.token = localStorage.getItem('jwt_token');
    this.scheduleRefresh();
  }

  private scheduleRefresh() {
    if (!this.token) return;

    // Decode JWT to get expiration
    const payload = JSON.parse(atob(this.token.split('.')[1]));
    const expiresAt = payload.exp * 1000; // Convert to milliseconds
    const now = Date.now();

    // Refresh 1 hour before expiration
    const refreshAt = expiresAt - 60 * 60 * 1000;
    const delay = refreshAt - now;

    if (delay > 0) {
      this.refreshTimer = setTimeout(() => this.refresh(), delay);
    }
  }

  private async refresh() {
    // AGI Workforce doesn't have refresh endpoint
    // Re-authenticate with stored credentials or prompt user
    console.log('Token expiring soon, please re-authenticate');

    // Option 1: Emit event for UI to show login prompt
    window.dispatchEvent(new CustomEvent('auth:refresh-needed'));

    // Option 2: If credentials stored securely, auto-refresh
    // const newToken = await this.reAuthenticate();
  }

  async logout() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    localStorage.removeItem('jwt_token');
    this.token = null;
  }
}
```

---

## Device Management

### Desktop Device Registration

```typescript
interface DesktopDevice {
  id: string;
  name: string;
  platform: 'macos' | 'windows' | 'linux';
  version: string;
  online: boolean;
  lastSeen: number;
}

async function registerDesktop(
  token: string,
  name: string,
  platform: 'macos' | 'windows' | 'linux',
  version: string,
): Promise<string> {
  const response = await fetch('http://localhost:3000/api/desktop/register', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, platform, version }),
  });

  if (!response.ok) {
    throw new Error('Failed to register desktop');
  }

  const { desktopId } = await response.json();

  // Store device ID for future use
  localStorage.setItem('desktop_id', desktopId);

  return desktopId;
}

// List all desktop devices
async function listDesktops(token: string): Promise<DesktopDevice[]> {
  const response = await fetch('http://localhost:3000/api/desktop', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error('Failed to list desktops');
  }

  const { desktops } = await response.json();
  return desktops;
}

// Get specific desktop status
async function getDesktopStatus(token: string, desktopId: string): Promise<DesktopDevice> {
  const response = await fetch(`http://localhost:3000/api/desktop/${desktopId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error('Failed to get desktop status');
  }

  return response.json();
}

// Heartbeat to keep desktop online
class DesktopHeartbeat {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private token: string,
    private desktopId: string,
    private intervalMs: number = 30000, // 30 seconds
  ) {}

  start() {
    this.sendHeartbeat(); // Send immediately
    this.intervalId = setInterval(() => {
      this.sendHeartbeat();
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async sendHeartbeat() {
    try {
      const response = await fetch(
        `http://localhost:3000/api/desktop/${this.desktopId}/heartbeat`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` },
        },
      );

      if (!response.ok) {
        console.error('Heartbeat failed:', response.status);
      }
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  }
}

// Usage
const heartbeat = new DesktopHeartbeat(token, desktopId);
heartbeat.start();

// Stop when app closes
window.addEventListener('beforeunload', () => {
  heartbeat.stop();
});
```

---

### Mobile Device Registration with Push Tokens

```typescript
import * as Notifications from 'expo-notifications';

async function registerMobileDevice(token: string) {
  // 1. Get device info
  const deviceName = await getDeviceName(); // e.g., "iPhone 15 Pro"
  const platform = Platform.OS; // "ios" or "android"

  // 2. Request push notification permission
  const { status } = await Notifications.requestPermissionsAsync();
  let pushToken: string | null = null;

  if (status === 'granted') {
    const token = await Notifications.getExpoPushTokenAsync();
    pushToken = token.data;
  }

  // 3. Generate or retrieve client ID
  let clientId = await AsyncStorage.getItem('device_client_id');
  if (!clientId) {
    clientId = uuid.v4();
    await AsyncStorage.setItem('device_client_id', clientId);
  }

  // 4. Register with backend
  const response = await fetch('http://localhost:3000/api/mobile/register', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId,
      platform: `${Platform.OS} ${Platform.Version}`,
      name: deviceName,
      pushToken,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to register mobile device');
  }

  const { deviceId } = await response.json();
  await AsyncStorage.setItem('device_id', deviceId);

  return deviceId;
}

// Update push token when it changes
async function updatePushToken(token: string, deviceId: string, pushToken: string) {
  const response = await fetch('http://localhost:3000/api/mobile/push-token', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ deviceId, pushToken }),
  });

  if (!response.ok) {
    throw new Error('Failed to update push token');
  }
}
```

---

## Cross-Device Sync

### Syncing Conversations Between Devices

```typescript
interface SyncItem {
  id: string;
  entity_type: string;
  entity_id: string;
  action: 'Create' | 'Update' | 'Delete';
  data: string; // JSON string
  timestamp: string;
  retry_count: number;
  synced: boolean;
  error?: string | null;
}

class SyncManager {
  private pendingItems: SyncItem[] = [];
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(
    private token: string,
    private deviceId: string,
    private userId: string,
  ) {}

  // Add item to sync queue
  addItem(
    entityType: string,
    entityId: string,
    action: 'Create' | 'Update' | 'Delete',
    data: object,
  ) {
    const item: SyncItem = {
      id: uuid.v4(),
      entity_type: entityType,
      entity_id: entityId,
      action,
      data: JSON.stringify(data),
      timestamp: new Date().toISOString(),
      retry_count: 0,
      synced: false,
    };

    this.pendingItems.push(item);

    // Trigger immediate sync if not already syncing
    if (!this.syncInterval) {
      this.syncNow();
    }
  }

  // Start periodic sync
  startPeriodicSync(intervalMs: number = 30000) {
    this.syncInterval = setInterval(() => {
      this.syncNow();
    }, intervalMs);
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Sync now
  async syncNow() {
    if (this.pendingItems.length === 0) return;

    // Batch sync (max 100 items)
    const batch = this.pendingItems.slice(0, 100);

    try {
      const response = await fetch('http://localhost:3000/api/sync/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'X-Device-Id': this.deviceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: batch,
          device_id: this.deviceId,
          user_id: this.userId,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      const result = await response.json();

      // Remove synced items
      this.pendingItems = this.pendingItems.filter((item) => !result.synced_ids.includes(item.id));

      // Handle conflicts
      for (const conflict of result.conflicts) {
        await this.handleConflict(conflict);
      }

      // Retry failed items
      for (const failedId of result.failed_ids) {
        const item = this.pendingItems.find((i) => i.id === failedId);
        if (item) {
          item.retry_count++;
          if (item.retry_count >= 3) {
            // Remove after 3 failed attempts
            this.pendingItems = this.pendingItems.filter((i) => i.id !== failedId);
            console.error('Sync item failed after 3 retries:', item);
          }
        }
      }
    } catch (error) {
      console.error('Sync error:', error);
    }
  }

  // Handle sync conflicts
  private async handleConflict(conflict: any) {
    console.log('Conflict detected:', conflict);

    // Strategy 1: Last write wins (accept remote)
    const remoteData = JSON.parse(conflict.remote_data);
    // Apply remote data locally

    // Strategy 2: Manual resolution (show UI to user)
    // this.showConflictUI(conflict);

    // Strategy 3: Merge strategies (custom logic)
    // const merged = this.mergeConflict(localData, remoteData);
  }

  // Pull updates from server
  async pullUpdates(sinceTimestamp: string) {
    const response = await fetch(`http://localhost:3000/api/sync/updates?since=${sinceTimestamp}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'X-Device-Id': this.deviceId,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to pull updates');
    }

    const updates = await response.json();

    // Apply updates locally
    for (const update of updates) {
      await this.applyUpdate(update);
    }
  }

  private async applyUpdate(update: any) {
    const data = JSON.parse(update.data);

    switch (update.entity_type) {
      case 'conversation':
        await this.updateConversation(update.entity_id, data);
        break;
      case 'message':
        await this.updateMessage(update.entity_id, data);
        break;
      // ... other entity types
    }
  }

  private async updateConversation(id: string, data: any) {
    // Update local database/state
    console.log('Updating conversation:', id, data);
  }

  private async updateMessage(id: string, data: any) {
    // Update local database/state
    console.log('Updating message:', id, data);
  }
}

// Usage
const syncManager = new SyncManager(token, deviceId, userId);
syncManager.startPeriodicSync(30000); // Sync every 30 seconds

// When user creates a conversation
syncManager.addItem('conversation', conversationId, 'Create', {
  title: 'My Conversation',
  created_at: Date.now(),
});

// When user updates a message
syncManager.addItem('message', messageId, 'Update', {
  content: 'Updated message text',
  updated_at: Date.now(),
});

// Pull updates on app resume
const lastSyncTime = localStorage.getItem('last_sync_time') || new Date(0).toISOString();
await syncManager.pullUpdates(lastSyncTime);
localStorage.setItem('last_sync_time', new Date().toISOString());
```

---

## Credit Management

### Checking and Deducting Credits

```typescript
interface CreditBalance {
  has_credits: boolean;
  account_id: string | null;
  credits_allocated_cents: number;
  credits_used_cents: number;
  credits_remaining_cents: number;
  daily_limit_cents: number;
  daily_used_cents: number;
  daily_remaining_cents: number;
  period_start: string | null;
  period_end: string | null;
}

// Get current credit balance
async function getCreditBalance(token: string): Promise<CreditBalance> {
  const response = await fetch('http://localhost:3000/api/credits/balance', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error('Failed to get credit balance');
  }

  return response.json();
}

// Check if user has enough credits
async function checkCredits(token: string, amountCents: number): Promise<boolean> {
  const response = await fetch('http://localhost:3000/api/credits/check', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount_cents: amountCents }),
  });

  if (!response.ok) {
    return false;
  }

  const { available } = await response.json();
  return available;
}

// Deduct credits for LLM usage
async function deductCredits(
  token: string,
  amountCents: number,
  model: string,
  inputTokens: number,
  outputTokens: number,
  conversationId?: string,
): Promise<{ success: boolean; remaining: number }> {
  // Generate idempotency key (conversation + timestamp)
  const idempotencyKey = `${conversationId || 'default'}-${Date.now()}`;

  const response = await fetch('http://localhost:3000/api/credits/deduct', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount_cents: amountCents,
      description: `LLM usage: ${model}`,
      metadata: {
        model,
        provider: 'anthropic',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        conversation_id: conversationId,
      },
      idempotency_key: idempotencyKey,
    }),
  });

  const result = await response.json();

  if (response.status === 402) {
    // Insufficient credits
    throw new Error(result.error || 'Insufficient credits');
  }

  if (!response.ok) {
    throw new Error('Failed to deduct credits');
  }

  return {
    success: result.success,
    remaining: result.remaining_cents,
  };
}

// Complete LLM request flow with credit handling
async function sendLLMRequest(
  token: string,
  prompt: string,
  model: string = 'claude-3-sonnet',
): Promise<string> {
  // 1. Estimate cost (rough estimate, adjust based on actual pricing)
  const estimatedInputTokens = Math.ceil(prompt.length / 4);
  const estimatedCostCents = Math.ceil(estimatedInputTokens * 0.003); // $0.003 per 1K tokens

  // 2. Check if user has enough credits
  const hasCredits = await checkCredits(token, estimatedCostCents);
  if (!hasCredits) {
    throw new Error('Insufficient credits for this request');
  }

  // 3. Make LLM request (via desktop app or direct API)
  const response = await callLLMAPI(prompt, model);

  // 4. Calculate actual cost
  const actualInputTokens = response.usage.input_tokens;
  const actualOutputTokens = response.usage.output_tokens;
  const actualCostCents = calculateCost(model, actualInputTokens, actualOutputTokens);

  // 5. Deduct actual credits
  try {
    await deductCredits(
      token,
      actualCostCents,
      model,
      actualInputTokens,
      actualOutputTokens,
      response.conversationId,
    );
  } catch (error) {
    console.error('Failed to deduct credits:', error);
    // Log for manual reconciliation
  }

  return response.content;
}

// Calculate cost based on model pricing
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Pricing in cents per 1K tokens
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-3-opus': { input: 1.5, output: 7.5 },
    'claude-3-sonnet': { input: 0.3, output: 1.5 },
    'claude-3-haiku': { input: 0.025, output: 0.125 },
    'gpt-4': { input: 3.0, output: 6.0 },
    'gpt-3.5-turbo': { input: 0.05, output: 0.15 },
  };

  const modelPricing = pricing[model] || pricing['claude-3-sonnet'];
  const inputCost = (inputTokens / 1000) * modelPricing.input;
  const outputCost = (outputTokens / 1000) * modelPricing.output;

  return Math.ceil(inputCost + outputCost); // Round up to nearest cent
}

// Display credit balance to user
function formatCreditBalance(balance: CreditBalance): string {
  if (!balance.has_credits) {
    return 'No credits available';
  }

  const dollars = balance.credits_remaining_cents / 100;
  const dailyRemaining = balance.daily_remaining_cents / 100;

  return `$${dollars.toFixed(2)} remaining (Daily: $${dailyRemaining.toFixed(2)})`;
}
```

---

## WebSocket Communication

### Desktop Client WebSocket Connection

```typescript
class DesktopWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  constructor(
    private token: string,
    private deviceId: string,
    private onCommand: (command: any) => void,
  ) {}

  connect() {
    this.ws = new WebSocket('ws://localhost:3000/ws');

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;

      // Authenticate
      this.send({
        type: 'auth',
        token: this.token,
        deviceId: this.deviceId,
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.reconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // Start ping interval
    this.startPingInterval();
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'auth_success':
        console.log('Authenticated as:', message.userId);
        break;

      case 'auth_error':
        console.error('Auth failed:', message.error);
        this.ws?.close();
        break;

      case 'command':
        console.log('Received command:', message);
        this.onCommand(message);
        break;

      case 'sync':
        console.log('Received sync:', message);
        // Handle sync data
        break;

      case 'pong':
        console.log('Pong received');
        break;

      case 'error':
        console.error('Server error:', message.error);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  private startPingInterval() {
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000); // Every 30 seconds
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket not connected, cannot send:', data);
    }
  }

  disconnect() {
    this.ws?.close();
  }
}

// Usage
const wsClient = new DesktopWebSocketClient(token, deviceId, (command) => {
  // Handle incoming commands
  switch (command.commandType) {
    case 'chat':
      handleChatCommand(command.payload);
      break;
    case 'automation':
      handleAutomationCommand(command.payload);
      break;
    case 'query':
      handleQueryCommand(command.payload);
      break;
  }
});

wsClient.connect();

// Cleanup on app close
window.addEventListener('beforeunload', () => {
  wsClient.disconnect();
});
```

---

### Sending Commands from Mobile to Desktop

```typescript
// Send command via REST API
async function sendCommandToDesktop(
  token: string,
  desktopId: string,
  commandType: 'chat' | 'automation' | 'query',
  payload: any,
): Promise<{ status: string; commandId: string }> {
  const response = await fetch(`http://localhost:3000/api/desktop/${desktopId}/command`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: commandType,
      payload,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to send command');
  }

  const result = await response.json();
  return {
    status: result.status, // 'delivered', 'queued', or 'failed'
    commandId: result.commandId,
  };
}

// Example: Send chat message from mobile to desktop
async function sendChatMessage(token: string, desktopId: string, message: string) {
  const result = await sendCommandToDesktop(token, desktopId, 'chat', {
    message,
    conversationId: uuid.v4(),
    model: 'claude-3-sonnet',
    temperature: 0.7,
  });

  if (result.status === 'delivered') {
    console.log('Message delivered to desktop');
  } else if (result.status === 'queued') {
    console.log('Desktop offline, message queued');
  } else {
    console.error('Failed to send message');
  }
}

// Example: Start automation workflow
async function startWorkflow(
  token: string,
  desktopId: string,
  workflowId: string,
  parameters: Record<string, any>,
) {
  return sendCommandToDesktop(token, desktopId, 'automation', {
    action: 'run',
    workflowId,
    parameters,
    timeout: 60000,
  });
}
```

---

## WebRTC Pairing

### Complete Device Pairing Flow

```typescript
// Mobile side - Request pairing code and display
async function initiatePairing(token: string): Promise<string> {
  // 1. Request pairing code from API Gateway
  const response = await fetch('http://localhost:3000/api/mobile/pairing-code', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ttlSeconds: 300 }) // 5 minutes
  });

  if (!response.ok) {
    throw new Error('Failed to get pairing code');
  }

  const { code, qrData, signaling } = await response.json();

  // 2. Display code to user (QR code + text)
  displayPairingCode(code, qrData);

  // 3. Connect to signaling server
  const peerConnection = await connectSignalingServer(
    signaling.wsUrl,
    code,
    'mobile'
  );

  return code;
}

// Desktop side - Enter code and connect
async function connectWithCode(code: string): Promise<RTCPeerConnection> {
  // 1. Connect to signaling server
  const signalingWs = new WebSocket('ws://localhost:4000/ws');

  return new Promise((resolve, reject) => {
    let peerConnection: RTCPeerConnection;

    signalingWs.onopen = () => {
      // 2. Register with code
      signalingWs.send(JSON.stringify({
        type: 'register',
        code: code.toUpperCase(),
        role: 'desktop',
        metadata: {
          deviceName: 'MacBook Pro',
          platform: 'macos'
        }
      }));
    };

    signalingWs.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'registered':
          console.log('Registered with code:', message.code);
          // Create peer connection
          peerConnection = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' }
            ]
          });

          // Setup ICE candidate handling
          peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
              signalingWs.send(JSON.stringify({
                type: 'signal',
                kind: 'ice',
                payload: event.candidate.toJSON()
              }));
            }
          };
          break;

        case 'peer_ready':
          console.log('Peer ready:', message.role);
          // Desktop creates offer
          if (message.role === 'mobile') {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            signalingWs.send(JSON.stringify({
              type: 'signal',
              kind: 'offer',
              payload: {
                type: offer.type,
                sdp: offer.sdp
              }
            }));
          }
          break;

        case 'signal':
          await handleSignal(peerConnection, message, signalingWs);
          break;

        case 'peer_left':
          console.log('Peer disconnected');
          peerConnection.close();
          signalingWs.close();
          reject(new Error('Peer disconnected'));
          break;

        case 'error':
          console.error('Signaling error:', message.error);
          reject(new Error(message.error));
          break;
      }
    };

    // Monitor connection state
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        console.log('P2P connection established');
        signalingWs.close(); // Can disconnect from signaling
        resolve(peerConnection);
      }
    };
  });
}

// Handle WebRTC signals
async function handleSignal(
  pc: RTCPeerConnection,
  message: any,
  ws: WebSocket
) {
  const { kind, payload } = message;

  switch (kind) {
    case 'offer':
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      ws.send(JSON.stringify({
        type: 'signal',
        kind: 'answer',
        payload: {
          type: answer.type,
          sdp: answer.sdp
        }
      }));
      break;

    case 'answer':
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      break;

    case 'ice':
      if (payload.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(payload));
      }
      break;
  }
}

// Create data channel for communication
function setupDataChannel(pc: RTCPeerConnection): RTCDataChannel {
  const dataChannel = pc.createDataChannel('sync', {
    ordered: true,
    maxRetransmits: 3
  });

  dataChannel.onopen = () => {
    console.log('Data channel open');
  };

  dataChannel.onmessage = (event) => {
    console.log('Received:', event.data);
    const message = JSON.parse(event.data);
    // Handle message
  };

  dataChannel.onerror = (error) => {
    console.error('Data channel error:', error);
  };

  return dataChannel;
}

// Usage - Mobile initiates pairing
const code = await initiatePairing(token);
console.log('Share this code with desktop:', code);

// Usage - Desktop connects with code
const peerConnection = await connectWithCode('A3B7C9D2');
const dataChannel = setupDataChannel(peerConnection);

// Send data over P2P connection
dataChannel.send(JSON.stringify({
  type: 'sync',
  data: { ... }
}));
```

---

## Error Handling Patterns

### Comprehensive Error Handler

```typescript
class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(url, options);

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
      throw new APIError('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
    }

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      throw new APIError('Authentication failed', response.status, 'AUTH_FAILED');
    }

    // Handle insufficient credits
    if (response.status === 402) {
      const body = await response.json();
      throw new APIError(body.error || 'Insufficient credits', 402, 'INSUFFICIENT_CREDITS', body);
    }

    // Handle other errors
    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = { error: response.statusText };
      }

      throw new APIError(
        errorBody.error || 'Request failed',
        response.status,
        errorBody.code,
        errorBody,
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    // Network errors
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new APIError('Network error', 0, 'NETWORK_ERROR');
    }

    throw error;
  }
}

// Usage with error handling
async function handleAPICall() {
  try {
    const result = await apiRequest('/api/credits/deduct', {
      method: 'POST',
      body: JSON.stringify({ amount_cents: 1000 }),
    });

    console.log('Success:', result);
  } catch (error) {
    if (error instanceof APIError) {
      switch (error.code) {
        case 'RATE_LIMIT_EXCEEDED':
          const retryAfter = error.details.retryAfter;
          console.log(`Rate limited. Retry after ${retryAfter} seconds`);
          setTimeout(() => handleAPICall(), retryAfter * 1000);
          break;

        case 'AUTH_FAILED':
          console.log('Authentication failed. Please login again.');
          // Redirect to login
          break;

        case 'INSUFFICIENT_CREDITS':
          console.log('Not enough credits. Please purchase more.');
          // Show upgrade modal
          break;

        case 'NETWORK_ERROR':
          console.log('Network error. Check your connection.');
          // Show offline UI
          break;

        default:
          console.error('API Error:', error.message);
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}
```

---

## Testing Examples

### Unit Testing API Endpoints (Vitest)

```typescript
import { describe, it, expect, beforeAll } from 'vitest';

describe('Authentication API', () => {
  let token: string;

  beforeAll(async () => {
    // Register test user
    const response = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test-${Date.now()}@example.com`,
        password: 'TestPassword123',
      }),
    });

    const data = await response.json();
    token = data.token;
  });

  it('should verify valid token', async () => {
    const response = await fetch('http://localhost:3000/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.valid).toBe(true);
    expect(data.userId).toBeDefined();
  });

  it('should reject invalid token', async () => {
    const response = await fetch('http://localhost:3000/api/auth/verify', {
      headers: { Authorization: 'Bearer invalid-token' },
    });

    expect(response.status).toBe(403);
  });
});

describe('Desktop Device API', () => {
  let token: string;
  let desktopId: string;

  beforeAll(async () => {
    // Login
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'TestPassword123',
      }),
    });

    const data = await response.json();
    token = data.token;
  });

  it('should register desktop device', async () => {
    const response = await fetch('http://localhost:3000/api/desktop/register', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test MacBook',
        platform: 'macos',
        version: '1.0.0',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.desktopId).toBeDefined();
    desktopId = data.desktopId;
  });

  it('should list desktop devices', async () => {
    const response = await fetch('http://localhost:3000/api/desktop', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.desktops).toBeInstanceOf(Array);
    expect(data.desktops.length).toBeGreaterThan(0);
  });
});
```

---

### Integration Testing with Mock WebSocket

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WebSocket, Server } from 'mock-socket';

describe('WebSocket Communication', () => {
  let mockServer: Server;
  let client: WebSocket;

  beforeEach(() => {
    mockServer = new Server('ws://localhost:3000/ws');
    client = new WebSocket('ws://localhost:3000/ws');
  });

  afterEach(() => {
    mockServer.stop();
    client.close();
  });

  it('should authenticate successfully', (done) => {
    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const message = JSON.parse(data as string);

        if (message.type === 'auth') {
          socket.send(
            JSON.stringify({
              type: 'auth_success',
              userId: 'test-user-id',
            }),
          );
        }
      });
    });

    client.onopen = () => {
      client.send(
        JSON.stringify({
          type: 'auth',
          token: 'test-token',
          deviceId: 'test-device-id',
        }),
      );
    };

    client.onmessage = (event) => {
      const message = JSON.parse(event.data);
      expect(message.type).toBe('auth_success');
      expect(message.userId).toBe('test-user-id');
      done();
    };
  });

  it('should receive commands', (done) => {
    mockServer.on('connection', (socket) => {
      // Simulate server sending command
      setTimeout(() => {
        socket.send(
          JSON.stringify({
            type: 'command',
            commandId: 'cmd-123',
            commandType: 'chat',
            payload: { message: 'Hello' },
            timestamp: Date.now(),
          }),
        );
      }, 100);
    });

    client.onmessage = (event) => {
      const message = JSON.parse(event.data);
      expect(message.type).toBe('command');
      expect(message.commandType).toBe('chat');
      expect(message.payload.message).toBe('Hello');
      done();
    };
  });
});
```

---

## Summary

These examples cover the most common backend operations:

1. **Authentication**: Registration, login, token management
2. **Device Management**: Desktop/mobile registration, heartbeat, status
3. **Sync**: Cross-device synchronization with conflict handling
4. **Credits**: Balance checking, deduction with idempotency
5. **WebSocket**: Real-time command delivery and synchronization
6. **WebRTC**: Peer-to-peer device pairing flow
7. **Error Handling**: Comprehensive error handling patterns
8. **Testing**: Unit and integration tests

For production deployments, consider:

- Implementing retry logic with exponential backoff
- Adding offline support with queue persistence
- Implementing comprehensive logging and monitoring
- Using TypeScript for type safety
- Adding comprehensive test coverage

See [API_REFERENCE.md](./API_REFERENCE.md) and [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) for more details.
