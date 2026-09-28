import { RESUMABLE_UPLOAD_MAX_BYTES } from '@agiworkforce/cloud-contracts';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import { MAX_SCAN_BYTES } from '../src/server.ts';

describe('scanner size limit', () => {
  it('matches the largest upload the web sends for scanning', () => {
    expect(MAX_SCAN_BYTES).toBe(
      Math.max(MAX_ATTACHMENT_BYTES, ...Object.values(RESUMABLE_UPLOAD_MAX_BYTES)),
    );
  });
});
