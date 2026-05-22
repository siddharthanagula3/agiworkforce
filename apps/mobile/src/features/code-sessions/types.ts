export type CodeSessionMode = 'plan' | 'code';
export type CodeSessionStatus = 'idle' | 'connecting' | 'archived' | 'disconnected';
export type CodeSessionEnvironment = 'desktop' | 'cloud';

export interface CodeSession {
  id: string;
  title: string;
  repo: string;
  branch: string;
  mode: CodeSessionMode;
  status: CodeSessionStatus;
  environment: CodeSessionEnvironment;
  lastActivityLabel: string;
  transcript: string[];
}
