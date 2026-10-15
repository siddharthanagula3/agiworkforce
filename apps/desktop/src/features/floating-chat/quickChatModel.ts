import { parseDiscoveredChatModels, useChatModelStore } from '@agiworkforce/unified-chat';
import { invoke } from '../../lib/tauri-mock';
import { isLocalProvider } from '../../types/provider';

export interface QuickChatModel {
  id: string;
  name: string;
  provider: string;
}

/** A quick chat is `local_only`, so a model behind a provider key never qualifies. */
export async function resolveQuickChatModel(): Promise<QuickChatModel | null> {
  const reachable = parseDiscoveredChatModels(await invoke<unknown>('llm_get_available_models'))
    .filter((model) => model.available === true && isLocalProvider(model.provider))
    .map(({ id, name, provider }) => ({ id, name, provider: provider.toLowerCase() }));
  const selectedId = useChatModelStore.getState().selectedModelId;
  return reachable.find((model) => model.id === selectedId) ?? reachable[0] ?? null;
}
