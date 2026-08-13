export const LOCAL_MODEL_CATALOG_CHANGED_EVENT = 'agi:local-model-catalog-changed';

export type LocalModelCatalogChangeReason =
  | 'settings-refresh'
  | 'settings-save'
  | 'runtime-refresh'
  | 'background-health';

export function notifyLocalModelCatalogChanged(reason: LocalModelCatalogChangeReason): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<LocalModelCatalogChangeReason>(LOCAL_MODEL_CATALOG_CHANGED_EVENT, {
      detail: reason,
    }),
  );
}

export function subscribeToLocalModelCatalogChanges(
  listener: (reason: LocalModelCatalogChangeReason) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleChange = (event: Event) => {
    listener((event as CustomEvent<LocalModelCatalogChangeReason>).detail);
  };
  window.addEventListener(LOCAL_MODEL_CATALOG_CHANGED_EVENT, handleChange);
  return () => window.removeEventListener(LOCAL_MODEL_CATALOG_CHANGED_EVENT, handleChange);
}
