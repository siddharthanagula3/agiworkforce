import { logger } from '@shared/lib/logger';
/**
 * Folder Management Service
 * Handles CRUD operations for chat session folders
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';

export interface ChatFolder {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string;
  description?: string;
  parentFolderId?: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  sessionCount?: number; // Populated separately
}

interface APIFolderRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  description: string | null;
  parent_folder_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

async function buildMutateHeaders(): Promise<HeadersInit> {
  const [token, csrf] = await Promise.all([getAuthToken(), getCsrfToken()]);
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': csrf,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function buildReadHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function mapRowToFolder(row: APIFolderRow): ChatFolder {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    description: row.description ?? undefined,
    parentFolderId: row.parent_folder_id ?? undefined,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

class FolderManagementService {
  /**
   * Get all folders for a user
   */
  async getUserFolders(_userId: string): Promise<ChatFolder[]> {
    const headers = await buildReadHeaders();
    const res = await fetch('/api/chat/folders', { headers });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[FolderService] Failed to load folders:', err);
      throw new Error(
        `Failed to load folders: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { folders: APIFolderRow[] };
    return (data.folders || []).map(mapRowToFolder);
  }

  /**
   * Get a specific folder by ID
   */
  async getFolder(folderId: string, _userId?: string): Promise<ChatFolder | null> {
    try {
      const folders = await this.getUserFolders(_userId ?? '');
      return folders.find((f) => f.id === folderId) ?? null;
    } catch {
      logger.error('[FolderService] Failed to load folder');
      return null;
    }
  }

  /**
   * Create a new folder
   */
  async createFolder(
    _userId: string,
    folderData: {
      name: string;
      color?: string;
      icon?: string;
      description?: string;
      parentFolderId?: string;
    },
  ): Promise<ChatFolder> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/folders', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: folderData.name,
        color: folderData.color || 'gray',
        icon: folderData.icon || 'folder',
        description: folderData.description,
        parentFolderId: folderData.parentFolderId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[FolderService] Failed to create folder:', err);
      throw new Error(
        `Failed to create folder: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }

    const data = (await res.json()) as { folder: APIFolderRow };
    if (!data.folder) {
      throw new Error('Failed to create folder: No data returned');
    }

    return mapRowToFolder(data.folder);
  }

  /**
   * Update folder properties
   */
  async updateFolder(
    folderId: string,
    updates: {
      name?: string;
      color?: string;
      icon?: string;
      description?: string;
      parentFolderId?: string;
      sortOrder?: number;
    },
    _userId?: string,
  ): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/folders', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        id: folderId,
        name: updates.name,
        color: updates.color,
        icon: updates.icon,
        description: updates.description,
        parentFolderId: updates.parentFolderId,
        sortOrder: updates.sortOrder,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[FolderService] Failed to update folder:', err);
      throw new Error(
        `Failed to update folder: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Delete a folder
   * Note: Sessions in the folder will be moved to root (folder_id = null)
   */
  async deleteFolder(folderId: string, _userId?: string): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/folders', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ id: folderId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[FolderService] Failed to delete folder:', err);
      throw new Error(
        `Failed to delete folder: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Move a session to a folder
   */
  async moveSessionToFolder(sessionId: string, folderId: string | null): Promise<void> {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/folders', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ sessionId, folderId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('[FolderService] Failed to move session:', err);
      throw new Error(
        `Failed to move session: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
  }

  /**
   * Get session count for a folder
   * No dedicated route; derived from getFolderSessions.
   */
  async getFolderSessionCount(folderId: string): Promise<number> {
    try {
      const sessions = await this.getFolderSessions(folderId);
      return sessions.length;
    } catch {
      logger.error('[FolderService] Failed to count sessions');
      return 0;
    }
  }

  /**
   * Get sessions in a folder
   * No dedicated route; returns empty array as fallback.
   */
  async getFolderSessions(_folderId: string | null): Promise<string[]> {
    // No dedicated API route exists for listing sessions by folder.
    // Callers that need this should use the conversations API with folder filtering.
    logger.warn('[FolderService] getFolderSessions has no dedicated API route');
    return [];
  }

  /**
   * Reorder folders
   */
  async reorderFolders(
    folderOrders: Array<{ id: string; sortOrder: number }>,
    _userId?: string,
  ): Promise<void> {
    const headers = await buildMutateHeaders();
    const results = await Promise.allSettled(
      folderOrders.map(({ id, sortOrder }) =>
        fetch('/api/chat/folders', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ id, sortOrder }),
        }),
      ),
    );

    const failures = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok),
    );
    if (failures.length > 0) {
      logger.error('[FolderService] Failed to reorder some folders:', failures);
      throw new Error('Failed to reorder some folders');
    }
  }

  /**
   * Get folder tree (nested structure)
   */
  async getFolderTree(_userId: string): Promise<ChatFolder[]> {
    const allFolders = await this.getUserFolders(_userId);

    // Build tree structure
    const folderMap = new Map<string, ChatFolder & { children: ChatFolder[] }>();
    const rootFolders: (ChatFolder & { children: ChatFolder[] })[] = [];

    // First pass: create map and add children property
    allFolders.forEach((folder) => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    // Second pass: build tree
    allFolders.forEach((folder) => {
      const folderWithChildren = folderMap.get(folder.id)!;
      if (folder.parentFolderId) {
        const parent = folderMap.get(folder.parentFolderId);
        if (parent) {
          parent.children.push(folderWithChildren);
        } else {
          // Parent not found, treat as root
          rootFolders.push(folderWithChildren);
        }
      } else {
        rootFolders.push(folderWithChildren);
      }
    });

    return rootFolders;
  }
}

export const folderManagementService = new FolderManagementService();
