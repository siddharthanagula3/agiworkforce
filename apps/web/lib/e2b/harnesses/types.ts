import type { AgentEvent, AgentEventStopReason } from '@agiworkforce/types/protocol';

export type HarnessStream = 'stdout' | 'stderr';

export interface HarnessRunRequest {
  prompt: string;
  workspacePath: string;
  maxTurns: number;
  timeoutMs: number;
  resumeSessionId?: string | null;
}

export interface HarnessUsageReport {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
}

export interface HarnessOutcome {
  stopReason: AgentEventStopReason;
  finalText: string;
  sessionId?: string;
  usage?: HarnessUsageReport;
  errorMessage?: string;
}

export interface HarnessParserFlush {
  events: AgentEvent[];
  outcome: HarnessOutcome;
}

export interface HarnessParser {
  push(line: string, stream: HarnessStream): AgentEvent[];
  finish(exitCode: number): HarnessParserFlush;
}

export interface HarnessRunner {
  runtimeId: string;
  binary: string;
  supportsResume: boolean;
  buildCommand(request: HarnessRunRequest): string;
  createParser(request: HarnessRunRequest): HarnessParser;
}

export interface HarnessProcessRequest {
  command: string;
  cwd: string;
  timeoutMs: number;
  signal: AbortSignal;
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
}

export interface HarnessProcessResult {
  exitCode: number;
  error?: string;
}

export interface HarnessProcessPort {
  run(request: HarnessProcessRequest): Promise<HarnessProcessResult>;
}
