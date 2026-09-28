import type { ComputerUsePhase } from './computer-use';
import type { RemoteControlStatus } from './remote-control';

export interface BackgroundCodingRuntime {
  rootId: string;
  rootName: string;
  startedAtMs: number;
  workingTurns: number;
}

export interface BackgroundCommandRun {
  runId: string;
  command: string;
  rootName: string;
  startedAtMs: number;
}

export interface BackgroundActivity {
  codingRuntimes: BackgroundCodingRuntime[];
  commands: BackgroundCommandRun[];
  computerUse: ComputerUsePhase;
  remoteControl: RemoteControlStatus;
  browserPaired: boolean;
}

export const BACKGROUND_WORK_KINDS = [
  'coding-runtime',
  'command',
  'computer-use',
  'remote-control',
] as const;

export type BackgroundWorkKind = (typeof BACKGROUND_WORK_KINDS)[number];

export function isBackgroundWorkKind(value: unknown): value is BackgroundWorkKind {
  return typeof value === 'string' && (BACKGROUND_WORK_KINDS as readonly string[]).includes(value);
}
