import {
  acceptConnectorInput,
  connectorInputFieldError,
  dismissConnectorInput,
  initialConnectorInputDraft,
  readConnectorInputPrompts,
  type AgentActivityToolEntry,
  type ConnectorInputDraft,
  type ConnectorInputDraftValue,
  type ConnectorInputField,
  type ConnectorInputPrompt,
  type ConnectorInputResponse,
} from '@agiworkforce/client-runtime';
import { renderIcon, CircleAlert, ExternalLink, Loader2 } from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';

export interface ConnectorInputBinding {
  answered: ReadonlySet<string>;
  sending: boolean;
  error?: string;
  onRespond?: (toolCallId: string, responses: Record<string, ConnectorInputResponse>) => void;
}

type LinkPrompt = Extract<ConnectorInputPrompt, { mode: 'url' }>;
type TextField = Extract<ConnectorInputField, { kind: 'text' }>;

interface ConnectorInputMemory {
  drafts: Record<string, ConnectorInputDraft>;
  opened: Set<string>;
  attempted: boolean;
}

interface FieldView {
  promptKey: string;
  field: ConnectorInputField;
  described: HTMLElement;
  controls: HTMLElement[];
  hintId: string | null;
  error: HTMLElement;
}

const QUALIFIED_TOOL_NAME = /^mcp__([^_][^_]*)__(.+)$/;
const CUSTOM_CONNECTOR_PREFIX = 'custom-';
const DATE_INPUT_TYPES = { date: 'date', 'date-time': 'datetime-local' } as const;
const TEXT_INPUT_TYPES = { email: 'email', uri: 'url' } as const;
const MAX_REMEMBERED_FORMS = 32;

const memories = new Map<string, ConnectorInputMemory>();
let nextElementId = 0;

function elementId(): string {
  nextElementId += 1;
  return `sp-connector-input-${nextElementId}`;
}

function humanizeName(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function serverLabel(connectorId: string, toolName: string): string {
  const serverId = connectorId || QUALIFIED_TOOL_NAME.exec(toolName)?.[1] || toolName;
  return serverId.startsWith(CUSTOM_CONNECTOR_PREFIX)
    ? t('spConnectorInputCustomServer')
    : humanizeName(serverId);
}

function toolLabel(toolName: string): string {
  const tool = QUALIFIED_TOOL_NAME.exec(toolName)?.[2];
  return tool ? humanizeName(tool) : toolName;
}

function rememberedForm(
  key: string,
  prompts: readonly ConnectorInputPrompt[],
): ConnectorInputMemory {
  const existing = memories.get(key);
  if (existing) return existing;
  const created: ConnectorInputMemory = {
    drafts: Object.fromEntries(
      prompts.flatMap((prompt): [string, ConnectorInputDraft][] =>
        prompt.mode === 'form' ? [[prompt.key, initialConnectorInputDraft(prompt.fields)]] : [],
      ),
    ),
    opened: new Set(),
    attempted: false,
  };
  memories.set(key, created);
  for (const stale of memories.keys()) {
    if (memories.size <= MAX_REMEMBERED_FORMS) break;
    memories.delete(stale);
  }
  return created;
}

function textInputType(field: TextField): string {
  if (field.format === 'date' || field.format === 'date-time') {
    return DATE_INPUT_TYPES[field.format];
  }
  if (field.format === 'email' || field.format === 'uri') return TEXT_INPUT_TYPES[field.format];
  return 'text';
}

function fieldTitle(field: ConnectorInputField): (Node | string)[] {
  return field.required
    ? [field.title]
    : [
        field.title,
        ' ',
        el('span', { class: 'sp-connector-input__optional' }, t('spConnectorInputOptional')),
      ];
}

function buildFieldView(
  promptKey: string,
  field: ConnectorInputField,
  value: ConnectorInputDraftValue | undefined,
  disabled: boolean,
  onChange: (value: ConnectorInputDraftValue) => void,
): { root: HTMLElement; view: FieldView } {
  const id = elementId();
  const hintId = field.description ? `${id}-hint` : null;
  const hint = field.description
    ? el('p', { class: 'sp-connector-input__hint', id: `${id}-hint` }, field.description)
    : null;
  const error = el('p', { class: 'sp-connector-input__error', id: `${id}-error` });
  error.hidden = true;

  if (field.kind === 'boolean') {
    const box = el('input', { class: 'sp-connector-input__check', type: 'checkbox', id });
    box.checked = value === true;
    box.disabled = disabled;
    box.addEventListener('change', () => onChange(box.checked));
    const root = el(
      'div',
      { class: 'sp-connector-input__field' },
      el(
        'div',
        { class: 'sp-connector-input__check-row' },
        box,
        el('label', { class: 'sp-connector-input__label', for: id }, ...fieldTitle(field)),
      ),
    );
    if (hint) root.appendChild(hint);
    root.appendChild(error);
    return { root, view: { promptKey, field, described: box, controls: [box], hintId, error } };
  }

  if (field.kind === 'choices') {
    const selected = new Set(Array.isArray(value) ? value : []);
    const root = el(
      'fieldset',
      { class: 'sp-connector-input__field' },
      el('legend', { class: 'sp-connector-input__label' }, ...fieldTitle(field)),
    );
    if (hint) root.appendChild(hint);
    const boxes = field.options.map((option, index) => {
      const optionId = `${id}-${index}`;
      const box = el('input', {
        class: 'sp-connector-input__check',
        type: 'checkbox',
        id: optionId,
      });
      box.checked = selected.has(option.value);
      box.disabled = disabled;
      box.addEventListener('change', () => {
        if (box.checked) selected.add(option.value);
        else selected.delete(option.value);
        onChange(field.options.map((entry) => entry.value).filter((entry) => selected.has(entry)));
      });
      root.appendChild(
        el(
          'div',
          { class: 'sp-connector-input__check-row' },
          box,
          el('label', { for: optionId }, option.label),
        ),
      );
      return box;
    });
    root.appendChild(error);
    return { root, view: { promptKey, field, described: root, controls: boxes, hintId, error } };
  }

  const label = el('label', { class: 'sp-connector-input__label', for: id }, ...fieldTitle(field));
  let control: HTMLInputElement | HTMLSelectElement;
  if (field.kind === 'choice') {
    const select = el('select', { class: 'sp-connector-input__control', id });
    const empty = el(
      'option',
      { value: '' },
      field.required ? t('spConnectorInputChooseOne') : t('spConnectorInputNotSet'),
    );
    empty.disabled = field.required;
    select.appendChild(empty);
    for (const option of field.options) {
      select.appendChild(el('option', { value: option.value }, option.label));
    }
    select.value = typeof value === 'string' ? value : '';
    select.addEventListener('change', () => onChange(select.value));
    control = select;
  } else {
    const input = el('input', {
      class: 'sp-connector-input__control',
      id,
      type: field.kind === 'number' ? 'number' : textInputType(field),
    });
    if (field.kind === 'number') {
      input.inputMode = field.integer ? 'numeric' : 'decimal';
      input.step = field.integer ? '1' : 'any';
      if (field.minimum !== undefined) input.min = String(field.minimum);
      if (field.maximum !== undefined) input.max = String(field.maximum);
    } else {
      if (field.minLength !== undefined) input.minLength = field.minLength;
      if (field.maxLength !== undefined) input.maxLength = field.maxLength;
    }
    input.value = typeof value === 'string' ? value : '';
    input.addEventListener('input', () => onChange(input.value));
    control = input;
  }
  control.required = field.required;
  control.disabled = disabled;
  const root = el('div', { class: 'sp-connector-input__field' }, label);
  if (hint) root.appendChild(hint);
  root.appendChild(control);
  root.appendChild(error);
  return {
    root,
    view: { promptKey, field, described: control, controls: [control], hintId, error },
  };
}

function showFieldError(view: FieldView, message: string | null): void {
  view.error.textContent = message ?? '';
  view.error.hidden = message === null;
  const describedBy = [view.hintId, message === null ? null : view.error.id]
    .filter((part): part is string => part !== null)
    .join(' ');
  if (describedBy) view.described.setAttribute('aria-describedby', describedBy);
  else view.described.removeAttribute('aria-describedby');
  for (const control of view.controls) {
    if (message === null) control.removeAttribute('aria-invalid');
    else control.setAttribute('aria-invalid', 'true');
  }
}

function buildLinkPrompt(
  prompt: LinkPrompt,
  opened: boolean,
  disabled: boolean,
  onOpen: (status: HTMLElement) => void,
): HTMLElement {
  const root = el('div', { class: 'sp-connector-input__prompt' });
  if (prompt.message) {
    root.appendChild(el('p', { class: 'sp-connector-input__message' }, prompt.message));
  }
  const { link } = prompt;
  root.appendChild(
    link
      ? el(
          'p',
          { class: 'sp-connector-input__address' },
          link.prefix,
          el('strong', {}, link.host),
          link.rest,
        )
      : el('p', { class: 'sp-connector-input__address' }, prompt.url),
  );
  if (link?.punycode) {
    root.appendChild(
      el(
        'p',
        { class: 'sp-connector-input__warning' },
        renderIcon(CircleAlert, 14),
        t('spConnectorInputPunycode'),
      ),
    );
  }
  if (!link?.openable) {
    root.appendChild(
      el('p', { class: 'sp-connector-input__meta' }, t('spConnectorInputLinkUnopenable')),
    );
    return root;
  }
  const status = el(
    'span',
    { class: 'sp-connector-input__meta', role: 'status' },
    opened ? t('spConnectorInputLinkOpened') : '',
  );
  const open = el(
    'button',
    { class: 'sp-agent-approval__button sp-connector-input__open', type: 'button' },
    renderIcon(ExternalLink, 14),
    t('spConnectorInputOpenLink', [link.host]),
  );
  open.disabled = disabled;
  open.addEventListener('click', () => onOpen(status));
  root.appendChild(el('div', { class: 'sp-connector-input__actions' }, open, status));
  return root;
}

export function buildConnectorInputForm(
  entry: AgentActivityToolEntry,
  binding: ConnectorInputBinding | undefined,
): HTMLElement | null {
  const request = entry.inputRequest;
  const requests = request?.inputRequests;
  if (!request || !requests || typeof requests !== 'object' || Array.isArray(requests)) {
    return null;
  }
  const prompts = readConnectorInputPrompts(requests as Record<string, unknown>);
  const headingId = elementId();
  const section = el('section', { class: 'sp-connector-input', 'aria-labelledby': headingId });
  section.appendChild(
    el(
      'p',
      { class: 'sp-connector-input__heading', id: headingId },
      t('spConnectorInputHeading', [serverLabel(request.connectorId, entry.name)]),
    ),
  );
  section.appendChild(
    el(
      'p',
      { class: 'sp-connector-input__meta' },
      t('spConnectorInputForTool', [toolLabel(entry.name)]),
    ),
  );
  if (!binding) {
    section.appendChild(
      el('p', { class: 'sp-connector-input__meta' }, t('spConnectorInputExpired')),
    );
    return section;
  }

  const answered = binding.answered.has(entry.toolCallId);
  const sending = answered && binding.sending;
  const respond = binding.onRespond;
  const interactive = !answered && respond !== undefined;
  const memory = rememberedForm(`${entry.toolCallId}:${request.round}`, prompts);
  const acceptable =
    prompts.some((prompt) => prompt.mode !== 'unsupported') &&
    prompts.every(
      (prompt) => prompt.mode === 'form' || (prompt.mode === 'url' && prompt.link?.openable),
    );
  const asksForFields = prompts.some((prompt) => prompt.mode === 'form');
  const linksOpened = (): boolean =>
    prompts.every((prompt) => prompt.mode !== 'url' || memory.opened.has(prompt.key));
  const views: FieldView[] = [];
  const form = el('form', { class: 'sp-connector-input__form', novalidate: '' });

  const fieldErrors = (): Map<FieldView, string> =>
    new Map(
      views.flatMap((view): [FieldView, string][] => {
        const message = connectorInputFieldError(
          view.field,
          memory.drafts[view.promptKey]?.[view.field.key],
        );
        return message === null ? [] : [[view, message]];
      }),
    );
  const openFirst = el(
    'p',
    { class: 'sp-connector-input__meta' },
    t('spConnectorInputOpenLinkFirst'),
  );
  const submit = el('button', {
    class:
      'sp-agent-approval__button sp-agent-approval__button--approve sp-connector-input__submit',
    type: 'submit',
  });
  const refresh = (): void => {
    const opened = linksOpened();
    openFirst.hidden = !acceptable || opened;
    submit.disabled = !interactive || !opened;
    if (!memory.attempted) return;
    const errors = fieldErrors();
    for (const view of views) showFieldError(view, errors.get(view) ?? null);
  };

  for (const prompt of prompts) {
    if (prompt.mode === 'unsupported') {
      form.appendChild(
        el('p', { class: 'sp-connector-input__meta' }, t('spConnectorInputUnsupported')),
      );
      continue;
    }
    if (prompt.mode === 'url') {
      form.appendChild(
        buildLinkPrompt(prompt, memory.opened.has(prompt.key), !interactive, (status) => {
          if (!interactive || !prompt.link?.openable) return;
          window.open(prompt.link.href, '_blank', 'noopener,noreferrer');
          memory.opened.add(prompt.key);
          status.textContent = t('spConnectorInputLinkOpened');
          refresh();
        }),
      );
      continue;
    }
    const group = el('div', { class: 'sp-connector-input__prompt' });
    if (prompt.message) {
      group.appendChild(el('p', { class: 'sp-connector-input__message' }, prompt.message));
    }
    for (const field of prompt.fields) {
      const { root, view } = buildFieldView(
        prompt.key,
        field,
        memory.drafts[prompt.key]?.[field.key],
        !interactive,
        (value) => {
          memory.drafts[prompt.key] = { ...memory.drafts[prompt.key], [field.key]: value };
          refresh();
        },
      );
      views.push(view);
      group.appendChild(root);
    }
    form.appendChild(group);
  }

  if (answered && !sending) {
    form.appendChild(
      el('p', { class: 'sp-connector-input__meta', role: 'status' }, t('spConnectorInputSent')),
    );
  } else if (respond || sending) {
    if (binding.error) {
      form.appendChild(
        el('p', { class: 'sp-agent-approval__error', role: 'alert' }, binding.error),
      );
    }
    form.appendChild(openFirst);
    const actions = el('div', { class: 'sp-connector-input__actions' });
    if (acceptable) {
      if (sending) {
        submit.setAttribute('aria-busy', 'true');
        submit.appendChild(renderIcon(Loader2, 14));
      }
      submit.appendChild(
        document.createTextNode(
          sending
            ? t('spConnectorInputSending')
            : asksForFields
              ? t('spConnectorInputSubmit')
              : t('spConnectorInputContinue'),
        ),
      );
      actions.appendChild(submit);
    }
    const decline = el(
      'button',
      { class: 'sp-agent-approval__button', type: 'button' },
      t('spConnectorInputDecline'),
    );
    const cancel = el(
      'button',
      { class: 'sp-clarify__dismiss', type: 'button' },
      t('spConnectorInputCancel'),
    );
    decline.disabled = !interactive;
    cancel.disabled = !interactive;
    decline.addEventListener('click', () => {
      if (interactive) respond?.(entry.toolCallId, dismissConnectorInput(prompts, 'decline'));
    });
    cancel.addEventListener('click', () => {
      if (interactive) respond?.(entry.toolCallId, dismissConnectorInput(prompts, 'cancel'));
    });
    actions.appendChild(decline);
    actions.appendChild(cancel);
    form.appendChild(actions);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!interactive || !acceptable || !linksOpened()) return;
    if (fieldErrors().size > 0) {
      memory.attempted = true;
      refresh();
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    respond?.(entry.toolCallId, acceptConnectorInput(prompts, memory.drafts));
  });

  refresh();
  section.appendChild(form);
  return section;
}
