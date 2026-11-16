import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { syncNow } from '@/services/cloudSyncEngine';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  isStaleCloudAccountOperation,
} from '@/src/features/auth/services/cloudAccountSession';
import { updateCloudProjectDetails } from '@/src/features/projects/service';
import { useProjectStore } from '@/src/features/projects/store';
import { showToast } from '@/src/shared/components/Toast';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useProjectSyncStateStore } from '@/stores/projects/projectSyncStateStore';
import { confirmDiscardChanges } from '@/src/shared/hooks/useUnsavedChangesGuard';
import {
  accountScopedUiStateKey,
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';

export interface EditableProject {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

export type NewProjectMemoryScope = 'default' | 'projectOnly';

const MEMORY_SCOPE_NOT_SAVED_MESSAGE =
  'Project created. Memory setting was not saved; change it in Project settings.';

export interface ProjectEditor {
  visible: boolean;
  editingProject: EditableProject | null;
  isCloud: boolean;
  formName: string;
  setFormName: (value: string) => void;
  formDescription: string;
  setFormDescription: (value: string) => void;
  formInstructions: string;
  setFormInstructions: (value: string) => void;
  selectedTemplateId: string;
  setSelectedTemplateId: (value: string) => void;
  memoryScope: NewProjectMemoryScope;
  setMemoryScope: (value: NewProjectMemoryScope) => void;
  openCreate: () => void;
  openEdit: (project: EditableProject, scope?: AccountScopedUiState | null) => void;
  close: () => void;
  requestClose: () => void;
  save: () => void;
  isScopeCurrent: (scope: AccountScopedUiState | null | undefined) => boolean;
  currentScope: () => AccountScopedUiState | null;
}

interface EditorFields {
  name: string;
  description: string;
  instructions: string;
  templateId: string;
  memoryScope: NewProjectMemoryScope;
}

const EMPTY_FIELDS: EditorFields = {
  name: '',
  description: '',
  instructions: '',
  templateId: 'blank',
  memoryScope: 'default',
};

function isProjectLive(projectId: string): boolean {
  return useCloudProjectStore
    .getState()
    .projects.some((project) => project.id === projectId && project.deletedAt === null);
}

function waitUntilProjectSettled(projectId: string): Promise<void> {
  return new Promise((resolve) => {
    const settled = () =>
      !useProjectSyncStateStore.getState().dirtyProjectIds.includes(projectId) ||
      !isProjectLive(projectId);
    if (settled()) {
      resolve();
      return;
    }
    const release = () => {
      unsubscribeSync();
      unsubscribeProjects();
    };
    const check = () => {
      if (!settled()) return;
      release();
      resolve();
    };
    const unsubscribeSync = useProjectSyncStateStore.subscribe(check);
    const unsubscribeProjects = useCloudProjectStore.subscribe(check);
  });
}

async function applyProjectOnlyMemory(projectId: string): Promise<void> {
  const account = captureCloudAccountEpoch();
  void syncNow().catch(() => undefined);
  try {
    await waitUntilProjectSettled(projectId);
    if (account && !isCloudAccountEpochCurrent(account)) return;
    if (!isProjectLive(projectId)) return;
    await updateCloudProjectDetails(projectId, { usesGlobalMemory: false });
  } catch (error) {
    if (isStaleCloudAccountOperation(error)) return;
    const store = useCloudProjectStore.getState();
    if (store.details[projectId]?.usesGlobalMemory === false) {
      store.patchCloudProjectDetails(projectId, { usesGlobalMemory: true });
    }
    showToast(MEMORY_SCOPE_NOT_SAVED_MESSAGE);
  }
}

export function useProjectEditor(onScopeChange?: () => void): ProjectEditor {
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isCloud = appMode === 'cloud';
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);

  const [visible, setVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<EditableProject | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('blank');
  const [memoryScope, setMemoryScope] = useState<NewProjectMemoryScope>('default');
  const activeScopeRef = useRef<AccountScopedUiState | null>(null);
  const activeScopeKeyRef = useRef<string | null>(null);
  const editorScopeRef = useRef<AccountScopedUiState | null>(null);
  const openedWithRef = useRef<EditorFields>(EMPTY_FIELDS);

  const close = useCallback(() => {
    editorScopeRef.current = null;
    setVisible(false);
    setEditingProject(null);
    setFormName('');
    setFormDescription('');
    setFormInstructions('');
    setSelectedTemplateId('blank');
    setMemoryScope('default');
  }, []);

  useLayoutEffect(() => {
    const nextScope = captureAccountScopedUiState(isCloud ? 'cloud' : 'local');
    const nextKey = accountScopedUiStateKey(nextScope);
    if (activeScopeKeyRef.current !== nextKey) {
      close();
      onScopeChange?.();
    }
    activeScopeRef.current = nextScope;
    activeScopeKeyRef.current = nextKey;
  }, [clerkUserId, close, isCloud, onScopeChange]);

  const isScopeCurrent = useCallback(
    (scope: AccountScopedUiState | null | undefined) =>
      isAccountScopedUiStateCurrent(
        scope,
        useChatAppModeStore.getState().appMode === 'cloud' ? 'cloud' : 'local',
      ),
    [],
  );

  const currentScope = useCallback(() => activeScopeRef.current, []);

  const openCreate = useCallback(() => {
    const scope = activeScopeRef.current;
    if (!isScopeCurrent(scope)) return;
    editorScopeRef.current = scope;
    openedWithRef.current = EMPTY_FIELDS;
    setEditingProject(null);
    setFormName('');
    setFormDescription('');
    setFormInstructions('');
    setSelectedTemplateId('blank');
    setMemoryScope('default');
    setVisible(true);
  }, [isScopeCurrent]);

  const openEdit = useCallback(
    (project: EditableProject, scope = activeScopeRef.current) => {
      if (!isScopeCurrent(scope)) return;
      editorScopeRef.current = scope;
      openedWithRef.current = {
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        templateId: 'blank',
        memoryScope: 'default',
      };
      setEditingProject(project);
      setFormName(project.name);
      setFormDescription(project.description);
      setFormInstructions(project.instructions);
      setSelectedTemplateId('blank');
      setMemoryScope('default');
      setVisible(true);
    },
    [isScopeCurrent],
  );

  const requestClose = useCallback(() => {
    const openedWith = openedWithRef.current;
    const changed =
      formName !== openedWith.name ||
      formDescription !== openedWith.description ||
      formInstructions !== openedWith.instructions ||
      selectedTemplateId !== openedWith.templateId ||
      memoryScope !== openedWith.memoryScope;
    if (changed) {
      confirmDiscardChanges(close);
      return;
    }
    close();
  }, [close, formDescription, formInstructions, formName, memoryScope, selectedTemplateId]);

  const save = useCallback(() => {
    if (!isScopeCurrent(editorScopeRef.current)) {
      close();
      return;
    }
    const trimmedName = formName.trim();
    if (!trimmedName) return;

    if (editingProject) {
      updateProject(editingProject.id, {
        name: trimmedName,
        description: formDescription.trim(),
        instructions: formInstructions.trim(),
      });
    } else {
      const projectId = createProject(trimmedName, formDescription.trim(), formInstructions.trim());
      if (isCloud && memoryScope === 'projectOnly') void applyProjectOnlyMemory(projectId);
    }
    close();
  }, [
    close,
    createProject,
    editingProject,
    formDescription,
    formInstructions,
    formName,
    isCloud,
    isScopeCurrent,
    memoryScope,
    updateProject,
  ]);

  return {
    visible,
    editingProject,
    isCloud,
    formName,
    setFormName,
    formDescription,
    setFormDescription,
    formInstructions,
    setFormInstructions,
    selectedTemplateId,
    setSelectedTemplateId,
    memoryScope,
    setMemoryScope,
    openCreate,
    openEdit,
    close,
    requestClose,
    save,
    isScopeCurrent,
    currentScope,
  };
}
