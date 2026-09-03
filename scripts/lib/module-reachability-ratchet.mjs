export function checkBaselineCeiling({ label, knownUnreachable, ceiling }) {
  if (typeof ceiling !== 'number' || !Number.isInteger(ceiling) || ceiling < 0) {
    return [`${label}: maxKnownUnreachable must be a non-negative integer, got ${String(ceiling)}`];
  }

  const size = knownUnreachable.length;
  if (size > ceiling) {
    return [
      `${label}: unreachable baseline grew from ${ceiling} to ${size}. ` +
        'Route the module from an entry point or delete it, the baseline only ratchets down.',
    ];
  }
  if (size < ceiling) {
    return [
      `${label}: unreachable baseline shrank from ${ceiling} to ${size}. ` +
        `Lower maxKnownUnreachable to ${size} so the ratchet locks in the win.`,
    ];
  }
  return [];
}
