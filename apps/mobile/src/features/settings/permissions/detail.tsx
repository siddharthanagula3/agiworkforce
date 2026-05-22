/**
 * Permission Detail Screen
 *
 * Shows the 4-state (or applicable subset) enum selector for one permission.
 * Handles:
 *   - Tapping a higher level → requestPermissionsAsync() if undetermined,
 *     or opens Settings if already denied (canAskAgain = false)
 *   - Tapping a lower level → opens Settings with an explanatory message
 *     (iOS/Android cannot programmatically revoke a granted permission)
 *
 * Props arrive via router params: `kind: MobilePermissionKind`.
 */
import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, CheckCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { useThemeColors } from '@/src/ui/theme';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { PERMISSION_REGISTRY, isPermissionGranted, osStatusToLevel } from './registry';
import {
  LEVEL_LABELS,
  LEVEL_DESCRIPTIONS,
  type MobilePermissionKind,
  type MobilePermissionLevel,
  type OsPermissionStatus,
} from './types';

// ---------------------------------------------------------------------------
// Level radio row
// ---------------------------------------------------------------------------

interface LevelRowProps {
  level: MobilePermissionLevel;
  isSelected: boolean;
  isLast: boolean;
  onSelect: (level: MobilePermissionLevel) => void;
}

function LevelRow({ level, isSelected, isLast, onSelect }: LevelRowProps) {
  const c = useThemeColors();
  return (
    <View>
      <Pressable
        onPress={() => onSelect(level)}
        className="flex-row items-center px-1 py-3.5 active:bg-white/5 rounded-lg"
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${LEVEL_LABELS[level]}. ${LEVEL_DESCRIPTIONS[level]}`}
      >
        {/* Selection indicator */}
        <View
          className="w-5 h-5 rounded-full items-center justify-center mr-3"
          style={{
            borderWidth: isSelected ? 0 : 1.5,
            borderColor: c.border,
            backgroundColor: isSelected ? c.teal : 'transparent',
          }}
        >
          {isSelected && <CheckCircle size={14} color="#fff" fill="#fff" />}
        </View>

        <View className="flex-1">
          <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
            {LEVEL_LABELS[level]}
          </Text>
          <Text className="text-[11px] mt-0.5" style={{ color: c.textMuted }}>
            {LEVEL_DESCRIPTIONS[level]}
          </Text>
        </View>
      </Pressable>
      {!isLast && <Separator />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openAppSettings() {
  Linking.openSettings().catch(() => {
    Alert.alert('Could not open Settings', 'Please open your device Settings app manually.');
  });
}

function alertOpenSettings(message: string) {
  Alert.alert('Open Settings', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open Settings', onPress: openAppSettings },
  ]);
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PermissionDetailScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const params = useLocalSearchParams<{ permission: string }>();
  const kind = params.permission as MobilePermissionKind;

  const entry = PERMISSION_REGISTRY[kind];

  const setObservedStatus = usePermissionsStore((s) => s.setObservedStatus);
  const setUserIntent = usePermissionsStore((s) => s.setUserIntent);
  const permState = usePermissionsStore((s) => s.permissions[kind]);

  const [osStatus, setOsStatus] = useState<OsPermissionStatus>(
    permState?.lastObservedStatus ?? 'undetermined',
  );

  // Read OS status on focus (no prompt)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function poll() {
        const status = await entry.getStatus();
        if (!cancelled) {
          setOsStatus(status);
          setObservedStatus(kind, status);
        }
      }
      poll();
      return () => {
        cancelled = true;
      };
    }, [entry, kind, setObservedStatus]),
  );

  // The level currently reflecting OS truth (may differ from userIntent if OS
  // was changed externally via the system Settings app)
  const currentLevel = osStatusToLevel(osStatus, kind);
  const selectedLevel = permState?.userIntent ?? currentLevel;

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/settings/permissions' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleSelectLevel = useCallback(
    async (level: MobilePermissionLevel) => {
      const alreadyGranted = isPermissionGranted(osStatus);

      if (level === 'denied') {
        // Downgrade: cannot revoke programmatically — open Settings
        setUserIntent(kind, level);
        alertOpenSettings(
          `To deny ${entry.label} access, go to Settings and change the permission there.`,
        );
        return;
      }

      // Requesting a grant
      if (alreadyGranted) {
        // Already granted — downgrade requested (same path as denied above) or
        // requesting a different grant level (e.g. while-using → always)
        // Either way, the OS controls this from Settings
        setUserIntent(kind, level);
        if (level !== currentLevel) {
          alertOpenSettings(
            `To change ${entry.label} access, go to Settings and update the permission.`,
          );
        }
        return;
      }

      // OS is undetermined or denied — attempt a request
      if (osStatus === 'undetermined') {
        setUserIntent(kind, level);
        const newStatus = await entry.requestPermission();
        setOsStatus(newStatus);
        setObservedStatus(kind, newStatus);
        // If still denied after prompt, reflect that
        if (newStatus === 'denied') {
          setUserIntent(kind, 'denied');
        }
      } else {
        // OS denied (canAskAgain = false) — cannot re-prompt
        setUserIntent(kind, level);
        alertOpenSettings(
          `${entry.label} access was previously denied. To allow it, open Settings.`,
        );
      }
    },
    [osStatus, currentLevel, entry, kind, setUserIntent, setObservedStatus],
  );

  if (!entry) {
    // Guard: invalid kind param
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
        <View className="flex-row items-center px-3 h-12">
          <Pressable onPress={handleBack} className="p-2 rounded-lg active:bg-white/5">
            <ArrowLeft size={20} color={c.textSecondary} />
          </Pressable>
          <Text variant="subheading" className="ml-2" style={{ color: c.textPrimary }}>
            Permission
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: c.textMuted, textAlign: 'center' }}>Unknown permission type.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const Icon = entry.icon;
  const granted = isPermissionGranted(osStatus);

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
          {entry.label}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission summary card */}
        <View
          className="mt-3 p-4 rounded-xl flex-row items-center gap-4"
          style={{
            backgroundColor: granted ? `${c.teal}14` : `${c.textMuted}10`,
            borderWidth: 1,
            borderColor: granted ? `${c.teal}2E` : c.border,
          }}
        >
          <View
            className="w-12 h-12 rounded-2xl items-center justify-center"
            style={{ backgroundColor: granted ? `${c.teal}20` : `${c.textMuted}18` }}
          >
            <Icon size={24} color={granted ? c.teal : c.textMuted} />
          </View>
          <View className="flex-1">
            <Text
              className="text-[13px] font-semibold"
              style={{ color: granted ? c.teal : c.textMuted }}
            >
              {granted ? 'Access Granted' : 'Access Denied'}
            </Text>
            <Text className="text-[11px] mt-1 leading-4" style={{ color: c.textSecondary }}>
              {entry.description}
            </Text>
          </View>
        </View>

        {/* Level selector */}
        <View className="mt-5 mb-2">
          <Text className="text-[11px] uppercase tracking-wider" style={{ color: c.textMuted }}>
            Access Level
          </Text>
        </View>

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
          {entry.applicableLevels.map((level, idx) => (
            <LevelRow
              key={level}
              level={level}
              isSelected={selectedLevel === level}
              isLast={idx === entry.applicableLevels.length - 1}
              onSelect={handleSelectLevel}
            />
          ))}
        </View>

        {/* Footer notice */}
        <View
          className="mt-4 px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
        >
          <Text className="text-[11px] leading-4" style={{ color: c.textMuted }}>
            Changing access levels that require OS-level changes will open your device Settings app.
            AGI cannot revoke or grant OS permissions directly.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
