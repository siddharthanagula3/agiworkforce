import { NAMESPACES, isSupportedLanguage, type Namespace } from './languages';

type ReadCallback = (error: Error | null, data?: Record<string, unknown> | false) => void;

const NAMESPACE_SET = new Set<string>(NAMESPACES);

export async function loadLocaleNamespace(
  language: string,
  namespace: string,
): Promise<Record<string, unknown>> {
  if (!isSupportedLanguage(language) || !NAMESPACE_SET.has(namespace)) {
    throw new Error(`Unknown locale resource ${language}/${namespace}`);
  }
  const module = (await import(`../locales/${language}/${namespace as Namespace}.json`)) as {
    default: Record<string, unknown>;
  };
  return module.default;
}

export const lazyLocaleBackend = {
  type: 'backend' as const,
  init(): void {},
  read(language: string, namespace: string, callback: ReadCallback): void {
    loadLocaleNamespace(language, namespace).then(
      (data) => callback(null, data),
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error)), false),
    );
  },
};
