import { Platform } from 'react-native';
import { codeFontChoices, transcriptSerifFaces } from '@/src/ui/theme/tokens';
import type { CloudCodeDiffLineKind } from '@/src/features/cloud-code/presentation';

export type CodeFontId = (typeof codeFontChoices)[keyof typeof codeFontChoices][number]['id'];

export interface CodeFontOption {
  id: CodeFontId;
  label: string;
  family: string;
}

export const DEFAULT_CODE_FONT: CodeFontId = 'default';

export const TRANSCRIPT_FONT_IDS = ['system', 'serif', 'mono'] as const;
export type TranscriptFontId = (typeof TRANSCRIPT_FONT_IDS)[number];

export const DEFAULT_TRANSCRIPT_FONT: TranscriptFontId = 'system';

export const TRANSCRIPT_FONT_LABELS: Record<TranscriptFontId, string> = {
  system: 'System',
  serif: 'Serif',
  mono: 'Mono',
};

const ALL_CODE_FONT_IDS: ReadonlySet<string> = new Set(
  Object.values(codeFontChoices).flatMap((options) => options.map((option) => option.id)),
);

export function isCodeFontId(value: unknown): value is CodeFontId {
  return typeof value === 'string' && ALL_CODE_FONT_IDS.has(value);
}

export function isTranscriptFontId(value: unknown): value is TranscriptFontId {
  return typeof value === 'string' && (TRANSCRIPT_FONT_IDS as readonly string[]).includes(value);
}

export function codeFontOptions(): readonly CodeFontOption[] {
  return Platform.select<readonly CodeFontOption[]>(codeFontChoices);
}

export function codeFontOption(id: CodeFontId): CodeFontOption {
  const options = codeFontOptions();
  return options.find((option) => option.id === id) ?? options[0];
}

export function resolveCodeFontFamily(id: CodeFontId): string {
  return codeFontOption(id).family;
}

export function resolveTranscriptFontFamily(
  id: TranscriptFontId,
  codeFont: CodeFontId,
): string | undefined {
  if (id === 'serif') return Platform.select<string>(transcriptSerifFaces);
  if (id === 'mono') return resolveCodeFontFamily(codeFont);
  return undefined;
}

const DIFF_SIGN_WIDTH = 1;

export function diffLineText(
  line: string,
  kind: CloudCodeDiffLineKind,
  showSigns: boolean,
): string {
  if (!showSigns && (kind === 'added' || kind === 'removed')) {
    return ` ${line.slice(DIFF_SIGN_WIDTH)}`;
  }
  return line || ' ';
}

const DIFF_KIND_LABELS = { added: 'Added', removed: 'Removed' } as const;

export function diffLineAccessibilityLabel(
  line: string,
  kind: CloudCodeDiffLineKind,
): string | undefined {
  if (kind !== 'added' && kind !== 'removed') return undefined;
  return `${DIFF_KIND_LABELS[kind]}, ${line.slice(DIFF_SIGN_WIDTH).trim() || 'blank line'}`;
}
