import { z } from 'zod';

import type { ComposerSendMeta } from '@/features/chat/components/Composer/ChatComposerNew';

export const PROJECT_CHAT_HANDOFF_KEY = 'agi.project.pendingHandoff.v1';

type ProjectChatHandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const ProjectChatHandoffSchema = z.object({
  id: z.string().min(1).max(200),
  userMessageId: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
  content: z.string().trim().min(1).max(100_000),
  projectId: z.string().min(1).max(200),
  attachmentCount: z.number().int().min(0).max(20),
  skillId: z.string().min(1).max(200).optional(),
  meta: z
    .object({
      workMode: z.enum(['chat', 'agiwork']),
      projectId: z.string().min(1).max(200).nullable(),
      webSearchEnabled: z.boolean().optional(),
      thinkingEnabled: z.boolean().optional(),
      codeExecutionEnabled: z.boolean().optional(),
      officeCreationEnabled: z.boolean().optional(),
      researchEnabled: z.boolean().optional(),
      styleInstruction: z.string().max(10_000).optional(),
      skillName: z.string().min(1).max(200).optional(),
      agiWorkGoal: z
        .object({
          goal: z.string().min(1).max(100_000),
          constraints: z.string().max(20_000).optional(),
          deliverable: z.string().max(20_000).optional(),
        })
        .optional(),
    })
    .strict(),
});

type StoredProjectChatHandoff = z.infer<typeof ProjectChatHandoffSchema>;

export interface ProjectChatHandoff extends StoredProjectChatHandoff {
  attachments?: File[];
  attachmentsUnavailable: boolean;
}

const pendingAttachments = new Map<string, File[]>();
const acknowledgedHandoffIds = new Set<string>();

function createHandoffId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `project-handoff-${Date.now()}`;
}

export function saveProjectChatHandoff(
  storage: ProjectChatHandoffStorage,
  input: {
    content: string;
    projectId: string;
    attachments?: File[];
    skillId?: string;
    meta: ComposerSendMeta;
  },
): string {
  const id = createHandoffId();
  const stored = ProjectChatHandoffSchema.parse({
    id,
    userMessageId: crypto.randomUUID(),
    assistantMessageId: crypto.randomUUID(),
    content: input.content,
    projectId: input.projectId,
    attachmentCount: input.attachments?.length ?? 0,
    skillId: input.skillId,
    meta: { ...input.meta, projectId: input.projectId, workMode: 'agiwork' },
  });
  if (input.attachments?.length) pendingAttachments.set(id, [...input.attachments]);
  try {
    storage.setItem(PROJECT_CHAT_HANDOFF_KEY, JSON.stringify(stored));
  } catch (error) {
    pendingAttachments.delete(id);
    throw error;
  }
  return id;
}

export function readProjectChatHandoff(
  storage: ProjectChatHandoffStorage,
  expectedProjectId: string | null,
): ProjectChatHandoff | null {
  if (!expectedProjectId) return null;
  const raw = storage.getItem(PROJECT_CHAT_HANDOFF_KEY);
  if (!raw) return null;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    storage.removeItem(PROJECT_CHAT_HANDOFF_KEY);
    return null;
  }
  const parsed = ProjectChatHandoffSchema.safeParse(parsedJson);
  if (!parsed.success || parsed.data.projectId !== expectedProjectId) {
    if (parsed.success) pendingAttachments.delete(parsed.data.id);
    storage.removeItem(PROJECT_CHAT_HANDOFF_KEY);
    return null;
  }
  if (acknowledgedHandoffIds.has(parsed.data.id)) return null;
  const attachments = pendingAttachments.get(parsed.data.id);
  return {
    ...parsed.data,
    ...(attachments ? { attachments: [...attachments] } : {}),
    attachmentsUnavailable: parsed.data.attachmentCount > 0 && !attachments,
  };
}

export function acknowledgeProjectChatHandoff(
  storage: ProjectChatHandoffStorage,
  handoffId: string,
): void {
  acknowledgedHandoffIds.add(handoffId);
  let raw: string | null = null;
  try {
    raw = storage.getItem(PROJECT_CHAT_HANDOFF_KEY);
  } catch {
    pendingAttachments.delete(handoffId);
    return;
  }
  if (raw) {
    try {
      const parsed = ProjectChatHandoffSchema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.id !== handoffId) return;
    } catch {
      // Malformed storage is safe to remove below.
    }
  }
  try {
    storage.removeItem(PROJECT_CHAT_HANDOFF_KEY);
  } catch {
    // The in-memory tombstone and stable operation IDs keep this fail-safe.
  }
  pendingAttachments.delete(handoffId);
}
