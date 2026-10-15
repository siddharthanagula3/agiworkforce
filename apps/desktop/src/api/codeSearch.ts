export interface GlobMatch {
  path: string;
  relativePath: string;
  isFile: boolean;
  sizeBytes: number;
  modifiedSecs: number;
}
