import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Monitor,
  Send,
  Plus,
  QrCode,
  CheckCircle,
  Clock,
  XCircle,
  Wifi,
  WifiOff,
  MoreVertical,
  Trash2,
  Smartphone,
  ArrowLeft,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { useConnectionStore } from '@/stores/connectionStore';
import { useDispatchStore } from '@/stores/dispatchStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { DispatchMessage } from '@/stores/dispatchStore';

// ---------------------------------------------------------------------------
// DispatchHeader — shows desktop connection status
// ---------------------------------------------------------------------------

function DispatchHeader({ onBack, onMenuPress }: { onBack: () => void; onMenuPress: () => void }) {
  const status = useConnectionStore((s) => s.status);
  const desktopName = useConnectionStore((s) => s.desktopName);
  const connectionQuality = useConnectionStore((s) => s.connectionQuality);
  const lastHeartbeatLatencyMs = useConnectionStore((s) => s.lastHeartbeatLatencyMs);

  const isConnected = status === 'connected';
  const statusColor = isConnected ? colors.agentSuccess : colors.agentError;
  const statusLabel = isConnected
    ? 'Connected'
    : status === 'connecting' || status === 'reconnecting'
      ? 'Connecting...'
      : 'Disconnected';

  return (
    <View className="px-4 pb-3 pt-1">
      {/* Top row: back + title + menu */}
      <View className="flex-row items-center h-11">
        <Pressable
          onPress={onBack}
          className="w-9 h-9 rounded-lg items-center justify-center active:bg-white/5 mr-2"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text variant="subheading" className="text-white flex-1">
          Dispatch
        </Text>
        <Pressable
          onPress={onMenuPress}
          className="w-9 h-9 rounded-lg items-center justify-center active:bg-white/5"
          accessibilityLabel="Thread options"
          accessibilityRole="button"
        >
          <MoreVertical size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Desktop device status strip */}
      <View className="flex-row items-center gap-2.5 py-2 px-3 rounded-lg bg-white/5 mt-1">
        <Monitor size={16} color={colors.teal} />
        <Text className="text-[13px] flex-1" style={{ color: colors.textPrimary }}>
          {desktopName ?? 'Desktop'}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <View className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
          {isConnected ? (
            <Wifi size={12} color={statusColor} />
          ) : (
            <WifiOff size={12} color={statusColor} />
          )}
          <Text className="text-[11px]" style={{ color: statusColor }}>
            {statusLabel}
          </Text>
          {isConnected && connectionQuality === 'strong' && lastHeartbeatLatencyMs != null && (
            <Text className="text-[10px]" style={{ color: colors.textMuted }}>
              {lastHeartbeatLatencyMs}ms
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TaskResultCard — shows completed/in-progress task results
// ---------------------------------------------------------------------------

function TaskResultCard({ message }: { message: DispatchMessage }) {
  const taskStatus = message.taskStatus;
  const result = message.taskResult;

  const borderColor =
    taskStatus === 'completed'
      ? colors.agentSuccess
      : taskStatus === 'failed'
        ? colors.agentError
        : taskStatus === 'working'
          ? colors.agentWarning
          : colors.border;

  const StatusIcon =
    taskStatus === 'completed' ? CheckCircle : taskStatus === 'failed' ? XCircle : Clock;

  const statusColor =
    taskStatus === 'completed'
      ? colors.agentSuccess
      : taskStatus === 'failed'
        ? colors.agentError
        : colors.agentWarning;

  const statusLabel =
    taskStatus === 'completed'
      ? 'Task complete'
      : taskStatus === 'failed'
        ? 'Task failed'
        : taskStatus === 'working'
          ? 'Working...'
          : 'Pending';

  return (
    <View
      className="rounded-xl p-3 mt-1.5"
      style={{
        backgroundColor: `${borderColor}10`,
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
      }}
    >
      {/* Status row */}
      <View className="flex-row items-center gap-2 mb-1">
        <StatusIcon size={14} color={statusColor} />
        <Text className="text-[13px] font-medium" style={{ color: statusColor }}>
          {statusLabel}
        </Text>
      </View>

      {/* Status detail (working state) */}
      {message.statusDetail && taskStatus === 'working' && (
        <Text className="text-[12px] ml-5 mb-1" style={{ color: colors.textMuted }}>
          {message.statusDetail}
        </Text>
      )}

      {/* Result details */}
      {result?.fileName && (
        <Text className="text-[13px] ml-5" style={{ color: colors.textPrimary }}>
          Created: {result.fileName}
        </Text>
      )}
      {result?.location && (
        <Text className="text-[12px] ml-5" style={{ color: colors.textMuted }}>
          Location: {result.location}
        </Text>
      )}
      {result?.summary && (
        <Text className="text-[12px] ml-5 mt-1" style={{ color: colors.textSecondary }}>
          {result.summary}
        </Text>
      )}

      {/* Action buttons for completed tasks */}
      {taskStatus === 'completed' && result && (
        <View className="flex-row gap-2 mt-2 ml-5">
          {result.previewUrl && (
            <Pressable
              className="px-3 py-1.5 rounded-md active:opacity-70"
              style={{ backgroundColor: `${colors.teal}20` }}
              accessibilityLabel="Preview result"
              accessibilityRole="button"
            >
              <Text className="text-[11px] font-medium" style={{ color: colors.teal }}>
                Preview
              </Text>
            </Pressable>
          )}
          <Pressable
            className="px-3 py-1.5 rounded-md active:opacity-70"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            accessibilityLabel="Open on desktop"
            accessibilityRole="button"
          >
            <Text className="text-[11px] font-medium" style={{ color: colors.textSecondary }}>
              Open on Mac
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble — single message in the dispatch thread
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: DispatchMessage }) {
  const isUser = message.role === 'user';

  return (
    <View className={`px-4 py-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
      <View
        className={`rounded-2xl px-3.5 py-2.5 max-w-[85%] ${
          isUser ? 'rounded-br-md' : 'rounded-bl-md'
        }`}
        style={{
          backgroundColor: isUser ? colors.teal : colors.surfaceElevated,
        }}
      >
        <Text
          className="text-[15px] leading-[21px]"
          style={{ color: isUser ? colors.white : colors.textPrimary }}
        >
          {message.text}
        </Text>
      </View>

      {/* Task result card (only on desktop messages with task data) */}
      {!isUser && message.taskStatus && <TaskResultCard message={message} />}

      {/* Timestamp */}
      <Text className="text-[10px] mt-1 px-1" style={{ color: colors.textMuted }}>
        {formatTime(message.timestamp)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// DispatchInput — bottom input bar
// ---------------------------------------------------------------------------

function DispatchInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const status = useConnectionStore((s) => s.status);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const isConnected = status === 'connected';

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSend(trimmed);
    setText('');
  }, [text, onSend, hapticsEnabled]);

  return (
    <View className="px-3 pb-2 pt-1.5">
      {/* Offline banner */}
      {!isConnected && (
        <View className="flex-row items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-red-500/10">
          <WifiOff size={12} color={colors.agentError} />
          <Text className="text-[11px] flex-1" style={{ color: colors.agentError }}>
            Desktop offline -- tasks will queue until it reconnects
          </Text>
        </View>
      )}

      <View className="flex-row items-end gap-2">
        {/* Attachment button */}
        <Pressable
          className="w-10 h-10 rounded-full items-center justify-center active:bg-white/5"
          style={{ backgroundColor: colors.surfaceElevated }}
          accessibilityLabel="Attach file"
          accessibilityRole="button"
        >
          <Plus size={20} color={colors.textMuted} />
        </Pressable>

        {/* Text input */}
        <View
          className="flex-1 flex-row items-end rounded-2xl px-3.5 min-h-[40px]"
          style={{
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Message desktop..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            returnKeyType="default"
            blurOnSubmit={false}
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: 15,
              paddingVertical: Platform.OS === 'ios' ? 10 : 8,
              maxHeight: 120,
            }}
          />
        </View>

        {/* Send button */}
        <Pressable
          onPress={handleSend}
          disabled={!text.trim()}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{
            backgroundColor: text.trim() ? colors.teal : colors.surfaceElevated,
          }}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          <Send size={18} color={text.trim() ? colors.white : colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// QR Pairing Empty State — shown when not paired
// ---------------------------------------------------------------------------

function PairingPrompt() {
  const router = useRouter();

  const handleScanPress = useCallback(() => {
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [router]);

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="items-center gap-2 mb-6">
        <View className="flex-row items-center gap-4">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center"
            style={{ backgroundColor: `${colors.teal}15` }}
          >
            <Smartphone size={28} color={colors.teal} />
          </View>
          <Text className="text-[24px]" style={{ color: colors.textMuted }}>
            {'<->'}
          </Text>
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center"
            style={{ backgroundColor: `${colors.teal}15` }}
          >
            <Monitor size={28} color={colors.teal} />
          </View>
        </View>
      </View>

      <Text className="text-[18px] font-semibold text-white text-center mb-2">
        Pair your desktop
      </Text>
      <Text className="text-[14px] text-center leading-5 mb-6" style={{ color: colors.textMuted }}>
        Scan the QR code from AGI Workforce Desktop to start a persistent dispatch thread. Send
        tasks, get results, approve actions remotely.
      </Text>

      <Pressable
        onPress={handleScanPress}
        className="flex-row items-center gap-2.5 px-6 py-3.5 rounded-xl active:opacity-80"
        style={{ backgroundColor: colors.teal }}
        accessibilityLabel="Scan QR code to pair desktop"
        accessibilityRole="button"
      >
        <QrCode size={20} color={colors.white} />
        <Text className="text-[15px] font-semibold text-white">Scan QR Code</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Menu Overlay — thread options
// ---------------------------------------------------------------------------

function ThreadMenu({
  visible,
  onClose,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  onClear: () => void;
}) {
  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <Pressable
        className="absolute inset-0 z-40"
        onPress={onClose}
        accessibilityLabel="Close menu"
        accessibilityRole="button"
      />
      {/* Menu card */}
      <View
        className="absolute top-14 right-4 z-50 rounded-xl py-1.5 min-w-[180px]"
        style={{
          backgroundColor: colors.surfaceOverlay,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Pressable
          onPress={() => {
            onClear();
            onClose();
          }}
          className="flex-row items-center gap-3 px-4 py-3 active:bg-white/5"
          accessibilityLabel="Clear dispatch thread"
          accessibilityRole="button"
        >
          <Trash2 size={16} color={colors.agentError} />
          <Text className="text-[14px]" style={{ color: colors.agentError }}>
            Clear thread
          </Text>
        </Pressable>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Time formatting helper
// ---------------------------------------------------------------------------

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const timeStr = `${displayHours}:${minutes} ${ampm}`;

    if (isToday) return timeStr;

    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}, ${timeStr}`;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Main Dispatch Screen
// ---------------------------------------------------------------------------

export default function DispatchScreen() {
  const router = useRouter();
  const listRef = useRef<FlashListRef<DispatchMessage>>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const status = useConnectionStore((s) => s.status);
  const pairingCode = useConnectionStore((s) => s.pairingCode);
  const messages = useDispatchStore((s) => s.messages);
  const sendTask = useDispatchStore((s) => s.sendTask);
  const clearThread = useDispatchStore((s) => s.clearThread);

  // Whether we have ever paired (have a saved pairing code)
  const hasPaired = pairingCode != null;

  // Whether we should show the pairing prompt
  const showPairingPrompt = !hasPaired && status === 'disconnected';

  const handleSend = useCallback(
    (text: string) => {
      sendTask(text);
    },
    [sendTask],
  );

  // Auto-scroll when new messages arrive
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
    }
  }, [router]);

  const handleClearThread = useCallback(() => {
    clearThread();
  }, [clearThread]);

  // Show pairing prompt if never paired
  if (showPairingPrompt) {
    return (
      <SafeAreaView className="flex-1 bg-surface-base" edges={['top', 'bottom']}>
        <DispatchHeader onBack={handleBack} onMenuPress={() => setMenuVisible(true)} />
        <PairingPrompt />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <DispatchHeader onBack={handleBack} onMenuPress={() => setMenuVisible(true)} />

        {/* Message thread or empty state */}
        {messages.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
              style={{ backgroundColor: `${colors.teal}15` }}
            >
              <Monitor size={28} color={colors.teal} />
            </View>
            <Text
              className="text-[15px] text-center leading-[22px] mb-1"
              style={{ color: colors.textSecondary }}
            >
              Send your first task
            </Text>
            <Text
              className="text-[13px] text-center leading-[19px]"
              style={{ color: colors.textMuted }}
            >
              Type a message to assign a task to your desktop.{'\n'}
              Results will appear here.
            </Text>
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={messages}
            renderItem={({ item }) => <MessageBubble message={item} />}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: 8 }}
            onContentSizeChange={() => {
              // Keep scrolled to bottom as content grows
              listRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        {/* Input bar */}
        <DispatchInput onSend={handleSend} />
      </KeyboardAvoidingView>

      {/* Overlay menu */}
      <ThreadMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onClear={handleClearThread}
      />
    </SafeAreaView>
  );
}
