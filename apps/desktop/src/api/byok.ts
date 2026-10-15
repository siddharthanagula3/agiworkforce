import { invoke } from '../lib/tauri-mock';

export interface ByokForkMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CreateByokForkRequest {
  userId: string;
  title: string;
  projectId?: string | null;
  messages: ByokForkMessage[];
}

export async function listSavedApiKeys(): Promise<string[]> {
  return invoke<string[]>('llm_list_saved_api_keys');
}

/**
 * Providers whose saved key is sealed under the master password and cannot be
 * used until the vault is unlocked.
 */
export async function listLockedApiKeys(): Promise<string[]> {
  const locked = await invoke<string[]>('llm_list_locked_api_keys');
  return Array.isArray(locked) ? locked : [];
}

export async function deleteApiKey(provider: string): Promise<void> {
  await invoke<void>('llm_delete_api_key', { provider });
}

export async function createByokFork(request: CreateByokForkRequest): Promise<number> {
  return invoke<number>('llm_create_byok_fork', { request });
}
