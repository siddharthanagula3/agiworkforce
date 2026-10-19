import {
  ManagedCloudProjectKnowledgeListResponseSchema,
  ManagedCloudProjectKnowledgeReindexResponseSchema,
  managedCloudProjectKnowledgeFilePath,
  managedCloudProjectKnowledgePath,
  type ManagedCloudProjectKnowledgeFile,
  type ProjectStudioOutput,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import { useOutputFormatStore } from '@/src/features/chat/store/outputFormatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useChatStore } from '@/stores/chatStore';

export async function listNotebookSources(
  projectId: string,
  signal?: AbortSignal,
): Promise<ManagedCloudProjectKnowledgeFile[]> {
  return ManagedCloudProjectKnowledgeListResponseSchema.parse(
    await api.get<unknown>(managedCloudProjectKnowledgePath(projectId), { signal }),
  ).files.filter((file) => !file.deletedAt);
}

export async function reindexNotebookSource(projectId: string, fileId: string) {
  return ManagedCloudProjectKnowledgeReindexResponseSchema.parse(
    await api.post<unknown>(
      `${managedCloudProjectKnowledgeFilePath(projectId, fileId)}/reindex`,
      {},
    ),
  );
}

export function searchNotebookSources(
  files: readonly ManagedCloudProjectKnowledgeFile[],
  query: string,
): ManagedCloudProjectKnowledgeFile[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...files];
  return files.filter((file) => {
    const haystack = `${file.fileName} ${file.summary ?? ''}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function notebookSourceStatus(file: ManagedCloudProjectKnowledgeFile): string {
  const status = file.indexing?.status;
  if (status === 'indexed') return 'Ready';
  if (status === 'failed') return file.indexing?.error ?? 'Could not be read';
  if (status === 'stale') return 'Out of date';
  if (status === 'pending' || status === 'indexing') return 'Reading';
  return 'Ready';
}

export function notebookSourceCanReindex(file: ManagedCloudProjectKnowledgeFile): boolean {
  return file.indexing?.status === 'failed' || file.indexing?.status === 'stale';
}

export async function startStudioOutput({
  projectId,
  output,
}: {
  projectId: string;
  output: ProjectStudioOutput;
}): Promise<string> {
  const { createConversation, sendMessage } = useChatStore.getState();
  const { selectedModel } = useModelStore.getState();
  const formats = useOutputFormatStore.getState();
  if (output.officeFormat) formats.setFormat(output.officeFormat);
  try {
    const conversationId = await createConversation(output.label, projectId);
    const accepted = await sendMessage(conversationId, output.prompt, selectedModel);
    if (!accepted) throw new Error(`Could not start the ${output.label.toLowerCase()}.`);
    return conversationId;
  } catch (error) {
    if (output.officeFormat) useOutputFormatStore.getState().setFormat(null);
    throw error;
  }
}
