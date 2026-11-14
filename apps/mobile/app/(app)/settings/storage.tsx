import { useLocalDataExport } from '@/src/features/settings/data-controls/useLocalDataExport';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HardDrive, Trash2, Download, FileDown, AlertTriangle, Signal } from 'lucide-react-native';
import { cacheDirectory, deleteAsync, getFreeDiskStorageAsync } from 'expo-file-system/legacy';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { Switch } from '@/components/ui/Switch';
import { useThemeColors } from '@/src/ui/theme';
import { listInstalledModels, deleteInstalledModel } from '@/storage/installedModels';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import {
  deleteDownloadedModel,
  getModelStorageBytes,
  modelRemovalUnsupportedReason,
} from '@/services/modelDownload';
import { wipeAllLocalData, type DsarExportProgress } from '@/services/dsarExport';
import { resetLocalInMemoryState } from '@/src/features/settings/data-controls/localDataSnapshot';
import { getDirectorySizeBytes } from '@/src/features/settings/storageUsage';
import { StorageScopeNotice } from '@/src/features/settings/StorageScopeNotice';
import { SettingsScreenShell } from '@/src/features/settings/Common';
import type { InstalledModel } from '@/storage/types';

const STORAGE_RETURN_PATHS = [
  '/(app)/settings',
  '/(app)/settings/data-controls',
  '/(app)/settings/general',
] as const;
type StorageReturnPath = (typeof STORAGE_RETURN_PATHS)[number];

function isStorageReturnPath(value: string | undefined): value is StorageReturnPath {
  return STORAGE_RETURN_PATHS.includes(value as StorageReturnPath);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type Reading<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'failed' };

const LOADING = { status: 'loading' } as const;

function readingOf<T>(result: PromiseSettledResult<T>): Reading<T> {
  return result.status === 'fulfilled'
    ? { status: 'ready', value: result.value }
    : { status: 'failed' };
}

function formatReading(reading: Reading<number>): string {
  if (reading.status === 'loading') return 'Measuring…';
  if (reading.status === 'failed') return 'Unavailable';
  return formatBytes(reading.value);
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

export default function StorageManagerScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();

  const [models, setModels] = useState<Reading<InstalledModel[]>>(LOADING);
  const [modelStorageBytes, setModelStorageBytes] = useState<Reading<number>>(LOADING);
  const [cacheBytes, setCacheBytes] = useState<Reading<number>>(LOADING);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const latestLoad = useRef(0);

  const allowCellularDownloads = useModelInstallStore((s) => s.allowCellularDownloads);
  const setAllowCellularDownloads = useModelInstallStore((s) => s.setAllowCellularDownloads);
  const forgetInstalledModel = useModelInstallStore((s) => s.forgetInstalledModel);

  const { exporting: isExporting, progress: exportProgress, handleExport } = useLocalDataExport();
  const [isWiping, setIsWiping] = useState(false);

  const loadStorageInfo = useCallback(async (): Promise<boolean> => {
    const load = ++latestLoad.current;
    const [installed, modelBytes, measuredCache, diskFreeBytes] = await Promise.allSettled([
      listInstalledModels(),
      getModelStorageBytes(),
      cacheDirectory ? getDirectorySizeBytes(cacheDirectory) : Promise.resolve(0),
      getFreeDiskStorageAsync(),
    ]);
    if (load === latestLoad.current) {
      setModels(readingOf(installed));
      setModelStorageBytes(readingOf(modelBytes));
      setCacheBytes(readingOf(measuredCache));
      setFreeBytes(diskFreeBytes.status === 'fulfilled' ? diskFreeBytes.value : null);
    }
    return [installed, modelBytes, measuredCache].every((result) => result.status === 'fulfilled');
  }, []);

  useEffect(() => {
    void loadStorageInfo();
  }, [loadStorageInfo]);

  const retryStorageInfo = useCallback(() => {
    setModels(LOADING);
    setModelStorageBytes(LOADING);
    setCacheBytes(LOADING);
    void loadStorageInfo();
  }, [loadStorageInfo]);

  const backHref = isStorageReturnPath(params.returnTo)
    ? params.returnTo
    : '/(app)/settings/general';

  const handleDeleteModel = useCallback(
    (model: InstalledModel) => {
      const unsupported = modelRemovalUnsupportedReason(model);
      if (unsupported) {
        Alert.alert('Model removal unavailable', unsupported);
        return;
      }
      Alert.alert(
        `Delete ${model.display_name}?`,
        'This removes the downloaded model files. You can re-download the model later.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteDownloadedModel(model);
                await deleteInstalledModel(model.id);
                forgetInstalledModel(model.id);
                setModels((prev) =>
                  prev.status === 'ready'
                    ? { status: 'ready', value: prev.value.filter((m) => m.id !== model.id) }
                    : prev,
                );
              } catch {
                Alert.alert(
                  'Model removal failed',
                  'Could not remove the model. Refresh Storage and try again.',
                );
                return;
              }
              if (!(await loadStorageInfo())) {
                Alert.alert(
                  'Storage refresh failed',
                  'The model was removed, but storage totals could not be refreshed. Reopen Storage to refresh them.',
                );
              }
            },
          },
        ],
      );
    },
    [forgetInstalledModel, loadStorageInfo],
  );

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
            setCacheBytes({ status: 'ready', value: 0 });
          },
        },
      ],
    );
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
                    } catch {
                      setIsWiping(false);
                      Alert.alert('Wipe failed', 'Could not delete all local data. Try again.');
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

  const installedModels = models.status === 'ready' ? models.value : [];
  const totalModelBytes = installedModels.reduce((sum, m) => sum + (m.size_bytes ?? 0), 0);
  const displayedModelStorageBytes: Reading<number> =
    modelStorageBytes.status === 'ready'
      ? { status: 'ready', value: Math.max(modelStorageBytes.value, totalModelBytes) }
      : modelStorageBytes;
  const deviceReadFailed = modelStorageBytes.status === 'failed' || cacheBytes.status === 'failed';

  const retryButton = (
    <Pressable
      onPress={retryStorageInfo}
      className="self-start justify-center active:opacity-70"
      style={{ minHeight: 44 }}
      accessibilityLabel="Try reading storage again"
      accessibilityRole="button"
    >
      <Text className="text-sm font-medium" style={{ color: c.teal }}>
        Try again
      </Text>
    </Pressable>
  );

  const wipeOverlay = isWiping ? (
    <View
      className="absolute inset-0 z-50 items-center justify-center"
      style={{ backgroundColor: c.scrim }}
    >
      <LoadingIndicator size="large" />
      <Text className="mt-3 text-sm" style={{ color: c.textSecondary }}>
        Deleting all local data…
      </Text>
    </View>
  ) : null;

  return (
    <SettingsScreenShell title="Storage" backHref={backHref} overlay={wipeOverlay}>
      <View style={{ gap: 16 }}>
        <StorageScopeNotice />

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
                Downloaded models (estimated)
              </Text>
              <Text
                testID="storage-model-bytes"
                className="text-sm font-medium"
                style={{ color: c.textPrimary }}
              >
                {formatReading(displayedModelStorageBytes)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm" style={{ color: c.textSecondary }}>
                Cache
              </Text>
              <Text
                testID="storage-cache-bytes"
                className="text-sm font-medium"
                style={{ color: c.textPrimary }}
              >
                {formatReading(cacheBytes)}
              </Text>
            </View>
            {freeBytes !== null && (
              <View className="flex-row justify-between">
                <Text className="text-sm" style={{ color: c.textSecondary }}>
                  Free space
                </Text>
                <Text
                  testID="storage-free-space"
                  className="text-sm font-medium"
                  style={{ color: c.textPrimary }}
                >
                  {formatBytes(freeBytes)}
                </Text>
              </View>
            )}
            {deviceReadFailed ? retryButton : null}
          </View>
        </Card>

        <Card>
          <View className="flex-row items-center gap-3">
            <Signal size={18} color={c.teal} />
            <View className="flex-1">
              <Text className="text-[14px]" style={{ color: c.textPrimary }}>
                Download over cellular
              </Text>
              <Text className="text-sm mt-0.5" style={{ color: c.textMuted }}>
                Off waits for Wi-Fi. Models are several gigabytes.
              </Text>
            </View>
            <Switch
              testID="storage-cellular-downloads"
              value={allowCellularDownloads}
              onValueChange={setAllowCellularDownloads}
              accessibilityLabel="Download models over cellular"
            />
          </View>
        </Card>

        <Card>
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <Download size={16} color={c.teal} />
              <Text className="text-[15px] font-semibold" style={{ color: c.textPrimary }}>
                Downloaded Models
              </Text>
            </View>
            {installedModels.length > 0 && (
              <Text className="text-sm" style={{ color: c.textMuted }}>
                Estimated {formatBytes(totalModelBytes)}
              </Text>
            )}
          </View>

          {models.status === 'loading' ? (
            <LoadingIndicator size="small" />
          ) : models.status === 'failed' ? (
            <View>
              <Text className="text-sm" style={{ color: c.textMuted }}>
                Could not read downloaded models.
              </Text>
              {retryButton}
            </View>
          ) : installedModels.length === 0 ? (
            <Text className="text-sm" style={{ color: c.textMuted }}>
              No models downloaded. Get one in Settings → General → Models.
            </Text>
          ) : (
            installedModels.map((model, idx) => (
              <View key={model.id}>
                {idx > 0 && <Separator />}
                <View className="flex-row items-center justify-between py-3">
                  <View className="flex-1 mr-3">
                    <Text className="text-[14px]" style={{ color: c.textPrimary }}>
                      {model.display_name}
                    </Text>
                    <Text className="text-sm mt-0.5" style={{ color: c.textMuted }}>
                      {model.runtime} · Estimated {formatBytes(model.size_bytes ?? 0)}
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

        <Card>
          <Text
            className="text-sm uppercase font-semibold mb-3"
            style={{ color: c.textMuted, letterSpacing: 0 }}
          >
            Privacy
          </Text>

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
                  <Text className="text-sm mt-0.5" style={{ color: c.teal }}>
                    {exportStageLabel(exportProgress.stage)}
                  </Text>
                ) : (
                  <Text className="text-sm mt-0.5" style={{ color: c.textMuted }}>
                    GDPR / DPDP Act portable export
                  </Text>
                )}
              </View>
            </View>
            {isExporting ? <LoadingIndicator size="small" /> : null}
          </Pressable>

          <Separator />

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
              <Text className="text-sm mt-0.5" style={{ color: c.textMuted }}>
                Removes temp files · {formatReading(cacheBytes)}
              </Text>
            </View>
          </Pressable>
        </Card>

        <Card style={{ borderColor: c.agentError, borderWidth: 1 }}>
          <View className="flex-row items-center gap-2 mb-3">
            <AlertTriangle size={16} color={c.agentError} />
            <Text className="text-sm font-semibold" style={{ color: c.agentError }}>
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
              <Text className="text-sm mt-0.5" style={{ color: c.textMuted }}>
                Wipes all conversations, memory, and models from this device
              </Text>
            </View>
          </Pressable>
        </Card>
      </View>
    </SettingsScreenShell>
  );
}
