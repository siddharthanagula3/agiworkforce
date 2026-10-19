import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brain } from 'lucide-react-native';
import type { ManagedMemoryCitations } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export function memoryUsedLabel(citations: ManagedMemoryCitations): string {
  return `Memory · ${citations.count}`;
}

export function MemoryUsedChip({ citations }: { citations: ManagedMemoryCitations }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const hidden = citations.count - citations.memories.length;

  return (
    <>
      <Pressable
        testID="memory-used-chip"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Used ${citations.count === 1 ? 'one saved memory' : `${citations.count} saved memories`}. Show which`}
        style={{
          minHeight: 44,
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Brain size={13} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
            {memoryUsedLabel(citations)}
          </Text>
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: colors.scrim }}
        />
        <View
          accessibilityViewIsModal
          testID="memory-used-sheet"
          style={{
            maxHeight: '70%',
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16,
            gap: 12,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ color: colors.textPrimary, fontSize: typeScale.callout, fontWeight: '600' }}
          >
            {memoryUsedLabel(citations)}
          </Text>
          <Text
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 18 }}
          >
            These saved memories were part of what this answer was based on.
          </Text>
          <ScrollView style={{ flexGrow: 0 }}>
            {citations.memories.map((memory) => (
              <Text
                key={memory.id}
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  lineHeight: 21,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                {memory.excerpt}
              </Text>
            ))}
            {hidden > 0 ? (
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typeScale.footnote,
                  paddingVertical: 10,
                }}
              >
                {hidden === 1 ? '1 more memory was used.' : `${hidden} more memories were used.`}
              </Text>
            ) : null}
          </ScrollView>
          <Pressable
            onPress={() => {
              setOpen(false);
              router.push('/(app)/settings/memory');
            }}
            accessibilityRole="button"
            accessibilityLabel="Manage memory"
            style={{
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
            >
              Manage memory
            </Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}
