
export type BrowserSnapshotMode = 'aria' | 'ai';

export type BrowserAction =
  | {
      kind: 'navigate';
      url: string;
      profile?: string;
      waitFor?: 'load' | 'domcontentloaded' | 'networkidle';
    }
  | { kind: 'click'; ref: string; profile?: string; button?: 'left' | 'right' | 'middle' }
  | { kind: 'clickCoords'; x: number; y: number; profile?: string }
  | { kind: 'type'; ref: string; text: string; profile?: string; submit?: boolean }
  | { kind: 'press'; key: string; profile?: string }
  | { kind: 'screenshot'; profile?: string; fullPage?: boolean }
  | { kind: 'snapshot'; mode?: BrowserSnapshotMode; profile?: string }
  | { kind: 'wait'; ms: number; profile?: string }
  | { kind: 'evaluate'; script: string; profile?: string }
  | { kind: 'close'; profile?: string };

export interface BrowserToolResultText {
  type: 'text';
  text: string;
}

export interface BrowserToolResultImage {
  type: 'image';
  data: string;
  mimeType: 'image/png';
}

export interface BrowserToolResult {
  isError?: boolean;
  content: Array<BrowserToolResultText | BrowserToolResultImage>;
  details?: Record<string, unknown>;
}

export interface BrowserProfileInfo {
  name: string;
  userDataDir: string;
  active: boolean;
}

export interface BrowserSnapshotElement {
  ref: string;
  role: string;
  name?: string;
  level?: number;
  text?: string;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  elements: BrowserSnapshotElement[];
}
