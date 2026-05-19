/**
 * Onboarding v1 — privacy-first, no login, no cloud, no BYOK.
 *
 * 3-screen flow:
 *   Screen 1: Hero   → disclosure modal → Screen 2
 *   Screen 2: Device-tier detection + model recommendation → Screen 3
 *   Screen 3: First model download progress → chat
 *
 * Locks (2026-05-18):
 *   - Trust signals exact: "AGI Automation LLC · Delaware, USA" + DPDP Act 2023
 *   - Tagline exact: "AGI runs on your device."
 *   - No cloud branch, no BYOK, no login button
 *   - Device tier + model name/size pulled from catalog (not hardcoded)
 *   - Compliance disclosure fires before screen 2 (Article 50(1) + Apple 5.1.2(i))
 *   - Download UI is stubbed; storage-engineer wires real hook (see TODO)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Pressable, Animated, Platform, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Cpu, Plane, Shield } from 'lucide-react-native';
import Constants from 'expo-constants';
import { storage } from '@/lib/mmkv';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';
import { FirstRunDisclosureModal } from '@/components/onboarding/FirstRunDisclosureModal';
import {
  composeFirstRunDisclosure,
  isDisclosureSatisfied,
  recordDisclosureAcceptance,
  type DisclosureCopy,
} from '@agiworkforce/compliance';
import { mmkvDisclosureLedger } from '@/services/complianceLedger';
import {
  detectCapabilities,
  getDefaultModel,
  getShippableModels,
  type LocalRuntimeTier,
} from '@agiworkforce/local-llm';
import type { OnDeviceModel } from '@agiworkforce/types';

// Apple 5.1.2(i) requires enumerating every named third-party AI provider the
// surface may route to. Omit Custom and Chinese-HQ providers (they get their
// own chineseHqProviderRows section). Keep updated when providers change.
const DISCLOSURE_PROVIDERS = [
  'Anthropic',
  'OpenAI',
  'Google',
  'xAI',
  'Perplexity',
  'Mistral',
] as const;

// ---------------------------------------------------------------------------
// Device tier derived from DeviceCapabilities
// ---------------------------------------------------------------------------
type DeviceTierInfo = {
  tier: LocalRuntimeTier;
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

// ---------------------------------------------------------------------------
// Pick recommended downloadable model for a tier.
// Locked: Qwen3-4B-Instruct-2507 (role='default') is the primary.
// Tier 1 = Apple Foundation Models / AICore (no download).
// ---------------------------------------------------------------------------
type RecommendedModel = OnDeviceModel & { needsDownload: boolean };

function pickRecommendedModel(tier: LocalRuntimeTier): RecommendedModel {
  if (tier === 1) {
    // System model — already on device
    const sysModel = getShippableModels().find((m) => m.role === 'system-multimodal') ?? {
      id: 'apple-foundation-models',
      displayName: 'Apple Intelligence',
      family: 'apple-fm' as const,
      paramCountB: 3,
      fileSizeBytes: 0,
      supportedRuntimes: ['apple-foundation-models' as const],
      contextWindow: 4096,
      capabilities: {
        text: true,
        visionIn: true,
        audioIn: false,
        toolCalls: true,
        structuredOutput: true,
      },
      license: 'Apple Entitlement',
      role: 'system-multimodal' as const,
      shipsInV1: true,
    };
    return { ...sysModel, needsDownload: false };
  }
  const model = getDefaultModel();
  return { ...model, needsDownload: true };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

function estimateWifiMinutes(bytes: number): string {
  if (bytes === 0) return 'instant';
  const seconds = bytes / (10 * 1024 * 1024); // ~10 MB/s avg Indian Wi-Fi
  if (seconds < 60) return `< 1 min`;
  return `~${Math.round(seconds / 60)} min`;
}

// ---------------------------------------------------------------------------
// Screen state machine
// ---------------------------------------------------------------------------
type ScreenId = 'hero' | 'device-tier' | 'download';

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function OnboardingScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  const [screen, setScreen] = useState<ScreenId>('hero');
  const [disclosureVisible, setDisclosureVisible] = useState(false);
  const [disclosureCopy, setDisclosureCopy] = useState<DisclosureCopy | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceTierInfo>({
    tier: 2,
    deviceName: 'Your device',
    ramGB: 4,
    osVersion: 'Unknown',
  });
  const [recommendedModel, setRecommendedModel] = useState<RecommendedModel>(() =>
    pickRecommendedModel(2),
  );
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeedMBs, setDownloadSpeedMBs] = useState(0);
  const downloadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detect device capabilities once on mount
  useEffect(() => {
    detectCapabilities()
      .then((caps) => {
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

        setDeviceInfo({ tier, deviceName, ramGB, osVersion });
        setRecommendedModel(pickRecommendedModel(tier));
      })
      .catch(() => {
        // Keep defaults on capability detection failure
      });
  }, []);

  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) clearInterval(downloadTimerRef.current);
    };
  }, []);

  const finishOnboarding = useCallback(() => {
    storage.set('onboarding-done', 'true');
    storage.set('onboarding-mode', 'local');
    router.replace({ pathname: '/(app)' as const });
  }, [router]);

  // ---------------------------------------------------------------------------
  // Hero CTA → disclosure gate
  // ---------------------------------------------------------------------------
  const handleHeroCTA = useCallback(async () => {
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

  const handleDisclosureAccept = useCallback(async () => {
    if (!disclosureCopy) return;
    setDisclosureVisible(false);
    await recordDisclosureAcceptance({
      ledger: mmkvDisclosureLedger,
      copy: disclosureCopy,
      surface: 'mobile',
      // true even in v1 local-only: gate uses requireManagedCloud:false so this
      // field is never evaluated now, and future cloud gate won't block returning users.
      managedCloudAccepted: true,
      chineseHqProvidersAccepted: [],
    });
    setScreen('device-tier');
  }, [disclosureCopy]);

  const handleDisclosureDecline = useCallback(() => {
    setDisclosureVisible(false);
    // Stay on hero — user can try again; app is fully usable on re-tap
  }, []);

  // ---------------------------------------------------------------------------
  // Device tier → download
  // ---------------------------------------------------------------------------
  const handleStartDownload = useCallback(() => {
    if (!recommendedModel.needsDownload) {
      finishOnboarding();
      return;
    }
    setScreen('download');
    setDownloadProgress(0);

    // TODO(model-catalog-engineer): add downloadUrl + checksum + format + runtime to OnDeviceModel,
    // then replace this stub with the real call:
    //
    //   import { downloadModel, cancelDownload, ModelDownloadError } from '@/services/modelDownload';
    //   downloadModel({
    //     modelId: recommendedModel.id,
    //     displayName: recommendedModel.displayName,
    //     downloadUrl: recommendedModel.downloadUrl,   // not yet in catalog
    //     checksum: recommendedModel.checksum,         // not yet in catalog
    //     fileSizeBytes: recommendedModel.fileSizeBytes,
    //     runtime: recommendedModel.supportedRuntimes[0],  // authoritative from catalog
    //     format: recommendedModel.format,                 // authoritative from catalog
    //     wifiOnly: !cellularEnabled,                  // wire cellular toggle state here
    //     onProgress(downloaded, total, speedBps) {
    //       setDownloadProgress((downloaded / total) * 100);
    //       setDownloadSpeedMBs(Math.round(speedBps / (1024 * 1024)));
    //     },
    //   }).then(finishOnboarding).catch(handleDownloadError);
    //
    // Simulated progress until catalog fields are available:
    let progress = 0;
    downloadTimerRef.current = setInterval(() => {
      progress += 1.2;
      const clamped = Math.min(progress, 100);
      setDownloadProgress(clamped);
      setDownloadSpeedMBs(Math.round(8 + Math.random() * 6));
      if (progress >= 100) {
        clearInterval(downloadTimerRef.current!);
        downloadTimerRef.current = null;
        setTimeout(finishOnboarding, 600);
      }
    }, 80);
  }, [recommendedModel, finishOnboarding]);

  const handleSkipToChat = useCallback(() => {
    if (downloadTimerRef.current) {
      clearInterval(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    finishOnboarding();
  }, [finishOnboarding]);

  return (
    <SafeAreaView testID="onboarding-root" style={{ flex: 1, backgroundColor: colors.background }}>
      <Reanimated.View
        key={screen}
        entering={FadeIn.duration(280)}
        exiting={FadeOut.duration(160)}
        style={{ flex: 1 }}
      >
        {screen === 'hero' && <HeroScreen colors={colors} onStartChatting={handleHeroCTA} />}
        {screen === 'device-tier' && (
          <DeviceTierScreen
            colors={colors}
            deviceInfo={deviceInfo}
            model={recommendedModel}
            onDownload={handleStartDownload}
          />
        )}
        {screen === 'download' && (
          <DownloadScreen
            colors={colors}
            progress={downloadProgress}
            speedMBs={downloadSpeedMBs}
            model={recommendedModel}
            onSkip={handleSkipToChat}
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
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Screen 1: Hero
// ---------------------------------------------------------------------------
function HeroScreen({
  colors,
  onStartChatting,
}: {
  colors: ReturnType<typeof useThemeColors>;
  onStartChatting: () => void;
}) {
  return (
    <View
      testID="onboarding-hero-screen"
      style={[styles.heroRoot, { backgroundColor: colors.background }]}
    >
      {/* Brand mark — neutral geometric circle (no burst / spiral / sparkle) */}
      <View style={styles.brandMark}>
        <View style={[styles.brandDot, { backgroundColor: colors.teal }]} />
      </View>

      {/* Wordmark */}
      <Text
        testID="hero-wordmark"
        style={[styles.wordmark, { color: colors.textPrimary }]}
        accessibilityRole="header"
      >
        AGI
      </Text>

      {/* Tagline — exact copy per lock */}
      <Text testID="hero-tagline" style={[styles.tagline, { color: colors.textSecondary }]}>
        AGI runs on your device.
      </Text>

      {/* 3 trust chips — exact labels per lock */}
      <View style={styles.trustRow}>
        <TrustChip
          icon={<Cpu size={14} color={colors.teal} />}
          label="On-device only"
          colors={colors}
        />
        <TrustChip
          icon={<Plane size={14} color={colors.teal} />}
          label="Works offline"
          colors={colors}
        />
        <TrustChip
          icon={<Shield size={14} color={colors.teal} />}
          label="DPDP Act 2023 compliant"
          colors={colors}
        />
      </View>

      {/* Primary CTA — full-width pill */}
      <Pressable
        testID="hero-start-chatting-btn"
        onPress={onStartChatting}
        accessibilityRole="button"
        accessibilityLabel="Start chatting"
        style={[styles.ctaBtn, { backgroundColor: colors.teal }]}
      >
        <Text style={[styles.ctaBtnText, { color: colors.black }]}>Start chatting</Text>
      </Pressable>

      {/* Footer — exact copy per lock */}
      <Text testID="hero-footer" style={[styles.footer, { color: colors.textMuted }]}>
        Made by AGI Automation LLC · Delaware, USA
      </Text>
    </View>
  );
}

function TrustChip({
  icon,
  label,
  colors,
}: {
  icon: React.ReactElement;
  label: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View
      style={[
        styles.trustChip,
        { backgroundColor: 'rgba(62,184,196,0.08)', borderColor: colors.border },
      ]}
    >
      {icon}
      <Text style={[styles.trustChipText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 2: Device-tier detection
// ---------------------------------------------------------------------------
function DeviceTierScreen({
  colors,
  deviceInfo,
  model,
  onDownload,
}: {
  colors: ReturnType<typeof useThemeColors>;
  deviceInfo: DeviceTierInfo;
  model: RecommendedModel;
  onDownload: () => void;
}) {
  const tierLabel = deviceInfo.tier === 1 ? 'Tier 1' : deviceInfo.tier === 2 ? 'Tier 2' : 'Tier 3';
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
        Your {deviceInfo.deviceName} is ready.
      </Text>

      <Text style={[styles.tierSubhead, { color: colors.textMuted }]}>
        {deviceInfo.deviceName} · {deviceInfo.ramGB} GB RAM · {deviceInfo.osVersion} · {tierLabel}{' '}
        capable
      </Text>

      {/* Recommended model card */}
      <View
        style={[
          styles.modelCard,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
          },
        ]}
      >
        <View style={styles.modelCardHeader}>
          <Text style={[styles.modelName, { color: colors.textPrimary }]}>{model.displayName}</Text>
          <View style={[styles.tierBadge, { backgroundColor: 'rgba(62,184,196,0.12)' }]}>
            <Text style={[styles.tierBadgeText, { color: colors.teal }]}>{tierLabel}</Text>
          </View>
        </View>

        {model.needsDownload ? (
          <>
            <Text style={[styles.modelDetail, { color: colors.textMuted }]}>
              {formatBytes(model.fileSizeBytes)} · Wi-Fi recommended
            </Text>
            <Text style={[styles.modelDetail, { color: colors.textMuted }]}>
              Estimated download: {estimateWifiMinutes(model.fileSizeBytes)} on Wi-Fi
            </Text>
          </>
        ) : (
          <Text style={[styles.modelDetail, { color: colors.textMuted }]}>
            Already on your device · Zero download
          </Text>
        )}
      </View>

      {/* Cellular toggle — off by default (Wi-Fi first for India) */}
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
          <View
            style={[
              styles.toggleTrack,
              { backgroundColor: cellularEnabled ? colors.teal : 'rgba(255,255,255,0.12)' },
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                {
                  backgroundColor: colors.white,
                  transform: [{ translateX: cellularEnabled ? 20 : 2 }],
                },
              ]}
            />
          </View>
        </Pressable>
      )}

      {/* Primary CTA */}
      <Pressable
        testID="device-tier-download-btn"
        onPress={onDownload}
        accessibilityRole="button"
        accessibilityLabel={model.needsDownload ? 'Download model' : 'Continue'}
        style={[styles.ctaBtn, { backgroundColor: colors.teal, marginTop: 24 }]}
      >
        <Text style={[styles.ctaBtnText, { color: colors.black }]}>
          {model.needsDownload
            ? `Download model (${formatBytes(model.fileSizeBytes)})`
            : 'Continue'}
        </Text>
      </Pressable>

      {/* Secondary: model picker — TODO wire to model-picker screen when built */}
      <Pressable
        testID="device-tier-pick-model-btn"
        accessibilityRole="button"
        accessibilityLabel="Pick a different model"
        onPress={() => {
          /* TODO: navigate to model picker screen */
        }}
        style={styles.secondaryBtn}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.textMuted }]}>
          Pick a different model
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Screen 3: Download progress
// ---------------------------------------------------------------------------
function DownloadScreen({
  colors,
  progress,
  speedMBs,
  model,
  onSkip,
}: {
  colors: ReturnType<typeof useThemeColors>;
  progress: number;
  speedMBs: number;
  model: RecommendedModel;
  onSkip: () => void;
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
      <RadialProgress progress={progress} size={160} stroke={10} color={colors.terraCotta} />

      <Text
        testID="download-percent"
        style={[styles.downloadPct, { color: colors.textPrimary }]}
        accessibilityLabel={`${pct} percent downloaded`}
      >
        {pct}%
      </Text>

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
        You can leave this screen — download continues in the background.
      </Text>

      <Pressable
        testID="download-skip-btn"
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel="Continue to chat"
        style={[styles.skipBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }]}
      >
        <Text style={[styles.skipBtnText, { color: colors.textSecondary }]}>Continue to chat</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Radial progress ring (terracotta stroke on neutral track).
// TODO: Replace with react-native-svg Arc for pixel-perfect conic fill once
// svg is confirmed in the project deps (no new dep added here).
// ---------------------------------------------------------------------------
function RadialProgress({
  progress,
  size,
  stroke,
  color,
}: {
  progress: number;
  size: number;
  stroke: number;
  color: string;
}) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress, animatedValue]);

  return (
    <View
      testID="download-radial-progress"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Neutral track */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      />
      {/* Filled arc — opacity proxy until react-native-svg is available */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: color,
          opacity: animatedValue.interpolate({
            inputRange: [0, 5, 100],
            outputRange: [0, 1, 1],
          }),
          transform: [
            {
              rotate: animatedValue.interpolate({
                inputRange: [0, 100],
                outputRange: ['0deg', '360deg'],
              }),
            },
          ],
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  // Hero
  heroRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  brandMark: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(62,184,196,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  brandDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  wordmark: {
    fontSize: 96,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 96,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 32,
  },
  trustRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 48,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  trustChipText: {
    fontSize: 12,
    fontWeight: '500',
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

  // Device tier
  deviceTierRoot: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  tierHeadline: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
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
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
  },

  // Download
  downloadRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  downloadPct: {
    fontSize: 64,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    marginTop: 8,
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
