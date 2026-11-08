import { MAX_VALUE_LENGTH } from '../../background/policy';
import { t } from '../../i18n';
import { pageChipLabel } from '../../utils';
import {
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';
import {
  parseEditableSelectionTarget,
  type EditableSelectionTarget,
} from '../browser-tools/editableTarget';
import type {
  ApplyEditableSelectionMessage,
  UndoEditableSelectionMessage,
  EditableSelectionResponse,
} from '../../types';
import { el } from './dom';

interface RewriteEntry {
  target: EditableSelectionTarget;
  conversationId: string;
  state: 'ready' | 'inserted' | 'restored';
  undoAvailable: boolean;
  insertedText?: string;
  busy?: boolean;
  error?: string;
  status?: string;
}

export interface EditableRewriteDependencies {
  context(): { owner: ManagedCloudOwner | null; conversationId: string; streaming: boolean };
  send(
    message: ApplyEditableSelectionMessage | UndoEditableSelectionMessage,
  ): Promise<EditableSelectionResponse>;
  changed(): void;
}

export class EditableRewriteController {
  private target: { target: EditableSelectionTarget; conversationId: string } | null = null;
  private entries = new Map<string, RewriteEntry>();
  private preview: HTMLDialogElement | null = null;

  constructor(private readonly dependencies: EditableRewriteDependencies) {}

  current(): EditableSelectionTarget | null {
    const current = this.dependencies.context();
    return this.target?.conversationId === current.conversationId &&
      sameManagedCloudOwner(this.target.target.owner, current.owner)
      ? this.target.target
      : null;
  }

  stage(value: unknown): EditableSelectionTarget {
    const target = parseEditableSelectionTarget(value);
    const context = this.dependencies.context();
    if (!target || !sameManagedCloudOwner(target.owner, context.owner))
      throw new Error(t('spRewriteAccountChanged'));
    this.reset();
    this.target = { target, conversationId: context.conversationId };
    this.dependencies.changed();
    return target;
  }

  bind(messageId: string, target: EditableSelectionTarget): void {
    const context = this.dependencies.context();
    if (!sameManagedCloudOwner(target.owner, context.owner) || this.current()?.id !== target.id)
      return;
    this.entries.set(messageId, {
      target,
      conversationId: context.conversationId,
      state: 'ready',
      undoAvailable: false,
    });
  }

  reset(): void {
    this.target = null;
    this.entries.clear();
    this.preview?.remove();
    this.preview = null;
  }

  prune(messageIds: ReadonlySet<string>): void {
    for (const id of this.entries.keys()) if (!messageIds.has(id)) this.entries.delete(id);
  }

  invalidateTab(tabId: number): void {
    if (
      this.target?.target.tabId === tabId ||
      [...this.entries.values()].some((entry) => entry.target.tabId === tabId)
    )
      this.cancel();
  }

  cancel(): void {
    if (!this.target && this.entries.size === 0 && !this.preview) return;
    this.reset();
    this.dependencies.changed();
  }

  private owns(entry: RewriteEntry): boolean {
    const current = this.dependencies.context();
    return (
      [...this.entries.values()].includes(entry) &&
      !current.streaming &&
      current.conversationId === entry.conversationId &&
      sameManagedCloudOwner(current.owner, entry.target.owner)
    );
  }

  renderChip(): HTMLElement | null {
    const target = this.current();
    if (!target) return null;
    const chip = el('div', {
      class: 'sp-attachment-chip sp-attachment-doc sp-editable-target',
      title: target.selectedText,
    });
    chip.appendChild(
      el('span', {}, t('spRewriteTarget', [target.label, pageChipLabel(target.url)])),
    );
    const remove = el(
      'button',
      { type: 'button', class: 'sp-attachment-remove', 'aria-label': t('spRewriteCancelTarget') },
      '×',
    );
    remove.addEventListener('click', () => this.cancel());
    chip.appendChild(remove);
    return chip;
  }

  isApplying(): boolean {
    return [...this.entries.values()].some((entry) => entry.busy);
  }

  hasActiveEdits(): boolean {
    return (
      this.current() !== null ||
      [...this.entries.values()].some(
        (entry) =>
          this.owns(entry) &&
          (entry.state === 'ready' || entry.undoAvailable || entry.busy === true),
      )
    );
  }

  private async perform(entry: RewriteEntry, text: string, mode: 'insert' | 'undo'): Promise<void> {
    if (entry.busy || !this.owns(entry)) return;
    if (
      (mode === 'insert' && (entry.state !== 'ready' || this.current()?.id !== entry.target.id)) ||
      (mode === 'undo' && (entry.state !== 'inserted' || !entry.undoAvailable))
    )
      return;
    entry.busy = true;
    entry.error = undefined;
    entry.status = mode === 'insert' ? t('spRewriteInserting') : t('spRewriteRestoring');
    this.dependencies.changed();
    try {
      if (text.length > MAX_VALUE_LENGTH) throw new Error(t('spRewriteTooLong'));
      const common = {
        tabId: entry.target.tabId,
        pageUrl: entry.target.url,
        documentId: entry.target.documentId,
        selectionId: entry.target.id,
        owner: entry.target.owner,
      };
      const response = await this.dependencies.send(
        mode === 'insert'
          ? { ...common, type: 'APPLY_EDITABLE_SELECTION', text }
          : { ...common, type: 'UNDO_EDITABLE_SELECTION' },
      );
      if (!this.owns(entry)) return;
      if (mode === 'insert' && response.applied) {
        entry.state = 'inserted';
        entry.insertedText = text;
        entry.undoAvailable = response.undoAvailable === true;
        this.target = null;
      }
      if (response.success !== true || response.verified !== true)
        throw new Error(response.error ?? t('spRewriteInsertFailed'));
      entry.state = mode === 'insert' ? 'inserted' : 'restored';
      if (mode === 'insert') entry.insertedText = text;
      entry.undoAvailable = mode === 'insert' && response.undoAvailable === true;
      entry.status = mode === 'insert' ? t('spRewriteInserted') : t('spRewriteRestored');
      this.target = null;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : t('spRewriteInsertFailed');
    } finally {
      entry.busy = false;
      if (this.owns(entry)) this.dependencies.changed();
    }
  }

  renderAction(messageId: string, draft: string): HTMLElement | null {
    const entry = this.entries.get(messageId);
    if (!entry || !this.owns(entry)) return null;
    if (entry.state === 'ready' && (this.current()?.id !== entry.target.id || !draft.trim()))
      return null;
    const row = el('div', { class: 'sp-editable-action' });
    row.appendChild(
      el(
        'span',
        { class: 'sp-connector-input__hint' },
        entry.state === 'ready'
          ? t('spRewriteDraftFor', [entry.target.label])
          : entry.state === 'inserted'
            ? t('spRewriteInsertedInto', [entry.target.label])
            : t('spRewriteRestoredIn', [entry.target.label]),
      ),
    );
    if (entry.state === 'ready' || entry.undoAvailable) {
      const mode = entry.state === 'ready' ? 'insert' : 'undo';
      const action = el(
        'button',
        { type: 'button', class: 'sp-agent-approval__button' },
        mode === 'insert' ? t('spRewriteInsert') : t('spRewriteUndo'),
      );
      action.disabled =
        entry.busy === true || (mode === 'insert' && draft.length > MAX_VALUE_LENGTH);
      action.addEventListener(
        'click',
        () => void this.perform(entry, entry.insertedText ?? draft, mode),
      );
      row.appendChild(action);
    }
    if (entry.state === 'ready') {
      const edit = el(
        'button',
        { type: 'button', class: 'sp-agent-approval__button' },
        t('spRewriteEditDraft'),
      );
      edit.disabled = entry.busy === true;
      edit.addEventListener('click', () => this.openPreview(entry, draft));
      row.appendChild(edit);
    }
    if (entry.busy || entry.error)
      row.appendChild(
        el(
          'span',
          { class: 'sp-connector-input__hint', role: entry.error ? 'alert' : 'status' },
          entry.error ?? entry.status ?? '',
        ),
      );
    return row;
  }

  private openPreview(entry: RewriteEntry, draft: string): void {
    if (!this.owns(entry)) return;
    this.preview?.remove();
    const restoreFocus = document.activeElement as HTMLElement | null;
    const dialog = el('dialog', { class: 'sp-context-handoff-dialog sp-editable-preview' });
    this.preview = dialog;
    const titleId = `sp-rewrite-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.appendChild(el('h2', { id: titleId }, t('spRewriteReviewTitle')));
    dialog.appendChild(
      el('p', {}, t('spRewriteTarget', [entry.target.label, pageChipLabel(entry.target.url)])),
    );
    dialog.appendChild(el('span', { class: 'sp-connector-input__label' }, t('spRewriteOriginal')));
    dialog.appendChild(
      el(
        'pre',
        { class: 'sp-context-handoff-preview sp-editable-preview__original' },
        entry.target.selectedText,
      ),
    );
    const inputId = `${titleId}-replacement`;
    dialog.appendChild(
      el('label', { for: inputId, class: 'sp-connector-input__label' }, t('spRewriteReplacement')),
    );
    const input = el('textarea', {
      id: inputId,
      class: 'sp-connector-input__control sp-editable-preview__replacement',
      rows: '8',
      maxlength: String(MAX_VALUE_LENGTH),
    });
    input.value = entry.insertedText ?? draft;
    dialog.appendChild(input);
    dialog.appendChild(el('p', {}, t('spRewriteInsertionScope')));
    const status = el('p', {
      class: 'sp-context-handoff-status',
      role: 'status',
      'aria-live': 'polite',
    });
    const actions = el('div', { class: 'sp-context-handoff-actions' });
    const close = el('button', { type: 'button' }, t('spRewriteCancel'));
    const undo = el('button', { type: 'button' }, t('spRewriteUndo'));
    const insert = el(
      'button',
      { type: 'button', class: 'sp-context-handoff-approve' },
      t('spRewriteInsert'),
    );
    actions.append(close, undo, insert);
    dialog.append(status, actions);
    let busy = false;
    const update = () => {
      const inserted = entry.state !== 'ready';
      insert.disabled = busy || inserted || input.value.length > MAX_VALUE_LENGTH;
      input.disabled = busy || inserted;
      undo.hidden = !entry.undoAvailable;
      undo.disabled = busy;
      close.disabled = busy;
      close.textContent = inserted ? t('spRewriteClose') : t('spRewriteCancel');
      if (!inserted && input.value.length > MAX_VALUE_LENGTH)
        status.textContent = t('spRewriteTooLong');
    };
    const destroy = () => {
      dialog.remove();
      if (this.preview === dialog) this.preview = null;
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
    close.addEventListener('click', destroy);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!busy) destroy();
    });
    input.addEventListener('input', update);
    const execute = async (mode: 'insert' | 'undo') => {
      if (busy || !this.owns(entry)) return;
      busy = true;
      update();
      status.textContent = mode === 'insert' ? t('spRewriteInserting') : t('spRewriteRestoring');
      await this.perform(entry, input.value, mode);
      busy = false;
      if (this.preview !== dialog) return;
      if (!this.owns(entry)) {
        destroy();
        return;
      }
      status.textContent = entry.error ?? entry.status ?? '';
      update();
      (entry.undoAvailable ? undo : close).focus();
    };
    insert.addEventListener('click', () => void execute('insert'));
    undo.addEventListener('click', () => void execute('undo'));
    update();
    document.body.appendChild(dialog);
    dialog.showModal();
    (entry.state === 'ready' ? input : close).focus();
  }
}
