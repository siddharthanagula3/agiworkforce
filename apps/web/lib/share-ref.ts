import { createHash } from 'node:crypto';

export function shareRef(token: string): string {
  return createHash('sha256').update(token).digest('base64url').slice(0, 12);
}
