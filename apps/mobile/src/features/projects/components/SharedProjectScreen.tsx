import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { FileText, Users } from 'lucide-react-native';
import type {
  ManagedCloudProject,
  ManagedCloudProjectKnowledgeFile,
} from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { managedCloudProjects } from '@/services/managedCloudProjects';
import { cloudProjectSources } from '@/src/features/projects/store';
import {
  ACCESS_LABELS,
  PROJECT_SHARED_CONTEXT_COPY,
  fetchProjectSharing,
  memberName,
} from '@/src/features/projects/projectSharing';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';

interface SharedProjectView {
  project: ManagedCloudProject;
  ownerName: string | null;
  files: ManagedCloudProjectKnowledgeFile[];
}

export function SharedProjectScreen({ projectId }: { projectId: string }) {
  const colors = useThemeColors();
  const [view, setView] = useState<SharedProjectView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      managedCloudProjects.getProject(projectId, { signal: controller.signal }),
      fetchProjectSharing(controller.signal).catch(() => null),
      cloudProjectSources.list(projectId).catch(() => []),
    ])
      .then(([project, overview, files]) => {
        if (controller.signal.aborted) return;
        const owner = overview?.members.find((member) => member.userId === project.ownerUserId);
        setView({ project, ownerName: owner ? memberName(owner) : null, files });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(toUserMessage(cause, 'This shared project could not be opened.'));
        }
      });
    return () => controller.abort();
  }, [projectId]);

  if (error) {
    return (
      <SettingsScreenShell title="Shared project" backHref="/(app)/(tabs)/projects">
        <SettingsInfo title="Project unavailable" body={error} />
      </SettingsScreenShell>
    );
  }

  if (!view) {
    return (
      <SettingsScreenShell title="Shared project" backHref="/(app)/(tabs)/projects">
        <ActivityIndicator
          accessibilityLabel="Loading shared project"
          color={colors.textSecondary}
        />
      </SettingsScreenShell>
    );
  }

  const { project, ownerName, files } = view;
  const access = project.sharedAccess === 'write' ? ACCESS_LABELS.write : ACCESS_LABELS.read;

  return (
    <SettingsScreenShell
      title="Shared project"
      backHref="/(app)/(tabs)/projects"
      help={{ docId: 'projects', label: 'How projects work' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Users size={18} color={colors.textSecondary} />
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: typeScale.callout,
            fontWeight: '600',
          }}
        >
          {project.name}
        </Text>
      </View>
      <Text
        testID="shared-project-access"
        style={{ color: colors.textMuted, fontSize: typeScale.footnote, marginBottom: 16 }}
      >
        {ownerName ? `Shared with you by ${ownerName} · ${access}` : `Shared with you · ${access}`}
      </Text>

      <SettingsInfo title="What is shared" body={PROJECT_SHARED_CONTEXT_COPY} />

      {project.description?.trim() ? (
        <SettingsInfo title="Description" body={project.description.trim()} />
      ) : null}
      {project.instructions?.trim() ? (
        <SettingsInfo title="Instructions" body={project.instructions.trim()} />
      ) : null}

      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          letterSpacing: 0.7,
          marginBottom: 8,
        }}
      >
        FILES
      </Text>
      {files.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, marginBottom: 24 }}>
          No files in this project.
        </Text>
      ) : (
        <SettingsGroup>
          {files.map((file, index) => (
            <View
              key={file.id}
              style={{
                minHeight: 48,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderBottomWidth: index === files.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <FileText size={16} color={colors.textSecondary} />
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.subhead }}
              >
                {file.fileName}
              </Text>
            </View>
          ))}
        </SettingsGroup>
      )}
    </SettingsScreenShell>
  );
}
