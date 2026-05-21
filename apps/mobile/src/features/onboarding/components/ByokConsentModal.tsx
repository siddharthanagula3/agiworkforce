/**
 * Apple 5.1.2(i) BYOK consent modal. Legacy copy source:
 * docs/archive/2026-05-21-docs-consolidation/PRD-APPENDIX-B-API-CONTRACTS.md §B.7.
 *
 * Rules (from PRD §B.7 + App Review policy):
 *  - Renders BEFORE the provider list is unlocked.
 *  - Enumerates every provider with privacy policy link.
 *  - Tap-to-accept is NOT pre-checked.
 *  - Cancel path must not lose core app functionality.
 */
import { useEffect, useRef } from 'react';
import { Modal, View, ScrollView, Pressable, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExternalLink, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { openExternalUrl } from '@/lib/safeOpenURL';

const PROVIDERS = [
  {
    name: 'Anthropic',
    policyLabel: 'anthropic.com/legal/privacy',
    policyUrl: 'https://anthropic.com/legal/privacy',
    dataSent: 'Messages, attachments, system prompts',
  },
  {
    name: 'OpenAI',
    policyLabel: 'openai.com/policies/privacy-policy',
    policyUrl: 'https://openai.com/policies/privacy-policy',
    dataSent: 'Messages, attachments, system prompts',
  },
  {
    name: 'Google',
    policyLabel: 'policies.google.com/privacy',
    policyUrl: 'https://policies.google.com/privacy',
    dataSent: 'Messages, attachments, system prompts',
  },
  {
    name: 'xAI',
    policyLabel: 'x.ai/legal/privacy-policy',
    policyUrl: 'https://x.ai/legal/privacy-policy',
    dataSent: 'Messages, attachments, system prompts',
  },
  {
    name: 'DeepSeek',
    policyLabel: 'deepseek.com/privacy',
    policyUrl: 'https://deepseek.com/privacy',
    dataSent: 'Messages, attachments',
  },
  {
    name: 'Perplexity',
    policyLabel: 'perplexity.ai/privacy',
    policyUrl: 'https://perplexity.ai/privacy',
    dataSent: 'Messages, search queries',
  },
  {
    name: 'Moonshot (Kimi)',
    policyLabel: 'moonshot.cn/privacy',
    policyUrl: 'https://moonshot.cn/privacy',
    dataSent: 'Messages',
  },
  {
    name: 'Zhipu (GLM)',
    policyLabel: 'zhipu.ai/privacy',
    policyUrl: 'https://zhipu.ai/privacy',
    dataSent: 'Messages',
  },
  {
    name: 'Mistral',
    policyLabel: 'mistral.ai/privacy-policy',
    policyUrl: 'https://mistral.ai/privacy-policy',
    dataSent: 'Messages',
  },
  {
    name: 'Ollama (Local)',
    policyLabel: 'n/a — runs on your device',
    policyUrl: null,
    dataSent: 'nothing leaves your device',
  },
  {
    name: 'LM Studio (Local)',
    policyLabel: 'n/a — runs on your device',
    policyUrl: null,
    dataSent: 'nothing leaves your device',
  },
  {
    name: 'Custom endpoint',
    policyLabel: "per your endpoint operator's policy",
    policyUrl: null,
    dataSent: "per your endpoint operator's policy",
  },
] as const;

function trackConsentShown() {
  /* analytics.track('byok_consent_modal_shown') */
}
function trackConsentAccepted() {
  /* analytics.track('byok_consent_modal_accepted') */
}
function trackConsentCanceled() {
  /* analytics.track('byok_consent_modal_canceled') */
}

export interface ByokConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export function ByokConsentModal({ visible, onAccept, onCancel }: ByokConsentModalProps) {
  const colors = useThemeColors();
  const shownRef = useRef(false);

  useEffect(() => {
    if (visible && !shownRef.current) {
      shownRef.current = true;
      trackConsentShown();
    }
    if (!visible) {
      shownRef.current = false;
    }
  }, [visible]);

  const handleAccept = () => {
    trackConsentAccepted();
    onAccept();
  };
  const handleCancel = () => {
    trackConsentCanceled();
    onCancel();
  };

  return (
    <Modal
      testID="byok-consent-modal"
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
      accessibilityViewIsModal
    >
      <SafeAreaView
        testID="byok-consent-modal-inner"
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            testID="byok-consent-modal-title"
            style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, flex: 1 }}
          >
            Connecting to AI providers
          </Text>
          <Pressable
            testID="byok-consent-cancel-icon"
            onPress={handleCancel}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            style={{ padding: 4 }}
          >
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            testID="byok-consent-body-p1"
            style={{ fontSize: 15, color: colors.textPrimary, lineHeight: 22, marginBottom: 14 }}
          >
            When you add a provider key (Anthropic, OpenAI, Google, or others), AGI sends your
            prompts, attachments, and conversation content to that provider so they can generate a
            response.
          </Text>
          <Text
            testID="byok-consent-body-p2"
            style={{ fontSize: 15, color: colors.textPrimary, lineHeight: 22, marginBottom: 14 }}
          >
            Each provider stores and processes your data under their own terms. We don't see the
            contents of your messages or attachments when you use your own keys.
          </Text>
          <Text
            testID="byok-consent-body-p3"
            style={{ fontSize: 15, color: colors.textPrimary, lineHeight: 22, marginBottom: 24 }}
          >
            We list every provider you can connect, with a direct link to their privacy policy, on
            the next screen.
          </Text>

          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: 12,
            }}
          >
            Providers &amp; privacy policies
          </Text>

          <View
            testID="byok-consent-provider-table"
            style={{
              borderRadius: 12,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 24,
            }}
          >
            {PROVIDERS.map((provider, index) => (
              <ProviderRow
                key={provider.name}
                provider={provider}
                isLast={index === PROVIDERS.length - 1}
                colors={colors}
              />
            ))}
          </View>

          <Pressable
            testID="byok-consent-agi-privacy-link"
            onPress={() => openExternalUrl('https://agiworkforce.com/privacy')}
            accessibilityRole="link"
            accessibilityLabel="Read the AGI privacy policy"
            style={{ alignItems: 'center', marginBottom: 8 }}
          >
            <Text style={{ fontSize: 13, color: colors.teal }}>Read the AGI privacy policy</Text>
          </Pressable>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Platform.OS === 'android' ? 20 : 8,
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Pressable
            testID="byok-consent-accept-btn"
            onPress={handleAccept}
            accessibilityLabel="I understand and accept"
            accessibilityRole="button"
            style={{
              backgroundColor: colors.teal,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>
              I understand and accept
            </Text>
          </Pressable>
          <Pressable
            testID="byok-consent-cancel-btn"
            onPress={handleCancel}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            style={{ paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

type ProviderEntry = (typeof PROVIDERS)[number];

function ProviderRow({
  provider,
  isLast,
  colors,
}: {
  provider: ProviderEntry;
  isLast: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (!provider.policyUrl) return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.5, duration: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    openExternalUrl(provider.policyUrl);
  };

  return (
    <Animated.View style={{ opacity }}>
      <Pressable
        onPress={provider.policyUrl ? handlePress : undefined}
        accessibilityRole={provider.policyUrl ? 'link' : 'text'}
        accessibilityLabel={
          provider.policyUrl
            ? `${provider.name} privacy policy — ${provider.policyLabel}`
            : `${provider.name} — ${provider.policyLabel}`
        }
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surfaceBase,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1 }}>
            {provider.name}
          </Text>
          {provider.policyUrl && (
            <ExternalLink size={12} color={colors.teal} style={{ marginLeft: 4 }} />
          )}
        </View>
        <Text style={{ fontSize: 12, color: provider.policyUrl ? colors.teal : colors.textMuted }}>
          {provider.policyLabel}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
          {provider.dataSent}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
