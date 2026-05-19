/**
 * On-device competitor memory/history import parsers.
 * All parsing happens locally — no data leaves the device.
 */

export type ImportSource = 'chatgpt' | 'claude' | 'gemini' | 'text';

export interface ImportedFact {
  fact: string;
  source: ImportSource;
}

export interface ImportResult {
  facts: ImportedFact[];
  skipped: number;
  source: ImportSource;
}

// Maximum characters for a single imported fact before it gets truncated.
const MAX_FACT_CHARS = 2000;
// Maximum facts we'll import from a single file.
const MAX_FACTS = 500;

function truncate(text: string): string {
  return text.length > MAX_FACT_CHARS ? text.slice(0, MAX_FACT_CHARS).trimEnd() + '…' : text;
}

function isNonEmpty(s: string): boolean {
  return s.trim().length > 2;
}

// ---------------------------------------------------------------------------
// ChatGPT export.json parser
// The export contains an array of conversations; each has a mapping of
// messages keyed by UUID. We extract all user + assistant content snippets
// that look like stated preferences or facts ("I prefer …", "I use …", etc.)
// ---------------------------------------------------------------------------

interface ChatGPTMessage {
  author?: { role?: string };
  content?: { parts?: (string | null)[] };
}

interface ChatGPTConversation {
  title?: string;
  mapping?: Record<string, { message?: ChatGPTMessage }>;
  memory?: string[] | Record<string, string>;
}

function parseChatGPTMemoryField(
  memory: ChatGPTConversation['memory'],
  source: ImportSource,
): ImportedFact[] {
  if (!memory) return [];

  if (Array.isArray(memory)) {
    return memory
      .filter((m): m is string => typeof m === 'string' && isNonEmpty(m))
      .map((m) => ({ fact: truncate(m.trim()), source }));
  }

  if (typeof memory === 'object') {
    return Object.values(memory)
      .filter((v): v is string => typeof v === 'string' && isNonEmpty(v))
      .map((v) => ({ fact: truncate(v.trim()), source }));
  }

  return [];
}

export function parseChatGPTExport(jsonText: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { facts: [], skipped: 0, source: 'chatgpt' };
  }

  const source: ImportSource = 'chatgpt';
  const facts: ImportedFact[] = [];
  let skipped = 0;

  const conversations: ChatGPTConversation[] = Array.isArray(parsed)
    ? (parsed as ChatGPTConversation[])
    : [];

  for (const conv of conversations) {
    // Extract top-level memory field (ChatGPT memory feature)
    const memFacts = parseChatGPTMemoryField(conv.memory, source);
    for (const f of memFacts) {
      if (facts.length >= MAX_FACTS) {
        skipped++;
        continue;
      }
      facts.push(f);
    }
  }

  return { facts, skipped, source };
}

// ---------------------------------------------------------------------------
// Claude export parser
// Claude exports a JSON with { account, conversations }. Each conversation
// has an array of messages with { role, content }. We surface pinned/starred
// messages or system-level custom instructions if present.
// ---------------------------------------------------------------------------

interface ClaudeMessage {
  role?: string;
  content?: string;
  uuid?: string;
  starred?: boolean;
}

interface ClaudeExport {
  account?: { full_name?: string };
  conversations?: Array<{
    uuid?: string;
    name?: string;
    chat_messages?: ClaudeMessage[];
    system_prompt?: string;
  }>;
}

export function parseClaudeExport(jsonText: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { facts: [], skipped: 0, source: 'claude' };
  }

  const source: ImportSource = 'claude';
  const facts: ImportedFact[] = [];
  let skipped = 0;

  const data = parsed as ClaudeExport;
  const conversations = data.conversations ?? [];

  for (const conv of conversations) {
    // System prompts / custom instructions are high-value facts
    if (conv.system_prompt && isNonEmpty(conv.system_prompt)) {
      if (facts.length < MAX_FACTS) {
        facts.push({ fact: truncate(conv.system_prompt.trim()), source });
      } else {
        skipped++;
      }
    }

    for (const msg of conv.chat_messages ?? []) {
      if (!msg.starred) continue;
      const content = msg.content;
      if (!content || !isNonEmpty(content)) continue;
      if (facts.length >= MAX_FACTS) {
        skipped++;
        continue;
      }
      facts.push({ fact: truncate(content.trim()), source });
    }
  }

  return { facts, skipped, source };
}

// ---------------------------------------------------------------------------
// Gemini export parser
// Gemini Takeout produces a JSON with { conversations: [{ messages: [] }] }.
// We grab user turns that state preferences / facts.
// ---------------------------------------------------------------------------

interface GeminiMessage {
  author?: string;
  content?: string;
  text?: string;
}

interface GeminiExport {
  conversations?: Array<{ messages?: GeminiMessage[] }>;
}

const PREFERENCE_PATTERNS = [
  /\bi (?:prefer|like|love|use|always|never|want|need|am|have|work)/i,
  /\bmy (?:preference|style|stack|language|tool|workflow|setup)/i,
  /\bplease (?:always|never|don't|do)/i,
  /\bremember that\b/i,
];

function looksLikeFact(text: string): boolean {
  return PREFERENCE_PATTERNS.some((re) => re.test(text));
}

export function parseGeminiExport(jsonText: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { facts: [], skipped: 0, source: 'gemini' };
  }

  const source: ImportSource = 'gemini';
  const facts: ImportedFact[] = [];
  let skipped = 0;

  const data = parsed as GeminiExport;
  for (const conv of data.conversations ?? []) {
    for (const msg of conv.messages ?? []) {
      if (msg.author !== 'user' && msg.author !== '0') continue;
      const text = (msg.content ?? msg.text ?? '').trim();
      if (!isNonEmpty(text) || !looksLikeFact(text)) continue;
      if (facts.length >= MAX_FACTS) {
        skipped++;
        continue;
      }
      facts.push({ fact: truncate(text), source });
    }
  }

  return { facts, skipped, source };
}

// ---------------------------------------------------------------------------
// Plain text / Notes app parser
// Lines or blank-line-separated paragraphs become individual facts.
// Very short lines (< 10 chars) are skipped.
// ---------------------------------------------------------------------------

export function parsePlainText(text: string): ImportResult {
  const source: ImportSource = 'text';
  const facts: ImportedFact[] = [];
  let skipped = 0;

  // Split on blank lines first; fall back to newlines
  const blocks = text.split(/\n{2,}/).flatMap((b) => {
    const trimmed = b.trim();
    if (!trimmed) return [];
    // If block is short (single line), keep as-is; otherwise split by newline
    if (!trimmed.includes('\n')) return [trimmed];
    return trimmed
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  });

  for (const block of blocks) {
    if (block.length < 10) {
      skipped++;
      continue;
    }
    if (!isNonEmpty(block)) {
      skipped++;
      continue;
    }
    if (facts.length >= MAX_FACTS) {
      skipped++;
      continue;
    }
    facts.push({ fact: truncate(block), source });
  }

  return { facts, skipped, source };
}

// ---------------------------------------------------------------------------
// Unified entry point — detect format from file content
// ---------------------------------------------------------------------------

export function detectSourceFromFilename(filename: string): ImportSource {
  const lower = filename.toLowerCase();
  if (lower.includes('chatgpt') || lower === 'conversations.json') return 'chatgpt';
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('gemini') || lower.includes('bard')) return 'gemini';
  return 'text';
}

export async function parseImportFile(content: string, filename: string): Promise<ImportResult> {
  const source = detectSourceFromFilename(filename);

  if (filename.endsWith('.json') || filename.endsWith('.JSON')) {
    switch (source) {
      case 'chatgpt':
        return parseChatGPTExport(content);
      case 'claude':
        return parseClaudeExport(content);
      case 'gemini':
        return parseGeminiExport(content);
      default: {
        // Try each JSON parser; return whichever yields the most facts
        const results = [
          parseChatGPTExport(content),
          parseClaudeExport(content),
          parseGeminiExport(content),
        ];
        return results.reduce((best, r) => (r.facts.length > best.facts.length ? r : best));
      }
    }
  }

  return parsePlainText(content);
}
