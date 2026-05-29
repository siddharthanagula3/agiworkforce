/**
 * Multi-Agent Chat Database Service
 *
 * Comprehensive database operations for multi-agent conversations including:
 * - Conversation CRUD operations
 * - Participant management
 * - Message persistence with participants
 * - Batch operations for performance
 * - Transaction support
 */

import { getNeonDb } from '@/lib/server/neon-db';
import { MultiAgentChatError } from '@shared/types/multi-agent-chat';
import type {
  MultiAgentConversation,
  MultiAgentConversationInsert,
  MultiAgentConversationUpdate,
  AgentCollaboration,
  ConversationParticipant,
  ConversationParticipantInsert,
  ConversationParticipantUpdate,
  ConversationMetadata,
  ConversationMetadataInsert,
  ConversationMetadataUpdate,
  ConversationWithParticipants,
  ConversationWithDetails,
  CreateConversationRequest,
  AddParticipantRequest,
  ConversationListFilters,
  ConversationStats,
} from '@shared/types/multi-agent-chat';

const db = getNeonDb();

// =============================================
// CONVERSATION OPERATIONS
// =============================================

/**
 * Creates a new multi-agent conversation
 */
export async function createConversation(
  userId: string,
  request: CreateConversationRequest,
): Promise<ConversationWithParticipants> {
  try {
    // Start a transaction by creating conversation first
    const conversationData = {
      user_id: userId,
      title: request.title || null,
      description: request.description || null,
      conversation_type: request.conversation_type || 'multi_agent',
      orchestration_mode: request.orchestration_mode || 'automatic',
      collaboration_strategy: request.collaboration_strategy || 'parallel',
      max_agents: request.max_agents || 10,
      metadata: request.metadata || {},
      tags: request.tags || [],
      status: 'active',
    } as MultiAgentConversationInsert;

    const convRows = await db.query<MultiAgentConversation>(
      `INSERT INTO multi_agent_conversations
         (user_id, title, description, conversation_type, orchestration_mode,
          collaboration_strategy, max_agents, metadata, tags, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        conversationData.user_id,
        conversationData.title,
        conversationData.description,
        conversationData.conversation_type,
        conversationData.orchestration_mode,
        conversationData.collaboration_strategy,
        conversationData.max_agents,
        JSON.stringify(conversationData.metadata ?? {}),
        conversationData.tags,
        conversationData.status,
      ],
    );

    const conversation = convRows[0] ?? null;

    if (!conversation) {
      throw new MultiAgentChatError(
        'Failed to create conversation: No data returned',
        'CONVERSATION_CREATE_ERROR',
        null,
      );
    }

    // Create metadata record
    const metadataData = {
      conversation_id: conversation.id,
      user_id: userId,
      ui_settings: {},
    } as ConversationMetadataInsert;

    try {
      await db.execute(
        'insert into conversation_metadata (conversation_id, user_id, ui_settings) values ($1, $2, $3)',
        [
          metadataData.conversation_id,
          metadataData.user_id,
          JSON.stringify(metadataData.ui_settings ?? {}),
        ],
      );
    } catch (metaError) {
      console.error('Failed to create conversation metadata:', metaError);
      // Don't fail the conversation creation for metadata error
    }

    // Add initial participants if provided
    let participants: ConversationParticipant[] = [];
    if (request.initial_participants && request.initial_participants.length > 0) {
      participants = await addParticipantsBatch(conversation.id, request.initial_participants);
    }

    return {
      ...conversation,
      participants,
    };
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error creating conversation',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Gets a conversation by ID with participants
 */
export async function getConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationWithParticipants | null> {
  try {
    const convRows = await db.query<MultiAgentConversation>(
      'SELECT * FROM multi_agent_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId],
    );

    const conversation = convRows[0] ?? null;

    if (!conversation) {
      return null;
    }

    // Get participants
    let participants: ConversationParticipant[] = [];
    try {
      participants = await db.query<ConversationParticipant>(
        'SELECT * FROM conversation_participants WHERE conversation_id = $1 ORDER BY joined_at ASC',
        [conversationId],
      );
    } catch (partError) {
      console.error('Failed to fetch participants:', partError);
    }

    return {
      ...conversation,
      participants,
    };
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error fetching conversation',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Gets conversation with full details (participants, collaborations, metadata)
 */
export async function getConversationWithDetails(
  conversationId: string,
  userId: string,
): Promise<ConversationWithDetails | null> {
  try {
    // Get base conversation
    const conversation = await getConversation(conversationId, userId);
    if (!conversation) {
      return null;
    }

    // Get collaborations
    let collaborations: AgentCollaboration[] = [];
    try {
      collaborations = await db.query<AgentCollaboration>(
        'SELECT * FROM agent_collaborations WHERE conversation_id = $1 ORDER BY started_at DESC',
        [conversationId],
      );
    } catch (collabError) {
      console.error('Failed to fetch collaborations:', collabError);
    }

    // Get metadata
    let metadata: ConversationMetadata | null = null;
    try {
      const metaRows = await db.query<ConversationMetadata>(
        'SELECT * FROM conversation_metadata WHERE conversation_id = $1',
        [conversationId],
      );
      metadata = metaRows[0] ?? null;
    } catch (metaError) {
      console.error('Failed to fetch metadata:', metaError);
    }

    // Get message count from web_messages table
    let messageCount = 0;
    try {
      const countRows = await db.query<{ count: string }>(
        'SELECT COUNT(*)::int AS count FROM web_messages WHERE session_id = $1',
        [conversationId],
      );
      messageCount = Number(countRows[0]?.count ?? 0);
    } catch (countError) {
      console.error('Failed to count messages:', countError);
    }

    return {
      ...conversation,
      collaborations: collaborations || [],
      metadata: metadata || ({} as ConversationMetadata),
      message_count: messageCount,
    };
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error fetching conversation details',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Lists conversations with filters and pagination
 */
export async function listConversations(
  userId: string,
  filters: ConversationListFilters = {},
): Promise<{ conversations: ConversationWithParticipants[]; total: number }> {
  try {
    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    let paramIdx = 2;

    // Apply filters
    if (filters.status && filters.status.length > 0) {
      conditions.push(`status = ANY($${paramIdx})`);
      params.push(filters.status);
      paramIdx++;
    }

    if (filters.conversation_type && filters.conversation_type.length > 0) {
      conditions.push(`conversation_type = ANY($${paramIdx})`);
      params.push(filters.conversation_type);
      paramIdx++;
    }

    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`tags @> $${paramIdx}::text[]`);
      params.push(filters.tags);
      paramIdx++;
    }

    if (filters.search_query) {
      // Escape LIKE wildcards — single-quote escaping is handled by parameterization
      const sanitized = filters.search_query.replace(/[%_\\]/g, '\\$&');
      const pattern = `%${sanitized}%`;
      conditions.push(`(title ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`);
      params.push(pattern);
      paramIdx++;
    }

    // Apply metadata filters (requires join - simplified approach)
    if (filters.is_archived !== undefined || filters.is_pinned !== undefined) {
      // This is a simplified approach - ideally use a view or complex query
      console.warn('Archived/pinned filters require metadata join - not implemented in this query');
    }

    if (filters.date_from) {
      conditions.push(`created_at >= $${paramIdx}`);
      params.push(filters.date_from);
      paramIdx++;
    }

    if (filters.date_to) {
      conditions.push(`created_at <= $${paramIdx}`);
      params.push(filters.date_to);
      paramIdx++;
    }

    // Pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const whereClause = conditions.join(' AND ');

    // Use COUNT(*) OVER() to get total without a second round-trip
    const sql = `
      SELECT *, COUNT(*) OVER() AS total_count
      FROM multi_agent_conversations
      WHERE ${whereClause}
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    params.push(limit, offset);

    type ConvRow = MultiAgentConversation & { total_count: string };
    const rows = await db.query<ConvRow>(sql, params);

    if (rows === undefined) {
      throw new MultiAgentChatError(
        'Failed to list conversations',
        'CONVERSATION_LIST_ERROR',
        null,
      );
    }

    const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;
    const conversations = rows as MultiAgentConversation[];

    // Batch fetch participants for all conversations
    const conversationIds = conversations.map((c) => c.id);
    let participantsMap: Record<string, ConversationParticipant[]> = {};

    if (conversationIds.length > 0) {
      try {
        const allParticipants = await db.query<ConversationParticipant>(
          'SELECT * FROM conversation_participants WHERE conversation_id = ANY($1)',
          [conversationIds],
        );

        // Group participants by conversation_id
        participantsMap = (allParticipants || []).reduce(
          (
            acc: Record<string, ConversationParticipant[]>,
            participant: ConversationParticipant,
          ) => {
            const convId = (participant as unknown as Record<string, unknown>)[
              'conversation_id'
            ] as string;
            if (!acc[convId]) {
              acc[convId] = [];
            }
            acc[convId]!.push(participant);
            return acc;
          },
          {} as Record<string, ConversationParticipant[]>,
        );
      } catch (partError) {
        console.error('Failed to fetch participants:', partError);
      }
    }

    const conversationsWithParticipants: ConversationWithParticipants[] = conversations.map(
      (conv) => ({
        ...(conv as unknown as ConversationWithParticipants),
        participants: participantsMap[conv.id] || [],
      }),
    );

    return {
      conversations: conversationsWithParticipants,
      total,
    };
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error listing conversations',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

// Allowed column names for dynamic UPDATE in updateConversation
const ALLOWED_CONVERSATION_UPDATE_COLUMNS = new Set([
  'title',
  'description',
  'conversation_type',
  'orchestration_mode',
  'collaboration_strategy',
  'max_agents',
  'metadata',
  'tags',
  'status',
  'started_at',
  'completed_at',
  'last_message_at',
  'total_messages',
  'total_tokens',
  'total_cost',
]);

/**
 * Updates a conversation
 */
export async function updateConversation(
  conversationId: string,
  userId: string,
  updates: MultiAgentConversationUpdate,
): Promise<MultiAgentConversation> {
  try {
    const entries = Object.entries(updates).filter(([key]) => {
      if (!ALLOWED_CONVERSATION_UPDATE_COLUMNS.has(key)) {
        console.warn(`updateConversation: ignoring unknown column "${key}"`);
        return false;
      }
      return true;
    });

    if (entries.length === 0) {
      throw new MultiAgentChatError('No valid fields to update', 'CONVERSATION_UPDATE_ERROR', null);
    }

    const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);
    values.push(conversationId, userId);
    const idParam = entries.length + 1;
    const userParam = entries.length + 2;

    const rows = await db.query<MultiAgentConversation>(
      `UPDATE multi_agent_conversations SET ${setClauses} WHERE id = $${idParam} AND user_id = $${userParam} RETURNING *`,
      values,
    );

    const data = rows[0] ?? null;

    if (!data) {
      throw new MultiAgentChatError(
        'Conversation not found or you do not have permission to update it',
        'CONVERSATION_NOT_FOUND',
        null,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error updating conversation',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Deletes a conversation (cascade deletes participants, collaborations, metadata)
 */
export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  try {
    await db.execute('DELETE FROM multi_agent_conversations WHERE id = $1 AND user_id = $2', [
      conversationId,
      userId,
    ]);
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error deleting conversation',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

// =============================================
// PARTICIPANT OPERATIONS
// =============================================

/**
 * Adds a participant to a conversation
 */
export async function addParticipant(
  conversationId: string,
  request: AddParticipantRequest,
): Promise<ConversationParticipant> {
  try {
    const participantData = {
      conversation_id: conversationId,
      employee_id: request.employee_id,
      employee_name: request.employee_name,
      employee_role: request.employee_role,
      employee_provider: request.employee_provider,
      participant_role: request.participant_role || 'collaborator',
      status: 'active',
      capabilities: request.capabilities || [],
      tools_available: request.tools_available || [],
    } as ConversationParticipantInsert;

    let rows: ConversationParticipant[];
    try {
      rows = await db.query<ConversationParticipant>(
        `INSERT INTO conversation_participants
           (conversation_id, employee_id, employee_name, employee_role, employee_provider,
            participant_role, status, capabilities, tools_available)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          participantData.conversation_id,
          participantData.employee_id,
          participantData.employee_name,
          participantData.employee_role,
          participantData.employee_provider,
          participantData.participant_role,
          participantData.status,
          participantData.capabilities,
          participantData.tools_available,
        ],
      );
    } catch (insertError) {
      if ((insertError as { code?: string })?.code === '23505') {
        // Unique constraint violation
        throw new MultiAgentChatError(
          'Participant already exists in conversation',
          'PARTICIPANT_ALREADY_EXISTS',
          insertError,
        );
      }
      throw new MultiAgentChatError(
        'Failed to add participant',
        'PARTICIPANT_ADD_ERROR',
        insertError,
      );
    }

    const data = rows[0] ?? null;

    if (!data) {
      throw new MultiAgentChatError(
        'Failed to add participant: No data returned',
        'PARTICIPANT_ADD_ERROR',
        null,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError('Unexpected error adding participant', 'UNEXPECTED_ERROR', error);
  }
}

/**
 * Adds multiple participants in batch
 */
export async function addParticipantsBatch(
  conversationId: string,
  participants: AddParticipantRequest[],
): Promise<ConversationParticipant[]> {
  try {
    if (participants.length === 0) {
      return [];
    }

    const participantsData = participants.map((p) => ({
      conversation_id: conversationId,
      employee_id: p.employee_id,
      employee_name: p.employee_name,
      employee_role: p.employee_role,
      employee_provider: p.employee_provider,
      participant_role: p.participant_role || 'collaborator',
      status: 'active',
      capabilities: p.capabilities || [],
      tools_available: p.tools_available || [],
    })) as ConversationParticipantInsert[];

    // Build VALUES tuples with a running param counter
    const valueTuples: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const p of participantsData) {
      valueTuples.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8})`,
      );
      params.push(
        p.conversation_id,
        p.employee_id,
        p.employee_name,
        p.employee_role,
        p.employee_provider,
        p.participant_role,
        p.status,
        p.capabilities,
        p.tools_available,
      );
      paramIdx += 9;
    }

    const data = await db.query<ConversationParticipant>(
      `INSERT INTO conversation_participants
         (conversation_id, employee_id, employee_name, employee_role, employee_provider,
          participant_role, status, capabilities, tools_available)
       VALUES ${valueTuples.join(', ')}
       RETURNING *`,
      params,
    );

    return data || [];
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error adding participants in batch',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Gets all participants in a conversation
 */
export async function getParticipants(conversationId: string): Promise<ConversationParticipant[]> {
  try {
    const data = await db.query<ConversationParticipant>(
      'SELECT * FROM conversation_participants WHERE conversation_id = $1 ORDER BY joined_at ASC',
      [conversationId],
    );

    return data || [];
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error fetching participants',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

// Allowed column names for dynamic UPDATE in updateParticipant
const ALLOWED_PARTICIPANT_UPDATE_COLUMNS = new Set([
  'employee_name',
  'employee_role',
  'employee_provider',
  'participant_role',
  'status',
  'capabilities',
  'tools_available',
  'last_active_at',
  'left_at',
  'message_count',
  'tokens_used',
  'cost_incurred',
  'tasks_completed',
]);

/**
 * Updates a participant
 */
export async function updateParticipant(
  participantId: string,
  updates: ConversationParticipantUpdate,
): Promise<ConversationParticipant> {
  try {
    const entries = Object.entries(updates).filter(([key]) => {
      if (!ALLOWED_PARTICIPANT_UPDATE_COLUMNS.has(key)) {
        console.warn(`updateParticipant: ignoring unknown column "${key}"`);
        return false;
      }
      return true;
    });

    if (entries.length === 0) {
      throw new MultiAgentChatError('No valid fields to update', 'PARTICIPANT_UPDATE_ERROR', null);
    }

    const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);
    values.push(participantId);
    const idParam = entries.length + 1;

    const rows = await db.query<ConversationParticipant>(
      `UPDATE conversation_participants SET ${setClauses} WHERE id = $${idParam} RETURNING *`,
      values,
    );

    const data = rows[0] ?? null;

    if (!data) {
      throw new MultiAgentChatError('Participant not found', 'PARTICIPANT_NOT_FOUND', null);
    }

    return data;
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error updating participant',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Removes a participant from a conversation
 */
export async function removeParticipant(participantId: string): Promise<void> {
  try {
    // Soft delete by updating status and setting left_at
    await db.execute(
      `UPDATE conversation_participants SET status = $1, left_at = $2 WHERE id = $3`,
      ['removed', new Date().toISOString(), participantId],
    );
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error removing participant',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Updates participant activity
 */
export async function updateParticipantActivity(
  participantId: string,
  status: 'active' | 'idle' | 'working',
): Promise<void> {
  try {
    await db.execute(
      `UPDATE conversation_participants SET status = $1, last_active_at = $2 WHERE id = $3`,
      [status, new Date().toISOString(), participantId],
    );
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error updating participant activity',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Increments participant statistics using atomic database operations
 * Updated: Jan 10th 2026 - Deep repair: removed race-prone fallback, added retry logic
 *
 * CRITICAL: This function uses PostgreSQL's atomic increment via RPC to prevent
 * race conditions. The non-atomic fallback was removed because it caused data loss
 * when concurrent updates occurred.
 *
 * @param participantId - The participant UUID to update
 * @param stats - Statistics to increment (all values are additive)
 * @param options - Optional retry configuration
 * @throws MultiAgentChatError if the operation fails after retries
 */
export async function incrementParticipantStats(
  participantId: string,
  stats: {
    message_count?: number;
    tokens_used?: number;
    cost_incurred?: number;
    tasks_completed?: number;
  },
  options: { maxRetries?: number; retryDelayMs?: number } = {},
): Promise<{ success: boolean; retriesUsed: number }> {
  const { maxRetries = 3, retryDelayMs = 100 } = options;
  let lastError: Error | null = null;
  let retriesUsed = 0;

  // Validate input
  if (!participantId || typeof participantId !== 'string') {
    throw new MultiAgentChatError('Invalid participantId provided', 'INVALID_PARTICIPANT_ID', {
      participantId,
    });
  }

  // Ensure at least one stat is being updated
  const hasStats =
    (stats.message_count && stats.message_count > 0) ||
    (stats.tokens_used && stats.tokens_used > 0) ||
    (stats.cost_incurred && stats.cost_incurred > 0) ||
    (stats.tasks_completed && stats.tasks_completed > 0);

  if (!hasStats) {
    // No-op if no stats to update - return early
    return { success: true, retriesUsed: 0 };
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Use parameterized SQL for atomic increment (replaces Neon SQL).
      await db.execute(
        `update conversation_participants set
           message_count   = message_count   + $1,
           tokens_used     = tokens_used     + $2,
           cost_incurred   = cost_incurred   + $3,
           tasks_completed = tasks_completed + $4
         where id = $5`,
        [
          stats.message_count || 0,
          stats.tokens_used || 0,
          stats.cost_incurred || 0,
          stats.tasks_completed || 0,
          participantId,
        ],
      );

      // Success - log for audit trail
      console.debug(
        `[incrementParticipantStats] Successfully updated participant ${participantId}:`,
        {
          message_count: `+${stats.message_count || 0}`,
          tokens_used: `+${stats.tokens_used || 0}`,
          cost_incurred: `+${stats.cost_incurred || 0}`,
          tasks_completed: `+${stats.tasks_completed || 0}`,
          retriesUsed,
        },
      );

      return { success: true, retriesUsed };
    } catch (error) {
      // Re-throw MultiAgentChatError as-is
      if (error instanceof MultiAgentChatError) {
        throw error;
      }

      // Handle unexpected errors
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        retriesUsed = attempt + 1;
        console.warn(
          `[incrementParticipantStats] Unexpected error on attempt ${attempt + 1}/${maxRetries + 1}:`,
          lastError.message,
        );
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
    }
  }

  // All retries exhausted
  throw new MultiAgentChatError(
    `Failed to increment participant stats after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`,
    'MAX_RETRIES_EXCEEDED',
    {
      participantId,
      stats,
      maxRetries,
      lastError: lastError?.message,
    },
  );
}

/**
 * Helper function for async sleep with exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================
// METADATA OPERATIONS
// =============================================

/**
 * Gets conversation metadata
 */
export async function getConversationMetadata(
  conversationId: string,
): Promise<ConversationMetadata | null> {
  try {
    const rows = await db.query<ConversationMetadata>(
      'SELECT * FROM conversation_metadata WHERE conversation_id = $1',
      [conversationId],
    );

    return rows[0] ?? null;
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError('Unexpected error fetching metadata', 'UNEXPECTED_ERROR', error);
  }
}

// Allowed column names for dynamic UPDATE in updateConversationMetadata
const ALLOWED_METADATA_UPDATE_COLUMNS = new Set([
  'ui_settings',
  'is_archived',
  'is_pinned',
  'is_public',
  'share_token',
  'last_opened_at',
  'custom_data',
]);

/**
 * Updates conversation metadata
 */
export async function updateConversationMetadata(
  conversationId: string,
  updates: ConversationMetadataUpdate,
): Promise<ConversationMetadata> {
  try {
    const entries = Object.entries(updates).filter(([key]) => {
      if (!ALLOWED_METADATA_UPDATE_COLUMNS.has(key)) {
        console.warn(`updateConversationMetadata: ignoring unknown column "${key}"`);
        return false;
      }
      return true;
    });

    if (entries.length === 0) {
      throw new MultiAgentChatError('No valid fields to update', 'METADATA_UPDATE_ERROR', null);
    }

    const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);
    values.push(conversationId);
    const idParam = entries.length + 1;

    const rows = await db.query<ConversationMetadata>(
      `UPDATE conversation_metadata SET ${setClauses} WHERE conversation_id = $${idParam} RETURNING *`,
      values,
    );

    const data = rows[0] ?? null;

    if (!data) {
      throw new MultiAgentChatError('Conversation metadata not found', 'METADATA_NOT_FOUND', null);
    }

    return data;
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError('Unexpected error updating metadata', 'UNEXPECTED_ERROR', error);
  }
}

// =============================================
// STATISTICS AND ANALYTICS
// =============================================

/**
 * Gets conversation statistics for a user
 */
export async function getConversationStats(userId: string): Promise<ConversationStats> {
  try {
    // Get aggregate stats
    const conversations = await db.query<Record<string, unknown>>(
      'SELECT status, total_messages, total_tokens, total_cost, started_at, completed_at FROM multi_agent_conversations WHERE user_id = $1',
      [userId],
    );

    const total_conversations = conversations?.length || 0;
    const active_conversations =
      conversations?.filter((c: Record<string, unknown>) => c['status'] === 'active').length || 0;
    const total_messages =
      conversations?.reduce(
        (sum: number, c: Record<string, unknown>) => sum + (c['total_messages'] as number),
        0,
      ) || 0;
    const total_tokens =
      conversations?.reduce(
        (sum: number, c: Record<string, unknown>) => sum + (c['total_tokens'] as number),
        0,
      ) || 0;
    const total_cost =
      conversations?.reduce(
        (sum: number, c: Record<string, unknown>) => sum + (c['total_cost'] as number),
        0,
      ) || 0;

    // Calculate average duration
    const completedConversations =
      conversations?.filter((c: Record<string, unknown>) => c['completed_at'] && c['started_at']) ||
      [];
    const totalDuration = completedConversations.reduce(
      (sum: number, c: Record<string, unknown>) => {
        const start = new Date(c['started_at'] as string).getTime();
        const end = new Date(c['completed_at'] as string).getTime();
        return sum + (end - start);
      },
      0,
    );
    const average_conversation_duration =
      completedConversations.length > 0
        ? Math.round(totalDuration / completedConversations.length / 1000)
        : 0;

    // Get most used agents
    const conversationIds2 = conversations?.map((c: Record<string, unknown>) => c['id']) || [];
    let most_used_agents: Array<{
      employee_id: string;
      employee_name: string;
      usage_count: number;
    }> = [];

    if (conversationIds2.length > 0) {
      try {
        const participants = await db.query<Record<string, unknown>>(
          'SELECT employee_id, employee_name FROM conversation_participants WHERE conversation_id = ANY($1)',
          [conversationIds2],
        );

        if (participants) {
          const agentCounts = participants.reduce(
            (acc: Record<string, number>, p: Record<string, unknown>) => {
              const key = `${p['employee_id']}|${p['employee_name']}`;
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );

          most_used_agents = Object.entries(agentCounts)
            .map(([key, count]) => {
              const parts = key.split('|');
              const employee_id = parts[0] ?? '';
              const employee_name = parts[1] ?? '';
              return { employee_id, employee_name, usage_count: count as number };
            })
            .sort((a, b) => b.usage_count - a.usage_count)
            .slice(0, 10);
        }
      } catch (partError) {
        console.error('Failed to fetch participants for stats:', partError);
      }
    }

    return {
      total_conversations,
      active_conversations,
      total_messages,
      total_tokens,
      total_cost,
      most_used_agents,
      average_conversation_duration,
    };
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error fetching conversation stats',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

/**
 * Archives a conversation
 */
export async function archiveConversation(conversationId: string, userId: string): Promise<void> {
  try {
    // Update conversation status
    await updateConversation(conversationId, userId, { status: 'archived' });

    // Update metadata
    await updateConversationMetadata(conversationId, { is_archived: true });
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error archiving conversation',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Pins a conversation
 */
export async function pinConversation(conversationId: string, isPinned: boolean): Promise<void> {
  try {
    await updateConversationMetadata(conversationId, { is_pinned: isPinned });
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error pinning conversation',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}

/**
 * Generates a share token for a conversation
 */
export async function generateShareToken(conversationId: string): Promise<string> {
  try {
    const shareToken = crypto.randomUUID();
    await updateConversationMetadata(conversationId, {
      is_public: true,
      share_token: shareToken,
    });
    return shareToken;
  } catch (error) {
    if (error instanceof MultiAgentChatError) {
      throw error;
    }
    throw new MultiAgentChatError(
      'Unexpected error generating share token',
      'UNEXPECTED_ERROR',
      error,
    );
  }
}
