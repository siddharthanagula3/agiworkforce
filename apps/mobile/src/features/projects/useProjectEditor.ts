import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import { useProjectStore } from '@/src/features/projects/store';
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
  openCreate: () => void;
  openEdit: (project: EditableProject, scope?: AccountScopedUiState | null) => void;
  close: () => void;
  save: () => void;
  isScopeCurrent: (scope: AccountScopedUiState | null | undefined) => boolean;
  currentScope: () => AccountScopedUiState | null;
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
  const activeScopeRef = useRef<AccountScopedUiState | null>(null);
  const activeScopeKeyRef = useRef<string | null>(null);
  const editorScopeRef = useRef<AccountScopedUiState | null>(null);

  const close = useCallback(() => {
    editorScopeRef.current = null;
    setVisible(false);
    setEditingProject(null);
    setFormName('');
    setFormDescription('');
    setFormInstructions('');
    setSelectedTemplateId('blank');
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
    setEditingProject(null);
    setFormName('');
    setFormDescription('');
    setFormInstructions('');
    setSelectedTemplateId('blank');
    setVisible(true);
  }, [isScopeCurrent]);

  const openEdit = useCallback(
    (project: EditableProject, scope = activeScopeRef.current) => {
      if (!isScopeCurrent(scope)) return;
      editorScopeRef.current = scope;
      setEditingProject(project);
      setFormName(project.name);
      setFormDescription(project.description);
      setFormInstructions(project.instructions);
      setSelectedTemplateId('blank');
      setVisible(true);
    },
    [isScopeCurrent],
  );

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
      createProject(trimmedName, formDescription.trim(), formInstructions.trim());
    }
    close();
  }, [
    close,
    createProject,
    editingProject,
    formDescription,
    formInstructions,
    formName,
    isScopeCurrent,
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
    openCreate,
    openEdit,
    close,
    save,
    isScopeCurrent,
    currentScope,
  };
}
