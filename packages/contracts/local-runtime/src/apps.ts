export const APPLICATION_COMMANDS = ['app_open_path', 'app_reveal_path'] as const;

export type ApplicationCommand = (typeof APPLICATION_COMMANDS)[number];

export interface ApplicationOpenResult {
  /** POSIX-separated path relative to the workspace root. */
  path: string;
  opened: boolean;
}
