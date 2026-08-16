import type { LocalModelProvider } from './LocalModelProvider';

export type ThreadStartParams = {
  model?: string;
  provider?: LocalModelProvider;
  cwd?: string;
  title?: string;
};
