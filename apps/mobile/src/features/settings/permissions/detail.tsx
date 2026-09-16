import { useCallback, useState } from 'react';
import { View, ScrollView, Linking, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/src/ui/theme';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { PERMISSION_REGISTRY, isPermissionGranted } from './registry';
import {
  STATUS_HEADLINES,
  STATUS_EXPLANATIONS,
  type MobilePermissionKind,
  type OsPermissionStatus,
} from './types';

function isMobilePermissionKind(value: string | undefined): value is MobilePermissionKind {
  return typeof value === 'string' && value in PERMISSION_REGISTRY;
}

function openAppSettings() {
  Linking.openSettings().catch(() => {
    Alert.alert('Could not open Settings', 'Please open your device Settings app manually.');
  });
}

export default function PermissionDetailScreen() {
  const router = useRouter();
  const { colors: c, statusBarStyle } = useTheme();
  const params = useLocalSearchParams<{ permission: string }>();
  const requestedKind = params.permission;
  const isKnownPermission = isMobilePermissionKind(requestedKind);
  const kind: MobilePermissionKind = isKnownPermission ? requestedKind : 'microphone';
  const entry = isKnownPermission ? PERMISSION_REGISTRY[kind] : null;

  const setObservedStatus = usePermissionsStore((s) => s.setObservedStatus);
  const permState = usePermissionsStore((s) => s.permissions[kind]);

  const [osStatus, setOsStatus] = useState<OsPermissionStatus>(
    permState?.lastObservedStatus ?? 'undetermined',
  );
  const [requesting, setRequesting] = useState(false);

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

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/(app)/settings/permissions' as Parameters<typeof router.navigate>[0]);
  }, [router]);

  const handleRequest = useCallback(async () => {
    if (!entry || requesting) return;
    setRequesting(true);
    try {
      const newStatus = await entry.requestPermission();
      setOsStatus(newStatus);
      setObservedStatus(kind, newStatus);
    } finally {
      setRequesting(false);
    }
  }, [entry, kind, requesting, setObservedStatus]);

  if (!entry) {
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
  const canRequest = osStatus === 'undetermined';
  const actionLabel = canRequest
    ? requesting
      ? `Asking for ${entry.label} access…`
      : `Allow ${entry.label}`
    : 'Open Settings';
  const actionHint = canRequest
    ? 'Your device asks you to decide. AGI never sees an answer you do not give.'
    : `${entry.label} access is decided in your device Settings, not here.`;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
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
        <View
          accessibilityRole="summary"
          accessibilityLabel={`${entry.label}. ${STATUS_HEADLINES[osStatus]}. ${entry.description}`}
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
              {STATUS_HEADLINES[osStatus]}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 }}>
              {entry.description}
            </Text>
          </View>
        </View>

        <Text
          style={{
            color: c.textMuted,
            fontSize: 13,
            lineHeight: 18,
            marginTop: 14,
            paddingHorizontal: 2,
          }}
        >
          {STATUS_EXPLANATIONS[osStatus]}
        </Text>

        <Pressable
          onPress={canRequest ? handleRequest : openAppSettings}
          disabled={requesting}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: requesting }}
          style={{
            marginTop: 18,
            minHeight: 62,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surfaceElevated,
            opacity: requesting ? 0.6 : 1,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: '600' }}>
              {actionLabel}
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
              {actionHint}
            </Text>
          </View>
          <ChevronRight size={18} color={c.textMuted} style={{ flexShrink: 0 }} />
        </Pressable>

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
            This screen shows what your device currently reports. AGI cannot change a device
            permission on your behalf.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
