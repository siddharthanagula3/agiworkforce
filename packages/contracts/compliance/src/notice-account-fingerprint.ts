// A shown-once notice stores a fingerprint of each account it was shown to, not
// the account id, so whoever uses the browser later cannot read which accounts
// did. The fingerprint is not a secret, only not the id.
export function noticeAccountFingerprint(storageKey: string, accountId: string): string {
  const input = `${storageKey}\u0000${accountId}`;
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    high = Math.imul(high ^ code, 2654435761);
    low = Math.imul(low ^ code, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909);
  return (4294967296 * (2097151 & low) + (high >>> 0)).toString(36);
}
