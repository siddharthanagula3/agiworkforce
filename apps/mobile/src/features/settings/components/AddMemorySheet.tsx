import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, TextInput, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { MemoryEntry } from '@/src/features/memory/store';

interface AddMemorySheetProps {
  editingMemory: MemoryEntry | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onSave: (content: string, category?: string) => void;
  onUpdate: (id: string, content: string) => void;
  open: boolean;
  /** Cloud memories sync across devices — "removed from this device" is misleading there. */
  isCloud?: boolean;
}

export function AddMemorySheet({
  editingMemory,
  onClose,
  onDelete,
  onSave,
  onUpdate,
  open,
  isCloud = false,
}: AddMemorySheetProps) {
  const colors = useThemeColors();
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    setContent(editingMemory ? editingMemory.fact : '');
  }, [editingMemory, open]);

  const isEditing = editingMemory !== null;
  const canSave = content.trim().length > 0;

  const handleClose = useCallback(() => {
    setContent('');
    onClose();
  }, [onClose]);

  const handleSave = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed) return;

    if (isEditing && editingMemory) {
      onUpdate(editingMemory.id, trimmed);
    } else {
      onSave(trimmed);
    }

    setContent('');
    onClose();
  }, [content, editingMemory, isEditing, onClose, onSave, onUpdate]);

  const handleDelete = useCallback(() => {
    if (!editingMemory || !onDelete) return;

    Alert.alert(
      'Delete memory?',
      isCloud
        ? 'This removes the memory from your account and every synced device.'
        : 'This removes the memory from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDelete(editingMemory.id);
            setContent('');
            onClose();
          },
        },
      ],
    );
  }, [editingMemory, isCloud, onClose, onDelete]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
      transparent
      visible={open}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close memory editor"
          onPress={handleClose}
          style={{
            backgroundColor: colors.scrim,
            bottom: 0,
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
          }}
        />

        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            paddingBottom: 20,
            paddingHorizontal: 14,
            paddingTop: 10,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              backgroundColor: colors.textMuted,
              borderRadius: 999,
              height: 4,
              marginBottom: 12,
              width: 36,
            }}
          />

          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 16,
              fontWeight: '700',
              marginBottom: 10,
            }}
          >
            {isEditing ? 'Edit Memory' : 'Add Memory'}
          </Text>

          <TextInput
            accessible
            accessibilityHint="Enter what AGI should remember"
            accessibilityLabel="Memory content"
            accessibilityValue={{ text: content }}
            autoCorrect={false}
            maxLength={10_000}
            multiline
            onChangeText={setContent}
            placeholder="What should AGI remember?"
            placeholderTextColor={colors.textMuted}
            returnKeyType="default"
            selectionColor={colors.teal}
            style={{
              backgroundColor: colors.surfaceBase,
              borderColor: colors.border,
              borderRadius: 12,
              borderWidth: 1,
              color: colors.textPrimary,
              fontSize: 14,
              letterSpacing: 0,
              minHeight: 118,
              paddingHorizontal: 12,
              paddingVertical: 12,
              textAlignVertical: 'top',
            }}
            value={content}
          />

          {isEditing && onDelete ? (
            <Pressable
              accessibilityLabel="Delete memory"
              accessibilityRole="button"
              onPress={handleDelete}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: pressed ? colors.dangerBorder : colors.dangerSurface,
                borderColor: colors.dangerBorder,
                borderRadius: 12,
                borderWidth: 1,
                justifyContent: 'center',
                marginTop: 12,
                minHeight: 44,
              })}
            >
              <Text style={{ color: colors.agentError, fontSize: 14, fontWeight: '600' }}>
                Delete Memory
              </Text>
            </Pressable>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <Pressable
              accessibilityLabel="Cancel"
              accessibilityRole="button"
              onPress={handleClose}
              style={{
                alignItems: 'center',
                backgroundColor: colors.surfaceBase,
                borderColor: colors.border,
                borderRadius: 12,
                borderWidth: 1,
                flex: 1,
                justifyContent: 'center',
                minHeight: 44,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={isEditing ? 'Update memory' : 'Save memory'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              onPress={handleSave}
              style={{
                alignItems: 'center',
                backgroundColor: canSave ? colors.textPrimary : colors.surfaceHover,
                borderColor: canSave ? colors.textPrimary : colors.border,
                borderRadius: 12,
                borderWidth: 1,
                flex: 1,
                justifyContent: 'center',
                minHeight: 44,
                opacity: canSave ? 1 : 0.72,
              }}
            >
              <Text
                style={{
                  color: canSave ? colors.surfaceElevated : colors.textMuted,
                  fontSize: 14,
                  fontWeight: '600',
                }}
              >
                {isEditing ? 'Update' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
