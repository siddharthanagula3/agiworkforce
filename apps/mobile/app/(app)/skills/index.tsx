import { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Zap } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';

/**
 * Skills browser — placeholder screen.
 * Will display 150+ AI skills organized by category in Phase C.
 */
export default function SkillsScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <View className="flex-row items-center px-4 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 -ml-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="text-white ml-2">
          Skills
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-8">
        <View
          className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
          style={{ backgroundColor: `${colors.teal}15` }}
        >
          <Zap size={32} color={colors.teal} />
        </View>
        <Text className="text-[17px] font-semibold text-white text-center mb-2">
          150+ AI Skills
        </Text>
        <Text className="text-[14px] text-center leading-5" style={{ color: colors.textMuted }}>
          Browse AI skills for healthcare, legal, finance, education, and more. Coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
