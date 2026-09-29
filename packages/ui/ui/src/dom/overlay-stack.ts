export type OverlayKeyHandler = (event: KeyboardEvent) => boolean;

const layers: OverlayKeyHandler[] = [];

function onKeyDown(event: KeyboardEvent): void {
  const snapshot = [...layers].reverse();
  if (event.key === 'Escape') {
    snapshot[0]?.(event);
    return;
  }
  for (const handler of snapshot) {
    if (handler(event)) return;
  }
}

export function pushOverlayLayer(handler: OverlayKeyHandler): () => void {
  if (layers.length === 0) document.addEventListener('keydown', onKeyDown, true);
  layers.push(handler);
  return () => {
    const index = layers.lastIndexOf(handler);
    if (index === -1) return;
    layers.splice(index, 1);
    if (layers.length === 0) document.removeEventListener('keydown', onKeyDown, true);
  };
}
