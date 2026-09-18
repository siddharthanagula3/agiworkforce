/**
 * What a log line may name. Ids, counts, durations and reasons are safe because
 * they are derived, not carried: knowing an operation id tells you which call
 * failed, never what the user asked or which key served it.
 *
 * The names below are the opposite: each one holds either customer text or a
 * credential, so a structured log field built from one is a leak even when the
 * message around it is innocuous.
 */
export const FIELDS_NEVER_LOGGED = [
  'content',
  'contents',
  'messages',
  'prompt',
  'prompts',
  'systemPrompt',
  'userMessage',
  'toolOutput',
  'toolOutputs',
  'toolResult',
  'toolResults',
  'apiKey',
  'apiKeys',
  'credentials',
  'secret',
  'secrets',
  'accessToken',
  'refreshToken',
  'authorization',
  'bearerToken',
] as const;

export type FieldNeverLogged = (typeof FIELDS_NEVER_LOGGED)[number];

const LOG_CALL = /\b(?:logger|log|console)\s*\.\s*(?:trace|debug|info|warn|error|fatal|log)\s*\(/g;

export interface LogCallSite {
  readonly line: number;
  readonly text: string;
}

export function logCallSites(source: string): LogCallSite[] {
  const sites: LogCallSite[] = [];
  LOG_CALL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LOG_CALL.exec(source)) !== null) {
    let index = LOG_CALL.lastIndex;
    let depth = 1;
    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      index += 1;
    }
    sites.push({
      line: source.slice(0, match.index).split('\n').length,
      text: source.slice(match.index, index),
    });
  }
  return sites;
}

/**
 * A banned name inside the human-readable message is prose, not a value, so the
 * literals are removed first. A template interpolation is code and stays.
 */
export function codeOfCall(callText: string): string {
  return callText
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, '``')
    .replace(/`(?:[^`\\]|\\.)*?\$\{/g, '${')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

const BANNED = new RegExp(
  `(?<![A-Za-z0-9_$.])(${FIELDS_NEVER_LOGGED.join('|')})(?![A-Za-z0-9_$])`,
  'g',
);

export function rawContentReferences(callText: string): FieldNeverLogged[] {
  const hits = [...codeOfCall(callText).matchAll(BANNED)].map(
    (match) => match[1] as FieldNeverLogged,
  );
  return [...new Set(hits)];
}
