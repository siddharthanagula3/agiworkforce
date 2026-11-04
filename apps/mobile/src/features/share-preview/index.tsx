import { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  X,
  Send,
  AlertTriangle,
  FileText,
  MessageCircleQuestionMark,
  Paperclip,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useChatStore, useChatMessageStore, useChatCloudMessageStore } from '@/stores/chatStore';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { setDraft, type DraftProvenance } from '@/src/features/chat/draftStore';
import {
  stageComposerAttachments,
  takeComposerAttachments,
} from '@/src/features/chat/composerHandoff';
import { validateAttachments } from '@/src/features/chat/utils/attachmentValidation';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';

import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import { createSharePreviewAdmission, type SharePreviewStatus } from './sharePreviewAdmission';

const MAX_SHARED_BYTES = 100 * 1024;
const NEW_CHAT_DRAFT_KEY = 'new-chat';
const SHARED_URL = /\bhttps?:\/\/[^\s<>"]+/i;
const SUMMARIZE_PROMPT = 'Summarize this page.';

export function sharedPageUrl(raw: string): string | null {
  return SHARED_URL.exec(raw)?.[0] ?? null;
}

function boundSharedText(raw: string): { text: string; truncated: boolean } {
  const cleaned = raw.replace(/<\/?shared_via_intent>/gi, '').replace(/<\/?system>/gi, '');
  const bytes = new TextEncoder().encode(cleaned);
  if (bytes.length <= MAX_SHARED_BYTES) return { text: cleaned, truncated: false };
  return { text: new TextDecoder().decode(bytes.slice(0, MAX_SHARED_BYTES)), truncated: true };
}

export function sanitiseSharedText(raw: string): { text: string; truncated: boolean } {
  const bounded = boundSharedText(raw);
  return {
    text: `<shared_via_intent>\n${bounded.text}\n</shared_via_intent>`,
    truncated: bounded.truncated,
  };
}

export default function SharePreviewScreen() {
  const { colors: themeColors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    text?: string;
    nativeTruncated?: string;
    handoff?: string;
  }>();
  const rawText = typeof params.text === 'string' ? params.text : '';
  const handoffKey = typeof params.handoff === 'string' ? params.handoff : '';
  const appMode = useChatAppModeStore((state) => state.appMode);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);

  const [status, setStatus] = useState<SharePreviewStatus>('idle');
  const mounted = useRef(true);
  const previewIdentity = JSON.stringify([rawText, handoffKey, params.nativeTruncated]);
  const currentPreviewIdentity = useRef(previewIdentity);
  currentPreviewIdentity.current = previewIdentity;
  const [original] = useState(() => ({
    mode: appMode,
    identity: previewIdentity,
    account: appMode === 'cloud' ? captureCloudAccountEpoch() : null,
    ownerId: appMode === 'cloud' ? clerkUserId : null,
  }));
  const [admission] = useState(() => createSharePreviewAdmission({
    isCurrent: () => {
      if (!mounted.current || currentPreviewIdentity.current !== original.identity ||
          useChatAppModeStore.getState().appMode !== original.mode) return false;
      if (original.mode === 'local') return true;
      const auth = useAuthStore.getState();
      return isCloudAccountEpochCurrent(original.account) &&
        original.account.ownerId === original.ownerId &&
        auth.clerkUserId === original.ownerId && auth.isClerkSignedIn;
    },
    conversationExists: (id) => {
      const store = original.mode === 'local' ? useChatMessageStore : useChatCloudMessageStore;
      return store.getState().conversations.some((conversation) =>
        conversation.id === id && executionModeForConversation(conversation) === original.mode);
    },
    createConversation: (title) => useChatStore.getState().createConversation(title),
    sendMessage: (id, content, model, onAccepted) =>
      useChatStore.getState().sendMessage(id, content, model, undefined, { onAccepted }),
    navigate: (id) => {
      if (id) router.replace({ pathname: '/(app)/chat/[id]' as const, params: { id } });
      else router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
    },
    onChange: (next) => { if (mounted.current) setStatus(next); },
  }));
  useEffect(() => {
    mounted.current = true;
    const unsubscribeMode = useChatAppModeStore.subscribe((state, previous) => {
      if (state.appMode !== previous.appMode) admission.invalidate();
    });
    const unsubscribeAuth = original.mode === 'cloud'
      ? useAuthStore.subscribe((state, previous) => {
          if (state.clerkUserId !== previous.clerkUserId ||
              state.isClerkSignedIn !== previous.isClerkSignedIn) admission.invalidate();
        })
      : () => {};
    const unsubscribeEpoch = original.mode === 'cloud'
      ? subscribeCloudAccountEpochChange(() => { admission.isCurrent(); })
      : () => {};
    admission.isCurrent();
    return () => {
      mounted.current = false;
      unsubscribeMode();
      unsubscribeAuth();
      unsubscribeEpoch();
    };
  }, [admission, original]);
  useEffect(() => { admission.isCurrent(); }, [admission, previewIdentity]);
  const sending = status === 'pending';
  const canSend = status === 'idle' || status === 'refused';
  const canCheckChat = status === 'accepted' || status === 'uncertain';
  const [attachments] = useState<Attachment[]>(() => takeComposerAttachments(handoffKey));

  const { text: sanitised, truncated: truncatedInApp } = sanitiseSharedText(rawText);
  const draftText = useMemo(() => boundSharedText(rawText).text, [rawText]);
  const truncated = truncatedInApp || params.nativeTruncated === '1';

  const provenance: DraftProvenance | undefined =
    appMode === 'local'
      ? { scope: 'local' }
      : clerkUserId
        ? { scope: 'cloud', ownerId: clerkUserId }
        : undefined;

  const handleAttachToComposer = () => {
    if (!canSend || !admission.isCurrent()) return;
    const { accepted, rejected } = validateAttachments(attachments, appMode);
    if (rejected.length > 0) {
      Alert.alert(
        rejected.length === 1 ? 'Attachment not added' : 'Some attachments not added',
        rejected.map((item) => item.reason).join('\n'),
      );
    }
    if (accepted.length === 0) return;

    if (!admission.acquire()) return;
    const openConversationId = useChatStore.getState().currentConversationId;
    const draftKey = openConversationId ?? NEW_CHAT_DRAFT_KEY;
    stageComposerAttachments(draftKey, accepted);
    if (draftText.trim() && provenance) setDraft(draftKey, draftText, provenance);

    if (openConversationId) {
      router.replace({
        pathname: '/(app)/chat/[id]' as const,
        params: { id: openConversationId },
      });
      return;
    }
    router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  };

  const handleSend = () => {
    const previewTitle = rawText.length > 40 ? rawText.slice(0, 40).trim() + '...' : rawText;
    return admission.send(previewTitle, sanitised, useModelStore.getState().selectedModel);
  };

  const pageUrl = sharedPageUrl(rawText);

  const handleSummarize = () => {
    if (!pageUrl) return;
    return admission.send(
      SUMMARIZE_PROMPT,
      `${SUMMARIZE_PROMPT}\n\n${sanitised}`,
      useModelStore.getState().selectedModel,
    );
  };

  const handleAskAbout = () => {
    if (!pageUrl || !provenance || !admission.acquire()) return;
    const openConversationId = useChatStore.getState().currentConversationId;
    const draftKey = openConversationId ?? NEW_CHAT_DRAFT_KEY;
    setDraft(draftKey, `${draftText}\n\n`, provenance);
    if (openConversationId) {
      router.replace({
        pathname: '/(app)/chat/[id]' as const,
        params: { id: openConversationId },
      });
      return;
    }
    router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  };

  const quickActionStyle = {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  } as const;

  const handleDismiss = () => {
    admission.invalidate();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: '/(app)' as const });
    }
  };

  const hasAttachments = attachments.length > 0;
  const primaryLabel = canCheckChat ? 'Check chat' : hasAttachments
    ? sending
      ? 'Opening chat…'
      : 'Add to chat'
    : sending
      ? 'Opening chat…'
      : 'Send to Chat';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: themeColors.border,
        }}
      >
        <Text
          style={{
            fontSize: typeScale.headline,
            fontWeight: '600',
            color: themeColors.textPrimary,
          }}
        >
          Shared Content
        </Text>
        <PressableBox
          onPress={handleDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss share preview"
        >
          <X size={22} color={themeColors.textMuted} />
        </PressableBox>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {(status === 'refused' || canCheckChat || status === 'invalid') && (
          <Text accessibilityRole="alert" style={{ color: themeColors.textSecondary }}>
            {status === 'refused'
              ? 'Your message was not accepted. The shared content is still here. You can try sending again.'
              : status === 'invalid'
                ? 'This preview is no longer active for its original mode or account. Dismiss it and share again.'
                : status === 'accepted'
                  ? 'Your message was accepted. Open the chat to check its progress.'
                  : 'The outcome could not be confirmed. Check your chat before sharing again to avoid duplicates.'}
          </Text>
        )}
        {truncated && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: themeColors.agentWarning + '22',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <AlertTriangle size={16} color={themeColors.agentWarning} />
            <Text
              style={{ flex: 1, color: themeColors.agentWarning, fontSize: typeScale.footnote }}
            >
              Content was truncated to 100 KB before sending.
            </Text>
          </View>
        )}

        {hasAttachments && (
          <View style={{ gap: 8 }}>
            {attachments.map((attachment) => (
              <View
                key={attachment.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: themeColors.surfaceElevated,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: themeColors.border,
                  padding: 10,
                }}
              >
                {attachment.mimeType.startsWith('image/') ? (
                  <Image
                    source={{ uri: attachment.uri }}
                    style={{ width: 48, height: 48, borderRadius: 8 }}
                    contentFit="cover"
                    accessibilityLabel={attachment.fileName}
                  />
                ) : (
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: themeColors.background,
                    }}
                  >
                    <FileText size={20} color={themeColors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: themeColors.textPrimary, fontSize: typeScale.subhead }}
                  >
                    {attachment.fileName}
                  </Text>
                  <Text style={{ color: themeColors.textMuted, fontSize: typeScale.caption }}>
                    {attachment.mimeType}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {rawText.trim().length > 0 && (
          <View
            style={{
              backgroundColor: themeColors.surfaceElevated,
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: themeColors.border,
            }}
          >
            <Text
              style={{
                color: themeColors.textSecondary,
                fontSize: typeScale.footnote,
                lineHeight: 20,
                fontFamily: 'monospace',
              }}
              selectable
            >
              {rawText.slice(0, 2000)}
              {rawText.length > 2000 ? `\n\n… (${rawText.length - 2000} more chars)` : ''}
            </Text>
          </View>
        )}

        {pageUrl && !hasAttachments ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PressableBox
              onPress={() => void handleSummarize()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Summarize this page"
              style={quickActionStyle}
            >
              <FileText size={15} color={themeColors.textPrimary} />
              <Text style={{ color: themeColors.textPrimary, fontWeight: '600' }}>
                Summarize this page
              </Text>
            </PressableBox>
            <PressableBox
              onPress={handleAskAbout}
              disabled={!canSend || !provenance}
              accessibilityRole="button"
              accessibilityLabel="Ask about this page"
              style={quickActionStyle}
            >
              <MessageCircleQuestionMark size={15} color={themeColors.textPrimary} />
              <Text style={{ color: themeColors.textPrimary, fontWeight: '600' }}>
                Ask about this page
              </Text>
            </PressableBox>
          </View>
        ) : null}

        <Text
          style={{ color: themeColors.textMuted, fontSize: typeScale.caption, textAlign: 'center' }}
        >
          {hasAttachments
            ? 'Review what was shared. It is attached to your next message, which you send yourself.'
            : 'Review the shared content above before sending to your AI chat.'}
        </Text>
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: themeColors.border,
        }}
      >
        <PressableBox
          onPress={handleDismiss}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: themeColors.border,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: themeColors.textPrimary, fontWeight: '600' }}>Dismiss</Text>
        </PressableBox>

        <PressableBox
          onPress={canCheckChat ? admission.checkChat : hasAttachments ? handleAttachToComposer : handleSend}
          disabled={(!canSend && !canCheckChat) || (!hasAttachments && !rawText.trim())}
          accessibilityRole="button"
          accessibilityLabel={canCheckChat ? 'Check chat' : hasAttachments ? 'Add shared files to chat' : 'Send shared text'}
          style={{
            flex: 2,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: sending ? themeColors.teal + '88' : themeColors.teal,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {hasAttachments ? (
            <Paperclip size={16} color={themeColors.accentText} />
          ) : (
            <Send size={16} color={themeColors.accentText} />
          )}
          <Text style={{ color: themeColors.accentText, fontWeight: '600' }}>{primaryLabel}</Text>
        </PressableBox>
      </View>
    </SafeAreaView>
  );
}
