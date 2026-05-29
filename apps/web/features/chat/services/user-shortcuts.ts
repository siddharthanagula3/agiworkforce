import { logger } from '@shared/lib/logger';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import type { PromptShortcut } from '../components/shortcuts/PromptShortcuts';

export interface UserShortcut extends PromptShortcut {
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * User Shortcuts Service
 *
 * Allows users to create custom prompt shortcuts that persist in the database.
 * Integrated with the PromptShortcuts component.
 */

interface APIShortcutRow {
  id: string;
  user_id: string;
  label: string;
  prompt: string;
  category: string;
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

/**
 * Get all shortcuts for a user (combines default + custom)
 */
export async function getUserShortcuts(_userId: string): Promise<PromptShortcut[]> {
  try {
    const headers = await buildReadHeaders();
    const res = await fetch('/api/chat/shortcuts', { headers });

    if (!res.ok) {
      logger.error('[User Shortcuts] Error fetching shortcuts:', res.statusText);
      return [];
    }

    const data = (await res.json()) as { shortcuts: APIShortcutRow[] };

    return (data.shortcuts ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      icon: () => null, // Custom shortcuts don't have icons
      prompt: row.prompt,
      category: row.category as 'coding' | 'writing' | 'business' | 'analysis' | 'creative',
    }));
  } catch (error) {
    logger.error('[User Shortcuts] Error:', error);
    return [];
  }
}

/**
 * Create a new custom shortcut
 */
export async function createUserShortcut(
  _userId: string,
  shortcut: {
    label: string;
    prompt: string;
    category: 'coding' | 'writing' | 'business' | 'analysis' | 'creative';
  },
): Promise<PromptShortcut | null> {
  try {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/shortcuts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        label: shortcut.label,
        prompt: shortcut.prompt,
        category: shortcut.category,
      }),
    });

    if (!res.ok) {
      logger.error('[User Shortcuts] Error creating shortcut:', res.statusText);
      return null;
    }

    const data = (await res.json()) as { shortcut: APIShortcutRow };
    if (!data.shortcut) {
      logger.error('[User Shortcuts] No data returned after creating shortcut');
      return null;
    }

    return {
      id: data.shortcut.id,
      label: data.shortcut.label,
      icon: () => null,
      prompt: data.shortcut.prompt,
      category: data.shortcut.category as
        | 'coding'
        | 'writing'
        | 'business'
        | 'analysis'
        | 'creative',
    };
  } catch (error) {
    logger.error('[User Shortcuts] Error:', error);
    return null;
  }
}

/**
 * Update an existing custom shortcut
 * SECURITY: Must verify user owns the shortcut
 */
export async function updateUserShortcut(
  _userId: string,
  shortcutId: string,
  updates: {
    label?: string;
    prompt?: string;
    category?: 'coding' | 'writing' | 'business' | 'analysis' | 'creative';
  },
): Promise<boolean> {
  try {
    const headers = await buildMutateHeaders();
    // POST with id triggers update path in the route
    const res = await fetch('/api/chat/shortcuts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: shortcutId,
        ...updates,
      }),
    });

    if (!res.ok) {
      logger.error('[User Shortcuts] Error updating shortcut:', res.statusText);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('[User Shortcuts] Error:', error);
    return false;
  }
}

/**
 * Delete a custom shortcut
 * SECURITY: Must verify user owns the shortcut
 */
export async function deleteUserShortcut(_userId: string, shortcutId: string): Promise<boolean> {
  try {
    const headers = await buildMutateHeaders();
    const res = await fetch('/api/chat/shortcuts', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ id: shortcutId }),
    });

    if (!res.ok) {
      logger.error('[User Shortcuts] Error deleting shortcut:', res.statusText);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('[User Shortcuts] Error:', error);
    return false;
  }
}
