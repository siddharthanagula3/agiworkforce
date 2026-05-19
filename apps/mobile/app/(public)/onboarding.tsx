import { useState, useRef, useEffect } from 'react';
import { View, Pressable, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Sparkles, Cpu, Smartphone, Monitor, ArrowLeftRight } from 'lucide-react-native';
import { storage } from '@/lib/mmkv';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';
import type { ColorScheme } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Slide definitions — 3 screens per spec
// ---------------------------------------------------------------------------

interface Slide {
  icon: React.ComponentType<{ size: number; color: string }>;
  secondaryIcon?: React.ComponentType<{ size: number; color: string }>;
  title: string;
  subtitle: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    title: 'AGI Workforce',
    subtitle: 'Beyond one model. Beyond one surface. AGI in your hands.',
    description: '',
  },
  {
    icon: Cpu,
    title: 'Every AI model, one app',
    subtitle: '',
    description: 'Claude, GPT, Gemini, Grok, DeepSeek & more. 10+ providers.',
  },
  {
    icon: Smartphone,
    secondaryIcon: Monitor,
    title: 'Control your desktop from your phone',
    subtitle: '',
    description: 'Assign tasks, approve actions, get results. All from your pocket.',
  },
];

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const [slide, setSlide] = useState(0);
  const router = useRouter();

  const finish = () => {
    storage.set('onboarding-done', 'true');
    router.replace({ pathname: '/(auth)/login' as const });
  };

  const signIn = () => {
    storage.set('onboarding-done', 'true');
    router.replace({ pathname: '/(auth)/login' as const });
  };

  const next = () => {
    if (slide < SLIDES.length - 1) {
      setSlide(slide + 1);
    } else {
      finish();
    }
  };

  const isFirstSlide = slide === 0;
  const isLastSlide = slide === SLIDES.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-[#0f1012]">
      {/* Slide content */}
      <Reanimated.View
        key={slide}
        entering={FadeIn.duration(350)}
        exiting={FadeOut.duration(200)}
        className="flex-1 items-center justify-center px-8"
      >
        <SlideContent slide={SLIDES[slide]!} colors={colors} />
      </Reanimated.View>

      {/* Dot indicators */}
      <DotIndicator count={SLIDES.length} active={slide} colors={colors} />

      {/* Action buttons */}
      <View className="mx-6 mb-8 gap-3">
        {/* Primary button */}
        <Pressable
          onPress={isLastSlide ? finish : next}
          className="rounded-2xl bg-teal-500 py-4 items-center active:opacity-90"
          accessibilityLabel={isLastSlide || isFirstSlide ? 'Get Started' : 'Next'}
          accessibilityRole="button"
        >
          <Text className="text-black font-semibold text-base">
            {isLastSlide || isFirstSlide ? 'Get Started' : 'Next'}
          </Text>
        </Pressable>

        {/* Sign In link — only on first screen */}
        {isFirstSlide && (
          <Pressable
            onPress={signIn}
            className="py-3 items-center active:opacity-70"
            accessibilityLabel="Sign in to existing account"
            accessibilityRole="button"
          >
            <Text className="text-white/60 text-sm">Sign In</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Slide content
// ---------------------------------------------------------------------------

function SlideContent({ slide, colors }: { slide: Slide; colors: ColorScheme }) {
  const IconComponent = slide.icon;
  const SecondaryIcon = slide.secondaryIcon;

  return (
    <View className="items-center">
      {/* Icon in teal-tinted circle */}
      <View
        style={{ backgroundColor: 'rgba(33, 128, 141, 0.15)' }}
        className="w-24 h-24 rounded-full items-center justify-center mb-8"
      >
        {SecondaryIcon ? (
          <View className="flex-row items-center gap-2">
            <IconComponent size={28} color={colors.teal} />
            <ArrowLeftRight size={20} color={colors.teal} />
            <SecondaryIcon size={28} color={colors.teal} />
          </View>
        ) : (
          <IconComponent size={48} color={colors.teal} />
        )}
      </View>

      <Text className="text-white text-3xl font-bold text-center mb-4">{slide.title}</Text>

      {slide.subtitle ? (
        <Text className="text-white/70 text-base text-center leading-6">{slide.subtitle}</Text>
      ) : null}

      {slide.description ? (
        <Text className="text-white/50 text-base text-center leading-6 mt-2">
          {slide.description}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Animated dot indicator
// ---------------------------------------------------------------------------

function DotIndicator({
  count,
  active,
  colors,
}: {
  count: number;
  active: number;
  colors: ColorScheme;
}) {
  const widths = useRef(
    Array.from({ length: count }, (_, i) => new Animated.Value(i === 0 ? 1 : 0)),
  ).current;

  // Animate widths whenever active changes
  useEffect(() => {
    const animations = widths.map((anim, i) =>
      Animated.spring(anim, {
        toValue: i === active ? 1 : 0,
        useNativeDriver: false,
        tension: 120,
        friction: 10,
      }),
    );
    animations.forEach((a) => a.start());
    return () => {
      animations.forEach((a) => a.stop());
    };
  }, [active, widths]);

  return (
    <View className="flex-row justify-center gap-2 pb-4">
      {widths.map((anim, i) => {
        const width = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 24],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.2, 1],
        });
        return (
          <Animated.View
            key={i}
            style={{ width, opacity, backgroundColor: colors.teal }}
            className="h-2 rounded-full"
          />
        );
      })}
    </View>
  );
}
