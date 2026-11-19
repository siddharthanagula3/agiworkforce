export function restoreRemovedFile<T extends { readonly id: string }>(
  current: readonly T[],
  file: T,
  index: number,
): T[] {
  if (current.some((entry) => entry.id === file.id)) return [...current];
  const next = [...current];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, file);
  return next;
}
