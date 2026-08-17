import 'server-only';

import crypto from 'node:crypto';

import { CLI_USER_CODE_ALPHABET, QR_LINK_CODE_BYTES } from '@/lib/validations/device';

export function generateCliUserCode(): string {
  const len = CLI_USER_CODE_ALPHABET.length;
  const limit = 256 - (256 % len);
  let code = '';
  while (code.length < 8) {
    const bytes = crypto.randomBytes(8 - code.length + 4);
    for (let i = 0; i < bytes.length && code.length < 8; i++) {
      const b = bytes[i]!;
      if (b < limit) code += CLI_USER_CODE_ALPHABET[b % len];
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

export function generateQrLinkCode(): string {
  return crypto.randomBytes(QR_LINK_CODE_BYTES).toString('hex').toUpperCase();
}
