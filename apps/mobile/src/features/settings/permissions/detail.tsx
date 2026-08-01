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
import { View, ScrollView, Linking, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { useTheme, useThemeColors } from '@/src/ui/theme';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { PERMISSION_REGISTRY, isPermissionGranted, osStatusToLevel } from './registry';
import {
  LEVEL_LABELS,
  LEVEL_DESCRIPTIONS,
  type MobilePermissionKind,
  type MobilePermissionLevel,
  type OsPermissionStatus,
} from './types';

function isMobilePermissionKind(value: string | undefined): value is MobilePermissionKind {
  return typeof value === 'string' && value in PERMISSION_REGISTRY;
}

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
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`${LEVEL_LABELS[level]}. ${LEVEL_DESCRIPTIONS[level]}`}
        style={{
          minHeight: 74,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: 12,
          paddingHorizontal: 10,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: isSelected ? c.textPrimary : c.border,
            backgroundColor: c.surfaceElevated,
          }}
        >
          {isSelected ? (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: c.textPrimary,
              }}
            />
          ) : null}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: '600' }}>
            {LEVEL_LABELS[level]}
          </Text>
          <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
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
  const { colors: c, statusBarStyle } = useTheme();
  const params = useLocalSearchParams<{ permission: string }>();
  const requestedKind = params.permission;
  const isKnownPermission = isMobilePermissionKind(requestedKind);
  const kind: MobilePermissionKind = isKnownPermission ? requestedKind : 'microphone';
  const entry = isKnownPermission ? PERMISSION_REGISTRY[kind] : null;

  const setObservedStatus = usePermissionsStore((s) => s.setObservedStatus);
  const setUserIntent = usePermissionsStore((s) => s.setUserIntent);
  const permState = usePermissionsStore((s) => s.permissions[kind]);

  const [osStatus, setOsStatus] = useState<OsPermissionStatus>(
    permState?.lastObservedStatus ?? 'undetermined',
  );

  // Read OS status on focus (no prompt)
  useFocusEffect(
    useCallback(() => {
      const registryEntry = entry;
      if (!registryEntry) return undefined;
      const readStatus = registryEntry.getStatus;
      let cancelled = false;
      async function poll() {
        const status = await readStatus();
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
  const currentLevel = entry ? osStatusToLevel(osStatus, kind) : 'denied';
  const selectedLevel = permState?.userIntent ?? currentLevel;

  // Pop the real stack. A hard navigate to the Permissions list dropped anyone
  // who reached a permission detail from somewhere else (an onboarding prompt,
  // a deep link, Capabilities) onto a screen they never came from; the list
  // stays only as the no-history fallback. Same contract as
  // `SettingsScreenShell` in ../common.tsx.
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/(app)/settings/permissions' as Parameters<typeof router.navigate>[0]);
  }, [router]);

  const handleSelectLevel = useCallback(
    async (level: MobilePermissionLevel) => {
      const alreadyGranted = isPermissionGranted(osStatus);
      if (!entry) return;

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
        <StatusBar style={statusBarStyle} />
        <View
          style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}
        >
          <Pressable
            onPress={handleBack}
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
          <Text style={{ color: c.textPrimary, fontSize: 20, fontWeight: '700', marginLeft: 4 }}>
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
          {entry.label}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 44 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission summary card */}
        <View
          style={{
            marginTop: 10,
            padding: 16,
            borderRadius: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            backgroundColor: c.surfaceElevated,
            borderWidth: 1,
            borderColor: granted ? c.successBorder : c.border,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: granted ? c.successSurface : c.neutralSurface,
            }}
          >
            <Icon size={23} color={granted ? c.teal : c.textSecondary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.textPrimary, fontSize: 17, fontWeight: '700' }}>
              {granted ? 'Access Granted' : 'Access Denied'}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 }}>
              {entry.description}
            </Text>
          </View>
        </View>

        {/* Level selector */}
        <View style={{ marginTop: 22, marginBottom: 12 }}>
          <Text
            style={{
              color: c.textMuted,
              fontSize: 12,
              fontWeight: '700',
              textTransform: 'uppercase',
            }}
          >
            Access Level
          </Text>
        </View>

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
            Some permission changes may open Settings. AGI cannot change device permissions without
            your approval.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
