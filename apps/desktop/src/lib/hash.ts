const encoder = new TextEncoder();

function fallbackHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash.toString(16);
}

export async function sha256(value: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const data = encoder.encode(value);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (error) {
    console.error('[hash] Failed to compute SHA-256, using fallback:', error);
  }

  return fallbackHash(value);
}
