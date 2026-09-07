'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SkillDraft } from '@agiworkforce/skills/validation';
import {
  loadSkillsCatalog,
  skillAuthoringCapability,
} from '@features/skills/services/skills-catalog';
import type { SkillEditorDialogProps } from '@features/skills/components/SkillEditorDialog';
import { announceSkillCatalogChanged } from '@shared/events/skill-catalog-events';
import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

const CATALOG_PRELOAD_SECTIONS = ['connectors', 'skills', 'plugins'];

const NEW_SKILL_LABEL = 'New skill';
const SKILL_LOAD_FAILURE = 'Could not load this skill.';
const SKILL_SAVE_FAILURE = 'Could not save this skill.';

type AuthoredSkill = { name: string; description: string };

export interface SkillsDirectoryActions {
  onCreateSkill?: () => void;
  onEditSkill?: (name: string) => void;
  createSkillLabel?: string;
}

export interface SkillsSettingsAdapterParams {
  open: boolean;
  activeSection: string;
  authedHeaders: (base?: Record<string, string>) => Promise<Record<string, string>>;
}

export interface SkillsSettingsAdapterResult {
  directorySkillActions: SkillsDirectoryActions;
  skillEditorProps: SkillEditorDialogProps;
}

export function useSkillsSettingsAdapter({
  open,
  activeSection,
  authedHeaders,
}: SkillsSettingsAdapterParams): SkillsSettingsAdapterResult {
  const [skills, setSkills] = useState<AuthoredSkill[]>([]);
  const [canAuthorSkills, setCanAuthorSkills] = useState(false);

  const loadSkills = useCallback(async (signal?: AbortSignal) => {
    try {
      const catalog = await loadSkillsCatalog();
      if (signal?.aborted) return;
      setCanAuthorSkills(skillAuthoringCapability());
      setSkills(
        catalog.map((skill) => ({ name: skill.name, description: skill.description ?? '' })),
      );
    } catch {
      if (signal?.aborted) return;
      setCanAuthorSkills(false);
      setSkills([]);
    }
  }, []);

  useEffect(() => {
    if (!open || !CATALOG_PRELOAD_SECTIONS.includes(activeSection)) return;
    if (skills.length > 0) return;
    const controller = new AbortController();
    void loadSkills(controller.signal);
    return () => {
      controller.abort();
    };
  }, [open, activeSection, skills.length, loadSkills]);

  const [skillEditorMode, setSkillEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingSkillName, setEditingSkillName] = useState<string | null>(null);
  const [editingSkillBody, setEditingSkillBody] = useState<string | null>(null);
  const [editingSkillBodyLoading, setEditingSkillBodyLoading] = useState(false);
  const [editingSkillBodyError, setEditingSkillBodyError] = useState<string | null>(null);
  const [skillSubmitting, setSkillSubmitting] = useState(false);
  const [skillSubmitError, setSkillSubmitError] = useState<string | null>(null);

  const closeSkillEditor = useCallback(() => {
    setSkillEditorMode(null);
    setEditingSkillName(null);
    setEditingSkillBody(null);
    setEditingSkillBodyError(null);
    setSkillSubmitError(null);
  }, []);

  const onCreateSkill = useCallback(() => {
    setSkillSubmitError(null);
    setEditingSkillName(null);
    setEditingSkillBody(null);
    setEditingSkillBodyError(null);
    setSkillEditorMode('create');
  }, []);

  const editSkill = useCallback(
    (name: string) => {
      setSkillSubmitError(null);
      setEditingSkillName(name);
      setEditingSkillBody(null);
      setEditingSkillBodyError(null);
      setSkillEditorMode('edit');
      setEditingSkillBodyLoading(true);
      void (async () => {
        try {
          const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, {
            credentials: 'include',
            headers: await authedHeaders(),
          });
          if (!res.ok) throw new Error(SKILL_LOAD_FAILURE);
          const body = (await res.json()) as { body: string };
          setEditingSkillBody(body.body);
        } catch (error) {
          setEditingSkillBodyError(toUserMessage(error, SKILL_LOAD_FAILURE));
        } finally {
          setEditingSkillBodyLoading(false);
        }
      })();
    },
    [authedHeaders],
  );

  const submitSkillDraft = useCallback(
    async (draft: SkillDraft) => {
      setSkillSubmitting(true);
      setSkillSubmitError(null);
      try {
        const csrfToken = await getCsrfToken();
        const isEdit = skillEditorMode === 'edit' && editingSkillName !== null;
        const res = await fetch(
          isEdit ? `/api/skills/${encodeURIComponent(editingSkillName)}` : '/api/skills',
          {
            method: isEdit ? 'PUT' : 'POST',
            credentials: 'include',
            headers: await authedHeaders({
              'Content-Type': 'application/json',
              'x-csrf-token': csrfToken,
            }),
            body: JSON.stringify(draft),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? SKILL_SAVE_FAILURE);
        }
        closeSkillEditor();
        setSkills([]);
        announceSkillCatalogChanged();
      } catch (error) {
        setSkillSubmitError(toUserMessage(error, SKILL_SAVE_FAILURE));
      } finally {
        setSkillSubmitting(false);
      }
    },
    [authedHeaders, closeSkillEditor, editingSkillName, skillEditorMode],
  );

  return {
    directorySkillActions: canAuthorSkills
      ? { onCreateSkill, onEditSkill: editSkill, createSkillLabel: NEW_SKILL_LABEL }
      : {},
    skillEditorProps: {
      open: skillEditorMode !== null,
      onOpenChange: (next: boolean) => {
        if (!next) closeSkillEditor();
      },
      mode: skillEditorMode ?? 'create',
      initialSkill:
        skillEditorMode === 'edit' && editingSkillName !== null
          ? {
              name: editingSkillName,
              description:
                skills.find((skill) => skill.name === editingSkillName)?.description ?? '',
              body: editingSkillBody ?? '',
            }
          : null,
      bodyLoading: editingSkillBodyLoading,
      bodyError: editingSkillBodyError,
      submitting: skillSubmitting,
      submitError: skillSubmitError,
      onSubmit: submitSkillDraft,
    },
  };
}
