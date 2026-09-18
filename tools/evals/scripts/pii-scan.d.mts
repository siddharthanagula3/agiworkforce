export interface PiiFinding {
  readonly kind: string;
  readonly line: number;
  readonly redacted: string;
}

export interface PiiFileFinding extends PiiFinding {
  readonly file: string;
}

export const DATASETS_DIR: string;

export function scanText(text: string): PiiFinding[];
export function scanFiles(files: readonly string[]): PiiFileFinding[];
export function scanDatasets(root?: string): PiiFileFinding[];
