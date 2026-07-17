/**
 * Project context service · loads a conversation's project scope into the LLM
 * request (web "AGI Work" / project-scoped chats).
 *
 * Mechanics only (service-layer rule): the caller (request-processor) owns the
 * policy of WHEN to load (conversation has a non-null project_id) and how to
 * handle failure. Loading is owner-guarded: the project row must belong to the
 * requesting user or no context is returned.
 *
 * Capability honesty: `project_knowledge_files` stores METADATA ONLY
 * (file_name, mime_type, summary, storage_uri) — there is no server-readable
 * content column — so the injected context is the project's instructions +
 * description + a knowledge-file MANIFEST (names and summaries). Do not claim
 * file contents here until a real content/extraction pipeline exists.
 */

import type { ChatCompletionRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';

/** Minimal query surface shared by the user-scoped and chat Neon db handles. */
export interface ProjectContextDb {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface ProjectContext {
  projectId: string;
  name: string;
  description: string | null;
  instructions: string | null;
  knowledgeFiles: Array<{ fileName: string; summary: string | null }>;
}

// Deterministic size caps so a pathological project can never blow up the
// prompt budget: instructions dominate (they are the product feature), the
// manifest is a bounded index.
const MAX_INSTRUCTIONS_CHARS = 8_000;
const MAX_DESCRIPTION_CHARS = 1_000;
const MAX_KNOWLEDGE_FILES = 20;
const MAX_FILE_SUMMARY_CHARS = 300;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Load the project context for an owned project. Returns null when the project
 * does not exist, is archived, or belongs to a different user — the caller
 * proceeds without context in all three cases.
 */
export async function loadProjectContext(
  db: ProjectContextDb,
  params: { projectId: string; userId: string },
): Promise<ProjectContext | null> {
  const [project] = await db.query<{
    id: string;
    name: string;
    description: string | null;
    instructions: string | null;
  }>(
    `select id, name, description, instructions
       from user_projects
      where id = $1 and user_id = $2 and is_archived = false
      limit 1`,
    [params.projectId, params.userId],
  );
  if (!project) return null;

  const files = await db.query<{ file_name: string; summary: string | null }>(
    `select file_name, summary
       from project_knowledge_files
      where project_id = $1 and deleted_at is null
      order by added_at desc
      limit ${MAX_KNOWLEDGE_FILES}`,
    [params.projectId],
  );

  return {
    projectId: project.id,
    name: project.name,
    description: project.description,
    instructions: project.instructions,
    knowledgeFiles: files.map((f) => ({ fileName: f.file_name, summary: f.summary })),
  };
}

/**
 * Render the project context as a system-prompt block. Pure and exported for
 * unit tests. Returns null when the project carries nothing worth injecting
 * (no instructions, no description, no files) so callers skip the turn cost.
 */
export function formatProjectSystemPrompt(context: ProjectContext): string | null {
  const sections: string[] = [];

  sections.push(`You are working inside the user's project "${truncate(context.name, 200)}".`);

  if (context.description?.trim()) {
    sections.push(
      `Project description: ${truncate(context.description.trim(), MAX_DESCRIPTION_CHARS)}`,
    );
  }

  if (context.instructions?.trim()) {
    sections.push(
      `Project instructions (set by the user; follow them for every reply in this project):\n${truncate(
        context.instructions.trim(),
        MAX_INSTRUCTIONS_CHARS,
      )}`,
    );
  }

  if (context.knowledgeFiles.length > 0) {
    const manifest = context.knowledgeFiles
      .map((f) => {
        const summary = f.summary?.trim()
          ? ` — ${truncate(f.summary.trim(), MAX_FILE_SUMMARY_CHARS)}`
          : '';
        return `- ${truncate(f.fileName, 200)}${summary}`;
      })
      .join('\n');
    sections.push(
      `Project knowledge files (metadata only — file contents are not attached to this conversation; if the user asks about a file's contents, say you can only see its name/summary and ask them to paste or attach the relevant part):\n${manifest}`,
    );
  }

  // Only the bare "working inside project X" line → nothing actionable to
  // inject; skip so unscoped-feeling projects don't spend prompt tokens.
  if (sections.length === 1) return null;

  return sections.join('\n\n');
}

/**
 * Mutates chatRequest in place: merges the project block into the leading
 * system message, or prepends one. Mirrors applyResearchMode's contract; when
 * both apply, research stays first (it is mode framing) and project context
 * follows before the caller's own system content.
 */
export function applyProjectContext(chatRequest: ChatCompletionRequest, prompt: string): void {
  const firstMessage = chatRequest.messages[0];
  if (firstMessage?.role === 'system' && typeof firstMessage.content === 'string') {
    firstMessage.content = `${prompt}\n\n${firstMessage.content}`;
  } else {
    chatRequest.messages.unshift({ role: 'system', content: prompt });
  }
}
