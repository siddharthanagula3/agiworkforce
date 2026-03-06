import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Menu, Plus, Calendar } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScheduleCard } from '@/components/schedules/ScheduleCard';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';

export default function SchedulesScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const { schedules, loading, error, fetchSchedules, toggleSchedule, deleteSchedule, clearError } =
    useScheduleStore();

  const [refreshing, setRefreshing] = useState(false);

  // Initial fetch
  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSchedules();
    } finally {
      setRefreshing(false);
    }
  }, [fetchSchedules]);

  const handleCreate = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/schedules/create');
  }, [hapticsEnabled, router]);

  const handlePress = useCallback(
    (id: string) => {
      router.push({ pathname: '/schedules/create', params: { id } });
    },
    [router],
  );

  const handleToggle = useCallback(
    (id: string) => {
      toggleSchedule(id);
    },
    [toggleSchedule],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const schedule = schedules.find((s) => s.id === id);
      Alert.alert(
        'Delete Schedule',
        `Are you sure you want to delete "${schedule?.name ?? 'this schedule'}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deleteSchedule(id),
          },
        ],
      );
    },
    [schedules, deleteSchedule],
  );

  // Loading skeleton
  if (loading && schedules.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface-base">
        <Header
          onMenuPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
          onCreatePress={handleCreate}
        />
        <View className="px-4 gap-3 mt-2">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="rounded-xl p-4"
              style={{ backgroundColor: colors.surfaceOverlay }}
            >
              <Skeleton width="60%" height={18} className="mb-3" />
              <Skeleton width="100%" height={14} className="mb-2" />
              <Skeleton width="45%" height={12} className="mb-2" />
              <View className="flex-row gap-2">
                <Skeleton width={70} height={18} borderRadius={9999} />
                <Skeleton width={60} height={18} borderRadius={9999} />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <Header
        onMenuPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
        onCreatePress={handleCreate}
      />

      {/* Error banner */}
      {error && (
        <View className="mx-4 mb-3 bg-red-500/10 rounded-lg p-3 flex-row items-center justify-between">
          <Text className="text-sm text-red-400 flex-1">{error}</Text>
          <Pressable onPress={clearError} className="ml-2 p-1">
            <Text className="text-xs text-red-400/70">Dismiss</Text>
          </Pressable>
        </View>
      )}

      {/* Schedule list or empty state */}
      {schedules.length === 0 ? (
        <EmptyState onCreatePress={handleCreate} />
      ) : (
        <FlatList
          data={schedules}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
          renderItem={({ item, index }) => (
            <ScheduleCard
              schedule={item}
              index={index}
              onPress={handlePress}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}
          keyExtractor={(item) => item.id}
        />
      )}

      {/* FAB */}
      {schedules.length > 0 && (
        <Pressable
          onPress={handleCreate}
          className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center shadow-lg active:opacity-80"
          style={{ backgroundColor: colors.teal }}
        >
          <Plus size={24} color={colors.white} />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({
  onMenuPress,
  onCreatePress,
}: {
  onMenuPress: () => void;
  onCreatePress: () => void;
}) {
  return (
    <View className="flex-row items-center px-4 h-12">
      <Pressable onPress={onMenuPress} className="p-2 -ml-2 rounded-lg active:bg-white/5">
        <Menu size={22} color={colors.textSecondary} />
      </Pressable>
      <Text variant="subheading" className="ml-2 flex-1">
        Schedules
      </Text>
      <Pressable
        onPress={onCreatePress}
        className="p-2 rounded-lg active:bg-white/5"
        accessibilityLabel="Create schedule"
      >
        <Plus size={20} color={colors.teal} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ onCreatePress }: { onCreatePress: () => void }) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View
        className="w-20 h-20 rounded-2xl items-center justify-center mb-5"
        style={{ backgroundColor: `${colors.teal}15` }}
      >
        <Calendar size={36} color={colors.teal} />
      </View>

      <Text variant="heading" className="text-center mb-2">
        No Schedules
      </Text>
      <Text className="text-white/50 text-center text-sm mb-8 leading-5">
        Create recurring AI tasks that run on a schedule from your phone.
      </Text>

      <Button
        title="Create Schedule"
        variant="primary"
        size="lg"
        onPress={onCreatePress}
        className="w-full"
      />
    </Animated.View>
  );
}
