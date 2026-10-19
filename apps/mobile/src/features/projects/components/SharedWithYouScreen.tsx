import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FileCode2, MessageSquare, Plug, Users, type LucideIcon } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { API_URL } from '@/lib/constants';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import {
  ACCESS_LABELS,
  fetchProjectSharing,
  projectsSharedWithMe,
  sharedResourcesForMe,
  type SharedWithMeProject,
  type SharedWithMeResources,
} from '@/src/features/projects/projectSharing';
import {
  SHARED_CHAT_UNAVAILABLE_COPY,
  SharedChatUnavailableError,
  copySharedChatInto,
  fetchSharedChat,
} from '@/src/features/shared-links/continueSharedChat';
import { useChatStore } from '@/stores/chatStore';
import { toUserMessage } from '@/services/userMessage';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

interface Loaded {
  projects: SharedWithMeProject[];
  resources: SharedWithMeResources;
}

function Row({
  icon: Icon,
  title,
  subtitle,
  onPress,
  isLast,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLast: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      style={{
        minHeight: 56,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Icon size={18} color={colors.textSecondary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
          {title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          letterSpacing: 0.7,
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      <SettingsGroup>{children}</SettingsGroup>
    </>
  );
}

export function SharedWithYouScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const createConversation = useChatStore((s) => s.createConversation);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void fetchProjectSharing(controller.signal)
      .then((overview) => {
        if (controller.signal.aborted) return;
        setLoaded(
          overview
            ? {
                projects: projectsSharedWithMe(overview),
                resources: sharedResourcesForMe(overview, API_URL),
              }
            : null,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded(null);
      });
    return () => controller.abort();
  }, []);

  const continueChat = async (token: string) => {
    let createdId: string | null = null;
    try {
      const copy = await fetchSharedChat(token);
      if (copy.messages.length === 0) {
        Alert.alert('Nothing to continue', 'This shared conversation has no messages.');
        return;
      }
      createdId = await createConversation(copy.title);
      await copySharedChatInto(createdId, copy.messages);
      await loadMessages(createdId);
      router.push({ pathname: '/(app)/chat/[id]', params: { id: createdId } });
    } catch (error) {
      if (createdId) await deleteConversation(createdId).catch(() => undefined);
      Alert.alert(
        'Could not continue this chat',
        error instanceof SharedChatUnavailableError
          ? SHARED_CHAT_UNAVAILABLE_COPY[error.reason]
          : createdId
            ? 'The shared messages could not be copied, so no new conversation was kept.'
            : toUserMessage(error, 'This shared conversation could not be opened.'),
      );
    }
  };

  const chooseChatAction = (entry: { token: string; title: string; url: string }) =>
    Alert.alert(entry.title, 'Open the shared conversation, or copy it into a new chat of yours.', [
      { text: 'Open', onPress: () => void openUntrustedUrlInAppBrowser(entry.url) },
      { text: 'Continue in a new chat', onPress: () => void continueChat(entry.token) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  if (loaded === undefined) {
    return (
      <SettingsScreenShell title="Shared with you" backHref="/(app)/(tabs)/projects">
        <ActivityIndicator
          accessibilityLabel="Loading what is shared with you"
          color={colors.textSecondary}
        />
      </SettingsScreenShell>
    );
  }

  const empty =
    !loaded ||
    (loaded.projects.length === 0 &&
      loaded.resources.conversations.length === 0 &&
      loaded.resources.artifacts.length === 0 &&
      loaded.resources.connectors.length === 0);

  return (
    <SettingsScreenShell title="Shared with you" backHref="/(app)/(tabs)/projects">
      {empty ? (
        <SettingsInfo
          testID="shared-with-you-empty"
          title="Nothing shared with you yet"
          body="Projects, chats, artifacts and connectors that people in your workspace share with you appear here."
          icon={Users}
        />
      ) : null}
      {loaded && loaded.projects.length > 0 ? (
        <Section label="PROJECTS">
          {loaded.projects.map((project, index, list) => (
            <Row
              key={project.projectId}
              icon={Users}
              title={project.name}
              subtitle={`${project.ownerName} · ${ACCESS_LABELS[project.access]}`}
              isLast={index === list.length - 1}
              onPress={() =>
                router.push({
                  pathname: '/(app)/projects/shared/[id]',
                  params: { id: project.projectId },
                })
              }
            />
          ))}
        </Section>
      ) : null}
      {loaded && loaded.resources.conversations.length > 0 ? (
        <Section label="CHATS">
          {loaded.resources.conversations.map((entry, index, list) => (
            <Row
              key={entry.id}
              icon={MessageSquare}
              title={entry.title}
              subtitle={`Shared by ${entry.ownerName}`}
              isLast={index === list.length - 1}
              onPress={() => chooseChatAction(entry)}
            />
          ))}
        </Section>
      ) : null}
      {loaded && loaded.resources.artifacts.length > 0 ? (
        <Section label="ARTIFACTS">
          {loaded.resources.artifacts.map((entry, index, list) => (
            <Row
              key={entry.id}
              icon={FileCode2}
              title={entry.title}
              subtitle={`${entry.kind} · shared by ${entry.ownerName}`}
              isLast={index === list.length - 1}
              onPress={() => void openUntrustedUrlInAppBrowser(entry.url)}
            />
          ))}
        </Section>
      ) : null}
      {loaded && loaded.resources.connectors.length > 0 ? (
        <Section label="CONNECTORS">
          {loaded.resources.connectors.map((entry, index, list) => (
            <Row
              key={entry.id}
              icon={Plug}
              title={entry.name}
              subtitle={`Shared by ${entry.ownerName}`}
              isLast={index === list.length - 1}
              onPress={() => router.push('/(app)/connectors')}
            />
          ))}
        </Section>
      ) : null}
    </SettingsScreenShell>
  );
}
