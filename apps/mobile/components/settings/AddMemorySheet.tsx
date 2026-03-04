import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { colors } from '@/lib/theme';
import type { MemoryEntry } from '@/stores/memoryStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = ['General', 'Coding', 'Research', 'Writing', 'Preferences'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AddMemorySheetProps {
  /** Ref to control open/close from parent */

  sheetRef: React.RefObject<BottomSheet | null>;
  /** If provided, pre-populate fields for editing */
  editingMemory: MemoryEntry | null;
  /** Called when the user saves a new memory */
  onSave: (content: string, category?: string) => void;
  /** Called when the user updates an existing memory */
  onUpdate: (id: string, content: string) => void;
}

export function AddMemorySheet({ sheetRef, editingMemory, onSave, onUpdate }: AddMemorySheetProps) {
  const snapPoints = useMemo(() => ['50%'], []);

  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Pre-populate when editing
  useEffect(() => {
    if (editingMemory) {
      setContent(editingMemory.content);
      setSelectedCategory(editingMemory.category);
    } else {
      setContent('');
      setSelectedCategory(null);
    }
  }, [editingMemory]);

  const isEditing = editingMemory !== null;
  const canSave = content.trim().length > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;

    if (isEditing && editingMemory) {
      onUpdate(editingMemory.id, content.trim());
    } else {
      onSave(content.trim(), selectedCategory ?? undefined);
    }

    // Reset form and close
    setContent('');
    setSelectedCategory(null);
    sheetRef.current?.close();
  }, [canSave, isEditing, editingMemory, content, selectedCategory, onSave, onUpdate, sheetRef]);

  const handleCancel = useCallback(() => {
    setContent('');
    setSelectedCategory(null);
    sheetRef.current?.close();
  }, [sheetRef]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={sheetRef as React.RefObject<BottomSheet>}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surfaceElevated }}
      handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)', width: 36 }}
    >
      <View className="px-4 pt-1 pb-2">
        <Text variant="subheading">{isEditing ? 'Edit Memory' : 'Add Memory'}</Text>
      </View>

      {/* Content input */}
      <View className="px-4 mb-3">
        <TextInput
          className="bg-surface-base border border-white/10 rounded-xl px-3 py-3 text-white text-sm min-h-[120px]"
          placeholder="What should your AI remember?"
          placeholderTextColor="rgba(255,255,255,0.3)"
          multiline
          textAlignVertical="top"
          value={content}
          onChangeText={setContent}
          selectionColor={colors.teal}
          autoCorrect={false}
          maxLength={10_000}
        />
      </View>

      {/* Category picker (only for new memories) */}
      {!isEditing && (
        <View className="px-4 mb-4">
          <Text className="text-xs text-white/50 mb-2">Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory?.toLowerCase() === cat.toLowerCase();
              return (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(isSelected ? null : cat.toLowerCase())}
                  className={`px-3 py-1.5 rounded-full border ${
                    isSelected ? 'border-teal-500/50 bg-teal-500/15' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      isSelected ? 'text-teal-400' : 'text-white/60'
                    }`}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Action buttons */}
      <View className="flex-row gap-3 px-4">
        <Button
          title="Cancel"
          variant="ghost"
          size="md"
          onPress={handleCancel}
          className="flex-1"
        />
        <Button
          title={isEditing ? 'Update' : 'Save'}
          variant="primary"
          size="md"
          onPress={handleSave}
          disabled={!canSave}
          className="flex-1"
        />
      </View>
    </BottomSheet>
  );
}
