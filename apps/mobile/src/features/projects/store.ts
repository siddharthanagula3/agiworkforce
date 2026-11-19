import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { sha256 } from '@noble/hashes/sha256';
import {
  EncodingType,
  FileSystemUploadType,
  createUploadTask,
  getInfoAsync,
  readAsStringAsync,
} from 'expo-file-system/legacy';
import {
  MANAGED_CLOUD_PROJECT_KNOWLEDGE_PRESIGN_PATH,
  ManagedCloudProjectKnowledgeListResponseSchema,
  PROJECT_KNOWLEDGE_UPLOAD_PROTOCOL_VERSION,
  ManagedCloudProjectKnowledgePresignRequestSchema,
  ManagedCloudProjectKnowledgePresignResponseSchema,
  ManagedCloudProjectKnowledgeRegisterRequestSchema,
  ManagedCloudProjectKnowledgeRegisterResponseSchema,
  managedCloudProjectKnowledgeFilePath,
  managedCloudProjectKnowledgePath,
  managedUploadRequestOptions,
  type ManagedCloudProjectKnowledgeFile,
} from '@agiworkforce/cloud-contracts';
import { validateAttachmentMeta } from '@agiworkforce/types';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { API_URL, TIMEOUTS } from '@/lib/constants';
import { guardedFetch } from '@/lib/egressGuard';
import { api } from '@/services/api';
import { getAuthHeaders } from '@/services/authSession';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  assertCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { markProjectForSync } from '@/services/cloudSyncEngine';

export interface ProjectSource {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uri: string;
  addedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  sources?: ProjectSource[];
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;

  createProject: (name: string, description: string, instructions: string) => string;
  updateProject: (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>) => void;
  deleteProject: (id: string) => void;
  setProjectPinned: (id: string, pinned: boolean) => void;
  setProjectArchived: (id: string, archived: boolean) => void;
  setActiveProject: (id: string | null) => void;
  addSource: (
    projectId: string,
    source: Omit<ProjectSource, 'id' | 'addedAt'>,
    options?: ProjectSourceUploadOptions,
  ) => Promise<void>;
  removeSource: (
    projectId: string,
    sourceId: string,
    accountEpoch?: CloudAccountEpoch | null,
  ) => Promise<void>;
}

function generateLocalId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class ProjectSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectSourceError';
  }
}

export class ProjectSourceCancelledError extends Error {
  constructor(name: string) {
    super(`Adding "${name}" was cancelled.`);
    this.name = 'ProjectSourceCancelledError';
  }
}

export interface ProjectSourceUploadProgress {
  bytesSent: number;
  totalBytes: number;
}

export interface ProjectSourceUploadOptions {
  accountEpoch?: CloudAccountEpoch | null;
  signal?: AbortSignal;
  onProgress?: (progress: ProjectSourceUploadProgress) => void;
}

export type ProjectSourceTarget = 'local' | 'cloud' | 'unknown';

export function resolveProjectSourceTarget(projectId: string): ProjectSourceTarget {
  if (useProjectStore.getState().projects.some((p) => p.id === projectId)) return 'local';
  const isCloud = useCloudProjectStore
    .getState()
    .projects.some((p) => p.id === projectId && p.deletedAt === null);
  return isCloud ? 'cloud' : 'unknown';
}

export function useProjectSourceTarget(projectId: string): ProjectSourceTarget {
  const isLocal = useProjectStore((s) => s.projects.some((p) => p.id === projectId));
  const isCloud = useCloudProjectStore((s) =>
    s.projects.some((p) => p.id === projectId && p.deletedAt === null),
  );
  if (isLocal) return 'local';
  return isCloud ? 'cloud' : 'unknown';
}

const KNOWLEDGE_HASH_CHUNK_BYTES = 3 * 1024 * 1024;

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256HexOfFile(
  uri: string,
  byteCount: number,
  assertCurrent: () => void,
): Promise<string> {
  const hasher = sha256.create();
  for (let offset = 0; offset < byteCount; offset += KNOWLEDGE_HASH_CHUNK_BYTES) {
    assertCurrent();
    const length = Math.min(KNOWLEDGE_HASH_CHUNK_BYTES, byteCount - offset);
    const chunk = await readAsStringAsync(uri, {
      encoding: EncodingType.Base64,
      position: offset,
      length,
    });
    assertCurrent();
    hasher.update(base64ToBytes(chunk));
  }
  return Array.from(hasher.digest())
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function releasePresignedUpload(
  projectId: string,
  storageKey: string,
  accountEpoch: CloudAccountEpoch,
  authHeaders: Record<string, string>,
): Promise<void> {
  if (!isCloudAccountEpochCurrent(accountEpoch) || !authHeaders.Authorization) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUTS.DEFAULT);
  const unsubscribe = subscribeCloudAccountEpochChange(() => {
    if (!isCloudAccountEpochCurrent(accountEpoch)) controller.abort();
  });
  try {
    await guardedFetch(`${API_URL}${MANAGED_CLOUD_PROJECT_KNOWLEDGE_PRESIGN_PATH}`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...authHeaders,
      },
      body: JSON.stringify({ kind: 'knowledge-file', projectId, storageKey }),
    });
  } catch (error) {
    if (__DEV__) console.warn('[projectStore] orphaned knowledge upload cleanup failed:', error);
  } finally {
    clearTimeout(timeout);
    unsubscribe();
  }
}

export const cloudProjectSources = {
  async list(
    projectId: string,
    accountEpoch = captureCloudAccountEpoch(),
  ): Promise<ManagedCloudProjectKnowledgeFile[]> {
    assertCloudAccountEpochCurrent(accountEpoch);
    const response = await api.get<unknown>(managedCloudProjectKnowledgePath(projectId), {
      accountEpoch,
    });
    assertCloudAccountEpochCurrent(accountEpoch);
    return ManagedCloudProjectKnowledgeListResponseSchema.parse(response).files;
  },

  async upload(
    projectId: string,
    source: Omit<ProjectSource, 'id' | 'addedAt'>,
    { signal, onProgress, accountEpoch }: ProjectSourceUploadOptions = {},
  ): Promise<ManagedCloudProjectKnowledgeFile> {
    const account = accountEpoch === undefined ? captureCloudAccountEpoch() : accountEpoch;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const assertCurrent = () => {
      assertCloudAccountEpochCurrent(account);
      if (controller.signal.aborted) throw new ProjectSourceCancelledError(source.name);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const unsubscribe = subscribeCloudAccountEpochChange(() => {
      if (!isCloudAccountEpochCurrent(account)) cancel();
    });
    let storageKey: string | null = null;
    let cleanupHeaders: Record<string, string> = {};
    let registrationDispatched = false;
    let acceptingProgress = true;
    try {
      assertCurrent();
      const info = await getInfoAsync(source.uri);
      assertCurrent();
      if (!info.exists || info.isDirectory) {
        throw new ProjectSourceError(`"${source.name}" could not be read from this device.`);
      }
      const byteCount = info.size || source.size;
      const validation = validateAttachmentMeta(source.name, source.mimeType, byteCount);
      if (!validation.ok) throw new ProjectSourceError(validation.message);

      const checksumSha256 = await sha256HexOfFile(source.uri, byteCount, assertCurrent);
      assertCurrent();
      cleanupHeaders = await getAuthHeaders();
      assertCurrent();
      const requestOptions = { signal: controller.signal, accountEpoch: account };
      const presign = ManagedCloudProjectKnowledgePresignResponseSchema.parse(
        await api.post<unknown>(
          MANAGED_CLOUD_PROJECT_KNOWLEDGE_PRESIGN_PATH,
          ManagedCloudProjectKnowledgePresignRequestSchema.parse({
            kind: 'knowledge-file',
            uploadProtocolVersion: PROJECT_KNOWLEDGE_UPLOAD_PROTOCOL_VERSION,
            projectId,
            fileName: source.name,
            mimeType: source.mimeType,
            byteCount,
            checksumSha256,
          }),
          requestOptions,
        ),
      );
      storageKey = presign.storageKey;
      assertCurrent();
      const uploadUrl = new URL(presign.uploadUrl);
      const uploadOptions = await managedUploadRequestOptions(
        uploadUrl.toString(),
        presign.uploadHeaders,
        {
          baseUrl: API_URL,
          getHeaders: async () => {
            assertCurrent();
            const headers = await getAuthHeaders();
            assertCurrent();
            return headers;
          },
        },
      );
      assertCurrent();
      const task = createUploadTask(
        uploadUrl.toString(),
        source.uri,
        {
          httpMethod: 'PUT',
          uploadType: FileSystemUploadType.BINARY_CONTENT,
          headers: uploadOptions.headers,
        },
        (data) => {
          if (
            !acceptingProgress ||
            controller.signal.aborted ||
            !isCloudAccountEpochCurrent(account)
          )
            return;
          onProgress?.({
            bytesSent: data.totalBytesSent,
            totalBytes: data.totalBytesExpectedToSend,
          });
        },
      );
      const cancelTask = () => {
        void Promise.resolve()
          .then(() => task.cancelAsync())
          .catch(() => undefined);
      };
      controller.signal.addEventListener('abort', cancelTask, { once: true });
      let putResult;
      try {
        assertCurrent();
        putResult = await task.uploadAsync();
      } catch {
        assertCurrent();
        throw new ProjectSourceError(`Uploading "${source.name}" to storage failed. Please retry.`);
      } finally {
        acceptingProgress = false;
        controller.signal.removeEventListener('abort', cancelTask);
      }
      assertCurrent();
      if (!putResult || putResult.status < 200 || putResult.status >= 300) {
        throw new ProjectSourceError(`Uploading "${source.name}" to storage failed. Please retry.`);
      }

      const registration = ManagedCloudProjectKnowledgeRegisterRequestSchema.parse({
        fileName: source.name,
        mimeType: source.mimeType,
        byteCount,
        checksumSha256,
        sourceSurface: 'mobile',
        storageUri: presign.storageKey,
      });
      assertCurrent();
      // A dispatched registration may have committed even when its response is lost.
      registrationDispatched = true;
      const { file } = ManagedCloudProjectKnowledgeRegisterResponseSchema.parse(
        await api.post<unknown>(
          managedCloudProjectKnowledgePath(projectId),
          registration,
          requestOptions,
        ),
      );
      if (
        file.projectId !== projectId ||
        file.fileName !== source.name ||
        file.byteCount !== byteCount ||
        file.checksumSha256.toLowerCase() !== checksumSha256
      ) {
        throw new ProjectSourceError('The server returned mismatched project knowledge metadata.');
      }
      assertCloudAccountEpochCurrent(account);
      return file;
    } catch (error) {
      if (storageKey && !registrationDispatched && isCloudAccountEpochCurrent(account)) {
        await releasePresignedUpload(projectId, storageKey, account, cleanupHeaders);
      }
      assertCloudAccountEpochCurrent(account);
      if (controller.signal.aborted) throw new ProjectSourceCancelledError(source.name);
      throw error;
    } finally {
      acceptingProgress = false;
      unsubscribe();
      signal?.removeEventListener('abort', cancel);
    }
  },

  async remove(
    projectId: string,
    fileId: string,
    accountEpoch = captureCloudAccountEpoch(),
  ): Promise<void> {
    assertCloudAccountEpochCurrent(accountEpoch);
    await api.delete<unknown>(managedCloudProjectKnowledgeFilePath(projectId, fileId), {
      accountEpoch,
    });
    assertCloudAccountEpochCurrent(accountEpoch);
  },
};

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      createProject: (name, description, instructions) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

        if (isCloud) {
          const id = uuidv7();
          const now = new Date().toISOString();
          useCloudProjectStore.getState().upsertCloudProject({
            id,
            name: name.trim(),
            description: description.trim() || null,
            instructions: instructions.trim() || null,
            color: null,
            isArchived: false,
            metadata: null,
            source: 'mobile',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            serverVersion: '0',
          });
          markProjectForSync(id);
          return id;
        }

        const id = generateLocalId();
        const now = new Date().toISOString();
        const project: Project = {
          id,
          name,
          description,
          instructions,
          sources: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          projects: [project, ...state.projects],
        }));
        return id;
      },

      updateProject: (id, updates) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

        if (isCloud) {
          const existing = useCloudProjectStore.getState().projects.find((p) => p.id === id);
          if (existing) {
            useCloudProjectStore.getState().upsertCloudProject({
              ...existing,
              name: updates.name !== undefined ? updates.name : existing.name,
              description:
                updates.description !== undefined
                  ? updates.description || null
                  : existing.description,
              instructions:
                updates.instructions !== undefined
                  ? updates.instructions || null
                  : existing.instructions,
              updatedAt: new Date().toISOString(),
            });
            markProjectForSync(id);
          }
          return;
        }

        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p,
          ),
        }));
      },

      deleteProject: (id) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

        if (isCloud) {
          const existing = useCloudProjectStore.getState().projects.find((p) => p.id === id);
          if (existing) {
            useCloudProjectStore.getState().upsertCloudProject({
              ...existing,
              deletedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            markProjectForSync(id);
          }
          return;
        }

        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      },

      setProjectPinned: (id, pinned) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

        if (isCloud) {
          const existing = useCloudProjectStore.getState().projects.find((p) => p.id === id);
          if (existing && existing.deletedAt === null) {
            useCloudProjectStore.getState().upsertCloudProject({
              ...existing,
              metadata: { ...existing.metadata, starred: pinned },
            });
            markProjectForSync(id);
          }
          return;
        }

        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, pinned } : p)),
        }));
      },

      setProjectArchived: (id, archived) => {
        if (useChatAppModeStore.getState().appMode !== 'cloud') return;
        const existing = useCloudProjectStore.getState().projects.find((p) => p.id === id);
        if (!existing || existing.deletedAt !== null) return;
        useCloudProjectStore.getState().upsertCloudProject({
          ...existing,
          isArchived: archived,
        });
        if (archived && useCloudProjectStore.getState().activeProjectId === id) {
          useCloudProjectStore.getState().setActiveCloudProject(null);
        }
        markProjectForSync(id);
      },

      setActiveProject: (id) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';
        if (id !== null) {
          if (isCloud) {
            const exists = useCloudProjectStore
              .getState()
              .projects.some((p) => p.id === id && p.deletedAt === null);
            if (!exists) return;
            useCloudProjectStore.getState().setActiveCloudProject(id);
            return;
          } else {
            const exists = get().projects.some((p) => p.id === id);
            if (!exists) return;
          }
        }
        if (isCloud) {
          useCloudProjectStore.getState().setActiveCloudProject(null);
        } else {
          set({ activeProjectId: id });
        }
      },

      addSource: async (projectId, source, options) => {
        if (options?.signal?.aborted) throw new ProjectSourceCancelledError(source.name);
        const target = resolveProjectSourceTarget(projectId);
        if (options?.accountEpoch !== undefined) {
          assertCloudAccountEpochCurrent(options.accountEpoch);
          if (target !== 'cloud') {
            throw new ProjectSourceError('This Cloud project is no longer available.');
          }
        }
        if (target === 'cloud') {
          await cloudProjectSources.upload(projectId, source, options);
          return;
        }
        if (target === 'unknown') {
          throw new ProjectSourceError(
            `"${source.name}" was not added because this project is no longer available.`,
          );
        }
        const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const addedAt = new Date().toISOString();
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  sources: [...(p.sources ?? []), { ...source, id: sourceId, addedAt }],
                  updatedAt: addedAt,
                }
              : p,
          ),
        }));
      },

      removeSource: async (projectId, sourceId, accountEpoch) => {
        const target = resolveProjectSourceTarget(projectId);
        if (accountEpoch !== undefined) {
          assertCloudAccountEpochCurrent(accountEpoch);
          if (target !== 'cloud') {
            throw new ProjectSourceError('This Cloud project is no longer available.');
          }
        }
        if (target === 'cloud') {
          await cloudProjectSources.remove(projectId, sourceId, accountEpoch);
          return;
        }
        if (target === 'unknown') {
          throw new ProjectSourceError('This project is no longer available.');
        }
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  sources: (p.sources ?? []).filter((s) => s.id !== sourceId),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        }));
      },
    }),
    {
      name: 'project-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[projectStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useProjectStore, 'projectStore');
