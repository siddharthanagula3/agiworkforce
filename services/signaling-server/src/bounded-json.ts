interface Pending {
  value: unknown;
  depth: number;
}

export function boundedJsonLength(
  root: unknown,
  maxLength: number,
  maxDepth: number,
): number | null {
  let length = 0;
  const pending: Pending[] = [{ value: root, depth: 0 }];

  while (pending.length > 0) {
    const { value, depth } = pending.pop() as Pending;

    if (value === null || typeof value !== 'object') {
      if (
        value === undefined ||
        typeof value === 'bigint' ||
        typeof value === 'function' ||
        typeof value === 'symbol'
      ) {
        return null;
      }
      length += JSON.stringify(value).length;
    } else {
      if (depth + 1 > maxDepth) return null;
      if (Array.isArray(value)) {
        length += value.length === 0 ? 2 : value.length + 1;
        for (const item of value) pending.push({ value: item, depth: depth + 1 });
      } else {
        const keys = Object.keys(value);
        length += keys.length === 0 ? 2 : keys.length + 1;
        for (const key of keys) {
          length += JSON.stringify(key).length + 1;
          pending.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 });
        }
      }
    }

    if (length > maxLength) return null;
  }

  return length;
}

export function withinJsonBounds(root: unknown, maxLength: number, maxDepth: number): boolean {
  return boundedJsonLength(root, maxLength, maxDepth) !== null;
}

export function exceedsJsonDepth(root: unknown, maxDepth: number): boolean {
  return boundedJsonLength(root, Number.POSITIVE_INFINITY, maxDepth) === null;
}
