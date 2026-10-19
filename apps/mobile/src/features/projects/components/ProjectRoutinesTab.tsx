import { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarClock, Plus } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useScheduleStore } from '@/src/features/schedules';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export function ProjectRoutinesTab({ projectId }: { projectId: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const schedules = useScheduleStore((s) => s.schedules);
  const fetchSchedules = useScheduleStore((s) => s.fetchSchedules);
  const routines = useMemo(
    () => schedules.filter((schedule) => schedule.projectId === projectId),
    [projectId, schedules],
  );

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}>
      <PressableBox
        testID="project-new-routine"
        onPress={() => router.push({ pathname: '/(app)/schedules/create', params: { projectId } })}
        accessibilityRole="button"
        accessibilityLabel="New routine in this project"
        style={{
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Plus size={16} color={colors.textPrimary} />
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}>
          New routine
        </Text>
      </PressableBox>
      {routines.length === 0 ? (
        <Text
          testID="project-routines-empty"
          style={{
            color: colors.textSecondary,
            fontSize: typeScale.footnote,
            textAlign: 'center',
            marginTop: 16,
          }}
        >
          Routines you create here run with this project&rsquo;s instructions and files.
        </Text>
      ) : (
        routines.map((routine) => (
          <PressableBox
            key={routine.id}
            onPress={() =>
              router.push({ pathname: '/(app)/schedules/create', params: { id: routine.id } })
            }
            accessibilityRole="button"
            accessibilityLabel={`Open routine ${routine.name}`}
            style={{
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            <CalendarClock size={18} color={colors.textSecondary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontSize: typeScale.body }}
              >
                {routine.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
                {routine.isActive ? 'Active' : 'Paused'}
              </Text>
            </View>
          </PressableBox>
        ))
      )}
    </ScrollView>
  );
}
