import { useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock3, Globe2, ListChecks, X, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { cardRadius, useThemeColors } from '@/src/ui/theme';
import {
  acknowledgeContinuityOnboarding,
  CONTINUITY_COMPLETION_NOTIFICATION_TYPE,
} from './continuity-onboarding';

interface ContinuityBenefit {
  icon: LucideIcon;
  title: string;
  description: string;
}

const BENEFITS: ContinuityBenefit[] = [
  {
    icon: ListChecks,
    title: 'Start and steer tasks from your phone',
    description: 'Send work to Managed Cloud, answer follow-ups, and review results from mobile.',
  },
  {
    icon: Globe2,
    title: 'Check in from any signed-in surface',
    description: 'The same Cloud task is available on your phone, browser, and desktop app.',
  },
  {
    icon: Clock3,
    title: 'Work continues when the app is closed',
    description:
      'Managed Cloud keeps the run alive and a completion notification can deep-link you back to the result.',
  },
];

export default function ContinuityOnboardingScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);

  const rememberDecision = useCallback(() => {
    if (isClerkSignedIn && clerkUserId) {
      acknowledgeContinuityOnboarding(clerkUserId);
    }
  }, [clerkUserId, isClerkSignedIn]);

  const leave = useCallback(() => {
    rememberDecision();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/(tabs)/chat');
    }
  }, [rememberDecision, router]);

  const startTask = useCallback(() => {
    if (!isClerkSignedIn || !clerkUserId) {
      router.push('/(auth)/login');
      return;
    }

    rememberDecision();
    setAppMode('cloud');
    router.replace('/(app)/(tabs)/chat');
  }, [clerkUserId, isClerkSignedIn, rememberDecision, router, setAppMode]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 22,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Close cross-device continuity"
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceHover : colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
            })}
          >
            <X size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', gap: 14, paddingHorizontal: 6 }}>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 5,
              backgroundColor: colors.purpleSurface,
              borderWidth: 1,
              borderColor: colors.purple,
            }}
          >
            <Text
              style={{
                color: colors.purple,
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              Beta
            </Text>
          </View>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.textPrimary,
              fontSize: 34,
              lineHeight: 39,
              fontWeight: '700',
              letterSpacing: -1,
              textAlign: 'center',
            }}
          >
            Keep Cloud work going when you&apos;re on the go
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 16,
              lineHeight: 23,
              textAlign: 'center',
            }}
          >
            Managed Cloud tasks stay attached to your AGI account, so you can leave this device
            without ending the run.
          </Text>
        </View>

        <View
          style={{
            borderRadius: cardRadius,
            borderCurve: 'continuous',
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {BENEFITS.map((benefit, index) => (
            <BenefitRow
              key={benefit.title}
              benefit={benefit}
              isLast={index === BENEFITS.length - 1}
            />
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 12 }} />

        <View style={{ gap: 10 }}>
          <Pressable
            onPress={startTask}
            accessibilityRole="button"
            accessibilityLabel="Start a Managed Cloud task"
            style={({ pressed }) => ({
              minHeight: 52,
              borderRadius: 14,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.teal,
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Text style={{ color: colors.accentText, fontSize: 16, fontWeight: '700' }}>
              Start a task
            </Text>
          </Pressable>
          <Pressable
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: 14,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '600' }}>
              Not now
            </Text>
          </Pressable>
          <Text
            testID="continuity-notification-contract"
            style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' }}
          >
            Completion alerts use the existing {CONTINUITY_COMPLETION_NOTIFICATION_TYPE} Cloud
            notification route.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BenefitRow({ benefit, isLast }: { benefit: ContinuityBenefit; isLast: boolean }) {
  const colors = useThemeColors();
  const Icon = benefit.icon;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${benefit.title}. ${benefit.description}`}
      style={{
        minHeight: 96,
        paddingHorizontal: 16,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 13,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accentSurface,
          borderWidth: 1,
          borderColor: colors.accentBorder,
        }}
      >
        <Icon size={19} color={colors.textPrimary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', lineHeight: 20 }}
        >
          {benefit.title}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          {benefit.description}
        </Text>
      </View>
    </View>
  );
}
