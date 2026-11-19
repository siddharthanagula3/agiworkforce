import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brain, Trash2, X } from 'lucide-react-native';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';
import { PageSheetSafeArea } from '@/src/features/chat/components/ModalSafeArea';
import {
  projectMemoryEntries,
  readProjectMemoryEditLimit,
} from '@/src/features/projects/projectMemory';
import { confirmDelete } from '@/src/features/projects/components/ProjectSettingsScreen';
import { ProjectMemoryEditComposer } from '@/src/features/projects/components/ProjectMemoryEditComposer';
import { syncNow } from '@/services/cloudSyncEngine';
import { useCloudMemoryStore } from '@/stores/memory/cloudMemoryStore';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { useMemorySyncStateStore } from '@/stores/memory/memorySyncStateStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const TAP_AREA = 44;
const FOOTER_MIN_BOTTOM_PADDING = 16;

export function ProjectMemorySheet({
  visible,
  projectId,
  onClose,
  onOpenSettings,
}: {
  visible: boolean;
  projectId: string;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const entries = useCloudMemoryStore((s) => s.entries);
  const memories = useMemo(() => projectMemoryEntries(entries, projectId), [entries, projectId]);
  const syncing = useCloudSyncStateStore((s) => s.status === 'syncing');
  const loadFailed = useCloudSyncStateStore(
    (s) =>
      s.status === 'error' &&
      (s.failedSyncSteps.length === 0 || s.failedSyncSteps.includes('memory')),
  );
  const accountMemoryOff = useMemorySyncStateStore((s) => s.accountMemoryEnabled === false);
  const memorySettingOff = useCloudSettingsStore(
    (s) => s.memoryPolicyInitialized && !s.memoryEnabled,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<{ projectId: string; maxLength: number } | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const loadRunRef = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void readProjectMemoryEditLimit(projectId, controller.signal).then((maxLength) => {
      if (controller.signal.aborted) return;
      setEdit(maxLength === null ? null : { projectId, maxLength });
    });
    return () => controller.abort();
  }, [projectId, visible]);

  const load = useCallback(() => {
    const run = ++loadRunRef.current;
    const finish = () => {
      if (loadRunRef.current === run) setLoading(false);
    };
    setLoading(true);
    void syncNow().then(finish, finish);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setDeleteError(null);
    load();
  }, [load, visible]);

  const runPending = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.();
  }, []);

  const openSettings = useCallback(() => {
    onClose();
    if (Platform.OS === 'ios') {
      pendingRef.current = onOpenSettings;
      return;
    }
    setTimeout(onOpenSettings, 0);
  }, [onClose, onOpenSettings]);

  const empty = memories.length === 0;
  const initialLoad = empty && loading && syncing;
  const editLimit =
    edit?.projectId === projectId && !initialLoad && !(empty && loadFailed) ? edit.maxLength : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={runPending}
      accessibilityViewIsModal
    >
      <PageSheetSafeArea style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: colors.background }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 8,
              minHeight: 56,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Pressable
              testID="project-memory-close"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close memory"
              style={{
                width: TAP_AREA,
                height: TAP_AREA,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceHover,
                }}
              >
                <X size={18} color={colors.textPrimary} />
              </View>
            </Pressable>
            <Text
              variant="subheading"
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              style={{ color: colors.textPrimary }}
            >
              Memory
            </Text>
            <View style={{ width: TAP_AREA }} />
          </View>

          {initialLoad ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <LoadingIndicator accessibilityLabel="Loading memory" />
            </View>
          ) : empty && loadFailed ? (
            <View
              testID="project-memory-error"
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 24,
              }}
            >
              <Text
                accessibilityRole="alert"
                style={{ color: colors.textPrimary, fontSize: typeScale.body, textAlign: 'center' }}
              >
                Memory could not be loaded.
              </Text>
              <Pressable
                testID="project-memory-retry"
                onPress={load}
                accessibilityRole="button"
                accessibilityLabel="Try again"
                style={{
                  minHeight: TAP_AREA,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: colors.teal, fontSize: typeScale.body, fontWeight: '600' }}>
                  Try again
                </Text>
              </Pressable>
            </View>
          ) : empty ? (
            <View
              testID="project-memory-empty"
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 24,
              }}
            >
              <Brain size={32} color={colors.textMuted} />
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.callout,
                  fontWeight: '600',
                  textAlign: 'center',
                }}
              >
                No memory yet
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.subhead,
                  textAlign: 'center',
                }}
              >
                AGI saves what it learns in this project's chats here.
              </Text>
            </View>
          ) : (
            <ScrollView testID="project-memory-list" style={{ flex: 1 }}>
              {memories.map((memory, index) => (
                <View
                  key={memory.id}
                  style={{
                    minHeight: 52,
                    paddingLeft: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    borderBottomWidth: index === memories.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      color: colors.textPrimary,
                      fontSize: typeScale.subhead,
                      lineHeight: 20,
                      paddingVertical: 12,
                    }}
                  >
                    {memory.content}
                  </Text>
                  <Pressable
                    onPress={() => confirmDelete(memory.id, memory.content, setDeleteError)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete project memory: ${memory.content}`}
                    style={{
                      width: TAP_AREA,
                      height: TAP_AREA,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={17} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          {deleteError ? (
            <Text
              accessibilityRole="alert"
              style={{
                color: colors.agentError,
                fontSize: typeScale.footnote,
                paddingHorizontal: 16,
                paddingTop: 8,
              }}
            >
              {deleteError}
            </Text>
          ) : null}

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingBottom:
                Platform.OS === 'ios'
                  ? Math.max(insets.bottom, FOOTER_MIN_BOTTOM_PADDING)
                  : Math.max(FOOTER_MIN_BOTTOM_PADDING - insets.bottom, 0),
            }}
          >
            {editLimit !== null ? (
              <ProjectMemoryEditComposer
                projectId={projectId}
                maxLength={editLimit}
                memoryOff={accountMemoryOff || memorySettingOff}
              />
            ) : null}
            <Pressable
              testID="project-memory-settings"
              onPress={openSettings}
              accessibilityRole="link"
              accessibilityLabel="Memory settings"
              style={{
                alignSelf: 'center',
                minHeight: TAP_AREA,
                paddingHorizontal: 16,
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: colors.teal, fontSize: typeScale.body, fontWeight: '600' }}>
                Memory settings
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </PageSheetSafeArea>
    </Modal>
  );
}
