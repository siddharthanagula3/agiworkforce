/**
 * The line protocol between the main process and the macOS input helper.
 *
 * One JSON request per line out, one JSON reply per line back. Kept free of
 * Electron and of the child process so the framing can be tested directly: a
 * reply split across two stdout chunks, or a helper that dies mid-line, are the
 * cases that strand a step the turn is waiting on.
 */

export interface HelperFraming {
  lines: string[];
  rest: string;
}

export function frameHelperLines(buffered: string): HelperFraming {
  const lines: string[] = [];
  let rest = buffered;
  let newline = rest.indexOf('\n');
  while (newline >= 0) {
    const line = rest.slice(0, newline).trim();
    rest = rest.slice(newline + 1);
    if (line.length > 0) lines.push(line);
    newline = rest.indexOf('\n');
  }
  return { lines, rest };
}

export type HelperReply = { ok: true } | { ok: false; error: string };

export function readHelperReply(line: string): HelperReply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { ok: false, error: 'The input helper sent an unreadable reply.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'The input helper sent an unreadable reply.' };
  }
  const record = parsed as { ok?: unknown; error?: unknown };
  if (record.ok === true) return { ok: true };
  return {
    ok: false,
    error:
      typeof record.error === 'string' && record.error.length > 0
        ? record.error
        : 'That action could not be carried out.',
  };
}
