type PasskeyRequiredListener = () => void;

const listeners = new Set<PasskeyRequiredListener>();

export function onPasskeyRequired(listener: PasskeyRequiredListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announcePasskeyRequired(): void {
  for (const listener of listeners) listener();
}
