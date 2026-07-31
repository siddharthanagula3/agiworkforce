/**
 * Permissions Settings Screen — Index
 *
 * Displays native-backed permission rows. Each row shows an icon, label, the
 * current OS status, and a chevron to the per-permission detail.
 *
 * Read-on-focus via getPermissionsAsync (no prompt). User action → detail
 * screen handles the actual request/Settings redirect.
 */
import { useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { useTheme, useThemeColors } from '@/src/ui/theme';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { PERMISSION_REGISTRY, PERMISSION_KINDS, isPermissionGranted } from './registry';
import type { MobilePermissionKind } from './types';

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface PermissionRowProps {
  kind: MobilePermissionKind;
  isLast: boolean;
  onPressDetail: (kind: MobilePermissionKind) => void;
}

function PermissionRow({ kind, isLast, onPressDetail }: PermissionRowProps) {
  const c = useThemeColors();
  const entry = PERMISSION_REGISTRY[kind];
  const Icon = entry.icon;
  const permState = usePermissionsStore((s) => s.permissions[kind]);
  const status = permState?.lastObservedStatus ?? 'undetermined';
  const granted = isPermissionGranted(status);
  const statusLabel = granted ? 'On' : status === 'undetermined' ? 'Ask' : 'Off';
  // Mirror statusLabel's three states here — collapsing 'undetermined' into
  // 'denied' told VoiceOver users a permission was rejected when the OS
  // simply hasn't asked yet, which reads as needing a trip to Settings to
  // fix something that was never actually broken.
  const accessibilityStatus = granted
    ? 'allowed'
    : status === 'undetermined'
      ? 'not yet asked'
      : 'denied';

  return (
    <View>
      <Pressable
        onPress={() => onPressDetail(kind)}
        accessibilityRole="button"
        accessibilityLabel={`${entry.label} permission. Currently ${accessibilityStatus}. Tap to manage.`}
        style={{
          minHeight: 72,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: 10,
          paddingHorizontal: 10,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            backgroundColor: granted ? c.successSurface : c.neutralSurface,
          }}
        >
          <Icon size={19} color={granted ? c.teal : c.textSecondary} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: '600' }}>
            {entry.label}
          </Text>
          <Text
            numberOfLines={2}
            style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}
          >
            {entry.description}
          </Text>
        </View>

        <View
          style={{
            minWidth: 50,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexShrink: 0,
            gap: 6,
          }}
        >
          <Text
            style={{
              color: granted ? c.agentSuccess : c.textMuted,
              fontSize: 13,
              fontWeight: '600',
            }}
          >
            {statusLabel}
          </Text>
          <ChevronRight size={17} color={c.textMuted} style={{ flexShrink: 0 }} />
        </View>
      </Pressable>

      {!isLast && <Separator />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PermissionsScreen() {
  const router = useRouter();
  const { colors: c, statusBarStyle } = useTheme();
  const setObservedStatus = usePermissionsStore((s) => s.setObservedStatus);

  // Read-only OS status poll on every focus (useFocusEffect so back-from-Settings refreshes)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function pollAll() {
        await Promise.all(
          PERMISSION_KINDS.map(async (kind) => {
            const entry = PERMISSION_REGISTRY[kind];
            const status = await entry.getStatus();
            if (!cancelled) setObservedStatus(kind, status);
          }),
        );
      }
      pollAll();
      return () => {
        cancelled = true;
      };
    }, [setObservedStatus]),
  );

  const handleBack = useCallback(() => {
    router.navigate('/(app)/settings/safety-security' as Parameters<typeof router.navigate>[0]);
  }, [router]);

  const handlePressDetail = useCallback(
    (kind: MobilePermissionKind) => {
      router.push(`/(app)/settings/permissions/${kind}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
      {/* Header */}
      <View
        style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}
      >
        <Pressable
          onPress={handleBack}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? c.neutralSurface : 'transparent',
          })}
        >
          <ArrowLeft size={22} color={c.textPrimary} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            color: c.textPrimary,
            fontSize: 20,
            fontWeight: '700',
            marginLeft: 4,
          }}
        >
          Permissions
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 44 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: 10, marginBottom: 12 }}>
          <Text
            style={{
              color: c.textMuted,
              fontSize: 12,
              fontWeight: '700',
              textTransform: 'uppercase',
            }}
          >
            App Permissions
          </Text>
        </View>

        {/* Permission card */}
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surfaceElevated,
            overflow: 'hidden',
            paddingHorizontal: 10,
          }}
        >
          {PERMISSION_KINDS.map((kind, idx) => (
            <PermissionRow
              key={kind}
              kind={kind}
              isLast={idx === PERMISSION_KINDS.length - 1}
              onPressDetail={handlePressDetail}
            />
          ))}
        </View>

        {/* Footer info */}
        <View
          style={{
            marginTop: 16,
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: c.surfaceElevated,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18 }}>
            Permissions are managed by your device. Changing a permission may open Settings.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
