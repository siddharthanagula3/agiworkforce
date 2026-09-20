export interface PiiFinding {
  readonly kind: string;
  readonly line: number;
  readonly redacted: string;
}

export interface PiiFileFinding extends PiiFinding {
  readonly file: string;
}

export const DATASETS_DIR: string;
export const RECORDINGS_DIR: string;
export const MEASUREMENTS_DIR: string;
export const SCANNED_DIRS: readonly string[];

export function scanText(text: string): PiiFinding[];
export function scanFiles(files: readonly string[]): PiiFileFinding[];
export function scanDatasets(root?: string): PiiFileFinding[];
export function scanEvalCorpora(roots?: readonly string[]): PiiFileFinding[];
