import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Pressable, Platform, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import Constants from 'expo-constants';
import type BottomSheet from '@gorhom/bottom-sheet';
import { storage } from '@/lib/mmkv';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useTheme, type ColorScheme } from '@/src/ui/theme';
import { downloadModel, cancelDownload, ModelDownloadError } from '@/services/modelDownload';
import { getInstalledModel, recordInstalledModel } from '@/storage/installedModels';
import { FirstRunDisclosureModal } from '@/src/features/onboarding/components/FirstRunDisclosureModal';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import {
  composeFirstRunDisclosure,
  isDisclosureSatisfied,
  recordDisclosureAcceptance,
  type ChineseHqProviderId,
  type DisclosureCopy,
} from '@agiworkforce/compliance';
import { mmkvDisclosureLedger } from '@/services/complianceLedger';
import { applyChineseHqProviderConsent } from '@/services/providerConsent';
import {
  detectCapabilities,
  getDefaultModel,
  getModelById,
  getShippableModels,
  getSystemModelForTier1Runtime,
  tier2LoadModel,
  type DeviceCapabilities,
  type LocalRuntimeTier,
} from '@agiworkforce/local-llm';
import { getAutoRoutingProfiles, type OnDeviceModel } from '@agiworkforce/types';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';

const DISCLOSURE_PROVIDERS: string[] = [];

const AGI_MARK_SPOKE_COUNT = 12;
const AGI_MARK_INNER_R = 4.6;
const AGI_MARK_OUTER_R = 9;
const AGI_MARK_STROKE_W = 1.5;
const AGI_MARK_SPOKES = Array.from({ length: AGI_MARK_SPOKE_COUNT }, (_, i) => {
  const angle = (i * 360) / AGI_MARK_SPOKE_COUNT;
  const rad = (angle * Math.PI) / 180;
  const round = (value: number) => Number(value.toFixed(6));
  return {
    x1: round(12 + AGI_MARK_INNER_R * Math.sin(rad)),
    y1: round(12 - AGI_MARK_INNER_R * Math.cos(rad)),
    x2: round(12 + AGI_MARK_OUTER_R * Math.sin(rad)),
    y2: round(12 - AGI_MARK_OUTER_R * Math.cos(rad)),
  };
});

type DeviceTierInfo = {
  tier: LocalRuntimeTier;
  tier1Runtime: DeviceCapabilities['tier1Runtime'];
  deviceName: string;
  ramGB: number;
  osVersion: string;
};

function tierFromCapabilities(
  totalRAMMB: number,
  tier1Available: boolean,
  tier2Available: boolean,
): LocalRuntimeTier {
  if (tier1Available) return 1;
  if (tier2Available || totalRAMMB >= 3000) return 2;
  return 3;
}

type RecommendedModel = OnDeviceModel & { needsDownload: boolean };

function pickRecommendedModel(
  tier: LocalRuntimeTier,
  tier1Runtime: DeviceCapabilities['tier1Runtime'] = null,
): RecommendedModel {
  if (tier === 1 && tier1Runtime) {
    const sysModel = getSystemModelForTier1Runtime(tier1Runtime);
    if (sysModel) return { ...sysModel, needsDownload: false };
  }
  const model = getDefaultModel();
  return { ...model, needsDownload: true };
}

function pickModelForPickerSelection(
  modelId: string,
  fallbackTier: LocalRuntimeTier,
  tier1Runtime: DeviceCapabilities['tier1Runtime'],
): RecommendedModel | null {
  const autoProfile = getAutoRoutingProfiles().find((profile) => profile.id === modelId)?.profile;
  if (autoProfile === 'balanced') return pickRecommendedModel(fallbackTier, tier1Runtime);

  const localModels = getShippableModels();
  if (autoProfile === 'economy') {
    const liteModel = localModels.find((model) => model.role === 'lite-mode');
    return liteModel ? { ...liteModel, needsDownload: liteModel.fileSizeBytes > 0 } : null;
  }
  if (autoProfile === 'premium') {
    const premiumModel = localModels.find(
      (model) => model.role === 'premium-vision-pack' || model.role === 'premium-multimodal-alt',
    );
    return premiumModel ? { ...premiumModel, needsDownload: premiumModel.fileSizeBytes > 0 } : null;
  }

  const catalogModel = getModelById(modelId);
  if (!catalogModel) return null;
  return { ...catalogModel, needsDownload: catalogModel.fileSizeBytes > 0 };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

type ScreenId = 'hero' | 'device-tier' | 'download';

export default function OnboardingScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const primaryButtonTextColor = isDark ? colors.black : colors.white;

  const [screen, setScreen] = useState<ScreenId>('hero');
  const [disclosureVisible, setDisclosureVisible] = useState(false);
  const [disclosureCopy, setDisclosureCopy] = useState<DisclosureCopy | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceTierInfo>({
    tier: 2,
    tier1Runtime: null,
    deviceName: 'Your device',
    ramGB: 4,
    osVersion: 'Unknown',
  });
  const [recommendedModel, setRecommendedModel] = useState<RecommendedModel>(() =>
    pickRecommendedModel(2),
  );
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeedMBs, setDownloadSpeedMBs] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [tier2Loading, setTier2Loading] = useState(false);
  const downloadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modelPickerRef = useRef<BottomSheet>(null);

  const handlePickModel = useCallback(() => {
    modelPickerRef.current?.snapToIndex(0);
  }, []);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      const nextModel = pickModelForPickerSelection(
        modelId,
        deviceInfo.tier,
        deviceInfo.tier1Runtime,
      );
      if (!nextModel) return;
      setDownloadError(null);
      setRecommendedModel(nextModel);
    },
    [deviceInfo.tier, deviceInfo.tier1Runtime],
  );

  useEffect(() => {
    let isMounted = true;

    detectCapabilities()
      .then((caps) => {
        if (!isMounted) return;

        const tier = tierFromCapabilities(
          caps.totalRAMMB,
          caps.tier1Available,
          caps.tier2Available,
        );
        const ramGB = Math.max(1, Math.round(caps.totalRAMMB / 1024));
        const deviceName =
          Constants.platform?.ios?.model ??
          Constants.platform?.android?.model ??
          Constants.deviceName ??
          'Your device';
        const osVersion = caps.osVersion || (Constants.platform?.ios?.systemVersion ?? 'Unknown');

        setDeviceInfo({ tier, tier1Runtime: caps.tier1Runtime, deviceName, ramGB, osVersion });
        setRecommendedModel(pickRecommendedModel(tier, caps.tier1Runtime));
      })
      .catch(() => {
        // Keep defaults on capability detection failure
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) clearInterval(downloadTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!recommendedModel.needsDownload) return;
    let isMounted = true;

    getInstalledModel(recommendedModel.id)
      .then((installed) => {
        if (!isMounted || !installed) return;
        setRecommendedModel((current) =>
          current.id === recommendedModel.id ? { ...current, needsDownload: false } : current,
        );
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [recommendedModel.id, recommendedModel.needsDownload]);

  const finishOnboarding = useCallback(() => {
    storage.set('onboarding-done', 'true');
    storage.delete('onboarding-mode');
    router.replace({ pathname: '/(app)' as const });
  }, [router]);

  const handleContinueToCloud = useCallback(() => {
    if (downloadTimerRef.current) {
      clearInterval(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    cancelDownload(recommendedModel.id);
    storage.set('onboarding-done', 'true');
    storage.delete('onboarding-mode');
    router.replace(beginCloudPostAuthIntent());
  }, [recommendedModel.id, router]);

  const handleHeroCTA = useCallback(() => {
    const alreadySatisfied = isDisclosureSatisfied(mmkvDisclosureLedger, false);
    if (alreadySatisfied) {
      setScreen('device-tier');
      return;
    }
    const copy = composeFirstRunDisclosure({
      surface: 'mobile',
      offersManagedCloud: false,
      thirdPartyAiProviders: [...DISCLOSURE_PROVIDERS],
    });
    setDisclosureCopy(copy);
    setDisclosureVisible(true);
  }, []);

  const handleDisclosureAccept = useCallback(
    async (acceptedProviderIds: readonly ChineseHqProviderId[]) => {
      if (!disclosureCopy) return;
      setDisclosureVisible(false);
      await recordDisclosureAcceptance({
        ledger: mmkvDisclosureLedger,
        copy: disclosureCopy,
        surface: 'mobile',
        managedCloudAccepted: true,
        chineseHqProvidersAccepted: acceptedProviderIds,
      });
      applyChineseHqProviderConsent(acceptedProviderIds);
      setScreen('device-tier');
    },
    [disclosureCopy],
  );

  const handleDisclosureDecline = useCallback(() => {
    setDisclosureVisible(false);
  }, []);

  const handleStartDownload = useCallback(
    (cellularEnabled = false) => {
      if (!recommendedModel.needsDownload) {
        finishOnboarding();
        return;
      }
      setScreen('download');
      setDownloadProgress(0);
      setDownloadSpeedMBs(0);
      setDownloadError(null);

      if (recommendedModel.executorchPreset) {
        const preset = recommendedModel.executorchPreset;
        setTier2Loading(true);
        tier2LoadModel(preset, (fractional) => {
          setDownloadProgress(fractional * 100);
        })
          .then(async () => {
            await recordInstalledModel({
              id: recommendedModel.id,
              display_name: recommendedModel.displayName,
              runtime: 'local',
              format: 'pte',
              size_bytes: recommendedModel.fileSizeBytes,
              sha256: null,
              local_path: null,
              installed_at: Date.now(),
              last_used_at: null,
              capabilities: null,
            });
            setTier2Loading(false);
            finishOnboarding();
          })
          .catch((err: unknown) => {
            setTier2Loading(false);
            const msg = err instanceof Error ? err.message : 'Download failed. Please try again.';
            setDownloadError(msg);
          });
        return;
      }

      if (recommendedModel.downloadUrl && recommendedModel.checksum && recommendedModel.format) {
        downloadModel({
          modelId: recommendedModel.id,
          displayName: recommendedModel.displayName,
          downloadUrl: recommendedModel.downloadUrl,
          checksum: recommendedModel.checksum,
          fileSizeBytes: recommendedModel.fileSizeBytes,
          runtime: 'local',
          format: recommendedModel.format,
          mmprojUrl: recommendedModel.mmprojUrl,
          mmprojChecksum: recommendedModel.mmprojChecksum,
          mmprojSizeBytes: recommendedModel.mmprojSizeBytes,
          wifiOnly: !cellularEnabled,
          onProgress(downloaded, total, speedBps) {
            setDownloadProgress((downloaded / total) * 100);
            setDownloadSpeedMBs(Math.round(speedBps / (1024 * 1024)));
          },
        })
          .then(finishOnboarding)
          .catch((err: unknown) => {
            const kind = err instanceof ModelDownloadError ? err.kind : 'network_error';
            if (kind === 'cancelled') {
              return;
            }
            const msg =
              kind === 'wifi_required'
                ? 'Wi-Fi required. Connect to Wi-Fi or enable cellular download.'
                : kind === 'checksum_mismatch'
                  ? 'Download corrupted. Please try again.'
                  : kind === 'storage_full'
                    ? 'Not enough storage. Free up space and try again.'
                    : 'Download failed. You can try again or continue without the model.';
            setDownloadError(msg);
          });
        return;
      }

      setDownloadError('This model cannot be downloaded yet. Pick a different model to continue.');
    },
    [recommendedModel, finishOnboarding],
  );

  const handleSkipToChat = useCallback(() => {
    if (tier2Loading) return;
    if (downloadTimerRef.current) {
      clearInterval(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    cancelDownload(recommendedModel.id);
    finishOnboarding();
  }, [tier2Loading, recommendedModel.id, finishOnboarding]);

  return (
    <SafeAreaView testID="onboarding-root" style={{ flex: 1, backgroundColor: colors.background }}>
      <Reanimated.View
        key={screen}
        entering={FadeIn.duration(280)}
        exiting={FadeOut.duration(160)}
        style={{ flex: 1 }}
      >
        {screen === 'hero' && (
          <HeroScreen
            colors={colors}
            primaryButtonTextColor={primaryButtonTextColor}
            onStartChatting={handleHeroCTA}
          />
        )}
        {screen === 'device-tier' && (
          <DeviceTierScreen
            colors={colors}
            primaryButtonTextColor={primaryButtonTextColor}
            deviceInfo={deviceInfo}
            model={recommendedModel}
            onDownload={handleStartDownload}
            onPickModel={handlePickModel}
            onContinueToCloud={handleContinueToCloud}
          />
        )}
        {screen === 'download' && (
          <DownloadScreen
            colors={colors}
            progress={downloadProgress}
            speedMBs={downloadSpeedMBs}
            model={recommendedModel}
            onSkip={handleSkipToChat}
            error={downloadError}
            skipDisabled={tier2Loading}
          />
        )}
      </Reanimated.View>

      {disclosureCopy !== null && (
        <FirstRunDisclosureModal
          visible={disclosureVisible}
          copy={disclosureCopy}
          onAccept={handleDisclosureAccept}
          onDecline={handleDisclosureDecline}
        />
      )}

      {/* Model picker sheet, overlays the full screen, only shown when user
          taps "Pick a different model" on the device-tier screen. */}
      <ModelPickerSheet sheetRef={modelPickerRef} modelScope="local" onSelect={handleSelectModel} />
    </SafeAreaView>
  );
}

function HeroScreen({
  colors,
  primaryButtonTextColor,
  onStartChatting,
}: {
  colors: ColorScheme;
  primaryButtonTextColor: string;
  onStartChatting: () => void;
}) {
  return (
    <View
      testID="onboarding-hero-screen"
      style={[styles.heroRoot, { backgroundColor: colors.background }]}
    >
      <View style={styles.brandLockup}>
        <AgiNativeMark
          size={50}
          color={colors.textPrimary}
          accent={colors.teal}
          testID="hero-brand-mark"
        />
        <Text
          testID="hero-wordmark"
          style={[styles.wordmark, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          AGI
        </Text>
      </View>

      <Text testID="hero-tagline" style={[styles.tagline, { color: colors.textSecondary }]}>
        Your AI workspace for everyday work.
      </Text>

      <Text style={[styles.heroSubcopy, { color: colors.textMuted }]}>
        Chat, write, code, research, and organize projects in one place.
      </Text>

      {/* Primary CTA, full-width pill */}
      <Pressable
        testID="hero-start-chatting-btn"
        onPress={onStartChatting}
        accessibilityRole="button"
        accessibilityLabel="Start chatting"
        style={[styles.ctaBtn, { backgroundColor: colors.teal }]}
      >
        <Text style={[styles.ctaBtnText, { color: primaryButtonTextColor }]}>Start chatting</Text>
      </Pressable>

      <Text testID="hero-footer" style={[styles.footer, { color: colors.textMuted }]}>
        Made by AGI Automation LLC, USA
      </Text>
    </View>
  );
}

function AgiNativeMark({
  size,
  color,
  accent,
  testID,
}: {
  size: number;
  color: string;
  accent: string;
  testID?: string;
}) {
  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 24 24">
      {AGI_MARK_SPOKES.map((spoke, idx) => (
        <Line
          key={idx}
          x1={spoke.x1}
          y1={spoke.y1}
          x2={spoke.x2}
          y2={spoke.y2}
          stroke={idx === 0 ? accent : color}
          strokeWidth={AGI_MARK_STROKE_W}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}

function DeviceTierScreen({
  colors,
  primaryButtonTextColor,
  deviceInfo,
  model,
  onDownload,
  onPickModel,
  onContinueToCloud,
}: {
  colors: ColorScheme;
  primaryButtonTextColor: string;
  deviceInfo: DeviceTierInfo;
  model: RecommendedModel;
  onDownload: (cellularEnabled: boolean) => void;
  onPickModel: () => void;
  onContinueToCloud: () => void;
}) {
  const deviceSummary = model.needsDownload
    ? 'Download one local model to start private chats on this device.'
    : 'A built-in local model is ready to use.';
  const [cellularEnabled, setCellularEnabled] = useState(false);

  return (
    <ScrollView
      testID="onboarding-device-tier-screen"
      style={{ flex: 1 }}
      contentContainerStyle={[styles.deviceTierRoot, { paddingBottom: 48 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text
        testID="device-tier-headline"
        style={[styles.tierHeadline, { color: colors.textPrimary }]}
        accessibilityRole="header"
      >
        Set up local chat on {deviceInfo.deviceName}.
      </Text>

      <Text style={[styles.tierSubhead, { color: colors.textMuted }]}>{deviceSummary}</Text>

      {/* Recommended model card */}
      <View
        style={[
          styles.modelCard,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.modelCardHeader}>
          <Text style={[styles.modelName, { color: colors.textPrimary }]}>{model.displayName}</Text>
          <View style={[styles.tierBadge, { backgroundColor: colors.accentSurface }]}>
            <Text style={[styles.tierBadgeText, { color: colors.teal }]}>Recommended</Text>
          </View>
        </View>

        {model.needsDownload ? (
          <>
            <Text style={[styles.modelDetail, { color: colors.textMuted }]}>
              {formatBytes(model.fileSizeBytes)} download · Wi-Fi recommended
            </Text>
            <Text style={[styles.modelDetail, { color: colors.textMuted }]}>
              Download time depends on your connection.
            </Text>
          </>
        ) : (
          <Text style={[styles.modelDetail, { color: colors.textMuted }]}>
            Already on your device · Zero download
          </Text>
        )}
      </View>

      {/* Cellular toggle is off by default so large model downloads prefer Wi-Fi. */}
      {model.needsDownload && (
        <Pressable
          testID="device-tier-cellular-toggle"
          onPress={() => setCellularEnabled((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: cellularEnabled }}
          accessibilityLabel="Download over cellular too"
          style={styles.cellularRow}
        >
          <Text style={[styles.cellularLabel, { color: colors.textSecondary }]}>
            Download over cellular too
          </Text>
          <Switch value={cellularEnabled} onValueChange={setCellularEnabled} />
        </Pressable>
      )}

      {/* Primary CTA */}
      <Pressable
        testID="device-tier-download-btn"
        onPress={() => onDownload(cellularEnabled)}
        accessibilityRole="button"
        accessibilityLabel={model.needsDownload ? 'Download model' : 'Continue'}
        style={[styles.ctaBtn, { backgroundColor: colors.teal, marginTop: 24 }]}
      >
        <Text style={[styles.ctaBtnText, { color: primaryButtonTextColor }]}>
          {model.needsDownload ? `Download ${model.displayName}` : 'Continue'}
        </Text>
      </Pressable>

      {/* Secondary: model picker */}
      <Pressable
        testID="device-tier-pick-model-btn"
        accessibilityRole="button"
        accessibilityLabel="Pick a different model"
        onPress={onPickModel}
        style={styles.secondaryBtn}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
          Pick a different model
        </Text>
      </Pressable>

      {/* Cloud path, reach catalog-selected hosted models + cloud tools/web
          search without downloading a local model. Sign-in is the entitlement. */}
      <Pressable
        testID="device-tier-cloud-btn"
        accessibilityRole="button"
        accessibilityLabel="Sign in to use Cloud"
        onPress={onContinueToCloud}
        style={styles.secondaryBtn}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.teal }]}>Sign in to use Cloud</Text>
      </Pressable>
    </ScrollView>
  );
}

function DownloadScreen({
  colors,
  progress,
  speedMBs,
  model,
  onSkip,
  error,
  skipDisabled = false,
}: {
  colors: ColorScheme;
  progress: number;
  speedMBs: number;
  model: RecommendedModel;
  onSkip: () => void;
  error?: string | null;
  skipDisabled?: boolean;
}) {
  const pct = Math.round(progress);
  const bytesDownloaded = (progress / 100) * model.fileSizeBytes;
  const remainingBytes = model.fileSizeBytes - bytesDownloaded;
  const secondsLeft = speedMBs > 0 ? remainingBytes / (speedMBs * 1024 * 1024) : null;
  const etaLabel =
    secondsLeft !== null && progress < 100
      ? secondsLeft < 60
        ? `< 1 min left`
        : `~${Math.round(secondsLeft / 60)} min left`
      : null;

  return (
    <View testID="onboarding-download-screen" style={styles.downloadRoot}>
      <View style={styles.progressLockup}>
        <RadialProgress
          progress={progress}
          size={160}
          stroke={10}
          color={colors.terraCotta}
          trackColor={colors.progressTrack}
        />
        <Text
          testID="download-percent"
          style={[styles.downloadPct, { color: colors.textPrimary }]}
          accessibilityLabel={`${pct} percent downloaded`}
        >
          {pct}%
        </Text>
      </View>

      <Text style={[styles.downloadModelName, { color: colors.textSecondary }]}>
        {model.displayName}
      </Text>

      <Text style={[styles.downloadMeta, { color: colors.textMuted }]}>
        {formatBytes(model.fileSizeBytes)}
        {speedMBs > 0 && progress < 100 ? ` · ${speedMBs} MB/s` : ''}
        {etaLabel ? ` · ${etaLabel}` : ''}
      </Text>

      <Text
        testID="download-reassurance"
        style={[styles.downloadReassurance, { color: colors.textMuted }]}
      >
        Stays on your device.
      </Text>

      <Text style={[styles.downloadHint, { color: colors.textMuted }]}>
        You can leave this screen. The download continues in the background.
      </Text>

      {error && (
        <Text
          testID="download-error"
          style={[
            styles.downloadMeta,
            { color: colors.agentError, textAlign: 'center', marginTop: 4 },
          ]}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      )}

      <Pressable
        testID="download-skip-btn"
        onPress={onSkip}
        disabled={skipDisabled}
        accessibilityRole="button"
        accessibilityLabel="Continue to chat"
        accessibilityState={{ disabled: skipDisabled }}
        style={[
          styles.skipBtn,
          { backgroundColor: colors.neutralSurface, opacity: skipDisabled ? 0.4 : 1 },
        ]}
      >
        <Text style={[styles.skipBtnText, { color: colors.textSecondary }]}>Continue to chat</Text>
      </Pressable>
    </View>
  );
}

function RadialProgress({
  progress,
  size,
  stroke,
  color,
  trackColor,
}: {
  progress: number;
  size: number;
  stroke: number;
  color: string;
  trackColor: string;
}) {
  const normalizedProgress = Math.max(0, Math.min(100, progress));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - normalizedProgress / 100);

  return (
    <View
      testID="download-radial-progress"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  heroRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 22,
  },
  wordmark: {
    fontSize: 94,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 108,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 27,
    textAlign: 'center',
    marginBottom: 10,
  },
  heroSubcopy: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 52,
    maxWidth: 320,
  },
  ctaBtn: {
    width: '100%',
    borderRadius: 9999,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  ctaBtnText: {
    fontWeight: '600',
    fontSize: 17,
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 24 : 16,
  },

  deviceTierRoot: {
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  tierHeadline: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 8,
  },
  tierSubhead: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  modelCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
    gap: 6,
  },
  modelCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  tierBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modelDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
  cellularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cellularLabel: {
    fontSize: 15,
    flex: 1,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
  },

  downloadRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  progressLockup: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadPct: {
    position: 'absolute',
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
    textAlign: 'center',
  },
  downloadModelName: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  downloadMeta: {
    fontSize: 13,
    textAlign: 'center',
  },
  downloadReassurance: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
  downloadHint: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.7,
  },
  skipBtn: {
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 16,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
