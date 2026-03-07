import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { storage } from '@/lib/mmkv';
import { Text } from '@/components/ui/text';

const SLIDES = [
  {
    title: 'Your AI Agent',
    subtitle: 'Chat with any AI model — Claude, GPT-4, Gemini, and more.',
    emoji: '🤖',
  },
  {
    title: 'Any Tool',
    subtitle: 'Search the web, run code, automate your desktop — all from your phone.',
    emoji: '⚡',
  },
  {
    title: 'Full Control',
    subtitle: 'Approve or deny every agent action. Your AI, your rules.',
    emoji: '🔐',
  },
];

export default function OnboardingScreen() {
  const [slide, setSlide] = useState(0);
  const router = useRouter();

  const finish = () => {
    storage.set('onboarding-done', 'true');
    router.replace('/(app)');
  };

  const next = () => {
    if (slide < SLIDES.length - 1) setSlide(slide + 1);
    else finish();
  };

  const current = SLIDES[slide]!;

  return (
    <SafeAreaView className="flex-1 bg-[#0f1012]">
      <Pressable onPress={finish} className="absolute top-4 right-4 p-3">
        <Text className="text-white/40 text-sm">Skip</Text>
      </Pressable>
      <View className="flex-1 items-center justify-center px-8">
        <Text style={{ fontSize: 80 }}>{current.emoji}</Text>
        <Text className="text-white text-3xl font-bold text-center mt-6">{current.title}</Text>
        <Text className="text-white/50 text-base text-center mt-3 leading-6">
          {current.subtitle}
        </Text>
      </View>
      {/* Dots */}
      <View className="flex-row justify-center gap-2 pb-4">
        {SLIDES.map((_, i) => (
          <View
            key={i}
            className={`h-2 rounded-full ${i === slide ? 'w-6 bg-teal-400' : 'w-2 bg-white/20'}`}
          />
        ))}
      </View>
      <Pressable
        onPress={next}
        className="mx-6 mb-8 rounded-2xl bg-teal-500 py-4 items-center active:opacity-90"
      >
        <Text className="text-black font-semibold text-base">
          {slide === SLIDES.length - 1 ? 'Get Started' : 'Next'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}
