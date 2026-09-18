import type { NamedProvider, ProviderRegistry } from './types';

/**
 * Registration order is resolution order, so a fallback chain is the list the
 * caller registered. Re-registering an id replaces the entry in place rather
 * than adding a second provider answering to the same name.
 */
export function createProviderRegistry<T extends NamedProvider>(
  initial: readonly T[] = [],
): ProviderRegistry<T> {
  const providers = new Map<string, T>();
  const registry: ProviderRegistry<T> = {
    register(provider: T): void {
      providers.set(provider.id, provider);
    },
    unregister(id: string): boolean {
      return providers.delete(id);
    },
    get(id: string): T | undefined {
      return providers.get(id);
    },
    list(): T[] {
      return [...providers.values()];
    },
    ids(): string[] {
      return [...providers.keys()];
    },
  };
  for (const provider of initial) registry.register(provider);
  return registry;
}
