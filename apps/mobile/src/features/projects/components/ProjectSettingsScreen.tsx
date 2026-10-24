import { useCallback, useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { Brain, Palette, Trash2, UserRound, Users } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  SettingsGroup,
  SettingsInfo,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/Common';
import {
  updateCloudProjectDetails,
  type CloudProjectDetailsPatch,
} from '@/src/features/projects/service';
import {
  addProjectMemory,
  deleteProjectMemory,
  projectMemoryEntries,
} from '@/src/features/projects/projectMemory';
import { ProjectMembersSection } from '@/src/features/projects/components/ProjectMembersSection';
import { PROJECT_SHARED_CONTEXT_COPY } from '@/src/features/projects/projectSharing';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useCloudMemoryStore } from '@/stores/memory/cloudMemoryStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';

const MEMORY_MAX_CHARS = 500;

export const PROJECT_MEMORY_SCOPE_COPY = {
  global:
    'Chats here draw on what has been remembered account-wide, and anything learned here stays in this project.',
  projectOnly:
    'Chats here use only this project’s memories. Nothing from your other chats is included.',
} as const;

function SectionLabel({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: typeScale.caption,
        fontWeight: '700',
        letterSpacing: 0.7,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

function Footnote({ children, testID }: { children: string; testID?: string }) {
  const colors = useThemeColors();
  return (
    <Text
      testID={testID}
      style={{
        color: colors.textMuted,
        fontSize: typeScale.footnote,
        lineHeight: 18,
        marginTop: -16,
        marginBottom: 24,
      }}
    >
      {children}
    </Text>
  );
}

export function ProjectSettingsScreen({ projectId }: { projectId: string }) {
  const colors = useThemeColors();
  const project = useCloudProjectStore((s) =>
    s.projects.find((entry) => entry.id === projectId && entry.deletedAt === null),
  );
  const details = useCloudProjectStore((s) => s.details[projectId]);
  const memoryEntries = useCloudMemoryStore((s) => s.entries);
  const memories = useMemo(
    () => projectMemoryEntries(memoryEntries, projectId),
    [memoryEntries, projectId],
  );
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const usesGlobalMemory = details?.usesGlobalMemory !== false;
  const usesAccountInstructions = details?.usesAccountInstructions !== false;
  const usesAccountStyle = details?.usesAccountStyle !== false;
  const projectName = project?.name ?? 'Project';

  const applyPatch = useCallback(
    (patch: CloudProjectDetailsPatch) => {
      setError(null);
      void updateCloudProjectDetails(projectId, patch).catch((cause: unknown) => {
        setError(toUserMessage(cause, 'Could not save that change. It has been undone.'));
      });
    },
    [projectId],
  );

  const addMemory = useCallback(() => {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    void addProjectMemory({ projectId, projectName, content })
      .then((outcome) => {
        setDraft('');
        if (outcome === 'kept_existing') {
          setNotice('A saved memory already covers this, so it was kept instead.');
        } else if (outcome === 'merged') {
          setNotice('Merged with a memory this project already had.');
        }
      })
      .catch((cause: unknown) => {
        setError(toUserMessage(cause, 'Could not save this memory. Try again.'));
      })
      .finally(() => setSaving(false));
  }, [draft, projectId, projectName, saving]);

  const confirmDelete = useCallback((id: string, content: string) => {
    Alert.alert(
      'Delete this project memory?',
      `Chats in this project stop using “${content}”. It cannot be restored and would have to be added again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete memory',
          style: 'destructive',
          onPress: () => {
            setError(null);
            void deleteProjectMemory(id).catch((cause: unknown) => {
              setError(toUserMessage(cause, 'Could not delete this memory. Try again.'));
            });
          },
        },
      ],
    );
  }, []);

  if (!project) {
    return (
      <SettingsScreenShell title="Project settings" backHref="/(app)/(tabs)/projects">
        <SettingsInfo
          title="Project unavailable"
          body="This project is not in your Cloud account on this device. Open Projects and pick it again."
        />
      </SettingsScreenShell>
    );
  }

  const canSave = draft.trim().length > 0 && !saving;

  return (
    <SettingsScreenShell
      title="Project settings"
      backHref={`/(app)/projects/${projectId}`}
      help={{ docId: 'projects', label: 'How projects work' }}
    >
      <Text
        accessibilityRole="header"
        numberOfLines={2}
        style={{
          color: colors.textPrimary,
          fontSize: typeScale.callout,
          fontWeight: '600',
          marginBottom: 16,
        }}
      >
        {projectName}
      </Text>

      {details?.isOrgShared ? (
        <SettingsInfo
          testID="project-settings-shared-context"
          title="What members can see"
          body={PROJECT_SHARED_CONTEXT_COPY}
          icon={Users}
        />
      ) : null}

      <SectionLabel>SHARING</SectionLabel>
      <ProjectMembersSection projectId={projectId} projectName={projectName} />

      <SectionLabel>PERSONALIZATION</SectionLabel>
      <SettingsGroup>
        <SettingsSwitchRow
          testID="project-settings-account-instructions"
          label="Use your profile and instructions"
          description="Your name, work and Instructions for AGI from Settings."
          icon={UserRound}
          value={usesAccountInstructions}
          onValueChange={(value) => applyPatch({ usesAccountInstructions: value })}
        />
        <SettingsSwitchRow
          testID="project-settings-account-style"
          label="Use your response style"
          description="The style, length and language you chose in Settings."
          icon={Palette}
          value={usesAccountStyle}
          onValueChange={(value) => applyPatch({ usesAccountStyle: value })}
          isLast
        />
      </SettingsGroup>

      <SectionLabel>MEMORY</SectionLabel>
      <SettingsGroup>
        <SettingsSwitchRow
          testID="project-settings-global-memory"
          label="Use memories from outside"
          description="Off keeps this project to its own memories."
          icon={Brain}
          value={usesGlobalMemory}
          onValueChange={(value) => applyPatch({ usesGlobalMemory: value })}
          isLast
        />
      </SettingsGroup>
      <Footnote testID="project-settings-memory-scope">
        {usesGlobalMemory
          ? PROJECT_MEMORY_SCOPE_COPY.global
          : PROJECT_MEMORY_SCOPE_COPY.projectOnly}
      </Footnote>

      <SectionLabel>PROJECT MEMORIES</SectionLabel>
      {memories.length === 0 ? (
        <Text
          testID="project-settings-memories-empty"
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
            lineHeight: 18,
            marginBottom: 12,
          }}
        >
          No memories that only this project uses yet.
        </Text>
      ) : (
        <SettingsGroup>
          <View accessibilityLabel="Project memories">
            {memories.map((memory, index) => (
              <View
                key={memory.id}
                style={{
                  minHeight: 52,
                  paddingLeft: 14,
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
                  onPress={() => confirmDelete(memory.id, memory.content)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete project memory: ${memory.content}`}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={17} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        </SettingsGroup>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput
          testID="project-settings-memory-input"
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            if (error) setError(null);
            if (notice) setNotice(null);
          }}
          onSubmitEditing={addMemory}
          placeholder="e.g. This project targets the EU market."
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Add a memory only this project uses"
          editable={!saving}
          maxLength={MEMORY_MAX_CHARS}
          returnKeyType="done"
          style={{
            flex: 1,
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            fontSize: typeScale.body,
          }}
        />
        <Pressable
          testID="project-settings-memory-add"
          onPress={addMemory}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel="Add project memory"
          accessibilityState={{ disabled: !canSave, busy: saving }}
          style={{
            minHeight: 44,
            minWidth: 64,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canSave ? 1 : 0.55,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
            Add
          </Text>
        </Pressable>
      </View>

      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 18 }}
        >
          {error}
        </Text>
      ) : notice ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 18 }}
        >
          {notice}
        </Text>
      ) : null}
    </SettingsScreenShell>
  );
}
