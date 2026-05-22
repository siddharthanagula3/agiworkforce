/**
 * Permissions Settings Screen — Index
 *
 * Displays the 6 top-priority permission rows: microphone, camera, location,
 * photos, notifications, contacts. Each row shows an icon, label, the current
 * OS status as a binary toggle, and a chevron to the per-permission detail.
 *
 * Read-on-focus via getPermissionsAsync (no prompt). User action → detail
 * screen handles the actual request/Settings redirect.
 */
import { useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useThemeColors } from '@/src/ui/theme';
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
  const granted = isPermissionGranted(permState?.lastObservedStatus ?? 'undetermined');

  const handleToggle = useCallback(() => {
    // Delegate all prompt / Settings-redirect logic to the detail screen
    onPressDetail(kind);
  }, [kind, onPressDetail]);

  return (
    <View>
      <Pressable
        onPress={() => onPressDetail(kind)}
        className="flex-row items-center px-1 py-3.5 active:bg-white/5 rounded-lg"
        accessibilityRole="button"
        accessibilityLabel={`${entry.label} permission. Currently ${granted ? 'allowed' : 'denied'}. Tap to manage.`}
      >
        {/* Icon badge */}
        <View
          className="w-9 h-9 rounded-[9px] items-center justify-center mr-3"
          style={{
            backgroundColor: granted ? `${c.teal}20` : `${c.textMuted}18`,
          }}
        >
          <Icon size={18} color={granted ? c.teal : c.textMuted} />
        </View>

        {/* Label + description */}
        <View className="flex-1 mr-2">
          <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
            {entry.label}
          </Text>
          <Text className="text-[11px] mt-0.5" style={{ color: c.textMuted }}>
            {entry.description}
          </Text>
        </View>

        {/* Toggle (tap → detail for proper OS flow) */}
        <View className="mr-2">
          <Switch value={granted} onValueChange={handleToggle} />
        </View>

        {/* Chevron */}
        <ChevronRight size={14} color={c.textMuted} />
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
  const c = useThemeColors();
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
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handlePressDetail = useCallback(
    (kind: MobilePermissionKind) => {
      router.push(`/(app)/settings/permissions/${kind}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      {/* Header */}
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1" style={{ color: c.textPrimary }}>
          Permissions
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-3 mb-2">
          <Text
            className="text-[11px] uppercase tracking-wider mb-3"
            style={{ color: c.textMuted }}
          >
            App Permissions
          </Text>
        </View>

        {/* Permission card */}
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surfaceElevated,
            overflow: 'hidden',
            paddingHorizontal: 12,
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
          className="mt-4 px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
        >
          <Text className="text-[11px] leading-4" style={{ color: c.textMuted }}>
            Permissions are managed by your device OS. Toggling a permission may open your device
            Settings app.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
