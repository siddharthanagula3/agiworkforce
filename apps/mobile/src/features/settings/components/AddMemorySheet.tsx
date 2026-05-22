import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, TextInput } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { colors } from '@/src/ui/theme';
import type { MemoryEntry } from '@/src/features/memory/store';

interface AddMemorySheetProps {
  sheetRef: React.RefObject<BottomSheet | null>;
  editingMemory: MemoryEntry | null;
  onSave: (content: string, category?: string) => void;
  onUpdate: (id: string, content: string) => void;
}

export function AddMemorySheet({ sheetRef, editingMemory, onSave, onUpdate }: AddMemorySheetProps) {
  const snapPoints = useMemo(() => ['50%'], []);
  const [content, setContent] = useState('');

  useEffect(() => {
    setContent(editingMemory ? editingMemory.fact : '');
  }, [editingMemory]);

  const isEditing = editingMemory !== null;
  const canSave = content.trim().length > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    if (isEditing && editingMemory) {
      onUpdate(editingMemory.id, content.trim());
    } else {
      onSave(content.trim());
    }
    setContent('');
    sheetRef.current?.close();
  }, [canSave, isEditing, editingMemory, content, onSave, onUpdate, sheetRef]);

  const handleCancel = useCallback(() => {
    setContent('');
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
          accessibilityLabel="Memory content"
          accessibilityHint="Enter what the AI should remember"
        />
      </View>

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
