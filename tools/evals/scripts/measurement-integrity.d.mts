export interface ArtifactIntegrity {
  readonly algorithm: string;
  readonly digest: string;
}

export interface LedgerSuiteScore {
  readonly version: number | null;
  readonly priority: string | null;
  readonly score: number | null;
  readonly completeness: number | null;
  readonly met: boolean | null;
  readonly measuredAt: string | null;
}

export interface LedgerEntry {
  readonly path: string;
  readonly digest: string;
  readonly runId: string | null;
  readonly modelKey: string | null;
  readonly routeId: string | null;
  readonly measuredAt: string | null;
  readonly familyId?: string;
  readonly suites?: Readonly<Record<string, LedgerSuiteScore>>;
}

export interface MeasurementLedger {
  readonly schemaVersion: number;
  readonly entries: readonly LedgerEntry[];
}

export interface MeasurementAudit {
  readonly passed: boolean;
  readonly problems: readonly string[];
  readonly audited: readonly string[];
  readonly changed: boolean;
}

export const MEASUREMENTS_DIR: string;
export const LEDGER_FILE: string;
export const LEDGER_SCHEMA_VERSION: number;
export const INTEGRITY_ALGORITHM: string;

export function digestOf(artifact: object): string;
export function stamp<T extends object>(artifact: T): T & { readonly integrity: ArtifactIntegrity };
export function verifyArtifact(artifact: object): string | null;
export function ledgerEntryFor(relativePath: string, artifact: object): LedgerEntry;
export function readLedger(file?: string): MeasurementLedger;
export function writeLedger(
  ledger: { readonly entries: readonly LedgerEntry[] },
  file?: string,
): void;
export function auditMeasurements(options?: {
  readonly measurementsDir?: string;
  readonly ledgerFile?: string;
  readonly stampMissing?: boolean;
}): MeasurementAudit;
export function recordMeasurement<T extends object>(
  absolutePath: string,
  artifact: T,
  options?: { readonly ledgerFile?: string },
): T & { readonly integrity: ArtifactIntegrity };
