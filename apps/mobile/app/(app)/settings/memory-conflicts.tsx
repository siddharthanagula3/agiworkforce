import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GitCompareArrows } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useMemoryStore } from '@/src/features/memory/store';
import { ApiHttpError } from '@/services/apiErrors';
import {
  MEMORY_CONFLICT_RULE,
  listMemoryConflicts,
  restoreReplacedMemory,
  type MemoryConflict,
} from '@/src/features/memory/services/memoryConflicts';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const LOAD_FAILED_MESSAGE = 'Could not load replaced memories. Try again later.';
const RESTORE_FAILED_MESSAGE = 'Could not switch back to that memory. Try again.';

function failureMessage(error: unknown, fallback: string): string {
  return error instanceof ApiHttpError && error.message ? error.message : fallback;
}

export default function MemoryConflictsScreen() {
  const colors = useThemeColors();
  const scope = useChatAppModeStore((s) => s.appMode) === 'cloud' ? 'cloud' : 'local';
  const fetchMemories = useMemoryStore((s) => s.fetchMemories);
  const [conflicts, setConflicts] = useState<MemoryConflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setConflicts(await listMemoryConflicts(scope));
      setError(null);
    } catch (caught) {
      setConflicts([]);
      setError(failureMessage(caught, LOAD_FAILED_MESSAGE));
    }
  }, [scope]);

  useEffect(() => {
    setConflicts(null);
    void load();
  }, [load]);

  const restore = useCallback(
    async (conflict: MemoryConflict) => {
      setRestoringId(conflict.id);
      setError(null);
      try {
        await restoreReplacedMemory(scope, conflict.id);
        await Promise.all([load(), fetchMemories()]);
      } catch (caught) {
        setError(failureMessage(caught, RESTORE_FAILED_MESSAGE));
      } finally {
        setRestoringId(null);
      }
    },
    [fetchMemories, load, scope],
  );

  return (
    <SettingsScreenShell title="Replaced memories" backHref="/(app)/settings/memory">
      <SettingsInfo
        title="When memories disagree"
        body={MEMORY_CONFLICT_RULE}
        icon={GitCompareArrows}
      />

      {error ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: colors.agentError,
            fontSize: typeScale.footnote,
            lineHeight: 18,
            marginBottom: 12,
          }}
        >
          {error}
        </Text>
      ) : null}

      {conflicts === null ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ActivityIndicator
            color={colors.textMuted}
            accessibilityLabel="Loading replaced memories"
          />
        </View>
      ) : conflicts.length === 0 ? (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
            lineHeight: 19,
            paddingVertical: 16,
          }}
        >
          No memory has replaced another.
        </Text>
      ) : (
        <SettingsGroup>
          {conflicts.map((conflict, index) => (
            <View
              key={conflict.id}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                gap: 6,
                borderBottomWidth: index === conflicts.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{ color: colors.textPrimary, fontSize: typeScale.subhead, lineHeight: 20 }}
              >
                {`Using: ${conflict.kept}`}
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  lineHeight: 18,
                }}
              >
                {`Replaced: ${conflict.replaced}`}
              </Text>
              <Pressable
                onPress={() => void restore(conflict)}
                disabled={restoringId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Use “${conflict.replaced}” instead`}
                style={{
                  alignSelf: 'flex-start',
                  minHeight: 36,
                  justifyContent: 'center',
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: restoringId !== null && restoringId !== conflict.id ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.footnote,
                    fontWeight: '500',
                  }}
                >
                  {restoringId === conflict.id ? 'Switching…' : 'Use the replaced one instead'}
                </Text>
              </Pressable>
            </View>
          ))}
        </SettingsGroup>
      )}
    </SettingsScreenShell>
  );
}
