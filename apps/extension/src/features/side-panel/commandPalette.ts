import { t } from '../../i18n';
import { el } from './dom';

export type PaletteSection = 'go' | 'chats';

export interface PaletteCommand {
  id: string;
  label: string;
  section: PaletteSection;
  detail?: string;
  run: () => void;
}

export interface CommandPaletteAPI {
  open(trigger: HTMLElement | null): void;
  close(): void;
}

const RECENT_CHATS_WITHOUT_QUERY = 5;
const CHAT_MATCH_LIMIT = 20;
const SECTIONS: readonly PaletteSection[] = ['go', 'chats'];

export const COMMAND_PALETTE_CSS = `
  .sp-palette-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal-raised);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 56px 12px 12px;
    background: var(--agi-ext-scrim);
  }
  .sp-palette-backdrop[hidden] { display: none; }
  .sp-palette {
    display: flex;
    flex-direction: column;
    width: min(480px, 100%);
    max-height: min(420px, calc(100vh - 80px));
    overflow: hidden;
    border: 1px solid var(--agi-ext-border-strong);
    border-radius: var(--corner-surface);
    background: var(--agi-ext-surface);
    box-shadow: var(--agi-ext-elevation-4);
  }
  .sp-palette-input {
    box-sizing: border-box;
    width: 100%;
    min-height: var(--control-lg);
    padding: 10px 14px;
    border: 0;
    border-bottom: 1px solid var(--agi-ext-border);
    background: transparent;
    color: var(--agi-ext-text);
    font: inherit;
    font-size: var(--type-body-size);
    line-height: var(--type-body-height);
  }
  .sp-palette-input::placeholder { color: var(--agi-ext-text-placeholder); }
  .sp-palette-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
  .sp-palette-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; }
  .sp-palette-heading {
    padding: 8px 8px 4px;
    color: var(--agi-ext-text-muted);
    font-size: var(--type-caption-size);
    font-weight: 600;
    line-height: var(--type-caption-height);
  }
  .sp-palette-option {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    min-height: var(--control-md);
    padding: 6px 8px;
    border-radius: var(--corner-control);
    color: var(--agi-ext-text);
    cursor: pointer;
    font-size: var(--type-body-size);
    line-height: var(--type-body-height);
  }
  .sp-palette-option[aria-selected='true'] { background: var(--agi-ext-hover); }
  .sp-palette-option-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sp-palette-option-detail {
    flex-shrink: 0;
    color: var(--agi-ext-text-muted);
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
  }
  .sp-palette-empty {
    margin: 0;
    padding: 14px;
    color: var(--agi-ext-text-muted);
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
  }
  .sp-palette-empty:empty { padding: 0; }
  @media (pointer: coarse) {
    .sp-palette-option { min-height: 44px; align-items: center; }
  }
`;

function matchRank(label: string, query: string): number | null {
  if (!query) return 0;
  const text = label.toLowerCase();
  if (text.startsWith(query)) return 0;
  if (text.split(/[\s/._-]+/).some((word) => word.startsWith(query))) return 1;
  return text.includes(query) ? 2 : null;
}

function sectionHeading(section: PaletteSection): string {
  return section === 'go' ? t('spPaletteGoTo') : t('spPaletteChats');
}

export function buildCommandPalette(load: () => Promise<PaletteCommand[]>): CommandPaletteAPI {
  const backdrop = el('div', { class: 'sp-palette-backdrop', hidden: '' });
  const dialog = el('div', {
    class: 'sp-palette',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('spPaletteLabel'),
  });
  const input = el('input', {
    class: 'sp-palette-input',
    type: 'text',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'sp-palette-list',
    'aria-autocomplete': 'list',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: t('spPalettePlaceholder'),
    'aria-label': t('spPalettePlaceholder'),
  });
  const list = el('div', {
    class: 'sp-palette-list',
    id: 'sp-palette-list',
    role: 'listbox',
    'aria-label': t('spPaletteLabel'),
  });
  const empty = el('p', { class: 'sp-palette-empty', role: 'status' });
  dialog.appendChild(input);
  dialog.appendChild(list);
  dialog.appendChild(empty);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  let commands: PaletteCommand[] = [];
  let visible: PaletteCommand[] = [];
  let active = 0;
  let returnFocus: HTMLElement | null = null;
  let generation = 0;

  function filtered(): PaletteCommand[] {
    const query = input.value.trim().toLowerCase();
    return SECTIONS.flatMap((section) => {
      const ranked = commands
        .filter((command) => command.section === section)
        .flatMap((command, index) => {
          const rank = matchRank(command.label, query);
          return rank === null ? [] : [{ command, rank, index }];
        })
        .sort((left, right) => left.rank - right.rank || left.index - right.index)
        .map((entry) => entry.command);
      if (section !== 'chats') return ranked;
      return ranked.slice(0, query ? CHAT_MATCH_LIMIT : RECENT_CHATS_WITHOUT_QUERY);
    });
  }

  function optionId(index: number): string {
    return `sp-palette-option-${index}`;
  }

  function highlight(next: number): void {
    const options = list.querySelectorAll<HTMLElement>('[role="option"]');
    options.forEach((option, index) =>
      option.setAttribute('aria-selected', String(index === next)),
    );
    active = next;
    if (visible.length === 0) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    input.setAttribute('aria-activedescendant', optionId(next));
    options[next]?.scrollIntoView({ block: 'nearest' });
  }

  function render(): void {
    visible = filtered();
    list.replaceChildren();
    let index = 0;
    for (const section of SECTIONS) {
      const entries = visible.filter((command) => command.section === section);
      if (entries.length === 0) continue;
      const headingId = `sp-palette-heading-${section}`;
      const group = el('div', { role: 'group', 'aria-labelledby': headingId });
      group.appendChild(
        el('div', { class: 'sp-palette-heading', id: headingId }, sectionHeading(section)),
      );
      for (const command of entries) {
        const position = index;
        const option = el('div', {
          class: 'sp-palette-option',
          id: optionId(position),
          role: 'option',
          'aria-selected': 'false',
        });
        option.appendChild(el('span', { class: 'sp-palette-option-label' }, command.label));
        if (command.detail) {
          option.appendChild(el('span', { class: 'sp-palette-option-detail' }, command.detail));
        }
        option.addEventListener('mousedown', (event) => event.preventDefault());
        option.addEventListener('mousemove', () => {
          if (active !== position) highlight(position);
        });
        option.addEventListener('click', () => run(position));
        group.appendChild(option);
        index += 1;
      }
      list.appendChild(group);
    }
    empty.textContent = visible.length === 0 ? t('spPaletteEmpty') : '';
    highlight(Math.min(active, Math.max(0, visible.length - 1)));
  }

  function close(): void {
    if (backdrop.hidden) return;
    generation += 1;
    backdrop.hidden = true;
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus();
  }

  function run(index: number): void {
    const command = visible[index];
    if (!command) return;
    close();
    command.run();
  }

  function open(trigger: HTMLElement | null): void {
    returnFocus = trigger;
    input.value = '';
    active = 0;
    commands = [];
    backdrop.hidden = false;
    render();
    input.focus();
    const current = ++generation;
    void load()
      .then((loaded) => {
        if (current !== generation) return;
        commands = loaded;
        render();
      })
      .catch(() => undefined);
  }

  input.addEventListener('input', () => {
    active = 0;
    render();
  });
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (visible.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlight((active + step + visible.length) % visible.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      event.preventDefault();
    }
  });
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close();
  });

  return { open, close };
}
