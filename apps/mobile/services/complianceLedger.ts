// AUDIT-FIX: pre-existing reorg stub — original MMKV-backed compliance disclosure
// ledger was removed during the mobile-restructure work. Stub satisfies the
// `@/services/complianceLedger` import from onboarding and conforms to the
// `DisclosureLedger` interface exposed by `@agiworkforce/compliance` (read/write
// pair). Real implementation tracked as a follow-up; until then, compliance
// disclosure state is not persisted across app launches.

import type { DisclosureLedger, DisclosureRecord } from '@agiworkforce/compliance';

let inMemoryRecord: DisclosureRecord | null = null;

export const mmkvDisclosureLedger: DisclosureLedger = {
  read(): DisclosureRecord | null {
    return inMemoryRecord;
  },
  write(record: DisclosureRecord): void {
    inMemoryRecord = record;
  },
};
