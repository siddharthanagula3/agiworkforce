import { z } from 'zod';

/**
 * An MCP `elicitation/create` request carried in an `input_required` pause,
 * reduced to what a card can render. Everything here crosses a trust boundary
 * from a remote server, so anything outside the specification's flat primitive
 * form schema or an https URL is refused rather than approximated: a request
 * this module cannot render is one the host must not pause on.
 */

export const MAX_ELICITATION_FIELDS = 24;
export const MAX_ELICITATION_MESSAGE_LENGTH = 2_000;
export const MAX_ELICITATION_TEXT_LENGTH = 4_000;
export const MAX_ELICITATION_OPTIONS = 64;

export const ELICITATION_STRING_FORMATS = ['email', 'uri', 'date', 'date-time'] as const;
export type ElicitationStringFormat = (typeof ELICITATION_STRING_FORMATS)[number];

export const ELICITATION_ACTIONS = ['accept', 'decline', 'cancel'] as const;
export type ElicitationAction = (typeof ELICITATION_ACTIONS)[number];

export interface ElicitationOption {
  value: string;
  label: string;
}

interface ElicitationFieldBase {
  name: string;
  title?: string;
  description?: string;
  required: boolean;
}

export type ElicitationField =
  | (ElicitationFieldBase & {
      kind: 'string';
      format?: ElicitationStringFormat;
      minLength?: number;
      maxLength?: number;
      default?: string;
    })
  | (ElicitationFieldBase & {
      kind: 'number' | 'integer';
      minimum?: number;
      maximum?: number;
      default?: number;
    })
  | (ElicitationFieldBase & { kind: 'boolean'; default?: boolean })
  | (ElicitationFieldBase & { kind: 'enum'; options: ElicitationOption[]; default?: string })
  | (ElicitationFieldBase & {
      kind: 'multi_enum';
      options: ElicitationOption[];
      minItems?: number;
      maxItems?: number;
      default?: string[];
    });

export type ElicitationPrompt =
  | { key: string; mode: 'form'; message: string; fields: ElicitationField[] }
  | { key: string; mode: 'url'; message: string; url: string; host: string };

export type ElicitationValue = string | number | boolean | string[];

export type ElicitationResponse =
  | { action: 'accept'; content?: Record<string, ElicitationValue> }
  | { action: 'decline' }
  | { action: 'cancel' };

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = z.string().max(MAX_ELICITATION_TEXT_LENGTH).optional();
const nonNegativeInt = z.number().int().nonnegative().optional();

const OptionSchema = z.object({ const: z.string().max(500), title: z.string().max(500) });

const StringPropertySchema = z.object({
  type: z.literal('string'),
  title: optionalText,
  description: optionalText,
  format: z.enum(ELICITATION_STRING_FORMATS).optional(),
  minLength: nonNegativeInt,
  maxLength: nonNegativeInt,
  default: z.string().max(MAX_ELICITATION_TEXT_LENGTH).optional(),
  enum: z.array(z.string().max(500)).min(1).max(MAX_ELICITATION_OPTIONS).optional(),
  enumNames: z.array(z.string().max(500)).max(MAX_ELICITATION_OPTIONS).optional(),
  oneOf: z.array(OptionSchema).min(1).max(MAX_ELICITATION_OPTIONS).optional(),
});

const NumberPropertySchema = z.object({
  type: z.enum(['number', 'integer']),
  title: optionalText,
  description: optionalText,
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
  default: z.number().finite().optional(),
});

const BooleanPropertySchema = z.object({
  type: z.literal('boolean'),
  title: optionalText,
  description: optionalText,
  default: z.boolean().optional(),
});

const MultiEnumPropertySchema = z.object({
  type: z.literal('array'),
  title: optionalText,
  description: optionalText,
  minItems: nonNegativeInt,
  maxItems: nonNegativeInt,
  items: z.union([
    z.object({
      type: z.literal('string'),
      enum: z.array(z.string().max(500)).min(1).max(MAX_ELICITATION_OPTIONS),
    }),
    z.object({ anyOf: z.array(OptionSchema).min(1).max(MAX_ELICITATION_OPTIONS) }),
  ]),
  default: z.array(z.string().max(500)).max(MAX_ELICITATION_OPTIONS).optional(),
});

const PropertySchema = z.union([
  StringPropertySchema,
  NumberPropertySchema,
  BooleanPropertySchema,
  MultiEnumPropertySchema,
]);

const FormParamsSchema = z.object({
  mode: z.literal('form').optional(),
  message: boundedText(MAX_ELICITATION_MESSAGE_LENGTH),
  requestedSchema: z.object({
    $schema: z.string().optional(),
    type: z.literal('object'),
    properties: z.record(z.string().min(1).max(128), PropertySchema),
    required: z.array(z.string()).optional(),
  }),
});

const UrlParamsSchema = z.object({
  mode: z.literal('url'),
  message: boundedText(MAX_ELICITATION_MESSAGE_LENGTH),
  url: z.string().max(2_048),
  elicitationId: z.string().max(256).optional(),
});

const ElicitInputRequestSchema = z.object({
  method: z.literal('elicitation/create'),
  params: z.unknown(),
});

/** An https URL with no embedded credentials, or null. */
export function safeElicitationUrl(raw: string): { url: string; host: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username !== '' || parsed.password !== '') return null;
  if (!parsed.hostname) return null;
  return { url: parsed.toString(), host: parsed.host };
}

function definedEntries<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function toField(
  name: string,
  property: z.infer<typeof PropertySchema>,
  required: boolean,
): ElicitationField {
  const base = definedEntries({
    name,
    title: property.title,
    description: property.description,
    required,
  }) as ElicitationFieldBase;
  switch (property.type) {
    case 'string': {
      if (property.oneOf) {
        return {
          ...base,
          kind: 'enum',
          options: property.oneOf.map((option) => ({ value: option.const, label: option.title })),
          ...definedEntries({ default: property.default }),
        };
      }
      if (property.enum) {
        const labels = property.enumNames;
        return {
          ...base,
          kind: 'enum',
          options: property.enum.map((value, index) => ({
            value,
            label: labels?.[index] ?? value,
          })),
          ...definedEntries({ default: property.default }),
        };
      }
      return {
        ...base,
        kind: 'string',
        ...definedEntries({
          format: property.format,
          minLength: property.minLength,
          maxLength: property.maxLength,
          default: property.default,
        }),
      };
    }
    case 'number':
    case 'integer':
      return {
        ...base,
        kind: property.type,
        ...definedEntries({
          minimum: property.minimum,
          maximum: property.maximum,
          default: property.default,
        }),
      };
    case 'boolean':
      return { ...base, kind: 'boolean', ...definedEntries({ default: property.default }) };
    case 'array': {
      const options =
        'anyOf' in property.items
          ? property.items.anyOf.map((option) => ({ value: option.const, label: option.title }))
          : property.items.enum.map((value) => ({ value, label: value }));
      return {
        ...base,
        kind: 'multi_enum',
        options,
        ...definedEntries({
          minItems: property.minItems,
          maxItems: property.maxItems,
          default: property.default,
        }),
      };
    }
  }
}

function parsePrompt(key: string, raw: unknown): ElicitationPrompt | null {
  const request = ElicitInputRequestSchema.safeParse(raw);
  if (!request.success) return null;
  const params = request.data.params;
  const mode =
    params && typeof params === 'object' ? (params as Record<string, unknown>)['mode'] : undefined;

  if (mode === 'url') {
    const url = UrlParamsSchema.safeParse(params);
    if (!url.success) return null;
    const safe = safeElicitationUrl(url.data.url);
    if (!safe) return null;
    return { key, mode: 'url', message: url.data.message, ...safe };
  }

  const form = FormParamsSchema.safeParse(params);
  if (!form.success) return null;
  const { properties, required = [] } = form.data.requestedSchema;
  const names = Object.keys(properties);
  if (names.length === 0 || names.length > MAX_ELICITATION_FIELDS) return null;
  if (required.some((name) => !(name in properties))) return null;
  const fields = names.map((name) => toField(name, properties[name]!, required.includes(name)));
  return { key, mode: 'form', message: form.data.message, fields };
}

/**
 * Every input request of one paused call as a renderable prompt, or null when
 * any of them is not a form or URL elicitation this host can show.
 */
export function parseElicitationInputRequests(raw: unknown): ElicitationPrompt[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return null;
  const prompts: ElicitationPrompt[] = [];
  for (const [key, value] of entries) {
    const prompt = parsePrompt(key, value);
    if (!prompt) return null;
    prompts.push(prompt);
  }
  return prompts;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validString(
  field: Extract<ElicitationField, { kind: 'string' }>,
  value: string,
): string | null {
  const length = [...value].length;
  if (length > MAX_ELICITATION_TEXT_LENGTH) return 'is too long';
  if (field.minLength !== undefined && length < field.minLength) {
    return `must be at least ${field.minLength} characters`;
  }
  if (field.maxLength !== undefined && length > field.maxLength) {
    return `must be at most ${field.maxLength} characters`;
  }
  switch (field.format) {
    case 'email':
      return EMAIL_PATTERN.test(value) ? null : 'must be an email address';
    case 'uri':
      try {
        new URL(value);
        return null;
      } catch {
        return 'must be a URL';
      }
    case 'date':
      return DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
        ? null
        : 'must be a date (YYYY-MM-DD)';
    case 'date-time':
      return Number.isNaN(Date.parse(value)) ? 'must be a date and time' : null;
    default:
      return null;
  }
}

/** Why a value does not satisfy its field, or null when it does. */
export function elicitationFieldError(field: ElicitationField, value: unknown): string | null {
  switch (field.kind) {
    case 'string':
      return typeof value === 'string' ? validString(field, value) : 'must be text';
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number';
      if (field.kind === 'integer' && !Number.isInteger(value)) return 'must be a whole number';
      if (field.minimum !== undefined && value < field.minimum) {
        return `must be at least ${field.minimum}`;
      }
      if (field.maximum !== undefined && value > field.maximum) {
        return `must be at most ${field.maximum}`;
      }
      return null;
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be yes or no';
    case 'enum':
      return typeof value === 'string' && field.options.some((option) => option.value === value)
        ? null
        : 'must be one of the listed options';
    case 'multi_enum': {
      if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
        return 'must be a list of the listed options';
      }
      if (new Set(value).size !== value.length) return 'must not repeat an option';
      if (!value.every((entry) => field.options.some((option) => option.value === entry))) {
        return 'must be one of the listed options';
      }
      if (field.minItems !== undefined && value.length < field.minItems) {
        return `needs at least ${field.minItems} choices`;
      }
      if (field.maxItems !== undefined && value.length > field.maxItems) {
        return `allows at most ${field.maxItems} choices`;
      }
      return null;
    }
  }
}

const ResponseSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('accept'), content: z.record(z.string(), z.unknown()).optional() })
    .strict(),
  z.object({ action: z.literal('decline') }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
]);

export type ElicitationValidation =
  { ok: true; responses: Record<string, ElicitationResponse> } | { ok: false; reason: string };

/**
 * Checks a user's answers against the prompts the server actually asked, so
 * the remote server never receives a key, a field or a value it did not ask
 * for. A form accept must satisfy every field; a URL accept carries no content.
 */
export function validateElicitationResponses(
  prompts: readonly ElicitationPrompt[],
  raw: Record<string, unknown>,
): ElicitationValidation {
  const promptKeys = new Set(prompts.map((prompt) => prompt.key));
  const answerKeys = Object.keys(raw);
  if (answerKeys.length !== promptKeys.size || !answerKeys.every((key) => promptKeys.has(key))) {
    return { ok: false, reason: 'Every requested input needs exactly one answer.' };
  }

  const responses: Record<string, ElicitationResponse> = {};
  for (const prompt of prompts) {
    const parsed = ResponseSchema.safeParse(raw[prompt.key]);
    if (!parsed.success) return { ok: false, reason: 'An answer has an unknown shape.' };
    const answer = parsed.data;
    if (answer.action !== 'accept') {
      responses[prompt.key] = { action: answer.action };
      continue;
    }
    if (prompt.mode === 'url') {
      if (answer.content !== undefined) {
        return { ok: false, reason: 'A link step does not take form content.' };
      }
      responses[prompt.key] = { action: 'accept' };
      continue;
    }
    const content = answer.content ?? {};
    const fieldNames = new Set(prompt.fields.map((field) => field.name));
    const unknown = Object.keys(content).find((name) => !fieldNames.has(name));
    if (unknown !== undefined) {
      return { ok: false, reason: `"${unknown}" was not requested.` };
    }
    const accepted: Record<string, ElicitationValue> = {};
    for (const field of prompt.fields) {
      const value = content[field.name];
      if (value === undefined || value === null || value === '') {
        if (field.required) return { ok: false, reason: `"${field.name}" is required.` };
        continue;
      }
      const error = elicitationFieldError(field, value);
      if (error) return { ok: false, reason: `"${field.name}" ${error}.` };
      accepted[field.name] = value as ElicitationValue;
    }
    responses[prompt.key] = { action: 'accept', content: accepted };
  }
  return { ok: true, responses };
}
