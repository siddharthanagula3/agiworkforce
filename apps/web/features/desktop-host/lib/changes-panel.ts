/**
 * Whether this window is showing the changes panel.
 */

let visible = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeChangesPanel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChangesPanelVisible(): boolean {
  return visible;
}

export function toggleChangesPanel(): void {
  visible = !visible;
  emit();
}

export function resetChangesPanel(): void {
  visible = false;
  emit();
}
