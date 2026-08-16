import type { AbsolutePathBuf } from './AbsolutePathBuf';
import type { ExecCommandSource } from './ExecCommandSource';
import type { ExecCommandStatus } from './ExecCommandStatus';
import type { ParsedCommand } from './ParsedCommand';

export type ExecCommandEndEvent = {
  call_id: string;
  process_id?: string;
  turn_id: string;
  command: Array<string>;
  cwd: AbsolutePathBuf;
  parsed_cmd: Array<ParsedCommand>;
  source: ExecCommandSource;
  interaction_input?: string;
  stdout: string;
  stderr: string;
  aggregated_output: string;
  exit_code: number;
  duration: string;
  formatted_output: string;
  status: ExecCommandStatus;
};
