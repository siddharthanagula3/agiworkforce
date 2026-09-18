export interface CoverageLedger {
  readonly schemaVersion?: number;
  readonly uncovered?: Readonly<Record<string, string>>;
}

export interface CoverageVerdict {
  readonly passed: boolean;
  readonly problems: readonly string[];
  readonly covered: ReadonlyMap<string, readonly string[]>;
  readonly uncovered: readonly string[];
}

export const DATASETS_DIR: string;
export const LEDGER_FILE: string;
export const PROMPT_MANIFEST_FILE: string;

export function manifestPromptIds(source: string): string[];
export function corpusPromptIds(datasetsDir?: string): Map<string, string[]>;
export function evaluateCoverage(options: {
  readonly manifestIds: readonly string[];
  readonly covered: ReadonlyMap<string, readonly string[]>;
  readonly ledger: CoverageLedger;
}): CoverageVerdict;
export function corporaForPrompts(
  promptIds: readonly string[],
  covered: ReadonlyMap<string, readonly string[]>,
): string[];
