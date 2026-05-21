import { useCallback, useRef } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Cpu } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { useModelStore } from '@/src/features/model-picker/store';
import { useThemeColors } from '@/src/ui/theme';
import { AUTO_MODES, LOCAL_MODEL_LIST, getDisplayName } from '@/src/features/model-picker/service';

export default function ModelsScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const pickerRef = useRef<BottomSheet>(null);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const favorites = useModelStore((s) => s.favorites);
  const recentModels = useModelStore((s) => s.recentModels);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const openPicker = useCallback(() => {
    pickerRef.current?.snapToIndex(0);
  }, []);

  const resolvedLabel = getDisplayName(selectedModel);
  const selectedAutoMode = AUTO_MODES.find((m) => m.id === selectedModel);
  const selectedLocalModel = LOCAL_MODEL_LIST.find((m) => m.id === selectedModel);
  const selectedDetail =
    selectedAutoMode?.description ?? selectedLocalModel?.detailLabel ?? 'On-device local model';

  const favoriteModels = LOCAL_MODEL_LIST.filter((m) => favorites.includes(m.id)).slice(0, 5);
  const recentModelDefs = recentModels
    .map((id) => LOCAL_MODEL_LIST.find((m) => m.id === id))
    .filter(Boolean)
    .slice(0, 5) as (typeof LOCAL_MODEL_LIST)[number][];

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View
        className="flex-row items-center px-3 h-12"
        style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2" style={{ color: c.textPrimary }}>
          Models
        </Text>
      </View>

      <View className="flex-1 px-4 pt-4 gap-4">
        <Card>
          <Text
            className="text-[11px] uppercase tracking-wider font-semibold mb-3"
            style={{ color: c.textMuted }}
          >
            Active Model
          </Text>
          <Pressable
            onPress={openPicker}
            className="flex-row items-center gap-3 active:bg-white/5 rounded-lg -mx-1 px-1 py-2"
            accessibilityLabel="Change model"
            accessibilityRole="button"
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: `${c.teal}22` }}
            >
              <Cpu size={18} color={c.teal} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-medium" style={{ color: c.textPrimary }}>
                {resolvedLabel}
              </Text>
              <Text className="text-xs mt-0.5" style={{ color: c.textMuted }}>
                {selectedDetail}
              </Text>
            </View>
            <ChevronRight size={16} color={c.textMuted} />
          </Pressable>
        </Card>

        {favoriteModels.length > 0 && (
          <Card>
            <Text
              className="text-[11px] uppercase tracking-wider font-semibold mb-3"
              style={{ color: c.textMuted }}
            >
              Favorites
            </Text>
            {favoriteModels.map((m, idx) => (
              <View key={m.id}>
                {idx > 0 && <Separator />}
                <View className="flex-row items-center justify-between py-2.5">
                  <Text className="text-[14px]" style={{ color: c.textPrimary }}>
                    {m.name}
                  </Text>
                  <Text className="text-xs" style={{ color: c.textMuted }}>
                    {m.runtimeLabel}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {recentModelDefs.length > 0 && (
          <Card>
            <Text
              className="text-[11px] uppercase tracking-wider font-semibold mb-3"
              style={{ color: c.textMuted }}
            >
              Recent
            </Text>
            {recentModelDefs.map((m, idx) => (
              <View key={m.id}>
                {idx > 0 && <Separator />}
                <View className="flex-row items-center justify-between py-2.5">
                  <Text className="text-[14px]" style={{ color: c.textPrimary }}>
                    {m.name}
                  </Text>
                  <Text className="text-xs" style={{ color: c.textMuted }}>
                    {m.runtimeLabel}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        <Pressable
          onPress={openPicker}
          className="rounded-xl items-center py-3.5 active:opacity-80"
          style={{ backgroundColor: `${c.teal}18`, borderWidth: 1, borderColor: `${c.teal}30` }}
          accessibilityLabel="Browse all models"
          accessibilityRole="button"
        >
          <Text className="text-[14px] font-semibold" style={{ color: c.teal }}>
            Browse Local Models
          </Text>
        </Pressable>
      </View>

      <ModelPickerSheet sheetRef={pickerRef} />
    </SafeAreaView>
  );
}
