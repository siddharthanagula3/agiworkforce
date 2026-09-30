import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { translatePlural } from '@/src/i18n/plural';
import {
  publishFailureMessage,
  setPublishedArtifactAudience,
  unpublishArtifact,
  type ArtifactPublication,
  type PublishedArtifactAudience,
} from '../services/artifactPublishing';

interface PublishedArtifactControlsProps {
  title: string;
  publication: ArtifactPublication;
  workspaceMemberCount: number | null;
  onChanged: (publication: ArtifactPublication) => void;
  onUnpublished: () => void;
}

function confirm(title: string, message: string, confirmLabel: string, destructive: boolean) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function PublishedArtifactControls({
  title,
  publication,
  workspaceMemberCount,
  onChanged,
  onUnpublished,
}: PublishedArtifactControlsProps) {
  const colors = useThemeColors();
  const [busy, setBusy] = useState<'audience' | 'unpublish' | null>(null);

  const changeAudience = useCallback(
    async (next: PublishedArtifactAudience) => {
      if (busy || next === publication.visibility) return;
      const memberLabel = translatePlural('settings', 'counts.members', workspaceMemberCount ?? 0, {
        one: '{{count}} member',
        other: '{{count}} members',
      });
      const confirmed =
        next === 'organization'
          ? await confirm(
              'Limit this to your workspace?',
              `The public link stops opening, so anyone outside your workspace who already has it loses access. Your ${memberLabel} can open it instead. You can switch back, and the link stays the same.`,
              'Share with workspace',
              false,
            )
          : await confirm(
              'Make this public again?',
              'Anyone holding the link can open it, including people outside your workspace and anyone they forward it to. Publishing cannot un-share a copy somebody has already taken.',
              'Make public',
              false,
            );
      if (!confirmed) return;
      setBusy('audience');
      try {
        onChanged(await setPublishedArtifactAudience(publication.shareUrl, next));
      } catch (error) {
        Alert.alert('Could not change who can open this', publishFailureMessage(error));
      } finally {
        setBusy(null);
      }
    },
    [busy, onChanged, publication, workspaceMemberCount],
  );

  const handleUnpublish = useCallback(async () => {
    if (busy) return;
    const confirmed = await confirm(
      'Unpublish this artifact?',
      `Anyone using the link for “${title}” will immediately lose access. This cannot be undone.`,
      'Unpublish',
      true,
    );
    if (!confirmed) return;
    setBusy('unpublish');
    try {
      await unpublishArtifact(publication.shareUrl);
      onUnpublished();
    } catch (error) {
      Alert.alert('Could not unpublish', publishFailureMessage(error));
    } finally {
      setBusy(null);
    }
  }, [busy, onUnpublished, publication.shareUrl, title]);

  const options: { value: PublishedArtifactAudience; label: string }[] = [
    { value: 'public', label: 'Anyone with the link' },
    ...(workspaceMemberCount !== null
      ? [
          {
            value: 'organization' as const,
            label: `Everyone in this workspace (${workspaceMemberCount})`,
          },
        ]
      : []),
  ];

  return (
    <View style={{ marginTop: 8, gap: 6 }} testID="artifact-published-controls">
      <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
        Who can open this
      </Text>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
        accessibilityRole="radiogroup"
      >
        {options.map((option) => {
          const selected = option.value === publication.visibility;
          return (
            <Pressable
              key={option.value}
              onPress={() => void changeAudience(option.value)}
              disabled={busy !== null}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: busy !== null }}
              accessibilityLabel={option.label}
              testID={`artifact-audience-${option.value}`}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: selected ? colors.textSecondary : colors.border,
                backgroundColor: selected ? colors.neutralSurface : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: typeScale.footnote,
                  color: colors.textPrimary,
                  fontWeight: selected ? '600' : '400',
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => void handleUnpublish()}
        disabled={busy !== null}
        accessibilityRole="button"
        accessibilityLabel="Unpublish artifact"
        accessibilityState={{ disabled: busy !== null }}
        testID="artifact-unpublish"
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.agentError }}>
          {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
        </Text>
      </Pressable>
    </View>
  );
}
