import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Cloud } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { formatAttachmentSize } from '@/src/features/chat/utils/attachmentSize';
import { fetchCloudFileBreakdown, type CloudFileBreakdown } from '@/services/usage';

type BreakdownState =
  | { owner: string | null; phase: 'measuring' }
  | { owner: string | null; phase: 'ready'; value: CloudFileBreakdown }
  | { owner: string | null; phase: 'failed' }
  | { owner: string | null; phase: 'absent' };

type BreakdownKind = 'documents' | 'images';

function sizeText(state: BreakdownState, kind: BreakdownKind): string {
  if (state.phase === 'measuring') return 'Measuring…';
  if (state.phase !== 'ready') return 'Unavailable';
  return formatAttachmentSize(
    kind === 'documents' ? state.value.documentsBytes : state.value.imagesBytes,
  );
}

function BreakdownRow({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  onPress: () => void;
  testID: string;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${value}`}
      accessibilityHint="Opens your Library"
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ flex: 1, color: c.textSecondary, fontSize: typeScale.subhead }}>{label}</Text>
      <Text
        testID={`${testID}-size`}
        style={{ color: c.textPrimary, fontSize: typeScale.subhead, fontWeight: '500' }}
      >
        {value}
      </Text>
      <ChevronRight size={17} color={c.textMuted} />
    </Pressable>
  );
}

export function StorageBreakdownCard() {
  const c = useThemeColors();
  const router = useRouter();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((s) => s.clerkUserId) ?? null;
  const enabled = appMode === 'cloud' && isSignedIn;
  const [state, setState] = useState<BreakdownState | null>(null);
  const latestRequest = useRef(0);
  const provenOwner = useRef<string | null | undefined>(undefined);

  const request = useCallback(
    async (showMeasuring: boolean) => {
      const requestId = ++latestRequest.current;
      if (showMeasuring) setState({ owner: clerkUserId, phase: 'measuring' });
      let next: BreakdownState;
      try {
        const value = await fetchCloudFileBreakdown();
        if (value) provenOwner.current = clerkUserId;
        next = value
          ? { owner: clerkUserId, phase: 'ready', value }
          : { owner: clerkUserId, phase: 'absent' };
      } catch {
        next = {
          owner: clerkUserId,
          phase: provenOwner.current === clerkUserId ? 'failed' : 'absent',
        };
      }
      if (requestId === latestRequest.current) setState(next);
    },
    [clerkUserId],
  );

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      void request(false);
      return () => {
        latestRequest.current += 1;
      };
    }, [enabled, request]),
  );

  const retry = useCallback(() => {
    void request(true);
  }, [request]);

  const openLibrary = useCallback(
    (filter: BreakdownKind) => {
      router.push({ pathname: '/(app)/library', params: { filter } });
    },
    [router],
  );

  const current = state && state.owner === clerkUserId ? state : null;
  if (!enabled || !current || current.phase === 'absent') return null;

  return (
    <Card testID="storage-breakdown-card">
      <View className="flex-row items-center gap-3 mb-1">
        <Cloud size={18} color={c.teal} />
        <Text className="text-[15px] font-semibold" style={{ color: c.textPrimary }}>
          Cloud files
        </Text>
      </View>
      <BreakdownRow
        testID="storage-breakdown-documents"
        label="Documents"
        value={sizeText(current, 'documents')}
        onPress={() => openLibrary('documents')}
      />
      <Separator />
      <BreakdownRow
        testID="storage-breakdown-images"
        label="Images"
        value={sizeText(current, 'images')}
        onPress={() => openLibrary('images')}
      />
      {current.phase === 'failed' ? (
        <Pressable
          onPress={retry}
          className="self-start justify-center active:opacity-70"
          style={{ minHeight: 44 }}
          accessibilityLabel="Try reading cloud files again"
          accessibilityRole="button"
        >
          <Text className="text-sm font-medium" style={{ color: c.teal }}>
            Try again
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
