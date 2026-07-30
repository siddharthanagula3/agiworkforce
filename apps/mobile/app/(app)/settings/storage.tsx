import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  HardDrive,
  Trash2,
  Download,
  FileDown,
  AlertTriangle,
} from 'lucide-react-native';
import { cacheDirectory, deleteAsync } from 'expo-file-system/legacy';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useThemeColors } from '@/src/ui/theme';
import { listInstalledModels, deleteInstalledModel } from '@/storage/installedModels';
import { deleteDownloadedModel, getModelStorageBytes } from '@/services/modelDownload';
import {
  exportAllUserData,
  wipeAllLocalData,
  type DsarExportProgress,
} from '@/services/dsarExport';
import {
  buildLocalDataExportSnapshot,
  resetLocalInMemoryState,
} from '@/src/features/settings/data-controls/localDataSnapshot';
import { getDirectorySizeBytes } from '@/src/features/settings/storageUsage';
import { StorageScopeNotice } from '@/src/features/settings/StorageScopeNotice';
import type { InstalledModel } from '@/storage/types';

const STORAGE_RETURN_PATHS = ['/(app)/settings/data-controls', '/(app)/settings/general'] as const;
type StorageReturnPath = (typeof STORAGE_RETURN_PATHS)[number];

function isStorageReturnPath(value: string | undefined): value is StorageReturnPath {
  return STORAGE_RETURN_PATHS.includes(value as StorageReturnPath);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function exportStageLabel(stage: DsarExportProgress['stage']): string {
  switch (stage) {
    case 'conversations':
      return 'Exporting conversations…';
    case 'memory':
      return 'Exporting memory facts…';
    case 'instructions':
      return 'Exporting custom instructions…';
    case 'settings':
      return 'Exporting settings…';
    case 'models':
      return 'Exporting model manifest…';
    case 'compliance':
      return 'Exporting compliance records…';
    case 'writing':
      return 'Writing export file…';
    case 'sharing':
      return 'Opening share sheet…';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StorageManagerScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();

  const [models, setModels] = useState<InstalledModel[]>([]);
  const [modelStorageBytes, setModelStorageBytes] = useState(0);
  const [cacheBytes, setCacheBytes] = useState(0);

  const [exportProgress, setExportProgress] = useState<DsarExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  const loadStorageInfo = useCallback(async () => {
    const [installed, modelBytes, cacheBytes] = await Promise.all([
      listInstalledModels(),
      getModelStorageBytes(),
      cacheDirectory ? getDirectorySizeBytes(cacheDirectory) : Promise.resolve(0),
    ]);
    setModels(installed);
    setModelStorageBytes(modelBytes);
    setCacheBytes(cacheBytes);
  }, []);

  useEffect(() => {
    loadStorageInfo().catch(() => undefined);
  }, [loadStorageInfo]);

  const handleBack = useCallback(() => {
    const returnTo = params.returnTo;
    const target = isStorageReturnPath(returnTo) ? returnTo : '/(app)/settings/general';
    router.navigate(target as Parameters<typeof router.navigate>[0]);
  }, [params.returnTo, router]);

  const handleDeleteModel = useCallback((model: InstalledModel) => {
    Alert.alert(
      `Delete ${model.display_name}?`,
      `This will remove ${formatBytes(model.size_bytes ?? 0)} from your device. You can re-download it later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDownloadedModel(model.id, model.format);
            await deleteInstalledModel(model.id);
            setModels((prev) => prev.filter((m) => m.id !== model.id));
            setModelStorageBytes((prev) => Math.max(0, prev - (model.size_bytes ?? 0)));
          },
        },
      ],
    );
  }, []);

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear cache?',
      'This removes temporary files. Your conversations and downloaded models are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            if (cacheDirectory) {
              await deleteAsync(cacheDirectory, { idempotent: true });
            }
            setCacheBytes(0);
          },
        },
      ],
    );
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(null);
    try {
      await exportAllUserData(
        (progress) => setExportProgress(progress),
        buildLocalDataExportSnapshot(),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error.';
      Alert.alert('Export failed', msg);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, []);

  const handleDeleteEverything = useCallback(() => {
    Alert.alert(
      'Delete all local data?',
      'This permanently deletes all conversations, memory, settings, and downloaded models from this device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              'Are you absolutely sure?',
              'All local data will be wiped. You will be signed out and returned to onboarding.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    setIsWiping(true);
                    try {
                      await wipeAllLocalData({ afterPersistentWipe: resetLocalInMemoryState });
                      router.replace('/(public)/age-gate' as Parameters<typeof router.replace>[0]);
                    } catch (err) {
                      setIsWiping(false);
                      const msg = err instanceof Error ? err.message : 'Unknown error.';
                      Alert.alert('Wipe failed', `Could not delete all data: ${msg}`);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [router]);

  const totalModelBytes = models.reduce((sum, m) => sum + (m.size_bytes ?? 0), 0);
  const displayedModelStorageBytes = Math.max(modelStorageBytes, totalModelBytes);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      {/* Header */}
      <View
        className="flex-row items-center px-3 h-12"
        style={{
          backgroundColor: c.surfaceBase,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg"
          style={({ pressed }) => ({
            backgroundColor: pressed ? c.surfaceHover : c.transparent,
          })}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2" style={{ color: c.textPrimary }}>
          Storage
        </Text>
      </View>

      {/* Full-screen wipe overlay */}
      {isWiping && (
        <View
          className="absolute inset-0 z-50 items-center justify-center"
          style={{ backgroundColor: c.scrim }}
        >
          <ActivityIndicator size="large" color={c.teal} />
          <Text className="mt-3 text-sm" style={{ color: c.textSecondary }}>
            Deleting all local data…
          </Text>
        </View>
      )}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <StorageScopeNotice />

        {/* Device storage summary */}
        <Card>
          <View className="flex-row items-center gap-3 mb-3">
            <HardDrive size={18} color={c.teal} />
            <Text className="text-[15px] font-semibold" style={{ color: c.textPrimary }}>
              On This Device
            </Text>
          </View>

          <View className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-sm" style={{ color: c.textSecondary }}>
                Downloaded models
              </Text>
              <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
                {formatBytes(displayedModelStorageBytes)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm" style={{ color: c.textSecondary }}>
                Cache
              </Text>
              <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
                {formatBytes(cacheBytes)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Downloaded models */}
        <Card>
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <Download size={16} color={c.teal} />
              <Text className="text-[15px] font-semibold" style={{ color: c.textPrimary }}>
                Downloaded Models
              </Text>
            </View>
            {models.length > 0 && (
              <Text className="text-xs" style={{ color: c.textMuted }}>
                {formatBytes(totalModelBytes)}
              </Text>
            )}
          </View>

          {models.length === 0 ? (
            <Text className="text-sm" style={{ color: c.textMuted }}>
              No models downloaded. Download a model from Settings → Models.
            </Text>
          ) : (
            models.map((model, idx) => (
              <View key={model.id}>
                {idx > 0 && <Separator />}
                <View className="flex-row items-center justify-between py-3">
                  <View className="flex-1 mr-3">
                    <Text className="text-[14px]" style={{ color: c.textPrimary }}>
                      {model.display_name}
                    </Text>
                    <Text className="text-xs mt-0.5" style={{ color: c.textMuted }}>
                      {model.runtime} · {formatBytes(model.size_bytes ?? 0)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDeleteModel(model)}
                    className="p-2 rounded-lg"
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? c.dangerSurface : c.transparent,
                    })}
                    accessibilityLabel={`Delete ${model.display_name}`}
                    accessibilityRole="button"
                  >
                    <Trash2 size={16} color={c.agentError} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* Privacy actions */}
        <Card>
          <Text
            className="text-[11px] uppercase font-semibold mb-3"
            style={{ color: c.textMuted, letterSpacing: 0 }}
          >
            Privacy
          </Text>

          {/* Export my data */}
          <Pressable
            onPress={handleExport}
            disabled={isExporting}
            className="flex-row items-center justify-between py-3 active:opacity-70"
            accessibilityLabel="Export all my data"
            accessibilityRole="button"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <FileDown size={18} color={c.teal} />
              <View className="flex-1">
                <Text className="text-[14px]" style={{ color: c.textPrimary }}>
                  Export all my data
                </Text>
                {isExporting && exportProgress ? (
                  <Text className="text-xs mt-0.5" style={{ color: c.teal }}>
                    {exportStageLabel(exportProgress.stage)}
                  </Text>
                ) : (
                  <Text className="text-xs mt-0.5" style={{ color: c.textMuted }}>
                    GDPR / DPDP Act portable export
                  </Text>
                )}
              </View>
            </View>
            {isExporting ? <ActivityIndicator size="small" color={c.teal} /> : null}
          </Pressable>

          <Separator />

          {/* Clear cache */}
          <Pressable
            onPress={handleClearCache}
            className="flex-row items-center gap-3 py-3 active:opacity-70"
            accessibilityLabel="Clear cache"
            accessibilityRole="button"
          >
            <Trash2 size={18} color={c.textSecondary} />
            <View>
              <Text className="text-[14px]" style={{ color: c.textPrimary }}>
                Clear cache
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: c.textMuted }}>
                Removes temp files · {formatBytes(cacheBytes)}
              </Text>
            </View>
          </Pressable>
        </Card>

        {/* Danger zone */}
        <Card style={{ borderColor: c.agentError, borderWidth: 1 }}>
          <View className="flex-row items-center gap-2 mb-3">
            <AlertTriangle size={16} color={c.agentError} />
            <Text className="text-[13px] font-semibold" style={{ color: c.agentError }}>
              Danger Zone
            </Text>
          </View>

          <Pressable
            onPress={handleDeleteEverything}
            className="flex-row items-center gap-3 py-2 active:opacity-70"
            accessibilityLabel="Delete all local data"
            accessibilityRole="button"
          >
            <Trash2 size={18} color={c.agentError} />
            <View>
              <Text className="text-[14px] font-medium" style={{ color: c.agentError }}>
                Delete everything
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: c.textMuted }}>
                Wipes all conversations, memory, and models from this device
              </Text>
            </View>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
