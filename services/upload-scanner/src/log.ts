type Level = 'info' | 'warn' | 'error';

const silent = process.env['NODE_ENV'] === 'test';

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (silent) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), event, ...fields });
  (level === 'info' ? process.stdout : process.stderr).write(`${line}\n`);
}
