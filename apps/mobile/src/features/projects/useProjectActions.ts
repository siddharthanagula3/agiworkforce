import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { showToast } from '@/src/shared/components/Toast';
import type {
  ConversationMenuAction,
  ConversationMenuState,
} from '@/src/features/conversation-actions';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { isCloudProjectPinned } from '@/src/features/projects/projectList';
import type { EditableProject } from '@/src/features/projects/useProjectEditor';

export interface ProjectActionOptions {
  variant?: 'list' | 'page';
  onRemoved?: () => void;
}

export interface ProjectActions {
  openActions: (projectId: string, options?: ProjectActionOptions) => void;
  menu: ConversationMenuState;
}

interface OpenMenu {
  title: string;
  actions: ConversationMenuAction[];
}

export function useProjectActions(
  onRename: (project: EditableProject, scope: AccountScopedUiState) => void,
): ProjectActions {
  const router = useRouter();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isCloud = appMode === 'cloud';
  const localProjects = useProjectStore((s) => s.projects);
  const localActiveId = useProjectStore((s) => s.activeProjectId);
  const cloudProjects = useCloudProjectStore((s) => s.projects);
  const cloudActiveId = useCloudProjectStore((s) => s.activeProjectId);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setProjectPinned = useProjectStore((s) => s.setProjectPinned);
  const setProjectArchived = useProjectStore((s) => s.setProjectArchived);
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null);

  const openActions = useCallback(
    (projectId: string, options: ProjectActionOptions = {}) => {
      const ownership = captureAccountScopedUiState(isCloud ? 'cloud' : 'local');
      if (!ownership) return;
      const mode = isCloud ? 'cloud' : 'local';
      const guard = (run: () => void) => () => {
        if (!isAccountScopedUiStateCurrent(ownership, useChatAppModeStore.getState().appMode)) {
          return;
        }
        run();
      };

      const found = isCloud
        ? cloudProjects.find((p) => p.id === projectId && p.deletedAt === null)
        : localProjects.find((p) => p.id === projectId);
      if (!found) return;
      const archived = 'isArchived' in found && found.isArchived;
      const pinned = 'metadata' in found ? isCloudProjectPinned(found) : found.pinned === true;
      const isActive = projectId === (isCloud ? cloudActiveId : localActiveId);
      const editable: EditableProject = {
        id: found.id,
        name: found.name,
        description: found.description ?? '',
        instructions: found.instructions ?? '',
      };

      const actions: ConversationMenuAction[] = [];

      if (options.variant !== 'page') {
        actions.push({
          key: 'open',
          label: 'Open',
          run: guard(() =>
            router.push({ pathname: '/(app)/projects/[id]', params: { id: projectId } }),
          ),
        });
        if (!archived) {
          actions.push({
            key: 'active',
            label: isActive ? 'Clear active' : 'Set active',
            run: guard(() => setActiveProject(isActive ? null : projectId)),
          });
        }
      }

      if (!archived) {
        actions.push({
          key: 'pin',
          label: pinned ? 'Unpin' : 'Pin',
          run: guard(() => {
            setProjectPinned(projectId, !pinned);
            showToast(pinned ? 'Project unpinned' : 'Project pinned');
          }),
        });
      }

      actions.push({
        key: 'rename',
        label: 'Rename',
        run: guard(() => onRename(editable, ownership)),
      });

      if (mode === 'cloud') {
        actions.push(
          archived
            ? {
                key: 'archive',
                label: 'Restore',
                run: guard(() => {
                  setProjectArchived(projectId, false);
                  showToast('Project restored');
                }),
              }
            : {
                key: 'archive',
                label: 'Archive',
                run: guard(() => {
                  setProjectArchived(projectId, true);
                  showToast('Project archived', {
                    label: 'Undo',
                    onPress: guard(() => setProjectArchived(projectId, false)),
                  });
                  options.onRemoved?.();
                }),
              },
        );
      }

      actions.push({
        key: 'delete',
        label: 'Delete',
        destructive: true,
        run: guard(() =>
          Alert.alert(
            'Delete project?',
            mode === 'cloud'
              ? `"${found.name}" is removed from all your devices. It cannot be restored from the app.`
              : `"${found.name}" is deleted from this device. It cannot be restored.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: guard(() => {
                  deleteProject(projectId);
                  options.onRemoved?.();
                }),
              },
            ],
          ),
        ),
      });

      setOpenMenu({ title: found.name, actions });
    },
    [
      cloudActiveId,
      cloudProjects,
      deleteProject,
      isCloud,
      localActiveId,
      localProjects,
      onRename,
      router,
      setActiveProject,
      setProjectArchived,
      setProjectPinned,
    ],
  );

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  const menu = useMemo<ConversationMenuState>(
    () => ({
      visible: openMenu !== null,
      title: openMenu?.title ?? '',
      actions: openMenu?.actions ?? [],
      close: closeMenu,
    }),
    [closeMenu, openMenu],
  );

  return { openActions, menu };
}
