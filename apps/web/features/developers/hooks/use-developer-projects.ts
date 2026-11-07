'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getCsrfToken } from '@/lib/client/csrf';
import type { RequestAuthority } from '@/lib/identity/request-authority';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import { toUserMessage } from '@/lib/user-error-message';

import type { DeveloperProject } from '../types';
import { useDeveloperQuery, type DeveloperQueryScope } from './use-developer-query';

export const DEVELOPER_PROJECTS_QUERY_KEY = ['developers', 'projects'] as const;

const PROJECTS_PATH = '/api/developers/projects';

export interface DeveloperProjectDraft {
  name: string;
  monthlyCreditLimit: number | null;
}

export interface ProjectMutationScope {
  readonly request: RequestAuthority;
  readonly organizationId: string | null;
}

export class ProjectMutationRejectedError extends Error {}

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
  scope: ProjectMutationScope,
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  fallback: string,
  expectedProjectId?: string,
): Promise<DeveloperProject> {
  scope.request.assertCurrent();
  const csrfToken = await getCsrfToken();
  scope.request.assertCurrent();
  const response = await scope.request.fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      [MANAGED_CLOUD_ORGANIZATION_HEADER]:
        scope.organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const message = await readDeveloperApiError(response, fallback);
    scope.request.assertCurrent();
    if (response.status >= 400 && response.status < 500) {
      throw new ProjectMutationRejectedError(message);
    }
    throw new Error(message);
  }
  const payload = (await response.json()) as { project?: DeveloperProject } | null;
  scope.request.assertCurrent();
  if (!payload?.project || typeof payload.project.id !== 'string' || !payload.project.id ||
      (expectedProjectId !== undefined && payload.project.id !== expectedProjectId)) {
    throw new Error('The project update receipt could not be confirmed.');
  }
  return payload.project;
}

async function readDeveloperProjects({
  request,
  headers,
}: DeveloperQueryScope): Promise<DeveloperProject[]> {
  const response = await request.fetch(PROJECTS_PATH, { method: 'GET', cache: 'no-store', headers });
  if (!response.ok) {
    throw new Error(await readDeveloperApiError(response, 'Projects could not be loaded.'));
  }
  const payload = (await response.json()) as { projects: DeveloperProject[] };
  return payload.projects;
}

export function useDeveloperProjects() {
  return useDeveloperQuery(DEVELOPER_PROJECTS_QUERY_KEY, readDeveloperProjects);
}

export function useCreateDeveloperProject() {
  const queryClient = useQueryClient();
  return useMutation<DeveloperProject, Error, { scope: ProjectMutationScope; draft: DeveloperProjectDraft }>({
    retry: false,
    mutationFn: ({ scope, draft }) =>
      projectRequest(scope, PROJECTS_PATH, 'POST', draft, 'The project could not be created.'),
    onSuccess: (_project, { scope }) => {
      if (scope.request.isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: DEVELOPER_PROJECTS_QUERY_KEY });
      }
    },
    // The owner-bound control presents failures, not a global mutation toast.
    onError: () => undefined,
  });
}

export function useUpdateDeveloperProject() {
  const queryClient = useQueryClient();
  return useMutation<
    DeveloperProject,
    Error,
    { scope: ProjectMutationScope; projectId: string; patch: Partial<DeveloperProjectDraft> }
  >({
    retry: false,
    mutationFn: ({ scope, projectId, patch }) =>
      projectRequest(
        scope,
        `${PROJECTS_PATH}/${encodeURIComponent(projectId)}`,
        'PATCH',
        patch,
        'The project could not be saved.',
        projectId,
      ),
    onSuccess: (_project, { scope }) => {
      if (scope.request.isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: DEVELOPER_PROJECTS_QUERY_KEY });
      }
    },
    onError: () => undefined,
  });
}

export function useArchiveDeveloperProject() {
  const queryClient = useQueryClient();
  return useMutation<DeveloperProject, Error, { scope: ProjectMutationScope; projectId: string }>({
    retry: false,
    mutationFn: ({ scope, projectId }) =>
      projectRequest(
        scope,
        `${PROJECTS_PATH}/${encodeURIComponent(projectId)}`,
        'DELETE',
        undefined,
        'The project could not be archived.',
        projectId,
      ),
    onSuccess: (_project, { scope }) => {
      if (!scope.request.isCurrent()) return;
      void queryClient.invalidateQueries({ queryKey: DEVELOPER_PROJECTS_QUERY_KEY });
      if (scope.request.isCurrent()) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys() });
      }
    },
    onError: () => undefined,
  });
}
