import type { SavedShortcut } from '../../types';
import { planShortcutReplay } from '../background/shortcuts';

export interface SlashCommandMeta {
  display: string;
  prompt: string;
  captureContext: boolean;
  hint: string;
}

export const SLASH_COMMANDS: Record<string, SlashCommandMeta> = {
  '/summarize': {
    display: '/summarize',
    prompt:
      'Summarize this page concisely. Include key points, main arguments, and any important details.',
    captureContext: true,
    hint: 'Key points and main arguments of this page',
  },
  '/tldr': {
    display: '/tldr',
    prompt: 'Give me a TL;DR of this page in 2-3 sentences.',
    captureContext: true,
    hint: 'Two or three sentences, nothing more',
  },
  '/explain': {
    display: '/explain',
    prompt: 'Explain the content of this page in simple terms. Break down any complex concepts.',
    captureContext: true,
    hint: 'Plain-language explanation of this page',
  },
  '/translate': {
    display: '/translate',
    prompt:
      'Translate the main content of this page to English. If already in English, translate to Spanish.',
    captureContext: true,
    hint: 'Translate the page, add a language to choose',
  },
  '/extract': {
    display: '/extract',
    prompt:
      'Extract the key structured data from this page: names, dates, numbers, prices, and any tabular information.',
    captureContext: true,
    hint: 'Pull out names, dates, numbers and tables',
  },
  '/code': {
    display: '/code',
    prompt:
      'Extract and explain all code snippets on this page. For each snippet, describe what it does and suggest improvements.',
    captureContext: true,
    hint: 'Find and explain code on this page',
  },
};

export interface PromptShortcut {
  id: string;
  name: string;
  prompt: string;
}

export const SHORTCUT_INPUT_PLACEHOLDER = '{{input}}';

export function promptShortcutsFromSaved(value: unknown): PromptShortcut[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown): PromptShortcut[] => {
    if (!entry || typeof entry !== 'object') return [];
    const shortcut = entry as SavedShortcut;
    if (typeof shortcut.id !== 'string' || typeof shortcut.name !== 'string') return [];
    const plan = planShortcutReplay(shortcut);
    return plan.kind === 'prompt'
      ? [{ id: shortcut.id, name: shortcut.name, prompt: plan.prompt }]
      : [];
  });
}

const SHORTCUT_HINT_MAX_CHARS = 60;

export function shortcutCommand(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `/${slug}` : '';
}

export function shortcutCommandConflict(
  name: string,
  shortcuts: readonly PromptShortcut[],
  editingId?: string,
): 'unnamed' | 'taken' | null {
  const command = shortcutCommand(name);
  if (!command) return 'unnamed';
  if (
    SLASH_COMMANDS[command] ||
    shortcuts.some(
      (shortcut) => shortcut.id !== editingId && shortcutCommand(shortcut.name) === command,
    )
  ) {
    return 'taken';
  }
  return null;
}

function shortcutCommands(shortcuts: readonly PromptShortcut[]): Array<[string, PromptShortcut]> {
  const taken = new Set(Object.keys(SLASH_COMMANDS));
  const commands: Array<[string, PromptShortcut]> = [];
  for (const shortcut of shortcuts) {
    const command = shortcutCommand(shortcut.name);
    if (!command || taken.has(command)) continue;
    taken.add(command);
    commands.push([command, shortcut]);
  }
  return commands;
}

export function matchSlashCommands(
  fragment: string,
  shortcuts: readonly PromptShortcut[] = [],
): Array<[string, SlashCommandMeta]> {
  const q = fragment.trim().toLowerCase();
  if (!q.startsWith('/') || q.includes(' ')) return [];
  const saved = shortcutCommands(shortcuts).map(
    ([command, shortcut]): [string, SlashCommandMeta] => [
      command,
      {
        display: command,
        prompt: shortcut.prompt,
        captureContext: false,
        hint: shortcut.prompt.replace(/\s+/g, ' ').slice(0, SHORTCUT_HINT_MAX_CHARS),
      },
    ],
  );
  return [...Object.entries(SLASH_COMMANDS), ...saved].filter(([name]) => name.startsWith(q));
}

export function expandPromptShortcut(text: string, shortcuts: readonly PromptShortcut[]): string {
  const match = /^(\/\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return text;
  const command = match[1]!.toLowerCase();
  const shortcut = shortcutCommands(shortcuts).find(([candidate]) => candidate === command)?.[1];
  if (!shortcut) return text;
  const input = match[2]?.trim() ?? '';
  const expanded = shortcut.prompt.includes(SHORTCUT_INPUT_PLACEHOLDER)
    ? shortcut.prompt.split(SHORTCUT_INPUT_PLACEHOLDER).join(input)
    : [shortcut.prompt, input].filter(Boolean).join('\n\n');
  return expanded.trim() || text;
}

export function expandSlashCommand(
  raw: string,
): { display: string; prompt: string; captureContext: boolean } | null {
  const trimmed = raw.trim();
  const exact = SLASH_COMMANDS[trimmed];
  if (exact) return exact;

  for (const [cmd, meta] of Object.entries(SLASH_COMMANDS)) {
    if (trimmed.startsWith(cmd + ' ')) {
      const extra = trimmed.slice(cmd.length + 1).trim();
      return {
        display: trimmed,
        prompt: `${meta.prompt}\n\nAdditional instruction: ${extra}`,
        captureContext: meta.captureContext,
      };
    }
  }

  return null;
}
