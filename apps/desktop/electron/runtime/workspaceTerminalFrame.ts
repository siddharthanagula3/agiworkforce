import type { TerminalColor, TerminalScreen, TerminalStyle } from '@agiworkforce/types/protocol';
import {
  WORKSPACE_TERMINAL_MAX_COLUMNS as MAX_COLUMNS,
  WORKSPACE_TERMINAL_MAX_ROWS as MAX_ROWS,
} from '@agiworkforce/local-runtime-contract';

const ESC = '\u001b[';
const MAX_COLOR = 255;

function channel(value: number): number {
  return Math.max(0, Math.min(MAX_COLOR, Math.trunc(value) || 0));
}

function color(color: TerminalColor, layer: 38 | 48): string[] {
  switch (color.kind) {
    case 'indexed':
      return [String(layer), '5', String(channel(color.index))];
    case 'rgb':
      return [
        String(layer),
        '2',
        String(channel(color.red)),
        String(channel(color.green)),
        String(channel(color.blue)),
      ];
    default:
      return [];
  }
}

function style(style: TerminalStyle): string {
  const attributes = ['0'];
  if (style.bold) attributes.push('1');
  if (style.dim) attributes.push('2');
  if (style.italic) attributes.push('3');
  if (style.underline) attributes.push('4');
  if (style.inverse) attributes.push('7');
  attributes.push(...color(style.foreground, 38), ...color(style.background, 48));
  return `${ESC}${attributes.join(';')}m`;
}

function cursor(row: number, column: number): string {
  const safeRow = Math.max(1, Math.min(MAX_ROWS, Math.trunc(row) + 1 || 1));
  const safeColumn = Math.max(1, Math.min(MAX_COLUMNS, Math.trunc(column) + 1 || 1));
  return `${ESC}${safeRow};${safeColumn}H`;
}

export function workspaceTerminalFrame(
  screen: TerminalScreen,
  previouslyAlternate = false,
): string {
  const bufferSwitch =
    screen.alternateScreen === previouslyAlternate
      ? ''
      : `${ESC}?1049${screen.alternateScreen ? 'h' : 'l'}`;
  const lines = [`${bufferSwitch}${ESC}?25l${ESC}?7l${ESC}0m${ESC}2J`];
  let lastStyle = '';
  for (const [row, cells] of screen.cells.slice(0, MAX_ROWS).entries()) {
    lines.push(cursor(row, 0));
    for (const cell of cells.slice(0, MAX_COLUMNS)) {
      if (cell.width === 0) continue;
      const nextStyle = style(cell.style);
      if (nextStyle !== lastStyle) lines.push(nextStyle);
      lastStyle = nextStyle;
      const printable = cell.text.replace(/\p{Cc}/gu, '');
      lines.push(printable || (cell.width === 2 ? '  ' : ' '));
    }
  }
  lines.push(
    `${ESC}0m${ESC}?7h`,
    `${ESC}?1${screen.applicationCursor ? 'h' : 'l'}`,
    `\u001b${screen.applicationKeypad ? '=' : '>'}`,
    `${ESC}?2004${screen.bracketedPaste ? 'h' : 'l'}`,
    cursor(screen.cursorRow, screen.cursorColumn),
    `${ESC}?25${screen.hideCursor || screen.scrollback > 0 ? 'l' : 'h'}`,
  );
  return lines.join('');
}
