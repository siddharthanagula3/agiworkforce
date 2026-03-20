# Push Notifications Implementation Guide for AGI Workforce Mobile

> Comprehensive guide for push notifications in an AI agent companion app.
> Covers expo-notifications setup, APNs/FCM credentials, rich notifications, background sync,
> notification channels, deep linking, permission UX, and rate limiting.
> Researched March 2026 against Expo SDK 55, iOS 18+, Android 14+.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Installation and Configuration](#2-installation-and-configuration)
3. [APNs and FCM Credential Setup](#3-apns-and-fcm-credential-setup)
4. [Permission Request UX Patterns](#4-permission-request-ux-patterns)
5. [Notification Channels and Categories](#5-notification-channels-and-categories)
6. [Rich Push Notifications](#6-rich-push-notifications)
7. [Deep Linking from Notifications](#7-deep-linking-from-notifications)
8. [Background and Silent Push Notifications](#8-background-and-silent-push-notifications)
9. [Server-Side Sending](#9-server-side-sending)
10. [Rate Limiting and User Preferences](#10-rate-limiting-and-user-preferences)
11. [Testing and Debugging](#11-testing-and-debugging)
12. [Production Checklist](#12-production-checklist)

---

## 1. Architecture Overview

### Push Notification Flow

```
Desktop Agent completes task
        |
        v
API Gateway (services/api-gateway)
        |
        v
Expo Push Service (https://exp.host/--/api/v2/push/send)
        |
        +--> APNs (iOS)
        +--> FCM (Android)
        |
        v
Mobile Device receives notification
        |
        +--> App Foreground: NotificationHandler decides display
        +--> App Background: OS displays, tapping fires responseListener
        +--> App Killed: OS displays, cold-start handler routes on open
```

### Notification Types for AI Agent Apps

| Event                    | Priority | Channel          | Rich Content | Action Buttons |
| ------------------------ | -------- | ---------------- | ------------ | -------------- |
| Agent needs approval     | MAX      | agent-approvals  | No           | Approve/Deny   |
| Task completed           | DEFAULT  | tasks            | Screenshot   | View/Dismiss   |
| Schedule triggered       | DEFAULT  | tasks            | No           | Open           |
| Chat message received    | HIGH     | default          | No           | Reply          |
| Desktop companion paired | LOW      | companion-status | No           | No             |
| Agent error/failure      | HIGH     | agent-approvals  | No           | View Log       |
| Background sync done     | MIN      | sync             | No           | No             |

### Current Codebase State

The mobile app already has a working foundation in these files:

- `services/notifications.ts` -- Token registration, foreground handler, response routing
- `app/_layout.tsx` -- Notification listener setup on auth, cold-start handling
- `app.json` -- expo-notifications plugin configured with icon and color
- `stores/agentStore.ts` -- Agent status/approval state (notification target)
- `services/api-gateway/src/routes/mobile.ts` -- Push token storage endpoint
- `types/navigation.ts` -- Typed route params for deep linking

---

## 2. Installation and Configuration

### Dependencies

Already installed in `package.json`:

```json
{
  "expo-notifications": "~55.0.13",
  "expo-constants": "~55.0.8",
  "expo-task-manager": "~55.0.10"
}
```

### app.json Plugin Configuration

Current configuration in `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#6366f1",
          "androidMode": "default",
          "projectId": "00000000-0000-0000-0000-agiworkforce"
        }
      ]
    ]
  }
}
```

**Recommended additions** for background notifications and custom sounds:

```json
[
  "expo-notifications",
  {
    "icon": "./assets/notification-icon.png",
    "color": "#6366f1",
    "defaultChannel": "default",
    "sounds": ["./assets/sounds/approval-urgent.wav", "./assets/sounds/task-complete.wav"],
    "enableBackgroundRemoteNotifications": true
  }
]
```

Key configuration properties:

- `icon`: Android only. Must be a 96x96 all-white PNG with transparency. Tinted by `color` at display time.
- `color`: Android notification icon tint color.
- `defaultChannel`: Android FCM v1 default channel ID. Must match a channel created via `setNotificationChannelAsync`.
- `sounds`: Array of `.wav` files bundled into the app binary. Referenced by filename in channel config.
- `enableBackgroundRemoteNotifications`: iOS only. Adds `remote-notification` to `UIBackgroundModes`, allowing headless background notification processing.

### iOS Info.plist Additions

For background notifications on iOS, add to `app.json` under `expo.ios.infoPlist`:

```json
{
  "UIBackgroundModes": ["remote-notification", "fetch"]
}
```

### Android Permissions

Android 13+ (API 33+) requires `POST_NOTIFICATIONS` permission. Expo handles this automatically when you call `requestPermissionsAsync()`, but you should add it to the permissions array for clarity:

```json
{
  "android": {
    "permissions": ["POST_NOTIFICATIONS", "RECEIVE_BOOT_COMPLETED", "VIBRATE"]
  }
}
```

---

## 3. APNs and FCM Credential Setup

### Android: Firebase Cloud Messaging (FCM v1)

1. **Create a Firebase project** at https://console.firebase.google.com
2. **Add an Android app** with package name `com.agiworkforce.app`
3. **Download** `google-services.json` and place it at the project root (already referenced in `eas.json` submit config)
4. **Configure FCM v1 credentials** in EAS:

```bash
# Interactive credential setup
eas credentials

# Or during build (auto-prompts for missing credentials)
eas build --platform android --profile preview
```

5. **Upload the FCM V1 service account key** via EAS Dashboard:
   - Go to https://expo.dev > Project > Credentials > Android > FCM V1
   - Upload the service account JSON key from Firebase Console > Project Settings > Cloud Messaging

### iOS: Apple Push Notification Service (APNs)

1. **Apple Developer Account** (paid, $99/year) is required
2. **Register your device** for development builds before first `eas build`
3. **Configure APNs** through EAS:

```bash
# EAS handles APNs key generation and upload automatically
eas build --platform ios --profile development

# Or manage credentials manually
eas credentials --platform ios
```

4. **APNs Key (.p8 file)**: EAS can generate this for you, or you can upload an existing key from Apple Developer Portal > Certificates, Identifiers & Profiles > Keys

### EAS Build Profiles

The current `eas.json` is correctly configured. For push notification testing, use the `preview` profile (not `development` with simulator, since push notifications require a physical device):

```json
{
  "preview": {
    "distribution": "internal",
    "channel": "preview",
    "ios": {
      "simulator": false,
      "buildConfiguration": "Release"
    }
  }
}
```

---

## 4. Permission Request UX Patterns

### The Problem

- iOS opt-in rate: ~51%. If the user taps "Don't Allow", the system dialog never appears again. The only recourse is Settings > Notifications > Your App.
- Android opt-in rate: ~81%. Android 13+ shows a runtime permission dialog similar to iOS.

### Best Practice: Pre-Permission Screen ("Soft Ask")

Never show the system permission dialog on first launch. Instead, show a custom in-app screen that explains the value, then trigger the system dialog only if the user agrees.

**Implementation for AGI Workforce:**

```tsx
// components/notifications/NotificationPermissionSheet.tsx

import { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Bell, BellOff, Shield, Zap } from 'lucide-react-native';
import { storage } from '@/lib/mmkv';

interface Props {
  onComplete: (granted: boolean) => void;
}

export function NotificationPermissionSheet({ onComplete }: Props) {
  const [isRequesting, setIsRequesting] = useState(false);

  const handleEnable = async () => {
    setIsRequesting(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      const granted = status === 'granted';
      storage.set('notification-permission-asked', 'true');
      onComplete(granted);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSkip = () => {
    storage.set('notification-permission-asked', 'true');
    onComplete(false);
  };

  return (
    <View className="flex-1 bg-background px-6 py-12 justify-center">
      <Bell size={64} color="#6366f1" className="self-center mb-6" />

      <Text className="text-2xl font-bold text-white text-center mb-4">Stay in the loop</Text>

      <Text className="text-base text-zinc-400 text-center mb-8">
        Get notified when your AI agents need your attention.
      </Text>

      {/* Value propositions */}
      <View className="gap-4 mb-10">
        <ValueRow
          icon={<Shield size={20} color="#6366f1" />}
          title="Approve agent actions"
          subtitle="Instantly approve or deny tool calls from your phone"
        />
        <ValueRow
          icon={<Zap size={20} color="#6366f1" />}
          title="Task completion alerts"
          subtitle="Know the moment your agents finish their work"
        />
        <ValueRow
          icon={<BellOff size={20} color="#6366f1" />}
          title="You're in control"
          subtitle="Customize which notifications you receive in Settings"
        />
      </View>

      <Pressable
        onPress={handleEnable}
        disabled={isRequesting}
        className="bg-indigo-500 rounded-xl py-4 mb-3"
      >
        <Text className="text-white text-center font-semibold text-base">Enable Notifications</Text>
      </Pressable>

      <Pressable onPress={handleSkip} className="py-3">
        <Text className="text-zinc-500 text-center text-sm">Not now</Text>
      </Pressable>
    </View>
  );
}

function ValueRow({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="mt-0.5">{icon}</View>
      <View className="flex-1">
        <Text className="text-white font-medium">{title}</Text>
        <Text className="text-zinc-500 text-sm">{subtitle}</Text>
      </View>
    </View>
  );
}
```

### When to Show the Permission Sheet

Trigger the soft ask after a meaningful interaction, not during onboarding:

```tsx
// In the onboarding flow or after first agent is created:
const hasAsked = storage.getString('notification-permission-asked');
const hasSession = useAuthStore((s) => s.session);

// Show after user completes onboarding and creates first conversation
if (hasSession && !hasAsked) {
  // Show NotificationPermissionSheet
}
```

### Re-Engagement for Users Who Declined

If a user declined, periodically show a non-intrusive banner (not the sheet) after they use a feature that would benefit from notifications:

```tsx
// components/notifications/EnableNotificationsBanner.tsx

import { useState, useEffect } from 'react';
import { View, Text, Pressable, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Bell } from 'lucide-react-native';

export function EnableNotificationsBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      // On iOS, check ios.status for accurate state
      if (status !== 'granted') {
        setShow(true);
      }
    })();
  }, []);

  if (!show) return null;

  const openSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View className="mx-4 my-2 bg-zinc-800 rounded-xl p-4 flex-row items-center gap-3">
      <Bell size={20} color="#6366f1" />
      <View className="flex-1">
        <Text className="text-white text-sm font-medium">Notifications are off</Text>
        <Text className="text-zinc-400 text-xs">Enable them to get agent approval alerts</Text>
      </View>
      <Pressable onPress={openSettings}>
        <Text className="text-indigo-400 text-sm font-medium">Enable</Text>
      </Pressable>
      <Pressable onPress={() => setShow(false)}>
        <Text className="text-zinc-500 text-sm">Dismiss</Text>
      </Pressable>
    </View>
  );
}
```

---

## 5. Notification Channels and Categories

### Android Notification Channels

Android 8.0+ requires notification channels. Users can independently control each channel in system settings. Channels cannot be modified after creation (only deleted and recreated with a new ID).

**Enhanced channel setup** (extends the current `services/notifications.ts`):

```ts
// services/notificationChannels.ts

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Channel definitions for AGI Workforce.
 * Each channel maps to a distinct notification category the user can control.
 *
 * Importance levels:
 *   MAX (5)     - Makes sound, shows heads-up, overrides DND
 *   HIGH (4)    - Makes sound, shows heads-up
 *   DEFAULT (3) - Makes sound, no heads-up
 *   LOW (2)     - No sound, appears in shade only
 *   MIN (1)     - No sound, no visual interruption
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Group channels logically
  await Notifications.setNotificationChannelGroupAsync('agents', {
    name: 'AI Agents',
    description: 'Notifications related to agent activity',
  });

  await Notifications.setNotificationChannelGroupAsync('communication', {
    name: 'Communication',
    description: 'Chat messages and companion updates',
  });

  await Notifications.setNotificationChannelGroupAsync('system', {
    name: 'System',
    description: 'Background sync and maintenance',
  });

  // --- Agent channels ---

  await Notifications.setNotificationChannelAsync('agent-approvals', {
    name: 'Agent Approvals',
    description: 'When an agent needs your approval to execute a tool',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500],
    lightColor: '#ff6b6b',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'approval_urgent.wav',
    enableLights: true,
    enableVibrate: true,
    groupId: 'agents',
  });

  await Notifications.setNotificationChannelAsync('agent-status', {
    name: 'Agent Status Updates',
    description: 'Task completions, progress milestones, failures',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#21808d',
    sound: 'task_complete.wav',
    groupId: 'agents',
  });

  await Notifications.setNotificationChannelAsync('agent-errors', {
    name: 'Agent Errors',
    description: 'When an agent encounters an error or fails',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#ef4444',
    groupId: 'agents',
  });

  // --- Communication channels ---

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Chat Messages',
    description: 'New messages in conversations',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6366f1',
    groupId: 'communication',
  });

  await Notifications.setNotificationChannelAsync('companion-status', {
    name: 'Desktop Companion',
    description: 'Pairing status and connection updates',
    importance: Notifications.AndroidImportance.LOW,
    groupId: 'communication',
  });

  // --- System channels ---

  await Notifications.setNotificationChannelAsync('schedules', {
    name: 'Scheduled Tasks',
    description: 'Reminders for scheduled agent runs',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#21808d',
    groupId: 'system',
  });

  await Notifications.setNotificationChannelAsync('sync', {
    name: 'Background Sync',
    description: 'Data synchronization updates (silent)',
    importance: Notifications.AndroidImportance.MIN,
    enableVibrate: false,
    groupId: 'system',
  });
}
```

### iOS Notification Categories with Action Buttons

iOS uses "categories" instead of channels. Categories define interactive action buttons that appear when the user long-presses or expands a notification.

```ts
// services/notificationCategories.ts

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * iOS notification categories with action buttons.
 * Must be registered before any notification using these categories is sent.
 *
 * Categories are also used cross-platform for the `categoryId` field
 * in notification payloads, even though Android displays them differently.
 */
export async function setupNotificationCategories(): Promise<void> {
  // --- Agent Approval ---
  // Shown when an agent requests tool execution permission
  await Notifications.setNotificationCategoryAsync('agent-approval', [
    {
      identifier: 'approve',
      buttonTitle: 'Approve',
      options: {
        opensAppToForeground: false, // Process in background
      },
    },
    {
      identifier: 'deny',
      buttonTitle: 'Deny',
      options: {
        opensAppToForeground: false,
        isDestructive: true, // Red text on iOS
      },
    },
    {
      identifier: 'view-details',
      buttonTitle: 'View Details',
      options: {
        opensAppToForeground: true,
      },
    },
  ]);

  // --- Chat Message ---
  // Allows inline reply without opening the app
  await Notifications.setNotificationCategoryAsync('chat-message', [
    {
      identifier: 'reply',
      buttonTitle: 'Reply',
      textInput: {
        submitButtonTitle: 'Send',
        placeholder: 'Type a reply...',
      },
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: 'mark-read',
      buttonTitle: 'Mark as Read',
      options: {
        opensAppToForeground: false,
      },
    },
  ]);

  // --- Task Completed ---
  await Notifications.setNotificationCategoryAsync('task-completed', [
    {
      identifier: 'view-result',
      buttonTitle: 'View Result',
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: 'dismiss',
      buttonTitle: 'Dismiss',
      options: {
        opensAppToForeground: false,
      },
    },
  ]);

  // --- Agent Error ---
  await Notifications.setNotificationCategoryAsync('agent-error', [
    {
      identifier: 'view-log',
      buttonTitle: 'View Log',
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: 'retry',
      buttonTitle: 'Retry',
      options: {
        opensAppToForeground: false,
      },
    },
  ]);

  // --- Schedule Reminder ---
  await Notifications.setNotificationCategoryAsync('schedule-reminder', [
    {
      identifier: 'run-now',
      buttonTitle: 'Run Now',
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: 'snooze',
      buttonTitle: 'Snooze 15min',
      options: {
        opensAppToForeground: false,
      },
    },
  ]);
}
```

### Handling Category Action Responses

```ts
// In services/notifications.ts -- extend handleNotificationResponse

function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as NotificationData | undefined;
  const actionId = response.actionIdentifier;

  // Default tap (no specific action button)
  if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    handleDefaultTap(data);
    return;
  }

  // Handle category-specific actions
  switch (actionId) {
    case 'approve': {
      if (data?.approvalId) {
        handleApprovalAction(data.approvalId as string, 'approved');
      }
      break;
    }
    case 'deny': {
      if (data?.approvalId) {
        handleApprovalAction(data.approvalId as string, 'rejected');
      }
      break;
    }
    case 'reply': {
      // Extract text from inline reply
      const userText = response.userText; // Available when textInput is used
      if (userText && data?.conversationId) {
        handleInlineReply(data.conversationId as string, userText);
      }
      break;
    }
    case 'retry': {
      if (data?.agentId) {
        handleRetryAgent(data.agentId as string);
      }
      break;
    }
    case 'mark-read': {
      if (data?.conversationId) {
        markConversationRead(data.conversationId as string);
      }
      break;
    }
    case 'view-details':
    case 'view-result':
    case 'view-log': {
      handleDefaultTap(data);
      break;
    }
    case 'run-now': {
      if (data?.scheduleId) {
        triggerScheduleNow(data.scheduleId as string);
      }
      break;
    }
    case 'snooze': {
      if (data?.scheduleId) {
        snoozeSchedule(data.scheduleId as string, 15);
      }
      break;
    }
  }
}

async function handleApprovalAction(
  approvalId: string,
  decision: 'approved' | 'rejected',
): Promise<void> {
  const { approveRequest, rejectRequest } = (
    await import('@/stores/agentStore')
  ).useAgentStore.getState();

  if (decision === 'approved') {
    approveRequest(approvalId);
  } else {
    rejectRequest(approvalId);
  }
}

async function handleInlineReply(conversationId: string, text: string): Promise<void> {
  const { sendMessage } = (await import('@/stores/chatStore')).useChatStore.getState();
  const { selectedModel } = (await import('@/stores/modelStore')).useModelStore.getState();
  sendMessage(conversationId, text, selectedModel);
}
```

---

## 6. Rich Push Notifications

### Image Attachments

Expo Push Service supports rich content (images) via the `richContent` field:

```json
{
  "to": "ExponentPushToken[...]",
  "title": "Task Complete: Screenshot captured",
  "body": "Your agent finished the browser task",
  "data": {
    "type": "task_completed",
    "route": "/(app)/agents/agent-123"
  },
  "richContent": {
    "image": "https://cdn.agiworkforce.com/screenshots/task-abc.png"
  },
  "categoryId": "task-completed",
  "channelId": "agent-status"
}
```

**Platform behavior:**

- **iOS**: Displays the image in an expanded notification view. Requires `mutableContent: true` if you need client-side processing of the image.
- **Android**: Displays as a big picture notification. Image URL must be HTTPS and publicly accessible.

### iOS Interruption Levels

iOS 15+ supports four interruption levels that determine how aggressively a notification interrupts the user:

```json
{
  "interruptionLevel": "time-sensitive"
}
```

| Level            | Behavior                                        | Use Case         |
| ---------------- | ----------------------------------------------- | ---------------- |
| `passive`        | No sound, no wake. Delivered silently.          | Sync complete    |
| `active`         | Default. Sound if enabled by user.              | Chat messages    |
| `time-sensitive` | Breaks through Focus/DND for 1 hour.            | Agent approvals  |
| `critical`       | Always breaks through. Requires Apple approval. | N/A for this app |

For agent approvals, use `time-sensitive` to ensure the user sees the notification even in Focus mode:

```json
{
  "to": "ExponentPushToken[...]",
  "title": "Agent needs approval",
  "body": "WriteFile: /src/index.ts",
  "interruptionLevel": "time-sensitive",
  "categoryId": "agent-approval",
  "channelId": "agent-approvals",
  "data": {
    "type": "agent_approval_needed",
    "approvalId": "approval-456",
    "agentId": "agent-123",
    "toolName": "WriteFile",
    "toolArgs": "/src/index.ts"
  }
}
```

### Custom Notification Sounds

1. Add `.wav` files to `assets/sounds/` (must be under 30 seconds, specific codec requirements per platform)
2. Reference in `app.json` plugin config (see section 2)
3. On Android 8.0+, sounds are set per-channel (cannot change per-notification)
4. On iOS, specify per-notification:

```json
{
  "sound": "approval_urgent.wav"
}
```

---

## 7. Deep Linking from Notifications

### Current Implementation

The app already handles deep linking in `services/notifications.ts` via `handleNotificationResponse`. The current implementation uses a `safeNavigate` wrapper that defers navigation if the navigator is not yet ready (cold-start scenario).

### Enhanced Deep Linking with Typed Routes

```ts
// services/notifications.ts -- enhanced routing

import { router } from 'expo-router';

// All navigable routes from notifications
const NOTIFICATION_ROUTES: Record<NotificationEventType, (data: NotificationData) => string> = {
  agent_approval_needed: (data) =>
    data.agentId ? `/(app)/agents/${data.agentId}` : '/(app)/companion',

  task_completed: (data) =>
    data.route && typeof data.route === 'string'
      ? data.route
      : data.conversationId
        ? `/(app)/chat/${data.conversationId}`
        : '/(app)',

  schedule_triggered: () => '/(app)/schedules',

  companion_connected: () => '/(app)/companion',

  chat_message: (data) =>
    data.conversationId ? `/(app)/chat/${data.conversationId}` : '/(app)/(tabs)/chat',

  agent_error: (data) => (data.agentId ? `/(app)/agents/${data.agentId}` : '/(app)/(tabs)/agents'),
};

function handleDefaultTap(data: NotificationData | undefined): void {
  if (!data?.type) {
    safeNavigate('/(app)');
    return;
  }

  const routeResolver = NOTIFICATION_ROUTES[data.type];
  if (routeResolver) {
    const route = routeResolver(data);
    safeNavigate(route as Parameters<typeof router.push>[0]);
  } else {
    safeNavigate('/(app)');
  }
}
```

### Expo Router Native Intent Handling

For more complex deep linking scenarios, create a `+native-intent.tsx` file:

```tsx
// app/+native-intent.tsx

import type { NativeIntent } from 'expo-router';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  // Rewrite notification deep links to app routes
  // e.g., agiworkforce://chat/abc123 -> /(app)/chat/abc123
  try {
    if (path.startsWith('agiworkforce://')) {
      const stripped = path.replace('agiworkforce://', '');
      if (stripped.startsWith('chat/')) {
        return `/(app)/${stripped}`;
      }
      if (stripped.startsWith('agent/')) {
        return `/(app)/agents/${stripped.replace('agent/', '')}`;
      }
      if (stripped === 'companion') {
        return '/(app)/companion';
      }
    }
    return path;
  } catch {
    return '/unexpected-error';
  }
}
```

### Cold-Start Notification Handling

The app already handles cold-start via `handleInitialNotification()` in `app/_layout.tsx`. The critical pattern is the `_navigatorReady` guard in `services/notifications.ts` that prevents navigation before the router mounts.

**Important timing considerations:**

1. `handleInitialNotification()` must be called after `setupNotificationListeners()`.
2. `setNavigatorReady(true)` must be called from the authenticated app layout after the navigator mounts.
3. The 100ms timeout in `safeNavigate` handles the race between notification processing and navigator mount.

```tsx
// app/(app)/_layout.tsx -- add navigator ready signal

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { setNavigatorReady } from '@/services/notifications';

export default function AppLayout() {
  useEffect(() => {
    setNavigatorReady(true);
    return () => setNavigatorReady(false);
  }, []);

  return <Stack screenOptions={{ headerShown: false }}>{/* ... screens ... */}</Stack>;
}
```

### Notification Data Payload Structure

Standardize the data payload sent from the server:

```ts
// packages/types/src/notifications.ts

export interface AgentApprovalNotification {
  type: 'agent_approval_needed';
  approvalId: string;
  agentId: string;
  agentName: string;
  toolName: string;
  toolArgs: string;
  /** Deep link route override */
  route?: string;
}

export interface TaskCompletedNotification {
  type: 'task_completed';
  agentId: string;
  agentName: string;
  conversationId?: string;
  /** Optional screenshot URL for rich notification */
  screenshotUrl?: string;
  route?: string;
}

export interface ChatMessageNotification {
  type: 'chat_message';
  conversationId: string;
  conversationTitle: string;
  senderName: string;
  messagePreview: string;
  route?: string;
}

export interface ScheduleTriggeredNotification {
  type: 'schedule_triggered';
  scheduleId: string;
  scheduleName: string;
  route?: string;
}

export interface AgentErrorNotification {
  type: 'agent_error';
  agentId: string;
  agentName: string;
  errorMessage: string;
  route?: string;
}

export interface CompanionConnectedNotification {
  type: 'companion_connected';
  deviceName: string;
  route?: string;
}

export type NotificationPayload =
  | AgentApprovalNotification
  | TaskCompletedNotification
  | ChatMessageNotification
  | ScheduleTriggeredNotification
  | AgentErrorNotification
  | CompanionConnectedNotification;
```

---

## 8. Background and Silent Push Notifications

### Silent Push for Background Sync

Silent push notifications wake the app in the background without showing anything to the user. Useful for syncing conversation data between desktop and mobile.

**Server-side payload for silent push:**

```json
{
  "to": "ExponentPushToken[...]",
  "data": {
    "type": "background_sync",
    "syncType": "conversations",
    "timestamp": 1711036800
  },
  "_contentAvailable": true,
  "priority": "normal"
}
```

Key fields:

- `_contentAvailable: true`: Tells iOS to wake the app for background processing (maps to APNs `content-available: 1`)
- No `title` or `body`: Prevents any visible notification
- `priority: "normal"`: Apple throttles high-priority silent pushes

**Client-side background task:**

```ts
// services/backgroundNotificationTask.ts

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

// IMPORTANT: Define task at module level (top-level scope).
// Task definitions must be available even when the app starts from background.
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundNotification] Task error:', error);
    return;
  }

  const notificationData = (data as { notification?: { data?: Record<string, unknown> } })
    ?.notification?.data;

  if (!notificationData) return;

  switch (notificationData.type) {
    case 'background_sync': {
      // Trigger conversation sync
      try {
        const { getMobileSyncService } = await import('@/services/conversationSync');
        const syncService = getMobileSyncService();
        await syncService.syncNow();
      } catch (err) {
        console.error('[BackgroundNotification] Sync failed:', err);
      }
      break;
    }

    case 'agent_status_update': {
      // Update agent store with latest status
      try {
        const { useAgentStore } = await import('@/stores/agentStore');
        const agentId = notificationData.agentId as string;
        const status = notificationData.status as string;
        if (agentId && status) {
          useAgentStore.getState().updateAgent(agentId, {
            status: status as 'running' | 'completed' | 'failed',
          });
        }
      } catch (err) {
        console.error('[BackgroundNotification] Agent update failed:', err);
      }
      break;
    }

    default:
      break;
  }
});

/**
 * Register the background notification task.
 * Call once during app initialization.
 */
export async function registerBackgroundNotificationTask(): Promise<void> {
  try {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch (err) {
    // Task might already be registered
    console.warn('[BackgroundNotification] Registration warning:', err);
  }
}

/**
 * Unregister the background notification task.
 */
export async function unregisterBackgroundNotificationTask(): Promise<void> {
  try {
    await Notifications.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  } catch {
    // Task might not be registered
  }
}
```

### Platform Limitations for Background Notifications

**iOS:**

- The OS does not guarantee delivery of silent push notifications to the app.
- iOS throttles background execution. Apple recommends no more than 2-3 silent pushes per hour.
- The `enableBackgroundRemoteNotifications` config plugin flag must be `true`.
- Battery level and app usage patterns affect whether iOS will wake your app.

**Android:**

- Doze mode (Android 6.0+) can delay or batch background notifications.
- If the user force-stops the app, no notifications will be delivered until the app is manually reopened.
- Battery optimization settings on some manufacturers (Samsung, Xiaomi, Huawei) can aggressively kill background processes.

### Headless Notification Detection

To distinguish headless (silent) notifications from display notifications:

```ts
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;

    // Silent/headless notifications: do not display
    if (data?.type === 'background_sync' || data?.silent === true) {
      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }

    // Agent approvals: always show prominently
    if (data?.type === 'agent_approval_needed') {
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    }

    // Default: show everything
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});
```

---

## 9. Server-Side Sending

### Using Expo Push Service (Recommended)

The API gateway should send notifications through the Expo Push Service.

```ts
// services/api-gateway/src/lib/pushNotifications.ts

import { logger } from './logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

// Optional: Set via EAS Dashboard for enhanced security
const EXPO_ACCESS_TOKEN = process.env['EXPO_ACCESS_TOKEN'];

interface ExpoPushMessage {
  to: string | string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | string;
  badge?: number;
  channelId?: string;
  categoryId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
  expiration?: number;
  subtitle?: string;
  richContent?: { image: string };
  mutableContent?: boolean;
  interruptionLevel?: 'passive' | 'active' | 'time-sensitive' | 'critical';
  _contentAvailable?: boolean;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error: string };
}

interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error: string };
}

/**
 * Send push notifications via Expo Push Service.
 *
 * Constraints:
 * - Max 100 messages per request
 * - Max 600 notifications/second total
 * - Max 6 concurrent connections
 * - Max ~4 KB total payload per message
 */
export async function sendPushNotifications(
  messages: ExpoPushMessage[],
): Promise<ExpoPushTicket[]> {
  // Chunk into batches of 100
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  const allTickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (EXPO_ACCESS_TOKEN) {
      headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });

    if (response.status === 429) {
      // Rate limited -- back off and retry
      logger.warn('Expo push rate limited, backing off');
      await sleep(5000);
      continue;
    }

    if (!response.ok) {
      logger.error({ status: response.status }, 'Expo push send failed');
      continue;
    }

    const result = (await response.json()) as {
      data: ExpoPushTicket[];
    };
    allTickets.push(...result.data);

    // Handle DeviceNotRegistered immediately
    for (const ticket of result.data) {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        // Find the corresponding token and remove it from DB
        const ticketIndex = result.data.indexOf(ticket);
        const originalMessage = chunk[ticketIndex];
        if (originalMessage) {
          const token = Array.isArray(originalMessage.to)
            ? originalMessage.to[0]
            : originalMessage.to;
          await removeInvalidToken(token);
        }
      }
    }
  }

  return allTickets;
}

/**
 * Check delivery receipts. Call 15 minutes after sending.
 * Receipts are available for 24 hours.
 */
export async function checkReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
  // Max 1000 receipt IDs per request
  const chunks: string[][] = [];
  for (let i = 0; i < ticketIds.length; i += 1000) {
    chunks.push(ticketIds.slice(i, i + 1000));
  }

  const allReceipts: Record<string, ExpoPushReceipt> = {};

  for (const chunk of chunks) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (EXPO_ACCESS_TOKEN) {
      headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: chunk }),
    });

    if (!response.ok) continue;

    const result = (await response.json()) as {
      data: Record<string, ExpoPushReceipt>;
    };
    Object.assign(allReceipts, result.data);

    // Handle DeviceNotRegistered in receipts
    for (const [receiptId, receipt] of Object.entries(result.data)) {
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        logger.info({ receiptId }, 'Device no longer registered, removing token');
        // Token removal would need a receipt-to-token mapping
      }
    }
  }

  return allReceipts;
}

async function removeInvalidToken(token: string): Promise<void> {
  // Remove from mobile_devices table
  const { supabase } = await import('./supabase');
  await supabase.from('mobile_devices').update({ push_token: null }).eq('push_token', token);
  logger.info({ token: token.slice(0, 20) + '...' }, 'Removed invalid push token');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Sending Specific Notification Types

```ts
// services/api-gateway/src/lib/notificationSenders.ts

import { sendPushNotifications } from './pushNotifications';
import { supabase } from './supabase';

/**
 * Look up all push tokens for a user.
 */
async function getUserPushTokens(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('mobile_devices')
    .select('push_token')
    .eq('user_id', userId)
    .not('push_token', 'is', null);

  return (data ?? [])
    .map((d: { push_token: string | null }) => d.push_token)
    .filter(Boolean) as string[];
}

/**
 * Notify user that an agent needs approval.
 */
export async function notifyAgentApproval(
  userId: string,
  approval: {
    approvalId: string;
    agentId: string;
    agentName: string;
    toolName: string;
    toolArgs: string;
  },
): Promise<void> {
  const tokens = await getUserPushTokens(userId);
  if (tokens.length === 0) return;

  await sendPushNotifications(
    tokens.map((token) => ({
      to: token,
      title: `${approval.agentName} needs approval`,
      body: `${approval.toolName}: ${approval.toolArgs}`,
      data: {
        type: 'agent_approval_needed',
        approvalId: approval.approvalId,
        agentId: approval.agentId,
        agentName: approval.agentName,
        toolName: approval.toolName,
        toolArgs: approval.toolArgs,
      },
      categoryId: 'agent-approval',
      channelId: 'agent-approvals',
      interruptionLevel: 'time-sensitive' as const,
      priority: 'high' as const,
      sound: 'approval_urgent.wav',
      badge: 1,
    })),
  );
}

/**
 * Notify user that a task completed.
 */
export async function notifyTaskCompleted(
  userId: string,
  task: {
    agentId: string;
    agentName: string;
    conversationId?: string;
    summary: string;
    screenshotUrl?: string;
  },
): Promise<void> {
  const tokens = await getUserPushTokens(userId);
  if (tokens.length === 0) return;

  await sendPushNotifications(
    tokens.map((token) => ({
      to: token,
      title: `${task.agentName} completed`,
      body: task.summary,
      data: {
        type: 'task_completed',
        agentId: task.agentId,
        agentName: task.agentName,
        conversationId: task.conversationId,
        route: task.conversationId ? `/(app)/chat/${task.conversationId}` : undefined,
      },
      categoryId: 'task-completed',
      channelId: 'agent-status',
      ...(task.screenshotUrl && {
        richContent: { image: task.screenshotUrl },
      }),
    })),
  );
}

/**
 * Trigger a silent background sync.
 */
export async function triggerBackgroundSync(
  userId: string,
  syncType: string = 'conversations',
): Promise<void> {
  const tokens = await getUserPushTokens(userId);
  if (tokens.length === 0) return;

  await sendPushNotifications(
    tokens.map((token) => ({
      to: token,
      data: {
        type: 'background_sync',
        syncType,
        timestamp: Date.now(),
      },
      _contentAvailable: true,
      priority: 'normal' as const,
    })),
  );
}
```

### Direct FCM/APNs (Advanced)

If you need finer control (e.g., FCM topics, APNs HTTP/2 priority), use `getDevicePushTokenAsync()` instead of `getExpoPushTokenAsync()` on the client, and communicate directly with FCM v1 API or APNs HTTP/2 from your server. See [Expo docs: Send notifications with FCM and APNs](https://docs.expo.dev/push-notifications/sending-notifications-custom/) for full details.

---

## 10. Rate Limiting and User Preferences

### Server-Side Rate Limiting

Enforce limits to prevent notification fatigue and respect platform constraints.

```ts
// services/api-gateway/src/lib/notificationRateLimiter.ts

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env['UPSTASH_REDIS_REST_URL']!,
  token: process.env['UPSTASH_REDIS_REST_TOKEN']!,
});

interface RateLimitConfig {
  /** Max notifications per window */
  max: number;
  /** Window in seconds */
  windowSeconds: number;
}

/**
 * Per-category rate limits.
 * These protect the user from notification overload and respect
 * platform throttling limits.
 */
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'agent-approval': { max: 20, windowSeconds: 3600 }, // 20/hour
  'task-completed': { max: 10, windowSeconds: 3600 }, // 10/hour
  'chat-message': { max: 30, windowSeconds: 3600 }, // 30/hour
  'schedule-triggered': { max: 5, windowSeconds: 3600 }, // 5/hour
  background_sync: { max: 3, windowSeconds: 3600 }, // 3/hour (iOS limit)
  'companion-status': { max: 5, windowSeconds: 3600 }, // 5/hour
  'agent-error': { max: 10, windowSeconds: 3600 }, // 10/hour
  _global: { max: 50, windowSeconds: 3600 }, // 50/hour total
  _daily: { max: 100, windowSeconds: 86400 }, // 100/day total
};

/**
 * Check if a notification can be sent. Returns true if within limits.
 * Increments the counter atomically.
 */
export async function checkNotificationRateLimit(
  userId: string,
  category: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);

  // Check category-specific limit
  const categoryConfig = RATE_LIMITS[category] ?? RATE_LIMITS['_global']!;
  const categoryKey = `notif:rate:${userId}:${category}`;
  const categoryCount = await redis.incr(categoryKey);
  if (categoryCount === 1) {
    await redis.expire(categoryKey, categoryConfig.windowSeconds);
  }
  if (categoryCount > categoryConfig.max) {
    return false;
  }

  // Check global hourly limit
  const globalKey = `notif:rate:${userId}:_global`;
  const globalCount = await redis.incr(globalKey);
  if (globalCount === 1) {
    await redis.expire(globalKey, RATE_LIMITS['_global']!.windowSeconds);
  }
  if (globalCount > RATE_LIMITS['_global']!.max) {
    return false;
  }

  // Check daily limit
  const dailyKey = `notif:rate:${userId}:_daily`;
  const dailyCount = await redis.incr(dailyKey);
  if (dailyCount === 1) {
    await redis.expire(dailyKey, RATE_LIMITS['_daily']!.windowSeconds);
  }
  if (dailyCount > RATE_LIMITS['_daily']!.max) {
    return false;
  }

  return true;
}
```

### Quiet Hours

Respect the user's sleep schedule by holding non-urgent notifications:

```ts
/**
 * Check if we should suppress non-urgent notifications.
 * Default quiet hours: 10 PM - 7 AM in user's timezone.
 */
export function isQuietHours(
  userTimezone: string = 'UTC',
  quietStart: number = 22, // 10 PM
  quietEnd: number = 7, // 7 AM
): boolean {
  const now = new Date();
  const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
  const hour = userTime.getHours();

  if (quietStart > quietEnd) {
    // Wraps midnight: e.g., 22-7
    return hour >= quietStart || hour < quietEnd;
  }
  return hour >= quietStart && hour < quietEnd;
}

/**
 * Should this notification be sent now, or queued?
 */
export function shouldSendNow(category: string, userTimezone: string): boolean {
  // Agent approvals always go through (time-sensitive)
  if (category === 'agent-approval') return true;

  // Agent errors always go through
  if (category === 'agent-error') return true;

  // Everything else respects quiet hours
  return !isQuietHours(userTimezone);
}
```

### Client-Side User Preferences

Store notification preferences locally and sync with the server.

```ts
// stores/notificationPreferencesStore.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';

interface NotificationCategory {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

interface NotificationPreferences {
  /** Master toggle */
  enabled: boolean;
  /** Per-category toggles */
  categories: NotificationCategory[];
  /** Quiet hours */
  quietHoursEnabled: boolean;
  quietHoursStart: number; // hour 0-23
  quietHoursEnd: number; // hour 0-23
  /** Sound */
  soundEnabled: boolean;
  /** Vibration */
  vibrationEnabled: boolean;
  /** Badge count */
  badgeEnabled: boolean;

  setEnabled: (enabled: boolean) => void;
  setCategoryEnabled: (id: string, enabled: boolean) => void;
  setQuietHours: (enabled: boolean, start?: number, end?: number) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setBadgeEnabled: (enabled: boolean) => void;
  syncToServer: () => Promise<void>;
}

export const useNotificationPreferencesStore = create<NotificationPreferences>()(
  persist(
    (set, get) => ({
      enabled: true,
      categories: [
        {
          id: 'agent-approvals',
          label: 'Agent Approvals',
          description: 'When an agent needs your permission to act',
          enabled: true,
        },
        {
          id: 'agent-status',
          label: 'Task Completions',
          description: 'When agents finish their tasks',
          enabled: true,
        },
        {
          id: 'agent-errors',
          label: 'Agent Errors',
          description: 'When agents encounter problems',
          enabled: true,
        },
        {
          id: 'chat-messages',
          label: 'Chat Messages',
          description: 'New messages in conversations',
          enabled: true,
        },
        {
          id: 'schedules',
          label: 'Scheduled Tasks',
          description: 'Reminders for scheduled agent runs',
          enabled: true,
        },
        {
          id: 'companion-status',
          label: 'Desktop Companion',
          description: 'Pairing and connection updates',
          enabled: false,
        },
      ],
      quietHoursEnabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
      soundEnabled: true,
      vibrationEnabled: true,
      badgeEnabled: true,

      setEnabled: (enabled) => {
        set({ enabled });
        get().syncToServer();
      },

      setCategoryEnabled: (id, enabled) => {
        set((state) => ({
          categories: state.categories.map((c) => (c.id === id ? { ...c, enabled } : c)),
        }));
        get().syncToServer();
      },

      setQuietHours: (enabled, start, end) => {
        set({
          quietHoursEnabled: enabled,
          ...(start !== undefined && { quietHoursStart: start }),
          ...(end !== undefined && { quietHoursEnd: end }),
        });
        get().syncToServer();
      },

      setSoundEnabled: (soundEnabled) => {
        set({ soundEnabled });
      },

      setVibrationEnabled: (vibrationEnabled) => {
        set({ vibrationEnabled });
      },

      setBadgeEnabled: (badgeEnabled) => {
        set({ badgeEnabled });
      },

      syncToServer: async () => {
        try {
          const { api } = await import('@/services/api');
          const state = get();
          await api.put('/api/mobile/notification-preferences', {
            enabled: state.enabled,
            categories: state.categories.filter((c) => c.enabled).map((c) => c.id),
            quietHours: state.quietHoursEnabled
              ? {
                  start: state.quietHoursStart,
                  end: state.quietHoursEnd,
                }
              : null,
          });
        } catch {
          // Non-critical -- preferences will sync on next attempt
        }
      },
    }),
    {
      name: 'notification-preferences',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
```

### Settings UI for Notification Preferences

```tsx
// components/settings/NotificationSettings.tsx

import { View, Text, ScrollView } from 'react-native';
import { Switch } from '@/components/ui/switch';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferencesStore';

export function NotificationSettings() {
  const {
    enabled,
    categories,
    quietHoursEnabled,
    quietHoursStart,
    quietHoursEnd,
    soundEnabled,
    vibrationEnabled,
    badgeEnabled,
    setEnabled,
    setCategoryEnabled,
    setQuietHours,
    setSoundEnabled,
    setVibrationEnabled,
    setBadgeEnabled,
  } = useNotificationPreferencesStore();

  return (
    <ScrollView className="flex-1 bg-background">
      {/* Master toggle */}
      <View className="px-4 py-3 flex-row justify-between items-center border-b border-zinc-800">
        <View>
          <Text className="text-white font-medium">Push Notifications</Text>
          <Text className="text-zinc-500 text-sm">Receive alerts on this device</Text>
        </View>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>

      {enabled && (
        <>
          {/* Category toggles */}
          <Text className="text-zinc-400 text-xs font-medium uppercase px-4 pt-6 pb-2">
            Notification Types
          </Text>
          {categories.map((category) => (
            <View
              key={category.id}
              className="px-4 py-3 flex-row justify-between items-center border-b border-zinc-800/50"
            >
              <View className="flex-1 mr-4">
                <Text className="text-white">{category.label}</Text>
                <Text className="text-zinc-500 text-sm">{category.description}</Text>
              </View>
              <Switch
                value={category.enabled}
                onValueChange={(v) => setCategoryEnabled(category.id, v)}
              />
            </View>
          ))}

          {/* Quiet hours */}
          <Text className="text-zinc-400 text-xs font-medium uppercase px-4 pt-6 pb-2">
            Quiet Hours
          </Text>
          <View className="px-4 py-3 flex-row justify-between items-center border-b border-zinc-800">
            <View>
              <Text className="text-white">Do Not Disturb</Text>
              <Text className="text-zinc-500 text-sm">
                {quietHoursEnabled
                  ? `${formatHour(quietHoursStart)} - ${formatHour(quietHoursEnd)}`
                  : 'Disabled'}
              </Text>
            </View>
            <Switch value={quietHoursEnabled} onValueChange={(v) => setQuietHours(v)} />
          </View>

          {/* Sound & vibration */}
          <Text className="text-zinc-400 text-xs font-medium uppercase px-4 pt-6 pb-2">Alerts</Text>
          <ToggleRow label="Sound" value={soundEnabled} onChange={setSoundEnabled} />
          <ToggleRow label="Vibration" value={vibrationEnabled} onChange={setVibrationEnabled} />
          <ToggleRow label="Badge Count" value={badgeEnabled} onChange={setBadgeEnabled} />
        </>
      )}
    </ScrollView>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="px-4 py-3 flex-row justify-between items-center border-b border-zinc-800/50">
      <Text className="text-white">{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:00 ${ampm}`;
}
```

---

## 11. Testing and Debugging

### Testing with Expo Push Notifications Tool

1. Build a development or preview build: `eas build --profile preview`
2. Install on a physical device
3. Copy the `ExpoPushToken[...]` from logs or the app
4. Go to https://expo.dev/notifications
5. Paste the token and compose a test notification with custom data

### Testing Notification Categories

Send a test payload with `categoryId`:

```bash
curl -H "Content-Type: application/json" \
  -X POST "https://exp.host/--/api/v2/push/send" \
  -d '{
    "to": "ExponentPushToken[YOUR_TOKEN]",
    "title": "Agent needs approval",
    "body": "WriteFile: /src/config.ts",
    "categoryId": "agent-approval",
    "channelId": "agent-approvals",
    "data": {
      "type": "agent_approval_needed",
      "approvalId": "test-123",
      "agentId": "agent-456"
    }
  }'
```

### Testing Rich Notifications

```bash
curl -H "Content-Type: application/json" \
  -X POST "https://exp.host/--/api/v2/push/send" \
  -d '{
    "to": "ExponentPushToken[YOUR_TOKEN]",
    "title": "Screenshot captured",
    "body": "Browser automation task completed",
    "richContent": {
      "image": "https://picsum.photos/600/400"
    },
    "categoryId": "task-completed",
    "channelId": "agent-status"
  }'
```

### Testing Silent Push

```bash
curl -H "Content-Type: application/json" \
  -X POST "https://exp.host/--/api/v2/push/send" \
  -d '{
    "to": "ExponentPushToken[YOUR_TOKEN]",
    "data": {
      "type": "background_sync",
      "syncType": "conversations"
    },
    "_contentAvailable": true,
    "priority": "normal"
  }'
```

### Common Issues and Fixes

| Issue                                        | Cause                                         | Fix                                            |
| -------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Token is `null`                              | Running on simulator                          | Use a physical device                          |
| Notifications not received                   | Missing FCM/APNs credentials                  | Run `eas credentials`                          |
| Android categories missing on background tap | Known Expo issue (#36282)                     | Use `opensAppToForeground: true` as workaround |
| iOS silent push not firing                   | Missing `enableBackgroundRemoteNotifications` | Set to `true` in app.json plugin config        |
| Badge not clearing                           | Not calling `setBadgeCountAsync(0)`           | Call on app foreground                         |
| Token changes unexpectedly                   | Normal -- tokens rotate                       | Use `addPushTokenListener` to re-register      |
| Android force-stopped app                    | User manually stopped app                     | No fix; document this for users                |

### Debugging Checklist

```
[ ] Physical device (not simulator/emulator)
[ ] Development build (not Expo Go for SDK 53+)
[ ] FCM credentials configured (eas credentials)
[ ] APNs key uploaded to EAS
[ ] Correct projectId in getExpoPushTokenAsync
[ ] Token successfully sent to backend
[ ] Server sending to correct token format (ExponentPushToken[...])
[ ] Check Expo push receipts for errors
[ ] Verify channel exists before sending (Android)
[ ] Category registered before notification sent (iOS)
```

---

## 12. Production Checklist

### Before App Store Submission

- [ ] Replace placeholder `projectId` in `app.json` with real EAS project ID
- [ ] Configure production APNs credentials (not sandbox)
- [ ] Upload FCM v1 service account key to EAS Dashboard
- [ ] Enable Expo Push security with access tokens
- [ ] Set up receipt checking cron job (every 15 minutes)
- [ ] Implement token cleanup for `DeviceNotRegistered` errors
- [ ] Test on both iOS and Android physical devices
- [ ] Test all notification categories and action buttons
- [ ] Test cold-start deep linking from every notification type
- [ ] Test background/silent push on both platforms
- [ ] Verify quiet hours logic with multiple timezones
- [ ] Load test the push notification pipeline (600 notifs/sec limit)

### Monitoring and Analytics

Track these metrics in production:

- **Delivery rate**: Tickets with `status: ok` / total sent
- **Receipt success rate**: Receipts with `status: ok` / total checked
- **Token churn**: DeviceNotRegistered errors per day
- **Category engagement**: Tap rate per notification category
- **Opt-in rate**: Users with valid push tokens / total users
- **Silent push success**: Background tasks executed / silent pushes sent

### Security Considerations

- **Never log full push tokens** -- truncate to first 20 characters
- **Enable Expo access tokens** for the push API (EAS Dashboard > Project Settings)
- **Rate limit the push-token endpoint** (already done: 30/min in `mobile.ts`)
- **Validate token format** server-side before storing (`ExponentPushToken[...]`)
- **Encrypt tokens at rest** in the database (consider column-level encryption)
- **Audit token access** -- log which services query push tokens

---

## Sources

- [Expo Notifications SDK Reference](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Push Notifications Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Send Notifications with Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Send Notifications with FCM and APNs](https://docs.expo.dev/push-notifications/sending-notifications-custom/)
- [What You Need to Know About Notifications](https://docs.expo.dev/push-notifications/what-you-need-to-know/)
- [Handle Incoming Notifications](https://docs.expo.dev/push-notifications/receiving-notifications/)
- [Expo Push Notifications Overview](https://docs.expo.dev/push-notifications/overview/)
- [Customizing Links (Expo Router)](https://docs.expo.dev/router/advanced/native-intent/)
- [Android Notification Channels](https://developer.android.com/develop/ui/views/notifications/channels)
- [React Navigation Deep Linking](https://reactnavigation.org/docs/deep-linking/)
- [Push Notification Best Practices 2026 (Reteno)](https://reteno.com/blog/push-notification-best-practices-ultimate-guide-for-2026)
- [Push Notification UX Guide 2025 (UXCam)](https://uxcam.com/blog/push-notification-guide/)
- [iOS Push Notifications 2026 (Pushwoosh)](https://www.pushwoosh.com/blog/ios-push-notifications/)
- [Android Push Notifications 2026 (Pushwoosh)](https://www.pushwoosh.com/blog/android-push-notifications/)
- [App Push Notification Best Practices 2026 (Appbot)](https://appbot.co/blog/app-push-notifications-2026-best-practices/)
- [Expo Background Task](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Expo Task Manager](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [Rich Notification Extensions Discussion](https://github.com/expo/expo/discussions/25162)
- [Notification Action Buttons Issue](https://github.com/expo/expo/issues/36282)
- [Braze Push Best Practices](https://www.braze.com/docs/user_guide/message_building_by_channel/push/best_practices)
