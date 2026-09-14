import type {
  ManagedCloudProject,
  ManagedCloudProjectKnowledgeFile,
} from '@agiworkforce/cloud-contracts';

const PROJECT_FAILURE_REASON_MAX_LENGTH = 240;

export function projectTitle(project: ManagedCloudProject): string {
  return project.name.trim() || 'Untitled project';
}

export function projectIcon(project: ManagedCloudProject): string {
  return project.isArchived === true ? 'archive' : 'folder';
}

export function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export function byteLabel(byteCount: number): string {
  if (byteCount < 1_024) return `${byteCount} B`;
  const kilobytes = byteCount / 1_024;
  if (kilobytes < 1_024) return `${Math.round(kilobytes)} KB`;
  return `${(kilobytes / 1_024).toFixed(1)} MB`;
}

export function formatTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
}

export function projectDescription(project: ManagedCloudProject): string {
  const parts: string[] = [];
  if (project.isArchived === true) parts.push('Archived');
  parts.push(countLabel(project.knowledgeFileCount ?? 0, 'file'));
  parts.push(countLabel(project.conversationCount ?? 0, 'chat'));
  if (project.lastUsedAt !== null && project.lastUsedAt !== undefined) {
    parts.push(`last used ${formatTimestamp(project.lastUsedAt)}`);
  }
  return parts.join(' · ');
}

export function projectTooltipLines(project: ManagedCloudProject): string[] {
  const lines = [projectTitle(project), projectDescription(project)];
  const description = project.description?.trim();
  if (description !== undefined && description !== '') lines.push(description);
  const instructions = project.instructions?.trim();
  if (instructions !== undefined && instructions !== '') {
    lines.push(`Instructions: ${instructions}`);
  }
  if (project.defaultModelId !== null && project.defaultModelId !== undefined) {
    lines.push(`Default model: ${project.defaultModelId}`);
  }
  lines.push(`Created ${formatTimestamp(project.createdAt)}`);
  return lines;
}

export function projectContextValue(project: ManagedCloudProject): string {
  return project.isArchived === true ? 'projectArchived' : 'project';
}

export function knowledgeFileLabel(file: ManagedCloudProjectKnowledgeFile): string {
  return file.fileName;
}

export function knowledgeFileDetail(file: ManagedCloudProjectKnowledgeFile): string {
  return [byteLabel(file.byteCount), file.mimeType, `added ${formatTimestamp(file.addedAt)}`].join(
    ' · ',
  );
}

export function projectDeleteConsequence(project: ManagedCloudProject): string {
  return [
    `"${projectTitle(project)}" disappears from the web app, the CLI, mobile and every other client.`,
    `Its ${countLabel(project.knowledgeFileCount ?? 0, 'knowledge file')} are deleted with it and cannot be recovered.`,
    `Its ${countLabel(project.conversationCount ?? 0, 'conversation')} are kept, but they leave the project and lose its instructions and knowledge.`,
  ].join('\n');
}

export function describeProjectFailure(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 401) return 'your AGI Cloud session expired, sign in again';
  if (status === 403) return 'this account cannot manage projects on its current plan';
  if (status === 404) return 'this project no longer exists';
  if (status === 429) return 'AGI Cloud is rate limiting this account, try again shortly';
  const raw = error instanceof Error ? error.message.trim() : String(error).trim();
  if (raw === '') return 'AGI Cloud gave no reason';
  return raw.length <= PROJECT_FAILURE_REASON_MAX_LENGTH
    ? raw
    : `${raw.slice(0, PROJECT_FAILURE_REASON_MAX_LENGTH - 1)}…`;
}

export function isRecoverableProjectFailure(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status !== 403 && status !== 404;
}
