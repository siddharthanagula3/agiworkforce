import type { ReleaseChannel } from './channels';
import { currentRelease, type ReleaseLedger } from './release-ledger';

/**
 * A prompt release is scoped to one version, not to a prompt id.
 *
 * The ledger id is the stamp the cost ledger and the routing trace already
 * carry, `id@version`, so the quality signal a channel advance demands is
 * attached to the exact text that was measured rather than to whatever the
 * prompt holds today.
 */

export interface PromptRelease {
  readonly promptId: string;
  readonly version: number;
  readonly channel: ReleaseChannel;
}

const STAMP = /^(?<id>[^@\s]+)@(?<version>\d{1,4})$/u;

export function promptReleaseId(promptId: string, version: number): string {
  return `${promptId}@${version}`;
}

export function parsePromptRelease(
  ledger: ReleaseLedger,
  promptId: string,
  version: number,
): PromptRelease | null {
  const record = currentRelease(ledger, 'prompt', promptReleaseId(promptId, version));
  return record === null ? null : { promptId, version, channel: record.channel };
}

/** Every prompt stamp the ledger governs, for checking it against the manifest. */
export function ledgerPromptStamps(ledger: ReleaseLedger): { id: string; version: number }[] {
  const stamps = new Map<string, { id: string; version: number }>();
  for (const record of ledger.records) {
    if (record.artifact !== 'prompt') continue;
    const matched = STAMP.exec(record.id);
    if (matched?.groups === undefined) continue;
    stamps.set(record.id, {
      id: matched.groups.id,
      version: Number.parseInt(matched.groups.version, 10),
    });
  }
  return [...stamps.values()];
}

export function malformedPromptReleaseIds(ledger: ReleaseLedger): string[] {
  return ledger.records
    .filter((record) => record.artifact === 'prompt' && !STAMP.test(record.id))
    .map((record) => `prompt release ${record.id} is not an id@version stamp`);
}
