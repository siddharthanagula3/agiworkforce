import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';

export interface StartWorkSubmission {
  goal: string;
  constraints: string;
  deliverable: string;
  projectId?: string;
}

interface StartWorkSheetProps {
  visible: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (submission: StartWorkSubmission) => void;
}

export function StartWorkSheet({
  visible,
  submitting,
  error,
  onClose,
  onSubmit,
}: StartWorkSheetProps) {
  const colors = useThemeColors();
  const projects = useCloudProjectStore((state) => state.projects);
  const [goal, setGoal] = useState('');
  const [constraints, setConstraints] = useState('');
  const [deliverable, setDeliverable] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  const selectableProjects = useMemo(
    () => projects.filter((project) => !project.isArchived && project.deletedAt === null),
    [projects],
  );

  const handleClose = useCallback(() => {
    if (submitting) return;
    setGoal('');
    setConstraints('');
    setDeliverable('');
    setProjectId(undefined);
    onClose();
  }, [onClose, submitting]);

  const handleSubmit = useCallback(() => {
    if (submitting || !goal.trim()) return;
    onSubmit({ goal, constraints, deliverable, ...(projectId ? { projectId } : {}) });
  }, [constraints, deliverable, goal, onSubmit, projectId, submitting]);

  const fieldStyle = {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    borderCurve: 'continuous' as const,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 15,
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={{
              minHeight: 52,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close new task"
              hitSlop={8}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={20} color={colors.textSecondary} />
            </Pressable>
            <Text variant="subheading" style={{ flex: 1, color: colors.textPrimary }}>
              New task
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                What should it accomplish?
              </Text>
              <TextInput
                value={goal}
                onChangeText={setGoal}
                multiline
                autoFocus
                editable={!submitting}
                placeholder="Research the top three competitors and write a comparison"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Task objective"
                style={{ ...fieldStyle, minHeight: 110, textAlignVertical: 'top' }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                Constraints (optional)
              </Text>
              <TextInput
                value={constraints}
                onChangeText={setConstraints}
                multiline
                editable={!submitting}
                placeholder="Only public sources, no paid tools"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Task constraints"
                style={{ ...fieldStyle, minHeight: 64, textAlignVertical: 'top' }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                Deliverable (optional)
              </Text>
              <TextInput
                value={deliverable}
                onChangeText={setDeliverable}
                editable={!submitting}
                placeholder="A one-page summary"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Task deliverable"
                style={fieldStyle}
              />
            </View>

            {selectableProjects.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  Project (optional)
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {selectableProjects.map((project) => {
                    const selected = project.id === projectId;
                    return (
                      <Pressable
                        key={project.id}
                        onPress={() => setProjectId(selected ? undefined : project.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Project ${project.name}`}
                        style={{
                          minHeight: 36,
                          paddingHorizontal: 14,
                          justifyContent: 'center',
                          borderRadius: 18,
                          backgroundColor: selected ? colors.textPrimary : colors.surfaceElevated,
                          borderWidth: 1,
                          borderColor: selected ? colors.textPrimary : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? colors.accentText : colors.textSecondary,
                            fontSize: 13,
                            fontWeight: '600',
                          }}
                        >
                          {project.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {error ? (
              <Text selectable style={{ color: colors.agentError, fontSize: 13 }}>
                {error}
              </Text>
            ) : null}

            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
              The task runs on your AGI Cloud account with the tools your plan allows, and pauses
              here for approval when one needs your decision.
            </Text>
          </ScrollView>

          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting || !goal.trim()}
              accessibilityRole="button"
              accessibilityLabel="Start task"
              accessibilityState={{ disabled: submitting || !goal.trim() }}
              style={{
                minHeight: 50,
                borderRadius: 16,
                borderCurve: 'continuous',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: submitting || !goal.trim() ? 0.5 : 1,
                backgroundColor: colors.textPrimary,
              }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.accentText} />
              ) : (
                <Check size={18} color={colors.accentText} />
              )}
              <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 15 }}>
                {submitting ? 'Starting…' : 'Start task'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
