import { useState, useRef } from 'react';
import { View, Pressable, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Sparkles, Mic, Smartphone, FolderOpen, Rocket } from 'lucide-react-native';
import { storage } from '@/lib/mmkv';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Slide definitions
// ---------------------------------------------------------------------------

interface Slide {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    title: 'Welcome to AGI Workforce',
    description:
      'Your AI assistant that works across 20+ models from 7 providers. One app, unlimited intelligence.',
  },
  {
    icon: Mic,
    title: 'Talk Naturally',
    description:
      'Full voice conversation mode with push-to-talk, auto-listen, and customizable AI voices.',
  },
  {
    icon: Smartphone,
    title: 'Control from Anywhere',
    description:
      'Pair with your desktop via QR code. Approve agent actions, monitor progress, all from your phone.',
  },
  {
    icon: FolderOpen,
    title: 'Organize with Projects',
    description:
      'Create projects with custom instructions. Your AI adapts its behavior to each context.',
  },
  {
    icon: Rocket,
    title: 'Ready to Go',
    description: "Your AI workforce awaits. Let's start with a conversation.",
  },
];

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const [slide, setSlide] = useState(0);
  const router = useRouter();

  const finish = () => {
    storage.set('onboarding-done', 'true');
    router.replace('/(app)');
  };

  const next = () => {
    if (slide < SLIDES.length - 1) {
      setSlide(slide + 1);
    } else {
      finish();
    }
  };

  const isLastSlide = slide === SLIDES.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-[#0f1012]">
      {/* Skip button — only visible on slides 1-4 */}
      {!isLastSlide && (
        <Pressable
          onPress={finish}
          className="absolute top-4 right-4 p-3 z-10"
          accessibilityLabel="Skip onboarding"
          accessibilityRole="button"
        >
          <Text className="text-white/40 text-sm">Skip</Text>
        </Pressable>
      )}

      {/* Slide content */}
      <Reanimated.View
        key={slide}
        entering={FadeIn.duration(350)}
        exiting={FadeOut.duration(200)}
        className="flex-1 items-center justify-center px-8"
      >
        <SlideContent slide={SLIDES[slide]!} />
      </Reanimated.View>

      {/* Dot indicators */}
      <DotIndicator count={SLIDES.length} active={slide} />

      {/* Action button */}
      <Pressable
        onPress={isLastSlide ? finish : next}
        className="mx-6 mb-8 rounded-2xl bg-teal-500 py-4 items-center active:opacity-90"
        accessibilityLabel={isLastSlide ? 'Get Started' : 'Next slide'}
        accessibilityRole="button"
      >
        <Text className="text-black font-semibold text-base">
          {isLastSlide ? 'Get Started' : 'Next'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Slide content
// ---------------------------------------------------------------------------

function SlideContent({ slide }: { slide: Slide }) {
  const IconComponent = slide.icon;

  return (
    <View className="items-center">
      {/* Icon in teal-tinted circle */}
      <View
        style={{ backgroundColor: 'rgba(33, 128, 141, 0.15)' }}
        className="w-24 h-24 rounded-full items-center justify-center mb-8"
      >
        <IconComponent size={48} color={colors.teal} />
      </View>

      <Text className="text-white text-3xl font-bold text-center mb-4">{slide.title}</Text>

      <Text className="text-white/70 text-base text-center leading-6">{slide.description}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Animated dot indicator
// ---------------------------------------------------------------------------

function DotIndicator({ count, active }: { count: number; active: number }) {
  const widths = useRef(
    Array.from({ length: count }, (_, i) => new Animated.Value(i === 0 ? 1 : 0)),
  ).current;

  // Animate widths whenever active changes
  widths.forEach((anim, i) => {
    Animated.spring(anim, {
      toValue: i === active ? 1 : 0,
      useNativeDriver: false,
      tension: 120,
      friction: 10,
    }).start();
  });

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
