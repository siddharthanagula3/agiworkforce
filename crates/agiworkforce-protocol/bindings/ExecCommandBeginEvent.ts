import type { AbsolutePathBuf } from './AbsolutePathBuf';
import type { ExecCommandSource } from './ExecCommandSource';
import type { ParsedCommand } from './ParsedCommand';

export type ExecCommandBeginEvent = {
  call_id: string;
  process_id?: string;
  turn_id: string;
  command: Array<string>;
  cwd: AbsolutePathBuf;
  parsed_cmd: Array<ParsedCommand>;
  source: ExecCommandSource;
  interaction_input?: string;
};
