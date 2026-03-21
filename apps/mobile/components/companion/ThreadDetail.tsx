/**
 * ThreadDetail
 *
 * Full-thread view showing all messages in a cross-device thread plus an
 * input bar to send new messages to the desktop. Messages from the desktop
 * are shown on the left; mobile-originated messages on the right.
 *
 * Sending a message publishes it to the cross-device store locally and
 * dispatches a control message over the companion WebSocket so the desktop
 * can continue the conversation.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import {
  Send,
  Monitor,
  Smartphone,
  Paperclip,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Pause,
  Zap,
  MessageSquare,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useCrossDeviceStore, type CrossDeviceMessage } from '@/stores/crossDeviceStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ThreadDetailProps {
  threadId: string;
}

// ---------------------------------------------------------------------------
// Attachment chip
// ---------------------------------------------------------------------------

function AttachmentChip({
  attachment,
}: {
  attachment: { type: string; name: string; url?: string };
}) {
  const isImage = attachment.type.startsWith('image/');
  const Icon = isImage ? ImageIcon : FileText;
  const iconColor = isImage ? colors.agentActive : colors.textMuted;

  return (
    <View
      className="flex-row items-center gap-1.5 px-2 py-1 rounded-lg mt-1"
      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
    >
      <Icon size={10} color={iconColor} />
      <Text className="text-[10px] text-white/50" numberOfLines={1}>
        {attachment.name}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: CrossDeviceMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isFromMobile = message.deviceType === 'mobile';

  const bubbleBg = isFromMobile
    ? colors.teal
    : message.role === 'assistant'
      ? 'rgba(255,255,255,0.07)'
      : 'rgba(255,255,255,0.04)';

  const textColor = isFromMobile ? '#fff' : colors.textPrimary;

  const timeLabel = (() => {
    try {
      return new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  })();

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      layout={LinearTransition.springify()}
      className={`mb-3 ${isFromMobile ? 'items-end' : 'items-start'}`}
    >
      {/* Origin label */}
      <View className="flex-row items-center gap-1 mb-0.5 px-1">
        {isFromMobile ? (
          <>
            <Text className="text-[9px] text-white/30">{timeLabel}</Text>
            <Smartphone size={9} color={colors.textMuted} />
          </>
        ) : (
          <>
            <Monitor size={9} color={colors.textMuted} />
            <Text className="text-[9px] text-white/30">{timeLabel}</Text>
          </>
        )}
      </View>

      {/* Bubble */}
      <View
        className="rounded-2xl px-3.5 py-2.5 max-w-[85%]"
        style={{
          backgroundColor: bubbleBg,
          borderBottomRightRadius: isFromMobile ? 4 : 16,
          borderBottomLeftRadius: isFromMobile ? 16 : 4,
        }}
      >
        <Text className="text-sm leading-5" style={{ color: textColor }}>
          {message.content}
        </Text>

        {/* Inline execution result indicator */}
        {message.role === 'assistant' && message.content.length === 0 && (
          <Text className="text-xs text-white/30 italic">Thinking...</Text>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <View className="mt-1.5 gap-0.5">
            {message.attachments.map((att, idx) => (
              <AttachmentChip key={idx} attachment={att} />
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Thread status banner
// ---------------------------------------------------------------------------

function ThreadStatusBanner({ status }: { status: 'active' | 'paused' | 'completed' }) {
  if (status === 'active') return null;

  const isPaused = status === 'paused';
  const bgColor = isPaused ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)';
  const borderColor = isPaused ? 'rgba(245,158,11,0.20)' : 'rgba(16,185,129,0.20)';
  const icon = isPaused ? (
    <Pause size={13} color={colors.agentWarning} />
  ) : (
    <CheckCircle2 size={13} color={colors.agentSuccess} />
  );
  const label = isPaused ? 'Thread paused' : 'Thread completed';
  const labelColor = isPaused ? colors.agentWarning : colors.agentSuccess;

  return (
    <View
      className="flex-row items-center gap-2 px-3 py-2 mx-4 my-2 rounded-xl"
      style={{ backgroundColor: bgColor, borderWidth: 1, borderColor }}
    >
      {icon}
      <Text className="text-xs flex-1" style={{ color: labelColor }}>
        {label} — messages are read-only
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyMessages() {
  return (
    <View className="flex-1 items-center justify-center px-8 py-10">
      <View className="w-12 h-12 rounded-2xl bg-white/5 items-center justify-center mb-3">
        <MessageSquare size={22} color={colors.textMuted} />
      </View>
      <Text className="text-white/50 text-center text-sm">No messages yet</Text>
      <Text className="text-white/30 text-center text-xs mt-1 leading-4">
        Type a message below to start the conversation on desktop.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main ThreadDetail component
// ---------------------------------------------------------------------------

export function ThreadDetail({ threadId }: ThreadDetailProps) {
  const thread = useCrossDeviceStore((s) => s.threads.find((t) => t.id === threadId));
  const addMessage = useCrossDeviceStore((s) => s.addMessage);
  const markThreadRead = useCrossDeviceStore((s) => s.markThreadRead);
  const sendControl = useConnectionStore((s) => s.sendControl);
  const connectionStatus = useConnectionStore((s) => s.status);

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Mark as read when opened
  useEffect(() => {
    markThreadRead(threadId);
  }, [threadId, markThreadRead]);

  // Scroll to bottom when messages change
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [thread?.messages.length]);

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setInputText('');

    // Add message to local store immediately
    addMessage(threadId, {
      threadId,
      deviceType: 'mobile',
      role: 'user',
      content: trimmed,
    });

    // Send to desktop via WebRTC/signaling control channel
    if (connectionStatus === 'connected' || connectionStatus === 'stale') {
      sendControl('thread_message', {
        threadId,
        content: trimmed,
        sentAt: new Date().toISOString(),
      });
    }

    setIsSending(false);
  }, [inputText, isSending, addMessage, threadId, sendControl, connectionStatus]);

  const isConnected = connectionStatus === 'connected';
  const isReadOnly = thread?.status !== 'active';
  const canSend = isConnected && !isReadOnly;
  const messages: CrossDeviceMessage[] = thread?.messages ?? [];

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* Thread header */}
      {thread && (
        <View className="flex-row items-center gap-2.5 px-4 py-3 border-b border-white/8">
          <Zap size={14} color={colors.agentActive} />
          <Text className="text-sm font-semibold text-white flex-1" numberOfLines={1}>
            {thread.title}
          </Text>
          <Badge
            label={thread.status}
            color={
              thread.status === 'active'
                ? 'blue'
                : thread.status === 'completed'
                  ? 'green'
                  : 'yellow'
            }
          />
        </View>
      )}

      {/* Status banner for non-active threads */}
      {thread && <ThreadStatusBanner status={thread.status} />}

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <EmptyMessages />
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </ScrollView>

      <Separator />

      {/* Input bar */}
      <View className="flex-row items-end gap-2 px-4 py-3">
        {/* Attachment placeholder (no-op for now) */}
        <Pressable
          className="w-9 h-9 rounded-xl bg-white/5 items-center justify-center active:bg-white/10"
          accessibilityLabel="Add attachment"
          accessibilityRole="button"
          disabled={!canSend}
          style={{ opacity: canSend ? 1 : 0.35 }}
        >
          <Paperclip size={16} color={colors.textMuted} />
        </Pressable>

        {/* Text input */}
        <TextInput
          className="flex-1 min-h-[40px] max-h-[120px] px-3 py-2 rounded-xl text-sm text-white"
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            color: colors.textPrimary,
          }}
          placeholder={
            !isConnected
              ? 'Not connected to desktop'
              : isReadOnly
                ? 'Thread is read-only'
                : 'Message desktop...'
          }
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.teal}
          value={inputText}
          onChangeText={setInputText}
          multiline
          editable={canSend}
          returnKeyType="default"
          accessibilityLabel="Message input"
        />

        {/* Send button */}
        <Pressable
          onPress={handleSend}
          disabled={!inputText.trim() || !canSend || isSending}
          className="w-9 h-9 rounded-xl items-center justify-center active:opacity-70"
          style={{
            backgroundColor: inputText.trim() && canSend ? colors.teal : 'rgba(255,255,255,0.06)',
          }}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          <Send size={15} color={inputText.trim() && canSend ? '#fff' : colors.textMuted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
