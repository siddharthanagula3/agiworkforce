import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Platform, StyleSheet, ScrollView } from 'react-native';
import { Clock, Lightbulb, Settings, type LucideIcon } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { AgiMark } from '@/components/ui/AgiMark';
import Constants from 'expo-constants';
import type BottomSheet from '@gorhom/bottom-sheet';
import { storage } from '@/lib/mmkv';
import { Text } from '@/components/ui/Text';
import { Switch } from '@/components/ui/Switch';
import { Input } from '@/components/ui/Input';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useTheme, type ColorScheme, motion } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import { useResponsiveLayout } from '@/src/shared/hooks/useResponsiveLayout';
import { appAuthoredDownloadMessage, ModelDownloadError } from '@/services/modelDownload';
import { getInstalledModel } from '@/storage/installedModels';
import {
  FirstRunDisclosureModal,
  PRIVACY_POLICY_URL,
  TERMS_OF_USE_URL,
} from '@/src/features/onboarding/components/FirstRunDisclosureModal';
import { openWebContentPage } from '@/src/platform/webContentPage';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import {
  composeShortFirstRunDisclosure,
  isDisclosureSatisfied,
  recordDisclosureAcceptance,
  type ChineseHqProviderId,
  type ShortDisclosureCopy,
} from '@agiworkforce/compliance';
import { mmkvDisclosureLedger } from '@/services/complianceLedger';
import { applyChineseHqProviderConsent } from '@/services/providerConsent';
import {
  detectCapabilities,
  getDefaultModel,
  getModelById,
  getShippableModels,
  getSystemModelForTier1Runtime,
  type DeviceCapabilities,
  type LocalRuntimeTier,
} from '@agiworkforce/local-llm';
import { PRODUCT_BRAND, getAutoRoutingProfiles, type OnDeviceModel } from '@agiworkforce/types';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { useModelStore } from '@/src/features/model-picker/store';
import { formatAttachmentSize } from '@/src/features/chat/utils/attachmentSize';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { getSelectableModelById } from '@/src/features/model-picker/service';
import {
  PERSONALIZATION_NICKNAME_MAX_LENGTH,
  PERSONALIZATION_OCCUPATION_MAX_LENGTH,
} from '@/src/features/settings/personalization/personalizationFieldLimits';

const HERO_SYMBOL_SIZE = 72;
const HERO_NOTICE_ICON_SIZE = 22;
const HERO_NOTICES: readonly { id: string; icon: LucideIcon; text: string }[] = [
  {
    id: 'settings',
    icon: Settings,
    text: "You're in control of your settings and can change them anytime.",
  },
  {
    id: 'history',
    icon: Clock,
    text: 'Local chats stay on this device. AGI Cloud chats are saved to your account, and you can delete them.',
  },
  {
    id: 'mistakes',
    icon: Lightbulb,
    text: 'AI can make mistakes, so check important information.',
  },
];
const DOWNLOAD_FAILED_MESSAGE = 'Download failed. You can try again or continue without the model.';

type DeviceTierInfo = {
  tier: LocalRuntimeTier;
  tier1Runtime: DeviceCapabilities['tier1Runtime'];
  tier2Available: boolean | null;
  deviceName: string;
  ramGB: number;
  osVersion: string;
};

function tierFromCapabilities(tier1Available: boolean, tier2Available: boolean): LocalRuntimeTier {
  if (tier1Available) return 1;
  if (tier2Available) return 2;
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

type ScreenId = 'hero' | 'about-you' | 'device-tier' | 'download';

export default function OnboardingScreen() {
  const { colors, isDark } = useTheme();
  const { viewportWidth } = useResponsiveLayout();
  const router = useRouter();
  const primaryButtonTextColor = isDark ? colors.black : colors.white;

  const [screen, setScreen] = useState<ScreenId>('hero');
  const [disclosureVisible, setDisclosureVisible] = useState(false);
  const [disclosureCopy, setDisclosureCopy] = useState<ShortDisclosureCopy | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceTierInfo>({
    tier: 2,
    tier1Runtime: null,
    tier2Available: null,
    deviceName: 'Your device',
    ramGB: 4,
    osVersion: 'Unknown',
  });
  const [recommendedModel, setRecommendedModel] = useState<RecommendedModel>(() =>
    pickRecommendedModel(2),
  );
  const modelUnavailable =
    deviceInfo.tier2Available === false && Boolean(recommendedModel.executorchPreset);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeedMBs, setDownloadSpeedMBs] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onboardingOpenRef = useRef(true);
  const modelPickerRef = useRef<BottomSheet>(null);

  useEffect(() => {
    onboardingOpenRef.current = true;
    return () => {
      onboardingOpenRef.current = false;
    };
  }, []);

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

        const tier = tierFromCapabilities(caps.tier1Available, caps.tier2Available);
        const ramGB = Math.max(1, Math.round(caps.totalRAMMB / 1024));
        const deviceName =
          Constants.platform?.ios?.model ??
          Constants.platform?.android?.model ??
          Constants.deviceName ??
          'Your device';
        const osVersion = caps.osVersion || (Constants.platform?.ios?.systemVersion ?? 'Unknown');

        setDeviceInfo({
          tier,
          tier1Runtime: caps.tier1Runtime,
          tier2Available: caps.tier2Available,
          deviceName,
          ramGB,
          osVersion,
        });
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

  // The chat composer reads its model from the model store, not from this
  // screen. Without this the recommended model was only ever a label here and
  // the first local send ran against the catalog default, which is a multi-GB
  // download nobody had fetched.
  const finishOnboarding = useCallback(
    (activateModelId?: string) => {
      if (activateModelId) useModelStore.getState().setModel(activateModelId);
      storage.set('onboarding-done', 'true');
      storage.delete('onboarding-mode');
      router.replace({ pathname: '/(app)' as const });
    },
    [router],
  );

  const leaveDownloadScreen = useCallback(() => {
    onboardingOpenRef.current = false;
    if (downloadTimerRef.current) {
      clearInterval(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
  }, []);

  const handleContinueToCloud = useCallback(() => {
    leaveDownloadScreen();
    useModelInstallStore.getState().cancelModelDownload(recommendedModel.id);
    storage.set('onboarding-done', 'true');
    storage.delete('onboarding-mode');
    router.replace(beginCloudPostAuthIntent());
  }, [leaveDownloadScreen, recommendedModel.id, router]);

  const handleHeroCTA = useCallback(() => {
    const alreadySatisfied = isDisclosureSatisfied(mmkvDisclosureLedger, false);
    if (alreadySatisfied) {
      setScreen('about-you');
      return;
    }
    const copy = composeShortFirstRunDisclosure({
      surface: 'mobile',
      offersManagedCloud: false,
      thirdPartyAiProviders: [],
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
        managedCloudAccepted: false,
        chineseHqProvidersAccepted: acceptedProviderIds,
      });
      applyChineseHqProviderConsent(acceptedProviderIds);
      setScreen('about-you');
    },
    [disclosureCopy],
  );

  const handleAboutYouDone = useCallback((preferredName: string, workDescription: string) => {
    const partial = {
      ...(preferredName ? { nickname: preferredName } : {}),
      ...(workDescription ? { occupation: workDescription } : {}),
    };
    if (Object.keys(partial).length > 0) {
      useLocalSettingsStore.getState().setPersonalization(partial);
      useCloudSettingsStore.getState().setPersonalization(partial);
    }
    setScreen('device-tier');
  }, []);

  const handleDisclosureDecline = useCallback(() => {
    setDisclosureVisible(false);
  }, []);

  const handleStartDownload = useCallback(
    (cellularEnabled = false) => {
      if (modelUnavailable) return;
      // The choice made here is the persisted policy every later download reads.
      useModelInstallStore.getState().setAllowCellularDownloads(cellularEnabled);
      if (!recommendedModel.needsDownload) {
        finishOnboarding(recommendedModel.id);
        return;
      }
      setScreen('download');
      setDownloadProgress(0);
      setDownloadSpeedMBs(0);
      setDownloadError(null);

      const presetModel = recommendedModel.executorchPreset
        ? getSelectableModelById(recommendedModel.id)
        : undefined;
      if (presetModel) {
        const modelId = presetModel.id;
        const stopProgress = useModelInstallStore.subscribe((state) => {
          const job = state.jobs[modelId];
          if (job?.status === 'downloading') setDownloadProgress(job.progress * 100);
        });
        useModelInstallStore
          .getState()
          .prepareModel(presetModel)
          .then(() => {
            if (onboardingOpenRef.current) finishOnboarding(modelId);
          })
          .catch((err: unknown) => {
            if (!onboardingOpenRef.current) return;
            if (err instanceof ModelDownloadError && err.kind === 'cancelled') return;
            setDownloadError(appAuthoredDownloadMessage(err) ?? DOWNLOAD_FAILED_MESSAGE);
          })
          .finally(stopProgress);
        return;
      }

      const modelDef = getSelectableModelById(recommendedModel.id);
      if (
        modelDef &&
        recommendedModel.downloadUrl &&
        recommendedModel.checksum &&
        recommendedModel.format
      ) {
        useModelInstallStore
          .getState()
          .prepareModel(modelDef, {
            onProgress(downloaded, total, speedBps) {
              setDownloadProgress((downloaded / total) * 100);
              setDownloadSpeedMBs(Math.round(speedBps / (1024 * 1024)));
            },
          })
          .then(() => {
            if (onboardingOpenRef.current) finishOnboarding(recommendedModel.id);
          })
          .catch((err: unknown) => {
            const kind = err instanceof ModelDownloadError ? err.kind : 'network_error';
            if (kind === 'cancelled') {
              return;
            }
            setDownloadError(appAuthoredDownloadMessage(err) ?? DOWNLOAD_FAILED_MESSAGE);
          });
        return;
      }

      setDownloadError('This model cannot be downloaded yet. Pick a different model to continue.');
    },
    [recommendedModel, finishOnboarding, modelUnavailable],
  );

  const canRetryDownload = Boolean(
    recommendedModel.executorchPreset ||
    (recommendedModel.downloadUrl && recommendedModel.checksum && recommendedModel.format),
  );

  const handleRetryDownload = useCallback(() => {
    handleStartDownload(useModelInstallStore.getState().allowCellularDownloads);
  }, [handleStartDownload]);

  const handleSkipToChat = useCallback(() => {
    leaveDownloadScreen();
    finishOnboarding();
  }, [leaveDownloadScreen, finishOnboarding]);

  return (
    <SafeAreaView testID="onboarding-root" style={{ flex: 1, backgroundColor: colors.background }}>
      <Reanimated.View
        key={screen}
        testID="onboarding-column"
        entering={FadeIn.duration(motion.moved)}
        exiting={FadeOut.duration(motion.quick)}
        style={[{ flex: 1 }, contentColumn('form')]}
      >
        {screen === 'hero' && (
          <HeroScreen
            colors={colors}
            primaryButtonTextColor={primaryButtonTextColor}
            onStartChatting={handleHeroCTA}
          />
        )}
        {screen === 'about-you' && (
          <AboutYouScreen
            colors={colors}
            primaryButtonTextColor={primaryButtonTextColor}
            onDone={handleAboutYouDone}
          />
        )}
        {screen === 'device-tier' && (
          <DeviceTierScreen
            colors={colors}
            primaryButtonTextColor={primaryButtonTextColor}
            deviceInfo={deviceInfo}
            model={recommendedModel}
            modelUnavailable={modelUnavailable}
            onDownload={handleStartDownload}
            onPickModel={handlePickModel}
            onSkip={handleSkipToChat}
            onContinueToCloud={handleContinueToCloud}
          />
        )}
        {screen === 'download' && (
          <DownloadScreen
            colors={colors}
            primaryButtonTextColor={primaryButtonTextColor}
            progress={downloadProgress}
            speedMBs={downloadSpeedMBs}
            model={recommendedModel}
            onSkip={handleSkipToChat}
            onRetry={canRetryDownload ? handleRetryDownload : undefined}
            error={downloadError}
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
      <ModelPickerSheet
        sheetRef={modelPickerRef}
        modelScope="local"
        paneWidth={viewportWidth}
        onSelect={handleSelectModel}
      />
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
      <ScrollView
        contentContainerStyle={styles.heroScroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.heroBody}>
          <View
            style={styles.heroSymbol}
            accessible
            accessibilityRole="image"
            accessibilityLabel={PRODUCT_BRAND}
          >
            <AgiMark size={HERO_SYMBOL_SIZE} testID="hero-brand-mark" />
          </View>

          <Text
            testID="hero-tagline"
            accessibilityRole="header"
            style={[styles.tagline, { color: colors.textPrimary }]}
          >
            Your AI workspace for everyday work.
          </Text>

          <Text style={[styles.heroSubcopy, { color: colors.textMuted }]}>
            Chat, write, code, research, and organize projects in one place.
          </Text>

          <View testID="hero-notices" style={styles.noticeList}>
            {HERO_NOTICES.map(({ id, icon: Icon, text }) => (
              <View key={id} testID={`hero-notice-${id}`} style={styles.noticeRow}>
                <View
                  style={styles.noticeIcon}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Icon size={HERO_NOTICE_ICON_SIZE} color={colors.textSecondary} />
                </View>
                <Text style={[styles.noticeText, { color: colors.textSecondary }]}>{text}</Text>
              </View>
            ))}
          </View>

          <Text testID="hero-legal-line" style={[styles.legalLine, { color: colors.textMuted }]}>
            By continuing you agree to the{' '}
            <Text
              testID="hero-terms-link"
              variant="inline"
              accessibilityRole="link"
              accessibilityLabel="Read the terms of use"
              onPress={() => void openWebContentPage(TERMS_OF_USE_URL)}
              style={[styles.legalLink, { color: colors.textSecondary }]}
            >
              Terms
            </Text>{' '}
            and{' '}
            <Text
              testID="hero-privacy-link"
              variant="inline"
              accessibilityRole="link"
              accessibilityLabel="Read the privacy policy"
              onPress={() => void openWebContentPage(PRIVACY_POLICY_URL)}
              style={[styles.legalLink, { color: colors.textSecondary }]}
            >
              Privacy Policy
            </Text>
          </Text>

          <PressableBox
            testID="hero-start-chatting-btn"
            onPress={onStartChatting}
            accessibilityRole="button"
            accessibilityLabel="Start chatting"
            style={[styles.ctaBtn, { backgroundColor: colors.teal }]}
          >
            <Text style={[styles.ctaBtnText, { color: primaryButtonTextColor }]}>
              Start chatting
            </Text>
          </PressableBox>
        </View>

        <Text testID="hero-footer" style={[styles.footer, { color: colors.textMuted }]}>
          Made by AGI Automation LLC, USA
        </Text>
      </ScrollView>
    </View>
  );
}

function AboutYouScreen({
  colors,
  primaryButtonTextColor,
  onDone,
}: {
  colors: ColorScheme;
  primaryButtonTextColor: string;
  onDone: (preferredName: string, workDescription: string) => void;
}) {
  const [preferredName, setPreferredName] = useState(
    () => useLocalSettingsStore.getState().personalization.nickname ?? '',
  );
  const [workDescription, setWorkDescription] = useState(
    () => useLocalSettingsStore.getState().personalization.occupation ?? '',
  );

  return (
    <ScrollView
      testID="onboarding-about-you-screen"
      style={{ flex: 1 }}
      contentContainerStyle={[styles.deviceTierRoot, { paddingBottom: 48, gap: 16 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.title2, fontWeight: '700' }}>
        What should AGI call you?
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.body, lineHeight: 21 }}>
        You can change this later in Settings.
      </Text>
      <Input
        label="Your name"
        value={preferredName}
        onChangeText={setPreferredName}
        autoComplete="given-name"
        textContentType="givenName"
        maxLength={PERSONALIZATION_NICKNAME_MAX_LENGTH}
        returnKeyType="next"
      />
      <Input
        label="What best describes your work?"
        value={workDescription}
        onChangeText={setWorkDescription}
        placeholder="For example, product design"
        maxLength={PERSONALIZATION_OCCUPATION_MAX_LENGTH}
        returnKeyType="done"
      />
      <PressableBox
        testID="about-you-continue-btn"
        onPress={() => onDone(preferredName.trim(), workDescription.trim())}
        accessibilityRole="button"
        accessibilityLabel="Continue"
        disabled={!preferredName.trim()}
        style={[
          styles.ctaBtn,
          {
            backgroundColor: colors.teal,
            marginTop: 8,
            opacity: preferredName.trim() ? 1 : 0.5,
          },
        ]}
      >
        <Text style={[styles.ctaBtnText, { color: primaryButtonTextColor }]}>Continue</Text>
      </PressableBox>
      <PressableBox
        testID="about-you-skip-btn"
        accessibilityRole="button"
        accessibilityLabel="Skip for now"
        onPress={() => onDone('', '')}
        style={styles.secondaryBtn}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Skip for now</Text>
      </PressableBox>
    </ScrollView>
  );
}

function DeviceTierScreen({
  colors,
  primaryButtonTextColor,
  deviceInfo,
  model,
  modelUnavailable,
  onDownload,
  onPickModel,
  onSkip,
  onContinueToCloud,
}: {
  colors: ColorScheme;
  primaryButtonTextColor: string;
  deviceInfo: DeviceTierInfo;
  model: RecommendedModel;
  modelUnavailable: boolean;
  onDownload: (cellularEnabled: boolean) => void;
  onPickModel: () => void;
  onSkip: () => void;
  onContinueToCloud: () => void;
}) {
  const deviceSummary = modelUnavailable
    ? `${model.displayName} is unavailable on this device.`
    : model.needsDownload
      ? 'Download one local model to start private chats on this device.'
      : 'A local model is ready to use on this device.';
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

      {!modelUnavailable && (
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
            <Text style={[styles.modelName, { color: colors.textPrimary }]}>
              {model.displayName}
            </Text>
            <View style={[styles.tierBadge, { backgroundColor: colors.accentSurface }]}>
              <Text style={[styles.tierBadgeText, { color: colors.teal }]}>Recommended</Text>
            </View>
          </View>

          {model.needsDownload ? (
            <>
              <Text style={[styles.modelDetail, { color: colors.textMuted }]}>
                {formatAttachmentSize(model.fileSizeBytes)} download · Wi-Fi recommended
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
      )}

      {!modelUnavailable && model.needsDownload && (
        <PressableBox
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
        </PressableBox>
      )}

      {!modelUnavailable && (
        <PressableBox
          testID="device-tier-download-btn"
          onPress={() => onDownload(cellularEnabled)}
          accessibilityRole="button"
          accessibilityLabel={model.needsDownload ? 'Download model' : 'Continue'}
          style={[styles.ctaBtn, { backgroundColor: colors.teal, marginTop: 24 }]}
        >
          <Text style={[styles.ctaBtnText, { color: primaryButtonTextColor }]}>
            {model.needsDownload ? `Download ${model.displayName}` : 'Continue'}
          </Text>
        </PressableBox>
      )}

      <PressableBox
        testID="device-tier-pick-model-btn"
        accessibilityRole="button"
        accessibilityLabel={modelUnavailable ? 'Browse local models' : 'Pick a different model'}
        onPress={onPickModel}
        style={styles.secondaryBtn}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
          {modelUnavailable ? 'Browse local models' : 'Pick a different model'}
        </Text>
      </PressableBox>

      {modelUnavailable || model.needsDownload ? (
        <PressableBox
          testID="device-tier-skip-btn"
          accessibilityRole="button"
          onPress={onSkip}
          style={styles.secondaryBtn}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
            {modelUnavailable ? 'Continue without a local model' : 'Continue without downloading'}
          </Text>
        </PressableBox>
      ) : null}

      {/* Cloud path, reach catalog-selected hosted models + cloud tools/web
          search without downloading a local model. Sign-in is the entitlement. */}
      <PressableBox
        testID="device-tier-cloud-btn"
        accessibilityRole="button"
        accessibilityLabel="Sign in to use Cloud"
        onPress={onContinueToCloud}
        style={styles.secondaryBtn}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.teal }]}>Sign in to use Cloud</Text>
      </PressableBox>
    </ScrollView>
  );
}

function DownloadScreen({
  colors,
  primaryButtonTextColor,
  progress,
  speedMBs,
  model,
  onSkip,
  onRetry,
  error,
}: {
  colors: ColorScheme;
  primaryButtonTextColor: string;
  progress: number;
  speedMBs: number;
  model: RecommendedModel;
  onSkip: () => void;
  onRetry?: (() => void) | undefined;
  error?: string | null;
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
        {formatAttachmentSize(model.fileSizeBytes)}
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
        The download continues if you leave this screen.
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

      {error && onRetry && (
        <PressableBox
          testID="download-retry-btn"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try download again"
          style={[styles.skipBtn, { backgroundColor: colors.teal }]}
        >
          <Text style={[styles.skipBtnText, { color: primaryButtonTextColor }]}>Try again</Text>
        </PressableBox>
      )}

      <PressableBox
        testID="download-skip-btn"
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel="Continue to chat"
        style={[styles.skipBtn, { backgroundColor: colors.neutralSurface }]}
      >
        <Text style={[styles.skipBtnText, { color: colors.textSecondary }]}>Continue to chat</Text>
      </PressableBox>
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
  },
  heroScroll: {
    flexGrow: 1,
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'android' ? 24 : 16,
  },
  heroBody: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
  },
  heroSymbol: {
    marginBottom: 24,
  },
  tagline: {
    fontSize: typeScale.title3,
    fontWeight: '600',
    lineHeight: 27,
    textAlign: 'center',
    marginBottom: 10,
  },
  heroSubcopy: {
    fontSize: typeScale.body,
    lineHeight: 22,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 320,
  },
  noticeList: {
    alignSelf: 'stretch',
    gap: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  noticeIcon: {
    width: HERO_NOTICE_ICON_SIZE,
    height: typeScale.headline * 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeText: {
    flex: 1,
    fontSize: typeScale.headline,
    lineHeight: Math.round(typeScale.headline * 1.4),
    textAlign: 'left',
  },
  legalLine: {
    fontSize: typeScale.callout,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  legalLink: {
    textDecorationLine: 'underline',
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
    fontSize: typeScale.headline,
  },
  footer: {
    fontSize: typeScale.caption,
    textAlign: 'center',
  },

  deviceTierRoot: {
    paddingHorizontal: 24,
    paddingTop: 56,
  },
  tierHeadline: {
    fontSize: typeScale.title1,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 8,
  },
  tierSubhead: {
    fontSize: typeScale.subhead,
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
    fontSize: typeScale.headline,
    fontWeight: '600',
    flex: 1,
  },
  tierBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tierBadgeText: {
    fontSize: typeScale.caption,
    fontWeight: '600',
  },
  modelDetail: {
    fontSize: typeScale.footnote,
    lineHeight: 18,
  },
  cellularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cellularLabel: {
    fontSize: typeScale.body,
    flex: 1,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: typeScale.subhead,
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
    fontSize: typeScale.largeTitle,
    lineHeight: 46,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
    textAlign: 'center',
  },
  downloadModelName: {
    fontSize: typeScale.callout,
    fontWeight: '600',
    textAlign: 'center',
  },
  downloadMeta: {
    fontSize: typeScale.footnote,
    textAlign: 'center',
  },
  downloadReassurance: {
    fontSize: typeScale.body,
    textAlign: 'center',
    marginTop: 8,
  },
  downloadHint: {
    fontSize: typeScale.caption,
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
    fontSize: typeScale.subhead,
    fontWeight: '500',
  },
});
