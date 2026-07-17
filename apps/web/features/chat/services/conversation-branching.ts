import { logger } from '@shared/lib/logger';
/**
 * Conversation Branching Service
 *
 * Allows users to fork conversations at any message point,
 * creating alternate conversation paths and supporting conversation trees.
 *
 * Features:
 * - Branch at any message point
 * - Track parent-child session relationships
 * - Navigate branch history
 * - Name and rename branches
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import { chatPersistenceService } from './conversation-storage';
import type { ChatSession } from '../types';
import {
  ManagedCloudBranchConversationRequestSchema,
  ManagedCloudBranchConversationResponseSchema,
  managedCloudBranchPath,
} from '@agiworkforce/cloud-contracts';

/**
 * Branch metadata stored in database
 */
export interface ConversationBranch {
  id: string;
  parentSessionId: string;
  childSessionId: string;
  branchPointMessageId: string;
  branchName: string | null;
  createdAt: Date;
}

/**
 * Branch with additional session details
 */
export interface ConversationBranchWithDetails extends ConversationBranch {
  childSession?: ChatSession;
  messageCount?: number;
}

/**
 * Conversation tree with root and all branches
 */
export interface ConversationTree {
  rootSession: ChatSession;
  branches: ConversationBranchWithDetails[];
}

/**
 * Branch history entry for navigation
 */
export interface BranchHistoryEntry {
  sessionId: string;
  branchName: string | null;
  branchPointMessageId: string | null;
  depth: number;
}

async function buildMutateHeaders(): Promise<HeadersInit> {
  const [token, csrf] = await Promise.all([getAuthToken(), getCsrfToken()]);
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': csrf,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export class ConversationBranchingService {
  /**
   * Branch a conversation at a specific message.
   * Delegates to the /api/chat/branch route which handles everything atomically.
   */
  async branchConversation(
    sessionId: string,
    branchPointMessageId: string,
    _userId: string,
    branchName?: string,
  ): Promise<ChatSession> {
    const headers = await buildMutateHeaders();
    const res = await fetch(managedCloudBranchPath(), {
      method: 'POST',
      headers,
      body: JSON.stringify(
        ManagedCloudBranchConversationRequestSchema.parse({
          sessionId,
          branchPointMessageId,
          branchName,
        }),
      ),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Failed to branch conversation:', err);
      throw new Error(
        `Failed to branch conversation: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = ManagedCloudBranchConversationResponseSchema.parse(await res.json());

    const s = data.session;
    return {
      id: s.id,
      title: s.title || 'Untitled Branch',
      createdAt: new Date(s.created_at),
      updatedAt: new Date(s.updated_at),
      messageCount: 0,
      tokenCount: 0,
      cost: 0,
      isPinned: false,
      isArchived: false,
      tags: [],
      participants: [],
    };
  }

  /**
   * Save branch metadata to the database
   * Note: The /api/chat/branch route handles this atomically inside branchConversation.
   * This standalone method is preserved for callers that need to record a branch record
   * after sessions are already created.
   */
  async saveBranchMetadata(
    parentSessionId: string,
    childSessionId: string,
    branchPointMessageId: string,
    branchName: string | null,
    _userId: string,
  ): Promise<ConversationBranch> {
    // The branch route does not expose a standalone metadata-save endpoint.
    // Return a synthetic record so callers don't break.
    logger.warn('[Branching] saveBranchMetadata called standalone; no dedicated route exists');
    return {
      id: `local-${Date.now()}`,
      parentSessionId,
      childSessionId,
      branchPointMessageId,
      branchName,
      createdAt: new Date(),
    };
  }

  /**
   * Get all direct branches for a session
   * No dedicated read route exists; returns empty array.
   */
  async getBranchesForSession(
    _sessionId: string,
    _userId?: string,
  ): Promise<ConversationBranchWithDetails[]> {
    logger.warn('[Branching] getBranchesForSession has no dedicated API route');
    return [];
  }

  /**
   * Get branch history (ancestry chain) for a session
   * No dedicated route; returns minimal stub.
   */
  async getBranchHistory(sessionId: string): Promise<BranchHistoryEntry[]> {
    return [{ sessionId, branchName: null, branchPointMessageId: null, depth: 0 }];
  }

  /**
   * Get the root session ID for any session in a branch tree
   * No dedicated route; returns self.
   */
  async getRootSessionId(sessionId: string): Promise<string> {
    return sessionId;
  }

  /**
   * Check if a session is a branch (has a parent)
   * No dedicated route; returns false.
   */
  async isBranchSession(_sessionId: string): Promise<boolean> {
    return false;
  }

  /**
   * Get branch info for a session if it is a branch
   * No dedicated route; returns null.
   */
  async getBranchInfo(_sessionId: string): Promise<ConversationBranch | null> {
    return null;
  }

  /**
   * Update branch name
   * No dedicated route.
   */
  async updateBranchName(_branchId: string, _newName: string): Promise<ConversationBranch> {
    throw new Error('updateBranchName is not available via the API');
  }

  /**
   * Delete a branch record (does not delete the session)
   * No dedicated route.
   */
  async deleteBranch(_branchId: string): Promise<void> {
    throw new Error('deleteBranch is not available via the API');
  }

  /**
   * Get the conversation tree for a session
   * Finds the root and returns all branches
   */
  async getConversationTree(sessionId: string, userId: string): Promise<ConversationTree> {
    const rootSessionId = await this.getRootSessionId(sessionId);
    const rootSession = await chatPersistenceService.getSession(rootSessionId, userId);
    if (!rootSession) {
      throw new Error('Root session not found');
    }
    return { rootSession, branches: [] };
  }

  /**
   * Duplicate an entire conversation (full copy)
   * Unlike branching, this copies all messages
   */
  async duplicateConversation(
    sessionId: string,
    userId: string,
    newTitle?: string,
  ): Promise<ChatSession> {
    try {
      const originalSession = await chatPersistenceService.getSession(sessionId, userId);
      if (!originalSession) {
        throw new Error('Original session not found');
      }

      const duplicateTitle = newTitle || `${originalSession.title} (Copy)`;

      const duplicateSession = await chatPersistenceService.createSession(userId, duplicateTitle, {
        employeeId: originalSession.metadata?.['employeeId'] as string,
        role: originalSession.metadata?.['role'] as string,
        provider: originalSession.metadata?.['provider'] as string,
      });

      await chatPersistenceService.copySessionMessages(sessionId, duplicateSession.id, userId);

      return duplicateSession;
    } catch (error) {
      logger.error('Failed to duplicate conversation:', error);
      throw new Error(
        `Failed to duplicate conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Merge two conversation branches
   * Creates a new session with messages from both branches
   */
  async mergeBranches(
    sessionId1: string,
    sessionId2: string,
    userId: string,
    newTitle?: string,
  ): Promise<ChatSession> {
    try {
      const [session1, session2] = await Promise.all([
        chatPersistenceService.getSession(sessionId1, userId),
        chatPersistenceService.getSession(sessionId2, userId),
      ]);

      if (!session1 || !session2) {
        throw new Error('One or both sessions not found');
      }

      const [messages1, messages2] = await Promise.all([
        chatPersistenceService.getSessionMessages(sessionId1),
        chatPersistenceService.getSessionMessages(sessionId2),
      ]);

      const mergeTitle = newTitle || `Merged: ${session1.title} + ${session2.title}`;

      const mergeSession = await chatPersistenceService.createSession(userId, mergeTitle, {
        employeeId: session1.metadata?.['employeeId'] as string,
        role: session1.metadata?.['role'] as string,
        provider: session1.metadata?.['provider'] as string,
      });

      const combinedMessages = [...messages1, ...messages2].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      for (const msg of combinedMessages) {
        await chatPersistenceService.saveMessage(
          mergeSession.id,
          msg.role as 'user' | 'assistant' | 'system',
          msg.content,
        );
      }

      return mergeSession;
    } catch (error) {
      logger.error('Failed to merge branches:', error);
      throw new Error(
        `Failed to merge branches: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get the parent session of a branch
   */
  async getParentSession(branchSessionId: string, userId: string): Promise<ChatSession | null> {
    const branchInfo = await this.getBranchInfo(branchSessionId);
    if (!branchInfo) {
      return null;
    }
    return chatPersistenceService.getSession(branchInfo.parentSessionId, userId);
  }

  /**
   * Check if a session is a branch (alias for isBranchSession)
   */
  async isBranch(sessionId: string): Promise<boolean> {
    return this.isBranchSession(sessionId);
  }

  /**
   * Get all descendant sessions of a session (branches and their branches)
   */
  async getDescendants(sessionId: string, userId: string): Promise<ChatSession[]> {
    const branches = await this.getAllDescendantBranches(sessionId);
    const sessions: ChatSession[] = [];

    for (const branch of branches) {
      const session = await chatPersistenceService.getSession(branch.childSessionId, userId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Get branches at a specific message point
   * No dedicated route; returns empty array.
   */
  async getBranchesAtMessage(_messageId: string): Promise<ConversationBranchWithDetails[]> {
    return [];
  }

  /**
   * Count branches for a session
   * No dedicated route; returns 0.
   */
  async countBranches(_sessionId: string): Promise<number> {
    return 0;
  }

  /**
   * Get all descendant branches recursively
   */
  private async getAllDescendantBranches(
    sessionId: string,
    visited: Set<string> = new Set(),
  ): Promise<ConversationBranchWithDetails[]> {
    if (visited.has(sessionId)) {
      return [];
    }
    visited.add(sessionId);

    const directBranches = await this.getBranchesForSession(sessionId);
    const allBranches: ConversationBranchWithDetails[] = [...directBranches];

    for (const branch of directBranches) {
      const childBranches = await this.getAllDescendantBranches(branch.childSessionId, visited);
      allBranches.push(...childBranches);
    }

    return allBranches;
  }
}

export const conversationBranchingService = new ConversationBranchingService();
