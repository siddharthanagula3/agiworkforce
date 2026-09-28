export const MIN_TOKEN_LENGTH = 32;
const DEFAULT_PORT = 8080;

export interface ScannerConfig {
  tokens: string[];
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): ScannerConfig {
  const current = env['UPLOAD_SCAN_WEBHOOK_TOKEN']?.trim();
  const previous = env['UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS']?.trim();
  const tokens = [current, previous].filter((token): token is string => Boolean(token));
  if (!current || tokens.some((token) => token.length < MIN_TOKEN_LENGTH)) {
    throw new Error(
      `UPLOAD_SCAN_WEBHOOK_TOKEN (and UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS when set) must be at least ${MIN_TOKEN_LENGTH} characters; the scanner never serves unauthenticated requests`,
    );
  }
  const port = Number(env['PORT'] ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0) throw new Error('PORT must be a port number');
  return { tokens, port };
}
