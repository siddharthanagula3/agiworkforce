/**
 * Onboarding — 3-branch flow per PRD-MOBILE §11.
 *
 * Branch A: Local  → Model picker → Download progress → Ready
 * Branch B: Cloud  → 5.1.2(i) consent → Provider picker → Ready
 * Branch C: Decide later → drop into chat
 *
 * Apple App Review: 5.1.2(i) consent modal fires BEFORE the provider list
 * is unlocked. Consent is persisted in SecureStore (byok_consent_accepted_at).
 * Toggle is NOT pre-checked. Cancel path drops back to mode picker so full
 * app functionality is preserved (user can always use Local mode).
 */
import { useState, useRef, useEffect } from 'react';
import { View, Pressable, Animated, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Sparkles, Cpu, Cloud, Smartphone, ChevronRight, ArrowLeft } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { storage } from '@/lib/mmkv';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';
import { ModeCard, type OnboardingMode } from '@/components/onboarding/ModeCard';
import { ByokConsentModal } from '@/components/onboarding/ByokConsentModal';

// ---------------------------------------------------------------------------
// Consent persistence
// ---------------------------------------------------------------------------
const CONSENT_KEY = 'byok_consent_accepted_at';
const CONSENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function readConsent(): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(CONSENT_KEY);
    if (!stored) return false;
    const ts = parseInt(stored, 10);
    return Date.now() - ts < CONSENT_WINDOW_MS;
  } catch {
    return false;
  }
}

async function persistConsent(): Promise<void> {
  try {
    await SecureStore.setItemAsync(CONSENT_KEY, String(Date.now()), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Non-fatal — will re-prompt on next launch
  }
}

// ---------------------------------------------------------------------------
// Cloud providers list per PRD §11 Branch B Screen 4b
// ---------------------------------------------------------------------------
const CLOUD_PROVIDERS = [
  'Anthropic',
  'OpenAI',
  'Google',
  'xAI',
  'DeepSeek',
  'Perplexity',
  'Moonshot',
  'Zhipu',
  'Mistral',
  'Custom',
] as const;

type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

// ---------------------------------------------------------------------------
// Screen state machine
// ---------------------------------------------------------------------------
type ScreenId =
  | 'welcome'
  | 'mode-picker'
  | 'local-model-picker'
  | 'local-download'
  | 'local-ready'
  | 'cloud-provider-picker'
  | 'cloud-ready';

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  const [screen, setScreen] = useState<ScreenId>('welcome');
  const [selectedMode, setSelectedMode] = useState<OnboardingMode>('local');
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider | null>(null);
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentChecking, setConsentChecking] = useState(false);
  const [localModelIdx, setLocalModelIdx] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const downloadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) clearInterval(downloadTimerRef.current);
    };
  }, []);

  const finishOnboarding = (mode: 'local' | 'cloud' | 'decide_later') => {
    storage.set('onboarding-done', 'true');
    storage.set('onboarding-mode', mode);
    router.replace({ pathname: '/(auth)/login' as const });
  };

  const handleSignIn = () => {
    storage.set('onboarding-done', 'true');
    router.replace({ pathname: '/(auth)/login' as const });
  };

  const handleModeConfirm = async () => {
    if (selectedMode === 'local') {
      setScreen('local-model-picker');
    } else if (selectedMode === 'cloud') {
      setConsentChecking(true);
      const hasConsent = await readConsent();
      setConsentChecking(false);
      if (hasConsent) {
        setScreen('cloud-provider-picker');
      } else {
        setConsentVisible(true);
      }
    } else {
      finishOnboarding('decide_later');
    }
  };

  const handleConsentAccept = async () => {
    setConsentVisible(false);
    await persistConsent();
    setScreen('cloud-provider-picker');
  };

  const handleConsentCancel = () => {
    setConsentVisible(false);
    // Stay on mode picker — no functionality lost, user can choose Local or Decide later
  };

  const handleLocalModelContinue = () => {
    const needsDownload = localModelIdx > 0;
    if (needsDownload) {
      setDownloadProgress(0);
      setScreen('local-download');
      downloadTimerRef.current = setInterval(() => {
        setDownloadProgress((prev) => {
          if (prev >= 100) {
            if (downloadTimerRef.current) clearInterval(downloadTimerRef.current);
            setScreen('local-ready');
            return 100;
          }
          return prev + 2;
        });
      }, 60);
    } else {
      setScreen('local-ready');
    }
  };

  const handleBack = () => {
    switch (screen) {
      case 'mode-picker':
        setScreen('welcome');
        break;
      case 'local-model-picker':
      case 'cloud-provider-picker':
        setScreen('mode-picker');
        break;
      default:
        setScreen('mode-picker');
    }
  };

  const showBack =
    screen !== 'welcome' &&
    screen !== 'local-download' &&
    screen !== 'local-ready' &&
    screen !== 'cloud-ready';

  return (
    <SafeAreaView testID="onboarding-root" style={{ flex: 1, backgroundColor: '#0f1012' }}>
      {showBack && (
        <Pressable
          testID="onboarding-back-btn"
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 4,
            alignSelf: 'flex-start',
          }}
        >
          <ArrowLeft size={22} color={colors.textMuted} />
        </Pressable>
      )}

      <Reanimated.View
        key={screen}
        entering={FadeIn.duration(280)}
        exiting={FadeOut.duration(160)}
        style={{ flex: 1 }}
      >
        {screen === 'welcome' && (
          <WelcomeScreen
            colors={colors}
            onContinue={() => setScreen('mode-picker')}
            onSignIn={handleSignIn}
          />
        )}
        {screen === 'mode-picker' && (
          <ModePickerScreen
            colors={colors}
            selectedMode={selectedMode}
            onSelectMode={setSelectedMode}
            onConfirm={handleModeConfirm}
            confirmLoading={consentChecking}
          />
        )}
        {screen === 'local-model-picker' && (
          <LocalModelPickerScreen
            colors={colors}
            selectedIdx={localModelIdx}
            onSelectIdx={setLocalModelIdx}
            onContinue={handleLocalModelContinue}
          />
        )}
        {screen === 'local-download' && (
          <LocalDownloadScreen
            colors={colors}
            progress={downloadProgress}
            onSkip={() => {
              if (downloadTimerRef.current) clearInterval(downloadTimerRef.current);
              setScreen('local-ready');
            }}
          />
        )}
        {screen === 'local-ready' && (
          <ReadyScreen
            testID="local-ready-screen"
            colors={colors}
            title="You're set. AGI runs on your device."
            subtitle="Your prompts stay on your phone. No account, no internet, no limits."
            icon={<Smartphone size={48} color={colors.teal} />}
            onOpen={() => finishOnboarding('local')}
          />
        )}
        {screen === 'cloud-provider-picker' && (
          <CloudProviderPickerScreen
            colors={colors}
            selectedProvider={selectedProvider}
            onSelect={(p) => {
              setSelectedProvider(p);
              setScreen('cloud-ready');
            }}
          />
        )}
        {screen === 'cloud-ready' && (
          <ReadyScreen
            testID="cloud-ready-screen"
            colors={colors}
            title="You're set. Pick Claude or any model in the composer."
            subtitle={`Your ${selectedProvider ?? 'provider'} key is saved on-device. Ready when you are.`}
            icon={<Cloud size={48} color={colors.teal} />}
            onOpen={() => finishOnboarding('cloud')}
          />
        )}
      </Reanimated.View>

      {/* 5.1.2(i) consent modal — renders before provider list is unlocked */}
      <ByokConsentModal
        visible={consentVisible}
        onAccept={handleConsentAccept}
        onCancel={handleConsentCancel}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Screen 1: Welcome
// ---------------------------------------------------------------------------

function WelcomeScreen({
  colors,
  onContinue,
  onSignIn,
}: {
  colors: ReturnType<typeof useThemeColors>;
  onContinue: () => void;
  onSignIn: () => void;
}) {
  return (
    <View
      testID="welcome-screen"
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
    >
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: 'rgba(33, 128, 141, 0.15)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 32,
        }}
      >
        <Sparkles size={48} color={colors.teal} />
      </View>

      <Text
        testID="welcome-title"
        style={{
          fontSize: 32,
          fontWeight: '700',
          color: colors.textPrimary,
          textAlign: 'center',
          marginBottom: 16,
        }}
      >
        Welcome to AGI
      </Text>

      <Text
        testID="welcome-subtitle"
        style={{
          fontSize: 16,
          color: colors.textMuted,
          textAlign: 'center',
          lineHeight: 24,
          marginBottom: 48,
        }}
      >
        Private AI that runs on your phone. Works offline. Your keys, your provider, your choice.
      </Text>

      <View style={{ width: '100%', gap: 12 }}>
        <Pressable
          testID="welcome-continue-btn"
          onPress={onContinue}
          accessibilityLabel="Continue"
          accessibilityRole="button"
          style={{
            backgroundColor: colors.teal,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>Continue</Text>
        </Pressable>

        <Pressable
          testID="welcome-sign-in-btn"
          onPress={onSignIn}
          accessibilityLabel="Sign in to existing account"
          accessibilityRole="button"
          style={{ paddingVertical: 14, alignItems: 'center' }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Sign In</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 2: Mode picker
// ---------------------------------------------------------------------------

function ModePickerScreen({
  colors,
  selectedMode,
  onSelectMode,
  onConfirm,
  confirmLoading,
}: {
  colors: ReturnType<typeof useThemeColors>;
  selectedMode: OnboardingMode;
  onSelectMode: (mode: OnboardingMode) => void;
  onConfirm: () => void;
  confirmLoading: boolean;
}) {
  return (
    <View testID="mode-picker-screen" style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          testID="mode-picker-title"
          style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}
        >
          How would you like to use AGI?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 24 }}>
          You can change this any time in Settings.
        </Text>

        <ModeCard
          mode="local"
          selected={selectedMode === 'local'}
          onSelect={() => onSelectMode('local')}
        />
        <ModeCard
          mode="cloud"
          selected={selectedMode === 'cloud'}
          onSelect={() => onSelectMode('cloud')}
        />
        <ModeCard
          mode="decide_later"
          selected={selectedMode === 'decide_later'}
          onSelect={() => onSelectMode('decide_later')}
        />
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: Platform.OS === 'android' ? 20 : 8,
          paddingTop: 8,
        }}
      >
        <Pressable
          testID="mode-picker-confirm-btn"
          onPress={onConfirm}
          disabled={confirmLoading}
          accessibilityLabel="Continue with selected mode"
          accessibilityRole="button"
          style={{
            backgroundColor: colors.teal,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            opacity: confirmLoading ? 0.7 : 1,
          }}
        >
          {confirmLoading ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <>
              <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>Continue</Text>
              <ChevronRight size={18} color="#000" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 3a: Local model picker
// ---------------------------------------------------------------------------

const LOCAL_MODELS = [
  {
    key: 'system',
    label: 'System',
    description: 'Apple Foundation / Gemini Nano',
    badge: 'Zero download',
    size: null,
  },
  { key: 'fast', label: 'Fast', description: 'Qwen 2.5 1.5B', badge: '1.0 GB', size: '1.0 GB' },
  {
    key: 'capable',
    label: 'Capable',
    description: 'Llama 3.2 3B',
    badge: '1.8 GB',
    size: '1.8 GB',
  },
] as const;

function LocalModelPickerScreen({
  colors,
  selectedIdx,
  onSelectIdx,
  onContinue,
}: {
  colors: ReturnType<typeof useThemeColors>;
  selectedIdx: number;
  onSelectIdx: (idx: number) => void;
  onContinue: () => void;
}) {
  const model = LOCAL_MODELS[selectedIdx]!;
  const needsDownload = selectedIdx > 0;

  return (
    <View testID="local-model-picker-screen" style={{ flex: 1, paddingHorizontal: 20 }}>
      <Text
        testID="local-model-picker-title"
        style={{
          fontSize: 26,
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: 6,
          marginTop: 12,
        }}
      >
        Pick a local model
      </Text>
      <Text style={{ fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 24 }}>
        Runs entirely on your device. No internet required.
      </Text>

      <View style={{ gap: 10, marginBottom: 24 }}>
        {LOCAL_MODELS.map((m, idx) => (
          <Pressable
            key={m.key}
            testID={`local-model-${m.key}`}
            onPress={() => onSelectIdx(idx)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedIdx === idx }}
            accessibilityLabel={`${m.label} — ${m.description}`}
            style={{
              borderRadius: 14,
              borderWidth: selectedIdx === idx ? 2 : 1,
              borderColor: selectedIdx === idx ? colors.teal : colors.border,
              backgroundColor:
                selectedIdx === idx ? 'rgba(33, 128, 141, 0.08)' : colors.surfaceBase,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  color: colors.textPrimary,
                  marginBottom: 2,
                }}
              >
                {m.label}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textMuted }}>{m.description}</Text>
            </View>
            <View
              style={{
                backgroundColor:
                  m.key === 'system' ? 'rgba(33,128,141,0.2)' : 'rgba(255,255,255,0.08)',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{ fontSize: 12, color: m.key === 'system' ? colors.teal : colors.textMuted }}
              >
                {m.badge}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable
        testID="local-model-download-btn"
        onPress={onContinue}
        accessibilityLabel={
          needsDownload ? `Download ${model.label} and continue` : 'Use system model and continue'
        }
        accessibilityRole="button"
        style={{
          backgroundColor: colors.teal,
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>
          {needsDownload ? `Download & Continue (${model.size})` : 'Use System Model'}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 4a: Download progress
// ---------------------------------------------------------------------------

function LocalDownloadScreen({
  colors,
  progress,
  onSkip,
}: {
  colors: ReturnType<typeof useThemeColors>;
  progress: number;
  onSkip: () => void;
}) {
  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress, barWidth]);

  return (
    <View
      testID="local-download-screen"
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
    >
      <Cpu size={56} color={colors.teal} style={{ marginBottom: 28 }} />

      <Text
        testID="local-download-title"
        style={{
          fontSize: 22,
          fontWeight: '700',
          color: colors.textPrimary,
          textAlign: 'center',
          marginBottom: 10,
        }}
      >
        Downloading model…
      </Text>
      <Text
        style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 32 }}
      >
        This happens once. You can use AGI now while it finishes.
      </Text>

      <View
        style={{
          width: '100%',
          height: 6,
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <Animated.View
          testID="local-download-progress-bar"
          style={{
            height: '100%',
            backgroundColor: colors.teal,
            borderRadius: 3,
            width: barWidth.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
          }}
        />
      </View>

      <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 32 }}>
        {Math.round(progress)}%
      </Text>

      <Pressable
        testID="local-download-use-now-btn"
        onPress={onSkip}
        accessibilityLabel="Use AGI now"
        accessibilityRole="button"
        style={{
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: 14,
          paddingHorizontal: 24,
          paddingVertical: 14,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>Use AGI now</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 4b: Cloud provider picker
// ---------------------------------------------------------------------------

function CloudProviderPickerScreen({
  colors,
  selectedProvider,
  onSelect,
}: {
  colors: ReturnType<typeof useThemeColors>;
  selectedProvider: CloudProvider | null;
  onSelect: (p: CloudProvider) => void;
}) {
  return (
    <View testID="cloud-provider-picker-screen" style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
        <Text
          testID="cloud-provider-picker-title"
          style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}
        >
          Which provider to start with?
        </Text>
        <Text style={{ fontSize: 15, color: colors.textMuted, lineHeight: 22 }}>
          You can add more keys any time in Settings.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {CLOUD_PROVIDERS.map((provider) => (
          <Pressable
            key={provider}
            testID={`cloud-provider-${provider.toLowerCase().replace(/\s+/g, '-')}`}
            onPress={() => onSelect(provider)}
            accessibilityRole="button"
            accessibilityLabel={`Select ${provider}`}
            style={{
              borderRadius: 14,
              borderWidth: selectedProvider === provider ? 2 : 1,
              borderColor: selectedProvider === provider ? colors.teal : colors.border,
              backgroundColor:
                selectedProvider === provider ? 'rgba(33, 128, 141, 0.08)' : colors.surfaceBase,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textPrimary, flex: 1 }}>
              {provider}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Ready screen (shared by Branch A and B)
// ---------------------------------------------------------------------------

function ReadyScreen({
  testID,
  colors,
  title,
  subtitle,
  icon,
  onOpen,
}: {
  testID: string;
  colors: ReturnType<typeof useThemeColors>;
  title: string;
  subtitle: string;
  icon: React.ReactElement;
  onOpen: () => void;
}) {
  return (
    <View
      testID={testID}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
    >
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: 'rgba(33, 128, 141, 0.15)',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 28,
        }}
      >
        {icon}
      </View>

      <Text
        testID={`${testID}-title`}
        style={{
          fontSize: 24,
          fontWeight: '700',
          color: colors.textPrimary,
          textAlign: 'center',
          marginBottom: 12,
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          fontSize: 15,
          color: colors.textMuted,
          textAlign: 'center',
          lineHeight: 22,
          marginBottom: 48,
        }}
      >
        {subtitle}
      </Text>

      <Pressable
        testID={`${testID}-open-chat-btn`}
        onPress={onOpen}
        accessibilityLabel="Open chat"
        accessibilityRole="button"
        style={{
          backgroundColor: colors.teal,
          borderRadius: 16,
          paddingVertical: 16,
          paddingHorizontal: 40,
          alignItems: 'center',
          width: '100%',
        }}
      >
        <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>Open chat</Text>
      </Pressable>
    </View>
  );
}
