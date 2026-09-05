'use client';

import { z } from 'zod';
import {
  CLOUD_CODE_NETWORK_ACCESS,
  CLOUD_CODE_SESSION_STATES,
  NOTEBOOK_CELL_OUTPUT_KINDS,
  type NotebookCellLanguage,
} from '@agiworkforce/types';
import { getCsrfToken as getBrowserCsrfToken } from '@/lib/client/csrf';

export class NotebookApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'NotebookApiError';
  }
}

const sessionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  repositoryUrl: z.string().nullable(),
  repositoryBranch: z.string().nullable().default(null),
  networkAccess: z.enum(CLOUD_CODE_NETWORK_ACCESS),
  runtimeId: z.string().nullable().default(null),
  extraHosts: z.array(z.string()).default([]),
  state: z.enum(CLOUD_CODE_SESSION_STATES),
  workspacePath: z.string(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
});

const outputSchema = z.object({
  kind: z.enum(NOTEBOOK_CELL_OUTPUT_KINDS),
  data: z.string(),
});

const executeSchema = z.object({
  session: sessionSchema,
  ok: z.boolean(),
  outputs: z.array(outputSchema),
  error: z.string().optional(),
});

const fileSchema = z.object({
  path: z.string(),
  name: z.string(),
  isDir: z.boolean(),
  byteSize: z.number(),
});

const listFilesSchema = z.object({ session: sessionSchema, files: z.array(fileSchema) });
const uploadSchema = z.object({ session: sessionSchema, file: fileSchema });

export type NotebookCellExecuteResult = z.infer<typeof executeSchema>;
export type NotebookFile = z.infer<typeof fileSchema>;
export type NotebookListFilesResult = z.infer<typeof listFilesSchema>;
export type NotebookUploadResult = z.infer<typeof uploadSchema>;

export interface NotebookApiDependencies {
  fetchImpl?: typeof fetch;
  getCsrfToken?: () => Promise<string>;
}

export interface NotebookApi {
  execute(
    sessionId: string,
    input: { code: string; language: NotebookCellLanguage },
    signal?: AbortSignal,
  ): Promise<NotebookCellExecuteResult>;
  listFiles(sessionId: string, signal?: AbortSignal): Promise<NotebookListFilesResult>;
  uploadFile(
    sessionId: string,
    file: File,
    path: string,
    signal?: AbortSignal,
  ): Promise<NotebookUploadResult>;
  downloadUrl(sessionId: string, path: string): string;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiError(body: unknown, status: number): NotebookApiError {
  // A rate limit carries no detail the reader can act on beyond the status
  // itself, so the server's own wording is dropped here rather than shown
  // verbatim: a bare "HTTP 429" message is machine-shaped, which routes
  // toUserMessage through the shared httpStatusMessage ladder instead of the
  // "own words win" branch, landing on the same copy Library shows for a 429.
  if (status === 429) return new NotebookApiError(`HTTP ${status}`, status);
  const parsed = z
    .object({
      error: z
        .union([
          z.string(),
          z.object({ code: z.string().optional(), message: z.string().optional() }),
        ])
        .optional(),
      message: z.string().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return new NotebookApiError(`Request failed (${status}).`, status);
  const nested = typeof parsed.data.error === 'object' ? parsed.data.error : undefined;
  const message =
    nested?.message ??
    (typeof parsed.data.error === 'string' ? parsed.data.error : undefined) ??
    parsed.data.message ??
    `Request failed (${status}).`;
  return new NotebookApiError(message, status, nested?.code);
}

export function createNotebookApi(dependencies: NotebookApiDependencies = {}): NotebookApi {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const getCsrfToken = dependencies.getCsrfToken ?? getBrowserCsrfToken;

  async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(path, { credentials: 'include', ...init });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new NotebookApiError(
        'Could not reach managed Code. Check your connection and retry.',
        0,
      );
    }
    const body = await responseBody(response);
    if (!response.ok) throw apiError(body, response.status);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new NotebookApiError('Managed Code returned an invalid response.', 502);
    }
    return parsed.data;
  }

  return {
    async execute(sessionId, input, signal) {
      return request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}/notebook/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': await getCsrfToken() },
          body: JSON.stringify(input),
          signal,
        },
        executeSchema,
      );
    },
    async listFiles(sessionId, signal) {
      return request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}/notebook/files`,
        { signal },
        listFilesSchema,
      );
    },
    async uploadFile(sessionId, file, path, signal) {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('path', path);
      return request(
        `/api/code/sessions/${encodeURIComponent(sessionId)}/notebook/files`,
        {
          method: 'POST',
          headers: { 'x-csrf-token': await getCsrfToken() },
          body: formData,
          signal,
        },
        uploadSchema,
      );
    },
    downloadUrl(sessionId, path) {
      const encodedPath = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      return `/api/code/sessions/${encodeURIComponent(sessionId)}/notebook/files/${encodedPath}`;
    },
  };
}

export const notebookApi = createNotebookApi();
