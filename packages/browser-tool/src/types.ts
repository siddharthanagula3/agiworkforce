/**
 * Browser tool action schema.
 *
 * Single tool name (`browser`) with a discriminated-union `action` field —
 * the schema pattern OpenClaw's `extensions/browser/src/browser-tool.schema.ts`
 * pioneered. Vertex AI's tool validator rejects nested `anyOf`, so we keep
 * the union flat at the action layer (each variant has its own
 * `parameters`, all sharing the same outer object shape).
 *
 * Profile management: every action runs against a named profile. The default
 * profile is `agiworkforce` (analogous to OpenClaw's `openclaw` profile),
 * stored under `~/.agiworkforce/browser/profiles/<name>` so the
 * agent-controlled browser is fully isolated from the user's daily Chrome.
 */

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
  /** Base64-encoded PNG. */
  data: string;
  mimeType: 'image/png';
}

export interface BrowserToolResult {
  /** Was this an error result? */
  isError?: boolean;
  /** One or more content blocks. */
  content: Array<BrowserToolResultText | BrowserToolResultImage>;
  /** Optional structured metadata for callers that want it (URL, title, refs). */
  details?: Record<string, unknown>;
}

export interface BrowserProfileInfo {
  name: string;
  /** Resolved on-disk profile dir. */
  userDataDir: string;
  /** Whether the profile is currently launched. */
  active: boolean;
}

/**
 * Snapshot of an interactive element. `ref` is the Playwright handle id used
 * to target the element on later actions (analogous to OpenClaw's `aria`
 * mode refs). The agent reads the snapshot, picks a `ref`, then sends a
 * `click` / `type` action with that ref.
 */
export interface BrowserSnapshotElement {
  ref: string;
  role: string;
  name?: string;
  level?: number;
  /** Trimmed visible text, useful for the model to disambiguate. */
  text?: string;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  elements: BrowserSnapshotElement[];
}
