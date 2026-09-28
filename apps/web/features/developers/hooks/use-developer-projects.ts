'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { sendAuthorizedJson } from '@features/auth/step-up-fetch';
import { queryKeys } from '@shared/stores/query-client';
import { toUserMessage } from '@/lib/user-error-message';

import type { DeveloperProject } from '../types';

export const DEVELOPER_PROJECTS_QUERY_KEY = ['developers', 'projects'] as const;

const PROJECTS_PATH = '/api/developers/projects';

export interface DeveloperProjectDraft {
  name: string;
  monthlyCreditLimit: number | null;
}

export async function readDeveloperApiError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: unknown } | string;
  } | null;
  const raw = body?.error;
  const message =
    typeof raw === 'string' ? raw : typeof raw?.message === 'string' ? raw.message : '';
  return toUserMessage(
    Object.assign(new Error(message.trim() || fallback), { status: response.status }),
    fallback,
  );
}

async function projectRequest(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  fallback: string,
): Promise<DeveloperProject> {
  const response = await sendAuthorizedJson(url, { method, body });
  if (!response.ok) throw new Error(await readDeveloperApiError(response, fallback));
  const payload = (await response.json()) as { project: DeveloperProject };
  return payload.project;
}

export function useDeveloperProjects() {
  return useQuery<DeveloperProject[], Error>({
    queryKey: DEVELOPER_PROJECTS_QUERY_KEY,
    queryFn: async () => {
      const response = await sendAuthorizedJson(PROJECTS_PATH, { method: 'GET' });
      if (!response.ok) {
        throw new Error(await readDeveloperApiError(response, 'Projects could not be loaded.'));
      }
      const payload = (await response.json()) as { projects: DeveloperProject[] };
      return payload.projects;
    },
  });
}

export function useCreateDeveloperProject() {
  const queryClient = useQueryClient();
  return useMutation<DeveloperProject, Error, DeveloperProjectDraft>({
    mutationFn: (draft) =>
      projectRequest(PROJECTS_PATH, 'POST', draft, 'The project could not be created.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEVELOPER_PROJECTS_QUERY_KEY }),
  });
}

export function useUpdateDeveloperProject() {
  const queryClient = useQueryClient();
  return useMutation<
    DeveloperProject,
    Error,
    { projectId: string; patch: Partial<DeveloperProjectDraft> }
  >({
    mutationFn: ({ projectId, patch }) =>
      projectRequest(
        `${PROJECTS_PATH}/${encodeURIComponent(projectId)}`,
        'PATCH',
        patch,
        'The project could not be saved.',
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEVELOPER_PROJECTS_QUERY_KEY }),
  });
}

export function useArchiveDeveloperProject() {
  const queryClient = useQueryClient();
  return useMutation<DeveloperProject, Error, string>({
    mutationFn: (projectId) =>
      projectRequest(
        `${PROJECTS_PATH}/${encodeURIComponent(projectId)}`,
        'DELETE',
        undefined,
        'The project could not be archived.',
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: DEVELOPER_PROJECTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys() }),
      ]),
  });
}
