import { useCallback } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Zap, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';

const SKILL_CATEGORIES = [
  { id: 'productivity', label: 'Productivity', description: 'Writing, summarizing, scheduling' },
  { id: 'coding', label: 'Coding', description: 'Code review, debugging, generation' },
  { id: 'research', label: 'Research', description: 'Web search, synthesis, citations' },
  { id: 'data', label: 'Data Analysis', description: 'Charts, statistics, insights' },
  { id: 'legal', label: 'Legal', description: 'Contract review, compliance checks' },
  { id: 'healthcare', label: 'Healthcare', description: 'Medical literature, protocols' },
  { id: 'finance', label: 'Finance', description: 'Market analysis, financial modeling' },
  { id: 'education', label: 'Education', description: 'Tutoring, lesson plans, quizzes' },
];

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
        <View className="flex-row items-center gap-2 ml-2">
          <Zap size={18} color={colors.teal} />
          <Text variant="subheading" className="text-white">
            Skills
          </Text>
        </View>
      </View>

      <View className="px-4 pb-3">
        <Text className="text-[13px]" style={{ color: colors.textMuted }}>
          150+ AI skills across 8 domains. Tap a category to explore.
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40, gap: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {SKILL_CATEGORIES.map((cat) => (
          <Pressable
            key={cat.id}
            className="flex-row items-center justify-between px-4 py-3.5 rounded-xl active:opacity-80"
            style={{ backgroundColor: colors.surfaceElevated }}
            accessibilityLabel={cat.label}
            accessibilityRole="button"
          >
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-white">{cat.label}</Text>
              <Text className="text-[12px] mt-0.5" style={{ color: colors.textMuted }}>
                {cat.description}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
