const ELICITATION_METHOD = 'elicitation/create';
const STRING_FORMATS = ['email', 'uri', 'date', 'date-time'] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PUNYCODE_LABEL_PREFIX = 'xn--';
const OPENABLE_PROTOCOL = 'https:';
const HIERARCHICAL_PROTOCOLS = new Set(['http:', 'https:']);
const LOCAL_DATE_TIME_LENGTH = 16;

const REQUIRED_MESSAGE = 'This is required.';
const CHOOSE_ONE_MESSAGE = 'Choose an option.';
const NUMBER_MESSAGE = 'Enter a number.';
const WHOLE_NUMBER_MESSAGE = 'Enter a whole number.';
const FORMAT_MESSAGES: Record<ConnectorInputStringFormat, string> = {
  email: 'Enter an email address.',
  uri: 'Enter a full link, such as https://example.com.',
  date: 'Enter a date.',
  'date-time': 'Enter a date and time.',
};

export type ConnectorInputStringFormat = (typeof STRING_FORMATS)[number];

export interface ConnectorInputOption {
  value: string;
  label: string;
}

interface ConnectorInputFieldBase {
  key: string;
  title: string;
  description?: string;
  required: boolean;
}

export type ConnectorInputField =
  | (ConnectorInputFieldBase & {
      kind: 'text';
      format?: ConnectorInputStringFormat;
      minLength?: number;
      maxLength?: number;
      defaultValue?: string;
    })
  | (ConnectorInputFieldBase & {
      kind: 'number';
      integer: boolean;
      minimum?: number;
      maximum?: number;
      defaultValue?: number;
    })
  | (ConnectorInputFieldBase & { kind: 'boolean'; defaultValue?: boolean })
  | (ConnectorInputFieldBase & {
      kind: 'choice';
      options: ConnectorInputOption[];
      defaultValue?: string;
    })
  | (ConnectorInputFieldBase & {
      kind: 'choices';
      options: ConnectorInputOption[];
      minItems?: number;
      maxItems?: number;
      defaultValue?: string[];
    });

export interface ConnectorInputLink {
  href: string;
  prefix: string;
  host: string;
  rest: string;
  punycode: boolean;
  openable: boolean;
}

export type ConnectorInputPrompt =
  | { key: string; mode: 'form'; message: string; fields: ConnectorInputField[] }
  | { key: string; mode: 'url'; message: string; url: string; link: ConnectorInputLink | null }
  | { key: string; mode: 'unsupported' };

export type ConnectorInputValue = string | number | boolean | string[];

export type ConnectorInputResponse =
  | { action: 'accept'; content?: Record<string, ConnectorInputValue> }
  | { action: 'decline' }
  | { action: 'cancel' };

export type ConnectorInputDraftValue = string | boolean | string[];
export type ConnectorInputDraft = Record<string, ConnectorInputDraftValue>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readEnumOptions(values: unknown[], labels: unknown): ConnectorInputOption[] | null {
  if (values.length === 0 || !values.every((value) => typeof value === 'string')) return null;
  const names =
    Array.isArray(labels) &&
    labels.length === values.length &&
    labels.every((label) => typeof label === 'string')
      ? (labels as string[])
      : null;
  return (values as string[]).map((value, index) => ({
    value,
    label: names?.[index] || value,
  }));
}

function readTitledOptions(entries: unknown[]): ConnectorInputOption[] | null {
  const options: ConnectorInputOption[] = [];
  for (const entry of entries) {
    const option = asRecord(entry);
    const value = option?.['const'];
    if (typeof value !== 'string') return null;
    options.push({ value, label: optionalText(option?.['title']) ?? value });
  }
  return options.length > 0 ? options : null;
}

function readChoiceOptions(schema: Record<string, unknown>): ConnectorInputOption[] | null {
  if (Array.isArray(schema['enum'])) return readEnumOptions(schema['enum'], schema['enumNames']);
  if (Array.isArray(schema['oneOf'])) return readTitledOptions(schema['oneOf']);
  if (Array.isArray(schema['anyOf'])) return readTitledOptions(schema['anyOf']);
  return null;
}

function readField(key: string, raw: unknown, required: boolean): ConnectorInputField | null {
  const schema = asRecord(raw);
  if (!schema) return null;
  const description = optionalText(schema['description']);
  const base: ConnectorInputFieldBase = {
    key,
    title: optionalText(schema['title']) ?? key,
    ...(description ? { description } : {}),
    required,
  };
  const fallback = schema['default'];

  switch (schema['type']) {
    case 'string': {
      if (
        Array.isArray(schema['enum']) ||
        Array.isArray(schema['oneOf']) ||
        Array.isArray(schema['anyOf'])
      ) {
        const options = readChoiceOptions(schema);
        if (!options) return null;
        const defaultValue =
          typeof fallback === 'string' && options.some((option) => option.value === fallback)
            ? fallback
            : undefined;
        return {
          ...base,
          kind: 'choice',
          options,
          ...(defaultValue !== undefined ? { defaultValue } : {}),
        };
      }
      const format = STRING_FORMATS.find((candidate) => candidate === schema['format']);
      const minLength = optionalCount(schema['minLength']);
      const maxLength = optionalCount(schema['maxLength']);
      return {
        ...base,
        kind: 'text',
        ...(format ? { format } : {}),
        ...(minLength !== undefined ? { minLength } : {}),
        ...(maxLength !== undefined ? { maxLength } : {}),
        ...(typeof fallback === 'string' ? { defaultValue: fallback } : {}),
      };
    }
    case 'number':
    case 'integer': {
      const minimum = optionalNumber(schema['minimum']);
      const maximum = optionalNumber(schema['maximum']);
      const defaultValue = optionalNumber(fallback);
      return {
        ...base,
        kind: 'number',
        integer: schema['type'] === 'integer',
        ...(minimum !== undefined ? { minimum } : {}),
        ...(maximum !== undefined ? { maximum } : {}),
        ...(defaultValue !== undefined ? { defaultValue } : {}),
      };
    }
    case 'boolean':
      return {
        ...base,
        kind: 'boolean',
        ...(typeof fallback === 'boolean' ? { defaultValue: fallback } : {}),
      };
    case 'array': {
      const items = asRecord(schema['items']);
      const options = items ? readChoiceOptions(items) : null;
      if (!options) return null;
      const minItems = optionalCount(schema['minItems']);
      const maxItems = optionalCount(schema['maxItems']);
      const defaultValue = Array.isArray(fallback)
        ? fallback.filter(
            (value): value is string =>
              typeof value === 'string' && options.some((option) => option.value === value),
          )
        : undefined;
      return {
        ...base,
        kind: 'choices',
        options,
        ...(minItems !== undefined ? { minItems } : {}),
        ...(maxItems !== undefined ? { maxItems } : {}),
        ...(defaultValue && defaultValue.length > 0 ? { defaultValue } : {}),
      };
    }
    default:
      return null;
  }
}

export function readConnectorInputLink(raw: string): ConnectorInputLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!HIERARCHICAL_PROTOCOLS.has(url.protocol)) {
    return {
      href: url.href,
      prefix: '',
      host: '',
      rest: url.href,
      punycode: false,
      openable: false,
    };
  }
  const credentials =
    url.username || url.password ? `${url.username}${url.password ? `:${url.password}` : ''}@` : '';
  return {
    href: url.href,
    prefix: `${url.protocol}//${credentials}`,
    host: url.host,
    rest: `${url.pathname}${url.search}${url.hash}`,
    punycode: url.hostname
      .split('.')
      .some((label) => label.toLowerCase().startsWith(PUNYCODE_LABEL_PREFIX)),
    openable: url.protocol === OPENABLE_PROTOCOL && credentials === '',
  };
}

function readPrompt(key: string, raw: unknown): ConnectorInputPrompt {
  const unsupported: ConnectorInputPrompt = { key, mode: 'unsupported' };
  const request = asRecord(raw);
  const params = asRecord(request?.['params']);
  if (!request || request['method'] !== ELICITATION_METHOD || !params) return unsupported;
  const message = typeof params['message'] === 'string' ? params['message'] : '';
  const mode = params['mode'] ?? 'form';

  if (mode === 'url') {
    const url = params['url'];
    if (typeof url !== 'string' || url.length === 0) return unsupported;
    return { key, mode: 'url', message, url, link: readConnectorInputLink(url) };
  }
  if (mode !== 'form') return unsupported;

  const schema = asRecord(params['requestedSchema']);
  const properties = asRecord(schema?.['properties']);
  if (!schema || schema['type'] !== 'object' || !properties) return unsupported;
  const required = new Set(
    Array.isArray(schema['required'])
      ? schema['required'].filter((name): name is string => typeof name === 'string')
      : [],
  );
  const fields: ConnectorInputField[] = [];
  for (const [fieldKey, definition] of Object.entries(properties)) {
    const field = readField(fieldKey, definition, required.has(fieldKey));
    if (!field) return unsupported;
    fields.push(field);
  }
  return { key, mode: 'form', message, fields };
}

export function readConnectorInputPrompts(
  inputRequests: Record<string, unknown>,
): ConnectorInputPrompt[] {
  return Object.entries(inputRequests).map(([key, request]) => readPrompt(key, request));
}

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, LOCAL_DATE_TIME_LENGTH);
}

function initialValue(field: ConnectorInputField): ConnectorInputDraftValue {
  switch (field.kind) {
    case 'boolean':
      return field.defaultValue ?? false;
    case 'choices':
      return field.defaultValue ?? [];
    case 'choice':
      return field.defaultValue ?? '';
    case 'number':
      return field.defaultValue === undefined ? '' : String(field.defaultValue);
    case 'text':
      if (field.defaultValue === undefined) return '';
      return field.format === 'date-time'
        ? toLocalDateTimeInput(field.defaultValue)
        : field.defaultValue;
  }
}

export function initialConnectorInputDraft(
  fields: readonly ConnectorInputField[],
): ConnectorInputDraft {
  return Object.fromEntries(fields.map((field) => [field.key, initialValue(field)]));
}

function isUri(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidFormat(format: ConnectorInputStringFormat, text: string): boolean {
  return format === 'email'
    ? EMAIL_PATTERN.test(text)
    : format === 'uri'
      ? isUri(text)
      : format === 'date'
        ? DATE_PATTERN.test(text)
        : !Number.isNaN(Date.parse(text));
}

export type ConnectorInputFieldIssue =
  | 'required'
  | 'too_short'
  | 'too_long'
  | 'too_small'
  | 'too_large'
  | 'not_a_number'
  | 'not_whole'
  | 'bad_format';

export function connectorInputFieldIssue(
  field: ConnectorInputField,
  value: ConnectorInputDraftValue | undefined,
): ConnectorInputFieldIssue | null {
  switch (field.kind) {
    case 'boolean':
      return null;
    case 'choice':
      return field.required && (typeof value !== 'string' || value === '') ? 'required' : null;
    case 'choices': {
      const selected = Array.isArray(value) ? value : [];
      if (selected.length === 0) return field.required ? 'required' : null;
      if (field.minItems !== undefined && selected.length < field.minItems) return 'too_short';
      if (field.maxItems !== undefined && selected.length > field.maxItems) return 'too_long';
      return null;
    }
    case 'number': {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) return field.required ? 'required' : null;
      const number = Number(text);
      if (!Number.isFinite(number)) return 'not_a_number';
      if (field.integer && !Number.isInteger(number)) return 'not_whole';
      if (field.minimum !== undefined && number < field.minimum) return 'too_small';
      if (field.maximum !== undefined && number > field.maximum) return 'too_large';
      return null;
    }
    case 'text': {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) return field.required ? 'required' : null;
      if (field.minLength !== undefined && text.length < field.minLength) return 'too_short';
      if (field.maxLength !== undefined && text.length > field.maxLength) return 'too_long';
      return field.format && !isValidFormat(field.format, text) ? 'bad_format' : null;
    }
  }
}

function issueMessage(field: ConnectorInputField, issue: ConnectorInputFieldIssue): string {
  if (issue === 'required') {
    return field.kind === 'choice' || field.kind === 'choices'
      ? CHOOSE_ONE_MESSAGE
      : REQUIRED_MESSAGE;
  }
  if (issue === 'not_a_number') return NUMBER_MESSAGE;
  if (issue === 'not_whole') return WHOLE_NUMBER_MESSAGE;
  switch (field.kind) {
    case 'choices':
      return issue === 'too_short'
        ? `Choose at least ${field.minItems}.`
        : `Choose at most ${field.maxItems}.`;
    case 'number':
      return issue === 'too_small'
        ? `Enter ${field.minimum} or more.`
        : `Enter ${field.maximum} or less.`;
    case 'text':
      if (issue === 'too_short') return `Use at least ${field.minLength} characters.`;
      if (issue === 'too_long') return `Use at most ${field.maxLength} characters.`;
      return field.format ? FORMAT_MESSAGES[field.format] : REQUIRED_MESSAGE;
    default:
      return REQUIRED_MESSAGE;
  }
}

export function connectorInputFieldError(
  field: ConnectorInputField,
  value: ConnectorInputDraftValue | undefined,
): string | null {
  const issue = connectorInputFieldIssue(field, value);
  return issue ? issueMessage(field, issue) : null;
}

function contentValue(
  field: ConnectorInputField,
  value: ConnectorInputDraftValue | undefined,
): ConnectorInputValue | undefined {
  switch (field.kind) {
    case 'boolean':
      return value === true;
    case 'choices':
      return Array.isArray(value) && value.length > 0 ? value : undefined;
    case 'choice':
      return typeof value === 'string' && value ? value : undefined;
    case 'number': {
      const text = typeof value === 'string' ? value.trim() : '';
      return text ? Number(text) : undefined;
    }
    case 'text': {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) return undefined;
      return field.format === 'date-time' ? new Date(text).toISOString() : text;
    }
  }
}

export function acceptConnectorInput(
  prompts: readonly ConnectorInputPrompt[],
  drafts: Readonly<Record<string, ConnectorInputDraft>>,
): Record<string, ConnectorInputResponse> {
  const responses: Record<string, ConnectorInputResponse> = {};
  for (const prompt of prompts) {
    if (prompt.mode === 'url') {
      responses[prompt.key] = { action: 'accept' };
    } else if (prompt.mode === 'form') {
      const draft = drafts[prompt.key] ?? {};
      const content: Record<string, ConnectorInputValue> = {};
      for (const field of prompt.fields) {
        const value = contentValue(field, draft[field.key]);
        if (value !== undefined) content[field.key] = value;
      }
      responses[prompt.key] = { action: 'accept', content };
    }
  }
  return responses;
}

export function dismissConnectorInput(
  prompts: readonly ConnectorInputPrompt[],
  action: 'decline' | 'cancel',
): Record<string, ConnectorInputResponse> {
  return Object.fromEntries(
    prompts.flatMap((prompt): [string, ConnectorInputResponse][] =>
      prompt.mode === 'unsupported' ? [] : [[prompt.key, { action }]],
    ),
  );
}
